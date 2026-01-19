/**
 * Affiche TOUS les champs du compte SETT
 */

const { MongoClient } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const EMAIL = 'r.tardy@rt-groupe.com';

async function checkAllFields() {
  let client;

  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    const authDb = client.db('rt-auth');
    const user = await authDb.collection('users').findOne({ email: EMAIL.toLowerCase() });

    if (user) {
      console.log('=== TOUS LES CHAMPS DU COMPTE ===\n');

      // Afficher tous les champs de premier niveau
      for (const [key, value] of Object.entries(user)) {
        if (key === 'modules') {
          const activeModules = Object.entries(value || {}).filter(([k, v]) => v === true).map(([k]) => k);
          console.log(`${key}: [${activeModules.length} modules actifs]`);
        } else if (key === 'subscription' || key === 'organization') {
          console.log(`${key}:`, JSON.stringify(value, null, 2));
        } else if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
          console.log(`${key}:`, JSON.stringify(value));
        } else {
          console.log(`${key}:`, value);
        }
      }

      console.log('\n=== CHAMPS CRITIQUES POUR LE BADGE ===');
      console.log('planLevel:', user.planLevel);
      console.log('accountType:', user.accountType);
      console.log('subscription.planLevel:', user.subscription?.planLevel);
      console.log('subscription.plan:', user.subscription?.plan);
      console.log('plan:', user.plan);
      console.log('tier:', user.tier);
      console.log('subscriptionTier:', user.subscriptionTier);
      console.log('userPlan:', user.userPlan);
      console.log('accountPlan:', user.accountPlan);

    } else {
      console.log('Compte non trouve');
    }

  } catch (error) {
    console.error('ERREUR:', error.message);
  } finally {
    if (client) await client.close();
  }
}

checkAllFields();
