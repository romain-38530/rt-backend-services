#!/usr/bin/env node

/**
 * Configuration DNS pour AWS SES via API OVH
 *
 * Ce script configure automatiquement SPF, DKIM et DMARC
 * pour la delivrabilite des emails AWS SES
 *
 * Usage: node configure-dns-aws-ses.js
 */

const ovh = require('ovh');

const DOMAINE = 'symphonia-controltower.com';

// Tokens AWS SES (generes par aws ses verify-domain-dkim)
const AWS_SES_DKIM_TOKENS = [
  'fgczi5zfgdlxnwyugnhig4et7twftzlo',
  'xboinvea7kmbr3vc3fx5dburrvtjp2by',
  'ynokzonetscm4ph2c3kstjchuptjkxmy'
];

// Token de verification du domaine AWS SES
const AWS_SES_VERIFICATION_TOKEN = 'ZcUvN76qLk2q48sybg8bpzUGRv+8iwJVZfAy0QbyHfs=';

// Credentials OVH (nouveau consumer key avec permissions DNS)
const OVH_CONFIG = {
  endpoint: 'ovh-eu',
  appKey: '7467b1935c28b05e',
  appSecret: '5dd42ebb267e3e2b97bbaa57fc8329e5',
  consumerKey: '62b0dcb9c62bdb4ae9f087edfd9b4328'
};

// Couleurs console
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(type, msg) {
  const icons = { ok: `${c.green}OK${c.reset}`, err: `${c.red}ERR${c.reset}`, info: `${c.cyan}INFO${c.reset}`, warn: `${c.yellow}WARN${c.reset}` };
  console.log(`[${icons[type] || type}] ${msg}`);
}

function header(text) {
  console.log(`\n${c.cyan}${c.bold}${'='.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'='.repeat(60)}${c.reset}\n`);
}

// ============================================================================
// FONCTIONS DNS OVH
// ============================================================================

async function listTxtRecords(client, subDomain = '') {
  try {
    const recordIds = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'TXT',
      subDomain: subDomain
    });

    const records = await Promise.all(
      recordIds.map(id => client.requestPromised('GET', `/domain/zone/${DOMAINE}/record/${id}`))
    );

    return records;
  } catch (error) {
    return [];
  }
}

async function deleteTxtRecord(client, recordId) {
  try {
    await client.requestPromised('DELETE', `/domain/zone/${DOMAINE}/record/${recordId}`);
    return true;
  } catch (error) {
    log('err', `Erreur suppression record ${recordId}: ${error.message}`);
    return false;
  }
}

async function createTxtRecord(client, subDomain, target, ttl = 3600) {
  try {
    const record = await client.requestPromised('POST', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'TXT',
      subDomain: subDomain,
      target: target,
      ttl: ttl
    });
    return record;
  } catch (error) {
    throw new Error(`Erreur creation TXT ${subDomain}: ${error.message}`);
  }
}

async function createCnameRecord(client, subDomain, target, ttl = 3600) {
  try {
    // Verifier si existe deja
    const existingIds = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'CNAME',
      subDomain: subDomain
    });

    // Supprimer l'ancien si existe
    for (const id of existingIds) {
      await client.requestPromised('DELETE', `/domain/zone/${DOMAINE}/record/${id}`);
      log('info', `Ancien CNAME ${subDomain} supprime`);
    }

    const record = await client.requestPromised('POST', `/domain/zone/${DOMAINE}/record`, {
      fieldType: 'CNAME',
      subDomain: subDomain,
      target: target,
      ttl: ttl
    });
    return record;
  } catch (error) {
    throw new Error(`Erreur creation CNAME ${subDomain}: ${error.message}`);
  }
}

async function refreshZone(client) {
  try {
    await client.requestPromised('POST', `/domain/zone/${DOMAINE}/refresh`);
    log('ok', 'Zone DNS rafraichie');
  } catch (error) {
    log('warn', `Erreur refresh zone: ${error.message}`);
  }
}

// ============================================================================
// CONFIGURATION SPF
// ============================================================================

async function configureSPF(client) {
  header('ETAPE 1/4 - CONFIGURATION SPF');

  // SPF pour AWS SES + OVH (si vous utilisez aussi OVH pour certains emails)
  const spfValue = '"v=spf1 include:amazonses.com include:mx.ovh.net ~all"';

  log('info', `Domaine: ${DOMAINE}`);
  log('info', `SPF cible: ${spfValue}`);

  // Lister les enregistrements TXT existants sur la racine
  const existingRecords = await listTxtRecords(client, '');

  // Supprimer les anciens SPF
  for (const record of existingRecords) {
    if (record.target.includes('v=spf1')) {
      log('info', `Suppression ancien SPF: ${record.target}`);
      await deleteTxtRecord(client, record.id);
    }
  }

  // Creer le nouveau SPF
  try {
    await createTxtRecord(client, '', spfValue);
    log('ok', 'SPF configure avec succes');
    log('ok', `Valeur: ${spfValue}`);
    return true;
  } catch (error) {
    log('err', error.message);
    return false;
  }
}

// ============================================================================
// CONFIGURATION VERIFICATION DOMAINE AWS SES
// ============================================================================

async function configureAWSSESVerification(client) {
  header('ETAPE 2/4 - VERIFICATION DOMAINE AWS SES');

  const verificationRecord = `"amazonses:${AWS_SES_VERIFICATION_TOKEN}"`;

  log('info', 'Ajout token verification AWS SES');

  // Verifier si existe deja
  const existingRecords = await listTxtRecords(client, '_amazonses');

  for (const record of existingRecords) {
    log('info', `Suppression ancien token: ${record.target}`);
    await deleteTxtRecord(client, record.id);
  }

  try {
    await createTxtRecord(client, '_amazonses', verificationRecord);
    log('ok', 'Token verification AWS SES ajoute');
    return true;
  } catch (error) {
    log('err', error.message);
    return false;
  }
}

// ============================================================================
// CONFIGURATION DKIM (AWS SES)
// ============================================================================

async function configureDKIM(client) {
  header('ETAPE 3/4 - CONFIGURATION DKIM AWS SES');

  log('info', 'Ajout des 3 enregistrements CNAME DKIM AWS SES');

  let success = true;

  for (const token of AWS_SES_DKIM_TOKENS) {
    const subDomain = `${token}._domainkey`;
    const target = `${token}.dkim.amazonses.com.`;

    log('info', `Ajout CNAME: ${subDomain}`);

    try {
      await createCnameRecord(client, subDomain, target);
      log('ok', `DKIM ${token.substring(0, 8)}... ajoute`);
    } catch (error) {
      log('err', error.message);
      success = false;
    }
  }

  return success;
}

async function addDKIMRecords(client, tokens) {
  header('AJOUT DES ENREGISTREMENTS DKIM AWS SES');

  if (tokens.length !== 3) {
    log('err', 'Il faut exactement 3 tokens DKIM AWS SES');
    return false;
  }

  let success = true;

  for (const token of tokens) {
    const subDomain = `${token}._domainkey`;
    const target = `${token}.dkim.amazonses.com.`;

    log('info', `Ajout CNAME: ${subDomain} -> ${target}`);

    try {
      await createCnameRecord(client, subDomain, target);
      log('ok', `DKIM CNAME ${token} ajoute`);
    } catch (error) {
      log('err', error.message);
      success = false;
    }
  }

  return success;
}

// ============================================================================
// CONFIGURATION DMARC
// ============================================================================

async function configureDMARC(client) {
  header('ETAPE 4/4 - CONFIGURATION DMARC');

  const dmarcValue = '"v=DMARC1; p=quarantine; rua=mailto:dmarc@symphonia-controltower.com; pct=100"';

  log('info', `DMARC cible: ${dmarcValue}`);

  // Lister les enregistrements TXT existants sur _dmarc
  const existingRecords = await listTxtRecords(client, '_dmarc');

  // Supprimer les anciens DMARC
  for (const record of existingRecords) {
    if (record.target.includes('v=DMARC1')) {
      log('info', `Suppression ancien DMARC: ${record.target}`);
      await deleteTxtRecord(client, record.id);
    }
  }

  // Creer le nouveau DMARC
  try {
    await createTxtRecord(client, '_dmarc', dmarcValue);
    log('ok', 'DMARC configure avec succes');
    log('ok', `Valeur: ${dmarcValue}`);
    return true;
  } catch (error) {
    log('err', error.message);
    return false;
  }
}

// ============================================================================
// VERIFICATION
// ============================================================================

async function verifyDNS(client) {
  header('VERIFICATION DES ENREGISTREMENTS');

  // Lister tous les TXT
  const allTxtRecords = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record`, {
    fieldType: 'TXT'
  });

  console.log(`\n${c.bold}Enregistrements TXT actuels:${c.reset}`);

  for (const id of allTxtRecords) {
    const record = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record/${id}`);
    const subDomain = record.subDomain || '@';
    console.log(`  ${c.cyan}${subDomain}${c.reset} -> ${record.target}`);
  }

  // Lister les CNAME _domainkey (DKIM)
  const dkimRecords = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record`, {
    fieldType: 'CNAME'
  });

  console.log(`\n${c.bold}Enregistrements CNAME (DKIM):${c.reset}`);

  let dkimCount = 0;
  for (const id of dkimRecords) {
    const record = await client.requestPromised('GET', `/domain/zone/${DOMAINE}/record/${id}`);
    if (record.subDomain && record.subDomain.includes('_domainkey')) {
      console.log(`  ${c.cyan}${record.subDomain}${c.reset} -> ${record.target}`);
      dkimCount++;
    }
  }

  if (dkimCount === 0) {
    log('warn', 'Aucun enregistrement DKIM trouve');
    log('info', 'Executez: node configure-dns-aws-ses.js --dkim <t1> <t2> <t3>');
  }

  console.log('');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  header('CONFIGURATION DNS POUR AWS SES');
  console.log(`Domaine: ${c.bold}${DOMAINE}${c.reset}`);
  console.log('');

  // Initialiser client OVH
  log('info', 'Connexion API OVH...');

  let client;
  try {
    client = ovh(OVH_CONFIG);

    // Test connexion
    await client.requestPromised('GET', '/me');
    log('ok', 'Connecte a OVH API');
  } catch (error) {
    log('err', `Erreur connexion OVH: ${error.message}`);
    process.exit(1);
  }

  // Mode DKIM manuel
  if (args[0] === '--dkim' && args.length === 4) {
    const tokens = args.slice(1);
    await addDKIMRecords(client, tokens);
    await refreshZone(client);
    await verifyDNS(client);
    return;
  }

  // Mode verification
  if (args[0] === '--verify') {
    await verifyDNS(client);
    return;
  }

  // Configuration complete
  const spfOk = await configureSPF(client);
  const verifyOk = await configureAWSSESVerification(client);
  const dkimOk = await configureDKIM(client);
  const dmarcOk = await configureDMARC(client);

  // Rafraichir la zone
  await refreshZone(client);

  // Verification
  await verifyDNS(client);

  // Resume
  header('RESUME');
  console.log(`  SPF:          ${spfOk ? c.green + 'OK' : c.red + 'ERREUR'}${c.reset}`);
  console.log(`  SES Verify:   ${verifyOk ? c.green + 'OK' : c.red + 'ERREUR'}${c.reset}`);
  console.log(`  DKIM:         ${dkimOk ? c.green + 'OK' : c.red + 'ERREUR'}${c.reset}`);
  console.log(`  DMARC:        ${dmarcOk ? c.green + 'OK' : c.red + 'ERREUR'}${c.reset}`);
  console.log('');
  log('info', 'Propagation DNS: 1-24 heures');
  log('info', 'AWS SES verifiera automatiquement le domaine');
  log('info', 'Verifiez avec: node configure-dns-aws-ses.js --verify');
  console.log('');
}

main().catch(error => {
  console.error(`${c.red}Erreur fatale:${c.reset}`, error.message);
  process.exit(1);
});
