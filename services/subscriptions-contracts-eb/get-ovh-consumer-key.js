#!/usr/bin/env node

/**
 * Script pour obtenir un nouveau Consumer Key OVH
 * avec toutes les permissions necessaires pour la gestion DNS
 */

const ovh = require('ovh');

const api = ovh({
  endpoint: 'ovh-eu',
  appKey: '7467b1935c28b05e',
  appSecret: '5dd42ebb267e3e2b97bbaa57fc8329e5'
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
  console.log('4. Une fois valide, mettez a jour le script configure-dns-aws-ses.js');
  console.log(`   avec le nouveau consumerKey: '${credential.consumerKey}'`);
  console.log('');
});
