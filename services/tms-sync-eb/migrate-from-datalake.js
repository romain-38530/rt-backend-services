/**
 * Migration assignedCarrier depuis Data Lake
 *
 * Ce script utilise UNIQUEMENT le Data Lake (pas l'API Dashdoc):
 * 1. Lit chaque transport du Data Lake
 * 2. Re-mappe rawData avec mapTransport() pour générer assignedCarrier
 * 3. Met à jour le transport dans le Data Lake
 * 4. Met à jour la commande correspondante dans Symphonia
 */

const { MongoClient } = require('mongodb');
const DashdocConnector = require('./connectors/dashdoc.connector');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync";
const BATCH_SIZE = 100; // Traiter par lots de 100
const DELAY_BETWEEN_BATCHES = 500; // 0.5 secondes entre les lots

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateFromDataLake() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Migration assignedCarrier depuis Data Lake              ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  const client = new MongoClient(MONGODB_URI);
  const dashdoc = new DashdocConnector('dummy-token'); // Token non utilisé pour mapping

  try {
    // Connexion
    console.log("🔌 Connexion à MongoDB...");
    await client.connect();
    const db = client.db("rt-tms-sync");
    console.log("   ✅ Connecté\n");

    // Statistiques initiales
    const totalTransports = await db.collection('dashdoctransports').countDocuments();
    const withCarrier = await db.collection('dashdoctransports').countDocuments({
      assignedCarrier: { $exists: true }
    });
    const withRawData = await db.collection('dashdoctransports').countDocuments({
      rawData: { $exists: true }
    });

    console.log("📊 État initial:");
    console.log(`   Total transports: ${totalTransports}`);
    console.log(`   Avec rawData: ${withRawData}`);
    console.log(`   Avec assignedCarrier: ${withCarrier}`);
    console.log(`   À migrer: ${totalTransports - withCarrier}\n`);

    if (withCarrier === totalTransports) {
      console.log("✅ Tous les transports ont déjà assignedCarrier!");
      return;
    }

    if (withRawData === 0) {
      console.log("❌ Aucun transport n'a rawData - migration impossible!");
      return;
    }

    // Récupérer les UIDs de tous les transports sans assignedCarrier
    console.log("📋 Récupération des transports à migrer...");
    const transportsToMigrate = await db.collection('dashdoctransports')
      .find(
        {
          assignedCarrier: { $exists: false },
          rawData: { $exists: true }
        },
        { projection: { uid: 1, _id: 0 } }
      )
      .toArray();

    const totalToMigrate = transportsToMigrate.length;
    console.log(`   ${totalToMigrate} transports à traiter\n`);

    if (totalToMigrate === 0) {
      console.log("✅ Rien à migrer!");
      return;
    }

    // Traiter par lots
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let noRawData = 0;
    let noOrder = 0;

    console.log("🔄 Début de la migration...\n");

    for (let i = 0; i < totalToMigrate; i += BATCH_SIZE) {
      const batch = transportsToMigrate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalToMigrate / BATCH_SIZE);

      console.log(`📦 Lot ${batchNum}/${totalBatches} (${batch.length} transports)...`);

      for (const { uid } of batch) {
        try {
          // Récupérer le transport depuis le Data Lake
          const transport = await db.collection('dashdoctransports').findOne({ uid });

          if (!transport || !transport.rawData) {
            noRawData++;
            processed++;
            continue;
          }

          // Mapper rawData pour générer assignedCarrier
          const mapped = dashdoc.mapTransport(transport.rawData);

          // Mettre à jour le transport dans le Data Lake
          await db.collection('dashdoctransports').updateOne(
            { uid: uid },
            {
              $set: {
                assignedCarrier: mapped.assignedCarrier,
                updatedAt: new Date()
              }
            }
          );

          // Mettre à jour la commande correspondante si elle existe
          const order = await db.collection('orders').findOne({
            "metadata.dashdocTransportUid": uid
          });

          if (order) {
            await db.collection('orders').updateOne(
              { _id: order._id },
              {
                $set: {
                  assignedCarrier: mapped.assignedCarrier,
                  updatedAt: new Date()
                }
              }
            );
          } else {
            noOrder++;
          }

          updated++;
          processed++;

        } catch (error) {
          errors++;
          if (errors <= 10) {
            console.log(`   ❌ Erreur ${uid}: ${error.message}`);
          }
          processed++;
        }
      }

      // Afficher progression
      const progress = ((processed / totalToMigrate) * 100).toFixed(1);
      console.log(`   ✅ ${processed}/${totalToMigrate} traités (${progress}%) - ${updated} mis à jour`);

      // Pause entre les lots
      if (i + BATCH_SIZE < totalToMigrate) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    console.log("");

    // Statistiques finales
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  MIGRATION TERMINÉE                                       ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");

    const finalWithCarrier = await db.collection('dashdoctransports').countDocuments({
      assignedCarrier: { $exists: true }
    });

    const ordersWithCarrier = await db.collection('orders').countDocuments({
      assignedCarrier: { $exists: true }
    });

    const totalOrders = await db.collection('orders').countDocuments();

    console.log("📊 Résultats:");
    console.log(`   ✅ Transports mis à jour: ${updated}`);
    console.log(`   ⚠️  Sans rawData: ${noRawData}`);
    console.log(`   ⚠️  Sans commande correspondante: ${noOrder}`);
    console.log(`   ❌ Erreurs: ${errors}`);
    console.log("");
    console.log("📈 État final:");
    console.log(`   Transports avec assignedCarrier: ${finalWithCarrier}/${totalTransports} (${((finalWithCarrier/totalTransports)*100).toFixed(1)}%)`);
    console.log(`   Commandes avec assignedCarrier: ${ordersWithCarrier}/${totalOrders} (${((ordersWithCarrier/totalOrders)*100).toFixed(1)}%)`);
    console.log("");

    // Exemples
    const transportExample = await db.collection('dashdoctransports').findOne({
      assignedCarrier: { $exists: true, $ne: null },
      "assignedCarrier.driverName": { $ne: null }
    });

    if (transportExample) {
      console.log("📋 Exemple de transport migré (avec chauffeur):");
      console.log(`   UID: ${transportExample.uid}`);
      console.log(`   Transporteur: ${transportExample.assignedCarrier.carrierName || 'N/A'}`);
      console.log(`   Chauffeur: ${transportExample.assignedCarrier.driverName || 'N/A'}`);
      console.log(`   Véhicule: ${transportExample.assignedCarrier.vehiclePlate || 'N/A'}`);
      console.log("");
    }

    const orderExample = await db.collection('orders').findOne({
      assignedCarrier: { $exists: true, $ne: null }
    });

    if (orderExample) {
      console.log("📋 Exemple de commande mise à jour:");
      console.log(`   Order ID: ${orderExample._id}`);
      console.log(`   Transporteur: ${orderExample.assignedCarrier?.carrierName || 'N/A'}`);
      console.log(`   Chauffeur: ${orderExample.assignedCarrier?.driverName || 'N/A'}`);
      console.log(`   Véhicule: ${orderExample.assignedCarrier?.vehiclePlate || 'N/A'}`);
      console.log("");
    }

  } catch (error) {
    console.error("❌ ERREUR FATALE:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Exécuter
console.log("ℹ️  Ce script utilise le Data Lake local (pas l'API Dashdoc)");
console.log("   Migration rapide basée sur les données déjà synchronisées.");
console.log("");

migrateFromDataLake()
  .then(() => {
    console.log("✅ Migration terminée avec succès!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  });
