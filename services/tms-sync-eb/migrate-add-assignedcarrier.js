/**
 * Script de migration pour ajouter assignedCarrier aux données existantes
 *
 * Ce script:
 * 1. Lit tous les transports du Data Lake
 * 2. Récupère les détails depuis Dashdoc API
 * 3. Mappe avec le nouveau code incluant assignedCarrier
 * 4. Met à jour Data Lake et commandes Symphonia
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const DashdocConnector = require('./connectors/dashdoc.connector');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync";
const DASHDOC_API_TOKEN = process.env.DASHDOC_API_TOKEN;
const BATCH_SIZE = 50; // Traiter par lots de 50
const DELAY_BETWEEN_BATCHES = 2000; // 2 secondes entre les lots

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateTransports() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Migration assignedCarrier - Data Lake + Orders          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  if (!DASHDOC_API_TOKEN) {
    console.error("❌ DASHDOC_API_TOKEN non configuré!");
    console.error("   Vérifier le fichier .env");
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);
  const dashdocConnector = new DashdocConnector(DASHDOC_API_TOKEN);

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

    console.log("📊 État initial:");
    console.log(`   Total transports: ${totalTransports}`);
    console.log(`   Avec assignedCarrier: ${withCarrier}`);
    console.log(`   À migrer: ${totalTransports - withCarrier}\n`);

    if (withCarrier === totalTransports) {
      console.log("✅ Tous les transports ont déjà assignedCarrier!");
      return;
    }

    // Récupérer les UIDs de tous les transports sans assignedCarrier
    console.log("📋 Récupération des transports à migrer...");
    const transportsToMigrate = await db.collection('dashdoctransports')
      .find(
        { assignedCarrier: { $exists: false } },
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
    let notFound = 0;

    console.log("🔄 Début de la migration...\n");

    for (let i = 0; i < totalToMigrate; i += BATCH_SIZE) {
      const batch = transportsToMigrate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(totalToMigrate / BATCH_SIZE);

      console.log(`📦 Lot ${batchNum}/${totalBatches} (${batch.length} transports)...`);

      for (const { uid } of batch) {
        try {
          // Récupérer le transport complet depuis Dashdoc API
          // getTransport() fait déjà le mapping avec assignedCarrier
          const mappedTransport = await dashdocConnector.getTransport(uid);

          if (!mappedTransport) {
            notFound++;
            if (notFound <= 10) {
              console.log(`   ⚠️  Transport non trouvé dans Dashdoc: ${uid}`);
            }
            processed++;
            continue;
          }

          if (!mappedTransport.assignedCarrier) {
            // Pas de carrier assigné, on met à jour quand même pour éviter de retraiter
            await db.collection('dashdoctransports').updateOne(
              { uid: uid },
              {
                $set: {
                  assignedCarrier: null,
                  updatedAt: new Date()
                }
              }
            );
            processed++;
            continue;
          }

          // Mettre à jour le Data Lake
          await db.collection('dashdoctransports').updateOne(
            { uid: uid },
            {
              $set: {
                assignedCarrier: mappedTransport.assignedCarrier,
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
                  assignedCarrier: mappedTransport.assignedCarrier,
                  updatedAt: new Date()
                }
              }
            );
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

      console.log(`   ✅ ${processed}/${totalToMigrate} traités (${updated} mis à jour, ${errors} erreurs, ${notFound} non trouvés)\n`);

      // Pause entre les lots pour ne pas surcharger l'API
      if (i + BATCH_SIZE < totalToMigrate) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }
    }

    // Statistiques finales
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  MIGRATION TERMINÉE                                       ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");

    const finalWithCarrier = await db.collection('dashdoctransports').countDocuments({
      assignedCarrier: { $exists: true }
    });

    console.log("📊 Résultats:");
    console.log(`   ✅ Transports mis à jour: ${updated}`);
    console.log(`   ⚠️  Non trouvés dans Dashdoc: ${notFound}`);
    console.log(`   ❌ Erreurs: ${errors}`);
    console.log(`   📈 Total avec assignedCarrier: ${finalWithCarrier}/${totalTransports}`);
    console.log("");

    // Exemple
    const example = await db.collection('dashdoctransports').findOne({
      assignedCarrier: { $exists: true, $ne: null }
    });

    if (example) {
      console.log("📋 Exemple de transport migré:");
      console.log(`   UID: ${example.uid}`);
      console.log(`   Chauffeur: ${example.assignedCarrier.driverName || 'N/A'}`);
      console.log(`   Véhicule: ${example.assignedCarrier.vehiclePlate || 'N/A'}`);
      console.log(`   Transporteur: ${example.assignedCarrier.carrierName || 'N/A'}`);
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
console.log("⚠️  Ce script va récupérer les données depuis Dashdoc API");
console.log("   Cela peut prendre plusieurs minutes selon le nombre de transports.");
console.log("");

migrateTransports()
  .then(() => {
    console.log("✅ Migration terminée avec succès!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  });
