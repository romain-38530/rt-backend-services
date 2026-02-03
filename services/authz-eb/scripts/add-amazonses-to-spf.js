#!/usr/bin/env node

/**
 * Script pour ajouter AWS SES au SPF existant
 * Ajoute "include:amazonses.com" au SPF actuel sans supprimer les autres includes
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const DOMAINE = 'symphonia-controltower.com';

// Charger les variables d'environnement
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

const OVH_CONFIG = {
  endpoint: 'eu.api.ovh.com',
  appKey: env.OVH_APP_KEY || '',
  appSecret: env.OVH_APP_SECRET || '',
  consumerKey: env.OVH_CONSUMER_KEY || ''
};

// Couleurs
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  bold: '\x1b[1m'
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

function callOvhApi(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyStr = body ? JSON.stringify(body) : '';

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
      res.on('data', (chunk) => { data += chunk; });
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

    req.on('error', (error) => reject(error));
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('\n' + colors.bold + '╔══════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bold + '║  Ajout AWS SES au SPF - symphonia-controltower.com      ║' + colors.reset);
  console.log(colors.bold + '╚══════════════════════════════════════════════════════════╝' + colors.reset + '\n');

  // Vérifier les credentials OVH
  if (!OVH_CONFIG.appKey || !OVH_CONFIG.appSecret || !OVH_CONFIG.consumerKey) {
    printError('Credentials OVH manquantes dans .env');
    console.log('\nVérifiez que les variables suivantes sont définies:');
    console.log('  - OVH_APP_KEY');
    console.log('  - OVH_APP_SECRET');
    console.log('  - OVH_CONSUMER_KEY\n');
    process.exit(1);
  }

  try {
    // Récupérer tous les enregistrements TXT
    printInfo('Recherche de l\'enregistrement SPF actuel...');
    const records = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record?fieldType=TXT&subDomain=`);

    let spfRecord = null;
    let spfRecordId = null;

    // Trouver le SPF existant
    for (const recordId of records) {
      const record = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record/${recordId}`);

      if (record.target.includes('v=spf1')) {
        spfRecord = record;
        spfRecordId = recordId;
        break;
      }
    }

    if (!spfRecord) {
      printError('Aucun enregistrement SPF trouvé');
      console.log('\nCréation d\'un nouveau SPF...\n');

      const nouveauSPF = 'v=spf1 include:mx.ovh.com include:spf.protection.outlook.com include:amazonses.com ~all';

      await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
        fieldType: 'TXT',
        subDomain: '',
        target: nouveauSPF,
        ttl: 3600
      });

      printSuccess('Nouveau SPF créé avec AWS SES');

      // Rafraîchir la zone
      printInfo('Rafraîchissement de la zone DNS...');
      await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);
      printSuccess('Zone DNS rafraîchie');

      console.log('\n' + colors.bold + colors.green + '✅ SPF créé avec succès !' + colors.reset);
      console.log('\nValeur SPF: ' + nouveauSPF);
      console.log('\n⏰ Propagation: 10-30 minutes');
      console.log('\nVérifiez avec: nslookup -type=TXT symphonia-controltower.com\n');

      return;
    }

    // Afficher le SPF actuel
    console.log('\n' + colors.bold + 'SPF actuel:' + colors.reset);
    console.log('  ' + spfRecord.target);
    console.log('');

    // Vérifier si amazonses.com est déjà présent
    if (spfRecord.target.includes('amazonses.com')) {
      printWarning('AWS SES (amazonses.com) est déjà présent dans le SPF');
      console.log('\n' + colors.green + colors.bold + '✅ Aucune modification nécessaire' + colors.reset + '\n');
      return;
    }

    // Créer le nouveau SPF en ajoutant amazonses.com avant ~all
    const ancienSPF = spfRecord.target;
    let nouveauSPF;

    if (ancienSPF.includes('~all')) {
      nouveauSPF = ancienSPF.replace('~all', 'include:amazonses.com ~all');
    } else if (ancienSPF.includes('-all')) {
      nouveauSPF = ancienSPF.replace('-all', 'include:amazonses.com -all');
    } else {
      // Pas de "all" final, ajouter à la fin
      nouveauSPF = ancienSPF.trim() + ' include:amazonses.com ~all';
    }

    console.log(colors.bold + 'Nouveau SPF:' + colors.reset);
    console.log('  ' + nouveauSPF);
    console.log('');

    // Demander confirmation
    printInfo('Modification de l\'enregistrement SPF...');

    // Supprimer l'ancien enregistrement
    await callOvhApi('DELETE', `/domain/zone/${DOMAINE}/record/${spfRecordId}`);
    printSuccess('Ancien SPF supprimé');

    // Ajouter le nouveau SPF
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'TXT',
      subDomain: '',
      target: nouveauSPF,
      ttl: 3600
    });
    printSuccess('Nouveau SPF ajouté');

    // Rafraîchir la zone
    printInfo('Rafraîchissement de la zone DNS...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);
    printSuccess('Zone DNS rafraîchie');

    console.log('\n' + colors.bold + colors.green + '✅ SPF modifié avec succès !' + colors.reset);
    console.log('\n' + colors.bold + 'Avant:' + colors.reset + ' ' + ancienSPF);
    console.log(colors.bold + 'Après:' + colors.reset + '  ' + nouveauSPF);
    console.log('\n⏰ Propagation DNS: 10-30 minutes');
    console.log('\n' + colors.bold + 'Vérification:' + colors.reset);
    console.log('  nslookup -type=TXT symphonia-controltower.com');
    console.log('\n' + colors.bold + 'Prochaine étape:' + colors.reset);
    console.log('  Activez DKIM dans AWS SES Console (eu-central-1)');
    console.log('  Guide: CORRECTION-DNS-SPF-DKIM.md\n');

  } catch (error) {
    printError('Erreur: ' + error.message);
    console.log('\n' + colors.yellow + 'Vérifiez:' + colors.reset);
    console.log('  1. Les credentials OVH dans .env sont valides');
    console.log('  2. Le consumer key a les droits sur /domain/zone/*');
    console.log('  3. Votre connexion internet\n');
    process.exit(1);
  }
}

main();
