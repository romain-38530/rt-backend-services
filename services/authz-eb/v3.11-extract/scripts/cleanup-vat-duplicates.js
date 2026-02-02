// Script pour nettoyer les doublons de numéro de TVA
// Garde seulement la première entrée (la plus ancienne) pour chaque numéro de TVA

const { MongoClient } = require('mongodb');

// URI MongoDB depuis les variables d'environnement ou valeur par défaut
const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth';

async function cleanupVatDuplicates() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connexion à MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas\n');

    const db = client.db('rt-auth');
    const collection = db.collection('onboarding_requests');

    // Chercher tous les doublons de vatNumber
    console.log('🔍 Recherche des doublons de numéro de TVA...\n');
    const duplicates = await collection.aggregate([
      { $match: { vatNumber: { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$vatNumber',
          count: { $sum: 1 },
          docs: {
            $push: {
              _id: '$_id',
              email: '$email',
              companyName: '$companyName',
              createdAt: '$createdAt'
            }
          }
        }
      },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    if (duplicates.length === 0) {
      console.log('✅ Aucun doublon trouvé !');
      return;
    }

    console.log(`⚠️  ${duplicates.length} numéro(s) de TVA en double trouvé(s):\n`);

    // Afficher les doublons
    duplicates.forEach(dup => {
      console.log(`📋 TVA: ${dup._id} (${dup.count} occurrences)`);
      dup.docs.forEach((doc, index) => {
        console.log(`   ${index + 1}. ${doc.email} - ${doc.companyName} (${doc.createdAt})`);
      });
      console.log('');
    });

    // Demander confirmation (en mode interactif) ou nettoyer automatiquement
    console.log('🧹 Nettoyage des doublons...');
    console.log('   Stratégie: Garder le plus ancien, supprimer les autres\n');

    let totalDeleted = 0;

    for (const dup of duplicates) {
      // Trier par date de création (garder le plus ancien)
      const sortedDocs = dup.docs.sort((a, b) => a.createdAt - b.createdAt);
      const toKeep = sortedDocs[0];
      const toDelete = sortedDocs.slice(1);

      console.log(`🔧 TVA ${dup._id}:`);
      console.log(`   ✅ GARDER: ${toKeep.email} (créé le ${toKeep.createdAt})`);

      for (const doc of toDelete) {
        try {
          const result = await collection.deleteOne({ _id: doc._id });
          if (result.deletedCount > 0) {
            console.log(`   🗑️  SUPPRIMÉ: ${doc.email} (créé le ${doc.createdAt})`);
            totalDeleted++;
          }
        } catch (error) {
          console.error(`   ❌ Erreur lors de la suppression de ${doc.email}:`, error.message);
        }
      }
      console.log('');
    }

    console.log(`\n✅ Nettoyage terminé !`);
    console.log(`   - ${totalDeleted} doublon(s) supprimé(s)`);
    console.log(`   - ${duplicates.length} numéro(s) de TVA nettoyé(s)\n`);

    // Vérifier qu'il n'y a plus de doublons
    const remainingDuplicates = await collection.aggregate([
      { $match: { vatNumber: { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$vatNumber',
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (remainingDuplicates.length === 0) {
      console.log('✅ Vérification: Aucun doublon restant\n');
    } else {
      console.log(`⚠️  Attention: ${remainingDuplicates.length} doublon(s) restant(s)\n`);
    }

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Déconnecté de MongoDB\n');
  }
}

// Exécuter le script
if (require.main === module) {
  cleanupVatDuplicates()
    .then(() => {
      console.log('🎉 Script exécuté avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Échec du script:', error);
      process.exit(1);
    });
}

module.exports = { cleanupVatDuplicates };
