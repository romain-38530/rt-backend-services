const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority';
const CARRIER_ID = '6980887cdef6432153c25be5';

// RT Groupe users to upgrade to Premium
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
  status: 'active'
};

async function main() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('='.repeat(60));
    console.log('CONFIGURATION RT GROUPE - ABONNEMENT PREMIUM');
    console.log('='.repeat(60) + '\n');

    const authzDb = client.db('rt-authz');
    const subsDb = client.db('rt-subscriptions');

    // 1. Update/Create carrier subscription
    console.log('1. Configuration abonnement SETT Transports...');

    const carrierSubscription = {
      carrierId: CARRIER_ID,
      carrierName: 'SETT Transports',
      companyName: 'SARL SETT TRANSPORTS',
      tier: 'premium',
      plan: 'transporteur_premium',
      planName: 'Transporteur Premium',
      currentPlan: 'transporteur_premium',
      planLevel: 'premium',
      status: 'active',
      subscriptionStatus: 'active',
      activatedFeatures: [
        'affret_ia',
        'vigilance',
        'scoring',
        'tracking_gps',
        'ecmr',
        'planning',
        'bourse_fret',
        'kpi_advanced',
        'multi_user',
        'api_access',
        'tms_connection'
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
      },
      features: {
        maxUsers: 100,
        maxVehicles: 100,
        maxTransports: -1,
        apiAccess: true,
        customBranding: true,
        prioritySupport: true
      },
      billingCycle: 'yearly',
      startDate: new Date('2024-01-01'),
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2027-01-01'),
      updatedAt: new Date()
    };

    // Upsert carrier subscription
    await subsDb.collection('subscriptions').updateOne(
      { carrierId: CARRIER_ID },
      { $set: carrierSubscription, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    console.log('   OK - Abonnement Premium SETT Transports configuré\n');

    // 2. Update each user
    console.log('2. Mise à jour des utilisateurs RT Groupe...\n');

    let updated = 0;
    let created = 0;
    let notFound = 0;

    for (const userData of RT_GROUPE_USERS) {
      process.stdout.write(`   ${userData.email}... `);

      // Check if user exists
      const existingUser = await authzDb.collection('users').findOne({
        email: userData.email.toLowerCase()
      });

      if (existingUser) {
        // Update existing user
        await authzDb.collection('users').updateOne(
          { email: userData.email.toLowerCase() },
          {
            $set: {
              carrierId: CARRIER_ID,
              subscription: PREMIUM_SUBSCRIPTION,
              companyName: 'SETT Transports',
              role: 'transporter',
              portal: 'transporter',
              updatedAt: new Date()
            }
          }
        );
        console.log('UPDATED');
        updated++;
      } else {
        console.log('NOT FOUND (will be created by other agent)');
        notFound++;
      }
    }

    // 3. Summary
    console.log('\n' + '='.repeat(60));
    console.log('RESUME');
    console.log('='.repeat(60));
    console.log(`   Utilisateurs mis à jour: ${updated}`);
    console.log(`   Non trouvés: ${notFound}`);
    console.log(`   Carrier: SETT Transports (${CARRIER_ID})`);
    console.log(`   Plan: Transporteur Premium`);
    console.log(`   Status: Active`);

    // 4. Verify
    console.log('\n' + '='.repeat(60));
    console.log('VERIFICATION');
    console.log('='.repeat(60));

    const carrierSub = await subsDb.collection('subscriptions').findOne({ carrierId: CARRIER_ID });
    console.log('\nAbonnement Carrier:');
    console.log(`   - Plan: ${carrierSub?.planName}`);
    console.log(`   - Tier: ${carrierSub?.tier}`);
    console.log(`   - Status: ${carrierSub?.status}`);
    console.log(`   - Features: ${carrierSub?.activatedFeatures?.length || 0} activées`);

    const users = await authzDb.collection('users').find({
      email: { $in: RT_GROUPE_USERS.map(u => u.email.toLowerCase()) }
    }).toArray();

    console.log(`\nUtilisateurs Premium (${users.length}/${RT_GROUPE_USERS.length}):`);
    for (const user of users) {
      console.log(`   - ${user.email}: ${user.subscription?.planName || 'N/A'} (${user.subscription?.status || 'N/A'})`);
    }

  } catch (error) {
    console.error('Erreur:', error.message);
  } finally {
    await client.close();
    console.log('\nTerminé!');
  }
}

main();
