#!/usr/bin/env node

/**
 * Script pour corriger l'enregistrement SPF
 * Remplace mx.ovh.com par mx.ovh.net
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
  bold: '\x1b[1m'
};

function printSuccess(text) {
  console.log(`${colors.green}✓${colors.reset} ${text}`);
}

function printInfo(text) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${text}`);
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
  console.log('\n' + colors.bold + 'Correction de l\'enregistrement SPF' + colors.reset + '\n');

  try {
    // Récupérer tous les enregistrements TXT
    printInfo('Recherche des enregistrements SPF...');
    const records = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record?fieldType=TXT&subDomain=`);

    // Trouver et supprimer l'ancien SPF
    for (const recordId of records) {
      const record = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record/${recordId}`);

      if (record.target.includes('v=spf1')) {
        printInfo(`Ancien SPF trouvé: ${record.target}`);
        printInfo(`Suppression de l'enregistrement ID: ${recordId}...`);
        await callOvhApi('DELETE', `/domain/zone/${DOMAINE}/record/${recordId}`);
        printSuccess('Ancien SPF supprimé');
      }
    }

    // Ajouter le nouveau SPF correct
    const nouveauSPF = 'v=spf1 include:mx.ovh.net ~all';
    printInfo(`Ajout du nouveau SPF: ${nouveauSPF}...`);

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

    console.log('\n' + colors.green + colors.bold + '✅ SPF corrigé avec succès !' + colors.reset);
    console.log('\nValeur SPF actuelle: ' + nouveauSPF);
    console.log('\n⏰ Propagation: 1-2 heures');
    console.log('\nVérifiez avec: node scripts/verifier-dns.js\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
}

main();
