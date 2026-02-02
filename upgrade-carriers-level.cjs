const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';

async function upgradeCarriers() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const tmsSyncDb = client.db('rt-tms-sync');
    const carriersCollection = tmsSyncDb.collection('carriers');

    // Count current carriers
    const total = await carriersCollection.countDocuments();
    const n2Guest = await carriersCollection.countDocuments({ level: 'N2_guest' });
    const pending = await carriersCollection.countDocuments({ status: 'pending' });

    console.log('=== BEFORE ===');
    console.log('Total carriers:', total);
    console.log('N2_guest level:', n2Guest);
    console.log('Pending status:', pending);

    // Update all N2_guest to N1_referenced and status to active
    console.log('\nUpgrading carriers...');

    const result = await carriersCollection.updateMany(
      { level: 'N2_guest' },
      {
        $set: {
          level: 'N1_referenced',
          status: 'active',
          accountType: 'referenced',
          updatedAt: new Date()
        }
      }
    );

    console.log('Updated:', result.modifiedCount, 'carriers');

    // Verify
    const n1Referenced = await carriersCollection.countDocuments({ level: 'N1_referenced' });
    const active = await carriersCollection.countDocuments({ status: 'active' });

    console.log('\n=== AFTER ===');
    console.log('N1_referenced level:', n1Referenced);
    console.log('Active status:', active);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

upgradeCarriers();
