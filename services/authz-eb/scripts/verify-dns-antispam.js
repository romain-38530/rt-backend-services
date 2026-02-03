#!/usr/bin/env node

/**
 * Script de vérification complète DNS anti-spam
 * Vérifie: SPF, DMARC, DKIM
 */

const dns = require('dns').promises;

const DOMAINE = 'symphonia-controltower.com';

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

function printWarning(text) {
  console.log(`${colors.yellow}⚠${colors.reset} ${text}`);
}

function printError(text) {
  console.log(`${colors.red}✗${colors.reset} ${text}`);
}

function printInfo(text) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${text}`);
}

async function verifierSPF() {
  console.log('\n' + colors.bold + '1. SPF (Sender Policy Framework)' + colors.reset);
  console.log(colors.dim + '─'.repeat(60) + colors.reset);

  try {
    const records = await dns.resolveTxt(DOMAINE);
    const spf = records.find(r => r[0].includes('v=spf1'));

    if (!spf) {
      printError('SPF non trouvé');
      return { found: false, score: 0 };
    }

    const spfValue = spf[0];
    console.log(`\n  ${colors.bold}Valeur:${colors.reset} ${spfValue}\n`);

    // Vérifications
    const checks = {
      ovh: spfValue.includes('mx.ovh.com'),
      outlook: spfValue.includes('spf.protection.outlook.com'),
      amazonses: spfValue.includes('amazonses.com'),
      policy: spfValue.includes('~all') || spfValue.includes('-all')
    };

    printInfo('Vérifications:');
    console.log(`    ${checks.ovh ? colors.green + '✓' : colors.red + '✗'}${colors.reset} OVH (mx.ovh.com)`);
    console.log(`    ${checks.outlook ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Microsoft 365 (spf.protection.outlook.com)`);
    console.log(`    ${checks.amazonses ? colors.green + '✓' : colors.red + '✗'}${colors.reset} AWS SES (amazonses.com)`);
    console.log(`    ${checks.policy ? colors.green + '✓' : colors.red + '✗'}${colors.reset} Politique (${spfValue.includes('~all') ? '~all' : spfValue.includes('-all') ? '-all' : 'manquante'})`);

    const score = Object.values(checks).filter(v => v).length;

    if (score === 4) {
      printSuccess('SPF complet et correct');
    } else if (score >= 2) {
      printWarning(`SPF partiel (${score}/4)`);
    } else {
      printError('SPF incomplet');
    }

    return { found: true, score, checks };
  } catch (error) {
    printError(`Erreur DNS: ${error.message}`);
    return { found: false, score: 0 };
  }
}

async function verifierDMARC() {
  console.log('\n' + colors.bold + '2. DMARC (Domain-based Message Authentication)' + colors.reset);
  console.log(colors.dim + '─'.repeat(60) + colors.reset);

  try {
    const records = await dns.resolveTxt(`_dmarc.${DOMAINE}`);
    const dmarc = records.find(r => r[0].includes('v=DMARC1'));

    if (!dmarc) {
      printError('DMARC non trouvé');
      return { found: false, score: 0 };
    }

    const dmarcValue = dmarc[0];
    console.log(`\n  ${colors.bold}Valeur:${colors.reset} ${dmarcValue}\n`);

    // Parser DMARC
    const policy = dmarcValue.match(/p=(\w+)/)?.[1];
    const rua = dmarcValue.match(/rua=mailto:([^;]+)/)?.[1];

    printInfo('Configuration:');
    console.log(`    Politique: ${policy === 'none' ? colors.yellow + 'none (monitoring)' : policy === 'quarantine' ? colors.yellow + 'quarantine' : colors.green + policy}${colors.reset}`);
    if (rua) {
      console.log(`    Rapports: ${colors.green}${rua}${colors.reset}`);
    }

    printSuccess('DMARC configuré');
    return { found: true, score: 1, policy, rua };
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      printError('DMARC non trouvé');
      console.log(`\n  ${colors.yellow}Action requise:${colors.reset}`);
      console.log(`    Ajouter enregistrement TXT:`);
      console.log(`    Nom: _dmarc.${DOMAINE}`);
      console.log(`    Valeur: v=DMARC1; p=none; rua=mailto:support@${DOMAINE}`);
    } else {
      printError(`Erreur DNS: ${error.message}`);
    }
    return { found: false, score: 0 };
  }
}

async function verifierDKIM() {
  console.log('\n' + colors.bold + '3. DKIM (DomainKeys Identified Mail)' + colors.reset);
  console.log(colors.dim + '─'.repeat(60) + colors.reset);

  printWarning('DKIM nécessite activation dans AWS SES Console');
  console.log('\n  ' + colors.bold + 'Étapes:' + colors.reset);
  console.log('    1. https://console.aws.amazon.com/ses/home?region=eu-central-1');
  console.log('    2. Verified identities → ' + DOMAINE);
  console.log('    3. DKIM → Enable DKIM');
  console.log('    4. Copier les 3 enregistrements CNAME générés');
  console.log('    5. Les ajouter dans votre DNS (via API OVH ou console)');

  // Essayer de trouver des selectors DKIM communs
  const selectors = ['default', 'ses', 'amazonses', 'dkim', 'mail'];
  let found = false;

  for (const selector of selectors) {
    try {
      const records = await dns.resolveTxt(`${selector}._domainkey.${DOMAINE}`);
      if (records.length > 0) {
        printSuccess(`DKIM trouvé (selector: ${selector})`);
        console.log(`\n  ${colors.bold}Valeur:${colors.reset} ${records[0][0].substring(0, 100)}...`);
        found = true;
        break;
      }
    } catch (error) {
      // Continuer
    }
  }

  if (!found) {
    printError('DKIM non configuré');
    console.log('\n  ' + colors.yellow + 'Note:' + colors.reset + ' AWS SES génère des selectors uniques.');
    console.log('  Consultez la console AWS SES pour obtenir les selectors exacts.\n');
    return { found: false, score: 0 };
  }

  return { found: true, score: 1 };
}

async function genererRapport(spf, dmarc, dkim) {
  console.log('\n' + colors.bold + '═'.repeat(60) + colors.reset);
  console.log(colors.bold + '  RÉSUMÉ - Configuration DNS Anti-Spam' + colors.reset);
  console.log(colors.bold + '═'.repeat(60) + colors.reset + '\n');

  const totalScore = spf.score + dmarc.score + dkim.score;
  const maxScore = 6; // 4 (SPF) + 1 (DMARC) + 1 (DKIM)

  console.log(`  ${colors.bold}Domaine:${colors.reset} ${DOMAINE}`);
  console.log(`  ${colors.bold}Score:${colors.reset}   ${totalScore}/${maxScore}`);

  console.log('\n  ' + colors.bold + 'État:' + colors.reset);
  console.log(`    ${spf.found ? colors.green + '✓' : colors.red + '✗'}${colors.reset} SPF ${spf.found ? `(${spf.score}/4)` : ''}`);
  console.log(`    ${dmarc.found ? colors.green + '✓' : colors.red + '✗'}${colors.reset} DMARC`);
  console.log(`    ${dkim.found ? colors.green + '✓' : colors.red + '✗'}${colors.reset} DKIM`);

  console.log('');

  if (totalScore === maxScore) {
    console.log(colors.green + colors.bold + '  ✅ Configuration complète !' + colors.reset);
    console.log('     Vos emails ne devraient plus aller en spam.\n');
  } else if (totalScore >= 4) {
    console.log(colors.yellow + colors.bold + '  ⚠️  Configuration partielle' + colors.reset);
    console.log('     Complétez les éléments manquants.\n');
  } else {
    console.log(colors.red + colors.bold + '  ❌ Configuration insuffisante' + colors.reset);
    console.log('     URGENT: Configurez SPF et DMARC minimum.\n');
  }

  console.log(colors.dim + '─'.repeat(60) + colors.reset);
  console.log('\n  ' + colors.bold + 'Prochaines étapes:' + colors.reset);

  if (!spf.found || spf.score < 4) {
    console.log('    1. Exécuter: node scripts/fix-complete-spf.js');
  }

  if (!dmarc.found) {
    console.log('    2. Ajouter DMARC dans votre DNS');
  }

  if (!dkim.found) {
    console.log('    3. Activer DKIM dans AWS SES Console (eu-central-1)');
    console.log('       Guide: ../affret-ia-api-v2/CORRECTION-DNS-SPF-DKIM.md');
  }

  console.log('    4. Attendre propagation DNS (1-2h)');
  console.log('    5. Tester sur: https://www.mail-tester.com');
  console.log('');
}

async function main() {
  console.log('\n' + colors.bold + colors.cyan + '╔══════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bold + colors.cyan + '║  Vérification DNS Anti-Spam - symphonia-controltower.com   ║' + colors.reset);
  console.log(colors.bold + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset);

  const spf = await verifierSPF();
  const dmarc = await verifierDMARC();
  const dkim = await verifierDKIM();

  await genererRapport(spf, dmarc, dkim);
}

main().catch(error => {
  console.error('\n❌ Erreur:', error.message);
  process.exit(1);
});
