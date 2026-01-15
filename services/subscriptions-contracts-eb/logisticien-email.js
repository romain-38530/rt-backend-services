// Logisticien Email Service - Templates et envoi d'emails SYMPHONI.A
// RT Backend Services - Version 2.5.3 - Anti-Spam Headers

const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const crypto = require('crypto');

// Configuration AWS SES
const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-central-1'
};

const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'ne-pas-repondre@symphonia-controltower.com';
const FROM_NAME = 'SYMPHONI.A';
const REPLY_TO = process.env.SES_SUPPORT_EMAIL || 'support@symphonia-controltower.com';
const PORTAL_URL = process.env.LOGISTICIAN_PORTAL_URL || 'https://logisticien.symphonia-controltower.com';
const INDUSTRIAL_PORTAL_URL = process.env.INDUSTRIAL_PORTAL_URL || 'https://industrie.symphonia-controltower.com';

let sesClient = null;

/**
 * Initialiser le client SES
 */
function initSES() {
  if (!sesClient) {
    try {
      sesClient = new SESClient(SES_CONFIG);
      console.log(`[LogisticianEmail] AWS SES initialized (region: ${SES_CONFIG.region})`);
    } catch (error) {
      console.error('[LogisticianEmail] AWS SES init failed:', error.message);
    }
  }
  return sesClient;
}

/**
 * Générer un Message-ID unique conforme RFC 5322
 */
function generateMessageId() {
  const domain = FROM_EMAIL.split('@')[1] || 'symphonia-controltower.com';
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  return `<${timestamp}.${random}@${domain}>`;
}

/**
 * Envoyer un email via AWS SES avec headers anti-spam
 */
async function sendEmail(to, subject, html) {
  if (!sesClient) {
    initSES();
  }

  if (!sesClient) {
    console.error('[LogisticianEmail] AWS SES not initialized');
    return { success: false, error: 'AWS SES not initialized' };
  }

  try {
    const toAddresses = Array.isArray(to) ? to : [to];
    const domain = FROM_EMAIL.split('@')[1] || 'symphonia-controltower.com';
    const messageId = generateMessageId();

    // Version texte brut pour anti-spam (multipart/alternative)
    const plainText = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    // Construire email MIME avec headers anti-spam
    const boundary = `----=_Part_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const rawEmail = [
      `From: ${FROM_NAME} <${FROM_EMAIL}>`,
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

    console.log(`[LogisticianEmail] Sent to ${to}: ${subject} (${messageId})`);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    console.error(`[LogisticianEmail] Failed to send to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Initialize on load
initSES();

// ============================================
// TEMPLATES COMMUNS
// ============================================

const emailHeader = `
  <div style="background: linear-gradient(135deg, #0d9488 0%, #0891b2 100%); padding: 30px; text-align: center;">
    <h1 style="color: white; margin: 0; font-family: Arial, sans-serif;">SYMPHONI.A</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-family: Arial, sans-serif;">Espace Logisticien</p>
  </div>
`;

const emailFooter = `
  <div style="padding: 20px; background: #f3f4f6; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #6b7280;">
    <p style="margin: 0;">SYMPHONI.A - Control Tower</p>
    <p style="margin: 5px 0;">Cet email a ete envoye automatiquement. Merci de ne pas y repondre directement.</p>
    <p style="margin: 5px 0;">
      <a href="${PORTAL_URL}" style="color: #0d9488;">Acceder a mon espace</a>
    </p>
  </div>
`;

function wrapEmail(content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb;">
      <div style="max-width: 600px; margin: 0 auto; background: white; font-family: Arial, sans-serif;">
        ${emailHeader}
        <div style="padding: 30px;">
          ${content}
        </div>
        ${emailFooter}
      </div>
    </body>
    </html>
  `;
}

function ctaButton(text, url, color = '#0d9488') {
  return `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${url}" style="
        display: inline-block;
        background: ${color};
        color: white;
        padding: 14px 28px;
        text-decoration: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 16px;
      ">${text}</a>
    </div>
  `;
}

function alertBox(type, title, message) {
  const colors = {
    info: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
    warning: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    critical: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
    success: { bg: '#d1fae5', border: '#10b981', text: '#065f46' }
  };
  const c = colors[type] || colors.info;

  return `
    <div style="
      background: ${c.bg};
      border-left: 4px solid ${c.border};
      padding: 15px 20px;
      margin: 20px 0;
      border-radius: 4px;
    ">
      <strong style="color: ${c.text};">${title}</strong>
      <p style="margin: 5px 0 0; color: ${c.text};">${message}</p>
    </div>
  `;
}

// ============================================
// TEMPLATES D'EMAILS
// ============================================

const logisticianEmailTemplates = {

  /**
   * Email d'invitation logisticien
   */
  invitation: async (to, companyName, industrielName, invitationToken, customMessage) => {
    const invitationUrl = `${PORTAL_URL}/onboarding?token=${invitationToken}`;

    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Invitation a rejoindre SYMPHONI.A</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      <p><strong>${industrielName}</strong> vous invite a rejoindre son reseau de logisticiens partenaires sur la plateforme SYMPHONI.A.</p>

      ${customMessage ? `
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; font-style: italic;">
          "${customMessage}"
        </div>
      ` : ''}

      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0d9488; margin-top: 0;">En rejoignant le reseau, vous beneficiez de :</h3>
        <ul style="color: #374151; padding-left: 20px;">
          <li><strong>Acces gratuit</strong> au portail logisticien</li>
          <li>Visibilite sur les commandes de ${industrielName}</li>
          <li>Gestion du planning de vos quais</li>
          <li>Reception et signature des e-CMR</li>
          <li>Suivi de vos documents de conformite ICPE</li>
          <li>Accueil automatise des chauffeurs</li>
        </ul>
      </div>

      ${ctaButton('Accepter l\'invitation', invitationUrl)}

      <p style="color: #6b7280; font-size: 14px;">
        <strong>Note :</strong> Cette invitation expire dans 7 jours.
      </p>

      <p style="color: #6b7280; font-size: 14px;">
        Si vous n'etes pas concerne par cette invitation, vous pouvez ignorer cet email.
      </p>
    `;

    return sendEmail(to, `[SYMPHONI.A] ${industrielName} vous invite a rejoindre son reseau logistique`, wrapEmail(content));
  },

  /**
   * Email de confirmation onboarding
   */
  onboardingSuccess: async (to, companyName) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Bienvenue sur SYMPHONI.A !</h2>

      <p>Felicitations <strong>${companyName}</strong>,</p>

      <p>Votre compte logisticien a ete active avec succes. Vous pouvez maintenant acceder a l'ensemble des fonctionnalites de votre espace.</p>

      ${alertBox('success', 'Compte active', 'Tous vos documents ont ete verifies et valides.')}

      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #0d9488; margin-top: 0;">Vos fonctionnalites disponibles :</h3>
        <ul style="color: #374151; padding-left: 20px;">
          <li><strong>Tableau de bord</strong> - Vue d'ensemble de votre activite</li>
          <li><strong>Commandes</strong> - Suivi des commandes entrantes/sortantes</li>
          <li><strong>Planning quais</strong> - Gestion des creneaux de chargement/dechargement</li>
          <li><strong>e-CMR</strong> - Reception et signature electronique</li>
          <li><strong>Documents</strong> - Gestion de vos documents de conformite</li>
          <li><strong>Declarations ICPE</strong> - Suivi hebdomadaire des volumes</li>
        </ul>
      </div>

      ${ctaButton('Acceder a mon espace', PORTAL_URL)}

      <h3 style="color: #1f2937;">Prochaines etapes recommandees :</h3>
      <ol style="color: #374151; padding-left: 20px;">
        <li>Configurez les horaires d'ouverture de vos quais</li>
        <li>Effectuez votre premiere declaration ICPE hebdomadaire</li>
        <li>Explorez les options premium (Bourse de Stockage, Borne Accueil)</li>
      </ol>
    `;

    return sendEmail(to, '[SYMPHONI.A] Votre compte logisticien est active', wrapEmail(content));
  },

  /**
   * Email alerte document expire bientot (J-30, J-15, J-7)
   */
  vigilanceAlert: async (to, companyName, documentName, daysRemaining, warehouseName, documentType) => {
    const urgency = daysRemaining <= 7 ? 'critical' : daysRemaining <= 15 ? 'warning' : 'info';
    const urgencyLabel = daysRemaining <= 7 ? 'URGENT' : daysRemaining <= 15 ? 'Important' : 'Information';
    const color = daysRemaining <= 7 ? '#ef4444' : daysRemaining <= 15 ? '#f59e0b' : '#3b82f6';

    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Alerte Vigilance - Document</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox(urgency, `${urgencyLabel}: ${documentName}`,
        warehouseName
          ? `Le document "${documentName}" pour l'entrepot "${warehouseName}" expire dans ${daysRemaining} jour(s).`
          : `Le document "${documentName}" expire dans ${daysRemaining} jour(s).`
      )}

      ${daysRemaining <= 7 ? `
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #991b1b; margin: 0;">
            <strong>Attention :</strong> Si ce document n'est pas mis a jour avant son expiration,
            votre compte sera automatiquement bloque et vous ne pourrez plus recevoir de commandes.
          </p>
        </div>
      ` : ''}

      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Type de document :</strong> ${documentName}</p>
        ${warehouseName ? `<p style="margin: 5px 0 0;"><strong>Entrepot :</strong> ${warehouseName}</p>` : ''}
        <p style="margin: 5px 0 0;"><strong>Expire dans :</strong> <span style="color: ${color}; font-weight: bold;">${daysRemaining} jour(s)</span></p>
      </div>

      ${ctaButton('Mettre a jour mon document', `${PORTAL_URL}/documents`, color)}

      <p style="color: #6b7280; font-size: 14px;">
        Pour mettre a jour votre document, connectez-vous a votre espace et rendez-vous dans la section "Documents".
      </p>
    `;

    return sendEmail(to, `[${urgencyLabel}] ${documentName} expire dans ${daysRemaining} jour(s)`, wrapEmail(content));
  },

  /**
   * Email compte bloque
   */
  accountBlocked: async (to, companyName, reason, description) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Compte Bloque</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox('critical', 'Votre compte a ete bloque', description)}

      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Raison du blocage :</strong></p>
        <p style="margin: 5px 0 0; color: #991b1b;">${reason}</p>
      </div>

      <p>Pendant la duree du blocage :</p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Vous ne pouvez plus recevoir de nouvelles commandes</li>
        <li>Les industriels partenaires sont informes de votre statut</li>
        <li>L'acces a certaines fonctionnalites est restreint</li>
      </ul>

      ${ctaButton('Regulariser ma situation', `${PORTAL_URL}/documents`, '#ef4444')}

      <p style="color: #6b7280; font-size: 14px;">
        Pour debloquer votre compte, veuillez mettre a jour les documents requis.
        Votre compte sera automatiquement reactive une fois les documents verifies.
      </p>
    `;

    return sendEmail(to, '[URGENT] Votre compte logisticien a ete bloque', wrapEmail(content));
  },

  /**
   * Email compte debloque
   */
  accountUnblocked: async (to, companyName) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Compte Reactive</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox('success', 'Votre compte a ete reactive', 'Tous vos documents sont maintenant conformes.')}

      <p>Vous pouvez a nouveau :</p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Recevoir des commandes de vos industriels partenaires</li>
        <li>Gerer votre planning de quais</li>
        <li>Acceder a toutes les fonctionnalites de votre espace</li>
      </ul>

      ${ctaButton('Acceder a mon espace', PORTAL_URL, '#10b981')}
    `;

    return sendEmail(to, '[SYMPHONI.A] Votre compte logisticien est reactive', wrapEmail(content));
  },

  /**
   * Email nouvel industriel partenaire
   */
  newIndustrialClient: async (to, companyName, industrielName) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Nouveau Partenaire Industriel</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox('success', 'Nouveau partenariat', `${industrielName} vous a ajoute a son reseau de logisticiens partenaires.`)}

      <p>Vous pouvez maintenant :</p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Recevoir les commandes de ${industrielName}</li>
        <li>Gerer les creneaux de chargement/dechargement</li>
        <li>Signer les e-CMR de leurs expeditions</li>
      </ul>

      ${ctaButton('Voir les commandes', `${PORTAL_URL}/orders`)}
    `;

    return sendEmail(to, `[SYMPHONI.A] ${industrielName} vous a ajoute comme partenaire`, wrapEmail(content));
  },

  /**
   * Email nouvelle commande
   */
  newOrderNotification: async (to, companyName, orderNumber, industrielName, orderType, warehouseName, expectedDate) => {
    const typeLabel = orderType === 'pickup' ? 'Chargement' : 'Livraison';

    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Nouvelle Commande</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      <p>Une nouvelle commande de <strong>${industrielName}</strong> concerne votre entrepot.</p>

      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>N° Commande :</strong> ${orderNumber}</p>
        <p style="margin: 5px 0 0;"><strong>Type :</strong> ${typeLabel}</p>
        <p style="margin: 5px 0 0;"><strong>Entrepot :</strong> ${warehouseName}</p>
        <p style="margin: 5px 0 0;"><strong>Date prevue :</strong> ${expectedDate}</p>
      </div>

      ${ctaButton('Voir la commande', `${PORTAL_URL}/orders/${orderNumber}`)}

      <p style="color: #6b7280; font-size: 14px;">
        Pensez a confirmer votre disponibilite et a preparer le creneau de ${typeLabel.toLowerCase()}.
      </p>
    `;

    return sendEmail(to, `[SYMPHONI.A] Nouvelle commande ${orderNumber} - ${typeLabel}`, wrapEmail(content));
  },

  /**
   * Email rappel declaration ICPE hebdomadaire
   */
  icpeDeclarationReminder: async (to, companyName, weekNumber, year, warehouseName, isCritical = false) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Rappel Declaration ICPE</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox(isCritical ? 'warning' : 'info',
        isCritical ? 'Declaration en retard' : 'Declaration hebdomadaire',
        `La declaration ICPE pour la semaine ${weekNumber}/${year} n'a pas encore ete effectuee pour l'entrepot "${warehouseName}".`
      )}

      <p>La declaration hebdomadaire des volumes ICPE permet :</p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Le suivi en temps reel de vos seuils reglementaires</li>
        <li>La prevention des depassements de seuils</li>
        <li>La tracabilite pour les controles DREAL</li>
      </ul>

      ${ctaButton('Effectuer ma declaration', `${PORTAL_URL}/icpe/declare`, isCritical ? '#f59e0b' : '#0d9488')}

      <p style="color: #6b7280; font-size: 14px;">
        En cas de non-declaration prolongee, vos industriels partenaires seront alertes.
      </p>
    `;

    return sendEmail(to, `[SYMPHONI.A] Rappel declaration ICPE - Semaine ${weekNumber}`, wrapEmail(content));
  },

  /**
   * Email alerte seuil ICPE
   */
  icpeThresholdAlert: async (to, companyName, rubrique, libelle, percentage, warehouseName, isCritical = false) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Alerte Seuil ICPE</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox(isCritical ? 'critical' : 'warning',
        isCritical ? 'Seuil ICPE critique' : 'Seuil ICPE eleve',
        `Le seuil pour la rubrique ${rubrique} (${libelle}) est atteint a ${percentage}% sur l'entrepot "${warehouseName}".`
      )}

      ${isCritical ? `
        <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="color: #991b1b; margin: 0;">
            <strong>Action requise :</strong> Le depassement du seuil ICPE peut entrainer des sanctions administratives
            et une mise a jour de votre declaration aupres de la prefecture est necessaire.
          </p>
        </div>
      ` : ''}

      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Rubrique ICPE :</strong> ${rubrique}</p>
        <p style="margin: 5px 0 0;"><strong>Libelle :</strong> ${libelle}</p>
        <p style="margin: 5px 0 0;"><strong>Entrepot :</strong> ${warehouseName}</p>
        <p style="margin: 5px 0 0;"><strong>Utilisation :</strong> <span style="color: ${isCritical ? '#ef4444' : '#f59e0b'}; font-weight: bold;">${percentage}%</span></p>
      </div>

      <p><strong>Actions recommandees :</strong></p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Verifiez vos volumes stockes actuels</li>
        <li>Envisagez le transfert vers un autre site si possible</li>
        <li>Contactez votre prefecture pour mise a jour ICPE si necessaire</li>
      </ul>

      ${ctaButton('Voir mes seuils ICPE', `${PORTAL_URL}/icpe`, isCritical ? '#ef4444' : '#f59e0b')}
    `;

    return sendEmail(to, `[${isCritical ? 'URGENT' : 'ALERTE'}] Seuil ICPE ${rubrique} a ${percentage}%`, wrapEmail(content));
  },

  /**
   * Email notification pour industriel - seuils logisticien
   */
  industrialICPEAlert: async (to, industrielName, logisticianName, warehouseName, rubrique, percentage, isCritical = false) => {
    const headerIndustrial = `
      <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0; font-family: Arial, sans-serif;">SYMPHONI.A</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-family: Arial, sans-serif;">Espace Industriel</p>
      </div>
    `;

    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Alerte ICPE Logisticien</h2>

      <p>Bonjour <strong>${industrielName}</strong>,</p>

      ${alertBox(isCritical ? 'critical' : 'warning',
        isCritical ? 'Seuil critique chez votre logisticien' : 'Seuil eleve chez votre logisticien',
        `Le logisticien "${logisticianName}" approche de son seuil ICPE sur l'entrepot "${warehouseName}".`
      )}

      <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Logisticien :</strong> ${logisticianName}</p>
        <p style="margin: 5px 0 0;"><strong>Entrepot :</strong> ${warehouseName}</p>
        <p style="margin: 5px 0 0;"><strong>Rubrique ICPE :</strong> ${rubrique}</p>
        <p style="margin: 5px 0 0;"><strong>Utilisation :</strong> <span style="color: ${isCritical ? '#ef4444' : '#f59e0b'}; font-weight: bold;">${percentage}%</span></p>
      </div>

      <p><strong>Impact potentiel :</strong></p>
      <ul style="color: #374151; padding-left: 20px;">
        <li>Capacite de stockage reduite sur ce site</li>
        <li>Possibles retards sur vos expeditions</li>
        <li>Necessite d'envisager des alternatives</li>
      </ul>

      ${ctaButton('Voir le tableau de bord ICPE', `${INDUSTRIAL_PORTAL_URL}/logisticians/icpe-dashboard`, isCritical ? '#ef4444' : '#f59e0b')}
    `;

    const wrappedContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background: white; font-family: Arial, sans-serif;">
          ${headerIndustrial}
          <div style="padding: 30px;">
            ${content}
          </div>
          <div style="padding: 20px; background: #f3f4f6; text-align: center; font-family: Arial, sans-serif; font-size: 12px; color: #6b7280;">
            <p style="margin: 0;">SYMPHONI.A - Control Tower</p>
            <p style="margin: 5px 0;">
              <a href="${INDUSTRIAL_PORTAL_URL}" style="color: #1e40af;">Acceder a mon espace</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    return sendEmail(to, `[ALERTE] Seuil ICPE ${logisticianName} - ${percentage}%`, wrappedContent);
  },

  /**
   * Email option activee
   */
  optionActivated: async (to, companyName, optionName, monthlyPrice) => {
    const content = `
      <h2 style="color: #1f2937; margin-top: 0;">Option Activee</h2>

      <p>Bonjour <strong>${companyName}</strong>,</p>

      ${alertBox('success', 'Nouvelle option activee', `L'option "${optionName}" a ete activee sur votre compte.`)}

      <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Option :</strong> ${optionName}</p>
        <p style="margin: 5px 0 0;"><strong>Tarif :</strong> ${monthlyPrice} EUR/mois</p>
        <p style="margin: 5px 0 0;"><strong>Activation :</strong> Immediate</p>
      </div>

      ${optionName.includes('Bourse') ? `
        <p>Avec la Bourse de Stockage, vous pouvez maintenant :</p>
        <ul style="color: #374151; padding-left: 20px;">
          <li>Publier vos capacites de stockage disponibles</li>
          <li>Repondre aux appels d'offres des industriels</li>
          <li>Beneficier des recommandations IA</li>
        </ul>
      ` : `
        <p>Avec la Borne Accueil Chauffeur, vous pouvez maintenant :</p>
        <ul style="color: #374151; padding-left: 20px;">
          <li>Automatiser l'enregistrement des chauffeurs</li>
          <li>Gerer la file d'attente en temps reel</li>
          <li>Envoyer des SMS automatiques aux chauffeurs</li>
          <li>Afficher les temps d'attente estimes</li>
        </ul>
      `}

      ${ctaButton('Configurer mon option', `${PORTAL_URL}/settings/options`)}
    `;

    return sendEmail(to, `[SYMPHONI.A] Option ${optionName} activee`, wrapEmail(content));
  }

};

/**
 * Creer le service d'email logisticien
 */
function createLogisticianEmailService() {
  return logisticianEmailTemplates;
}

module.exports = {
  sendEmail,
  createLogisticianEmailService,
  logisticianEmailTemplates
};
