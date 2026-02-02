#!/usr/bin/env node
/**
 * Démonstration du Script d'Invitation Transporteurs
 *
 * Ce script montre visuellement comment fonctionne invite-test-carriers.cjs
 * avec des données de démonstration.
 *
 * Usage: node scripts/demo-invite-carriers.cjs
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printHeader(text) {
  console.log(`\n${colors.bold}${colors.cyan}${'━'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${text.padStart(30 + text.length / 2).padEnd(60)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'━'.repeat(60)}${colors.reset}\n`);
}

function printStep(number, total, title) {
  console.log(`\n${colors.bold}${colors.blue}[${number}/${total}] ${title}${colors.reset}\n`);
}

function printSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function printInfo(message) {
  console.log(`${colors.cyan}ℹ️  ${message}${colors.reset}`);
}

function printProgress(percentage) {
  const filled = Math.floor(percentage / 5);
  const empty = 20 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  console.log(`${colors.cyan}[${bar}] ${percentage}%${colors.reset}`);
}

async function demoCarrierCreation(carrierData) {
  console.log(`\n${colors.bold}${colors.magenta}${'━'.repeat(60)}${colors.reset}`);
  console.log(`${colors.bold}Carrier: ${carrierData.name}${colors.reset}`);
  console.log(`${colors.magenta}${'━'.repeat(60)}${colors.reset}\n`);

  // Étape 1: Création
  printProgress(16);
  await sleep(500);
  printSuccess(`Carrier créé: ${carrierData.id}`);
  printInfo(`Email: ${carrierData.email}`);

  // Étape 2: Upload documents
  await sleep(500);
  printProgress(33);
  console.log(`\n${colors.bold}Upload des 6 documents:${colors.reset}`);

  const docs = [
    'Kbis',
    'URSSAF',
    'Assurance RC Pro',
    'Licence Transport',
    'Carte Grise',
    'Attestation Vigilance'
  ];

  for (let i = 0; i < docs.length; i++) {
    await sleep(200);
    printSuccess(`  [${i + 1}/6] ${docs[i]}`);
  }

  // Étape 3: Vérification
  await sleep(500);
  printProgress(50);
  console.log(`\n${colors.bold}Vérification des documents:${colors.reset}`);
  await sleep(300);
  printSuccess(`6/6 documents vérifiés`);

  // Étape 4: Calcul score
  await sleep(500);
  printProgress(66);
  console.log(`\n${colors.bold}Calcul du score:${colors.reset}`);
  await sleep(300);
  printSuccess(`Score calculé: ${carrierData.score}/100`);

  // Étape 5: Check Affret.IA
  await sleep(500);
  printProgress(83);
  console.log(`\n${colors.bold}Check Affret.IA:${colors.reset}`);
  await sleep(300);
  if (carrierData.affretIA) {
    printSuccess(`Éligible Affret.IA (score >= 70)`);
  } else {
    printInfo(`Non éligible Affret.IA (score < 70)`);
  }

  // Étape 6: Niveau final
  await sleep(500);
  printProgress(100);
  console.log(`\n${colors.bold}Niveau final:${colors.reset}`);
  await sleep(300);
  printSuccess(`Niveau: ${carrierData.level}`);

  console.log(`\n${colors.green}${colors.bold}✅ Carrier ${carrierData.name} traité avec succès${colors.reset}\n`);
}

async function runDemo() {
  console.clear();

  console.log(`${colors.bold}${colors.cyan}`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║       DÉMONSTRATION - Script d\'Invitation Carriers       ║');
  console.log('║                    SYMPHONI.A - Jour 12                   ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  await sleep(1000);

  printHeader('CONFIGURATION');

  printInfo('Nombre de carriers: 3');
  printInfo('Prefix email: demo');
  printInfo('API: http://localhost:3001');
  printInfo('MongoDB: mongodb://localhost:27017/rt-authz');

  await sleep(1500);

  printHeader('TRAITEMENT DES CARRIERS');

  const carriers = [
    {
      id: '65a4b2c3d4e5f6g7h8i9j0k1',
      name: 'Transport Express 1',
      email: 'demo1@example.com',
      score: 85,
      level: 'referenced',
      affretIA: true
    },
    {
      id: '65a4b2c3d4e5f6g7h8i9j0k2',
      name: 'Logistique Rapide 2',
      email: 'demo2@example.com',
      score: 72,
      level: 'referenced',
      affretIA: true
    },
    {
      id: '65a4b2c3d4e5f6g7h8i9j0k3',
      name: 'Fret International 3',
      email: 'demo3@example.com',
      score: 90,
      level: 'referenced',
      affretIA: true
    }
  ];

  for (const carrier of carriers) {
    await demoCarrierCreation(carrier);
    await sleep(500);
  }

  printHeader('RAPPORT FINAL');

  console.log(`${colors.bold}Statistiques Globales:${colors.reset}\n`);
  printSuccess(`Carriers créés: 3`);
  printSuccess(`Score moyen: 82.3/100`);
  printSuccess(`Éligibles Affret.IA: 3/3`);
  printSuccess(`Documents uploadés: 18`);

  console.log(`\n${colors.bold}Détails par Carrier:${colors.reset}\n`);

  carriers.forEach((carrier, index) => {
    console.log(`${colors.green}✅ ${index + 1}. ${carrier.name}${colors.reset}`);
    console.log(`   Email: ${carrier.email}`);
    console.log(`   Score: ${carrier.score}/100 | Niveau: ${carrier.level}`);
    console.log(`   Documents: 6/6 vérifiés`);
    console.log(`   Affret.IA: ${carrier.affretIA ? 'Oui' : 'Non'}`);
    console.log('');
  });

  console.log(`${colors.cyan}${'━'.repeat(60)}${colors.reset}\n`);

  printSuccess('Rapport sauvegardé: scripts/invite-report-2024-02-01T22-30-00.json');

  console.log('');
  printSuccess('Démonstration terminée avec succès !');
  console.log('');

  console.log(`${colors.bold}${colors.cyan}Pour exécuter le script réel:${colors.reset}`);
  console.log(`${colors.yellow}node scripts/invite-test-carriers.cjs${colors.reset}\n`);

  console.log(`${colors.bold}${colors.cyan}Documentation:${colors.reset}`);
  console.log(`${colors.blue}- README: scripts/README-invite-test-carriers.md${colors.reset}`);
  console.log(`${colors.blue}- Exemples: scripts/EXEMPLE-RAPPORT.md${colors.reset}`);
  console.log(`${colors.blue}- Index: scripts/INDEX-SCRIPTS.md${colors.reset}\n`);
}

if (require.main === module) {
  runDemo().catch(error => {
    console.error(`${colors.red}Erreur:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = { runDemo };
