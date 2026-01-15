// Tracking Basic Service - Email-based Manual Tracking
// RT Backend Services - SYMPHONI.A Suite
// Version: 2.5.2 - Migrated to AWS SES

const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { EventTypes, OrderStatus } = require('./transport-orders-models');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');

/**
 * TRACKING BASIC - VERSION EMAIL (50€/mois)
 *
 * Caractéristiques conformes au cahier des charges:
 * - Email avec liens cliquables pour mise à jour manuelle
 * - Statuts: En route, Arrivé chargement, Chargé, En route livraison, Livré, Dépôt BL/CMR
 * - Token sécurisé pour validation
 * - Mise à jour API automatique après clic
 * - Expiration token 24h
 */

// ==================== CONSTANTES ====================

const TRACKING_STATUSES = {
  EN_ROUTE_PICKUP: {
    code: 'EN_ROUTE_PICKUP',
    label: 'En route vers chargement',
    emailLabel: '🚚 Je suis en route vers le point de chargement',
    orderStatus: OrderStatus.EN_ROUTE_PICKUP,
    eventType: EventTypes.TRACKING_STARTED
  },
  ARRIVED_PICKUP: {
    code: 'ARRIVED_PICKUP',
    label: 'Arrivé au chargement',
    emailLabel: '📍 Je suis arrivé au point de chargement',
    orderStatus: OrderStatus.ARRIVED_PICKUP,
    eventType: EventTypes.ARRIVED_PICKUP
  },
  LOADING: {
    code: 'LOADING',
    label: 'Chargement en cours',
    emailLabel: '📦 Chargement en cours',
    orderStatus: OrderStatus.LOADING,
    eventType: EventTypes.LOADING
  },
  LOADED: {
    code: 'LOADED',
    label: 'Chargé - Départ',
    emailLabel: '✅ Chargement terminé, en route vers livraison',
    orderStatus: OrderStatus.LOADED,
    eventType: EventTypes.LOADED
  },
  EN_ROUTE_DELIVERY: {
    code: 'EN_ROUTE_DELIVERY',
    label: 'En route vers livraison',
    emailLabel: '🚛 En route vers le point de livraison',
    orderStatus: OrderStatus.EN_ROUTE_DELIVERY,
    eventType: EventTypes.DEPARTED_PICKUP
  },
  ARRIVED_DELIVERY: {
    code: 'ARRIVED_DELIVERY',
    label: 'Arrivé à la livraison',
    emailLabel: '📍 Arrivé au point de livraison',
    orderStatus: OrderStatus.ARRIVED_DELIVERY,
    eventType: EventTypes.ARRIVED_DELIVERY
  },
  UNLOADING: {
    code: 'UNLOADING',
    label: 'Déchargement en cours',
    emailLabel: '📤 Déchargement en cours',
    orderStatus: OrderStatus.UNLOADING,
    eventType: EventTypes.UNLOADING
  },
  DELIVERED: {
    code: 'DELIVERED',
    label: 'Livré',
    emailLabel: '✅ Livraison terminée',
    orderStatus: OrderStatus.DELIVERED,
    eventType: EventTypes.DELIVERED
  },
  DOCUMENTS_UPLOADED: {
    code: 'DOCUMENTS_UPLOADED',
    label: 'Documents déposés',
    emailLabel: '📄 BL/CMR déposés',
    orderStatus: OrderStatus.DOCUMENTS_UPLOADED,
    eventType: EventTypes.DOCUMENTS_UPLOADED
  }
};

// Token expiration: 24 heures
const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// ==================== AWS SES CONFIGURATION ====================

/**
 * Configuration AWS SES
 */
let sesClient = null;

const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-central-1'
};

const SES_FROM = process.env.SES_FROM_EMAIL || 'notifications@symphonia-controltower.com';
const SES_FROM_NAME = 'SYMPHONI.A Tracking';
const REPLY_TO = process.env.SES_SUPPORT_EMAIL || 'support@symphonia-controltower.com';

function initSES() {
  try {
    sesClient = new SESClient(SES_CONFIG);
    console.log(`✅ AWS SES initialized for Tracking (region: ${SES_CONFIG.region})`);
    return true;
  } catch (error) {
    console.error('⚠️ AWS SES initialization failed:', error.message);
    return false;
  }
}

/**
 * Générer un Message-ID unique conforme RFC 5322
 */
function generateMessageId() {
  const domain = SES_FROM.split('@')[1] || 'symphonia-controltower.com';
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Envoyer un email via AWS SES avec headers anti-spam
 * @param {String} to - Email destinataire
 * @param {String} subject - Sujet de l'email
 * @param {String} html - Contenu HTML de l'email
 * @returns {Promise<Object>} Résultat de l'envoi
 */
async function sendTrackingEmailViaSES(to, subject, html) {
  if (!sesClient) {
    initSES();
  }

  if (!sesClient) {
    console.warn('AWS SES not configured');
    return {
      success: false,
      error: 'AWS SES not configured'
    };
  }

  try {
    const toAddresses = Array.isArray(to) ? to : [to];
    const domain = SES_FROM.split('@')[1] || 'symphonia-controltower.com';
    const messageId = generateMessageId();

    // Version texte brut pour anti-spam
    const plainText = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    // Construire email MIME avec headers anti-spam
    const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const rawEmail = [
      `From: ${SES_FROM_NAME} <${SES_FROM}>`,
      `To: ${toAddresses.join(', ')}`,
      `Reply-To: ${REPLY_TO}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      // Headers anti-spam
      'X-Priority: 3',
      'X-Mailer: SYMPHONIA-ControlTower/2.5',
      `List-Unsubscribe: <mailto:unsubscribe@${domain}?subject=unsubscribe>`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      plainText,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      html,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawEmail)
      }
    });

    const result = await sesClient.send(command);

    console.log(`[AWS-SES] Tracking email sent to ${toAddresses.join(', ')}: ${subject} (${messageId})`);

    return {
      success: true,
      messageId: result.MessageId,
      provider: 'aws-ses'
    };

  } catch (error) {
    console.error('AWS SES send error:', error);
    return {
      success: false,
      error: error.message,
      provider: 'aws-ses'
    };
  }
}

// Auto-initialize SES on module load
initSES();

// ==================== FONCTIONS PRINCIPALES ====================

/**
 * Envoyer l'email de tracking initial au chauffeur
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {Object} options - Options (carrierEmail, carrierName, driverPhone, baseUrl)
 * @returns {Promise<Object>} Résultat de l'envoi
 */
async function sendTrackingEmail(db, orderId, options = {}) {
  try {
    // Extract driverEmail from options (can be carrierEmail or driverEmail)
    const driverEmail = options.carrierEmail || options.driverEmail;

    if (!driverEmail) {
      return {
        success: false,
        error: 'Driver email is required (carrierEmail or driverEmail)'
      };
    }

    // Récupérer la commande
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Générer les tokens pour chaque statut
    const trackingLinks = {};
    for (const statusKey in TRACKING_STATUSES) {
      const status = TRACKING_STATUSES[statusKey];
      const token = await generateSecureToken(db, orderId, status.code);
      trackingLinks[statusKey] = {
        ...status,
        token,
        url: generateTrackingUrl(orderId, status.code, token, options.baseUrl)
      };
    }

    // Créer l'enregistrement de tracking
    const trackingRecord = {
      orderId: new ObjectId(orderId),
      reference: order.reference,
      trackingType: 'BASIC_EMAIL',
      driverEmail,
      driverPhone: options.driverPhone || null,
      driverName: options.driverName || null,
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + TOKEN_EXPIRATION_MS),
      links: trackingLinks,
      lastUpdated: null,
      currentStatus: null,
      updatesCount: 0,
      active: true
    };

    const result = await db.collection('tracking_basic').insertOne(trackingRecord);

    // Générer le contenu de l'email HTML
    const emailHtml = generateTrackingEmailHtml(order, trackingLinks, options);

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: 'tracking.email.sent',
      timestamp: new Date(),
      data: {
        trackingId: result.insertedId.toString(),
        driverEmail,
        trackingType: 'BASIC_EMAIL'
      },
      metadata: {
        source: 'TRACKING_BASIC_SERVICE'
      }
    });

    // Envoyer l'email via AWS SES
    const emailSubject = `Suivi de votre transport - Commande ${order.reference}`;
    const emailResult = await sendTrackingEmailViaSES(driverEmail, emailSubject, emailHtml);

    if (!emailResult.success) {
      console.warn('Failed to send email:', emailResult.error);
    }

    return {
      success: true,
      trackingId: result.insertedId.toString(),
      emailSent: emailResult.success,
      messageId: emailResult.messageId,
      links: trackingLinks,
      expiresAt: trackingRecord.expiresAt
    };

  } catch (error) {
    console.error('Error sending tracking email:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Générer un token sécurisé pour mise à jour de statut
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {String} action - Action à effectuer
 * @returns {Promise<String>} Token sécurisé
 */
async function generateSecureToken(db, orderId, action) {
  try {
    // Générer un token cryptographiquement sécurisé
    const randomBytes = crypto.randomBytes(32);
    const token = randomBytes.toString('hex');

    // Hash du token pour stockage sécurisé
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Stocker le token hashé
    const tokenRecord = {
      tokenHash,
      orderId: new ObjectId(orderId),
      action,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + TOKEN_EXPIRATION_MS),
      used: false,
      usedAt: null,
      ipAddress: null,
      userAgent: null
    };

    await db.collection('tracking_tokens').insertOne(tokenRecord);

    return token; // Retourner le token en clair (une seule fois)

  } catch (error) {
    console.error('Error generating secure token:', error);
    throw error;
  }
}

/**
 * Gérer la mise à jour de statut via lien email
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {String} status - Statut à mettre à jour
 * @param {String} token - Token de sécurité
 * @param {Object} requestData - Données de la requête
 * @returns {Promise<Object>} Résultat de la mise à jour
 */
async function handleStatusUpdateLink(db, orderId, status, token, requestData = {}) {
  try {
    // Vérifier la validité du token
    const tokenValidation = await validateToken(db, orderId, status, token, requestData);

    if (!tokenValidation.valid) {
      return {
        success: false,
        error: tokenValidation.error,
        errorCode: tokenValidation.errorCode
      };
    }

    // Récupérer la configuration du statut
    const statusConfig = TRACKING_STATUSES[status];
    if (!statusConfig) {
      return {
        success: false,
        error: 'Invalid status',
        errorCode: 'INVALID_STATUS'
      };
    }

    // Mettre à jour la commande
    const order = await db.collection('transport_orders').findOneAndUpdate(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          status: statusConfig.orderStatus,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: statusConfig.orderStatus,
            timestamp: new Date(),
            method: 'EMAIL_LINK',
            metadata: {
              ipAddress: requestData.ipAddress,
              userAgent: requestData.userAgent
            }
          }
        }
      },
      { returnDocument: 'after' }
    );

    if (!order.value) {
      return {
        success: false,
        error: 'Order not found',
        errorCode: 'ORDER_NOT_FOUND'
      };
    }

    // Créer l'événement correspondant
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: statusConfig.eventType,
      timestamp: new Date(),
      data: {
        status: statusConfig.code,
        label: statusConfig.label,
        method: 'EMAIL_LINK'
      },
      metadata: {
        source: 'TRACKING_BASIC_EMAIL',
        ipAddress: requestData.ipAddress,
        userAgent: requestData.userAgent
      }
    });

    // Mettre à jour le tracking record
    await db.collection('tracking_basic').updateOne(
      { orderId: new ObjectId(orderId) },
      {
        $set: {
          lastUpdated: new Date(),
          currentStatus: status
        },
        $inc: {
          updatesCount: 1
        }
      }
    );

    return {
      success: true,
      orderId,
      status: statusConfig.code,
      label: statusConfig.label,
      timestamp: new Date(),
      order: order.value
    };

  } catch (error) {
    console.error('Error handling status update:', error);
    return {
      success: false,
      error: error.message,
      errorCode: 'INTERNAL_ERROR'
    };
  }
}

/**
 * Valider un token
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {String} action - Action demandée
 * @param {String} token - Token à valider
 * @param {Object} requestData - Données de la requête
 * @returns {Promise<Object>} Résultat de la validation
 */
async function validateToken(db, orderId, action, token, requestData = {}) {
  try {
    // Hash du token fourni
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Rechercher le token
    const tokenRecord = await db.collection('tracking_tokens').findOne({
      tokenHash,
      orderId: new ObjectId(orderId),
      action
    });

    // Vérifications
    if (!tokenRecord) {
      return {
        valid: false,
        error: 'Invalid or expired token',
        errorCode: 'INVALID_TOKEN'
      };
    }

    if (tokenRecord.used) {
      return {
        valid: false,
        error: 'Token already used',
        errorCode: 'TOKEN_ALREADY_USED',
        usedAt: tokenRecord.usedAt
      };
    }

    if (new Date() > tokenRecord.expiresAt) {
      return {
        valid: false,
        error: 'Token expired',
        errorCode: 'TOKEN_EXPIRED',
        expiresAt: tokenRecord.expiresAt
      };
    }

    // Marquer le token comme utilisé
    await db.collection('tracking_tokens').updateOne(
      { _id: tokenRecord._id },
      {
        $set: {
          used: true,
          usedAt: new Date(),
          ipAddress: requestData.ipAddress,
          userAgent: requestData.userAgent
        }
      }
    );

    return {
      valid: true,
      tokenRecord
    };

  } catch (error) {
    console.error('Error validating token:', error);
    return {
      valid: false,
      error: error.message,
      errorCode: 'VALIDATION_ERROR'
    };
  }
}

/**
 * Générer l'URL de tracking
 * @param {String} orderId - ID de la commande
 * @param {String} status - Code du statut
 * @param {String} token - Token sécurisé
 * @param {String} baseUrl - URL de base (optionnel)
 * @returns {String} URL complète
 */
function generateTrackingUrl(orderId, status, token, baseUrl = null) {
  const base = baseUrl || process.env.TRACKING_BASE_URL || 'https://tracking.symphonia.fr';
  return `${base}/api/tracking/update/${orderId}/${status}?token=${token}`;
}

/**
 * Générer le HTML de l'email de tracking
 * @param {Object} order - Commande de transport
 * @param {Object} trackingLinks - Liens de tracking
 * @param {Object} options - Options d'email
 * @returns {String} HTML de l'email
 */
function generateTrackingEmailHtml(order, trackingLinks, options = {}) {
  const driverName = options.driverName || 'Chauffeur';
  const companyName = options.companyName || 'SYMPHONI.A';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Suivi de Commande - ${order.reference}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: #2563eb;
      margin: 0;
      font-size: 24px;
    }
    .order-info {
      background-color: #f8fafc;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin-bottom: 30px;
    }
    .order-info h3 {
      margin-top: 0;
      color: #1e40af;
    }
    .tracking-section {
      margin-bottom: 30px;
    }
    .tracking-section h2 {
      color: #1e40af;
      font-size: 18px;
      margin-bottom: 15px;
    }
    .status-button {
      display: block;
      width: 100%;
      padding: 15px;
      margin-bottom: 12px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      text-align: center;
      font-weight: bold;
      font-size: 16px;
      transition: background-color 0.3s;
    }
    .status-button:hover {
      background-color: #1e40af;
    }
    .status-button.delivered {
      background-color: #059669;
    }
    .status-button.delivered:hover {
      background-color: #047857;
    }
    .status-button.documents {
      background-color: #7c3aed;
    }
    .status-button.documents:hover {
      background-color: #6d28d9;
    }
    .instructions {
      background-color: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 15px;
      margin-top: 30px;
    }
    .instructions h3 {
      margin-top: 0;
      color: #d97706;
    }
    .footer {
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📦 Suivi de Transport ${companyName}</h1>
    </div>

    <div class="order-info">
      <h3>Commande: ${order.reference}</h3>
      <p><strong>Chargement:</strong> ${order.pickupAddress?.city || order.pickupAddress?.address || 'N/A'}</p>
      <p><strong>Livraison:</strong> ${order.deliveryAddress?.city || order.deliveryAddress?.address || 'N/A'}</p>
      <p><strong>Marchandise:</strong> ${order.description || 'N/A'}</p>
    </div>

    <div class="tracking-section">
      <h2>👋 Bonjour ${driverName},</h2>
      <p>Cliquez sur les boutons ci-dessous pour mettre à jour le statut de votre transport en temps réel.</p>
      <p><strong>Important:</strong> Chaque lien ne peut être utilisé qu'une seule fois et expire dans 24 heures.</p>
    </div>

    <div class="tracking-section">
      <h2>🚚 Étapes du Transport</h2>

      <a href="${trackingLinks.EN_ROUTE_PICKUP.url}" class="status-button">
        ${trackingLinks.EN_ROUTE_PICKUP.emailLabel}
      </a>

      <a href="${trackingLinks.ARRIVED_PICKUP.url}" class="status-button">
        ${trackingLinks.ARRIVED_PICKUP.emailLabel}
      </a>

      <a href="${trackingLinks.LOADING.url}" class="status-button">
        ${trackingLinks.LOADING.emailLabel}
      </a>

      <a href="${trackingLinks.LOADED.url}" class="status-button">
        ${trackingLinks.LOADED.emailLabel}
      </a>

      <a href="${trackingLinks.EN_ROUTE_DELIVERY.url}" class="status-button">
        ${trackingLinks.EN_ROUTE_DELIVERY.emailLabel}
      </a>

      <a href="${trackingLinks.ARRIVED_DELIVERY.url}" class="status-button">
        ${trackingLinks.ARRIVED_DELIVERY.emailLabel}
      </a>

      <a href="${trackingLinks.UNLOADING.url}" class="status-button">
        ${trackingLinks.UNLOADING.emailLabel}
      </a>

      <a href="${trackingLinks.DELIVERED.url}" class="status-button delivered">
        ${trackingLinks.DELIVERED.emailLabel}
      </a>

      <a href="${trackingLinks.DOCUMENTS_UPLOADED.url}" class="status-button documents">
        ${trackingLinks.DOCUMENTS_UPLOADED.emailLabel}
      </a>
    </div>

    <div class="instructions">
      <h3>📱 Instructions</h3>
      <ul>
        <li>Cliquez sur chaque bouton au moment approprié de votre transport</li>
        <li>Chaque clic met automatiquement à jour le système</li>
        <li>N'oubliez pas de déposer vos documents (BL/CMR) en fin de transport</li>
        <li>En cas de problème, contactez votre coordinateur</li>
      </ul>
    </div>

    <div class="footer">
      <p>Ce lien expire le ${new Date(Date.now() + TOKEN_EXPIRATION_MS).toLocaleString('fr-FR')}</p>
      <p>&copy; ${new Date().getFullYear()} ${companyName} - Tous droits réservés</p>
      <p>Version: Tracking Basic (Email)</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Obtenir les informations de tracking d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Informations de tracking
 */
async function getTrackingInfo(db, orderId) {
  try {
    const trackingRecord = await db.collection('tracking_basic')
      .findOne({ orderId: new ObjectId(orderId), active: true });

    if (!trackingRecord) {
      return {
        success: false,
        error: 'No active tracking found for this order'
      };
    }

    return {
      success: true,
      tracking: trackingRecord
    };

  } catch (error) {
    console.error('Error getting tracking info:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Invalider tous les tokens d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Résultat de l'invalidation
 */
async function invalidateOrderTokens(db, orderId) {
  try {
    const result = await db.collection('tracking_tokens').updateMany(
      {
        orderId: new ObjectId(orderId),
        used: false
      },
      {
        $set: {
          used: true,
          usedAt: new Date(),
          invalidated: true
        }
      }
    );

    await db.collection('tracking_basic').updateOne(
      { orderId: new ObjectId(orderId) },
      {
        $set: {
          active: false,
          invalidatedAt: new Date()
        }
      }
    );

    return {
      success: true,
      invalidatedTokens: result.modifiedCount
    };

  } catch (error) {
    console.error('Error invalidating tokens:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Nettoyer les tokens expirés
 * @param {Object} db - MongoDB database
 * @returns {Promise<Object>} Résultat du nettoyage
 */
async function cleanupExpiredTokens(db) {
  try {
    const result = await db.collection('tracking_tokens').deleteMany({
      expiresAt: { $lt: new Date() }
    });

    return {
      success: true,
      deletedCount: result.deletedCount
    };

  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  TRACKING_STATUSES,
  TOKEN_EXPIRATION_MS,
  sendTrackingEmail,
  generateSecureToken,
  handleStatusUpdateLink,
  validateToken,
  generateTrackingUrl,
  generateTrackingEmailHtml,
  getTrackingInfo,
  invalidateOrderTokens,
  cleanupExpiredTokens
};
