const { MongoClient } = require('mongodb');

async function cleanup() {
  const client = new MongoClient('mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia?retryWrites=true&w=majority');
  
  try {
    await client.connect();
    const db = client.db('symphonia');
    
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    console.log('Deleting carriers with lastSyncAt < ' + tenMinutesAgo.toISOString());
    
    const result = await db.collection('carriers').deleteMany({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: tenMinutesAgo }
    });
    
    console.log('Deleted:', result.deletedCount, 'carriers');
    
    const remaining = await db.collection('carriers').countDocuments({ externalSource: 'dashdoc' });
    console.log('Remaining:', remaining, 'carriers');
    
  } finally {
    await client.close();
  }
}

cleanup();
