// Carrier Referencing Routes - API REST pour gestion transporteurs
// RT Backend Services - Version 2.5.2 - Security Enhancements

const express = require('express');
const { ObjectId } = require('mongodb');
const {
  CarrierStatus,
  ReferenceLevel,
  OnboardingMode,
  TransportTypes,
  VigilanceDocuments,
  vigilanceDocumentsConfig,
  calculateOverallScore,
  checkVigilanceStatus,
  canReceiveOrders,
  getDispatchPriority
} = require('./carrier-referencing-models');

// Security Enhancements v2.5.0 + SEC-013
const { RateLimiterManager } = require('./rate-limiter-middleware');
const { createInvitationTokenService, TokenType } = require('./invitation-token-service');
const { createWebhookService, WebhookEvent } = require('./webhook-service');

function createCarrierReferencingRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Security Services v2.5.0 + SEC-013
  let rateLimiterManager = null;
  let invitationTokenService = null;
  let webhookService = null;

  const initSecurityServices = async () => {
    if (mongoConnected && mongoClient) {
      try {
        const db = mongoClient.db();
        rateLimiterManager = new RateLimiterManager(db);
        invitationTokenService = createInvitationTokenService(mongoClient);
        webhookService = createWebhookService(mongoClient);
        console.log('[CARRIERS] Security services initialized (rate limiting, invitation tokens, webhooks)');
      } catch (error) {
        console.error('[CARRIERS] Failed to init security services:', error.message);
      }
    }
  };
  initSecurityServices();

  // Middleware pour vérifier MongoDB
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

  // Rate limiting pour invitations transporteurs
  const rateLimitInvite = async (req, res, next) => {
    if (!rateLimiterManager) return next();
    try {
      const key = req.body.industrialId || req.ip;
      await rateLimiterManager.consume('carriers:invite', key);
      next();
    } catch (rateLimiterRes) {
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many invitation requests. Please try again later.',
          retryAfter
        }
      });
    }
  };

  // ==================== RÉFÉRENCEMENT ====================

  /**
   * POST /api/carriers/invite
   * Inviter un transporteur (référencement direct)
   */
  router.post('/invite', rateLimitInvite, checkMongoDB, async (req, res) => {
    try {
      const {
        industrialId,
        companyName,
        siret,
        siren,
        country,
        email,
        phone,
        transportTypes,
        zones,
        referenceLevel
      } = req.body;

      if (!industrialId || !companyName || !siret || !email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: industrialId, companyName, siret, email'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      // Vérifier si le transporteur existe déjà
      let existingCarrier = await db.collection('carriers').findOne({ siret });

      if (existingCarrier) {
        // Vérifier si déjà référencé par cet industriel
        const alreadyReferenced = existingCarrier.industrialClients?.some(
          client => client.industrialId === industrialId
        );

        if (alreadyReferenced) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'ALREADY_REFERENCED',
              message: 'Carrier is already referenced by this industrial'
            }
          });
        }

        // Ajouter l'industriel à la liste
        await db.collection('carriers').updateOne(
          { _id: existingCarrier._id },
          {
            $push: {
              industrialClients: {
                industrialId,
                addedAt: now,
                addedBy: industrialId,
                referenceLevel: referenceLevel || ReferenceLevel.REFERENCED,
                dispatchChainPosition: null,
                isPriority: false,
                guaranteedVolume: null
              }
            },
            $set: { updatedAt: now }
          }
        );

        return res.json({
          success: true,
          data: existingCarrier,
          message: 'Carrier added to your network'
        });
      }

      // Créer un nouveau transporteur
      const carrierId = `CARR-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      const newCarrier = {
        carrierId,
        companyName,
        siret,
        siren: siren || siret.substring(0, 9),
        country: country || 'FR',
        contact: {
          email,
          phone: phone || '',
          address: {}
        },
        status: CarrierStatus.INVITED,
        referenceLevel: referenceLevel || ReferenceLevel.REFERENCED,
        onboardingMode: OnboardingMode.DIRECT_INVITATION,
        industrialClients: [{
          industrialId,
          addedAt: now,
          addedBy: industrialId,
          referenceLevel: referenceLevel || ReferenceLevel.REFERENCED,
          dispatchChainPosition: null,
          isPriority: false,
          guaranteedVolume: null
        }],
        transportTypes: transportTypes || [],
        zones: zones || [],
        vigilanceDocuments: {},
        vigilanceStatus: {
          isValid: false,
          lastCheck: now,
          expiringDocuments: [],
          expiredDocuments: [],
          missingDocuments: Object.keys(vigilanceDocumentsConfig)
            .filter(doc => vigilanceDocumentsConfig[doc].required)
            .map(doc => ({ type: doc, name: vigilanceDocumentsConfig[doc].name }))
        },
        pricingGrids: [],
        scoring: {
          overall: 0,
          punctualityLoading: 0,
          punctualityDelivery: 0,
          podSpeed: 0,
          trackingReactivity: 0,
          documentQuality: 0,
          cooperation: 0,
          totalMissions: 0,
          lastUpdated: now
        },
        missionHistory: [],
        statistics: {
          totalMissions: 0,
          completedMissions: 0,
          cancelledMissions: 0,
          averageResponseTime: 0,
          averageDeliveryTime: 0
        },
        isPremium: false,
        premiumFeatures: {},
        createdAt: now,
        updatedAt: now,
        invitedAt: now
      };

      const result = await db.collection('carriers').insertOne(newCarrier);

      // TODO: Envoyer email d'invitation

      res.status(201).json({
        success: true,
        data: {
          ...newCarrier,
          _id: result.insertedId
        },
        message: 'Carrier invited successfully',
        event: 'carrier.invited'
      });
    } catch (error) {
      console.error('Error inviting carrier:', error);
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
   * POST /api/carriers/:carrierId/onboard
   * Compléter l'onboarding d'un transporteur
   */
  router.post('/:carrierId/onboard', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { address, transportTypes, zones } = req.body;

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const now = new Date();

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $set: {
            'contact.address': address || {},
            transportTypes: transportTypes || carrier.transportTypes,
            zones: zones || carrier.zones,
            status: CarrierStatus.ONBOARDING,
            onboardedAt: now,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Onboarding completed',
        event: 'carrier.onboarded',
        nextSteps: Object.keys(vigilanceDocumentsConfig)
          .filter(doc => vigilanceDocumentsConfig[doc].required)
          .map(doc => vigilanceDocumentsConfig[doc].name)
      });
    } catch (error) {
      console.error('Error onboarding carrier:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== VIGILANCE ====================

  /**
   * POST /api/carriers/:carrierId/documents
   * Upload d'un document de vigilance
   */
  router.post('/:carrierId/documents', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { documentType, url, expiresAt } = req.body;

      if (!documentType || !url) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: documentType, url'
          }
        });
      }

      if (!VigilanceDocuments[documentType]) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DOCUMENT_TYPE',
            message: 'Invalid document type'
          }
        });
      }

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const now = new Date();
      const config = vigilanceDocumentsConfig[documentType];

      const document = {
        url,
        uploadedAt: now,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        verified: false,
        verifiedAt: null,
        verifiedBy: null
      };

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $set: {
            [`vigilanceDocuments.${documentType}`]: document,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      // Recalculer le statut de vigilance
      const vigilanceStatus = checkVigilanceStatus(result.value);
      await db.collection('carriers').updateOne(
        { carrierId },
        { $set: { vigilanceStatus } }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Document uploaded successfully',
        vigilanceStatus
      });
    } catch (error) {
      console.error('Error uploading document:', error);
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
   * POST /api/carriers/:carrierId/documents/:documentType/verify
   * Vérifier un document (admin)
   */
  router.post('/:carrierId/documents/:documentType/verify', checkMongoDB, async (req, res) => {
    try {
      const { carrierId, documentType } = req.params;
      const { verifiedBy } = req.body;

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      if (!carrier.vigilanceDocuments?.[documentType]) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'Document not found'
          }
        });
      }

      const now = new Date();

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $set: {
            [`vigilanceDocuments.${documentType}.verified`]: true,
            [`vigilanceDocuments.${documentType}.verifiedAt`]: now,
            [`vigilanceDocuments.${documentType}.verifiedBy`]: verifiedBy,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      // Recalculer vigilance et activer si tous documents OK
      const vigilanceStatus = checkVigilanceStatus(result.value);
      const updates = { vigilanceStatus };

      if (vigilanceStatus.isValid && result.value.status === CarrierStatus.ONBOARDING) {
        updates.status = CarrierStatus.ACTIVE;
      }

      await db.collection('carriers').updateOne(
        { carrierId },
        { $set: updates }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Document verified successfully',
        vigilanceStatus,
        event: vigilanceStatus.isValid ? 'carrier.vigilance.verified' : null
      });
    } catch (error) {
      console.error('Error verifying document:', error);
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
   * GET /api/carriers/:carrierId/vigilance
   * Vérifier le statut de vigilance
   */
  router.get('/:carrierId/vigilance', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const vigilanceStatus = checkVigilanceStatus(carrier);

      // Mettre à jour le statut dans la DB
      await db.collection('carriers').updateOne(
        { carrierId },
        { $set: { vigilanceStatus } }
      );

      res.json({
        success: true,
        data: vigilanceStatus,
        carrierStatus: carrier.status,
        documents: carrier.vigilanceDocuments
      });
    } catch (error) {
      console.error('Error checking vigilance:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== GRILLES TARIFAIRES ====================

  /**
   * POST /api/carriers/:carrierId/pricing-grid
   * Ajouter une grille tarifaire
   */
  router.post('/:carrierId/pricing-grid', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { type, zone, basePrice, pricePerKm, minPrice, options, validFrom, validTo } = req.body;

      if (!type || !zone) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: type, zone'
          }
        });
      }

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const now = new Date();

      const pricingGrid = {
        type,
        zone,
        basePrice: basePrice || 0,
        pricePerKm: pricePerKm || 0,
        minPrice: minPrice || 0,
        options: options || {},
        validFrom: validFrom ? new Date(validFrom) : now,
        validTo: validTo ? new Date(validTo) : null,
        uploadedAt: now
      };

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $push: { pricingGrids: pricingGrid },
          $set: { updatedAt: now }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Pricing grid added successfully',
        event: 'carrier.grid.updated'
      });
    } catch (error) {
      console.error('Error adding pricing grid:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== SCORING ====================

  /**
   * POST /api/carriers/:carrierId/score
   * Mettre à jour le scoring après une mission
   */
  router.post('/:carrierId/score', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const {
        missionId,
        punctualityLoading,
        punctualityDelivery,
        podSpeed,
        trackingReactivity,
        documentQuality,
        cooperation
      } = req.body;

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      const now = new Date();

      // Calculer les nouveaux scores (moyenne pondérée)
      const totalMissions = carrier.scoring.totalMissions + 1;
      const weight = 1 / totalMissions;
      const oldWeight = 1 - weight;

      const newScores = {
        punctualityLoading: Math.round(
          carrier.scoring.punctualityLoading * oldWeight + punctualityLoading * weight
        ),
        punctualityDelivery: Math.round(
          carrier.scoring.punctualityDelivery * oldWeight + punctualityDelivery * weight
        ),
        podSpeed: Math.round(
          carrier.scoring.podSpeed * oldWeight + podSpeed * weight
        ),
        trackingReactivity: Math.round(
          carrier.scoring.trackingReactivity * oldWeight + trackingReactivity * weight
        ),
        documentQuality: Math.round(
          carrier.scoring.documentQuality * oldWeight + documentQuality * weight
        ),
        cooperation: Math.round(
          carrier.scoring.cooperation * oldWeight + cooperation * weight
        )
      };

      const overall = calculateOverallScore(newScores);

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $set: {
            'scoring.overall': overall,
            'scoring.punctualityLoading': newScores.punctualityLoading,
            'scoring.punctualityDelivery': newScores.punctualityDelivery,
            'scoring.podSpeed': newScores.podSpeed,
            'scoring.trackingReactivity': newScores.trackingReactivity,
            'scoring.documentQuality': newScores.documentQuality,
            'scoring.cooperation': newScores.cooperation,
            'scoring.totalMissions': totalMissions,
            'scoring.lastUpdated': now,
            updatedAt: now
          },
          $push: {
            missionHistory: {
              missionId,
              completedAt: now,
              rating: overall,
              scores: newScores
            }
          },
          $inc: {
            'statistics.totalMissions': 1,
            'statistics.completedMissions': 1
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Scoring updated successfully',
        event: 'carrier.scored',
        newScore: overall
      });
    } catch (error) {
      console.error('Error updating score:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== GESTION ====================

  /**
   * GET /api/carriers
   * Liste des transporteurs d'un industriel
   */
  router.get('/', checkMongoDB, async (req, res) => {
    try {
      const { industrialId, referenceLevel, status, minScore } = req.query;

      if (!industrialId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required parameter: industrialId'
          }
        });
      }

      const db = mongoClient.db();
      const query = {
        'industrialClients.industrialId': industrialId
      };

      if (referenceLevel) {
        query['industrialClients.referenceLevel'] = referenceLevel;
      }

      if (status) {
        query.status = status;
      }

      if (minScore) {
        query['scoring.overall'] = { $gte: parseInt(minScore) };
      }

      const carriers = await db.collection('carriers')
        .find(query)
        .sort({ 'scoring.overall': -1 })
        .toArray();

      res.json({
        success: true,
        data: carriers,
        count: carriers.length
      });
    } catch (error) {
      console.error('Error fetching carriers:', error);
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
   * GET /api/carriers/:carrierId
   * Détails d'un transporteur
   */
  router.get('/:carrierId', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;

      const db = mongoClient.db();
      const carrier = await db.collection('carriers').findOne({ carrierId });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      // Vérifier les capacités
      const capabilities = canReceiveOrders(carrier);

      res.json({
        success: true,
        data: {
          ...carrier,
          capabilities
        }
      });
    } catch (error) {
      console.error('Error fetching carrier:', error);
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
   * PUT /api/carriers/:carrierId/reference-level
   * Modifier le niveau de référencement
   */
  router.put('/:carrierId/reference-level', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { industrialId, referenceLevel } = req.body;

      if (!industrialId || !referenceLevel) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: industrialId, referenceLevel'
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('carriers').findOneAndUpdate(
        {
          carrierId,
          'industrialClients.industrialId': industrialId
        },
        {
          $set: {
            'industrialClients.$.referenceLevel': referenceLevel,
            'industrialClients.$.isPriority': referenceLevel === ReferenceLevel.HIGH_PRIORITY,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier or relationship not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Reference level updated',
        event: referenceLevel === ReferenceLevel.HIGH_PRIORITY ? 'carrier.set.high-priority' : null
      });
    } catch (error) {
      console.error('Error updating reference level:', error);
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
   * POST /api/carriers/:carrierId/upgrade-premium
   * Upgrade vers Premium
   */
  router.post('/:carrierId/upgrade-premium', checkMongoDB, async (req, res) => {
    try {
      const { carrierId } = req.params;

      const db = mongoClient.db();
      const now = new Date();

      const result = await db.collection('carriers').findOneAndUpdate(
        { carrierId },
        {
          $set: {
            isPremium: true,
            premiumSince: now,
            'premiumFeatures.advancedPlanning': true,
            'premiumFeatures.affretIaAccess': true,
            'premiumFeatures.autoReferencing': true,
            'premiumFeatures.verifiedBadge': true,
            status: CarrierStatus.PREMIUM,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      if (!result.value) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Carrier not found'
          }
        });
      }

      res.json({
        success: true,
        data: result.value,
        message: 'Carrier upgraded to Premium',
        event: 'carrier.upgraded.premium'
      });
    } catch (error) {
      console.error('Error upgrading to premium:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== REVOCATION D'INVITATION ====================

  /**
   * POST /api/carriers/:id/cancel-invitation
   * Révoquer une invitation transporteur (SEC-013)
   *
   * Body: {
   *   industrialId: string (obligatoire),
   *   reason: string (optionnel)
   * }
   */
  router.post('/:id/cancel-invitation', checkMongoDB, async (req, res) => {
    try {
      const carrierId = req.params.id;
      const { industrialId, reason = 'manual' } = req.body;

      if (!industrialId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_INDUSTRIAL_ID', message: 'industrialId est requis' }
        });
      }

      const db = mongoClient.db();
      const carriersCollection = db.collection('carriers');

      // Trouver le transporteur
      const carrier = await carriersCollection.findOne({
        _id: new ObjectId(carrierId)
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: { code: 'CARRIER_NOT_FOUND', message: 'Transporteur non trouvé' }
        });
      }

      // Vérifier que l'industriel est bien l'inviteur
      if (carrier.industrialId?.toString() !== industrialId) {
        return res.status(403).json({
          success: false,
          error: { code: 'NOT_INVITER', message: 'Vous n\'êtes pas l\'inviteur de ce transporteur' }
        });
      }

      // Vérifier que l'invitation n'est pas déjà acceptée
      if (carrier.status === CarrierStatus.ACTIVE || carrier.status === CarrierStatus.VERIFIED) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVITATION_ALREADY_ACCEPTED', message: 'L\'invitation a déjà été acceptée' }
        });
      }

      // Révoquer le token d'invitation si le service est disponible
      if (invitationTokenService && carrier.invitationToken) {
        await invitationTokenService.revokeToken(
          carrier.invitationToken,
          industrialId,
          reason
        );
      }

      // Mettre à jour le statut du transporteur
      const now = new Date();
      await carriersCollection.updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            status: CarrierStatus.CANCELLED,
            cancelledAt: now,
            cancelledBy: industrialId,
            cancelReason: reason
          }
        }
      );

      // Envoyer webhook de notification
      if (webhookService) {
        await webhookService.send(WebhookEvent.INVITATION_CANCELLED, {
          type: 'carrier',
          id: carrierId,
          email: carrier.email,
          companyName: carrier.companyName,
          cancelledAt: now,
          reason
        }, industrialId);
      }

      res.json({
        success: true,
        message: 'Invitation révoquée avec succès',
        data: {
          id: carrierId,
          email: carrier.email,
          status: 'cancelled',
          cancelledAt: now
        }
      });

    } catch (error) {
      console.error('[POST /api/carriers/:id/cancel-invitation] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = createCarrierReferencingRoutes;
