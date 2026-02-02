/**
 * Routes Webhooks pour Carriers
 *
 * Features:
 * - CRUD operations pour webhooks
 * - Sécurité HMAC-SHA256
 * - Retry automatique avec désactivation après 10 échecs
 * - Historique des deliveries
 * - Test endpoint
 * - Rotate secret
 *
 * Collections MongoDB:
 * - carrier_webhooks: Configuration webhooks
 * - webhook_deliveries: Historique des envois
 */

const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const fetch = require('node-fetch');

/**
 * Events supportés
 */
const WEBHOOK_EVENTS = {
  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_VERIFIED: 'document.verified',
  DOCUMENT_EXPIRED: 'document.expired',
  DOCUMENT_REJECTED: 'document.rejected',
  CARRIER_VALIDATED: 'carrier.validated',
  CARRIER_SUSPENDED: 'carrier.suspended'
};

/**
 * Générer un secret aléatoire pour HMAC
 */
function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculer la signature HMAC-SHA256
 */
function calculateSignature(payload, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

/**
 * Envoyer un webhook avec retry
 */
async function sendWebhook(webhook, event, payload, db) {
  const delivery = {
    webhookId: webhook._id,
    carrierId: webhook.carrierId,
    eventType: event,
    url: webhook.url,
    payload,
    attempts: 0,
    maxAttempts: 3,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // Insérer delivery log
  const insertResult = await db.collection('webhook_deliveries').insertOne(delivery);
  const deliveryId = insertResult.insertedId;

  // Préparer la signature
  const signature = calculateSignature(payload, webhook.secret);

  // Tenter l'envoi avec retry
  for (let attempt = 1; attempt <= delivery.maxAttempts; attempt++) {
    try {
      const startTime = Date.now();

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery': deliveryId.toString(),
          'User-Agent': 'SYMPHONIA-Webhooks/1.0'
        },
        body: JSON.stringify(payload),
        timeout: 10000 // 10 secondes
      });

      const responseTime = Date.now() - startTime;
      const responseBody = await response.text();

      // Mise à jour delivery log
      await db.collection('webhook_deliveries').updateOne(
        { _id: deliveryId },
        {
          $set: {
            status: response.ok ? 'success' : 'failed',
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000), // Limiter à 1000 chars
            responseTime,
            attempts: attempt,
            updatedAt: new Date(),
            completedAt: new Date()
          }
        }
      );

      if (response.ok) {
        console.log(`✅ [WEBHOOK] Delivered to ${webhook.url}: ${event} (${responseTime}ms)`);

        // Reset failure count sur succès
        await db.collection('carrier_webhooks').updateOne(
          { _id: webhook._id },
          { $set: { failureCount: 0, lastSuccessAt: new Date() } }
        );

        return { success: true, deliveryId, statusCode: response.status, responseTime };
      }

      // Si échec, continuer avec retry
      console.warn(`⚠️  [WEBHOOK] Failed attempt ${attempt}/${delivery.maxAttempts} to ${webhook.url}: ${response.status}`);

    } catch (error) {
      console.error(`❌ [WEBHOOK] Error attempt ${attempt}/${delivery.maxAttempts}:`, error.message);

      await db.collection('webhook_deliveries').updateOne(
        { _id: deliveryId },
        {
          $set: {
            status: 'failed',
            error: error.message,
            attempts: attempt,
            updatedAt: new Date(),
            completedAt: attempt === delivery.maxAttempts ? new Date() : undefined
          }
        }
      );
    }

    // Attendre avant retry (exponential backoff)
    if (attempt < delivery.maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Tous les attempts ont échoué
  const failureCount = (webhook.failureCount || 0) + 1;
  const updates = {
    failureCount,
    lastFailureAt: new Date()
  };

  // Désactiver après 10 échecs consécutifs
  if (failureCount >= 10) {
    updates.active = false;
    console.error(`❌ [WEBHOOK] Disabled webhook ${webhook._id} after 10 consecutive failures`);
  }

  await db.collection('carrier_webhooks').updateOne(
    { _id: webhook._id },
    { $set: updates }
  );

  return { success: false, deliveryId, error: 'All attempts failed' };
}

/**
 * Déclencher un événement webhook
 * Appelé par carriers.js lors d'événements
 */
async function triggerWebhookEvent(db, carrierId, eventType, payload) {
  try {
    // Trouver tous les webhooks actifs pour ce carrier et cet event
    const webhooks = await db.collection('carrier_webhooks').find({
      carrierId: new ObjectId(carrierId),
      active: true,
      events: eventType
    }).toArray();

    if (webhooks.length === 0) {
      return { success: true, webhooksSent: 0 };
    }

    console.log(`🔔 [WEBHOOK] Triggering ${eventType} for carrier ${carrierId}: ${webhooks.length} webhooks`);

    // Envoyer à tous les webhooks en parallèle
    const results = await Promise.all(
      webhooks.map(webhook => sendWebhook(webhook, eventType, payload, db))
    );

    const successCount = results.filter(r => r.success).length;

    return {
      success: true,
      webhooksSent: webhooks.length,
      successCount,
      failureCount: webhooks.length - successCount
    };

  } catch (error) {
    console.error('[WEBHOOK] Error triggering event:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Setup webhook routes
 */
function setupWebhookRoutes(app, db) {
  /**
   * POST /api/carriers/:id/webhooks
   * Créer un nouveau webhook
   */
  app.post('/api/carriers/:id/webhooks', async (req, res) => {
    try {
      const { id } = req.params;
      const { url, events, description } = req.body;

      // Validation
      if (!url || !events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'url and events[] are required'
        });
      }

      // Valider URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
      }

      // Valider events
      const validEvents = Object.values(WEBHOOK_EVENTS);
      const invalidEvents = events.filter(e => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid events: ${invalidEvents.join(', ')}`,
          validEvents
        });
      }

      // Vérifier que le carrier existe
      const carrier = await db.collection('carriers').findOne({
        _id: new ObjectId(id)
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found'
        });
      }

      // Créer webhook
      const webhook = {
        carrierId: new ObjectId(id),
        url,
        events,
        description: description || '',
        secret: generateWebhookSecret(),
        active: true,
        failureCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: req.user?.id || 'system' // Si auth middleware disponible
      };

      const result = await db.collection('carrier_webhooks').insertOne(webhook);

      res.status(201).json({
        success: true,
        webhook: {
          id: result.insertedId,
          carrierId: webhook.carrierId,
          url: webhook.url,
          events: webhook.events,
          description: webhook.description,
          secret: webhook.secret,
          active: webhook.active,
          createdAt: webhook.createdAt
        }
      });

    } catch (error) {
      console.error('[WEBHOOK CREATE] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/carriers/:id/webhooks
   * Lister les webhooks d'un carrier
   */
  app.get('/api/carriers/:id/webhooks', async (req, res) => {
    try {
      const { id } = req.params;

      const webhooks = await db.collection('carrier_webhooks')
        .find({ carrierId: new ObjectId(id) })
        .sort({ createdAt: -1 })
        .toArray();

      // Masquer les secrets (retourner seulement les 8 premiers caractères)
      const sanitized = webhooks.map(wh => ({
        ...wh,
        secret: wh.secret ? `${wh.secret.substring(0, 8)}...` : null
      }));

      res.json({
        success: true,
        count: webhooks.length,
        webhooks: sanitized
      });

    } catch (error) {
      console.error('[WEBHOOK LIST] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/carriers/:id/webhooks/:webhookId
   * Supprimer un webhook
   */
  app.delete('/api/carriers/:id/webhooks/:webhookId', async (req, res) => {
    try {
      const { id, webhookId } = req.params;

      const result = await db.collection('carrier_webhooks').deleteOne({
        _id: new ObjectId(webhookId),
        carrierId: new ObjectId(id)
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        message: 'Webhook deleted successfully'
      });

    } catch (error) {
      console.error('[WEBHOOK DELETE] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/carriers/:id/webhooks/:webhookId/test
   * Tester un webhook
   */
  app.post('/api/carriers/:id/webhooks/:webhookId/test', async (req, res) => {
    try {
      const { id, webhookId } = req.params;

      const webhook = await db.collection('carrier_webhooks').findOne({
        _id: new ObjectId(webhookId),
        carrierId: new ObjectId(id)
      });

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      // Payload de test
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        carrier: {
          id: id,
          message: 'This is a test webhook from SYMPHONIA'
        }
      };

      // Envoyer le webhook
      const result = await sendWebhook(webhook, 'webhook.test', testPayload, db);

      res.json({
        success: result.success,
        message: result.success ? 'Test webhook sent successfully' : 'Test webhook failed',
        deliveryId: result.deliveryId,
        statusCode: result.statusCode,
        responseTime: result.responseTime,
        error: result.error
      });

    } catch (error) {
      console.error('[WEBHOOK TEST] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/carriers/:id/webhooks/:webhookId/rotate-secret
   * Régénérer le secret d'un webhook
   */
  app.post('/api/carriers/:id/webhooks/:webhookId/rotate-secret', async (req, res) => {
    try {
      const { id, webhookId } = req.params;

      const newSecret = generateWebhookSecret();

      const result = await db.collection('carrier_webhooks').findOneAndUpdate(
        {
          _id: new ObjectId(webhookId),
          carrierId: new ObjectId(id)
        },
        {
          $set: {
            secret: newSecret,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        message: 'Secret rotated successfully',
        webhook: {
          id: result.value._id,
          secret: result.value.secret,
          updatedAt: result.value.updatedAt
        }
      });

    } catch (error) {
      console.error('[WEBHOOK ROTATE SECRET] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/carriers/:id/webhooks/:webhookId/deliveries
   * Historique des deliveries d'un webhook
   */
  app.get('/api/carriers/:id/webhooks/:webhookId/deliveries', async (req, res) => {
    try {
      const { id, webhookId } = req.params;
      const { limit = 50, skip = 0 } = req.query;

      // Vérifier que le webhook existe et appartient au carrier
      const webhook = await db.collection('carrier_webhooks').findOne({
        _id: new ObjectId(webhookId),
        carrierId: new ObjectId(id)
      });

      if (!webhook) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      // Récupérer l'historique
      const deliveries = await db.collection('webhook_deliveries')
        .find({ webhookId: new ObjectId(webhookId) })
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('webhook_deliveries')
        .countDocuments({ webhookId: new ObjectId(webhookId) });

      // Stats
      const stats = await db.collection('webhook_deliveries').aggregate([
        { $match: { webhookId: new ObjectId(webhookId) } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgResponseTime: { $avg: '$responseTime' }
          }
        }
      ]).toArray();

      res.json({
        success: true,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        deliveries,
        stats: stats.reduce((acc, s) => {
          acc[s._id] = {
            count: s.count,
            avgResponseTime: Math.round(s.avgResponseTime || 0)
          };
          return acc;
        }, {})
      });

    } catch (error) {
      console.error('[WEBHOOK DELIVERIES] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * PATCH /api/carriers/:id/webhooks/:webhookId
   * Mettre à jour un webhook (activer/désactiver, modifier events, etc.)
   */
  app.patch('/api/carriers/:id/webhooks/:webhookId', async (req, res) => {
    try {
      const { id, webhookId } = req.params;
      const { active, events, description, url } = req.body;

      const updates = { updatedAt: new Date() };

      if (typeof active === 'boolean') {
        updates.active = active;
      }

      if (events && Array.isArray(events)) {
        // Valider events
        const validEvents = Object.values(WEBHOOK_EVENTS);
        const invalidEvents = events.filter(e => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Invalid events: ${invalidEvents.join(', ')}`,
            validEvents
          });
        }
        updates.events = events;
      }

      if (description !== undefined) {
        updates.description = description;
      }

      if (url) {
        // Valider URL
        try {
          new URL(url);
          updates.url = url;
        } catch {
          return res.status(400).json({
            success: false,
            error: 'Invalid URL format'
          });
        }
      }

      const result = await db.collection('carrier_webhooks').findOneAndUpdate(
        {
          _id: new ObjectId(webhookId),
          carrierId: new ObjectId(id)
        },
        { $set: updates },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: 'Webhook not found'
        });
      }

      res.json({
        success: true,
        webhook: {
          ...result.value,
          secret: result.value.secret ? `${result.value.secret.substring(0, 8)}...` : null
        }
      });

    } catch (error) {
      console.error('[WEBHOOK UPDATE] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('✓ Webhook routes configured');
}

module.exports = {
  setupWebhookRoutes,
  triggerWebhookEvent,
  WEBHOOK_EVENTS,
  calculateSignature,
  generateWebhookSecret
};
