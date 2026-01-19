/**
 * Script de nettoyage des sessions AFFRET.IA bloquées
 * Marque comme 'failed' les sessions en 'analyzing' depuis plus de 24h
 *
 * Usage: node scripts/cleanup-affretia-sessions.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-affretia';
const MAX_ANALYZING_HOURS = 24; // Sessions bloquées depuis plus de 24h

// Schema simplifié pour AffretSession
const AffretSessionSchema = new mongoose.Schema({
  sessionId: String,
  orderId: String,
  organizationId: String,
  status: String,
  trigger: {
    type: String,
    reason: String,
    triggeredBy: String,
    triggeredAt: Date
  },
  shortlist: mongoose.Schema.Types.Mixed,
  selection: mongoose.Schema.Types.Mixed,
  proposalsReceived: { type: Number, default: 0 },
  metrics: mongoose.Schema.Types.Mixed,
  closedAt: Date,
  closedReason: String,
  timeline: [mongoose.Schema.Types.Mixed]
}, { timestamps: true, collection: 'affretsessions' });

const AffretSession = mongoose.model('AffretSession', AffretSessionSchema);

async function cleanupBlockedSessions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Calculer la date limite (sessions plus vieilles que MAX_ANALYZING_HOURS)
    const cutoffDate = new Date(Date.now() - MAX_ANALYZING_HOURS * 60 * 60 * 1000);
    console.log(`Looking for sessions stuck in 'analyzing' since before ${cutoffDate.toISOString()}`);

    // Trouver les sessions bloquées
    const blockedSessions = await AffretSession.find({
      status: { $in: ['analyzing', 'pending', 'broadcasting'] },
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Found ${blockedSessions.length} blocked sessions`);

    if (blockedSessions.length === 0) {
      console.log('No blocked sessions to cleanup');
      return { cleaned: 0, sessions: [] };
    }

    // Afficher les sessions trouvées
    for (const session of blockedSessions) {
      console.log(`  - Session ${session.sessionId || session._id}: ${session.status} (created: ${session.createdAt})`);
    }

    // Mettre à jour les sessions bloquées
    const result = await AffretSession.updateMany(
      {
        status: { $in: ['analyzing', 'pending', 'broadcasting'] },
        createdAt: { $lt: cutoffDate }
      },
      {
        $set: {
          status: 'failed',
          closedAt: new Date(),
          closedReason: 'Session timeout - nettoyage automatique'
        },
        $push: {
          timeline: {
            event: 'session_timeout',
            timestamp: new Date(),
            data: { reason: 'Cleanup automatique - session bloquée depuis plus de 24h' }
          }
        }
      }
    );

    console.log(`\nUpdated ${result.modifiedCount} sessions to 'failed' status`);

    // Stats après nettoyage
    const stats = await AffretSession.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('\nSession stats after cleanup:');
    for (const stat of stats) {
      console.log(`  ${stat._id}: ${stat.count}`);
    }

    return {
      cleaned: result.modifiedCount,
      sessions: blockedSessions.map(s => s.sessionId || s._id.toString())
    };

  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Fonction pour afficher les stats actuelles
async function showStats() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Stats par statut
    const statusStats = await AffretSession.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('=== AFFRET.IA Session Statistics ===\n');
    console.log('Sessions by status:');
    let total = 0;
    for (const stat of statusStats) {
      console.log(`  ${stat._id || 'null'}: ${stat.count}`);
      total += stat.count;
    }
    console.log(`  Total: ${total}`);

    // Sessions les plus récentes
    const recentSessions = await AffretSession.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('sessionId orderId status createdAt proposalsReceived');

    console.log('\nMost recent sessions:');
    for (const session of recentSessions) {
      const age = Math.round((Date.now() - new Date(session.createdAt).getTime()) / (1000 * 60 * 60));
      console.log(`  ${session.orderId} | ${session.status} | ${age}h ago | ${session.proposalsReceived || 0} proposals`);
    }

    // Sessions avec sélection (succès)
    const successfulSessions = await AffretSession.countDocuments({
      'selection.carrierId': { $exists: true }
    });
    console.log(`\nSuccessful sessions (with carrier selection): ${successfulSessions}`);

    // Calcul du taux de succès
    if (total > 0) {
      const successRate = ((successfulSessions / total) * 100).toFixed(1);
      console.log(`Success rate: ${successRate}%`);
    }

  } catch (error) {
    console.error('Error getting stats:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Main
const args = process.argv.slice(2);
const command = args[0] || 'stats';

if (command === 'cleanup') {
  cleanupBlockedSessions()
    .then(result => {
      console.log(`\nCleanup complete: ${result.cleaned} sessions updated`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Cleanup failed:', err);
      process.exit(1);
    });
} else if (command === 'stats') {
  showStats()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Stats failed:', err);
      process.exit(1);
    });
} else {
  console.log('Usage: node scripts/cleanup-affretia-sessions.js [stats|cleanup]');
  console.log('  stats   - Show current session statistics (default)');
  console.log('  cleanup - Mark blocked sessions as failed');
  process.exit(0);
}
