// RT Orders API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const https = require('https');

// Email notifications module
const emailOrders = require('./email-orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Helper: Geocode an address using OpenStreetMap Nominatim (free, no API key)
async function geocodeAddress(address) {
  if (!address) return null;

  // Build multiple search queries (from most specific to least)
  const queries = [];

  if (typeof address === 'string') {
    queries.push(address);
  } else {
    // Full address with street
    const fullParts = [];
    if (address.street) fullParts.push(address.street);
    if (address.address) fullParts.push(address.address);
    if (address.city) fullParts.push(address.city);
    if (address.postalCode) fullParts.push(address.postalCode);
    if (address.country) fullParts.push(address.country);
    if (fullParts.length > 0) queries.push(fullParts.join(', '));

    // City + postal code + country (fallback)
    const cityParts = [];
    if (address.city) cityParts.push(address.city);
    if (address.postalCode) cityParts.push(address.postalCode);
    if (address.country) cityParts.push(address.country);
    if (cityParts.length > 0) queries.push(cityParts.join(', '));
  }

  if (queries.length === 0) return null;

  // Try each query until we get a result
  for (const query of queries) {
    const result = await geocodeSingleQuery(query);
    if (result) {
      return result;
    }
    // Rate limit between attempts
    await new Promise(r => setTimeout(r, 1100));
  }

  return null;
}

// Helper: Execute a single geocoding query
function geocodeSingleQuery(query) {
  return new Promise((resolve) => {
    const encodedAddress = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`;

    const options = {
      headers: {
        'User-Agent': 'RT-SYMPHONIA-Backend/1.0'
      }
    };

    https.get(url, options, (response) => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results && results.length > 0) {
            console.log(`✓ Geocoded "${query}" -> ${results[0].lat}, ${results[0].lon}`);
            resolve({
              latitude: parseFloat(results[0].lat),
              longitude: parseFloat(results[0].lon),
              displayName: results[0].display_name
            });
          } else {
            console.log(`✗ No results for "${query}"`);
            resolve(null);
          }
        } catch (e) {
          console.error('Geocoding parse error:', e.message);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error('Geocoding error:', e.message);
      resolve(null);
    });
  });
}

// Helper: Geocode order addresses (pickup and delivery)
async function geocodeOrderAddresses(order) {
  const updates = {};

  // Geocode pickup address if no coordinates
  const pickupAddr = order.pickupAddress || order.pickup;
  if (pickupAddr && (!pickupAddr.latitude || !pickupAddr.longitude)) {
    const pickupCoords = await geocodeAddress(pickupAddr);
    if (pickupCoords) {
      if (order.pickupAddress) {
        updates['pickupAddress.latitude'] = pickupCoords.latitude;
        updates['pickupAddress.longitude'] = pickupCoords.longitude;
      } else if (order.pickup) {
        updates['pickup.coordinates'] = {
          latitude: pickupCoords.latitude,
          longitude: pickupCoords.longitude
        };
      }
      console.log(`✓ Geocoded pickup: ${pickupCoords.latitude}, ${pickupCoords.longitude}`);
    }
    // Small delay to respect Nominatim rate limits (1 req/sec)
    await new Promise(r => setTimeout(r, 1100));
  }

  // Geocode delivery address if no coordinates
  const deliveryAddr = order.deliveryAddress || order.delivery;
  if (deliveryAddr && (!deliveryAddr.latitude || !deliveryAddr.longitude)) {
    const deliveryCoords = await geocodeAddress(deliveryAddr);
    if (deliveryCoords) {
      if (order.deliveryAddress) {
        updates['deliveryAddress.latitude'] = deliveryCoords.latitude;
        updates['deliveryAddress.longitude'] = deliveryCoords.longitude;
      } else if (order.delivery) {
        updates['delivery.coordinates'] = {
          latitude: deliveryCoords.latitude,
          longitude: deliveryCoords.longitude
        };
      }
      console.log(`✓ Geocoded delivery: ${deliveryCoords.latitude}, ${deliveryCoords.longitude}`);
    }
  }

  return updates;
}

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

  // Use authDb for user lookups (users are in rt-auth database)
  const usersDb = authDb || db;

  // Calculate distance if coordinates available
  const pickupLat = order.pickupAddress?.latitude || order.pickup?.coordinates?.latitude;
  const pickupLon = order.pickupAddress?.longitude || order.pickup?.coordinates?.longitude;
  const deliveryLat = order.deliveryAddress?.latitude || order.delivery?.coordinates?.latitude;
  const deliveryLon = order.deliveryAddress?.longitude || order.delivery?.coordinates?.longitude;

  if (pickupLat && pickupLon && deliveryLat && deliveryLon) {
    enriched.distanceKm = calculateDistance(pickupLat, pickupLon, deliveryLat, deliveryLon);
    enriched.durationMinutes = estimateDuration(enriched.distanceKm);
  }

  // Try to get industrial name and email (from rt-auth)
  if (order.industrialId && usersDb) {
    try {
      const industrial = await usersDb.collection('users').findOne({ _id: new ObjectId(order.industrialId) });
      if (industrial) {
        enriched.industrialName = industrial.organization?.name || industrial.companyName || industrial.name || industrial.email;
        enriched.industrialEmail = industrial.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Try to get carrier name (from rt-auth)
  if (order.carrierId && usersDb) {
    try {
      const carrier = await usersDb.collection('users').findOne({ _id: new ObjectId(order.carrierId) });
      if (carrier) {
        enriched.carrierName = carrier.organization?.name || carrier.companyName || carrier.name || carrier.email;
        enriched.carrierEmail = carrier.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Try to get supplier name (from rt-auth)
  if (order.supplierId && usersDb) {
    try {
      const supplier = await usersDb.collection('users').findOne({ _id: new ObjectId(order.supplierId) });
      if (supplier) {
        enriched.supplierName = supplier.organization?.name || supplier.companyName || supplier.name || supplier.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Try to get recipient name (from rt-auth)
  if (order.recipientId && usersDb) {
    try {
      const recipient = await usersDb.collection('users').findOne({ _id: new ObjectId(order.recipientId) });
      if (recipient) {
        enriched.recipientName = recipient.organization?.name || recipient.companyName || recipient.name || recipient.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  return enriched;
}

// MongoDB connection
let db = null;
let authDb = null; // Separate connection for auth database (users)
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
    db = mongoClient.db(); // rt-orders database

    // Also connect to rt-auth database for user queries (transporters, industrials, etc.)
    authDb = mongoClient.db('rt-auth');

    mongoConnected = true;
    console.log('✓ Connected to MongoDB (rt-orders + rt-auth)');
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
    version: '2.1.0',
    features: ['Express', 'MongoDB', 'CORS', 'Helmet', 'CRUD Orders', 'Geocoding', 'Tracking'],
    endpoints: [
      'GET /health',
      'GET /',
      'GET /api/v1/orders',
      'GET /api/v1/orders/:id',
      'POST /api/v1/orders',
      'PUT /api/v1/orders/:id',
      'DELETE /api/v1/orders/:id',
      'GET /api/v1/orders/:id/tracking',
      'POST /api/v1/orders/:id/tracking',
      'POST /api/v1/orders/:id/geocode',
      'POST /api/v1/orders/batch-geocode'
    ]
  });
});

// ==================== ORDERS CRUD ====================

// Get all orders (enriched with names, with filtering and pagination)
app.get('/api/v1/orders', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    // Build MongoDB query from filters
    const query = {};

    // Search filter (search in reference, carrierName, industrialName)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { reference: searchRegex },
        { 'pickupAddress.city': searchRegex },
        { 'deliveryAddress.city': searchRegex },
        { carrierName: searchRegex },
        { industrialName: searchRegex }
      ];
    }

    // Status filter (can be single or array)
    if (req.query.status) {
      const statuses = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      if (statuses.length > 0) {
        query.status = { $in: statuses };
      }
    }

    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      query.$and = query.$and || [];
      if (req.query.dateFrom) {
        query.$and.push({
          $or: [
            { 'dates.pickupDate': { $gte: req.query.dateFrom } },
            { pickupDate: { $gte: req.query.dateFrom } },
            { createdAt: { $gte: new Date(req.query.dateFrom) } }
          ]
        });
      }
      if (req.query.dateTo) {
        query.$and.push({
          $or: [
            { 'dates.pickupDate': { $lte: req.query.dateTo } },
            { pickupDate: { $lte: req.query.dateTo } },
            { createdAt: { $lte: new Date(req.query.dateTo) } }
          ]
        });
      }
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await db.collection('orders').countDocuments(query);

    // Get paginated orders
    const orders = await db.collection('orders')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Enrich all orders with names (in parallel for performance)
    const enrichedOrders = await Promise.all(
      orders.map(order => enrichOrder(order, db))
    );

    res.json({
      success: true,
      count: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: enrichedOrders
    });
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
    // Build MongoDB query from filters
    const query = {};

    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      query.$or = [
        { reference: searchRegex },
        { 'pickupAddress.city': searchRegex },
        { 'deliveryAddress.city': searchRegex },
        { carrierName: searchRegex },
        { industrialName: searchRegex }
      ];
    }

    // Status filter
    if (req.query.status) {
      const statuses = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      if (statuses.length > 0) {
        query.status = { $in: statuses };
      }
    }

    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      query.$and = query.$and || [];
      if (req.query.dateFrom) {
        query.$and.push({
          $or: [
            { 'dates.pickupDate': { $gte: req.query.dateFrom } },
            { pickupDate: { $gte: req.query.dateFrom } },
            { createdAt: { $gte: new Date(req.query.dateFrom) } }
          ]
        });
      }
      if (req.query.dateTo) {
        query.$and.push({
          $or: [
            { 'dates.pickupDate': { $lte: req.query.dateTo } },
            { pickupDate: { $lte: req.query.dateTo } },
            { createdAt: { $lte: new Date(req.query.dateTo) } }
          ]
        });
      }
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const total = await db.collection('orders').countDocuments(query);
    const orders = await db.collection('orders')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Enrich all orders with names
    const enrichedOrders = await Promise.all(
      orders.map(order => enrichOrder(order, db))
    );

    res.json({
      success: true,
      count: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data: enrichedOrders
    });
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

// ==================== GEOCODING ENDPOINTS ====================

// Geocode a single order (add coordinates to addresses)
app.post('/api/orders/:id/geocode', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Base de données non connectée' });
  }
  try {
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: req.params.id });
    }

    if (!order) {
      return res.status(404).json({ error: 'Commande non trouvée' });
    }

    // Geocode addresses
    const geocodeUpdates = await geocodeOrderAddresses(order);

    if (Object.keys(geocodeUpdates).length === 0) {
      return res.json({
        success: true,
        message: 'Aucune adresse à géocoder (coordonnées déjà présentes ou adresses manquantes)',
        data: order
      });
    }

    // Apply updates
    geocodeUpdates.updatedAt = new Date();

    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: geocodeUpdates },
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        { $set: geocodeUpdates },
        { returnDocument: 'after' }
      );
    }

    // Enrich the result with distance calculation
    const enrichedOrder = await enrichOrder(result, db);

    res.json({
      success: true,
      message: 'Adresses géocodées avec succès',
      geocoded: Object.keys(geocodeUpdates).filter(k => k !== 'updatedAt'),
      data: enrichedOrder
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Batch geocode all orders missing coordinates
app.post('/api/orders/batch-geocode', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Base de données non connectée' });
  }
  try {
    // Find orders missing ANY coordinates (pickup OR delivery)
    // More comprehensive query to catch all cases
    const orders = await db.collection('orders').find({
      $or: [
        // pickupAddress without latitude
        { 'pickupAddress': { $exists: true }, 'pickupAddress.latitude': { $exists: false } },
        // deliveryAddress without latitude
        { 'deliveryAddress': { $exists: true }, 'deliveryAddress.latitude': { $exists: false } },
        // pickup structure without coordinates
        { 'pickup': { $exists: true }, 'pickup.coordinates': { $exists: false } },
        // delivery structure without coordinates
        { 'delivery': { $exists: true }, 'delivery.coordinates': { $exists: false } }
      ]
    }).limit(req.body.limit || 10).toArray();

    const results = {
      total: orders.length,
      geocoded: 0,
      failed: 0,
      details: []
    };

    for (const order of orders) {
      try {
        const geocodeUpdates = await geocodeOrderAddresses(order);

        if (Object.keys(geocodeUpdates).length > 0) {
          geocodeUpdates.updatedAt = new Date();
          await db.collection('orders').updateOne(
            { _id: order._id },
            { $set: geocodeUpdates }
          );
          results.geocoded++;
          results.details.push({
            id: order._id.toString(),
            reference: order.reference,
            status: 'success',
            fields: Object.keys(geocodeUpdates).filter(k => k !== 'updatedAt')
          });
        } else {
          results.details.push({
            id: order._id.toString(),
            reference: order.reference,
            status: 'skipped',
            reason: 'Pas d\'adresse à géocoder'
          });
        }
      } catch (e) {
        results.failed++;
        results.details.push({
          id: order._id.toString(),
          reference: order.reference,
          status: 'error',
          error: e.message
        });
      }
    }

    res.json({
      success: true,
      message: `Géocodage terminé: ${results.geocoded}/${results.total} commandes`,
      data: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Alias routes for geocoding
app.post('/api/v1/orders/:id/geocode', async (req, res) => {
  // Forward to main handler
  req.url = `/api/orders/${req.params.id}/geocode`;
  app.handle(req, res);
});

app.post('/api/v1/orders/batch-geocode', async (req, res) => {
  // Forward to main handler
  req.url = '/api/orders/batch-geocode';
  app.handle(req, res);
});

// ==================== END GEOCODING ENDPOINTS ====================

// ==================== TRACKING ENDPOINTS ====================

// Helper: Generate AI insights based on order data
function generateAIInsights(order, trackingEvents) {
  const insights = [];
  const now = new Date();

  // Analyze carrier performance if we have historical data
  if (order.carrierId) {
    insights.push({
      id: `ai-perf-${order._id}`,
      type: 'performance',
      title: 'Performance transporteur',
      description: `Analyse basée sur les données historiques du transporteur`,
      confidence: 85,
      timestamp: now.toISOString(),
      priority: 'low'
    });
  }

  // Analyze delivery prediction
  if (order.status === 'in_transit' || order.status === 'en_cours') {
    const deliveryDate = order.deliveryDate || order.delivery?.date;
    if (deliveryDate) {
      const deliveryTime = new Date(deliveryDate).getTime();
      const diff = deliveryTime - now.getTime();
      const hoursRemaining = Math.round(diff / (1000 * 60 * 60));

      if (hoursRemaining > 0) {
        insights.push({
          id: `ai-eta-${order._id}`,
          type: 'delivery_prediction',
          title: 'Prédiction de livraison',
          description: `Livraison prévue dans ${hoursRemaining}h`,
          confidence: 78,
          recommendation: hoursRemaining < 2 ? 'Livraison imminente' : 'En bonne voie',
          timestamp: now.toISOString(),
          priority: hoursRemaining < 2 ? 'high' : 'low'
        });
      }
    }
  }

  // Check for potential delays based on last tracking event
  if (trackingEvents && trackingEvents.length > 0) {
    const lastEvent = trackingEvents[trackingEvents.length - 1];
    const lastEventTime = new Date(lastEvent.timestamp).getTime();
    const timeSinceLastEvent = now.getTime() - lastEventTime;
    const hoursSinceLastEvent = timeSinceLastEvent / (1000 * 60 * 60);

    if (hoursSinceLastEvent > 2 && order.status === 'in_transit') {
      insights.push({
        id: `ai-delay-${order._id}`,
        type: 'delay_risk',
        title: 'Risque de retard détecté',
        description: `Aucune mise à jour GPS depuis ${Math.round(hoursSinceLastEvent)}h`,
        confidence: 65,
        recommendation: 'Vérifier le statut avec le transporteur',
        timestamp: now.toISOString(),
        priority: 'medium'
      });
    }
  }

  return insights;
}

// Get tracking data for an order
app.get('/api/v1/orders/:id/tracking', async (req, res) => {
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

    // Get tracking events from the order
    const trackingEvents = order.tracking || [];

    // Convert order events to tracking format if no dedicated tracking exists
    let events = trackingEvents.length > 0 ? trackingEvents : [];

    // Add status-based events from order history
    if (order.events && order.events.length > 0) {
      const statusEvents = order.events
        .filter(e => e.type === 'status_change' || e.type === 'gps' || e.type === 'status')
        .map(e => ({
          id: e.id || new ObjectId().toString(),
          type: e.type === 'status_change' ? 'status' : e.type,
          timestamp: e.timestamp,
          title: e.title || e.description,
          description: e.description,
          location: e.location || e.data?.location,
          metadata: e.metadata || { source: 'system' }
        }));
      events = [...events, ...statusEvents];
    }

    // Sort events by timestamp descending (newest first)
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Generate AI insights
    const insights = generateAIInsights(order, events);

    // Get current position if available
    const currentPosition = order.currentPosition || (events.length > 0 && events[0].location) || null;

    res.json({
      success: true,
      data: {
        orderId: order._id.toString(),
        reference: order.reference,
        status: order.status,
        events: events,
        insights: insights,
        currentPosition: currentPosition,
        lastUpdate: events.length > 0 ? events[0].timestamp : order.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add tracking event (GPS update, status change, etc.)
app.post('/api/v1/orders/:id/tracking', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const trackingEvent = {
      id: new ObjectId().toString(),
      type: req.body.type || 'gps',
      timestamp: req.body.timestamp || new Date().toISOString(),
      title: req.body.title || 'Mise à jour position',
      description: req.body.description,
      location: req.body.location ? {
        lat: req.body.location.lat,
        lng: req.body.location.lng,
        address: req.body.location.address,
        city: req.body.location.city
      } : null,
      metadata: {
        source: req.body.source || 'api',
        userId: req.body.userId,
        confidence: req.body.confidence,
        aiGenerated: req.body.aiGenerated || false,
        priority: req.body.priority || 'low'
      }
    };

    // Update order with new tracking event and current position
    const updateData = {
      $push: { tracking: trackingEvent },
      $set: {
        updatedAt: new Date()
      }
    };

    // Update current position if GPS update
    if (trackingEvent.location && trackingEvent.type === 'gps') {
      updateData.$set.currentPosition = trackingEvent.location;
    }

    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        updateData,
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        updateData,
        { returnDocument: 'after' }
      );
    }

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.status(201).json({ success: true, data: trackingEvent });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Alias routes for tracking (without /v1)
app.get('/api/orders/:id/tracking', async (req, res) => {
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
    const trackingEvents = order.tracking || [];
    let events = trackingEvents.length > 0 ? trackingEvents : [];
    if (order.events && order.events.length > 0) {
      const statusEvents = order.events
        .filter(e => e.type === 'status_change' || e.type === 'gps' || e.type === 'status')
        .map(e => ({
          id: e.id || new ObjectId().toString(),
          type: e.type === 'status_change' ? 'status' : e.type,
          timestamp: e.timestamp,
          title: e.title || e.description,
          description: e.description,
          location: e.location || e.data?.location,
          metadata: e.metadata || { source: 'system' }
        }));
      events = [...events, ...statusEvents];
    }
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const insights = generateAIInsights(order, events);
    const currentPosition = order.currentPosition || (events.length > 0 && events[0].location) || null;
    res.json({
      success: true,
      data: {
        orderId: order._id.toString(),
        reference: order.reference,
        status: order.status,
        events: events,
        insights: insights,
        currentPosition: currentPosition,
        lastUpdate: events.length > 0 ? events[0].timestamp : order.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders/:id/tracking', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }
  try {
    const trackingEvent = {
      id: new ObjectId().toString(),
      type: req.body.type || 'gps',
      timestamp: req.body.timestamp || new Date().toISOString(),
      title: req.body.title || 'Mise à jour position',
      description: req.body.description,
      location: req.body.location ? {
        lat: req.body.location.lat,
        lng: req.body.location.lng,
        address: req.body.location.address,
        city: req.body.location.city
      } : null,
      metadata: {
        source: req.body.source || 'api',
        userId: req.body.userId,
        confidence: req.body.confidence,
        aiGenerated: req.body.aiGenerated || false,
        priority: req.body.priority || 'low'
      }
    };
    const updateData = {
      $push: { tracking: trackingEvent },
      $set: { updatedAt: new Date() }
    };
    if (trackingEvent.location && trackingEvent.type === 'gps') {
      updateData.$set.currentPosition = trackingEvent.location;
    }
    let result;
    try {
      result = await db.collection('orders').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        updateData,
        { returnDocument: 'after' }
      );
    } catch (e) {
      result = await db.collection('orders').findOneAndUpdate(
        { reference: req.params.id },
        updateData,
        { returnDocument: 'after' }
      );
    }
    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(201).json({ success: true, data: trackingEvent });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== END TRACKING ENDPOINTS ====================

// ==================== AUTO-DISPATCH SYSTEM ====================

// Configuration
const AUTO_DISPATCH_MAX_CARRIERS = parseInt(process.env.AUTO_DISPATCH_MAX_CARRIERS) || 3;
const SUBSCRIPTIONS_API_URL = process.env.SUBSCRIPTIONS_API_URL || 'https://d39uizi9hzozo8.cloudfront.net';
const AFFRET_IA_API_URL = process.env.AFFRET_IA_API_URL || 'https://d393yiia4ig3bw.cloudfront.net/api';
const KPI_API_URL = process.env.KPI_API_URL || 'https://d57lw7v3zgfpy.cloudfront.net';

// Helper: Add event to order
async function addOrderEvent(orderId, event, db) {
  const eventData = {
    ...event,
    timestamp: new Date(),
    id: new ObjectId().toString()
  };

  await db.collection('orders').updateOne(
    { _id: new ObjectId(orderId) },
    {
      $push: { events: eventData },
      $set: { updatedAt: new Date() }
    }
  );

  return eventData;
}

// Helper: Check if user has Affret IA subscription
async function hasAffretIASubscription(userId) {
  try {
    const response = await fetch(`${SUBSCRIPTIONS_API_URL}/subscriptions/user/${userId}/active`);
    if (!response.ok) return false;
    const subscription = await response.json();
    return subscription?.activeModules?.some(m => m.moduleId === 'AFFRET_IA') || false;
  } catch (e) {
    console.error('Error checking Affret IA subscription:', e.message);
    return false;
  }
}

// Helper: Get top carriers for an order (simplified scoring)
async function getTopCarriers(order, db, limit = AUTO_DISPATCH_MAX_CARRIERS) {
  try {
    // Use authDb to query users (transporters are in rt-auth database, not rt-orders)
    const usersDb = authDb || db;

    // Get all active transporters - check multiple possible field configurations
    const carriers = await usersDb.collection('users').find({
      $or: [
        // New format: role='transporter', isActive=true
        { role: 'transporter', isActive: true },
        // Also check for verified transporters
        { role: 'transporter', isVerified: true },
        // Legacy format: role='carrier', status='active'/'verified'
        { role: 'carrier', status: { $in: ['active', 'verified'] } }
      ]
    }).limit(20).toArray();

    console.log(`[getTopCarriers] Found ${carriers.length} carriers in database (using ${authDb ? 'rt-auth' : 'rt-orders'})`);

    // Simple scoring based on available data
    const scoredCarriers = carriers.map(carrier => {
      // Get score from organization or use default
      let score = carrier.organization?.score || carrier.score || 50;

      // Bonus for verified status
      if (carrier.isVerified || carrier.status === 'verified') score += 10;

      // Small random factor for variety
      score += Math.floor(Math.random() * 10);

      // Get company name from various possible fields
      const carrierName = carrier.organization?.name ||
                          carrier.companyName ||
                          carrier.name ||
                          `${carrier.firstName || ''} ${carrier.lastName || ''}`.trim() ||
                          carrier.email;

      return {
        carrierId: carrier._id.toString(),
        carrierName: carrierName,
        carrierEmail: carrier.email,
        score: Math.min(100, score)
      };
    });

    console.log(`[getTopCarriers] Scored carriers:`, scoredCarriers.map(c => ({ name: c.carrierName, score: c.score })));

    // Sort by score and return top N
    return scoredCarriers
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (e) {
    console.error('Error getting top carriers:', e.message);
    return [];
  }
}

// Helper: Update carrier KPI
async function updateCarrierKPI(carrierId, event, responseTimeMinutes, reason) {
  try {
    await fetch(`${KPI_API_URL}/kpi/carriers/${carrierId}/dispatch-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        responseTimeMinutes,
        refusalReason: reason
      })
    });
  } catch (e) {
    console.error('Error updating carrier KPI:', e.message);
  }
}

// Helper: Trigger Affret IA
async function triggerAffretIA(order, userId) {
  try {
    const response = await fetch(`${AFFRET_IA_API_URL}/v1/affretia/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order._id.toString(),
        organizationId: order.industrialId || order.createdBy,
        triggerType: 'auto_failure',
        reason: 'Tous les transporteurs ont refuse',
        userId
      })
    });
    return await response.json();
  } catch (e) {
    console.error('Error triggering Affret IA:', e.message);
    return null;
  }
}

// POST /api/orders/:id/auto-dispatch - Start automatic dispatch
app.post('/api/orders/:id/auto-dispatch', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const orderId = req.params.id;

    // Get the order
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: orderId });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Check if order can be dispatched
    if (!['created', 'pending', 'draft'].includes(order.status)) {
      return res.status(400).json({
        error: 'Order cannot be dispatched',
        currentStatus: order.status
      });
    }

    // Get top carriers
    const carriers = await getTopCarriers(order, db);

    if (carriers.length === 0) {
      return res.status(400).json({ error: 'No carriers available' });
    }

    // Timeout configuration (default 45 minutes = 2700 seconds)
    const timeoutSeconds = req.body.timeoutSeconds || 2700;
    const now = new Date();
    const timeoutAt = new Date(now.getTime() + timeoutSeconds * 1000);

    // Create dispatch chain
    const dispatchChain = carriers.map((carrier, index) => ({
      ...carrier,
      position: index + 1,
      status: index === 0 ? 'sent' : 'pending',
      sentAt: index === 0 ? now : null,
      timeoutAt: index === 0 ? timeoutAt : null,
      respondedAt: null,
      response: null,
      reason: null
    }));

    // Update order with dispatch chain and new status
    await db.collection('orders').updateOne(
      { _id: order._id },
      {
        $set: {
          status: 'planification_auto',
          dispatchChain,
          dispatchConfig: {
            timeoutSeconds,
            maxCarriers: carriers.length,
            startedAt: now
          },
          currentDispatchIndex: 0,
          updatedAt: new Date()
        }
      }
    );

    // Add start event
    await addOrderEvent(order._id.toString(), {
      type: 'auto_dispatch_started',
      details: `Planification automatique demarree avec ${carriers.length} transporteur(s)`,
      carriersCount: carriers.length
    }, db);

    // Add sent to first carrier event
    const firstCarrier = carriers[0];
    await addOrderEvent(order._id.toString(), {
      type: 'sent_to_carrier',
      carrierId: firstCarrier.carrierId,
      carrierName: firstCarrier.carrierName,
      details: `Envoye a ${firstCarrier.carrierName} (score: ${firstCarrier.score}/100)`,
      score: firstCarrier.score
    }, db);

    // Update KPI - carrier received order
    await updateCarrierKPI(firstCarrier.carrierId, 'received', null, null);

    // Send email notifications (async, don't block response)
    const enrichedOrder = await enrichOrder(order, db);
    const timeoutMinutes = Math.floor(timeoutSeconds / 60);

    // Email to first carrier
    if (firstCarrier.carrierEmail) {
      emailOrders.sendDispatchNotificationToCarrier(
        firstCarrier.carrierEmail,
        firstCarrier.carrierName,
        { ...order, ...enrichedOrder },
        timeoutMinutes
      ).catch(err => console.error('Email to carrier failed:', err.message));
    }

    // Email to industrial
    if (enrichedOrder.industrialEmail) {
      emailOrders.sendAutoDispatchStartedToIndustrial(
        enrichedOrder.industrialEmail,
        enrichedOrder.industrialName || 'Client',
        { ...order, ...enrichedOrder },
        carriers
      ).catch(err => console.error('Email to industrial failed:', err.message));
    }

    res.json({
      success: true,
      message: 'Auto-dispatch started',
      data: {
        orderId: order._id.toString(),
        status: 'planification_auto',
        dispatchChain: dispatchChain.map(c => ({
          carrierName: c.carrierName,
          score: c.score,
          status: c.status,
          position: c.position
        })),
        currentCarrier: firstCarrier.carrierName
      }
    });

  } catch (error) {
    console.error('Auto-dispatch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/:id/carrier-response - Carrier accepts or refuses
app.post('/api/orders/:id/carrier-response', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const orderId = req.params.id;
    const { carrierId, response, reason } = req.body;

    if (!carrierId || !response) {
      return res.status(400).json({ error: 'carrierId and response required' });
    }

    if (!['accepted', 'refused'].includes(response)) {
      return res.status(400).json({ error: 'response must be accepted or refused' });
    }

    // Get the order
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: orderId });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'planification_auto') {
      return res.status(400).json({ error: 'Order is not in auto-dispatch mode' });
    }

    // Find carrier in dispatch chain
    const carrierIndex = order.dispatchChain?.findIndex(c => c.carrierId === carrierId);
    if (carrierIndex === -1 || carrierIndex === undefined) {
      return res.status(400).json({ error: 'Carrier not in dispatch chain' });
    }

    const carrier = order.dispatchChain[carrierIndex];
    const responseTime = carrier.sentAt ?
      Math.round((new Date() - new Date(carrier.sentAt)) / 60000) : null;

    if (response === 'accepted') {
      // Carrier accepted - update order
      await db.collection('orders').updateOne(
        { _id: order._id },
        {
          $set: {
            status: 'accepted',
            carrierId: carrierId,
            carrierName: carrier.carrierName,
            [`dispatchChain.${carrierIndex}.status`]: 'accepted',
            [`dispatchChain.${carrierIndex}.respondedAt`]: new Date(),
            [`dispatchChain.${carrierIndex}.response`]: 'accepted',
            updatedAt: new Date()
          }
        }
      );

      // Add event
      await addOrderEvent(order._id.toString(), {
        type: 'carrier_accepted',
        carrierId,
        carrierName: carrier.carrierName,
        details: `Accepte par ${carrier.carrierName} (temps de reponse: ${responseTime} min)`,
        responseTimeMinutes: responseTime
      }, db);

      // Update KPI
      await updateCarrierKPI(carrierId, 'accepted', responseTime, null);

      // Send email to industrial (async)
      const enrichedOrder = await enrichOrder(order, db);
      if (enrichedOrder.industrialEmail) {
        emailOrders.sendCarrierAcceptedToIndustrial(
          enrichedOrder.industrialEmail,
          enrichedOrder.industrialName || 'Client',
          { ...order, ...enrichedOrder },
          { name: carrier.carrierName, carrierName: carrier.carrierName }
        ).catch(err => console.error('Email accepted notification failed:', err.message));
      }

      res.json({
        success: true,
        message: 'Order accepted by carrier',
        data: {
          orderId: order._id.toString(),
          status: 'accepted',
          carrierId,
          carrierName: carrier.carrierName
        }
      });

    } else {
      // Carrier refused
      await db.collection('orders').updateOne(
        { _id: order._id },
        {
          $set: {
            [`dispatchChain.${carrierIndex}.status`]: 'refused',
            [`dispatchChain.${carrierIndex}.respondedAt`]: new Date(),
            [`dispatchChain.${carrierIndex}.response`]: 'refused',
            [`dispatchChain.${carrierIndex}.reason`]: reason || 'Non specifie',
            updatedAt: new Date()
          }
        }
      );

      // Add refusal event
      await addOrderEvent(order._id.toString(), {
        type: 'carrier_refused',
        carrierId,
        carrierName: carrier.carrierName,
        details: `Refuse par ${carrier.carrierName} - Raison: ${reason || 'Non specifie'}`,
        reason: reason || 'Non specifie',
        responseTimeMinutes: responseTime
      }, db);

      // Update KPI
      await updateCarrierKPI(carrierId, 'refused', responseTime, reason);

      // Check if there's a next carrier
      const nextIndex = carrierIndex + 1;
      if (nextIndex < order.dispatchChain.length) {
        // Send to next carrier
        const nextCarrier = order.dispatchChain[nextIndex];
        const timeoutSeconds = order.dispatchConfig?.timeoutSeconds || 2700;
        const nextSentAt = new Date();
        const nextTimeoutAt = new Date(nextSentAt.getTime() + timeoutSeconds * 1000);

        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              currentDispatchIndex: nextIndex,
              [`dispatchChain.${nextIndex}.status`]: 'sent',
              [`dispatchChain.${nextIndex}.sentAt`]: nextSentAt,
              [`dispatchChain.${nextIndex}.timeoutAt`]: nextTimeoutAt,
              updatedAt: new Date()
            }
          }
        );

        // Add event for next carrier
        await addOrderEvent(order._id.toString(), {
          type: 'sent_to_carrier',
          carrierId: nextCarrier.carrierId,
          carrierName: nextCarrier.carrierName,
          details: `Envoye a ${nextCarrier.carrierName} (score: ${nextCarrier.score}/100)`,
          score: nextCarrier.score
        }, db);

        // Update KPI for next carrier
        await updateCarrierKPI(nextCarrier.carrierId, 'received', null, null);

        // Send email notifications (async)
        const enrichedOrder = await enrichOrder(order, db);
        const timeoutMinutes = Math.floor((order.dispatchConfig?.timeoutSeconds || 2700) / 60);

        // Email to industrial about refusal
        if (enrichedOrder.industrialEmail) {
          emailOrders.sendCarrierRefusedToIndustrial(
            enrichedOrder.industrialEmail,
            enrichedOrder.industrialName || 'Client',
            { ...order, ...enrichedOrder },
            { name: carrier.carrierName, carrierName: carrier.carrierName },
            reason,
            nextCarrier.carrierName
          ).catch(err => console.error('Email refused notification failed:', err.message));
        }

        // Email to next carrier
        if (nextCarrier.carrierEmail) {
          emailOrders.sendDispatchNotificationToCarrier(
            nextCarrier.carrierEmail,
            nextCarrier.carrierName,
            { ...order, ...enrichedOrder },
            timeoutMinutes
          ).catch(err => console.error('Email to next carrier failed:', err.message));
        }

        res.json({
          success: true,
          message: 'Carrier refused, sent to next carrier',
          data: {
            orderId: order._id.toString(),
            status: 'planification_auto',
            refusedBy: carrier.carrierName,
            nextCarrier: nextCarrier.carrierName
          }
        });

      } else {
        // All carriers refused - always escalate to Affret IA
        const userId = order.industrialId || order.createdBy;
        console.log(`[CarrierRefuse] Order ${order._id}: All carriers refused, escalating to Affret IA`);

        // Always escalate to Affret IA - this is the core SYMPHONI.A behavior
        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              status: 'affret_ia',
              updatedAt: new Date()
            }
          }
        );

        // Trigger Affret IA
        const affretResult = await triggerAffretIA(order, userId);

        // Add event
        await addOrderEvent(order._id.toString(), {
          type: 'escalated_affret_ia',
          details: 'Tous les transporteurs ont refuse - Escalade vers Affret IA',
          affretSessionId: affretResult?.sessionId
        }, db);

        // Send email to industrial about Affret IA escalation
        const enrichedOrderAffret = await enrichOrder(order, db);
        if (enrichedOrderAffret.industrialEmail) {
          emailOrders.sendAffretIAEscalationToIndustrial(
            enrichedOrderAffret.industrialEmail,
            enrichedOrderAffret.industrialName || 'Client',
            { ...order, ...enrichedOrderAffret }
          ).catch(err => console.error('Email Affret IA escalation failed:', err.message));
        }

        res.json({
          success: true,
          message: 'All carriers refused, escalated to Affret IA',
          data: {
            orderId: order._id.toString(),
            status: 'affret_ia',
            affretSessionId: affretResult?.sessionId
          }
        });
      }
    }

  } catch (error) {
    console.error('Carrier response error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/orders/check-timeouts - Check and process carrier timeouts (called by cron or polling)
app.post('/api/orders/check-timeouts', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const now = new Date();

    // Find orders in planification_auto with timed out carriers
    const ordersWithTimeouts = await db.collection('orders').find({
      status: 'planification_auto',
      'dispatchChain': {
        $elemMatch: {
          status: 'sent',
          timeoutAt: { $lte: now }
        }
      }
    }).toArray();

    const results = [];

    for (const order of ordersWithTimeouts) {
      try {
        // Find the timed out carrier
        const currentIndex = order.currentDispatchIndex || 0;
        const currentCarrier = order.dispatchChain[currentIndex];

        if (!currentCarrier || currentCarrier.status !== 'sent') continue;
        if (new Date(currentCarrier.timeoutAt) > now) continue;

        // Mark current carrier as timeout
        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              [`dispatchChain.${currentIndex}.status`]: 'timeout',
              [`dispatchChain.${currentIndex}.respondedAt`]: now,
              [`dispatchChain.${currentIndex}.response`]: 'timeout',
              [`dispatchChain.${currentIndex}.reason`]: 'Delai de reponse depasse',
              updatedAt: now
            }
          }
        );

        // Add timeout event
        await addOrderEvent(order._id.toString(), {
          type: 'carrier_refused',
          carrierId: currentCarrier.carrierId,
          carrierName: currentCarrier.carrierName,
          details: `Timeout - ${currentCarrier.carrierName} n'a pas repondu dans le delai imparti`,
          reason: 'Delai de reponse depasse (timeout)'
        }, db);

        // Update KPI for timeout
        await updateCarrierKPI(currentCarrier.carrierId, 'refused', null, 'timeout');

        // Check if there's a next carrier
        const nextIndex = currentIndex + 1;
        if (nextIndex < order.dispatchChain.length) {
          // Send to next carrier
          const nextCarrier = order.dispatchChain[nextIndex];
          const timeoutSeconds = order.dispatchConfig?.timeoutSeconds || 2700;
          const nextTimeoutAt = new Date(now.getTime() + timeoutSeconds * 1000);

          await db.collection('orders').updateOne(
            { _id: order._id },
            {
              $set: {
                currentDispatchIndex: nextIndex,
                [`dispatchChain.${nextIndex}.status`]: 'sent',
                [`dispatchChain.${nextIndex}.sentAt`]: now,
                [`dispatchChain.${nextIndex}.timeoutAt`]: nextTimeoutAt,
                updatedAt: now
              }
            }
          );

          // Add event for next carrier
          await addOrderEvent(order._id.toString(), {
            type: 'sent_to_carrier',
            carrierId: nextCarrier.carrierId,
            carrierName: nextCarrier.carrierName,
            details: `Envoye a ${nextCarrier.carrierName} (score: ${nextCarrier.score}/100)`,
            score: nextCarrier.score
          }, db);

          // Update KPI for next carrier
          await updateCarrierKPI(nextCarrier.carrierId, 'received', null, null);

          // Send email notifications for timeout (async)
          const enrichedOrderTimeout = await enrichOrder(order, db);
          const timeoutMinutes = Math.floor(timeoutSeconds / 60);

          // Email to industrial about timeout
          if (enrichedOrderTimeout.industrialEmail) {
            emailOrders.sendTimeoutNotificationToIndustrial(
              enrichedOrderTimeout.industrialEmail,
              enrichedOrderTimeout.industrialName || 'Client',
              { ...order, ...enrichedOrderTimeout },
              { name: currentCarrier.carrierName, carrierName: currentCarrier.carrierName },
              nextCarrier.carrierName
            ).catch(err => console.error('Email timeout notification failed:', err.message));
          }

          // Email to next carrier
          if (nextCarrier.carrierEmail) {
            emailOrders.sendDispatchNotificationToCarrier(
              nextCarrier.carrierEmail,
              nextCarrier.carrierName,
              { ...order, ...enrichedOrderTimeout },
              timeoutMinutes
            ).catch(err => console.error('Email to next carrier (timeout) failed:', err.message));
          }

          results.push({
            orderId: order._id.toString(),
            action: 'next_carrier',
            timedOutCarrier: currentCarrier.carrierName,
            nextCarrier: nextCarrier.carrierName
          });

        } else {
          // All carriers exhausted - always escalate to Affret IA
          const userId = order.industrialId || order.createdBy;
          console.log(`[CheckTimeouts] Order ${order._id}: All carriers exhausted, escalating to Affret IA`);

          // Always escalate to Affret IA - this is the core SYMPHONI.A behavior
          await db.collection('orders').updateOne(
            { _id: order._id },
            { $set: { status: 'affret_ia', updatedAt: now } }
          );

          const affretResult = await triggerAffretIA(order, userId);

          await addOrderEvent(order._id.toString(), {
            type: 'escalated_affret_ia',
            details: 'Tous les transporteurs ont expire - Escalade vers Affret IA',
            affretSessionId: affretResult?.sessionId
          }, db);

          // Send email to industrial about Affret IA escalation
          const enrichedOrderAffretTimeout = await enrichOrder(order, db);
          if (enrichedOrderAffretTimeout.industrialEmail) {
            emailOrders.sendAffretIAEscalationToIndustrial(
              enrichedOrderAffretTimeout.industrialEmail,
              enrichedOrderAffretTimeout.industrialName || 'Client',
              { ...order, ...enrichedOrderAffretTimeout }
            ).catch(err => console.error('Email Affret IA escalation (timeout) failed:', err.message));
          }

          results.push({
            orderId: order._id.toString(),
            action: 'escalated_affret_ia',
            affretSessionId: affretResult?.sessionId
          });
        }
      } catch (orderError) {
        console.error(`Error processing timeout for order ${order._id}:`, orderError);
        results.push({
          orderId: order._id.toString(),
          action: 'error',
          error: orderError.message
        });
      }
    }

    res.json({
      success: true,
      processedCount: ordersWithTimeouts.length,
      results
    });

  } catch (error) {
    console.error('Check timeouts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/:id/dispatch-status - Get dispatch chain status (also checks timeout)
app.get('/api/orders/:id/dispatch-status', async (req, res) => {
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

    // Check for timeout on this specific order (if in planification_auto)
    if (order.status === 'planification_auto' && order.dispatchChain) {
      const now = new Date();
      const currentIndex = order.currentDispatchIndex || 0;
      const currentCarrier = order.dispatchChain[currentIndex];

      if (currentCarrier && currentCarrier.status === 'sent' && currentCarrier.timeoutAt) {
        const timeoutAt = new Date(currentCarrier.timeoutAt);

        if (now >= timeoutAt) {
          // Timeout! Process it
          console.log(`[Timeout] Order ${order._id} - Carrier ${currentCarrier.carrierName} timed out`);

          // Mark carrier as timeout
          await db.collection('orders').updateOne(
            { _id: order._id },
            {
              $set: {
                [`dispatchChain.${currentIndex}.status`]: 'timeout',
                [`dispatchChain.${currentIndex}.respondedAt`]: now,
                [`dispatchChain.${currentIndex}.response`]: 'timeout',
                [`dispatchChain.${currentIndex}.reason`]: 'Delai de reponse depasse (45 min)',
                updatedAt: now
              }
            }
          );

          // Add timeout event
          await addOrderEvent(order._id.toString(), {
            type: 'carrier_refused',
            carrierId: currentCarrier.carrierId,
            carrierName: currentCarrier.carrierName,
            details: `Timeout - ${currentCarrier.carrierName} n'a pas repondu dans les 45 minutes`,
            reason: 'Delai de reponse depasse (timeout)'
          }, db);

          // Update KPI
          await updateCarrierKPI(currentCarrier.carrierId, 'refused', null, 'timeout');

          // Check for next carrier
          const nextIndex = currentIndex + 1;
          if (nextIndex < order.dispatchChain.length) {
            const nextCarrier = order.dispatchChain[nextIndex];
            const timeoutSeconds = order.dispatchConfig?.timeoutSeconds || 2700;
            const nextTimeoutAt = new Date(now.getTime() + timeoutSeconds * 1000);

            await db.collection('orders').updateOne(
              { _id: order._id },
              {
                $set: {
                  currentDispatchIndex: nextIndex,
                  [`dispatchChain.${nextIndex}.status`]: 'sent',
                  [`dispatchChain.${nextIndex}.sentAt`]: now,
                  [`dispatchChain.${nextIndex}.timeoutAt`]: nextTimeoutAt,
                  updatedAt: now
                }
              }
            );

            await addOrderEvent(order._id.toString(), {
              type: 'sent_to_carrier',
              carrierId: nextCarrier.carrierId,
              carrierName: nextCarrier.carrierName,
              details: `Envoye a ${nextCarrier.carrierName} (score: ${nextCarrier.score}/100)`,
              score: nextCarrier.score
            }, db);

            await updateCarrierKPI(nextCarrier.carrierId, 'received', null, null);

          } else {
            // All exhausted - always escalate to Affret IA
            const userId = order.industrialId || order.createdBy;
            console.log(`[DispatchStatus] Order ${order._id}: All carriers exhausted, escalating to Affret IA`);

            // Always escalate to Affret IA - this is the core SYMPHONI.A behavior
            await db.collection('orders').updateOne(
              { _id: order._id },
              { $set: { status: 'affret_ia', updatedAt: now } }
            );
            const affretResult = await triggerAffretIA(order, userId);
            await addOrderEvent(order._id.toString(), {
              type: 'escalated_affret_ia',
              details: 'Tous les transporteurs ont expire - Escalade vers Affret IA',
              affretSessionId: affretResult?.sessionId
            }, db);
          }

          // Reload updated order
          order = await db.collection('orders').findOne({ _id: order._id });
        }
      }
    }

    // Calculate remaining time for current carrier
    let remainingSeconds = null;
    if (order.status === 'planification_auto' && order.dispatchChain) {
      const currentIndex = order.currentDispatchIndex || 0;
      const currentCarrier = order.dispatchChain[currentIndex];
      if (currentCarrier?.timeoutAt) {
        remainingSeconds = Math.max(0, Math.floor((new Date(currentCarrier.timeoutAt) - new Date()) / 1000));
      }
    }

    res.json({
      success: true,
      data: {
        orderId: order._id.toString(),
        status: order.status,
        dispatchChain: order.dispatchChain || [],
        dispatchConfig: order.dispatchConfig,
        currentDispatchIndex: order.currentDispatchIndex,
        remainingSeconds,
        events: (order.events || []).filter(e =>
          ['auto_dispatch_started', 'sent_to_carrier', 'carrier_accepted',
           'carrier_refused', 'escalated_affret_ia', 'dispatch_failed'].includes(e.type)
        )
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/orders/carrier/:carrierId/pending-dispatch - Get pending dispatch requests for a carrier
app.get('/api/orders/carrier/:carrierId/pending-dispatch', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const carrierId = req.params.carrierId;

    // Find orders where this carrier has a pending dispatch
    const orders = await db.collection('orders').find({
      status: 'planification_auto',
      'dispatchChain': {
        $elemMatch: {
          carrierId: carrierId,
          status: 'sent'
        }
      }
    }).toArray();

    const now = new Date();
    const pendingRequests = [];

    for (const order of orders) {
      // Find carrier's entry in dispatch chain
      const carrierEntry = order.dispatchChain.find(
        c => c.carrierId === carrierId && c.status === 'sent'
      );

      if (!carrierEntry) continue;

      // Calculate remaining time
      let remainingSeconds = null;
      if (carrierEntry.timeoutAt) {
        remainingSeconds = Math.max(0, Math.floor((new Date(carrierEntry.timeoutAt) - now) / 1000));
      }

      // Enrich order data
      const enrichedOrder = await enrichOrder(order, db);

      pendingRequests.push({
        orderId: order._id.toString(),
        orderReference: order.reference,
        pickupCity: order.pickupAddress?.city || order.pickup?.city || '-',
        deliveryCity: order.deliveryAddress?.city || order.delivery?.city || '-',
        pickupDate: order.dates?.pickupDate || order.pickupDate || '-',
        deliveryDate: order.dates?.deliveryDate || order.deliveryDate || '-',
        weight: order.goods?.weight || order.weight || 0,
        volume: order.goods?.volume || order.volume,
        palettes: order.goods?.palettes || order.palettes,
        estimatedPrice: order.estimatedPrice || order.price || 0,
        currency: order.currency || 'EUR',
        score: carrierEntry.score,
        position: carrierEntry.position,
        sentAt: carrierEntry.sentAt,
        timeoutAt: carrierEntry.timeoutAt,
        remainingSeconds,
        industrialId: order.industrialId,
        industrialName: enrichedOrder.industrialName || 'Client',
        constraints: order.constraints || [],
        goods: order.goods,
        pickupAddress: order.pickupAddress,
        deliveryAddress: order.deliveryAddress
      });
    }

    // Sort by remaining time (most urgent first)
    pendingRequests.sort((a, b) => (a.remainingSeconds || 0) - (b.remainingSeconds || 0));

    res.json({
      success: true,
      count: pendingRequests.length,
      data: pendingRequests
    });

  } catch (error) {
    console.error('Error getting carrier pending dispatch:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alias with /v1
app.get('/api/v1/orders/carrier/:carrierId/pending-dispatch', async (req, res) => {
  req.url = `/api/orders/carrier/${req.params.carrierId}/pending-dispatch`;
  app.handle(req, res);
});

// ==================== END AUTO-DISPATCH SYSTEM ====================

// ==================== SUPPLIER PORTAL INVITATION ====================

// Helper: Generate random access code (6 alphanumeric chars)
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars like O, 0, I, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/orders/:id/send-supplier-invitation - Send portal invitation to supplier (external sender)
app.post('/api/orders/:id/send-supplier-invitation', async (req, res) => {
  if (!mongoConnected || !db) {
    return res.status(503).json({ error: 'Database not connected' });
  }

  try {
    const orderId = req.params.id;
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Get the order
    let order;
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) });
    } catch (e) {
      order = await db.collection('orders').findOne({ reference: orderId });
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Generate access code
    const accessCode = generateAccessCode();

    // Store access code in order
    await db.collection('orders').updateOne(
      { _id: order._id },
      {
        $set: {
          supplierAccessCode: accessCode,
          supplierEmail: email,
          supplierName: name,
          supplierInvitedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Add event
    await addOrderEvent(order._id.toString(), {
      type: 'supplier_invited',
      details: `Invitation envoyée au fournisseur ${name || email}`,
      supplierEmail: email,
      supplierName: name
    }, db);

    // Send email
    const enrichedOrder = await enrichOrder(order, db);
    const emailResult = await emailOrders.sendSupplierPortalInvitation(
      email,
      name || 'Fournisseur',
      { ...order, ...enrichedOrder },
      accessCode
    );

    res.json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        orderId: order._id.toString(),
        email,
        emailSent: emailResult.success,
        accessCodeGenerated: true
      }
    });

  } catch (error) {
    console.error('Send supplier invitation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Alias with /v1
app.post('/api/v1/orders/:id/send-supplier-invitation', async (req, res) => {
  req.url = `/api/orders/${req.params.id}/send-supplier-invitation`;
  app.handle(req, res);
});

// ==================== END SUPPLIER PORTAL INVITATION ====================

// ==================== AUTO TIMEOUT CHECKER ====================
// Internal cron to check for timed out carriers every minute

async function checkTimeoutsInternal() {
  if (!mongoConnected || !db) {
    return;
  }

  try {
    const now = new Date();

    // Find orders in planification_auto with timed out carriers
    const ordersWithTimeouts = await db.collection('orders').find({
      status: 'planification_auto',
      'dispatchChain': {
        $elemMatch: {
          status: 'sent',
          timeoutAt: { $lte: now }
        }
      }
    }).toArray();

    if (ordersWithTimeouts.length === 0) {
      return;
    }

    console.log(`[AutoTimeout] Found ${ordersWithTimeouts.length} order(s) with timeouts to process`);

    for (const order of ordersWithTimeouts) {
      try {
        const currentIndex = order.currentDispatchIndex || 0;
        const currentCarrier = order.dispatchChain[currentIndex];

        if (!currentCarrier || currentCarrier.status !== 'sent') continue;
        if (new Date(currentCarrier.timeoutAt) > now) continue;

        console.log(`[AutoTimeout] Processing timeout for order ${order._id}, carrier ${currentCarrier.carrierName}`);

        // Mark current carrier as timeout
        await db.collection('orders').updateOne(
          { _id: order._id },
          {
            $set: {
              [`dispatchChain.${currentIndex}.status`]: 'timeout',
              [`dispatchChain.${currentIndex}.respondedAt`]: now,
              [`dispatchChain.${currentIndex}.response`]: 'timeout',
              [`dispatchChain.${currentIndex}.reason`]: 'Delai de reponse depasse (45 min)',
              updatedAt: now
            }
          }
        );

        // Add timeout event
        await addOrderEvent(order._id.toString(), {
          type: 'carrier_refused',
          carrierId: currentCarrier.carrierId,
          carrierName: currentCarrier.carrierName,
          details: `Timeout - ${currentCarrier.carrierName} n'a pas repondu dans les 45 minutes`,
          reason: 'Delai de reponse depasse (timeout)'
        }, db);

        // Update KPI
        await updateCarrierKPI(currentCarrier.carrierId, 'refused', null, 'timeout');

        // Check for next carrier
        const nextIndex = currentIndex + 1;
        if (nextIndex < order.dispatchChain.length) {
          const nextCarrier = order.dispatchChain[nextIndex];
          const timeoutSeconds = order.dispatchConfig?.timeoutSeconds || 2700;
          const nextTimeoutAt = new Date(now.getTime() + timeoutSeconds * 1000);

          await db.collection('orders').updateOne(
            { _id: order._id },
            {
              $set: {
                currentDispatchIndex: nextIndex,
                [`dispatchChain.${nextIndex}.status`]: 'sent',
                [`dispatchChain.${nextIndex}.sentAt`]: now,
                [`dispatchChain.${nextIndex}.timeoutAt`]: nextTimeoutAt,
                updatedAt: now
              }
            }
          );

          await addOrderEvent(order._id.toString(), {
            type: 'sent_to_carrier',
            carrierId: nextCarrier.carrierId,
            carrierName: nextCarrier.carrierName,
            details: `Envoye a ${nextCarrier.carrierName} (score: ${nextCarrier.score}/100)`,
            score: nextCarrier.score
          }, db);

          await updateCarrierKPI(nextCarrier.carrierId, 'received', null, null);

          // Send email notifications
          const enrichedOrder = await enrichOrder(order, db);
          const timeoutMinutes = Math.floor(timeoutSeconds / 60);

          if (enrichedOrder.industrialEmail) {
            emailOrders.sendTimeoutNotificationToIndustrial(
              enrichedOrder.industrialEmail,
              enrichedOrder.industrialName || 'Client',
              { ...order, ...enrichedOrder },
              { name: currentCarrier.carrierName },
              nextCarrier.carrierName
            ).catch(err => console.error('Email timeout notification failed:', err.message));
          }

          if (nextCarrier.carrierEmail) {
            emailOrders.sendDispatchNotificationToCarrier(
              nextCarrier.carrierEmail,
              nextCarrier.carrierName,
              { ...order, ...enrichedOrder },
              timeoutMinutes
            ).catch(err => console.error('Email to next carrier failed:', err.message));
          }

          console.log(`[AutoTimeout] Order ${order._id}: Moved to carrier ${nextCarrier.carrierName}`);

        } else {
          // All carriers exhausted - always escalate to Affret IA
          const userId = order.industrialId || order.createdBy;
          console.log(`[AutoTimeout] Order ${order._id}: All carriers exhausted, escalating to Affret IA`);

          // Always escalate to Affret IA - this is the core SYMPHONI.A behavior
          await db.collection('orders').updateOne(
            { _id: order._id },
            { $set: { status: 'affret_ia', updatedAt: now } }
          );

          const affretResult = await triggerAffretIA(order, userId);
          await addOrderEvent(order._id.toString(), {
            type: 'escalated_affret_ia',
            details: 'Tous les transporteurs ont expire - Escalade vers Affret IA',
            affretSessionId: affretResult?.sessionId
          }, db);

          const enrichedOrder = await enrichOrder(order, db);
          if (enrichedOrder.industrialEmail) {
            emailOrders.sendAffretIAEscalationToIndustrial(
              enrichedOrder.industrialEmail,
              enrichedOrder.industrialName || 'Client',
              { ...order, ...enrichedOrder }
            ).catch(err => console.error('Email Affret IA escalation failed:', err.message));
          }

          console.log(`[AutoTimeout] Order ${order._id}: Escalated to Affret IA successfully`);
        }
      } catch (orderError) {
        console.error(`[AutoTimeout] Error processing order ${order._id}:`, orderError.message);
      }
    }
  } catch (error) {
    console.error('[AutoTimeout] Error checking timeouts:', error.message);
  }
}

// ==================== END AUTO TIMEOUT CHECKER ====================

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log('RT Orders API listening on port ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? 'Connected' : 'Not connected'));

    // Start auto timeout checker - runs every minute
    setInterval(checkTimeoutsInternal, 60 * 1000);
    console.log('✓ Auto timeout checker started (runs every 60 seconds)');
  });
}

startServer();
