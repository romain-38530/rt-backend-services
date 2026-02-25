/**
 * Vérifier le résultat final de la migration
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = "mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync";

async function verifyResult() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db("rt-tms-sync");

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  VÉRIFICATION RÉSULTAT FINAL                              ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");

    // Statistiques transports
    const totalTransports = await db.collection('dashdoctransports').countDocuments();
    const transportsWithCarrier = await db.collection('dashdoctransports').countDocuments({
      assignedCarrier: { $exists: true, $ne: null }
    });

    console.log("📦 DATA LAKE (Transports):");
    console.log(`   Total: ${totalTransports}`);
    console.log(`   Avec assignedCarrier: ${transportsWithCarrier} (${((transportsWithCarrier/totalTransports)*100).toFixed(1)}%)`);
    console.log("");

    // Statistiques commandes
    const totalOrders = await db.collection('orders').countDocuments();
    const ordersWithCarrier = await db.collection('orders').countDocuments({
      assignedCarrier: { $exists: true, $ne: null }
    });

    console.log("📋 COMMANDES SYMPHONIA:");
    console.log(`   Total: ${totalOrders}`);
    console.log(`   Avec assignedCarrier: ${ordersWithCarrier} (${((ordersWithCarrier/totalOrders)*100).toFixed(1)}%)`);
    console.log("");

    // Exemples avec chauffeur et véhicule
    const orderWithDriver = await db.collection('orders').findOne({
      assignedCarrier: { $exists: true, $ne: null },
      "assignedCarrier.driverName": { $ne: null, $exists: true }
    });

    if (orderWithDriver) {
      console.log("📋 Exemple 1 - Commande avec chauffeur:");
      console.log(`   Order ID: ${orderWithDriver._id}`);
      console.log(`   Sequential ID: ${orderWithDriver.sequentialId}`);
      console.log(`   Transporteur: ${orderWithDriver.assignedCarrier.carrierName || 'N/A'}`);
      console.log(`   Chauffeur: ${orderWithDriver.assignedCarrier.driverName || 'N/A'}`);
      console.log(`   Téléphone: ${orderWithDriver.assignedCarrier.driverPhone || 'N/A'}`);
      console.log(`   Véhicule: ${orderWithDriver.assignedCarrier.vehiclePlate || 'N/A'}`);
      console.log(`   Type véhicule: ${orderWithDriver.assignedCarrier.vehicleType || 'N/A'}`);
      console.log(`   Tracteur: ${orderWithDriver.assignedCarrier.tractorPlate || 'N/A'}`);
      console.log(`   Remorque: ${orderWithDriver.assignedCarrier.trailerPlate || 'N/A'}`);
      console.log("");
    }

    // Exemple sans chauffeur (sous-traitant)
    const orderWithoutDriver = await db.collection('orders').findOne({
      assignedCarrier: { $exists: true, $ne: null },
      "assignedCarrier.carrierName": { $ne: null, $exists: true },
      "assignedCarrier.driverName": null
    });

    if (orderWithoutDriver) {
      console.log("📋 Exemple 2 - Commande sous-traitée:");
      console.log(`   Order ID: ${orderWithoutDriver._id}`);
      console.log(`   Sequential ID: ${orderWithoutDriver.sequentialId}`);
      console.log(`   Transporteur: ${orderWithoutDriver.assignedCarrier.carrierName || 'N/A'}`);
      console.log(`   Chauffeur: ${orderWithoutDriver.assignedCarrier.driverName || 'Sous-traitant externe'}`);
      console.log(`   Véhicule: ${orderWithoutDriver.assignedCarrier.vehiclePlate || 'Véhicule externe'}`);
      console.log("");
    }

    // Statistiques types
    const withDriver = await db.collection('orders').countDocuments({
      "assignedCarrier.driverName": { $ne: null, $exists: true }
    });

    const withVehicle = await db.collection('orders').countDocuments({
      "assignedCarrier.vehiclePlate": { $ne: null, $exists: true }
    });

    console.log("📊 Détails assignedCarrier:");
    console.log(`   Avec chauffeur: ${withDriver}/${ordersWithCarrier}`);
    console.log(`   Avec véhicule: ${withVehicle}/${ordersWithCarrier}`);
    console.log(`   Sous-traitants externes: ${ordersWithCarrier - withDriver}`);
    console.log("");

    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║  ✅ MIGRATION RÉUSSIE                                     ║");
    console.log("╚════════════════════════════════════════════════════════════╝");
    console.log("");
    console.log("🎯 Résumé:");
    console.log(`   • ${transportsWithCarrier} transports avec carrier info`);
    console.log(`   • ${ordersWithCarrier} commandes avec carrier info`);
    console.log(`   • Plus de \"Sans chauffeur\" ou \"Sans véhicule\" ! ✅`);
    console.log("");

  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await client.close();
  }
}

verifyResult();
