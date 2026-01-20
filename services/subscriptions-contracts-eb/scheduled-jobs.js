// ============================================================================
// Scheduled Jobs - Cron Jobs pour RT SYMPHONI.A
// ============================================================================
// Version: 1.0.0
// Description: Tâches planifiées pour timeouts, ETA monitoring, et alertes
// ============================================================================

const dispatchService = require('./dispatch-service');
const etaMonitoringService = require('./eta-monitoring-service');
const notificationService = require('./notification-service');

// SEC-015: Services de sécurité pour cleanup
const { createEmailVerificationService } = require('./email-verification-service');
const { createInvitationTokenService } = require('./invitation-token-service');
const { createWebhookService } = require('./webhook-service');
const { ProgressiveIPBlocker } = require('./rate-limiter-middleware');

// Vigilance: Relances automatiques documents transporteurs
const vigilanceReminderService = require('./vigilance-reminder-service');

/**
 * Configuration des intervalles (en millisecondes)
 */
const INTERVALS = {
  CHECK_TIMEOUTS: 5 * 60 * 1000,      // 5 minutes
  MONITOR_ETA: 1 * 60 * 1000,          // 1 minute
  DETECT_DELAYS: 2 * 60 * 1000,        // 2 minutes
  CLEANUP_OLD_TRACKING: 60 * 60 * 1000, // 1 heure
  CLEANUP_SECURITY: 6 * 60 * 60 * 1000, // 6 heures - SEC-015
  RETRY_WEBHOOKS: 5 * 60 * 1000,        // 5 minutes - SEC-015
  VIGILANCE_CHECK: 24 * 60 * 60 * 1000  // 24 heures - Vérification documents transporteurs
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

// ============================================================================
// SEC-015: JOBS DE SÉCURITÉ
// ============================================================================

/**
 * SEC-015: Nettoyer les données de sécurité expirées
 * - OTP expirés
 * - Tokens révoqués expirés
 * - Échecs IP expirés
 * Exécuté toutes les 6 heures
 */
async function runCleanupSecurity() {
  if (!db) {
    console.warn('⚠️ [CRON] cleanupSecurity: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running cleanupSecurity...');
    const now = new Date();
    let totalCleaned = 0;

    // 1. Nettoyer les OTP expirés (24h+)
    const otpCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const otpResult = await db.collection('email_verifications').deleteMany({
      $or: [
        { expiresAt: { $lt: otpCutoff } },
        { verified: true, verifiedAt: { $lt: otpCutoff } }
      ]
    });
    totalCleaned += otpResult.deletedCount;

    // 2. Nettoyer les tokens révoqués expirés
    const tokenResult = await db.collection('revoked_tokens').deleteMany({
      expiresAt: { $lt: now }
    });
    totalCleaned += tokenResult.deletedCount;

    // 3. Nettoyer les échecs IP expirés (24h sans blocage actif)
    const ipCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const ipResult = await db.collection('ip_failures').deleteMany({
      lastFailure: { $lt: ipCutoff },
      $or: [
        { blockedUntil: { $exists: false } },
        { blockedUntil: { $lt: now } }
      ]
    });
    totalCleaned += ipResult.deletedCount;

    // 4. Nettoyer les sessions 2FA expirées
    const tfaResult = await db.collection('2fa_sessions').deleteMany({
      expiresAt: { $lt: now }
    });
    totalCleaned += tfaResult.deletedCount;

    console.log(`✅ [CRON] cleanupSecurity: ${totalCleaned} expired records removed`);
    console.log(`   - OTP: ${otpResult.deletedCount}`);
    console.log(`   - Revoked tokens: ${tokenResult.deletedCount}`);
    console.log(`   - IP failures: ${ipResult.deletedCount}`);
    console.log(`   - 2FA sessions: ${tfaResult.deletedCount}`);

  } catch (error) {
    console.error('❌ [CRON] cleanupSecurity error:', error.message);
  }
}

/**
 * Vérification quotidienne des documents de vigilance transporteurs
 * Envoie les relances automatiques (J-30, J-15, J-7, J-3, J-1)
 * Bloque les transporteurs avec documents expirés
 * Exécuté toutes les 24 heures (à 8h du matin)
 */
async function runVigilanceCheck() {
  if (!db) {
    console.warn('⚠️ [CRON] vigilanceCheck: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running vigilanceCheck...');
    const stats = await vigilanceReminderService.runDailyVigilanceCheck(db);

    console.log(`✅ [CRON] vigilanceCheck completed:`);
    console.log(`   - Carriers checked: ${stats.totalCarriers}`);
    console.log(`   - Carriers with alerts: ${stats.carriersWithAlerts}`);
    console.log(`   - Reminders sent: ${stats.remindersSent}`);
    console.log(`   - Carriers blocked: ${stats.carriersBlocked}`);

    if (stats.errors.length > 0) {
      console.warn(`   - Errors: ${stats.errors.length}`);
    }

    return stats;
  } catch (error) {
    console.error('❌ [CRON] vigilanceCheck error:', error.message);
    return { error: error.message };
  }
}

/**
 * SEC-015: Réessayer les webhooks en échec
 * Exécuté toutes les 5 minutes
 */
async function runRetryWebhooks() {
  if (!db) {
    console.warn('⚠️ [CRON] retryWebhooks: Database not connected');
    return;
  }

  try {
    console.log('🔄 [CRON] Running retryWebhooks...');

    const now = new Date();

    // Trouver les webhooks à réessayer
    const deliveries = await db.collection('webhook_deliveries').find({
      status: 'retrying',
      nextRetryAt: { $lte: now }
    }).limit(50).toArray();

    if (deliveries.length === 0) {
      console.log('✅ [CRON] retryWebhooks: No pending retries');
      return;
    }

    let succeeded = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      const subscription = await db.collection('webhook_subscriptions').findOne({
        _id: delivery.subscriptionId
      });

      if (!subscription || !subscription.isActive) {
        // Marquer comme échoué si subscription inactive
        await db.collection('webhook_deliveries').updateOne(
          { _id: delivery._id },
          { $set: { status: 'failed', failedAt: now, failedReason: 'subscription_inactive' } }
        );
        failed++;
        continue;
      }

      // Tenter la livraison (simplifié - le service webhook gère le détail)
      try {
        const axios = require('axios');
        await axios.post(subscription.url, delivery.payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': delivery.signature,
            'X-Webhook-Event': delivery.event,
            'User-Agent': 'SYMPHONIA-Webhook/1.0'
          },
          timeout: 5000
        });

        // Succès
        await db.collection('webhook_deliveries').updateOne(
          { _id: delivery._id },
          { $set: { status: 'delivered', deliveredAt: now } }
        );
        succeeded++;

      } catch (err) {
        // Échec - calculer prochain retry
        const attempts = (delivery.attempts?.length || 0) + 1;
        const maxRetries = 5;

        if (attempts >= maxRetries) {
          await db.collection('webhook_deliveries').updateOne(
            { _id: delivery._id },
            { $set: { status: 'failed', failedAt: now } }
          );
        } else {
          const retryDelays = [60, 300, 1800, 7200]; // 1min, 5min, 30min, 2h
          const nextDelay = retryDelays[Math.min(attempts - 1, retryDelays.length - 1)];
          await db.collection('webhook_deliveries').updateOne(
            { _id: delivery._id },
            { $set: { nextRetryAt: new Date(now.getTime() + nextDelay * 1000) } }
          );
        }
        failed++;
      }
    }

    console.log(`✅ [CRON] retryWebhooks: ${deliveries.length} processed, ${succeeded} succeeded, ${failed} failed`);

  } catch (error) {
    console.error('❌ [CRON] retryWebhooks error:', error.message);
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

  // SEC-015: Jobs de sécurité
  jobIntervals.cleanupSecurity = setInterval(runCleanupSecurity, INTERVALS.CLEANUP_SECURITY);
  jobIntervals.retryWebhooks = setInterval(runRetryWebhooks, INTERVALS.RETRY_WEBHOOKS);

  // Vigilance: Relances documents transporteurs (quotidien)
  jobIntervals.vigilanceCheck = setInterval(runVigilanceCheck, INTERVALS.VIGILANCE_CHECK);

  console.log('✅ [CRON] checkTimeouts: every 5 minutes');
  console.log('✅ [CRON] monitorETA: every 1 minute');
  console.log('✅ [CRON] detectDelays: every 2 minutes');
  console.log('✅ [CRON] cleanupOldTracking: every 1 hour');
  console.log('✅ [CRON] cleanupSecurity: every 6 hours (SEC-015)');
  console.log('✅ [CRON] retryWebhooks: every 5 minutes (SEC-015)');
  console.log('✅ [CRON] vigilanceCheck: every 24 hours (documents transporteurs)');
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
      },
      cleanupSecurity: {
        interval: '6 hours',
        active: !!jobIntervals.cleanupSecurity
      },
      retryWebhooks: {
        interval: '5 minutes',
        active: !!jobIntervals.retryWebhooks
      },
      vigilanceCheck: {
        interval: '24 hours',
        active: !!jobIntervals.vigilanceCheck,
        description: 'Document expiration reminders & carrier blocking'
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
    cleanupOldTracking: runCleanupOldTracking,
    cleanupSecurity: runCleanupSecurity,
    retryWebhooks: runRetryWebhooks,
    vigilanceCheck: runVigilanceCheck
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
  runCleanupOldTracking,
  // SEC-015: Security jobs
  runCleanupSecurity,
  runRetryWebhooks,
  // Vigilance: Document reminders
  runVigilanceCheck
};
