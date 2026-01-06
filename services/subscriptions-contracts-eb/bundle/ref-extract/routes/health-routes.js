// ============================================================================
// RT SYMPHONI.A - Enhanced Health Check Routes
// ============================================================================
// Version: 1.0.0
// Description: Comprehensive health check endpoints with dependency verification
// ============================================================================

const express = require('express');
const os = require('os');
const { collectHealthMetrics } = require('../middleware/monitoring-middleware');

function createHealthRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // ============================================================================
  // BASIC HEALTH CHECK
  // ============================================================================

  router.get('/', async (req, res) => {
    const health = {
      status: 'healthy',
      service: 'RT SYMPHONI.A - Subscriptions & Contracts API',
      timestamp: new Date().toISOString(),
      version: 'v1.6.2-security',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    };

    res.status(200).json(health);
  });

  // ============================================================================
  // DETAILED HEALTH CHECK
  // ============================================================================

  router.get('/detailed', async (req, res) => {
    const startTime = Date.now();
    const checks = {};

    // 1. MongoDB Check
    checks.mongodb = await checkMongoDB(mongoClient, mongoConnected);

    // 2. Memory Check
    checks.memory = checkMemory();

    // 3. Disk Check
    checks.disk = checkDisk();

    // 4. CPU Check
    checks.cpu = checkCPU();

    // 5. External Services Check (optional)
    checks.externalServices = await checkExternalServices();

    // Calculate overall health
    const allHealthy = Object.values(checks).every(check => check.status === 'healthy');
    const overallStatus = allHealthy ? 'healthy' : 'degraded';

    const health = {
      status: overallStatus,
      service: 'RT SYMPHONI.A - Subscriptions & Contracts API',
      version: 'v1.6.2-security',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks,
      responseTime: Date.now() - startTime
    };

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // ============================================================================
  // READINESS CHECK (for load balancers)
  // ============================================================================

  router.get('/ready', async (req, res) => {
    // Check if critical dependencies are ready
    const mongoReady = await isMongoDBReady(mongoClient, mongoConnected);

    if (mongoReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        reason: 'MongoDB not connected',
        timestamp: new Date().toISOString()
      });
    }
  });

  // ============================================================================
  // LIVENESS CHECK (for container orchestration)
  // ============================================================================

  router.get('/live', (req, res) => {
    // Simple check to verify the process is alive
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // ============================================================================
  // METRICS ENDPOINT
  // ============================================================================

  router.get('/metrics', async (req, res) => {
    try {
      const metrics = await collectHealthMetrics();

      // Add additional metrics
      const extendedMetrics = {
        ...metrics,
        system: {
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
          loadAverage: os.loadavg()
        },
        process: {
          pid: process.pid,
          nodeVersion: process.version,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage()
        }
      };

      res.status(200).json(extendedMetrics);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to collect metrics',
        message: error.message
      });
    }
  });

  return router;
}

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

/**
 * Check MongoDB connection
 */
async function checkMongoDB(mongoClient, mongoConnected) {
  if (!mongoConnected || !mongoClient) {
    return {
      status: 'unhealthy',
      message: 'MongoDB not connected',
      configured: !!process.env.MONGODB_URI
    };
  }

  try {
    const startTime = Date.now();
    await mongoClient.db().admin().ping();
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      message: 'MongoDB connection active',
      responseTime,
      configured: true
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: 'MongoDB ping failed',
      error: error.message
    };
  }
}

/**
 * Check if MongoDB is ready
 */
async function isMongoDBReady(mongoClient, mongoConnected) {
  if (!mongoConnected || !mongoClient) {
    return false;
  }

  try {
    await mongoClient.db().admin().ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check memory usage
 */
function checkMemory() {
  const usage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = (usedMemory / totalMemory) * 100;

  const status = memoryUsagePercent > 90 ? 'critical' :
                 memoryUsagePercent > 75 ? 'warning' : 'healthy';

  return {
    status,
    message: `Memory usage at ${memoryUsagePercent.toFixed(2)}%`,
    details: {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      totalMemory,
      freeMemory,
      usedMemory,
      usagePercent: memoryUsagePercent.toFixed(2)
    }
  };
}

/**
 * Check disk space
 */
function checkDisk() {
  // Note: This is a simplified check
  // In production, use a proper disk space monitoring library
  return {
    status: 'healthy',
    message: 'Disk space check not implemented',
    note: 'Use CloudWatch metrics for disk monitoring'
  };
}

/**
 * Check CPU usage
 */
function checkCPU() {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const cpuCount = cpus.length;

  // Load average over 1 minute
  const loadPercent = (loadAvg[0] / cpuCount) * 100;

  const status = loadPercent > 90 ? 'critical' :
                 loadPercent > 75 ? 'warning' : 'healthy';

  return {
    status,
    message: `CPU load at ${loadPercent.toFixed(2)}%`,
    details: {
      cpuCount,
      loadAverage: {
        '1min': loadAvg[0],
        '5min': loadAvg[1],
        '15min': loadAvg[2]
      },
      loadPercent: loadPercent.toFixed(2)
    }
  };
}

/**
 * Check external services (optional)
 */
async function checkExternalServices() {
  const services = {
    stripe: checkStripeConfig(),
    mailgun: checkMailgunConfig(),
    aws: checkAWSConfig()
  };

  const allHealthy = Object.values(services).every(s => s.status === 'healthy');

  return {
    status: allHealthy ? 'healthy' : 'warning',
    message: allHealthy ? 'All external services configured' : 'Some services not configured',
    services
  };
}

/**
 * Check Stripe configuration
 */
function checkStripeConfig() {
  const configured = !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY);

  return {
    status: configured ? 'healthy' : 'warning',
    configured,
    message: configured ? 'Stripe configured' : 'Stripe not configured'
  };
}

/**
 * Check Mailgun configuration
 */
function checkMailgunConfig() {
  const configured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);

  return {
    status: configured ? 'healthy' : 'warning',
    configured,
    message: configured ? 'Mailgun configured' : 'Mailgun not configured'
  };
}

/**
 * Check AWS configuration
 */
function checkAWSConfig() {
  const configured = !!(process.env.AWS_REGION);

  return {
    status: configured ? 'healthy' : 'warning',
    configured,
    message: configured ? 'AWS configured' : 'AWS not configured'
  };
}

module.exports = createHealthRoutes;
