// ============================================================================
// Scheduled Jobs - Cron Jobs pour RT SYMPHONI.A
// ============================================================================
// Version: 1.0.0
// Description: Tâches planifiées pour timeouts, ETA monitoring, et alertes
// ============================================================================

const dispatchService = require('./dispatch-service');
const etaMonitoringService = require('./eta-monitoring-service');
const notificationService = require('./notification-service');

/**
 * Configuration des intervalles (en millisecondes)
 */
const INTERVALS = {
  CHECK_TIMEOUTS: 5 * 60 * 1000,      // 5 minutes
  MONITOR_ETA: 1 * 60 * 1000,          // 1 minute
  DETECT_DELAYS: 2 * 60 * 1000,        // 2 minutes
  CLEANUP_OLD_TRACKING: 60 * 60 * 1000 // 1 heure
};

/**
 * État des jobs
 */
let jobsRunning = false;
let jobIntervals = {};
let db = null;

/**
 * Vérifier les timeouts des transporteurs
 * Exécuté toutes les 5 minutes
 */
async function runCheckTimeouts() {
  if (!db) {
    console.warn('⚠️ [CRON] checkTimeouts: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running checkTimeouts...');
    const result = await dispatchService.checkTimeouts(db);

    if (result.success) {
      console.log(`✅ [CRON] checkTimeouts: ${result.processed || 0} timeouts processed`);

      // Envoyer des notifications pour les timeouts
      if (result.timedOutOrders && result.timedOutOrders.length > 0) {
        for (const order of result.timedOutOrders) {
          await notificationService.sendNotification(db, {
            type: 'CARRIER_TIMEOUT',
            orderId: order._id,
            recipients: ['industrial'],
            data: {
              orderReference: order.reference,
              timedOutCarrier: order.timedOutCarrier,
              nextCarrier: order.nextCarrier
            }
          });
        }
      }
    } else {
      console.error('❌ [CRON] checkTimeouts failed:', result.error);
    }
  } catch (error) {
    console.error('❌ [CRON] checkTimeouts error:', error.message);
  }
}

/**
 * Monitorer les ETA de toutes les commandes actives
 * Exécuté toutes les 1 minute
 */
async function runMonitorETA() {
  if (!db) {
    console.warn('⚠️ [CRON] monitorETA: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running monitorETA...');
    const result = await etaMonitoringService.monitorActiveOrders(db);

    if (result.success) {
      console.log(`✅ [CRON] monitorETA: ${result.totalChecked} orders checked`);

      // Envoyer des alertes pour les retards critiques
      if (result.critical > 0) {
        console.warn(`⚠️ [CRON] ${result.critical} critical delays detected!`);

        for (const order of result.orders.filter(o => o.severity === 'CRITICAL')) {
          await notificationService.sendNotification(db, {
            type: 'CRITICAL_DELAY',
            orderId: order.orderId,
            recipients: ['industrial', 'carrier'],
            channels: ['email', 'sms'],
            data: {
              orderReference: order.reference,
              delayMinutes: order.delayMinutes,
              delayType: order.delayType
            }
          });
        }
      }
    } else {
      console.error('❌ [CRON] monitorETA failed:', result.error);
    }
  } catch (error) {
    console.error('❌ [CRON] monitorETA error:', error.message);
  }
}

/**
 * Détecter les retards sur les commandes
 * Exécuté toutes les 2 minutes
 */
async function runDetectDelays() {
  if (!db) {
    console.warn('⚠️ [CRON] detectDelays: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running detectDelays...');

    // Récupérer les commandes en transit
    const activeOrders = await db.collection('transport_orders')
      .find({
        status: {
          $in: ['TRACKING_STARTED', 'EN_ROUTE_PICKUP', 'LOADED', 'EN_ROUTE_DELIVERY']
        }
      })
      .toArray();

    let delaysFound = 0;
    let alertsSent = 0;

    for (const order of activeOrders) {
      const result = await etaMonitoringService.detectDelay(db, order._id.toString());

      if (result.success && result.hasDelay && !result.silentDelay && !result.alertAlreadySent) {
        delaysFound++;

        // Envoyer notification selon la sévérité
        if (result.severity === 'WARNING' || result.severity === 'CRITICAL') {
          await notificationService.sendNotification(db, {
            type: result.severity === 'CRITICAL' ? 'CRITICAL_DELAY' : 'DELAY_WARNING',
            orderId: order._id.toString(),
            recipients: ['industrial'],
            channels: result.severity === 'CRITICAL' ? ['email', 'sms'] : ['email'],
            data: {
              orderReference: order.reference,
              delayMinutes: result.delayMinutes,
              delayType: result.delayType,
              severity: result.severity
            }
          });
          alertsSent++;
        }
      }
    }

    console.log(`✅ [CRON] detectDelays: ${activeOrders.length} orders checked, ${delaysFound} delays, ${alertsSent} alerts sent`);

  } catch (error) {
    console.error('❌ [CRON] detectDelays error:', error.message);
  }
}

/**
 * Nettoyer les anciennes données de tracking
 * Exécuté toutes les heures
 */
async function runCleanupOldTracking() {
  if (!db) {
    console.warn('⚠️ [CRON] cleanupOldTracking: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running cleanupOldTracking...');

    // Supprimer les positions de tracking de plus de 30 jours
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.collection('tracking_positions').deleteMany({
      timestamp: { $lt: thirtyDaysAgo }
    });

    console.log(`✅ [CRON] cleanupOldTracking: ${result.deletedCount} old positions removed`);

  } catch (error) {
    console.error('❌ [CRON] cleanupOldTracking error:', error.message);
  }
}

/**
 * Démarrer tous les jobs planifiés
 * @param {Object} database - Instance MongoDB database
 */
function startAllJobs(database) {
  if (jobsRunning) {
    console.warn('⚠️ [CRON] Jobs already running');
    return;
  }

  db = database;
  jobsRunning = true;

  console.log('============================================================================');
  console.log('🚀 [CRON] Starting scheduled jobs...');
  console.log('============================================================================');

  // Démarrer les jobs avec leurs intervalles respectifs
  jobIntervals.checkTimeouts = setInterval(runCheckTimeouts, INTERVALS.CHECK_TIMEOUTS);
  jobIntervals.monitorETA = setInterval(runMonitorETA, INTERVALS.MONITOR_ETA);
  jobIntervals.detectDelays = setInterval(runDetectDelays, INTERVALS.DETECT_DELAYS);
  jobIntervals.cleanupOldTracking = setInterval(runCleanupOldTracking, INTERVALS.CLEANUP_OLD_TRACKING);

  console.log('✅ [CRON] checkTimeouts: every 5 minutes');
  console.log('✅ [CRON] monitorETA: every 1 minute');
  console.log('✅ [CRON] detectDelays: every 2 minutes');
  console.log('✅ [CRON] cleanupOldTracking: every 1 hour');
  console.log('============================================================================');

  // Exécuter immédiatement une première fois
  setTimeout(() => {
    runCheckTimeouts();
    runMonitorETA();
    runDetectDelays();
  }, 5000); // Attendre 5 secondes après le démarrage
}

/**
 * Arrêter tous les jobs planifiés
 */
function stopAllJobs() {
  if (!jobsRunning) {
    console.warn('⚠️ [CRON] Jobs not running');
    return;
  }

  console.log('🛑 [CRON] Stopping scheduled jobs...');

  Object.values(jobIntervals).forEach(interval => {
    if (interval) clearInterval(interval);
  });

  jobIntervals = {};
  jobsRunning = false;
  db = null;

  console.log('✅ [CRON] All jobs stopped');
}

/**
 * Obtenir le statut des jobs
 * @returns {Object} Status des jobs
 */
function getJobsStatus() {
  return {
    running: jobsRunning,
    dbConnected: !!db,
    jobs: {
      checkTimeouts: {
        interval: '5 minutes',
        active: !!jobIntervals.checkTimeouts
      },
      monitorETA: {
        interval: '1 minute',
        active: !!jobIntervals.monitorETA
      },
      detectDelays: {
        interval: '2 minutes',
        active: !!jobIntervals.detectDelays
      },
      cleanupOldTracking: {
        interval: '1 hour',
        active: !!jobIntervals.cleanupOldTracking
      }
    }
  };
}

/**
 * Exécuter un job manuellement
 * @param {String} jobName - Nom du job
 * @returns {Promise<Object>} Résultat de l'exécution
 */
async function runJobManually(jobName) {
  const jobs = {
    checkTimeouts: runCheckTimeouts,
    monitorETA: runMonitorETA,
    detectDelays: runDetectDelays,
    cleanupOldTracking: runCleanupOldTracking
  };

  if (!jobs[jobName]) {
    return {
      success: false,
      error: `Unknown job: ${jobName}`
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

// ==================== EXPORTS ====================

module.exports = {
  INTERVALS,
  startAllJobs,
  stopAllJobs,
  getJobsStatus,
  runJobManually,
  // Individual jobs for manual execution
  runCheckTimeouts,
  runMonitorETA,
  runDetectDelays,
  runCleanupOldTracking
};
