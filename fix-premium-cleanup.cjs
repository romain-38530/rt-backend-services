const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';
const correctCarrierId = '6980887cdef6432153c25be5';
const userEmail = 'r.tardy@rt-groupe.com';

async function cleanup() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    // 1. Check all users with this email in rt-authz
    const authzDb = client.db('rt-authz');
    const allUsers = await authzDb.collection('users').find({ email: userEmail }).toArray();
    console.log('=== USERS IN rt-authz ===');
    console.log('Found', allUsers.length, 'users with email', userEmail);
    allUsers.forEach(u => {
      console.log('  - ID:', u._id.toString(), '| carrierId:', u.carrierId || 'NONE', '| portal:', u.portal);
    });

    // 2. Check all subscriptions
    const subsDb = client.db('rt-subscriptions');
    const allSubs = await subsDb.collection('subscriptions').find({}).toArray();
    console.log('\n=== ALL SUBSCRIPTIONS ===');
    console.log('Found', allSubs.length, 'total subscriptions');
    allSubs.forEach(s => {
      console.log('  - ID:', s._id.toString(), '| carrierId:', s.carrierId, '| tier:', s.tier || s.plan, '| status:', s.status);
    });

    // Find subscriptions related to this user
    const userSubs = await subsDb.collection('subscriptions').find({
      $or: [
        { carrierId: correctCarrierId },
        { userEmail: userEmail },
        { userId: allUsers[0]?._id?.toString() }
      ]
    }).toArray();
    console.log('\n=== SUBSCRIPTIONS FOR THIS USER ===');
    console.log('Found', userSubs.length, 'subscriptions');
    userSubs.forEach(s => {
      console.log('  - ID:', s._id.toString(), '| carrierId:', s.carrierId, '| tier:', s.tier || s.plan);
    });

    // 3. Delete duplicate users (keep only the one with correct carrierId or the first one)
    console.log('\n=== CLEANUP ===');

    if (allUsers.length > 1) {
      // Keep user with correct carrierId, delete others
      const toKeep = allUsers.find(u => u.carrierId === correctCarrierId) || allUsers[0];
      const toDelete = allUsers.filter(u => u._id.toString() !== toKeep._id.toString());

      console.log('Keeping user:', toKeep._id.toString());
      for (const u of toDelete) {
        console.log('Deleting duplicate user:', u._id.toString());
        await authzDb.collection('users').deleteOne({ _id: u._id });
      }
    }

    // 4. Delete all subscriptions and create one correct Premium subscription
    console.log('\nDeleting all existing subscriptions...');
    await subsDb.collection('subscriptions').deleteMany({});

    console.log('Creating new Premium subscription...');
    const premiumSub = {
      carrierId: correctCarrierId,
      carrierName: 'SETT Transports',
      companyName: 'SARL SETT TRANSPORTS',
      userEmail: userEmail,
      userId: allUsers[0]._id.toString(),
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
        'api_access'
      ],
      options: {
        affretIA: true,
        vigilance: true,
        scoring: true,
        trackingGPS: true,
        ecmr: true,
        planning: true,
        bourseFret: true
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
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await subsDb.collection('subscriptions').insertOne(premiumSub);
    console.log('Premium subscription created!');

    // 5. Update the user record
    console.log('\nUpdating user record...');
    await authzDb.collection('users').updateOne(
      { email: userEmail },
      {
        $set: {
          carrierId: correctCarrierId,
          subscription: {
            tier: 'premium',
            plan: 'transporteur_premium',
            planName: 'Transporteur Premium',
            currentPlan: 'transporteur_premium',
            planLevel: 'premium',
            status: 'active'
          },
          updatedAt: new Date()
        }
      }
    );

    // 6. Verify final state
    console.log('\n=== FINAL STATE ===');
    const finalUser = await authzDb.collection('users').findOne({ email: userEmail });
    console.log('User:', finalUser._id.toString());
    console.log('  carrierId:', finalUser.carrierId);
    console.log('  subscription.tier:', finalUser.subscription?.tier);
    console.log('  subscription.planName:', finalUser.subscription?.planName);

    const finalSub = await subsDb.collection('subscriptions').findOne({ carrierId: correctCarrierId });
    console.log('\nSubscription:', finalSub._id.toString());
    console.log('  carrierId:', finalSub.carrierId);
    console.log('  tier:', finalSub.tier);
    console.log('  planName:', finalSub.planName);
    console.log('  status:', finalSub.status);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

cleanup();
