// Script CRON pour le système de vigilance des transporteurs
// À exécuter quotidiennement pour:
// - Envoyer les alertes J-30, J-15, J-7
// - Bloquer automatiquement les transporteurs avec documents expirés
// - Mettre à jour les statuts de vigilance

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI ||
  'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth';

// Importer les fonctions du module carriers
const {
  checkAndBlockExpiredCarriers,
  sendVigilanceAlerts,
  checkVigilanceStatus,
  calculateCarrierScore,
  CARRIER_EVENTS
} = require('../carriers');

async function runVigilanceCron() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('\n🕐 Démarrage du CRON de vigilance');
    console.log('Date:', new Date().toISOString());
    console.log('====================================\n');

    await client.connect();
    console.log('✓ Connecté à MongoDB\n');

    const db = client.db('rt-auth');

    // ===== 1. Vérifier et bloquer les transporteurs avec documents expirés =====
    console.log('🔍 Vérification des documents expirés...\n');

    const blocked = await checkAndBlockExpiredCarriers(db);

    if (blocked.length > 0) {
      console.log(`⚠️  ${blocked.length} transporteur(s) bloqué(s):\n`);
      for (const item of blocked) {
        const carrier = await db.collection('carriers').findOne({ _id: item.carrierId });
        console.log(`  🚫 ${carrier.companyName} (${carrier.email})`);
        console.log(`     Raison: Document ${item.documentType} expiré\n`);
      }
    } else {
      console.log('✅ Aucun document expiré\n');
    }

    // ===== 2. Envoyer les alertes de vigilance =====
    console.log('📧 Envoi des alertes de vigilance...\n');

    const alerts = await sendVigilanceAlerts(db);

    if (alerts.length > 0) {
      console.log(`📨 ${alerts.length} alerte(s) envoyée(s):\n`);

      // Regrouper par type d'alerte
      const by30 = alerts.filter(a => a.daysUntilExpiry === 30);
      const by15 = alerts.filter(a => a.daysUntilExpiry === 15);
      const by7 = alerts.filter(a => a.daysUntilExpiry === 7);

      if (by30.length > 0) {
        console.log(`  📧 J-30 (${by30.length} emails):`);
        for (const alert of by30) {
          const carrier = await db.collection('carriers').findOne({ _id: alert.carrierId });
          console.log(`     • ${carrier.companyName} - Document ${alert.documentType}`);
        }
        console.log('');
      }

      if (by15.length > 0) {
        console.log(`  📧🔔 J-15 (${by15.length} emails + push):`);
        for (const alert of by15) {
          const carrier = await db.collection('carriers').findOne({ _id: alert.carrierId });
          console.log(`     • ${carrier.companyName} - Document ${alert.documentType}`);
        }
        console.log('');
      }

      if (by7.length > 0) {
        console.log(`  🔔📱 J-7 (${by7.length} push + SMS urgence):`);
        for (const alert of by7) {
          const carrier = await db.collection('carriers').findOne({ _id: alert.carrierId });
          console.log(`     • ${carrier.companyName} - Document ${alert.documentType}`);
        }
        console.log('');
      }
    } else {
      console.log('✅ Aucune alerte à envoyer\n');
    }

    // ===== 3. Mettre à jour les statuts de vigilance =====
    console.log('🔄 Mise à jour des statuts de vigilance...\n');

    const carriers = await db.collection('carriers').find({}).toArray();

    let updatedCount = 0;

    for (const carrier of carriers) {
      const newStatus = await checkVigilanceStatus(db, carrier._id);

      if (newStatus !== carrier.vigilanceStatus) {
        await db.collection('carriers').updateOne(
          { _id: carrier._id },
          {
            $set: {
              vigilanceStatus: newStatus,
              updatedAt: new Date()
            }
          }
        );

        console.log(`  🔄 ${carrier.companyName}: ${carrier.vigilanceStatus} → ${newStatus}`);
        updatedCount++;
      }
    }

    if (updatedCount === 0) {
      console.log('  ✓ Tous les statuts sont à jour');
    }
    console.log('');

    // ===== 4. Recalculer les scores =====
    console.log('📊 Recalcul des scores...\n');

    let scoreUpdatedCount = 0;

    for (const carrier of carriers) {
      const newScore = await calculateCarrierScore(db, carrier._id);

      if (newScore !== carrier.score) {
        await db.collection('carriers').updateOne(
          { _id: carrier._id },
          {
            $set: {
              score: newScore,
              updatedAt: new Date()
            }
          }
        );

        console.log(`  📊 ${carrier.companyName}: ${carrier.score} → ${newScore}`);
        scoreUpdatedCount++;
      }
    }

    if (scoreUpdatedCount === 0) {
      console.log('  ✓ Tous les scores sont à jour');
    }
    console.log('');

    // ===== RAPPORT FINAL =====
    console.log('📋 Rapport final:\n');
    console.log(`  🚫 Transporteurs bloqués: ${blocked.length}`);
    console.log(`  📧 Alertes envoyées: ${alerts.length}`);
    console.log(`  🔄 Statuts mis à jour: ${updatedCount}`);
    console.log(`  📊 Scores mis à jour: ${scoreUpdatedCount}`);
    console.log('');

    // Statistiques globales
    const stats = {
      total: await db.collection('carriers').countDocuments(),
      guest: await db.collection('carriers').countDocuments({ status: 'guest' }),
      referenced: await db.collection('carriers').countDocuments({ status: 'referenced' }),
      premium: await db.collection('carriers').countDocuments({ status: 'premium' }),
      compliant: await db.collection('carriers').countDocuments({ vigilanceStatus: 'compliant' }),
      warning: await db.collection('carriers').countDocuments({ vigilanceStatus: 'warning' }),
      blocked: await db.collection('carriers').countDocuments({ isBlocked: true })
    };

    console.log('📊 Statistiques globales:\n');
    console.log(`  Total de transporteurs: ${stats.total}`);
    console.log(`    • Niveau 2 (Guest): ${stats.guest}`);
    console.log(`    • Niveau 1 (Referenced): ${stats.referenced}`);
    console.log(`    • Niveau 1+ (Premium): ${stats.premium}`);
    console.log('');
    console.log(`  Vigilance:`);
    console.log(`    • ✅ Compliant: ${stats.compliant}`);
    console.log(`    • ⚠️  Warning: ${stats.warning}`);
    console.log(`    • 🚫 Bloqués: ${stats.blocked}`);
    console.log('');

    console.log('✅ CRON de vigilance terminé avec succès!\n');

  } catch (error) {
    console.error('\n❌ Erreur dans le CRON de vigilance:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Déconnecté de MongoDB\n');
  }
}

// Exécuter le script
if (require.main === module) {
  runVigilanceCron()
    .then(() => {
      console.log('🎉 CRON exécuté avec succès');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Échec du CRON:', error);
      process.exit(1);
    });
}

module.exports = { runVigilanceCron };
