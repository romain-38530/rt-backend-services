// RT Subscriptions-Contracts Service - Standalone Version
// Version 1.0.0 - Ready for Elastic Beanstalk deployment

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

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

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'subscriptions-contracts',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    features: ['express', 'cors', 'helmet', 'mongodb', 'subscriptions', 'contracts'],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected,
      status: mongoConnected ? 'active' : 'not connected',
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
    message: 'RT Subscriptions & Contracts API',
    version: '1.0.0',
    features: [
      'Express',
      'MongoDB',
      'CORS',
      'Helmet',
      'Subscription Management',
      'Contract Signing',
      'E-Signatures',
      'Invoice Management',
    ],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/plans',
      'POST /api/plans',
      'GET /api/subscriptions/:id',
      'POST /api/subscriptions',
      'POST /api/subscriptions/:id/cancel',
      'POST /api/subscriptions/:id/renew',
      'GET /api/contracts/:id',
      'POST /api/contracts',
      'POST /api/contracts/:id/send',
      'POST /api/signatures/:id/sign',
    ],
    documentation: 'See README.md for complete API documentation',
  });
});

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

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`,
    },
  });
});

// Error handler
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

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Subscriptions-Contracts API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
    console.log('Features: Subscriptions, Contracts, E-Signatures');
  });
}

startServer();

module.exports = app;
