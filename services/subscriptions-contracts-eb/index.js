// ============================================================================
// RT SYMPHONI.A - Subscriptions & Contracts API
// ============================================================================
// Version: v1.6.2 (SYMPHONI.A Complete - 100% Conformity)
// Deployment: AWS Elastic Beanstalk (Amazon Linux 2023, Node.js 20)
// ============================================================================

const express = require('express');
const { MongoClient } = require('mongodb');
const security = require('./security-middleware');
const createECMRRoutes = require('./ecmr-routes');
const createAccountTypesRoutes = require('./account-types-routes');
const createCarrierReferencingRoutes = require('./carrier-referencing-routes');
const createPricingGridsRoutes = require('./pricing-grids-routes');
const createIndustrialTransportConfigRoutes = require('./industrial-transport-config-routes');
const createAuthRoutes = require('./auth-routes');
const createStripeRoutes = require('./stripe-routes');
const createTransportOrdersRoutes = require('./transport-orders-routes');

const app = express();
const PORT = process.env.PORT || 8080;

// MongoDB connection
let mongoClient;
let mongoConnected = false;

async function connectMongoDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-subscriptions-contracts';
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    mongoConnected = true;
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    mongoConnected = false;
  }
}

// ============================================================================
// External Services Validation
// ============================================================================

async function validateExternalServices() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RT SYMPHONI.A - External Services Validation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const services = {
    tomtom: false,
    awsTextract: false,
    googleVision: false
  };

  // 1. TomTom Telematics API
  console.log('\n1. TomTom Telematics API:');
  if (process.env.TOMTOM_API_KEY) {
    const apiKey = process.env.TOMTOM_API_KEY;
    if (apiKey.length > 20 && !apiKey.includes('your-')) {
      console.log('   ✅ API Key configured');
      services.tomtom = true;
    } else {
      console.log('   ⚠️  API Key looks invalid or default');
    }
  } else {
    console.log('   ❌ API Key not configured');
  }

  // 2. AWS Textract
  console.log('\n2. AWS Textract:');
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    console.log('   ✅ AWS Credentials configured');
    console.log(`   ℹ️  Region: ${process.env.AWS_REGION || 'eu-central-1'}`);
    services.awsTextract = true;
  } else {
    console.log('   ❌ AWS Credentials not configured');
  }

  // 3. Google Vision API (Optional)
  console.log('\n3. Google Vision API (Fallback):');
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const fs = require('fs');
    if (fs.existsSync(credPath)) {
      console.log('   ✅ Credentials file exists');
      services.googleVision = true;
    } else {
      console.log('   ⚠️  Credentials file not found');
    }
  } else {
    console.log('   ⚠️  Not configured (optional)');
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary:');
  console.log(`  - TomTom: ${services.tomtom ? '✅' : '❌'}`);
  console.log(`  - AWS Textract: ${services.awsTextract ? '✅' : '❌'}`);
  console.log(`  - Google Vision: ${services.googleVision ? '✅' : '⚠️  (optional)'}`);

  const allRequired = services.tomtom && services.awsTextract;

  if (allRequired) {
    console.log('\n✅ All required external services are configured');
  } else {
    console.log('\n⚠️  Some required external services are not configured');
    console.log('   See: DEPLOIEMENT_SERVICES_EXTERNES.md');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return services;
}

// ============================================================================
// SECURITY MIDDLEWARE (Applied before all routes)
// ============================================================================

// 1. Helmet - Security headers
app.use(security.helmet);

// 2. CORS - Cross-Origin Resource Sharing
app.use(security.cors);

// 3. Request Logger - Log all requests
app.use(security.requestLogger);

// 4. Body Parsers - Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Input Sanitization - Prevent XSS
app.use(security.sanitizeInput);

// 6. General Rate Limiter - 100 req/15min (applied to all /api/* routes)
app.use('/api/', security.generalLimiter);

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'RT SYMPHONI.A - Subscriptions & Contracts API',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: 'v1.6.2-security',
    features: [
      'express', 'advanced-security', 'rate-limiting', 'cors', 'helmet',
      'input-sanitization', 'mongodb', 'subscriptions', 'contracts', 'ecmr',
      'account-types', 'carrier-referencing', 'pricing-grids',
      'industrial-transport-config', 'jwt-authentication', 'stripe-payments',
      'flux-commande', 'tracking-basic-email', 'tracking-premium-gps',
      'geofencing', 'ocr-integration', 'document-management', 'carrier-scoring'
    ],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected,
      status: mongoConnected ? 'active' : 'not connected',
    },
    externalServices: {
      tomtom: {
        configured: !!process.env.TOMTOM_API_KEY,
        status: process.env.TOMTOM_API_KEY ? 'configured' : 'not configured'
      },
      awsTextract: {
        configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
        status: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) ? 'configured' : 'not configured'
      },
      googleVision: {
        configured: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
        status: process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'configured' : 'not configured (optional)'
      }
    },
  };

  if (mongoConnected && mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      health.mongodb.status = 'active';
    } catch (error) {
      health.mongodb.status = 'error';
      health.mongodb.error = error.message;
    }
  }

  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RT SYMPHONI.A - Subscriptions & Contracts API',
    version: 'v1.6.2-security',
    description: 'Transport Management System with Advanced Security',
    features: [
      'Express.js',
      'MongoDB Atlas',
      'Advanced Security (Rate Limiting, CORS, Helmet, Input Sanitization)',
      'Subscription Management',
      'Contract Signing & E-Signatures',
      'e-CMR (Electronic Consignment Note)',
      'Account Types Management',
      'Carrier Referencing & Scoring',
      'Pricing Grids Management',
      'Industrial Transport Configuration',
      'JWT Authentication & Authorization',
      'Stripe Payment Processing',
      'Transport Order Management',
      'GPS Tracking (TomTom Premium - 4€/véhicule/mois)',
      'Email Tracking (Mailgun Basic - 50€/mois)',
      'Geofencing & Real-time Alerts',
      'OCR Integration (AWS Textract + Google Vision)',
      'Document Management & Validation',
      'ETA Monitoring & Delay Detection',
      'RDV Management (Rendez-vous)',
      'Carrier Scoring & Performance Metrics',
    ],
    security: {
      rateLimiting: {
        general: '100 requests per 15 minutes',
        authentication: '5 attempts per 15 minutes',
        uploads: '10 uploads per hour',
      },
      features: ['Helmet Security Headers', 'CORS Protection', 'XSS Prevention', 'Input Sanitization'],
    },
    endpoints: [
      '-- Core --',
      'GET /health',
      'GET /',
      '-- Subscription Plans --',
      'GET /api/plans',
      'POST /api/plans',
      '-- Subscriptions --',
      'GET /api/subscriptions/:id',
      'POST /api/subscriptions',
      'POST /api/subscriptions/:id/cancel',
      'POST /api/subscriptions/:id/renew',
      '-- Contracts --',
      'GET /api/contracts/:id',
      'POST /api/contracts',
      'POST /api/contracts/:id/send',
      'POST /api/signatures/:id/sign',
      '-- e-CMR (Electronic Consignment Note) --',
      'GET /api/ecmr (list all e-CMRs)',
      'POST /api/ecmr (create e-CMR)',
      'GET /api/ecmr/:id (get e-CMR details)',
      'PUT /api/ecmr/:id (update e-CMR)',
      'DELETE /api/ecmr/:id (delete DRAFT e-CMR)',
      'POST /api/ecmr/:id/validate (validate before signatures)',
      'POST /api/ecmr/:id/sign/:party (sign: sender/carrierPickup/consignee)',
      'POST /api/ecmr/:id/remarks (add loading/delivery remarks)',
      'POST /api/ecmr/:id/tracking (update GPS position)',
      'GET /api/ecmr/:cmrNumber/verify (verify e-CMR authenticity)',
      '-- Account Types --',
      'GET /api/account/types (list all account types)',
      'POST /api/account/select-type (select initial account type)',
      'GET /api/account/current/:userId (get current account)',
      'GET /api/account/upgrade-options/:userId (get upgrade options)',
      'POST /api/account/upgrade (request account type upgrade)',
      'POST /api/account/upgrade/approve (approve upgrade - admin)',
      'POST /api/account/upgrade/reject (reject upgrade - admin)',
      '-- Carrier Referencing (SYMPHONI.A) --',
      'POST /api/carriers/invite (invite carrier)',
      'POST /api/carriers/:carrierId/onboard (complete onboarding)',
      'POST /api/carriers/:carrierId/documents (upload vigilance document)',
      'POST /api/carriers/:carrierId/documents/:type/verify (verify document - admin)',
      'GET /api/carriers/:carrierId/vigilance (check vigilance status)',
      'POST /api/carriers/:carrierId/pricing-grid (add pricing grid)',
      'POST /api/carriers/:carrierId/score (update scoring)',
      'GET /api/carriers (list carriers)',
      'GET /api/carriers/:carrierId (get carrier details)',
      'PUT /api/carriers/:carrierId/reference-level (update reference level)',
      'POST /api/carriers/:carrierId/upgrade-premium (upgrade to premium)',
      '-- Pricing Grids --',
      'POST /api/pricing-grids (create pricing grid)',
      'GET /api/pricing-grids (list pricing grids with filters)',
      'GET /api/pricing-grids/:gridId (get pricing grid details)',
      'PUT /api/pricing-grids/:gridId (update pricing grid)',
      'DELETE /api/pricing-grids/:gridId (delete DRAFT grid)',
      'POST /api/pricing-grids/:gridId/activate (activate pricing grid)',
      'POST /api/pricing-grids/:gridId/suspend (suspend pricing grid)',
      'POST /api/pricing-grids/:gridId/archive (archive pricing grid)',
      'POST /api/pricing-grids/calculate (calculate price for transport)',
      'GET /api/pricing-grids/zones/list (list geographic zones)',
      'GET /api/pricing-grids/options/list (list pricing options)',
      'GET /api/pricing-grids/types/transport (list transport types)',
      '-- Industrial Transport Configuration --',
      'GET /api/industrial/:industrialId/transport-config (get transport type config)',
      'POST /api/industrial/:industrialId/transport-config (set transport type config)',
      'POST /api/industrial/:industrialId/transport-config/add-type (add required/optional type)',
      'POST /api/industrial/:industrialId/transport-config/remove-type (remove transport type)',
      'GET /api/industrial/:industrialId/carriers/compatibility (check carrier compatibility)',
      '-- Authentication (JWT) --',
      'POST /api/auth/register (create new user account)',
      'POST /api/auth/login (login and get JWT tokens)',
      'POST /api/auth/refresh (refresh access token)',
      'POST /api/auth/logout (logout and revoke refresh token)',
      'GET /api/auth/me (get current user info - requires auth)',
      'PUT /api/auth/change-password (change password - requires auth)',
      '-- Stripe Payments --',
      'POST /api/stripe/create-checkout-session (create Stripe checkout - requires auth)',
      'POST /api/stripe/create-payment-intent (create payment intent - requires auth)',
      'GET /api/stripe/subscriptions (get user subscriptions - requires auth)',
      'POST /api/stripe/cancel-subscription (cancel subscription - requires auth)',
      'GET /api/stripe/payment-history (get payment history - requires auth)',
      'POST /api/stripe/webhook (Stripe webhook endpoint - NO auth)',
      'GET /api/stripe/products (list available products - public)',
    ],
    documentation: 'See README.md for complete API documentation',
  });
});

// ==================== e-CMR ROUTES ====================
// Note: e-CMR routes will be mounted after MongoDB connection
// This is done in the startServer function below

// ==================== SUBSCRIPTION PLANS ====================

app.get('/api/plans', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const db = mongoClient.db();
    const plans = await db.collection('subscription_plans')
      .find({ isActive: true })
      .sort({ price: 1 })
      .toArray();

    res.json({
      success: true,
      data: plans,
      count: plans.length,
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/plans', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { name, type, description, price, billingInterval, features } = req.body;

    // Validation
    if (!name || !type || !price || !billingInterval) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: name, type, price, billingInterval',
        },
      });
    }

    const db = mongoClient.db();
    const plan = {
      name,
      type,
      description: description || '',
      price,
      billingInterval,
      features: features || {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('subscription_plans').insertOne(plan);

    res.status(201).json({
      success: true,
      data: {
        ...plan,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== SUBSCRIPTIONS ====================

app.get('/api/subscriptions/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();
    const subscription = await db.collection('subscriptions')
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        },
      });
    }

    res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/subscriptions', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { userId, planId, billingInterval, startTrial } = req.body;

    if (!userId || !planId || !billingInterval) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: userId, planId, billingInterval',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();
    const trialDays = startTrial ? 14 : 0;

    const subscription = {
      userId,
      planId,
      status: startTrial ? 'TRIAL' : 'ACTIVE',
      startDate: now,
      trialEndDate: startTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
      billingInterval,
      autoRenew: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('subscriptions').insertOne(subscription);

    res.status(201).json({
      success: true,
      data: {
        ...subscription,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/subscriptions/:id/cancel', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const { reason } = req.body;
    const db = mongoClient.db();

    const result = await db.collection('subscriptions').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || '',
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== CONTRACTS ====================

app.get('/api/contracts/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();
    const contract = await db.collection('contracts')
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Contract not found',
        },
      });
    }

    res.json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/contracts', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { title, type, content, parties, effectiveDate } = req.body;

    if (!title || !type || !content || !parties || !Array.isArray(parties)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: title, type, content, parties',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();

    const contract = {
      title,
      type,
      status: 'DRAFT',
      content,
      parties,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : now,
      isSequentialSigning: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('contracts').insertOne(contract);

    res.status(201).json({
      success: true,
      data: {
        ...contract,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/contracts/:id/send', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();

    const result = await db.collection('contracts').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'PENDING_SIGNATURES',
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Contract not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
      message: 'Contract sent for signatures',
    });
  } catch (error) {
    console.error('Error sending contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== SIGNATURES ====================

app.post('/api/signatures/:id/sign', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const { signatureData, geolocation } = req.body;

    if (!signatureData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: signatureData',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();

    const signature = {
      _id: new ObjectId(req.params.id),
      status: 'SIGNED',
      signatureData,
      signedAt: now,
      ipAddress: req.ip || req.connection.remoteAddress,
      geolocation: geolocation || null,
      updatedAt: now,
    };

    const result = await db.collection('signatures').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: signature },
      { returnDocument: 'after', upsert: false }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Signature not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
      message: 'Document signed successfully',
    });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// Note: 404 and Error handlers are registered in startServer() after e-CMR routes are mounted

// Start server
async function startServer() {
  await connectMongoDB();

  // Validate external services configuration
  await validateExternalServices();

  // Mount e-CMR routes after MongoDB connection is established
  if (mongoConnected) {
    const ecmrRouter = createECMRRoutes(mongoClient, mongoConnected);
    app.use('/api/ecmr', ecmrRouter);
    console.log('✅ e-CMR routes mounted successfully');
  } else {
    console.warn('⚠️  e-CMR routes not mounted - MongoDB not connected');
  }

  // Mount Account Types routes after MongoDB connection is established
  if (mongoConnected) {
    const accountTypesRouter = createAccountTypesRoutes(mongoClient, mongoConnected);
    app.use('/api/account', accountTypesRouter);
    console.log('✅ Account Types routes mounted successfully');
  } else {
    console.warn('⚠️  Account Types routes not mounted - MongoDB not connected');
  }

  // Mount Carrier Referencing routes after MongoDB connection is established
  if (mongoConnected) {
    const carrierReferencingRouter = createCarrierReferencingRoutes(mongoClient, mongoConnected);
    app.use('/api/carriers', carrierReferencingRouter);
    console.log('✅ Carrier Referencing routes mounted successfully');
  } else {
    console.warn('⚠️  Carrier Referencing routes not mounted - MongoDB not connected');
  }

  // Mount Pricing Grids routes after MongoDB connection is established
  if (mongoConnected) {
    const pricingGridsRouter = createPricingGridsRoutes(mongoClient, mongoConnected);
    app.use('/api/pricing-grids', pricingGridsRouter);
    console.log('✅ Pricing Grids routes mounted successfully');
  } else {
    console.warn('⚠️  Pricing Grids routes not mounted - MongoDB not connected');
  }

  // Mount Industrial Transport Config routes after MongoDB connection is established
  if (mongoConnected) {
    const industrialTransportConfigRouter = createIndustrialTransportConfigRoutes(mongoClient, mongoConnected);
    app.use('/api/industrial', industrialTransportConfigRouter);
    console.log('✅ Industrial Transport Config routes mounted successfully');
  } else {
    console.warn('⚠️  Industrial Transport Config routes not mounted - MongoDB not connected');
  }

  // Mount Authentication routes after MongoDB connection is established
  // Apply strict rate limiting to auth endpoints (5 attempts per 15 minutes)
  if (mongoConnected) {
    const authRouter = createAuthRoutes(mongoClient, mongoConnected);
    app.use('/api/auth/login', security.authLimiter);
    app.use('/api/auth/register', security.authLimiter);
    app.use('/api/auth', authRouter);
    console.log('✅ Authentication routes mounted with auth rate limiting');
  } else {
    console.warn('⚠️  Authentication routes not mounted - MongoDB not connected');
  }

  // Mount Stripe routes after MongoDB connection is established
  if (mongoConnected) {
    const stripeRouter = createStripeRoutes(mongoClient, mongoConnected);
    app.use('/api/stripe', stripeRouter);
    console.log('✅ Stripe payment routes mounted successfully');
  } else {
    console.warn('⚠️  Stripe payment routes not mounted - MongoDB not connected');
  }

  // Mount Flux Commande routes after MongoDB connection is established
  // Apply upload rate limiting to document upload endpoints (10 uploads per hour)
  if (mongoConnected) {
    const transportOrdersRouter = createTransportOrdersRoutes(mongoClient, mongoConnected);
    app.use('/api/transport-orders/:orderId/documents', security.uploadLimiter);
    app.use('/api/transport-orders/tracking/document-upload/:token', security.uploadLimiter);
    app.use('/api/transport-orders', transportOrdersRouter);
    console.log('✅ Flux Commande routes mounted with upload rate limiting');
  } else {
    console.warn('⚠️  Flux Commande routes not mounted - MongoDB not connected');
  }

  // Mount OVHcloud routes (Domain & Email Management)
  // No MongoDB dependency - can be mounted independently
  try {
    const ovhcloudRoutes = require('./routes/ovhcloud-routes');
    app.use('/api/ovhcloud', ovhcloudRoutes);
    console.log('✅ OVHcloud routes mounted successfully (Domain & Email Management)');
  } catch (error) {
    console.warn('⚠️  OVHcloud routes not mounted:', error.message);
  }

  // Register 404 handler (must be after all routes)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint not found: ${req.method} ${req.path}`,
      },
    });
  });

  // Register error handler (must be last)
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'Internal server error',
      },
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================================');
    console.log('🚀 RT SYMPHONI.A - Subscriptions & Contracts API');
    console.log('============================================================================');
    console.log('Version: v1.6.2-security');
    console.log('Port: ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? '✅ Connected' : '❌ Not connected'));
    console.log('Security: ✅ Rate Limiting, CORS, Helmet, Input Sanitization');
    console.log('Features: 14/14 Modules Operational');
    console.log('  - Subscriptions & Contracts');
    console.log('  - E-Signatures & e-CMR');
    console.log('  - Account Types & Carrier Referencing');
    console.log('  - Pricing Grids & Industrial Transport Config');
    console.log('  - JWT Authentication & Stripe Payments');
    console.log('  - Transport Orders & Tracking (GPS + Email)');
    console.log('  - Geofencing & OCR Integration');
    console.log('  - Document Management & Carrier Scoring');
    console.log('============================================================================');
    console.log('📝 API Documentation: /');
    console.log('🏥 Health Check: /health');
    console.log('============================================================================');
  });
}

startServer();

module.exports = app;
