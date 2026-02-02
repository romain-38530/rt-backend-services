/**
 * Test Script for Affret.IA Analytics Endpoints
 * Tests the conversion funnel, blockers, timeline, and journey endpoints
 */

const axios = require('axios');
const { MongoClient } = require('mongodb');

const API_URL = process.env.AFFRET_IA_API_URL || 'http://localhost:3017';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia';

// Color codes for console output
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

async function seedTestData(db) {
  log('\n========== Seeding Test Data ==========', 'blue');

  const testData = [
    {
      carrierId: 'test-carrier-1',
      carrierEmail: 'test1@example.com',
      companyName: 'Test Carrier 1',
      step: 'trial_start',
      createdAt: new Date('2026-01-15T10:00:00Z'),
      metadata: {},
      blocker: { blocked: false }
    },
    {
      carrierId: 'test-carrier-1',
      carrierEmail: 'test1@example.com',
      companyName: 'Test Carrier 1',
      step: 'document_upload',
      createdAt: new Date('2026-01-16T10:00:00Z'),
      metadata: { documentType: 'kbis', documentStatus: 'pending' },
      blocker: { blocked: false }
    },
    {
      carrierId: 'test-carrier-1',
      carrierEmail: 'test1@example.com',
      companyName: 'Test Carrier 1',
      step: 'info_complete',
      createdAt: new Date('2026-01-17T10:00:00Z'),
      metadata: { completionRate: 100 },
      blocker: { blocked: false }
    },
    {
      carrierId: 'test-carrier-2',
      carrierEmail: 'test2@example.com',
      companyName: 'Test Carrier 2',
      step: 'trial_start',
      createdAt: new Date('2026-01-20T10:00:00Z'),
      metadata: {},
      blocker: { blocked: false }
    },
    {
      carrierId: 'test-carrier-2',
      carrierEmail: 'test2@example.com',
      companyName: 'Test Carrier 2',
      step: 'document_upload',
      createdAt: new Date('2026-01-21T10:00:00Z'),
      metadata: { documentType: 'insurance', documentStatus: 'rejected' },
      blocker: {
        blocked: true,
        type: 'invalid_documents',
        reason: 'Document rejected',
        resolved: false
      }
    }
  ];

  try {
    await db.collection('affretia_trial_tracking').deleteMany({
      carrierId: { $in: ['test-carrier-1', 'test-carrier-2'] }
    });

    await db.collection('affretia_trial_tracking').insertMany(testData);
    log(`SUCCESS: Seeded ${testData.length} test records`, 'green');
    return true;
  } catch (error) {
    log(`ERROR: Failed to seed data - ${error.message}`, 'red');
    return false;
  }
}

async function testConversionFunnel() {
  log('\n========== TEST 1: Conversion Funnel ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/affretia/analytics/conversion`, {
      params: {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    });

    if (response.data.success) {
      const funnel = response.data.data;
      log('SUCCESS: Retrieved conversion funnel', 'green');
      log(`  Total Trackings: ${funnel.total}`, 'reset');
      log('\n  Funnel Steps:', 'yellow');
      log(`    1. Trial Start: ${funnel.steps.step1_start}`, 'reset');
      log(`    2. Document Upload: ${funnel.steps.step2_doc_upload} (${funnel.rates?.start_to_doc || 0}%)`, 'reset');
      log(`    3. Info Complete: ${funnel.steps.step3_info_complete} (${funnel.rates?.doc_to_info || 0}%)`, 'reset');
      log(`    4. TMS Connect: ${funnel.steps.step4_tms_connect} (${funnel.rates?.info_to_tms || 0}%)`, 'reset');
      log(`    5. First Affret: ${funnel.steps.step5_first_affret} (${funnel.rates?.tms_to_affret || 0}%)`, 'reset');
      log(`    6. Conversion: ${funnel.steps.step6_conversion} (${funnel.rates?.affret_to_conversion || 0}%)`, 'reset');
      log(`\n  Overall Conversion Rate: ${funnel.rates?.overall || 0}%`, funnel.rates?.overall > 50 ? 'green' : 'red');

      return true;
    } else {
      log(`FAILED: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    if (error.response) {
      log(`  Status: ${error.response.status}`, 'red');
      log(`  Data: ${JSON.stringify(error.response.data)}`, 'red');
    }
    return false;
  }
}

async function testBlockers() {
  log('\n========== TEST 2: Blockers Analysis ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/affretia/analytics/blockers`, {
      params: {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    });

    if (response.data.success) {
      const blockers = response.data.data;
      log('SUCCESS: Retrieved blockers analysis', 'green');
      log(`  Total Blockers: ${blockers.total}`, 'reset');
      log(`  Resolved: ${blockers.resolved}`, 'green');
      log(`  Pending: ${blockers.pending}`, blockers.pending > 0 ? 'red' : 'green');

      if (blockers.topBlockers.length > 0) {
        log('\n  Top Blockers:', 'yellow');
        blockers.topBlockers.slice(0, 5).forEach((blocker, index) => {
          log(`    ${index + 1}. ${blocker.type}: ${blocker.count}`, 'reset');
        });
      }

      if (Object.keys(blockers.byStep).length > 0) {
        log('\n  Blockers by Step:', 'yellow');
        Object.entries(blockers.byStep).forEach(([step, count]) => {
          log(`    ${step}: ${count}`, 'reset');
        });
      }

      return true;
    } else {
      log(`FAILED: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testTimeline() {
  log('\n========== TEST 3: Timeline Analysis ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/affretia/analytics/timeline`, {
      params: {
        startDate: '2026-01-01',
        endDate: '2026-01-31'
      }
    });

    if (response.data.success) {
      const timeline = response.data.data;
      const dates = Object.keys(timeline);
      log('SUCCESS: Retrieved timeline', 'green');
      log(`  Days with Activity: ${dates.length}`, 'reset');

      if (dates.length > 0) {
        log('\n  Recent Activity:', 'yellow');
        dates.slice(0, 5).forEach(date => {
          const steps = Object.entries(timeline[date]);
          log(`    ${date}:`, 'reset');
          steps.forEach(([step, count]) => {
            log(`      ${step}: ${count}`, 'reset');
          });
        });
      } else {
        log('  No timeline data available', 'yellow');
      }

      return true;
    } else {
      log(`FAILED: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testCarrierJourney(carrierId) {
  log('\n========== TEST 4: Carrier Journey ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/affretia/analytics/carriers/${carrierId}/journey`);

    if (response.data.success) {
      const journey = response.data.data;
      log(`SUCCESS: Retrieved journey for carrier ${carrierId}`, 'green');
      log(`  Company: ${journey.metrics?.companyName || 'N/A'}`, 'reset');
      log(`  Total Steps: ${journey.metrics?.totalSteps || 0}`, 'reset');
      log(`  Current Step: ${journey.metrics?.currentStep || 'N/A'}`, 'reset');
      log(`  Duration: ${journey.metrics?.durationDays || 0} days`, 'reset');
      log(`  Has Blockers: ${journey.metrics?.hasBlockers ? 'Yes' : 'No'}`,
          journey.metrics?.hasBlockers ? 'red' : 'green');
      log(`  Completed: ${journey.metrics?.completed ? 'Yes' : 'No'}`,
          journey.metrics?.completed ? 'green' : 'yellow');

      if (journey.timeline && journey.timeline.length > 0) {
        log('\n  Journey Timeline:', 'yellow');
        journey.timeline.forEach((event, index) => {
          const date = new Date(event.timestamp).toLocaleDateString('fr-FR');
          const blocker = event.blocker?.blocked ? ' [BLOCKED]' : '';
          log(`    ${index + 1}. ${event.step} - ${date}${blocker}`,
              event.blocker?.blocked ? 'red' : 'reset');
        });
      }

      return true;
    } else {
      log(`FAILED: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    if (error.response?.status === 404) {
      log('  No journey found for this carrier', 'yellow');
    }
    return false;
  }
}

async function runAllTests() {
  log('========================================', 'blue');
  log('  AFFRET.IA ANALYTICS TESTS', 'blue');
  log('========================================', 'blue');
  log(`API URL: ${API_URL}`, 'reset');
  log(`MongoDB URI: ${MONGODB_URI}`, 'reset');

  const results = {
    passed: 0,
    failed: 0
  };

  // Connect to MongoDB
  let client;
  let db;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    log('\nConnected to MongoDB', 'green');
  } catch (error) {
    log(`\nERROR: Failed to connect to MongoDB - ${error.message}`, 'red');
    process.exit(1);
  }

  // Seed test data
  const seeded = await seedTestData(db);
  if (!seeded) {
    log('\nWARNING: Failed to seed test data, tests may fail', 'yellow');
  }

  // Test 1: Conversion Funnel
  const test1 = await testConversionFunnel();
  test1 ? results.passed++ : results.failed++;

  // Test 2: Blockers
  const test2 = await testBlockers();
  test2 ? results.passed++ : results.failed++;

  // Test 3: Timeline
  const test3 = await testTimeline();
  test3 ? results.passed++ : results.failed++;

  // Test 4: Carrier Journey
  const test4 = await testCarrierJourney('test-carrier-1');
  test4 ? results.passed++ : results.failed++;

  // Cleanup
  try {
    await db.collection('affretia_trial_tracking').deleteMany({
      carrierId: { $in: ['test-carrier-1', 'test-carrier-2'] }
    });
    log('\nTest data cleaned up', 'green');
  } catch (error) {
    log(`\nWARNING: Failed to cleanup test data - ${error.message}`, 'yellow');
  }

  await client.close();

  // Summary
  log('\n========================================', 'blue');
  log('  TEST SUMMARY', 'blue');
  log('========================================', 'blue');
  log(`Total Passed: ${results.passed}`, 'green');
  log(`Total Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`,
      results.failed === 0 ? 'green' : 'yellow');
  log('========================================\n', 'blue');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
