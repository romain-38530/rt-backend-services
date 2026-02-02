// Module d'envoi d'emails via OVH SMTP
// Configuration pour SYMPHONI.A

const nodemailer = require('nodemailer');

// Import CloudWatch metrics
const { CloudWatchMetrics } = require('../../infra/monitoring/cloudwatch-metrics');
let metricsEmail = null;

// Initialize metrics
try {
  metricsEmail = new CloudWatchMetrics({ namespace: 'SYMPHONIA', enabled: true });
  console.log('[METRICS] CloudWatch metrics initialized for emails');
} catch (error) {
  console.warn('[METRICS] Failed to initialize CloudWatch:', error.message);
}

// Référence à la base de données pour le logging
let db = null;

/**
 * Configurer la référence DB pour le logging des emails
 */
function setDb(database) {
  db = database;
}

/**
 * Logger un email envoyé dans la collection email_logs
 */
async function logEmail(emailData) {
  if (!db) {
    console.warn('[EMAIL LOG] Database not configured, skipping logging');
    return;
  }

  try {
    const { logEmailSent, EMAIL_TYPES } = require('./routes/email-metrics');
    await logEmailSent(db, emailData);
  } catch (error) {
    console.error('[EMAIL LOG] Error logging email:', error.message);
  }
}

// Configuration SMTP OVH
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true pour port 465, false pour autres ports
  auth: {
    user: process.env.SMTP_USER, // Adresse email complète (ex: noreply@symphonia.com)
    pass: process.env.SMTP_PASSWORD // Mot de passe du compte email OVH
  }
};

// Créer le transporteur nodemailer
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
      console.warn('⚠️  Configuration SMTP incomplète - emails désactivés');
      return null;
    }

    transporter = nodemailer.createTransport(SMTP_CONFIG);
    console.log('✓ Transporteur SMTP OVH configuré');
  }
  return transporter;
}

/**
 * Envoyer un email via OVH SMTP
 */
async function sendEmail({ to, subject, html, text, from }) {
  const transport = getTransporter();

  if (!transport) {
    console.log('📧 Email non envoyé (SMTP non configuré):', { to, subject });
    return { success: false, error: 'SMTP not configured' };
  }

  const defaultFrom = process.env.SMTP_FROM || SMTP_CONFIG.auth.user;

  try {
    const info = await transport.sendMail({
      from: from || `"SYMPHONI.A" <${defaultFrom}>`,
      to,
      subject,
      text: text || '', // Fallback texte brut
      html: html || text // HTML ou texte
    });

    console.log('✓ Email envoyé:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('✗ Erreur envoi email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Wrapper sendEmail avec logging automatique dans email_logs
 */
async function sendEmailWithLogging({ to, subject, html, text, from, type, carrierId, metadata }) {
  const startTime = Date.now();

  // Envoyer l'email
  const result = await sendEmail({ to, subject, html, text, from });

  const duration = Date.now() - startTime;

  // Logger le résultat dans email_logs
  await logEmail({
    emailId: result.messageId || null,
    type: type || 'notification',
    to,
    subject,
    carrierId: carrierId || null,
    success: result.success,
    error: result.error || null,
    metadata: metadata || {}
  });

  // Send CloudWatch metrics
  if (metricsEmail) {
    metricsEmail.incrementCounter(result.success ? 'Email-Sent-Success' : 'Email-Sent-Failure', {
      Type: type || 'notification'
    }).catch(err => console.error('Failed to send email metrics:', err));

    metricsEmail.recordDuration('Email-Send-Duration', duration, {
      Type: type || 'notification',
      Status: result.success ? 'Success' : 'Failed'
    }).catch(err => console.error('Failed to send duration metrics:', err));
  }

  return result;
}

/**
 * Email d'invitation transporteur (Niveau 2 → Guest)
 */
async function sendCarrierInvitationEmail(carrierEmail, carrierName, invitedBy) {
  const subject = '🚚 Invitation SYMPHONI.A - Rejoignez notre réseau de transporteurs';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚚 SYMPHONI.A</h1>
          <p>Plateforme de référencement des transporteurs</p>
        </div>
        <div class="content">
          <h2>Bonjour ${carrierName},</h2>

          <p>Vous avez été invité à rejoindre le réseau SYMPHONI.A par <strong>${invitedBy}</strong>.</p>

          <p>SYMPHONI.A est une plateforme qui connecte les industriels avec les meilleurs transporteurs. En rejoignant notre réseau, vous bénéficierez de :</p>

          <ul>
            <li>✅ Accès à des missions de transport qualifiées</li>
            <li>📊 Un système de scoring transparent</li>
            <li>💼 Des opportunités d'affaires régulières</li>
            <li>🌟 La possibilité de rejoindre le réseau Premium</li>
          </ul>

          <p><strong>Prochaines étapes :</strong></p>
          <ol>
            <li>Complétez votre profil</li>
            <li>Uploadez vos documents de vigilance (Kbis, URSSAF, Assurance, Licence)</li>
            <li>Passez au statut "Référencé" (Niveau 1)</li>
          </ol>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://symphonia.com'}/onboarding?email=${encodeURIComponent(carrierEmail)}" class="button">
              Compléter mon inscription
            </a>
          </div>

          <p>À très bientôt sur SYMPHONI.A !</p>
        </div>
        <div class="footer">
          <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
          <p>Si vous avez des questions, contactez-nous à support@symphonia.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: carrierEmail,
    subject,
    html,
    type: 'invitation',
    metadata: {
      carrierName,
      invitedBy
    }
  });
}

/**
 * Email d'onboarding réussi (Niveau 1 - Référencé)
 */
async function sendOnboardingSuccessEmail(carrierEmail, carrierName, score) {
  const subject = '🎉 Félicitations - Vous êtes maintenant Référencé sur SYMPHONI.A';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .score-box { background: white; border: 2px solid #10b981; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0; }
        .score { font-size: 48px; font-weight: bold; color: #10b981; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Félicitations !</h1>
          <p>Vous êtes maintenant Référencé</p>
        </div>
        <div class="content">
          <h2>Bonjour ${carrierName},</h2>

          <p>Excellente nouvelle ! Vous avez complété votre onboarding et vous êtes désormais un <strong>transporteur Référencé (Niveau 1)</strong> sur SYMPHONI.A.</p>

          <div class="score-box">
            <p>Votre score actuel</p>
            <div class="score">${score}</div>
            <p>points</p>
          </div>

          <p><strong>Vous pouvez maintenant :</strong></p>
          <ul>
            <li>✅ Recevoir des affectations de transport</li>
            <li>📊 Consulter votre tableau de bord</li>
            <li>💼 Uploader votre grille tarifaire</li>
            <li>🌟 Viser le statut Premium (Niveau 1+)</li>
          </ul>

          <p><strong>Pour augmenter votre score :</strong></p>
          <ul>
            <li>Uploadez votre grille tarifaire (+30 points)</li>
            <li>Soyez ajouté à une chaîne d'affectation (+50 points)</li>
            <li>Maintenez vos documents à jour</li>
          </ul>

          <p>Bienvenue dans le réseau SYMPHONI.A !</p>
        </div>
        <div class="footer">
          <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: carrierEmail,
    subject,
    html,
    type: 'onboarding',
    metadata: {
      carrierName,
      score
    }
  });
}

/**
 * Email d'alerte de vigilance (J-30, J-15, J-7)
 */
async function sendVigilanceAlertEmail(carrierEmail, carrierName, documentType, daysUntilExpiry, expiryDate) {
  const urgency = daysUntilExpiry <= 7 ? 'URGENT' : daysUntilExpiry <= 15 ? 'Important' : 'Rappel';
  const color = daysUntilExpiry <= 7 ? '#ef4444' : daysUntilExpiry <= 15 ? '#f59e0b' : '#3b82f6';

  const documentLabels = {
    kbis: 'Kbis',
    urssaf: 'Attestation URSSAF',
    insurance: 'Assurance Transport',
    license: 'Licence de Transport',
    rib: 'RIB',
    id_card: 'Pièce d\'identité'
  };

  const subject = `${urgency} - Document expirant dans ${daysUntilExpiry} jours`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${color}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert-box { background: white; border-left: 4px solid ${color}; padding: 20px; margin: 20px 0; }
        .button { display: inline-block; background: ${color}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Alerte de Vigilance</h1>
          <p>${urgency}</p>
        </div>
        <div class="content">
          <h2>Bonjour ${carrierName},</h2>

          <div class="alert-box">
            <h3>Document expirant bientôt</h3>
            <p><strong>Type de document :</strong> ${documentLabels[documentType] || documentType}</p>
            <p><strong>Date d'expiration :</strong> ${new Date(expiryDate).toLocaleDateString('fr-FR')}</p>
            <p><strong>Jours restants :</strong> ${daysUntilExpiry} jours</p>
          </div>

          ${daysUntilExpiry <= 7 ? `
            <p style="color: #ef4444; font-weight: bold;">
              ⚠️ ATTENTION : Votre compte sera automatiquement bloqué si le document n'est pas renouvelé avant la date d'expiration.
            </p>
          ` : ''}

          <p><strong>Action requise :</strong></p>
          <ol>
            <li>Préparez le nouveau document</li>
            <li>Connectez-vous à votre espace SYMPHONI.A</li>
            <li>Uploadez le document à jour</li>
          </ol>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://symphonia.com'}/documents" class="button">
              Mettre à jour mon document
            </a>
          </div>

          <p>N'attendez pas le dernier moment pour renouveler vos documents !</p>
        </div>
        <div class="footer">
          <p>Cet email a été envoyé automatiquement par le système de vigilance SYMPHONI.A</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: carrierEmail,
    subject,
    html,
    type: 'vigilance_alert',
    metadata: {
      carrierName,
      documentType,
      daysUntilExpiry,
      expiryDate: expiryDate.toISOString()
    }
  });
}

/**
 * Email de blocage automatique (Document expiré)
 */
async function sendCarrierBlockedEmail(carrierEmail, carrierName, reason) {
  const subject = '🚫 COMPTE BLOQUÉ - Document expiré';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ef4444; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert-box { background: #fef2f2; border: 2px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 10px; }
        .button { display: inline-block; background: #ef4444; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚫 Compte Bloqué</h1>
          <p>Document de vigilance expiré</p>
        </div>
        <div class="content">
          <h2>Bonjour ${carrierName},</h2>

          <div class="alert-box">
            <h3>Votre compte a été automatiquement bloqué</h3>
            <p><strong>Raison :</strong> ${reason}</p>
          </div>

          <p>En raison de l'expiration d'un document de vigilance obligatoire, votre compte a été automatiquement suspendu.</p>

          <p><strong>Conséquences :</strong></p>
          <ul>
            <li>❌ Vous ne pouvez plus recevoir d'affectations</li>
            <li>📉 Votre score a été pénalisé (-100 points)</li>
            <li>⏸️ Votre compte est en attente de régularisation</li>
          </ul>

          <p><strong>Pour débloquer votre compte :</strong></p>
          <ol>
            <li>Renouvelez le document expiré</li>
            <li>Uploadez-le sur votre espace SYMPHONI.A</li>
            <li>Attendez la vérification par nos équipes</li>
          </ol>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://symphonia.com'}/documents" class="button">
              Régulariser ma situation
            </a>
          </div>

          <p>Notre équipe reste à votre disposition pour toute question.</p>
        </div>
        <div class="footer">
          <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
          <p>Contact : support@symphonia.com</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: carrierEmail,
    subject,
    html,
    type: 'blocked',
    metadata: {
      carrierName,
      reason
    }
  });
}

/**
 * Email de déblocage (Régularisation)
 */
async function sendCarrierUnblockedEmail(carrierEmail, carrierName) {
  const subject = '✅ COMPTE DÉBLOQUÉ - Bienvenue de retour !';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Compte Débloqué</h1>
          <p>Votre situation a été régularisée</p>
        </div>
        <div class="content">
          <h2>Bonjour ${carrierName},</h2>

          <p>Excellente nouvelle ! Vos documents ont été vérifiés et votre compte SYMPHONI.A a été débloqué.</p>

          <p><strong>Vous pouvez à nouveau :</strong></p>
          <ul>
            <li>✅ Recevoir des affectations de transport</li>
            <li>📊 Consulter votre tableau de bord</li>
            <li>💼 Accepter des missions</li>
            <li>📈 Augmenter votre score</li>
          </ul>

          <p>Veillez à maintenir vos documents à jour pour éviter un nouveau blocage. Vous recevrez des alertes automatiques 30, 15 et 7 jours avant chaque expiration.</p>

          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://symphonia.com'}/dashboard" class="button">
              Accéder à mon tableau de bord
            </a>
          </div>

          <p>Merci de votre confiance et bienvenue de retour sur SYMPHONI.A !</p>
        </div>
        <div class="footer">
          <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: carrierEmail,
    subject,
    html,
    type: 'notification',
    metadata: {
      carrierName,
      action: 'unblocked'
    }
  });
}

/**
 * Tester la connexion SMTP
 */
async function testSMTPConnection() {
  const transport = getTransporter();

  if (!transport) {
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    await transport.verify();
    console.log('✓ Connexion SMTP OVH réussie');
    return { success: true };
  } catch (error) {
    console.error('✗ Erreur connexion SMTP:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Email de confirmation d'inscription client (Onboarding initial)
 * @param {string} clientEmail - Email du client
 * @param {string} companyName - Nom de l'entreprise
 * @param {string} requestId - ID de la demande MongoDB
 * @param {Object} options - Options supplémentaires
 * @param {string} options.paymentMethod - Méthode de paiement ('card', 'sepa', 'invoice')
 * @param {string} options.subscriptionType - Type d'abonnement
 */
async function sendClientOnboardingConfirmationEmail(clientEmail, companyName, requestId, options = {}) {
  const { paymentMethod } = options;
  const frontendUrl = process.env.FRONTEND_URL || 'https://main.df8cnylp3pqka.amplifyapp.com';

  // Lien de finalisation de paiement
  const paymentLink = `${frontendUrl}/finalize-payment?requestId=${requestId}&email=${encodeURIComponent(clientEmail)}`;

  // Section conditionnelle pour le paiement par carte
  const cardPaymentSection = paymentMethod === 'card' ? `
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center;">
            <h3 style="color: white; margin: 0 0 15px 0;">💳 Finalisez votre inscription</h3>
            <p style="color: #dbeafe; margin: 0 0 20px 0; font-size: 14px;">
              Pour activer immédiatement votre compte, veuillez enregistrer vos coordonnées bancaires de manière sécurisée.
            </p>
            <a href="${paymentLink}" style="display: inline-block; background: white; color: #1d4ed8; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Enregistrer ma carte bancaire
            </a>
            <p style="color: #93c5fd; margin: 15px 0 0 0; font-size: 12px;">
              🔒 Paiement 100% sécurisé via Stripe
            </p>
          </div>
  ` : '';

  // Section pour SEPA
  const sepaPaymentSection = paymentMethod === 'sepa' ? `
          <div style="background: #f0fdf4; border: 1px solid #86efac; padding: 20px; border-radius: 10px; margin: 25px 0;">
            <h3 style="color: #166534; margin: 0 0 10px 0;">🏦 Paiement par prélèvement SEPA</h3>
            <p style="color: #15803d; margin: 0; font-size: 14px;">
              Vous recevrez un email séparé avec le mandat SEPA à signer électroniquement.
            </p>
          </div>
  ` : '';

  // Section pour facture
  const invoicePaymentSection = paymentMethod === 'invoice' ? `
          <div style="background: #fefce8; border: 1px solid #fde047; padding: 20px; border-radius: 10px; margin: 25px 0;">
            <h3 style="color: #854d0e; margin: 0 0 10px 0;">📄 Paiement sur facture</h3>
            <p style="color: #a16207; margin: 0; font-size: 14px;">
              Votre première facture vous sera envoyée après activation de votre compte. Délai de paiement : 30 jours.
            </p>
          </div>
  ` : '';

  const subject = paymentMethod === 'card'
    ? '💳 SYMPHONI.A - Finalisez votre inscription (Action requise)'
    : '✅ Inscription SYMPHONI.A - Votre compte est en cours de création';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f97316 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .logo { max-width: 200px; margin-bottom: 15px; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .info-box { background: #fff7ed; border: 1px solid #fed7aa; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        .steps { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .step { display: flex; align-items: center; margin: 15px 0; }
        .step-number { background: #f97316; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 15px; flex-shrink: 0; }
        .id-box { background: #f3f4f6; border: 1px solid #d1d5db; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <!-- Logo SYMPHONI.A -->
          <div style="margin-bottom: 15px;">
            <svg width="180" height="40" viewBox="0 0 180 40" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#fde68a;stop-opacity:1" />
                </linearGradient>
              </defs>
              <text x="0" y="30" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="bold" fill="url(#logoGrad)">SYMPHONI.A</text>
            </svg>
          </div>
          <p style="font-size: 14px; margin: 0; opacity: 0.9;">Control Tower - Gestion Transport Intelligente</p>
        </div>
        <div class="content">
          <h2 style="color: #1f2937; margin-top: 0;">Merci pour votre inscription !</h2>

          <p>Bonjour,</p>
          <p>Nous avons bien reçu votre demande d'inscription pour <strong>${companyName}</strong>.</p>

          ${cardPaymentSection}
          ${sepaPaymentSection}
          ${invoicePaymentSection}

          <div class="info-box">
            <strong>📋 ${paymentMethod === 'card' ? 'Étapes restantes' : 'Prochaines étapes'} :</strong>
            <div class="steps" style="background: transparent; padding: 10px 0; margin: 10px 0 0 0;">
              ${paymentMethod === 'card' ? `
              <div class="step">
                <div class="step-number" style="background: #3b82f6;">1</div>
                <div><strong>Enregistrez votre carte bancaire</strong> (lien ci-dessus)</div>
              </div>
              <div class="step">
                <div class="step-number">2</div>
                <div>Activation immédiate de votre compte</div>
              </div>
              <div class="step">
                <div class="step-number">3</div>
                <div>Réception de vos identifiants par email</div>
              </div>
              ` : `
              <div class="step">
                <div class="step-number">1</div>
                <div>Notre équipe va examiner votre dossier</div>
              </div>
              <div class="step">
                <div class="step-number">2</div>
                <div>Nous vérifierons les informations fournies</div>
              </div>
              <div class="step">
                <div class="step-number">3</div>
                <div>Vous recevrez vos identifiants de connexion par email</div>
              </div>
              <div class="step">
                <div class="step-number">4</div>
                <div>Vous pourrez alors accéder à la plateforme</div>
              </div>
              `}
            </div>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            Le délai de traitement est généralement de <strong>24 à 48 heures ouvrées</strong>.
          </p>

          <div class="id-box">
            <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 12px;">Référence de votre demande :</p>
            <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: bold; font-family: monospace;">${requestId}</p>
          </div>

          <p style="color: #6b7280; font-size: 14px;">
            Si vous avez des questions, n'hésitez pas à nous contacter.
          </p>
        </div>
        <div class="footer">
          <p style="margin: 0;">© 2024 SYMPHONI.A - Control Tower</p>
          <p style="margin: 5px 0 0 0;">Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
          <p style="margin: 10px 0 0 0;">
            <a href="${frontendUrl}" style="color: #f97316; text-decoration: none;">symphonia-controltower.com</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmailWithLogging({
    to: clientEmail,
    subject,
    html,
    type: 'onboarding',
    metadata: {
      companyName,
      requestId,
      paymentMethod: options.paymentMethod,
      subscriptionType: options.subscriptionType
    }
  });
}

module.exports = {
  sendEmail,
  sendEmailWithLogging,
  setDb,
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendClientOnboardingConfirmationEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail,
  testSMTPConnection
};
