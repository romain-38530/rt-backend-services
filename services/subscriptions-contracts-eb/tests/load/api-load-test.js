// K6 Load Test - API Performance Testing
// Tests API endpoints under varying load conditions
// Target: 100+ requests/second

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Test configuration
export const options = {
  stages: [
    // Warm-up
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    // Normal load
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    // Peak load
    { duration: '2m', target: 100 },   // Ramp up to 100 users (100+ req/s)
    // Spike test
    { duration: '30s', target: 200 },  // Spike to 200 users
    // Cool down
    { duration: '1m', target: 50 },    // Ramp down to 50 users
    { duration: '30s', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    // 95% of requests should be below 500ms
    'http_req_duration': ['p(95)<500'],
    // Error rate should be below 5%
    'errors': ['rate<0.05'],
    // 99% of requests should complete within 1s
    'http_req_duration': ['p(99)<1000'],
  },
};

// Base URL
const BASE_URL = __ENV.API_URL || 'https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

// Test data
let authToken = null;

// Setup - runs once per VU
export function setup() {
  console.log('🚀 Starting API Load Test');
  console.log(`📡 Target API: ${BASE_URL}`);

  // Try to authenticate
  const loginPayload = JSON.stringify({
    email: 'load-test@example.com',
    password: 'LoadTest123!',
  });

  const loginParams = {
    headers: { 'Content-Type': 'application/json' },
  };

  let loginResponse = http.post(`${BASE_URL}/api/auth/login`, loginPayload, loginParams);

  // If login fails, try to register
  if (loginResponse.status !== 200) {
    const registerPayload = JSON.stringify({
      email: 'load-test@example.com',
      password: 'LoadTest123!',
      firstName: 'Load',
      lastName: 'Test',
      role: 'client',
    });

    http.post(`${BASE_URL}/api/auth/register`, registerPayload, loginParams);
    loginResponse = http.post(`${BASE_URL}/api/auth/login`, loginPayload, loginParams);
  }

  let token = null;
  if (loginResponse.status === 200) {
    const body = JSON.parse(loginResponse.body);
    token = body.data?.accessToken || body.accessToken;
  }

  return { authToken: token };
}

// Main test function
export default function(data) {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': data.authToken ? `Bearer ${data.authToken}` : undefined,
    },
  };

  // Test 1: Health Check (Public endpoint)
  group('Health Check', () => {
    const startTime = Date.now();
    const response = http.get(`${BASE_URL}/health`);
    const duration = Date.now() - startTime;

    const success = check(response, {
      'health check status is 200': (r) => r.status === 200,
      'health check has status field': (r) => {
        const body = JSON.parse(r.body);
        return body.status !== undefined;
      },
    });

    apiLatency.add(duration);
    errorRate.add(!success);

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
  });

  sleep(0.1);

  // Test 2: List Plans (Public endpoint)
  group('List Subscription Plans', () => {
    const startTime = Date.now();
    const response = http.get(`${BASE_URL}/api/plans`, params);
    const duration = Date.now() - startTime;

    const success = check(response, {
      'plans list status is 200': (r) => r.status === 200,
      'plans list returns data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    apiLatency.add(duration);
    errorRate.add(!success);

    if (success) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
  });

  sleep(0.1);

  // Test 3: Create Transport Order (Protected endpoint)
  if (data.authToken) {
    group('Create Transport Order', () => {
      const orderPayload = JSON.stringify({
        reference: `LOAD-TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        clientId: `client-${Date.now()}`,
        pickupLocation: {
          address: '123 Test Street',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
          coordinates: { lat: 48.8566, lng: 2.3522 },
        },
        deliveryLocation: {
          address: '456 Test Avenue',
          city: 'Lyon',
          postalCode: '69001',
          country: 'FR',
          coordinates: { lat: 45.7640, lng: 4.8357 },
        },
        goods: [
          {
            description: 'Load Test Package',
            weight: 100,
            quantity: 1,
          },
        ],
        pickupDate: new Date(Date.now() + 86400000).toISOString(),
        deliveryDate: new Date(Date.now() + 2 * 86400000).toISOString(),
      });

      const startTime = Date.now();
      const response = http.post(`${BASE_URL}/api/transport-orders`, orderPayload, params);
      const duration = Date.now() - startTime;

      const success = check(response, {
        'create order status is 201 or 200': (r) => r.status === 201 || r.status === 200,
        'create order returns orderId': (r) => {
          try {
            const body = JSON.parse(r.body);
            return body.data?._id !== undefined || body.data?.orderId !== undefined;
          } catch {
            return false;
          }
        },
      });

      apiLatency.add(duration);
      errorRate.add(!success);

      if (success) {
        successfulRequests.add(1);
      } else {
        failedRequests.add(1);
      }
    });
  }

  sleep(0.2);

  // Test 4: List Carriers (Public or protected endpoint)
  group('List Carriers', () => {
    const startTime = Date.now();
    const response = http.get(`${BASE_URL}/api/carriers`, params);
    const duration = Date.now() - startTime;

    const success = check(response, {
      'carriers list status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    });

    apiLatency.add(duration);

    if (response.status === 200) {
      successfulRequests.add(1);
    } else if (response.status === 401) {
      // 401 is expected if endpoint requires auth
      successfulRequests.add(1);
    } else {
      errorRate.add(true);
      failedRequests.add(1);
    }
  });

  sleep(0.3);
}

// Teardown - runs once after all VUs complete
export function teardown(data) {
  console.log('✅ Load test completed');
  console.log(`📊 Check results for detailed metrics`);
}
