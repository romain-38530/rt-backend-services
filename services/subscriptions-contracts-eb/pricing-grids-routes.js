// Pricing Grids Routes - API REST pour gestion des grilles tarifaires
// RT Backend Services - Version 2.0.0
// Support LTL/FTL/Messagerie + Import Excel

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const {
  TransportTypes,
  PricingCalculationTypes,
  GridStatus,
  GeographicZones,
  FrenchDepartments,
  pricingOptionsConfig,
  calculatePrice,
  isGridActive,
  findApplicableGrids,
  generateGridId
} = require('./pricing-grids-models');

// Configuration multer pour upload de fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (allowedTypes.includes(file.mimetype) ||
        file.originalname.endsWith('.xlsx') ||
        file.originalname.endsWith('.xls') ||
        file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) and CSV files are allowed'));
    }
  }
});

function createPricingGridsRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Middleware pour vérifier la connexion MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available'
        }
      });
    }
    next();
  };

  // ==================== ENDPOINTS GRILLES TARIFAIRES ====================

  /**
   * POST /api/pricing-grids
   * Créer une nouvelle grille tarifaire
   */
  router.post('/', checkMongoDB, async (req, res) => {
    try {
      const {
        carrierId,
        industrialId,
        name,
        description,
        transportType,
        calculationType,
        // Nouvelles structures par type
        ltlPricing,
        ftlPricing,
        messageriePricing,
        // Legacy
        basePricing,
        zonesPricing = [],
        weightTiers = [],
        volumeTiers = [],
        options = { enabledOptions: [], optionsModifiers: {} },
        timeModifiers = {},
        conditions = {},
        validFrom,
        validUntil,
        autoRenew = false,
        createdBy
      } = req.body;

      // Validation des champs requis
      if (!carrierId || !industrialId || !name || !transportType || !calculationType || !createdBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: carrierId, industrialId, name, transportType, calculationType, createdBy'
          }
        });
      }

      // Valider le type de transport
      if (!Object.keys(TransportTypes).includes(transportType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSPORT_TYPE',
            message: `Invalid transport type. Must be one of: ${Object.keys(TransportTypes).join(', ')}`
          }
        });
      }

      // Valider le type de calcul
      if (!Object.keys(PricingCalculationTypes).includes(calculationType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CALCULATION_TYPE',
            message: `Invalid calculation type. Must be one of: ${Object.keys(PricingCalculationTypes).join(', ')}`
          }
        });
      }

      // Validation spécifique par type de transport
      if (transportType === 'LTL' && (!ltlPricing || !ltlPricing.zonePricing || ltlPricing.zonePricing.length === 0)) {
        // Permettre la création sans ltlPricing pour les grilles vides
        console.log('Creating LTL grid without pricing data (will be added later)');
      }

      if (transportType === 'FTL' && (!ftlPricing || !ftlPricing.zonePricing || ftlPricing.zonePricing.length === 0)) {
        console.log('Creating FTL grid without pricing data (will be added later)');
      }

      if (transportType === 'MESSAGERIE' && (!messageriePricing || !messageriePricing.departmentPricing || messageriePricing.departmentPricing.length === 0)) {
        console.log('Creating MESSAGERIE grid without pricing data (will be added later)');
      }

      const db = mongoClient.db();
      const now = new Date();
      const gridId = generateGridId();

      // Vérifier que le transporteur existe
      const carrier = await db.collection('carriers').findOne({ carrierId });
      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const newGrid = {
        gridId,
        carrierId,
        industrialId,
        name,
        description: description || '',
        transportType,
        calculationType,
        // Nouvelles structures
        ltlPricing: ltlPricing || { zonePricing: [] },
        ftlPricing: ftlPricing || { zonePricing: [] },
        messageriePricing: messageriePricing || { volumetricDivisor: 5000, departmentPricing: [] },
        // Legacy pour rétrocompatibilité
        basePricing: basePricing || {
          basePrice: 0,
          pricePerKm: 0,
          pricePerKg: 0,
          pricePerM3: 0,
          pricePerPallet: 0,
          minimumPrice: 0,
          currency: 'EUR'
        },
        zonesPricing,
        weightTiers,
        volumeTiers,
        options,
        timeModifiers,
        conditions,
        validFrom: validFrom ? new Date(validFrom) : now,
        validUntil: validUntil ? new Date(validUntil) : null,
        autoRenew,
        status: GridStatus.DRAFT,
        approval: {
          required: false,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null
        },
        version: 1,
        previousVersionId: null,
        importedFrom: null,
        usage: {
          totalQuotes: 0,
          totalOrders: 0,
          totalRevenue: 0,
          lastUsedAt: null
        },
        createdBy,
        createdAt: now,
        updatedAt: now,
        updatedBy: null
      };

      const result = await db.collection('pricing_grids').insertOne(newGrid);

      res.status(201).json({
        success: true,
        data: {
          ...newGrid,
          _id: result.insertedId
        },
        message: `Pricing grid ${name} created successfully`
      });
    } catch (error) {
      console.error('Error creating pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/pricing-grids
   * Liste toutes les grilles tarifaires avec filtres
   */
  router.get('/', checkMongoDB, async (req, res) => {
    try {
      const {
        carrierId,
        industrialId,
        transportType,
        status,
        activeOnly,
        page = 1,
        limit = 50
      } = req.query;

      const db = mongoClient.db();
      const query = {};

      if (carrierId) query.carrierId = carrierId;
      if (industrialId) query.industrialId = industrialId;
      if (transportType) query.transportType = transportType;
      if (status) query.status = status;

      // Filtrer uniquement les grilles actives si demandé
      if (activeOnly === 'true') {
        query.status = GridStatus.ACTIVE;
        const now = new Date();
        query.$or = [
          { validUntil: null },
          { validUntil: { $gte: now } }
        ];
        query.validFrom = { $lte: now };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const grids = await db.collection('pricing_grids')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_grids').countDocuments(query);

      res.json({
        success: true,
        data: grids,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching pricing grids:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== ROUTES STATIQUES (AVANT /:gridId) ====================
  // IMPORTANT: Ces routes DOIVENT être définies AVANT la route /:gridId
  // sinon Express matche "import", "zones", "departments" comme des gridId

  /**
   * GET /api/pricing-grids/import/template/:type
   * Télécharger un template Excel pour import
   */
  router.get('/import/template/:type', (req, res) => {
    const { type } = req.params;

    let templateData;
    let fileName;

    switch (type.toUpperCase()) {
      case 'LTL':
        templateData = [
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', palletMin: 1, palletMax: 1, pricePerPallet: 150, minimumPrice: 150, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', palletMin: 2, palletMax: 5, pricePerPallet: 120, minimumPrice: 150, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', palletMin: 6, palletMax: 10, pricePerPallet: 100, minimumPrice: 150, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', palletMin: 11, palletMax: 20, pricePerPallet: 85, minimumPrice: 150, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', palletMin: 21, palletMax: 33, pricePerPallet: 75, minimumPrice: 150, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'PAC', palletMin: 1, palletMax: 1, pricePerPallet: 180, minimumPrice: 180, transitDays: 3 },
        ];
        fileName = 'template-ltl-groupage.xlsx';
        break;

      case 'FTL':
        templateData = [
          { zoneOrigin: 'IDF', zoneDestination: 'ARA', vehicleType: 'SEMI', flatRate: 1200, pricePerKm: null, minKm: null, minimumPrice: 1200, transitDays: 1 },
          { zoneOrigin: 'IDF', zoneDestination: 'PAC', vehicleType: 'SEMI', flatRate: 1800, pricePerKm: null, minKm: null, minimumPrice: 1800, transitDays: 2 },
          { zoneOrigin: 'IDF', zoneDestination: 'BRE', vehicleType: 'PORTEUR', flatRate: null, pricePerKm: 1.5, minKm: 200, minimumPrice: 300, transitDays: 1 },
        ];
        fileName = 'template-ftl-complet.xlsx';
        break;

      case 'MESSAGERIE':
        templateData = [
          { departmentOrigin: '75', departmentDestination: '13', minKg: 0, maxKg: 30, price: 15.50, minimumPrice: 10, transitDays: 2 },
          { departmentOrigin: '75', departmentDestination: '13', minKg: 30, maxKg: 100, price: 25.00, minimumPrice: 10, transitDays: 2 },
          { departmentOrigin: '75', departmentDestination: '13', minKg: 100, maxKg: 300, price: 45.00, minimumPrice: 10, transitDays: 2 },
          { departmentOrigin: '75', departmentDestination: '69', minKg: 0, maxKg: 30, price: 12.00, minimumPrice: 8, transitDays: 1 },
          { departmentOrigin: '75', departmentDestination: '69', minKg: 30, maxKg: 100, price: 22.00, minimumPrice: 8, transitDays: 1 },
        ];
        fileName = 'template-messagerie.xlsx';
        break;

      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TYPE',
            message: 'Type must be LTL, FTL, or MESSAGERIE'
          }
        });
    }

    // Créer le fichier Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tarifs');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(buffer);
  });

  /**
   * GET /api/pricing-grids/zones/list
   * Liste toutes les zones géographiques disponibles
   */
  router.get('/zones/list', (req, res) => {
    res.json({
      success: true,
      data: GeographicZones
    });
  });

  /**
   * GET /api/pricing-grids/departments/list
   * Liste tous les départements français
   */
  router.get('/departments/list', (req, res) => {
    res.json({
      success: true,
      data: FrenchDepartments
    });
  });

  /**
   * GET /api/pricing-grids/options/list
   * Liste toutes les options tarifaires disponibles
   */
  router.get('/options/list', (req, res) => {
    res.json({
      success: true,
      data: pricingOptionsConfig
    });
  });

  /**
   * GET /api/pricing-grids/types/transport
   * Liste tous les types de transport disponibles
   */
  router.get('/types/transport', (req, res) => {
    res.json({
      success: true,
      data: TransportTypes
    });
  });

  /**
   * GET /api/pricing-grids/types/calculation
   * Liste tous les types de calcul disponibles
   */
  router.get('/types/calculation', (req, res) => {
    res.json({
      success: true,
      data: PricingCalculationTypes
    });
  });

  // ==================== FIN ROUTES STATIQUES ====================

  /**
   * GET /api/pricing-grids/:gridId
   * Récupérer une grille tarifaire spécifique
   */
  router.get('/:gridId', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;

      const db = mongoClient.db();
      const grid = await db.collection('pricing_grids').findOne({ gridId });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      // Enrichir avec les informations du transporteur
      const carrier = await db.collection('carriers').findOne({ carrierId: grid.carrierId });

      res.json({
        success: true,
        data: {
          ...grid,
          carrier: carrier ? {
            companyName: carrier.companyName,
            siret: carrier.siret,
            status: carrier.status
          } : null,
          activeStatus: isGridActive(grid)
        }
      });
    } catch (error) {
      console.error('Error fetching pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * PUT /api/pricing-grids/:gridId
   * Mettre à jour une grille tarifaire
   */
  router.put('/:gridId', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const { updatedBy, ...updateFields } = req.body;

      if (!updatedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'updatedBy is required'
          }
        });
      }

      const db = mongoClient.db();
      const existingGrid = await db.collection('pricing_grids').findOne({ gridId });

      if (!existingGrid) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      // Ne pas permettre la modification d'une grille archivée
      if (existingGrid.status === GridStatus.ARCHIVED) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'GRID_ARCHIVED',
            message: 'Cannot modify archived pricing grid'
          }
        });
      }

      const now = new Date();
      const allowedFields = [
        'name', 'description',
        'ltlPricing', 'ftlPricing', 'messageriePricing',
        'basePricing', 'zonesPricing',
        'weightTiers', 'volumeTiers', 'options', 'timeModifiers',
        'conditions', 'validFrom', 'validUntil', 'autoRenew'
      ];

      const updates = {};
      Object.keys(updateFields).forEach(key => {
        if (allowedFields.includes(key)) {
          updates[key] = updateFields[key];
        }
      });

      updates.updatedAt = now;
      updates.updatedBy = updatedBy;

      const result = await db.collection('pricing_grids').findOneAndUpdate(
        { gridId },
        { $set: updates },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Pricing grid updated successfully'
      });
    } catch (error) {
      console.error('Error updating pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/pricing-grids/:gridId/activate
   * Activer une grille tarifaire
   */
  router.post('/:gridId/activate', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const { activatedBy } = req.body;

      if (!activatedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'activatedBy is required'
          }
        });
      }

      const db = mongoClient.db();
      const grid = await db.collection('pricing_grids').findOne({ gridId });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      const now = new Date();
      const result = await db.collection('pricing_grids').findOneAndUpdate(
        { gridId },
        {
          $set: {
            status: GridStatus.ACTIVE,
            'approval.approvedBy': activatedBy,
            'approval.approvedAt': now,
            updatedAt: now,
            updatedBy: activatedBy
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Pricing grid activated successfully'
      });
    } catch (error) {
      console.error('Error activating pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/pricing-grids/:gridId/suspend
   * Suspendre une grille tarifaire
   */
  router.post('/:gridId/suspend', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const { suspendedBy, reason } = req.body;

      if (!suspendedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'suspendedBy is required'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('pricing_grids').findOneAndUpdate(
        { gridId },
        {
          $set: {
            status: GridStatus.SUSPENDED,
            suspensionReason: reason || '',
            suspendedBy,
            suspendedAt: now,
            updatedAt: now,
            updatedBy: suspendedBy
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Pricing grid suspended successfully'
      });
    } catch (error) {
      console.error('Error suspending pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/pricing-grids/:gridId/archive
   * Archiver une grille tarifaire
   */
  router.post('/:gridId/archive', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const { archivedBy } = req.body;

      if (!archivedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'archivedBy is required'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('pricing_grids').findOneAndUpdate(
        { gridId },
        {
          $set: {
            status: GridStatus.ARCHIVED,
            archivedBy,
            archivedAt: now,
            updatedAt: now,
            updatedBy: archivedBy
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Pricing grid archived successfully'
      });
    } catch (error) {
      console.error('Error archiving pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * DELETE /api/pricing-grids/:gridId
   * Supprimer une grille tarifaire (DRAFT uniquement)
   */
  router.delete('/:gridId', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;

      const db = mongoClient.db();
      const grid = await db.collection('pricing_grids').findOne({ gridId });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Pricing grid not found'
          }
        });
      }

      // Ne permettre la suppression que des grilles DRAFT
      if (grid.status !== GridStatus.DRAFT) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message: 'Only DRAFT pricing grids can be deleted. Use archive instead.'
          }
        });
      }

      await db.collection('pricing_grids').deleteOne({ gridId });

      res.json({
        success: true,
        message: 'Pricing grid deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/pricing-grids/calculate
   * Calculer le prix pour un transport donné
   */
  router.post('/calculate', checkMongoDB, async (req, res) => {
    try {
      const {
        carrierId,
        industrialId,
        transportType,
        // LTL params
        pallets,
        zoneOrigin,
        zoneDestination,
        // FTL params
        vehicleType,
        distance,
        // Messagerie params
        weight,
        dimensions,
        departmentOrigin,
        departmentDestination,
        // Options
        options = [],
        isWeekend = false,
        isNight = false,
        isHoliday = false
      } = req.body;

      if (!carrierId || !industrialId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'carrierId and industrialId are required'
          }
        });
      }

      const db = mongoClient.db();

      // Récupérer toutes les grilles actives pour ce transporteur et cet industriel
      const query = {
        carrierId,
        industrialId,
        status: GridStatus.ACTIVE
      };

      if (transportType) {
        query.transportType = transportType;
      }

      const grids = await db.collection('pricing_grids').find(query).toArray();

      if (grids.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NO_GRIDS_FOUND',
            message: 'No active pricing grids found for this carrier and industrial'
          }
        });
      }

      // Filtrer les grilles applicables
      const parameters = {
        pallets,
        zoneOrigin,
        zoneDestination,
        vehicleType,
        distance,
        weight,
        dimensions,
        departmentOrigin,
        departmentDestination,
        options,
        isWeekend,
        isNight,
        isHoliday,
        transportType
      };

      const applicableGrids = findApplicableGrids(grids, parameters);

      if (applicableGrids.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NO_APPLICABLE_GRIDS',
            message: 'No pricing grids match the transport parameters'
          }
        });
      }

      // Calculer le prix pour chaque grille applicable
      const calculations = applicableGrids.map(grid => {
        const result = calculatePrice(grid, parameters);
        return {
          gridId: grid.gridId,
          gridName: grid.name,
          transportType: grid.transportType,
          calculation: result
        };
      }).filter(c => c.calculation.valid);

      if (calculations.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CALCULATION_FAILED',
            message: 'Could not calculate price for any applicable grid'
          }
        });
      }

      // Trier par prix croissant
      calculations.sort((a, b) => a.calculation.price - b.calculation.price);

      res.json({
        success: true,
        data: {
          calculations,
          bestPrice: calculations[0],
          totalGridsFound: grids.length,
          applicableGrids: applicableGrids.length
        }
      });
    } catch (error) {
      console.error('Error calculating price:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== IMPORT EXCEL ====================

  /**
   * POST /api/pricing-grids/import/excel
   * Importer une grille tarifaire depuis un fichier Excel
   */
  router.post('/import/excel', checkMongoDB, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_FILE',
            message: 'No file uploaded'
          }
        });
      }

      const {
        carrierId,
        industrialId,
        gridName,
        transportType,
        importedBy
      } = req.body;

      if (!carrierId || !industrialId || !gridName || !transportType || !importedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'carrierId, industrialId, gridName, transportType and importedBy are required'
          }
        });
      }

      // Valider le type de transport
      if (!['LTL', 'FTL', 'MESSAGERIE'].includes(transportType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSPORT_TYPE',
            message: 'Transport type must be LTL, FTL, or MESSAGERIE for Excel import'
          }
        });
      }

      const db = mongoClient.db();

      // Vérifier que le transporteur existe
      const carrier = await db.collection('carriers').findOne({ carrierId });
      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      // Lire le fichier Excel
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      if (data.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_FILE',
            message: 'Excel file is empty or has no valid data'
          }
        });
      }

      // Traiter selon le type de transport
      let pricing;
      let calculationType;

      switch (transportType) {
        case 'LTL':
          pricing = processLTLExcel(data);
          calculationType = 'PER_PALLET';
          break;
        case 'FTL':
          pricing = processFTLExcel(data);
          calculationType = data[0].pricePerKm ? 'PER_KM' : 'FLAT_RATE';
          break;
        case 'MESSAGERIE':
          pricing = processMessagerieExcel(data);
          calculationType = 'PER_WEIGHT';
          break;
      }

      if (pricing.errors && pricing.errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERRORS',
            message: 'Errors found in Excel file',
            details: pricing.errors
          }
        });
      }

      // Créer la grille
      const now = new Date();
      const gridId = generateGridId();

      const newGrid = {
        gridId,
        carrierId,
        industrialId,
        name: gridName,
        description: `Imported from ${req.file.originalname}`,
        transportType,
        calculationType,
        ltlPricing: transportType === 'LTL' ? pricing.data : { zonePricing: [] },
        ftlPricing: transportType === 'FTL' ? pricing.data : { zonePricing: [] },
        messageriePricing: transportType === 'MESSAGERIE' ? pricing.data : { volumetricDivisor: 5000, departmentPricing: [] },
        basePricing: {
          basePrice: 0,
          minimumPrice: 0,
          currency: 'EUR'
        },
        options: { enabledOptions: [], optionsModifiers: {} },
        timeModifiers: {},
        conditions: {},
        validFrom: now,
        validUntil: null,
        autoRenew: false,
        status: GridStatus.DRAFT,
        approval: {
          required: false,
          approvedBy: null,
          approvedAt: null,
          rejectionReason: null
        },
        version: 1,
        importedFrom: {
          type: 'EXCEL',
          fileName: req.file.originalname,
          importedAt: now,
          importedBy
        },
        usage: {
          totalQuotes: 0,
          totalOrders: 0,
          totalRevenue: 0,
          lastUsedAt: null
        },
        createdBy: importedBy,
        createdAt: now,
        updatedAt: now
      };

      const result = await db.collection('pricing_grids').insertOne(newGrid);

      res.status(201).json({
        success: true,
        data: {
          ...newGrid,
          _id: result.insertedId
        },
        importStats: {
          fileName: req.file.originalname,
          rowsProcessed: data.length,
          zonesCreated: pricing.stats?.zones || 0,
          tiersCreated: pricing.stats?.tiers || 0
        },
        message: `Pricing grid imported successfully from ${req.file.originalname}`
      });
    } catch (error) {
      console.error('Error importing Excel:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  return router;
}

// ==================== FONCTIONS DE TRAITEMENT EXCEL ====================

/**
 * Traiter un fichier Excel LTL (groupage palette)
 */
function processLTLExcel(data) {
  const errors = [];
  const zonePricing = {};
  let tiersCount = 0;

  data.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row.zoneOrigin || !row.zoneDestination) {
      errors.push(`Ligne ${rowNum}: zoneOrigin et zoneDestination requis`);
      return;
    }

    if (!row.palletMin || !row.palletMax || !row.pricePerPallet) {
      errors.push(`Ligne ${rowNum}: palletMin, palletMax et pricePerPallet requis`);
      return;
    }

    const key = `${row.zoneOrigin}->${row.zoneDestination}`;

    if (!zonePricing[key]) {
      zonePricing[key] = {
        zoneOrigin: row.zoneOrigin,
        zoneDestination: row.zoneDestination,
        palletTiers: [],
        minimumPrice: row.minimumPrice || 0,
        transitDays: row.transitDays || 2
      };
    }

    zonePricing[key].palletTiers.push({
      min: parseInt(row.palletMin),
      max: parseInt(row.palletMax),
      pricePerPallet: parseFloat(row.pricePerPallet)
    });
    tiersCount++;
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      zonePricing: Object.values(zonePricing)
    },
    stats: {
      zones: Object.keys(zonePricing).length,
      tiers: tiersCount
    }
  };
}

/**
 * Traiter un fichier Excel FTL (lot complet)
 */
function processFTLExcel(data) {
  const errors = [];
  const zonePricing = [];

  data.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row.zoneOrigin || !row.zoneDestination) {
      errors.push(`Ligne ${rowNum}: zoneOrigin et zoneDestination requis`);
      return;
    }

    if (!row.flatRate && !row.pricePerKm) {
      errors.push(`Ligne ${rowNum}: flatRate ou pricePerKm requis`);
      return;
    }

    zonePricing.push({
      zoneOrigin: row.zoneOrigin,
      zoneDestination: row.zoneDestination,
      vehicleType: row.vehicleType || 'SEMI',
      flatRate: row.flatRate ? parseFloat(row.flatRate) : null,
      pricePerKm: row.pricePerKm ? parseFloat(row.pricePerKm) : null,
      minKm: row.minKm ? parseInt(row.minKm) : 0,
      minimumPrice: row.minimumPrice ? parseFloat(row.minimumPrice) : 0,
      transitDays: row.transitDays || 1
    });
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      zonePricing
    },
    stats: {
      zones: zonePricing.length,
      tiers: zonePricing.length
    }
  };
}

/**
 * Traiter un fichier Excel Messagerie (département/poids)
 */
function processMessagerieExcel(data) {
  const errors = [];
  const departmentPricing = {};
  let tiersCount = 0;

  data.forEach((row, index) => {
    const rowNum = index + 2;

    if (!row.departmentOrigin || !row.departmentDestination) {
      errors.push(`Ligne ${rowNum}: departmentOrigin et departmentDestination requis`);
      return;
    }

    if (row.minKg === undefined || row.maxKg === undefined || !row.price) {
      errors.push(`Ligne ${rowNum}: minKg, maxKg et price requis`);
      return;
    }

    const key = `${row.departmentOrigin}->${row.departmentDestination}`;

    if (!departmentPricing[key]) {
      departmentPricing[key] = {
        departmentOrigin: String(row.departmentOrigin),
        departmentDestination: String(row.departmentDestination),
        weightTiers: [],
        minimumPrice: row.minimumPrice || 0,
        transitDays: row.transitDays || 2
      };
    }

    departmentPricing[key].weightTiers.push({
      minKg: parseFloat(row.minKg),
      maxKg: parseFloat(row.maxKg),
      price: parseFloat(row.price)
    });
    tiersCount++;
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      volumetricDivisor: 5000,
      departmentPricing: Object.values(departmentPricing)
    },
    stats: {
      zones: Object.keys(departmentPricing).length,
      tiers: tiersCount
    }
  };
}

module.exports = createPricingGridsRoutes;
