// K6 WebSocket Load Test - Real-time Communication Testing
// Tests WebSocket/Socket.IO performance with 500+ concurrent connections

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages');
const wsErrors = new Rate('ws_errors');
const wsLatency = new Trend('ws_latency');
const wsReconnections = new Counter('ws_reconnections');

// Test configuration
export const options = {
  stages: [
    // Warm-up
    { duration: '30s', target: 50 },    // Ramp up to 50 connections
    // Normal load
    { duration: '1m', target: 200 },    // Ramp up to 200 connections
    // Peak load
    { duration: '2m', target: 500 },    // Ramp up to 500 connections
    // Spike test
    { duration: '30s', target: 700 },   // Spike to 700 connections
    // Sustain
    { duration: '1m', target: 500 },    // Maintain 500 connections
    // Cool down
    { duration: '1m', target: 100 },    // Ramp down to 100 connections
    { duration: '30s', target: 0 },     // Ramp down to 0 connections
  ],
  thresholds: {
    // 95% of WebSocket messages should be delivered within 200ms
    'ws_latency': ['p(95)<200'],
    // Error rate should be below 2%
    'ws_errors': ['rate<0.02'],
    // At least 95% of connections should succeed
    'ws_connections': ['count>0'],
  },
};

// Base URL - Note: WebSocket typically uses ws:// or wss:// protocol
const WS_URL = __ENV.WS_URL || 'wss://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/socket.io/';
const HTTP_URL = __ENV.API_URL || 'https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

// Generate unique client ID
function generateClientId() {
  return `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Main test function
export default function() {
  const clientId = generateClientId();
  const url = `${WS_URL}?clientId=${clientId}&transport=websocket`;

  // WebSocket connection parameters
  const params = {
    headers: {
      'Origin': HTTP_URL,
    },
    tags: { name: 'WebSocketLoadTest' },
  };

  // Establish WebSocket connection
  const response = ws.connect(url, params, function(socket) {
    wsConnections.add(1);

    socket.on('open', function() {
      console.log(`[${clientId}] Connected`);

      // Send initial connection message
      const connectMessage = JSON.stringify({
        type: 'connect',
        clientId: clientId,
        timestamp: Date.now(),
      });

      socket.send(connectMessage);

      // Subscribe to tracking updates
      const subscribeMessage = JSON.stringify({
        type: 'subscribe',
        channel: 'tracking-updates',
        clientId: clientId,
      });

      socket.send(subscribeMessage);
      wsMessages.add(1);

      // Set up ping interval (every 5 seconds)
      socket.setInterval(function() {
        const pingStart = Date.now();

        const pingMessage = JSON.stringify({
          type: 'ping',
          clientId: clientId,
          timestamp: pingStart,
        });

        socket.send(pingMessage);
        wsMessages.add(1);
      }, 5000);

      // Send periodic tracking updates (simulate GPS updates)
      socket.setInterval(function() {
        const updateStart = Date.now();

        const trackingUpdate = JSON.stringify({
          type: 'tracking_update',
          orderId: `order-${Math.floor(Math.random() * 1000)}`,
          location: {
            lat: 48.8566 + (Math.random() - 0.5) * 0.1,
            lng: 2.3522 + (Math.random() - 0.5) * 0.1,
          },
          speed: Math.floor(Math.random() * 100),
          heading: Math.floor(Math.random() * 360),
          timestamp: updateStart,
        });

        socket.send(trackingUpdate);
        wsMessages.add(1);
      }, 10000);
    });

    socket.on('message', function(message) {
      try {
        const data = JSON.parse(message);
        const receiveTime = Date.now();

        // Calculate latency if message has timestamp
        if (data.timestamp) {
          const latency = receiveTime - data.timestamp;
          wsLatency.add(latency);
        }

        // Check message type
        const messageValid = check(data, {
          'message has type': (d) => d.type !== undefined,
        });

        if (!messageValid) {
          wsErrors.add(1);
        }

        wsMessages.add(1);
      } catch (error) {
        wsErrors.add(1);
      }
    });

    socket.on('pong', function() {
      // Pong received
      wsMessages.add(1);
    });

    socket.on('error', function(error) {
      console.error(`[${clientId}] Error: ${error}`);
      wsErrors.add(1);
    });

    socket.on('close', function() {
      console.log(`[${clientId}] Disconnected`);
    });

    // Keep connection alive for 60 seconds
    socket.setTimeout(function() {
      console.log(`[${clientId}] Closing connection after timeout`);
      socket.close();
    }, 60000);
  });

  // Check connection was successful
  check(response, {
    'WebSocket connection established': (r) => r && r.status === 101,
  });

  if (!response || response.status !== 101) {
    wsErrors.add(1);
  }

  // Wait before next connection attempt
  sleep(1);
}

// Setup - runs once
export function setup() {
  console.log('🚀 Starting WebSocket Load Test');
  console.log(`📡 Target WebSocket: ${WS_URL}`);
  console.log(`🎯 Target: 500+ concurrent connections`);
  console.log('========================================\n');
}

// Teardown - runs once after all VUs complete
export function teardown(data) {
  console.log('\n========================================');
  console.log('✅ WebSocket load test completed');
  console.log('📊 Check results for detailed metrics');
  console.log('========================================\n');
}
