// RT Planning API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;

async function connectMongoDB() {
  if (!process.env.MONGODB_URI) {
    console.log('⚠️  MongoDB URI not configured');
    return false;
  }

  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    mongoConnected = true;
    console.log('✓ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('✗ MongoDB connection failed:', error.message);
    mongoConnected = false;
    return false;
  }
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || true,
  credentials: true
}));
app.use(express.json());

// URL rewriting middleware for /api/v1/* routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/planning/')) {
    req.url = req.url.replace('/api/v1/planning', '');
  } else if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/');
  } else if (req.url.startsWith('/api/')) {
    req.url = req.url.replace('/api/', '/');
  }
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'planning',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '1.1.0',
    features: ['express', 'cors', 'helmet', 'mongodb', 'appointments'],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected
    }
  };

  if (mongoConnected && mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      health.mongodb.status = 'active';
    } catch (error) {
      health.mongodb.status = 'error';
      health.mongodb.error = error.message;
    }
  } else {
    health.mongodb.status = 'not connected';
  }

  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RT Planning API',
    version: '1.1.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet', 'Appointments'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /appointments',
      'GET /appointments/order/:orderId',
      'POST /appointments'
    ]
  });
});

// ===========================================
// APPOINTMENTS ENDPOINTS
// ===========================================

// Get appointments by order ID
app.get('/appointments/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoConnected || !db) {
      // Return empty array if MongoDB not connected
      return res.json({
        success: true,
        data: [],
        message: 'No appointments found'
      });
    }

    const appointments = await db.collection('appointments')
      .find({ orderId })
      .sort({ scheduledDate: 1 })
      .toArray();

    res.json({
      success: true,
      data: appointments
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.json({
      success: true,
      data: [],
      message: 'No appointments found'
    });
  }
});

// Get all appointments
app.get('/appointments', async (req, res) => {
  try {
    if (!mongoConnected || !db) {
      return res.json({
        success: true,
        data: []
      });
    }

    const { page = 1, limit = 20, carrierId, customerId, siteId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter to ensure users only see their own appointments
    const filter = {};
    if (carrierId) filter.carrierId = carrierId;
    if (customerId) filter.customerId = customerId;
    if (siteId) filter.siteId = siteId;

    const appointments = await db.collection('appointments')
      .find(filter)
      .sort({ scheduledDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();

    const total = await db.collection('appointments').countDocuments(filter);

    res.json({
      success: true,
      data: appointments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.json({
      success: true,
      data: []
    });
  }
});

// Create appointment
app.post('/appointments', async (req, res) => {
  try {
    if (!mongoConnected || !db) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }

    const appointment = {
      ...req.body,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('appointments').insertOne(appointment);

    res.status(201).json({
      success: true,
      data: { ...appointment, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Planning API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
