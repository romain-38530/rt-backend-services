// ============================================================================
// RT SYMPHONI.A - CloudWatch Metrics Utility
// ============================================================================
// Version: 1.0.0
// Description: Utility for sending custom metrics to CloudWatch
// ============================================================================

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

// Initialize CloudWatch client
const cloudwatch = new CloudWatchClient({
  region: process.env.AWS_REGION || 'eu-west-3'
});

const NAMESPACE = process.env.CLOUDWATCH_NAMESPACE || 'RT/SYMPHONIA/SubscriptionsContracts';
const METRICS_ENABLED = process.env.METRICS_ENABLED !== 'false';

// ============================================================================
// METRIC SENDING FUNCTIONS
// ============================================================================

/**
 * Send a single metric to CloudWatch
 * @param {string} metricName - Name of the metric
 * @param {number} value - Metric value
 * @param {string} unit - Unit of measurement (Count, Percent, Milliseconds, etc.)
 * @param {Object} dimensions - Additional dimensions for the metric
 */
async function sendMetric(metricName, value, unit = 'Count', dimensions = {}) {
  if (!METRICS_ENABLED) {
    return;
  }

  try {
    const metricDimensions = Object.entries(dimensions).map(([Name, Value]) => ({
      Name,
      Value: String(Value)
    }));

    const params = {
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: unit,
          Timestamp: new Date(),
          Dimensions: metricDimensions
        }
      ]
    };

    const command = new PutMetricDataCommand(params);
    await cloudwatch.send(command);
  } catch (error) {
    console.error(`Failed to send metric ${metricName}:`, error.message);
  }
}

/**
 * Send multiple metrics at once (more efficient)
 * @param {Array} metrics - Array of metric objects
 */
async function sendMetricsBatch(metrics) {
  if (!METRICS_ENABLED || !metrics || metrics.length === 0) {
    return;
  }

  try {
    const metricData = metrics.map(metric => {
      const dimensions = metric.dimensions
        ? Object.entries(metric.dimensions).map(([Name, Value]) => ({
            Name,
            Value: String(Value)
          }))
        : [];

      return {
        MetricName: metric.name,
        Value: metric.value,
        Unit: metric.unit || 'Count',
        Timestamp: new Date(),
        Dimensions: dimensions
      };
    });

    const params = {
      Namespace: NAMESPACE,
      MetricData: metricData
    };

    const command = new PutMetricDataCommand(params);
    await cloudwatch.send(command);
  } catch (error) {
    console.error('Failed to send metrics batch:', error.message);
  }
}

// ============================================================================
// SPECIFIC METRIC FUNCTIONS
// ============================================================================

/**
 * Track API request
 */
async function trackRequest(endpoint, method, statusCode, duration) {
  const metrics = [
    {
      name: 'APIRequests',
      value: 1,
      unit: 'Count',
      dimensions: { Endpoint: endpoint, Method: method }
    },
    {
      name: 'ResponseTime',
      value: duration,
      unit: 'Milliseconds',
      dimensions: { Endpoint: endpoint }
    }
  ];

  // Track errors separately
  if (statusCode >= 400) {
    metrics.push({
      name: statusCode >= 500 ? '5xxErrors' : '4xxErrors',
      value: 1,
      unit: 'Count',
      dimensions: { Endpoint: endpoint }
    });

    // Calculate error rate
    const errorRate = statusCode >= 500 ? 100 : 0;
    metrics.push({
      name: 'ErrorRate',
      value: errorRate,
      unit: 'Percent',
      dimensions: { Endpoint: endpoint }
    });
  }

  // Track latency percentiles
  if (duration > 1000) {
    metrics.push({
      name: 'SlowRequests',
      value: 1,
      unit: 'Count',
      dimensions: { Endpoint: endpoint }
    });
  }

  await sendMetricsBatch(metrics);
}

/**
 * Track MongoDB operations
 */
async function trackMongoDBOperation(operation, success, duration) {
  const metrics = [
    {
      name: 'MongoDBOperations',
      value: 1,
      unit: 'Count',
      dimensions: { Operation: operation, Success: String(success) }
    },
    {
      name: 'MongoDBOperationDuration',
      value: duration,
      unit: 'Milliseconds',
      dimensions: { Operation: operation }
    }
  ];

  if (!success) {
    metrics.push({
      name: 'MongoDBConnectionFailures',
      value: 1,
      unit: 'Count'
    });
  }

  await sendMetricsBatch(metrics);
}

/**
 * Track business metrics - Transport Orders
 */
async function trackTransportOrder(orderId, status, totalAmount) {
  const metrics = [
    {
      name: 'TransportOrdersCreated',
      value: 1,
      unit: 'Count',
      dimensions: { Status: status }
    }
  ];

  if (totalAmount) {
    metrics.push({
      name: 'OrderRevenue',
      value: totalAmount,
      unit: 'None',
      dimensions: { Status: status }
    });
  }

  await sendMetricsBatch(metrics);
}

/**
 * Track e-CMR signatures
 */
async function trackECMRSignature(cmrId, party, signatureTime) {
  await sendMetricsBatch([
    {
      name: 'ECMRSignatures',
      value: 1,
      unit: 'Count',
      dimensions: { Party: party }
    },
    {
      name: 'SignatureTime',
      value: signatureTime,
      unit: 'Milliseconds',
      dimensions: { Party: party }
    }
  ]);
}

/**
 * Track carrier scoring
 */
async function trackCarrierScore(carrierId, score, scoreType) {
  await sendMetricsBatch([
    {
      name: 'CarrierScoreUpdates',
      value: 1,
      unit: 'Count',
      dimensions: { ScoreType: scoreType }
    },
    {
      name: 'AverageCarrierScore',
      value: score,
      unit: 'None',
      dimensions: { ScoreType: scoreType }
    }
  ]);
}

/**
 * Track delivery performance
 */
async function trackDeliveryPerformance(orderId, onTime, delay) {
  const metrics = [
    {
      name: 'DeliveryCompleted',
      value: 1,
      unit: 'Count',
      dimensions: { OnTime: String(onTime) }
    }
  ];

  if (!onTime && delay) {
    metrics.push({
      name: 'DeliveryDelay',
      value: delay,
      unit: 'Minutes'
    });

    // Calculate delay rate
    metrics.push({
      name: 'DeliveryDelayRate',
      value: 100, // This order was delayed
      unit: 'Percent'
    });
  } else {
    metrics.push({
      name: 'DeliveryDelayRate',
      value: 0, // This order was on time
      unit: 'Percent'
    });
  }

  await sendMetricsBatch(metrics);
}

/**
 * Track subscription metrics
 */
async function trackSubscription(action, planType, amount) {
  const metrics = [
    {
      name: 'SubscriptionEvents',
      value: 1,
      unit: 'Count',
      dimensions: { Action: action, PlanType: planType }
    }
  ];

  if (amount) {
    metrics.push({
      name: 'SubscriptionRevenue',
      value: amount,
      unit: 'None',
      dimensions: { PlanType: planType }
    });
  }

  await sendMetricsBatch(metrics);
}

/**
 * Track security events
 */
async function trackSecurityEvent(eventType, severity, userId = 'anonymous') {
  await sendMetricsBatch([
    {
      name: 'SecurityEvents',
      value: 1,
      unit: 'Count',
      dimensions: { EventType: eventType, Severity: severity }
    }
  ]);

  // Log to security log
  console.warn(`[SECURITY] ${eventType} - Severity: ${severity} - User: ${userId}`);
}

/**
 * Track rate limiting events
 */
async function trackRateLimitExceeded(endpoint, ip) {
  await sendMetric('RateLimitExceeded', 1, 'Count', {
    Endpoint: endpoint,
    Source: 'rate-limiter'
  });

  // Track as security event
  await trackSecurityEvent('RateLimitExceeded', 'warning', ip);
}

/**
 * Track custom business metric
 */
async function trackBusinessMetric(metricName, value, unit = 'Count', dimensions = {}) {
  await sendMetric(metricName, value, unit, {
    Category: 'Business',
    ...dimensions
  });
}

// ============================================================================
// METRIC AGGREGATION HELPERS
// ============================================================================

/**
 * Calculate and send response time percentiles
 */
async function sendResponseTimePercentiles(responseTimes) {
  if (!responseTimes || responseTimes.length === 0) {
    return;
  }

  const sorted = responseTimes.sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  await sendMetricsBatch([
    { name: 'ResponseTimeP50', value: p50, unit: 'Milliseconds' },
    { name: 'ResponseTimeP95', value: p95, unit: 'Milliseconds' },
    { name: 'ResponseTimeP99', value: p99, unit: 'Milliseconds' }
  ]);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core functions
  sendMetric,
  sendMetricsBatch,

  // Specific tracking functions
  trackRequest,
  trackMongoDBOperation,
  trackTransportOrder,
  trackECMRSignature,
  trackCarrierScore,
  trackDeliveryPerformance,
  trackSubscription,
  trackSecurityEvent,
  trackRateLimitExceeded,
  trackBusinessMetric,

  // Helpers
  sendResponseTimePercentiles
};
