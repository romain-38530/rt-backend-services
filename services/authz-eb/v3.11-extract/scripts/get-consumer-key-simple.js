#!/usr/bin/env node

/**
 * Script simple pour obtenir le Consumer Key OVH
 * Sans dépendance externe (utilise seulement fetch)
 */

const crypto = require('crypto');
const https = require('https');

// Vos credentials OVH
const APP_KEY = '7467b1935c28b05e';
const APP_SECRET = '5dd42ebb267e3e2b97bbaa57fc8329e5';
const ENDPOINT = 'https://eu.api.ovh.com/1.0';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       Génération du Consumer Key OVH                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('Demande des autorisations pour :');
console.log('  • Gestion de la zone DNS (GET/POST/PUT/DELETE)');
console.log('  • Gestion des services email (GET/POST)\n');

// Préparer la requête
const body = JSON.stringify({
  accessRules: [
    { method: 'GET', path: '/domain/zone/*' },
    { method: 'POST', path: '/domain/zone/*' },
    { method: 'PUT', path: '/domain/zone/*' },
    { method: 'DELETE', path: '/domain/zone/*' },
    { method: 'GET', path: '/email/domain/*' },
    { method: 'POST', path: '/email/domain/*' }
  ]
});

const options = {
  hostname: 'eu.api.ovh.com',
  port: 443,
  path: '/1.0/auth/credential',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Ovh-Application': APP_KEY,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error('❌ Erreur API OVH:', res.statusCode);
      console.error(data);
      process.exit(1);
    }

    const credential = JSON.parse(data);

    console.log('✅ Consumer Key généré avec succès !\n');
    console.log('════════════════════════════════════════════════════════════');
    console.log('Consumer Key:', credential.consumerKey);
    console.log('════════════════════════════════════════════════════════════\n');

    console.log('⚠️  IMPORTANT: Vous devez maintenant VALIDER ce token !\n');
    console.log('1. Ouvrez cette URL dans votre navigateur:');
    console.log('   ' + credential.validationUrl + '\n');
    console.log('2. Connectez-vous à votre compte OVH');
    console.log('3. Vérifiez les permissions demandées');
    console.log('4. Cliquez sur "Valider"\n');

    console.log('Une fois validé, ajoutez ces credentials dans votre .env:\n');
    console.log('════════════════════════════════════════════════════════════');
    console.log('OVH_ENDPOINT=ovh-eu');
    console.log('OVH_APP_KEY=' + APP_KEY);
    console.log('OVH_APP_SECRET=' + APP_SECRET);
    console.log('OVH_CONSUMER_KEY=' + credential.consumerKey);
    console.log('════════════════════════════════════════════════════════════\n');

    console.log('Puis lancez la configuration DNS automatique:');
    console.log('  node scripts/configurer-dns-auto.js\n');
  });
});

req.on('error', (error) => {
  console.error('❌ Erreur de connexion:', error);
  process.exit(1);
});

req.write(body);
req.end();
