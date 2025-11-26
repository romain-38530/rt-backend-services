# RT SYMPHONI.A - Testing Guide

Complete guide for running End-to-End tests and Load tests for the RT SYMPHONI.A Transport Management System.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Test Structure](#test-structure)
- [E2E Tests](#e2e-tests)
- [Load Tests](#load-tests)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

---

## Overview

This testing suite provides comprehensive coverage for RT SYMPHONI.A:

- **E2E Tests**: Playwright-based tests covering complete user workflows
- **Load Tests**: k6-based performance tests for API, MongoDB, and WebSocket
- **Target**: 80%+ code coverage, 100+ req/s API performance

### Test Statistics

- **E2E Test Suites**: 3 (Transport Orders, Authentication, Carrier Management)
- **Total E2E Tests**: 30+ individual test cases
- **Load Test Scenarios**: 3 (API, MongoDB, WebSocket)
- **Target Concurrent Users**: 500+ for WebSocket, 100+ req/s for API

---

## Prerequisites

### Required Software

```bash
# Node.js 20.x or higher
node --version

# npm 9.x or higher
npm --version
```

### Installation

```bash
# Navigate to project directory
cd services/subscriptions-contracts-eb

# Install dependencies
npm install

# Install Playwright browsers (for E2E tests)
npx playwright install chromium
```

### Environment Variables

Create a `.env.test` file:

```env
# API Configuration
API_URL=https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com

# MongoDB Configuration (optional - for load tests)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rt-subscriptions-contracts

# WebSocket Configuration (optional)
WS_URL=wss://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/socket.io/

# Test Configuration
ENABLE_DB_CLEANUP=false
```

---

## Test Structure

```
tests/
├── e2e/                                    # End-to-End tests
│   ├── transport-order-workflow.spec.js   # Complete order workflow
│   ├── authentication.spec.js             # Auth & authorization
│   └── carrier-management.spec.js         # Carrier referencing
├── load/                                   # Load tests
│   ├── api-load-test.js                   # API performance (k6)
│   ├── mongodb-load-test.js               # Database performance
│   ├── websocket-load-test.js             # WebSocket stress test
│   └── generate-test-data.js              # Generate 10k+ orders
├── fixtures/                               # Test data
│   ├── test-data.json                     # Static test data
│   └── test-documents/                    # Mock documents
└── helpers/                                # Test utilities
    ├── api-client.js                      # API client helper
    ├── global-setup.js                    # Global test setup
    └── global-teardown.js                 # Global cleanup
```

---

## E2E Tests

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/transport-order-workflow.spec.js

# Run with UI mode (interactive)
npx playwright test --ui

# Run in debug mode
npx playwright test --debug
```

### Test Suites

#### 1. Transport Order Workflow

**File**: `tests/e2e/transport-order-workflow.spec.js`

Tests the complete lifecycle of a transport order:

1. ✅ Create transport order
2. ✅ Assign carrier
3. ✅ Start tracking (GPS/Email)
4. ✅ Upload documents (BL, CMR, POD)
5. ✅ OCR extraction from documents
6. ✅ Close order
7. ✅ Verify final state

**Run**:
```bash
npx playwright test tests/e2e/transport-order-workflow.spec.js
```

**Expected Duration**: 2-3 minutes

#### 2. Authentication Tests

**File**: `tests/e2e/authentication.spec.js`

Tests user authentication and authorization:

- User registration
- Login/logout
- Token management
- Protected routes
- Password changes
- Rate limiting

**Run**:
```bash
npx playwright test tests/e2e/authentication.spec.js
```

**Expected Duration**: 1-2 minutes

#### 3. Carrier Management Tests

**File**: `tests/e2e/carrier-management.spec.js`

Tests carrier referencing workflow:

- Carrier invitation
- Onboarding process
- Document verification
- Vigilance status
- Pricing grids
- Carrier scoring

**Run**:
```bash
npx playwright test tests/e2e/carrier-management.spec.js
```

**Expected Duration**: 2-3 minutes

### Viewing Test Results

```bash
# View HTML report
npx playwright show-report test-results/html

# View JSON results
cat test-results/results.json | jq
```

### Test Reports

Reports are generated in multiple formats:

- **HTML**: `test-results/html/index.html` (interactive report)
- **JSON**: `test-results/results.json` (machine-readable)
- **JUnit**: `test-results/junit.xml` (CI/CD integration)

---

## Load Tests

### 1. API Load Test

Tests API performance under varying load conditions.

**Target**: 100+ requests/second

```bash
# Run API load test
npm run test:load

# Run with custom parameters
k6 run tests/load/api-load-test.js \
  --vus 100 \
  --duration 5m \
  --out json=results.json
```

**Test Stages**:
- Warm-up: 0 → 10 users (30s)
- Normal load: 10 → 50 users (1m)
- Peak load: 50 → 100 users (2m)
- Spike: 100 → 200 users (30s)
- Cool down: 200 → 0 users (1m30s)

**Metrics**:
- Request rate (req/s)
- Response time (p95, p99)
- Error rate
- Throughput

**Expected Results**:
```
✓ http_req_duration.............: avg=250ms p95=450ms p99=800ms
✓ http_req_failed................: 0.5% (< 5% threshold)
✓ http_reqs......................: 15000+ requests
✓ vus............................: 100 concurrent users
```

### 2. MongoDB Load Test

Tests database performance with 10,000+ records.

```bash
# Run MongoDB load test
npm run test:load:mongodb

# Generate test data first
npm run generate:test-data

# Clean up after tests
CLEANUP=true npm run generate:test-data
```

**Tests**:
- Insert 10,000 records in batches
- Query performance (single, complex, range)
- Update performance (single, bulk)
- Aggregation performance
- Index creation and optimization

**Expected Results**:
```
Insert Time: 5-10s (1000-2000 records/sec)
Query Time: < 100ms per query
Update Time: < 50ms per update
Aggregation: < 200ms
```

### 3. WebSocket Load Test

Tests real-time communication with 500+ concurrent connections.

```bash
# Run WebSocket load test
npm run test:load:websocket

# Run with custom parameters
k6 run tests/load/websocket-load-test.js \
  --vus 500 \
  --duration 5m
```

**Test Stages**:
- Warm-up: 0 → 50 connections (30s)
- Normal: 50 → 200 connections (1m)
- Peak: 200 → 500 connections (2m)
- Spike: 500 → 700 connections (30s)
- Cool down: 700 → 0 connections (1m30s)

**Expected Results**:
```
✓ ws_connections................: 500+ concurrent
✓ ws_latency (p95)..............: < 200ms
✓ ws_errors.....................: < 2%
✓ ws_messages...................: 50000+ messages
```

### Generating Test Data

Create 10,000+ test orders for load testing:

```bash
# Generate 10,000 orders
npm run generate:test-data

# Generate with cleanup
CLEANUP=true npm run generate:test-data

# Generate and append to existing
APPEND=true npm run generate:test-data
```

**Generated Data**:
- 10,000 transport orders
- Distributed across multiple cities
- Various statuses (CREATED, ASSIGNED, IN_TRANSIT, etc.)
- Realistic dates, prices, and metadata

---

## CI/CD Integration

### GitHub Actions Workflow

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests
- Manual workflow dispatch

**Workflow File**: `.github/workflows/tests.yml`

### Jobs

1. **e2e-tests**: Runs Playwright E2E tests
2. **load-tests**: Runs k6 load tests (main branch only)
3. **mongodb-load-test**: Runs MongoDB performance tests (manual)
4. **test-summary**: Generates summary report

### Secrets Required

Add these secrets in GitHub repository settings:

```
MONGODB_URI=mongodb+srv://...
```

### Viewing CI Results

1. Go to **Actions** tab in GitHub
2. Select latest workflow run
3. Download artifacts:
   - `playwright-report`: Test results
   - `playwright-html-report`: Interactive HTML report
   - `load-test-results`: k6 metrics

---

## Troubleshooting

### Common Issues

#### 1. Playwright Installation Fails

```bash
# Install system dependencies
npx playwright install-deps

# Install specific browser
npx playwright install chromium
```

#### 2. API Connection Timeout

Check API health:
```bash
curl https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health
```

Update `.env.test` with correct API URL.

#### 3. MongoDB Connection Failed

Verify MongoDB URI:
```bash
mongosh "mongodb+srv://username:password@cluster.mongodb.net/test"
```

Check IP whitelist in MongoDB Atlas.

#### 4. Tests Fail with 401 Unauthorized

Authentication may be required. Check:
- User credentials in test data
- Token generation in global setup
- API authentication configuration

#### 5. Load Tests Show High Error Rate

Possible causes:
- API rate limiting (check `express-rate-limit` config)
- Server overload (check AWS metrics)
- Network issues (check connectivity)

### Debug Mode

Run tests in debug mode:

```bash
# E2E tests with debug
DEBUG=pw:api npx playwright test --debug

# Load tests with verbose output
k6 run tests/load/api-load-test.js --verbose
```

### Performance Optimization

If tests are slow:

1. **Reduce test data**: Decrease `TOTAL_ORDERS` in generate script
2. **Parallel execution**: Enable in `playwright.config.js`
3. **Skip slow tests**: Use `.skip()` for optional tests
4. **Increase timeouts**: Adjust timeout values

---

## Best Practices

### Writing E2E Tests

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use `afterEach` to clean up test data
3. **Assertions**: Use specific assertions with clear messages
4. **Waits**: Use `waitForCondition` instead of arbitrary sleeps
5. **Data**: Use fixtures and generators for test data

### Load Testing

1. **Gradual ramp-up**: Don't spike to max load immediately
2. **Monitor metrics**: Watch server metrics during tests
3. **Realistic scenarios**: Simulate actual user behavior
4. **Baseline**: Establish baseline before optimization
5. **Document results**: Record metrics for comparison

### CI/CD

1. **Fast feedback**: Keep tests under 10 minutes
2. **Parallel jobs**: Run independent tests in parallel
3. **Artifacts**: Upload reports for debugging
4. **Notifications**: Set up alerts for failures
5. **Schedule**: Run load tests off-peak hours

---

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [k6 Documentation](https://k6.io/docs)
- [MongoDB Performance Best Practices](https://docs.mongodb.com/manual/administration/analyzing-mongodb-performance/)

---

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review test logs in `test-results/`
3. Contact development team

---

**Last Updated**: 2025-11-26
**Version**: 1.0.0
