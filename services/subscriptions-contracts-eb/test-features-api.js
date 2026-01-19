/**
 * Test de l'API /features pour le compte SETT
 */

const https = require('https');

// Token JWT de test - vous devez le remplacer par un vrai token
// Pour tester, on va simuler ce que l'API devrait retourner

const { MongoClient, ObjectId } = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const SETT_EMAIL = 'r.tardy@rt-groupe.com';

async function testFeaturesLogic() {
  let client;

  try {
    console.log('=== Test de la logique /features ===\n');
    client = new MongoClient(MONGODB_URI);
    await client.connect();

    // Simuler ce que fait l'endpoint /features
    const authDb = client.db('rt-auth');
    const user = await authDb.collection('users').findOne({ email: SETT_EMAIL.toLowerCase() });

    if (!user) {
      console.log('Utilisateur non trouve!');
      return;
    }

    console.log('Utilisateur trouve dans rt-auth:');
    console.log('  _id:', user._id.toString());
    console.log('  email:', user.email);
    console.log('  planLevel:', user.planLevel);
    console.log('  subscription.planLevel:', user.subscription?.planLevel);
    console.log('  subscription.plan:', user.subscription?.plan);

    // Simuler la logique de l'endpoint
    const planLevel = user.planLevel || user.subscription?.planLevel || 'GRATUIT';
    const planId = user.subscription?.plan || user.currentPlan || 'transporteur_free';

    console.log('\n=== Resultat simule de /api/stripe/features ===');
    console.log(JSON.stringify({
      success: true,
      data: {
        currentPlan: planId,
        planLevel: planLevel,
        planName: user.subscription?.planName || 'Transporteur Premium',
        price: user.subscription?.price || 0,
        subscriptionStatus: user.subscription?.status || 'active',
        modules: Object.keys(user.modules || {}).filter(k => user.modules[k] === true).length + ' modules actifs'
      }
    }, null, 2));

    // Verifier le mapping vers tier
    const tierMap = {
      'PREMIUM': 'premium',
      'STARTER': 'starter',
      'BUSINESS': 'business',
      'ELITE': 'elite',
      'GRATUIT': 'free',
      'FREE': 'free'
    };
    const tier = tierMap[planLevel] || 'free';

    console.log('\n=== Mapping vers tier (pour le badge) ===');
    console.log('planLevel:', planLevel, '-> tier:', tier);
    console.log('\nLe badge devrait afficher:', tier === 'free' ? 'GRATUIT' : tier.toUpperCase());

  } catch (error) {
    console.error('ERREUR:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

testFeaturesLogic();
