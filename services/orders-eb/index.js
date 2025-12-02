// RT Orders API with Express and MongoDB
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

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'orders',
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
    message: 'RT Orders API',
    version: '2.0.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet', 'CRUD Orders'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/v1/orders',
      'GET /api/v1/orders/:id',
      'POST /api/v1/orders',
      'PUT /api/v1/orders/:id',
      'DELETE /api/v1/orders/:id'
    ]
  });
});

// ==================== ORDERS CRUD ====================

// Get all orders
app.get('/api/v1/orders', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const orders = await db.collection('orders').find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single order
app.get('/api/v1/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const { ObjectId } = require('mongodb');
    let order;

    // Try finding by ObjectId first, then by reference
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: req.params.id });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
app.post('/api/v1/orders', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const order = {
      ...req.body,
      reference: req.body.reference || `CMD-${Date.now()}`,
      status: req.body.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('orders').insertOne(order);
    const createdOrder = await db.collection('orders').findOne({ _id: result.insertedId });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: createdOrder
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update order
app.put('/api/v1/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const { ObjectId } = require('mongodb');
    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };
    delete updateData._id; // Prevent updating _id

    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $set: updateData },
        { returnDocument: 'after' }
      );
    }

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order updated', data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete order
app.delete('/api/v1/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const { ObjectId } = require('mongodb');
    let result;

    try {
      result = await db.collection('orders').deleteOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      result = await db.collection('orders').deleteOne({ reference: req.params.id });
    }

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== END ORDERS CRUD ====================

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Orders API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));
  });
}

startServer();
