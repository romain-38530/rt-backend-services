// Script pour configurer les index uniques MongoDB
// Prévient les doublons de numéro de TVA dans la collection onboarding_requests

const { MongoClient } = require('mongodb');

// URI MongoDB depuis les variables d'environnement ou valeur par défaut
const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth';

async function setupUniqueIndexes() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔌 Connexion à MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas\n');

    const db = client.db('rt-auth');
    const collection = db.collection('onboarding_requests');

    // Vérifier les index existants
    console.log('📊 Index existants avant modification:');
    const existingIndexes = await collection.indexes();
    console.table(existingIndexes.map(idx => ({
      name: idx.name,
      keys: JSON.stringify(idx.key),
      unique: idx.unique || false,
      sparse: idx.sparse || false
    })));

    // Créer l'index unique sur vatNumber
    console.log('\n🔧 Création de l\'index unique sur vatNumber...');
    try {
      const result = await collection.createIndex(
        { vatNumber: 1 },
        {
          unique: true,
          name: 'vatNumber_unique_idx',
          background: true,
          sparse: true  // Permet les valeurs null/undefined (plusieurs documents peuvent avoir null)
        }
      );
      console.log('✅ Index créé avec succès:', result);
    } catch (indexError) {
      if (indexError.code === 85) {
        console.log('ℹ️  L\'index existe déjà');
      } else {
        throw indexError;
      }
    }

    // Vérifier les index après création
    console.log('\n📊 Index après modification:');
    const updatedIndexes = await collection.indexes();
    console.table(updatedIndexes.map(idx => ({
      name: idx.name,
      keys: JSON.stringify(idx.key),
      unique: idx.unique || false,
      sparse: idx.sparse || false
    })));

    // Compter les documents avec vatNumber
    const totalDocs = await collection.countDocuments();
    const docsWithVat = await collection.countDocuments({ vatNumber: { $ne: null } });
    console.log(`\n📈 Statistiques:`);
    console.log(`   - Total de documents: ${totalDocs}`);
    console.log(`   - Documents avec numéro de TVA: ${docsWithVat}`);
    console.log(`   - Documents sans numéro de TVA: ${totalDocs - docsWithVat}`);

    // Vérifier s'il y a des doublons existants
    console.log('\n🔍 Recherche de doublons existants...');
    const duplicates = await collection.aggregate([
      { $match: { vatNumber: { $ne: null } } },
      {
        $group: {
          _id: '$vatNumber',
          count: { $sum: 1 },
          docs: { $push: { _id: '$_id', email: '$email', companyName: '$companyName' } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    if (duplicates.length > 0) {
      console.log('⚠️  ATTENTION: Doublons trouvés!');
      console.table(duplicates.map(dup => ({
        vatNumber: dup._id,
        count: dup.count,
        emails: dup.docs.map(d => d.email).join(', ')
      })));
      console.log('\n💡 Vous devez nettoyer ces doublons manuellement avant que l\'index unique puisse fonctionner correctement.');
    } else {
      console.log('✅ Aucun doublon trouvé');
    }

    console.log('\n✅ Configuration terminée avec succès!\n');

  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    if (error.code === 11000) {
      console.error('\n⚠️  Erreur: Il existe déjà des doublons dans la base de données.');
      console.error('   Vous devez d\'abord nettoyer les doublons avant de créer l\'index unique.');
    }
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Déconnecté de MongoDB\n');
  }
}

// Exécuter le script
if (require.main === module) {
  setupUniqueIndexes()
    .then(() => {
      console.log('🎉 Script exécuté avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Échec du script:', error);
      process.exit(1);
    });
}

module.exports = { setupUniqueIndexes };
