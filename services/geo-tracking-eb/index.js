// RT Geo-Tracking API with Express and MongoDB
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

// Connect to MongoDB
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

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'geo-tracking',
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

  // Try to ping MongoDB if connected
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
    message: 'RT Geo-Tracking API',
    version: '1.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/tracking',
      'POST /api/tracking/position',
      'GET /api/tracking/:vehicleId/history'
    ]
  });
});

// Get current tracking positions for all vehicles
app.get('/api/tracking', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({
      error: 'MongoDB not available'
    });
  }

  try {
    const positions = await db
      .collection('vehicle_tracking')
      .find({})
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      positions,
      count: positions.length
    });
  } catch (error) {
    console.error('Error fetching tracking positions:', error);
    res.status(500).json({
      error: 'Failed to fetch tracking positions',
      message: error.message
    });
  }
});

// Update vehicle position
app.post('/api/tracking/position', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({
      error: 'MongoDB not available'
    });
  }

  const { vehicleId, latitude, longitude, speed, heading, status } = req.body;

  if (!vehicleId || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'Missing required fields: vehicleId, latitude, longitude'
    });
  }

  try {
    const position = {
      vehicleId,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      latitude,
      longitude,
      speed: speed || 0,
      heading: heading || 0,
      status: status || 'active',
      updatedAt: new Date()
    };

    // Update or insert current position
    await db.collection('vehicle_tracking').updateOne(
      { vehicleId },
      { $set: position },
      { upsert: true }
    );

    // Store in history
    await db.collection('tracking_history').insertOne({
      ...position,
      createdAt: new Date()
    });

    res.json({
      success: true,
      message: 'Position updated successfully',
      position
    });
  } catch (error) {
    console.error('Error updating position:', error);
    res.status(500).json({
      error: 'Failed to update position',
      message: error.message
    });
  }
});

// Get vehicle tracking history
app.get('/api/tracking/:vehicleId/history', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({
      error: 'MongoDB not available'
    });
  }

  const { vehicleId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  try {
    const history = await db
      .collection('tracking_history')
      .find({ vehicleId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    res.json({
      vehicleId,
      history,
      count: history.length
    });
  } catch (error) {
    console.error('Error fetching tracking history:', error);
    res.status(500).json({
      error: 'Failed to fetch tracking history',
      message: error.message
    });
  }
});

// Start server
async function startServer() {
  // Try to connect to MongoDB (non-blocking)
  await connectMongoDB();

  // Create indexes for geospatial queries
  if (mongoConnected && db) {
    try {
      await db.collection('vehicle_tracking').createIndex({ location: '2dsphere' });
      await db.collection('tracking_history').createIndex({ vehicleId: 1, createdAt: -1 });
      console.log('✓ MongoDB indexes created');
    } catch (error) {
      console.error('✗ Failed to create indexes:', error.message);
    }
  }

  // Start Express server regardless of MongoDB status
  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Geo-Tracking API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('Features: Express, MongoDB, CORS, Helmet');
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
