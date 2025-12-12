/**
 * Script pour configurer les emails OVHcloud
 * - Liste les comptes email existants
 * - Permet de changer le mot de passe ou créer un nouveau compte
 *
 * Usage: node configure-smtp-ovh.cjs
 */

const ovh = require('ovh');

// Configuration OVH (utiliser les credentials du fichier .env.ovhcloud)
const OVH_CONFIG = {
  endpoint: process.env.OVH_ENDPOINT || 'ovh-eu',
  appKey: process.env.OVH_APP_KEY || 'ed9d52f0f9666bcf',
  appSecret: process.env.OVH_APP_SECRET || 'e310afd76f33ae5aa5b92fd0636952f7',
  consumerKey: process.env.OVH_CONSUMER_KEY || 'ab3abd0d8ead07b78823e019afa83561'
};

const DOMAIN = process.env.OVH_DOMAIN || 'rt-symphonia.com';
const NEW_PASSWORD = 'SymphoniA2025!Secure';

async function main() {
  console.log('='.repeat(60));
  console.log('OVHcloud Email Configuration');
  console.log('='.repeat(60));
  console.log(`Domain: ${DOMAIN}`);
  console.log('');

  try {
    const client = ovh(OVH_CONFIG);

    // 1. Lister tous les domaines
    console.log('--- Checking available domains ---');
    try {
      const domains = await client.requestPromised('GET', '/domain');
      console.log('Available domains:', domains);
    } catch (err) {
      console.log('Could not list domains:', err.message);
    }

    // 2. Lister les comptes email
    console.log('\n--- Listing email accounts ---');
    try {
      const accounts = await client.requestPromised('GET', `/email/domain/${DOMAIN}/account`);
      console.log('Email accounts:', accounts);

      if (accounts.length > 0) {
        for (const accountName of accounts) {
          try {
            const accountDetails = await client.requestPromised('GET', `/email/domain/${DOMAIN}/account/${accountName}`);
            console.log(`  - ${accountName}@${DOMAIN}:`, accountDetails);
          } catch (err) {
            console.log(`  - ${accountName}@${DOMAIN}: Could not get details`);
          }
        }
      }
    } catch (err) {
      console.log('Could not list email accounts:', err.message);
    }

    // 3. Lister les redirections
    console.log('\n--- Listing email redirections ---');
    try {
      const redirections = await client.requestPromised('GET', `/email/domain/${DOMAIN}/redirection`);
      console.log('Email redirections:', redirections);

      for (const redirectionId of redirections) {
        try {
          const redirectionDetails = await client.requestPromised('GET', `/email/domain/${DOMAIN}/redirection/${redirectionId}`);
          console.log(`  - Redirection #${redirectionId}:`, redirectionDetails);
        } catch (err) {
          console.log(`  - Redirection #${redirectionId}: Could not get details`);
        }
      }
    } catch (err) {
      console.log('Could not list redirections:', err.message);
    }

    // 4. Essayer de créer ou reconfigurer le compte noreply
    console.log('\n--- Creating/Configuring noreply account ---');

    const accountName = 'noreply';

    try {
      // Essayer de changer le mot de passe si le compte existe
      await client.requestPromised('POST', `/email/domain/${DOMAIN}/account/${accountName}/changePassword`, {
        password: NEW_PASSWORD
      });
      console.log(`Password changed for ${accountName}@${DOMAIN}`);
      console.log(`New credentials:`);
      console.log(`  SMTP_USER: ${accountName}@${DOMAIN}`);
      console.log(`  SMTP_PASSWORD: ${NEW_PASSWORD}`);
    } catch (err) {
      console.log(`Could not change password: ${err.message}`);

      // Si le compte n'existe pas, essayer de le créer
      try {
        await client.requestPromised('POST', `/email/domain/${DOMAIN}/account`, {
          accountName: accountName,
          password: NEW_PASSWORD,
          size: 5000
        });
        console.log(`Created new account ${accountName}@${DOMAIN}`);
        console.log(`New credentials:`);
        console.log(`  SMTP_USER: ${accountName}@${DOMAIN}`);
        console.log(`  SMTP_PASSWORD: ${NEW_PASSWORD}`);
      } catch (createErr) {
        console.log(`Could not create account: ${createErr.message}`);
      }
    }

    console.log('\n--- Configuration complete ---');
    console.log(`\nPour envoyer les emails de demo, utilisez:`);
    console.log(`SMTP_HOST=ssl0.ovh.net SMTP_PORT=587 SMTP_USER=${accountName}@${DOMAIN} SMTP_PASSWORD=${NEW_PASSWORD} node demo-scenario-complet.cjs`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
