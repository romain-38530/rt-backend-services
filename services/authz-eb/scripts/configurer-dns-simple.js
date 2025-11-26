#!/usr/bin/env node

/**
 * Configuration Automatique DNS via API OVH
 * Version simplifiée sans dépendances externes
 */

const crypto = require('crypto');
const https = require('https');
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

const DOMAINE = 'symphonia-controltower.com';

// Charger les variables d'environnement depuis .env
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    const env = {};
    lines.forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    });
    return env;
  }
  return {};
}

const env = loadEnv();

// Configuration OVH
const OVH_CONFIG = {
  endpoint: 'eu.api.ovh.com',
  appKey: env.OVH_APP_KEY || '',
  appSecret: env.OVH_APP_SECRET || '',
  consumerKey: env.OVH_CONSUMER_KEY || ''
};

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
// APPEL API OVH
// ============================================================================

function callOvhApi(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = body ? JSON.stringify(body) : '';

    // Calculer la signature
    const signature = crypto
      .createHash('sha1')
      .update([
        OVH_CONFIG.appSecret,
        OVH_CONFIG.consumerKey,
        method,
        `https://${OVH_CONFIG.endpoint}/1.0${path}`,
        bodyStr,
        timestamp
      ].join('+'))
      .digest('hex');

    const options = {
      hostname: OVH_CONFIG.endpoint,
      port: 443,
      path: `/1.0${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Ovh-Application': OVH_CONFIG.appKey,
        'X-Ovh-Consumer': OVH_CONFIG.consumerKey,
        'X-Ovh-Timestamp': timestamp,
        'X-Ovh-Signature': '$1$' + signature
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(data ? JSON.parse(data) : null);
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(bodyStr);
    }
    req.end();
  });
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
// CONFIGURATION SPF
// ============================================================================

async function configurerSPF() {
  printStep('1', 'Configuration SPF');

  // Vérifier si déjà configuré
  const spfExists = await verifierSPF();
  if (spfExists) {
    printSuccess('SPF déjà configuré correctement');
    return true;
  }

  printInfo('Configuration de SPF en cours...');

  try {
    // Récupérer les enregistrements TXT existants pour le domaine
    const records = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record?fieldType=TXT&subDomain=`);

    // Supprimer les anciens enregistrements SPF
    for (const recordId of records) {
      const record = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record/${recordId}`);
      if (record.target.includes('v=spf1')) {
        printInfo(`Suppression de l'ancien enregistrement SPF (ID: ${recordId})`);
        await callOvhApi('DELETE', `/domain/zone/${DOMAINE}/record/${recordId}`);
      }
    }

    // Ajouter le nouvel enregistrement SPF
    const spfValue = 'v=spf1 include:mx.ovh.net ~all';

    printInfo('Ajout du nouvel enregistrement SPF...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'TXT',
      subDomain: '',
      target: spfValue,
      ttl: 3600
    });

    // Rafraîchir la zone DNS
    printInfo('Rafraîchissement de la zone DNS...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);

    printSuccess('SPF configuré avec succès !');
    printInfo(`Valeur: ${spfValue}`);

    return true;

  } catch (error) {
    printError(`Erreur configuration SPF: ${error.message}`);
    return false;
  }
}

// ============================================================================
// CONFIGURATION DMARC
// ============================================================================

async function configurerDMARC() {
  printStep('2', 'Configuration DMARC');

  // Vérifier si déjà configuré
  const dmarcExists = await verifierDMARC();
  if (dmarcExists) {
    printSuccess('DMARC déjà configuré correctement');
    return true;
  }

  printInfo('Configuration de DMARC en cours...');

  try {
    // Récupérer les enregistrements TXT existants pour _dmarc
    const records = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record?fieldType=TXT&subDomain=_dmarc`);

    // Supprimer les anciens enregistrements DMARC
    for (const recordId of records) {
      printInfo(`Suppression de l'ancien enregistrement DMARC (ID: ${recordId})`);
      await callOvhApi('DELETE', `/domain/zone/${DOMAINE}/record/${recordId}`);
    }

    // Ajouter le nouvel enregistrement DMARC
    const dmarcValue = 'v=DMARC1; p=quarantine; rua=mailto:admin@symphonia-controltower.com; pct=100';

    printInfo('Ajout du nouvel enregistrement DMARC...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'TXT',
      subDomain: '_dmarc',
      target: dmarcValue,
      ttl: 3600
    });

    // Rafraîchir la zone DNS
    printInfo('Rafraîchissement de la zone DNS...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);

    printSuccess('DMARC configuré avec succès !');
    printInfo(`Valeur: ${dmarcValue}`);

    return true;

  } catch (error) {
    printError(`Erreur configuration DMARC: ${error.message}`);
    return false;
  }
}

// ============================================================================
// ACTIVATION DKIM
// ============================================================================

async function activerDKIM() {
  printStep('3', 'Activation DKIM');

  printInfo('Vérification du service email OVH...');

  try {
    // Vérifier si le service email existe
    const emailServices = await callOvhApi('GET', '/email/domain');

    if (!emailServices.includes(DOMAINE)) {
      printWarning('Service email non trouvé pour ce domaine');
      printInfo('DKIM peut être activé manuellement dans OVH Manager :');
      printInfo('https://www.ovh.com/manager/ → Web Cloud → Emails → DKIM');
      return false;
    }

    printInfo('Activation DKIM...');

    // Tenter d'activer DKIM
    try {
      await callOvhApi('POST', `/email/domain/${DOMAINE}/dkim`, {
        autoconfig: true,
        configureDkim: true
      });

      printSuccess('DKIM activé avec succès !');
      printWarning('DKIM prend 24-48h pour être complètement actif');
      printInfo('Les enregistrements DNS sont ajoutés automatiquement par OVH');

      return true;

    } catch (error) {
      if (error.message.includes('already')) {
        printSuccess('DKIM déjà activé');
        return true;
      }
      throw error;
    }

  } catch (error) {
    printWarning(`DKIM non configuré automatiquement: ${error.message}`);
    printInfo('Vous pouvez activer DKIM manuellement :');
    printInfo('https://www.ovh.com/manager/ → Web Cloud → Emails → DKIM');
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
  await new Promise(resolve => setTimeout(resolve, 2000));
  const spfOk = await verifierSPF();
  if (spfOk) {
    printSuccess('SPF configuré et actif');
  } else {
    printWarning('SPF pas encore visible (propagation en cours - 1-2h)');
  }

  // DMARC
  printInfo('Vérification DMARC...');
  const dmarcOk = await verifierDMARC();
  if (dmarcOk) {
    printSuccess('DMARC configuré et actif');
  } else {
    printWarning('DMARC pas encore visible (propagation en cours - 1-2h)');
  }

  const score = (spfOk ? 1 : 0) + (dmarcOk ? 1 : 0);

  console.log(`\n${colors.bold}Score DNS : ${score}/2 (+ DKIM en cours - 24-48h)${colors.reset}\n`);

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

  // Vérifier les credentials
  if (!OVH_CONFIG.appKey || !OVH_CONFIG.appSecret || !OVH_CONFIG.consumerKey) {
    printError('Credentials OVH API manquants !');
    console.log('\nAssurez-vous que ces variables sont définies dans .env :');
    console.log('  - OVH_APP_KEY');
    console.log('  - OVH_APP_SECRET');
    console.log('  - OVH_CONSUMER_KEY\n');
    process.exit(1);
  }

  printInfo('Connexion à l\'API OVH...');
  printSuccess('Credentials chargés\n');

  try {
    // Configuration SPF
    const spfOk = await configurerSPF();

    // Configuration DMARC
    const dmarcOk = await configurerDMARC();

    // Activation DKIM
    const dkimOk = await activerDKIM();

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
