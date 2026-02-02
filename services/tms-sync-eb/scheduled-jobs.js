/**
 * Scheduled Jobs - TMS Sync
 * Synchronisation automatique haute frequence avec Dashdoc
 * Pattern base sur subscriptions-contracts-eb/scheduled-jobs.js
 */

const { TMSSyncMetrics } = require('./cloudwatch-stub');

/**
 * Configuration des intervalles (en millisecondes)
 */
const INTERVALS = {
  AUTO_SYNC: 30 * 1000,           // 30 secondes - Sync haute frequence
  SYMPHONIA_SYNC: 60 * 1000,      // 1 minute - Sync transports avec tag Symphonia
  CARRIERS_SYNC: 5 * 60 * 1000,   // 5 minutes - Sync carriers
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
let metrics = null; // CloudWatch metrics instance

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

        // Send CloudWatch metrics
        if (metrics) {
          await metrics.recordSyncSuccess(duration, result.transports?.count || 0).catch(err => {
            console.error('Failed to send metrics:', err);
          });
        }

        console.log(`✅ [CRON] ${connection.organizationName}: ${result.transports?.count || 0} transports synced in ${duration}ms`);

      } catch (error) {
        console.error(`❌ [CRON] Error syncing ${connection.organizationName}:`, error.message);

        const duration = Date.now() - startTime;
        lastSyncResults[connection._id.toString()] = {
          timestamp: Date.now(),
          success: false,
          error: error.message
        };

        // Send CloudWatch metrics for failure
        if (metrics) {
          await metrics.recordSyncFailure(duration, error.name || 'Unknown').catch(err => {
            console.error('Failed to send error metrics:', err);
          });
        }
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
 * Synchronisation des carriers depuis Dashdoc
 * Execute toutes les 5 minutes
 */
async function runCarriersSync() {
  if (!db || !tmsService) return;

  try {
    console.log('🔄 [CRON] Running carriers sync...');

    const connection = await db.collection('tmsConnections').findOne({
      tmsType: 'dashdoc',
      isActive: true
    });

    if (!connection) {
      console.warn('⚠️  [CRON] No active Dashdoc connection');
      return;
    }

    const DashdocConnector = require('./connectors/dashdoc.connector');
    const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl
    });

    // Récupérer TOUS les carriers avec pagination automatique
    console.log('[CRON CARRIERS] Fetching ALL carriers with automatic pagination...');
    const result = await dashdoc.syncCarriersWithStats({
      usePagination: true,
      maxPages: 100  // 100 pages pour être sûr de tout récupérer (~91 pages nécessaires pour 1734 carriers)
    });

    let synced = 0;
    for (const carrier of result.results) {
      await db.collection('carriers').updateOne(
        { externalId: carrier.externalId },
        {
          $set: {
            ...carrier,
            lastSyncAt: new Date(),
            tmsConnectionId: connection._id.toString()
          }
        },
        { upsert: true }
      );
      synced++;
    }

    console.log(`✅ [CRON CARRIERS] ${synced} carriers synchronized`);

    // Nettoyer les carriers obsolètes (non synchronisés dans les 10 dernières minutes)
    // Ce sont les carriers exclus par le filtre (ex: donneurs d'ordre avec remoteId=C\d+)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const deleteResult = await db.collection('carriers').deleteMany({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: tenMinutesAgo }
    });

    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️  [CRON CARRIERS] Removed ${deleteResult.deletedCount} obsolete carriers`);
    }

  } catch (error) {
    console.error('❌ [CRON CARRIERS] Error:', error.message);
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
 * Synchronisation automatique des transports avec tag Symphonia
 * Execute toutes les 1 minute
 */
async function runSymphoniaSync() {
  if (!db) return;

  try {
    console.log('🔄 [CRON] Running Symphonia sync...');

    // Recuperer la connexion Dashdoc active
    const connection = await db.collection('tmsConnections').findOne({
      tmsType: 'dashdoc',
      isActive: true
    });

    if (!connection) {
      console.warn('⚠️  [CRON] No active Dashdoc connection found');
      return;
    }

    // Creer client axios pour appeler Dashdoc API
    const axios = require('axios');
    const client = axios.create({
      baseURL: connection.credentials.apiUrl || 'https://www.dashdoc.eu/api/v4',
      timeout: 30000,
      headers: {
        'Authorization': `Token ${connection.credentials.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Recuperer tous les transports avec tag Symphonia (PK: 126835)
    console.log('[CRON SYMPHONIA] Fetching transports with Symphonia tag...');
    const response = await client.get('/transports/?tags__in=126835&limit=100');
    const transports = response.data.results || [];

    if (transports.length === 0) {
      console.log('✅ [CRON SYMPHONIA] No transports with Symphonia tag found');
      return;
    }

    console.log(`[CRON SYMPHONIA] Found ${transports.length} transports with Symphonia tag`);

    // Mapper et sauvegarder chaque transport
    const DashdocConnector = require('./connectors/dashdoc.connector');
    const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl
    });

    let synced = 0;
    for (const transport of transports) {
      try {
        const mappedOrder = dashdoc.mapTransport(transport);

        await db.collection('orders').updateOne(
          { externalId: mappedOrder.externalId },
          { $set: mappedOrder },
          { upsert: true }
        );

        synced++;
      } catch (error) {
        console.error(`[CRON SYMPHONIA] Error syncing transport ${transport.sequential_id}:`, error.message);
      }
    }

    console.log(`✅ [CRON SYMPHONIA] ${synced}/${transports.length} transports synchronized`);

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

    // Message SMS court
    const smsMessage = `[SYMPHONIA TMS] ${criticalCount} anomalies critiques détectées. Vérifier dashboard monitoring.`;

    // Message Email détaillé
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

    // Envoi SMS via SNS si configuré
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

    // Envoi Email via SES si configuré
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
      anomalies: [],
      alerts: []
    };

    // 1. Vérifier santé de chaque job
    for (const [jobName, lastResult] of Object.entries(lastSyncResults)) {
      const timeSinceLastSync = now - (lastResult.timestamp || 0);
      const hasError = !lastResult.success;

      // Détection anomalie: pas de sync depuis 10min
      if (timeSinceLastSync > 10 * 60 * 1000) {
        monitoringResults.anomalies.push({
          type: 'NO_SYNC',
          job: jobName,
          severity: 'critical',
          message: `No sync for ${Math.floor(timeSinceLastSync / 60000)} minutes`,
          timeSinceLastSync
        });
      }

      // Détection anomalie: durée sync > 2min
      if (lastResult.duration && lastResult.duration > 2 * 60 * 1000) {
        monitoringResults.anomalies.push({
          type: 'SLOW_SYNC',
          job: jobName,
          severity: 'warning',
          message: `Slow sync: ${lastResult.duration}ms`,
          duration: lastResult.duration
        });
      }

      // Détection anomalie: erreurs
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

    // 2. Sauvegarder monitoring log
    await db.collection('monitoring_logs').insertOne(monitoringResults);

    // 3. Envoyer alertes si anomalies critiques
    const criticalAnomalies = monitoringResults.anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      console.log(`⚠️  [CRON] monitoringCheck: ${criticalAnomalies.length} critical anomalies detected`);
      const alerts = await sendMonitoringAlerts(monitoringResults.anomalies);
      monitoringResults.alerts = alerts;

      // Update log avec alertes
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

  // Demarrer les jobs avec leurs intervalles respectifs
  jobIntervals.autoSync = setInterval(runAutoSync, INTERVALS.AUTO_SYNC);
  jobIntervals.symphoniaSync = setInterval(runSymphoniaSync, INTERVALS.SYMPHONIA_SYNC);
  jobIntervals.carriersSync = setInterval(runCarriersSync, INTERVALS.CARRIERS_SYNC);
  jobIntervals.vigilanceUpdate = setInterval(runVigilanceUpdate, INTERVALS.VIGILANCE_UPDATE);
  jobIntervals.healthCheck = setInterval(runHealthCheck, INTERVALS.HEALTH_CHECK);
  jobIntervals.monitoringCheck = setInterval(runMonitoringCheck, INTERVALS.MONITORING_CHECK);
  jobIntervals.cleanupLogs = setInterval(runCleanupLogs, INTERVALS.CLEANUP_LOGS);

  console.log('✅ [CRON] autoSync: every 30 seconds (HIGH FREQUENCY)');
  console.log('✅ [CRON] symphoniaSync: every 1 minute (TAG SYMPHONIA)');
  console.log('✅ [CRON] carriersSync: every 5 minutes (CARRIERS)');
  console.log('✅ [CRON] vigilanceUpdate: every 1 hour (VIGILANCE SCORES)');
  console.log('✅ [CRON] healthCheck: every 5 minutes');
  console.log('✅ [CRON] monitoringCheck: every 5 minutes (MONITORING & ALERTS)');
  console.log('✅ [CRON] cleanupLogs: every 24 hours');
  console.log('============================================================================');

  // Executer immediatement une premiere fois (apres 10s)
  setTimeout(() => {
    runAutoSync();
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
      symphoniaSync: {
        interval: '1 minute',
        intervalMs: INTERVALS.SYMPHONIA_SYNC,
        active: !!jobIntervals.symphoniaSync,
        description: 'Sync transports with Symphonia tag'
      },
      carriersSync: {
        interval: '5 minutes',
        intervalMs: INTERVALS.CARRIERS_SYNC,
        active: !!jobIntervals.carriersSync,
        description: 'Sync carriers from Dashdoc'
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
    autoSync: runAutoSync,
    symphoniaSync: runSymphoniaSync,
    carriersSync: runCarriersSync,
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

module.exports = {
  INTERVALS,
  startAllJobs,
  stopAllJobs,
  getJobsStatus,
  runJobManually,
  runAutoSync,
  runSymphoniaSync,
  runCarriersSync,
  runVigilanceUpdate,
  runHealthCheck,
  runCleanupLogs
};
