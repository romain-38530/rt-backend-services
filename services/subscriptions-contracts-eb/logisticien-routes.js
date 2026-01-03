// Logisticien Routes - API de gestion des logisticiens SYMPHONI.A
// RT Backend Services - Version 2.5.2 - Security Enhancements

const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');

// Security Enhancements v2.5.0
const { RateLimiterManager } = require('./rate-limiter-middleware');
const { InvitationTokenService, TokenType } = require('./invitation-token-service');
const { WebhookService, WebhookEvent } = require('./webhook-service');

const {
  LogisticianStatus,
  VigilanceStatus,
  DelegationType,
  ICPEStatus,
  ICPERegime,
  LogisticianDocumentTypes,
  LogisticianEventTypes,
  vigilanceDocumentsConfig,
  REQUIRED_DOCUMENTS,
  ICPE_RUBRIQUES,
  checkVigilanceStatus,
  checkICPEThresholds,
  calculateLogisticianScore,
  getISOWeek,
  determineICPERegime,
  canReceiveOrders,
  generateWarehouseId,
  generateInvitationToken
} = require('./logisticien-models');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'symphonia-logisticien-secret-2024';
const JWT_EXPIRES_IN = '24h';
const INVITATION_EXPIRY_DAYS = 7;

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1'
});
const S3_BUCKET = process.env.S3_LOGISTICIAN_BUCKET || 'rt-logistician-documents';

// Textract Configuration
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'eu-central-1'
});

// ICPE patterns pour extraction OCR
const ICPE_PATTERNS = [
  /rubrique[s]?\s*:?\s*(\d{4})/gi,
  /n[°o]\s*(\d{4})/gi,
  /classement\s*:?\s*(\d{4})/gi
];

/**
 * Enregistrer un événement logisticien
 */
async function logLogisticianEvent(db, logisticianId, eventType, payload, triggeredBy = { type: 'system' }) {
  try {
    await db.collection('logistician_events').insertOne({
      logisticianId: new ObjectId(logisticianId),
      type: eventType,
      payload,
      triggeredBy,
      timestamp: new Date(),
      createdAt: new Date()
    });
  } catch (error) {
    console.error('[LogisticianEvent] Error logging event:', error);
  }
}

/**
 * Créer une alerte vigilance
 */
async function createVigilanceAlert(db, alertData) {
  try {
    const alert = {
      ...alertData,
      createdAt: new Date(),
      isResolved: false,
      notificationsSent: []
    };
    const result = await db.collection('logistician_vigilance_alerts').insertOne(alert);
    return result.insertedId;
  } catch (error) {
    console.error('[VigilanceAlert] Error creating alert:', error);
    return null;
  }
}

/**
 * Extraire les rubriques ICPE d'un document avec OCR
 */
async function extractICPEFromDocument(s3Key) {
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        S3Object: {
          Bucket: S3_BUCKET,
          Name: s3Key
        }
      }
    });

    const response = await textractClient.send(command);
    const textBlocks = response.Blocks?.filter(b => b.BlockType === 'LINE') || [];
    const fullText = textBlocks.map(b => b.Text).join('\n');

    // Extraire les rubriques
    const rubriques = new Set();
    for (const pattern of ICPE_PATTERNS) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        if (ICPE_RUBRIQUES[match[1]]) {
          rubriques.add(match[1]);
        }
      }
    }

    // Extraire les volumes (patterns comme "500 tonnes", "1000 m³")
    const volumePatterns = [
      /(\d+(?:[.,]\d+)?)\s*(tonnes?|t)\b/gi,
      /(\d+(?:[.,]\d+)?)\s*(m[²³23]|metres?\s*(?:carres?|cubes?))/gi,
      /(\d+(?:[.,]\d+)?)\s*(kg|kilogrammes?)/gi
    ];

    const volumes = {};
    for (const pattern of volumePatterns) {
      const matches = fullText.matchAll(pattern);
      for (const match of matches) {
        const value = parseFloat(match[1].replace(',', '.'));
        const unit = match[2].toLowerCase();
        if (!volumes[unit]) volumes[unit] = [];
        volumes[unit].push(value);
      }
    }

    return {
      success: true,
      rubriques: Array.from(rubriques),
      volumes,
      rawText: fullText,
      confidence: rubriques.size > 0 ? 'high' : 'low'
    };
  } catch (error) {
    console.error('[ICPE OCR] Error:', error);
    return {
      success: false,
      error: error.message,
      rubriques: [],
      volumes: {},
      confidence: 'none'
    };
  }
}

/**
 * Créer les routes logisticien
 * @param {MongoClient} mongoClient
 * @param {boolean} mongoConnected
 * @param {Object} sendLogisticianEmail
 * @returns {Router}
 */
function createLogisticienRoutes(mongoClient, mongoConnected, sendLogisticianEmail = null) {
  const express = require('express');
  const router = express.Router();

  // Helper pour obtenir la DB
  const getDb = () => mongoClient.db();

  // Security Services v2.5.0
  let rateLimiterManager = null;
  let invitationTokenService = null;
  let webhookService = null;

  const initSecurityServices = async () => {
    if (mongoConnected && mongoClient) {
      try {
        const db = mongoClient.db();
        rateLimiterManager = new RateLimiterManager(db);
        invitationTokenService = new InvitationTokenService(db);
        webhookService = new WebhookService(db);
        console.log('[LOGISTICIEN] Security services initialized');
      } catch (error) {
        console.error('[LOGISTICIEN] Failed to init security services:', error.message);
      }
    }
  };
  initSecurityServices();

  // Middleware pour vérifier la connexion MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' }
      });
    }
    next();
  };

  // Rate limiting pour invitations
  const rateLimitInvite = async (req, res, next) => {
    if (!rateLimiterManager) return next();
    try {
      const key = req.body.industrielId || req.ip;
      await rateLimiterManager.consume('carriers:invite', key);
      next();
    } catch (rateLimiterRes) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Trop d\'invitations envoyées. Réessayez plus tard.',
          retryAfter
        }
      });
    }
  };

  // ============================================
  // INVITATION
  // ============================================

  /**
   * POST /api/logisticians/invite
   * Inviter un logisticien (appelé par Industriel)
   */
  router.post('/invite', rateLimitInvite, checkMongoDB, async (req, res) => {
    try {
      const db = getDb();
      const {
        email,
        companyName,
        industrielId,
        industrielName,
        siret,
        phone,
        message,
        delegationType = DelegationType.FULL,
        delegatedSites = []
      } = req.body;

      if (!email || !companyName || !industrielId) {
        return res.status(400).json({
          success: false,
          error: 'email, companyName et industrielId sont requis'
        });
      }

      // Vérifier si le logisticien existe déjà
      const existingLogistician = await db.collection('logisticians').findOne({
        $or: [
          { email: email.toLowerCase() },
          ...(siret ? [{ siret }] : [])
        ]
      });

      if (existingLogistician) {
        // Logisticien existe déjà - ajouter la relation industriel
        const existingRelation = existingLogistician.industrialClients?.find(
          c => c.industrialId.toString() === industrielId
        );

        if (existingRelation) {
          return res.status(400).json({
            success: false,
            error: 'Ce logisticien est déjà lié à cet industriel'
          });
        }

        // Ajouter la nouvelle relation
        await db.collection('logisticians').updateOne(
          { _id: existingLogistician._id },
          {
            $push: {
              industrialClients: {
                industrialId: new ObjectId(industrielId),
                industrialName: industrielName || '',
                invitedAt: new Date(),
                status: existingLogistician.status === LogisticianStatus.ACTIVE ? 'active' : 'pending',
                delegationType,
                delegatedSites
              }
            },
            $set: { updatedAt: new Date() }
          }
        );

        await logLogisticianEvent(db, existingLogistician._id, LogisticianEventTypes.INDUSTRIAL_ADDED, {
          industrialId,
          industrialName,
          delegationType
        }, { type: 'industrial', id: industrielId, name: industrielName });

        // Envoyer email de notification
        if (sendLogisticianEmail) {
          await sendLogisticianEmail.newIndustrialClient(
            existingLogistician.email,
            existingLogistician.companyName,
            industrielName
          );
        }

        return res.json({
          success: true,
          message: 'Relation industriel ajoutée',
          logisticianId: existingLogistician._id,
          isNewLogistician: false
        });
      }

      // Créer un nouveau logisticien
      // Utiliser le service JWT sécurisé si disponible (v2.5.0), sinon fallback
      let invitationToken;
      let invitationExpiry = new Date();
      invitationExpiry.setDate(invitationExpiry.getDate() + INVITATION_EXPIRY_DAYS);

      if (invitationTokenService) {
        const tokenResult = await invitationTokenService.generateToken(
          'logisticien_invitation',
          {
            email: email.toLowerCase(),
            industrielId,
            industrielName,
            delegationType
          },
          { expiresIn: `${INVITATION_EXPIRY_DAYS}d` }
        );
        invitationToken = tokenResult.token;
        invitationExpiry = new Date(tokenResult.expiresAt);
      } else {
        invitationToken = generateInvitationToken();
      }

      const newLogistician = {
        email: email.toLowerCase(),
        companyName,
        siret: siret || null,
        phone: phone || null,
        status: LogisticianStatus.INVITED,
        vigilanceStatus: VigilanceStatus.PENDING,
        industrialClients: [{
          industrialId: new ObjectId(industrielId),
          industrialName: industrielName || '',
          invitedAt: new Date(),
          status: 'pending',
          delegationType,
          delegatedSites
        }],
        warehouses: [],
        contacts: [],
        invitationToken,
        invitationExpiry,
        invitedBy: industrielId,
        subscription: {
          type: 'free',
          monthlyPrice: 0,
          paidOptions: {
            bourseDeStockage: { active: false },
            borneAccueilChauffeur: { active: false }
          }
        },
        score: 0,
        scoreDetails: {},
        notificationPreferences: {
          email: true,
          push: true,
          sms: false
        },
        source: 'invitation',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('logisticians').insertOne(newLogistician);

      await logLogisticianEvent(db, result.insertedId, LogisticianEventTypes.INVITED, {
        industrialId,
        industrialName,
        email,
        delegationType
      }, { type: 'industrial', id: industrielId, name: industrielName });

      // Envoyer email d'invitation
      if (sendLogisticianEmail) {
        await sendLogisticianEmail.invitation(
          email,
          companyName,
          industrielName,
          invitationToken,
          message
        );
      }

      res.status(201).json({
        success: true,
        message: 'Invitation envoyée',
        logisticianId: result.insertedId,
        invitationToken,
        expiresAt: invitationExpiry,
        isNewLogistician: true
      });

    } catch (error) {
      console.error('[POST /api/logisticians/invite] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/invitation/:token
   * Vérifier un token d'invitation
   */
  router.get('/invitation/:token', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { token } = req.params;

      const logistician = await db.collection('logisticians').findOne({
        invitationToken: token,
        status: LogisticianStatus.INVITED
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Invitation non trouvée ou déjà utilisée'
        });
      }

      if (new Date() > logistician.invitationExpiry) {
        return res.status(400).json({
          success: false,
          error: 'Invitation expirée'
        });
      }

      res.json({
        success: true,
        invitation: {
          email: logistician.email,
          companyName: logistician.companyName,
          siret: logistician.siret,
          industrialClients: logistician.industrialClients.map(c => ({
            industrialName: c.industrialName,
            delegationType: c.delegationType
          })),
          expiresAt: logistician.invitationExpiry
        }
      });

    } catch (error) {
      console.error('[GET /api/logisticians/invitation/:token] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /api/logisticians/invitation/:id/revoke
   * Révoquer une invitation (v2.5.0 - Security Enhancement)
   */
  router.delete('/invitation/:id/revoke', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { industrielId, reason } = req.body;

      if (!industrielId) {
        return res.status(400).json({
          success: false,
          error: 'industrielId est requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id),
        status: LogisticianStatus.INVITED
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Invitation non trouvée ou déjà acceptée'
        });
      }

      // Vérifier que l'industriel a le droit de révoquer
      const isAuthorized = logistician.industrialClients?.some(
        c => c.industrialId.toString() === industrielId
      );

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          error: 'Non autorisé à révoquer cette invitation'
        });
      }

      // Révoquer le token JWT si le service est disponible
      if (invitationTokenService && logistician.invitationToken) {
        try {
          await invitationTokenService.revokeToken(logistician.invitationToken, reason || 'Révoqué par industriel');
        } catch (revokeError) {
          console.error('[Revoke] Token revocation failed:', revokeError.message);
        }
      }

      // Supprimer le logisticien invité (ou le marquer comme révoqué)
      await db.collection('logisticians').updateOne(
        { _id: logistician._id },
        {
          $set: {
            status: 'revoked',
            invitationToken: null,
            invitationExpiry: null,
            revokedAt: new Date(),
            revokedBy: industrielId,
            revokeReason: reason || null,
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, id, 'INVITATION_REVOKED', {
        revokedBy: industrielId,
        reason
      }, { type: 'industrial', id: industrielId });

      res.json({
        success: true,
        message: 'Invitation révoquée avec succès'
      });

    } catch (error) {
      console.error('[DELETE /api/logisticians/invitation/:id/revoke] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // ONBOARDING
  // ============================================

  /**
   * POST /api/logisticians/onboarding/step1
   * Étape 1: Créer le compte
   */
  router.post('/onboarding/step1', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const {
        token,
        email,
        password,
        companyName,
        siret,
        vatNumber,
        phone,
        address
      } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          error: 'token et password sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        invitationToken: token,
        status: LogisticianStatus.INVITED
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Invitation non trouvée ou déjà utilisée'
        });
      }

      if (new Date() > logistician.invitationExpiry) {
        return res.status(400).json({
          success: false,
          error: 'Invitation expirée'
        });
      }

      // Hasher le mot de passe
      const passwordHash = await bcrypt.hash(password, 10);

      // Mettre à jour le logisticien
      await db.collection('logisticians').updateOne(
        { _id: logistician._id },
        {
          $set: {
            companyName: companyName || logistician.companyName,
            siret: siret || logistician.siret,
            vatNumber: vatNumber || null,
            phone: phone || logistician.phone,
            address: address || {},
            passwordHash,
            status: LogisticianStatus.ONBOARDING,
            invitationToken: null,
            invitationExpiry: null,
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, logistician._id, LogisticianEventTypes.ONBOARDING_STARTED, {
        step: 1,
        email: logistician.email
      });

      // Générer un token JWT temporaire pour continuer l'onboarding
      const onboardingToken = jwt.sign(
        { logisticianId: logistician._id.toString(), step: 1 },
        JWT_SECRET,
        { expiresIn: '2h' }
      );

      res.json({
        success: true,
        message: 'Étape 1 complétée',
        logisticianId: logistician._id,
        onboardingToken,
        nextStep: 2
      });

    } catch (error) {
      console.error('[POST /api/logisticians/onboarding/step1] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/onboarding/step2
   * Étape 2: Configurer les entrepôts
   */
  router.post('/onboarding/step2', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { logisticianId, warehouses } = req.body;

      if (!logisticianId || !warehouses || warehouses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'logisticianId et au moins un entrepôt sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(logisticianId),
        status: LogisticianStatus.ONBOARDING
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé ou onboarding non démarré'
        });
      }

      // Préparer les entrepôts avec IDs uniques
      const preparedWarehouses = warehouses.map(wh => ({
        warehouseId: generateWarehouseId(),
        name: wh.name,
        address: wh.address || {},
        gpsCoordinates: wh.gpsCoordinates || {},
        surface: wh.surface || 0,
        dockCount: wh.dockCount || 1,
        icpeStatus: wh.icpeStatus || null,
        icpeRubriques: (wh.icpeRubriques || []).map(r => ({
          rubrique: r.rubrique,
          libelle: ICPE_RUBRIQUES[r.rubrique]?.libelle || r.libelle,
          regime: r.regime,
          seuilMax: r.seuilMax,
          unite: ICPE_RUBRIQUES[r.rubrique]?.unite || r.unite,
          dateDeclaration: r.dateDeclaration ? new Date(r.dateDeclaration) : null
        })),
        icpeNumero: wh.icpeNumero || null,
        icpePrefecture: wh.icpePrefecture || null,
        icpeDateDeclaration: wh.icpeDateDeclaration ? new Date(wh.icpeDateDeclaration) : null,
        icpeProchainControle: wh.icpeProchainControle ? new Date(wh.icpeProchainControle) : null,
        certifications: wh.certifications || [],
        constraints: wh.constraints || [],
        operatingHours: wh.operatingHours || {},
        isActive: true
      }));

      await db.collection('logisticians').updateOne(
        { _id: logistician._id },
        {
          $set: {
            warehouses: preparedWarehouses,
            updatedAt: new Date()
          }
        }
      );

      for (const wh of preparedWarehouses) {
        await logLogisticianEvent(db, logistician._id, LogisticianEventTypes.WAREHOUSE_ADDED, {
          warehouseId: wh.warehouseId,
          name: wh.name,
          icpeStatus: wh.icpeStatus
        });
      }

      res.json({
        success: true,
        message: 'Étape 2 complétée',
        warehouses: preparedWarehouses.map(w => ({
          warehouseId: w.warehouseId,
          name: w.name
        })),
        nextStep: 3
      });

    } catch (error) {
      console.error('[POST /api/logisticians/onboarding/step2] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/onboarding/step3
   * Étape 3: Configurer les contacts et finaliser
   */
  router.post('/onboarding/step3', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { logisticianId, contacts } = req.body;

      if (!logisticianId) {
        return res.status(400).json({
          success: false,
          error: 'logisticianId est requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(logisticianId),
        status: LogisticianStatus.ONBOARDING
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé ou onboarding non démarré'
        });
      }

      // Préparer les contacts
      const preparedContacts = (contacts || []).map(c => ({
        type: c.type || 'other',
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        email: c.email || '',
        phone: c.phone || '',
        warehouseId: c.warehouseId || null,
        isMain: c.isMain || false
      }));

      // Si aucun contact principal, prendre le premier
      if (preparedContacts.length > 0 && !preparedContacts.some(c => c.isMain)) {
        preparedContacts[0].isMain = true;
      }

      await db.collection('logisticians').updateOne(
        { _id: logistician._id },
        {
          $set: {
            contacts: preparedContacts,
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, logistician._id, LogisticianEventTypes.ONBOARDING_COMPLETED, {
        warehouseCount: logistician.warehouses?.length || 0,
        contactCount: preparedContacts.length
      });

      res.json({
        success: true,
        message: 'Onboarding complété - En attente de validation des documents',
        logisticianId: logistician._id,
        status: LogisticianStatus.ONBOARDING,
        nextStep: 'upload_documents'
      });

    } catch (error) {
      console.error('[POST /api/logisticians/onboarding/step3] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // DOCUMENTS VIGILANCE
  // ============================================

  /**
   * POST /api/logisticians/:id/documents/upload-url
   * Obtenir une URL pré-signée pour upload
   */
  router.post('/:id/documents/upload-url', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { fileName, contentType, documentType, warehouseId } = req.body;

      if (!fileName || !contentType || !documentType) {
        return res.status(400).json({
          success: false,
          error: 'fileName, contentType et documentType sont requis'
        });
      }

      // Vérifier le type de document
      if (!Object.values(LogisticianDocumentTypes).includes(documentType)) {
        return res.status(400).json({
          success: false,
          error: 'Type de document invalide'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      // Générer la clé S3
      const timestamp = Date.now();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const s3Key = `logisticians/${id}/${warehouseId || 'company'}/${documentType}/${timestamp}-${safeFileName}`;

      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: contentType
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 min

      res.json({
        success: true,
        uploadUrl,
        s3Key,
        bucket: S3_BUCKET,
        expiresIn: 900
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/documents/upload-url] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/:id/documents/confirm-upload
   * Confirmer l'upload d'un document
   */
  router.post('/:id/documents/confirm-upload', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { s3Key, documentType, fileName, expiresAt, warehouseId, notes } = req.body;

      if (!s3Key || !documentType || !fileName) {
        return res.status(400).json({
          success: false,
          error: 's3Key, documentType et fileName sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      // Créer le document
      const document = {
        logisticianId: new ObjectId(id),
        warehouseId: warehouseId || null,
        documentType,
        fileName,
        s3Key,
        s3Bucket: S3_BUCKET,
        status: 'pending',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        uploadedAt: new Date(),
        uploadedBy: logistician.email,
        notes: notes || null
      };

      const result = await db.collection('logistician_documents').insertOne(document);

      await logLogisticianEvent(db, id, LogisticianEventTypes.DOCUMENT_UPLOADED, {
        documentId: result.insertedId,
        documentType,
        warehouseId,
        fileName
      });

      // Si c'est un document ICPE, lancer l'extraction OCR
      let ocrResult = null;
      if (documentType.startsWith('icpe_')) {
        ocrResult = await extractICPEFromDocument(s3Key);
        if (ocrResult.success) {
          await db.collection('logistician_documents').updateOne(
            { _id: result.insertedId },
            { $set: { ocrExtracted: ocrResult } }
          );
        }
      }

      res.json({
        success: true,
        documentId: result.insertedId,
        status: 'pending',
        ocrResult
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/documents/confirm-upload] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/:id/documents
   * Liste des documents d'un logisticien
   */
  router.get('/:id/documents', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { warehouseId, status } = req.query;

      const query = { logisticianId: new ObjectId(id) };
      if (warehouseId) query.warehouseId = warehouseId;
      if (status) query.status = status;

      const documents = await db.collection('logistician_documents')
        .find(query)
        .sort({ uploadedAt: -1 })
        .toArray();

      // Ajouter les infos de configuration
      const enrichedDocuments = documents.map(doc => ({
        ...doc,
        config: vigilanceDocumentsConfig[doc.documentType] || {}
      }));

      res.json({
        success: true,
        documents: enrichedDocuments,
        count: documents.length
      });

    } catch (error) {
      console.error('[GET /api/logisticians/:id/documents] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/:id/documents/:docId/verify
   * Vérifier (approuver/rejeter) un document
   */
  router.post('/:id/documents/:docId/verify', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id, docId } = req.params;
      const { approved, rejectionReason, verifiedBy } = req.body;

      if (typeof approved !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'approved (boolean) est requis'
        });
      }

      if (!approved && !rejectionReason) {
        return res.status(400).json({
          success: false,
          error: 'rejectionReason est requis si approved=false'
        });
      }

      const document = await db.collection('logistician_documents').findOne({
        _id: new ObjectId(docId),
        logisticianId: new ObjectId(id)
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document non trouvé'
        });
      }

      const newStatus = approved ? 'verified' : 'rejected';

      await db.collection('logistician_documents').updateOne(
        { _id: document._id },
        {
          $set: {
            status: newStatus,
            verifiedAt: new Date(),
            verifiedBy: verifiedBy || 'admin',
            ...(rejectionReason && { rejectionReason })
          }
        }
      );

      const eventType = approved
        ? LogisticianEventTypes.DOCUMENT_VERIFIED
        : LogisticianEventTypes.DOCUMENT_REJECTED;

      await logLogisticianEvent(db, id, eventType, {
        documentId: docId,
        documentType: document.documentType,
        rejectionReason
      }, { type: 'admin', name: verifiedBy || 'admin' });

      // Recalculer le statut de vigilance
      const allDocuments = await db.collection('logistician_documents')
        .find({ logisticianId: new ObjectId(id) })
        .toArray();

      const logistician = await db.collection('logisticians').findOne({ _id: new ObjectId(id) });
      const vigilanceCheck = checkVigilanceStatus(logistician, allDocuments);

      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            vigilanceStatus: vigilanceCheck.status,
            updatedAt: new Date()
          }
        }
      );

      res.json({
        success: true,
        documentStatus: newStatus,
        vigilanceStatus: vigilanceCheck.status
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/documents/:docId/verify] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // VALIDATION FINALE
  // ============================================

  /**
   * POST /api/logisticians/:id/validate
   * Valider et activer un logisticien
   */
  router.post('/:id/validate', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      if (logistician.status === LogisticianStatus.ACTIVE) {
        return res.status(400).json({
          success: false,
          error: 'Logisticien déjà actif'
        });
      }

      // Vérifier les documents requis
      const documents = await db.collection('logistician_documents')
        .find({ logisticianId: new ObjectId(id), status: 'verified' })
        .toArray();

      const missingDocs = [];
      for (const docType of REQUIRED_DOCUMENTS) {
        const config = vigilanceDocumentsConfig[docType];
        if (config.warehouseSpecific) {
          // Vérifier pour chaque entrepôt actif
          for (const wh of (logistician.warehouses || []).filter(w => w.isActive)) {
            const hasDoc = documents.some(
              d => d.documentType === docType && d.warehouseId === wh.warehouseId
            );
            if (!hasDoc) {
              missingDocs.push({ type: docType, name: config.name, warehouse: wh.name });
            }
          }
        } else {
          const hasDoc = documents.some(d => d.documentType === docType);
          if (!hasDoc) {
            missingDocs.push({ type: docType, name: config.name });
          }
        }
      }

      if (missingDocs.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Documents requis manquants',
          missingDocuments: missingDocs
        });
      }

      // Activer le logisticien
      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: LogisticianStatus.ACTIVE,
            vigilanceStatus: VigilanceStatus.COMPLIANT,
            'industrialClients.$[].status': 'active',
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, id, LogisticianEventTypes.VALIDATED, {
        activatedAt: new Date(),
        warehouseCount: logistician.warehouses?.length || 0
      });

      // Envoyer email de confirmation
      if (sendLogisticianEmail) {
        await sendLogisticianEmail.onboardingSuccess(
          logistician.email,
          logistician.companyName
        );
      }

      // Webhook notification vers l'industriel (v2.5.0)
      if (webhookService && logistician.industrialClients?.length > 0) {
        for (const client of logistician.industrialClients) {
          try {
            await webhookService.trigger(client.industrialId.toString(), 'onboarding.completed', {
              logisticianId: id,
              companyName: logistician.companyName,
              email: logistician.email,
              activatedAt: new Date().toISOString(),
              warehouseCount: logistician.warehouses?.length || 0
            });
          } catch (webhookError) {
            console.error('[Webhook] onboarding.completed failed:', webhookError.message);
          }
        }
      }

      res.json({
        success: true,
        message: 'Logisticien activé avec succès',
        status: LogisticianStatus.ACTIVE
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/validate] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // GESTION
  // ============================================

  /**
   * GET /api/logisticians
   * Liste des logisticiens (filtré par industriel)
   */
  router.get('', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { industrielId, status, vigilanceStatus, page = 1, limit = 50 } = req.query;

      const query = {};
      if (industrielId) {
        query['industrialClients.industrialId'] = new ObjectId(industrielId);
      }
      if (status) query.status = status;
      if (vigilanceStatus) query.vigilanceStatus = vigilanceStatus;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [logisticians, total] = await Promise.all([
        db.collection('logisticians')
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray(),
        db.collection('logisticians').countDocuments(query)
      ]);

      res.json({
        success: true,
        logisticians: logisticians.map(l => ({
          ...l,
          passwordHash: undefined // Ne pas exposer le hash
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });

    } catch (error) {
      console.error('[GET /api/logisticians] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // ROUTES STATIQUES (AVANT /:id pour éviter les conflits)
  // ============================================

  /**
   * GET /api/logisticians/icpe-rubriques
   * Liste des rubriques ICPE disponibles
   */
  router.get('/icpe-rubriques', async (req, res) => {
    res.json({
      success: true,
      rubriques: ICPE_RUBRIQUES
    });
  });

  /**
   * GET /api/logisticians/stats/:industrielId
   * Statistiques des logisticiens pour un industriel
   */
  router.get('/stats/:industrielId', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { industrielId } = req.params;

      const logisticians = await db.collection('logisticians')
        .find({ 'industrialClients.industrialId': new ObjectId(industrielId) })
        .toArray();

      const stats = {
        total: logisticians.length,
        byStatus: {},
        byVigilance: {},
        averageScore: 0,
        alertsSummary: { critical: 0, warning: 0, info: 0 }
      };

      let totalScore = 0;
      for (const log of logisticians) {
        stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
        stats.byVigilance[log.vigilanceStatus] = (stats.byVigilance[log.vigilanceStatus] || 0) + 1;
        totalScore += log.score || 0;
      }

      stats.averageScore = logisticians.length > 0 ? Math.round(totalScore / logisticians.length) : 0;

      const alerts = await db.collection('logistician_vigilance_alerts')
        .find({
          logisticianId: { $in: logisticians.map(l => l._id) },
          isResolved: false
        })
        .toArray();

      for (const alert of alerts) {
        stats.alertsSummary[alert.severity] = (stats.alertsSummary[alert.severity] || 0) + 1;
      }

      res.json({ success: true, stats });

    } catch (error) {
      console.error('[GET /api/logisticians/stats/:industrielId] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/icpe-dashboard/:industrielId
   * Tableau de bord ICPE temps réel pour un industriel
   */
  router.get('/icpe-dashboard/:industrielId', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { industrielId } = req.params;

      const logisticians = await db.collection('logisticians')
        .find({
          'industrialClients.industrialId': new ObjectId(industrielId),
          status: LogisticianStatus.ACTIVE
        })
        .toArray();

      if (logisticians.length === 0) {
        return res.json({
          success: true,
          dashboard: { logisticians: [], summary: { totalWarehouses: 0, criticalAlerts: 0, warningAlerts: 0, compliantWarehouses: 0 } }
        });
      }

      const now = new Date();
      const currentWeek = getISOWeek(now);
      const currentYear = now.getFullYear();

      const dashboard = {
        logisticians: [],
        summary: { totalWarehouses: 0, criticalAlerts: 0, warningAlerts: 0, compliantWarehouses: 0 }
      };

      for (const logistician of logisticians) {
        const logData = {
          logisticianId: logistician._id,
          companyName: logistician.companyName,
          vigilanceStatus: logistician.vigilanceStatus,
          score: logistician.score,
          warehouses: []
        };

        for (const warehouse of (logistician.warehouses || []).filter(w => w.isActive)) {
          dashboard.summary.totalWarehouses++;

          const lastDeclaration = await db.collection('icpe_volume_declarations')
            .findOne({ logisticianId: logistician._id, warehouseId: warehouse.warehouseId }, { sort: { year: -1, weekNumber: -1 } });

          const icpeAlerts = lastDeclaration ? checkICPEThresholds(warehouse, lastDeclaration) : [];
          const criticalCount = icpeAlerts.filter(a => a.severity === 'critical').length;
          const warningCount = icpeAlerts.filter(a => a.severity === 'warning').length;

          dashboard.summary.criticalAlerts += criticalCount;
          dashboard.summary.warningAlerts += warningCount;
          if (criticalCount === 0 && warningCount === 0) dashboard.summary.compliantWarehouses++;

          logData.warehouses.push({
            warehouseId: warehouse.warehouseId,
            name: warehouse.name,
            icpeStatus: warehouse.icpeStatus,
            lastDeclaration: lastDeclaration ? { weekNumber: lastDeclaration.weekNumber, year: lastDeclaration.year, declaredAt: lastDeclaration.declaredAt, volumes: lastDeclaration.volumes } : null,
            alerts: icpeAlerts,
            alertsSummary: { critical: criticalCount, warning: warningCount }
          });
        }
        dashboard.logisticians.push(logData);
      }

      res.json({ success: true, dashboard, currentWeek, currentYear });

    } catch (error) {
      console.error('[GET /api/logisticians/icpe-dashboard/:industrielId] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/:id
   * Détails d'un logisticien
   */
  router.get('/:id', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      // Récupérer les documents
      const documents = await db.collection('logistician_documents')
        .find({ logisticianId: new ObjectId(id) })
        .toArray();

      // Récupérer les dernières déclarations ICPE
      const declarations = await db.collection('icpe_volume_declarations')
        .find({ logisticianId: new ObjectId(id) })
        .sort({ year: -1, weekNumber: -1 })
        .limit(10)
        .toArray();

      // Calculer le score
      const { score, details } = calculateLogisticianScore(logistician, documents, declarations);

      // Vérifier la vigilance
      const vigilanceCheck = checkVigilanceStatus(logistician, documents);

      res.json({
        success: true,
        logistician: {
          ...logistician,
          passwordHash: undefined,
          score,
          scoreDetails: details,
          vigilanceCheck
        },
        documents,
        recentDeclarations: declarations
      });

    } catch (error) {
      console.error('[GET /api/logisticians/:id] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/:id/block
   * Bloquer un logisticien
   */
  router.post('/:id/block', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { reason, description, until, blockedBy } = req.body;

      if (!reason || !description) {
        return res.status(400).json({
          success: false,
          error: 'reason et description sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      const blockingEntry = {
        reason,
        description,
        blockedAt: new Date(),
        blockedUntil: until ? new Date(until) : null,
        blockedBy: blockedBy || 'system'
      };

      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: LogisticianStatus.BLOCKED,
            vigilanceStatus: VigilanceStatus.BLOCKED,
            blockedReason: reason,
            blockedAt: new Date(),
            blockedUntil: until ? new Date(until) : null,
            updatedAt: new Date()
          },
          $push: { blockingHistory: blockingEntry }
        }
      );

      await logLogisticianEvent(db, id, LogisticianEventTypes.BLOCKED, blockingEntry, {
        type: 'admin',
        name: blockedBy || 'system'
      });

      // Envoyer email
      if (sendLogisticianEmail) {
        await sendLogisticianEmail.accountBlocked(
          logistician.email,
          logistician.companyName,
          reason,
          description
        );
      }

      res.json({
        success: true,
        message: 'Logisticien bloqué',
        status: LogisticianStatus.BLOCKED
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/block] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/:id/unblock
   * Débloquer un logisticien
   */
  router.post('/:id/unblock', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { notes, unblockedBy } = req.body;

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      // Revérifier la vigilance
      const documents = await db.collection('logistician_documents')
        .find({ logisticianId: new ObjectId(id), status: 'verified' })
        .toArray();

      const vigilanceCheck = checkVigilanceStatus(logistician, documents);

      if (!vigilanceCheck.canOperate) {
        return res.status(400).json({
          success: false,
          error: 'Documents de vigilance non conformes',
          vigilanceCheck
        });
      }

      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: LogisticianStatus.ACTIVE,
            vigilanceStatus: vigilanceCheck.status,
            blockedReason: null,
            blockedAt: null,
            blockedUntil: null,
            updatedAt: new Date()
          },
          $push: {
            'blockingHistory.$[last].unblockedAt': new Date(),
            'blockingHistory.$[last].unblockedBy': unblockedBy || 'admin',
            'blockingHistory.$[last].notes': notes
          }
        },
        { arrayFilters: [{ 'last.unblockedAt': { $exists: false } }] }
      );

      await logLogisticianEvent(db, id, LogisticianEventTypes.UNBLOCKED, {
        notes,
        vigilanceStatus: vigilanceCheck.status
      }, { type: 'admin', name: unblockedBy || 'admin' });

      // Envoyer email
      if (sendLogisticianEmail) {
        await sendLogisticianEmail.accountUnblocked(
          logistician.email,
          logistician.companyName
        );
      }

      res.json({
        success: true,
        message: 'Logisticien débloqué',
        status: LogisticianStatus.ACTIVE,
        vigilanceStatus: vigilanceCheck.status
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/unblock] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // DÉCLARATIONS ICPE HEBDOMADAIRES
  // ============================================

  /**
   * POST /api/logisticians/:id/icpe/declare-volumes
   * Déclarer les volumes ICPE de la semaine
   */
  router.post('/:id/icpe/declare-volumes', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { warehouseId, weekNumber, year, volumes, notes } = req.body;

      if (!warehouseId || !weekNumber || !year || !volumes || volumes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'warehouseId, weekNumber, year et volumes sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé'
        });
      }

      const warehouse = logistician.warehouses?.find(w => w.warehouseId === warehouseId);
      if (!warehouse) {
        return res.status(404).json({
          success: false,
          error: 'Entrepôt non trouvé'
        });
      }

      // Vérifier si déclaration existe déjà
      const existingDeclaration = await db.collection('icpe_volume_declarations').findOne({
        logisticianId: new ObjectId(id),
        warehouseId,
        weekNumber: parseInt(weekNumber),
        year: parseInt(year)
      });

      // Préparer les volumes avec calculs automatiques
      const preparedVolumes = volumes.map(v => {
        const rubriqueConfig = warehouse.icpeRubriques?.find(r => r.rubrique === v.rubrique);
        const seuilMax = rubriqueConfig?.seuilMax || v.seuilMax || 0;
        const percentage = seuilMax > 0 ? Math.round((v.volume / seuilMax) * 100) : 0;

        let alertLevel = 'ok';
        if (percentage >= 90) alertLevel = 'critical';
        else if (percentage >= 80) alertLevel = 'warning';

        return {
          rubrique: v.rubrique,
          libelle: ICPE_RUBRIQUES[v.rubrique]?.libelle || rubriqueConfig?.libelle || '',
          volume: v.volume,
          unite: ICPE_RUBRIQUES[v.rubrique]?.unite || rubriqueConfig?.unite || v.unite,
          seuilMax,
          percentageUsed: percentage,
          alertLevel
        };
      });

      // Créer ou mettre à jour la déclaration
      const declaration = {
        logisticianId: new ObjectId(id),
        warehouseId,
        weekNumber: parseInt(weekNumber),
        year: parseInt(year),
        declaredAt: new Date(),
        declaredBy: logistician.email,
        volumes: preparedVolumes,
        status: 'submitted',
        notes: notes || null
      };

      let declarationId;
      if (existingDeclaration) {
        await db.collection('icpe_volume_declarations').updateOne(
          { _id: existingDeclaration._id },
          { $set: declaration }
        );
        declarationId = existingDeclaration._id;
      } else {
        const result = await db.collection('icpe_volume_declarations').insertOne(declaration);
        declarationId = result.insertedId;
      }

      // Créer des alertes si nécessaire
      const alerts = preparedVolumes.filter(v => v.alertLevel !== 'ok');
      for (const alert of alerts) {
        await createVigilanceAlert(db, {
          logisticianId: new ObjectId(id),
          warehouseId,
          alertType: alert.alertLevel === 'critical' ? 'icpe_seuil_critical' : 'icpe_seuil_warning',
          severity: alert.alertLevel,
          title: `Seuil ICPE ${alert.rubrique} - ${alert.percentageUsed}%`,
          message: `Le volume déclaré pour la rubrique ${alert.rubrique} (${alert.libelle}) atteint ${alert.percentageUsed}% du seuil autorisé.`,
          rubrique: alert.rubrique,
          actionRequired: alert.alertLevel === 'critical',
          actionLabel: 'Mettre à jour déclaration ICPE'
        });
      }

      await logLogisticianEvent(db, id, LogisticianEventTypes.ICPE_VOLUME_DECLARED, {
        warehouseId,
        weekNumber,
        year,
        alertCount: alerts.length
      });

      res.json({
        success: true,
        declarationId,
        volumes: preparedVolumes,
        alerts: alerts.map(a => ({
          rubrique: a.rubrique,
          alertLevel: a.alertLevel,
          percentage: a.percentageUsed
        }))
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/icpe/declare-volumes] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/:id/icpe/history
   * Historique des déclarations ICPE
   */
  router.get('/:id/icpe/history', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { warehouseId, fromWeek, toWeek, year, limit = 52 } = req.query;

      const query = { logisticianId: new ObjectId(id) };
      if (warehouseId) query.warehouseId = warehouseId;
      if (year) query.year = parseInt(year);
      if (fromWeek && toWeek) {
        query.weekNumber = { $gte: parseInt(fromWeek), $lte: parseInt(toWeek) };
      }

      const declarations = await db.collection('icpe_volume_declarations')
        .find(query)
        .sort({ year: -1, weekNumber: -1 })
        .limit(parseInt(limit))
        .toArray();

      res.json({
        success: true,
        declarations,
        count: declarations.length
      });

    } catch (error) {
      console.error('[GET /api/logisticians/:id/icpe/history] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/:id/icpe/alerts
   * Alertes ICPE actives
   */
  router.get('/:id/icpe/alerts', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;
      const { warehouseId, resolved = 'false' } = req.query;

      const query = {
        logisticianId: new ObjectId(id),
        alertType: { $in: ['icpe_seuil_warning', 'icpe_seuil_critical'] }
      };
      if (warehouseId) query.warehouseId = warehouseId;
      if (resolved === 'false') query.isResolved = false;

      const alerts = await db.collection('logistician_vigilance_alerts')
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        success: true,
        alerts,
        count: alerts.length
      });

    } catch (error) {
      console.error('[GET /api/logisticians/:id/icpe/alerts] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // STATISTIQUES (POUR INDUSTRIEL)
  // ============================================

  /**
   * GET /api/logisticians/stats/:industrielId
   * Statistiques des logisticiens pour un industriel
   */
  router.get('/stats/:industrielId', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { industrielId } = req.params;

      const logisticians = await db.collection('logisticians')
        .find({ 'industrialClients.industrialId': new ObjectId(industrielId) })
        .toArray();

      const stats = {
        total: logisticians.length,
        byStatus: {},
        byVigilance: {},
        averageScore: 0,
        alertsSummary: { critical: 0, warning: 0, info: 0 }
      };

      let totalScore = 0;
      for (const log of logisticians) {
        // Par statut
        stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1;
        // Par vigilance
        stats.byVigilance[log.vigilanceStatus] = (stats.byVigilance[log.vigilanceStatus] || 0) + 1;
        // Score
        totalScore += log.score || 0;
      }

      stats.averageScore = logisticians.length > 0 ? Math.round(totalScore / logisticians.length) : 0;

      // Alertes actives
      const alerts = await db.collection('logistician_vigilance_alerts')
        .find({
          logisticianId: { $in: logisticians.map(l => l._id) },
          isResolved: false
        })
        .toArray();

      for (const alert of alerts) {
        stats.alertsSummary[alert.severity] = (stats.alertsSummary[alert.severity] || 0) + 1;
      }

      res.json({
        success: true,
        stats
      });

    } catch (error) {
      console.error('[GET /api/logisticians/stats/:industrielId] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // TABLEAU DE BORD ICPE TEMPS RÉEL (INDUSTRIEL)
  // ============================================

  /**
   * GET /api/logisticians/icpe-dashboard/:industrielId
   * Tableau de bord ICPE temps réel pour un industriel
   * Voir tous les seuils ICPE de ses logisticiens
   */
  router.get('/icpe-dashboard/:industrielId', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { industrielId } = req.params;

      // Récupérer tous les logisticiens de cet industriel
      const logisticians = await db.collection('logisticians')
        .find({
          'industrialClients.industrialId': new ObjectId(industrielId),
          status: LogisticianStatus.ACTIVE
        })
        .toArray();

      if (logisticians.length === 0) {
        return res.json({
          success: true,
          dashboard: {
            logisticians: [],
            summary: {
              totalWarehouses: 0,
              criticalAlerts: 0,
              warningAlerts: 0,
              compliantWarehouses: 0
            }
          }
        });
      }

      // Récupérer les dernières déclarations pour chaque entrepôt
      const now = new Date();
      const currentWeek = getISOWeek(now);
      const currentYear = now.getFullYear();

      const dashboard = {
        logisticians: [],
        summary: {
          totalWarehouses: 0,
          criticalAlerts: 0,
          warningAlerts: 0,
          compliantWarehouses: 0
        }
      };

      for (const logistician of logisticians) {
        const logData = {
          logisticianId: logistician._id,
          companyName: logistician.companyName,
          vigilanceStatus: logistician.vigilanceStatus,
          score: logistician.score,
          warehouses: []
        };

        for (const warehouse of (logistician.warehouses || []).filter(w => w.isActive)) {
          dashboard.summary.totalWarehouses++;

          // Récupérer la dernière déclaration
          const lastDeclaration = await db.collection('icpe_volume_declarations')
            .findOne(
              {
                logisticianId: logistician._id,
                warehouseId: warehouse.warehouseId
              },
              { sort: { year: -1, weekNumber: -1 } }
            );

          // Calculer les alertes
          const icpeAlerts = lastDeclaration
            ? checkICPEThresholds(warehouse, lastDeclaration)
            : [];

          // Compter les alertes
          const criticalCount = icpeAlerts.filter(a => a.severity === 'critical').length;
          const warningCount = icpeAlerts.filter(a => a.severity === 'warning').length;

          dashboard.summary.criticalAlerts += criticalCount;
          dashboard.summary.warningAlerts += warningCount;
          if (criticalCount === 0 && warningCount === 0) {
            dashboard.summary.compliantWarehouses++;
          }

          logData.warehouses.push({
            warehouseId: warehouse.warehouseId,
            name: warehouse.name,
            address: warehouse.address,
            icpeStatus: warehouse.icpeStatus,
            icpeRubriques: warehouse.icpeRubriques || [],
            lastDeclaration: lastDeclaration ? {
              weekNumber: lastDeclaration.weekNumber,
              year: lastDeclaration.year,
              declaredAt: lastDeclaration.declaredAt,
              volumes: lastDeclaration.volumes
            } : null,
            declarationMissing: !lastDeclaration ||
              lastDeclaration.year < currentYear ||
              (lastDeclaration.year === currentYear && lastDeclaration.weekNumber < currentWeek - 1),
            alerts: icpeAlerts,
            alertsSummary: {
              critical: criticalCount,
              warning: warningCount
            }
          });
        }

        dashboard.logisticians.push(logData);
      }

      res.json({
        success: true,
        dashboard,
        currentWeek,
        currentYear
      });

    } catch (error) {
      console.error('[GET /api/logisticians/icpe-dashboard/:industrielId] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /api/logisticians/icpe-rubriques
   * Liste des rubriques ICPE disponibles
   */
  router.get('/icpe-rubriques', checkMongoDB, async (req, res) => {
    const db = getDb();
    res.json({
      success: true,
      rubriques: ICPE_RUBRIQUES
    });
  });

  // ============================================
  // OPTIONS PAYANTES
  // ============================================

  /**
   * POST /api/logisticians/:id/subscribe/bourse-stockage
   * Activer l'option Bourse de Stockage (150€/mois)
   */
  router.post('/:id/subscribe/bourse-stockage', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id),
        status: LogisticianStatus.ACTIVE
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé ou non actif'
        });
      }

      if (logistician.subscription?.paidOptions?.bourseDeStockage?.active) {
        return res.status(400).json({
          success: false,
          error: 'Option déjà activée'
        });
      }

      // TODO: Intégration Stripe pour le paiement

      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            'subscription.paidOptions.bourseDeStockage': {
              active: true,
              activatedAt: new Date()
            },
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, id, LogisticianEventTypes.OPTION_ACTIVATED, {
        option: 'bourseDeStockage',
        price: 150
      });

      res.json({
        success: true,
        message: 'Option Bourse de Stockage activée',
        monthlyPrice: 150
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/subscribe/bourse-stockage] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /api/logisticians/:id/subscribe/borne-accueil
   * Activer l'option Borne Accueil Chauffeur (100€/mois)
   */
  router.post('/:id/subscribe/borne-accueil', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { id } = req.params;

      const logistician = await db.collection('logisticians').findOne({
        _id: new ObjectId(id),
        status: LogisticianStatus.ACTIVE
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: 'Logisticien non trouvé ou non actif'
        });
      }

      if (logistician.subscription?.paidOptions?.borneAccueilChauffeur?.active) {
        return res.status(400).json({
          success: false,
          error: 'Option déjà activée'
        });
      }

      // TODO: Intégration Stripe pour le paiement

      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            'subscription.paidOptions.borneAccueilChauffeur': {
              active: true,
              activatedAt: new Date()
            },
            updatedAt: new Date()
          }
        }
      );

      await logLogisticianEvent(db, id, LogisticianEventTypes.OPTION_ACTIVATED, {
        option: 'borneAccueilChauffeur',
        price: 100
      });

      res.json({
        success: true,
        message: 'Option Borne Accueil Chauffeur activée',
        monthlyPrice: 100
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/subscribe/borne-accueil] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================
  // AUTHENTIFICATION LOGISTICIEN
  // ============================================

  /**
   * POST /api/logisticians/auth/login
   * Connexion logisticien
   */
  router.post('/auth/login', checkMongoDB, async (req, res) => {
    const db = getDb();
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'email et password sont requis'
        });
      }

      const logistician = await db.collection('logisticians').findOne({
        email: email.toLowerCase()
      });

      if (!logistician) {
        return res.status(401).json({
          success: false,
          error: 'Identifiants invalides'
        });
      }

      if (!logistician.passwordHash) {
        return res.status(401).json({
          success: false,
          error: 'Compte non activé - veuillez compléter l\'onboarding'
        });
      }

      if (logistician.status === LogisticianStatus.BLOCKED) {
        return res.status(403).json({
          success: false,
          error: 'Compte bloqué',
          reason: logistician.blockedReason
        });
      }

      const isValidPassword = await bcrypt.compare(password, logistician.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Identifiants invalides'
        });
      }

      // Mettre à jour lastLogin
      await db.collection('logisticians').updateOne(
        { _id: logistician._id },
        { $set: { lastLogin: new Date() } }
      );

      await logLogisticianEvent(db, logistician._id, LogisticianEventTypes.LOGIN, {
        ip: req.ip
      });

      // Générer le token
      const token = jwt.sign(
        {
          logisticianId: logistician._id.toString(),
          email: logistician.email,
          companyName: logistician.companyName
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        token,
        logistician: {
          id: logistician._id,
          email: logistician.email,
          companyName: logistician.companyName,
          status: logistician.status,
          vigilanceStatus: logistician.vigilanceStatus,
          warehouses: logistician.warehouses?.map(w => ({
            warehouseId: w.warehouseId,
            name: w.name
          })),
          subscription: logistician.subscription
        }
      });

    } catch (error) {
      console.error('[POST /api/logisticians/auth/login] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ==================== REVOCATION D'INVITATION ====================

  /**
   * POST /api/logisticians/:id/cancel-invitation
   * Révoquer une invitation logisticien (SEC-013)
   *
   * Body: {
   *   industrielId: string (obligatoire),
   *   reason: string (optionnel)
   * }
   */
  router.post('/:id/cancel-invitation', checkMongoDB, async (req, res) => {
    try {
      const logisticianId = req.params.id;
      const { industrielId, reason = 'manual' } = req.body;

      if (!industrielId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_INDUSTRIEL_ID', message: 'industrielId est requis' }
        });
      }

      const db = getDb();
      const logisticiansCollection = db.collection('logisticians');

      // Trouver le logisticien
      const logistician = await logisticiansCollection.findOne({
        _id: new ObjectId(logisticianId)
      });

      if (!logistician) {
        return res.status(404).json({
          success: false,
          error: { code: 'LOGISTICIAN_NOT_FOUND', message: 'Logisticien non trouvé' }
        });
      }

      // Vérifier que l'industriel est bien l'inviteur
      const relation = logistician.industrialClients?.find(
        c => c.industrialId.toString() === industrielId
      );

      if (!relation) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_INVITER', message: 'Vous n\'êtes pas l\'inviteur de ce logisticien' }
        });
      }

      // Vérifier que l'invitation n'est pas déjà acceptée (onboarding complété)
      if (logistician.status === LogisticianStatus.ACTIVE) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVITATION_ALREADY_ACCEPTED', message: 'L\'invitation a déjà été acceptée' }
        });
      }

      // Révoquer le token d'invitation si le service est disponible
      if (invitationTokenService && logistician.invitationToken) {
        await invitationTokenService.revokeToken(
          logistician.invitationToken,
          industrielId,
          reason
        );
      }

      // Mettre à jour le statut du logisticien
      const now = new Date();
      await logisticiansCollection.updateOne(
        { _id: new ObjectId(logisticianId) },
        {
          $set: {
            status: LogisticianStatus.CANCELLED,
            cancelledAt: now,
            cancelledBy: industrielId,
            cancelReason: reason
          },
          $pull: {
            industrialClients: { industrialId: new ObjectId(industrielId) }
          }
        }
      );

      // Enregistrer l'événement
      await logLogisticianEvent(db, logisticianId, LogisticianEventTypes.INVITATION_CANCELLED, {
        cancelledBy: industrielId,
        reason
      }, { type: 'industriel', id: industrielId });

      // Envoyer webhook de notification
      if (webhookService) {
        await webhookService.send(WebhookEvent.INVITATION_CANCELLED, {
          type: 'logisticien',
          id: logisticianId,
          email: logistician.email,
          companyName: logistician.companyName,
          cancelledAt: now,
          reason
        }, industrielId);
      }

      // Envoyer email de notification au logisticien
      if (sendLogisticianEmail) {
        try {
          await sendLogisticianEmail({
            to: logistician.email,
            subject: '[SYMPHONI.A] Invitation annulée',
            html: `
              <p>Bonjour,</p>
              <p>L'invitation à rejoindre la plateforme SYMPHONI.A a été annulée.</p>
              <p>Si vous avez des questions, contactez l'industriel qui vous a invité.</p>
              <p>Cordialement,<br>L'équipe SYMPHONI.A</p>
            `,
            text: `Bonjour,\n\nL'invitation à rejoindre la plateforme SYMPHONI.A a été annulée.\n\nSi vous avez des questions, contactez l'industriel qui vous a invité.\n\nCordialement,\nL'équipe SYMPHONI.A`
          });
        } catch (emailErr) {
          console.error('[LOGISTICIEN] Failed to send cancellation email:', emailErr);
        }
      }

      res.json({
        success: true,
        message: 'Invitation révoquée avec succès',
        data: {
          id: logisticianId,
          email: logistician.email,
          status: 'cancelled',
          cancelledAt: now
        }
      });

    } catch (error) {
      console.error('[POST /api/logisticians/:id/cancel-invitation] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('[LogisticienRoutes] Routes configured successfully');

  return router;
}

module.exports = createLogisticienRoutes;
