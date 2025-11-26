// Script pour créer les index MongoDB pour le système de gestion des transporteurs
// Usage: node scripts/setup-carrier-indexes.js

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth';

async function setupCarrierIndexes() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n📦 Configuration des index MongoDB pour le système de transporteurs');
    console.log('====================================================================\n');

    console.log('🔌 Connexion à MongoDB Atlas...');
    await client.connect();
    console.log('✅ Connecté à MongoDB Atlas\n');

    const db = client.db('rt-auth');

    // ===== COLLECTION: carriers =====
    console.log('📋 Configuration de la collection "carriers"...\n');

    const carriersCollection = db.collection('carriers');

    // Index unique sur email
    console.log('  1️⃣  Création de l\'index unique sur email...');
    await carriersCollection.createIndex(
      { email: 1 },
      {
        unique: true,
        name: 'email_unique_idx',
        background: true
      }
    );
    console.log('     ✓ Index email_unique_idx créé\n');

    // Index unique sur SIRET
    console.log('  2️⃣  Création de l\'index unique sur siret...');
    await carriersCollection.createIndex(
      { siret: 1 },
      {
        unique: true,
        name: 'siret_unique_idx',
        background: true,
        sparse: true  // Permet les valeurs null
      }
    );
    console.log('     ✓ Index siret_unique_idx créé\n');

    // Index unique sur VAT number
    console.log('  3️⃣  Création de l\'index unique sur vatNumber...');
    await carriersCollection.createIndex(
      { vatNumber: 1 },
      {
        unique: true,
        name: 'carrier_vatNumber_unique_idx',
        background: true,
        sparse: true  // Permet les valeurs null
      }
    );
    console.log('     ✓ Index carrier_vatNumber_unique_idx créé\n');

    // Index sur status
    console.log('  4️⃣  Création de l\'index sur status...');
    await carriersCollection.createIndex(
      { status: 1 },
      {
        name: 'status_idx',
        background: true
      }
    );
    console.log('     ✓ Index status_idx créé\n');

    // Index sur vigilanceStatus
    console.log('  5️⃣  Création de l\'index sur vigilanceStatus...');
    await carriersCollection.createIndex(
      { vigilanceStatus: 1 },
      {
        name: 'vigilanceStatus_idx',
        background: true
      }
    );
    console.log('     ✓ Index vigilanceStatus_idx créé\n');

    // Index sur score (pour tri)
    console.log('  6️⃣  Création de l\'index sur score...');
    await carriersCollection.createIndex(
      { score: -1 },
      {
        name: 'score_idx',
        background: true
      }
    );
    console.log('     ✓ Index score_idx créé\n');

    // Index sur isBlocked
    console.log('  7️⃣  Création de l\'index sur isBlocked...');
    await carriersCollection.createIndex(
      { isBlocked: 1 },
      {
        name: 'isBlocked_idx',
        background: true
      }
    );
    console.log('     ✓ Index isBlocked_idx créé\n');

    // Index sur invitedBy
    console.log('  8️⃣  Création de l\'index sur invitedBy...');
    await carriersCollection.createIndex(
      { invitedBy: 1 },
      {
        name: 'invitedBy_idx',
        background: true
      }
    );
    console.log('     ✓ Index invitedBy_idx créé\n');

    // ===== COLLECTION: carrier_documents =====
    console.log('📋 Configuration de la collection "carrier_documents"...\n');

    const documentsCollection = db.collection('carrier_documents');

    // Index sur carrierId
    console.log('  1️⃣  Création de l\'index sur carrierId...');
    await documentsCollection.createIndex(
      { carrierId: 1 },
      {
        name: 'carrierId_idx',
        background: true
      }
    );
    console.log('     ✓ Index carrierId_idx créé\n');

    // Index composé sur carrierId + documentType (unique)
    console.log('  2️⃣  Création de l\'index composé carrierId + documentType...');
    await documentsCollection.createIndex(
      { carrierId: 1, documentType: 1 },
      {
        unique: true,
        name: 'carrierId_documentType_unique_idx',
        background: true
      }
    );
    console.log('     ✓ Index carrierId_documentType_unique_idx créé\n');

    // Index sur status
    console.log('  3️⃣  Création de l\'index sur status...');
    await documentsCollection.createIndex(
      { status: 1 },
      {
        name: 'doc_status_idx',
        background: true
      }
    );
    console.log('     ✓ Index doc_status_idx créé\n');

    // Index sur expiryDate
    console.log('  4️⃣  Création de l\'index sur expiryDate...');
    await documentsCollection.createIndex(
      { expiryDate: 1 },
      {
        name: 'expiryDate_idx',
        background: true,
        sparse: true
      }
    );
    console.log('     ✓ Index expiryDate_idx créé\n');

    // ===== COLLECTION: pricing_grids =====
    console.log('📋 Configuration de la collection "pricing_grids"...\n');

    const gridsCollection = db.collection('pricing_grids');

    // Index sur carrierId
    console.log('  1️⃣  Création de l\'index sur carrierId...');
    await gridsCollection.createIndex(
      { carrierId: 1 },
      {
        name: 'grid_carrierId_idx',
        background: true
      }
    );
    console.log('     ✓ Index grid_carrierId_idx créé\n');

    // Index sur status
    console.log('  2️⃣  Création de l\'index sur status...');
    await gridsCollection.createIndex(
      { status: 1 },
      {
        name: 'grid_status_idx',
        background: true
      }
    );
    console.log('     ✓ Index grid_status_idx créé\n');

    // ===== COLLECTION: dispatch_chains =====
    console.log('📋 Configuration de la collection "dispatch_chains"...\n');

    const chainsCollection = db.collection('dispatch_chains');

    // Index unique sur industrialId
    console.log('  1️⃣  Création de l\'index unique sur industrialId...');
    await chainsCollection.createIndex(
      { industrialId: 1 },
      {
        unique: true,
        name: 'industrialId_unique_idx',
        background: true
      }
    );
    console.log('     ✓ Index industrialId_unique_idx créé\n');

    // ===== COLLECTION: carrier_events =====
    console.log('📋 Configuration de la collection "carrier_events"...\n');

    const eventsCollection = db.collection('carrier_events');

    // Index sur carrierId
    console.log('  1️⃣  Création de l\'index sur carrierId...');
    await eventsCollection.createIndex(
      { carrierId: 1 },
      {
        name: 'event_carrierId_idx',
        background: true
      }
    );
    console.log('     ✓ Index event_carrierId_idx créé\n');

    // Index sur eventType
    console.log('  2️⃣  Création de l\'index sur eventType...');
    await eventsCollection.createIndex(
      { eventType: 1 },
      {
        name: 'eventType_idx',
        background: true
      }
    );
    console.log('     ✓ Index eventType_idx créé\n');

    // Index sur timestamp (pour tri chronologique)
    console.log('  3️⃣  Création de l\'index sur timestamp...');
    await eventsCollection.createIndex(
      { timestamp: -1 },
      {
        name: 'timestamp_idx',
        background: true
      }
    );
    console.log('     ✓ Index timestamp_idx créé\n');

    // ===== STATISTIQUES =====
    console.log('📊 Statistiques des collections:\n');

    const collections = [
      'carriers',
      'carrier_documents',
      'pricing_grids',
      'dispatch_chains',
      'carrier_events'
    ];

    for (const collName of collections) {
      const coll = db.collection(collName);
      const count = await coll.countDocuments();
      const indexes = await coll.indexes();

      console.log(`  📦 ${collName}:`);
      console.log(`     - Documents: ${count}`);
      console.log(`     - Index: ${indexes.length}`);
      indexes.forEach(idx => {
        console.log(`       • ${idx.name} (${JSON.stringify(idx.key)})`);
      });
      console.log('');
    }

    console.log('✅ Configuration des index terminée avec succès!\n');

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
  setupCarrierIndexes()
    .then(() => {
      console.log('🎉 Script exécuté avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Échec du script:', error);
      process.exit(1);
    });
}

module.exports = { setupCarrierIndexes };
