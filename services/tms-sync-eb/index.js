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

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const TMSConnectionService = require('./services/tms-connection.service');
const VigilanceService = require('./services/vigilance.service');
const DashdocConnector = require('./connectors/dashdoc.connector');
const AffretIAEventListeners = require('./event-listeners/affretia-events');
const affretIASyncRoutes = require('./routes/affretia-sync.routes');
const scheduledJobs = require('./scheduled-jobs');
const cacheService = require('./services/redis-cache.service');
const packageJson = require('./package.json');

const app = express();
const PORT = process.env.PORT || 3000;
const VERSION = packageJson.version;
const JWT_SECRET = process.env.JWT_SECRET || 'RtProd2026KeyAuth0MainToken123456XY';

// MongoDB connection
let db = null;
let mongoClient = null;
let mongoConnected = false;
let tmsService = null;
let vigilanceService = null;

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

    // ==================== DATA LAKE INITIALIZATION ====================
    // Initialiser les Data Lake readers pour tous les services
    let datalakeReaders = null;
    try {
      const { createReaders } = require('./services/dashdoc-datalake/data-readers');
      datalakeReaders = createReaders(db);
      console.log('[DATA LAKE] Readers initialized for tms-sync-eb');
    } catch (err) {
      console.warn('[DATA LAKE] Readers not available:', err.message);
    }

    // Initialiser le service TMS avec Data Lake
    tmsService = new TMSConnectionService(db);
    await tmsService.init();
    if (datalakeReaders) {
      tmsService.setDatalakeReaders(datalakeReaders);
    }

    // Initialiser le service de vigilance avec Data Lake
    vigilanceService = new VigilanceService(db, datalakeReaders);

    // Initialiser le cache Redis
    await cacheService.init();
    const cacheStats = await cacheService.getStats();
    console.log(`[CACHE] Initialized: ${cacheStats.mode}`);

    // Initialiser le service de sync Affret.IA → Dashdoc
    try {
      const affretIAListeners = new AffretIAEventListeners(null); // null car pas de WebSocket ici
      await affretIAListeners.initialize();
      console.log('[Affret.IA Sync] Service initialized');
    } catch (error) {
      console.error('[Affret.IA Sync] Failed to initialize:', error);
    }

    // Configurer la base de données pour les routes Tracking IA
    try {
      const trackingIARoutes = require('./routes/tracking-ia.routes');
      trackingIARoutes.setDatabase(db);
      console.log('[Tracking IA] Routes configured with database');
    } catch (error) {
      console.error('[Tracking IA] Failed to configure:', error);
    }

    // Configurer la base de données pour les routes Vigilance
    try {
      const vigilanceRoutes = require('./routes/vigilance.routes');
      // Initialiser Data Lake readers pour enrichir les données Dashdoc
      let datalakeReaders = null;
      try {
        const { createReaders } = require('./services/dashdoc-datalake/data-readers');
        datalakeReaders = createReaders(db);
        console.log('[Vigilance] Data Lake readers initialized');
      } catch (err) {
        console.warn('[Vigilance] Data Lake readers not available:', err.message);
      }
      vigilanceRoutes.setDatabase(db, datalakeReaders);
      console.log('[Vigilance] Routes configured with database');
    } catch (error) {
      console.error('[Vigilance] Failed to configure:', error);
    }

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

// CORS configuration - Allow all origins for public API access
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400 // 24 hours preflight cache
};
app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

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
    version: VERSION,
    features: ['dashdoc', 'auto-sync', 'real-time-counters', 'carriers', 'vigilance', 'affretia-sync'],
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
    version: VERSION,
    supportedTMS: ['dashdoc'],
    features: ['carriers', 'vigilance', 'orders', 'real-time-sync', 'affretia-dashdoc-sync', 'datalake', 'tracking-ia'],
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
      'POST /api/v1/tms/test-token',
      'GET /api/v1/tms/carriers',
      'GET /api/v1/tms/carriers/:id',
      'GET /api/v1/tms/carriers/:id/vigilance',
      'POST /api/v1/tms/carriers/:id/vigilance/update',
      'POST /api/v1/tms/carriers/vigilance/update-all',
      'GET /api/v1/tms/carriers/vigilance/stats',
      '--- Truckers (Data Lake) ---',
      'GET /api/v1/tms/truckers',
      'GET /api/v1/tms/truckers/:id',
      'GET /api/v1/tms/truckers/search',
      'GET /api/v1/tms/truckers/stats',
      'GET /api/v1/tms/truckers/expiring-docs',
      '--- Contacts (Data Lake) ---',
      'GET /api/v1/tms/contacts',
      'GET /api/v1/tms/contacts/:id',
      'GET /api/v1/tms/contacts/search',
      'GET /api/v1/tms/contacts/stats',
      'GET /api/v1/tms/contacts/by-company/:companyPk',
      'POST /api/v1/tms/affretia-sync/manual',
      'POST /api/v1/tms/affretia-sync/test',
      'POST /api/v1/tms/affretia-sync/webhook',
      'GET /api/v1/tms/affretia-sync/status',
      '--- Data Lake ---',
      'GET /api/v1/datalake/status',
      'GET /api/v1/datalake/transports',
      'GET /api/v1/datalake/carriers',
      'GET /api/v1/datalake/freshness',
      '--- Tracking IA ---',
      'POST /api/v1/tracking-ia/events',
      'POST /api/v1/tracking-ia/position',
      'POST /api/v1/tracking-ia/eta',
      'POST /api/v1/tracking-ia/status',
      'POST /api/v1/tracking-ia/batch',
      'GET /api/v1/tracking-ia/history/:transportUid',
      '--- Vigilance ---',
      'GET /api/v1/vigilance/carriers/:carrierId',
      'POST /api/v1/vigilance/carriers/:carrierId/update',
      'GET /api/v1/vigilance/datalake/carriers',
      'GET /api/v1/vigilance/datalake/stats',
      'POST /api/v1/vigilance/update-all',
      'GET /api/v1/vigilance/stats'
    ]
  });
});

// JWT Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'UNAUTHORIZED'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  });
}

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
app.post('/api/v1/tms/connections', authenticateToken, requireMongo, async (req, res) => {
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
app.get('/api/v1/tms/connections', authenticateToken, requireMongo, async (req, res) => {
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
 * Details d'une connexion (avec cache Redis)
 */
app.get('/api/v1/tms/connections/:id', authenticateToken, requireMongo, async (req, res) => {
  try {
    const connectionId = req.params.id;

    // 1. Vérifier cache
    const cached = await cacheService.getConnectionStatus(connectionId);
    if (cached) {
      console.log(`[CACHE HIT] Connection ${connectionId}`);
      return res.json({
        success: true,
        cached: true,
        connection: cached
      });
    }

    // 2. Fetch from database
    const connection = await tmsService.getConnection(connectionId);
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    // Ne pas exposer le token
    const sanitizedConnection = {
      ...connection,
      credentials: {
        apiUrl: connection.credentials?.apiUrl,
        hasToken: !!connection.credentials?.apiToken
      }
    };

    // 3. Store in cache (30s TTL)
    await cacheService.setConnectionStatus(connectionId, sanitizedConnection, 30);

    res.json({
      success: true,
      cached: false,
      connection: sanitizedConnection
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Modifier une connexion
 */
app.put('/api/v1/tms/connections/:id', authenticateToken, requireMongo, async (req, res) => {
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
app.delete('/api/v1/tms/connections/:id', authenticateToken, requireMongo, async (req, res) => {
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
 * Lancer une synchronisation (PROTECTED)
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
app.post('/api/v1/tms/connections/:id/sync', authenticateToken, requireMongo, async (req, res) => {
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
 * ⚠️ DATA LAKE: Supporte source=datalake pour lire depuis dashdoc_transports
 *
 * Query params:
 * - source: 'local' (default) | 'datalake'
 * - connectionId: Filter by TMS connection (multi-tenant)
 */
app.get('/api/v1/tms/orders', requireMongo, async (req, res) => {
  try {
    const { tag = 'Symphonia', status, limit = 100, skip = 0, noTransportMeans, source = 'local', connectionId } = req.query;

    // ✅ NOUVEAU: Support Data Lake
    if (source === 'datalake') {
      const datalakeQuery = {};

      if (connectionId) datalakeQuery.connectionId = connectionId;

      // Filtre par tag
      if (tag && tag !== 'all') {
        datalakeQuery['_rawData.tags'] = { $elemMatch: { name: tag } };
      }

      // Filtre par status
      if (status) {
        datalakeQuery.status = { $in: status.split(',') };
      }

      const [transports, total] = await Promise.all([
        db.collection('dashdoc_transports')
          .find(datalakeQuery)
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .sort({ created: -1 })
          .toArray(),
        db.collection('dashdoc_transports').countDocuments(datalakeQuery)
      ]);

      return res.json({
        success: true,
        source: 'datalake',
        total,
        limit: parseInt(limit),
        skip: parseInt(skip),
        orders: transports.map(t => t._rawData || t)
      });
    }

    // Source=local (comportement par défaut)
    const query = { externalSource: 'dashdoc' };

    // Filtre par tag (par défaut "Symphonia")
    // Les tags sont des objets {pk, name, color}, donc on doit chercher dans tags.name
    if (tag && tag !== 'all') {
      query.tags = { $elemMatch: { name: tag } };
    }

    // Filtre par status
    if (status) {
      query.status = status;
    } else {
      // Par defaut, exclure les commandes annulees (cancelled, declined)
      query.status = { $nin: ['CANCELLED', 'DECLINED'] };
    }

    // Filtre: uniquement les commandes SANS moyen de transport assigné
    if (noTransportMeans === 'true' || noTransportMeans === true) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { 'transportMeans.hasVehicle': { $ne: true } },
          { 'transportMeans.hasVehicle': { $exists: false } }
        ]
      });
      query.$and.push({
        $or: [
          { 'transportMeans.hasTrucker': { $ne: true } },
          { 'transportMeans.hasTrucker': { $exists: false } }
        ]
      });
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
      source: 'local',
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
 * ⚠️ DATA LAKE: Supporte source=datalake pour lire depuis dashdoc_transports
 *
 * Query params:
 * - source: 'local' (default) | 'datalake'
 * - connectionId: Filter by TMS connection (multi-tenant)
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
      tag = 'Symphonia',
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
      noTransportMeans,
      skip = 0,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      source = 'local',
      connectionId
    } = req.query;

    // ✅ NOUVEAU: Support Data Lake
    if (source === 'datalake') {
      const datalakeQuery = {};
      if (connectionId) datalakeQuery.connectionId = connectionId;

      // Filtre par tag
      if (tag && tag !== 'all') {
        datalakeQuery['_rawData.tags'] = { $elemMatch: { name: tag } };
      }

      // Filtre par status
      if (status) {
        datalakeQuery.status = { $in: status.split(',') };
      } else if (toPlan === 'true') {
        datalakeQuery.status = { $in: ['created', 'unassigned'] };
      }

      // Filtre par ville
      if (city) {
        datalakeQuery.$or = [
          { 'pickup.address.city': { $regex: city, $options: 'i' } },
          { 'delivery.address.city': { $regex: city, $options: 'i' } }
        ];
      }

      // Filtre par carrier
      if (carrierId) {
        datalakeQuery['carrier.pk'] = parseInt(carrierId.replace('dashdoc-', '')) || carrierId;
      }

      // Pagination
      const skipNum = parseInt(skip) || 0;
      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const sortDir = sortOrder === 'asc' ? 1 : -1;

      const [transports, total] = await Promise.all([
        db.collection('dashdoc_transports')
          .find(datalakeQuery)
          .sort({ created: sortDir })
          .skip(skipNum)
          .limit(limitNum)
          .toArray(),
        db.collection('dashdoc_transports').countDocuments(datalakeQuery)
      ]);

      return res.json({
        success: true,
        source: 'datalake',
        cached: false,
        filters: { status, city, postalCode, carrierId, carrierName, toPlan, tag },
        meta: {
          total,
          skip: skipNum,
          limit: limitNum,
          returned: transports.length,
          page: Math.floor(skipNum / limitNum) + 1,
          totalPages: Math.ceil(total / limitNum)
        },
        orders: transports.map(t => t._rawData || t)
      });
    }

    // 1. Vérifier cache (uniquement pour les requêtes sans pagination avancée)
    const canUseCache = parseInt(skip) === 0 && parseInt(limit) <= 50;
    if (canUseCache) {
      const cached = await cacheService.getFilteredOrders(req.query);
      if (cached) {
        console.log('[CACHE HIT] Filtered orders');
        return res.json({
          success: true,
          cached: true,
          ...cached
        });
      }
    }

    // 2. Construction du filtre MongoDB
    const query = { externalSource: 'dashdoc' };

    // Filtre par tag (par défaut "Symphonia")
    // Les tags sont des objets {pk, name, color}, donc on doit chercher dans tags.name
    if (tag && tag !== 'all') {
      query.tags = { $elemMatch: { name: tag } };
      console.log(`[FILTER] Filtering by tag: ${tag}`);
    }

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

    // Filtre: uniquement les commandes SANS moyen de transport assigné
    // (ni véhicule, ni chauffeur)
    if (noTransportMeans === 'true' || noTransportMeans === true) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { 'transportMeans.hasVehicle': { $ne: true } },
          { 'transportMeans.hasVehicle': { $exists: false } }
        ]
      });
      query.$and.push({
        $or: [
          { 'transportMeans.hasTrucker': { $ne: true } },
          { 'transportMeans.hasTrucker': { $exists: false } }
        ]
      });
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

    const response = {
      success: true,
      cached: false,
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
    };

    // 3. Store in cache (TTL 5min = 300s) if cacheable
    if (canUseCache) {
      await cacheService.setFilteredOrders(req.query, response, 300);
    }

    res.json(response);

  } catch (error) {
    console.error('Error filtering orders:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CARRIERS ROUTES ====================

/**
 * GET /api/v1/tms/carriers
 * Récupérer tous les transporteurs synchronisés
 * ⚠️ DATA LAKE: Supporte source=datalake pour lire depuis dashdoc_companies
 *
 * Query params:
 * - source: 'local' (default) | 'datalake' | 'all'
 * - connectionId: Filter by TMS connection (multi-tenant)
 */
app.get('/api/v1/tms/carriers', requireMongo, async (req, res) => {
  try {
    const { limit = 50, skip = 0, search, status, level, source = 'local', connectionId } = req.query;

    // ✅ NOUVEAU: Support Data Lake
    if (source === 'datalake' || source === 'all') {
      // Lecture depuis Data Lake (dashdoc_companies)
      const datalakeQuery = { isCarrier: true };

      if (connectionId) datalakeQuery.connectionId = connectionId;

      if (search) {
        datalakeQuery.$or = [
          { name: { $regex: search, $options: 'i' } },
          { 'siret': { $regex: search, $options: 'i' } },
          { '_rawData.siren': { $regex: search, $options: 'i' } }
        ];
      }

      const [datalakeCarriers, datalakeTotal] = await Promise.all([
        db.collection('dashdoc_companies')
          .find(datalakeQuery)
          .sort({ name: 1 })
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray(),
        db.collection('dashdoc_companies').countDocuments(datalakeQuery)
      ]);

      // Si source=all, fusionner avec local
      if (source === 'all') {
        const localQuery = { externalSource: 'dashdoc' };
        if (search) {
          localQuery.$or = [
            { companyName: { $regex: search, $options: 'i' } },
            { legalName: { $regex: search, $options: 'i' } },
            { siret: { $regex: search, $options: 'i' } }
          ];
        }
        if (status) localQuery.status = status;
        if (level) localQuery.vigilanceLevel = level;

        const [localCarriers, localTotal] = await Promise.all([
          db.collection('carriers')
            .find(localQuery)
            .sort({ companyName: 1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .toArray(),
          db.collection('carriers').countDocuments(localQuery)
        ]);

        return res.json({
          success: true,
          source: 'all',
          local: { total: localTotal, carriers: localCarriers },
          datalake: { total: datalakeTotal, carriers: datalakeCarriers }
        });
      }

      return res.json({
        success: true,
        source: 'datalake',
        total: datalakeTotal,
        limit: parseInt(limit),
        skip: parseInt(skip),
        carriers: datalakeCarriers
      });
    }

    // Source=local (comportement par défaut)
    const query = { externalSource: 'dashdoc' };

    // Recherche par nom ou SIRET
    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { legalName: { $regex: search, $options: 'i' } },
        { siret: { $regex: search, $options: 'i' } }
      ];
    }

    // Filtre par statut
    if (status) {
      query.status = status;
    }

    // Filtre par niveau de vigilance
    if (level) {
      query.vigilanceLevel = level;
    }

    const [carriers, total] = await Promise.all([
      db.collection('carriers')
        .find(query)
        .sort({ companyName: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('carriers').countDocuments(query)
    ]);

    res.json({
      success: true,
      source: 'local',
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      carriers
    });
  } catch (error) {
    console.error('[GET Carriers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/carriers/:id
 * Récupérer un transporteur par ID
 */
app.get('/api/v1/tms/carriers/:id', requireMongo, async (req, res) => {
  try {
    const carrier = await db.collection('carriers').findOne({
      _id: new ObjectId(req.params.id)
    });

    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    res.json({ success: true, carrier });
  } catch (error) {
    console.error('[GET Carrier] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/carriers/:id/vigilance
 * Calculer et récupérer le score de vigilance d'un carrier
 */
app.get('/api/v1/tms/carriers/:id/vigilance', requireMongo, async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({ error: 'Vigilance service not available' });
    }

    const vigilance = await vigilanceService.calculateVigilanceScore(req.params.id);
    res.json({ success: true, vigilance });
  } catch (error) {
    console.error('[GET Vigilance] Error:', error.message);
    if (error.message === 'Carrier not found') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/v1/tms/carriers/:id/vigilance/update
 * Mettre à jour le score de vigilance d'un carrier
 */
app.post('/api/v1/tms/carriers/:id/vigilance/update', requireMongo, async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({ error: 'Vigilance service not available' });
    }

    const result = await vigilanceService.updateCarrierVigilance(req.params.id);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ success: true, vigilance: result.vigilance });
  } catch (error) {
    console.error('[Update Vigilance] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/tms/carriers/vigilance/update-all
 * Recalculer les scores de vigilance de tous les carriers
 */
app.post('/api/v1/tms/carriers/vigilance/update-all', requireMongo, async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({ error: 'Vigilance service not available' });
    }

    const result = await vigilanceService.updateAllVigilanceScores();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Update All Vigilance] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/carriers/vigilance/stats
 * Statistiques globales de vigilance
 */
app.get('/api/v1/tms/carriers/vigilance/stats', requireMongo, async (req, res) => {
  try {
    if (!vigilanceService) {
      return res.status(503).json({ error: 'Vigilance service not available' });
    }

    const stats = await vigilanceService.getVigilanceStats();
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[Vigilance Stats] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Récupérer une commande spécifique par son ID
 * GET /api/v1/tms/orders/:id?tag=Symphonia
 */
app.get('/api/v1/tms/orders/:id', requireMongo, async (req, res) => {
  try {
    const { id } = req.params;
    const { tag = 'Symphonia' } = req.query;

    // Construction de la query de base
    const baseQuery = { externalSource: 'dashdoc' };

    // Filtre par tag (par défaut "Symphonia")
    if (tag && tag !== 'all') {
      baseQuery['externalData.tags'] = { $elemMatch: { name: tag } };
    }

    // Essayer de trouver par _id MongoDB
    let order = await db.collection('orders').findOne({
      _id: new ObjectId(id),
      ...baseQuery
    });

    // Si pas trouvé, essayer par externalId
    if (!order) {
      order = await db.collection('orders').findOne({
        externalId: id,
        ...baseQuery
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('[GET Order] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Recuperer les transports Dashdoc depuis le Data Lake MongoDB
 * ⚠️ ARCHITECTURE DATA LAKE: Lecture depuis MongoDB au lieu d'appels API directs
 * GET /api/v1/tms/dashdoc/transports?tag=Symphonia
 */
app.get('/api/v1/tms/dashdoc/transports', requireMongo, async (req, res) => {
  try {
    const { tag, status, limit = 50, connectionId } = req.query;

    // ✅ NOUVEAU: Lire depuis Data Lake MongoDB
    const query = {};

    // Filtre par tag
    if (tag) {
      query['_rawData.tags'] = { $elemMatch: { name: tag } };
    }

    // Filtre par status
    if (status) {
      query.status = { $in: status.split(',') };
    }

    // Filtre multi-tenant
    if (connectionId) {
      query.connectionId = connectionId;
    }

    const transportsCollection = db.collection('dashdoc_transports');
    const [transports, total] = await Promise.all([
      transportsCollection.find(query)
        .sort({ created: -1 })
        .limit(parseInt(limit))
        .toArray(),
      transportsCollection.countDocuments(query)
    ]);

    // Retourner les données brutes Dashdoc (_rawData) pour compatibilité
    const results = transports.map(t => t._rawData || t);

    res.json({
      success: true,
      total,
      source: 'datalake',
      transports: results
    });
  } catch (error) {
    console.error('Error fetching transports from Data Lake:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== TRUCKERS ROUTES (DATA LAKE) ====================

/**
 * GET /api/v1/tms/truckers
 * Récupérer tous les chauffeurs depuis le Data Lake
 * Query params: connectionId, limit, skip, search
 */
app.get('/api/v1/tms/truckers', requireMongo, async (req, res) => {
  try {
    const { connectionId, limit = 100, skip = 0, search, carrierId } = req.query;

    const query = {};
    if (connectionId) query.connectionId = connectionId;
    if (carrierId) query.carrierPk = parseInt(carrierId.replace('dashdoc-', '')) || parseInt(carrierId);

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [truckers, total] = await Promise.all([
      db.collection('dashdoc_truckers')
        .find(query)
        .sort({ lastName: 1, firstName: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('dashdoc_truckers').countDocuments(query)
    ]);

    res.json({
      success: true,
      source: 'datalake',
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      truckers
    });
  } catch (error) {
    console.error('[GET Truckers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/truckers/search
 * Recherche avancée de chauffeurs
 */
app.get('/api/v1/tms/truckers/search', requireMongo, async (req, res) => {
  try {
    const { q, connectionId, limit = 50 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const query = {
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phoneNumber: { $regex: q, $options: 'i' } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    const truckers = await db.collection('dashdoc_truckers')
      .find(query)
      .limit(parseInt(limit))
      .toArray();

    res.json({
      success: true,
      source: 'datalake',
      query: q,
      count: truckers.length,
      truckers
    });
  } catch (error) {
    console.error('[Search Truckers] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/truckers/stats
 * Statistiques des chauffeurs
 */
app.get('/api/v1/tms/truckers/stats', requireMongo, async (req, res) => {
  try {
    const { connectionId } = req.query;

    const matchStage = connectionId ? { connectionId } : {};

    const stats = await db.collection('dashdoc_truckers').aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          withAdr: { $sum: { $cond: [{ $ne: ['$adrLicense', null] }, 1, 0] } },
          withExpiredDocs: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $lt: ['$drivingLicenseDeadline', new Date()] },
                    { $lt: ['$adrLicenseDeadline', new Date()] },
                    { $lt: ['$driverCardDeadline', new Date()] }
                  ]
                },
                1, 0
              ]
            }
          }
        }
      }
    ]).toArray();

    res.json({
      success: true,
      source: 'datalake',
      stats: stats[0] || { total: 0, active: 0, withAdr: 0, withExpiredDocs: 0 }
    });
  } catch (error) {
    console.error('[Truckers Stats] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/truckers/expiring-docs
 * Chauffeurs avec documents expirant bientôt
 */
app.get('/api/v1/tms/truckers/expiring-docs', requireMongo, async (req, res) => {
  try {
    const { connectionId, daysAhead = 30, limit = 100 } = req.query;

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + parseInt(daysAhead));

    const query = {
      $or: [
        { drivingLicenseDeadline: { $lte: futureDate, $gte: new Date() } },
        { adrLicenseDeadline: { $lte: futureDate, $gte: new Date() } },
        { driverCardDeadline: { $lte: futureDate, $gte: new Date() } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    const truckers = await db.collection('dashdoc_truckers')
      .find(query)
      .limit(parseInt(limit))
      .toArray();

    res.json({
      success: true,
      source: 'datalake',
      daysAhead: parseInt(daysAhead),
      count: truckers.length,
      truckers
    });
  } catch (error) {
    console.error('[Expiring Docs] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/truckers/:id
 * Récupérer un chauffeur par ID (dashdocPk)
 */
app.get('/api/v1/tms/truckers/:id', requireMongo, async (req, res) => {
  try {
    const { id } = req.params;
    const { connectionId } = req.query;

    const query = { dashdocPk: parseInt(id) };
    if (connectionId) query.connectionId = connectionId;

    const trucker = await db.collection('dashdoc_truckers').findOne(query);

    if (!trucker) {
      return res.status(404).json({ error: 'Trucker not found' });
    }

    res.json({
      success: true,
      source: 'datalake',
      trucker
    });
  } catch (error) {
    console.error('[GET Trucker] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONTACTS ROUTES (DATA LAKE) ====================

/**
 * GET /api/v1/tms/contacts
 * Récupérer tous les contacts depuis le Data Lake
 * Query params: connectionId, limit, skip, search, role
 */
app.get('/api/v1/tms/contacts', requireMongo, async (req, res) => {
  try {
    const { connectionId, limit = 100, skip = 0, search, role, companyPk } = req.query;

    const query = {};
    if (connectionId) query.connectionId = connectionId;
    if (role) query.role = role;
    if (companyPk) query.companyPk = parseInt(companyPk);

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [contacts, total] = await Promise.all([
      db.collection('dashdoc_contacts')
        .find(query)
        .sort({ lastName: 1, firstName: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('dashdoc_contacts').countDocuments(query)
    ]);

    res.json({
      success: true,
      source: 'datalake',
      total,
      limit: parseInt(limit),
      skip: parseInt(skip),
      contacts
    });
  } catch (error) {
    console.error('[GET Contacts] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/contacts/search
 * Recherche avancée de contacts
 */
app.get('/api/v1/tms/contacts/search', requireMongo, async (req, res) => {
  try {
    const { q, connectionId, limit = 50 } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const query = {
      $or: [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phoneNumber: { $regex: q, $options: 'i' } }
      ]
    };
    if (connectionId) query.connectionId = connectionId;

    const contacts = await db.collection('dashdoc_contacts')
      .find(query)
      .limit(parseInt(limit))
      .toArray();

    res.json({
      success: true,
      source: 'datalake',
      query: q,
      count: contacts.length,
      contacts
    });
  } catch (error) {
    console.error('[Search Contacts] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/contacts/stats
 * Statistiques des contacts
 */
app.get('/api/v1/tms/contacts/stats', requireMongo, async (req, res) => {
  try {
    const { connectionId } = req.query;

    const matchStage = connectionId ? { connectionId } : {};

    const stats = await db.collection('dashdoc_contacts').aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withEmail: {
            $sum: { $cond: [{ $and: [{ $ne: ['$email', null] }, { $ne: ['$email', ''] }] }, 1, 0] }
          },
          withPhone: {
            $sum: { $cond: [{ $and: [{ $ne: ['$phoneNumber', null] }, { $ne: ['$phoneNumber', ''] }] }, 1, 0] }
          },
          managers: {
            $sum: { $cond: [{ $eq: ['$role', 'manager'] }, 1, 0] }
          }
        }
      }
    ]).toArray();

    res.json({
      success: true,
      source: 'datalake',
      stats: stats[0] || { total: 0, withEmail: 0, withPhone: 0, managers: 0 }
    });
  } catch (error) {
    console.error('[Contacts Stats] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/contacts/by-company/:companyPk
 * Récupérer les contacts d'une entreprise
 */
app.get('/api/v1/tms/contacts/by-company/:companyPk', requireMongo, async (req, res) => {
  try {
    const { companyPk } = req.params;
    const { connectionId, limit = 100 } = req.query;

    const query = { companyPk: parseInt(companyPk) };
    if (connectionId) query.connectionId = connectionId;

    const contacts = await db.collection('dashdoc_contacts')
      .find(query)
      .limit(parseInt(limit))
      .toArray();

    res.json({
      success: true,
      source: 'datalake',
      companyPk: parseInt(companyPk),
      count: contacts.length,
      contacts
    });
  } catch (error) {
    console.error('[Contacts by Company] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/tms/contacts/:id
 * Récupérer un contact par ID (dashdocPk)
 */
app.get('/api/v1/tms/contacts/:id', requireMongo, async (req, res) => {
  try {
    const { id } = req.params;
    const { connectionId } = req.query;

    const query = { dashdocPk: parseInt(id) };
    if (connectionId) query.connectionId = connectionId;

    const contact = await db.collection('dashdoc_contacts').findOne(query);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({
      success: true,
      source: 'datalake',
      contact
    });
  } catch (error) {
    console.error('[GET Contact] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================== AFFRET.IA INTEGRATION ====================

/**
 * Envoyer une commande vers Affret.IA
 * POST /api/v1/tms/orders/:id/send-to-affretia
 */
app.post('/api/v1/tms/orders/:id/send-to-affretia', requireMongo, async (req, res) => {
  try {
    const { id } = req.params;
    const axios = require('axios');

    // Récupérer la commande
    let order = await db.collection('orders').findOne({
      _id: new ObjectId(id),
      externalSource: 'dashdoc'
    });

    if (!order) {
      order = await db.collection('orders').findOne({
        externalId: id,
        externalSource: 'dashdoc'
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Déclencher une session Affret.IA (via CloudFront pour sécurité)
    const affretiaUrl = process.env.AFFRETIA_API_URL || 'https://d393yiia4ig3bw.cloudfront.net';

    // Préparer le payload pour déclencher la session Affret.IA
    const triggerPayload = {
      orderId: order._id.toString(),
      organizationId: order.organizationId || order.customerId || 'default-org',
      triggerType: 'manual',
      reason: 'Envoi manuel depuis TMS Sync - Dashdoc',
      userId: 'tms-sync-service'
    };

    // Déclencher la session Affret.IA (endpoint correct)
    const response = await axios.post(`${affretiaUrl}/api/v1/affretia/trigger`, triggerPayload, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Récupérer le sessionId de la réponse
    const sessionId = response.data?.data?.sessionId || response.data?.sessionId;
    const sessionStatus = response.data?.data?.status || response.data?.status || 'analyzing';

    // Mettre à jour la commande pour indiquer qu'elle a été envoyée à Affret.IA
    await db.collection('orders').updateOne(
      { _id: order._id },
      {
        $set: {
          sentToAffretia: true,
          sentToAffretiaAt: new Date(),
          affretiaSessionId: sessionId,
          affretiaStatus: sessionStatus
        }
      }
    );

    res.json({
      success: true,
      message: 'Session Affret.IA démarrée avec succès',
      data: {
        sessionId: sessionId,
        status: sessionStatus,
        orderId: order._id.toString()
      }
    });

  } catch (error) {
    console.error('[Send to Affret.IA] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
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
 * Synchroniser un transport specifique par sequential_id ou UID
 */
app.post('/api/v1/tms/sync-transport/:identifier', requireMongo, async (req, res) => {
  try {
    const { identifier } = req.params;

    // Recuperer la connexion Dashdoc active
    const connection = await db.collection('tmsConnections').findOne({
      tmsType: 'dashdoc',
      isActive: true
    });

    if (!connection) {
      return res.status(404).json({ error: 'No active Dashdoc connection found' });
    }

    // Creer client axios pour appeler directement l'API Dashdoc
    const axios = require('axios');
    const client = axios.create({
      baseURL: connection.credentials.apiUrl || 'https://www.dashdoc.eu/api/v4',
      timeout: 30000,
      headers: {
        'Authorization': `Token ${connection.credentials.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    let transport = null;

    // Determiner si c'est un UID ou un sequential_id
    if (identifier.includes('-')) {
      // C'est un UID - appeler directement /transports/{uid}/
      console.log(`[SYNC SPECIFIC] Fetching transport by UID: ${identifier}`);
      try {
        const response = await client.get(`/transports/${identifier}/`);
        transport = response.data;
      } catch (error) {
        if (error.response?.status === 404) {
          return res.status(404).json({
            success: false,
            error: `Transport with UID ${identifier} not found in Dashdoc`
          });
        }
        throw error;
      }
    } else {
      // C'est un sequential_id - chercher via query
      console.log(`[SYNC SPECIFIC] Searching transport by sequential_id: ${identifier}`);
      const response = await client.get(`/transports/?sequential_id=${identifier}&limit=1`);

      if (!response.data.results || response.data.results.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Transport ${identifier} not found in Dashdoc`
        });
      }

      transport = response.data.results[0];
    }

    console.log(`[SYNC SPECIFIC] Found transport ${transport.sequential_id}`);
    console.log(`[SYNC SPECIFIC] Tags:`, transport.tags);

    // Mapper le transport avec le connector
    const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl
    });
    const mappedOrder = dashdoc.mapTransport(transport);

    // Sauvegarder dans MongoDB
    await db.collection('orders').updateOne(
      { externalId: mappedOrder.externalId },
      { $set: mappedOrder },
      { upsert: true }
    );

    console.log(`[SYNC SPECIFIC] Transport ${identifier} synchronized successfully`);

    res.json({
      success: true,
      message: `Transport ${identifier} synchronized`,
      transport: mappedOrder
    });

  } catch (error) {
    console.error('[SYNC SPECIFIC] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
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

/**
 * Debug: Cleanup obsolete carriers (not synced in last 10 minutes)
 * POST /api/v1/debug/cleanup-obsolete-carriers
 */
app.post('/api/v1/debug/cleanup-obsolete-carriers', requireMongo, async (req, res) => {
  try {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Trouver les carriers obsolètes
    const obsoleteCarriers = await db.collection('carriers').find({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: tenMinutesAgo }
    }).toArray();

    // Supprimer
    const deleteResult = await db.collection('carriers').deleteMany({
      externalSource: 'dashdoc',
      lastSyncAt: { $lt: tenMinutesAgo }
    });

    res.json({
      success: true,
      deleted: deleteResult.deletedCount,
      carriers: obsoleteCarriers.map(c => ({
        companyName: c.companyName,
        remoteId: c.remoteId,
        externalId: c.externalId,
        lastSyncAt: c.lastSyncAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug: Verifier les coordonnees GPS d'une commande specifique
 * GET /api/v1/tms/orders/:orderId/coordinates
 */
app.get('/api/v1/tms/orders/:orderId/coordinates', requireMongo, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Construire la requête - chercher par externalId ou _id (si ObjectId valide)
    let query;
    if (/^[0-9a-fA-F]{24}$/.test(orderId)) {
      // Si c'est un ObjectId valide, chercher par externalId OU _id
      query = {
        $or: [
          { externalId: orderId },
          { _id: new ObjectId(orderId) }
        ]
      };
    } else {
      // Sinon, chercher uniquement par externalId
      query = { externalId: orderId };
    }

    const order = await db.collection('orders').findOne(query);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Extraire et formatter les coordonnées
    const pickupCoords = order.pickup?.address?.location;
    const deliveryCoords = order.delivery?.address?.location;

    res.json({
      success: true,
      orderId: order.externalId,
      sequentialId: order.sequentialId,
      status: order.status,
      coordinates: {
        pickup: {
          city: order.pickup?.address?.city,
          postalCode: order.pickup?.address?.postalCode,
          location: pickupCoords,
          hasCoordinates: !!(pickupCoords?.coordinates),
          latitude: pickupCoords?.coordinates?.[1],
          longitude: pickupCoords?.coordinates?.[0]
        },
        delivery: {
          city: order.delivery?.address?.city,
          postalCode: order.delivery?.address?.postalCode,
          location: deliveryCoords,
          hasCoordinates: !!(deliveryCoords?.coordinates),
          latitude: deliveryCoords?.coordinates?.[1],
          longitude: deliveryCoords?.coordinates?.[0]
        }
      },
      tags: order.tags?.map(t => t.name) || [],
      carrier: {
        name: order.carrier?.name,
        assigned: !!order.carrier
      }
    });

  } catch (error) {
    console.error('[COORDINATES DEBUG] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/v1/cache/stats
// Redis cache statistics
// ===========================================
app.get('/api/v1/cache/stats', async (req, res) => {
  try {
    const stats = await cacheService.getStats();
    const health = await cacheService.healthCheck();

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      health,
      cache: stats
    });
  } catch (error) {
    console.error('[CACHE STATS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// POST /api/v1/cache/invalidate
// Invalidate cache (manual or webhook)
// ===========================================
app.post('/api/v1/cache/invalidate', async (req, res) => {
  try {
    const { pattern } = req.body;

    if (!pattern) {
      return res.status(400).json({
        success: false,
        error: 'Pattern required (e.g., "tms:orders:*")'
      });
    }

    const deletedCount = await cacheService.invalidate(pattern);

    res.json({
      success: true,
      message: `Cache invalidated for pattern: ${pattern}`,
      deletedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[CACHE INVALIDATE] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// GET /api/v1/monitoring/status
// Monitoring status and recent logs
// ===========================================
app.get('/api/v1/monitoring/status', requireMongo, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    // Get jobs status from scheduled jobs
    const jobsStatus = scheduledJobs.getJobsStatus();

    // Get recent monitoring logs
    const recentLogs = await db.collection('monitoring_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    // Get active anomalies (from last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeAnomalies = await db.collection('monitoring_logs')
      .aggregate([
        { $match: { timestamp: { $gte: thirtyMinutesAgo } } },
        { $unwind: '$anomalies' },
        { $group: {
          _id: '$anomalies.type',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' },
          severity: { $first: '$anomalies.severity' }
        }},
        { $sort: { lastOccurrence: -1 } }
      ])
      .toArray();

    // Calculate metrics
    const totalAnomalies = recentLogs.reduce((sum, log) => sum + (log.anomalies?.length || 0), 0);
    const criticalAnomalies = recentLogs.reduce((sum, log) =>
      sum + (log.anomalies?.filter(a => a.severity === 'critical').length || 0), 0);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      jobsStatus,
      recentLogs,
      activeAnomalies,
      metrics: {
        totalAnomalies,
        criticalAnomalies,
        logsCount: recentLogs.length
      }
    });

  } catch (error) {
    console.error('[MONITORING STATUS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Routes Affret.IA synchronization
app.use('/api/v1/tms/affretia-sync', authenticateToken, affretIASyncRoutes);

// ==================== PUBLIC DATA LAKE ROUTES (No Auth) ====================
// Routes publiques pour le portail transporteur
const datalakeRoutes = require('./routes/datalake.routes');

// Public read-only endpoints for transporter portal
app.get('/api/v1/datalake/status', (req, res, next) => {
  req.readers = null; // Will use getDatalakeStatus from scheduled-jobs
  datalakeRoutes.handle(req, res, next);
});

// Public transports endpoint (read-only)
app.get('/api/v1/datalake/transports', requireMongo, async (req, res) => {
  try {
    const { status, carrierId, tag, limit = 50, skip = 0 } = req.query;

    const query = {};
    if (status) query.status = { $in: status.split(',') };
    if (carrierId) query['carrier.externalId'] = carrierId;
    if (tag) query['tags.name'] = tag;

    const [results, total] = await Promise.all([
      db.collection('dashdoc_transports')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('dashdoc_transports').countDocuments(query)
    ]);

    res.json({
      success: true,
      data: results,
      pagination: {
        total,
        page: Math.floor(parseInt(skip) / parseInt(limit)) + 1,
        totalPages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PUBLIC ORDERS ROUTES (No Auth) ====================
// Routes publiques pour le portail transporteur - compatibilité legacy

// GET /api/orders - Route legacy sans /v1 (utilisée par le frontend transporteur)
app.get('/api/orders', requireMongo, async (req, res) => {
  try {
    const { carrierId, carrier, limit = 50, skip = 0, status } = req.query;
    const carrierIdParam = carrierId || carrier;

    const query = {};
    if (carrierIdParam) {
      // Support both formats: "6980504" or "dashdoc-6980504"
      const cleanId = String(carrierIdParam).replace('dashdoc-', '');
      query['carrier.externalId'] = cleanId;
    }
    if (status) query.status = { $in: status.split(',') };

    const [results, total] = await Promise.all([
      db.collection('dashdoc_transports')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('dashdoc_transports').countDocuments(query)
    ]);

    res.json({
      success: true,
      total,
      orders: results,
      source: 'datalake'
    });
  } catch (error) {
    console.error('[ORDERS] Error:', error.message);
    res.json({
      success: true,
      total: 0,
      orders: [],
      message: 'Service temporairement indisponible'
    });
  }
});

// Public carriers endpoint (read-only)
app.get('/api/v1/datalake/carriers', requireMongo, async (req, res) => {
  try {
    const { search, limit = 500, skip = 0 } = req.query;

    const query = { isCarrier: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { siret: { $regex: search, $options: 'i' } }
      ];
    }

    const [results, total] = await Promise.all([
      db.collection('dashdoc_companies')
        .find(query)
        .sort({ name: 1 })
        .skip(parseInt(skip))
        .limit(parseInt(limit))
        .toArray(),
      db.collection('dashdoc_companies').countDocuments(query)
    ]);

    res.json({
      success: true,
      data: results,
      pagination: {
        total,
        page: Math.floor(parseInt(skip) / parseInt(limit)) + 1,
        totalPages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== AUTHENTICATED DATA LAKE ROUTES ====================
// Routes avec authentification pour opérations sensibles
app.use('/api/v1/datalake', authenticateToken, datalakeRoutes);

// Routes Tracking IA (événements temps réel)
const trackingIARoutes = require('./routes/tracking-ia.routes');
app.use('/api/v1/tracking-ia', authenticateToken, trackingIARoutes);

// Routes Vigilance (scores et surveillance transporteurs)
const vigilanceRoutes = require('./routes/vigilance.routes');
app.use('/api/v1/vigilance', authenticateToken, vigilanceRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

// Start server
async function startServer() {
  // Start server FIRST, then try MongoDB
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RT TMS Sync API v2.3.0 listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`MongoDB: Connecting...`);
  });

  // Try MongoDB connection (non-blocking)
  try {
    await connectMongoDB();
    console.log(`MongoDB: ${mongoConnected ? 'Connected' : 'Not connected'}`);

    // Demarrer les jobs scheduled si MongoDB connecte
    if (mongoConnected && tmsService) {
      console.log('Starting scheduled jobs...');
      scheduledJobs.startAllJobs(db, tmsService);
    } else {
      console.warn('⚠️  Scheduled jobs NOT started - MongoDB not connected');
    }
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    console.warn('⚠️  Server running without MongoDB');
  }
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
