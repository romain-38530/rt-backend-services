/**
 * Scheduled Jobs - TMS Sync
 * Synchronisation automatique avec Dashdoc via Data Lake
 *
 * ARCHITECTURE DATA LAKE:
 * - DatalakeSyncService: Synchronise toutes les données Dashdoc vers MongoDB
 * - Les services consommateurs lisent depuis MongoDB (pas d'appels API directs)
 * - Les écritures vers Dashdoc restent directes (assignation carrier, etc.)
 */

const { TMSSyncMetrics } = require('./cloudwatch-stub');
const { DatalakeSyncService, createReaders } = require('./services/dashdoc-datalake');
const { createAllIndexes, COLLECTIONS } = require('./models/dashdoc-datalake');

/**
 * Configuration des intervalles (en millisecondes)
 */
const INTERVALS = {
  // Data Lake sync
  DATALAKE_INCREMENTAL: 25 * 1000, // 25 secondes - Sync incrémentale (transports, counters)
  DATALAKE_PERIODIC: 5 * 60 * 1000, // 5 minutes - Sync données de référence
  DATALAKE_FULL: 60 * 60 * 1000,   // 1 heure - Full sync

  // Jobs actifs
  SYMPHONIA_SYNC: 60 * 1000,      // 1 minute - Sync transports avec tag Symphonia (depuis Data Lake)
  VIGILANCE_UPDATE: 60 * 60 * 1000, // 1 heure - Mise à jour vigilance
  HEALTH_CHECK: 5 * 60 * 1000,    // 5 minutes - Verification connexions
  MONITORING_CHECK: 5 * 60 * 1000, // 5 minutes - Monitoring et alertes
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
let metrics = null;

// Data Lake instances (par connexion)
let datalakeSyncServices = {};
let datalakeReaders = null;

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
 * Mise à jour des scores de vigilance
 * Execute toutes les heures
 */
async function runVigilanceUpdate() {
  if (!db) return;

  try {
    console.log('🔄 [CRON] Running vigilance update...');

    const VigilanceService = require('./services/vigilance.service');
    const vigilanceService = new VigilanceService(db);

    const result = await vigilanceService.updateAllVigilanceScores();
    console.log(`✅ [CRON VIGILANCE] ${result.updated}/${result.total} carriers updated`);

    if (result.failed > 0) {
      console.warn(`⚠️  [CRON VIGILANCE] ${result.failed} failures`);
    }
  } catch (error) {
    console.error('❌ [CRON VIGILANCE] Error:', error.message);
  }
}

/**
 * Synchronisation des transports avec tag Symphonia
 * Lit depuis le Data Lake MongoDB (plus d'appels API directs)
 * Execute toutes les 1 minute
 */
async function runSymphoniaSync() {
  if (!db || !datalakeReaders) {
    console.warn('⚠️  [CRON] symphoniaSync: Database or Data Lake not available');
    return;
  }

  try {
    console.log('🔄 [CRON] Running Symphonia sync (from Data Lake)...');

    // Récupérer la connexion active pour le connectionId
    const connection = await db.collection('tmsConnections').findOne({
      tmsType: 'dashdoc',
      isActive: true
    });

    if (!connection) {
      console.warn('⚠️  [CRON] No active Dashdoc connection found');
      return;
    }

    const connectionId = connection._id.toString();

    // Lire les transports avec tag Symphonia depuis le Data Lake
    // Tag Symphonia PK: 126835
    const result = await datalakeReaders.transports.find(
      { tag: 'Symphonia' },  // ou utiliser l'ID du tag
      { limit: 500 },
      connectionId
    );

    if (result.results.length === 0) {
      console.log('✅ [CRON SYMPHONIA] No transports with Symphonia tag found');
      return;
    }

    console.log(`[CRON SYMPHONIA] Found ${result.results.length} transports with Symphonia tag`);

    // Synchroniser vers la collection orders (format legacy)
    let synced = 0;
    for (const transport of result.results) {
      try {
        await db.collection('orders').updateOne(
          { externalId: transport.dashdocUid },
          {
            $set: {
              externalId: transport.dashdocUid,
              externalSource: 'dashdoc',
              sequentialId: transport.sequentialId,
              status: transport.status,
              pickup: transport.pickup,
              delivery: transport.delivery,
              cargo: transport.cargo,
              carrier: transport.carrier,
              transportMeans: transport.transportMeans,
              pricing: transport.pricing,
              tags: transport.tags,
              createdAt: transport.createdAt,
              updatedAt: transport.updatedAt,
              syncedFromDatalake: true,
              lastSyncAt: new Date()
            }
          },
          { upsert: true }
        );
        synced++;
      } catch (error) {
        console.error(`[CRON SYMPHONIA] Error syncing transport ${transport.sequentialId}:`, error.message);
      }
    }

    console.log(`✅ [CRON SYMPHONIA] ${synced}/${result.results.length} transports synchronized`);

  } catch (error) {
    console.error('❌ [CRON SYMPHONIA] Error:', error.message);
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
 * Envoyer alertes monitoring via SNS (SMS) et SES (Email)
 */
async function sendMonitoringAlerts(anomalies) {
  try {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

    const region = process.env.AWS_REGION || 'eu-west-3';
    const snsClient = new SNSClient({ region });
    const sesClient = new SESClient({ region });

    const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
    const errorCount = anomalies.filter(a => a.severity === 'error').length;
    const warningCount = anomalies.filter(a => a.severity === 'warning').length;

    const smsMessage = `[SYMPHONIA TMS] ${criticalCount} anomalies critiques détectées. Vérifier dashboard monitoring.`;

    const emailSubject = `🚨 Alerte Monitoring TMS - ${criticalCount} anomalies critiques`;
    const emailBody = `
      <h2>Alerte Monitoring TMS Sync</h2>
      <p><strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}</p>

      <h3>Résumé</h3>
      <ul>
        <li><strong>Anomalies critiques:</strong> ${criticalCount}</li>
        <li><strong>Erreurs:</strong> ${errorCount}</li>
        <li><strong>Avertissements:</strong> ${warningCount}</li>
      </ul>

      <h3>Détails</h3>
      <table border="1" cellpadding="5" style="border-collapse: collapse;">
        <tr>
          <th>Type</th>
          <th>Job</th>
          <th>Sévérité</th>
          <th>Message</th>
        </tr>
        ${anomalies.map(a => `
          <tr>
            <td>${a.type}</td>
            <td>${a.job || 'N/A'}</td>
            <td><strong>${a.severity.toUpperCase()}</strong></td>
            <td>${a.message}</td>
          </tr>
        `).join('')}
      </table>

      <p><a href="${process.env.DASHBOARD_URL || 'https://admin.symphonia.com'}/monitoring">Voir dashboard monitoring</a></p>
    `;

    const alerts = [];

    if (process.env.ALERT_SMS_NUMBER) {
      try {
        await snsClient.send(new PublishCommand({
          PhoneNumber: process.env.ALERT_SMS_NUMBER,
          Message: smsMessage
        }));
        console.log('📱 [ALERT] SMS sent');
        alerts.push({ channel: 'sms', status: 'sent' });
      } catch (error) {
        console.error('❌ [ALERT] SMS error:', error.message);
        alerts.push({ channel: 'sms', status: 'failed', error: error.message });
      }
    }

    if (process.env.ALERT_EMAIL) {
      try {
        await sesClient.send(new SendEmailCommand({
          Source: process.env.SMTP_FROM || 'monitoring@symphonia.com',
          Destination: { ToAddresses: [process.env.ALERT_EMAIL] },
          Message: {
            Subject: { Data: emailSubject },
            Body: { Html: { Data: emailBody } }
          }
        }));
        console.log('📧 [ALERT] Email sent');
        alerts.push({ channel: 'email', status: 'sent' });
      } catch (error) {
        console.error('❌ [ALERT] Email error:', error.message);
        alerts.push({ channel: 'email', status: 'failed', error: error.message });
      }
    }

    return alerts;

  } catch (error) {
    console.error('❌ [ALERT] Error sending alerts:', error.message);
    return [];
  }
}

/**
 * Vérification monitoring et détection anomalies
 * Execute toutes les 5 minutes
 */
async function runMonitoringCheck() {
  if (!db) {
    console.warn('⚠️  [CRON] monitoringCheck: Database not available');
    return;
  }

  try {
    console.log('🔄 [CRON] Running monitoringCheck...');

    const now = Date.now();
    const monitoringResults = {
      timestamp: new Date(),
      jobs: {},
      datalake: {},
      anomalies: [],
      alerts: []
    };

    // 1. Vérifier état du Data Lake
    for (const [connectionId, syncService] of Object.entries(datalakeSyncServices)) {
      try {
        const stats = await syncService.getStats();
        monitoringResults.datalake[connectionId] = stats;

        // Vérifier si le Data Lake est en erreur
        if (!stats.isRunning) {
          monitoringResults.anomalies.push({
            type: 'DATALAKE_STOPPED',
            job: `datalake-${connectionId}`,
            severity: 'critical',
            message: 'Data Lake sync service stopped'
          });
        }
      } catch (error) {
        monitoringResults.anomalies.push({
          type: 'DATALAKE_ERROR',
          job: `datalake-${connectionId}`,
          severity: 'error',
          message: error.message
        });
      }
    }

    // 2. Vérifier santé de chaque job legacy
    for (const [jobName, lastResult] of Object.entries(lastSyncResults)) {
      const timeSinceLastSync = now - (lastResult.timestamp || 0);
      const hasError = !lastResult.success;

      if (timeSinceLastSync > 10 * 60 * 1000) {
        monitoringResults.anomalies.push({
          type: 'NO_SYNC',
          job: jobName,
          severity: 'critical',
          message: `No sync for ${Math.floor(timeSinceLastSync / 60000)} minutes`,
          timeSinceLastSync
        });
      }

      if (lastResult.duration && lastResult.duration > 2 * 60 * 1000) {
        monitoringResults.anomalies.push({
          type: 'SLOW_SYNC',
          job: jobName,
          severity: 'warning',
          message: `Slow sync: ${lastResult.duration}ms`,
          duration: lastResult.duration
        });
      }

      if (hasError) {
        monitoringResults.anomalies.push({
          type: 'SYNC_ERROR',
          job: jobName,
          severity: 'error',
          message: lastResult.error || 'Unknown error',
          error: lastResult.error
        });
      }

      monitoringResults.jobs[jobName] = {
        lastSync: new Date(lastResult.timestamp),
        success: lastResult.success,
        duration: lastResult.duration,
        timeSinceLastSync
      };
    }

    // 3. Sauvegarder monitoring log
    await db.collection('monitoring_logs').insertOne(monitoringResults);

    // 4. Envoyer alertes si anomalies critiques
    const criticalAnomalies = monitoringResults.anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      console.log(`⚠️  [CRON] monitoringCheck: ${criticalAnomalies.length} critical anomalies detected`);
      const alerts = await sendMonitoringAlerts(monitoringResults.anomalies);
      monitoringResults.alerts = alerts;

      await db.collection('monitoring_logs').updateOne(
        { _id: monitoringResults._id },
        { $set: { alerts } }
      );
    }

    console.log(`✅ [CRON] monitoringCheck: ${monitoringResults.anomalies.length} anomalies detected (${criticalAnomalies.length} critical)`);

  } catch (error) {
    console.error('❌ [CRON] monitoringCheck error:', error.message);
  }
}

/**
 * Initialiser le Data Lake pour une connexion
 * @param {Object} connection - Configuration de la connexion Dashdoc
 */
async function initializeDatalakeForConnection(connection) {
  try {
    const DashdocConnector = require('./connectors/dashdoc.connector');
    const dashdocConnector = new DashdocConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl
    });

    const connectionId = connection._id.toString();

    const syncService = new DatalakeSyncService(db, dashdocConnector, {
      organizationId: connection.organizationId || 'default',
      connectionId: connectionId,
      incrementalInterval: INTERVALS.DATALAKE_INCREMENTAL,
      periodicInterval: INTERVALS.DATALAKE_PERIODIC,
      fullSyncInterval: INTERVALS.DATALAKE_FULL
    });

    datalakeSyncServices[connectionId] = syncService;

    console.log(`✅ [DATALAKE] Initialized for connection: ${connection.organizationName} (${connectionId})`);

    return syncService;
  } catch (error) {
    console.error(`❌ [DATALAKE] Failed to initialize for ${connection.organizationName}:`, error.message);
    return null;
  }
}

/**
 * Démarrer tous les Data Lake Services
 */
async function startDatalakeServices() {
  try {
    console.log('🚀 [DATALAKE] Starting Data Lake services...');

    // Créer les index MongoDB pour le Data Lake
    await createAllIndexes(db);

    // Initialiser les readers (partagés pour toutes les connexions)
    datalakeReaders = createReaders(db);
    console.log('✅ [DATALAKE] Data readers initialized');

    // Récupérer toutes les connexions Dashdoc actives
    const activeConnections = await db.collection('tmsConnections').find({
      tmsType: 'dashdoc',
      isActive: true
    }).toArray();

    if (activeConnections.length === 0) {
      console.warn('⚠️  [DATALAKE] No active Dashdoc connections found');
      return;
    }

    console.log(`🔄 [DATALAKE] Initializing ${activeConnections.length} connections...`);

    // Initialiser et démarrer le Data Lake pour chaque connexion
    for (const connection of activeConnections) {
      const syncService = await initializeDatalakeForConnection(connection);
      if (syncService) {
        await syncService.start();
      }
    }

    console.log('✅ [DATALAKE] All Data Lake services started');

  } catch (error) {
    console.error('❌ [DATALAKE] Failed to start Data Lake services:', error.message);
  }
}

/**
 * Arrêter tous les Data Lake Services
 */
function stopDatalakeServices() {
  console.log('🛑 [DATALAKE] Stopping Data Lake services...');

  for (const [connectionId, syncService] of Object.entries(datalakeSyncServices)) {
    try {
      syncService.stop();
      console.log(`✅ [DATALAKE] Stopped for connection: ${connectionId}`);
    } catch (error) {
      console.error(`❌ [DATALAKE] Error stopping ${connectionId}:`, error.message);
    }
  }

  datalakeSyncServices = {};
  datalakeReaders = null;
  console.log('✅ [DATALAKE] All services stopped');
}

/**
 * Obtenir le statut du Data Lake
 */
async function getDatalakeStatus() {
  const status = {
    enabled: true,
    services: {}
  };

  for (const [connectionId, syncService] of Object.entries(datalakeSyncServices)) {
    try {
      status.services[connectionId] = await syncService.getStats();
    } catch (error) {
      status.services[connectionId] = { error: error.message };
    }
  }

  return status;
}

/**
 * Obtenir les readers du Data Lake
 * @returns {Object} Les readers pour lire depuis MongoDB
 */
function getDatalakeReaders() {
  return datalakeReaders;
}

/**
 * Demarrer tous les jobs planifies
 */
async function startAllJobs(database, tmsServiceInstance) {
  if (jobsRunning) {
    console.warn('⚠️  [CRON] Jobs already running');
    return;
  }

  db = database;
  tmsService = tmsServiceInstance;
  jobsRunning = true;

  // Initialize CloudWatch metrics
  try {
    metrics = new TMSSyncMetrics({ enabled: true });
    console.log('✅ [METRICS] CloudWatch metrics initialized');
  } catch (error) {
    console.warn('⚠️  [METRICS] Failed to initialize CloudWatch:', error.message);
  }

  console.log('============================================================================');
  console.log('🚀 [CRON] Starting TMS Sync scheduled jobs...');
  console.log('============================================================================');

  // ========== DÉMARRER LE DATA LAKE ==========
  console.log('');
  console.log('🗄️  [DATALAKE] === DATA LAKE SYNCHRONIZATION ===');
  await startDatalakeServices();
  console.log('');

  // ========== JOBS ACTIFS ==========
  jobIntervals.symphoniaSync = setInterval(runSymphoniaSync, INTERVALS.SYMPHONIA_SYNC);
  jobIntervals.vigilanceUpdate = setInterval(runVigilanceUpdate, INTERVALS.VIGILANCE_UPDATE);
  jobIntervals.healthCheck = setInterval(runHealthCheck, INTERVALS.HEALTH_CHECK);
  jobIntervals.monitoringCheck = setInterval(runMonitoringCheck, INTERVALS.MONITORING_CHECK);
  jobIntervals.cleanupLogs = setInterval(runCleanupLogs, INTERVALS.CLEANUP_LOGS);

  console.log('✅ [DATALAKE] Incremental sync: every 25 seconds');
  console.log('✅ [DATALAKE] Periodic sync: every 5 minutes');
  console.log('✅ [DATALAKE] Full sync: every 1 hour');
  console.log('✅ [CRON] symphoniaSync: every 1 minute (reads from Data Lake)');
  console.log('✅ [CRON] vigilanceUpdate: every 1 hour');
  console.log('✅ [CRON] healthCheck: every 5 minutes');
  console.log('✅ [CRON] monitoringCheck: every 5 minutes');
  console.log('✅ [CRON] cleanupLogs: every 24 hours');
  console.log('============================================================================');

  // Executer immediatement une premiere fois (apres 10s)
  setTimeout(() => {
    runSymphoniaSync();
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

  // Arrêter le Data Lake
  stopDatalakeServices();

  // Arrêter les intervalles
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
    datalake: {
      enabled: true,
      servicesCount: Object.keys(datalakeSyncServices).length,
      readersInitialized: !!datalakeReaders
    },
    jobs: {
      datalakeIncremental: {
        interval: '25 seconds',
        intervalMs: INTERVALS.DATALAKE_INCREMENTAL,
        active: Object.keys(datalakeSyncServices).length > 0,
        description: 'Data Lake incremental sync (transports, counters)'
      },
      datalakePeriodic: {
        interval: '5 minutes',
        intervalMs: INTERVALS.DATALAKE_PERIODIC,
        active: Object.keys(datalakeSyncServices).length > 0,
        description: 'Data Lake periodic sync (companies, vehicles, truckers)'
      },
      datalakeFull: {
        interval: '1 hour',
        intervalMs: INTERVALS.DATALAKE_FULL,
        active: Object.keys(datalakeSyncServices).length > 0,
        description: 'Data Lake full sync (all entities)'
      },
      symphoniaSync: {
        interval: '1 minute',
        intervalMs: INTERVALS.SYMPHONIA_SYNC,
        active: !!jobIntervals.symphoniaSync,
        description: 'Sync transports with Symphonia tag (from Data Lake)'
      },
      vigilanceUpdate: {
        interval: '1 hour',
        intervalMs: INTERVALS.VIGILANCE_UPDATE,
        active: !!jobIntervals.vigilanceUpdate,
        description: 'Update vigilance scores for all carriers'
      },
      healthCheck: {
        interval: '5 minutes',
        intervalMs: INTERVALS.HEALTH_CHECK,
        active: !!jobIntervals.healthCheck,
        description: 'Connection health verification'
      },
      monitoringCheck: {
        interval: '5 minutes',
        intervalMs: INTERVALS.MONITORING_CHECK,
        active: !!jobIntervals.monitoringCheck,
        description: 'Monitoring anomalies detection and alerts'
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
    symphoniaSync: runSymphoniaSync,
    vigilanceUpdate: runVigilanceUpdate,
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

/**
 * Get the sync service for a specific connection (or first available)
 */
function getDatalakeSyncService(connectionId = null) {
  if (connectionId && datalakeSyncServices[connectionId]) {
    return datalakeSyncServices[connectionId];
  }
  // Return first available sync service
  const services = Object.values(datalakeSyncServices);
  return services.length > 0 ? services[0] : null;
}

/**
 * Check if Data Lake is enabled
 */
function isDatalakeEnabled() {
  return Object.keys(datalakeSyncServices).length > 0;
}

module.exports = {
  INTERVALS,
  startAllJobs,
  stopAllJobs,
  getJobsStatus,
  runJobManually,
  runSymphoniaSync,
  runVigilanceUpdate,
  runHealthCheck,
  runCleanupLogs,

  // Data Lake exports
  getDatalakeStatus,
  getDatalakeReaders,
  getDatalakeSyncService,
  isDatalakeEnabled,
  startDatalakeServices,
  stopDatalakeServices,
  initializeDatalakeForConnection
};
