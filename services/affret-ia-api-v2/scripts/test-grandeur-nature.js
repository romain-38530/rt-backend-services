/**
 * TEST GRANDEUR NATURE - Vue d'ensemble complète du système Affret.IA
 *
 * Teste tous les composants de l'écosystème:
 * - API Affret.IA (health, 6 endpoints pricing)
 * - MongoDB (connexion, données)
 * - Dashdoc API (authentification, transports)
 * - Performance et uptime
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com';
const DASHDOC_API_URL = 'https://api.dashdoc.com/api/v4';
const DASHDOC_API_KEY = '8321c7a8f7fe8f75192fa15a6c883a11758e0084';

// Résultats globaux
const results = {
  startTime: new Date(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

// Fonction helper pour enregistrer un résultat de test
function recordTest(category, name, status, details = {}) {
  results.tests.push({
    category,
    name,
    status, // 'pass', 'fail', 'warning'
    details,
    timestamp: new Date()
  });

  results.summary.total++;
  if (status === 'pass') results.summary.passed++;
  else if (status === 'fail') results.summary.failed++;
  else if (status === 'warning') results.summary.warnings++;
}

// Fonction helper pour afficher une section
function printSection(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80) + '\n');
}

// Fonction helper pour afficher un résultat de test
function printResult(status, message, details = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${message}`);
  if (details) {
    console.log(`   ${details}`);
  }
}

// ============================================================================
// TEST 1: HEALTH CHECK & SYSTEM STATUS
// ============================================================================
async function testHealthCheck() {
  printSection('TEST 1: HEALTH CHECK & SYSTEM STATUS');

  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 10000 });

    if (response.status === 200 && response.data.success) {
      printResult('pass', 'API Health Check',
        `Version: ${response.data.version}, Status: ${response.data.status}, MongoDB: ${response.data.mongodb}`);

      recordTest('System', 'Health Check', 'pass', {
        version: response.data.version,
        status: response.data.status,
        mongodb: response.data.mongodb,
        uptime: response.data.uptime
      });

      // Vérifier l'uptime
      const uptimeHours = (response.data.uptime / 3600).toFixed(1);
      if (response.data.uptime > 86400) { // > 24h
        printResult('pass', `Uptime: ${uptimeHours}h (excellent)`, 'Système stable');
      } else if (response.data.uptime > 3600) { // > 1h
        printResult('pass', `Uptime: ${uptimeHours}h (bon)`, 'Système opérationnel');
      } else {
        printResult('warning', `Uptime: ${uptimeHours}h (récent)`, 'Système récemment redémarré');
      }

      // Vérifier MongoDB
      if (response.data.mongodb === 'connected') {
        printResult('pass', 'MongoDB connecté', 'Base de données opérationnelle');
        recordTest('Database', 'MongoDB Connection', 'pass');
      } else {
        printResult('fail', 'MongoDB déconnecté', 'Base de données inaccessible');
        recordTest('Database', 'MongoDB Connection', 'fail');
      }

    } else {
      printResult('fail', 'Health check failed', `Status: ${response.status}`);
      recordTest('System', 'Health Check', 'fail', { status: response.status });
    }

  } catch (error) {
    printResult('fail', 'Health check error', error.message);
    recordTest('System', 'Health Check', 'fail', { error: error.message });
  }
}

// ============================================================================
// TEST 2: ENDPOINTS PRICING (6 endpoints)
// ============================================================================
async function testPricingEndpoints() {
  printSection('TEST 2: ENDPOINTS PRICING (6/6)');

  // Test 1: price-history
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/price-history`, {
      route: { from: '75000', to: '69000' }
    }, { timeout: 10000 });

    if (response.status === 200 && response.data.success) {
      const count = response.data.transactionCount || 0;
      printResult('pass', 'POST /price-history',
        `${count} transaction(s) trouvée(s), Prix moyen: ${response.data.averagePrice || 0}€`);
      recordTest('API Endpoints', 'price-history', 'pass', {
        transactionCount: count,
        averagePrice: response.data.averagePrice
      });
    } else {
      printResult('fail', 'POST /price-history', 'Réponse incorrecte');
      recordTest('API Endpoints', 'price-history', 'fail');
    }
  } catch (error) {
    printResult('fail', 'POST /price-history', error.message);
    recordTest('API Endpoints', 'price-history', 'fail', { error: error.message });
  }

  // Test 2: preferred-subcontractors
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/affretia/preferred-subcontractors`, {
      params: { organizationId: 'test-org' },
      timeout: 10000
    });

    if (response.status === 200 && response.data.success !== false) {
      printResult('pass', 'GET /preferred-subcontractors',
        `${response.data.count || 0} transporteur(s) préféré(s)`);
      recordTest('API Endpoints', 'preferred-subcontractors', 'pass', {
        count: response.data.count || 0
      });
    } else {
      printResult('fail', 'GET /preferred-subcontractors', 'Réponse incorrecte');
      recordTest('API Endpoints', 'preferred-subcontractors', 'fail');
    }
  } catch (error) {
    printResult('fail', 'GET /preferred-subcontractors', error.message);
    recordTest('API Endpoints', 'preferred-subcontractors', 'fail', { error: error.message });
  }

  // Test 3: calculate-target-price
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/calculate-target-price`, {
      route: { from: '75000', to: '69000' }
    }, { timeout: 10000 });

    if (response.status === 200 && response.data.success) {
      const targetPrice = response.data.targetPrice || 0;
      const range = response.data.acceptableRange;
      printResult('pass', 'POST /calculate-target-price',
        `Prix cible: ${targetPrice}€, Range: ${range?.min || 0}-${range?.max || 0}€`);
      recordTest('API Endpoints', 'calculate-target-price', 'pass', {
        targetPrice,
        hasHistory: response.data.hasHistory
      });
    } else {
      printResult('fail', 'POST /calculate-target-price', 'Réponse incorrecte');
      recordTest('API Endpoints', 'calculate-target-price', 'fail');
    }
  } catch (error) {
    printResult('fail', 'POST /calculate-target-price', error.message);
    recordTest('API Endpoints', 'calculate-target-price', 'fail', { error: error.message });
  }

  // Test 4: search-carriers
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/search-carriers`, {
      route: { from: '75000', to: '69000' },
      requirements: { vehicleType: 'SEMI' }
    }, { timeout: 10000 });

    if (response.status === 200) {
      printResult('pass', 'POST /search-carriers', 'Recherche opérationnelle');
      recordTest('API Endpoints', 'search-carriers', 'pass');
    } else {
      printResult('fail', 'POST /search-carriers', 'Réponse incorrecte');
      recordTest('API Endpoints', 'search-carriers', 'fail');
    }
  } catch (error) {
    printResult('fail', 'POST /search-carriers', error.message);
    recordTest('API Endpoints', 'search-carriers', 'fail', { error: error.message });
  }

  // Test 5: record-price
  try {
    const testOrderId = `test-order-${Date.now()}`;
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/record-price`, {
      orderId: testOrderId,
      carrierId: 'test-carrier-grandeur-nature',
      carrierName: 'Test Carrier',
      route: {
        from: '75000',        // Code postal uniquement
        to: '69000',          // Code postal uniquement
        fromCity: 'Paris',    // Ville séparée
        toCity: 'Lyon'        // Ville séparée
      },
      proposedPrice: 480,
      price: 450,             // Prix final (requis par controller)
      finalPrice: 450,        // Aussi inclus pour le service
      marketAverage: 450,
      vehicleType: 'SEMI',
      organizationId: 'test-org-grandeur-nature'
    }, { timeout: 10000 });

    if (response.status === 200 && response.data.success) {
      printResult('pass', 'POST /record-price',
        `Prix enregistré: ${response.data.price}€, ID: ${response.data.priceId}`);
      recordTest('API Endpoints', 'record-price', 'pass', {
        priceId: response.data.priceId,
        price: response.data.price
      });
    } else {
      printResult('fail', 'POST /record-price', 'Enregistrement échoué');
      recordTest('API Endpoints', 'record-price', 'fail');
    }
  } catch (error) {
    printResult('fail', 'POST /record-price', error.message);
    recordTest('API Endpoints', 'record-price', 'fail', { error: error.message });
  }

  // Test 6: import/dashdoc
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/import/dashdoc`, {
      organizationId: 'test-org',
      months: 1,
      dryRun: true
    }, { timeout: 10000 });

    if (response.status === 200 && response.data.success) {
      printResult('pass', 'POST /import/dashdoc',
        `Import OK: ${response.data.imported || 0} transports`);
      recordTest('API Endpoints', 'import/dashdoc', 'pass', {
        imported: response.data.imported
      });
    } else {
      printResult('fail', 'POST /import/dashdoc',
        response.data.error || 'Import échoué');
      recordTest('API Endpoints', 'import/dashdoc', 'fail', {
        error: response.data.error
      });
    }
  } catch (error) {
    if (error.response?.data?.error?.includes('401')) {
      printResult('fail', 'POST /import/dashdoc',
        'Erreur 401: Clé API Dashdoc invalide');
      recordTest('API Endpoints', 'import/dashdoc', 'fail', {
        error: 'Dashdoc API key invalid'
      });
    } else {
      printResult('fail', 'POST /import/dashdoc', error.message);
      recordTest('API Endpoints', 'import/dashdoc', 'fail', { error: error.message });
    }
  }
}

// ============================================================================
// TEST 3: DASHDOC API (External)
// ============================================================================
async function testDashdocAPI() {
  printSection('TEST 3: DASHDOC API (INTEGRATION EXTERNE)');

  console.log(`Clé API: ${DASHDOC_API_KEY.substring(0, 20)}...`);
  console.log(`URL: ${DASHDOC_API_URL}`);
  console.log();

  // Test avec Bearer token
  try {
    const response = await axios.get(`${DASHDOC_API_URL}/transports/`, {
      headers: {
        'Authorization': `Bearer ${DASHDOC_API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        page_size: 1,
        ordering: '-created'
      },
      timeout: 10000
    });

    if (response.status === 200) {
      printResult('pass', 'Dashdoc API authentification',
        `${response.data.count || 0} transports disponibles`);
      recordTest('External API', 'Dashdoc Authentication', 'pass', {
        transportCount: response.data.count
      });

      // Test transports sous-traités
      const response2 = await axios.get(`${DASHDOC_API_URL}/transports/`, {
        headers: {
          'Authorization': `Bearer ${DASHDOC_API_KEY}`,
          'Content-Type': 'application/json'
        },
        params: {
          status: 'done',
          is_subcontracted: true,
          page_size: 1
        },
        timeout: 10000
      });

      printResult('pass', 'Dashdoc transports sous-traités',
        `${response2.data.count || 0} transports sous-traités`);
      recordTest('External API', 'Dashdoc Subcontracted Transports', 'pass', {
        count: response2.data.count
      });

    } else {
      printResult('fail', 'Dashdoc API authentification',
        `HTTP ${response.status}`);
      recordTest('External API', 'Dashdoc Authentication', 'fail', {
        status: response.status
      });
    }

  } catch (error) {
    if (error.response?.status === 401) {
      printResult('fail', 'Dashdoc API authentification',
        'Erreur 401: Clé API invalide ou expirée');
      recordTest('External API', 'Dashdoc Authentication', 'fail', {
        error: 'API key invalid (401)'
      });
    } else {
      printResult('fail', 'Dashdoc API authentification', error.message);
      recordTest('External API', 'Dashdoc Authentication', 'fail', {
        error: error.message
      });
    }
  }
}

// ============================================================================
// TEST 4: PERFORMANCE & DATA QUALITY
// ============================================================================
async function testPerformanceAndQuality() {
  printSection('TEST 4: PERFORMANCE & QUALITÉ DES DONNÉES');

  // Test temps de réponse price-history
  try {
    const startTime = Date.now();
    await axios.post(`${BASE_URL}/api/v1/affretia/price-history`, {
      route: { from: '75000', to: '69000' }
    }, { timeout: 10000 });
    const responseTime = Date.now() - startTime;

    if (responseTime < 500) {
      printResult('pass', 'Temps de réponse price-history',
        `${responseTime}ms (excellent)`);
      recordTest('Performance', 'Response Time', 'pass', { responseTime });
    } else if (responseTime < 2000) {
      printResult('warning', 'Temps de réponse price-history',
        `${responseTime}ms (acceptable)`);
      recordTest('Performance', 'Response Time', 'warning', { responseTime });
    } else {
      printResult('fail', 'Temps de réponse price-history',
        `${responseTime}ms (trop lent)`);
      recordTest('Performance', 'Response Time', 'fail', { responseTime });
    }
  } catch (error) {
    printResult('fail', 'Temps de réponse', error.message);
    recordTest('Performance', 'Response Time', 'fail', { error: error.message });
  }

  // Test qualité des données (vérifier un prix enregistré)
  try {
    const response = await axios.post(`${BASE_URL}/api/v1/affretia/price-history`, {
      route: { from: '75000', to: '69000' }
    }, { timeout: 10000 });

    if (response.data.history && response.data.history.length > 0) {
      const firstRecord = response.data.history[0];

      // Vérifier la structure des données
      const hasRequiredFields =
        firstRecord.orderId &&
        firstRecord.carrierId &&
        firstRecord.price?.final &&
        firstRecord.route?.from?.postalCode &&
        firstRecord.route?.to?.postalCode;

      if (hasRequiredFields) {
        printResult('pass', 'Qualité des données',
          'Structure complète et valide');
        recordTest('Data Quality', 'Data Structure', 'pass');

        // Vérifier si importé depuis Dashdoc
        if (firstRecord.dashdocImport?.imported) {
          if (firstRecord.dashdocImport.priceSource?.includes('charter') ||
              firstRecord.dashdocImport.priceSource?.includes('subcontracting')) {
            printResult('pass', 'Prix sous-traitant correct',
              `Source: ${firstRecord.dashdocImport.priceSource}`);
            recordTest('Data Quality', 'Subcontractor Pricing', 'pass', {
              source: firstRecord.dashdocImport.priceSource
            });
          } else if (firstRecord.dashdocImport.priceSource?.includes('invoicing_amount')) {
            printResult('warning', 'Prix client utilisé',
              'Attention: prix CLIENT au lieu de prix SOUS-TRAITANT');
            recordTest('Data Quality', 'Subcontractor Pricing', 'warning', {
              source: firstRecord.dashdocImport.priceSource
            });
          }
        }

      } else {
        printResult('warning', 'Qualité des données',
          'Certains champs manquants');
        recordTest('Data Quality', 'Data Structure', 'warning');
      }
    } else {
      printResult('warning', 'Qualité des données',
        'Aucune donnée historique pour analyse');
      recordTest('Data Quality', 'Data Structure', 'warning');
    }

  } catch (error) {
    printResult('fail', 'Qualité des données', error.message);
    recordTest('Data Quality', 'Data Structure', 'fail', { error: error.message });
  }
}

// ============================================================================
// RAPPORT FINAL
// ============================================================================
function printFinalReport() {
  printSection('RAPPORT FINAL - VUE D\'ENSEMBLE GRANDEUR NATURE');

  const duration = ((new Date() - results.startTime) / 1000).toFixed(1);

  console.log('📊 RÉSUMÉ:');
  console.log();
  console.log(`   Total tests: ${results.summary.total}`);
  console.log(`   ✅ Réussis: ${results.summary.passed} (${(results.summary.passed / results.summary.total * 100).toFixed(0)}%)`);
  console.log(`   ❌ Échoués: ${results.summary.failed} (${(results.summary.failed / results.summary.total * 100).toFixed(0)}%)`);
  console.log(`   ⚠️  Avertissements: ${results.summary.warnings}`);
  console.log(`   ⏱️  Durée: ${duration}s`);
  console.log();

  // Statut par catégorie
  console.log('📋 STATUT PAR CATÉGORIE:');
  console.log();

  const categories = {};
  results.tests.forEach(test => {
    if (!categories[test.category]) {
      categories[test.category] = { pass: 0, fail: 0, warning: 0, total: 0 };
    }
    categories[test.category][test.status]++;
    categories[test.category].total++;
  });

  Object.keys(categories).forEach(category => {
    const stats = categories[category];
    const passRate = (stats.pass / stats.total * 100).toFixed(0);
    const icon = stats.fail === 0 ? '✅' : stats.fail < stats.pass ? '⚠️' : '❌';

    console.log(`   ${icon} ${category}: ${stats.pass}/${stats.total} OK (${passRate}%)`);
    if (stats.fail > 0) console.log(`      - ${stats.fail} échec(s)`);
    if (stats.warning > 0) console.log(`      - ${stats.warning} avertissement(s)`);
  });

  console.log();

  // Problèmes critiques
  const criticalIssues = results.tests.filter(t => t.status === 'fail');
  if (criticalIssues.length > 0) {
    console.log('🚨 PROBLÈMES CRITIQUES:');
    console.log();
    criticalIssues.forEach((issue, index) => {
      console.log(`   ${index + 1}. [${issue.category}] ${issue.name}`);
      if (issue.details.error) {
        console.log(`      Erreur: ${issue.details.error}`);
      }
    });
    console.log();
  }

  // Recommandations
  console.log('💡 RECOMMANDATIONS:');
  console.log();

  const dashdocFailed = results.tests.find(t =>
    t.category === 'External API' && t.name === 'Dashdoc Authentication' && t.status === 'fail'
  );

  if (dashdocFailed) {
    console.log('   1. ⚠️  Régénérer la clé API Dashdoc');
    console.log('      Action: Suivre le guide README-NOUVELLE-TENTATIVE.md');
    console.log('      Durée: 10 minutes');
    console.log();
  }

  if (results.summary.passed === results.summary.total) {
    console.log('   ✅ Tous les tests sont au vert ! Système opérationnel.');
  } else if (results.summary.passed >= results.summary.total * 0.8) {
    console.log('   ⚠️  Système majoritairement fonctionnel avec quelques points à corriger.');
  } else {
    console.log('   ❌ Plusieurs composants nécessitent une attention immédiate.');
  }

  console.log();
  console.log('='.repeat(80));
  console.log();

  // Sauvegarder le rapport JSON
  const reportPath = `./test-results-${Date.now()}.json`;
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Rapport JSON sauvegardé: ${reportPath}`);
  console.log();
}

// ============================================================================
// EXÉCUTION PRINCIPALE
// ============================================================================
async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('  🚀 TEST GRANDEUR NATURE - AFFRET.IA v2.7.0');
  console.log('  Vue d\'ensemble complète de l\'écosystème');
  console.log('='.repeat(80));
  console.log();
  console.log(`Démarrage: ${results.startTime.toLocaleString()}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log();

  try {
    await testHealthCheck();
    await testPricingEndpoints();
    await testDashdocAPI();
    await testPerformanceAndQuality();

    printFinalReport();

    // Code de sortie basé sur le résultat
    if (results.summary.failed === 0) {
      process.exit(0); // Succès
    } else if (results.summary.failed <= 2) {
      process.exit(1); // Quelques échecs
    } else {
      process.exit(2); // Plusieurs échecs
    }

  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error);
    process.exit(3);
  }
}

// Exécution
runAllTests();
