/**
 * Webhook Service
 * SYMPHONI.A - RT Technologie
 *
 * Service d'envoi de webhooks aux partenaires
 */

const crypto = require('crypto');
const axios = require('axios');
const { ObjectId } = require('mongodb');

// ============================================
// CONFIGURATION
// ============================================

const WEBHOOK_CONFIG = {
  timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000,
  maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES) || 5,
  retryDelays: [0, 60, 300, 1800, 7200], // Delais en secondes: immediat, 1min, 5min, 30min, 2h
  signatureAlgorithm: 'sha256',
  userAgent: 'SYMPHONIA-Webhook/1.0'
};

// Types d'evenements
const WebhookEvent = {
  // Invitations
  INVITATION_SENT: 'invitation.sent',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_EXPIRED: 'invitation.expired',
  INVITATION_CANCELLED: 'invitation.cancelled',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding.started',
  ONBOARDING_STEP_COMPLETED: 'onboarding.step_completed',
  ONBOARDING_COMPLETED: 'onboarding.completed',

  // Documents
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VERIFIED: 'document.verified',
  DOCUMENT_REJECTED: 'document.rejected',
  DOCUMENTS_ALL_VERIFIED: 'documents.all_verified',

  // Compte
  ACCOUNT_ACTIVATED: 'account.activated',
  ACCOUNT_BLOCKED: 'account.blocked',
  ACCOUNT_UNBLOCKED: 'account.unblocked',

  // Vigilance
  VIGILANCE_WARNING: 'vigilance.warning',
  VIGILANCE_BLOCKED: 'vigilance.blocked',

  // ICPE
  ICPE_THRESHOLD_WARNING: 'icpe.threshold_warning',
  ICPE_THRESHOLD_CRITICAL: 'icpe.threshold_critical'
};

// ============================================
// SIGNATURE
// ============================================

/**
 * Generer une signature HMAC pour un payload
 * @param {Object|string} payload - Donnees a signer
 * @param {string} secret - Secret du webhook
 * @returns {string} Signature
 */
function generateSignature(payload, secret) {
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hmac = crypto.createHmac(WEBHOOK_CONFIG.signatureAlgorithm, secret);
  hmac.update(data);
  return `${WEBHOOK_CONFIG.signatureAlgorithm}=${hmac.digest('hex')}`;
}

/**
 * Verifier une signature (pour reception de webhooks)
 * @param {string} payload - Payload recu
 * @param {string} signature - Signature recue
 * @param {string} secret - Secret attendu
 * @returns {boolean}
 */
function verifySignature(payload, signature, secret) {
  const expected = generateSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Creer le service de webhooks
 * @param {MongoClient} mongoClient
 * @returns {Object} Service
 */
function createWebhookService(mongoClient) {
  const getDb = () => mongoClient.db();

  // ============================================
  // GESTION DES SUBSCRIPTIONS
  // ============================================

  /**
   * Creer une subscription webhook
   * @param {Object} subscription
   * @returns {Promise<Object>}
   */
  async function createSubscription(subscription) {
    const db = getDb();
    const collection = db.collection('webhook_subscriptions');

    // Generer un secret si non fourni
    const secret = subscription.secret || crypto.randomBytes(32).toString('hex');

    const doc = {
      _id: new ObjectId(),
      industrielId: new ObjectId(subscription.industrielId),
      url: subscription.url,
      events: subscription.events || Object.values(WebhookEvent),
      secret,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastDelivery: null,
      failureCount: 0,
      metadata: subscription.metadata || {}
    };

    await collection.insertOne(doc);

    return {
      id: doc._id.toString(),
      url: doc.url,
      events: doc.events,
      secret, // Retourner le secret une seule fois
      isActive: doc.isActive,
      createdAt: doc.createdAt
    };
  }

  /**
   * Mettre a jour une subscription
   */
  async function updateSubscription(subscriptionId, updates) {
    const db = getDb();
    const collection = db.collection('webhook_subscriptions');

    const allowedUpdates = ['url', 'events', 'isActive', 'metadata'];
    const updateDoc = { updatedAt: new Date() };

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateDoc[key] = updates[key];
      }
    }

    await collection.updateOne(
      { _id: new ObjectId(subscriptionId) },
      { $set: updateDoc }
    );

    return collection.findOne({ _id: new ObjectId(subscriptionId) });
  }

  /**
   * Supprimer une subscription
   */
  async function deleteSubscription(subscriptionId) {
    const db = getDb();
    const collection = db.collection('webhook_subscriptions');
    await collection.deleteOne({ _id: new ObjectId(subscriptionId) });
  }

  /**
   * Lister les subscriptions d'un industriel
   */
  async function getSubscriptions(industrielId) {
    const db = getDb();
    const collection = db.collection('webhook_subscriptions');
    return collection.find({ industrielId: new ObjectId(industrielId) }).toArray();
  }

  /**
   * Regenerer le secret d'une subscription
   */
  async function regenerateSecret(subscriptionId) {
    const db = getDb();
    const collection = db.collection('webhook_subscriptions');
    const newSecret = crypto.randomBytes(32).toString('hex');

    await collection.updateOne(
      { _id: new ObjectId(subscriptionId) },
      { $set: { secret: newSecret, updatedAt: new Date() } }
    );

    return newSecret;
  }

  // ============================================
  // ENVOI DE WEBHOOKS
  // ============================================

  /**
   * Envoyer un webhook
   * @param {string} event - Type d'evenement
   * @param {Object} data - Donnees
   * @param {string|ObjectId} industrielId - ID de l'industriel destinataire
   * @returns {Promise<Object>}
   */
  async function send(event, data, industrielId) {
    const db = getDb();
    const subscriptionsCollection = db.collection('webhook_subscriptions');
    const deliveriesCollection = db.collection('webhook_deliveries');

    // Trouver les subscriptions actives pour cet evenement
    const subscriptions = await subscriptionsCollection.find({
      industrielId: new ObjectId(industrielId),
      isActive: true,
      events: event
    }).toArray();

    if (subscriptions.length === 0) {
      return { sent: 0, skipped: 'no_subscriptions' };
    }

    const results = [];

    for (const subscription of subscriptions) {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        data,
        subscription_id: subscription._id.toString()
      };

      const signature = generateSignature(payload, subscription.secret);

      // Creer le delivery record
      const delivery = {
        _id: new ObjectId(),
        subscriptionId: subscription._id,
        industrielId: subscription.industrielId,
        event,
        payload,
        signature,
        attempts: [],
        status: 'pending',
        createdAt: new Date(),
        nextRetryAt: new Date()
      };

      await deliveriesCollection.insertOne(delivery);

      // Essayer d'envoyer immediatement
      const result = await attemptDelivery(delivery, subscription);
      results.push(result);
    }

    return {
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  /**
   * Tenter une livraison de webhook
   */
  async function attemptDelivery(delivery, subscription) {
    const db = getDb();
    const deliveriesCollection = db.collection('webhook_deliveries');
    const subscriptionsCollection = db.collection('webhook_subscriptions');

    const attemptNumber = delivery.attempts.length + 1;
    const attemptStart = new Date();

    try {
      const response = await axios.post(subscription.url, delivery.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': delivery.signature,
          'X-Webhook-Event': delivery.event,
          'X-Webhook-Delivery': delivery._id.toString(),
          'User-Agent': WEBHOOK_CONFIG.userAgent
        },
        timeout: WEBHOOK_CONFIG.timeout,
        validateStatus: (status) => status >= 200 && status < 300
      });

      // Succes
      const attempt = {
        number: attemptNumber,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart.getTime(),
        status: response.status,
        success: true
      };

      await deliveriesCollection.updateOne(
        { _id: delivery._id },
        {
          $push: { attempts: attempt },
          $set: {
            status: 'delivered',
            deliveredAt: new Date()
          }
        }
      );

      // Reset failure count
      await subscriptionsCollection.updateOne(
        { _id: subscription._id },
        {
          $set: {
            failureCount: 0,
            lastDelivery: new Date()
          }
        }
      );

      return { success: true, deliveryId: delivery._id.toString(), attempt };

    } catch (error) {
      // Echec
      const attempt = {
        number: attemptNumber,
        timestamp: attemptStart,
        duration: Date.now() - attemptStart.getTime(),
        success: false,
        error: error.message,
        statusCode: error.response?.status
      };

      // Calculer prochaine tentative
      const nextRetryIndex = Math.min(attemptNumber, WEBHOOK_CONFIG.retryDelays.length - 1);
      const nextRetryDelay = WEBHOOK_CONFIG.retryDelays[nextRetryIndex];
      const nextRetryAt = new Date(Date.now() + nextRetryDelay * 1000);

      const isMaxRetries = attemptNumber >= WEBHOOK_CONFIG.maxRetries;

      await deliveriesCollection.updateOne(
        { _id: delivery._id },
        {
          $push: { attempts: attempt },
          $set: {
            status: isMaxRetries ? 'failed' : 'retrying',
            nextRetryAt: isMaxRetries ? null : nextRetryAt,
            failedAt: isMaxRetries ? new Date() : null
          }
        }
      );

      // Incrementer failure count sur la subscription
      const newFailureCount = (subscription.failureCount || 0) + 1;
      const shouldDisable = newFailureCount >= WEBHOOK_CONFIG.maxRetries;

      await subscriptionsCollection.updateOne(
        { _id: subscription._id },
        {
          $inc: { failureCount: 1 },
          $set: shouldDisable ? { isActive: false, disabledAt: new Date(), disabledReason: 'max_failures' } : {}
        }
      );

      return {
        success: false,
        deliveryId: delivery._id.toString(),
        attempt,
        willRetry: !isMaxRetries,
        nextRetryAt: isMaxRetries ? null : nextRetryAt
      };
    }
  }

  /**
   * Reessayer les webhooks en echec (a appeler via cron)
   */
  async function retryFailedDeliveries() {
    const db = getDb();
    const deliveriesCollection = db.collection('webhook_deliveries');
    const subscriptionsCollection = db.collection('webhook_subscriptions');

    const now = new Date();

    // Trouver les deliveries a reessayer
    const deliveries = await deliveriesCollection.find({
      status: 'retrying',
      nextRetryAt: { $lte: now }
    }).limit(100).toArray();

    const results = [];

    for (const delivery of deliveries) {
      const subscription = await subscriptionsCollection.findOne({ _id: delivery.subscriptionId });

      if (!subscription || !subscription.isActive) {
        // Marquer comme echoue si subscription inactive
        await deliveriesCollection.updateOne(
          { _id: delivery._id },
          { $set: { status: 'failed', failedAt: now, failedReason: 'subscription_inactive' } }
        );
        continue;
      }

      const result = await attemptDelivery(delivery, subscription);
      results.push(result);
    }

    return {
      processed: results.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    };
  }

  /**
   * Obtenir l'historique des deliveries
   */
  async function getDeliveryHistory(filters = {}, limit = 50) {
    const db = getDb();
    const collection = db.collection('webhook_deliveries');

    const query = {};
    if (filters.industrielId) query.industrielId = new ObjectId(filters.industrielId);
    if (filters.subscriptionId) query.subscriptionId = new ObjectId(filters.subscriptionId);
    if (filters.event) query.event = filters.event;
    if (filters.status) query.status = filters.status;

    return collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Reessayer manuellement une delivery
   */
  async function retryDelivery(deliveryId) {
    const db = getDb();
    const deliveriesCollection = db.collection('webhook_deliveries');
    const subscriptionsCollection = db.collection('webhook_subscriptions');

    const delivery = await deliveriesCollection.findOne({ _id: new ObjectId(deliveryId) });
    if (!delivery) {
      return { success: false, error: 'Delivery not found' };
    }

    const subscription = await subscriptionsCollection.findOne({ _id: delivery.subscriptionId });
    if (!subscription) {
      return { success: false, error: 'Subscription not found' };
    }

    // Reset le status pour permettre retry
    await deliveriesCollection.updateOne(
      { _id: delivery._id },
      { $set: { status: 'retrying', nextRetryAt: new Date() } }
    );

    return attemptDelivery(delivery, subscription);
  }

  // ============================================
  // HELPERS POUR EVENEMENTS COURANTS
  // ============================================

  /**
   * Notifier qu'une invitation a ete acceptee
   */
  async function notifyInvitationAccepted(industrielId, recipientType, recipientData) {
    return send(WebhookEvent.INVITATION_ACCEPTED, {
      type: recipientType,
      ...recipientData
    }, industrielId);
  }

  /**
   * Notifier qu'un onboarding est termine
   */
  async function notifyOnboardingCompleted(industrielId, recipientType, recipientData) {
    return send(WebhookEvent.ONBOARDING_COMPLETED, {
      type: recipientType,
      ...recipientData
    }, industrielId);
  }

  /**
   * Notifier que tous les documents sont verifies
   */
  async function notifyAllDocumentsVerified(industrielId, recipientType, recipientData) {
    return send(WebhookEvent.DOCUMENTS_ALL_VERIFIED, {
      type: recipientType,
      ...recipientData
    }, industrielId);
  }

  /**
   * Notifier un blocage de compte
   */
  async function notifyAccountBlocked(industrielId, recipientType, recipientData, reason) {
    return send(WebhookEvent.ACCOUNT_BLOCKED, {
      type: recipientType,
      reason,
      ...recipientData
    }, industrielId);
  }

  return {
    // Events
    WebhookEvent,

    // Subscriptions
    createSubscription,
    updateSubscription,
    deleteSubscription,
    getSubscriptions,
    regenerateSecret,

    // Envoi
    send,
    retryFailedDeliveries,
    retryDelivery,
    getDeliveryHistory,

    // Helpers
    notifyInvitationAccepted,
    notifyOnboardingCompleted,
    notifyAllDocumentsVerified,
    notifyAccountBlocked,

    // Utils
    generateSignature,
    verifySignature
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  WEBHOOK_CONFIG,
  WebhookEvent,
  generateSignature,
  verifySignature,
  createWebhookService
};
