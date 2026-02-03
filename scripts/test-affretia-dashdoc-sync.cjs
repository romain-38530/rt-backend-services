/**
 * Script de Test - Synchronisation Affret.IA → Dashdoc
 *
 * Ce script teste la chaîne complète de synchronisation:
 * 1. Webhook depuis Affret.IA vers TMS Sync
 * 2. TMS Sync récupère les données depuis MongoDB
 * 3. TMS Sync met à jour le transport dans Dashdoc
 */

const axios = require('axios');

// Configuration
const TMS_SYNC_URL = 'https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com';
const TMS_SYNC_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXJ2aWNlIjoidG1zLXN5bmMiLCJzY29wZSI6ImFmZnJldGlhLXN5bmMiLCJpYXQiOjE3MzgzODMzMzksImV4cCI6MTc3MDAwNTczOX0.nEGwm-VyIGpJGFj2XR1-Z1AVNO4MWieCXmk90iS0vxo';

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Test 1: Vérifier le statut du service
 */
async function testServiceStatus() {
  log('\n========================================', 'cyan');
  log('TEST 1: Statut du Service', 'bright');
  log('========================================', 'cyan');

  try {
    const response = await axios.get(`${TMS_SYNC_URL}/api/v1/tms/affretia-sync/status`, {
      headers: {
        'Authorization': `Bearer ${TMS_SYNC_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    log('✅ Service opérationnel', 'green');
    log(`Status: ${response.data.status}`, 'blue');
    log(`Connecteurs Dashdoc: ${response.data.dashdocConnectors}`, 'blue');
    log(`MongoDB connecté: ${response.data.mongodb}`, 'blue');

    return { success: true, data: response.data };
  } catch (error) {
    log('❌ Erreur lors de la vérification du statut', 'red');
    log(`Erreur: ${error.message}`, 'red');
    if (error.response) {
      log(`Status HTTP: ${error.response.status}`, 'yellow');
      log(`Données: ${JSON.stringify(error.response.data)}`, 'yellow');
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test 2: Simuler un webhook carrier.assigned
 */
async function testCarrierAssignedWebhook(orderId, carrierId, price, sessionId) {
  log('\n========================================', 'cyan');
  log('TEST 2: Webhook carrier.assigned', 'bright');
  log('========================================', 'cyan');

  const eventData = {
    eventName: 'carrier.assigned',
    data: {
      orderId,
      carrierId,
      price,
      sessionId: sessionId || 'test-session-' + Date.now()
    }
  };

  log(`Données envoyées:`, 'blue');
  log(JSON.stringify(eventData, null, 2), 'blue');

  try {
    const response = await axios.post(
      `${TMS_SYNC_URL}/api/v1/tms/affretia-sync/webhook`,
      eventData,
      {
        headers: {
          'Authorization': `Bearer ${TMS_SYNC_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    log('✅ Webhook traité avec succès', 'green');
    log(`Réponse:`, 'blue');
    log(JSON.stringify(response.data, null, 2), 'blue');

    return { success: true, data: response.data };
  } catch (error) {
    log('❌ Erreur lors du traitement du webhook', 'red');
    log(`Erreur: ${error.message}`, 'red');
    if (error.response) {
      log(`Status HTTP: ${error.response.status}`, 'yellow');
      log(`Données: ${JSON.stringify(error.response.data, null, 2)}`, 'yellow');
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test 3: Synchronisation manuelle
 */
async function testManualSync(orderId, carrierId, price) {
  log('\n========================================', 'cyan');
  log('TEST 3: Synchronisation Manuelle', 'bright');
  log('========================================', 'cyan');

  const syncData = {
    orderId,
    carrierId,
    price
  };

  log(`Données de sync:`, 'blue');
  log(JSON.stringify(syncData, null, 2), 'blue');

  try {
    const response = await axios.post(
      `${TMS_SYNC_URL}/api/v1/tms/affretia-sync/test`,
      syncData,
      {
        headers: {
          'Authorization': `Bearer ${TMS_SYNC_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    log('✅ Synchronisation manuelle réussie', 'green');
    log(`Réponse:`, 'blue');
    log(JSON.stringify(response.data, null, 2), 'blue');

    return { success: true, data: response.data };
  } catch (error) {
    log('❌ Erreur lors de la synchronisation manuelle', 'red');
    log(`Erreur: ${error.message}`, 'red');
    if (error.response) {
      log(`Status HTTP: ${error.response.status}`, 'yellow');
      log(`Données: ${JSON.stringify(error.response.data, null, 2)}`, 'yellow');
    }
    return { success: false, error: error.message };
  }
}

/**
 * Fonction principale
 */
async function runTests() {
  log('\n╔════════════════════════════════════════╗', 'bright');
  log('║  TEST SYNCHRONISATION AFFRET.IA → DASHDOC  ║', 'bright');
  log('╚════════════════════════════════════════╝', 'bright');

  const results = {
    serviceStatus: null,
    webhook: null,
    manualSync: null
  };

  // Test 1: Statut du service
  results.serviceStatus = await testServiceStatus();

  if (!results.serviceStatus.success) {
    log('\n⚠️ Le service ne répond pas. Arrêt des tests.', 'red');
    return results;
  }

  // Paramètres de test
  // IMPORTANT: Remplacer ces IDs par des IDs réels de votre base de données
  const TEST_ORDER_ID = process.argv[2] || 'REMPLACER_PAR_ORDER_ID_REEL';
  const TEST_CARRIER_ID = process.argv[3] || 'REMPLACER_PAR_CARRIER_ID_REEL';
  const TEST_PRICE = parseFloat(process.argv[4]) || 450.00;
  const TEST_SESSION_ID = process.argv[5] || null;

  if (TEST_ORDER_ID === 'REMPLACER_PAR_ORDER_ID_REEL') {
    log('\n⚠️ ATTENTION: Vous devez fournir des IDs réels pour tester', 'yellow');
    log('\nUtilisation:', 'blue');
    log('  node test-affretia-dashdoc-sync.cjs <orderId> <carrierId> <price> [sessionId]', 'blue');
    log('\nExemple:', 'blue');
    log('  node test-affretia-dashdoc-sync.cjs 65f3a1b2c3d4e5f6a7b8c9d0 65e2a1b2c3d4e5f6a7b8c9d1 350.00', 'blue');
    log('\n❌ Tests webhook et sync manuel ignorés (pas d\'IDs fournis)', 'yellow');
    return results;
  }

  // Test 2: Webhook
  results.webhook = await testCarrierAssignedWebhook(
    TEST_ORDER_ID,
    TEST_CARRIER_ID,
    TEST_PRICE,
    TEST_SESSION_ID
  );

  // Test 3: Sync manuelle
  results.manualSync = await testManualSync(
    TEST_ORDER_ID,
    TEST_CARRIER_ID,
    TEST_PRICE
  );

  // Résumé
  log('\n========================================', 'cyan');
  log('RÉSUMÉ DES TESTS', 'bright');
  log('========================================', 'cyan');

  const totalTests = 3;
  const passedTests = [
    results.serviceStatus?.success,
    results.webhook?.success,
    results.manualSync?.success
  ].filter(Boolean).length;

  log(`\nTests réussis: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');
  log(`- Statut service: ${results.serviceStatus?.success ? '✅' : '❌'}`, results.serviceStatus?.success ? 'green' : 'red');
  log(`- Webhook: ${results.webhook?.success ? '✅' : '❌'}`, results.webhook?.success ? 'green' : 'red');
  log(`- Sync manuelle: ${results.manualSync?.success ? '✅' : '❌'}`, results.manualSync?.success ? 'green' : 'red');

  if (passedTests === totalTests) {
    log('\n🎉 Tous les tests sont passés avec succès!', 'green');
  } else if (passedTests > 0) {
    log('\n⚠️ Certains tests ont échoué', 'yellow');
  } else {
    log('\n❌ Tous les tests ont échoué', 'red');
  }

  return results;
}

// Exécution
if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch(error => {
      log(`\n❌ Erreur fatale: ${error.message}`, 'red');
      process.exit(1);
    });
}

module.exports = { testServiceStatus, testCarrierAssignedWebhook, testManualSync };
