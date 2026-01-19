#!/usr/bin/env node

/**
 * Script pour obtenir un nouveau Consumer Key OVH
 * avec toutes les permissions necessaires pour la gestion DNS
 */

const ovh = require('ovh');
require('dotenv').config();

// Credentials OVH - SECURISE via variables d'environnement
if (!process.env.OVH_APP_KEY || !process.env.OVH_APP_SECRET) {
  console.error('\x1b[31m[SECURITY ERROR]\x1b[0m Missing OVH credentials');
  console.error('Set these environment variables:');
  console.error('  OVH_APP_KEY=your_app_key');
  console.error('  OVH_APP_SECRET=your_app_secret');
  process.exit(1);
}

const api = ovh({
  endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
  appKey: process.env.OVH_APP_KEY,
  appSecret: process.env.OVH_APP_SECRET
});

console.log('');
console.log('='.repeat(60));
console.log('  Generation Consumer Key OVH pour AWS SES DNS');
console.log('='.repeat(60));
console.log('');

api.request('POST', '/auth/credential', {
  accessRules: [
    // Infos compte
    { method: 'GET', path: '/me' },
    // Domaines
    { method: 'GET', path: '/domain' },
    { method: 'GET', path: '/domain/*' },
    // Zone DNS - toutes operations
    { method: 'GET', path: '/domain/zone/*' },
    { method: 'POST', path: '/domain/zone/*' },
    { method: 'PUT', path: '/domain/zone/*' },
    { method: 'DELETE', path: '/domain/zone/*' },
    // Email domain
    { method: 'GET', path: '/email/domain/*' },
    { method: 'POST', path: '/email/domain/*' }
  ],
  redirection: 'https://symphonia-controltower.com'
}, (error, credential) => {
  if (error) {
    console.error('Erreur:', error.message || error);
    process.exit(1);
  }

  console.log('Consumer Key genere avec succes!');
  console.log('');
  console.log('='.repeat(60));
  console.log(`  Consumer Key: ${credential.consumerKey}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('ACTION REQUISE:');
  console.log('');
  console.log('1. Ouvrez cette URL dans votre navigateur:');
  console.log(`   ${credential.validationUrl}`);
  console.log('');
  console.log('2. Connectez-vous a votre compte OVH');
  console.log('3. Validez les permissions');
  console.log('');
  console.log('4. Une fois valide, ajoutez le consumer key a vos variables d\'environnement:');
  console.log(`   OVH_CONSUMER_KEY=${credential.consumerKey}`);
  console.log('');
});
