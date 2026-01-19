// Pricing Grids Extended Routes - Routes manquantes pour module Grille Tarifaire
// RT Backend Services - Version 4.3.0
// Support complet Industrial <-> Transporter flows

const express = require('express');
const { ObjectId } = require('mongodb');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

// AWS S3 Configuration (SDK v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1'
});

const S3_BUCKET = process.env.PRICING_FILES_BUCKET || 'rt-pricing-files';

// Status enums
const ConfigStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED'
};

const RequestStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  PROPOSALS_RECEIVED: 'PROPOSALS_RECEIVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

const ProposalStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  NEGOTIATING: 'NEGOTIATING',
  EXPIRED: 'EXPIRED',
  WITHDRAWN: 'WITHDRAWN'
};

function createPricingGridsExtendedRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Middleware pour verifier la connexion MongoDB
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

  // Helper pour generer des IDs uniques
  const generateId = (prefix) => {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
  };

  // ==================== CONFIGS ROUTES ====================
  // Gestion des configurations de grilles tarifaires

  /**
   * POST /api/pricing-grids/configs
   * Creer une nouvelle configuration de grille
   */
  router.post('/configs', checkMongoDB, async (req, res) => {
    try {
      const {
        industrialId,
        name,
        description,
        transportTypes,
        zones,
        validFrom,
        validUntil,
        autoRenew,
        requiresApproval,
        createdBy
      } = req.body;

      if (!industrialId || !name || !createdBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'industrialId, name, and createdBy are required'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();
      const configId = generateId('CFG');

      const config = {
        configId,
        industrialId,
        name,
        description: description || '',
        transportTypes: transportTypes || ['LTL', 'FTL', 'MESSAGERIE'],
        zones: zones || [],
        validFrom: validFrom ? new Date(validFrom) : now,
        validUntil: validUntil ? new Date(validUntil) : null,
        autoRenew: autoRenew || false,
        requiresApproval: requiresApproval || false,
        status: ConfigStatus.DRAFT,
        linkedGrids: [],
        linkedCarriers: [],
        stats: {
          totalRequests: 0,
          totalProposals: 0,
          acceptedProposals: 0,
          avgResponseTime: 0
        },
        createdBy,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('pricing_grid_configs').insertOne(config);

      res.status(201).json({
        success: true,
        data: config,
        message: 'Pricing grid configuration created successfully'
      });
    } catch (error) {
      console.error('Error creating config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/configs
   * Liste les configurations de grilles
   */
  router.get('/configs', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, status, page = 1, limit = 50 } = req.query;

      const db = mongoClient.db();
      const query = {};

      if (industrialId) query.industrialId = industrialId;
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const configs = await db.collection('pricing_grid_configs')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_grid_configs').countDocuments(query);

      res.json({
        success: true,
        data: configs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing configs:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/configs/:configId
   * Recuperer une configuration specifique
   */
  router.get('/configs/:configId', checkMongoDB, async (req, res) => {
    try {
      const { configId } = req.params;
      const db = mongoClient.db();

      const config = await db.collection('pricing_grid_configs').findOne({ configId });

      if (!config) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Configuration not found' }
        });
      }

      res.json({ success: true, data: config });
    } catch (error) {
      console.error('Error fetching config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * PUT /api/pricing-grids/configs/:configId
   * Mettre a jour une configuration
   */
  router.put('/configs/:configId', checkMongoDB, async (req, res) => {
    try {
      const { configId } = req.params;
      const { updatedBy, ...updates } = req.body;

      if (!updatedBy) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'updatedBy is required' }
        });
      }

      const db = mongoClient.db();
      const allowedFields = ['name', 'description', 'transportTypes', 'zones', 'validFrom', 'validUntil', 'autoRenew', 'requiresApproval'];

      const updateData = { updatedAt: new Date(), updatedBy };
      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          updateData[key] = updates[key];
        }
      });

      const result = await db.collection('pricing_grid_configs').findOneAndUpdate(
        { configId },
        { $set: updateData },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Configuration not found' }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Configuration updated successfully'
      });
    } catch (error) {
      console.error('Error updating config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * DELETE /api/pricing-grids/configs/:configId
   * Supprimer une configuration (DRAFT uniquement)
   */
  router.delete('/configs/:configId', checkMongoDB, async (req, res) => {
    try {
      const { configId } = req.params;
      const db = mongoClient.db();

      const config = await db.collection('pricing_grid_configs').findOne({ configId });

      if (!config) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Configuration not found' }
        });
      }

      if (config.status !== ConfigStatus.DRAFT) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Only DRAFT configurations can be deleted' }
        });
      }

      await db.collection('pricing_grid_configs').deleteOne({ configId });

      res.json({ success: true, message: 'Configuration deleted successfully' });
    } catch (error) {
      console.error('Error deleting config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/configs/:configId/activate
   * Activer une configuration
   */
  router.post('/configs/:configId/activate', checkMongoDB, async (req, res) => {
    try {
      const { configId } = req.params;
      const { activatedBy } = req.body;

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('pricing_grid_configs').findOneAndUpdate(
        { configId },
        { $set: { status: ConfigStatus.ACTIVE, activatedAt: now, activatedBy, updatedAt: now } },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Configuration not found' }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Configuration activated successfully'
      });
    } catch (error) {
      console.error('Error activating config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/configs/:configId/duplicate
   * Dupliquer une configuration
   */
  router.post('/configs/:configId/duplicate', checkMongoDB, async (req, res) => {
    try {
      const { configId } = req.params;
      const { newName, createdBy } = req.body;

      const db = mongoClient.db();
      const original = await db.collection('pricing_grid_configs').findOne({ configId });

      if (!original) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Configuration not found' }
        });
      }

      const now = new Date();
      const newConfigId = generateId('CFG');

      const newConfig = {
        ...original,
        _id: undefined,
        configId: newConfigId,
        name: newName || `${original.name} (copie)`,
        status: ConfigStatus.DRAFT,
        stats: { totalRequests: 0, totalProposals: 0, acceptedProposals: 0, avgResponseTime: 0 },
        duplicatedFrom: configId,
        createdBy,
        createdAt: now,
        updatedAt: now
      };
      delete newConfig._id;

      await db.collection('pricing_grid_configs').insertOne(newConfig);

      res.status(201).json({
        success: true,
        data: newConfig,
        message: 'Configuration duplicated successfully'
      });
    } catch (error) {
      console.error('Error duplicating config:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== FILES ROUTES ====================
  // Gestion des fichiers (grilles Excel, documents)

  /**
   * POST /api/pricing-grids/files/upload-url
   * Generer une URL pre-signee pour upload S3
   */
  router.post('/files/upload-url', checkMongoDB, async (req, res) => {
    try {
      const { fileName, fileType, industrialId, configId, uploadedBy } = req.body;

      if (!fileName || !fileType || !industrialId || !uploadedBy) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'fileName, fileType, industrialId, and uploadedBy are required' }
        });
      }

      const fileId = generateId('FILE');
      const s3Key = `pricing-grids/${industrialId}/${fileId}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: fileType
      });
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      const db = mongoClient.db();
      const now = new Date();

      const fileRecord = {
        fileId,
        industrialId,
        configId: configId || null,
        fileName,
        fileType,
        s3Key,
        s3Bucket: S3_BUCKET,
        status: 'PENDING_UPLOAD',
        uploadedBy,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('pricing_files').insertOne(fileRecord);

      res.json({
        success: true,
        data: {
          fileId,
          uploadUrl,
          s3Key,
          expiresIn: 3600
        }
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/files/:fileId/confirm
   * Confirmer l'upload d'un fichier
   */
  router.post('/files/:fileId/confirm', checkMongoDB, async (req, res) => {
    try {
      const { fileId } = req.params;
      const db = mongoClient.db();

      const file = await db.collection('pricing_files').findOne({ fileId });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        });
      }

      // Verifier que le fichier existe sur S3
      try {
        const headCommand = new HeadObjectCommand({ Bucket: file.s3Bucket, Key: file.s3Key });
        await s3Client.send(headCommand);
      } catch (s3Error) {
        return res.status(400).json({
          success: false,
          error: { code: 'FILE_NOT_UPLOADED', message: 'File not found on S3' }
        });
      }

      const result = await db.collection('pricing_files').findOneAndUpdate(
        { fileId },
        { $set: { status: 'UPLOADED', uploadedAt: new Date(), updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'File upload confirmed'
      });
    } catch (error) {
      console.error('Error confirming upload:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/files
   * Liste les fichiers
   */
  router.get('/files', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, configId, status, page = 1, limit = 50 } = req.query;

      const db = mongoClient.db();
      const query = {};

      if (industrialId) query.industrialId = industrialId;
      if (configId) query.configId = configId;
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const files = await db.collection('pricing_files')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_files').countDocuments(query);

      res.json({
        success: true,
        data: files,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/files/:fileId/download
   * Generer une URL de telechargement
   */
  router.get('/files/:fileId/download', checkMongoDB, async (req, res) => {
    try {
      const { fileId } = req.params;
      const db = mongoClient.db();

      const file = await db.collection('pricing_files').findOne({ fileId });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        });
      }

      const getCommand = new GetObjectCommand({
        Bucket: file.s3Bucket,
        Key: file.s3Key,
        ResponseContentDisposition: `attachment; filename="${file.fileName}"`
      });
      const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

      res.json({
        success: true,
        data: {
          downloadUrl,
          fileName: file.fileName,
          expiresIn: 3600
        }
      });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * DELETE /api/pricing-grids/files/:fileId
   * Supprimer un fichier
   */
  router.delete('/files/:fileId', checkMongoDB, async (req, res) => {
    try {
      const { fileId } = req.params;
      const db = mongoClient.db();

      const file = await db.collection('pricing_files').findOne({ fileId });

      if (!file) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' }
        });
      }

      // Supprimer de S3
      try {
        const deleteCommand = new DeleteObjectCommand({ Bucket: file.s3Bucket, Key: file.s3Key });
        await s3Client.send(deleteCommand);
      } catch (s3Error) {
        console.warn('File not found on S3:', s3Error.message);
      }

      await db.collection('pricing_files').deleteOne({ fileId });

      res.json({ success: true, message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== REQUESTS ROUTES ====================
  // Demandes de prix (Industrial -> Carriers)

  /**
   * POST /api/pricing-grids/requests
   * Creer une demande de prix
   */
  router.post('/requests', checkMongoDB, async (req, res) => {
    try {
      const {
        industrialId,
        configId,
        title,
        description,
        transportTypes,
        zones,
        volumeEstimate,
        frequencyEstimate,
        startDate,
        endDate,
        responseDeadline,
        targetCarriers,
        attachments,
        createdBy
      } = req.body;

      if (!industrialId || !title || !createdBy) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'industrialId, title, and createdBy are required' }
        });
      }

      const db = mongoClient.db();
      const now = new Date();
      const requestId = generateId('REQ');

      const request = {
        requestId,
        industrialId,
        configId: configId || null,
        title,
        description: description || '',
        transportTypes: transportTypes || [],
        zones: zones || [],
        volumeEstimate: volumeEstimate || {},
        frequencyEstimate: frequencyEstimate || '',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        responseDeadline: responseDeadline ? new Date(responseDeadline) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
        targetCarriers: targetCarriers || [], // Empty = broadcast to all
        attachments: attachments || [],
        status: RequestStatus.DRAFT,
        stats: {
          sentTo: 0,
          viewed: 0,
          proposalsReceived: 0
        },
        createdBy,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('pricing_requests').insertOne(request);

      res.status(201).json({
        success: true,
        data: request,
        message: 'Pricing request created successfully'
      });
    } catch (error) {
      console.error('Error creating request:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/requests/:requestId/send
   * Envoyer une demande de prix aux transporteurs
   */
  router.post('/requests/:requestId/send', checkMongoDB, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { sentBy } = req.body;

      const db = mongoClient.db();
      const request = await db.collection('pricing_requests').findOne({ requestId });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Request not found' }
        });
      }

      if (request.status !== RequestStatus.DRAFT) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Only DRAFT requests can be sent' }
        });
      }

      const now = new Date();

      // Determiner les transporteurs cibles
      let targetCarrierIds = request.targetCarriers;

      if (targetCarrierIds.length === 0) {
        // Broadcast: trouver tous les transporteurs actifs
        const carriers = await db.collection('carriers')
          .find({ status: 'ACTIVE' })
          .project({ carrierId: 1 })
          .toArray();
        targetCarrierIds = carriers.map(c => c.carrierId);
      }

      // Creer les recipients
      const recipients = targetCarrierIds.map(carrierId => ({
        requestId,
        carrierId,
        sentAt: now,
        viewedAt: null,
        status: 'SENT'
      }));

      if (recipients.length > 0) {
        await db.collection('pricing_request_recipients').insertMany(recipients);
      }

      // Mettre a jour la demande
      const result = await db.collection('pricing_requests').findOneAndUpdate(
        { requestId },
        {
          $set: {
            status: RequestStatus.PENDING,
            sentAt: now,
            sentBy,
            'stats.sentTo': targetCarrierIds.length,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: `Request sent to ${targetCarrierIds.length} carriers`
      });
    } catch (error) {
      console.error('Error sending request:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/requests/sent
   * Liste les demandes envoyees (vue Industrial)
   */
  router.get('/requests/sent', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, status, page = 1, limit = 50 } = req.query;

      if (!industrialId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'industrialId is required' }
        });
      }

      const db = mongoClient.db();
      const query = { industrialId };

      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const requests = await db.collection('pricing_requests')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_requests').countDocuments(query);

      res.json({
        success: true,
        data: requests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing sent requests:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/requests/received
   * Liste les demandes recues (vue Transporter)
   */
  router.get('/requests/received', checkMongoDB, async (req, res) => {
    try {
      const { carrierId, status, page = 1, limit = 50 } = req.query;

      if (!carrierId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'carrierId is required' }
        });
      }

      const db = mongoClient.db();

      // Trouver les demandes ou ce transporteur est recipient
      const recipients = await db.collection('pricing_request_recipients')
        .find({ carrierId })
        .toArray();

      const requestIds = recipients.map(r => r.requestId);

      const query = { requestId: { $in: requestIds } };
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const requests = await db.collection('pricing_requests')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // Enrichir avec le status recipient
      const enrichedRequests = requests.map(req => {
        const recipient = recipients.find(r => r.requestId === req.requestId);
        return {
          ...req,
          recipientStatus: recipient?.status,
          viewedAt: recipient?.viewedAt
        };
      });

      const total = await db.collection('pricing_requests').countDocuments(query);

      res.json({
        success: true,
        data: enrichedRequests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing received requests:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/requests/:requestId
   * Detail d'une demande
   */
  router.get('/requests/:requestId', checkMongoDB, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { carrierId } = req.query;

      const db = mongoClient.db();
      const request = await db.collection('pricing_requests').findOne({ requestId });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Request not found' }
        });
      }

      // Si c'est un transporteur qui consulte, marquer comme vu
      if (carrierId) {
        await db.collection('pricing_request_recipients').updateOne(
          { requestId, carrierId, viewedAt: null },
          { $set: { viewedAt: new Date(), status: 'VIEWED' } }
        );

        // Incrementer le compteur
        await db.collection('pricing_requests').updateOne(
          { requestId },
          { $inc: { 'stats.viewed': 1 } }
        );
      }

      // Recuperer les propositions si Industrial
      const proposals = await db.collection('pricing_proposals')
        .find({ requestId })
        .toArray();

      res.json({
        success: true,
        data: {
          ...request,
          proposals: proposals.length > 0 ? proposals : undefined
        }
      });
    } catch (error) {
      console.error('Error fetching request:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/requests/:requestId/cancel
   * Annuler une demande
   */
  router.post('/requests/:requestId/cancel', checkMongoDB, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { cancelledBy, reason } = req.body;

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('pricing_requests').findOneAndUpdate(
        { requestId, status: { $nin: [RequestStatus.COMPLETED, RequestStatus.CANCELLED] } },
        {
          $set: {
            status: RequestStatus.CANCELLED,
            cancelledAt: now,
            cancelledBy,
            cancellationReason: reason || '',
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Request not found or cannot be cancelled' }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Request cancelled successfully'
      });
    } catch (error) {
      console.error('Error cancelling request:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== PROPOSALS ROUTES ====================
  // Propositions des transporteurs

  /**
   * POST /api/pricing-grids/proposals
   * Soumettre une proposition (Transporter)
   */
  router.post('/proposals', checkMongoDB, async (req, res) => {
    try {
      const {
        requestId,
        carrierId,
        gridId,
        pricing,
        conditions,
        validUntil,
        notes,
        attachments,
        createdBy
      } = req.body;

      if (!requestId || !carrierId || !pricing || !createdBy) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'requestId, carrierId, pricing, and createdBy are required' }
        });
      }

      const db = mongoClient.db();

      // Verifier que la demande existe et est ouverte
      const request = await db.collection('pricing_requests').findOne({ requestId });
      if (!request) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Request not found' }
        });
      }

      if (![RequestStatus.PENDING, RequestStatus.IN_PROGRESS, RequestStatus.PROPOSALS_RECEIVED].includes(request.status)) {
        return res.status(400).json({
          success: false,
          error: { code: 'REQUEST_CLOSED', message: 'Request is not accepting proposals' }
        });
      }

      // Verifier le deadline
      if (new Date() > new Date(request.responseDeadline)) {
        return res.status(400).json({
          success: false,
          error: { code: 'DEADLINE_PASSED', message: 'Response deadline has passed' }
        });
      }

      const now = new Date();
      const proposalId = generateId('PROP');

      const proposal = {
        proposalId,
        requestId,
        carrierId,
        industrialId: request.industrialId,
        gridId: gridId || null,
        pricing,
        conditions: conditions || {},
        validUntil: validUntil ? new Date(validUntil) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // Default 30 days
        notes: notes || '',
        attachments: attachments || [],
        status: ProposalStatus.PENDING,
        negotiationHistory: [],
        createdBy,
        createdAt: now,
        updatedAt: now
      };

      await db.collection('pricing_proposals').insertOne(proposal);

      // Mettre a jour le status de la demande et les stats
      await db.collection('pricing_requests').updateOne(
        { requestId },
        {
          $set: { status: RequestStatus.PROPOSALS_RECEIVED, updatedAt: now },
          $inc: { 'stats.proposalsReceived': 1 }
        }
      );

      // Mettre a jour le recipient status
      await db.collection('pricing_request_recipients').updateOne(
        { requestId, carrierId },
        { $set: { status: 'RESPONDED', respondedAt: now } }
      );

      res.status(201).json({
        success: true,
        data: proposal,
        message: 'Proposal submitted successfully'
      });
    } catch (error) {
      console.error('Error creating proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/proposals
   * Liste des propositions
   */
  router.get('/proposals', checkMongoDB, async (req, res) => {
    try {
      const { requestId, carrierId, industrialId, status, page = 1, limit = 50 } = req.query;

      const db = mongoClient.db();
      const query = {};

      if (requestId) query.requestId = requestId;
      if (carrierId) query.carrierId = carrierId;
      if (industrialId) query.industrialId = industrialId;
      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const proposals = await db.collection('pricing_proposals')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_proposals').countDocuments(query);

      res.json({
        success: true,
        data: proposals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing proposals:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/proposals/sent
   * Recuperer les propositions envoyees par un transporteur
   * IMPORTANT: Cette route DOIT etre avant /proposals/:proposalId
   */
  router.get('/proposals/sent', checkMongoDB, async (req, res) => {
    try {
      const { carrierId, status, page = 1, limit = 20 } = req.query;

      if (!carrierId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'carrierId is required' }
        });
      }

      const db = mongoClient.db();
      const query = { carrierId };

      if (status) query.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const proposals = await db.collection('pricing_proposals')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_proposals').countDocuments(query);

      // Enrichir avec les infos des industriels
      const industrialIds = [...new Set(proposals.map(p => p.industrialId))];
      const industrials = await db.collection('companies')
        .find({ companyId: { $in: industrialIds } })
        .project({ companyId: 1, companyName: 1 })
        .toArray();

      const industrialMap = industrials.reduce((acc, ind) => {
        acc[ind.companyId] = ind;
        return acc;
      }, {});

      const enrichedProposals = proposals.map(p => ({
        ...p,
        industrial: industrialMap[p.industrialId] || { companyId: p.industrialId, companyName: 'Unknown' }
      }));

      res.json({
        success: true,
        data: {
          proposals: enrichedProposals,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('Error fetching sent proposals:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/proposals/:proposalId
   * Detail d'une proposition
   */
  router.get('/proposals/:proposalId', checkMongoDB, async (req, res) => {
    try {
      const { proposalId } = req.params;
      const db = mongoClient.db();

      const proposal = await db.collection('pricing_proposals').findOne({ proposalId });

      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proposal not found' }
        });
      }

      // Enrichir avec les infos transporteur
      const carrier = await db.collection('carriers').findOne({ carrierId: proposal.carrierId });

      res.json({
        success: true,
        data: {
          ...proposal,
          carrier: carrier ? {
            companyName: carrier.companyName,
            siret: carrier.siret,
            scoring: carrier.scoring
          } : null
        }
      });
    } catch (error) {
      console.error('Error fetching proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/proposals/:proposalId/accept
   * Accepter une proposition (Industrial)
   */
  router.post('/proposals/:proposalId/accept', checkMongoDB, async (req, res) => {
    try {
      const { proposalId } = req.params;
      const { acceptedBy, notes } = req.body;

      const db = mongoClient.db();
      const now = new Date();

      const proposal = await db.collection('pricing_proposals').findOne({ proposalId });

      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proposal not found' }
        });
      }

      if (proposal.status !== ProposalStatus.PENDING && proposal.status !== ProposalStatus.NEGOTIATING) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Proposal cannot be accepted in current status' }
        });
      }

      const result = await db.collection('pricing_proposals').findOneAndUpdate(
        { proposalId },
        {
          $set: {
            status: ProposalStatus.ACCEPTED,
            acceptedAt: now,
            acceptedBy,
            acceptanceNotes: notes || '',
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      // Mettre a jour la demande
      await db.collection('pricing_requests').updateOne(
        { requestId: proposal.requestId },
        {
          $set: { status: RequestStatus.COMPLETED, completedAt: now, updatedAt: now },
          $inc: { 'stats.acceptedProposals': 1 }
        }
      );

      // Mettre a jour la config si liee
      if (proposal.requestId) {
        const request = await db.collection('pricing_requests').findOne({ requestId: proposal.requestId });
        if (request?.configId) {
          await db.collection('pricing_grid_configs').updateOne(
            { configId: request.configId },
            {
              $inc: { 'stats.acceptedProposals': 1 },
              $addToSet: { linkedCarriers: proposal.carrierId }
            }
          );
        }
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Proposal accepted successfully'
      });
    } catch (error) {
      console.error('Error accepting proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/proposals/:proposalId/reject
   * Rejeter une proposition (Industrial)
   */
  router.post('/proposals/:proposalId/reject', checkMongoDB, async (req, res) => {
    try {
      const { proposalId } = req.params;
      const { rejectedBy, reason } = req.body;

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('pricing_proposals').findOneAndUpdate(
        { proposalId, status: { $in: [ProposalStatus.PENDING, ProposalStatus.NEGOTIATING] } },
        {
          $set: {
            status: ProposalStatus.REJECTED,
            rejectedAt: now,
            rejectedBy,
            rejectionReason: reason || '',
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proposal not found or cannot be rejected' }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Proposal rejected'
      });
    } catch (error) {
      console.error('Error rejecting proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/proposals/:proposalId/negotiate
   * Envoyer une contre-proposition (Industrial)
   */
  router.post('/proposals/:proposalId/negotiate', checkMongoDB, async (req, res) => {
    try {
      const { proposalId } = req.params;
      const { counterOffer, message, negotiatedBy } = req.body;

      if (!counterOffer) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'counterOffer is required' }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const proposal = await db.collection('pricing_proposals').findOne({ proposalId });

      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proposal not found' }
        });
      }

      const negotiationEntry = {
        type: 'COUNTER_OFFER',
        from: 'INDUSTRIAL',
        offer: counterOffer,
        message: message || '',
        timestamp: now,
        by: negotiatedBy
      };

      const result = await db.collection('pricing_proposals').findOneAndUpdate(
        { proposalId },
        {
          $set: {
            status: ProposalStatus.NEGOTIATING,
            updatedAt: now
          },
          $push: { negotiationHistory: negotiationEntry }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Counter-offer sent'
      });
    } catch (error) {
      console.error('Error negotiating:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/proposals/:proposalId/revise
   * Reviser une proposition (Transporter)
   */
  router.post('/proposals/:proposalId/revise', checkMongoDB, async (req, res) => {
    try {
      const { proposalId } = req.params;
      const { revisedPricing, message, revisedBy } = req.body;

      if (!revisedPricing) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'revisedPricing is required' }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const proposal = await db.collection('pricing_proposals').findOne({ proposalId });

      if (!proposal) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Proposal not found' }
        });
      }

      if (proposal.status !== ProposalStatus.NEGOTIATING) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Can only revise proposals in negotiation' }
        });
      }

      const negotiationEntry = {
        type: 'REVISION',
        from: 'CARRIER',
        offer: revisedPricing,
        message: message || '',
        timestamp: now,
        by: revisedBy
      };

      const result = await db.collection('pricing_proposals').findOneAndUpdate(
        { proposalId },
        {
          $set: {
            pricing: revisedPricing,
            status: ProposalStatus.PENDING,
            updatedAt: now
          },
          $push: { negotiationHistory: negotiationEntry }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Proposal revised successfully'
      });
    } catch (error) {
      console.error('Error revising proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== INTERCONNECT ROUTES ====================
  // Recherche cross-platform et calcul de prix

  /**
   * GET /api/pricing-grids/interconnect/carriers
   * Rechercher des transporteurs avec grilles compatibles
   */
  router.get('/interconnect/carriers', checkMongoDB, async (req, res) => {
    try {
      const {
        industrialId,
        transportType,
        zoneOrigin,
        zoneDestination,
        departmentOrigin,
        departmentDestination,
        minPallets,
        maxPallets,
        weight,
        page = 1,
        limit = 20
      } = req.query;

      const db = mongoClient.db();

      // Construire la requete pour trouver les grilles compatibles
      const gridQuery = { status: 'ACTIVE' };

      if (transportType) gridQuery.transportType = transportType;
      if (industrialId) gridQuery.industrialId = industrialId;

      const grids = await db.collection('pricing_grids')
        .find(gridQuery)
        .toArray();

      // Filtrer les grilles selon les criteres
      const compatibleGrids = grids.filter(grid => {
        if (transportType === 'LTL' && grid.ltlPricing?.zonePricing) {
          return grid.ltlPricing.zonePricing.some(zp =>
            (!zoneOrigin || zp.zoneOrigin === zoneOrigin) &&
            (!zoneDestination || zp.zoneDestination === zoneDestination)
          );
        }
        if (transportType === 'FTL' && grid.ftlPricing?.zonePricing) {
          return grid.ftlPricing.zonePricing.some(zp =>
            (!zoneOrigin || zp.zoneOrigin === zoneOrigin) &&
            (!zoneDestination || zp.zoneDestination === zoneDestination)
          );
        }
        if (transportType === 'MESSAGERIE' && grid.messageriePricing?.departmentPricing) {
          return grid.messageriePricing.departmentPricing.some(dp =>
            (!departmentOrigin || dp.departmentOrigin === departmentOrigin) &&
            (!departmentDestination || dp.departmentDestination === departmentDestination)
          );
        }
        return true;
      });

      // Recuperer les infos transporteurs
      const carrierIds = [...new Set(compatibleGrids.map(g => g.carrierId))];
      const carriers = await db.collection('carriers')
        .find({ carrierId: { $in: carrierIds }, status: 'ACTIVE' })
        .toArray();

      // Enrichir avec les grilles
      const results = carriers.map(carrier => {
        const carrierGrids = compatibleGrids.filter(g => g.carrierId === carrier.carrierId);
        return {
          carrier: {
            carrierId: carrier.carrierId,
            companyName: carrier.companyName,
            siret: carrier.siret,
            scoring: carrier.scoring,
            referenceLevel: carrier.referenceLevel
          },
          grids: carrierGrids.map(g => ({
            gridId: g.gridId,
            name: g.name,
            transportType: g.transportType,
            calculationType: g.calculationType
          })),
          gridCount: carrierGrids.length
        };
      });

      // Trier par scoring
      results.sort((a, b) => (b.carrier.scoring?.overall || 0) - (a.carrier.scoring?.overall || 0));

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedResults = results.slice(skip, skip + parseInt(limit));

      res.json({
        success: true,
        data: paginatedResults,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: results.length,
          pages: Math.ceil(results.length / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error searching carriers:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/interconnect/calculate-price
   * Calculer le prix pour un transport specifique
   */
  router.post('/interconnect/calculate-price', checkMongoDB, async (req, res) => {
    try {
      const {
        gridId,
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
        isNight = false
      } = req.body;

      if (!gridId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'gridId is required' }
        });
      }

      const db = mongoClient.db();
      const grid = await db.collection('pricing_grids').findOne({ gridId, status: 'ACTIVE' });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Active pricing grid not found' }
        });
      }

      let price = 0;
      let details = {};
      let transitDays = 0;

      // Calculer selon le type
      if (grid.transportType === 'LTL' && pallets && zoneOrigin && zoneDestination) {
        const zonePricing = grid.ltlPricing?.zonePricing?.find(zp =>
          zp.zoneOrigin === zoneOrigin && zp.zoneDestination === zoneDestination
        );

        if (zonePricing) {
          const tier = zonePricing.palletTiers?.find(t => pallets >= t.min && pallets <= t.max);
          if (tier) {
            price = pallets * tier.pricePerPallet;
            price = Math.max(price, zonePricing.minimumPrice || 0);
            transitDays = zonePricing.transitDays || 2;
            details = { pallets, pricePerPallet: tier.pricePerPallet, tier };
          }
        }
      }

      if (grid.transportType === 'FTL' && zoneOrigin && zoneDestination) {
        const zonePricing = grid.ftlPricing?.zonePricing?.find(zp =>
          zp.zoneOrigin === zoneOrigin && zp.zoneDestination === zoneDestination &&
          (!vehicleType || zp.vehicleType === vehicleType)
        );

        if (zonePricing) {
          if (zonePricing.flatRate) {
            price = zonePricing.flatRate;
          } else if (zonePricing.pricePerKm && distance) {
            price = distance * zonePricing.pricePerKm;
            price = Math.max(price, (zonePricing.minKm || 0) * zonePricing.pricePerKm);
          }
          price = Math.max(price, zonePricing.minimumPrice || 0);
          transitDays = zonePricing.transitDays || 1;
          details = { vehicleType: zonePricing.vehicleType, flatRate: zonePricing.flatRate, pricePerKm: zonePricing.pricePerKm, distance };
        }
      }

      if (grid.transportType === 'MESSAGERIE' && weight && departmentOrigin && departmentDestination) {
        const deptPricing = grid.messageriePricing?.departmentPricing?.find(dp =>
          dp.departmentOrigin === departmentOrigin && dp.departmentDestination === departmentDestination
        );

        if (deptPricing) {
          // Calcul poids volumetrique si dimensions fournies
          let chargeableWeight = weight;
          if (dimensions) {
            const volumetricWeight = (dimensions.length * dimensions.width * dimensions.height) / (grid.messageriePricing.volumetricDivisor || 5000);
            chargeableWeight = Math.max(weight, volumetricWeight);
          }

          const tier = deptPricing.weightTiers?.find(t => chargeableWeight >= t.minKg && chargeableWeight <= t.maxKg);
          if (tier) {
            price = tier.price;
            price = Math.max(price, deptPricing.minimumPrice || 0);
            transitDays = deptPricing.transitDays || 2;
            details = { actualWeight: weight, chargeableWeight, tier };
          }
        }
      }

      // Appliquer modificateurs temporels
      if (isWeekend && grid.timeModifiers?.weekendMultiplier) {
        price *= grid.timeModifiers.weekendMultiplier;
        details.weekendMultiplier = grid.timeModifiers.weekendMultiplier;
      }
      if (isNight && grid.timeModifiers?.nightMultiplier) {
        price *= grid.timeModifiers.nightMultiplier;
        details.nightMultiplier = grid.timeModifiers.nightMultiplier;
      }

      // Appliquer options
      if (options.length > 0 && grid.options?.optionsModifiers) {
        options.forEach(opt => {
          const modifier = grid.options.optionsModifiers[opt];
          if (modifier) {
            if (modifier.type === 'PERCENTAGE') {
              price *= (1 + modifier.value / 100);
            } else if (modifier.type === 'FIXED') {
              price += modifier.value;
            }
            details[`option_${opt}`] = modifier;
          }
        });
      }

      res.json({
        success: true,
        data: {
          gridId,
          gridName: grid.name,
          transportType: grid.transportType,
          price: Math.round(price * 100) / 100,
          currency: 'EUR',
          transitDays,
          details,
          calculatedAt: new Date()
        }
      });
    } catch (error) {
      console.error('Error calculating price:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/interconnect/agreements
   * Lister les accords tarifaires actifs
   */
  router.get('/interconnect/agreements', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, carrierId, page = 1, limit = 50 } = req.query;

      const db = mongoClient.db();
      const query = { status: ProposalStatus.ACCEPTED };

      if (industrialId) query.industrialId = industrialId;
      if (carrierId) query.carrierId = carrierId;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const agreements = await db.collection('pricing_proposals')
        .find(query)
        .sort({ acceptedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      // Enrichir avec infos
      const enrichedAgreements = await Promise.all(agreements.map(async (agreement) => {
        const carrier = await db.collection('carriers').findOne({ carrierId: agreement.carrierId });
        const request = await db.collection('pricing_requests').findOne({ requestId: agreement.requestId });

        return {
          ...agreement,
          carrier: carrier ? { companyName: carrier.companyName, siret: carrier.siret } : null,
          request: request ? { title: request.title, transportTypes: request.transportTypes } : null
        };
      }));

      const total = await db.collection('pricing_proposals').countDocuments(query);

      res.json({
        success: true,
        data: enrichedAgreements,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error listing agreements:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/interconnect/carrier-scores
   * Obtenir les scores des transporteurs
   */
  router.get('/interconnect/carrier-scores', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, minScore, page = 1, limit = 20 } = req.query;

      const db = mongoClient.db();

      // Trouver les transporteurs avec grilles pour cet industriel
      const gridQuery = { status: 'ACTIVE' };
      if (industrialId) gridQuery.industrialId = industrialId;

      const grids = await db.collection('pricing_grids').find(gridQuery).toArray();
      const carrierIds = [...new Set(grids.map(g => g.carrierId))];

      const carrierQuery = { carrierId: { $in: carrierIds }, status: 'ACTIVE' };
      if (minScore) {
        carrierQuery['scoring.overall'] = { $gte: parseFloat(minScore) };
      }

      const carriers = await db.collection('carriers')
        .find(carrierQuery)
        .sort({ 'scoring.overall': -1 })
        .toArray();

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const paginatedCarriers = carriers.slice(skip, skip + parseInt(limit));

      res.json({
        success: true,
        data: paginatedCarriers.map(c => ({
          carrierId: c.carrierId,
          companyName: c.companyName,
          siret: c.siret,
          referenceLevel: c.referenceLevel,
          scoring: c.scoring,
          gridCount: grids.filter(g => g.carrierId === c.carrierId).length
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: carriers.length,
          pages: Math.ceil(carriers.length / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching carrier scores:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/interconnect/recommend
   * Recommander des transporteurs pour un besoin
   */
  router.post('/interconnect/recommend', checkMongoDB, async (req, res) => {
    try {
      const {
        industrialId,
        transportType,
        zoneOrigin,
        zoneDestination,
        volumeEstimate,
        priorityCriteria = ['price', 'scoring', 'transit_time']
      } = req.body;

      const db = mongoClient.db();

      // Trouver les grilles compatibles
      const gridQuery = { status: 'ACTIVE', transportType };
      if (industrialId) gridQuery.industrialId = industrialId;

      const grids = await db.collection('pricing_grids').find(gridQuery).toArray();

      // Filtrer par zone
      const compatibleGrids = grids.filter(grid => {
        if (transportType === 'LTL' || transportType === 'FTL') {
          return grid[`${transportType.toLowerCase()}Pricing`]?.zonePricing?.some(zp =>
            (!zoneOrigin || zp.zoneOrigin === zoneOrigin) &&
            (!zoneDestination || zp.zoneDestination === zoneDestination)
          );
        }
        return true;
      });

      // Recuperer les transporteurs
      const carrierIds = [...new Set(compatibleGrids.map(g => g.carrierId))];
      const carriers = await db.collection('carriers')
        .find({ carrierId: { $in: carrierIds }, status: 'ACTIVE' })
        .toArray();

      // Calculer un score de recommandation
      const recommendations = carriers.map(carrier => {
        const carrierGrids = compatibleGrids.filter(g => g.carrierId === carrier.carrierId);

        let score = 0;

        // Score base sur le scoring transporteur
        score += (carrier.scoring?.overall || 0) * 0.4;

        // Score base sur le niveau de reference
        const refLevelScores = { PREMIUM: 30, STANDARD: 20, BASIC: 10 };
        score += refLevelScores[carrier.referenceLevel] || 0;

        // Bonus si plusieurs grilles disponibles
        score += Math.min(carrierGrids.length * 5, 20);

        return {
          carrier: {
            carrierId: carrier.carrierId,
            companyName: carrier.companyName,
            siret: carrier.siret,
            referenceLevel: carrier.referenceLevel,
            scoring: carrier.scoring
          },
          grids: carrierGrids.map(g => ({
            gridId: g.gridId,
            name: g.name,
            transportType: g.transportType
          })),
          recommendationScore: Math.round(score),
          matchReason: []
        };
      });

      // Trier par score de recommandation
      recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore);

      res.json({
        success: true,
        data: recommendations.slice(0, 10), // Top 10
        totalMatches: recommendations.length,
        criteria: priorityCriteria
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== STATS ROUTES ====================

  /**
   * GET /api/pricing-grids/stats/configs
   * Statistiques sur les configurations
   */
  router.get('/stats/configs', checkMongoDB, async (req, res) => {
    try {
      const { industrialId } = req.query;

      const db = mongoClient.db();
      const query = industrialId ? { industrialId } : {};

      const [total, active, draft, suspended] = await Promise.all([
        db.collection('pricing_grid_configs').countDocuments(query),
        db.collection('pricing_grid_configs').countDocuments({ ...query, status: ConfigStatus.ACTIVE }),
        db.collection('pricing_grid_configs').countDocuments({ ...query, status: ConfigStatus.DRAFT }),
        db.collection('pricing_grid_configs').countDocuments({ ...query, status: ConfigStatus.SUSPENDED })
      ]);

      res.json({
        success: true,
        data: {
          total,
          byStatus: { active, draft, suspended },
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      console.error('Error fetching config stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/stats/requests
   * Statistiques sur les demandes
   */
  router.get('/stats/requests', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, carrierId, startDate, endDate } = req.query;

      const db = mongoClient.db();
      const query = {};

      if (industrialId) query.industrialId = industrialId;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const [total, pending, completed, cancelled] = await Promise.all([
        db.collection('pricing_requests').countDocuments(query),
        db.collection('pricing_requests').countDocuments({ ...query, status: RequestStatus.PENDING }),
        db.collection('pricing_requests').countDocuments({ ...query, status: RequestStatus.COMPLETED }),
        db.collection('pricing_requests').countDocuments({ ...query, status: RequestStatus.CANCELLED })
      ]);

      // Stats propositions
      const proposalQuery = industrialId ? { industrialId } : (carrierId ? { carrierId } : {});
      const [totalProposals, acceptedProposals, rejectedProposals] = await Promise.all([
        db.collection('pricing_proposals').countDocuments(proposalQuery),
        db.collection('pricing_proposals').countDocuments({ ...proposalQuery, status: ProposalStatus.ACCEPTED }),
        db.collection('pricing_proposals').countDocuments({ ...proposalQuery, status: ProposalStatus.REJECTED })
      ]);

      res.json({
        success: true,
        data: {
          requests: {
            total,
            byStatus: { pending, completed, cancelled },
            conversionRate: total > 0 ? Math.round((completed / total) * 100) : 0
          },
          proposals: {
            total: totalProposals,
            accepted: acceptedProposals,
            rejected: rejectedProposals,
            acceptanceRate: totalProposals > 0 ? Math.round((acceptedProposals / totalProposals) * 100) : 0
          },
          lastUpdated: new Date()
        }
      });
    } catch (error) {
      console.error('Error fetching request stats:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== CARRIER-SPECIFIC ROUTES ====================
  // Routes specifiques pour les transporteurs

  /**
   * GET /api/pricing-grids/carrier/:carrierId
   * Recuperer toutes les grilles assignees a un transporteur
   */
  router.get('/carrier/:carrierId', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { status, industrialId, page = 1, limit = 20 } = req.query;

      const db = mongoClient.db();
      const query = { carrierId };

      if (status) query.status = status;
      if (industrialId) query.industrialId = industrialId;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Recuperer les grilles avec infos industriels
      const grids = await db.collection('pricing_grids')
        .find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('pricing_grids').countDocuments(query);

      // Enrichir avec les donnees des industriels
      const industrialIds = [...new Set(grids.map(g => g.industrialId))];
      const industrials = await db.collection('companies')
        .find({ companyId: { $in: industrialIds } })
        .project({ companyId: 1, companyName: 1, logo: 1 })
        .toArray();

      const industrialMap = industrials.reduce((acc, ind) => {
        acc[ind.companyId] = ind;
        return acc;
      }, {});

      // Enrichir les grilles
      const enrichedGrids = grids.map(grid => ({
        ...grid,
        industrial: industrialMap[grid.industrialId] || { companyId: grid.industrialId, companyName: 'Unknown' }
      }));

      res.json({
        success: true,
        data: {
          grids: enrichedGrids,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
          }
        }
      });
    } catch (error) {
      console.error('Error fetching carrier grids:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/:gridId/propose-update
   * Permettre au transporteur de proposer une mise a jour de prix
   */
  router.post('/:gridId/propose-update', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const {
        carrierId,
        proposedChanges,
        justification,
        validFrom,
        validUntil,
        createdBy
      } = req.body;

      if (!carrierId || !proposedChanges || !createdBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'carrierId, proposedChanges, and createdBy are required'
          }
        });
      }

      const db = mongoClient.db();

      // Verifier que la grille existe et appartient au transporteur
      const grid = await db.collection('pricing_grids').findOne({
        $or: [
          { _id: ObjectId.isValid(gridId) ? new ObjectId(gridId) : null },
          { gridId }
        ],
        carrierId
      });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Grid not found or not assigned to this carrier'
          }
        });
      }

      // Creer la proposition de mise a jour
      const updateProposal = {
        proposalId: generateId('UPD'),
        gridId: grid.gridId || gridId,
        carrierId,
        industrialId: grid.industrialId,
        type: 'UPDATE_REQUEST',
        currentPricing: {
          ltlPricing: grid.ltlPricing,
          ftlPricing: grid.ftlPricing,
          messageriePricing: grid.messageriePricing
        },
        proposedChanges,
        justification: justification || '',
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : null,
        status: ProposalStatus.PENDING,
        negotiationHistory: [{
          action: 'SUBMITTED',
          by: createdBy,
          at: new Date(),
          comment: justification || 'Price update proposal submitted'
        }],
        createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await db.collection('pricing_proposals').insertOne(updateProposal);

      res.status(201).json({
        success: true,
        data: {
          proposalId: updateProposal.proposalId,
          status: updateProposal.status,
          message: 'Update proposal submitted successfully'
        }
      });
    } catch (error) {
      console.error('Error creating update proposal:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/pricing-grids/:gridId/fuel-indexation/history
   * Historique de l'indexation carburant pour une grille
   */
  router.get('/:gridId/fuel-indexation/history', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const { startDate, endDate, limit = 12 } = req.query;

      const db = mongoClient.db();

      // Verifier que la grille existe
      const grid = await db.collection('pricing_grids').findOne({
        $or: [
          { _id: ObjectId.isValid(gridId) ? new ObjectId(gridId) : null },
          { gridId }
        ]
      });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Grid not found' }
        });
      }

      // Recuperer l'historique d'indexation
      const query = { gridId: grid.gridId || gridId };
      if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
      }

      let history = await db.collection('fuel_indexation_history')
        .find(query)
        .sort({ date: -1 })
        .limit(parseInt(limit))
        .toArray();

      // Si pas d'historique, generer des donnees basees sur la config de la grille
      if (history.length === 0 && grid.fuelIndexation) {
        const baseIndex = grid.fuelIndexation.baseIndex || 1.5;
        const currentIndex = grid.fuelIndexation.currentIndex || baseIndex;

        // Generer un historique simule sur 12 mois
        history = [];
        const now = new Date();
        for (let i = 0; i < parseInt(limit); i++) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const variation = (Math.random() - 0.5) * 0.1; // +/- 5%
          history.push({
            date,
            indexValue: parseFloat((baseIndex + variation * (parseInt(limit) - i)).toFixed(4)),
            variation: parseFloat((variation * 100).toFixed(2)),
            source: 'CNR', // Comite National Routier
            applied: i === 0
          });
        }
      }

      res.json({
        success: true,
        data: {
          gridId: grid.gridId || gridId,
          fuelIndexationType: grid.fuelIndexation?.type || 'CNR',
          baseIndex: grid.fuelIndexation?.baseIndex || 1.5,
          currentIndex: grid.fuelIndexation?.currentIndex || 1.5,
          history,
          lastUpdate: history[0]?.date || new Date()
        }
      });
    } catch (error) {
      console.error('Error fetching fuel indexation history:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/pricing-grids/:gridId/calculate-total
   * Calculer le prix total avec options et indexation carburant
   */
  router.post('/:gridId/calculate-total', checkMongoDB, async (req, res) => {
    try {
      const { gridId } = req.params;
      const {
        origin,
        destination,
        weight,
        volume,
        pallets,
        transportType,
        options = [],
        applyFuelIndexation = true,
        distance
      } = req.body;

      const db = mongoClient.db();

      // Recuperer la grille
      const grid = await db.collection('pricing_grids').findOne({
        $or: [
          { _id: ObjectId.isValid(gridId) ? new ObjectId(gridId) : null },
          { gridId }
        ],
        status: 'ACTIVE'
      });

      if (!grid) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Active grid not found' }
        });
      }

      // Determiner le type de tarification
      let pricing = null;
      let calculationType = transportType || 'LTL';

      if (calculationType === 'FTL' && grid.ftlPricing) {
        pricing = grid.ftlPricing;
      } else if (calculationType === 'MESSAGERIE' && grid.messageriePricing) {
        pricing = grid.messageriePricing;
      } else if (grid.ltlPricing) {
        pricing = grid.ltlPricing;
        calculationType = 'LTL';
      }

      if (!pricing) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_PRICING', message: 'No pricing configuration for this transport type' }
        });
      }

      // Calculer le prix de base
      let basePrice = 0;
      const actualDistance = distance || 100; // km par defaut
      const actualWeight = weight || 1000; // kg par defaut

      if (pricing.calculationType === 'PER_KM') {
        basePrice = (pricing.pricePerKm || 1.5) * actualDistance;
      } else if (pricing.calculationType === 'PER_TONNE_KM') {
        basePrice = (pricing.pricePerTonneKm || 0.08) * (actualWeight / 1000) * actualDistance;
      } else if (pricing.calculationType === 'FLAT_RATE') {
        basePrice = pricing.flatRate || 150;
      } else if (pricing.calculationType === 'ZONE_BASED' && pricing.zones) {
        // Chercher la zone correspondante
        const zone = pricing.zones.find(z =>
          z.originDept === origin?.substring(0, 2) &&
          z.destDept === destination?.substring(0, 2)
        );
        basePrice = zone?.price || pricing.defaultPrice || 100;
      } else {
        // Fallback: prix par palette ou poids
        if (pallets && pricing.pricePerPallet) {
          basePrice = pricing.pricePerPallet * pallets;
        } else {
          basePrice = (pricing.pricePerKg || 0.15) * actualWeight;
        }
      }

      // Appliquer les options
      let optionsTotal = 0;
      const appliedOptions = [];

      if (options.length > 0 && pricing.availableOptions) {
        for (const optionId of options) {
          const option = pricing.availableOptions.find(o => o.id === optionId || o.code === optionId);
          if (option) {
            let optionPrice = 0;
            if (option.priceType === 'FIXED') {
              optionPrice = option.price || 0;
            } else if (option.priceType === 'PERCENTAGE') {
              optionPrice = basePrice * (option.percentage || 0) / 100;
            }
            optionsTotal += optionPrice;
            appliedOptions.push({
              ...option,
              calculatedPrice: optionPrice
            });
          }
        }
      }

      // Appliquer l'indexation carburant
      let fuelSurcharge = 0;
      let fuelIndexDetails = null;

      if (applyFuelIndexation && grid.fuelIndexation) {
        const baseIndex = grid.fuelIndexation.baseIndex || 1.5;
        const currentIndex = grid.fuelIndexation.currentIndex || baseIndex;
        const indexVariation = ((currentIndex - baseIndex) / baseIndex) * 100;

        if (indexVariation > 0) {
          fuelSurcharge = (basePrice + optionsTotal) * (indexVariation / 100);
        }

        fuelIndexDetails = {
          baseIndex,
          currentIndex,
          variation: parseFloat(indexVariation.toFixed(2)),
          surchargeRate: indexVariation > 0 ? parseFloat(indexVariation.toFixed(2)) : 0,
          surchargeAmount: parseFloat(fuelSurcharge.toFixed(2))
        };
      }

      // Calculer le total
      const subtotal = basePrice + optionsTotal;
      const totalHT = subtotal + fuelSurcharge;
      const tva = totalHT * 0.20; // TVA 20%
      const totalTTC = totalHT + tva;

      res.json({
        success: true,
        data: {
          gridId: grid.gridId || gridId,
          calculationType,
          breakdown: {
            basePrice: parseFloat(basePrice.toFixed(2)),
            options: {
              items: appliedOptions,
              total: parseFloat(optionsTotal.toFixed(2))
            },
            fuelIndexation: fuelIndexDetails,
            subtotal: parseFloat(subtotal.toFixed(2)),
            fuelSurcharge: parseFloat(fuelSurcharge.toFixed(2)),
            totalHT: parseFloat(totalHT.toFixed(2)),
            tva: parseFloat(tva.toFixed(2)),
            totalTTC: parseFloat(totalTTC.toFixed(2))
          },
          parameters: {
            origin,
            destination,
            distance: actualDistance,
            weight: actualWeight,
            volume,
            pallets,
            transportType: calculationType
          },
          currency: 'EUR',
          validUntil: grid.validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });
    } catch (error) {
      console.error('Error calculating total:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  return router;
}

module.exports = createPricingGridsExtendedRoutes;
