/**
 * Test Script for Carrier Scoring Endpoints
 * Tests the leaderboard, score, and benchmark endpoints
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SCORING_API_URL = process.env.SCORING_API_URL || 'http://localhost:3016';

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

async function testLeaderboard() {
  log('\n========== TEST 1: Leaderboard ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/carriers/leaderboard`, {
      params: {
        limit: 10,
        minTransports: 1
      }
    });

    if (response.data.success) {
      log(`SUCCESS: Retrieved ${response.data.count} carriers`, 'green');

      if (response.data.data.length > 0) {
        log('\nTop 3 carriers:', 'yellow');
        response.data.data.slice(0, 3).forEach((carrier, index) => {
          log(`  ${index + 1}. ${carrier.company || carrier.carrierName} - Score: ${carrier.averageScores?.overall || 0}/100`, 'reset');
        });
      } else {
        log('WARNING: No carriers found in leaderboard', 'yellow');
      }

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

async function testCarrierScore(carrierId) {
  log('\n========== TEST 2: Carrier Score ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/carriers/${carrierId}/score`);

    if (response.data.success) {
      const score = response.data.data;
      log(`SUCCESS: Retrieved score for carrier ${carrierId}`, 'green');
      log(`  Overall Score: ${score.averageScores?.overall || 0}/100`, 'reset');
      log(`  Rank: ${score.rank || 'N/A'}`, 'reset');
      log(`  Total Scored: ${score.stats?.totalScored || 0}`, 'reset');
      log(`  Trend: ${score.trend?.direction || 'stable'} (${score.trend?.change || 0} pts)`, 'reset');

      return true;
    } else {
      log(`FAILED: ${response.data.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    if (error.response?.status === 404) {
      log('  No score found for this carrier (expected if carrier has no transports)', 'yellow');
    }
    return false;
  }
}

async function testScoreHistory(carrierId) {
  log('\n========== TEST 3: Score History ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/carriers/${carrierId}/score-history`, {
      params: {
        limit: 10
      }
    });

    if (response.data.success) {
      log(`SUCCESS: Retrieved ${response.data.count} historical scores`, 'green');

      if (response.data.data.length > 0) {
        log('\nRecent scores:', 'yellow');
        response.data.data.slice(0, 3).forEach((score, index) => {
          const date = new Date(score.scoredAt).toLocaleDateString('fr-FR');
          log(`  ${date} - Order ${score.orderId} - Score: ${score.finalScore}/100`, 'reset');
        });
      } else {
        log('WARNING: No score history found', 'yellow');
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

async function testBenchmark(carrierId) {
  log('\n========== TEST 4: Benchmark ==========', 'blue');

  try {
    const response = await axios.get(`${API_URL}/api/v1/carriers/${carrierId}/benchmark`);

    if (response.data.success) {
      const benchmark = response.data.data;
      log(`SUCCESS: Retrieved benchmark for carrier ${carrierId}`, 'green');
      log(`  Your Rank: ${benchmark.rank} / ${benchmark.totalCarriers}`, 'reset');
      log(`  Percentile: Top ${benchmark.percentile}%`, 'reset');
      log(`  Overall vs Market: ${benchmark.comparison?.overall > 0 ? '+' : ''}${benchmark.comparison?.overall || 0}`,
          benchmark.comparison?.overall > 0 ? 'green' : benchmark.comparison?.overall < 0 ? 'red' : 'reset');

      log('\n  Criteria Comparison:', 'yellow');
      const criteria = [
        'punctualityPickup',
        'punctualityDelivery',
        'appointmentRespect',
        'trackingReactivity',
        'podDelay',
        'incidentsManaged',
        'delaysJustified'
      ];

      criteria.forEach(c => {
        const diff = benchmark.comparison?.[c] || 0;
        const color = diff > 0 ? 'green' : diff < 0 ? 'red' : 'reset';
        log(`    ${c}: ${diff > 0 ? '+' : ''}${diff}`, color);
      });

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

async function testFilters() {
  log('\n========== TEST 5: Leaderboard Filters ==========', 'blue');

  const filters = [
    { level: 'gold', description: 'Filter by level: gold' },
    { status: 'active', description: 'Filter by status: active' },
    { limit: 5, description: 'Limit to 5 carriers' }
  ];

  let allPassed = true;

  for (const filter of filters) {
    try {
      const response = await axios.get(`${API_URL}/api/v1/carriers/leaderboard`, { params: filter });

      if (response.data.success) {
        log(`  SUCCESS: ${filter.description} - Found ${response.data.count} carriers`, 'green');
      } else {
        log(`  FAILED: ${filter.description}`, 'red');
        allPassed = false;
      }
    } catch (error) {
      log(`  ERROR: ${filter.description} - ${error.message}`, 'red');
      allPassed = false;
    }
  }

  return allPassed;
}

async function runAllTests() {
  log('========================================', 'blue');
  log('  CARRIER SCORING TESTS', 'blue');
  log('========================================', 'blue');
  log(`API URL: ${API_URL}`, 'reset');
  log(`Scoring API URL: ${SCORING_API_URL}`, 'reset');

  const results = {
    passed: 0,
    failed: 0
  };

  // Test 1: Leaderboard
  const test1 = await testLeaderboard();
  test1 ? results.passed++ : results.failed++;

  // Get first carrier ID for subsequent tests
  let testCarrierId = null;
  try {
    const leaderboard = await axios.get(`${API_URL}/api/v1/carriers/leaderboard`, { params: { limit: 1 } });
    if (leaderboard.data.data.length > 0) {
      testCarrierId = leaderboard.data.data[0].carrierId;
      log(`\nUsing carrier ${testCarrierId} for subsequent tests`, 'yellow');
    }
  } catch (error) {
    log('\nWARNING: Could not get test carrier ID, skipping carrier-specific tests', 'yellow');
  }

  // Test 2: Carrier Score
  if (testCarrierId) {
    const test2 = await testCarrierScore(testCarrierId);
    test2 ? results.passed++ : results.failed++;

    // Test 3: Score History
    const test3 = await testScoreHistory(testCarrierId);
    test3 ? results.passed++ : results.failed++;

    // Test 4: Benchmark
    const test4 = await testBenchmark(testCarrierId);
    test4 ? results.passed++ : results.failed++;
  } else {
    log('\nSKIPPING Tests 2-4 (no carrier ID available)', 'yellow');
  }

  // Test 5: Filters
  const test5 = await testFilters();
  test5 ? results.passed++ : results.failed++;

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
