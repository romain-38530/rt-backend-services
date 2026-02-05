/**
 * Cleanup obsolete carriers
 * Supprime les carriers qui n'ont pas été synchronisés récemment
 * (ceux qui ont été exclus par le filtre remoteId)
 */

const { MongoClient } = require('mongodb');

async function cleanupObsoleteCarriers() {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia?retryWrites=true&w=majority';
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('symphonia');

    console.log('🔍 Finding obsolete carriers...\n');

    // Carriers non synchronisés dans les dernières 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const obsoleteCarriers = await db.collection('carriers').find({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: thirtyMinutesAgo }
    }).toArray();

    console.log(`Found ${obsoleteCarriers.length} obsolete carriers:\n`);

    if (obsoleteCarriers.length === 0) {
      console.log('✅ No obsolete carriers to clean up');
      return;
    }

    // Afficher les carriers obsolètes
    obsoleteCarriers.forEach(c => {
      console.log(`  - ${c.companyName} (${c.remoteId})`);
      console.log(`    Last sync: ${c.lastSyncAt}`);
      console.log(`    External ID: ${c.externalId}\n`);
    });

    // Confirmer la suppression
    console.log(`\n⚠️  About to DELETE ${obsoleteCarriers.length} carriers from MongoDB\n`);

    // Suppression
    const result = await db.collection('carriers').deleteMany({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: thirtyMinutesAgo }
    });

    console.log(`✅ Deleted ${result.deletedCount} obsolete carriers\n`);

    // Vérifier le total restant
    const remaining = await db.collection('carriers').countDocuments({
      externalSource: 'dashdoc'
    });

    console.log(`📊 Remaining Dashdoc carriers: ${remaining}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

cleanupObsoleteCarriers();
