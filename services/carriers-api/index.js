/**
 * Carriers API - Gestion des transporteurs SYMPHONI.A
 *
 * Endpoints:
 * - GET /health - Health check
 * - POST /api/v1/carriers/search - Rechercher des transporteurs disponibles
 * - GET /api/v1/carriers - Liste des transporteurs
 * - GET /api/v1/carriers/:id - Details d'un transporteur
 * - POST /api/v1/carriers - Creer un transporteur
 * - PUT /api/v1/carriers/:id - Mettre a jour un transporteur
 * - GET /api/v1/carriers/:id/availability - Disponibilite d'un transporteur
 * - GET /api/v1/carriers/:id/zones - Zones d'activite d'un transporteur
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// MongoDB connection
let db = null;
let carriersCollection = null;

const mongoUri = process.env.MONGODB_URI;

async function connectDB() {
  if (!mongoUri) {
    console.warn('[CARRIERS API] MONGODB_URI not configured');
    return;
  }
  try {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db();
    carriersCollection = db.collection('carriers');

    // Create indexes
    await carriersCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
    await carriersCollection.createIndex({ siret: 1 }, { unique: true, sparse: true });
    await carriersCollection.createIndex({ 'zones.departements': 1 });
    await carriersCollection.createIndex({ 'vehicles.type': 1 });
    await carriersCollection.createIndex({ status: 1 });
    await carriersCollection.createIndex({ createdAt: -1 });

    console.log('[CARRIERS API] MongoDB connected');
  } catch (error) {
    console.error('[CARRIERS API] MongoDB connection error:', error.message);
  }
}

connectDB();

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'carriers-api',
    version: '1.0.0',
    mongodb: db ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// ==================== SEARCH CARRIERS ====================
/**
 * POST /api/v1/carriers/search
 * Rechercher des transporteurs disponibles pour un transport
 *
 * Body: {
 *   pickupPostalCode: string,
 *   deliveryPostalCode: string,
 *   pickupDate: string (ISO date),
 *   vehicleType: string (optional),
 *   cargoType: string (optional),
 *   weight: number (optional),
 *   services: string[] (optional)
 * }
 */
app.post('/api/v1/carriers/search', async (req, res) => {
  try {
    const {
      pickupPostalCode,
      deliveryPostalCode,
      pickupDate,
      vehicleType,
      cargoType,
      weight,
      services = []
    } = req.body;

    if (!pickupPostalCode || !deliveryPostalCode) {
      return res.status(400).json({
        success: false,
        error: 'pickupPostalCode and deliveryPostalCode are required'
      });
    }

    // Extract department codes (first 2 digits)
    const pickupDept = pickupPostalCode.substring(0, 2);
    const deliveryDept = deliveryPostalCode.substring(0, 2);

    // Build query
    const query = {
      status: 'active',
      $or: [
        { 'zones.departements': { $in: [pickupDept, deliveryDept] } },
        { 'zones.national': true },
        { 'zones.international': true }
      ]
    };

    // Filter by vehicle type if specified
    if (vehicleType) {
      query['vehicles.type'] = vehicleType;
    }

    // Filter by capacity if weight specified
    if (weight) {
      query['vehicles.capacity'] = { $gte: weight };
    }

    // Find matching carriers
    let carriers = [];
    if (carriersCollection) {
      carriers = await carriersCollection.find(query).limit(50).toArray();
    }

    // Calculate match score for each carrier
    const scoredCarriers = carriers.map(carrier => {
      let score = 50; // Base score

      // Zone match bonus
      const zones = carrier.zones?.departements || [];
      if (zones.includes(pickupDept) && zones.includes(deliveryDept)) {
        score += 30; // Both zones covered
      } else if (zones.includes(pickupDept) || zones.includes(deliveryDept)) {
        score += 15; // One zone covered
      }

      // Vehicle type match bonus
      if (vehicleType && carrier.vehicles?.some(v => v.type === vehicleType)) {
        score += 10;
      }

      // Experience bonus (based on completed transports)
      const completedTransports = carrier.stats?.completedTransports || 0;
      if (completedTransports > 100) score += 10;
      else if (completedTransports > 50) score += 7;
      else if (completedTransports > 10) score += 5;

      return {
        carrierId: carrier._id.toString(),
        carrierName: carrier.name || carrier.companyName,
        email: carrier.email,
        phone: carrier.phone,
        siret: carrier.siret,
        vehicles: carrier.vehicles || [],
        zones: carrier.zones || {},
        capacity: carrier.vehicles?.[0]?.capacity || 0,
        matchScore: Math.min(score, 100),
        stats: carrier.stats || {},
        compliance: carrier.compliance || {}
      };
    });

    // Sort by match score
    scoredCarriers.sort((a, b) => b.matchScore - a.matchScore);

    res.json({
      success: true,
      data: scoredCarriers,
      meta: {
        total: scoredCarriers.length,
        query: {
          pickupPostalCode,
          deliveryPostalCode,
          pickupDate,
          vehicleType
        }
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== LIST CARRIERS ====================
app.get('/api/v1/carriers', async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { siret: { $regex: search, $options: 'i' } }
      ];
    }

    let carriers = [];
    let total = 0;

    if (carriersCollection) {
      total = await carriersCollection.countDocuments(query);
      carriers = await carriersCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .toArray();
    }

    res.json({
      success: true,
      data: carriers.map(c => ({
        id: c._id.toString(),
        name: c.name || c.companyName,
        email: c.email,
        phone: c.phone,
        siret: c.siret,
        status: c.status,
        vehicles: c.vehicles || [],
        zones: c.zones || {},
        stats: c.stats || {},
        createdAt: c.createdAt
      })),
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET CARRIER BY ID ====================
app.get('/api/v1/carriers/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    let carrier = null;
    try {
      carrier = await carriersCollection.findOne({ _id: new ObjectId(id) });
    } catch (e) {
      // Try by email or siret
      carrier = await carriersCollection.findOne({
        $or: [{ email: id }, { siret: id }]
      });
    }

    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }

    res.json({
      success: true,
      data: {
        id: carrier._id.toString(),
        name: carrier.name || carrier.companyName,
        companyName: carrier.companyName,
        email: carrier.email,
        phone: carrier.phone,
        siret: carrier.siret,
        address: carrier.address,
        status: carrier.status,
        vehicles: carrier.vehicles || [],
        zones: carrier.zones || {},
        documents: carrier.documents || {},
        compliance: carrier.compliance || {},
        stats: carrier.stats || {},
        subscription: carrier.subscription || {},
        createdAt: carrier.createdAt,
        updatedAt: carrier.updatedAt
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Get carrier error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CREATE CARRIER ====================
app.post('/api/v1/carriers', async (req, res) => {
  try {
    const {
      name,
      companyName,
      email,
      phone,
      siret,
      address,
      vehicles = [],
      zones = {}
    } = req.body;

    if (!email && !siret) {
      return res.status(400).json({
        success: false,
        error: 'email or siret is required'
      });
    }

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    // Check if carrier exists
    const existing = await carriersCollection.findOne({
      $or: [
        ...(email ? [{ email }] : []),
        ...(siret ? [{ siret }] : [])
      ]
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Carrier already exists',
        existingId: existing._id.toString()
      });
    }

    const carrier = {
      name: name || companyName,
      companyName,
      email,
      phone,
      siret,
      address,
      vehicles,
      zones,
      status: 'pending', // pending, active, suspended, inactive
      documents: {
        kbis: { status: 'missing' },
        insurance: { status: 'missing' },
        license: { status: 'missing' }
      },
      compliance: {
        status: 'pending',
        score: 0,
        lastCheck: null
      },
      stats: {
        completedTransports: 0,
        cancelledTransports: 0,
        averageRating: 0,
        onTimeDeliveryRate: 0
      },
      subscription: {
        plan: 'trial',
        transportsRemaining: 10,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await carriersCollection.insertOne(carrier);

    res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        ...carrier
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== UPDATE CARRIER ====================
app.put('/api/v1/carriers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.createdAt;
    updates.updatedAt = new Date();

    const result = await carriersCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }

    res.json({
      success: true,
      data: {
        id: result._id.toString(),
        ...result
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET CARRIER AVAILABILITY ====================
app.get('/api/v1/carriers/:id/availability', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startDate, endDate } = req.query;

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    const carrier = await carriersCollection.findOne({ _id: new ObjectId(id) });
    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }

    // For now, return simple availability based on status
    const isAvailable = carrier.status === 'active';

    res.json({
      success: true,
      data: {
        carrierId: id,
        available: isAvailable,
        status: carrier.status,
        vehicles: carrier.vehicles?.map(v => ({
          type: v.type,
          capacity: v.capacity,
          available: true
        })) || [],
        message: isAvailable ? 'Carrier is available' : 'Carrier is not available'
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Availability error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== GET CARRIER ZONES ====================
app.get('/api/v1/carriers/:id/zones', async (req, res) => {
  try {
    const { id } = req.params;

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    const carrier = await carriersCollection.findOne({ _id: new ObjectId(id) });
    if (!carrier) {
      return res.status(404).json({ success: false, error: 'Carrier not found' });
    }

    res.json({
      success: true,
      data: {
        carrierId: id,
        zones: carrier.zones || {},
        coverage: {
          departements: carrier.zones?.departements || [],
          national: carrier.zones?.national || false,
          international: carrier.zones?.international || false,
          countries: carrier.zones?.countries || ['FR']
        }
      }
    });

  } catch (error) {
    console.error('[CARRIERS API] Zones error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== UPDATE CARRIER STATS ====================
app.post('/api/v1/carriers/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const { event, data } = req.body;

    if (!carriersCollection) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }

    let updateQuery = { updatedAt: new Date() };

    switch (event) {
      case 'transport_completed':
        updateQuery['$inc'] = { 'stats.completedTransports': 1 };
        break;
      case 'transport_cancelled':
        updateQuery['$inc'] = { 'stats.cancelledTransports': 1 };
        break;
      case 'rating':
        // Recalculate average rating
        const carrier = await carriersCollection.findOne({ _id: new ObjectId(id) });
        const currentRating = carrier?.stats?.averageRating || 0;
        const totalRatings = carrier?.stats?.totalRatings || 0;
        const newRating = ((currentRating * totalRatings) + data.rating) / (totalRatings + 1);
        updateQuery['$set'] = { 'stats.averageRating': newRating };
        updateQuery['$inc'] = { 'stats.totalRatings': 1 };
        break;
      default:
        return res.status(400).json({ success: false, error: 'Unknown event type' });
    }

    await carriersCollection.updateOne(
      { _id: new ObjectId(id) },
      updateQuery
    );

    res.json({ success: true, message: 'Stats updated' });

  } catch (error) {
    console.error('[CARRIERS API] Stats update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`[CARRIERS API] Running on port ${PORT}`);
});

module.exports = app;
