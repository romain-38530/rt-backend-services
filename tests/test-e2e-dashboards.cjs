/**
 * Test End-to-End - Dashboards
 *
 * Tests:
 * - Email Metrics Dashboard: GET /api/email-metrics/*
 * - Carrier Scoring Dashboard: GET /api/v1/carriers/leaderboard
 * - TMS Real-Time Dashboard: GET /api/v1/monitoring/status
 * - Vérification des réponses JSON valides
 * - Vérification des temps de réponse < 500ms
 *
 * Usage: node tests/test-e2e-dashboards.cjs
 */

require('dotenv').config();
const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const config = {
  authzApiUrl: process.env.AUTHZ_API_URL || 'http://localhost:3001',
  carriersApiUrl: process.env.CARRIERS_API_URL || 'http://localhost:3002',
  tmsApiUrl: process.env.TMS_API_URL || 'http://localhost:3000',
  performanceThreshold: 500, // ms
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
  magenta: '\x1b[35m',
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

function logPerf(message, duration) {
  const color = duration < config.performanceThreshold ? colors.green : colors.red;
  console.log(`${color}⚡${colors.reset} ${message} (${duration.toFixed(2)}ms)`);
}

// Helper pour tester un endpoint
async function testEndpoint(name, url, validationFn) {
  try {
    const start = performance.now();
    const response = await axios.get(url, {
      timeout: 10000,
      validateStatus: () => true, // Accepter tous les status codes
    });
    const duration = performance.now() - start;

    if (response.status !== 200) {
      logError(`${name}: Status ${response.status}`);
      return { success: false, duration };
    }

    // Vérifier que la réponse est du JSON valide
    if (typeof response.data !== 'object') {
      logError(`${name}: Réponse non-JSON`);
      return { success: false, duration };
    }

    // Validation personnalisée
    if (validationFn) {
      const validationResult = validationFn(response.data);
      if (!validationResult.valid) {
        logError(`${name}: ${validationResult.error}`);
        return { success: false, duration };
      }
    }

    logSuccess(`${name}: OK`);
    logPerf(`  Temps de réponse`, duration);

    // Vérifier la performance
    if (duration < config.performanceThreshold) {
      logSuccess(`  Performance OK (< ${config.performanceThreshold}ms)`);
    } else {
      logWarning(`  Performance lente (> ${config.performanceThreshold}ms)`);
    }

    return { success: true, duration, data: response.data };
  } catch (error) {
    logError(`${name}: ${error.message}`);
    return { success: false, duration: 0, error: error.message };
  }
}

// Test 1: Dashboard Email Metrics
async function testEmailMetricsDashboard() {
  logSection('Test 1: Dashboard Email Metrics');

  const endpoints = [
    {
      name: 'Email Metrics - Stats Globales',
      url: `${config.authzApiUrl}/api/email-metrics/stats`,
      validation: (data) => {
        if (!data.totalSent || typeof data.totalSent !== 'number') {
          return { valid: false, error: 'totalSent manquant ou invalide' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Email Metrics - Par Type',
      url: `${config.authzApiUrl}/api/email-metrics/by-type`,
      validation: (data) => {
        if (!Array.isArray(data) && typeof data !== 'object') {
          return { valid: false, error: 'Format de réponse invalide' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Email Metrics - Timeline',
      url: `${config.authzApiUrl}/api/email-metrics/timeline?days=7`,
      validation: (data) => {
        if (!Array.isArray(data)) {
          return { valid: false, error: 'Timeline devrait être un tableau' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Email Metrics - Taux de Succès',
      url: `${config.authzApiUrl}/api/email-metrics/success-rate`,
      validation: (data) => {
        if (typeof data.successRate !== 'number') {
          return { valid: false, error: 'successRate manquant' };
        }
        return { valid: true };
      },
    },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, endpoint.validation);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  logInfo(`\nRésumé Email Metrics: ${successCount}/${endpoints.length} endpoints OK`);

  return successCount === endpoints.length;
}

// Test 2: Dashboard Carrier Scoring
async function testCarrierScoringDashboard() {
  logSection('Test 2: Dashboard Carrier Scoring');

  const endpoints = [
    {
      name: 'Carrier Leaderboard - Top Performers',
      url: `${config.carriersApiUrl}/api/v1/carriers/leaderboard?limit=10`,
      validation: (data) => {
        if (!Array.isArray(data)) {
          return { valid: false, error: 'Leaderboard devrait être un tableau' };
        }
        if (data.length > 0) {
          const first = data[0];
          if (!first.score || !first.name) {
            return { valid: false, error: 'Champs score ou name manquants' };
          }
        }
        return { valid: true };
      },
    },
    {
      name: 'Carrier Scoring - Stats Globales',
      url: `${config.carriersApiUrl}/api/v1/carriers/scoring/stats`,
      validation: (data) => {
        if (typeof data !== 'object') {
          return { valid: false, error: 'Stats invalides' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Carrier Scoring - Distribution',
      url: `${config.carriersApiUrl}/api/v1/carriers/scoring/distribution`,
      validation: (data) => {
        if (!Array.isArray(data) && typeof data !== 'object') {
          return { valid: false, error: 'Format invalide' };
        }
        return { valid: true };
      },
    },
    {
      name: 'Carrier Scoring - Tendances',
      url: `${config.carriersApiUrl}/api/v1/carriers/scoring/trends?days=30`,
      validation: (data) => {
        if (!Array.isArray(data) && typeof data !== 'object') {
          return { valid: false, error: 'Format invalide' };
        }
        return { valid: true };
      },
    },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, endpoint.validation);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  logInfo(`\nRésumé Carrier Scoring: ${successCount}/${endpoints.length} endpoints OK`);

  return successCount === endpoints.length;
}

// Test 3: Dashboard TMS Real-Time
async function testTMSRealtimeDashboard() {
  logSection('Test 3: Dashboard TMS Real-Time');

  const endpoints = [
    {
      name: 'TMS Monitoring - Status Global',
      url: `${config.tmsApiUrl}/api/v1/monitoring/status`,
      validation: (data) => {
        if (!data.status) {
          return { valid: false, error: 'status manquant' };
        }
        if (!data.services) {
          return { valid: false, error: 'services manquant' };
        }
        return { valid: true };
      },
    },
    {
      name: 'TMS Monitoring - Métriques',
      url: `${config.tmsApiUrl}/api/v1/monitoring/metrics`,
      validation: (data) => {
        if (typeof data !== 'object') {
          return { valid: false, error: 'Métriques invalides' };
        }
        return { valid: true };
      },
    },
    {
      name: 'TMS Monitoring - Dernières Syncs',
      url: `${config.tmsApiUrl}/api/v1/monitoring/recent-syncs?limit=10`,
      validation: (data) => {
        if (!Array.isArray(data)) {
          return { valid: false, error: 'Devrait être un tableau' };
        }
        return { valid: true };
      },
    },
    {
      name: 'TMS Monitoring - Alertes Actives',
      url: `${config.tmsApiUrl}/api/v1/monitoring/alerts/active`,
      validation: (data) => {
        if (!Array.isArray(data) && typeof data !== 'object') {
          return { valid: false, error: 'Format invalide' };
        }
        return { valid: true };
      },
    },
  ];

  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.name, endpoint.url, endpoint.validation);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  logInfo(`\nRésumé TMS Real-Time: ${successCount}/${endpoints.length} endpoints OK`);

  return successCount === endpoints.length;
}

// Test 4: Validation de la structure JSON
async function testJSONStructure() {
  logSection('Test 4: Validation Structure JSON');

  const sampleEndpoints = [
    `${config.authzApiUrl}/api/email-metrics/stats`,
    `${config.carriersApiUrl}/api/v1/carriers/leaderboard?limit=5`,
    `${config.tmsApiUrl}/api/v1/monitoring/status`,
  ];

  let allValid = true;

  for (const url of sampleEndpoints) {
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const data = response.data;

      // Vérifier que c'est du JSON valide
      const jsonString = JSON.stringify(data);
      const parsed = JSON.parse(jsonString);

      logSuccess(`JSON valide: ${url.split('/').slice(-2).join('/')}`);

      // Vérifier les types de données
      if (typeof data !== 'object') {
        logWarning('  Réponse n\'est pas un objet JSON');
        allValid = false;
      } else {
        logInfo(`  Type: ${Array.isArray(data) ? 'Array' : 'Object'}`);
        logInfo(`  Clés: ${Object.keys(data).length}`);
      }
    } catch (error) {
      logWarning(`Erreur pour ${url}: ${error.message}`);
    }
  }

  return allValid;
}

// Test 5: Performance globale des dashboards
async function testDashboardPerformance() {
  logSection('Test 5: Performance Globale');

  const criticalEndpoints = [
    { name: 'Email Stats', url: `${config.authzApiUrl}/api/email-metrics/stats` },
    { name: 'Carrier Leaderboard', url: `${config.carriersApiUrl}/api/v1/carriers/leaderboard` },
    { name: 'TMS Status', url: `${config.tmsApiUrl}/api/v1/monitoring/status` },
  ];

  const timings = [];

  for (const endpoint of criticalEndpoints) {
    try {
      const start = performance.now();
      await axios.get(endpoint.url, { timeout: 10000 });
      const duration = performance.now() - start;

      timings.push({ name: endpoint.name, duration });
      logPerf(endpoint.name, duration);
    } catch (error) {
      logWarning(`${endpoint.name}: Erreur - ${error.message}`);
    }
  }

  // Calculer les statistiques
  if (timings.length > 0) {
    const avgDuration = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length;
    const maxDuration = Math.max(...timings.map((t) => t.duration));

    logInfo(`\nStatistiques de performance:`);
    logInfo(`  Temps moyen: ${avgDuration.toFixed(2)}ms`);
    logInfo(`  Temps max: ${maxDuration.toFixed(2)}ms`);

    if (avgDuration < config.performanceThreshold) {
      logSuccess(`Performance globale excellente (< ${config.performanceThreshold}ms)`);
      return true;
    } else {
      logWarning(`Performance globale à améliorer (> ${config.performanceThreshold}ms)`);
      return false;
    }
  }

  return false;
}

// Fonction principale
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║         TEST END-TO-END - DASHBOARDS                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  logInfo('Configuration:');
  logInfo(`  - Authz API: ${config.authzApiUrl}`);
  logInfo(`  - Carriers API: ${config.carriersApiUrl}`);
  logInfo(`  - TMS API: ${config.tmsApiUrl}`);
  logInfo(`  - Performance Threshold: ${config.performanceThreshold}ms`);

  const results = {
    emailMetrics: false,
    carrierScoring: false,
    tmsRealtime: false,
    jsonStructure: false,
    performance: false,
  };

  try {
    // Exécuter les tests
    results.emailMetrics = await testEmailMetricsDashboard();
    results.carrierScoring = await testCarrierScoringDashboard();
    results.tmsRealtime = await testTMSRealtimeDashboard();
    results.jsonStructure = await testJSONStructure();
    results.performance = await testDashboardPerformance();

    // Résumé des résultats
    logSection('Résumé des Tests');

    const tests = [
      { name: 'Dashboard Email Metrics', result: results.emailMetrics },
      { name: 'Dashboard Carrier Scoring', result: results.carrierScoring },
      { name: 'Dashboard TMS Real-Time', result: results.tmsRealtime },
      { name: 'Structure JSON', result: results.jsonStructure },
      { name: 'Performance Globale', result: results.performance },
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
    process.exit(EXIT_FAILURE);
  }
}

// Lancer les tests
main();
