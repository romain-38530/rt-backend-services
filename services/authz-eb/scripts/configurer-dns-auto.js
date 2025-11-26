#!/usr/bin/env node

/**
 * Configuration Automatique DNS via API OVH
 *
 * Ce script configure automatiquement SPF, DKIM et DMARC
 * en utilisant l'API OVH (pas besoin de passer par l'interface web)
 *
 * Prérequis: npm install ovh --save-dev
 */

const ovh = require('ovh');
const dns = require('dns').promises;

const DOMAINE = 'symphonia-controltower.com';

// Couleurs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Fonctions d'affichage
function printHeader(text) {
  const line = '═'.repeat(70);
  console.log(`\n${colors.cyan}${colors.bold}${line}`);
  console.log(`  ${text}`);
  console.log(`${line}${colors.reset}\n`);
}

function printStep(number, text) {
  console.log(`\n${colors.blue}${colors.bold}▶ Étape ${number}/3 : ${text}${colors.reset}\n`);
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

// ============================================================================
// INITIALISATION API OVH
// ============================================================================

function initOvhApi() {
  // Credentials depuis variables d'environnement ou fichier .ovhrc
  const credentials = {
    endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
    appKey: process.env.OVH_APP_KEY || '',
    appSecret: process.env.OVH_APP_SECRET || '',
    consumerKey: process.env.OVH_CONSUMER_KEY || ''
  };

  if (!credentials.appKey || !credentials.appSecret || !credentials.consumerKey) {
    printError('Credentials OVH API manquants !');
    console.log('\nVous devez définir ces variables d\'environnement :');
    console.log('  - OVH_ENDPOINT (ex: ovh-eu)');
    console.log('  - OVH_APP_KEY');
    console.log('  - OVH_APP_SECRET');
    console.log('  - OVH_CONSUMER_KEY\n');
    console.log('Ou créer un fichier .ovhrc à la racine du projet.\n');
    console.log('Pour obtenir vos credentials : https://eu.api.ovh.com/createApp/\n');
    process.exit(1);
  }

  return ovh(credentials);
}

// ============================================================================
// VÉRIFICATION DNS
// ============================================================================

async function verifierSPF() {
  try {
    const records = await dns.resolveTxt(DOMAINE);
    const spfRecord = records.find(record => record.join('').includes('v=spf1'));
    return spfRecord && spfRecord.join('').includes('include:mx.ovh.net');
  } catch (error) {
    return false;
  }
}

async function verifierDMARC() {
  try {
    const query = `_dmarc.${DOMAINE}`;
    const records = await dns.resolveTxt(query);
    const dmarcRecord = records.find(record => record.join('').includes('v=DMARC1'));
    return !!dmarcRecord;
  } catch (error) {
    return false;
  }
}

// ============================================================================
// RÉCUPÉRATION ZONE ID
// ============================================================================

async function getZoneId(ovhApi, domaine) {
  try {
    const zones = await ovhApi.requestPromised('GET', '/domain/zone');
    if (zones.includes(domaine)) {
      return domaine; // Le zone ID est le domaine lui-même
    }
    throw new Error(`Zone DNS non trouvée pour ${domaine}`);
  } catch (error) {
    throw new Error(`Erreur récupération zone: ${error.message}`);
  }
}

// ============================================================================
// RÉCUPÉRATION DES ENREGISTREMENTS EXISTANTS
// ============================================================================

async function getExistingRecords(ovhApi, zoneName, fieldType, subDomain) {
  try {
    const recordIds = await ovhApi.requestPromised('GET', `/domain/zone/${zoneName}/record`, {
      fieldType: fieldType,
      subDomain: subDomain
    });
    return recordIds;
  } catch (error) {
    return [];
  }
}

// ============================================================================
// CONFIGURATION SPF
// ============================================================================

async function configurerSPF(ovhApi) {
  printStep('1', 'Configuration SPF');

  // Vérifier si déjà configuré
  const spfExists = await verifierSPF();
  if (spfExists) {
    printSuccess('SPF déjà configuré correctement');
    return true;
  }

  printInfo('Configuration de SPF en cours...');

  try {
    const zoneName = await getZoneId(ovhApi, DOMAINE);

    // Vérifier si un enregistrement SPF existe déjà
    const existingRecords = await getExistingRecords(ovhApi, zoneName, 'TXT', '');

    // Supprimer les anciens enregistrements SPF
    for (const recordId of existingRecords) {
      const record = await ovhApi.requestPromised('GET', `/domain/zone/${zoneName}/record/${recordId}`);
      if (record.target.includes('v=spf1')) {
        printInfo(`Suppression de l'ancien enregistrement SPF (ID: ${recordId})`);
        await ovhApi.requestPromised('DELETE', `/domain/zone/${zoneName}/record/${recordId}`);
      }
    }

    // Ajouter le nouvel enregistrement SPF
    const spfValue = 'v=spf1 include:mx.ovh.net ~all';

    printInfo('Ajout du nouvel enregistrement SPF...');
    await ovhApi.requestPromised('POST', `/domain/zone/${zoneName}/record`, {
      fieldType: 'TXT',
      subDomain: '',
      target: spfValue,
      ttl: 3600
    });

    // Rafraîchir la zone DNS
    printInfo('Rafraîchissement de la zone DNS...');
    await ovhApi.requestPromised('POST', `/domain/zone/${zoneName}/refresh`);

    printSuccess('SPF configuré avec succès !');
    printInfo(`Valeur: ${spfValue}`);

    return true;

  } catch (error) {
    printError(`Erreur configuration SPF: ${error.message}`);
    return false;
  }
}

// ============================================================================
// CONFIGURATION DKIM
// ============================================================================

async function configurerDKIM(ovhApi) {
  printStep('2', 'Configuration DKIM');

  printInfo('Activation DKIM sur les emails OVH...');

  try {
    // Récupérer les services email pour ce domaine
    printInfo('Recherche des services email...');
    const emailServices = await ovhApi.requestPromised('GET', '/email/domain');

    if (!emailServices.includes(DOMAINE)) {
      printWarning('Service email non trouvé pour ce domaine');
      printInfo('Vous devez d\'abord configurer un service email OVH');
      return false;
    }

    // Vérifier le statut DKIM
    printInfo('Vérification du statut DKIM...');
    let dkimStatus;
    try {
      dkimStatus = await ovhApi.requestPromised('GET', `/email/domain/${DOMAINE}/dkim`);
    } catch (error) {
      // DKIM pas encore configuré
      dkimStatus = null;
    }

    if (dkimStatus && dkimStatus.status === 'enabled') {
      printSuccess('DKIM déjà activé');
      return true;
    }

    // Activer DKIM
    printInfo('Activation DKIM...');
    await ovhApi.requestPromised('POST', `/email/domain/${DOMAINE}/dkim`, {
      autoconfig: true,
      configureDkim: true
    });

    printSuccess('DKIM activé avec succès !');
    printWarning('DKIM prend 24-48h pour être complètement actif');
    printInfo('Les enregistrements DNS sont ajoutés automatiquement par OVH');

    return true;

  } catch (error) {
    printError(`Erreur configuration DKIM: ${error.message}`);

    if (error.message.includes('404')) {
      printInfo('Le service email n\'existe peut-être pas encore');
      printInfo('Vous pouvez activer DKIM manuellement dans OVH Manager :');
      console.log('  https://www.ovh.com/manager/ → Web Cloud → Emails → DKIM');
    }

    return false;
  }
}

// ============================================================================
// CONFIGURATION DMARC
// ============================================================================

async function configurerDMARC(ovhApi) {
  printStep('3', 'Configuration DMARC');

  // Vérifier si déjà configuré
  const dmarcExists = await verifierDMARC();
  if (dmarcExists) {
    printSuccess('DMARC déjà configuré correctement');
    return true;
  }

  printInfo('Configuration de DMARC en cours...');

  try {
    const zoneName = await getZoneId(ovhApi, DOMAINE);

    // Vérifier si un enregistrement DMARC existe déjà
    const existingRecords = await getExistingRecords(ovhApi, zoneName, 'TXT', '_dmarc');

    // Supprimer les anciens enregistrements DMARC
    for (const recordId of existingRecords) {
      printInfo(`Suppression de l'ancien enregistrement DMARC (ID: ${recordId})`);
      await ovhApi.requestPromised('DELETE', `/domain/zone/${zoneName}/record/${recordId}`);
    }

    // Ajouter le nouvel enregistrement DMARC
    const dmarcValue = 'v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100';

    printInfo('Ajout du nouvel enregistrement DMARC...');
    await ovhApi.requestPromised('POST', `/domain/zone/${zoneName}/record`, {
      fieldType: 'TXT',
      subDomain: '_dmarc',
      target: dmarcValue,
      ttl: 3600
    });

    // Rafraîchir la zone DNS
    printInfo('Rafraîchissement de la zone DNS...');
    await ovhApi.requestPromised('POST', `/domain/zone/${zoneName}/refresh`);

    printSuccess('DMARC configuré avec succès !');
    printInfo(`Valeur: ${dmarcValue}`);

    return true;

  } catch (error) {
    printError(`Erreur configuration DMARC: ${error.message}`);
    return false;
  }
}

// ============================================================================
// VÉRIFICATION FINALE
// ============================================================================

async function verifierConfiguration() {
  printHeader('VÉRIFICATION DE LA CONFIGURATION');

  console.log('Vérification des enregistrements DNS...\n');

  // SPF
  printInfo('Vérification SPF...');
  const spfOk = await verifierSPF();
  if (spfOk) {
    printSuccess('SPF configuré et actif');
  } else {
    printWarning('SPF pas encore visible (propagation en cours)');
  }

  // DMARC
  printInfo('Vérification DMARC...');
  const dmarcOk = await verifierDMARC();
  if (dmarcOk) {
    printSuccess('DMARC configuré et actif');
  } else {
    printWarning('DMARC pas encore visible (propagation en cours)');
  }

  const score = (spfOk ? 1 : 0) + (dmarcOk ? 1 : 0);

  console.log(`\n${colors.bold}Score DNS : ${score}/2 (DKIM nécessite 24-48h)${colors.reset}\n`);

  if (score === 2) {
    printSuccess('Configuration DNS réussie !');
    console.log('\nProchaines étapes :');
    console.log('  1. Attendre 24-48h pour activation complète de DKIM');
    console.log('  2. Vérifier avec: node scripts/verifier-dns.js');
    console.log('  3. Tester avec: node scripts/test-systeme-complet.js --send-test-email\n');
  } else {
    printInfo('La propagation DNS prend 1-2 heures.');
    printInfo('Vérifiez plus tard avec: node scripts/verifier-dns.js\n');
  }
}

// ============================================================================
// FONCTION PRINCIPALE
// ============================================================================

async function main() {
  printHeader('CONFIGURATION AUTOMATIQUE DNS VIA API OVH');

  console.log(`Domaine : ${colors.bold}${DOMAINE}${colors.reset}\n`);
  console.log('Ce script va configurer automatiquement :');
  console.log('  • SPF   (v=spf1 include:mx.ovh.net ~all)');
  console.log('  • DKIM  (Activation sur service email OVH)');
  console.log('  • DMARC (v=DMARC1; p=quarantine; rua=mailto:admin@...)');
  console.log('\nLes modifications sont appliquées directement via l\'API OVH.\n');

  try {
    // Initialiser API OVH
    printInfo('Connexion à l\'API OVH...');
    const ovhApi = initOvhApi();
    printSuccess('Connecté à l\'API OVH\n');

    // Configuration SPF
    const spfOk = await configurerSPF(ovhApi);

    // Configuration DKIM
    const dkimOk = await configurerDKIM(ovhApi);

    // Configuration DMARC
    const dmarcOk = await configurerDMARC(ovhApi);

    // Attendre quelques secondes pour propagation initiale
    printInfo('\nAttente de la propagation DNS (quelques secondes)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Vérification finale
    await verifierConfiguration();

    printSuccess('Configuration terminée !');

  } catch (error) {
    printError(`Erreur : ${error.message}`);
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
