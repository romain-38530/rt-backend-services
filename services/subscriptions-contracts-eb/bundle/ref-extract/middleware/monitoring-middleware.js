// ============================================================================
// RT SYMPHONI.A - Monitoring Middleware
// ============================================================================
// Version: 1.0.0
// Description: Express middleware for request monitoring and custom metrics
// ============================================================================

const fs = require('fs');
const path = require('path');
const cloudwatchMetrics = require('../utils/cloudwatch-metrics');

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Log streams
const accessLogStream = fs.createWriteStream(
  path.join(LOG_DIR, 'access.log'),
  { flags: 'a' }
);

const errorLogStream = fs.createWriteStream(
  path.join(LOG_DIR, 'error.log'),
  { flags: 'a' }
);

const businessMetricsStream = fs.createWriteStream(
  path.join(LOG_DIR, 'business-metrics.log'),
  { flags: 'a' }
);

const securityLogStream = fs.createWriteStream(
  path.join(LOG_DIR, 'security.log'),
  { flags: 'a' }
);

// ============================================================================
// REQUEST MONITORING MIDDLEWARE
// ============================================================================

/**
 * Request monitoring and metrics collection middleware
 */
function requestMonitoring(req, res, next) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Add request ID to headers
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Capture original end function
  const originalEnd = res.end;

  // Override res.end to capture metrics
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Log request
    logRequest(req, res, duration, requestId);

    // Send metrics to CloudWatch
    sendRequestMetrics(req, res, duration).catch(error => {
      console.error('Failed to send request metrics:', error.message);
    });

    // Track errors
    if (statusCode >= 400) {
      logError(req, res, duration, requestId);
    }

    // Call original end
    originalEnd.apply(res, args);
  };

  next();
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log request to access log
 */
function logRequest(req, res, duration, requestId) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown',
    referer: req.get('referer') || '-',
    userId: req.user?.id || 'anonymous'
  };

  accessLogStream.write(JSON.stringify(logEntry) + '\n');
}

/**
 * Log error to error log
 */
function logError(req, res, duration, requestId) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: res.statusCode >= 500 ? 'ERROR' : 'WARN',
    requestId,
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
    ip: req.ip || req.connection.remoteAddress,
    userId: req.user?.id || 'anonymous'
  };

  errorLogStream.write(JSON.stringify(logEntry) + '\n');

  // Track security events for unauthorized access
  if (res.statusCode === 401 || res.statusCode === 403) {
    cloudwatchMetrics.trackSecurityEvent(
      res.statusCode === 401 ? 'Unauthorized' : 'Forbidden',
      'warning',
      req.ip
    );
  }
}

/**
 * Send request metrics to CloudWatch
 */
async function sendRequestMetrics(req, res, duration) {
  const endpoint = getEndpointPattern(req.path);
  const method = req.method;
  const statusCode = res.statusCode;

  await cloudwatchMetrics.trackRequest(endpoint, method, statusCode, duration);
}

/**
 * Extract endpoint pattern from path (remove IDs)
 */
function getEndpointPattern(path) {
  return path
    .replace(/\/[0-9a-f]{24}/g, '/:id') // MongoDB ObjectIDs
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .replace(/\/[0-9a-f-]{36}/g, '/:uuid') // UUIDs
    || '/';
}

// ============================================================================
// BUSINESS METRICS LOGGING
// ============================================================================

/**
 * Log business metric
 */
function logBusinessMetric(metricName, value, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    metric: metricName,
    value,
    metadata
  };

  businessMetricsStream.write(JSON.stringify(logEntry) + '\n');
}

/**
 * Log transport order creation
 */
function logTransportOrderCreated(orderId, details) {
  logBusinessMetric('transport_order_created', 1, {
    orderId,
    status: details.status,
    totalAmount: details.totalAmount,
    carrierId: details.carrierId,
    origin: details.origin,
    destination: details.destination
  });

  // Send to CloudWatch
  cloudwatchMetrics.trackTransportOrder(
    orderId,
    details.status,
    details.totalAmount
  );
}

/**
 * Log delivery completion
 */
function logDeliveryCompleted(orderId, details) {
  const onTime = !details.delayed;
  const delay = details.delayMinutes || 0;

  logBusinessMetric('delivery_completed', 1, {
    orderId,
    onTime,
    delay,
    actualDeliveryTime: details.actualDeliveryTime,
    expectedDeliveryTime: details.expectedDeliveryTime
  });

  // Send to CloudWatch
  cloudwatchMetrics.trackDeliveryPerformance(orderId, onTime, delay);
}

/**
 * Log carrier score update
 */
function logCarrierScoreUpdate(carrierId, score, scoreType) {
  logBusinessMetric('carrier_score_updated', score, {
    carrierId,
    scoreType,
    previousScore: score.previous,
    newScore: score.current
  });

  // Send to CloudWatch
  cloudwatchMetrics.trackCarrierScore(carrierId, score.current, scoreType);
}

/**
 * Log subscription event
 */
function logSubscriptionEvent(action, details) {
  logBusinessMetric('subscription_event', 1, {
    action,
    planType: details.planType,
    userId: details.userId,
    amount: details.amount
  });

  // Send to CloudWatch
  cloudwatchMetrics.trackSubscription(
    action,
    details.planType,
    details.amount
  );
}

/**
 * Log e-CMR signature
 */
function logECMRSignature(cmrId, party, signatureTime) {
  logBusinessMetric('ecmr_signature', 1, {
    cmrId,
    party,
    signatureTime
  });

  // Send to CloudWatch
  cloudwatchMetrics.trackECMRSignature(cmrId, party, signatureTime);
}

// ============================================================================
// SECURITY LOGGING
// ============================================================================

/**
 * Log security event
 */
function logSecurityEvent(eventType, severity, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: severity.toUpperCase(),
    eventType,
    severity,
    details
  };

  securityLogStream.write(JSON.stringify(logEntry) + '\n');

  // Send to CloudWatch
  cloudwatchMetrics.trackSecurityEvent(
    eventType,
    severity,
    details.userId || details.ip || 'unknown'
  );
}

/**
 * Log authentication attempt
 */
function logAuthenticationAttempt(success, userId, ip) {
  logSecurityEvent(
    success ? 'AuthenticationSuccess' : 'AuthenticationFailure',
    success ? 'info' : 'warning',
    { userId, ip, success }
  );
}

/**
 * Log rate limit exceeded
 */
function logRateLimitExceeded(endpoint, ip) {
  logSecurityEvent('RateLimitExceeded', 'warning', { endpoint, ip });

  // Send to CloudWatch
  cloudwatchMetrics.trackRateLimitExceeded(endpoint, ip);
}

/**
 * Log suspicious activity
 */
function logSuspiciousActivity(activityType, details) {
  logSecurityEvent('SuspiciousActivity', 'critical', {
    activityType,
    ...details
  });
}

// ============================================================================
// HEALTH CHECK METRICS
// ============================================================================

/**
 * Collect system health metrics
 */
async function collectHealthMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    uptime: process.uptime(),
    cpu: process.cpuUsage()
  };

  // Send memory usage to CloudWatch
  const memoryUsagePercent = (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100;
  await cloudwatchMetrics.sendMetric(
    'NodeMemoryUsage',
    memoryUsagePercent,
    'Percent'
  );

  return metrics;
}

// ============================================================================
// PERIODIC METRICS COLLECTION
// ============================================================================

// Collect health metrics every 5 minutes
setInterval(() => {
  collectHealthMetrics().catch(error => {
    console.error('Failed to collect health metrics:', error.message);
  });
}, 5 * 60 * 1000);

// ============================================================================
// RESPONSE TIME TRACKING
// ============================================================================

let responseTimes = [];

/**
 * Track response time for percentile calculation
 */
function trackResponseTime(duration) {
  responseTimes.push(duration);

  // Send percentiles every 100 requests
  if (responseTimes.length >= 100) {
    cloudwatchMetrics.sendResponseTimePercentiles(responseTimes);
    responseTimes = []; // Reset
  }
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

function closeLogStreams() {
  accessLogStream.end();
  errorLogStream.end();
  businessMetricsStream.end();
  securityLogStream.end();
}

process.on('SIGTERM', closeLogStreams);
process.on('SIGINT', closeLogStreams);

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware
  requestMonitoring,

  // Business metrics
  logBusinessMetric,
  logTransportOrderCreated,
  logDeliveryCompleted,
  logCarrierScoreUpdate,
  logSubscriptionEvent,
  logECMRSignature,

  // Security logging
  logSecurityEvent,
  logAuthenticationAttempt,
  logRateLimitExceeded,
  logSuspiciousActivity,

  // Health
  collectHealthMetrics,

  // Response time tracking
  trackResponseTime,

  // Cleanup
  closeLogStreams
};
