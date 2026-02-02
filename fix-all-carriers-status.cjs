const { MongoClient } = require('mongodb');

const uri = 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net';

async function fixAllCarriers() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB\n');

    const tmsSyncDb = client.db('rt-tms-sync');
    const carriersCollection = tmsSyncDb.collection('carriers');

    // Make all carriers active and N1_referenced
    const result = await carriersCollection.updateMany(
      {},
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

    // Count by level
    const levels = await carriersCollection.aggregate([
      { $group: { _id: '$level', count: { $sum: 1 } } }
    ]).toArray();

    const statuses = await carriersCollection.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]).toArray();

    console.log('\nBy level:', levels);
    console.log('By status:', statuses);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.log('\nDone!');
  }
}

fixAllCarriers();
