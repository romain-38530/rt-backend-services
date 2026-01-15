// Industrial Transport Configuration Routes - Configuration des types de transport attendus par industriel
// RT Backend Services - Version 1.1.0 - Security Enhanced

const express = require('express');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const { TransportTypes } = require('./pricing-grids-models');

// Configuration JWT sécurisée
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('[SECURITY] JWT_SECRET must be at least 32 characters in production');
  }
  return secret || 'dev-temp-secret-not-for-production';
};

function createIndustrialTransportConfigRoutes(mongoClient, mongoConnected) {
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

  // SECURITY: Middleware d'authentification JWT
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token d\'authentification requis'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token invalide ou expiré'
        }
      });
    }
  };

  // SECURITY: Middleware pour vérifier que l'utilisateur appartient à l'industriel
  const checkIndustrialOwnership = async (req, res, next) => {
    try {
      const { industrialId } = req.params;
      const userId = req.user.userId || req.user.id || req.user.sub;
      const userOrgId = req.user.organizationId || req.user.orgId;
      const userRole = req.user.role;

      // Admin peut accéder à tout
      if (userRole === 'admin' || userRole === 'superadmin') {
        return next();
      }

      // Vérifier que l'utilisateur appartient à cet industriel
      if (userOrgId && userOrgId === industrialId) {
        return next();
      }

      // Vérification supplémentaire en base de données si nécessaire
      const db = mongoClient.db();
      const user = await db.collection('users').findOne({
        _id: new ObjectId(userId),
        $or: [
          { organizationId: industrialId },
          { industrialId: industrialId },
          { 'organizations': industrialId }
        ]
      });

      if (!user) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Vous n\'avez pas accès à cette ressource industrielle'
          }
        });
      }

      next();
    } catch (error) {
      console.error('[checkIndustrialOwnership] Error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'AUTH_ERROR',
          message: 'Erreur lors de la vérification des droits'
        }
      });
    }
  };

  // ==================== ENDPOINTS CONFIGURATION TYPES DE TRANSPORT ====================

  /**
   * GET /api/industrial/:industrialId/transport-config
   * Récupérer la configuration des types de transport pour un industriel
   */
  router.get('/:industrialId/transport-config', authenticateToken, checkIndustrialOwnership, checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.params;

      const db = mongoClient.db();
      let config = await db.collection('industrial_transport_configs').findOne({ industrialId });

      // Si pas de configuration, retourner la configuration par défaut
      if (!config) {
        config = {
          industrialId,
          requiredTransportTypes: [],
          optionalTransportTypes: Object.keys(TransportTypes),
          mandatoryForCarriers: false,
          autoRejectIncompatible: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }

      res.json({
        success: true,
        data: config,
        availableTypes: TransportTypes
      });
    } catch (error) {
      console.error('Error fetching industrial transport config:', error);
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
   * POST /api/industrial/:industrialId/transport-config
   * Créer ou mettre à jour la configuration des types de transport
   *
   * Body: {
   *   requiredTransportTypes: ["FTL", "LTL"],    // Types obligatoires
   *   optionalTransportTypes: ["ADR", "FRIGO"],  // Types optionnels
   *   mandatoryForCarriers: true,                 // Transporteurs doivent avoir au moins 1 type requis
   *   autoRejectIncompatible: false,              // Auto-rejeter les transporteurs sans types requis
   *   minTypesRequired: 2                         // Minimum de types requis par transporteur
   * }
   */
  router.post('/:industrialId/transport-config', authenticateToken, checkIndustrialOwnership, checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.params;
      const {
        requiredTransportTypes = [],
        optionalTransportTypes = [],
        mandatoryForCarriers = false,
        autoRejectIncompatible = false,
        minTypesRequired = 1,
        updatedBy
      } = req.body;

      // Valider les types de transport
      const invalidRequired = requiredTransportTypes.filter(t => !Object.keys(TransportTypes).includes(t));
      const invalidOptional = optionalTransportTypes.filter(t => !Object.keys(TransportTypes).includes(t));

      if (invalidRequired.length > 0 || invalidOptional.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSPORT_TYPES',
            message: 'Invalid transport types',
            invalidRequired,
            invalidOptional,
            validTypes: Object.keys(TransportTypes)
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const configData = {
        industrialId,
        requiredTransportTypes,
        optionalTransportTypes,
        mandatoryForCarriers,
        autoRejectIncompatible,
        minTypesRequired,
        updatedAt: now,
        updatedBy: updatedBy || null
      };

      // Chercher si une configuration existe déjà
      const existing = await db.collection('industrial_transport_configs').findOne({ industrialId });

      if (existing) {
        // Mettre à jour
        const result = await db.collection('industrial_transport_configs').findOneAndUpdate(
          { industrialId },
          {
            $set: configData,
            $push: {
              history: {
                changedAt: now,
                changedBy: updatedBy || 'system',
                previousConfig: {
                  requiredTransportTypes: existing.requiredTransportTypes,
                  optionalTransportTypes: existing.optionalTransportTypes
                }
              }
            }
          },
          { returnDocument: 'after' }
        );

        res.json({
          success: true,
          data: result.value,
          message: 'Transport configuration updated successfully'
        });
      } else {
        // Créer
        configData.createdAt = now;
        configData.history = [];

        const result = await db.collection('industrial_transport_configs').insertOne(configData);

        res.status(201).json({
          success: true,
          data: {
            ...configData,
            _id: result.insertedId
          },
          message: 'Transport configuration created successfully'
        });
      }
    } catch (error) {
      console.error('Error saving industrial transport config:', error);
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
   * POST /api/industrial/:industrialId/transport-config/add-type
   * Ajouter un type de transport requis
   */
  router.post('/:industrialId/transport-config/add-type', authenticateToken, checkIndustrialOwnership, checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.params;
      const { transportType, required = true, updatedBy } = req.body;

      if (!transportType || !Object.keys(TransportTypes).includes(transportType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSPORT_TYPE',
            message: 'Invalid transport type',
            validTypes: Object.keys(TransportTypes)
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const fieldToUpdate = required ? 'requiredTransportTypes' : 'optionalTransportTypes';
      const fieldToRemoveFrom = required ? 'optionalTransportTypes' : 'requiredTransportTypes';

      const result = await db.collection('industrial_transport_configs').findOneAndUpdate(
        { industrialId },
        {
          $addToSet: { [fieldToUpdate]: transportType },
          $pull: { [fieldToRemoveFrom]: transportType },
          $set: {
            updatedAt: now,
            updatedBy: updatedBy || null
          }
        },
        {
          returnDocument: 'after',
          upsert: true
        }
      );

      res.json({
        success: true,
        data: result.value,
        message: `Transport type ${transportType} added as ${required ? 'required' : 'optional'}`
      });
    } catch (error) {
      console.error('Error adding transport type:', error);
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
   * POST /api/industrial/:industrialId/transport-config/remove-type
   * Retirer un type de transport
   */
  router.post('/:industrialId/transport-config/remove-type', authenticateToken, checkIndustrialOwnership, checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.params;
      const { transportType, updatedBy } = req.body;

      if (!transportType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'transportType is required'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('industrial_transport_configs').findOneAndUpdate(
        { industrialId },
        {
          $pull: {
            requiredTransportTypes: transportType,
            optionalTransportTypes: transportType
          },
          $set: {
            updatedAt: now,
            updatedBy: updatedBy || null
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Configuration not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: `Transport type ${transportType} removed`
      });
    } catch (error) {
      console.error('Error removing transport type:', error);
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
   * GET /api/industrial/:industrialId/carriers/compatibility
   * Vérifier la compatibilité des transporteurs avec les types requis
   */
  router.get('/:industrialId/carriers/compatibility', authenticateToken, checkIndustrialOwnership, checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.params;

      const db = mongoClient.db();

      // Récupérer la configuration industrielle
      const config = await db.collection('industrial_transport_configs').findOne({ industrialId });

      if (!config || config.requiredTransportTypes.length === 0) {
        return res.json({
          success: true,
          data: {
            message: 'No required transport types configured',
            allCarriersCompatible: true
          }
        });
      }

      // Récupérer tous les transporteurs de cet industriel
      const carriers = await db.collection('carriers').find({
        'industrialClients.industrialId': industrialId
      }).toArray();

      // Analyser la compatibilité
      const compatibilityReport = carriers.map(carrier => {
        const carrierTypes = carrier.transportTypes || [];
        const hasRequiredTypes = config.requiredTransportTypes.some(reqType =>
          carrierTypes.includes(reqType)
        );
        const matchingTypes = config.requiredTransportTypes.filter(reqType =>
          carrierTypes.includes(reqType)
        );
        const missingTypes = config.requiredTransportTypes.filter(reqType =>
          !carrierTypes.includes(reqType)
        );

        return {
          carrierId: carrier.carrierId,
          companyName: carrier.companyName,
          transportTypes: carrierTypes,
          isCompatible: hasRequiredTypes,
          matchingTypes,
          missingTypes,
          compatibilityScore: matchingTypes.length / config.requiredTransportTypes.length
        };
      });

      // Statistiques
      const compatible = compatibilityReport.filter(c => c.isCompatible).length;
      const incompatible = compatibilityReport.filter(c => !c.isCompatible).length;

      res.json({
        success: true,
        data: {
          configuration: {
            requiredTypes: config.requiredTransportTypes,
            optionalTypes: config.optionalTransportTypes,
            mandatoryForCarriers: config.mandatoryForCarriers
          },
          statistics: {
            totalCarriers: carriers.length,
            compatible,
            incompatible,
            compatibilityRate: carriers.length > 0 ? (compatible / carriers.length * 100).toFixed(2) + '%' : '0%'
          },
          carriers: compatibilityReport
        }
      });
    } catch (error) {
      console.error('Error checking carrier compatibility:', error);
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

module.exports = createIndustrialTransportConfigRoutes;
