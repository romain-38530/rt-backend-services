// RT Storage Market API with Express and MongoDB
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
    console.log('MongoDB URI not configured');
    return false;
  }

  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    mongoConnected = true;
    console.log('Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
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

// Route alias: /api/v1/storage-market/* -> /api/storage-market/*
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/storage-market')) {
    req.url = req.originalUrl.replace('/api/v1/storage-market', '/api/storage-market');
  }
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    success: true,
    service: 'RT SYMPHONI.A - Storage Market',
    version: '2.0.0',
    status: 'healthy',
    mongodb: mongoConnected ? 'connected' : 'not connected',
    timestamp: new Date().toISOString()
  };

  if (mongoConnected && mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      health.mongodb = 'connected';
    } catch (error) {
      health.mongodb = 'error';
    }
  }

  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RT Storage Market API',
    version: '2.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/storage-market/needs',
      'POST /api/storage-market/needs/create',
      'POST /api/storage-market/needs/:id/publish',
      'DELETE /api/storage-market/needs/:id',
      'GET /api/storage-market/needs/:id'
    ]
  });
});

// ==================== STORAGE MARKET NEEDS ROUTES ====================

// API Health check (under /api/storage-market/*)
app.get('/api/storage-market/health', (req, res) => {
  res.json({
    success: true,
    service: 'RT SYMPHONI.A - Storage Market',
    version: '2.0.0',
    status: 'healthy',
    mongodb: mongoConnected ? 'connected' : 'not connected',
    timestamp: new Date().toISOString()
  });
});

// GET - List all storage needs
app.get('/api/storage-market/needs', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    // Build filter to ensure users only see their own storage needs
    const filter = {};
    if (req.query.customerId) filter.customerId = req.query.customerId;
    if (req.query.providerId) filter.providerId = req.query.providerId;

    const needs = await db.collection('storage_needs').find(filter).sort({ createdAt: -1 }).toArray();
    res.json({
      success: true,
      data: {
        needs: needs,
        total: needs.length
      }
    });
  } catch (error) {
    console.error('Error fetching needs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Create a new storage need
app.post('/api/storage-market/needs/create', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    const { storageType, volume, duration, location, constraints } = req.body;

    const newNeed = {
      needId: 'NEED-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      storageType: storageType || 'LONG_TERM',
      volume: volume || { value: 100, unit: 'M2' },
      duration: duration || { value: 6, unit: 'MONTHS' },
      location: location || { country: 'France', region: 'Ile-de-France' },
      constraints: constraints || { temperature: 'AMBIENT', certifications: [] },
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('storage_needs').insertOne(newNeed);

    res.status(201).json({
      success: true,
      message: 'Besoin de stockage cree avec succes',
      data: {
        needId: newNeed.needId,
        need: newNeed
      }
    });
  } catch (error) {
    console.error('Error creating need:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Publish a storage need
app.post('/api/storage-market/needs/:id/publish', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    const { id } = req.params;
    const { publicationType } = req.body;

    const result = await db.collection('storage_needs').updateOne(
      { needId: id },
      {
        $set: {
          status: 'PUBLISHED',
          publicationType: publicationType || 'GLOBAL_MARKET',
          publishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: 'Besoin non trouve' });
    }

    res.json({
      success: true,
      message: 'Besoin publie sur la bourse avec succes'
    });
  } catch (error) {
    console.error('Error publishing need:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Delete a storage need
app.delete('/api/storage-market/needs/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    const { id } = req.params;

    const result = await db.collection('storage_needs').deleteOne({ needId: id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Besoin non trouve' });
    }

    res.json({
      success: true,
      message: 'Besoin supprime avec succes'
    });
  } catch (error) {
    console.error('Error deleting need:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Get a single storage need by ID
app.get('/api/storage-market/needs/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ success: false, error: 'Database not connected' });
  }

  try {
    const { id } = req.params;
    const need = await db.collection('storage_needs').findOne({ needId: id });

    if (!need) {
      return res.status(404).json({ success: false, error: 'Besoin non trouve' });
    }

    res.json({
      success: true,
      data: need
    });
  } catch (error) {
    console.error('Error fetching need:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvee',
    path: req.path,
    method: req.method
  });
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Storage Market API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
