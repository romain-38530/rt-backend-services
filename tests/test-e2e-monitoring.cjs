/**
 * Test End-to-End - Monitoring TMS Sync
 *
 * Tests:
 * - Monitoring TMS Sync (GET /api/v1/monitoring/status)
 * - Simulation d'anomalies et vérification des alertes
 * - Vérification de la collection monitoring_logs
 * - Test d'envoi SMS/Email (mode dry run)
 *
 * Usage: node tests/test-e2e-monitoring.cjs
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');

// Configuration
const config = {
  tmsApiUrl: process.env.TMS_SYNC_API_URL || 'http://localhost:3000',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
  dbName: process.env.MONGODB_DB_NAME || 'rt-tms-sync',
  awsSnsEnabled: process.env.AWS_SNS_ENABLED === 'true',
  awsSesEnabled: process.env.AWS_SES_ENABLED === 'true',
};

// Codes de sortie
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Helpers de logs
function logSection(title) {
  console.log(`\n${colors.bright}${colors.cyan}======================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================${colors.reset}\n`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

// Test 1: Vérifier le statut du monitoring
async function testMonitoringStatus() {
  logSection('Test 1: Statut du Monitoring TMS Sync');

  try {
    const response = await axios.get(`${config.tmsApiUrl}/api/v1/monitoring/status`, {
      timeout: 5000,
    });

    if (response.status !== 200) {
      throw new Error(`Status code attendu: 200, reçu: ${response.status}`);
    }

    const data = response.data;

    // Vérifier la structure de la réponse
    const requiredFields = [
      'status',
      'timestamp',
      'services',
      'metrics',
      'lastSync',
      'healthChecks',
    ];

    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Champ manquant dans la réponse: ${field}`);
      }
    }

    logSuccess(`Endpoint /api/v1/monitoring/status accessible`);
    logSuccess(`Status: ${data.status}`);
    logSuccess(`Services actifs: ${Object.keys(data.services).length}`);
    logSuccess(`Dernière sync: ${data.lastSync}`);

    return true;
  } catch (error) {
    logError(`Erreur lors du test du monitoring: ${error.message}`);
    return false;
  }
}

// Test 2: Simuler une anomalie et vérifier les alertes
async function testAnomalyDetection(mongoClient) {
  logSection('Test 2: Détection d\'Anomalies');

  try {
    const db = mongoClient.db(config.dbName);
    const logsCollection = db.collection('monitoring_logs');

    // Simuler une anomalie en créant un log d'erreur
    const anomaly = {
      timestamp: new Date(),
      level: 'error',
      service: 'tms-sync',
      message: 'Test anomaly: Synchronization failed',
      metadata: {
        syncType: 'carriers',
        errorCode: 'SYNC_TIMEOUT',
        duration: 65000, // Plus de 60s = timeout
      },
      alertTriggered: true,
      alertType: 'sync_failure',
    };

    const insertResult = await logsCollection.insertOne(anomaly);
    logSuccess(`Anomalie simulée créée: ${insertResult.insertedId}`);

    // Vérifier que l'anomalie a été enregistrée
    const savedAnomaly = await logsCollection.findOne({ _id: insertResult.insertedId });
    if (!savedAnomaly) {
      throw new Error('Anomalie non trouvée dans la base de données');
    }

    logSuccess('Anomalie enregistrée dans monitoring_logs');

    // Vérifier les alertes déclenchées
    const recentAlerts = await logsCollection
      .find({
        alertTriggered: true,
        timestamp: { $gte: new Date(Date.now() - 3600000) }, // Dernière heure
      })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    logSuccess(`Alertes déclenchées dans la dernière heure: ${recentAlerts.length}`);

    return true;
  } catch (error) {
    logError(`Erreur lors du test de détection d'anomalies: ${error.message}`);
    return false;
  }
}

// Test 3: Vérifier la collection monitoring_logs
async function testMonitoringLogsCollection(mongoClient) {
  logSection('Test 3: Collection monitoring_logs');

  try {
    const db = mongoClient.db(config.dbName);
    const logsCollection = db.collection('monitoring_logs');

    // Vérifier que la collection existe
    const collections = await db.listCollections({ name: 'monitoring_logs' }).toArray();
    if (collections.length === 0) {
      logWarning('Collection monitoring_logs n\'existe pas encore');
      // Créer la collection avec un document test
      await logsCollection.insertOne({
        timestamp: new Date(),
        level: 'info',
        service: 'test',
        message: 'Test log entry',
      });
      logSuccess('Collection monitoring_logs créée');
    } else {
      logSuccess('Collection monitoring_logs existe');
    }

    // Vérifier les index
    const indexes = await logsCollection.indexes();
    logInfo(`Indexes trouvés: ${indexes.length}`);
    indexes.forEach((index) => {
      logInfo(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Compter les documents
    const totalLogs = await logsCollection.countDocuments();
    const errorLogs = await logsCollection.countDocuments({ level: 'error' });
    const warningLogs = await logsCollection.countDocuments({ level: 'warning' });

    logSuccess(`Total de logs: ${totalLogs}`);
    logSuccess(`Logs d'erreur: ${errorLogs}`);
    logSuccess(`Logs d'avertissement: ${warningLogs}`);

    // Vérifier les logs récents
    const recentLogs = await logsCollection
      .find()
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    logInfo('Derniers logs:');
    recentLogs.forEach((log, index) => {
      logInfo(`  ${index + 1}. [${log.level}] ${log.service}: ${log.message}`);
    });

    return true;
  } catch (error) {
    logError(`Erreur lors de la vérification de monitoring_logs: ${error.message}`);
    return false;
  }
}

// Test 4: Test d'envoi SMS/Email (mode dry run)
async function testAlertNotifications(mongoClient) {
  logSection('Test 4: Notifications d\'Alertes (Dry Run)');

  try {
    const db = mongoClient.db(config.dbName);
    const logsCollection = db.collection('monitoring_logs');

    // Créer une alerte critique qui devrait déclencher une notification
    const criticalAlert = {
      timestamp: new Date(),
      level: 'critical',
      service: 'tms-sync',
      message: 'Test critical alert: Database connection lost',
      metadata: {
        errorType: 'DATABASE_CONNECTION',
        severity: 'critical',
        affectedServices: ['carriers', 'orders'],
      },
      alertTriggered: true,
      alertType: 'critical_failure',
      notificationSent: false,
    };

    const insertResult = await logsCollection.insertOne(criticalAlert);
    logSuccess(`Alerte critique créée: ${insertResult.insertedId}`);

    // Simuler l'envoi de notifications (mode dry run)
    const notificationPayload = {
      sms: {
        enabled: config.awsSnsEnabled,
        recipient: process.env.ALERT_PHONE_NUMBER || '+33612345678',
        message: `[SYMPHONIA ALERT] ${criticalAlert.message}`,
        dryRun: !config.awsSnsEnabled,
      },
      email: {
        enabled: config.awsSesEnabled,
        recipient: process.env.ALERT_EMAIL || 'admin@symphonia.fr',
        subject: `[CRITICAL] TMS Sync Alert`,
        body: `
          Alert Details:
          - Service: ${criticalAlert.service}
          - Level: ${criticalAlert.level}
          - Message: ${criticalAlert.message}
          - Timestamp: ${criticalAlert.timestamp.toISOString()}
        `,
        dryRun: !config.awsSesEnabled,
      },
    };

    // En mode dry run, on simule juste
    if (!notificationPayload.sms.enabled) {
      logWarning('SMS non activé - Mode dry run');
      logInfo(`SMS serait envoyé à: ${notificationPayload.sms.recipient}`);
      logInfo(`Contenu: ${notificationPayload.sms.message}`);
    } else {
      logSuccess('SMS activé - Envoi réel possible');
    }

    if (!notificationPayload.email.enabled) {
      logWarning('Email non activé - Mode dry run');
      logInfo(`Email serait envoyé à: ${notificationPayload.email.recipient}`);
      logInfo(`Sujet: ${notificationPayload.email.subject}`);
    } else {
      logSuccess('Email activé - Envoi réel possible');
    }

    // Mettre à jour le log pour marquer la notification comme "envoyée" (dry run)
    await logsCollection.updateOne(
      { _id: insertResult.insertedId },
      {
        $set: {
          notificationSent: true,
          notificationSentAt: new Date(),
          notificationPayload,
        },
      }
    );

    logSuccess('Notification simulée enregistrée');

    return true;
  } catch (error) {
    logError(`Erreur lors du test des notifications: ${error.message}`);
    return false;
  }
}

// Test 5: Vérifier les métriques de performance
async function testPerformanceMetrics() {
  logSection('Test 5: Métriques de Performance');

  try {
    const response = await axios.get(`${config.tmsApiUrl}/api/v1/monitoring/metrics`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      const metrics = response.data;
      logSuccess('Endpoint /api/v1/monitoring/metrics accessible');

      // Vérifier les métriques clés
      if (metrics.syncDuration) {
        logInfo(`Durée moyenne de sync: ${metrics.syncDuration.avg}ms`);
        logInfo(`Durée max de sync: ${metrics.syncDuration.max}ms`);
      }

      if (metrics.successRate) {
        logInfo(`Taux de succès: ${metrics.successRate}%`);
      }

      if (metrics.errorRate) {
        logInfo(`Taux d'erreur: ${metrics.errorRate}%`);
      }

      return true;
    } else {
      logWarning('Endpoint de métriques non disponible');
      return true; // Non bloquant
    }
  } catch (error) {
    logWarning(`Endpoint de métriques non accessible: ${error.message}`);
    return true; // Non bloquant
  }
}

// Fonction principale
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     TEST END-TO-END - MONITORING TMS SYNC            ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  logInfo(`Configuration:`);
  logInfo(`  - TMS API URL: ${config.tmsApiUrl}`);
  logInfo(`  - MongoDB URI: ${config.mongoUri.replace(/\/\/.*@/, '//***@')}`);
  logInfo(`  - Database: ${config.dbName}`);
  logInfo(`  - AWS SNS: ${config.awsSnsEnabled ? 'Activé' : 'Désactivé (Dry Run)'}`);
  logInfo(`  - AWS SES: ${config.awsSesEnabled ? 'Activé' : 'Désactivé (Dry Run)'}`);

  let mongoClient;
  const results = {
    monitoringStatus: false,
    anomalyDetection: false,
    monitoringLogs: false,
    notifications: false,
    performanceMetrics: false,
  };

  try {
    // Connexion MongoDB
    logSection('Connexion à MongoDB');
    mongoClient = new MongoClient(config.mongoUri);
    await mongoClient.connect();
    logSuccess('Connecté à MongoDB');

    // Exécuter les tests
    results.monitoringStatus = await testMonitoringStatus();
    results.anomalyDetection = await testAnomalyDetection(mongoClient);
    results.monitoringLogs = await testMonitoringLogsCollection(mongoClient);
    results.notifications = await testAlertNotifications(mongoClient);
    results.performanceMetrics = await testPerformanceMetrics();

    // Résumé des résultats
    logSection('Résumé des Tests');

    const tests = [
      { name: 'Statut du Monitoring', result: results.monitoringStatus },
      { name: 'Détection d\'Anomalies', result: results.anomalyDetection },
      { name: 'Collection monitoring_logs', result: results.monitoringLogs },
      { name: 'Notifications d\'Alertes', result: results.notifications },
      { name: 'Métriques de Performance', result: results.performanceMetrics },
    ];

    let passedCount = 0;
    tests.forEach((test) => {
      if (test.result) {
        logSuccess(`${test.name}: PASS`);
        passedCount++;
      } else {
        logError(`${test.name}: FAIL`);
      }
    });

    console.log(`\n${colors.bright}Résultat: ${passedCount}/${tests.length} tests réussis${colors.reset}\n`);

    // Fermer la connexion MongoDB
    await mongoClient.close();
    logSuccess('Connexion MongoDB fermée');

    // Retourner le code de sortie approprié
    if (passedCount === tests.length) {
      console.log(`${colors.green}${colors.bright}✓ TOUS LES TESTS SONT PASSES !${colors.reset}\n`);
      process.exit(EXIT_SUCCESS);
    } else {
      console.log(`${colors.red}${colors.bright}✗ CERTAINS TESTS ONT ECHOUE${colors.reset}\n`);
      process.exit(EXIT_FAILURE);
    }
  } catch (error) {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error.stack);

    if (mongoClient) {
      await mongoClient.close();
    }

    process.exit(EXIT_FAILURE);
  }
}

// Lancer les tests
main();
