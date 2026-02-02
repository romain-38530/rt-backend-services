const { MongoClient, ObjectId } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';
const carrierId = '6980887cdef6432153c25be5';

async function updateCarrierSubscription() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const carriersDb = client.db('rt-carriers');

    // Update carrier with subscription info
    const result = await carriersDb.collection('carriers').updateOne(
      { _id: new ObjectId(carrierId) },
      {
        $set: {
          subscription: {
            tier: 'premium',
            plan: 'transporteur_premium',
            planName: 'Transporteur Premium',
            currentPlan: 'transporteur_premium',
            planLevel: 'premium',
            status: 'active',
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
            }
          },
          updatedAt: new Date()
        }
      }
    );

    console.log('Carrier subscription updated:', result.modifiedCount > 0 ? 'SUCCESS' : 'NO CHANGES');

    // Verify
    const carrier = await carriersDb.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
    console.log('Carrier subscription:', JSON.stringify(carrier.subscription, null, 2));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('Done!');
  }
}

updateCarrierSubscription();
