const { MongoClient, ObjectId } = require('mongodb');

// Try multiple MongoDB URIs
const MONGODB_URIS = [
  'mongodb+srv://stagingrt:7Cqk9t2CipmVPrwp@stagingrt.4cxw6.mongodb.net/',
  'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority'
];

const CARRIER_ID = '6980887cdef6432153c25be5';
const CARRIER_NAME = 'SETT Transports';
const DEFAULT_PASSWORD = 'Symphonia2026!';

const RT_GROUPE_USERS = [
  { firstName: 'Sett', lastName: 'Transports', email: 'exploitation@rt-groupe.com' },
  { firstName: 'Ludivine', lastName: 'Accary', email: 'l.accary@rt-groupe.com' },
  { firstName: 'Theo', lastName: 'Gimenez', email: 'affretement@rt-groupe.com' },
  { firstName: 'Pauline', lastName: 'Tardy', email: 'p.tardy@rt-groupe.com' },
  { firstName: 'Marion', lastName: 'Marly', email: 'm.marly@rt-groupe.com' },
  { firstName: 'Baptiste', lastName: 'Mattio', email: 'b.mattio@rt-groupe.com' },
  { firstName: 'Maxime', lastName: 'Dufey', email: 'admintransport@rt-groupe.com' },
  { firstName: 'Alphonse', lastName: 'Mendes', email: 'a.mendes@rt-groupe.com' },
  { firstName: 'Romain', lastName: 'Tardy', email: 'r.tardy@rt-groupe.com' },
  { firstName: 'Lola', lastName: 'Balmon', email: 'm.beccafarri@rt-groupe.com' }
];

const PREMIUM_SUBSCRIPTION = {
  tier: 'premium',
  plan: 'transporteur_premium',
  planName: 'Transporteur Premium',
  currentPlan: 'transporteur_premium',
  planLevel: 'premium',
  status: 'active',
  subscriptionStatus: 'active',
  startDate: new Date('2024-01-01'),
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2027-01-01'),
  billingCycle: 'yearly',
  features: {
    maxUsers: 100,
    maxVehicles: 100,
    maxTransports: -1,
    apiAccess: true,
    customBranding: true,
    prioritySupport: true
  },
  activatedFeatures: [
    'affret_ia', 'vigilance', 'scoring', 'tracking_gps',
    'ecmr', 'planning', 'bourse_fret', 'kpi_advanced',
    'multi_user', 'api_access', 'tms_connection'
  ],
  options: {
    affretIA: true,
    vigilance: true,
    scoring: true,
    trackingGPS: true,
    ecmr: true,
    planning: true,
    bourseFret: true,
    tmsConnection: true
  }
};

async function tryConnect() {
  for (const uri of MONGODB_URIS) {
    try {
      console.log(`Trying: ${uri.substring(0, 40)}...`);
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000
      });
      await client.connect();
      console.log('Connected!\n');
      return client;
    } catch (e) {
      console.log(`Failed: ${e.message}\n`);
    }
  }
  throw new Error('Could not connect to any MongoDB instance');
}

async function main() {
  console.log('='.repeat(60));
  console.log('SETUP SETT TRANSPORTS - PREMIUM SUBSCRIPTION');
  console.log('='.repeat(60) + '\n');

  let client;
  try {
    client = await tryConnect();

    // Try different database names
    const dbNames = ['auth-service', 'rt-authz', 'rt-auth'];
    let db;
    let usersCollection;

    for (const dbName of dbNames) {
      try {
        db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const hasUsers = collections.some(c => c.name === 'users');
        if (hasUsers) {
          usersCollection = db.collection('users');
          const count = await usersCollection.countDocuments();
          console.log(`Using database: ${dbName} (${count} users)`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!usersCollection) {
      throw new Error('Could not find users collection');
    }

    // 1. Update/create carrier subscription
    console.log('\n1. Configuration abonnement SETT Transports Premium...');
    try {
      const subsDb = client.db('rt-subscriptions');
      await subsDb.collection('subscriptions').updateOne(
        { carrierId: CARRIER_ID },
        {
          $set: {
            carrierId: CARRIER_ID,
            carrierName: CARRIER_NAME,
            companyName: 'SARL SETT TRANSPORTS',
            ...PREMIUM_SUBSCRIPTION,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
      console.log('   OK - Subscription Premium créée/mise à jour');
    } catch (e) {
      console.log(`   Info: ${e.message}`);
    }

    // 2. Update users
    console.log('\n2. Mise à jour des utilisateurs RT Groupe...\n');

    let updated = 0;
    let notFound = 0;

    for (const userData of RT_GROUPE_USERS) {
      const email = userData.email.toLowerCase();
      process.stdout.write(`   ${email}... `);

      const existingUser = await usersCollection.findOne({ email });

      if (existingUser) {
        await usersCollection.updateOne(
          { email },
          {
            $set: {
              carrierId: CARRIER_ID,
              carrierName: CARRIER_NAME,
              companyName: CARRIER_NAME,
              subscription: PREMIUM_SUBSCRIPTION,
              portal: 'transporter',
              role: 'transporter',
              updatedAt: new Date()
            }
          }
        );
        console.log('UPDATED (Premium)');
        updated++;
      } else {
        console.log('NOT FOUND');
        notFound++;
      }
    }

    // 3. Verify
    console.log('\n3. Vérification...');
    const premiumUsers = await usersCollection.find({
      email: { $in: RT_GROUPE_USERS.map(u => u.email.toLowerCase()) },
      'subscription.tier': 'premium'
    }).toArray();

    console.log(`   Utilisateurs Premium: ${premiumUsers.length}/${RT_GROUPE_USERS.length}`);

    // 4. Summary
    console.log('\n' + '='.repeat(60));
    console.log('RESUME');
    console.log('='.repeat(60));
    console.log(`   Mis à jour: ${updated}`);
    console.log(`   Non trouvés: ${notFound}`);
    console.log(`   Plan: Transporteur Premium`);
    console.log(`   Carrier: ${CARRIER_NAME} (${CARRIER_ID})`);
    console.log(`   URL: https://transporteur.symphonia-controltower.com`);
    console.log(`   Password: ${DEFAULT_PASSWORD}`);

    if (premiumUsers.length > 0) {
      console.log('\n   Utilisateurs Premium:');
      premiumUsers.forEach(u => {
        console.log(`   - ${u.email}: ${u.subscription?.planName || 'N/A'}`);
      });
    }

  } catch (error) {
    console.error('Erreur:', error.message);
  } finally {
    if (client) {
      await client.close();
    }
    console.log('\nTerminé!');
  }
}

main();
