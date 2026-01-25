/**
 * Scheduled Jobs - TMS Sync
 * Synchronisation automatique haute frequence avec Dashdoc
 * Pattern base sur subscriptions-contracts-eb/scheduled-jobs.js
 */

/**
 * Configuration des intervalles (en millisecondes)
 */
const INTERVALS = {
  AUTO_SYNC: 30 * 1000,           // 30 secondes - Sync haute frequence
  HEALTH_CHECK: 5 * 60 * 1000,    // 5 minutes - Verification connexions
  CLEANUP_LOGS: 24 * 60 * 60 * 1000 // 24 heures - Nettoyage logs anciens
};

/**
 * État des jobs
 */
let jobsRunning = false;
let jobIntervals = {};
let db = null;
let tmsService = null;
let lastSyncResults = {};

/**
 * Synchronisation automatique de toutes les connexions actives
 * Execute toutes les 30 secondes
 */
async function runAutoSync() {
  if (!db || !tmsService) {
    console.warn('⚠️  [CRON] autoSync: Database or service not available');
    return;
  }

  try {
    console.log('🔄 [CRON] Running autoSync (30s interval)...');

    // Recuperer toutes les connexions actives avec autoSync active
    const activeConnections = await db.collection('tmsConnections').find({
      isActive: true,
      connectionStatus: 'connected',
      'syncConfig.autoSync': true
    }).toArray();

    if (activeConnections.length === 0) {
      console.log('✅ [CRON] autoSync: No active connections to sync');
      return;
    }

    console.log(`🔄 [CRON] autoSync: ${activeConnections.length} connections to sync`);

    for (const connection of activeConnections) {
      try {
        // Eviter de sync si derniere sync trop recente (< 25s)
        const now = Date.now();
        const lastSync = lastSyncResults[connection._id.toString()]?.timestamp || 0;

        if (now - lastSync < 25000) {
          console.log(`⏭️  [CRON] Skipping ${connection.organizationName}: Last sync too recent`);
          continue;
        }

        console.log(`🔄 [CRON] Syncing ${connection.organizationName}...`);
        const startTime = Date.now();

        // Lancer la synchronisation complete
        const result = await tmsService.executeSync(connection._id.toString(), {
          transportLimit: 0, // 0 = illimite avec pagination
          companyLimit: 0,
          contactLimit: 0,
          maxPages: 100 // Limite de securite
        });

        const duration = Date.now() - startTime;

        lastSyncResults[connection._id.toString()] = {
          timestamp: now,
          duration,
          success: result.success,
          transportsCount: result.transports?.count || 0
        };

        console.log(`✅ [CRON] ${connection.organizationName}: ${result.transports?.count || 0} transports synced in ${duration}ms`);

      } catch (error) {
        console.error(`❌ [CRON] Error syncing ${connection.organizationName}:`, error.message);
        lastSyncResults[connection._id.toString()] = {
          timestamp: Date.now(),
          success: false,
          error: error.message
        };
      }
    }

    console.log('✅ [CRON] autoSync completed');

  } catch (error) {
    console.error('❌ [CRON] autoSync error:', error.message);
  }
}

/**
 * Verification de sante des connexions
 * Execute toutes les 5 minutes
 */
async function runHealthCheck() {
  if (!db || !tmsService) return;

  try {
    console.log('🔄 [CRON] Running healthCheck...');

    const connections = await db.collection('tmsConnections').find({
      isActive: true
    }).toArray();

    for (const connection of connections) {
      try {
        await tmsService.testConnection(connection._id.toString());
      } catch (error) {
        console.error(`❌ [CRON] Health check failed for ${connection.organizationName}`);
      }
    }

    console.log(`✅ [CRON] healthCheck: ${connections.length} connections checked`);
  } catch (error) {
    console.error('❌ [CRON] healthCheck error:', error.message);
  }
}

/**
 * Nettoyage des logs de sync anciens (> 30 jours)
 * Execute toutes les 24 heures
 */
async function runCleanupLogs() {
  if (!db) return;

  try {
    console.log('🔄 [CRON] Running cleanupLogs...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.collection('tmsSyncLogs').deleteMany({
      startedAt: { $lt: thirtyDaysAgo }
    });

    console.log(`✅ [CRON] cleanupLogs: ${result.deletedCount} old logs removed`);
  } catch (error) {
    console.error('❌ [CRON] cleanupLogs error:', error.message);
  }
}

/**
 * Demarrer tous les jobs planifies
 */
function startAllJobs(database, tmsServiceInstance) {
  if (jobsRunning) {
    console.warn('⚠️  [CRON] Jobs already running');
    return;
  }

  db = database;
  tmsService = tmsServiceInstance;
  jobsRunning = true;

  console.log('============================================================================');
  console.log('🚀 [CRON] Starting TMS Sync scheduled jobs...');
  console.log('============================================================================');

  // Demarrer les jobs avec leurs intervalles respectifs
  jobIntervals.autoSync = setInterval(runAutoSync, INTERVALS.AUTO_SYNC);
  jobIntervals.healthCheck = setInterval(runHealthCheck, INTERVALS.HEALTH_CHECK);
  jobIntervals.cleanupLogs = setInterval(runCleanupLogs, INTERVALS.CLEANUP_LOGS);

  console.log('✅ [CRON] autoSync: every 30 seconds (HIGH FREQUENCY)');
  console.log('✅ [CRON] healthCheck: every 5 minutes');
  console.log('✅ [CRON] cleanupLogs: every 24 hours');
  console.log('============================================================================');

  // Executer immediatement une premiere fois (apres 10s)
  setTimeout(() => {
    runAutoSync();
  }, 10000);
}

/**
 * Arreter tous les jobs planifies
 */
function stopAllJobs() {
  if (!jobsRunning) {
    console.warn('⚠️  [CRON] Jobs not running');
    return;
  }

  console.log('🛑 [CRON] Stopping scheduled jobs...');

  Object.values(jobIntervals).forEach(interval => {
    if (interval) clearInterval(interval);
  });

  jobIntervals = {};
  jobsRunning = false;
  db = null;
  tmsService = null;
  lastSyncResults = {};

  console.log('✅ [CRON] All jobs stopped');
}

/**
 * Obtenir le statut des jobs
 */
function getJobsStatus() {
  return {
    running: jobsRunning,
    dbConnected: !!db,
    lastSyncResults,
    jobs: {
      autoSync: {
        interval: '30 seconds',
        intervalMs: INTERVALS.AUTO_SYNC,
        active: !!jobIntervals.autoSync,
        description: 'High-frequency Dashdoc synchronization'
      },
      healthCheck: {
        interval: '5 minutes',
        intervalMs: INTERVALS.HEALTH_CHECK,
        active: !!jobIntervals.healthCheck,
        description: 'Connection health verification'
      },
      cleanupLogs: {
        interval: '24 hours',
        intervalMs: INTERVALS.CLEANUP_LOGS,
        active: !!jobIntervals.cleanupLogs,
        description: 'Old logs cleanup'
      }
    }
  };
}

/**
 * Executer un job manuellement
 */
async function runJobManually(jobName) {
  const jobs = {
    autoSync: runAutoSync,
    healthCheck: runHealthCheck,
    cleanupLogs: runCleanupLogs
  };

  if (!jobs[jobName]) {
    return {
      success: false,
      error: `Unknown job: ${jobName}. Available jobs: ${Object.keys(jobs).join(', ')}`
    };
  }

  try {
    await jobs[jobName]();
    return {
      success: true,
      job: jobName,
      executedAt: new Date()
    };
  } catch (error) {
    return {
      success: false,
      job: jobName,
      error: error.message
    };
  }
}

module.exports = {
  INTERVALS,
  startAllJobs,
  stopAllJobs,
  getJobsStatus,
  runJobManually,
  runAutoSync,
  runHealthCheck,
  runCleanupLogs
};
