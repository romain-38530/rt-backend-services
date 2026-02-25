/**
 * Mettre à jour les commandes Symphonia avec assignedCarrier depuis les transports Data Lake
 * Utilise le lien: Order.externalId = Transport.uid
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync";
const BATCH_SIZE = 100;

async function updateOrders() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  Mise à jour Orders avec assignedCarrier                 ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db("rt-tms-sync");

    // Statistiques initiales
    const totalOrders = await db.collection('orders').countDocuments();
    const withCarrier = await db.collection('orders').countDocuments({
      assignedCarrier: { $exists: true }
    });

    console.log("📊 État initial:");
    console.log(`   Total commandes: ${totalOrders}`);
    console.log(`   Avec assignedCarrier: ${withCarrier}`);
    console.log(`   À mettre à jour: ${totalOrders - withCarrier}\n`);

    if (withCarrier === totalOrders) {
      console.log("✅ Toutes les commandes ont déjà assignedCarrier!");
      return;
    }

    // Récupérer toutes les commandes
    console.log("📋 Récupération des commandes à mettre à jour...");
    const orders = await db.collection('orders')
      .find(
        { assignedCarrier: { $exists: false } },
        { projection: { _id: 1, externalId: 1 } }
      )
      .toArray();

    const toUpdate = orders.filter(o => o.externalId);
    console.log(`   ${toUpdate.length} commandes à traiter\n`);

    if (toUpdate.length === 0) {
      console.log("✅ Rien à mettre à jour!");
      return;
    }

    // Traiter par lots
    let processed = 0;
    let updated = 0;
    let notFound = 0;
    let noCarrier = 0;

    console.log("🔄 Début de la mise à jour...\n");

    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(toUpdate.length / BATCH_SIZE);

      console.log(`📦 Lot ${batchNum}/${totalBatches} (${batch.length} commandes)...`);

      for (const order of batch) {
        try {
          // Chercher le transport correspondant
          const transport = await db.collection('dashdoctransports').findOne(
            { uid: order.externalId },
            { projection: { assignedCarrier: 1 } }
          );

          if (!transport) {
            notFound++;
            processed++;
            continue;
          }

          if (!transport.assignedCarrier) {
            noCarrier++;
            // Mettre null pour éviter de retraiter
            await db.collection('orders').updateOne(
              { _id: order._id },
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

          // Mettre à jour la commande
          await db.collection('orders').updateOne(
            { _id: order._id },
            {
              $set: {
                assignedCarrier: transport.assignedCarrier,
                updatedAt: new Date()
              }
            }
          );

          updated++;
          processed++;

        } catch (error) {
          console.log(`   ❌ Erreur ${order._id}: ${error.message}`);
          processed++;
        }
      }

      const progress = ((processed / toUpdate.length) * 100).toFixed(1);
      console.log(`   ✅ ${processed}/${toUpdate.length} traités (${progress}%) - ${updated} mis à jour`);
    }

    console.log("");

    // Statistiques finales
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  MISE À JOUR TERMINÉE                                     ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");

    const finalWithCarrier = await db.collection('orders').countDocuments({
      assignedCarrier: { $exists: true, $ne: null }
    });

    console.log("📊 Résultats:");
    console.log(`   ✅ Commandes mises à jour: ${updated}`);
    console.log(`   ⚠️  Transports non trouvés: ${notFound}`);
    console.log(`   ⚠️  Sans carrier assigné: ${noCarrier}`);
    console.log("");
    console.log("📈 État final:");
    console.log(`   Commandes avec assignedCarrier: ${finalWithCarrier}/${totalOrders} (${((finalWithCarrier/totalOrders)*100).toFixed(1)}%)`);
    console.log("");

    // Exemple
    const example = await db.collection('orders').findOne({
      assignedCarrier: { $exists: true, $ne: null },
      "assignedCarrier.driverName": { $ne: null }
    });

    if (example) {
      console.log("📋 Exemple de commande mise à jour:");
      console.log(`   Order ID: ${example._id}`);
      console.log(`   External ID: ${example.externalId}`);
      console.log(`   Transporteur: ${example.assignedCarrier.carrierName || 'N/A'}`);
      console.log(`   Chauffeur: ${example.assignedCarrier.driverName || 'N/A'}`);
      console.log(`   Véhicule: ${example.assignedCarrier.vehiclePlate || 'N/A'}`);
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

updateOrders()
  .then(() => {
    console.log("✅ Mise à jour terminée avec succès!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Erreur:", error);
    process.exit(1);
  });
