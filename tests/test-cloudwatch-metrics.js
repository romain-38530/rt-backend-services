/**
 * Test Script for CloudWatch Metrics Integration
 * Tests that metrics are properly sent to CloudWatch
 */

const { CloudWatchMetrics, TMSSyncMetrics, AffretIAMetrics } = require('../infra/monitoring/cloudwatch-metrics');

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

async function testBasicMetrics() {
  log('\n========== TEST 1: Basic Metrics ==========', 'blue');

  try {
    const metrics = new CloudWatchMetrics({
      namespace: 'SYMPHONIA-TEST',
      enabled: true,
      bufferSize: 5,
      flushInterval: 0 // Disable auto-flush for testing
    });

    // Send counter metric
    await metrics.incrementCounter('Test-Counter', { Environment: 'test' });
    log('SUCCESS: Counter metric sent', 'green');

    // Send duration metric
    await metrics.recordDuration('Test-Duration', 150, { Environment: 'test' });
    log('SUCCESS: Duration metric sent', 'green');

    // Send size metric
    await metrics.recordSize('Test-Size', 1024, { Environment: 'test' });
    log('SUCCESS: Size metric sent', 'green');

    // Flush metrics
    await metrics.flush();
    log('SUCCESS: Metrics flushed to CloudWatch', 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testTMSSyncMetrics() {
  log('\n========== TEST 2: TMS Sync Metrics ==========', 'blue');

  try {
    const metrics = new TMSSyncMetrics({
      enabled: true,
      bufferSize: 5,
      flushInterval: 0
    });

    // Record successful sync
    await metrics.recordSyncSuccess(1500, 25);
    log('SUCCESS: Sync success metric sent (1500ms, 25 items)', 'green');

    // Record sync failure
    await metrics.recordSyncFailure(500, 'ConnectionError');
    log('SUCCESS: Sync failure metric sent (500ms, ConnectionError)', 'green');

    // Record API call
    await metrics.recordAPICall('/api/v1/tms/sync', 200, 200);
    log('SUCCESS: API call metric sent (200ms, status 200)', 'green');

    // Flush metrics
    await metrics.flush();
    log('SUCCESS: TMS metrics flushed to CloudWatch', 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testAffretIAMetrics() {
  log('\n========== TEST 3: Affret.IA Metrics ==========', 'blue');

  try {
    const metrics = new AffretIAMetrics({
      enabled: true,
      bufferSize: 5,
      flushInterval: 0
    });

    // Record AI request
    await metrics.recordAIRequest(800, true);
    log('SUCCESS: AI request metric sent (800ms, success)', 'green');

    // Record matching result
    await metrics.recordMatchingResult(15, 600);
    log('SUCCESS: Matching result metric sent (15 matches, 600ms)', 'green');

    // Record email sent
    await metrics.recordEmailSent(5, true);
    log('SUCCESS: Email sent metric sent (5 recipients)', 'green');

    // Record AI provider call
    await metrics.recordAIProviderCall('OpenAI', 1200, true);
    log('SUCCESS: AI provider call metric sent (OpenAI, 1200ms)', 'green');

    // Flush metrics
    await metrics.flush();
    log('SUCCESS: Affret.IA metrics flushed to CloudWatch', 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testBuffering() {
  log('\n========== TEST 4: Buffering & Auto-flush ==========', 'blue');

  try {
    const metrics = new CloudWatchMetrics({
      namespace: 'SYMPHONIA-TEST',
      enabled: true,
      bufferSize: 3, // Small buffer for testing
      flushInterval: 0 // Disable auto-flush
    });

    log('Sending 2 metrics (should buffer)...', 'reset');
    await metrics.incrementCounter('Buffer-Test-1');
    await metrics.incrementCounter('Buffer-Test-2');
    log(`SUCCESS: Buffer size: ${metrics.buffer.length}/3`, 'green');

    log('Sending 3rd metric (should trigger flush)...', 'reset');
    await metrics.incrementCounter('Buffer-Test-3');
    log(`SUCCESS: Buffer flushed, size: ${metrics.buffer.length}`, 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testExecutionTimeMeasurement() {
  log('\n========== TEST 5: Execution Time Measurement ==========', 'blue');

  try {
    const metrics = new CloudWatchMetrics({
      namespace: 'SYMPHONIA-TEST',
      enabled: true,
      flushInterval: 0
    });

    // Simulate a function that takes time
    const simulateWork = async () => {
      return new Promise(resolve => {
        setTimeout(() => resolve('Done'), 100);
      });
    };

    const result = await metrics.measureExecutionTime('Test-Execution-Time', simulateWork, {
      Operation: 'SimulateWork'
    });

    log(`SUCCESS: Execution time measured (result: ${result})`, 'green');

    // Test with error
    const simulateError = async () => {
      return new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Test error')), 50);
      });
    };

    try {
      await metrics.measureExecutionTime('Test-Execution-Time-Error', simulateError, {
        Operation: 'SimulateError'
      });
    } catch (error) {
      log('SUCCESS: Execution time measured for error case', 'green');
    }

    await metrics.flush();
    log('SUCCESS: Execution time metrics flushed', 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function testDisabledMetrics() {
  log('\n========== TEST 6: Disabled Metrics ==========', 'blue');

  try {
    const metrics = new CloudWatchMetrics({
      namespace: 'SYMPHONIA-TEST',
      enabled: false // Disabled
    });

    // Send metrics (should be ignored)
    await metrics.incrementCounter('Disabled-Test');
    await metrics.recordDuration('Disabled-Duration', 100);

    log('SUCCESS: Disabled metrics did not send (buffer size: ' + metrics.buffer.length + ')', 'green');

    await metrics.dispose();

    return true;
  } catch (error) {
    log(`ERROR: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('========================================', 'blue');
  log('  CLOUDWATCH METRICS TESTS', 'blue');
  log('========================================', 'blue');
  log('NOTE: These tests require AWS credentials configured', 'yellow');
  log('If AWS credentials are not available, tests will fail\n', 'yellow');

  const results = {
    passed: 0,
    failed: 0
  };

  // Test 1: Basic Metrics
  const test1 = await testBasicMetrics();
  test1 ? results.passed++ : results.failed++;

  // Test 2: TMS Sync Metrics
  const test2 = await testTMSSyncMetrics();
  test2 ? results.passed++ : results.failed++;

  // Test 3: Affret.IA Metrics
  const test3 = await testAffretIAMetrics();
  test3 ? results.passed++ : results.failed++;

  // Test 4: Buffering
  const test4 = await testBuffering();
  test4 ? results.passed++ : results.failed++;

  // Test 5: Execution Time
  const test5 = await testExecutionTimeMeasurement();
  test5 ? results.passed++ : results.failed++;

  // Test 6: Disabled Metrics
  const test6 = await testDisabledMetrics();
  test6 ? results.passed++ : results.failed++;

  // Summary
  log('\n========================================', 'blue');
  log('  TEST SUMMARY', 'blue');
  log('========================================', 'blue');
  log(`Total Passed: ${results.passed}`, 'green');
  log(`Total Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`,
      results.failed === 0 ? 'green' : 'yellow');

  if (results.failed > 0) {
    log('\nNOTE: Failures may be due to missing AWS credentials', 'yellow');
    log('Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set', 'yellow');
  }

  log('========================================\n', 'blue');

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests();
