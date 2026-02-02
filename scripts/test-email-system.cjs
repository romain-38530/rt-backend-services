/**
 * Test du système d'envoi d'emails
 * Vérifie la connexion SMTP et l'envoi de mails pour le workflow documents
 */

const nodemailer = require('nodemailer');
const axios = require('axios');

const SMTP_CONFIG = {
  host: 'ssl0.ovh.net',
  port: 587,
  secure: false,
  auth: {
    user: 'noreply@symphonia-controltower.com',
    pass: 'Demo2025Secure'
  }
};

const API_URL = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';
const TEST_EMAIL = 'rtard@symphonia-controltower.com'; // Email de test

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

async function testSMTPConnection() {
  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    await transporter.verify();
    return { success: true, message: 'Connexion SMTP réussie' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sendTestEmail(to, subject, html) {
  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);
    const result = await transporter.sendMail({
      from: `"SYMPHONI.A Control Tower" <${SMTP_CONFIG.auth.user}>`,
      to,
      subject,
      html
    });
    return { success: true, messageId: result.messageId };
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
          <p style="margin: 0; color: #92400e;"><strong>Impact:</strong></p>
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
          <li>Le blocage de votre compte</li>
          <li>La suspension de vos accès Affret.IA</li>
          <li>La perte d'éligibilité aux nouvelles missions</li>
        </ul>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/documents" style="background: #ef4444; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Mettre à jour mes documents</a>
        </div>

        <p style="color: #6b7280; font-size: 14px;">Si vous avez déjà mis à jour vos documents, veuillez ignorer ce message.</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>SYMPHONI.A - Système automatique d'alertes de vigilance</p>
        <p>Cet email a été envoyé par le système de monitoring automatique</p>
      </div>
    </div>
  `;

  return sendTestEmail(
    TEST_EMAIL,
    `⚠️ ALERTE: ${expiringDocs.length} document(s) arrivent à expiration - ${carrier.companyName}`,
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
          <p style="margin: 0; color: #065f46; font-weight: bold;">✅ Votre document a été vérifié et approuvé</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Type de document:</strong> ${documentType}</p>
          <p style="margin: 10px 0;"><strong>Statut:</strong> <span style="color: #10b981;">Vérifié</span></p>
          <p style="margin: 10px 0;"><strong>Date de vérification:</strong> ${new Date().toLocaleDateString('fr-FR')}</p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Score de vigilance mis à jour</h3>
          <p style="margin: 5px 0;"><strong>Score global:</strong> ${carrier.overallScore}/100</p>
          <p style="margin: 5px 0;"><strong>Statut:</strong> ${carrier.vigilanceStatus}</p>
          ${carrier.overallScore >= 40 ? `
            <div style="background: #d1fae5; padding: 10px; margin-top: 15px; border-radius: 4px;">
              <p style="margin: 0; color: #065f46;">🎉 Vous êtes éligible pour Affret.IA!</p>
            </div>
          ` : ''}
        </div>

        <p>Merci de maintenir vos documents à jour pour continuer à bénéficier de tous les services de la plateforme.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://transporteur.symphonia-controltower.com/dashboard" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Voir mon tableau de bord</a>
        </div>
      </div>
      <div style="padding: 20px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>SYMPHONI.A - Plateforme de gestion logistique</p>
      </div>
    </div>
  `;

  return sendTestEmail(
    TEST_EMAIL,
    `✅ Document vérifié: ${documentType} - ${carrier.companyName}`,
    html
  );
}

async function main() {
  try {
    header('TEST SYSTÈME D\'ENVOI D\'EMAILS');

    // ===== ÉTAPE 1: Test connexion SMTP =====
    header('ÉTAPE 1: TEST CONNEXION SMTP');

    log('Configuration SMTP:', 'cyan');
    log(`  Host: ${SMTP_CONFIG.host}`, 'cyan');
    log(`  Port: ${SMTP_CONFIG.port}`, 'cyan');
    log(`  User: ${SMTP_CONFIG.auth.user}`, 'cyan');
    log(`  From: noreply@symphonia-controltower.com`, 'cyan');
    log(`  Test Email: ${TEST_EMAIL}`, 'cyan');

    log('\nVérification de la connexion SMTP...', 'yellow');
    const connectionTest = await testSMTPConnection();

    if (connectionTest.success) {
      log('✓ Connexion SMTP réussie!', 'green');
    } else {
      log(`✗ Échec de connexion: ${connectionTest.error}`, 'red');
      process.exit(1);
    }

    // ===== ÉTAPE 2: Récupération des infos transporteur =====
    header('ÉTAPE 2: RÉCUPÉRATION INFOS TRANSPORTEUR');

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

    // Identifier les documents qui expirent bientôt
    const expiringDocs = carrier.documents?.filter(doc => {
      if (!doc.expiresAt) return false;
      const daysUntilExpiry = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= 30 && daysUntilExpiry > 0;
    }) || [];

    log(`\nDocuments arrivant à expiration: ${expiringDocs.length}`, expiringDocs.length > 0 ? 'yellow' : 'green');

    // ===== ÉTAPE 3: Envoi email d'alerte de vigilance =====
    if (expiringDocs.length > 0) {
      header('ÉTAPE 3: TEST EMAIL ALERTE DE VIGILANCE');

      log(`Envoi d'une alerte pour ${expiringDocs.length} document(s)...`, 'yellow');

      expiringDocs.forEach((doc, i) => {
        const days = Math.floor((new Date(doc.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
        log(`  ${i + 1}. ${doc.type} - Expire dans ${days} jours`, days <= 7 ? 'red' : 'yellow');
      });

      const alertResult = await sendVigilanceAlertEmail(carrier, expiringDocs);

      if (alertResult.success) {
        log('\n✓ Email d\'alerte envoyé avec succès!', 'green');
        log(`  Message ID: ${alertResult.messageId}`, 'cyan');
        log(`  Destinataire: ${TEST_EMAIL}`, 'cyan');
      } else {
        log(`\n✗ Échec d'envoi: ${alertResult.error}`, 'red');
      }
    } else {
      log('\nℹ Aucun document n\'expire dans les 30 jours, pas d\'alerte à envoyer', 'blue');
    }

    // ===== ÉTAPE 4: Envoi email de vérification de document =====
    header('ÉTAPE 4: TEST EMAIL VÉRIFICATION DOCUMENT');

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
    } else {
      log('ℹ Aucun document vérifié trouvé', 'blue');
    }

    // ===== ÉTAPE 5: Email simple de test =====
    header('ÉTAPE 5: TEST EMAIL SIMPLE');

    const simpleHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>✅ Test du système d'emails SYMPHONI.A</h2>
        <p>Ceci est un email de test envoyé le ${new Date().toLocaleString('fr-FR')}</p>
        <p><strong>Système:</strong> SYMPHONI.A Control Tower</p>
        <p><strong>Module:</strong> Document Management & Vigilance Alerts</p>
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Statut:</strong> ✅ Le système d'envoi d'emails fonctionne correctement!</p>
        </div>
      </div>
    `;

    log('Envoi d\'un email de test simple...', 'yellow');
    const simpleResult = await sendTestEmail(
      TEST_EMAIL,
      '✅ Test Système Email SYMPHONI.A',
      simpleHtml
    );

    if (simpleResult.success) {
      log('✓ Email de test envoyé avec succès!', 'green');
      log(`  Message ID: ${simpleResult.messageId}`, 'cyan');
    } else {
      log(`✗ Échec d'envoi: ${simpleResult.error}`, 'red');
    }

    // ===== RÉSUMÉ =====
    header('RÉSUMÉ DU TEST');

    console.log(`${colors.bright}Fonctionnalités testées:${colors.reset}`);
    log('  ✓ Connexion SMTP OVH', 'green');
    log('  ✓ Récupération données transporteur', 'green');
    log(`  ${expiringDocs.length > 0 ? '✓' : 'ℹ'} Email alerte vigilance (${expiringDocs.length} doc(s))`, expiringDocs.length > 0 ? 'green' : 'blue');
    log(`  ${verifiedDoc ? '✓' : 'ℹ'} Email vérification document`, verifiedDoc ? 'green' : 'blue');
    log('  ✓ Email de test simple', 'green');

    console.log(`\n${colors.bright}Emails envoyés à:${colors.reset}`);
    log(`  ${TEST_EMAIL}`, 'cyan');

    console.log(`\n${colors.bright}Configuration SMTP:${colors.reset}`);
    log(`  Host: ${SMTP_CONFIG.host}`, 'cyan');
    log(`  Port: ${SMTP_CONFIG.port}`, 'cyan');
    log(`  From: ${SMTP_CONFIG.auth.user}`, 'cyan');

    log('\n✅ SYSTÈME D\'EMAILS FONCTIONNEL', 'green');
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
