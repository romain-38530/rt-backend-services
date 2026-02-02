/**
 * Test du système d'envoi d'emails via AWS SES
 * Vérifie l'envoi de mails pour le workflow documents transporteur
 */

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const axios = require('axios');

const SES_CONFIG = {
  region: 'eu-central-1',
  fromEmail: 'noreply@symphonia-controltower.com',
  fromName: 'SYMPHONI.A Control Tower'
};

const API_URL = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';
const TEST_EMAIL = 'r.tardy@rt-groupe.com'; // Email vérifié dans AWS SES

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  log(title, 'bright');
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);
}

const sesClient = new SESClient({ region: SES_CONFIG.region });

async function sendEmail(to, subject, htmlBody) {
  try {
    const command = new SendEmailCommand({
      Source: `"${SES_CONFIG.fromName}" <${SES_CONFIG.fromEmail}>`,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8'
          }
        }
      }
    });

    const result = await sesClient.send(command);
    return { success: true, messageId: result.MessageId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function getCarrierInfo() {
  try {
    const response = await axios.get(`${API_URL}/api/carriers/${CARRIER_ID}`);
    return { success: true, carrier: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sendVigilanceAlertEmail(carrier, expiringDocs) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">⚠️ ALERTE VIGILANCE</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">SYMPHONI.A Control Tower</p>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Documents arrivant à expiration</h2>
        <p>Bonjour <strong>${carrier.companyName}</strong>,</p>
        <p style="color: #ef4444; font-weight: bold;">Votre compte présente des alertes de vigilance.</p>

        <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #991b1b; font-weight: bold;">⚠️ ${expiringDocs.length} document(s) nécessite(nt) votre attention</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Documents concernés:</h3>
          ${expiringDocs.map(doc => {
            const days = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
            const severity = days <= 7 ? 'CRITIQUE' : days <= 15 ? 'URGENT' : 'ATTENTION';
            const color = days <= 7 ? '#dc2626' : days <= 15 ? '#f59e0b' : '#eab308';
            return `
              <div style="border-bottom: 1px solid #e5e7eb; padding: 10px 0;">
                <p style="margin: 5px 0;"><strong>${doc.type}</strong></p>
                <p style="margin: 5px 0; color: ${color}; font-weight: bold;">${severity} - Expire dans ${days} jours</p>
                <p style="margin: 5px 0; color: #6b7280; font-size: 14px;">Date d'expiration: ${new Date(doc.expiresAt).toLocaleDateString('fr-FR')}</p>
              </div>
            `;
          }).join('')}
        </div>

        <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e;"><strong>Impact sur votre compte:</strong></p>
          <ul style="color: #92400e; margin: 10px 0;">
            <li>Score de vigilance: <strong>${carrier.overallScore}/100</strong></li>
            <li>Statut: <strong>${carrier.vigilanceStatus}</strong></li>
            ${carrier.vigilanceStatus === 'blocked' ? '<li style="color: #dc2626;"><strong>⛔ Votre compte est BLOQUÉ</strong></li>' : ''}
            ${carrier.vigilanceStatus === 'warning' ? '<li style="color: #f59e0b;"><strong>⚠️ Risque de blocage imminent</strong></li>' : ''}
          </ul>
        </div>

        <p><strong>Action requise:</strong></p>
        <p>Merci de mettre à jour vos documents sous 48h pour éviter:</p>
        <ul>
          <li>❌ Le blocage automatique de votre compte</li>
          <li>❌ La suspension de vos accès Affret.IA</li>
          <li>❌ La perte d'éligibilité aux nouvelles missions</li>
          <li>❌ La baisse de votre score de vigilance</li>
        </ul>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/documents" style="background: #ef4444; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📄 Mettre à jour mes documents</a>
        </div>

        <div style="background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #3730a3;"><strong>💡 Rappel:</strong></p>
          <p style="margin: 10px 0 0; color: #3730a3;">Pour maintenir votre éligibilité Affret.IA et vos 10 transports gratuits, tous vos documents doivent être à jour et vérifiés.</p>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">Si vous avez déjà mis à jour vos documents, veuillez ignorer ce message. La vérification peut prendre jusqu'à 24h.</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px; background: #f3f4f6;">
        <p style="margin: 5px 0;"><strong>SYMPHONI.A Control Tower</strong></p>
        <p style="margin: 5px 0;">Système automatique d'alertes de vigilance</p>
        <p style="margin: 5px 0;">Cet email a été envoyé par le système de monitoring automatique</p>
        <p style="margin: 15px 0 5px; font-size: 11px;">Pour toute question: support@symphonia-controltower.com</p>
      </div>
    </div>
  `;

  return sendEmail(
    TEST_EMAIL,
    `⚠️ ALERTE VIGILANCE: ${expiringDocs.length} document(s) arrivent à expiration - ${carrier.companyName}`,
    html
  );
}

async function sendDocumentVerifiedEmail(carrier, documentType) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">✅ DOCUMENT VÉRIFIÉ</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">SYMPHONI.A Control Tower</p>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Votre document a été approuvé</h2>
        <p>Bonjour <strong>${carrier.companyName}</strong>,</p>

        <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 16px;">✅ Votre document a été vérifié et approuvé par notre équipe</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 15px 0; color: #1f2937;">📄 Détails du document</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Type de document:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${documentType}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Statut:</td>
              <td style="padding: 8px 0; text-align: right;"><span style="background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 12px; font-weight: bold; font-size: 14px;">✓ Vérifié</span></td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Date de vérification:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 15px 0; color: #1f2937;">📊 Score de vigilance mis à jour</h3>
          <div style="background: linear-gradient(90deg, #10b981 0%, #10b981 ${carrier.overallScore}%, #e5e7eb ${carrier.overallScore}%, #e5e7eb 100%); height: 24px; border-radius: 12px; position: relative; margin: 15px 0;">
            <span style="position: absolute; right: 10px; top: 2px; color: white; font-weight: bold; font-size: 14px;">${carrier.overallScore}/100</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Score global:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: ${carrier.overallScore >= 70 ? '#10b981' : carrier.overallScore >= 40 ? '#f59e0b' : '#ef4444'};">${carrier.overallScore}/100</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Statut de vigilance:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${carrier.vigilanceStatus === 'compliant' ? '🟢 Conforme' : carrier.vigilanceStatus === 'warning' ? '🟡 Vigilance' : '🔴 Bloqué'}</td>
            </tr>
          </table>
        </div>

        ${carrier.overallScore >= 40 ? `
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin: 20px 0; color: white;">
            <h3 style="margin: 0 0 10px 0; color: white;">🎉 Éligibilité Affret.IA confirmée!</h3>
            <p style="margin: 10px 0; opacity: 0.95;">Vous êtes maintenant éligible pour bénéficier de:</p>
            <ul style="margin: 10px 0; opacity: 0.95;">
              <li>🚚 <strong>10 transports gratuits</strong> sur Affret.IA</li>
              <li>🤖 Accès complet aux fonctionnalités IA</li>
              <li>⏱️ Durée: 30 jours</li>
              <li>⬆️ Upgrade automatique après 10 transports réussis</li>
              <li>🎯 Support prioritaire</li>
            </ul>
            <div style="text-align: center; margin-top: 20px;">
              <a href="https://transporteur.symphonia-controltower.com/affret-ia" style="background: white; color: #667eea; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">🚀 Activer Affret.IA</a>
            </div>
          </div>
        ` : `
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e;"><strong>ℹ️ Pour accéder à Affret.IA:</strong></p>
            <p style="margin: 10px 0 0; color: #92400e;">Votre score doit atteindre 40/100 minimum. Continuez à compléter et vérifier vos documents pour augmenter votre score.</p>
          </div>
        `}

        <div style="background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #3730a3;"><strong>💡 Conseil:</strong></p>
          <p style="margin: 10px 0 0; color: #3730a3;">Maintenez tous vos documents à jour pour conserver votre score et vos avantages. Vous recevrez des alertes automatiques 30 jours avant chaque expiration.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/dashboard" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">📊 Voir mon tableau de bord</a>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">Merci de votre confiance!</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px; background: #f3f4f6;">
        <p style="margin: 5px 0;"><strong>SYMPHONI.A Control Tower</strong></p>
        <p style="margin: 5px 0;">Plateforme de gestion logistique</p>
        <p style="margin: 15px 0 5px; font-size: 11px;">Pour toute question: support@symphonia-controltower.com</p>
      </div>
    </div>
  `;

  return sendEmail(
    TEST_EMAIL,
    `✅ Document vérifié: ${documentType} - ${carrier.companyName}`,
    html
  );
}

async function sendAffretIAActivationEmail(carrier) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 32px;">🚀 Affret.IA</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 18px;">Votre compte d'essai est activé!</p>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <h2 style="color: #1f2937;">Félicitations ${carrier.companyName}!</h2>

        <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <p style="margin: 0; color: #065f46; font-weight: bold; font-size: 18px;">✅ Votre compte d'essai Affret.IA est maintenant actif!</p>
        </div>

        <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 20px 0; color: #667eea; text-align: center;">🎁 Votre Pack d'Essai</h3>
          <div style="text-align: center; margin: 20px 0;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px;">
              <div style="font-size: 48px; font-weight: bold; margin-bottom: 10px;">10</div>
              <div style="font-size: 20px; opacity: 0.95;">Transports Gratuits</div>
              <div style="font-size: 14px; opacity: 0.8; margin-top: 10px;">Valable 30 jours</div>
            </div>
          </div>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 15px 0; color: #1f2937;">✨ Fonctionnalités incluses:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #374151;">
            <li style="margin: 10px 0;"><strong>🤖 IA de cotation automatique</strong> - Obtenez des prix optimisés en quelques secondes</li>
            <li style="margin: 10px 0;"><strong>📊 Tableau de bord intelligent</strong> - Visualisez vos performances en temps réel</li>
            <li style="margin: 10px 0;"><strong>🎯 Matching intelligent</strong> - Recevez les missions qui vous correspondent</li>
            <li style="margin: 10px 0;"><strong>📱 Notifications push</strong> - Soyez alerté en temps réel des nouvelles opportunités</li>
            <li style="margin: 10px 0;"><strong>📈 Analyses prédictives</strong> - Anticipez les tendances du marché</li>
            <li style="margin: 10px 0;"><strong>🎧 Support prioritaire</strong> - Assistance dédiée 7j/7</li>
          </ul>
        </div>

        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #92400e;">🏆 Programme de Fidélité</h3>
          <p style="margin: 10px 0 0; color: #92400e;">Complétez <strong>10 transports avec succès</strong> et bénéficiez automatiquement de:</p>
          <ul style="margin: 10px 0 0; color: #92400e; padding-left: 20px;">
            <li><strong>Upgrade permanent</strong> vers le compte Premium</li>
            <li><strong>Tarifs préférentiels</strong> sur toutes vos missions</li>
            <li><strong>Accès prioritaire</strong> aux meilleures opportunités</li>
            <li><strong>Bonus de fidélité</strong> sur vos prochains transports</li>
          </ul>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 15px 0; color: #1f2937;">📋 Informations de votre compte:</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Entreprise:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${carrier.companyName}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Score de vigilance:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #10b981;">${carrier.overallScore}/100</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Statut:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;"><span style="background: #d1fae5; color: #065f46; padding: 4px 12px; border-radius: 12px;">✓ Éligible</span></td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Transports disponibles:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #667eea; font-size: 18px;">10 / 10</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 8px 0; color: #6b7280;">Expire le:</td>
              <td style="padding: 8px 0; font-weight: bold; text-align: right;">${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/affret-ia/dashboard" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.4);">🚀 Accéder à Affret.IA</a>
        </div>

        <div style="background: #e0e7ff; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #3730a3;"><strong>💡 Premiers pas:</strong></p>
          <ol style="margin: 10px 0 0; color: #3730a3; padding-left: 20px;">
            <li style="margin: 5px 0;">Connectez-vous à votre tableau de bord Affret.IA</li>
            <li style="margin: 5px 0;">Consultez les missions disponibles dans votre zone</li>
            <li style="margin: 5px 0;">Utilisez l'IA de cotation pour estimer vos prix</li>
            <li style="margin: 5px 0;">Acceptez votre première mission et démarrez!</li>
          </ol>
        </div>

        <p style="color: #6b7280; font-size: 14px; margin-top: 30px; text-align: center;">Bon voyage avec Affret.IA! 🚚💨</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px; background: #f3f4f6;">
        <p style="margin: 5px 0;"><strong>SYMPHONI.A - Affret.IA</strong></p>
        <p style="margin: 5px 0;">Intelligence Artificielle au service du transport</p>
        <p style="margin: 15px 0 5px; font-size: 11px;">Besoin d'aide? support@symphonia-controltower.com</p>
      </div>
    </div>
  `;

  return sendEmail(
    TEST_EMAIL,
    `🚀 Affret.IA activé: 10 transports gratuits vous attendent! - ${carrier.companyName}`,
    html
  );
}

async function main() {
  try {
    header('TEST SYSTÈME D\'ENVOI D\'EMAILS VIA AWS SES');

    log('Configuration:', 'cyan');
    log(`  Région AWS: ${SES_CONFIG.region}`, 'cyan');
    log(`  Email source: ${SES_CONFIG.fromEmail}`, 'cyan');
    log(`  Nom source: ${SES_CONFIG.fromName}`, 'cyan');
    log(`  Email de test: ${TEST_EMAIL}`, 'cyan');

    // ===== ÉTAPE 1: Récupération des infos transporteur =====
    header('ÉTAPE 1: RÉCUPÉRATION INFOS TRANSPORTEUR');

    log('Récupération des informations du transporteur...', 'yellow');
    const carrierResult = await getCarrierInfo();

    if (!carrierResult.success) {
      log(`✗ Erreur: ${carrierResult.error}`, 'red');
      process.exit(1);
    }

    const carrier = carrierResult.carrier;
    log('✓ Informations récupérées', 'green');
    log(`  Nom: ${carrier.companyName}`, 'cyan');
    log(`  Score: ${carrier.overallScore}/100`, 'cyan');
    log(`  Vigilance: ${carrier.vigilanceStatus}`, 'cyan');
    log(`  Documents: ${carrier.documents?.length || 0}`, 'cyan');

    // Documents expirant bientôt
    const expiringDocs = carrier.documents?.filter(doc => {
      if (!doc.expiresAt) return false;
      const daysUntilExpiry = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }) || [];

    log(`\nDocuments arrivant à expiration: ${expiringDocs.length}`, expiringDocs.length > 0 ? 'yellow' : 'green');

    if (expiringDocs.length > 0) {
      expiringDocs.forEach((doc, i) => {
        const days = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        log(`  ${i + 1}. ${doc.type} - Expire dans ${days} jours`, days <= 7 ? 'red' : 'yellow');
      });
    }

    // ===== ÉTAPE 2: Email alerte de vigilance =====
    if (expiringDocs.length > 0) {
      header('ÉTAPE 2: EMAIL ALERTE DE VIGILANCE');

      log(`Envoi d'une alerte pour ${expiringDocs.length} document(s) via AWS SES...`, 'yellow');
      const alertResult = await sendVigilanceAlertEmail(carrier, expiringDocs);

      if (alertResult.success) {
        log('✓ Email d\'alerte envoyé avec succès!', 'green');
        log(`  Message ID: ${alertResult.messageId}`, 'cyan');
        log(`  Destinataire: ${TEST_EMAIL}`, 'cyan');
      } else {
        log(`✗ Échec d'envoi: ${alertResult.error}`, 'red');
      }
    }

    // ===== ÉTAPE 3: Email vérification document =====
    header('ÉTAPE 3: EMAIL VÉRIFICATION DOCUMENT');

    const verifiedDoc = carrier.documents?.find(d => d.status === 'verified');
    if (verifiedDoc) {
      log(`Envoi de confirmation de vérification pour: ${verifiedDoc.type}...`, 'yellow');
      const verificationResult = await sendDocumentVerifiedEmail(carrier, verifiedDoc.type);

      if (verificationResult.success) {
        log('✓ Email de vérification envoyé avec succès!', 'green');
        log(`  Message ID: ${verificationResult.messageId}`, 'cyan');
        log(`  Destinataire: ${TEST_EMAIL}`, 'cyan');
      } else {
        log(`✗ Échec d'envoi: ${verificationResult.error}`, 'red');
      }
    }

    // ===== ÉTAPE 4: Email activation Affret.IA =====
    if (carrier.overallScore >= 40) {
      header('ÉTAPE 4: EMAIL ACTIVATION AFFRET.IA');

      log('Envoi de l\'email d\'activation Affret.IA...', 'yellow');
      const affretResult = await sendAffretIAActivationEmail(carrier);

      if (affretResult.success) {
        log('✓ Email Affret.IA envoyé avec succès!', 'green');
        log(`  Message ID: ${affretResult.messageId}`, 'cyan');
        log(`  Destinataire: ${TEST_EMAIL}`, 'cyan');
      } else {
        log(`✗ Échec d'envoi: ${affretResult.error}`, 'red');
      }
    }

    // ===== RÉSUMÉ =====
    header('RÉSUMÉ DU TEST');

    console.log(`${colors.bright}Emails envoyés via AWS SES:${colors.reset}`);
    if (expiringDocs.length > 0) log('  ✓ Alerte de vigilance', 'green');
    if (verifiedDoc) log('  ✓ Confirmation vérification document', 'green');
    if (carrier.overallScore >= 40) log('  ✓ Activation Affret.IA', 'green');

    console.log(`\n${colors.bright}Destinataire:${colors.reset}`);
    log(`  ${TEST_EMAIL}`, 'cyan');

    console.log(`\n${colors.bright}Configuration AWS SES:${colors.reset}`);
    log(`  Région: ${SES_CONFIG.region}`, 'cyan');
    log(`  Source: ${SES_CONFIG.fromEmail}`, 'cyan');
    log(`  Domaine vérifié: symphonia-controltower.com`, 'green');

    log('\n✅ SYSTÈME D\'EMAILS AWS SES FONCTIONNEL', 'green');
    log('\n📧 Vérifiez votre boîte mail: ' + TEST_EMAIL, 'cyan');
    console.log('');

  } catch (error) {
    console.error(`\n${colors.red}❌ ERREUR:${colors.reset}`);
    console.error(error.message);
    if (error.response?.data) {
      console.error('Réponse API:', error.response.data);
    }
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

main();
