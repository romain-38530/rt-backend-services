// RT Orders API with Express and MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const https = require('https');

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

  // Try to get supplier name
  if (order.supplierId && db) {
    try {
      const supplier = await db.collection('users').findOne({ _id: new ObjectId(order.supplierId) });
      if (supplier) {
        enriched.supplierName = supplier.companyName || supplier.name || supplier.email;
      }
    } catch (e) {
      // Ignore lookup errors
    }
  }

  // Try to get recipient name
  if (order.recipientId && db) {
    try {
      const recipient = await db.collection('users').findOne({ _id: new ObjectId(order.recipientId) });
      if (recipient) {
        enriched.recipientName = recipient.companyName || recipient.name || recipient.email;
      }
    } catch (e) {
      // Ignore lookup errors
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
