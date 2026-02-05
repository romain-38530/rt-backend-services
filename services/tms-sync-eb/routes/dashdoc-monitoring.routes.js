/**
 * Dashdoc API Monitoring Routes
 * Exposes monitoring metrics and health status
 */

const express = require('express');
const router = express.Router();
const { getMonitoringService } = require('../services/dashdoc-monitoring.service');

/**
 * GET /api/v1/monitoring/dashdoc
 * Get full monitoring metrics
 */
router.get('/', (req, res) => {
  try {
    const monitoring = getMonitoringService();
    const metrics = monitoring.getMetrics();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      service: 'Dashdoc API Monitoring',
      ...metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/monitoring/dashdoc/health
 * Quick health check
 */
router.get('/health', (req, res) => {
  try {
    const monitoring = getMonitoringService();
    const metrics = monitoring.getMetrics();

    const statusCode = metrics.summary.status === 'healthy' ? 200 :
                       metrics.summary.status === 'degraded' ? 200 :
                       metrics.summary.status === 'idle' ? 200 : 503;

    res.status(statusCode).json({
      success: true,
      status: metrics.summary.status,
      uptime: metrics.summary.uptime,
      rateLimit: metrics.rateLimit,
      requests: {
        total: metrics.requests.total,
        lastMinute: metrics.requests.lastMinute,
        errorRate: metrics.requests.errorRate,
      },
      responseTimes: {
        average: metrics.responseTimes.average,
        p95: metrics.responseTimes.p95,
      },
      lastRequest: metrics.lastRequest,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/monitoring/dashdoc/alerts
 * Get recent alerts
 */
router.get('/alerts', (req, res) => {
  try {
    const monitoring = getMonitoringService();
    const metrics = monitoring.getMetrics();

    res.json({
      success: true,
      count: metrics.recentAlerts.length,
      alerts: metrics.recentAlerts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/monitoring/dashdoc/rate-limit
 * Get rate limit status
 */
router.get('/rate-limit', (req, res) => {
  try {
    const monitoring = getMonitoringService();
    const metrics = monitoring.getMetrics();

    res.json({
      success: true,
      rateLimit: {
        ...metrics.rateLimit,
        configuredMaxPerSecond: 2,
        configuredMaxPerMinute: 120,
        recommendation: metrics.rateLimit.isWithinLimit
          ? 'Operating within limits'
          : 'Consider reducing request frequency',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/monitoring/dashdoc/webhooks
 * Get webhook stats
 */
router.get('/webhooks', (req, res) => {
  try {
    const monitoring = getMonitoringService();
    const metrics = monitoring.getMetrics();

    // Filter webhook endpoints
    const webhookEndpoints = metrics.endpoints.filter(e => e.name.startsWith('webhook:'));

    res.json({
      success: true,
      webhooks: {
        ...metrics.webhooks,
        byEventType: webhookEndpoints,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
