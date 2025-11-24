// e-CMR Routes - API REST pour e-CMR
// RT Backend Services - Version 1.0.0

const express = require('express');
const { ObjectId } = require('mongodb');
const {
  ContractStatus,
  validateECMR,
  generateCMRNumber,
  createEmptyECMR
} = require('./ecmr-models');

function createECMRRoutes(mongoClient, mongoConnected) {
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

  // ==================== e-CMR CRUD ====================

  // GET /api/ecmr - Liste tous les e-CMR
  router.get('/', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { status, limit = 50, offset = 0 } = req.query;

      const query = { type: 'ECMR' };
      if (status) {
        query.status = status;
      }

      const ecmrs = await db.collection('ecmr')
        .find(query)
        .sort({ 'metadata.createdAt': -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('ecmr').countDocuments(query);

      res.json({
        success: true,
        data: ecmrs,
        count: ecmrs.length,
        total,
        offset: parseInt(offset),
        limit: parseInt(limit)
      });
    } catch (error) {
      console.error('Error fetching e-CMR list:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // GET /api/ecmr/:id - Récupérer un e-CMR spécifique
  router.get('/:id', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const ecmr = await db.collection('ecmr').findOne({
        _id: new ObjectId(req.params.id),
        type: 'ECMR'
      });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      res.json({
        success: true,
        data: ecmr
      });
    } catch (error) {
      console.error('Error fetching e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // POST /api/ecmr - Créer un nouveau e-CMR
  router.post('/', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const now = new Date();

      // Créer e-CMR avec données fournies
      const ecmrData = {
        ...req.body,
        type: 'ECMR',
        status: req.body.status || 'DRAFT',
        cmrNumber: req.body.cmrNumber || generateCMRNumber(),
        metadata: {
          ...req.body.metadata,
          createdAt: now,
          createdBy: req.body.createdBy || 'system',
          updatedAt: now,
          version: 1,
          archived: false,
          pdfGenerated: false
        }
      };

      // Valider les champs obligatoires si status !== DRAFT
      if (ecmrData.status !== 'DRAFT') {
        const validation = validateECMR(ecmrData);
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields',
              details: validation.errors
            }
          });
        }
      }

      const result = await db.collection('ecmr').insertOne(ecmrData);

      res.status(201).json({
        success: true,
        data: {
          ...ecmrData,
          _id: result.insertedId
        },
        message: 'e-CMR created successfully'
      });
    } catch (error) {
      console.error('Error creating e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // PUT /api/ecmr/:id - Mettre à jour un e-CMR
  router.put('/:id', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const now = new Date();

      // Ne pas permettre la modification si déjà signé
      const existingECMR = await db.collection('ecmr').findOne({
        _id: new ObjectId(req.params.id),
        type: 'ECMR'
      });

      if (!existingECMR) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      if (existingECMR.status === 'SIGNED') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Cannot modify a signed e-CMR'
          }
        });
      }

      // Mettre à jour
      const updateData = {
        ...req.body,
        type: 'ECMR', // Forcer le type
        'metadata.updatedAt': now,
        'metadata.version': (existingECMR.metadata?.version || 1) + 1
      };

      delete updateData._id; // Ne pas écraser l'ID

      const result = await db.collection('ecmr').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'e-CMR updated successfully'
      });
    } catch (error) {
      console.error('Error updating e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // DELETE /api/ecmr/:id - Supprimer un e-CMR (seulement DRAFT)
  router.delete('/:id', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const ecmr = await db.collection('ecmr').findOne({
        _id: new ObjectId(req.params.id),
        type: 'ECMR'
      });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      if (ecmr.status !== 'DRAFT') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Can only delete DRAFT e-CMR'
          }
        });
      }

      await db.collection('ecmr').deleteOne({ _id: new ObjectId(req.params.id) });

      res.json({
        success: true,
        message: 'e-CMR deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== WORKFLOW e-CMR ====================

  // POST /api/ecmr/:id/validate - Valider et envoyer pour signatures
  router.post('/:id/validate', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const ecmr = await db.collection('ecmr').findOne({
        _id: new ObjectId(req.params.id),
        type: 'ECMR'
      });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      // Valider les champs obligatoires
      const validation = validateECMR(ecmr);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'e-CMR is incomplete',
            details: validation.errors
          }
        });
      }

      // Mettre à jour le statut
      const result = await db.collection('ecmr').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            status: 'PENDING_SIGNATURES',
            'metadata.updatedAt': new Date()
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'e-CMR validated and sent for signatures'
      });
    } catch (error) {
      console.error('Error validating e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // POST /api/ecmr/:id/sign/:party - Signer l'e-CMR (sender/carrier/consignee)
  router.post('/:id/sign/:party', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { party } = req.params; // 'sender', 'carrierPickup', 'consignee'
      const { signatureData, geolocation, signedBy } = req.body;

      if (!signatureData) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required field: signatureData'
          }
        });
      }

      const ecmr = await db.collection('ecmr').findOne({
        _id: new ObjectId(req.params.id),
        type: 'ECMR'
      });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      // Vérifier que la partie est valide
      const validParties = ['sender', 'carrierPickup', 'consignee'];
      if (!validParties.includes(party)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARTY',
            message: `Invalid party. Must be one of: ${validParties.join(', ')}`
          }
        });
      }

      const now = new Date();

      // Créer la signature
      const signature = {
        _id: new ObjectId(),
        ecmrId: ecmr._id,
        party,
        signatureData,
        signedBy: signedBy || 'unknown',
        signedAt: now,
        ipAddress: req.ip || req.connection.remoteAddress,
        geolocation: geolocation || null,
        signatureType: 'SIMPLE'
      };

      // Stocker la signature dans la collection signatures
      await db.collection('signatures').insertOne(signature);

      // Mettre à jour l'e-CMR
      const updateField = `signatures.${party}`;
      const updateData = {
        [`${updateField}.status`]: 'SIGNED',
        [`${updateField}.signatureId`]: signature._id,
        [`${updateField}.signedAt`]: now,
        [`${updateField}.signedBy`]: signedBy || 'unknown',
        [`${updateField}.ipAddress`]: signature.ipAddress,
        [`${updateField}.geolocation`]: signature.geolocation,
        'metadata.updatedAt': now
      };

      // Vérifier si toutes les signatures requises sont complètes
      const allSigned =
        (party === 'sender' || ecmr.signatures?.sender?.status === 'SIGNED') &&
        (party === 'carrierPickup' || ecmr.signatures?.carrierPickup?.status === 'SIGNED') &&
        (party === 'consignee' || ecmr.signatures?.consignee?.status === 'SIGNED');

      if (allSigned) {
        updateData.status = 'SIGNED';
      } else if (party === 'carrierPickup' && ecmr.status === 'PENDING_SIGNATURES') {
        updateData.status = 'IN_TRANSIT'; // Transporteur a signé = en transit
      }

      const result = await db.collection('ecmr').findOneAndUpdate(
        { _id: new ObjectId(req.params.id) },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        signature: {
          _id: signature._id,
          signedAt: now
        },
        message: `e-CMR signed by ${party} successfully`
      });
    } catch (error) {
      console.error('Error signing e-CMR:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // POST /api/ecmr/:id/remarks - Ajouter des réserves
  router.post('/:id/remarks', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { type, description, photos } = req.body; // type: 'loading' ou 'delivery'

      if (!type || !['loading', 'delivery'].includes(type)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'type must be "loading" or "delivery"'
          }
        });
      }

      const remarkField = type === 'loading' ? 'remarks.loadingRemarks' : 'remarks.deliveryRemarks';

      const result = await db.collection('ecmr').findOneAndUpdate(
        { _id: new ObjectId(req.params.id), type: 'ECMR' },
        {
          $set: {
            [`${remarkField}.hasRemarks`]: true,
            [`${remarkField}.description`]: description,
            [`${remarkField}.photos`]: photos || [],
            [`${remarkField}.reportedAt`]: new Date(),
            'metadata.updatedAt': new Date()
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: `${type} remarks added successfully`
      });
    } catch (error) {
      console.error('Error adding remarks:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // POST /api/ecmr/:id/tracking - Mettre à jour la position GPS
  router.post('/:id/tracking', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'latitude and longitude are required'
          }
        });
      }

      const now = new Date();
      const position = { latitude, longitude, timestamp: now };

      const result = await db.collection('ecmr').findOneAndUpdate(
        { _id: new ObjectId(req.params.id), type: 'ECMR' },
        {
          $set: {
            'tracking.lastPosition': position,
            'tracking.enabled': true,
            'metadata.updatedAt': now
          },
          $push: {
            'tracking.positions': position
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      res.json({
        success: true,
        data: {
          lastPosition: position,
          totalPositions: result.value.tracking?.positions?.length || 0
        },
        message: 'GPS position updated successfully'
      });
    } catch (error) {
      console.error('Error updating tracking:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // GET /api/ecmr/:cmrNumber/verify - Vérifier un e-CMR par numéro CMR
  router.get('/:cmrNumber/verify', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const ecmr = await db.collection('ecmr').findOne({
        cmrNumber: req.params.cmrNumber,
        type: 'ECMR'
      });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'e-CMR not found'
          }
        });
      }

      // Retourner uniquement les infos publiques
      res.json({
        success: true,
        data: {
          cmrNumber: ecmr.cmrNumber,
          status: ecmr.status,
          sender: { name: ecmr.sender?.name },
          consignee: { name: ecmr.consignee?.name },
          carrier: { name: ecmr.carrier?.name },
          createdAt: ecmr.metadata?.createdAt,
          signatures: {
            sender: ecmr.signatures?.sender?.status,
            carrier: ecmr.signatures?.carrierPickup?.status,
            consignee: ecmr.signatures?.consignee?.status
          }
        },
        verified: true
      });
    } catch (error) {
      console.error('Error verifying e-CMR:', error);
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

module.exports = createECMRRoutes;

  // GET /api/ecmr/transport-order/:orderId - Récupérer tous les e-CMR d'une commande transport
  router.get('/transport-order/:orderId', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();

      const ecmrs = await db.collection('ecmr')
        .find({ transportOrderId: req.params.orderId })
        .sort({ 'metadata.createdAt': -1 })
        .toArray();

      res.json({
        success: true,
        data: ecmrs,
        count: ecmrs.length,
        transportOrderId: req.params.orderId
      });
    } catch (error) {
      console.error('Error fetching e-CMR by transport order:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

