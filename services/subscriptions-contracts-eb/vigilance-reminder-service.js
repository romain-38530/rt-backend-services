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

// Configuration AWS - SES et SNS sont dans eu-central-1
const sesClient = new SESClient({ region: process.env.SES_REGION || 'eu-central-1' });
const snsClient = new SNSClient({ region: process.env.SNS_REGION || 'eu-central-1' });

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

// Templates d'emails - Orientation commerciale et professionnelle
const emailTemplates = {
  reminder_30: {
    subject: 'SYMPHONI.A - Optimisez votre conformité : {documentName} à renouveler',
    body: `
Bonjour {companyName},

Nous espérons que votre activité se porte bien !

Dans le cadre de notre partenariat et pour vous garantir un accès continu à notre réseau de donneurs d'ordres premium, nous vous informons que votre document "{documentName}" arrive à échéance le {expiryDate}.

🎯 POURQUOI C'EST IMPORTANT POUR VOUS ?

En maintenant vos documents à jour, vous bénéficiez :
• D'une visibilité maximale auprès de nos 150+ donneurs d'ordres industriels
• D'un accès prioritaire aux offres de fret via AFFRET.IA
• D'un score de fiabilité optimisé (+15% de chances d'attribution)
• De la confiance renforcée de vos partenaires

📋 MISE À JOUR SIMPLIFIÉE (2 minutes)

1. Connectez-vous à votre espace : {portalUrl}
2. Section "Documents de conformité"
3. Glissez-déposez votre nouveau document
4. Validation automatique sous 24h

💡 ASTUCE : Activez les rappels automatiques dans vos paramètres pour ne plus jamais manquer une échéance !

Notre équipe reste à votre disposition pour vous accompagner.

Excellente continuation,

L'équipe SYMPHONI.A
──────────────────────────
📞 Support : 04 76 33 23 78
📧 support@symphonia-controltower.com
🌐 www.symphonia-controltower.com
    `
  },
  reminder_15: {
    subject: 'SYMPHONI.A - Action requise : {documentName} expire dans 15 jours',
    body: `
Bonjour {companyName},

Le temps passe vite ! Votre document "{documentName}" expire le {expiryDate}.

⏰ IL VOUS RESTE 15 JOURS

Ne laissez pas cette échéance impacter votre activité. Chaque jour, des transporteurs avec des documents à jour remportent les meilleurs contrats sur notre plateforme.

📈 VOS AVANTAGES EN RÈGLE :
• Accès à +500 offres de fret/jour via AFFRET.IA
• Référencement prioritaire dans notre réseau industriel
• Badge "Transporteur Vérifié" visible par les donneurs d'ordres
• Statistiques : les transporteurs conformes obtiennent 35% de missions en plus

🚀 RENOUVELEZ EN 1 CLIC
{portalUrl}

Besoin d'aide ? Notre équipe vous accompagne gratuitement dans vos démarches administratives.

À très bientôt sur SYMPHONI.A,

L'équipe Partenariats
──────────────────────────
📞 04 76 33 23 78 (9h-18h)
💬 Chat disponible sur votre portail
    `
  },
  reminder_7: {
    subject: 'SYMPHONI.A - Dernière semaine : {documentName} expire bientôt !',
    body: `
Bonjour {companyName},

⚡ ALERTE - Plus que 7 jours !

Votre document "{documentName}" expire le {expiryDate}.

Nous tenons à vous car vous êtes un partenaire précieux de notre réseau. Ne perdez pas les avantages que vous avez construits :

✅ Votre historique de missions préservé
✅ Votre score de fiabilité maintenu
✅ Votre visibilité auprès des industriels
✅ Vos tarifs négociés conservés

❌ SANS RENOUVELLEMENT :
• Suspension temporaire de votre compte
• Perte de visibilité sur la bourse de fret
• Missions en cours potentiellement réattribuées

👉 AGISSEZ MAINTENANT : {portalUrl}

Notre équipe peut vous rappeler pour vous aider : répondez simplement "RAPPEL" à cet email.

Nous comptons sur vous,

L'équipe SYMPHONI.A
    `
  },
  reminder_3: {
    subject: '⚠️ SYMPHONI.A - URGENT : {documentName} expire dans 3 jours',
    body: `
{companyName},

🔴 SITUATION URGENTE - 3 JOURS RESTANTS

Votre document "{documentName}" expire le {expiryDate}.

Nous ne voulons pas vous perdre ! Vous faites partie des transporteurs de confiance de notre réseau, et nous souhaitons continuer à travailler ensemble.

⚡ ACTION IMMÉDIATE REQUISE ⚡

→ Cliquez ici : {portalUrl}
→ Uploadez votre document renouvelé
→ Continuez à recevoir des missions

📞 BESOIN D'AIDE URGENTE ?
Appelez-nous directement : 04 76 33 23 78
Notre équipe est mobilisée pour vous aider.

Nous croyons en votre entreprise,

L'équipe SYMPHONI.A
    `
  },
  reminder_1: {
    subject: '🚨 SYMPHONI.A - DERNIER JOUR : {documentName} expire DEMAIN',
    body: `
{companyName},

⏰ DERNIÈRES HEURES - Votre document "{documentName}" expire DEMAIN ({expiryDate})

C'est le moment d'agir. Après demain, votre compte sera temporairement suspendu et vous ne pourrez plus :
• Recevoir de nouvelles propositions de transport
• Accéder à la bourse AFFRET.IA
• Être visible dans le référentiel transporteurs

🆘 NOUS SOMMES LÀ POUR VOUS

Nous comprenons que les démarches administratives peuvent être chronophages. Si vous rencontrez des difficultés pour obtenir votre document à temps, contactez-nous MAINTENANT.

📱 LIGNE DIRECTE : 04 76 33 23 78
📧 urgent@symphonia-controltower.com

→ RENOUVELER MON DOCUMENT : {portalUrl}

Ne laissez pas une formalité administrative freiner votre croissance.

Cordialement,

L'équipe SYMPHONI.A
    `
  },
  expired: {
    subject: 'SYMPHONI.A - Votre compte attend votre retour ({documentName})',
    body: `
Bonjour {companyName},

Votre document "{documentName}" a expiré le {expiryDate}, et votre compte est actuellement en pause.

🤝 NOUS GARDONS VOTRE PLACE

Bonne nouvelle : votre historique, votre score et vos paramètres sont préservés. Dès que vous aurez mis à jour votre document, tout sera réactivé instantanément.

CE QUI VOUS ATTEND À VOTRE RETOUR :
• Votre score de fiabilité intact
• Vos relations donneurs d'ordres préservées
• Accès immédiat à +500 offres/jour sur AFFRET.IA
• Badge "Transporteur Vérifié" restauré

🔓 RÉACTIVATION EXPRESS (24h)

1. Connectez-vous : {portalUrl}
2. Uploadez votre nouveau document
3. Validation sous 24h ouvrées
4. Reprenez votre activité !

💬 BESOIN D'ACCOMPAGNEMENT ?
Notre équipe peut vous guider pas à pas.
📞 04 76 33 23 78 | 📧 support@symphonia-controltower.com

Nous avons hâte de vous retrouver,

L'équipe SYMPHONI.A

P.S. : Saviez-vous que vous pouvez activer les rappels automatiques pour ne plus jamais manquer une échéance ? Découvrez cette fonctionnalité dans vos paramètres !
    `
  },
  // Email d'invitation sous-traitant avec offre découverte
  invitation_decouverte: {
    subject: '{invitingCompany} vous invite à déposer vos documents de conformité sur SYMPHONI.A',
    body: `
Bonjour,

{invitingCompany} a choisi SYMPHONI.A pour gérer son obligation de vigilance envers ses sous-traitants.

En tant que partenaire de {invitingCompany}, nous vous invitons à déposer vos documents de conformité sur notre plateforme sécurisée. Cela simplifiera considérablement la gestion administrative pour vous comme pour {invitingCompany}.

📋 CE QUE NOUS VOUS DEMANDONS

Connectez-vous et déposez vos documents obligatoires :
• Attestation URSSAF de vigilance
• Extrait Kbis (moins de 3 mois)
• Attestation d'assurance RC Pro
• Licence de transport (le cas échéant)

Notre système vous alertera automatiquement avant chaque expiration pour que vous restiez toujours en conformité.

──────────────────────────

🚀 DÉCOUVREZ SYMPHONI.A - BIEN PLUS QU'UN PORTAIL DOCUMENTS !

SYMPHONI.A est LA plateforme transport nouvelle génération qui connecte transporteurs et donneurs d'ordres industriels.

✅ AFFRET.IA : +500 offres de fret/jour grâce à notre IA
✅ +150 donneurs d'ordres industriels (Carrefour, Danone, L'Oréal...)
✅ Paiement garanti sous 30 jours
✅ Application mobile pour vos chauffeurs
✅ eCMR et signature électronique inclus
✅ Scoring transporteur pour booster votre visibilité

🎁 OFFRE EXCLUSIVE DE BIENVENUE

Pour vous remercier de votre confiance, {invitingCompany} vous offre :
• 10 transports AFFRET.IA GRATUITS (valeur ~500€)
• Accès complet au portail SYMPHONI.A pendant 90 jours
• Scoring transporteur et visibilité auprès de notre réseau

──────────────────────────

📋 INSCRIPTION EN 3 ÉTAPES (5 minutes)

1. Cliquez sur le lien ci-dessous
2. Complétez vos informations entreprise
3. Déposez vos documents de conformité
→ C'est prêt ! Vous pouvez recevoir des offres de fret.

👉 CRÉER MON COMPTE : {invitationUrl}

Cette offre est valable 30 jours.

Des questions ? Notre équipe est à votre écoute :
📞 04 76 33 23 78 | 📧 partenariats@symphonia-controltower.com

À très bientôt sur SYMPHONI.A,

L'équipe Partenariats
──────────────────────────
SYMPHONI.A - La plateforme transport nouvelle génération
🌐 www.symphonia-controltower.com
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

/**
 * Envoyer tous les emails de test pour validation
 */
async function sendTestEmails(recipientEmail) {
  const testData = {
    companyName: 'Transport Durand & Fils',
    documentName: 'Attestation URSSAF',
    expiryDate: '15/02/2026',
    portalUrl: 'https://portail.symphonia-controltower.com',
    invitingCompany: 'SETT Transports',
    invitationUrl: 'https://transporteur.symphonia-controltower.com/inscription?ref=sett-transports&trial=10'
  };

  const results = [];
  const templateNames = ['reminder_30', 'reminder_15', 'reminder_7', 'reminder_3', 'reminder_1', 'expired', 'invitation_decouverte'];

  console.log(`[Test Emails] Sending test emails to ${recipientEmail}...`);

  for (const templateName of templateNames) {
    const template = emailTemplates[templateName];
    if (!template) {
      results.push({ templateName, success: false, error: 'Template not found' });
      continue;
    }

    try {
      const subject = replaceTemplateVars(template.subject, testData);
      const body = replaceTemplateVars(template.body, testData);

      const result = await sendEmail(
        recipientEmail,
        `[TEST] ${subject}`,
        body
      );

      results.push({
        templateName,
        success: result.success,
        messageId: result.messageId,
        error: result.error
      });

      console.log(`[Test Emails] ${templateName}: ${result.success ? '✅' : '❌'}`);

      // Pause between emails to avoid throttling
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      results.push({ templateName, success: false, error: error.message });
      console.error(`[Test Emails] ${templateName}: ❌ ${error.message}`);
    }
  }

  const summary = {
    recipient: recipientEmail,
    total: results.length,
    success: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results
  };

  console.log(`[Test Emails] Summary: ${summary.success}/${summary.total} sent successfully`);

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
  getDaysUntilExpiration,
  sendTestEmails
};
