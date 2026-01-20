/**
 * Vigilance Reminder Service - Relances automatiques documents transporteurs
 * RT Backend Services - SYMPHONI.A
 *
 * Ce service gère:
 * - Vérification quotidienne des documents de vigilance
 * - Envoi automatique des relances (J-30, J-15, J-7, J-3, J-1)
 * - Blocage automatique des transporteurs avec documents expirés
 * - Notifications via AWS SES (email) et AWS SNS (sms)
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Configuration AWS
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'eu-west-3' });
const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'eu-west-3' });

// Configuration des documents de vigilance
const vigilanceDocumentsConfig = {
  KBIS: {
    name: 'Extrait Kbis',
    required: true,
    maxAgeMonths: 3,
    reminderDaysBefore: [30, 15, 7, 3, 1]
  },
  URSSAF: {
    name: 'Attestation URSSAF',
    required: true,
    maxAgeMonths: 3,
    reminderDaysBefore: [30, 15, 7, 3, 1]
  },
  INSURANCE: {
    name: 'Assurance Transport RC',
    required: true,
    maxAgeMonths: 12,
    reminderDaysBefore: [30, 15, 7, 3, 1]
  },
  ID_CARD: {
    name: 'Pièce d\'identité dirigeant',
    required: true,
    maxAgeMonths: 120,
    reminderDaysBefore: [30, 15, 7]
  },
  TRANSPORT_LICENSE: {
    name: 'Licence de transport',
    required: true,
    maxAgeMonths: 120,
    reminderDaysBefore: [30, 15, 7, 3, 1]
  },
  RIB: {
    name: 'RIB',
    required: true,
    hasExpiration: false
  },
  CAPACITE_FINANCIERE: {
    name: 'Capacité financière',
    required: true,
    maxAgeMonths: 12,
    reminderDaysBefore: [30, 15, 7]
  }
};

// Templates d'emails
const emailTemplates = {
  reminder_30: {
    subject: '[SYMPHONI.A] Rappel: Document {documentName} expire dans 30 jours',
    body: `
Bonjour {companyName},

Votre document "{documentName}" expire le {expiryDate}.

Il vous reste 30 jours pour le renouveler afin de maintenir votre statut de transporteur référencé.

Pour mettre à jour votre document:
1. Connectez-vous à votre portail SYMPHONI.A
2. Accédez à la section "Documents de conformité"
3. Téléchargez la nouvelle version du document

Si votre document n'est pas renouvelé avant son expiration, votre compte sera automatiquement suspendu et vous ne pourrez plus recevoir de nouvelles commandes.

Cordialement,
L'équipe SYMPHONI.A

---
Cet email est envoyé automatiquement. Ne pas répondre directement.
    `
  },
  reminder_15: {
    subject: '[SYMPHONI.A] URGENT: Document {documentName} expire dans 15 jours',
    body: `
Bonjour {companyName},

⚠️ ATTENTION: Votre document "{documentName}" expire le {expiryDate}.

Il ne vous reste que 15 jours pour le renouveler.

Action requise immédiatement:
→ Connectez-vous sur {portalUrl}
→ Mettez à jour votre document dans "Documents de conformité"

Sans action de votre part, votre compte sera suspendu à l'expiration du document.

Cordialement,
L'équipe SYMPHONI.A
    `
  },
  reminder_7: {
    subject: '[SYMPHONI.A] CRITIQUE: Document {documentName} expire dans 7 jours',
    body: `
Bonjour {companyName},

🚨 ALERTE CRITIQUE: Votre document "{documentName}" expire le {expiryDate}.

DERNIÈRE SEMAINE pour renouveler votre document!

→ Portail: {portalUrl}
→ Section: Documents de conformité

⚠️ Suspension automatique dans 7 jours si non renouvelé.

L'équipe SYMPHONI.A
    `
  },
  reminder_3: {
    subject: '[SYMPHONI.A] DERNIER RAPPEL: Document {documentName} expire dans 3 jours',
    body: `
🚨🚨🚨 DERNIER RAPPEL 🚨🚨🚨

{companyName},

Votre document "{documentName}" expire le {expiryDate}.

Plus que 3 JOURS avant suspension de votre compte.

RENOUVELEZ MAINTENANT: {portalUrl}

L'équipe SYMPHONI.A
    `
  },
  reminder_1: {
    subject: '[SYMPHONI.A] EXPIRATION DEMAIN: Document {documentName}',
    body: `
⛔ EXPIRATION IMMINENTE ⛔

{companyName},

Votre document "{documentName}" EXPIRE DEMAIN ({expiryDate}).

Votre compte sera SUSPENDU demain si le document n'est pas renouvelé.

ACTION IMMEDIATE REQUISE: {portalUrl}

L'équipe SYMPHONI.A
    `
  },
  expired: {
    subject: '[SYMPHONI.A] Compte suspendu - Document {documentName} expiré',
    body: `
Bonjour {companyName},

Votre compte transporteur a été SUSPENDU car le document "{documentName}" a expiré le {expiryDate}.

Vous ne pouvez plus:
- Recevoir de nouvelles commandes
- Accéder à la bourse de fret AFFRET.IA
- Être visible dans le référentiel transporteurs

Pour réactiver votre compte:
1. Connectez-vous à {portalUrl}
2. Téléchargez le document renouvelé
3. Attendez la validation (sous 24h ouvrées)

Cordialement,
L'équipe SYMPHONI.A
    `
  }
};

// Templates SMS
const smsTemplates = {
  reminder_7: 'SYMPHONI.A: Votre {documentName} expire dans 7 jours. Renouvelez-le sur votre portail pour eviter la suspension.',
  reminder_3: 'URGENT SYMPHONI.A: {documentName} expire dans 3 jours! Suspension imminente. Connectez-vous maintenant.',
  reminder_1: 'ALERTE SYMPHONI.A: {documentName} EXPIRE DEMAIN! Renouvelez immediatement pour eviter la suspension.',
  expired: 'SYMPHONI.A: Compte SUSPENDU - {documentName} expire. Renouvelez votre document pour reactiver.'
};

/**
 * Envoyer un email via AWS SES
 */
async function sendEmail(to, subject, body) {
  try {
    const command = new SendEmailCommand({
      Source: process.env.SES_FROM_EMAIL || 'noreply@symphonia-controltower.com',
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: {
          Text: { Data: body, Charset: 'UTF-8' }
        }
      }
    });

    const result = await sesClient.send(command);
    console.log(`[Vigilance] Email sent to ${to}: ${result.MessageId}`);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`[Vigilance] Failed to send email to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Envoyer un SMS via AWS SNS
 */
async function sendSMS(phoneNumber, message) {
  try {
    // Formater le numéro de téléphone (France)
    let formattedPhone = phoneNumber.replace(/\s/g, '').replace(/\./g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+33' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+33' + formattedPhone;
    }

    const command = new PublishCommand({
      PhoneNumber: formattedPhone,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'SYMPHONIA'
        },
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'
        }
      }
    });

    const result = await snsClient.send(command);
    console.log(`[Vigilance] SMS sent to ${formattedPhone}: ${result.MessageId}`);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`[Vigilance] Failed to send SMS to ${phoneNumber}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Remplacer les variables dans un template
 */
function replaceTemplateVars(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value || '');
  }
  return result;
}

/**
 * Calculer les jours restants avant expiration
 */
function getDaysUntilExpiration(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffTime = expiry - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Vérifier les documents d'un transporteur et envoyer les relances
 */
async function checkCarrierDocuments(carrier, db) {
  const results = {
    carrierId: carrier._id || carrier.carrierId,
    companyName: carrier.companyName,
    alerts: [],
    remindersSent: [],
    statusChanged: false
  };

  const now = new Date();
  const portalUrl = process.env.PORTAL_URL || 'https://portail.symphonia-controltower.com';

  // Parcourir chaque type de document
  for (const [docType, config] of Object.entries(vigilanceDocumentsConfig)) {
    if (!config.required || !config.reminderDaysBefore) continue;

    const document = carrier.vigilanceDocuments?.[docType];

    // Document manquant
    if (!document || !document.url) {
      results.alerts.push({
        type: 'missing',
        documentType: docType,
        documentName: config.name
      });
      continue;
    }

    // Document avec date d'expiration
    if (document.expiresAt) {
      const daysRemaining = getDaysUntilExpiration(document.expiresAt);
      const expiryDateFormatted = new Date(document.expiresAt).toLocaleDateString('fr-FR');

      const templateVars = {
        companyName: carrier.companyName,
        documentName: config.name,
        expiryDate: expiryDateFormatted,
        portalUrl
      };

      // Document expiré
      if (daysRemaining < 0) {
        results.alerts.push({
          type: 'expired',
          documentType: docType,
          documentName: config.name,
          expiredSince: Math.abs(daysRemaining)
        });

        // Envoyer notification d'expiration (si pas déjà envoyée aujourd'hui)
        const lastExpiredNotif = carrier.vigilanceNotifications?.find(
          n => n.type === 'expired' && n.documentType === docType &&
          new Date(n.sentAt).toDateString() === now.toDateString()
        );

        if (!lastExpiredNotif) {
          // Email
          const emailResult = await sendEmail(
            carrier.contact?.email || carrier.email,
            replaceTemplateVars(emailTemplates.expired.subject, templateVars),
            replaceTemplateVars(emailTemplates.expired.body, templateVars)
          );

          // SMS
          if (carrier.contact?.phone || carrier.phone) {
            await sendSMS(
              carrier.contact?.phone || carrier.phone,
              replaceTemplateVars(smsTemplates.expired, templateVars)
            );
          }

          results.remindersSent.push({
            type: 'expired',
            documentType: docType,
            channels: ['email', 'sms']
          });
        }

        continue;
      }

      // Vérifier si une relance doit être envoyée
      for (const reminderDay of config.reminderDaysBefore) {
        if (daysRemaining === reminderDay) {
          // Vérifier si cette relance a déjà été envoyée
          const alreadySent = carrier.vigilanceNotifications?.find(
            n => n.type === `reminder_${reminderDay}` &&
            n.documentType === docType &&
            new Date(n.sentAt).toDateString() === now.toDateString()
          );

          if (alreadySent) continue;

          const templateKey = `reminder_${reminderDay}`;
          const emailTemplate = emailTemplates[templateKey] || emailTemplates.reminder_30;
          const smsTemplate = smsTemplates[templateKey];

          // Envoyer email
          const emailResult = await sendEmail(
            carrier.contact?.email || carrier.email,
            replaceTemplateVars(emailTemplate.subject, templateVars),
            replaceTemplateVars(emailTemplate.body, templateVars)
          );

          const channels = ['email'];

          // SMS pour les rappels urgents (J-7, J-3, J-1)
          if (smsTemplate && (carrier.contact?.phone || carrier.phone)) {
            await sendSMS(
              carrier.contact?.phone || carrier.phone,
              replaceTemplateVars(smsTemplate, templateVars)
            );
            channels.push('sms');
          }

          results.remindersSent.push({
            type: templateKey,
            documentType: docType,
            daysRemaining: reminderDay,
            channels
          });

          // Enregistrer la notification envoyée
          if (db) {
            await db.collection('carriers').updateOne(
              { _id: carrier._id },
              {
                $push: {
                  vigilanceNotifications: {
                    type: templateKey,
                    documentType: docType,
                    sentAt: now,
                    channels
                  }
                }
              }
            );
          }

          break; // Une seule relance par document par jour
        }
      }

      // Alerte si document expire bientôt
      if (daysRemaining <= 30 && daysRemaining > 0) {
        results.alerts.push({
          type: 'expiring',
          documentType: docType,
          documentName: config.name,
          daysRemaining
        });
      }
    }
  }

  // Mettre à jour le statut si documents expirés
  const hasExpired = results.alerts.some(a => a.type === 'expired');
  if (hasExpired && carrier.status !== 'BLOCKED') {
    results.statusChanged = true;
    results.newStatus = 'BLOCKED';

    if (db) {
      await db.collection('carriers').updateOne(
        { _id: carrier._id },
        {
          $set: {
            status: 'BLOCKED',
            blockedAt: now,
            blockedReason: 'Documents de vigilance expirés',
            updatedAt: now
          }
        }
      );
    }
  }

  return results;
}

/**
 * Job quotidien de vérification des documents
 */
async function runDailyVigilanceCheck(db) {
  console.log('[Vigilance] Starting daily vigilance check...');
  const startTime = Date.now();

  const stats = {
    totalCarriers: 0,
    carriersWithAlerts: 0,
    remindersSent: 0,
    carriersBlocked: 0,
    errors: []
  };

  try {
    // Récupérer tous les transporteurs actifs ou en attente
    const carriers = await db.collection('carriers').find({
      status: { $in: ['ACTIVE', 'ONBOARDING', 'INVITED', 'PREMIUM'] }
    }).toArray();

    stats.totalCarriers = carriers.length;
    console.log(`[Vigilance] Checking ${carriers.length} carriers...`);

    for (const carrier of carriers) {
      try {
        const result = await checkCarrierDocuments(carrier, db);

        if (result.alerts.length > 0) {
          stats.carriersWithAlerts++;
        }

        stats.remindersSent += result.remindersSent.length;

        if (result.statusChanged && result.newStatus === 'BLOCKED') {
          stats.carriersBlocked++;
        }
      } catch (error) {
        console.error(`[Vigilance] Error checking carrier ${carrier._id}:`, error.message);
        stats.errors.push({
          carrierId: carrier._id,
          error: error.message
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Vigilance] Daily check completed in ${duration}ms`);
    console.log(`[Vigilance] Stats: ${JSON.stringify(stats)}`);

    // Enregistrer le rapport
    await db.collection('vigilance_reports').insertOne({
      type: 'daily_check',
      runAt: new Date(),
      duration,
      stats
    });

    return stats;
  } catch (error) {
    console.error('[Vigilance] Daily check failed:', error);
    throw error;
  }
}

/**
 * Vérifier un transporteur spécifique (à la demande)
 */
async function checkSingleCarrier(carrierId, db) {
  const carrier = await db.collection('carriers').findOne({
    $or: [
      { _id: carrierId },
      { carrierId: carrierId }
    ]
  });

  if (!carrier) {
    throw new Error(`Carrier not found: ${carrierId}`);
  }

  return await checkCarrierDocuments(carrier, db);
}

/**
 * Obtenir le résumé de vigilance pour un transporteur
 */
function getVigilanceSummary(carrier) {
  const summary = {
    isCompliant: true,
    documentsStatus: {
      valid: 0,
      expiringSoon: 0,
      expired: 0,
      missing: 0
    },
    alerts: [],
    nextExpiration: null
  };

  for (const [docType, config] of Object.entries(vigilanceDocumentsConfig)) {
    if (!config.required) continue;

    const document = carrier.vigilanceDocuments?.[docType];

    if (!document || !document.url) {
      summary.documentsStatus.missing++;
      summary.isCompliant = false;
      summary.alerts.push({
        severity: 'high',
        type: 'missing',
        documentType: docType,
        documentName: config.name,
        message: `Document manquant: ${config.name}`
      });
      continue;
    }

    if (document.expiresAt) {
      const daysRemaining = getDaysUntilExpiration(document.expiresAt);

      if (daysRemaining < 0) {
        summary.documentsStatus.expired++;
        summary.isCompliant = false;
        summary.alerts.push({
          severity: 'critical',
          type: 'expired',
          documentType: docType,
          documentName: config.name,
          expiredSince: Math.abs(daysRemaining),
          message: `Document expiré depuis ${Math.abs(daysRemaining)} jours: ${config.name}`
        });
      } else if (daysRemaining <= 30) {
        summary.documentsStatus.expiringSoon++;
        summary.alerts.push({
          severity: daysRemaining <= 7 ? 'high' : 'medium',
          type: 'expiring',
          documentType: docType,
          documentName: config.name,
          daysRemaining,
          expiresAt: document.expiresAt,
          message: `Document expire dans ${daysRemaining} jours: ${config.name}`
        });

        // Tracker la prochaine expiration
        if (!summary.nextExpiration || new Date(document.expiresAt) < new Date(summary.nextExpiration.date)) {
          summary.nextExpiration = {
            documentType: docType,
            documentName: config.name,
            date: document.expiresAt,
            daysRemaining
          };
        }
      } else {
        summary.documentsStatus.valid++;
      }
    } else {
      summary.documentsStatus.valid++;
    }
  }

  // Trier les alertes par sévérité
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  summary.alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return summary;
}

module.exports = {
  vigilanceDocumentsConfig,
  emailTemplates,
  smsTemplates,
  sendEmail,
  sendSMS,
  checkCarrierDocuments,
  runDailyVigilanceCheck,
  checkSingleCarrier,
  getVigilanceSummary,
  getDaysUntilExpiration
};
