/**
 * RT TMS Sync API
 * Service de synchronisation avec les TMS externes (Dashdoc, Transporeon, etc.)
 *
 * Endpoints:
 * - POST   /api/v1/tms/connections           - Creer une connexion TMS
 * - GET    /api/v1/tms/connections           - Liste des connexions
 * - GET    /api/v1/tms/connections/:id       - Details d'une connexion
 * - PUT    /api/v1/tms/connections/:id       - Modifier une connexion
 * - DELETE /api/v1/tms/connections/:id       - Supprimer une connexion
 * - POST   /api/v1/tms/connections/:id/test  - Tester une connexion
 * - POST   /api/v1/tms/connections/:id/sync  - Lancer une synchronisation
 * - GET    /api/v1/tms/connections/:id/logs  - Logs de sync
 * - GET    /api/v1/tms/connections/:id/counters - Compteurs temps reel
 * - GET    /api/v1/tms/connections/:id/data/:type - Donnees synchronisees
 */

// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const TMSConnectionService = require('./services/tms-connection.service');
const DashdocConnector = require('./connectors/dashdoc.connector');
const scheduledJobs = require('./scheduled-jobs');

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;
let tmsService = null;

async function connectMongoDB() {
  if (!process.env.MONGODB_URI) {
    console.log('Warning: MongoDB URI not configured');
    return false;
  }

  try {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db();
    mongoConnected = true;

    // Initialiser le service TMS
    tmsService = new TMSConnectionService(db);
    await tmsService.init();

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

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'tms-sync',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: '2.1.1',
    features: ['dashdoc', 'auto-sync', 'real-time-counters'],
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
    message: 'RT TMS Sync API',
    version: '2.1.1',
    supportedTMS: ['dashdoc'],
    endpoints: [
      'GET /health',
      'POST /api/v1/tms/connections',
      'GET /api/v1/tms/connections',
      'GET /api/v1/tms/connections/:id',
      'PUT /api/v1/tms/connections/:id',
      'DELETE /api/v1/tms/connections/:id',
      'POST /api/v1/tms/connections/:id/test',
      'POST /api/v1/tms/connections/:id/sync',
      'GET /api/v1/tms/connections/:id/logs',
      'GET /api/v1/tms/connections/:id/counters',
      'GET /api/v1/tms/connections/:id/data/:type',
      'POST /api/v1/tms/test-token'
    ]
  });
});

// Middleware to check MongoDB connection
const requireMongo = (req, res, next) => {
  if (!mongoConnected || !tmsService) {
    return res.status(503).json({ error: 'Database not available' });
  }
  next();
};

// ==================== TMS CONNECTION ROUTES ====================

/**
 * Tester un token API directement (sans creer de connexion)
 */
app.post('/api/v1/tms/test-token', async (req, res) => {
  try {
    const { tmsType, apiToken, apiUrl } = req.body;

    if (!tmsType || !apiToken) {
      return res.status(400).json({ error: 'tmsType and apiToken required' });
    }

    let result;
    switch (tmsType) {
      case 'dashdoc':
        const dashdoc = new DashdocConnector(apiToken, { baseUrl: apiUrl });
        result = await dashdoc.testConnection();
        break;
      default:
        return res.status(400).json({ error: `TMS type ${tmsType} not supported` });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Creer une nouvelle connexion TMS
 */
app.post('/api/v1/tms/connections', requireMongo, async (req, res) => {
  try {
    const connection = await tmsService.createConnection(req.body);
    res.status(201).json({ success: true, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Liste des connexions (optionnel: par organisation)
 */
app.get('/api/v1/tms/connections', requireMongo, async (req, res) => {
  try {
    let connections;
    if (req.query.organizationId) {
      connections = await tmsService.getConnectionsByOrganization(req.query.organizationId);
    } else {
      connections = await db.collection('tmsConnections').find({}).toArray();
    }

    // Ne pas exposer les credentials
    connections = connections.map(c => ({
      ...c,
      credentials: {
        apiUrl: c.credentials?.apiUrl,
        hasToken: !!c.credentials?.apiToken
      }
    }));

    res.json({ success: true, connections });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Details d'une connexion
 */
app.get('/api/v1/tms/connections/:id', requireMongo, async (req, res) => {
  try {
    const connection = await tmsService.getConnection(req.params.id);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Ne pas exposer le token
    connection.credentials = {
      apiUrl: connection.credentials?.apiUrl,
      hasToken: !!connection.credentials?.apiToken
    };

    res.json({ success: true, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Modifier une connexion
 */
app.put('/api/v1/tms/connections/:id', requireMongo, async (req, res) => {
  try {
    const updates = { ...req.body };

    // Si un nouveau token est fourni, le mettre dans credentials
    if (updates.apiToken) {
      updates['credentials.apiToken'] = updates.apiToken;
      delete updates.apiToken;
    }

    const connection = await tmsService.updateConnection(req.params.id, updates);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    res.json({ success: true, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Supprimer une connexion
 */
app.delete('/api/v1/tms/connections/:id', requireMongo, async (req, res) => {
  try {
    const result = await tmsService.deleteConnection(req.params.id);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    res.json({ success: true, message: 'Connection deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Tester une connexion
 */
app.post('/api/v1/tms/connections/:id/test', requireMongo, async (req, res) => {
  try {
    const result = await tmsService.testConnection(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lancer une synchronisation
 * POST /api/v1/tms/connections/:id/sync
 *
 * Body params:
 * - transportLimit: number (0 = illimité avec pagination, default: config)
 * - maxPages: number (limite de pages pour pagination, default: 100)
 * - toPlan: boolean (true = uniquement les commandes "À planifier" = created, unassigned)
 * - status__in: string (liste de statuts séparés par virgule, ex: "created,assigned")
 * - tags__in: string (filtrer par tags Dashdoc)
 * - companyLimit: number (default: 500)
 * - contactLimit: number (default: 500)
 * - invoiceLimit: number (default: 100)
 */
app.post('/api/v1/tms/connections/:id/sync', requireMongo, async (req, res) => {
  try {
    const result = await tmsService.executeSync(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Logs de synchronisation
 */
app.get('/api/v1/tms/connections/:id/logs', requireMongo, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = await tmsService.getSyncLogs(req.params.id, limit);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Compteurs temps reel
 */
app.get('/api/v1/tms/connections/:id/counters', requireMongo, async (req, res) => {
  try {
    const counters = await tmsService.getRealtimeCounters(req.params.id);
    res.json({ success: true, counters });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Donnees synchronisees par type
 */
app.get('/api/v1/tms/connections/:id/data/:type', requireMongo, async (req, res) => {
  try {
    const { id, type } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const collectionMap = {
      'transports': 'orders',
      'orders': 'orders',
      'companies': 'companies',
      'contacts': 'contacts',
      'vehicles': 'fleet',
      'trailers': 'fleet',
      'drivers': 'drivers',
      'truckers': 'drivers'
    };

    const collectionName = collectionMap[type];
    if (!collectionName) {
      return res.status(400).json({ error: `Unknown data type: ${type}` });
    }

    const collection = db.collection(collectionName);
    const query = {
      tmsConnectionId: id,
      externalSource: 'dashdoc'
    };

    // Pour fleet, filtrer par type
    if (type === 'vehicles') {
      query.type = 'vehicle';
    } else if (type === 'trailers') {
      query.type = 'trailer';
    }

    const [data, total] = await Promise.all([
      collection.find(query).skip(skip).limit(limit).sort({ syncedAt: -1 }).toArray(),
      collection.countDocuments(query)
    ]);

    res.json({
      success: true,
      type,
      total,
      limit,
      skip,
      data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Statistiques globales des donnees synchronisees
 */
app.get('/api/v1/tms/connections/:id/stats', requireMongo, async (req, res) => {
  try {
    const { id } = req.params;

    const [orders, companies, contacts, fleet, drivers] = await Promise.all([
      db.collection('orders').countDocuments({ tmsConnectionId: id, externalSource: 'dashdoc' }),
      db.collection('companies').countDocuments({ tmsConnectionId: id, externalSource: 'dashdoc' }),
      db.collection('contacts').countDocuments({ tmsConnectionId: id, externalSource: 'dashdoc' }),
      db.collection('fleet').countDocuments({ tmsConnectionId: id, externalSource: 'dashdoc' }),
      db.collection('drivers').countDocuments({ tmsConnectionId: id, externalSource: 'dashdoc' })
    ]);

    res.json({
      success: true,
      stats: {
        orders,
        companies,
        contacts,
        fleet,
        drivers,
        total: orders + companies + contacts + fleet + drivers
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Recuperer les transports/commandes avec filtres (tag, status, etc.)
 * GET /api/v1/tms/orders?tag=Symphonia&status=ongoing
 */
app.get('/api/v1/tms/orders', requireMongo, async (req, res) => {
  try {
    const { tag, status, limit = 100, skip = 0 } = req.query;

    const query = { externalSource: 'dashdoc' };

    // Filtre par tag
    if (tag) {
      query['externalData.tags'] = { $elemMatch: { name: tag } };
    }

    // Filtre par status
    if (status) {
      query['externalData.status'] = status;
    } else {
      // Par defaut, exclure les commandes annulees (cancelled, declined)
      query['externalData.status'] = { $nin: ['cancelled', 'declined'] };
    }

    const [orders, total] = await Promise.all([
      db.collection('orders')
        .find(query)
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .sort({ 'externalData.created': -1 })
        .toArray(),
      db.collection('orders').countDocuments(query)
    ]);

    res.json({
      success: true,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      orders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Filtrage avance des commandes
 * GET /api/v1/tms/orders/filtered
 *
 * Query params:
 * - status: string (PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED)
 * - toPlan: boolean (true = uniquement les commandes "À planifier" = DRAFT ou PENDING)
 * - city: string (ville de pickup ou delivery, recherche partielle)
 * - postalCode: string (code postal pickup ou delivery, exact)
 * - cargoType: string (type de marchandise, recherche partielle)
 * - minWeight: number (poids minimum en kg)
 * - maxWeight: number (poids maximum en kg)
 * - carrierId: string (external ID du transporteur)
 * - carrierName: string (nom du transporteur, recherche partielle)
 * - dateFrom: ISO date (createdAt >= dateFrom)
 * - dateTo: ISO date (createdAt <= dateTo)
 * - isDangerous: boolean (marchandise dangereuse)
 * - isRefrigerated: boolean (marchandise refrigeree)
 * - skip: number (pagination offset, defaut: 0)
 * - limit: number (pagination limit, defaut: 50, max: 100)
 * - sortBy: string (champ de tri, defaut: createdAt)
 * - sortOrder: string (asc ou desc, defaut: desc)
 */
app.get('/api/v1/tms/orders/filtered', requireMongo, async (req, res) => {
  try {
    const {
      status,
      toPlan,
      city,
      postalCode,
      cargoType,
      minWeight,
      maxWeight,
      carrierId,
      carrierName,
      dateFrom,
      dateTo,
      isDangerous,
      isRefrigerated,
      skip = 0,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construction du filtre MongoDB
    const query = { externalSource: 'dashdoc' };

    // Filtre "À planifier" (to plan) - commandes créées ou non assignées
    if (toPlan === 'true') {
      query.status = { $in: ['DRAFT', 'PENDING'] };
      console.log('[FILTER] Filtering for "À planifier" orders only (DRAFT, PENDING)');
    }
    // Filtre par statut spécifique
    else if (status) {
      query.status = status;
    }
    // Par défaut, exclure les commandes annulées
    else {
      query.status = { $ne: 'CANCELLED' };
    }

    // Filtre geolocalise: ville (pickup OU delivery)
    if (city) {
      query.$or = [
        { 'pickup.address.city': { $regex: city, $options: 'i' } },
        { 'delivery.address.city': { $regex: city, $options: 'i' } }
      ];
    }

    // Filtre geolocalise: code postal (pickup OU delivery)
    if (postalCode) {
      // Si $or existe deja, on fusionne
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          {
            $or: [
              { 'pickup.address.postalCode': postalCode },
              { 'delivery.address.postalCode': postalCode }
            ]
          }
        ];
        delete query.$or;
      } else {
        query.$or = [
          { 'pickup.address.postalCode': postalCode },
          { 'delivery.address.postalCode': postalCode }
        ];
      }
    }

    // Filtre par type de marchandise
    if (cargoType) {
      query['cargo.category'] = { $regex: cargoType, $options: 'i' };
    }

    // Filtre par poids (utilise le premier cargo)
    if (minWeight || maxWeight) {
      query['cargo.0.weight'] = {};
      if (minWeight) query['cargo.0.weight'].$gte = parseFloat(minWeight);
      if (maxWeight) query['cargo.0.weight'].$lte = parseFloat(maxWeight);
    }

    // Filtre par transporteur (external ID)
    if (carrierId) {
      query['carrier.externalId'] = carrierId;
    }

    // Filtre par nom transporteur
    if (carrierName) {
      query['carrier.name'] = { $regex: carrierName, $options: 'i' };
    }

    // Filtre par date de creation
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Filtre marchandise dangereuse
    if (isDangerous === 'true' || isDangerous === true) {
      query['cargo.isDangerous'] = true;
    }

    // Filtre marchandise refrigeree
    if (isRefrigerated === 'true' || isRefrigerated === true) {
      query['cargo.isRefrigerated'] = true;
    }

    // Parametres de pagination
    const skipNum = parseInt(skip) || 0;
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100

    // Tri
    const sortField = sortBy || 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortDir };

    console.log('[TMS ORDERS FILTERED] Query:', JSON.stringify(query, null, 2));

    // Execution de la requete avec pagination
    const [orders, total] = await Promise.all([
      db.collection('orders')
        .find(query)
        .sort(sort)
        .skip(skipNum)
        .limit(limitNum)
        .toArray(),
      db.collection('orders').countDocuments(query)
    ]);

    // Metadata de pagination
    const meta = {
      total,
      skip: skipNum,
      limit: limitNum,
      returned: orders.length,
      page: Math.floor(skipNum / limitNum) + 1,
      totalPages: Math.ceil(total / limitNum),
      hasNext: skipNum + limitNum < total,
      hasPrev: skipNum > 0
    };

    res.json({
      success: true,
      filters: {
        status,
        city,
        postalCode,
        cargoType,
        minWeight,
        maxWeight,
        carrierId,
        carrierName,
        dateFrom,
        dateTo,
        isDangerous,
        isRefrigerated
      },
      meta,
      orders
    });

  } catch (error) {
    console.error('Error filtering orders:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Recuperer les transports Dashdoc en temps reel via API
 * GET /api/v1/tms/dashdoc/transports?tag=Symphonia
 */
app.get('/api/v1/tms/dashdoc/transports', requireMongo, async (req, res) => {
  try {
    const { tag, status, limit = 50 } = req.query;

    // Recuperer la premiere connexion Dashdoc active
    const connection = await db.collection('tmsConnections').findOne({
      tmsType: 'dashdoc',
      isActive: true
    });

    if (!connection) {
      return res.status(404).json({ error: 'No active Dashdoc connection found' });
    }

    const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl
    });

    // Appeler l'API Dashdoc avec filtre tag
    const params = { limit: parseInt(limit) };
    if (tag) params.tags__in = tag;
    if (status) params.status__in = status;

    // Appeler l'API directement pour eviter les erreurs de mapping
    const axios = require('axios');
    const client = axios.create({
      baseURL: connection.credentials.apiUrl || 'https://www.dashdoc.eu/api/v4',
      timeout: 30000,
      headers: {
        'Authorization': `Token ${connection.credentials.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    const urlParams = new URLSearchParams();
    urlParams.append('limit', params.limit);
    if (params.tags__in) urlParams.append('tags__in', params.tags__in);
    if (params.status__in) urlParams.append('status__in', params.status__in);

    const response = await client.get(`/transports/?${urlParams.toString()}`);
    const data = response.data;

    res.json({
      success: true,
      total: data.count || 0,
      transports: data.results || []
    });
  } catch (error) {
    console.error('Error fetching Dashdoc transports:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SCHEDULED JOBS ROUTES ====================

/**
 * Status des jobs planifies
 */
app.get('/api/v1/jobs/status', (req, res) => {
  res.json({ success: true, status: scheduledJobs.getJobsStatus() });
});

/**
 * Demarrer tous les jobs
 */
app.post('/api/v1/jobs/start', (req, res) => {
  if (!mongoConnected || !tmsService) {
    return res.status(503).json({ error: 'Database or service not available' });
  }
  scheduledJobs.startAllJobs(db, tmsService);
  res.json({ success: true, message: 'Jobs started' });
});

/**
 * Arreter tous les jobs
 */
app.post('/api/v1/jobs/stop', (req, res) => {
  scheduledJobs.stopAllJobs();
  res.json({ success: true, message: 'Jobs stopped' });
});

/**
 * Executer un job manuellement
 */
app.post('/api/v1/jobs/:jobName/run', async (req, res) => {
  try {
    const result = await scheduledJobs.runJobManually(req.params.jobName);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
async function startServer() {
  await connectMongoDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RT TMS Sync API v2.1.1 listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`MongoDB: ${mongoConnected ? 'Connected' : 'Not connected'}`);

    // Demarrer les jobs scheduled si MongoDB connecte
    if (mongoConnected && tmsService) {
      console.log('Starting scheduled jobs...');
      scheduledJobs.startAllJobs(db, tmsService);
    } else {
      console.warn('⚠️  Scheduled jobs NOT started - MongoDB not connected');
    }
  });
}

startServer();
