#!/usr/bin/env node

/**
 * Assistant Interactif de Configuration DNS
 *
 * Ce script vous guide pas à pas pour configurer SPF, DKIM et DMARC
 * Il vérifie en temps réel si vos enregistrements sont bien configurés
 */

const dns = require('dns').promises;
const readline = require('readline');

const DOMAINE = 'symphonia-controltower.com';

// Couleurs
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

// Interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Fonction pour poser une question
function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Fonction pour attendre une touche
function waitForKey(message = '\nAppuyez sur Entrée pour continuer...') {
  return question(message);
}

// Fonctions d'affichage
function printHeader(text) {
  const line = '═'.repeat(70);
  console.log(`\n${colors.cyan}${colors.bold}${line}`);
  console.log(`  ${text}`);
  console.log(`${line}${colors.reset}\n`);
}

function printStep(number, text) {
  console.log(`\n${colors.blue}${colors.bold}ÉTAPE ${number} : ${text}${colors.reset}\n`);
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

function printBox(title, content) {
  const width = 68;
  console.log(`\n┌${'─'.repeat(width)}┐`);
  console.log(`│ ${colors.bold}${title.padEnd(width - 2)}${colors.reset}│`);
  console.log(`├${'─'.repeat(width)}┤`);
  content.forEach(line => {
    console.log(`│ ${line.padEnd(width - 2)} │`);
  });
  console.log(`└${'─'.repeat(width)}┘`);
}

// Vérification SPF
async function verifierSPF() {
  try {
    const records = await dns.resolveTxt(DOMAINE);
    const spfRecord = records.find(record => record.join('').includes('v=spf1'));

    if (spfRecord && spfRecord.join('').includes('include:mx.ovh.net')) {
      return { configured: true, record: spfRecord.join('') };
    }
    return { configured: false };
  } catch (error) {
    return { configured: false, error: error.message };
  }
}

// Vérification DKIM
async function verifierDKIM() {
  const selecteurs = ['default', 'mail', 'dkim'];

  for (const selecteur of selecteurs) {
    try {
      const query = `${selecteur}._domainkey.${DOMAINE}`;
      const records = await dns.resolveTxt(query);
      const dkimRecord = records.find(record => record.join('').includes('v=DKIM1'));

      if (dkimRecord) {
        return { configured: true, selector: selecteur };
      }
    } catch (error) {
      // Continuer avec le prochain sélecteur
    }
  }

  return { configured: false };
}

// Vérification DMARC
async function verifierDMARC() {
  try {
    const query = `_dmarc.${DOMAINE}`;
    const records = await dns.resolveTxt(query);
    const dmarcRecord = records.find(record => record.join('').includes('v=DMARC1'));

    if (dmarcRecord) {
      return { configured: true, record: dmarcRecord.join('') };
    }
    return { configured: false };
  } catch (error) {
    return { configured: false, error: error.message };
  }
}

// ============================================================================
// CONFIGURATION SPF
// ============================================================================

async function configurerSPF() {
  printStep('1/3', 'Configuration SPF (5 minutes)');

  console.log('Le SPF (Sender Policy Framework) autorise OVH à envoyer des emails');
  console.log('pour votre domaine symphonia-controltower.com\n');

  // Vérifier si déjà configuré
  printInfo('Vérification de la configuration actuelle...\n');
  const spfStatus = await verifierSPF();

  if (spfStatus.configured) {
    printSuccess('SPF déjà configuré correctement !');
    console.log(`${colors.green}   Valeur actuelle: ${spfStatus.record}${colors.reset}\n`);
    await waitForKey();
    return true;
  }

  printWarning('SPF non configuré. Configuration nécessaire.\n');

  // Afficher les instructions
  printBox('VALEUR À AJOUTER DANS VOTRE GESTIONNAIRE DNS', [
    '',
    `Nom/Host:  ${colors.bold}@${colors.reset}                                           `,
    `Type:      ${colors.bold}TXT${colors.reset}                                         `,
    `Valeur:    ${colors.bold}v=spf1 include:mx.ovh.net ~all${colors.reset}             `,
    `TTL:       ${colors.bold}3600${colors.reset}                                        `,
    ''
  ]);

  console.log('\n' + colors.bold + 'Instructions détaillées :' + colors.reset);
  console.log('\n1. Connectez-vous à votre gestionnaire DNS');
  console.log('   OVH: https://www.ovh.com/manager/');
  console.log('   → Web Cloud → Domaines → symphonia-controltower.com → Zone DNS\n');

  console.log('2. Cliquez sur "Ajouter une entrée"');
  console.log('   → Sélectionnez "TXT"\n');

  console.log('3. Remplissez les champs :');
  console.log(`   • Sous-domaine: ${colors.bold}@${colors.reset} (ou laissez vide)`);
  console.log(`   • Valeur: ${colors.bold}v=spf1 include:mx.ovh.net ~all${colors.reset}\n`);

  console.log('4. Cliquez sur "Valider" puis "Confirmer"\n');

  await waitForKey('\nAppuyez sur Entrée une fois que vous avez ajouté l\'enregistrement...');

  // Attendre et vérifier
  console.log('\n' + colors.yellow + 'Vérification en cours...' + colors.reset);
  console.log('(La propagation DNS peut prendre quelques minutes)\n');

  let tentatives = 0;
  const maxTentatives = 3;

  while (tentatives < maxTentatives) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await verifierSPF();

    if (status.configured) {
      printSuccess('SPF configuré avec succès !');
      console.log(`${colors.green}   Valeur: ${status.record}${colors.reset}\n`);
      return true;
    }

    tentatives++;
    if (tentatives < maxTentatives) {
      printInfo(`Tentative ${tentatives}/${maxTentatives} - Pas encore visible...`);
    }
  }

  printWarning('La propagation DNS prend du temps (jusqu\'à 1-2 heures).');
  printInfo('Nous allons continuer avec DKIM et DMARC.');
  printInfo('Vous pourrez vérifier plus tard avec: node scripts/verifier-dns.js\n');

  await waitForKey();
  return false;
}

// ============================================================================
// CONFIGURATION DKIM
// ============================================================================

async function configurerDKIM() {
  printStep('2/3', 'Configuration DKIM (10 minutes)');

  console.log('Le DKIM (DomainKeys Identified Mail) signe cryptographiquement vos emails.');
  console.log('Cette étape nécessite d\'activer DKIM dans l\'espace client OVH.\n');

  // Vérifier si déjà configuré
  printInfo('Vérification de la configuration actuelle...\n');
  const dkimStatus = await verifierDKIM();

  if (dkimStatus.configured) {
    printSuccess(`DKIM déjà configuré correctement ! (Sélecteur: ${dkimStatus.selector})`);
    await waitForKey();
    return true;
  }

  printWarning('DKIM non configuré. Configuration nécessaire.\n');

  // Instructions OVH
  console.log(colors.bold + 'PARTIE A : Activer DKIM sur OVH (OBLIGATOIRE)' + colors.reset);
  console.log('\n1. Connectez-vous à OVH Manager');
  console.log('   https://www.ovh.com/manager/\n');

  console.log('2. Allez dans "Web Cloud" → "Emails"\n');

  console.log('3. Cliquez sur votre domaine: symphonia-controltower.com\n');

  console.log('4. Dans l\'onglet "DKIM", cliquez sur "Activer DKIM"\n');

  console.log('5. OVH va générer les enregistrements DNS automatiquement');
  console.log('   ou vous fournir les valeurs à ajouter manuellement.\n');

  const reponse1 = await question('Avez-vous activé DKIM sur OVH Manager ? (o/n) : ');

  if (reponse1.toLowerCase() !== 'o') {
    printWarning('Vous devez d\'abord activer DKIM sur OVH.');
    printInfo('Relancez ce script une fois DKIM activé.\n');
    return false;
  }

  console.log('\n' + colors.bold + 'PARTIE B : Vérification des enregistrements DNS' + colors.reset + '\n');
  console.log('Si votre DNS est hébergé chez OVH, les enregistrements sont ajoutés automatiquement.');
  console.log('Si votre DNS est ailleurs (Cloudflare, AWS, etc.), vous devez les ajouter manuellement.\n');

  const reponse2 = await question('Votre DNS est-il hébergé chez OVH ? (o/n) : ');

  if (reponse2.toLowerCase() === 'o') {
    printInfo('DNS chez OVH : les enregistrements devraient être ajoutés automatiquement.');
    printWarning('DKIM prend 24-48 heures pour être complètement actif.\n');
  } else {
    console.log('\nDNS externe : Vous devez copier les enregistrements depuis OVH Manager');
    console.log('et les ajouter dans votre gestionnaire DNS.\n');

    printBox('OÙ TROUVER LES ENREGISTREMENTS DKIM', [
      '',
      '1. OVH Manager → Web Cloud → Emails',
      '2. Cliquez sur symphonia-controltower.com',
      '3. Onglet DKIM → Voir les enregistrements DNS',
      '4. Copiez EXACTEMENT les valeurs fournies',
      '5. Ajoutez-les dans votre gestionnaire DNS',
      ''
    ]);

    await waitForKey('\nAppuyez sur Entrée une fois les enregistrements ajoutés...');
  }

  // Vérification
  console.log('\n' + colors.yellow + 'Vérification en cours...' + colors.reset + '\n');

  await new Promise(resolve => setTimeout(resolve, 2000));
  const status = await verifierDKIM();

  if (status.configured) {
    printSuccess(`DKIM configuré avec succès ! (Sélecteur: ${status.selector})`);
    return true;
  } else {
    printWarning('DKIM pas encore visible dans les DNS.');
    printInfo('C\'est normal ! DKIM prend 24-48 heures pour se propager.');
    printInfo('Vérifiez demain avec: node scripts/verifier-dns.js\n');
  }

  await waitForKey();
  return false;
}

// ============================================================================
// CONFIGURATION DMARC
// ============================================================================

async function configurerDMARC() {
  printStep('3/3', 'Configuration DMARC (5 minutes)');

  console.log('Le DMARC (Domain-based Message Authentication) définit la politique');
  console.log('de gestion des emails échouant SPF/DKIM.\n');

  // Vérifier si déjà configuré
  printInfo('Vérification de la configuration actuelle...\n');
  const dmarcStatus = await verifierDMARC();

  if (dmarcStatus.configured) {
    printSuccess('DMARC déjà configuré correctement !');
    console.log(`${colors.green}   Valeur actuelle: ${dmarcStatus.record}${colors.reset}\n`);
    await waitForKey();
    return true;
  }

  printWarning('DMARC non configuré. Configuration nécessaire.\n');

  // Afficher les instructions
  printBox('VALEUR À AJOUTER DANS VOTRE GESTIONNAIRE DNS', [
    '',
    `Nom/Host:  ${colors.bold}_dmarc${colors.reset}                                      `,
    `Type:      ${colors.bold}TXT${colors.reset}                                         `,
    `Valeur:    ${colors.bold}v=DMARC1; p=quarantine;${colors.reset}                    `,
    `           ${colors.bold}rua=mailto:admin@symphonia-controltower.com;${colors.reset}`,
    `           ${colors.bold}pct=100${colors.reset}                                    `,
    `TTL:       ${colors.bold}3600${colors.reset}                                        `,
    ''
  ]);

  console.log('\n' + colors.bold + 'Instructions détaillées :' + colors.reset);
  console.log('\n1. Retournez dans votre gestionnaire DNS (même endroit que SPF)\n');

  console.log('2. Cliquez sur "Ajouter une entrée" → Sélectionnez "TXT"\n');

  console.log('3. Remplissez les champs :');
  console.log(`   • Sous-domaine: ${colors.bold}_dmarc${colors.reset}`);
  console.log(`   • Valeur: ${colors.bold}v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100${colors.reset}\n`);

  console.log('4. Cliquez sur "Valider" puis "Confirmer"\n');

  printInfo('Note: Assurez-vous que l\'adresse admin@symphonia-controltower.com existe');
  printInfo('      pour recevoir les rapports DMARC.\n');

  await waitForKey('\nAppuyez sur Entrée une fois que vous avez ajouté l\'enregistrement...');

  // Vérification
  console.log('\n' + colors.yellow + 'Vérification en cours...' + colors.reset + '\n');

  let tentatives = 0;
  const maxTentatives = 3;

  while (tentatives < maxTentatives) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const status = await verifierDMARC();

    if (status.configured) {
      printSuccess('DMARC configuré avec succès !');
      console.log(`${colors.green}   Valeur: ${status.record}${colors.reset}\n`);
      return true;
    }

    tentatives++;
    if (tentatives < maxTentatives) {
      printInfo(`Tentative ${tentatives}/${maxTentatives} - Pas encore visible...`);
    }
  }

  printWarning('La propagation DNS prend du temps (jusqu\'à 1-2 heures).');
  printInfo('Vous pourrez vérifier plus tard avec: node scripts/verifier-dns.js\n');

  await waitForKey();
  return false;
}

// ============================================================================
// RAPPORT FINAL
// ============================================================================

async function afficherRapportFinal(spf, dkim, dmarc) {
  printHeader('RAPPORT FINAL DE CONFIGURATION');

  console.log('Résumé de votre configuration DNS :\n');

  // SPF
  if (spf) {
    printSuccess('SPF : Configuré et vérifié');
  } else {
    printWarning('SPF : Configuré mais pas encore propagé (attendre 1-2h)');
  }

  // DKIM
  if (dkim) {
    printSuccess('DKIM : Configuré et vérifié');
  } else {
    printWarning('DKIM : En cours d\'activation (attendre 24-48h)');
  }

  // DMARC
  if (dmarc) {
    printSuccess('DMARC : Configuré et vérifié');
  } else {
    printWarning('DMARC : Configuré mais pas encore propagé (attendre 1-2h)');
  }

  const score = (spf ? 1 : 0) + (dkim ? 1 : 0) + (dmarc ? 1 : 0);

  console.log(`\n${colors.bold}Score de configuration : ${score}/3${colors.reset}\n`);

  if (score === 3) {
    printSuccess('EXCELLENT ! Toutes les configurations DNS sont actives.');
    console.log('\nVotre système est prêt pour une délivrabilité optimale (>90%).');
    console.log('\nProchaines étapes :');
    console.log('  1. Testez avec: node scripts/test-systeme-complet.js --send-test-email');
    console.log('  2. Invitez un premier transporteur test');
    console.log('  3. Vérifiez que les emails arrivent en boîte de réception\n');
  } else if (score >= 1) {
    printInfo('Configuration partiellement effectuée.');
    console.log('\nLes DNS prennent du temps à se propager :');
    console.log('  • SPF et DMARC : 1-2 heures');
    console.log('  • DKIM : 24-48 heures\n');
    console.log('Vérifiez demain avec : node scripts/verifier-dns.js\n');
  } else {
    printWarning('Aucune configuration DNS détectée.');
    console.log('\nAssurez-vous d\'avoir bien ajouté les enregistrements.');
    console.log('Attendez 1-2 heures puis relancez : node scripts/assistant-dns.js\n');
  }

  console.log(colors.cyan + '━'.repeat(70) + colors.reset);
  console.log('\nDocumentation complète disponible dans :');
  console.log('  • CONFIGURATION_DNS_ETAPES.md');
  console.log('  • GUIDE_CONFIGURATION_DNS.md');
  console.log('  • ENREGISTREMENTS_DNS_TEMPLATE.md\n');
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  printHeader('ASSISTANT DE CONFIGURATION DNS - SYMPHONI.A');

  console.log('Cet assistant va vous guider pour configurer :');
  console.log('  1. SPF   (5 minutes)');
  console.log('  2. DKIM  (10 minutes)');
  console.log('  3. DMARC (5 minutes)\n');

  console.log(`Domaine : ${colors.bold}${DOMAINE}${colors.reset}\n`);

  printInfo('Vous aurez besoin d\'un accès à votre gestionnaire DNS (OVH Manager).\n');

  const ready = await question('Êtes-vous prêt à commencer ? (o/n) : ');

  if (ready.toLowerCase() !== 'o') {
    console.log('\nVous pouvez relancer ce script quand vous êtes prêt :');
    console.log('  node scripts/assistant-dns.js\n');
    rl.close();
    return;
  }

  try {
    // Configuration SPF
    const spfOk = await configurerSPF();

    // Configuration DKIM
    const dkimOk = await configurerDKIM();

    // Configuration DMARC
    const dmarcOk = await configurerDMARC();

    // Rapport final
    await afficherRapportFinal(spfOk, dkimOk, dmarcOk);

  } catch (error) {
    printError(`Erreur : ${error.message}`);
    console.error(error);
  } finally {
    rl.close();
  }
}

// Lancer le script
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
    rl.close();
    process.exit(1);
  });
}

module.exports = { main };
