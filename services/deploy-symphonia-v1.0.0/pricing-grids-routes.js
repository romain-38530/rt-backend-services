// Pricing Grids Routes - API REST pour gestion des grilles tarifaires
// RT Backend Services - Version 1.0.0

const express = require('express');
const { ObjectId } = require('mongodb');
const {
  TransportTypes,
  PricingCalculationTypes,
  GridStatus,
  GeographicZones,
  pricingOptionsConfig,
  calculatePrice,
  validateConditions,
  isGridActive,
  findApplicableGrids,
  generateGridId
} = require('./pricing-grids-models');

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
      if (!carrierId || !industrialId || !name || !transportType || !calculationType || !basePricing || !createdBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: carrierId, industrialId, name, transportType, calculationType, basePricing, createdBy'
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

      // Valider basePricing
      if (!basePricing.basePrice || !basePricing.minimumPrice) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_BASE_PRICING',
            message: 'basePricing must include basePrice and minimumPrice'
          }
        });
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
        basePricing: {
          basePrice: basePricing.basePrice,
          pricePerKm: basePricing.pricePerKm || 0,
          pricePerKg: basePricing.pricePerKg || 0,
          pricePerM3: basePricing.pricePerM3 || 0,
          pricePerPallet: basePricing.pricePerPallet || 0,
          minimumPrice: basePricing.minimumPrice,
          currency: basePricing.currency || 'EUR'
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
        'name', 'description', 'basePricing', 'zonesPricing',
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
        distance,
        weight,
        volume,
        pallets,
        zoneOrigin,
        zoneDestination,
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
        distance,
        weight,
        volume,
        pallets,
        zoneOrigin,
        zoneDestination,
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
      });

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

  /**
   * GET /api/pricing-grids/zones/list
   * Liste toutes les zones géographiques disponibles
   */
  router.get('/zones/list', checkMongoDB, async (req, res) => {
    try {
      res.json({
        success: true,
        data: GeographicZones
      });
    } catch (error) {
      console.error('Error fetching zones:', error);
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
   * GET /api/pricing-grids/options/list
   * Liste toutes les options tarifaires disponibles
   */
  router.get('/options/list', checkMongoDB, async (req, res) => {
    try {
      res.json({
        success: true,
        data: pricingOptionsConfig
      });
    } catch (error) {
      console.error('Error fetching options:', error);
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
   * GET /api/pricing-grids/types/transport
   * Liste tous les types de transport disponibles
   */
  router.get('/types/transport', checkMongoDB, async (req, res) => {
    try {
      res.json({
        success: true,
        data: TransportTypes
      });
    } catch (error) {
      console.error('Error fetching transport types:', error);
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

module.exports = createPricingGridsRoutes;
