/**
 * Vehicles Data Lake Routes
 *
 * API REST pour la gestion des véhicules:
 * - /api/v1/vehicles - CRUD véhicules
 * - /api/v1/vehicles/:id/documents - Documents (carte grise, assurance)
 * - /api/v1/vehicles/:id/maintenances - Entretiens
 * - /api/v1/vehicles/:id/breakdowns - Pannes
 * - /api/v1/vehicles/invoices - Factures fournisseurs avec OCR
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getVehicleDatalakeSyncService,
  getDocumentService,
  getMaintenanceService,
  getModuleStatus,
  getActiveVechizenConnections,
} = require('../services/vehicles-datalake');

const {
  Vehicle,
  VehicleDocument,
  VehicleMaintenance,
  VehicleBreakdown,
  VehicleInvoice,
  VehicleMileage,
  VehicleInspection,
} = require('../models/vehicles-datalake');

// Configuration multer pour upload fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non supporté. Utilisez PDF, JPEG, PNG ou TIFF.'));
    }
  },
});

// Middleware pour extraire organizationId
const extractOrgId = (req, res, next) => {
  req.organizationId = req.headers['x-organization-id'] || req.query.organizationId || 'default';
  next();
};

router.use(extractOrgId);

// ==========================================
// STATUT DU MODULE
// ==========================================

/**
 * GET /api/v1/vehicles/status
 * Statut global du module véhicules
 */
router.get('/status', async (req, res) => {
  try {
    const status = getModuleStatus();
    const stats = await require('../models/vehicles-datalake').getCollectionStats(req.organizationId);

    res.json({
      success: true,
      module: 'vehicles-datalake',
      ...status,
      collections: stats,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/debug/sources
 * Liste les sources de données disponibles (carrierIds dans vehizen datalake)
 */
router.get('/debug/sources', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const results = {
      vehizenDatalake: { carrierIds: [], count: 0, database: 'rt-orders', connectionStatus: 'unknown' },
      vehicles: { organizationIds: [], count: 0 },
      config: {
        ordersMongoUriConfigured: !!process.env.ORDERS_MONGODB_URI,
      },
    };

    // Check vehizenvehicles collection in rt-orders database (via secondary connection)
    try {
      const ORDERS_MONGODB_URI = process.env.ORDERS_MONGODB_URI;
      if (ORDERS_MONGODB_URI) {
        // Create temporary connection to check
        const ordersConn = mongoose.createConnection(ORDERS_MONGODB_URI);
        await new Promise((resolve, reject) => {
          ordersConn.once('connected', resolve);
          ordersConn.once('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });

        const VechizenModel = ordersConn.model('VechizenVehicle', new mongoose.Schema({}, { collection: 'vehizenvehicles', strict: false }));
        const carrierIds = await VechizenModel.distinct('carrierId');
        const vechizenCount = await VechizenModel.countDocuments();

        results.vehizenDatalake = {
          carrierIds,
          count: vechizenCount,
          database: 'rt-orders',
          connectionStatus: 'connected',
        };

        await ordersConn.close();
      } else {
        results.vehizenDatalake.connectionStatus = 'not_configured';
        results.vehizenDatalake.error = 'ORDERS_MONGODB_URI not configured';
      }
    } catch (e) {
      results.vehizenDatalake.connectionStatus = 'error';
      results.vehizenDatalake.error = e.message;
    }

    // Check vehicles collection (unified data lake in main connection)
    try {
      const organizationIds = await Vehicle.distinct('organizationId');
      const vehicleCount = await Vehicle.countDocuments();
      results.vehicles = { organizationIds, count: vehicleCount };
    } catch (e) {
      results.vehicles.error = e.message;
    }

    res.json({ success: true, sources: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/debug/tms-connections
 * Liste les connexions Vehizen actives depuis TMSConnection (base rt-tms-sync)
 */
router.get('/debug/tms-connections', async (req, res) => {
  try {
    const connections = await getActiveVechizenConnections();
    res.json({
      success: true,
      count: connections.length,
      source: 'TMSConnection (rt-tms-sync)',
      description: 'Seuls les transporteurs listés ici seront synchronisés',
      connections: connections.map(c => ({
        carrierId: c.carrierId,
        organizationName: c.organizationName,
        hasCredentials: !!(c.credentials?.username && c.credentials?.password),
        syncConfig: c.syncConfig,
        lastSyncAt: c.lastSyncAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/sync
 * Force une synchronisation manuelle
 */
router.post('/sync', async (req, res) => {
  try {
    const { type = 'periodic' } = req.body;
    const syncService = getVehicleDatalakeSyncService();

    await syncService.forceSync(type, req.organizationId);

    res.json({
      success: true,
      message: `Sync ${type} lancée`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ROUTES GLOBALES (AVANT /:id pour éviter conflits)
// ==========================================

/**
 * GET /api/v1/vehicles/stats
 * Statistiques globales de la flotte
 */
router.get('/stats', async (req, res) => {
  try {
    const match = { organizationId: req.organizationId };

    const [
      totalVehicles,
      activeVehicles,
      inMaintenance,
      pendingMaintenances,
      activeBreakdowns,
      pendingInvoices,
    ] = await Promise.all([
      Vehicle.countDocuments(match),
      Vehicle.countDocuments({ ...match, status: 'active' }),
      Vehicle.countDocuments({ ...match, status: 'maintenance' }),
      VehicleMaintenance.countDocuments({ ...match, status: { $in: ['scheduled', 'in_progress'] } }),
      VehicleBreakdown.countDocuments({ ...match, status: { $ne: 'resolved' } }),
      VehicleInvoice.countDocuments({ ...match, status: 'pending' }),
    ]);

    res.json({
      success: true,
      stats: {
        totalVehicles,
        activeVehicles,
        inMaintenance,
        pendingMaintenances,
        activeBreakdowns,
        pendingInvoices,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/maintenances
 * Liste tous les entretiens
 */
router.get('/maintenances', async (req, res) => {
  try {
    const { status, type, vehicleId, page = 1, limit = 50 } = req.query;
    const query = { organizationId: req.organizationId };

    if (status) query.status = status;
    if (type) query.type = type;
    if (vehicleId) query.vehicleId = vehicleId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [maintenances, total] = await Promise.all([
      VehicleMaintenance.find(query)
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('vehicleId', 'licensePlate brand model'),
      VehicleMaintenance.countDocuments(query),
    ]);

    res.json({
      success: true,
      maintenances,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/maintenances
 * Créer un entretien
 */
router.post('/maintenances', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenance = await maintenanceService.scheduleMaintenance({
      ...req.body,
      organizationId: req.organizationId,
    });

    res.status(201).json({ success: true, maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/breakdowns
 * Liste toutes les pannes
 */
router.get('/breakdowns', async (req, res) => {
  try {
    const { status, severity, vehicleId, page = 1, limit = 50 } = req.query;
    const query = { organizationId: req.organizationId };

    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (vehicleId) query.vehicleId = vehicleId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [breakdowns, total] = await Promise.all([
      VehicleBreakdown.find(query)
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('vehicleId', 'licensePlate brand model'),
      VehicleBreakdown.countDocuments(query),
    ]);

    res.json({
      success: true,
      breakdowns,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/breakdowns
 * Déclarer une panne
 */
router.post('/breakdowns', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdown = await maintenanceService.reportBreakdown({
      ...req.body,
      organizationId: req.organizationId,
    });

    res.status(201).json({ success: true, breakdown });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/invoices
 * Liste toutes les factures fournisseurs
 */
router.get('/invoices', async (req, res) => {
  try {
    const { vehicleId, status, from, to, page = 1, limit = 50 } = req.query;

    const query = { organizationId: req.organizationId };
    if (vehicleId) query.vehicleId = vehicleId;
    if (status) query.status = status;
    if (from || to) {
      query.uploadedAt = {};
      if (from) query.uploadedAt.$gte = new Date(from);
      if (to) query.uploadedAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      VehicleInvoice.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(parseInt(limit)),
      VehicleInvoice.countDocuments(query),
    ]);

    res.json({
      success: true,
      invoices,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// VÉHICULES - CRUD
// ==========================================

/**
 * GET /api/v1/vehicles
 * Liste des véhicules
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      type,
      search,
      page = 1,
      limit = 50,
      sortBy = 'licensePlate',
      sortOrder = 'asc',
    } = req.query;

    const query = { organizationId: req.organizationId };

    if (status) query.status = status;
    if (type) query.vehicleType = type;
    if (search) {
      query.$or = [
        { licensePlate: new RegExp(search, 'i') },
        { brand: new RegExp(search, 'i') },
        { model: new RegExp(search, 'i') },
        { vin: new RegExp(search, 'i') },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [vehicles, total] = await Promise.all([
      Vehicle.find(query).sort(sort).skip(skip).limit(parseInt(limit)),
      Vehicle.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: vehicles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/:id
 * Détail d'un véhicule
 */
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    res.json({ success: true, data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles
 * Créer un véhicule manuellement
 */
router.post('/', async (req, res) => {
  try {
    const vehicleData = {
      ...req.body,
      organizationId: req.organizationId,
      dataSources: ['manual'],
    };

    // Normaliser l'immatriculation
    if (vehicleData.licensePlate) {
      vehicleData.licensePlate = vehicleData.licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    }

    const vehicle = new Vehicle(vehicleData);
    await vehicle.save();

    res.status(201).json({ success: true, data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/v1/vehicles/:id
 * Mettre à jour un véhicule
 */
router.put('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.organizationId },
      { $set: req.body },
      { new: true }
    );

    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    res.json({ success: true, data: vehicle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/vehicles/:id
 * Supprimer un véhicule
 */
router.delete('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    res.json({ success: true, message: 'Véhicule supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// KILOMÉTRAGE
// ==========================================

/**
 * GET /api/v1/vehicles/:id/mileage
 * Historique kilométrage
 */
router.get('/:id/mileage', async (req, res) => {
  try {
    const { from, to, limit = 100 } = req.query;

    const query = { vehicleId: req.params.id };
    if (from || to) {
      query.recordedAt = {};
      if (from) query.recordedAt.$gte = new Date(from);
      if (to) query.recordedAt.$lte = new Date(to);
    }

    const records = await VehicleMileage.find(query)
      .sort({ recordedAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/:id/mileage
 * Ajouter un relevé kilométrique manuel
 */
router.post('/:id/mileage', async (req, res) => {
  try {
    const { mileage, recordedAt, notes } = req.body;

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    const record = new VehicleMileage({
      vehicleId: vehicle._id,
      licensePlate: vehicle.licensePlate,
      mileage,
      previousMileage: vehicle.currentMileage,
      source: 'manual',
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      organizationId: req.organizationId,
      recordedBy: req.body.recordedBy,
      notes,
    });

    await record.save();

    // Mettre à jour le véhicule
    await Vehicle.findByIdAndUpdate(vehicle._id, {
      $set: {
        currentMileage: mileage,
        mileageUpdatedAt: new Date(),
        mileageSource: 'manual',
      },
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// DOCUMENTS
// ==========================================

/**
 * GET /api/v1/vehicles/:id/documents
 * Liste des documents d'un véhicule
 */
router.get('/:id/documents', async (req, res) => {
  try {
    const { type, includeExpired = 'true' } = req.query;

    const query = { vehicleId: req.params.id };
    if (type) query.documentType = type;
    if (includeExpired === 'false') {
      query.expiryDate = { $gte: new Date() };
    }

    const documents = await VehicleDocument.find(query).sort({ uploadedAt: -1 });

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/:id/documents
 * Upload un document véhicule
 */
router.post('/:id/documents', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Fichier requis' });
    }

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    const documentService = getDocumentService();
    const result = await documentService.uploadDocument(req.file, {
      vehicleId: vehicle._id,
      licensePlate: vehicle.licensePlate,
      documentType: req.body.documentType,
      organizationId: req.organizationId,
      uploadedBy: req.body.uploadedBy,
      issueDate: req.body.issueDate ? new Date(req.body.issueDate) : null,
      expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : null,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/documents/expiring
 * Documents expirant bientôt
 */
router.get('/documents/expiring', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const documentService = getDocumentService();
    const documents = await documentService.getExpiringDocuments(req.organizationId, parseInt(days));

    res.json({ success: true, data: documents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/documents/:docId/download
 * Télécharger un document
 */
router.get('/documents/:docId/download', async (req, res) => {
  try {
    const documentService = getDocumentService();
    const url = await documentService.getDownloadUrl(req.params.docId);

    res.json({ success: true, downloadUrl: url });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/documents/:docId/validate
 * Valider un document
 */
router.post('/documents/:docId/validate', async (req, res) => {
  try {
    const documentService = getDocumentService();
    const document = await documentService.validateDocument(
      req.params.docId,
      req.body.validatedBy,
      req.body.notes
    );

    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/v1/vehicles/documents/:docId
 * Supprimer un document
 */
router.delete('/documents/:docId', async (req, res) => {
  try {
    const documentService = getDocumentService();
    await documentService.deleteDocument(req.params.docId);

    res.json({ success: true, message: 'Document supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// ENTRETIENS
// ==========================================

/**
 * GET /api/v1/vehicles/:id/maintenances
 * Liste des entretiens d'un véhicule
 */
router.get('/:id/maintenances', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenances = await maintenanceService.getVehicleMaintenances(req.params.id, req.query);

    res.json({ success: true, data: maintenances });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/:id/maintenances
 * Créer un entretien
 */
router.post('/:id/maintenances', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenance = await maintenanceService.createMaintenance({
      vehicleId: req.params.id,
      ...req.body,
      organizationId: req.organizationId,
    });

    res.status(201).json({ success: true, data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/maintenances/upcoming
 * Entretiens à venir
 */
router.get('/maintenances/upcoming', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const maintenanceService = getMaintenanceService();
    const maintenances = await maintenanceService.getUpcomingMaintenances(req.organizationId, parseInt(days));

    res.json({ success: true, data: maintenances });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/maintenances/overdue
 * Entretiens en retard
 */
router.get('/maintenances/overdue', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenances = await maintenanceService.getOverdueMaintenances(req.organizationId);

    res.json({ success: true, data: maintenances });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/maintenances/:maintenanceId/start
 * Démarrer un entretien
 */
router.post('/maintenances/:maintenanceId/start', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenance = await maintenanceService.startMaintenance(req.params.maintenanceId, req.body);

    res.json({ success: true, data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/maintenances/:maintenanceId/complete
 * Terminer un entretien
 */
router.post('/maintenances/:maintenanceId/complete', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const maintenance = await maintenanceService.completeMaintenance(req.params.maintenanceId, req.body);

    res.json({ success: true, data: maintenance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// PANNES
// ==========================================

/**
 * GET /api/v1/vehicles/:id/breakdowns
 * Liste des pannes d'un véhicule
 */
router.get('/:id/breakdowns', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdowns = await maintenanceService.getVehicleBreakdowns(req.params.id, req.query);

    res.json({ success: true, data: breakdowns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/:id/breakdowns
 * Déclarer une panne
 */
router.post('/:id/breakdowns', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdown = await maintenanceService.reportBreakdown({
      vehicleId: req.params.id,
      ...req.body,
      organizationId: req.organizationId,
    });

    res.status(201).json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/breakdowns/active
 * Pannes actives
 */
router.get('/breakdowns/active', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdowns = await maintenanceService.getActiveBreakdowns(req.organizationId);

    res.json({ success: true, data: breakdowns });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/breakdowns/:breakdownId/repair/start
 * Démarrer réparation
 */
router.post('/breakdowns/:breakdownId/repair/start', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdown = await maintenanceService.startBreakdownRepair(req.params.breakdownId, req.body);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/breakdowns/:breakdownId/repair/complete
 * Terminer réparation
 */
router.post('/breakdowns/:breakdownId/repair/complete', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const breakdown = await maintenanceService.completeBreakdownRepair(req.params.breakdownId, req.body);

    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// FACTURES FOURNISSEURS
// ==========================================

/**
 * POST /api/v1/vehicles/invoices/upload
 * Upload une facture fournisseur avec OCR
 */
router.post('/invoices/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Fichier requis' });
    }

    const maintenanceService = getMaintenanceService();
    const result = await maintenanceService.uploadSupplierInvoice(req.file, {
      vehicleId: req.body.vehicleId,
      maintenanceId: req.body.maintenanceId,
      breakdownId: req.body.breakdownId,
      organizationId: req.organizationId,
      uploadedBy: req.body.uploadedBy,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/invoices
 * Liste des factures
 */
router.get('/invoices', async (req, res) => {
  try {
    const { vehicleId, status, from, to, page = 1, limit = 50 } = req.query;

    const query = { organizationId: req.organizationId };
    if (vehicleId) query.vehicleId = vehicleId;
    if (status) query.status = status;
    if (from || to) {
      query.uploadedAt = {};
      if (from) query.uploadedAt.$gte = new Date(from);
      if (to) query.uploadedAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [invoices, total] = await Promise.all([
      VehicleInvoice.find(query).sort({ uploadedAt: -1 }).skip(skip).limit(parseInt(limit)),
      VehicleInvoice.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: invoices,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/invoices/pending
 * Factures en attente de validation
 */
router.get('/invoices/pending', async (req, res) => {
  try {
    const invoices = await VehicleInvoice.find({
      organizationId: req.organizationId,
      ocrProcessed: true,
      isValidated: false,
    }).sort({ uploadedAt: -1 });

    res.json({ success: true, data: invoices });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/invoices/:invoiceId
 * Détail d'une facture
 */
router.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const invoice = await VehicleInvoice.findById(req.params.invoiceId);

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Facture non trouvée' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/invoices/:invoiceId/validate
 * Valider une facture OCR
 */
router.post('/invoices/:invoiceId/validate', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const invoice = await maintenanceService.validateInvoice(req.params.invoiceId, {
      validatedBy: req.body.validatedBy,
      ...req.body,
    });

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/invoices/:invoiceId/link
 * Lier une facture à un entretien/panne
 */
router.post('/invoices/:invoiceId/link', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const invoice = await maintenanceService.linkInvoiceToWork(req.params.invoiceId, req.body);

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// CONTRÔLES / INSPECTIONS
// ==========================================

/**
 * GET /api/v1/vehicles/:id/inspections
 * Liste des contrôles d'un véhicule
 */
router.get('/:id/inspections', async (req, res) => {
  try {
    const { type } = req.query;
    const query = { vehicleId: req.params.id };
    if (type) query.inspectionType = type;

    const inspections = await VehicleInspection.find(query).sort({ inspectionDate: -1 });

    res.json({ success: true, data: inspections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/vehicles/:id/inspections
 * Enregistrer un contrôle
 */
router.post('/:id/inspections', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) {
      return res.status(404).json({ success: false, error: 'Véhicule non trouvé' });
    }

    const inspection = new VehicleInspection({
      vehicleId: vehicle._id,
      licensePlate: vehicle.licensePlate,
      ...req.body,
      organizationId: req.organizationId,
    });

    await inspection.save();

    res.status(201).json({ success: true, data: inspection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/inspections/expiring
 * Contrôles expirant bientôt
 */
router.get('/inspections/expiring', async (req, res) => {
  try {
    const { days = 60, type } = req.query;
    const inspections = await VehicleInspection.findExpiring(type, parseInt(days), req.organizationId);

    res.json({ success: true, data: inspections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/inspections/expired
 * Contrôles expirés
 */
router.get('/inspections/expired', async (req, res) => {
  try {
    const { type } = req.query;
    const inspections = await VehicleInspection.findExpired(type, req.organizationId);

    res.json({ success: true, data: inspections });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// STATISTIQUES
// ==========================================

/**
 * GET /api/v1/vehicles/:id/stats
 * Statistiques d'un véhicule
 */
router.get('/:id/stats', async (req, res) => {
  try {
    const maintenanceService = getMaintenanceService();
    const stats = await maintenanceService.getVehicleMaintenanceStats(req.params.id);

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/vehicles/fleet/costs
 * Coûts de la flotte
 */
router.get('/fleet/costs', async (req, res) => {
  try {
    const { from, to, groupBy = 'month' } = req.query;
    const maintenanceService = getMaintenanceService();
    const costs = await maintenanceService.getFleetCosts(req.organizationId, { from, to, groupBy });

    res.json({ success: true, data: costs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
