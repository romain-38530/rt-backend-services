/**
 * AFFRET.IA - Module d'Affrètement Intelligent Automatisé
 * Routes API
 * Version: 1.0.0
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const affretiaService = require('./affretia-service');
const {
  TriggerTypes,
  TriggerReasons,
  AffretiaStatus,
  ResponseTypes,
  RejectionReasons,
  TrackingLevels,
  DocumentTypes
} = require('./affretia-models');

/**
 * Configure les routes AFFRET.IA
 * @param {Express.Application} app - L'application Express
 * @param {Db} db - La connexion MongoDB
 * @param {Function} authenticateToken - Middleware d'authentification
 */
function configureAffretiaRoutes(app, db, authenticateToken) {

  // ============================================================================
  // ROUTES PRINCIPALES
  // ============================================================================

  /**
   * POST /api/affretia/trigger
   * Déclenche une session AFFRET.IA pour une commande
   */
  app.post('/api/affretia/trigger', authenticateToken, async (req, res) => {
    try {
      const {
        transportOrderId,
        triggerType,
        triggerReason,
        context
      } = req.body;

      if (!transportOrderId) {
        return res.status(400).json({
          success: false,
          error: 'transportOrderId requis'
        });
      }

      const session = await affretiaService.triggerAffretia(db, {
        transportOrderId,
        organizationId: req.user.organizationId,
        triggerType: triggerType || TriggerTypes.MANUAL_ACTIVATION,
        triggerReason: triggerReason || TriggerReasons.OTHER,
        triggeredBy: req.user.userId,
        context
      });

      res.status(201).json({
        success: true,
        message: 'Session AFFRET.IA créée',
        data: {
          sessionId: session.sessionId,
          status: session.status,
          transportOrderId: session.transportOrderId
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur trigger:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/analyze/:sessionId
   * Lance l'analyse IA et génère la shortlist
   */
  app.post('/api/affretia/analyze/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const result = await affretiaService.analyzeAndGenerateShortlist(db, sessionId);

      res.json({
        success: true,
        message: 'Analyse terminée',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur analyse:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/broadcast/:sessionId
   * Diffuse la demande aux transporteurs
   */
  app.post('/api/affretia/broadcast/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const {
        channels,
        expiresInMinutes,
        customMessage
      } = req.body;

      const result = await affretiaService.broadcastRequest(db, sessionId, {
        channels,
        expiresInMinutes,
        customMessage
      });

      res.json({
        success: true,
        message: 'Diffusion envoyée',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur broadcast:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/response/:sessionId
   * Enregistre une réponse de transporteur
   */
  app.post('/api/affretia/response/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const {
        carrierId,
        responseType,
        price,
        counterOfferPrice,
        availability,
        vehicleInfo,
        rejectionReason,
        comments
      } = req.body;

      if (!carrierId || !responseType) {
        return res.status(400).json({
          success: false,
          error: 'carrierId et responseType requis'
        });
      }

      if (!Object.values(ResponseTypes).includes(responseType)) {
        return res.status(400).json({
          success: false,
          error: 'responseType invalide',
          validTypes: Object.values(ResponseTypes)
        });
      }

      const result = await affretiaService.recordResponse(db, sessionId, {
        carrierId,
        responseType,
        price,
        counterOfferPrice,
        availability,
        vehicleInfo,
        rejectionReason,
        comments
      });

      res.json({
        success: true,
        message: 'Réponse enregistrée',
        data: {
          carrierId: result.carrierId,
          responseType: result.responseType,
          score: result.score
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur response:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/select/:sessionId
   * Sélectionne le meilleur transporteur
   */
  app.post('/api/affretia/select/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { manualSelection, selectedCarrierId } = req.body;

      const result = await affretiaService.selectBestCarrier(db, sessionId, {
        manualSelection,
        selectedCarrierId
      });

      res.json({
        success: true,
        message: 'Transporteur sélectionné',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur select:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/assign/:sessionId
   * Attribue la mission au transporteur sélectionné
   */
  app.post('/api/affretia/assign/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { trackingLevel } = req.body;

      const result = await affretiaService.assignToCarrier(db, sessionId, {
        trackingLevel: trackingLevel || TrackingLevels.BASIC.key
      });

      res.json({
        success: true,
        message: 'Mission attribuée',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur assign:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES TRACKING
  // ============================================================================

  /**
   * POST /api/affretia/tracking/activate/:sessionId
   * Active le tracking pour une session
   */
  app.post('/api/affretia/tracking/activate/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const result = await affretiaService.activateTracking(db, sessionId);

      res.json({
        success: true,
        message: 'Tracking activé',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur activate tracking:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/tracking/position/:sessionId
   * Met à jour la position de tracking
   */
  app.post('/api/affretia/tracking/position/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { token, lat, lng, speed, heading, timestamp } = req.body;

      // SECURITY: Vérifier que le token est fourni
      if (!token || typeof token !== 'string' || token.length < 10) {
        return res.status(401).json({
          success: false,
          error: 'Token de tracking requis'
        });
      }

      // Vérifier le token
      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      // SECURITY: Vérification stricte du token de tracking
      if (!session.tracking?.token || session.tracking.token !== token) {
        console.warn(`[AFFRET.IA] Invalid tracking token attempt for session ${sessionId}`);
        return res.status(401).json({
          success: false,
          error: 'Token de tracking invalide'
        });
      }

      if (!lat || !lng) {
        return res.status(400).json({
          success: false,
          error: 'lat et lng requis'
        });
      }

      await affretiaService.updateTrackingPosition(db, sessionId, {
        lat,
        lng,
        speed,
        heading,
        timestamp
      });

      res.json({
        success: true,
        message: 'Position enregistrée'
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur tracking position:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/tracking/geofence/:sessionId
   * Enregistre un événement de géofence
   */
  app.post('/api/affretia/tracking/geofence/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { token, type, location, coordinates } = req.body;

      // SECURITY: Vérifier que le token est fourni
      if (!token || typeof token !== 'string' || token.length < 10) {
        return res.status(401).json({
          success: false,
          error: 'Token de tracking requis'
        });
      }

      // Vérifier le token
      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      // SECURITY: Vérification stricte du token de tracking
      if (!session.tracking?.token || session.tracking.token !== token) {
        console.warn(`[AFFRET.IA] Invalid geofence token attempt for session ${sessionId}`);
        return res.status(401).json({
          success: false,
          error: 'Token de tracking invalide'
        });
      }

      await affretiaService.recordGeofenceEvent(db, sessionId, {
        type,
        location,
        coordinates
      });

      res.json({
        success: true,
        message: 'Événement géofence enregistré'
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur geofence:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES DOCUMENTS
  // ============================================================================

  /**
   * POST /api/affretia/documents/:sessionId
   * Upload un document
   */
  app.post('/api/affretia/documents/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { type, fileUrl, metadata } = req.body;

      if (!type || !fileUrl) {
        return res.status(400).json({
          success: false,
          error: 'type et fileUrl requis'
        });
      }

      if (!Object.values(DocumentTypes).includes(type)) {
        return res.status(400).json({
          success: false,
          error: 'Type de document invalide',
          validTypes: Object.values(DocumentTypes)
        });
      }

      const result = await affretiaService.uploadDocument(db, sessionId, {
        type,
        fileUrl,
        uploadedBy: req.user.userId,
        metadata
      });

      res.status(201).json({
        success: true,
        message: 'Document uploadé',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur upload document:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/documents/:sessionId
   * Liste les documents d'une session
   */
  app.get('/api/affretia/documents/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          documents: session.documents || []
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur liste documents:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES VIGILANCE ET SCORING
  // ============================================================================

  /**
   * POST /api/affretia/vigilance/:sessionId
   * Effectue la vérification de vigilance
   */
  app.post('/api/affretia/vigilance/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const result = await affretiaService.performVigilanceCheck(db, sessionId);

      res.json({
        success: true,
        message: 'Vérification vigilance effectuée',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur vigilance:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/scoring/:sessionId
   * Calcule le scoring final
   */
  app.post('/api/affretia/scoring/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { onTimeDelivery, communication, comments } = req.body;

      const result = await affretiaService.calculateFinalScoring(db, sessionId, {
        onTimeDelivery,
        communication,
        comments
      });

      res.json({
        success: true,
        message: 'Scoring calculé',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur scoring:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/close/:sessionId
   * Clôture une session AFFRET.IA
   */
  app.post('/api/affretia/close/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { status } = req.body;

      const validStatuses = [AffretiaStatus.COMPLETED, AffretiaStatus.CANCELLED, AffretiaStatus.FAILED];

      const result = await affretiaService.closeSession(
        db,
        sessionId,
        validStatuses.includes(status) ? status : AffretiaStatus.COMPLETED
      );

      res.json({
        success: true,
        message: 'Session clôturée',
        data: result
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur close:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES DE CONSULTATION
  // ============================================================================

  /**
   * GET /api/affretia/session/:sessionId
   * Récupère les détails d'une session
   */
  app.get('/api/affretia/session/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      res.json({
        success: true,
        data: session
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur get session:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/sessions
   * Liste les sessions AFFRET.IA
   */
  app.get('/api/affretia/sessions', authenticateToken, async (req, res) => {
    try {
      const { status, transportOrderId, limit = 50, offset = 0 } = req.query;

      const query = {
        organizationId: new ObjectId(req.user.organizationId)
      };

      if (status) {
        query.status = status;
      }

      if (transportOrderId) {
        query.transportOrderId = new ObjectId(transportOrderId);
      }

      const sessions = await db.collection('affretia_sessions')
        .find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('affretia_sessions').countDocuments(query);

      res.json({
        success: true,
        data: {
          sessions,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur list sessions:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/sessions/active
   * Liste les sessions actives
   */
  app.get('/api/affretia/sessions/active', authenticateToken, async (req, res) => {
    try {
      const sessions = await affretiaService.getActiveSessions(db, req.user.organizationId);

      res.json({
        success: true,
        data: {
          count: sessions.length,
          sessions
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur active sessions:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/order/:transportOrderId
   * Récupère les sessions d'une commande
   */
  app.get('/api/affretia/order/:transportOrderId', authenticateToken, async (req, res) => {
    try {
      const { transportOrderId } = req.params;

      const sessions = await affretiaService.getSessionsByOrder(db, transportOrderId);

      res.json({
        success: true,
        data: {
          transportOrderId,
          sessions
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur sessions by order:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/shortlist/:sessionId
   * Récupère la shortlist d'une session
   */
  app.get('/api/affretia/shortlist/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          shortlistCount: session.shortlist?.length || 0,
          shortlist: session.shortlist || []
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur get shortlist:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/responses/:sessionId
   * Récupère les réponses d'une session
   */
  app.get('/api/affretia/responses/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          responsesCount: session.responses?.length || 0,
          responses: session.responses || [],
          acceptedCount: (session.responses || []).filter(r =>
            r.responseType === ResponseTypes.ACCEPT ||
            (r.responseType === ResponseTypes.COUNTER_OFFER && !r.negotiationNeeded)
          ).length
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur get responses:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /api/affretia/tracking/:sessionId
   * Récupère les données de tracking
   */
  app.get('/api/affretia/tracking/:sessionId', authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.params;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session non trouvée'
        });
      }

      res.json({
        success: true,
        data: {
          sessionId,
          tracking: session.tracking || null
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur get tracking:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES STATISTIQUES
  // ============================================================================

  /**
   * GET /api/affretia/stats
   * Statistiques globales AFFRET.IA
   */
  app.get('/api/affretia/stats', authenticateToken, async (req, res) => {
    try {
      const organizationId = new ObjectId(req.user.organizationId);

      const pipeline = [
        { $match: { organizationId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ];

      const statusStats = await db.collection('affretia_sessions')
        .aggregate(pipeline)
        .toArray();

      const totalSessions = await db.collection('affretia_sessions')
        .countDocuments({ organizationId });

      const completedSessions = await db.collection('affretia_sessions')
        .countDocuments({ organizationId, status: AffretiaStatus.COMPLETED });

      const avgScorePipeline = [
        { $match: { organizationId, status: AffretiaStatus.COMPLETED } },
        {
          $group: {
            _id: null,
            avgScore: { $avg: '$finalScoring.overallScore' },
            avgPrice: { $avg: '$selection.finalPrice' },
            avgResponseTime: { $avg: { $subtract: ['$selection.selectedAt', '$broadcast.startedAt'] } }
          }
        }
      ];

      const avgStats = await db.collection('affretia_sessions')
        .aggregate(avgScorePipeline)
        .toArray();

      res.json({
        success: true,
        data: {
          totalSessions,
          completedSessions,
          statusDistribution: statusStats.reduce((acc, s) => {
            acc[s._id] = s.count;
            return acc;
          }, {}),
          averages: avgStats[0] || {
            avgScore: null,
            avgPrice: null,
            avgResponseTime: null
          }
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur stats:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ROUTES PUBLIQUES (POUR TRANSPORTEURS EXTERNES)
  // ============================================================================

  /**
   * GET /api/affretia/public/request/:sessionId
   * Consultation publique d'une demande (pour transporteurs)
   */
  app.get('/api/affretia/public/request/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { token } = req.query;

      const session = await affretiaService.getSession(db, sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Demande non trouvée'
        });
      }

      // Vérifier si la diffusion est encore active
      if (session.broadcast?.expiresAt && new Date() > session.broadcast.expiresAt) {
        return res.status(410).json({
          success: false,
          error: 'Cette demande a expiré'
        });
      }

      // Retourner les infos publiques uniquement
      res.json({
        success: true,
        data: {
          sessionId: session.sessionId,
          reference: session.mission.reference,
          origin: {
            city: session.mission.origin?.city,
            country: session.mission.origin?.country
          },
          destination: {
            city: session.mission.destination?.city,
            country: session.mission.destination?.country
          },
          pickupDate: session.mission.pickupDate,
          deliveryDate: session.mission.deliveryDate,
          goods: {
            description: session.mission.goods?.description,
            weight: session.mission.goods?.weight,
            volume: session.mission.goods?.volume
          },
          requirements: session.mission.requirements,
          budget: session.mission.budget?.initial ? 'Sur demande' : null,
          expiresAt: session.broadcast?.expiresAt
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur public request:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/affretia/public/respond/:sessionId
   * Réponse publique d'un transporteur externe
   */
  app.post('/api/affretia/public/respond/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const {
        carrierToken,
        responseType,
        price,
        counterOfferPrice,
        availability,
        vehicleInfo,
        rejectionReason,
        comments
      } = req.body;

      if (!carrierToken) {
        return res.status(401).json({
          success: false,
          error: 'Token transporteur requis'
        });
      }

      // Vérifier le token transporteur
      const carrier = await db.collection('carriers').findOne({
        'tokens.affretia': carrierToken
      });

      if (!carrier) {
        return res.status(401).json({
          success: false,
          error: 'Token transporteur invalide'
        });
      }

      const result = await affretiaService.recordResponse(db, sessionId, {
        carrierId: carrier._id,
        responseType,
        price,
        counterOfferPrice,
        availability,
        vehicleInfo,
        rejectionReason,
        comments
      });

      res.json({
        success: true,
        message: 'Réponse enregistrée avec succès',
        data: {
          responseType: result.responseType,
          receivedAt: result.receivedAt
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur public respond:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // WORKFLOW AUTOMATIQUE (OPTIONNEL)
  // ============================================================================

  /**
   * POST /api/affretia/workflow/auto/:transportOrderId
   * Lance le workflow complet automatique
   */
  app.post('/api/affretia/workflow/auto/:transportOrderId', authenticateToken, async (req, res) => {
    try {
      const { transportOrderId } = req.params;
      const {
        triggerType,
        triggerReason,
        broadcastChannels,
        broadcastDuration,
        trackingLevel
      } = req.body;

      // 1. Trigger
      const session = await affretiaService.triggerAffretia(db, {
        transportOrderId,
        organizationId: req.user.organizationId,
        triggerType: triggerType || TriggerTypes.MANUAL_ACTIVATION,
        triggerReason: triggerReason || TriggerReasons.OTHER,
        triggeredBy: req.user.userId
      });

      // 2. Analyze
      const analysis = await affretiaService.analyzeAndGenerateShortlist(db, session.sessionId);

      // 3. Broadcast
      const broadcast = await affretiaService.broadcastRequest(db, session.sessionId, {
        channels: broadcastChannels,
        expiresInMinutes: broadcastDuration
      });

      res.json({
        success: true,
        message: 'Workflow AFFRET.IA lancé',
        data: {
          sessionId: session.sessionId,
          status: 'awaiting_responses',
          shortlistCount: analysis.shortlistCount,
          broadcastedTo: broadcast.broadcastedTo,
          expiresAt: broadcast.expiresAt
        }
      });

    } catch (error) {
      console.error('[AFFRET.IA] Erreur workflow auto:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // CONSTANTES (pour le frontend)
  // ============================================================================

  /**
   * GET /api/affretia/constants
   * Retourne les constantes pour le frontend
   */
  app.get('/api/affretia/constants', (req, res) => {
    res.json({
      success: true,
      data: {
        triggerTypes: TriggerTypes,
        triggerReasons: TriggerReasons,
        statuses: AffretiaStatus,
        responseTypes: ResponseTypes,
        rejectionReasons: RejectionReasons,
        trackingLevels: TrackingLevels,
        documentTypes: DocumentTypes,
        config: {
          maxPriceIncrease: affretiaService.CONFIG.limits.maxPriceIncrease,
          broadcastDuration: affretiaService.CONFIG.timeouts.broadcastDuration,
          responseTimeout: affretiaService.CONFIG.timeouts.responseTimeout
        }
      }
    });
  });

  console.log('[AFFRET.IA] Routes configurées');
}

module.exports = { configureAffretiaRoutes };
