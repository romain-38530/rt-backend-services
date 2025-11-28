/**
 * Test Rapide - AFFRET.IA API v2
 * Script pour tester rapidement les fonctionnalites principales
 */

const axios = require('axios');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3017';

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testHealthCheck() {
  log('\n=== Test 1: Health Check ===', 'blue');
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    log(`✓ Health check OK: ${JSON.stringify(response.data)}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Health check failed: ${error.message}`, 'red');
    return false;
  }
}

async function testTriggerAffretIA() {
  log('\n=== Test 2: Declenchement AFFRET.IA ===', 'blue');
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/trigger`, {
      orderId: 'ORD-TEST-' + Date.now(),
      organizationId: 'ORG-TEST',
      triggerType: 'manual',
      reason: 'Test automatique',
      userId: 'test-user'
    });
    log(`✓ Session creee: ${response.data.data.sessionId}`, 'green');
    return response.data.data.sessionId;
  } catch (error) {
    log(`✗ Erreur declenchement: ${error.message}`, 'red');
    if (error.response) {
      log(`  Details: ${JSON.stringify(error.response.data)}`, 'yellow');
    }
    return null;
  }
}

async function testGetSession(sessionId) {
  log('\n=== Test 3: Recuperation Session ===', 'blue');
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/affretia/session/${sessionId}`);
    log(`✓ Session recuperee: ${response.data.data.status}`, 'green');
    return true;
  } catch (error) {
    log(`✗ Erreur recuperation: ${error.message}`, 'red');
    return false;
  }
}

async function testGetSessions() {
  log('\n=== Test 4: Liste des Sessions ===', 'blue');
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/affretia/sessions?limit=5`);
    log(`✓ ${response.data.count} session(s) trouvee(s)`, 'green');
    return true;
  } catch (error) {
    log(`✗ Erreur liste sessions: ${error.message}`, 'red');
    return false;
  }
}

async function testVigilanceCheck() {
  log('\n=== Test 5: Verification Vigilance ===', 'blue');
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/vigilance/check`, {
      carrierId: 'TR-TEST-001',
      checks: ['kbis', 'insurance', 'license', 'blacklist']
    });
    log(`✓ Verification OK: ${response.data.data.overallStatus} (score: ${response.data.data.complianceScore})`, 'green');
    return true;
  } catch (error) {
    log(`✗ Erreur vigilance: ${error.message}`, 'red');
    return false;
  }
}

async function testGetStats() {
  log('\n=== Test 6: Statistiques Globales ===', 'blue');
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/affretia/stats`);
    log(`✓ Stats: ${response.data.data.totalSessions} sessions totales`, 'green');
    log(`  Taux de succes: ${response.data.data.successRate.toFixed(1)}%`, 'green');
    return true;
  } catch (error) {
    log(`✗ Erreur stats: ${error.message}`, 'red');
    return false;
  }
}

async function testBourse() {
  log('\n=== Test 7: Bourse Publique ===', 'blue');
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/affretia/bourse?limit=10`);
    log(`✓ ${response.data.count} offre(s) dans la bourse`, 'green');
    return true;
  } catch (error) {
    log(`✗ Erreur bourse: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║  AFFRET.IA API v2 - Tests Rapides                     ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝', 'blue');
  log(`\nURL de test: ${BASE_URL}\n`, 'yellow');

  const results = [];

  // Test 1: Health Check
  const healthOk = await testHealthCheck();
  results.push({ test: 'Health Check', passed: healthOk });

  if (!healthOk) {
    log('\n⚠️  Le service ne repond pas. Verifiez qu\'il est demarre.', 'red');
    log('   npm run dev\n', 'yellow');
    return;
  }

  // Test 2: Declenchement
  const sessionId = await testTriggerAffretIA();
  results.push({ test: 'Declenchement AFFRET.IA', passed: !!sessionId });

  if (sessionId) {
    // Test 3: Get Session
    const getSessionOk = await testGetSession(sessionId);
    results.push({ test: 'Recuperation Session', passed: getSessionOk });
  }

  // Test 4: Liste Sessions
  const getSessionsOk = await testGetSessions();
  results.push({ test: 'Liste Sessions', passed: getSessionsOk });

  // Test 5: Vigilance
  const vigilanceOk = await testVigilanceCheck();
  results.push({ test: 'Verification Vigilance', passed: vigilanceOk });

  // Test 6: Stats
  const statsOk = await testGetStats();
  results.push({ test: 'Statistiques', passed: statsOk });

  // Test 7: Bourse
  const bourseOk = await testBourse();
  results.push({ test: 'Bourse Publique', passed: bourseOk });

  // Resultat final
  log('\n╔════════════════════════════════════════════════════════╗', 'blue');
  log('║  RESULTATS DES TESTS                                   ║', 'blue');
  log('╚════════════════════════════════════════════════════════╝', 'blue');

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const icon = result.passed ? '✓' : '✗';
    const color = result.passed ? 'green' : 'red';
    log(`  ${icon} ${result.test}`, color);
  });

  log(`\n📊 Score: ${passed}/${total} tests passes`, passed === total ? 'green' : 'yellow');

  if (passed === total) {
    log('\n🎉 Tous les tests sont passes ! L\'API est fonctionnelle.', 'green');
  } else {
    log(`\n⚠️  ${total - passed} test(s) en echec. Verifiez la configuration.`, 'yellow');
  }

  log('\n');
}

// Executer les tests
runAllTests().catch(error => {
  log(`\n❌ Erreur fatale: ${error.message}`, 'red');
  process.exit(1);
});
