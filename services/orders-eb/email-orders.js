// Module d'envoi d'emails pour les commandes - SYMPHONI.A Orders
// Notifications pour auto-dispatch, acceptation, refus, timeout, etc.

const nodemailer = require('nodemailer');

// Configuration SMTP OVH
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
};

// Transporteur nodemailer
let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
      console.warn('⚠️  Configuration SMTP incomplète - emails désactivés');
      return null;
    }
    transporter = nodemailer.createTransport(SMTP_CONFIG);
    console.log('✓ Transporteur SMTP OVH configuré pour Orders');
  }
  return transporter;
}

/**
 * Envoyer un email via SMTP
 */
async function sendEmail({ to, subject, html, text }) {
  const transport = getTransporter();

  if (!transport) {
    console.log('📧 Email non envoyé (SMTP non configuré):', { to, subject });
    return { success: false, error: 'SMTP not configured' };
  }

  const defaultFrom = process.env.SMTP_FROM || SMTP_CONFIG.auth.user;

  try {
    const info = await transport.sendMail({
      from: `"SYMPHONI.A Orders" <${defaultFrom}>`,
      to,
      subject,
      text: text || '',
      html: html || text
    });

    console.log('✓ Email envoyé:', info.messageId, 'à:', to);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('✗ Erreur envoi email:', error.message);
    return { success: false, error: error.message };
  }
}

// Template de base pour les emails
const baseTemplate = (content, title, color = '#667eea') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${color}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .info-box { background: white; border-left: 4px solid ${color}; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .button { display: inline-block; background: ${color}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    .order-ref { font-family: monospace; background: #e5e7eb; padding: 4px 8px; border-radius: 4px; }
    .highlight { background: #fef3c7; padding: 2px 6px; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .label { color: #6b7280; font-size: 13px; }
    .value { font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">${title}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
      <p>© 2024 RT SYMPHONI.A - Control Tower</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Email au transporteur - Nouvelle affectation de commande
 */
async function sendDispatchNotificationToCarrier(carrierEmail, carrierName, order, timeoutMinutes = 45) {
  const frontendUrl = process.env.TRANSPORTER_FRONTEND_URL || 'https://transporter.symphonia.com';

  const content = `
    <h2>Bonjour ${carrierName},</h2>

    <p>Une nouvelle commande vous a été affectée via SYMPHONI.A. Vous avez <strong class="highlight">${timeoutMinutes} minutes</strong> pour accepter ou refuser cette mission.</p>

    <div class="info-box">
      <h3 style="margin-top: 0;">📦 Commande <span class="order-ref">${order.reference}</span></h3>
      <table>
        <tr>
          <td class="label">Enlèvement</td>
          <td class="value">${order.pickupAddress?.city || '-'} - ${order.dates?.pickupDate ? new Date(order.dates.pickupDate).toLocaleDateString('fr-FR') : '-'}</td>
        </tr>
        <tr>
          <td class="label">Livraison</td>
          <td class="value">${order.deliveryAddress?.city || '-'} - ${order.dates?.deliveryDate ? new Date(order.dates.deliveryDate).toLocaleDateString('fr-FR') : '-'}</td>
        </tr>
        <tr>
          <td class="label">Marchandise</td>
          <td class="value">${order.goods?.weight || '-'} kg ${order.goods?.palettes ? `- ${order.goods.palettes} palettes` : ''}</td>
        </tr>
        <tr>
          <td class="label">Prix estimé</td>
          <td class="value" style="color: #059669; font-size: 18px;">${order.estimatedPrice ? `${order.estimatedPrice.toFixed(2)} €` : '-'}</td>
        </tr>
      </table>
    </div>

    <p style="text-align: center;">
      <a href="${frontendUrl}/mes-affectations" class="button">
        Voir et Répondre à l'affectation
      </a>
    </p>

    <p style="color: #ef4444; font-weight: bold;">⏰ Attention : Sans réponse dans ${timeoutMinutes} minutes, la commande sera automatiquement proposée au transporteur suivant.</p>
  `;

  return sendEmail({
    to: carrierEmail,
    subject: `🚛 Nouvelle affectation - Commande ${order.reference} (${order.pickupAddress?.city} → ${order.deliveryAddress?.city})`,
    html: baseTemplate(content, '🚛 Nouvelle Affectation', '#3b82f6')
  });
}

/**
 * Email au client industriel - Transporteur a accepté
 */
async function sendCarrierAcceptedToIndustrial(industrialEmail, industrialName, order, carrier) {
  const frontendUrl = process.env.INDUSTRIAL_FRONTEND_URL || 'https://industry.symphonia.com';

  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>Excellente nouvelle ! Un transporteur a accepté votre commande.</p>

    <div class="info-box" style="border-color: #10b981;">
      <h3 style="margin-top: 0; color: #10b981;">✅ Commande Acceptée</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <table>
        <tr>
          <td class="label">Transporteur</td>
          <td class="value">${carrier.name || carrier.carrierName}</td>
        </tr>
        <tr>
          <td class="label">Trajet</td>
          <td class="value">${order.pickupAddress?.city || '-'} → ${order.deliveryAddress?.city || '-'}</td>
        </tr>
        <tr>
          <td class="label">Date enlèvement</td>
          <td class="value">${order.dates?.pickupDate ? new Date(order.dates.pickupDate).toLocaleDateString('fr-FR') : '-'}</td>
        </tr>
        <tr>
          <td class="label">Date livraison</td>
          <td class="value">${order.dates?.deliveryDate ? new Date(order.dates.deliveryDate).toLocaleDateString('fr-FR') : '-'}</td>
        </tr>
        <tr>
          <td class="label">Prix</td>
          <td class="value" style="color: #059669; font-size: 18px;">${order.estimatedPrice ? `${order.estimatedPrice.toFixed(2)} €` : '-'}</td>
        </tr>
      </table>
    </div>

    <p>Le transporteur va prendre en charge votre expédition. Vous pouvez suivre l'avancement de la commande depuis votre tableau de bord.</p>

    <p style="text-align: center;">
      <a href="${frontendUrl}/orders/${order._id || order.id}" class="button" style="background: #10b981;">
        Voir la commande
      </a>
    </p>
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `✅ Commande ${order.reference} acceptée par ${carrier.name || carrier.carrierName}`,
    html: baseTemplate(content, '✅ Commande Acceptée', '#10b981')
  });
}

/**
 * Email au client industriel - Transporteur a refusé
 */
async function sendCarrierRefusedToIndustrial(industrialEmail, industrialName, order, carrier, reason, nextCarrierName = null) {
  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>Un transporteur a décliné votre commande.</p>

    <div class="info-box" style="border-color: #f59e0b;">
      <h3 style="margin-top: 0; color: #f59e0b;">⚠️ Refus de commande</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <table>
        <tr>
          <td class="label">Transporteur</td>
          <td class="value">${carrier.name || carrier.carrierName}</td>
        </tr>
        <tr>
          <td class="label">Raison</td>
          <td class="value">${reason || 'Non spécifiée'}</td>
        </tr>
      </table>
    </div>

    ${nextCarrierName ? `
    <div class="info-box" style="border-color: #3b82f6;">
      <p style="margin: 0;"><strong>🔄 La commande est automatiquement proposée au transporteur suivant :</strong> ${nextCarrierName}</p>
    </div>
    ` : `
    <p>Notre système recherche automatiquement un autre transporteur pour votre commande. Vous serez notifié dès qu'un transporteur acceptera.</p>
    `}
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `⚠️ Commande ${order.reference} - Transporteur a décliné`,
    html: baseTemplate(content, '⚠️ Transporteur Indisponible', '#f59e0b')
  });
}

/**
 * Email au client industriel - Timeout d'un transporteur
 */
async function sendTimeoutNotificationToIndustrial(industrialEmail, industrialName, order, timedOutCarrier, nextCarrierName = null) {
  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>Le transporteur sollicité n'a pas répondu dans le délai imparti.</p>

    <div class="info-box" style="border-color: #6b7280;">
      <h3 style="margin-top: 0;">⏰ Délai de réponse expiré</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <table>
        <tr>
          <td class="label">Transporteur</td>
          <td class="value">${timedOutCarrier.name || timedOutCarrier.carrierName}</td>
        </tr>
      </table>
    </div>

    ${nextCarrierName ? `
    <div class="info-box" style="border-color: #3b82f6;">
      <p style="margin: 0;"><strong>🔄 La commande est automatiquement proposée au transporteur suivant :</strong> ${nextCarrierName}</p>
    </div>
    ` : `
    <p>Notre système recherche automatiquement un autre transporteur pour votre commande.</p>
    `}
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `⏰ Commande ${order.reference} - Pas de réponse du transporteur`,
    html: baseTemplate(content, '⏰ Délai Expiré', '#6b7280')
  });
}

/**
 * Email au client industriel - Escalade vers Affret IA
 */
async function sendAffretIAEscalationToIndustrial(industrialEmail, industrialName, order) {
  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>Tous les transporteurs de votre chaîne d'affectation ont décliné ou n'ont pas répondu. Votre commande est maintenant prise en charge par <strong>Affret IA</strong>.</p>

    <div class="info-box" style="border-color: #ec4899;">
      <h3 style="margin-top: 0; color: #ec4899;">🧠 Escalade vers Affret IA</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <p style="margin-bottom: 0;">Affret IA va rechercher un transporteur qualifié dans notre réseau étendu de partenaires.</p>
    </div>

    <p><strong>Qu'est-ce que Affret IA ?</strong></p>
    <ul>
      <li>🤖 Intelligence artificielle de mise en relation</li>
      <li>📊 Accès à un réseau élargi de transporteurs</li>
      <li>⚡ Recherche optimisée et rapide</li>
    </ul>

    <p>Vous serez notifié dès qu'un transporteur sera trouvé.</p>
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `🧠 Commande ${order.reference} - Prise en charge par Affret IA`,
    html: baseTemplate(content, '🧠 Affret IA Activé', '#ec4899')
  });
}

/**
 * Email au client industriel - Échec de planification
 */
async function sendPlanificationFailedToIndustrial(industrialEmail, industrialName, order, reason) {
  const frontendUrl = process.env.INDUSTRIAL_FRONTEND_URL || 'https://industry.symphonia.com';

  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>Nous sommes désolés, la planification automatique de votre commande n'a pas abouti.</p>

    <div class="info-box" style="border-color: #dc2626;">
      <h3 style="margin-top: 0; color: #dc2626;">❌ Échec de planification</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <p><strong>Raison :</strong> ${reason || 'Aucun transporteur disponible'}</p>
    </div>

    <p><strong>Actions possibles :</strong></p>
    <ul>
      <li>Modifier les dates de la commande pour plus de flexibilité</li>
      <li>Contacter notre équipe support pour une assistance personnalisée</li>
      <li>Relancer une planification manuelle</li>
    </ul>

    <p style="text-align: center;">
      <a href="${frontendUrl}/orders/${order._id || order.id}" class="button" style="background: #dc2626;">
        Gérer la commande
      </a>
    </p>
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `❌ Commande ${order.reference} - Échec de planification`,
    html: baseTemplate(content, '❌ Planification Échouée', '#dc2626')
  });
}

/**
 * Email de lancement du dispatch automatique au client industriel
 */
async function sendAutoDispatchStartedToIndustrial(industrialEmail, industrialName, order, carriers) {
  const content = `
    <h2>Bonjour ${industrialName},</h2>

    <p>La planification automatique de votre commande a démarré.</p>

    <div class="info-box" style="border-color: #8b5cf6;">
      <h3 style="margin-top: 0; color: #8b5cf6;">🤖 Planification en cours</h3>
      <p><strong>Référence :</strong> <span class="order-ref">${order.reference}</span></p>
      <p><strong>Transporteurs sollicités :</strong> ${carriers.length}</p>
      <table>
        <tr>
          <td class="label">Trajet</td>
          <td class="value">${order.pickupAddress?.city || '-'} → ${order.deliveryAddress?.city || '-'}</td>
        </tr>
        <tr>
          <td class="label">Date enlèvement</td>
          <td class="value">${order.dates?.pickupDate ? new Date(order.dates.pickupDate).toLocaleDateString('fr-FR') : '-'}</td>
        </tr>
      </table>
    </div>

    <p>Les transporteurs sont contactés dans l'ordre suivant :</p>
    <ol>
      ${carriers.slice(0, 3).map((c, i) => `<li>${c.carrierName || c.name || 'Transporteur ' + (i+1)}</li>`).join('')}
      ${carriers.length > 3 ? `<li>... et ${carriers.length - 3} autres</li>` : ''}
    </ol>

    <p>Vous serez notifié dès qu'un transporteur acceptera la commande.</p>
  `;

  return sendEmail({
    to: industrialEmail,
    subject: `🤖 Commande ${order.reference} - Planification automatique lancée`,
    html: baseTemplate(content, '🤖 Planification Lancée', '#8b5cf6')
  });
}

module.exports = {
  sendEmail,
  sendDispatchNotificationToCarrier,
  sendCarrierAcceptedToIndustrial,
  sendCarrierRefusedToIndustrial,
  sendTimeoutNotificationToIndustrial,
  sendAffretIAEscalationToIndustrial,
  sendPlanificationFailedToIndustrial,
  sendAutoDispatchStartedToIndustrial
};
