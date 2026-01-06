/**
 * AWS SES Email Service - Service unifie d'envoi d'emails
 * SYMPHONI.A - RT Technologie
 *
 * Service centralise utilisant AWS SES pour tous les envois d'emails
 * Remplace Mailgun et Nodemailer/SMTP OVH
 */

const { SESClient, SendEmailCommand, SendRawEmailCommand } = require('@aws-sdk/client-ses');

// Configuration AWS SES
const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-west-1',
  // Credentials auto via IAM role sur EB ou env vars
};

// Emails expediteurs verifies dans SES
const VERIFIED_SENDERS = {
  default: process.env.SES_FROM_EMAIL || 'ne-pas-repondre@symphonia-controltower.com',
  notifications: process.env.SES_NOTIFICATIONS_EMAIL || 'notifications@symphonia-controltower.com',
  facturation: process.env.SES_BILLING_EMAIL || 'facturation@symphonia-controltower.com',
  support: process.env.SES_SUPPORT_EMAIL || 'support@symphonia-controltower.com'
};

// Nom affiche
const SENDER_NAMES = {
  default: 'SYMPHONI.A',
  notifications: 'SYMPHONI.A Notifications',
  facturation: 'SYMPHONI.A Facturation',
  support: 'SYMPHONI.A Support'
};

// URLs des portails
const PORTAL_URLS = {
  logistician: process.env.LOGISTICIAN_PORTAL_URL || 'https://logisticien.symphonia-controltower.com',
  industrial: process.env.INDUSTRIAL_PORTAL_URL || 'https://industrie.symphonia-controltower.com',
  carrier: process.env.CARRIER_PORTAL_URL || 'https://transporteur.symphonia-controltower.com',
  admin: process.env.ADMIN_PORTAL_URL || 'https://admin.symphonia-controltower.com'
};

// Client SES
let sesClient = null;

/**
 * Initialiser le client SES
 */
function initSES() {
  try {
    sesClient = new SESClient(SES_CONFIG);
    console.log(`[AWS-SES] Client initialized (region: ${SES_CONFIG.region})`);
    return true;
  } catch (error) {
    console.error('[AWS-SES] Failed to initialize:', error.message);
    return false;
  }
}

/**
 * Formater l'adresse expediteur
 * @param {string} type - Type d'expediteur (default, notifications, facturation, support)
 * @returns {string} Email formate "Nom <email>"
 */
function formatSender(type = 'default') {
  const email = VERIFIED_SENDERS[type] || VERIFIED_SENDERS.default;
  const name = SENDER_NAMES[type] || SENDER_NAMES.default;
  return `${name} <${email}>`;
}

/**
 * Envoyer un email via AWS SES
 * @param {Object} options - Options d'envoi
 * @returns {Promise<Object>} Resultat
 */
async function sendEmail(options) {
  const {
    to,
    subject,
    html,
    text,
    from,
    senderType = 'default',
    replyTo,
    cc,
    bcc
  } = options;

  if (!sesClient) {
    initSES();
  }

  if (!sesClient) {
    console.error('[AWS-SES] Client not initialized');
    return {
      success: false,
      error: 'AWS SES client not initialized',
      channel: 'email'
    };
  }

  try {
    const toAddresses = Array.isArray(to) ? to : [to];
    const sender = from || formatSender(senderType);

    const params = {
      Source: sender,
      Destination: {
        ToAddresses: toAddresses,
        ...(cc && { CcAddresses: Array.isArray(cc) ? cc : [cc] }),
        ...(bcc && { BccAddresses: Array.isArray(bcc) ? bcc : [bcc] })
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          ...(html && {
            Html: {
              Data: html,
              Charset: 'UTF-8'
            }
          }),
          ...(text && {
            Text: {
              Data: text,
              Charset: 'UTF-8'
            }
          })
        }
      },
      ...(replyTo && { ReplyToAddresses: Array.isArray(replyTo) ? replyTo : [replyTo] })
    };

    const command = new SendEmailCommand(params);
    const result = await sesClient.send(command);

    console.log(`[AWS-SES] Email sent to ${toAddresses.join(', ')}: ${subject} (MessageId: ${result.MessageId})`);

    return {
      success: true,
      messageId: result.MessageId,
      channel: 'email',
      provider: 'aws-ses'
    };

  } catch (error) {
    console.error('[AWS-SES] Send failed:', error.message);

    // Gerer les erreurs specifiques SES
    let errorCode = 'SEND_FAILED';
    if (error.name === 'MessageRejected') {
      errorCode = 'EMAIL_REJECTED';
    } else if (error.name === 'MailFromDomainNotVerifiedException') {
      errorCode = 'DOMAIN_NOT_VERIFIED';
    } else if (error.name === 'ConfigurationSetDoesNotExistException') {
      errorCode = 'CONFIG_ERROR';
    }

    return {
      success: false,
      error: error.message,
      errorCode,
      channel: 'email',
      provider: 'aws-ses'
    };
  }
}

/**
 * Envoyer un email avec template
 * @param {string} to - Destinataire
 * @param {string} templateName - Nom du template
 * @param {Object} data - Donnees pour le template
 * @param {Object} options - Options supplementaires
 * @returns {Promise<Object>}
 */
async function sendTemplatedEmail(to, templateName, data, options = {}) {
  const template = EmailTemplates[templateName];

  if (!template) {
    console.error(`[AWS-SES] Template not found: ${templateName}`);
    return {
      success: false,
      error: `Template not found: ${templateName}`
    };
  }

  const subject = formatTemplate(template.subject, data);
  const html = wrapEmailTemplate(formatTemplate(template.body, data), options.headerColor);
  const text = template.text ? formatTemplate(template.text, data) : null;

  return sendEmail({
    to,
    subject,
    html,
    text,
    senderType: options.senderType || 'notifications',
    ...options
  });
}

/**
 * Formater un template avec les donnees
 * @param {string} template - Template avec placeholders {key}
 * @param {Object} data - Donnees
 * @returns {string}
 */
function formatTemplate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data || {})) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value ?? '');
  }
  return result;
}

/**
 * Wrapper HTML pour les emails
 */
function wrapEmailTemplate(content, headerColor = '#0d9488') {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SYMPHONI.A</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background: white;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${headerColor} 0%, ${adjustColor(headerColor, 20)} 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 600;">SYMPHONI.A</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0; font-size: 14px;">Control Tower - RT Technologie</p>
    </div>

    <!-- Content -->
    <div style="padding: 32px;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="padding: 24px; background: #f3f4f6; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; font-size: 12px; color: #6b7280;">
        SYMPHONI.A - RT Technologie<br>
        Cet email a ete envoye automatiquement, merci de ne pas y repondre.
      </p>
      <div style="margin-top: 16px;">
        <a href="${PORTAL_URLS.logistician}" style="color: #0d9488; text-decoration: none; font-size: 12px; margin: 0 8px;">Espace Logisticien</a>
        <a href="${PORTAL_URLS.industrial}" style="color: #0d9488; text-decoration: none; font-size: 12px; margin: 0 8px;">Espace Industriel</a>
        <a href="${PORTAL_URLS.carrier}" style="color: #0d9488; text-decoration: none; font-size: 12px; margin: 0 8px;">Espace Transporteur</a>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Ajuster la luminosite d'une couleur hex
 */
function adjustColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

/**
 * Creer un bouton CTA
 */
function ctaButton(text, url, color = '#0d9488') {
  return `
    <div style="text-align: center; margin: 32px 0;">
      <a href="${url}" style="
        display: inline-block;
        background: ${color};
        color: white;
        padding: 14px 32px;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 16px;
      ">${text}</a>
    </div>
  `;
}

/**
 * Creer une alerte/notification box
 */
function alertBox(type, title, message) {
  const styles = {
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', icon: 'ℹ️' },
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46', icon: '✅' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
    critical: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', icon: '🚨' }
  };
  const s = styles[type] || styles.info;

  return `
    <div style="background: ${s.bg}; border-left: 4px solid ${s.border}; padding: 16px 20px; margin: 20px 0; border-radius: 4px;">
      <div style="font-weight: 600; color: ${s.text}; margin-bottom: 4px;">${s.icon} ${title}</div>
      <div style="color: ${s.text};">${message}</div>
    </div>
  `;
}

/**
 * Creer une info box
 */
function infoBox(items) {
  const rows = Object.entries(items)
    .map(([key, value]) => `<p style="margin: 4px 0;"><strong>${key}:</strong> ${value}</p>`)
    .join('');

  return `
    <div style="background: #f9fafb; padding: 16px 20px; border-radius: 8px; margin: 20px 0;">
      ${rows}
    </div>
  `;
}

// ============================================
// TEMPLATES D'EMAILS
// ============================================

const EmailTemplates = {

  // === OTP / VERIFICATION ===
  otp_verification: {
    subject: '[SYMPHONI.A] Votre code de verification : {otp}',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Code de verification</h2>
      <p>Bonjour,</p>
      <p>Votre code de verification SYMPHONI.A est :</p>
      <div style="background: #f0fdfa; border: 2px solid #0d9488; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #0d9488;">{otp}</span>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Ce code expire dans <strong>{expiryMinutes} minutes</strong>.</p>
      <p style="color: #6b7280; font-size: 14px;">Si vous n'avez pas demande ce code, ignorez cet email.</p>
    `,
    text: 'Votre code SYMPHONI.A: {otp} - Expire dans {expiryMinutes} minutes.'
  },

  // === INVITATIONS ===
  logisticien_invitation: {
    subject: '[SYMPHONI.A] {industrielName} vous invite a rejoindre son reseau',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Invitation a rejoindre SYMPHONI.A</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      <p><strong>{industrielName}</strong> vous invite a rejoindre son reseau de logisticiens partenaires sur SYMPHONI.A.</p>
      {customMessageBlock}
      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0d9488; margin-top: 0;">Avantages du reseau :</h3>
        <ul style="color: #374151; padding-left: 20px;">
          <li><strong>Acces gratuit</strong> au portail logisticien</li>
          <li>Gestion du planning de vos quais</li>
          <li>Reception et signature des e-CMR</li>
          <li>Suivi documents de conformite ICPE</li>
        </ul>
      </div>
      ${ctaButton("Accepter l'invitation", '{invitationUrl}')}
      <p style="color: #6b7280; font-size: 14px;"><strong>Note :</strong> Cette invitation expire dans 7 jours.</p>
    `
  },

  carrier_invitation: {
    subject: '[SYMPHONI.A] Invitation a rejoindre le reseau transport',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Invitation Transporteur</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      <p><strong>{industrielName}</strong> souhaite vous referencer comme transporteur partenaire.</p>
      ${ctaButton('Completer mon inscription', '{invitationUrl}')}
    `
  },

  // === ONBOARDING ===
  onboarding_success: {
    subject: '[SYMPHONI.A] Votre compte est active !',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Bienvenue sur SYMPHONI.A !</h2>
      <p>Felicitations <strong>{companyName}</strong>,</p>
      ${alertBox('success', 'Compte active', 'Votre compte a ete verifie et active avec succes.')}
      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0d9488; margin-top: 0;">Vos fonctionnalites :</h3>
        <ul style="color: #374151; padding-left: 20px;">
          <li><strong>Tableau de bord</strong> - Vue d'ensemble</li>
          <li><strong>Commandes</strong> - Suivi en temps reel</li>
          <li><strong>Documents</strong> - Gestion conformite</li>
          <li><strong>e-CMR</strong> - Signature electronique</li>
        </ul>
      </div>
      ${ctaButton('Acceder a mon espace', '{portalUrl}')}
    `
  },

  // === ALERTES VIGILANCE ===
  vigilance_alert: {
    subject: '[{urgencyLabel}] {documentName} expire dans {daysRemaining} jour(s)',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Alerte Document</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('{alertType}', '{urgencyLabel}: {documentName}', 'Le document expire dans {daysRemaining} jour(s){warehouseInfo}.')}
      {blockingWarning}
      ${infoBox({ 'Document': '{documentName}', 'Entrepot': '{warehouseName}', 'Expiration': '{daysRemaining} jour(s)' })}
      ${ctaButton('Mettre a jour', '{updateUrl}', '{buttonColor}')}
    `
  },

  // === COMPTE BLOQUE/DEBLOQUE ===
  account_blocked: {
    subject: '[URGENT] Votre compte SYMPHONI.A a ete bloque',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Compte Bloque</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('critical', 'Compte bloque', '{description}')}
      ${infoBox({ 'Raison': '{reason}' })}
      <p><strong>Consequences :</strong></p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Impossibilite de recevoir des commandes</li>
        <li>Acces restreint aux fonctionnalites</li>
        <li>Industriels partenaires informes</li>
      </ul>
      ${ctaButton('Regulariser ma situation', '{regularizeUrl}', '#ef4444')}
    `
  },

  account_unblocked: {
    subject: '[SYMPHONI.A] Votre compte est reactive',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Compte Reactive</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('success', 'Compte reactive', 'Tous vos documents sont maintenant conformes.')}
      ${ctaButton('Acceder a mon espace', '{portalUrl}', '#10b981')}
    `
  },

  // === COMMANDES ===
  new_order: {
    subject: '[SYMPHONI.A] Nouvelle commande {orderNumber}',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Nouvelle Commande</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      <p>Une nouvelle commande de <strong>{industrielName}</strong> est disponible.</p>
      ${infoBox({ 'N° Commande': '{orderNumber}', 'Type': '{orderType}', 'Entrepot': '{warehouseName}', 'Date prevue': '{expectedDate}' })}
      ${ctaButton('Voir la commande', '{orderUrl}')}
    `
  },

  order_delivered: {
    subject: '[SYMPHONI.A] Commande {orderNumber} livree',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Livraison Confirmee</h2>
      <p>Bonjour,</p>
      ${alertBox('success', 'Livraison effectuee', 'La commande {orderNumber} a ete livree avec succes.')}
      ${infoBox({ 'Commande': '{orderNumber}', 'Livree a': '{deliveryAddress}', 'Date/Heure': '{deliveryTime}' })}
      <p>La preuve de livraison est disponible dans votre espace.</p>
      ${ctaButton('Voir les details', '{orderUrl}')}
    `
  },

  delay_warning: {
    subject: '[ALERTE] Retard detecte - Commande {orderNumber}',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Retard Detecte</h2>
      ${alertBox('warning', 'Retard estime: {delayMinutes} min', 'La commande {orderNumber} a un retard detecte.')}
      ${infoBox({ 'Commande': '{orderNumber}', 'Retard': '{delayMinutes} minutes', 'Type': '{delayType}' })}
      ${ctaButton('Suivre en temps reel', '{trackingUrl}', '#f59e0b')}
    `
  },

  delay_critical: {
    subject: '[URGENT] Retard CRITIQUE - Commande {orderNumber}',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Retard Critique</h2>
      ${alertBox('critical', 'RETARD CRITIQUE: {delayMinutes} min', 'Action immediate requise sur la commande {orderNumber}!')}
      ${infoBox({ 'Commande': '{orderNumber}', 'Retard': '{delayMinutes} minutes' })}
      ${ctaButton('Action requise', '{orderUrl}', '#ef4444')}
    `
  },

  // === ICPE ===
  icpe_declaration_reminder: {
    subject: '[SYMPHONI.A] Rappel declaration ICPE - Semaine {weekNumber}',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Rappel Declaration ICPE</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('{alertType}', '{alertTitle}', 'Declaration semaine {weekNumber}/{year} non effectuee pour "{warehouseName}".')}
      ${ctaButton('Effectuer ma declaration', '{declareUrl}', '{buttonColor}')}
    `
  },

  icpe_threshold_alert: {
    subject: '[{alertLabel}] Seuil ICPE {rubrique} a {percentage}%',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Alerte Seuil ICPE</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('{alertType}', 'Seuil {alertLabel}', 'Rubrique {rubrique} ({libelle}) a {percentage}% sur "{warehouseName}".')}
      ${infoBox({ 'Rubrique': '{rubrique}', 'Libelle': '{libelle}', 'Entrepot': '{warehouseName}', 'Utilisation': '{percentage}%' })}
      {criticalWarning}
      ${ctaButton('Voir mes seuils ICPE', '{icpeUrl}', '{buttonColor}')}
    `
  },

  // === OPTIONS/ABONNEMENTS ===
  option_activated: {
    subject: '[SYMPHONI.A] Option {optionName} activee',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Option Activee</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('success', 'Option activee', 'L\'option "{optionName}" est maintenant active.')}
      ${infoBox({ 'Option': '{optionName}', 'Tarif': '{monthlyPrice} EUR/mois', 'Activation': 'Immediate' })}
      {optionFeatures}
      ${ctaButton('Configurer mon option', '{settingsUrl}')}
    `
  },

  // === PARTENARIATS ===
  new_industrial_client: {
    subject: '[SYMPHONI.A] {industrielName} vous a ajoute comme partenaire',
    body: `
      <h2 style="color: #1f2937; margin-top: 0;">Nouveau Partenaire</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      ${alertBox('success', 'Nouveau partenariat', '{industrielName} vous a ajoute a son reseau.')}
      <p>Vous pouvez maintenant :</p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Recevoir les commandes de {industrielName}</li>
        <li>Gerer les creneaux de chargement/dechargement</li>
        <li>Signer les e-CMR</li>
      </ul>
      ${ctaButton('Voir les commandes', '{ordersUrl}')}
    `
  }
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Creer le service email AWS SES
 * @returns {Object} Service
 */
function createAWSSESEmailService() {
  // Initialiser le client au demarrage
  initSES();

  return {
    // Envoi generique
    sendEmail,
    sendTemplatedEmail,

    // Helpers
    formatTemplate,
    wrapEmailTemplate,
    ctaButton,
    alertBox,
    infoBox,

    // Templates disponibles
    templates: EmailTemplates,

    // Config
    portalUrls: PORTAL_URLS,
    senders: VERIFIED_SENDERS,

    // Status
    getStatus: () => ({
      provider: 'AWS SES',
      region: SES_CONFIG.region,
      initialized: !!sesClient,
      senders: VERIFIED_SENDERS
    })
  };
}

// ============================================
// CLASSE POUR COMPATIBILITE
// ============================================

/**
 * Classe EmailVerificationService compatible avec l'ancien code
 */
class EmailVerificationService {
  constructor(db) {
    this.db = db;
    this.collection = db.collection('email_verifications');
    this.emailService = createAWSSESEmailService();

    // Config OTP
    this.config = {
      length: 6,
      expiryMinutes: 15,
      maxAttempts: 3,
      cooldownSeconds: 60
    };
  }

  /**
   * Generer un OTP
   */
  generateOTP() {
    const crypto = require('crypto');
    const buffer = crypto.randomBytes(4);
    const num = buffer.readUInt32BE(0);
    return (num % 1000000).toString().padStart(6, '0');
  }

  /**
   * Envoyer un OTP
   */
  async sendOTP(email, purpose = 'registration') {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();

    // Verifier cooldown
    const recent = await this.collection.findOne({
      email: normalizedEmail,
      createdAt: { $gte: new Date(now.getTime() - this.config.cooldownSeconds * 1000) }
    });

    if (recent) {
      const waitSeconds = Math.ceil(
        (recent.createdAt.getTime() + this.config.cooldownSeconds * 1000 - now.getTime()) / 1000
      );
      return {
        success: false,
        error: `Veuillez patienter ${waitSeconds} secondes`,
        cooldownRemaining: waitSeconds
      };
    }

    // Generer OTP
    const otp = this.generateOTP();
    const bcrypt = require('bcryptjs');
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(now.getTime() + this.config.expiryMinutes * 60 * 1000);

    // Invalider anciens OTP
    await this.collection.updateMany(
      { email: normalizedEmail, verified: false },
      { $set: { invalidated: true } }
    );

    // Creer nouveau record
    await this.collection.insertOne({
      email: normalizedEmail,
      otpHash,
      purpose,
      attempts: 0,
      expiresAt,
      verified: false,
      invalidated: false,
      createdAt: now
    });

    // Envoyer email
    const result = await this.emailService.sendTemplatedEmail(normalizedEmail, 'otp_verification', {
      otp,
      expiryMinutes: this.config.expiryMinutes
    });

    if (!result.success) {
      console.error('[EmailVerificationService] Failed to send OTP email:', result.error);
    }

    return {
      success: true,
      email: normalizedEmail,
      expiresIn: this.config.expiryMinutes * 60
    };
  }

  /**
   * Verifier un OTP
   */
  async verifyOTP(email, otp) {
    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();
    const bcrypt = require('bcryptjs');

    const verification = await this.collection.findOne({
      email: normalizedEmail,
      verified: false,
      invalidated: { $ne: true },
      expiresAt: { $gt: now }
    }, { sort: { createdAt: -1 } });

    if (!verification) {
      return {
        success: false,
        error: 'Code expire ou invalide'
      };
    }

    if (verification.attempts >= this.config.maxAttempts) {
      return {
        success: false,
        error: 'Nombre maximum de tentatives atteint'
      };
    }

    const isValid = await bcrypt.compare(otp.trim(), verification.otpHash);

    if (!isValid) {
      await this.collection.updateOne(
        { _id: verification._id },
        { $inc: { attempts: 1 } }
      );
      const remaining = this.config.maxAttempts - verification.attempts - 1;
      return {
        success: false,
        error: remaining > 0 ? `Code incorrect. ${remaining} tentative(s) restante(s).` : 'Code incorrect',
        attemptsRemaining: remaining
      };
    }

    await this.collection.updateOne(
      { _id: verification._id },
      { $set: { verified: true, verifiedAt: now } }
    );

    return {
      success: true,
      email: normalizedEmail
    };
  }
}

// ============================================
// TEMPLATES PLANNING (import depuis planning-notification-service)
// ============================================

const PlanningEmailTemplates = {
  'rdv.requested': {
    subject: 'Demande de RDV #{rdvNumber} - {siteName}',
    body: `
      <h2 style="color: #2563eb;">Nouvelle demande de RDV</h2>
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Site': '{siteName}', 'Date': '{slotDate}', 'Creneau': '{slotTime}', 'Transporteur': '{carrierName}', 'Type': '{flowType}' })}
      <p>Veuillez confirmer ou proposer un creneau alternatif.</p>
    `
  },
  'rdv.proposed': {
    subject: 'Proposition de creneau alternatif - RDV #{rdvNumber}',
    body: `
      <h2 style="color: #f59e0b;">Creneau alternatif propose</h2>
      <p>Le site <strong>{siteName}</strong> vous propose un nouveau creneau:</p>
      ${alertBox('warning', 'Nouvelle proposition', 'Date: {newSlotDate} - Creneau: {newSlotTime}')}
      <p><strong>Raison:</strong> {reason}</p>
    `
  },
  'rdv.confirmed': {
    subject: 'RDV Confirme #{rdvNumber} - {siteName}',
    body: `
      <h2 style="color: #10b981;">RDV Confirme</h2>
      ${alertBox('success', 'RDV valide', 'Votre RDV est confirme.')}
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Site': '{siteName}', 'Adresse': '{siteAddress}', 'Date': '{slotDate}', 'Creneau': '{slotTime}', 'Quai': '{dockName}' })}
      <h3>Instructions d\'arrivee:</h3>
      <p>{arrivalInstructions}</p>
    `
  },
  'rdv.refused': {
    subject: 'RDV Refuse #{rdvNumber}',
    body: `
      <h2 style="color: #ef4444;">RDV Refuse</h2>
      ${alertBox('critical', 'Demande refusee', 'Votre demande de RDV a ete refusee.')}
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Site': '{siteName}', 'Raison': '{reason}' })}
      <p>Vous pouvez soumettre une nouvelle demande avec un creneau different.</p>
    `
  },
  'rdv.rescheduled': {
    subject: 'RDV Replanifie #{rdvNumber}',
    body: `
      <h2 style="color: #8b5cf6;">RDV Replanifie</h2>
      <p>Votre RDV a ete deplace vers un nouveau creneau.</p>
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Nouvelle date': '{newSlotDate}', 'Nouveau creneau': '{newSlotTime}', 'Raison': '{reason}' })}
    `
  },
  'rdv.cancelled': {
    subject: 'RDV Annule #{rdvNumber}',
    body: `
      <h2 style="color: #6b7280;">RDV Annule</h2>
      ${alertBox('warning', 'Annulation', 'Le RDV suivant a ete annule.')}
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Site': '{siteName}', 'Raison': '{reason}' })}
    `
  },
  'rdv.reminder': {
    subject: 'Rappel RDV #{rdvNumber} - Demain {slotTime}',
    body: `
      <h2 style="color: #2563eb;">Rappel de votre RDV</h2>
      ${alertBox('info', 'Rappel', 'Votre RDV est prevu pour demain.')}
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Site': '{siteName}', 'Date': '{slotDate}', 'Creneau': '{slotTime}', 'Quai': '{dockName}' })}
    `
  },
  'driver.called': {
    subject: 'Votre tour - RDV #{rdvNumber} - Quai {dockId}',
    body: `
      <h2 style="color: #10b981;">C'est votre tour!</h2>
      <div style="background: #d1fae5; padding: 24px; border-radius: 12px; text-align: center; margin: 24px 0;">
        <p style="font-size: 20px; margin: 0;">Rendez-vous au</p>
        <p style="font-size: 48px; font-weight: bold; color: #059669; margin: 12px 0;">{dockName}</p>
      </div>
      <p>Votre vehicule est attendu au quai <strong>{dockId}</strong>.</p>
    `
  },
  'driver.no_show': {
    subject: 'Absence detectee - RDV #{rdvNumber}',
    body: `
      <h2 style="color: #ef4444;">Absence constatee</h2>
      ${alertBox('critical', 'No-Show', 'Le chauffeur ne s\'est pas presente au RDV.')}
      ${infoBox({ 'N° RDV': '{rdvNumber}', 'Transporteur': '{carrierName}', 'Penalite scoring': '{scorePenalty} points' })}
    `
  },
  'tracking.delay_detected': {
    subject: 'Retard detecte - RDV #{rdvNumber}',
    body: `
      <h2 style="color: #f59e0b;">Retard Detecte</h2>
      ${alertBox('warning', 'Retard estime: {delayMinutes} min', 'Un retard a ete detecte pour le RDV {rdvNumber}.')}
      <p>Un nouveau creneau vous sera propose si necessaire.</p>
    `
  }
};

// ============================================
// TEMPLATES TRACKING
// ============================================

const TrackingEmailTemplates = {
  tracking_link: {
    subject: '[RT Transport] Lien de suivi - Commande {orderReference}',
    body: `
      <h2 style="color: #1f2937;">Lien de suivi de commande</h2>
      <p>Bonjour,</p>
      <p>Voici le lien pour suivre votre position en temps reel:</p>
      ${ctaButton('Activer le suivi GPS', '{trackingUrl}', '#2563eb')}
      ${infoBox({ 'Commande': '{orderReference}', 'Chargement': '{pickupAddress}', 'Livraison': '{deliveryAddress}' })}
      <p style="color: #6b7280; font-size: 14px;">Ce lien expire dans 24 heures. Cliquez dessus pour partager votre position GPS.</p>
    `
  },
  position_update: {
    subject: '[RT Transport] Mise a jour position - {orderReference}',
    body: `
      <h2 style="color: #1f2937;">Position mise a jour</h2>
      ${infoBox({ 'Commande': '{orderReference}', 'Position': '{currentAddress}', 'ETA': '{eta}' })}
    `
  }
};

// ============================================
// TEMPLATES STRIPE/FACTURATION
// ============================================

const BillingEmailTemplates = {
  invoice_created: {
    subject: '[SYMPHONI.A] Facture {invoiceNumber}',
    body: `
      <h2 style="color: #1f2937;">Nouvelle Facture</h2>
      <p>Bonjour <strong>{companyName}</strong>,</p>
      <p>Votre facture est disponible:</p>
      ${infoBox({ 'N° Facture': '{invoiceNumber}', 'Date': '{invoiceDate}', 'Montant HT': '{amountHT} EUR', 'TVA (20%)': '{tva} EUR', 'Montant TTC': '{amountTTC} EUR' })}
      ${ctaButton('Voir ma facture', '{invoiceUrl}')}
    `,
    senderType: 'facturation'
  },
  payment_success: {
    subject: '[SYMPHONI.A] Paiement confirme - {invoiceNumber}',
    body: `
      <h2 style="color: #1f2937;">Paiement Confirme</h2>
      ${alertBox('success', 'Paiement recu', 'Votre paiement a ete traite avec succes.')}
      ${infoBox({ 'Facture': '{invoiceNumber}', 'Montant': '{amountTTC} EUR', 'Date': '{paymentDate}' })}
    `,
    senderType: 'facturation'
  },
  payment_failed: {
    subject: '[URGENT] Echec de paiement - {invoiceNumber}',
    body: `
      <h2 style="color: #1f2937;">Echec de Paiement</h2>
      ${alertBox('critical', 'Paiement refuse', 'Votre paiement n\'a pas pu etre traite.')}
      ${infoBox({ 'Facture': '{invoiceNumber}', 'Montant': '{amountTTC} EUR', 'Raison': '{failureReason}' })}
      ${ctaButton('Mettre a jour ma carte', '{updatePaymentUrl}', '#ef4444')}
    `,
    senderType: 'facturation'
  },
  subscription_created: {
    subject: '[SYMPHONI.A] Bienvenue! Abonnement {planName} active',
    body: `
      <h2 style="color: #1f2937;">Abonnement Active</h2>
      ${alertBox('success', 'Bienvenue sur SYMPHONI.A!', 'Votre abonnement {planName} est maintenant actif.')}
      ${infoBox({ 'Formule': '{planName}', 'Tarif': '{monthlyPrice} EUR/mois', 'Prochaine facture': '{nextBillingDate}' })}
      ${ctaButton('Acceder a mon espace', '{portalUrl}')}
    `,
    senderType: 'default'
  },
  subscription_cancelled: {
    subject: '[SYMPHONI.A] Confirmation resiliation abonnement',
    body: `
      <h2 style="color: #1f2937;">Abonnement Resilie</h2>
      ${alertBox('warning', 'Resiliation confirmee', 'Votre abonnement sera actif jusqu\'au {endDate}.')}
      <p>Nous sommes tristes de vous voir partir. N'hesitez pas a revenir!</p>
    `,
    senderType: 'default'
  }
};

// Merger tous les templates
Object.assign(EmailTemplates, PlanningEmailTemplates, TrackingEmailTemplates, BillingEmailTemplates);

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Service principal
  createAWSSESEmailService,

  // Fonctions d'envoi
  sendEmail,
  sendTemplatedEmail,

  // Helpers templates
  formatTemplate,
  wrapEmailTemplate,
  ctaButton,
  alertBox,
  infoBox,

  // Templates
  EmailTemplates,
  PlanningEmailTemplates,
  TrackingEmailTemplates,
  BillingEmailTemplates,

  // Classes compatibilite
  EmailVerificationService,

  // Config
  PORTAL_URLS,
  VERIFIED_SENDERS,

  // Init
  initSES
};
