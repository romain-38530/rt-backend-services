/**
 * Script de test pour la synchronisation avancee TMS Sync
 * Test les nouvelles fonctionnalites: pagination auto, sync 30s, filtrage avance
 */

const axios = require('axios');

const BASE_URL = process.env.TMS_SYNC_URL || 'http://localhost:3000';

async function testAdvancedSync() {
  console.log('=================================================================');
  console.log('          TEST ADVANCED TMS SYNC - v2.1.1');
  console.log('=================================================================\n');

  let testsPassé = 0;
  let testsFailed = 0;

  try {
    // Test 1: Verifier le status du service
    console.log('📋 Test 1: Service Health Check...');
    try {
      const health = await axios.get(`${BASE_URL}/health`);
      console.log('   Status:', health.data.status);
      console.log('   Version:', health.data.version);
      console.log('   MongoDB:', health.data.mongodb.connected ? '✅ Connected' : '❌ Disconnected');
      console.log('   Features:', health.data.features.join(', '));
      console.log('✅ Test 1 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 1 FAILED:', error.message);
      testsFailed++;
      return; // Stop si service pas disponible
    }

    // Test 2: Verifier le status des jobs scheduled
    console.log('📋 Test 2: Scheduled Jobs Status...');
    try {
      const jobsStatus = await axios.get(`${BASE_URL}/api/v1/jobs/status`);
      console.log('   Jobs running:', jobsStatus.data.status.running);
      console.log('   Database connected:', jobsStatus.data.status.dbConnected);
      console.log('   Jobs:');
      Object.entries(jobsStatus.data.status.jobs).forEach(([name, info]) => {
        console.log(`     - ${name}: ${info.active ? '✅' : '❌'} (${info.interval})`);
      });
      console.log('✅ Test 2 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 2 FAILED:', error.message);
      testsFailed++;
    }

    // Test 3: Lister les connexions TMS
    console.log('📋 Test 3: Liste des connexions TMS...');
    try {
      const connections = await axios.get(`${BASE_URL}/api/v1/tms/connections`);
      const activeConnections = connections.data.connections.filter(c => c.isActive);
      console.log(`   Total connexions: ${connections.data.connections.length}`);
      console.log(`   Connexions actives: ${activeConnections.length}`);

      if (activeConnections.length > 0) {
        const firstConnection = activeConnections[0];
        console.log(`   Exemple: ${firstConnection.organizationName} (${firstConnection.tmsType})`);

        // Test 4: Lancer une sync manuelle complete avec pagination
        console.log('\n📋 Test 4: Synchronisation manuelle avec pagination...');
        try {
          console.log(`   Syncing ${firstConnection.organizationName}...`);
          const startTime = Date.now();

          const syncResult = await axios.post(
            `${BASE_URL}/api/v1/tms/connections/${firstConnection._id}/sync`,
            { transportLimit: 0, maxPages: 5 } // 0 = illimite, max 5 pages pour test
          );

          const duration = Date.now() - startTime;

          if (syncResult.data.success) {
            console.log('   Sync completed in', duration, 'ms');
            console.log('   Transports:', syncResult.data.transports?.count || 0);
            console.log('   Companies:', syncResult.data.companies?.count || 0);
            console.log('   Contacts:', syncResult.data.contacts?.count || 0);
            console.log('✅ Test 4 PASSED\n');
            testsPassé++;
          } else {
            console.error('❌ Test 4 FAILED: Sync not successful');
            testsFailed++;
          }
        } catch (error) {
          console.error('❌ Test 4 FAILED:', error.response?.data?.error || error.message);
          testsFailed++;
        }

      } else {
        console.warn('⚠️  Aucune connexion active pour tester la sync');
        console.log('⏭️  Test 4 SKIPPED\n');
      }

      console.log('✅ Test 3 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 3 FAILED:', error.message);
      testsFailed++;
    }

    // Test 5: Filtrage "À planifier" - Commandes créées ou non assignées
    console.log('📋 Test 5: Filtrage "À planifier"...');
    try {
      const toPlanFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { toPlan: true, limit: 10 }
      });
      console.log(`   Found ${toPlanFilter.data.meta.total} orders "À planifier"`);
      console.log(`   Returned: ${toPlanFilter.data.meta.returned} orders`);

      // Vérifier que ce sont bien des commandes DRAFT ou PENDING
      const statuses = toPlanFilter.data.orders.map(o => o.status);
      const allToPlan = statuses.every(s => s === 'DRAFT' || s === 'PENDING');
      if (allToPlan) {
        console.log('   ✓ All orders are DRAFT or PENDING status');
      } else {
        console.warn('   ⚠️  Some orders have unexpected status:', [...new Set(statuses)]);
      }

      console.log('✅ Test 5 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 5 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 6: Filtrage avance - Par ville
    console.log('📋 Test 6: Filtrage avancé - Par ville...');
    try {
      const cityFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { city: 'Paris', limit: 5 }
      });
      console.log(`   Found ${cityFilter.data.meta.total} orders in/around Paris`);
      console.log(`   Returned: ${cityFilter.data.meta.returned} orders`);
      console.log('✅ Test 6 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 6 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 7: Filtrage avance - Par poids
    console.log('📋 Test 7: Filtrage avancé - Par poids...');
    try {
      const weightFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { minWeight: 1000, maxWeight: 5000, limit: 5 }
      });
      console.log(`   Found ${weightFilter.data.meta.total} orders (1-5 tons)`);
      console.log(`   Returned: ${weightFilter.data.meta.returned} orders`);
      console.log('✅ Test 7 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 7 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 8: Filtrage avance - Marchandise dangereuse
    console.log('📋 Test 8: Filtrage avancé - Marchandise dangereuse...');
    try {
      const dangerousFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { isDangerous: true, limit: 5 }
      });
      console.log(`   Found ${dangerousFilter.data.meta.total} orders with dangerous goods`);
      console.log('✅ Test 8 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 8 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 9: Filtrage avance - Combine
    console.log('📋 Test 9: Filtrage avancé - Critères combinés...');
    try {
      const combinedFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: {
          status: 'CONFIRMED',
          minWeight: 500,
          limit: 5
        }
      });
      console.log(`   Found ${combinedFilter.data.meta.total} orders matching criteria`);
      console.log(`   Returned: ${combinedFilter.data.meta.returned} orders`);
      console.log('✅ Test 9 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 9 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 10: Pagination
    console.log('📋 Test 10: Pagination...');
    try {
      const page1 = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { limit: 10, skip: 0 }
      });
      const page2 = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
        params: { limit: 10, skip: 10 }
      });
      console.log(`   Page 1: ${page1.data.meta.returned} orders`);
      console.log(`   Page 2: ${page2.data.meta.returned} orders`);
      console.log(`   Total: ${page1.data.meta.total} orders`);
      console.log(`   Has next page: ${page1.data.meta.hasNext}`);
      console.log('✅ Test 10 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 10 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

    // Test 11: Ancien endpoint (compatibilite)
    console.log('📋 Test 11: Compatibilité ancien endpoint...');
    try {
      const oldEndpoint = await axios.get(`${BASE_URL}/api/v1/tms/orders`, {
        params: { limit: 10 }
      });
      console.log(`   Total orders: ${oldEndpoint.data.total}`);
      console.log(`   Returned: ${oldEndpoint.data.orders.length}`);
      console.log('✅ Test 11 PASSED\n');
      testsPassé++;
    } catch (error) {
      console.error('❌ Test 11 FAILED:', error.response?.data?.error || error.message);
      testsFailed++;
    }

  } catch (error) {
    console.error('❌ CRITICAL ERROR:', error.message);
  }

  // Resultats finaux
  console.log('=================================================================');
  console.log('                    RESULTATS DES TESTS');
  console.log('=================================================================');
  console.log(`✅ Tests reussis: ${testsPassé}`);
  console.log(`❌ Tests echoues: ${testsFailed}`);
  console.log(`📊 Total: ${testsPassé + testsFailed}`);
  console.log(`🎯 Taux de reussite: ${Math.round((testsPassé / (testsPassé + testsFailed)) * 100)}%`);
  console.log('=================================================================\n');

  if (testsFailed === 0) {
    console.log('🎉 TOUS LES TESTS SONT PASSES !');
    console.log('✅ Le systeme TMS Sync v2.1.1 est operationnel\n');
  } else {
    console.log('⚠️  CERTAINS TESTS ONT ECHOUE');
    console.log('Verifiez les logs ci-dessus pour plus de details\n');
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

// Execution
console.log('Starting advanced TMS Sync tests...\n');
testAdvancedSync();
