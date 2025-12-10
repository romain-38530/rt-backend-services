// RT Affret IA API with Express and MongoDB
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

// Route alias: /api/v1/affret-ia/* -> /api/affret-ia/*
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/affret-ia')) {
    req.url = req.originalUrl.replace('/api/v1/affret-ia', '/api/affret-ia');
  }
  next();
});

// ========== Affret-IA API Routes ==========

// Health check for affret-ia API
app.get('/api/affret-ia/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'affret-ia-api',
    timestamp: new Date().toISOString(),
    mongodb: mongoConnected ? 'connected' : 'not connected'
  });
});

// Get transport needs list
app.get('/api/affret-ia/needs', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const needs = await db.collection('transport_needs').find({}).limit(100).toArray();
    res.json({ success: true, data: needs });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transport needs' });
  }
});

// Create transport need
app.post('/api/affret-ia/needs', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const need = { ...req.body, createdAt: new Date(), status: 'pending' };
    const result = await db.collection('transport_needs').insertOne(need);
    need._id = result.insertedId;
    res.status(201).json({ success: true, data: need });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create transport need' });
  }
});

// Get transport offers
app.get('/api/affret-ia/offers', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    const offers = await db.collection('transport_offers').find({}).limit(100).toArray();
    res.json({ success: true, data: offers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transport offers' });
  }
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'affret-ia',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    features: ['express', 'cors', 'helmet', 'mongodb'],
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
    message: 'RT Affret IA API',
    version: '1.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /'
    ]
  });
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Affret IA API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
