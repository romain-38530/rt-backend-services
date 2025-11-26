// Module d'envoi d'emails via OVH SMTP
// Configuration pour SYMPHONI.A

const nodemailer = require('nodemailer');

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

  return sendEmail({
    to: carrierEmail,
    subject,
    html
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

  return sendEmail({
    to: carrierEmail,
    subject,
    html
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

  return sendEmail({
    to: carrierEmail,
    subject,
    html
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

  return sendEmail({
    to: carrierEmail,
    subject,
    html
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

  return sendEmail({
    to: carrierEmail,
    subject,
    html
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

module.exports = {
  sendEmail,
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail,
  testSMTPConnection
};
