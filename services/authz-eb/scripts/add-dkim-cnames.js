#!/usr/bin/env node

/**
 * Script pour ajouter automatiquement les enregistrements CNAME DKIM
 * Récupère les tokens DKIM depuis AWS SES et les ajoute dans le DNS via API OVH
 */

const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DOMAINE = 'symphonia-controltower.com';
const AWS_REGION = 'eu-central-1';

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

async function getDkimTokensFromAWS() {
  try {
    printInfo('Récupération des tokens DKIM depuis AWS SES...');

    const command = `aws ses get-identity-dkim-attributes --identities ${DOMAINE} --region ${AWS_REGION} --output json`;
    const output = execSync(command, { encoding: 'utf8' });
    const data = JSON.parse(output);

    const dkimAttr = data.DkimAttributes[DOMAINE];

    if (!dkimAttr) {
      throw new Error(`Domaine ${DOMAINE} non trouvé dans AWS SES`);
    }

    console.log(`\n  ${colors.bold}Status DKIM AWS SES:${colors.reset}`);
    console.log(`    Activé: ${dkimAttr.DkimEnabled ? colors.green + 'Oui' : colors.red + 'Non'}${colors.reset}`);
    console.log(`    Status: ${dkimAttr.DkimVerificationStatus === 'Success' ? colors.green : colors.yellow}${dkimAttr.DkimVerificationStatus}${colors.reset}`);

    if (!dkimAttr.DkimEnabled) {
      throw new Error('DKIM non activé. Exécutez: aws ses set-identity-dkim-enabled --identity ' + DOMAINE + ' --dkim-enabled --region ' + AWS_REGION);
    }

    if (!dkimAttr.DkimTokens || dkimAttr.DkimTokens.length === 0) {
      throw new Error('Aucun token DKIM trouvé');
    }

    printSuccess(`${dkimAttr.DkimTokens.length} tokens DKIM récupérés`);

    return dkimAttr.DkimTokens;
  } catch (error) {
    if (error.message.includes('aws: command not found')) {
      throw new Error('AWS CLI non installé. Installez avec: pip install awscli');
    }
    throw error;
  }
}

async function getExistingDkimRecords() {
  try {
    const records = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record?fieldType=CNAME`);
    const dkimRecords = [];

    for (const recordId of records) {
      const record = await callOvhApi('GET', `/domain/zone/${DOMAINE}/record/${recordId}`);

      if (record.subDomain && record.subDomain.includes('._domainkey')) {
        dkimRecords.push({
          id: recordId,
          subDomain: record.subDomain,
          target: record.target
        });
      }
    }

    return dkimRecords;
  } catch (error) {
    console.error('Erreur récupération CNAME existants:', error.message);
    return [];
  }
}

async function main() {
  console.log('\n' + colors.bold + colors.cyan + '╔══════════════════════════════════════════════════════════════╗' + colors.reset);
  console.log(colors.bold + colors.cyan + '║  Activation DKIM - symphonia-controltower.com               ║' + colors.reset);
  console.log(colors.bold + colors.cyan + '╚══════════════════════════════════════════════════════════════╝' + colors.reset + '\n');

  if (!OVH_CONFIG.appKey || !OVH_CONFIG.appSecret || !OVH_CONFIG.consumerKey) {
    printError('Credentials OVH manquantes dans .env');
    process.exit(1);
  }

  try {
    // Récupérer tokens DKIM depuis AWS
    const dkimTokens = await getDkimTokensFromAWS();

    console.log(`\n  ${colors.bold}Tokens DKIM:${colors.reset}`);
    dkimTokens.forEach((token, i) => {
      console.log(`    ${i+1}. ${colors.dim}${token}${colors.reset}`);
    });
    console.log('');

    // Vérifier les CNAME existants
    printInfo('Vérification des CNAME existants...');
    const existingRecords = await getExistingDkimRecords();

    if (existingRecords.length > 0) {
      console.log(`\n  ${colors.yellow}⚠ ${existingRecords.length} enregistrement(s) DKIM existant(s):${colors.reset}`);
      existingRecords.forEach(record => {
        console.log(`    - ${record.subDomain} → ${record.target}`);
      });

      printInfo('Suppression des anciens enregistrements...');
      for (const record of existingRecords) {
        await callOvhApi('DELETE', `/domain/zone/${DOMAINE}/record/${record.id}`);
        printSuccess(`Supprimé: ${record.subDomain}`);
      }
      console.log('');
    }

    // Ajouter les 3 nouveaux CNAME
    printInfo('Ajout des 3 enregistrements CNAME DKIM...');
    console.log('');

    for (let i = 0; i < dkimTokens.length; i++) {
      const token = dkimTokens[i];
      const subDomain = `${token}._domainkey`;
      const target = `${token}.dkim.amazonses.com.`;

      console.log(`  ${colors.bold}CNAME ${i+1}/3:${colors.reset}`);
      console.log(`    Nom:    ${colors.cyan}${subDomain}${colors.reset}`);
      console.log(`    Valeur: ${colors.cyan}${target}${colors.reset}`);

      await callOvhApi('POST', `/domain/zone/${DOMAINE}/record`, {
        fieldType: 'CNAME',
        subDomain: subDomain,
        target: target,
        ttl: 3600
      });

      printSuccess('Enregistrement créé');
      console.log('');
    }

    // Rafraîchir la zone DNS
    printInfo('Rafraîchissement de la zone DNS...');
    await callOvhApi('POST', `/domain/zone/${DOMAINE}/refresh`);
    printSuccess('Zone DNS rafraîchie');

    console.log('\n' + colors.bold + colors.green + '✅ DKIM configuré avec succès !' + colors.reset);
    console.log('\n' + colors.bold + 'Enregistrements ajoutés:' + colors.reset);

    dkimTokens.forEach((token, i) => {
      console.log(`  ${i+1}. ${token}._domainkey → ${token}.dkim.amazonses.com`);
    });

    console.log('\n' + colors.dim + '─'.repeat(60) + colors.reset);
    console.log('\n⏰ ' + colors.bold + 'Propagation DNS:' + colors.reset + ' 30-60 minutes');
    console.log('\n' + colors.bold + 'Vérification AWS SES:' + colors.reset);
    console.log('  aws ses get-identity-dkim-attributes --identities ' + DOMAINE + ' --region ' + AWS_REGION);
    console.log('\n' + colors.bold + 'Status attendu après propagation:' + colors.reset);
    console.log('  DkimVerificationStatus: ' + colors.green + 'Success' + colors.reset);
    console.log('\n' + colors.bold + 'Vérification DNS manuelle:' + colors.reset);
    dkimTokens.forEach((token, i) => {
      console.log(`  nslookup -type=CNAME ${token}._domainkey.${DOMAINE}`);
    });
    console.log('\n' + colors.bold + 'Vérification complète:' + colors.reset);
    console.log('  node scripts/verify-dns-antispam.js (dans 1 heure)');
    console.log('');

  } catch (error) {
    printError('Erreur: ' + error.message);
    console.log('\n' + colors.yellow + 'Détails:' + colors.reset);
    console.log(error.stack);
    console.log('');
    process.exit(1);
  }
}

main();
