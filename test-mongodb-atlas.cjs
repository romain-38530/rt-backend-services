/**
 * Test de connexion MongoDB Atlas
 * Lance ce script après avoir configuré MongoDB Atlas
 */

const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGODB_URI;

async function testConnection() {
  console.log('========================================');
  console.log('   TEST CONNEXION MONGODB ATLAS');
  console.log('========================================\n');

  if (!uri) {
    console.error('❌ MONGODB_URI non définie dans .env');
    process.exit(1);
  }

  // Masquer le mot de passe dans l'affichage
  const safeUri = uri.replace(/:[^:@]+@/, ':****@');
  console.log('🔗 URI de connexion:', safeUri);
  console.log('');

  const client = new MongoClient(uri);

  try {
    console.log('🔄 Connexion à MongoDB...');
    await client.connect();
    console.log('✅ Connecté avec succès !\n');

    const db = client.db('rt-technologie');

    // Test 1: Lister les collections
    console.log('📋 Test 1: Liste des collections');
    const collections = await db.listCollections().toArray();
    console.log(`   Nombre de collections: ${collections.length}`);

    if (collections.length > 0) {
      console.log('   Collections trouvées:');
      collections.forEach(col => console.log(`     - ${col.name}`));
    } else {
      console.log('   ℹ️  Aucune collection (normal pour une nouvelle base)');
    }
    console.log('   ✅ Test 1 PASSED\n');

    // Test 2: Créer une collection de test
    console.log('📋 Test 2: Création collection de test');
    const testCollection = db.collection('_test_connection');

    // Insérer un document de test
    const testDoc = {
      test: true,
      message: 'MongoDB Atlas fonctionne !',
      timestamp: new Date(),
      service: 'rt-backend-services'
    };

    const insertResult = await testCollection.insertOne(testDoc);
    console.log(`   Document inséré avec ID: ${insertResult.insertedId}`);
    console.log('   ✅ Test 2 PASSED\n');

    // Test 3: Lire le document
    console.log('📋 Test 3: Lecture du document');
    const foundDoc = await testCollection.findOne({ test: true });
    console.log('   Document trouvé:', foundDoc ? 'Oui' : 'Non');
    console.log('   Message:', foundDoc.message);
    console.log('   ✅ Test 3 PASSED\n');

    // Test 4: Mettre à jour le document
    console.log('📋 Test 4: Mise à jour du document');
    const updateResult = await testCollection.updateOne(
      { test: true },
      { $set: { updated: true, updatedAt: new Date() } }
    );
    console.log('   Documents modifiés:', updateResult.modifiedCount);
    console.log('   ✅ Test 4 PASSED\n');

    // Test 5: Supprimer le document de test
    console.log('📋 Test 5: Suppression du document de test');
    const deleteResult = await testCollection.deleteOne({ test: true });
    console.log('   Documents supprimés:', deleteResult.deletedCount);
    console.log('   ✅ Test 5 PASSED\n');

    // Test 6: Créer un index
    console.log('📋 Test 6: Création d\'un index');
    await testCollection.createIndex({ timestamp: 1 });
    console.log('   Index créé sur "timestamp"');
    console.log('   ✅ Test 6 PASSED\n');

    // Test 7: Vérifier les stats de la base
    console.log('📋 Test 7: Statistiques de la base');
    const stats = await db.stats();
    console.log(`   Base de données: ${stats.db}`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Taille: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Indexes: ${stats.indexes}`);
    console.log('   ✅ Test 7 PASSED\n');

    console.log('========================================');
    console.log('   🎉 TOUS LES TESTS SONT PASSÉS !');
    console.log('========================================\n');

    console.log('✅ MongoDB Atlas est prêt à être utilisé !');
    console.log('\n📍 Prochaines étapes:');
    console.log('   1. Démarrer le service TMS Sync:');
    console.log('      cd services/tms-sync-eb');
    console.log('      node index.js\n');
    console.log('   2. Tester l\'API:');
    console.log('      curl http://localhost:3000/health\n');
    console.log('   3. Lancer les tests:');
    console.log('      node test-advanced-sync.js\n');

  } catch (error) {
    console.error('\n❌ ERREUR lors de la connexion:');
    console.error('   Message:', error.message);

    if (error.message.includes('authentication failed')) {
      console.error('\n💡 Solution:');
      console.error('   - Vérifie le nom d\'utilisateur et le mot de passe dans MONGODB_URI');
      console.error('   - Assure-toi que l\'utilisateur existe dans MongoDB Atlas');
      console.error('   - Vérifie que le mot de passe ne contient pas de caractères spéciaux non encodés');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('timeout')) {
      console.error('\n💡 Solution:');
      console.error('   - Vérifie ta connexion internet');
      console.error('   - Vérifie que 0.0.0.0/0 est autorisé dans Network Access');
      console.error('   - Attends quelques minutes que le cluster soit complètement démarré');
    }

    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Connexion fermée');
  }
}

// Exécuter le test
testConnection().catch(console.error);
