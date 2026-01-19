/**
 * Script pour verifier le compte SETT dans toutes les bases
 */

const { MongoClient } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const EMAIL = 'r.tardy@rt-groupe.com';

async function checkAccount() {
  let client;

  try {
    console.log('Connexion a MongoDB Atlas...\n');
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    // Verifier dans rt-auth
    console.log('=== BASE rt-auth ===');
    const authDb = client.db('rt-auth');
    const authUser = await authDb.collection('users').findOne({ email: EMAIL.toLowerCase() });

    if (authUser) {
      console.log('ID:', authUser._id);
      console.log('Email:', authUser.email);
      console.log('planLevel (root):', authUser.planLevel);
      console.log('accountType:', authUser.accountType);
      console.log('subscription:', JSON.stringify(authUser.subscription, null, 2));
      console.log('modules (count):', authUser.modules ? Object.keys(authUser.modules).filter(k => authUser.modules[k] === true).length : 0);
    } else {
      console.log('NON TROUVE dans rt-auth');
    }

    // Verifier dans rt-subscriptions
    console.log('\n=== BASE rt-subscriptions ===');
    const subDb = client.db('rt-subscriptions');
    const subUser = await subDb.collection('users').findOne({ email: EMAIL.toLowerCase() });

    if (subUser) {
      console.log('ID:', subUser._id);
      console.log('Email:', subUser.email);
      console.log('planLevel:', subUser.planLevel);
      console.log('subscription:', JSON.stringify(subUser.subscription, null, 2));
    } else {
      console.log('NON TROUVE dans rt-subscriptions');
    }

    // Verifier les autres collections qui pourraient contenir des users
    console.log('\n=== Autres collections dans rt-auth ===');
    const collections = await authDb.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name).join(', '));

    // Chercher dans accounts si ca existe
    if (collections.find(c => c.name === 'accounts')) {
      const account = await authDb.collection('accounts').findOne({ email: EMAIL.toLowerCase() });
      if (account) {
        console.log('\nTrouve dans accounts:');
        console.log('  planLevel:', account.planLevel);
        console.log('  subscription:', account.subscription);
      }
    }

  } catch (error) {
    console.error('ERREUR:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

checkAccount();
