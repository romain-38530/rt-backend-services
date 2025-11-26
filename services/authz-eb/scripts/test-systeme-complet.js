#!/usr/bin/env node

/**
 * Script de Test Complet du Système SYMPHONI.A
 *
 * Ce script vérifie l'ensemble du système d'emails et de gestion des transporteurs :
 * - Configuration DNS (SPF, DKIM, DMARC)
 * - Connexion SMTP OVH
 * - Connectivité MongoDB
 * - Santé de l'API
 * - Envoi optionnel d'emails de test
 *
 * Usage: node scripts/test-systeme-complet.js [--send-test-email]
 */

const dns = require('dns').promises;
const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');

// Configuration
const DOMAINE = 'symphonia-controltower.com';
const API_URL = 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com';
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'ssl0.ovh.net',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'noreply@symphonia-controltower.com',
    pass: process.env.SMTP_PASSWORD || ''
  }
};

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Résultats globaux
const results = {
  dns: { passed: 0, failed: 0, warnings: 0, details: [] },
  smtp: { passed: 0, failed: 0, warnings: 0, details: [] },
  api: { passed: 0, failed: 0, warnings: 0, details: [] },
  email: { passed: 0, failed: 0, warnings: 0, details: [] }
};

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================

function printHeader(text) {
  const line = '═'.repeat(70);
  console.log(`\n${colors.cyan}${colors.bold}${line}`);
  console.log(`  ${text}`);
  console.log(`${line}${colors.reset}\n`);
}

function printSection(text) {
  console.log(`\n${colors.blue}${colors.bold}▶ ${text}${colors.reset}\n`);
}

function printSuccess(text) {
  console.log(`${colors.green}✓${colors.reset} ${text}`);
}

function printError(text) {
  console.log(`${colors.red}✗${colors.reset} ${text}`);
}

function printWarning(text) {
  console.log(`${colors.yellow}⚠${colors.reset} ${text}`);
}

function printInfo(text) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${text}`);
}

function addResult(category, status, message) {
  if (status === 'pass') {
    results[category].passed++;
    results[category].details.push({ status: '✓', message });
  } else if (status === 'fail') {
    results[category].failed++;
    results[category].details.push({ status: '✗', message });
  } else if (status === 'warn') {
    results[category].warnings++;
    results[category].details.push({ status: '⚠', message });
  }
}

// ============================================================================
// TESTS DNS
// ============================================================================

async function testDNS() {
  printSection('Test 1/4 : Vérification DNS');

  // Test SPF
  try {
    const records = await dns.resolveTxt(DOMAINE);
    const spfRecord = records.find(record => record.join('').includes('v=spf1'));

    if (spfRecord) {
      const spfValue = spfRecord.join('');
      if (spfValue.includes('include:mx.ovh.net') && spfValue.includes('~all')) {
        printSuccess(`SPF configuré correctement pour OVH`);
        addResult('dns', 'pass', 'SPF: Configuration correcte');
      } else {
        printWarning(`SPF trouvé mais configuration non optimale: ${spfValue}`);
        addResult('dns', 'warn', 'SPF: Configuration non optimale');
      }
    } else {
      printError('Aucun enregistrement SPF trouvé');
      addResult('dns', 'fail', 'SPF: Non configuré');
    }
  } catch (error) {
    printError(`Erreur vérification SPF: ${error.message}`);
    addResult('dns', 'fail', `SPF: Erreur - ${error.message}`);
  }

  // Test DKIM
  try {
    const selecteurs = ['default', 'mail', 'dkim'];
    let dkimTrouve = false;
    let selecteurTrouve = '';

    for (const selecteur of selecteurs) {
      try {
        const query = `${selecteur}._domainkey.${DOMAINE}`;
        const records = await dns.resolveTxt(query);
        const dkimRecord = records.find(record => record.join('').includes('v=DKIM1'));

        if (dkimRecord) {
          dkimTrouve = true;
          selecteurTrouve = selecteur;
          printSuccess(`DKIM configuré (sélecteur: ${selecteur})`);
          addResult('dns', 'pass', `DKIM: Sélecteur ${selecteur} configuré`);
          break;
        }
      } catch (err) {
        // Continuer avec le prochain sélecteur
      }
    }

    if (!dkimTrouve) {
      printWarning('Aucun enregistrement DKIM trouvé (peut prendre 24-48h après activation)');
      addResult('dns', 'warn', 'DKIM: Non trouvé (activation en cours?)');
    }
  } catch (error) {
    printError(`Erreur vérification DKIM: ${error.message}`);
    addResult('dns', 'fail', `DKIM: Erreur - ${error.message}`);
  }

  // Test DMARC
  try {
    const query = `_dmarc.${DOMAINE}`;
    const records = await dns.resolveTxt(query);
    const dmarcRecord = records.find(record => record.join('').includes('v=DMARC1'));

    if (dmarcRecord) {
      const dmarcValue = dmarcRecord.join('');
      printSuccess('DMARC configuré correctement');
      addResult('dns', 'pass', 'DMARC: Configuration correcte');

      // Vérifier la politique
      if (dmarcValue.includes('p=reject') || dmarcValue.includes('p=quarantine')) {
        printInfo('Politique DMARC active (reject/quarantine)');
      } else if (dmarcValue.includes('p=none')) {
        printInfo('Politique DMARC en mode surveillance (none)');
      }
    } else {
      printError('Aucun enregistrement DMARC trouvé');
      addResult('dns', 'fail', 'DMARC: Non configuré');
    }
  } catch (error) {
    printError(`Erreur vérification DMARC: ${error.message}`);
    addResult('dns', 'fail', `DMARC: Erreur - ${error.message}`);
  }
}

// ============================================================================
// TESTS SMTP
// ============================================================================

async function testSMTP() {
  printSection('Test 2/4 : Connexion SMTP OVH');

  return new Promise((resolve) => {
    // Vérifier que les variables d'environnement sont définies
    if (!SMTP_CONFIG.auth.user) {
      printError('Variable SMTP_USER non définie');
      addResult('smtp', 'fail', 'SMTP_USER: Non défini');
    } else {
      printSuccess(`Utilisateur SMTP: ${SMTP_CONFIG.auth.user}`);
      addResult('smtp', 'pass', `Utilisateur: ${SMTP_CONFIG.auth.user}`);
    }

    if (!SMTP_CONFIG.auth.pass) {
      printWarning('Variable SMTP_PASSWORD non définie (vérifiez le .env)');
      addResult('smtp', 'warn', 'SMTP_PASSWORD: Non défini');
    } else {
      printSuccess('Mot de passe SMTP défini');
      addResult('smtp', 'pass', 'Mot de passe: Configuré');
    }

    printInfo(`Serveur: ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}`);
    printInfo(`Sécurité: ${SMTP_CONFIG.secure ? 'TLS' : 'STARTTLS'}`);

    // Test de connexion
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    printInfo('Test de connexion au serveur SMTP...');

    transporter.verify((error, success) => {
      if (error) {
        printError(`Échec connexion SMTP: ${error.message}`);
        addResult('smtp', 'fail', `Connexion: ${error.message}`);

        if (error.code === 'EAUTH') {
          printInfo('💡 Vérifiez le nom d\'utilisateur et le mot de passe SMTP');
        } else if (error.code === 'ECONNECTION') {
          printInfo('💡 Vérifiez la connectivité réseau et le serveur SMTP');
        }
      } else {
        printSuccess('Connexion SMTP réussie - Serveur prêt à envoyer des emails');
        addResult('smtp', 'pass', 'Connexion: Établie avec succès');
      }
      resolve();
    });
  });
}

// ============================================================================
// TESTS API
// ============================================================================

async function testAPI() {
  printSection('Test 3/4 : Santé de l\'API');

  return new Promise((resolve) => {
    const url = `${API_URL}/health`;

    printInfo(`Vérification: ${url}`);

    const protocol = API_URL.startsWith('https') ? https : http;

    const request = protocol.get(url, { timeout: 10000 }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const health = JSON.parse(data);
            printSuccess(`API accessible - Status: ${res.statusCode}`);
            addResult('api', 'pass', 'Endpoint /health: Accessible');

            if (health.status === 'ok') {
              printSuccess('Status API: OK');
              addResult('api', 'pass', 'Status: OK');
            }

            if (health.mongodb === 'connected') {
              printSuccess('MongoDB: Connecté');
              addResult('api', 'pass', 'MongoDB: Connecté');
            } else {
              printWarning(`MongoDB: ${health.mongodb || 'Statut inconnu'}`);
              addResult('api', 'warn', `MongoDB: ${health.mongodb}`);
            }

            if (health.email === 'configured') {
              printSuccess('Module email: Configuré');
              addResult('api', 'pass', 'Module email: Configuré');
            } else {
              printWarning('Module email: Non configuré');
              addResult('api', 'warn', 'Module email: Non configuré');
            }
          } catch (err) {
            printWarning('Réponse API non JSON');
            addResult('api', 'warn', 'Format réponse: Non JSON');
          }
        } else {
          printError(`API retourne status ${res.statusCode}`);
          addResult('api', 'fail', `Status: ${res.statusCode}`);
        }
        resolve();
      });
    });

    request.on('error', (error) => {
      printError(`Impossible de contacter l'API: ${error.message}`);
      addResult('api', 'fail', `Connexion: ${error.message}`);

      if (error.code === 'ENOTFOUND') {
        printInfo('💡 Vérifiez l\'URL de l\'API');
      } else if (error.code === 'ETIMEDOUT') {
        printInfo('💡 L\'API met trop de temps à répondre');
      }
      resolve();
    });

    request.on('timeout', () => {
      request.destroy();
      printError('Timeout: L\'API ne répond pas dans les délais');
      addResult('api', 'fail', 'Connexion: Timeout');
      resolve();
    });
  });
}

// ============================================================================
// TEST EMAIL (OPTIONNEL)
// ============================================================================

async function testEmail(sendTest) {
  printSection('Test 4/4 : Envoi d\'Email de Test');

  if (!sendTest) {
    printInfo('Test d\'envoi désactivé (utilisez --send-test-email pour activer)');
    addResult('email', 'pass', 'Test désactivé');
    return;
  }

  if (!SMTP_CONFIG.auth.pass) {
    printWarning('Impossible de tester l\'envoi sans mot de passe SMTP');
    addResult('email', 'warn', 'Mot de passe manquant');
    return;
  }

  return new Promise((resolve) => {
    const transporter = nodemailer.createTransport(SMTP_CONFIG);

    const mailOptions = {
      from: `"SYMPHONI.A Test" <${SMTP_CONFIG.auth.user}>`,
      to: SMTP_CONFIG.auth.user, // Envoyer à nous-mêmes pour le test
      subject: 'Test Système Complet - SYMPHONI.A',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px;">
              ✅ Test Système Complet Réussi
            </h1>

            <p>Ce message confirme que le système d'emails SYMPHONI.A fonctionne correctement.</p>

            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #059669;">Système Opérationnel</h3>
              <ul>
                <li><strong>Configuration DNS:</strong> Vérifiée</li>
                <li><strong>Connexion SMTP:</strong> Établie</li>
                <li><strong>API Backend:</strong> Accessible</li>
                <li><strong>Envoi d'emails:</strong> Fonctionnel</li>
              </ul>
            </div>

            <p style="color: #6b7280; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <strong>Date du test:</strong> ${new Date().toLocaleString('fr-FR')}<br>
              <strong>Domaine:</strong> ${DOMAINE}<br>
              <strong>Serveur SMTP:</strong> ${SMTP_CONFIG.host}:${SMTP_CONFIG.port}
            </p>
          </div>
        </body>
        </html>
      `
    };

    printInfo('Envoi de l\'email de test...');

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        printError(`Échec envoi email: ${error.message}`);
        addResult('email', 'fail', `Envoi: ${error.message}`);
      } else {
        printSuccess('Email de test envoyé avec succès');
        printInfo(`Message ID: ${info.messageId}`);
        printInfo(`Destinataire: ${SMTP_CONFIG.auth.user}`);
        addResult('email', 'pass', 'Envoi: Succès');
      }
      resolve();
    });
  });
}

// ============================================================================
// RAPPORT FINAL
// ============================================================================

function printFinalReport() {
  printHeader('RAPPORT FINAL DU TEST SYSTÈME');

  const categories = [
    { key: 'dns', label: 'Configuration DNS' },
    { key: 'smtp', label: 'Connexion SMTP' },
    { key: 'api', label: 'Santé API' },
    { key: 'email', label: 'Envoi Email' }
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  categories.forEach(cat => {
    const result = results[cat.key];
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalWarnings += result.warnings;

    console.log(`\n${colors.bold}${cat.label}:${colors.reset}`);
    console.log(`  ${colors.green}✓ Réussis: ${result.passed}${colors.reset}`);
    console.log(`  ${colors.red}✗ Échecs: ${result.failed}${colors.reset}`);
    console.log(`  ${colors.yellow}⚠ Avertissements: ${result.warnings}${colors.reset}`);

    // Afficher les détails
    result.details.forEach(detail => {
      const color = detail.status === '✓' ? colors.green :
                   detail.status === '✗' ? colors.red : colors.yellow;
      console.log(`    ${color}${detail.status}${colors.reset} ${detail.message}`);
    });
  });

  // Score global
  const totalTests = totalPassed + totalFailed + totalWarnings;
  const score = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${colors.bold}Score Global: ${score}%${colors.reset}`);
  console.log(`  Total: ${totalTests} tests`);
  console.log(`  ${colors.green}Réussis: ${totalPassed}${colors.reset}`);
  console.log(`  ${colors.red}Échecs: ${totalFailed}${colors.reset}`);
  console.log(`  ${colors.yellow}Avertissements: ${totalWarnings}${colors.reset}`);

  // Recommandations
  console.log(`\n${colors.bold}${colors.cyan}RECOMMANDATIONS:${colors.reset}\n`);

  if (results.dns.failed > 0) {
    console.log(`${colors.yellow}→${colors.reset} Configuration DNS incomplète`);
    console.log(`  Suivez le guide: CONFIGURATION_DNS_ETAPES.md`);
    console.log(`  Vérifiez avec: node scripts/verifier-dns.js\n`);
  }

  if (results.smtp.failed > 0) {
    console.log(`${colors.yellow}→${colors.reset} Problème de connexion SMTP`);
    console.log(`  Vérifiez les variables d'environnement dans .env`);
    console.log(`  Testez avec: node scripts/test-smtp.js\n`);
  }

  if (results.api.failed > 0) {
    console.log(`${colors.yellow}→${colors.reset} API non accessible`);
    console.log(`  Vérifiez que l'API est déployée et en cours d'exécution`);
    console.log(`  URL: ${API_URL}/health\n`);
  }

  if (totalFailed === 0 && totalWarnings === 0) {
    console.log(`${colors.green}${colors.bold}✅ EXCELLENT !${colors.reset} ${colors.green}Tous les systèmes sont opérationnels.${colors.reset}`);
    console.log(`\nVotre système SYMPHONI.A est prêt à envoyer des emails automatiques !\n`);
  } else if (totalFailed === 0) {
    console.log(`${colors.green}✅ BON !${colors.reset} Système fonctionnel avec quelques avertissements.`);
    console.log(`Consultez les recommandations ci-dessus pour optimiser.\n`);
  } else {
    console.log(`${colors.yellow}⚠ ATTENTION !${colors.reset} Certains tests ont échoué.`);
    console.log(`Corrigez les problèmes avant de passer en production.\n`);
  }

  // Liens utiles
  console.log(`${colors.bold}${colors.cyan}RESSOURCES UTILES:${colors.reset}`);
  console.log(`  • Documentation: README_SYSTEME_EMAILS.md`);
  console.log(`  • Guide DNS: CONFIGURATION_DNS_ETAPES.md`);
  console.log(`  • Test emails: node scripts/test-all-emails.js`);
  console.log(`  • Vérif DNS: node scripts/verifier-dns.js`);
  console.log(`  • Prochaines étapes: PROCHAINES_ETAPES.md\n`);
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  const sendTestEmail = process.argv.includes('--send-test-email');

  printHeader('TEST SYSTÈME COMPLET - SYMPHONI.A v3.1.0');

  console.log(`${colors.bold}Domaine:${colors.reset} ${DOMAINE}`);
  console.log(`${colors.bold}API:${colors.reset} ${API_URL}`);
  console.log(`${colors.bold}Date:${colors.reset} ${new Date().toLocaleString('fr-FR')}\n`);

  if (sendTestEmail) {
    printInfo('Mode: Test complet avec envoi d\'email');
  } else {
    printInfo('Mode: Test sans envoi d\'email (utilisez --send-test-email pour activer)');
  }

  console.log(`${'═'.repeat(70)}`);

  try {
    await testDNS();
    await testSMTP();
    await testAPI();
    await testEmail(sendTestEmail);

    printFinalReport();

  } catch (error) {
    printError(`Erreur critique: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Exécuter le script
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { main };
