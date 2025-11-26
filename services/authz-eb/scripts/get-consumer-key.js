#!/usr/bin/env node

/**
 * Script pour obtenir le Consumer Key OVH
 * Ce Consumer Key autorise l'application à gérer les DNS
 */

const ovh = require('ovh');

// Vos credentials OVH
const api = ovh({
  endpoint: 'ovh-eu',
  appKey: '7467b1935c28b05e',
  appSecret: '5dd42ebb267e3e2b97bbaa57fc8329e5'
});

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       Génération du Consumer Key OVH                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

console.log('Demande des autorisations pour :');
console.log('  • Gestion de la zone DNS (GET/POST/PUT/DELETE)');
console.log('  • Gestion des services email (GET/POST)\n');

api.request('POST', '/auth/credential', {
  accessRules: [
    { method: 'GET', path: '/domain/zone/*' },
    { method: 'POST', path: '/domain/zone/*' },
    { method: 'PUT', path: '/domain/zone/*' },
    { method: 'DELETE', path: '/domain/zone/*' },
    { method: 'GET', path: '/email/domain/*' },
    { method: 'POST', path: '/email/domain/*' }
  ]
}, (error, credential) => {
  if (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  }

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
  console.log('OVH_APP_KEY=7467b1935c28b05e');
  console.log('OVH_APP_SECRET=5dd42ebb267e3e2b97bbaa57fc8329e5');
  console.log('OVH_CONSUMER_KEY=' + credential.consumerKey);
  console.log('════════════════════════════════════════════════════════════\n');

  console.log('Puis lancez la configuration DNS automatique:');
  console.log('  node scripts/configurer-dns-auto.js\n');
});
