// RT Orders API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper: Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}

// Helper: Estimate duration based on distance (average 70km/h)
function estimateDuration(distanceKm) {
  if (!distanceKm) return null;
  return Math.round(distanceKm / 70 * 60); // minutes
}

// Helper: Enrich order with additional data
async function enrichOrder(order, db) {
  if (!order) return order;

  const enriched = { ...order };

  // Calculate distance if coordinates available
  const pickupLat = order.pickupAddress?.latitude || order.pickup?.coordinates?.latitude;
  const pickupLon = order.pickupAddress?.longitude || order.pickup?.coordinates?.longitude;
  const deliveryLat = order.deliveryAddress?.latitude || order.delivery?.coordinates?.latitude;
  const deliveryLon = order.deliveryAddress?.longitude || order.delivery?.coordinates?.longitude;

  if (pickupLat && pickupLon && deliveryLat && deliveryLon) {
    enriched.distanceKm = calculateDistance(pickupLat, pickupLon, deliveryLat, deliveryLon);
    enriched.durationMinutes = estimateDuration(enriched.distanceKm);
  }

  // Try to get industrial name
  if (order.industrialId && db) {
    try {
      const industrial = await db.collection('users').findOne({ _id: new ObjectId(order.industrialId) });
      if (industrial) {
        enriched.industrialName = industrial.companyName || industrial.name || industrial.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Try to get carrier name
  if (order.carrierId && db) {
    try {
      const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(order.carrierId) });
      if (carrier) {
        enriched.carrierName = carrier.companyName || carrier.name;
      }
    } catch (e) {
      // Try users collection
      try {
        const carrier = await db.collection('users').findOne({ _id: new ObjectId(order.carrierId) });
        if (carrier) {
          enriched.carrierName = carrier.companyName || carrier.name || carrier.email;
        }
      } catch (e2) {
        // Ignore lookup errors
      }
    }
  }

  return enriched;
}

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
  origin: [
    'https://industry.symphonia-controltower.com',
    'https://transporter.symphonia-controltower.com',
    'https://logisticien.symphonia-controltower.com',
    'https://industrie.symphonia-controltower.com',
    'https://transporteur.symphonia-controltower.com',
    'http://localhost:3000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// URL rewriting middleware for /api/v1/* routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/orders/')) {
    req.url = req.url.replace('/api/v1/orders', '');
  } else if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/');
  }
  next();
});

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

// Get single order (enriched with names and distance)
app.get('/api/v1/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
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

    // Enrich with additional data
    const enrichedOrder = await enrichOrder(order, db);
    res.json({ success: true, data: enrichedOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order events
app.get('/api/v1/orders/:id/events', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: req.params.id });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Return events from order or empty array
    const events = order.events || [];
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add event/comment to order
app.post('/api/v1/orders/:id/events', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const event = {
      id: new ObjectId().toString(),
      type: req.body.type || 'comment',
      description: req.body.description || req.body.comment,
      timestamp: new Date().toISOString(),
      userId: req.body.userId,
      userName: req.body.userName,
      data: req.body.data
    };

    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $push: { events: event }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $push: { events: event }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    }

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update pallet tracking
app.put('/api/v1/orders/:id/pallets', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const palletData = {
      enabled: true,
      palletType: req.body.palletType || 'EPAL',
      expectedQuantity: req.body.expectedQuantity || 0,
      pickup: req.body.pickup || {},
      delivery: req.body.delivery || {},
      balance: (req.body.pickup?.givenBySender || 0) - (req.body.delivery?.receivedByRecipient || 0),
      settled: req.body.settled || false,
      updatedAt: new Date()
    };

    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { palletTracking: palletData, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $set: { palletTracking: palletData, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    }

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
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

// ==================== ALIAS ROUTES (without /v1) ====================
// These routes support frontends that don't use versioned API paths

app.get('/api/orders', async (req, res) => {
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

app.get('/api/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: req.params.id });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    // Enrich with additional data
    const enrichedOrder = await enrichOrder(order, db);
    res.json({ success: true, data: enrichedOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get order events (alias)
app.get('/api/orders/:id/events', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: req.params.id });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const events = order.events || [];
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add event/comment (alias)
app.post('/api/orders/:id/events', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const event = {
      id: new ObjectId().toString(),
      type: req.body.type || 'comment',
      description: req.body.description || req.body.comment,
      timestamp: new Date().toISOString(),
      userId: req.body.userId,
      userName: req.body.userName,
      data: req.body.data
    };
    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $push: { events: event }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $push: { events: event }, $set: { updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    }
    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update pallet tracking (alias)
app.put('/api/orders/:id/pallets', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const palletData = {
      enabled: true,
      palletType: req.body.palletType || 'EPAL',
      expectedQuantity: req.body.expectedQuantity || 0,
      pickup: req.body.pickup || {},
      delivery: req.body.delivery || {},
      balance: (req.body.pickup?.givenBySender || 0) - (req.body.delivery?.receivedByRecipient || 0),
      settled: req.body.settled || false,
      updatedAt: new Date()
    };
    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: { palletTracking: palletData, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $set: { palletTracking: palletData, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
    }
    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
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
    res.status(201).json({ success: true, message: 'Order created successfully', data: createdOrder });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData._id;
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

app.delete('/api/orders/:id', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
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

// ==================== END ALIAS ROUTES ====================

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
