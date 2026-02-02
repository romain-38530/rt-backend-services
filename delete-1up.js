const { MongoClient } = require('mongodb');

async function delete1UP() {
  const uri = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia?retryWrites=true&w=majority';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('symphonia');

    console.log('🗑️  Suppression de "1 UP" (donneur d\'ordre)...\n');

    // Afficher "1 UP" avant suppression
    const oneUp = await db.collection('carriers').findOne({ externalId: '3867700' });
    if (oneUp) {
      console.log('Trouvé:');
      console.log(`  - Nom: ${oneUp.companyName}`);
      console.log(`  - Remote ID: ${oneUp.remoteId}`);
      console.log(`  - External ID: ${oneUp.externalId}`);
      console.log(`  - Last Sync: ${oneUp.lastSyncAt}\n`);

      // Supprimer
      const result = await db.collection('carriers').deleteOne({ externalId: '3867700' });
      console.log(`✅ Supprimé: ${result.deletedCount} document(s)\n`);
    } else {
      console.log('❌ "1 UP" non trouvé\n');
    }

    // Afficher le total restant
    const total = await db.collection('carriers').countDocuments({ externalSource: 'dashdoc' });
    console.log(`📊 Carriers Dashdoc restants: ${total}\n`);

    // Lister les carriers restants
    const remaining = await db.collection('carriers').find({ externalSource: 'dashdoc' }).toArray();
    console.log('Carriers Dashdoc restants:');
    remaining.forEach(c => {
      console.log(`  - ${c.companyName} (${c.remoteId})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.close();
  }
}

delete1UP();
