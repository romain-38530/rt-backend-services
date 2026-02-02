/**
 * Script de configuration de la connexion Dashdoc
 * Usage: node setup-dashdoc-connection.js <DASHDOC_API_TOKEN>
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync';

async function setupDashdocConnection(apiToken) {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('🔄 Connexion à MongoDB...');
    await client.connect();
    console.log('✅ Connecté à MongoDB');

    const db = client.db('rt-tms-sync');
    const collection = db.collection('tmsConnections');

    // Vérifier si une connexion existe déjà
    console.log('\n🔍 Recherche d\'une connexion Dashdoc existante...');
    const existing = await collection.findOne({ tmsType: 'dashdoc' });

    if (existing) {
      console.log('⚠️  Une connexion Dashdoc existe déjà:');
      console.log(`   - ID: ${existing._id}`);
      console.log(`   - Organisation: ${existing.organizationName || 'N/A'}`);
      console.log(`   - Status: ${existing.isActive ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   - Connection: ${existing.connectionStatus || 'unknown'}`);
      console.log(`   - API URL: ${existing.credentials?.apiUrl || 'N/A'}`);

      // Mettre à jour le token
      console.log('\n🔄 Mise à jour du token API...');
      await collection.updateOne(
        { _id: existing._id },
        {
          $set: {
            'credentials.apiToken': apiToken,
            isActive: true,
            connectionStatus: 'connected',
            updatedAt: new Date()
          }
        }
      );
      console.log('✅ Token API mis à jour');
    } else {
      console.log('📝 Aucune connexion trouvée, création d\'une nouvelle...');

      const newConnection = {
        tmsType: 'dashdoc',
        organizationName: 'SYMPHONIA',
        isActive: true,
        connectionStatus: 'connected',
        credentials: {
          apiToken: apiToken,
          apiUrl: 'https://www.dashdoc.eu/api/v4'
        },
        syncConfig: {
          autoSync: true,
          transportLimit: 0,
          companyLimit: 0,
          contactLimit: 0,
          maxPages: 100
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await collection.insertOne(newConnection);
      console.log(`✅ Nouvelle connexion créée avec ID: ${result.insertedId}`);
    }

    // Vérifier la configuration finale
    console.log('\n📊 Configuration finale:');
    const finalConnection = await collection.findOne({ tmsType: 'dashdoc' });
    console.log(`   - ID: ${finalConnection._id}`);
    console.log(`   - Organisation: ${finalConnection.organizationName}`);
    console.log(`   - Active: ${finalConnection.isActive ? '✅ Oui' : '❌ Non'}`);
    console.log(`   - API URL: ${finalConnection.credentials.apiUrl}`);
    console.log(`   - Token: ${finalConnection.credentials.apiToken.substring(0, 20)}...`);
    console.log(`   - Auto-sync: ${finalConnection.syncConfig.autoSync ? '✅ Activé' : '❌ Désactivé'}`);
    console.log(`   - Max pages: ${finalConnection.syncConfig.maxPages}`);

    console.log('\n✅ Configuration terminée avec succès!');
    console.log('\n📋 Prochaines étapes:');
    console.log('   1. Attendre ~5 minutes (prochain job carriersSync)');
    console.log('   2. Ou lancer manuellement:');
    console.log('      curl -X POST http://rt-tms-sync-api-v2.../api/v1/jobs/carriersSync/run');
    console.log('   3. Vérifier le résultat après 15-20 minutes:');
    console.log('      curl http://rt-tms-sync-api-v2.../api/v1/tms/carriers | jq .total');
    console.log('      (Résultat attendu: ~1365)');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Récupérer le token depuis les arguments
const apiToken = process.argv[2];

if (!apiToken) {
  console.error('❌ Erreur: Token API Dashdoc requis');
  console.log('\nUsage:');
  console.log('  node setup-dashdoc-connection.js <DASHDOC_API_TOKEN>');
  console.log('\nExemple:');
  console.log('  node setup-dashdoc-connection.js "votre-token-dashdoc-ici"');
  console.log('\n💡 Pour obtenir le token:');
  console.log('  1. Se connecter sur https://www.dashdoc.eu');
  console.log('  2. Aller dans Paramètres → Intégrations → API');
  console.log('  3. Copier le token API');
  process.exit(1);
}

setupDashdocConnection(apiToken);
