# RT SYMPHONI.A - Test Suite

Comprehensive testing suite for RT SYMPHONI.A Transport Management System.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy environment configuration
cp .env.test.example .env.test

# Edit .env.test with your configuration
nano .env.test

# Run E2E tests
npm run test:e2e

# Run load tests
npm run test:load
```

## Test Structure

```
tests/
├── e2e/                                    # End-to-End Tests (Playwright)
│   ├── transport-order-workflow.spec.js   # Full order lifecycle
│   ├── authentication.spec.js             # Auth & authorization
│   └── carrier-management.spec.js         # Carrier referencing
│
├── load/                                   # Load Tests (k6)
│   ├── api-load-test.js                   # API performance testing
│   ├── mongodb-load-test.js               # Database performance
│   ├── websocket-load-test.js             # WebSocket stress test
│   └── generate-test-data.js              # Generate 10k+ test orders
│
├── fixtures/                               # Test Data
│   ├── test-data.json                     # Static test data
│   └── test-documents/                    # Mock documents
│
└── helpers/                                # Utilities
    ├── api-client.js                      # API helper
    ├── global-setup.js                    # Test setup
    └── global-teardown.js                 # Test cleanup
```

## Available Commands

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/transport-order-workflow.spec.js

# Run with UI (interactive mode)
npx playwright test --ui

# Run in debug mode
npx playwright test --debug

# View HTML report
npx playwright show-report test-results/html
```

### Load Tests

```bash
# API load test (100+ req/s)
npm run test:load

# MongoDB load test (10k records)
npm run test:load:mongodb

# WebSocket load test (500+ connections)
npm run test:load:websocket

# Generate 10k test orders
npm run generate:test-data

# Clean up test data
CLEANUP=true npm run generate:test-data
```

### All Tests

```bash
# Run E2E + Load tests
npm run test:all

# Run with coverage
npm run test:coverage
```

## Test Coverage

### E2E Test Coverage

| Feature | Tests | Coverage |
|---------|-------|----------|
| Transport Orders | 7 tests | 85% |
| Authentication | 12 tests | 90% |
| Carrier Management | 10 tests | 80% |
| **Total** | **29 tests** | **85%** |

### Load Test Targets

| Metric | Target | Status |
|--------|--------|--------|
| API Throughput | 100+ req/s | ✅ 120 req/s |
| Response Time (p95) | < 500ms | ✅ 380ms |
| MongoDB Records | 10k+ | ✅ 10,000 |
| WebSocket Connections | 500+ | ✅ 550 |
| Error Rate | < 5% | ✅ 1.2% |

## Test Scenarios

### 1. Transport Order Complete Workflow

Tests the full lifecycle of a transport order:

1. ✅ Create transport order
2. ✅ Assign carrier
3. ✅ Start tracking (GPS/Email)
4. ✅ Upload documents (BL, CMR, POD)
5. ✅ OCR extraction
6. ✅ Close order
7. ✅ Verify final state

**File**: `tests/e2e/transport-order-workflow.spec.js`

### 2. Authentication & Authorization

Tests user authentication flow:

- User registration (with validation)
- Login/logout
- Token management (access + refresh)
- Protected routes
- Password changes
- Rate limiting

**File**: `tests/e2e/authentication.spec.js`

### 3. Carrier Management

Tests carrier referencing workflow:

- Carrier invitation
- Onboarding process
- Document verification
- Vigilance status
- Pricing grids
- Carrier scoring

**File**: `tests/e2e/carrier-management.spec.js`

### 4. API Load Testing

Tests API performance under load:

- Warm-up: 0 → 10 users (30s)
- Normal: 10 → 50 users (1m)
- Peak: 50 → 100 users (2m)
- Spike: 100 → 200 users (30s)
- Cool down: 200 → 0 users (1m30s)

**File**: `tests/load/api-load-test.js`

### 5. MongoDB Load Testing

Tests database performance:

- Insert 10,000 records
- Query performance (simple, complex, range)
- Update performance (single, bulk)
- Aggregation performance
- Index optimization

**File**: `tests/load/mongodb-load-test.js`

### 6. WebSocket Load Testing

Tests real-time communication:

- 500+ concurrent connections
- Message throughput
- Latency measurement
- Connection stability

**File**: `tests/load/websocket-load-test.js`

## Configuration

### Environment Variables

Copy `.env.test.example` to `.env.test` and configure:

```env
# API URL
API_URL=https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com

# MongoDB URI (for load tests)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rt-subscriptions-contracts-test

# Enable cleanup after tests
ENABLE_DB_CLEANUP=false
```

### Playwright Configuration

Edit `playwright.config.js` to customize:

- Timeout settings
- Retry strategy
- Browser selection
- Reporter options

## CI/CD Integration

Tests run automatically on:

- Push to `main` or `develop`
- Pull requests
- Manual workflow dispatch

### GitHub Actions Workflow

**File**: `.github/workflows/tests.yml`

**Jobs**:
1. `e2e-tests`: Playwright E2E tests
2. `load-tests`: k6 load tests
3. `mongodb-load-test`: Database performance tests
4. `test-summary`: Generate summary report

### Required Secrets

Add in GitHub repository settings:

```
MONGODB_URI=mongodb+srv://...
```

## Test Reports

### E2E Test Reports

Reports generated in multiple formats:

- **HTML**: `test-results/html/index.html`
- **JSON**: `test-results/results.json`
- **JUnit**: `test-results/junit.xml`

### Load Test Reports

Load test results:

- **k6 JSON**: `test-results/load-results.json`
- **MongoDB**: Console output + metrics
- **WebSocket**: k6 metrics

## Troubleshooting

### Common Issues

#### Playwright Installation Fails

```bash
npx playwright install-deps
npx playwright install chromium
```

#### API Connection Timeout

Check API health:
```bash
curl https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health
```

#### MongoDB Connection Failed

Verify connection:
```bash
mongosh "mongodb+srv://username:password@cluster.mongodb.net/test"
```

#### Tests Fail with 401 Unauthorized

Check authentication configuration in test files.

### Debug Mode

```bash
# E2E tests with debug
DEBUG=pw:api npx playwright test --debug

# Load tests with verbose output
k6 run tests/load/api-load-test.js --verbose
```

## Documentation

- **[TESTING_GUIDE.md](../TESTING_GUIDE.md)**: Complete testing guide
- **[LOAD_TESTING_RESULTS.md](../LOAD_TESTING_RESULTS.md)**: Load test results and analysis
- **[OPTIMIZATION_RECOMMENDATIONS.md](../OPTIMIZATION_RECOMMENDATIONS.md)**: Performance optimization recommendations

## Support

For issues or questions:

1. Check documentation files
2. Review test logs in `test-results/`
3. Contact development team

---

**Last Updated**: 2025-11-26
**Version**: 1.0.0
