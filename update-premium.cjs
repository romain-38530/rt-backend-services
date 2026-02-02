const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';

async function updateToPremium() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    // Find user in authz
    const authzDb = client.db('rt-authz');
    const user = await authzDb.collection('users').findOne({ email: 'r.tardy@rt-groupe.com' });
    console.log('User found:', user ? user._id : 'NOT FOUND');

    if (!user) {
      console.log('User not found!');
      return;
    }

    // Check if user has carrierId
    console.log('User carrierId:', user.carrierId || 'NOT SET');

    // Find carrier in carriers db
    const carriersDb = client.db('rt-carriers');
    let carrier = null;

    if (user.carrierId) {
      carrier = await carriersDb.collection('carriers').findOne({ _id: new ObjectId(user.carrierId) });
    }

    if (!carrier) {
      // Search by email
      carrier = await carriersDb.collection('carriers').findOne({ 'contacts.email': 'r.tardy@rt-groupe.com' });
    }

    // If no carrier exists, create one
    if (!carrier) {
      console.log('Creating new carrier for SETT Transports...');
      const newCarrier = {
        name: 'SETT Transports',
        legalName: 'SETT TRANSPORTS SAS',
        siret: '88888888800001',
        vatNumber: 'FR88888888800',
        address: {
          street: '1 rue du Transport',
          city: 'Lyon',
          postalCode: '69000',
          country: 'France'
        },
        contacts: [{
          name: 'Romain Tardy',
          email: 'r.tardy@rt-groupe.com',
          phone: '+33600000000',
          role: 'admin'
        }],
        status: 'active',
        verified: true,
        premium: true,
        fleetSize: 50,
        specializations: ['general', 'temperature', 'adr'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await carriersDb.collection('carriers').insertOne(newCarrier);
      carrier = { _id: result.insertedId, ...newCarrier };
      console.log('Created carrier:', carrier._id);
    }

    console.log('Carrier found/created:', carrier._id);

    // Check subscriptions
    const subsDb = client.db('rt-subscriptions');
    const allSubs = await subsDb.collection('subscriptions').find({}).limit(5).toArray();
    console.log('Sample subscriptions:', allSubs.length);
    if (allSubs.length > 0) {
      console.log('Subscription structure:', Object.keys(allSubs[0]));
    }

    // Find subscription for this user/carrier
    let subscription = null;
    if (carrier) {
      subscription = await subsDb.collection('subscriptions').findOne({ carrierId: carrier._id.toString() });
    }
    if (!subscription) {
      subscription = await subsDb.collection('subscriptions').findOne({ carrierId: user._id.toString() });
    }

    console.log('Existing subscription:', subscription ? subscription._id : 'NOT FOUND');

    // If no subscription, create one
    const carrierId = carrier ? carrier._id.toString() : user._id.toString();

    if (!subscription) {
      console.log('Creating new Premium subscription...');
      const newSub = {
        carrierId: carrierId,
        tier: 'premium',
        planName: 'Transporteur Premium',
        currentPlan: 'transporteur_premium',
        status: 'active',
        activatedFeatures: ['affret_ia', 'vigilance', 'scoring', 'tracking_gps', 'ecmr', 'planning'],
        subscriptionStatus: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await subsDb.collection('subscriptions').insertOne(newSub);
      console.log('Created subscription:', result.insertedId);
    } else {
      console.log('Updating to Premium...');
      await subsDb.collection('subscriptions').updateOne(
        { _id: subscription._id },
        {
          $set: {
            tier: 'premium',
            planName: 'Transporteur Premium',
            currentPlan: 'transporteur_premium',
            status: 'active',
            subscriptionStatus: 'active',
            activatedFeatures: ['affret_ia', 'vigilance', 'scoring', 'tracking_gps', 'ecmr', 'planning'],
            updatedAt: new Date()
          }
        }
      );
      console.log('Updated to Premium!');
    }

    // Also update the user record to link subscription
    await authzDb.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          carrierId: carrierId,
          subscription: {
            tier: 'premium',
            planName: 'Transporteur Premium',
            currentPlan: 'transporteur_premium',
            status: 'active'
          },
          updatedAt: new Date()
        }
      }
    );
    console.log('Updated user record with subscription info');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('Done!');
  }
}

updateToPremium();
