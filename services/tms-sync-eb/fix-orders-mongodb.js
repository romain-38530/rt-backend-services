/**
 * Script MongoDB pour corriger les commandes du 11/02
 * Exécution: mongosh "mongodb+srv://..." fix-orders-mongodb.js
 *
 * Ce script:
 * 1. Crée un backup
 * 2. Récupère assignedCarrier depuis Data Lake
 * 3. Met à jour les commandes Symphonia
 */

// Configuration
const START_DATE = new Date("2026-02-11T00:00:00.000Z");
const END_DATE = new Date("2026-02-16T00:00:00.000Z");
const BACKUP_COLLECTION = "orders_backup_20260211";

print("╔════════════════════════════════════════════════════════════╗");
print("║  Fix Commandes 11/02 - Correction assignedCarrier        ║");
print("╚════════════════════════════════════════════════════════════╝");
print("");

// Utiliser la bonne base de données
use("rt-tms-sync");

// ============================================================
// ÉTAPE 1: Diagnostic
// ============================================================
print("📊 [1/4] Diagnostic...");

const totalOrders = db.orders.countDocuments({
  createdAt: { $gte: START_DATE, $lt: END_DATE }
});

const ordersWithoutCarrier = db.orders.countDocuments({
  createdAt: { $gte: START_DATE, $lt: END_DATE },
  assignedCarrier: { $exists: false }
});

const ordersWithCarrier = totalOrders - ordersWithoutCarrier;

print(`   Total commandes: ${totalOrders}`);
print(`   ✅ Avec assignedCarrier: ${ordersWithCarrier}`);
print(`   ❌ Sans assignedCarrier: ${ordersWithoutCarrier}`);
print("");

if (ordersWithoutCarrier === 0) {
  print("🎉 Toutes les commandes ont déjà assignedCarrier!");
  print("   Aucune correction nécessaire.");
  quit();
}

// ============================================================
// ÉTAPE 2: Backup
// ============================================================
print("💾 [2/4] Création backup...");

// Supprimer l'ancien backup s'il existe
db[BACKUP_COLLECTION].drop();

// Créer le backup
db.orders.aggregate([
  {
    $match: {
      createdAt: { $gte: START_DATE, $lt: END_DATE }
    }
  },
  { $out: BACKUP_COLLECTION }
]);

const backupCount = db[BACKUP_COLLECTION].countDocuments();
print(`   ✅ Backup créé: ${backupCount} commandes → ${BACKUP_COLLECTION}`);
print("");

// ============================================================
// ÉTAPE 3: Correction
// ============================================================
print("🔄 [3/4] Correction en cours...");

let updated = 0;
let notFound = 0;
let errors = 0;

const ordersToFix = db.orders.find({
  createdAt: { $gte: START_DATE, $lt: END_DATE },
  assignedCarrier: { $exists: false },
  "metadata.dashdocTransportUid": { $exists: true }
}).toArray();

print(`   📋 ${ordersToFix.length} commandes à corriger\n`);

for (let i = 0; i < ordersToFix.length; i++) {
  const order = ordersToFix[i];
  const dashdocUid = order.metadata.dashdocTransportUid;

  try {
    // Chercher le transport dans Data Lake
    const transport = db.dashdoctransports.findOne({
      uid: dashdocUid
    });

    if (transport && transport.assignedCarrier) {
      // Mettre à jour la commande
      db.orders.updateOne(
        { _id: order._id },
        {
          $set: {
            assignedCarrier: transport.assignedCarrier,
            "metadata.lastSyncDate": new Date(),
            updatedAt: new Date()
          }
        }
      );

      updated++;

      // Afficher progression tous les 10
      if (updated % 10 === 0) {
        print(`   ✅ ${updated}/${ordersToFix.length} commandes mises à jour...`);
      }
    } else {
      notFound++;
      if (notFound <= 5) {
        print(`   ⚠️  Transport introuvable: ${dashdocUid}`);
      }
    }
  } catch (err) {
    errors++;
    if (errors <= 3) {
      print(`   ❌ Erreur: ${err.message}`);
    }
  }
}

print("");
print(`   ✅ ${updated} commandes mises à jour`);
if (notFound > 0) print(`   ⚠️  ${notFound} transports introuvables`);
if (errors > 0) print(`   ❌ ${errors} erreurs`);
print("");

// ============================================================
// ÉTAPE 4: Vérification
// ============================================================
print("✅ [4/4] Vérification...");

const finalWithCarrier = db.orders.countDocuments({
  createdAt: { $gte: START_DATE, $lt: END_DATE },
  assignedCarrier: { $exists: true }
});

const finalWithoutCarrier = db.orders.countDocuments({
  createdAt: { $gte: START_DATE, $lt: END_DATE },
  assignedCarrier: { $exists: false }
});

print(`   Total: ${totalOrders} commandes`);
print(`   ✅ Avec assignedCarrier: ${finalWithCarrier} (${ordersWithCarrier} → ${finalWithCarrier})`);
print(`   ❌ Sans assignedCarrier: ${finalWithoutCarrier} (${ordersWithoutCarrier} → ${finalWithoutCarrier})`);
print("");

// Afficher un exemple
const example = db.orders.findOne({
  createdAt: { $gte: START_DATE, $lt: END_DATE },
  assignedCarrier: { $exists: true }
}, {
  _id: 1,
  "assignedCarrier.driverName": 1,
  "assignedCarrier.vehiclePlate": 1,
  "assignedCarrier.carrierName": 1,
  createdAt: 1
});

if (example) {
  print("📋 Exemple de commande corrigée:");
  print(`   Order ID: ${example._id}`);
  print(`   Chauffeur: ${example.assignedCarrier?.driverName || 'N/A'}`);
  print(`   Véhicule: ${example.assignedCarrier?.vehiclePlate || 'N/A'}`);
  print(`   Transporteur: ${example.assignedCarrier?.carrierName || 'N/A'}`);
  print("");
}

// ============================================================
// Résumé
// ============================================================
print("╔════════════════════════════════════════════════════════════╗");
print("║  🎉 CORRECTION TERMINÉE                                   ║");
print("╚════════════════════════════════════════════════════════════╝");
print("");
print(`✅ ${updated} commandes mises à jour avec assignedCarrier`);
print(`💾 Backup disponible: ${BACKUP_COLLECTION}`);
print("");
print("Pour rollback:");
print(`   use rt-tms-sync`);
print(`   db.${BACKUP_COLLECTION}.find().forEach(function(doc) {`);
print(`     db.orders.replaceOne({_id:doc._id}, doc);`);
print(`   });`);
print("");
print("Pour supprimer le backup:");
print(`   db.${BACKUP_COLLECTION}.drop()`);
print("");
