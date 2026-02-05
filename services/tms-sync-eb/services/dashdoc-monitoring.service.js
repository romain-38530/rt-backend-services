/**
 * Dashdoc API Monitoring Service
 * Tracks API usage, response times, errors, and rate limit status
 *
 * Features:
 * - Request count per minute/hour/day
 * - Response time tracking (avg, p95, p99)
 * - Error rate monitoring
 * - Rate limit tracking (2 req/s limit)
 * - Webhook event tracking
 * - Alerts for anomalies
 */

class DashdocMonitoringService {
  constructor(options = {}) {
    // Configuration
    this.config = {
      // Rate limit: 2 req/s = 120 req/min max
      maxRequestsPerSecond: options.maxRequestsPerSecond || 2,
      maxRequestsPerMinute: options.maxRequestsPerMinute || 120,

      // Alert thresholds
      errorRateAlertThreshold: options.errorRateAlert || 0.1, // 10% error rate
      responseTimeAlertMs: options.responseTimeAlert || 5000, // 5s response time

      // Retention
      metricsRetentionMinutes: options.metricsRetention || 60, // 1 hour of minute-level data
    };

    // Metrics storage
    this.metrics = {
      // Per-second metrics (rolling window)
      secondBuckets: new Map(), // timestamp -> { count, errors, totalTime }

      // Per-minute metrics (rolling window)
      minuteBuckets: new Map(), // timestamp -> { count, errors, totalTime, statusCodes }

      // Current stats
      current: {
        requestsThisSecond: 0,
        requestsThisMinute: 0,
        lastRequestTime: null,
        lastErrorTime: null,
        lastError: null,
      },

      // Totals since startup
      totals: {
        requests: 0,
        errors: 0,
        totalResponseTime: 0,
        webhooksReceived: 0,
        webhooksProcessed: 0,
        webhookErrors: 0,
        startTime: new Date(),
      },

      // Response time percentiles
      responseTimes: [], // Last 1000 response times for percentile calculation

      // Status code distribution
      statusCodes: {},

      // Endpoint stats
      endpoints: {},

      // Rate limit events
      rateLimitEvents: [],
    };

    // Alerts
    this.alerts = [];
    this.alertCallbacks = [];

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Every minute
  }

  /**
   * Record an API request
   */
  recordRequest(endpoint, statusCode, responseTimeMs, error = null) {
    const now = Date.now();
    const secondKey = Math.floor(now / 1000);
    const minuteKey = Math.floor(now / 60000);

    // Update second bucket
    if (!this.metrics.secondBuckets.has(secondKey)) {
      this.metrics.secondBuckets.set(secondKey, { count: 0, errors: 0, totalTime: 0 });
    }
    const secondBucket = this.metrics.secondBuckets.get(secondKey);
    secondBucket.count++;
    secondBucket.totalTime += responseTimeMs;
    if (error || statusCode >= 400) {
      secondBucket.errors++;
    }

    // Update minute bucket
    if (!this.metrics.minuteBuckets.has(minuteKey)) {
      this.metrics.minuteBuckets.set(minuteKey, {
        count: 0, errors: 0, totalTime: 0, statusCodes: {}
      });
    }
    const minuteBucket = this.metrics.minuteBuckets.get(minuteKey);
    minuteBucket.count++;
    minuteBucket.totalTime += responseTimeMs;
    minuteBucket.statusCodes[statusCode] = (minuteBucket.statusCodes[statusCode] || 0) + 1;
    if (error || statusCode >= 400) {
      minuteBucket.errors++;
    }

    // Update current stats
    this.metrics.current.lastRequestTime = new Date();
    this.metrics.current.requestsThisSecond = secondBucket.count;
    this.metrics.current.requestsThisMinute = minuteBucket.count;

    // Update totals
    this.metrics.totals.requests++;
    this.metrics.totals.totalResponseTime += responseTimeMs;
    if (error || statusCode >= 400) {
      this.metrics.totals.errors++;
      this.metrics.current.lastErrorTime = new Date();
      this.metrics.current.lastError = error?.message || `HTTP ${statusCode}`;
    }

    // Track response time for percentiles (keep last 1000)
    this.metrics.responseTimes.push(responseTimeMs);
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    // Track status codes
    this.metrics.statusCodes[statusCode] = (this.metrics.statusCodes[statusCode] || 0) + 1;

    // Track endpoint stats
    if (!this.metrics.endpoints[endpoint]) {
      this.metrics.endpoints[endpoint] = { count: 0, errors: 0, totalTime: 0 };
    }
    this.metrics.endpoints[endpoint].count++;
    this.metrics.endpoints[endpoint].totalTime += responseTimeMs;
    if (error || statusCode >= 400) {
      this.metrics.endpoints[endpoint].errors++;
    }

    // Check for rate limit violation
    if (secondBucket.count > this.config.maxRequestsPerSecond) {
      this.recordRateLimitEvent('second', secondBucket.count);
    }
    if (minuteBucket.count > this.config.maxRequestsPerMinute) {
      this.recordRateLimitEvent('minute', minuteBucket.count);
    }

    // Check for alerts
    this.checkAlerts(statusCode, responseTimeMs, error);

    // Log if rate limited
    if (statusCode === 429) {
      console.log(`[DASHDOC MONITOR] Rate limited! Status 429 received`);
      this.recordRateLimitEvent('api_response', 1);
    }
  }

  /**
   * Record a webhook event
   */
  recordWebhook(eventType, success, processingTimeMs) {
    this.metrics.totals.webhooksReceived++;

    if (success) {
      this.metrics.totals.webhooksProcessed++;
    } else {
      this.metrics.totals.webhookErrors++;
    }

    // Track by event type
    if (!this.metrics.endpoints[`webhook:${eventType}`]) {
      this.metrics.endpoints[`webhook:${eventType}`] = { count: 0, errors: 0, totalTime: 0 };
    }
    const webhookStats = this.metrics.endpoints[`webhook:${eventType}`];
    webhookStats.count++;
    webhookStats.totalTime += processingTimeMs;
    if (!success) {
      webhookStats.errors++;
    }
  }

  /**
   * Record rate limit event
   */
  recordRateLimitEvent(type, count) {
    const event = {
      type,
      count,
      timestamp: new Date(),
      limit: type === 'second' ? this.config.maxRequestsPerSecond : this.config.maxRequestsPerMinute
    };

    this.metrics.rateLimitEvents.push(event);

    // Keep last 100 events
    if (this.metrics.rateLimitEvents.length > 100) {
      this.metrics.rateLimitEvents.shift();
    }

    // Trigger alert
    this.triggerAlert('rate_limit', `Rate limit exceeded: ${count} requests per ${type}`);
  }

  /**
   * Check and trigger alerts
   */
  checkAlerts(statusCode, responseTimeMs, error) {
    // High response time alert
    if (responseTimeMs > this.config.responseTimeAlertMs) {
      this.triggerAlert('slow_response', `Slow response: ${responseTimeMs}ms (threshold: ${this.config.responseTimeAlertMs}ms)`);
    }

    // Error rate check (calculate over last minute)
    const minuteKey = Math.floor(Date.now() / 60000);
    const bucket = this.metrics.minuteBuckets.get(minuteKey);
    if (bucket && bucket.count > 10) { // Only check if we have enough samples
      const errorRate = bucket.errors / bucket.count;
      if (errorRate > this.config.errorRateAlertThreshold) {
        this.triggerAlert('high_error_rate', `High error rate: ${(errorRate * 100).toFixed(1)}% (threshold: ${this.config.errorRateAlertThreshold * 100}%)`);
      }
    }

    // 5xx error alert
    if (statusCode >= 500) {
      this.triggerAlert('server_error', `Dashdoc API server error: HTTP ${statusCode}`);
    }

    // 429 rate limit response
    if (statusCode === 429) {
      this.triggerAlert('rate_limited', 'Dashdoc API returned 429 Too Many Requests');
    }
  }

  /**
   * Trigger an alert
   */
  triggerAlert(type, message) {
    const alert = {
      type,
      message,
      timestamp: new Date(),
    };

    // Deduplicate (don't trigger same alert within 1 minute)
    const recentSameAlert = this.alerts.find(a =>
      a.type === type &&
      (Date.now() - a.timestamp.getTime()) < 60000
    );

    if (!recentSameAlert) {
      this.alerts.push(alert);
      console.log(`[DASHDOC ALERT] ${type}: ${message}`);

      // Notify callbacks
      this.alertCallbacks.forEach(cb => {
        try {
          cb(alert);
        } catch (e) {
          console.error('[DASHDOC MONITOR] Alert callback error:', e);
        }
      });
    }

    // Keep last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  /**
   * Register alert callback
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get current metrics summary
   */
  getMetrics() {
    const now = Date.now();
    const uptimeMs = now - this.metrics.totals.startTime.getTime();
    const uptimeMinutes = uptimeMs / 60000;

    // Calculate percentiles
    const sortedTimes = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const p50 = sortedTimes[Math.floor(sortedTimes.length * 0.5)] || 0;
    const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0;
    const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0;

    // Get last minute stats
    const minuteKey = Math.floor(now / 60000);
    const lastMinute = this.metrics.minuteBuckets.get(minuteKey) || { count: 0, errors: 0, totalTime: 0 };

    // Calculate rates
    const requestsPerMinute = this.metrics.totals.requests / Math.max(uptimeMinutes, 1);
    const currentRequestsPerSecond = this.metrics.current.requestsThisSecond;

    return {
      summary: {
        status: this.getHealthStatus(),
        uptime: this.formatUptime(uptimeMs),
        uptimeMs,
      },

      rateLimit: {
        configuredLimit: `${this.config.maxRequestsPerSecond} req/s`,
        currentRate: `${currentRequestsPerSecond} req/s`,
        isWithinLimit: currentRequestsPerSecond <= this.config.maxRequestsPerSecond,
        recentViolations: this.metrics.rateLimitEvents.filter(e =>
          (now - e.timestamp.getTime()) < 300000 // Last 5 minutes
        ).length,
      },

      requests: {
        total: this.metrics.totals.requests,
        lastMinute: lastMinute.count,
        averagePerMinute: Math.round(requestsPerMinute * 10) / 10,
        errors: this.metrics.totals.errors,
        errorRate: this.metrics.totals.requests > 0
          ? `${((this.metrics.totals.errors / this.metrics.totals.requests) * 100).toFixed(2)}%`
          : '0%',
      },

      responseTimes: {
        average: this.metrics.totals.requests > 0
          ? Math.round(this.metrics.totals.totalResponseTime / this.metrics.totals.requests)
          : 0,
        p50,
        p95,
        p99,
        unit: 'ms',
      },

      webhooks: {
        received: this.metrics.totals.webhooksReceived,
        processed: this.metrics.totals.webhooksProcessed,
        errors: this.metrics.totals.webhookErrors,
        successRate: this.metrics.totals.webhooksReceived > 0
          ? `${((this.metrics.totals.webhooksProcessed / this.metrics.totals.webhooksReceived) * 100).toFixed(1)}%`
          : '100%',
      },

      statusCodes: this.metrics.statusCodes,

      endpoints: Object.entries(this.metrics.endpoints).map(([name, stats]) => ({
        name,
        count: stats.count,
        errors: stats.errors,
        avgResponseTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
      })).sort((a, b) => b.count - a.count).slice(0, 10),

      recentAlerts: this.alerts.slice(-10).reverse(),

      lastRequest: this.metrics.current.lastRequestTime,
      lastError: this.metrics.current.lastError,
      lastErrorTime: this.metrics.current.lastErrorTime,
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const now = Date.now();

    // Check for recent errors
    const minuteKey = Math.floor(now / 60000);
    const lastMinute = this.metrics.minuteBuckets.get(minuteKey);

    if (lastMinute && lastMinute.count > 0) {
      const errorRate = lastMinute.errors / lastMinute.count;
      if (errorRate > 0.5) return 'critical';
      if (errorRate > 0.1) return 'degraded';
    }

    // Check for rate limit violations
    const recentViolations = this.metrics.rateLimitEvents.filter(e =>
      (now - e.timestamp.getTime()) < 60000
    ).length;
    if (recentViolations > 5) return 'degraded';

    // Check for recent activity
    if (this.metrics.current.lastRequestTime) {
      const timeSinceLastRequest = now - this.metrics.current.lastRequestTime.getTime();
      if (timeSinceLastRequest > 300000) return 'idle'; // 5 minutes
    }

    return 'healthy';
  }

  /**
   * Format uptime
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Cleanup old data
   */
  cleanup() {
    const now = Date.now();
    const cutoffSecond = Math.floor(now / 1000) - 120; // Keep 2 minutes of second data
    const cutoffMinute = Math.floor(now / 60000) - this.config.metricsRetentionMinutes;

    // Cleanup second buckets
    for (const [key] of this.metrics.secondBuckets) {
      if (key < cutoffSecond) {
        this.metrics.secondBuckets.delete(key);
      }
    }

    // Cleanup minute buckets
    for (const [key] of this.metrics.minuteBuckets) {
      if (key < cutoffMinute) {
        this.metrics.minuteBuckets.delete(key);
      }
    }
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
let monitoringInstance = null;

function getMonitoringService(options = {}) {
  if (!monitoringInstance) {
    monitoringInstance = new DashdocMonitoringService(options);
  }
  return monitoringInstance;
}

module.exports = {
  DashdocMonitoringService,
  getMonitoringService,
};
