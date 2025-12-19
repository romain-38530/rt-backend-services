/**
 * SYMPHONI.A - Pricing Grids API
 * Gestion des grilles tarifaires personnalisées et demandes de tarifs
 *
 * Ce service permet aux industriels de:
 * - Créer des configurations de grilles tarifaires
 * - Joindre des fichiers (Excel, PDF) à envoyer aux transporteurs
 * - Envoyer des demandes de tarifs aux transporteurs
 * - Recevoir et gérer les propositions tarifaires
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3020;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));

// =============================================================================
// AWS S3 CONFIGURATION
// =============================================================================

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-3'
});

const S3_BUCKET = process.env.S3_BUCKET || 'symphonia-pricing-grids';

// Multer configuration for S3 uploads
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: S3_BUCKET,
    acl: 'private',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const companyId = req.user?.companyId || 'unknown';
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const filename = `${companyId}/attachments/${timestamp}-${uuidv4()}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Formats acceptés: PDF, Excel, CSV'), false);
    }
  }
});

// =============================================================================
// MONGOOSE SCHEMAS
// =============================================================================

// Schema pour les fichiers attachés
const attachedFileSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  type: {
    type: String,
    enum: ['excel', 'pdf', 'csv', 'other'],
    required: true
  },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },

  // S3 storage
  s3Key: { type: String, required: true },
  s3Bucket: { type: String, default: S3_BUCKET },

  // Optional signed URL (generated on demand)
  url: String,
  urlExpiry: Date,

  // Metadata
  description: String,
  category: {
    type: String,
    enum: ['template', 'specifications', 'conditions', 'other'],
    default: 'other'
  },

  // Relations
  companyId: { type: String, required: true, index: true },
  uploadedBy: String,
  uploadedAt: { type: Date, default: Date.now }
});

// Schema pour les zones (départements/régions)
const zoneConfigSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  country: String,
  type: {
    type: String,
    enum: ['department', 'region', 'province', 'land', 'canton', 'county'],
    default: 'department'
  }
}, { _id: false });

// Schema pour les frais additionnels
const feeConfigSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['fixed', 'percentage'], required: true },
  value: { type: Number, required: true },
  description: String,
  mandatory: { type: Boolean, default: false },
  conditions: String
}, { _id: false });

// Schema pour les véhicules
const vehicleConfigSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  category: String,
  capacityMin: Number,
  capacityMax: Number,
  weightMin: Number,
  weightMax: Number,
  description: String
}, { _id: false });

// Schema principal pour la configuration de grille tarifaire
const pricingGridConfigSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Identification
  name: { type: String, required: true },
  description: String,
  version: { type: Number, default: 1 },

  // Relations
  companyId: { type: String, required: true, index: true },
  companyName: String,
  createdBy: String,

  // Statut
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },

  // Configuration des zones
  zonesConfig: {
    type: {
      type: String,
      enum: ['department', 'region', 'custom'],
      default: 'department'
    },
    selectedZonesFrance: [zoneConfigSchema],
    selectedZonesEurope: [zoneConfigSchema]
  },

  // Configuration des frais
  feesConfig: {
    standardFees: [feeConfigSchema],
    customFees: [feeConfigSchema]
  },

  // Configuration des véhicules
  vehiclesConfig: {
    selectedVehicles: [vehicleConfigSchema],
    customVehicles: [vehicleConfigSchema]
  },

  // Fichiers attachés
  attachedFiles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttachedFile'
  }],
  attachedFilesData: [attachedFileSchema],

  // Paramètres additionnels
  settings: {
    currency: { type: String, default: 'EUR' },
    taxRate: { type: Number, default: 20 },
    validityDays: { type: Number, default: 30 },
    minimumOrderValue: Number,
    paymentTermsDays: Number,
    notes: String
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  publishedAt: Date
});

// Schema pour les demandes de tarifs envoyées aux transporteurs
const pricingRequestSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Configuration source
  configId: { type: String, required: true, index: true },
  configName: String,

  // Expéditeur (Industriel)
  senderId: { type: String, required: true, index: true },
  senderCompanyName: String,
  senderContactName: String,
  senderEmail: String,

  // Destinataire (Transporteur)
  carrierId: { type: String, required: true, index: true },
  carrierCompanyName: String,
  carrierContactEmail: String,

  // Contenu de la demande
  message: String,
  zones: [zoneConfigSchema],
  vehicles: [vehicleConfigSchema],
  fees: [feeConfigSchema],

  // Fichiers joints
  attachedFiles: [attachedFileSchema],

  // Dates
  validUntil: Date,
  responseDeadline: Date,

  // Statut
  status: {
    type: String,
    enum: ['pending', 'viewed', 'responded', 'expired', 'cancelled'],
    default: 'pending'
  },
  viewedAt: Date,
  respondedAt: Date,

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema pour les réponses/propositions des transporteurs
const pricingProposalSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Relations
  requestId: { type: String, required: true, index: true },
  configId: { type: String, required: true, index: true },

  // Transporteur
  carrierId: { type: String, required: true, index: true },
  carrierCompanyName: String,
  carrierContactName: String,
  carrierEmail: String,

  // Industriel
  industrialId: { type: String, required: true, index: true },
  industrialCompanyName: String,

  // Contenu de la proposition
  proposedPrices: [{
    zoneOrigin: zoneConfigSchema,
    zoneDestination: zoneConfigSchema,
    vehicleType: String,
    pricePerKm: Number,
    priceFixed: Number,
    minPrice: Number,
    currency: { type: String, default: 'EUR' },
    notes: String
  }],

  // Frais proposés
  proposedFees: [feeConfigSchema],

  // Conditions
  validityDays: Number,
  validFrom: Date,
  validUntil: Date,
  paymentTerms: String,
  conditions: String,
  notes: String,

  // Fichiers joints par le transporteur
  attachedFiles: [attachedFileSchema],

  // Statut
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'negotiating', 'expired'],
    default: 'draft'
  },

  // Historique des négociations
  negotiations: [{
    date: { type: Date, default: Date.now },
    from: String, // 'industrial' ou 'carrier'
    message: String,
    proposedChanges: mongoose.Schema.Types.Mixed
  }],

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  submittedAt: Date,
  reviewedAt: Date
});

// Créer les modèles
const AttachedFile = mongoose.model('AttachedFile', attachedFileSchema);
const PricingGridConfig = mongoose.model('PricingGridConfig', pricingGridConfigSchema);
const PricingRequest = mongoose.model('PricingRequest', pricingRequestSchema);
const PricingProposal = mongoose.model('PricingProposal', pricingProposalSchema);

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'symphonia-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

const requireIndustrial = (req, res, next) => {
  if (req.user?.portal !== 'industry' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux industriels' });
  }
  next();
};

const requireCarrier = (req, res, next) => {
  if (req.user?.portal !== 'transporter' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux transporteurs' });
  }
  next();
};

// =============================================================================
// ROUTES - FICHIERS ATTACHÉS
// =============================================================================

/**
 * POST /files/upload
 * Upload un fichier vers S3
 */
app.post('/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { category, description } = req.body;

    // Déterminer le type de fichier
    let fileType = 'other';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('excel') || req.file.mimetype.includes('spreadsheet')) {
      fileType = 'excel';
    } else if (req.file.mimetype.includes('csv')) {
      fileType = 'csv';
    }

    const attachedFile = new AttachedFile({
      name: req.file.originalname.replace(/\.[^/.]+$/, ''),
      originalName: req.file.originalname,
      type: fileType,
      mimeType: req.file.mimetype,
      size: req.file.size,
      s3Key: req.file.key,
      s3Bucket: S3_BUCKET,
      category: category || 'other',
      description: description || '',
      companyId: req.user.companyId,
      uploadedBy: req.user.id
    });

    await attachedFile.save();

    // Générer une URL signée temporaire
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: S3_BUCKET,
      Key: req.file.key,
      Expires: 3600 // 1 heure
    });

    res.status(201).json({
      file: {
        ...attachedFile.toObject(),
        url: signedUrl
      }
    });
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
  }
});

/**
 * POST /files/upload-multiple
 * Upload plusieurs fichiers
 */
app.post('/files/upload-multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const categories = req.body.categories ? JSON.parse(req.body.categories) : {};
    const descriptions = req.body.descriptions ? JSON.parse(req.body.descriptions) : {};

    const savedFiles = [];

    for (const file of req.files) {
      let fileType = 'other';
      if (file.mimetype === 'application/pdf') {
        fileType = 'pdf';
      } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
        fileType = 'excel';
      } else if (file.mimetype.includes('csv')) {
        fileType = 'csv';
      }

      const attachedFile = new AttachedFile({
        name: file.originalname.replace(/\.[^/.]+$/, ''),
        originalName: file.originalname,
        type: fileType,
        mimeType: file.mimetype,
        size: file.size,
        s3Key: file.key,
        s3Bucket: S3_BUCKET,
        category: categories[file.originalname] || 'other',
        description: descriptions[file.originalname] || '',
        companyId: req.user.companyId,
        uploadedBy: req.user.id
      });

      await attachedFile.save();

      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: file.key,
        Expires: 3600
      });

      savedFiles.push({
        ...attachedFile.toObject(),
        url: signedUrl
      });
    }

    res.status(201).json({ files: savedFiles });
  } catch (error) {
    console.error('Erreur upload fichiers:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload des fichiers' });
  }
});

/**
 * GET /files/:id
 * Récupérer les infos d'un fichier
 */
app.get('/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Vérifier les droits d'accès
    if (file.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Générer une nouvelle URL signée
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: file.s3Bucket,
      Key: file.s3Key,
      Expires: 3600
    });

    res.json({
      ...file.toObject(),
      url: signedUrl
    });
  } catch (error) {
    console.error('Erreur récupération fichier:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du fichier' });
  }
});

/**
 * GET /files/:id/download
 * Télécharger un fichier
 */
app.get('/files/:id/download', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Générer une URL de téléchargement
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: file.s3Bucket,
      Key: file.s3Key,
      Expires: 60,
      ResponseContentDisposition: `attachment; filename="${file.originalName}"`
    });

    res.redirect(signedUrl);
  } catch (error) {
    console.error('Erreur téléchargement fichier:', error);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

/**
 * DELETE /files/:id
 * Supprimer un fichier
 */
app.delete('/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    if (file.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Supprimer de S3
    await s3.deleteObject({
      Bucket: file.s3Bucket,
      Key: file.s3Key
    }).promise();

    // Supprimer de la base
    await AttachedFile.deleteOne({ id: req.params.id });

    res.json({ message: 'Fichier supprimé' });
  } catch (error) {
    console.error('Erreur suppression fichier:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * GET /files
 * Liste des fichiers de l'entreprise
 */
app.get('/files', authenticateToken, async (req, res) => {
  try {
    const { category, type, page = 1, limit = 20 } = req.query;

    const filter = { companyId: req.user.companyId };
    if (category) filter.category = category;
    if (type) filter.type = type;

    const files = await AttachedFile.find(filter)
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await AttachedFile.countDocuments(filter);

    // Ajouter les URLs signées
    const filesWithUrls = files.map(file => ({
      ...file.toObject(),
      url: s3.getSignedUrl('getObject', {
        Bucket: file.s3Bucket,
        Key: file.s3Key,
        Expires: 3600
      })
    }));

    res.json({
      files: filesWithUrls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste fichiers:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des fichiers' });
  }
});

// =============================================================================
// ROUTES - CONFIGURATIONS DE GRILLES TARIFAIRES
// =============================================================================

/**
 * POST /configs
 * Créer une nouvelle configuration de grille tarifaire
 */
app.post('/configs', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const {
      name,
      description,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFiles,
      settings
    } = req.body;

    const config = new PricingGridConfig({
      name,
      description,
      companyId: req.user.companyId,
      companyName: req.user.companyName,
      createdBy: req.user.id,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFilesData: attachedFiles || [],
      settings,
      status: 'draft'
    });

    await config.save();

    res.status(201).json({ config });
  } catch (error) {
    console.error('Erreur création config:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la configuration' });
  }
});

/**
 * GET /configs
 * Liste des configurations de l'entreprise
 */
app.get('/configs', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { companyId: req.user.companyId };
    if (status) filter.status = status;

    const configs = await PricingGridConfig.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingGridConfig.countDocuments(filter);

    res.json({
      configs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste configs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des configurations' });
  }
});

/**
 * GET /configs/:id
 * Détail d'une configuration
 */
app.get('/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    // Vérifier les droits d'accès
    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Ajouter les URLs signées pour les fichiers attachés
    if (config.attachedFilesData && config.attachedFilesData.length > 0) {
      config.attachedFilesData = config.attachedFilesData.map(file => ({
        ...file.toObject ? file.toObject() : file,
        url: file.s3Key ? s3.getSignedUrl('getObject', {
          Bucket: file.s3Bucket || S3_BUCKET,
          Key: file.s3Key,
          Expires: 3600
        }) : null
      }));
    }

    res.json({ config });
  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la configuration' });
  }
});

/**
 * PUT /configs/:id
 * Modifier une configuration
 */
app.put('/configs/:id', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const {
      name,
      description,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFiles,
      settings,
      status
    } = req.body;

    // Mettre à jour les champs
    if (name !== undefined) config.name = name;
    if (description !== undefined) config.description = description;
    if (zonesConfig !== undefined) config.zonesConfig = zonesConfig;
    if (feesConfig !== undefined) config.feesConfig = feesConfig;
    if (vehiclesConfig !== undefined) config.vehiclesConfig = vehiclesConfig;
    if (attachedFiles !== undefined) config.attachedFilesData = attachedFiles;
    if (settings !== undefined) config.settings = settings;
    if (status !== undefined) config.status = status;

    config.updatedAt = new Date();
    config.version += 1;

    if (status === 'active' && !config.publishedAt) {
      config.publishedAt = new Date();
    }

    await config.save();

    res.json({ config });
  } catch (error) {
    console.error('Erreur modification config:', error);
    res.status(500).json({ error: 'Erreur lors de la modification de la configuration' });
  }
});

/**
 * DELETE /configs/:id
 * Supprimer une configuration
 */
app.delete('/configs/:id', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Supprimer les fichiers S3 associés
    if (config.attachedFilesData && config.attachedFilesData.length > 0) {
      for (const file of config.attachedFilesData) {
        if (file.s3Key) {
          try {
            await s3.deleteObject({
              Bucket: file.s3Bucket || S3_BUCKET,
              Key: file.s3Key
            }).promise();
          } catch (err) {
            console.error('Erreur suppression fichier S3:', err);
          }
        }
      }
    }

    await PricingGridConfig.deleteOne({ id: req.params.id });

    res.json({ message: 'Configuration supprimée' });
  } catch (error) {
    console.error('Erreur suppression config:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * POST /configs/:id/duplicate
 * Dupliquer une configuration
 */
app.post('/configs/:id/duplicate', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const original = await PricingGridConfig.findOne({ id: req.params.id });

    if (!original) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (original.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const duplicate = new PricingGridConfig({
      name: `${original.name} (copie)`,
      description: original.description,
      companyId: req.user.companyId,
      companyName: req.user.companyName,
      createdBy: req.user.id,
      zonesConfig: original.zonesConfig,
      feesConfig: original.feesConfig,
      vehiclesConfig: original.vehiclesConfig,
      attachedFilesData: original.attachedFilesData,
      settings: original.settings,
      status: 'draft',
      version: 1
    });

    await duplicate.save();

    res.status(201).json({ config: duplicate });
  } catch (error) {
    console.error('Erreur duplication config:', error);
    res.status(500).json({ error: 'Erreur lors de la duplication' });
  }
});

// =============================================================================
// ROUTES - DEMANDES DE TARIFS
// =============================================================================

/**
 * POST /requests
 * Envoyer une demande de tarif à un transporteur
 */
app.post('/requests', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const {
      configId,
      carrierId,
      carrierCompanyName,
      carrierContactEmail,
      message,
      zones,
      vehicles,
      fees,
      attachedFiles,
      validUntil,
      responseDeadline
    } = req.body;

    // Charger la config si fournie
    let config = null;
    if (configId) {
      config = await PricingGridConfig.findOne({ id: configId });
    }

    const request = new PricingRequest({
      configId: configId || null,
      configName: config?.name || 'Demande personnalisée',
      senderId: req.user.companyId,
      senderCompanyName: req.user.companyName,
      senderContactName: req.user.name,
      senderEmail: req.user.email,
      carrierId,
      carrierCompanyName,
      carrierContactEmail,
      message,
      zones: zones || config?.zonesConfig?.selectedZonesFrance || [],
      vehicles: vehicles || config?.vehiclesConfig?.selectedVehicles || [],
      fees: fees || config?.feesConfig?.standardFees || [],
      attachedFiles: attachedFiles || config?.attachedFilesData || [],
      validUntil: validUntil ? new Date(validUntil) : null,
      responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
      status: 'pending'
    });

    await request.save();

    // TODO: Envoyer notification email au transporteur

    res.status(201).json({ request });
  } catch (error) {
    console.error('Erreur création demande:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la demande' });
  }
});

/**
 * GET /requests/sent
 * Liste des demandes envoyées (industriel)
 */
app.get('/requests/sent', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { senderId: req.user.companyId };
    if (status) filter.status = status;

    const requests = await PricingRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingRequest.countDocuments(filter);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste demandes envoyées:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
});

/**
 * GET /requests/received
 * Liste des demandes reçues (transporteur)
 */
app.get('/requests/received', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { carrierId: req.user.companyId };
    if (status) filter.status = status;

    const requests = await PricingRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingRequest.countDocuments(filter);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste demandes reçues:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
});

/**
 * GET /requests/:id
 * Détail d'une demande
 */
app.get('/requests/:id', authenticateToken, async (req, res) => {
  try {
    const request = await PricingRequest.findOne({ id: req.params.id });

    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    // Vérifier les droits d'accès
    const isAllowed =
      request.senderId === req.user.companyId ||
      request.carrierId === req.user.companyId ||
      req.user.role === 'admin';

    if (!isAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Marquer comme vue si c'est le transporteur
    if (request.carrierId === req.user.companyId && request.status === 'pending') {
      request.status = 'viewed';
      request.viewedAt = new Date();
      await request.save();
    }

    // Ajouter les URLs signées pour les fichiers
    if (request.attachedFiles && request.attachedFiles.length > 0) {
      request.attachedFiles = request.attachedFiles.map(file => ({
        ...file.toObject ? file.toObject() : file,
        url: file.s3Key ? s3.getSignedUrl('getObject', {
          Bucket: file.s3Bucket || S3_BUCKET,
          Key: file.s3Key,
          Expires: 3600
        }) : null
      }));
    }

    res.json({ request });
  } catch (error) {
    console.error('Erreur récupération demande:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la demande' });
  }
});

/**
 * POST /requests/:id/cancel
 * Annuler une demande
 */
app.post('/requests/:id/cancel', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const request = await PricingRequest.findOne({ id: req.params.id });

    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (request.senderId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    request.status = 'cancelled';
    request.updatedAt = new Date();
    await request.save();

    res.json({ message: 'Demande annulée', request });
  } catch (error) {
    console.error('Erreur annulation demande:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

// =============================================================================
// ROUTES - PROPOSITIONS / RÉPONSES
// =============================================================================

/**
 * POST /proposals
 * Créer une proposition tarifaire (transporteur)
 */
app.post('/proposals', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const {
      requestId,
      proposedPrices,
      proposedFees,
      validityDays,
      validFrom,
      validUntil,
      paymentTerms,
      conditions,
      notes,
      attachedFiles
    } = req.body;

    // Charger la demande
    const request = await PricingRequest.findOne({ id: requestId });
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (request.carrierId !== req.user.companyId) {
      return res.status(403).json({ error: 'Vous ne pouvez pas répondre à cette demande' });
    }

    const proposal = new PricingProposal({
      requestId,
      configId: request.configId,
      carrierId: req.user.companyId,
      carrierCompanyName: req.user.companyName,
      carrierContactName: req.user.name,
      carrierEmail: req.user.email,
      industrialId: request.senderId,
      industrialCompanyName: request.senderCompanyName,
      proposedPrices,
      proposedFees,
      validityDays,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      paymentTerms,
      conditions,
      notes,
      attachedFiles: attachedFiles || [],
      status: 'draft'
    });

    await proposal.save();

    res.status(201).json({ proposal });
  } catch (error) {
    console.error('Erreur création proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la proposition' });
  }
});

/**
 * POST /proposals/:id/submit
 * Soumettre une proposition
 */
app.post('/proposals/:id/submit', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.carrierId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'submitted';
    proposal.submittedAt = new Date();
    proposal.updatedAt = new Date();
    await proposal.save();

    // Mettre à jour le statut de la demande
    await PricingRequest.updateOne(
      { id: proposal.requestId },
      { status: 'responded', respondedAt: new Date(), updatedAt: new Date() }
    );

    // TODO: Envoyer notification à l'industriel

    res.json({ message: 'Proposition soumise', proposal });
  } catch (error) {
    console.error('Erreur soumission proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission' });
  }
});

/**
 * GET /proposals/sent
 * Propositions envoyées (transporteur)
 */
app.get('/proposals/sent', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { carrierId: req.user.companyId };
    if (status) filter.status = status;

    const proposals = await PricingProposal.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingProposal.countDocuments(filter);

    res.json({
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste propositions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des propositions' });
  }
});

/**
 * GET /proposals/received
 * Propositions reçues (industriel)
 */
app.get('/proposals/received', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { status, requestId, page = 1, limit = 20 } = req.query;

    const filter = { industrialId: req.user.companyId };
    if (status) filter.status = status;
    if (requestId) filter.requestId = requestId;

    const proposals = await PricingProposal.find(filter)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingProposal.countDocuments(filter);

    res.json({
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste propositions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des propositions' });
  }
});

/**
 * GET /proposals/:id
 * Détail d'une proposition
 */
app.get('/proposals/:id', authenticateToken, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    const isAllowed =
      proposal.carrierId === req.user.companyId ||
      proposal.industrialId === req.user.companyId ||
      req.user.role === 'admin';

    if (!isAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Marquer comme en cours de revue si c'est l'industriel
    if (proposal.industrialId === req.user.companyId && proposal.status === 'submitted') {
      proposal.status = 'under_review';
      proposal.reviewedAt = new Date();
      await proposal.save();
    }

    res.json({ proposal });
  } catch (error) {
    console.error('Erreur récupération proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la proposition' });
  }
});

/**
 * POST /proposals/:id/accept
 * Accepter une proposition (industriel)
 */
app.post('/proposals/:id/accept', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.industrialId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'accepted';
    proposal.updatedAt = new Date();
    await proposal.save();

    // TODO: Envoyer notification au transporteur
    // TODO: Créer un contrat/accord basé sur la proposition

    res.json({ message: 'Proposition acceptée', proposal });
  } catch (error) {
    console.error('Erreur acceptation proposition:', error);
    res.status(500).json({ error: 'Erreur lors de l\'acceptation' });
  }
});

/**
 * POST /proposals/:id/reject
 * Rejeter une proposition (industriel)
 */
app.post('/proposals/:id/reject', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { reason } = req.body;

    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.industrialId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'rejected';
    proposal.updatedAt = new Date();

    if (reason) {
      proposal.negotiations.push({
        date: new Date(),
        from: 'industrial',
        message: `Proposition refusée: ${reason}`
      });
    }

    await proposal.save();

    // TODO: Envoyer notification au transporteur

    res.json({ message: 'Proposition refusée', proposal });
  } catch (error) {
    console.error('Erreur refus proposition:', error);
    res.status(500).json({ error: 'Erreur lors du refus' });
  }
});

/**
 * POST /proposals/:id/negotiate
 * Ajouter un message de négociation
 */
app.post('/proposals/:id/negotiate', authenticateToken, async (req, res) => {
  try {
    const { message, proposedChanges } = req.body;

    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    const isCarrier = proposal.carrierId === req.user.companyId;
    const isIndustrial = proposal.industrialId === req.user.companyId;

    if (!isCarrier && !isIndustrial) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'negotiating';
    proposal.negotiations.push({
      date: new Date(),
      from: isIndustrial ? 'industrial' : 'carrier',
      message,
      proposedChanges
    });
    proposal.updatedAt = new Date();

    await proposal.save();

    // TODO: Envoyer notification à l'autre partie

    res.json({ message: 'Message envoyé', proposal });
  } catch (error) {
    console.error('Erreur négociation:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

// =============================================================================
// ROUTES - STATISTIQUES
// =============================================================================

/**
 * GET /stats/configs
 * Statistiques des configurations
 */
app.get('/stats/configs', authenticateToken, async (req, res) => {
  try {
    const stats = await PricingGridConfig.aggregate([
      { $match: { companyId: req.user.companyId } },
      { $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        totalZones: [
          { $project: {
            franceCount: { $size: { $ifNull: ['$zonesConfig.selectedZonesFrance', []] } },
            europeCount: { $size: { $ifNull: ['$zonesConfig.selectedZonesEurope', []] } }
          }},
          { $group: {
            _id: null,
            avgFrance: { $avg: '$franceCount' },
            avgEurope: { $avg: '$europeCount' }
          }}
        ],
        totalFiles: [
          { $project: {
            filesCount: { $size: { $ifNull: ['$attachedFilesData', []] } }
          }},
          { $group: {
            _id: null,
            total: { $sum: '$filesCount' },
            avg: { $avg: '$filesCount' }
          }}
        ]
      }}
    ]);

    res.json(stats[0]);
  } catch (error) {
    console.error('Erreur stats configs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

/**
 * GET /stats/requests
 * Statistiques des demandes
 */
app.get('/stats/requests', authenticateToken, async (req, res) => {
  try {
    const isIndustrial = req.user.portal === 'industry';
    const filterField = isIndustrial ? 'senderId' : 'carrierId';

    const stats = await PricingRequest.aggregate([
      { $match: { [filterField]: req.user.companyId } },
      { $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        byMonth: [
          { $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 }
          }},
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ],
        responseTime: [
          { $match: { respondedAt: { $exists: true } } },
          { $project: {
            responseTime: { $subtract: ['$respondedAt', '$createdAt'] }
          }},
          { $group: {
            _id: null,
            avgResponseTime: { $avg: '$responseTime' }
          }}
        ]
      }}
    ]);

    res.json(stats[0]);
  } catch (error) {
    console.error('Erreur stats requests:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'pricing-grids-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// MONGODB CONNECTION & SERVER START
// =============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-pricing-grids';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Pricing Grids API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Pricing Grids API running on port ${PORT} (no DB)`);
    });
  });

module.exports = app;
