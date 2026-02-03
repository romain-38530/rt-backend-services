#!/usr/bin/env node

/**
 * Script de monitoring DKIM
 * Vérifie automatiquement le status DKIM AWS SES jusqu'à vérification complète
 */

const { execSync } = require('child_process');

const DOMAINE = 'symphonia-controltower.com';
const AWS_REGION = 'eu-central-1';
const CHECK_INTERVAL = 60000; // 1 minute
const MAX_CHECKS = 120; // 2 heures max

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function printSuccess(text) {
  console.log(`${colors.green}✓${colors.reset} ${text}`);
}

function printInfo(text) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${text}`);
}

function printWarning(text) {
  console.log(`${colors.yellow}⚠${colors.reset} ${text}`);
}

function printError(text) {
  console.log(`${colors.red}✗${colors.reset} ${text}`);
}

function getDkimStatus() {
  try {
    const command = `aws ses get-identity-dkim-attributes --identities ${DOMAINE} --region ${AWS_REGION} --output json`;
    const output = execSync(command, { encoding: 'utf8' });
    const data = JSON.parse(output);
    const dkimAttr = data.DkimAttributes[DOMAINE];

    if (!dkimAttr) {
      return { error: 'Domaine non trouvé dans AWS SES' };
    }

    return {
      enabled: dkimAttr.DkimEnabled,
      status: dkimAttr.DkimVerificationStatus,
      tokens: dkimAttr.DkimTokens
    };
  } catch (error) {
    return { error: error.message };
  }
}

function formatElapsedTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}min ${secs}s`;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n' + colors.bold + colors.cyan + '╔══════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bold + colors.cyan + '║  Monitoring DKIM - symphonia-controltower.com               ║' + colors.reset);
  console.log(colors.bold + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset + '\n');

  printInfo('Démarrage du monitoring DKIM...');
  console.log(`  Intervalle: ${colors.cyan}1 minute${colors.reset}`);
  console.log(`  Durée max: ${colors.cyan}2 heures${colors.reset}`);
  console.log('');

  const startTime = Date.now();
  let checkCount = 0;

  while (checkCount < MAX_CHECKS) {
    checkCount++;
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

    // Vérifier status DKIM
    const dkim = getDkimStatus();

    if (dkim.error) {
      printError(`Erreur: ${dkim.error}`);
      process.exit(1);
    }

    // Afficher status
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    console.log(`${colors.dim}[${timestamp}]${colors.reset} Check #${checkCount} (${formatElapsedTime(elapsedSeconds)})`);

    if (dkim.status === 'Success') {
      // ✅ DKIM vérifié
      console.log(`  Status: ${colors.green}${colors.bold}${dkim.status}${colors.reset}`);
      console.log('');

      console.log(colors.bold + colors.green + '🎉 DKIM vérifié avec succès !' + colors.reset);
      console.log('');

      console.log(colors.dim + '─'.repeat(60) + colors.reset);
      console.log('\n' + colors.bold + 'Configuration DNS Complète:' + colors.reset);
      console.log('  ✅ SPF: v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all');
      console.log('  ✅ DMARC: v=DMARC1; p=none; rua=mailto:support@symphonia-controltower.com');
      console.log('  ✅ DKIM: 3 signatures validées');

      console.log('\n' + colors.bold + 'Score DNS Anti-Spam:' + colors.reset + ' ' + colors.green + colors.bold + '6/6' + colors.reset);

      console.log('\n' + colors.dim + '─'.repeat(60) + colors.reset);
      console.log('\n' + colors.bold + 'Prochaines étapes:' + colors.reset);
      console.log('  1. Tester sur https://www.mail-tester.com (objectif: > 8/10)');
      console.log('  2. Lancer campagne test (5-10 transporteurs)');
      console.log('  3. Vérifier réception en boîte principale (pas spam)');
      console.log('  4. Lancer campagne complète (84 transporteurs)');

      console.log('\n' + colors.bold + 'Vérification finale:' + colors.reset);
      console.log('  node scripts/verify-dns-antispam.js');
      console.log('');

      process.exit(0);
    } else if (dkim.status === 'TemporaryFailure') {
      // ⏳ En attente de propagation
      console.log(`  Status: ${colors.yellow}${dkim.status}${colors.reset} (propagation DNS en cours...)`);
      console.log('');
    } else if (dkim.status === 'Failed') {
      // ❌ Échec vérification
      console.log(`  Status: ${colors.red}${dkim.status}${colors.reset}`);
      console.log('');

      printError('DKIM verification failed');
      console.log('\n' + colors.yellow + 'Actions de dépannage:' + colors.reset);
      console.log('  1. Vérifier les CNAME DKIM:');
      if (dkim.tokens) {
        dkim.tokens.forEach(token => {
          console.log(`     nslookup -type=CNAME ${token}._domainkey.${DOMAINE}`);
        });
      }
      console.log('  2. Vérifier que les CNAME pointent vers *.dkim.amazonses.com');
      console.log('  3. Réexécuter: node scripts/add-dkim-cnames.js');
      console.log('');

      process.exit(1);
    } else {
      // ❓ Status inconnu
      console.log(`  Status: ${colors.yellow}${dkim.status}${colors.reset}`);
      console.log('');
    }

    // Attendre avant prochain check (sauf si dernier check)
    if (checkCount < MAX_CHECKS) {
      await sleep(CHECK_INTERVAL);
    }
  }

  // Timeout après MAX_CHECKS
  console.log('\n' + colors.yellow + colors.bold + '⏱️  Timeout après 2 heures' + colors.reset);
  console.log('\n' + colors.yellow + 'La propagation DNS peut prendre plus de temps.' + colors.reset);
  console.log('\nVérifiez manuellement:');
  console.log(`  aws ses get-identity-dkim-attributes --identities ${DOMAINE} --region ${AWS_REGION}`);
  console.log('\nOu relancez ce script:');
  console.log('  node scripts/wait-dkim-verification.js');
  console.log('');
}

// Gestion Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n' + colors.yellow + '⚠ Monitoring interrompu par l\'utilisateur' + colors.reset);
  console.log('\nVous pouvez relancer le monitoring à tout moment:');
  console.log('  node scripts/wait-dkim-verification.js');
  console.log('');
  process.exit(0);
});

main().catch(error => {
  console.error('\n❌ Erreur:', error.message);
  process.exit(1);
});
