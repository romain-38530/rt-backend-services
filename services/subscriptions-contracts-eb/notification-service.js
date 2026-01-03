// ============================================================================
// Notification Service - Multi-Channel Notifications (Email + SMS)
// ============================================================================
// Version: 2.5.2 - Migrated to AWS SES
// Description: Service de notifications via Email (AWS SES) et SMS (Twilio)
// ============================================================================

const { ObjectId } = require('mongodb');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const crypto = require('crypto');

/**
 * Configuration AWS SES
 */
let sesClient = null;

const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-west-1'
};

const SES_FROM = process.env.SES_FROM_EMAIL || 'notifications@symphonia-controltower.com';
const SES_FROM_NAME = 'SYMPHONI.A Notifications';

function initSES() {
  try {
    sesClient = new SESClient(SES_CONFIG);
    console.log(`✅ AWS SES initialized (region: ${SES_CONFIG.region})`);
    return true;
  } catch (error) {
    console.error('⚠️ AWS SES initialization failed:', error.message);
    return false;
  }
}

/**
 * Configuration Twilio
 */
let twilioClient = null;

function initTwilio() {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require('twilio');
      twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✅ Twilio initialized');
      return true;
    } catch (error) {
      console.warn('⚠️ Twilio not available:', error.message);
      return false;
    }
  }
  console.warn('⚠️ Twilio not configured - TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing');
  return false;
}

/**
 * Types de notifications
 */
const NotificationTypes = {
  // Dispatch & Orders
  ORDER_CREATED: 'order.created',
  ORDER_ASSIGNED: 'order.assigned',
  CARRIER_TIMEOUT: 'carrier.timeout',
  ORDER_ESCALATED: 'order.escalated',

  // Tracking
  TRACKING_STARTED: 'tracking.started',
  TRACKING_POSITION_UPDATE: 'tracking.position',
  GEOFENCE_ENTER: 'geofence.enter',
  GEOFENCE_EXIT: 'geofence.exit',

  // Delays
  DELAY_WARNING: 'delay.warning',
  CRITICAL_DELAY: 'delay.critical',
  ETA_UPDATE: 'eta.update',

  // Delivery
  PICKUP_COMPLETED: 'pickup.completed',
  DELIVERY_COMPLETED: 'delivery.completed',
  POD_UPLOADED: 'pod.uploaded',

  // Documents
  DOCUMENT_REQUIRED: 'document.required',
  DOCUMENT_VERIFIED: 'document.verified',
  DOCUMENT_REJECTED: 'document.rejected'
};

/**
 * Templates de messages
 */
const MessageTemplates = {
  // Email templates
  email: {
    [NotificationTypes.ORDER_CREATED]: {
      subject: 'Nouvelle commande de transport #{reference}',
      body: `
        <h2>Nouvelle commande créée</h2>
        <p><strong>Référence:</strong> {reference}</p>
        <p><strong>Chargement:</strong> {pickupAddress}</p>
        <p><strong>Livraison:</strong> {deliveryAddress}</p>
        <p><strong>Date prévue:</strong> {deliveryDate}</p>
      `
    },
    [NotificationTypes.CARRIER_TIMEOUT]: {
      subject: '⚠️ Timeout transporteur - Commande #{reference}',
      body: `
        <h2>Timeout transporteur détecté</h2>
        <p>Le transporteur <strong>{timedOutCarrier}</strong> n'a pas répondu dans le délai imparti.</p>
        <p><strong>Commande:</strong> {reference}</p>
        <p>La commande a été automatiquement proposée au transporteur suivant: <strong>{nextCarrier}</strong></p>
      `
    },
    [NotificationTypes.DELAY_WARNING]: {
      subject: '⚠️ Retard détecté - Commande #{reference}',
      body: `
        <h2>Retard détecté sur votre commande</h2>
        <p><strong>Commande:</strong> {reference}</p>
        <p><strong>Retard estimé:</strong> {delayMinutes} minutes</p>
        <p><strong>Type:</strong> {delayType}</p>
        <p>Notre équipe suit la situation de près.</p>
      `
    },
    [NotificationTypes.CRITICAL_DELAY]: {
      subject: '🚨 RETARD CRITIQUE - Commande #{reference}',
      body: `
        <h2>⚠️ Retard critique détecté</h2>
        <p><strong>Commande:</strong> {reference}</p>
        <p><strong>Retard:</strong> {delayMinutes} minutes</p>
        <p><strong>Type:</strong> {delayType}</p>
        <p style="color: red;"><strong>Action immédiate requise!</strong></p>
      `
    },
    [NotificationTypes.DELIVERY_COMPLETED]: {
      subject: '✅ Livraison effectuée - Commande #{reference}',
      body: `
        <h2>Livraison confirmée</h2>
        <p><strong>Commande:</strong> {reference}</p>
        <p><strong>Livrée à:</strong> {deliveryAddress}</p>
        <p><strong>Date/Heure:</strong> {deliveryTime}</p>
        <p>La preuve de livraison est disponible dans votre espace client.</p>
      `
    },
    [NotificationTypes.GEOFENCE_ENTER]: {
      subject: '📍 Arrivée zone - Commande #{reference}',
      body: `
        <h2>Entrée dans la zone géographique</h2>
        <p><strong>Commande:</strong> {reference}</p>
        <p><strong>Zone:</strong> {zoneName}</p>
        <p><strong>Type:</strong> {zoneType}</p>
        <p>Le véhicule est arrivé à proximité du point de {zoneType}.</p>
      `
    }
  },

  // SMS templates (courts)
  sms: {
    [NotificationTypes.ORDER_CREATED]: 'RT SYMPHONI.A: Commande {reference} créée. Livraison prévue: {deliveryDate}',
    [NotificationTypes.CARRIER_TIMEOUT]: 'RT: Timeout {timedOutCarrier} sur commande {reference}. Réaffectation en cours.',
    [NotificationTypes.DELAY_WARNING]: 'RT: Retard {delayMinutes}min sur commande {reference}. Suivi en cours.',
    [NotificationTypes.CRITICAL_DELAY]: '🚨 RT: RETARD CRITIQUE {delayMinutes}min sur {reference}! Action requise.',
    [NotificationTypes.DELIVERY_COMPLETED]: '✅ RT: Commande {reference} livrée avec succès.',
    [NotificationTypes.GEOFENCE_ENTER]: '📍 RT: Arrivée zone {zoneType} - {reference}'
  }
};

/**
 * Générer un Message-ID unique conforme RFC 5322
 */
function generateMessageId(domain) {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Envoyer un email via AWS SES avec headers anti-spam
 * @param {Object} options - Options d'envoi
 * @returns {Promise<Object>} Résultat
 */
async function sendEmail(options) {
  const { to, subject, html, text, from, replyTo } = options;

  if (!sesClient) {
    initSES();
  }

  if (!sesClient) {
    return {
      success: false,
      error: 'AWS SES not configured',
      fallback: true
    };
  }

  try {
    const toAddresses = Array.isArray(to) ? to : [to];
    const sender = from || `${SES_FROM_NAME} <${SES_FROM}>`;
    const domain = SES_FROM.split('@')[1] || 'symphonia-controltower.com';
    const messageId = generateMessageId(domain);
    const replyToAddress = replyTo || 'support@symphonia-controltower.com';

    // Version texte brut (important pour anti-spam)
    const plainText = text || html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    // Construire email MIME avec headers anti-spam
    const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const rawEmail = [
      `From: ${sender}`,
      `To: ${toAddresses.join(', ')}`,
      `Reply-To: ${replyToAddress}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      // Headers anti-spam
      'X-Priority: 3',
      'X-Mailer: SYMPHONIA-ControlTower/2.5',
      `List-Unsubscribe: <mailto:unsubscribe@${domain}?subject=unsubscribe>`,
      'Precedence: bulk',
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
      html || plainText,
      '',
      `--${boundary}--`
    ].join('\r\n');

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawEmail)
      }
    });

    const result = await sesClient.send(command);

    console.log(`[AWS-SES] Email sent to ${toAddresses.join(', ')}: ${subject} (${messageId})`);

    return {
      success: true,
      messageId: result.MessageId,
      channel: 'email',
      provider: 'aws-ses'
    };
  } catch (error) {
    console.error('Error sending email via SES:', error.message);
    return {
      success: false,
      error: error.message,
      channel: 'email',
      provider: 'aws-ses'
    };
  }
}

/**
 * Envoyer un SMS via Twilio
 * @param {Object} options - Options d'envoi
 * @returns {Promise<Object>} Résultat
 */
async function sendSMS(options) {
  const { to, body } = options;

  if (!twilioClient) {
    return {
      success: false,
      error: 'Twilio not configured',
      fallback: true
    };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to
    });

    return {
      success: true,
      messageId: message.sid,
      channel: 'sms',
      status: message.status
    };
  } catch (error) {
    console.error('Error sending SMS:', error.message);
    return {
      success: false,
      error: error.message,
      channel: 'sms'
    };
  }
}

/**
 * Formater un template avec les données
 * @param {String} template - Template avec placeholders {key}
 * @param {Object} data - Données à injecter
 * @returns {String} Template formaté
 */
function formatTemplate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value || '');
  }
  return result;
}

/**
 * Récupérer les contacts d'un destinataire
 * @param {Object} db - MongoDB database
 * @param {String} recipientType - Type de destinataire (industrial, carrier, driver)
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Contacts
 */
async function getRecipientContacts(db, recipientType, orderId) {
  try {
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return { email: null, phone: null };
    }

    let userId;
    switch (recipientType) {
      case 'industrial':
        userId = order.industrialId;
        break;
      case 'carrier':
        userId = order.assignedCarrierId;
        break;
      case 'driver':
        userId = order.driverId;
        break;
      default:
        return { email: null, phone: null };
    }

    if (!userId) {
      return { email: null, phone: null };
    }

    // Chercher dans les users
    const user = await db.collection('users')
      .findOne({ _id: new ObjectId(userId) });

    if (user) {
      return {
        email: user.email,
        phone: user.phone || user.mobile
      };
    }

    // Chercher dans les carriers
    const carrier = await db.collection('carriers')
      .findOne({ _id: new ObjectId(userId) });

    if (carrier) {
      return {
        email: carrier.email || carrier.contactEmail,
        phone: carrier.phone || carrier.contactPhone
      };
    }

    return { email: null, phone: null };

  } catch (error) {
    console.error('Error getting recipient contacts:', error.message);
    return { email: null, phone: null };
  }
}

/**
 * Envoyer une notification multi-canal
 * @param {Object} db - MongoDB database
 * @param {Object} notification - Configuration de la notification
 * @returns {Promise<Object>} Résultat de l'envoi
 */
async function sendNotification(db, notification) {
  const {
    type,
    orderId,
    recipients = ['industrial'],
    channels = ['email'],
    data = {},
    customMessage
  } = notification;

  const results = {
    success: true,
    notifications: [],
    errors: []
  };

  // Pour chaque destinataire
  for (const recipientType of recipients) {
    const contacts = await getRecipientContacts(db, recipientType, orderId);

    // Envoyer par email si demandé
    if (channels.includes('email') && contacts.email) {
      const emailTemplate = MessageTemplates.email[type];

      if (emailTemplate || customMessage) {
        const subject = customMessage?.subject || formatTemplate(emailTemplate.subject, data);
        const html = customMessage?.body || formatTemplate(emailTemplate.body, data);

        const emailResult = await sendEmail({
          to: contacts.email,
          subject,
          html
        });

        results.notifications.push({
          recipient: recipientType,
          channel: 'email',
          ...emailResult
        });

        if (!emailResult.success) {
          results.errors.push(emailResult);
        }
      }
    }

    // Envoyer par SMS si demandé
    if (channels.includes('sms') && contacts.phone) {
      const smsTemplate = MessageTemplates.sms[type];

      if (smsTemplate || customMessage?.sms) {
        const body = customMessage?.sms || formatTemplate(smsTemplate, data);

        const smsResult = await sendSMS({
          to: contacts.phone,
          body
        });

        results.notifications.push({
          recipient: recipientType,
          channel: 'sms',
          ...smsResult
        });

        if (!smsResult.success) {
          results.errors.push(smsResult);
        }
      }
    }
  }

  // Enregistrer la notification dans la base
  try {
    await db.collection('notifications').insertOne({
      type,
      orderId: orderId ? new ObjectId(orderId) : null,
      recipients,
      channels,
      data,
      results: results.notifications,
      sentAt: new Date(),
      success: results.errors.length === 0
    });
  } catch (error) {
    console.error('Error logging notification:', error.message);
  }

  results.success = results.errors.length === 0;
  return results;
}

/**
 * Envoyer une notification directe (sans template)
 * @param {Object} options - Options d'envoi
 * @returns {Promise<Object>} Résultat
 */
async function sendDirectNotification(options) {
  const { email, phone, subject, body, smsBody } = options;
  const results = { email: null, sms: null };

  if (email && subject && body) {
    results.email = await sendEmail({ to: email, subject, html: body });
  }

  if (phone && smsBody) {
    results.sms = await sendSMS({ to: phone, body: smsBody });
  }

  return {
    success: (results.email?.success || !email) && (results.sms?.success || !phone),
    ...results
  };
}

/**
 * Obtenir l'historique des notifications
 * @param {Object} db - MongoDB database
 * @param {Object} filters - Filtres
 * @returns {Promise<Object>} Historique
 */
async function getNotificationHistory(db, filters = {}) {
  try {
    const { orderId, type, limit = 50, skip = 0 } = filters;

    const query = {};
    if (orderId) query.orderId = new ObjectId(orderId);
    if (type) query.type = type;

    const notifications = await db.collection('notifications')
      .find(query)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db.collection('notifications').countDocuments(query);

    return {
      success: true,
      notifications,
      total,
      limit,
      skip
    };

  } catch (error) {
    console.error('Error getting notification history:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir le statut des services de notification
 * @returns {Object} Statut
 */
function getNotificationServicesStatus() {
  return {
    email: {
      provider: 'AWS SES',
      configured: !!sesClient,
      region: SES_CONFIG.region,
      from: SES_FROM
    },
    sms: {
      provider: 'Twilio',
      configured: !!twilioClient,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || 'not set'
    }
  };
}

// ==================== INITIALIZATION ====================

// Auto-initialize on module load
initSES();
initTwilio();

// ==================== EXPORTS ====================

module.exports = {
  NotificationTypes,
  MessageTemplates,
  initSES,
  initTwilio,
  sendEmail,
  sendSMS,
  sendNotification,
  sendDirectNotification,
  getNotificationHistory,
  getNotificationServicesStatus,
  formatTemplate
};
