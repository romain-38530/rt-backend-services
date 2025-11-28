/**
 * Controller AFFRET.IA API v2
 * Gere tous les endpoints du module d'affretement intelligent
 */

const axios = require('axios');
const AffretSession = require('../models/AffretSession');
const CarrierProposal = require('../models/CarrierProposal');
const BroadcastCampaign = require('../models/BroadcastCampaign');
const VigilanceCheck = require('../models/VigilanceCheck');
const AIScoringEngine = require('../modules/ai-scoring-engine');
const broadcastService = require('../services/broadcast.service');
const negotiationService = require('../services/negotiation.service');

const scoringEngine = new AIScoringEngine();

// ==================== SESSION MANAGEMENT ====================

/**
 * POST /api/v1/affretia/trigger
 * Declencher AFFRET.IA pour une commande
 */
exports.triggerAffretIA = async (req, res) => {
  try {
    const { orderId, triggerType, reason, userId, organizationId } = req.body;

    if (!orderId || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'orderId and organizationId are required'
      });
    }

    // Generer un sessionId unique
    const sessionId = await AffretSession.generateSessionId();

    // Creer la session
    const session = new AffretSession({
      sessionId,
      orderId,
      organizationId,
      trigger: {
        type: triggerType || 'manual',
        reason: reason || 'Declenchement manuel',
        triggeredBy: userId,
        triggeredAt: new Date()
      },
      status: 'analyzing',
      negotiationSettings: {
        maxPriceIncrease: parseFloat(process.env.AFFRET_MAX_PRICE_INCREASE) || 15,
        autoAcceptThreshold: parseFloat(process.env.AFFRET_AUTO_ACCEPT_THRESHOLD) || 0,
        timeout: parseFloat(process.env.AFFRET_RESPONSE_TIMEOUT) || 24
      }
    });

    session.addTimelineEvent('session_created', {
      triggerType,
      reason
    }, userId);

    await session.save();

    // Emettre evenement WebSocket
    global.emitEvent?.('affret.session.created', {
      sessionId,
      orderId,
      organizationId
    });

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        status: session.status,
        createdAt: session.createdAt
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error triggering AFFRET.IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/session/:id
 * Obtenir les details d'une session
 */
exports.getSession = async (req, res) => {
  try {
    const session = await AffretSession.findOne({ sessionId: req.params.id });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/sessions
 * Liste des sessions AFFRET.IA
 */
exports.getSessions = async (req, res) => {
  try {
    const { status, organizationId, dateFrom, dateTo, limit = 50 } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (organizationId) filters.organizationId = organizationId;

    if (dateFrom || dateTo) {
      filters.createdAt = {};
      if (dateFrom) filters.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filters.createdAt.$lte = new Date(dateTo);
    }

    const sessions = await AffretSession.find(filters)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== ANALYSE IA ====================

/**
 * POST /api/v1/affretia/analyze
 * Lancer l'analyse IA d'une commande
 */
exports.analyzeOrder = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Recuperer les details de la commande
    const orderResponse = await axios.get(
      `${process.env.ORDERS_API_URL}/api/v1/orders/${session.orderId}`
    );

    const order = orderResponse.data.data;

    // Analyser la complexite
    const complexityAnalysis = await scoringEngine.analyzeOrderComplexity(order);

    // Rechercher les transporteurs disponibles
    const carriersResponse = await axios.post(
      `${process.env.CARRIERS_API_URL}/api/v1/carriers/search`,
      {
        pickupPostalCode: order.pickup?.postalCode,
        deliveryPostalCode: order.delivery?.postalCode,
        pickupDate: order.pickupDate,
        vehicleType: order.vehicleType,
        cargoType: order.cargo?.type
      }
    );

    const availableCarriers = carriersResponse.data.data || [];

    // Generer la shortlist intelligente
    const shortlistSize = parseInt(process.env.AFFRET_SHORTLIST_SIZE) || 10;
    const shortlist = await scoringEngine.generateShortlist(
      order,
      availableCarriers,
      shortlistSize
    );

    // Estimer le prix
    const estimatedPrice = await scoringEngine.estimatePrice(order, availableCarriers[0] || {});

    // Mettre a jour la session
    session.status = 'shortlist_created';
    session.analysis = {
      complexity: complexityAnalysis.complexity,
      constraints: complexityAnalysis.factors.map(f => f.factor),
      estimatedPrice,
      suggestedCarriers: shortlist.length,
      analyzedAt: new Date(),
      criteria: {
        distance: order.distance,
        weight: order.cargo?.weight?.value,
        volume: order.cargo?.volume?.value,
        vehicleType: order.vehicleType,
        specialRequirements: order.services ? Object.keys(order.services).filter(k => order.services[k]) : []
      }
    };
    session.shortlist = shortlist;
    session.addTimelineEvent('analysis_completed', {
      complexity: complexityAnalysis.complexity,
      category: complexityAnalysis.category,
      estimatedPrice,
      shortlistSize: shortlist.length
    });

    session.updateMetrics();
    await session.save();

    // Emettre evenement
    global.emitEvent?.('affret.analysis.completed', {
      sessionId,
      complexity: complexityAnalysis.complexity,
      shortlistSize: shortlist.length
    });

    res.json({
      success: true,
      data: {
        complexity: complexityAnalysis.complexity,
        category: complexityAnalysis.category,
        factors: complexityAnalysis.factors,
        estimatedPrice,
        shortlist
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error analyzing order:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== DIFFUSION ====================

/**
 * POST /api/v1/affretia/broadcast
 * Lancer la diffusion multi-canal
 */
exports.broadcastToCarriers = async (req, res) => {
  try {
    const { sessionId, channels = ['email', 'bourse', 'push'], carrierIds } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Recuperer la commande
    const orderResponse = await axios.get(
      `${process.env.ORDERS_API_URL}/api/v1/orders/${session.orderId}`
    );
    const order = orderResponse.data.data;

    // Determiner les transporteurs a contacter
    let targetCarriers = session.shortlist;
    if (carrierIds && carrierIds.length > 0) {
      targetCarriers = session.shortlist.filter(c => carrierIds.includes(c.carrierId));
    }

    // Creer la campagne de diffusion
    const campaign = await broadcastService.createBroadcastCampaign(
      sessionId,
      session.orderId,
      session.organizationId,
      targetCarriers,
      channels
    );

    // Executer la diffusion
    const broadcastResult = await broadcastService.executeBroadcast(campaign, order);

    // Mettre a jour la session
    session.status = 'awaiting_responses';
    session.broadcast = {
      channels: campaign.channels,
      totalRecipients: campaign.recipients.length,
      startedAt: campaign.startedAt,
      completedAt: campaign.completedAt,
      campaignId: campaign.campaignId
    };
    session.addTimelineEvent('broadcast_completed', {
      campaignId: campaign.campaignId,
      channels,
      recipientsCount: campaign.recipients.length,
      results: broadcastResult.results
    });

    await session.save();

    // Emettre evenement
    global.emitEvent?.('affret.broadcast.completed', {
      sessionId,
      campaignId: campaign.campaignId,
      recipientsCount: campaign.recipients.length
    });

    res.json({
      success: true,
      data: {
        campaignId: campaign.campaignId,
        recipientsCount: campaign.recipients.length,
        channels: broadcastResult.results
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error broadcasting:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== BOURSE PUBLIQUE ====================

/**
 * GET /api/v1/affretia/bourse
 * Consulter les offres disponibles (endpoint public)
 */
exports.getBourseOffers = async (req, res) => {
  try {
    const {
      postalCodePickup,
      postalCodeDelivery,
      pickupDateFrom,
      pickupDateTo,
      vehicleType,
      limit = 50
    } = req.query;

    // Trouver les campagnes actives sur la bourse
    const filters = {
      'boursePublication.published': true,
      'boursePublication.expiresAt': { $gte: new Date() },
      status: { $in: ['sent', 'completed'] }
    };

    const campaigns = await BroadcastCampaign.find(filters)
      .limit(parseInt(limit))
      .sort({ 'boursePublication.publishedAt': -1 });

    const offers = [];

    for (const campaign of campaigns) {
      const session = await AffretSession.findOne({ sessionId: campaign.sessionId });
      if (!session) continue;

      // Recuperer les details de la commande
      try {
        const orderResponse = await axios.get(
          `${process.env.ORDERS_API_URL}/api/v1/orders/${session.orderId}`
        );
        const order = orderResponse.data.data;

        // Filtres
        if (postalCodePickup && !order.pickup?.postalCode?.startsWith(postalCodePickup)) continue;
        if (postalCodeDelivery && !order.delivery?.postalCode?.startsWith(postalCodeDelivery)) continue;
        if (vehicleType && order.vehicleType !== vehicleType) continue;

        offers.push({
          sessionId: session.sessionId,
          orderId: session.orderId,
          pickupCity: order.pickup?.city,
          pickupPostalCode: order.pickup?.postalCode,
          deliveryCity: order.delivery?.city,
          deliveryPostalCode: order.delivery?.postalCode,
          pickupDate: order.pickupDate,
          cargo: {
            type: order.cargo?.type,
            quantity: order.cargo?.quantity,
            weight: order.cargo?.weight?.value
          },
          vehicleType: order.vehicleType,
          estimatedPrice: session.analysis?.estimatedPrice,
          validUntil: campaign.boursePublication.expiresAt,
          url: campaign.boursePublication.url
        });

      } catch (error) {
        console.warn(`[BOURSE] Could not fetch order ${session.orderId}:`, error.message);
      }
    }

    res.json({
      success: true,
      data: offers,
      count: offers.length
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting bourse offers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/affretia/bourse/submit
 * Soumettre une proposition via la bourse
 */
exports.submitBourseProposal = async (req, res) => {
  try {
    const {
      sessionId,
      carrierId,
      carrierName,
      proposedPrice,
      vehicleType,
      vehiclePlate,
      driverName,
      driverPhone,
      driverEmail,
      estimatedPickupDate,
      estimatedDeliveryDate,
      services
    } = req.body;

    if (!sessionId || !carrierId || !proposedPrice) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, carrierId, and proposedPrice are required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Creer la proposition
    const proposal = new CarrierProposal({
      sessionId,
      orderId: session.orderId,
      carrierId,
      carrierName: carrierName || `Carrier ${carrierId}`,
      proposedPrice,
      vehicleType,
      vehiclePlate,
      driverName,
      driverPhone,
      driverEmail,
      estimatedPickupDate,
      estimatedDeliveryDate,
      services: services || {},
      source: 'bourse',
      submittedAt: new Date()
    });

    await proposal.save();

    // Evaluer automatiquement
    const evaluation = await negotiationService.evaluateProposal(proposal._id);

    // Mettre a jour la session
    session.proposalsReceived++;
    session.addTimelineEvent('proposal_received_bourse', {
      proposalId: proposal._id,
      carrierId,
      price: proposedPrice,
      source: 'bourse'
    });
    await session.save();

    // Marquer comme repondu dans la campagne
    const campaign = await BroadcastCampaign.findOne({ sessionId });
    if (campaign) {
      campaign.markRecipientResponded(carrierId);
      await campaign.save();
    }

    // Emettre evenement
    global.emitEvent?.('affret.proposal.received', {
      sessionId,
      carrierId,
      proposedPrice,
      source: 'bourse'
    });

    res.json({
      success: true,
      data: {
        proposalId: proposal._id,
        status: proposal.status,
        submittedAt: proposal.submittedAt,
        evaluation: {
          action: evaluation.action,
          scores: evaluation.scores
        }
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error submitting bourse proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== PROPOSITIONS ====================

/**
 * POST /api/v1/affretia/response
 * Enregistrer une reponse de transporteur
 */
exports.recordCarrierResponse = async (req, res) => {
  try {
    const {
      sessionId,
      carrierId,
      carrierName,
      proposedPrice,
      vehicleType,
      services,
      estimatedPickupDate,
      estimatedDeliveryDate,
      source = 'api'
    } = req.body;

    if (!sessionId || !carrierId || !proposedPrice) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, carrierId, and proposedPrice are required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Creer la proposition
    const proposal = new CarrierProposal({
      sessionId,
      orderId: session.orderId,
      carrierId,
      carrierName: carrierName || `Carrier ${carrierId}`,
      proposedPrice,
      vehicleType,
      estimatedPickupDate,
      estimatedDeliveryDate,
      services: services || {},
      source,
      submittedAt: new Date()
    });

    await proposal.save();

    // Evaluer automatiquement
    const evaluation = await negotiationService.evaluateProposal(proposal._id);

    // Mettre a jour la session
    session.proposalsReceived++;
    session.addTimelineEvent('proposal_received', {
      proposalId: proposal._id,
      carrierId,
      price: proposedPrice,
      evaluation: evaluation.action
    });
    await session.save();

    // Emettre evenement
    global.emitEvent?.('affret.proposal.received', {
      sessionId,
      carrierId,
      proposedPrice,
      evaluation: evaluation.action
    });

    res.json({
      success: true,
      data: {
        proposalId: proposal._id,
        status: proposal.status,
        submittedAt: proposal.submittedAt,
        evaluation: {
          action: evaluation.action,
          reason: evaluation.reason,
          scores: evaluation.scores
        }
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error recording response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/proposals/:sessionId
 * Liste des propositions pour une session
 */
exports.getProposals = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { status } = req.query;

    const filters = { sessionId };
    if (status) filters.status = status;

    const proposals = await CarrierProposal.find(filters)
      .sort({ 'scores.overall': -1, submittedAt: -1 });

    res.json({
      success: true,
      data: proposals,
      count: proposals.length
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting proposals:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/affretia/proposals/:proposalId/accept
 * Accepter une proposition manuellement
 */
exports.acceptProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { userId, reason } = req.body;

    const proposal = await negotiationService.acceptManually(proposalId, userId, reason);

    res.json({
      success: true,
      data: {
        proposalId: proposal._id,
        status: proposal.status,
        respondedAt: proposal.respondedAt
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error accepting proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/affretia/proposals/:proposalId/reject
 * Rejeter une proposition manuellement
 */
exports.rejectProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { userId, reason } = req.body;

    const proposal = await negotiationService.rejectManually(proposalId, userId, reason);

    res.json({
      success: true,
      data: {
        proposalId: proposal._id,
        status: proposal.status,
        respondedAt: proposal.respondedAt
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error rejecting proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/affretia/proposals/:proposalId/negotiate
 * Lancer une negociation sur une proposition
 */
exports.negotiateProposal = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { counterPrice, message, userId } = req.body;

    if (!counterPrice) {
      return res.status(400).json({
        success: false,
        error: 'counterPrice is required'
      });
    }

    const result = await negotiationService.negotiateManually(
      proposalId,
      counterPrice,
      message || 'Contre-proposition',
      userId
    );

    res.json({
      success: true,
      data: {
        proposalId: result.proposal._id,
        status: result.proposal.status,
        negotiationRound: result.negotiationRound,
        maxRounds: result.maxRounds
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error negotiating proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== SELECTION ====================

/**
 * POST /api/v1/affretia/select
 * Selectionner automatiquement le meilleur transporteur
 */
exports.selectBestCarrier = async (req, res) => {
  try {
    const { sessionId, algorithm = 'overall' } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Trouver la meilleure proposition
    const bestProposal = await CarrierProposal.getBestProposal(sessionId, algorithm);

    if (!bestProposal) {
      return res.status(404).json({
        success: false,
        error: 'No suitable proposal found'
      });
    }

    // Generer une justification
    const justification = `${bestProposal.carrierName} selectionne: meilleur score ${algorithm} (${bestProposal.scores.overall}/100), prix ${bestProposal.proposedPrice}€, qualite ${bestProposal.scores.quality}/100`;

    // Mettre a jour la session
    session.status = 'selecting';
    session.selection = {
      carrierId: bestProposal.carrierId,
      carrierName: bestProposal.carrierName,
      proposalId: bestProposal._id,
      finalPrice: bestProposal.proposedPrice,
      selectionReason: justification,
      priceScore: bestProposal.scores.price,
      qualityScore: bestProposal.scores.quality,
      overallScore: bestProposal.scores.overall,
      selectedAt: new Date(),
      selectedBy: 'ai'
    };

    session.addTimelineEvent('carrier_selected', {
      carrierId: bestProposal.carrierId,
      price: bestProposal.proposedPrice,
      algorithm,
      scores: bestProposal.scores
    });

    await session.save();

    // Emettre evenement
    global.emitEvent?.('affret.carrier.selected', {
      sessionId,
      carrierId: bestProposal.carrierId,
      price: bestProposal.proposedPrice
    });

    res.json({
      success: true,
      data: {
        selectedCarrierId: bestProposal.carrierId,
        selectedCarrierName: bestProposal.carrierName,
        selectedPrice: bestProposal.proposedPrice,
        scores: bestProposal.scores,
        justification
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error selecting carrier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/ranking/:sessionId
 * Classement des propositions
 */
exports.getRanking = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const ranking = await CarrierProposal.getRanking(sessionId);

    res.json({
      success: true,
      data: ranking
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting ranking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== ASSIGNATION ====================

/**
 * POST /api/v1/affretia/assign
 * Assigner la mission au transporteur selectionne
 */
exports.assignCarrier = async (req, res) => {
  try {
    const { sessionId, userId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required'
      });
    }

    const session = await AffretSession.findOne({ sessionId });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    if (!session.selection || !session.selection.carrierId) {
      return res.status(400).json({
        success: false,
        error: 'No carrier selected yet'
      });
    }

    // Mettre a jour la commande via Orders API
    try {
      await axios.put(
        `${process.env.ORDERS_API_URL}/api/v1/orders/${session.orderId}`,
        {
          status: 'assigned',
          assignedCarrierId: session.selection.carrierId,
          assignedCarrierName: session.selection.carrierName,
          assignedPrice: session.selection.finalPrice,
          assignedAt: new Date()
        }
      );
    } catch (error) {
      console.warn('[AFFRETIA] Could not update order:', error.message);
    }

    // Mettre a jour la session
    session.status = 'assigned';
    session.addTimelineEvent('carrier_assigned', {
      carrierId: session.selection.carrierId,
      price: session.selection.finalPrice
    }, userId);

    session.updateMetrics();
    await session.save();

    // Emettre evenement
    global.emitEvent?.('carrier.assigned', {
      orderId: session.orderId,
      carrierId: session.selection.carrierId,
      price: session.selection.finalPrice,
      sessionId
    });

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        orderId: session.orderId,
        carrierId: session.selection.carrierId,
        carrierName: session.selection.carrierName,
        price: session.selection.finalPrice,
        assignedAt: new Date()
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error assigning carrier:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== VIGILANCE ====================

/**
 * POST /api/v1/affretia/vigilance/check
 * Verifier la conformite d'un transporteur
 */
exports.checkVigilance = async (req, res) => {
  try {
    const { carrierId, checks = ['kbis', 'insurance', 'license', 'blacklist'] } = req.body;

    if (!carrierId) {
      return res.status(400).json({
        success: false,
        error: 'carrierId is required'
      });
    }

    // Chercher ou creer le check de vigilance
    let vigilanceCheck = await VigilanceCheck.findOne({ carrierId });

    if (!vigilanceCheck) {
      vigilanceCheck = new VigilanceCheck({
        carrierId,
        checks: {}
      });
    }

    // Effectuer les verifications (mockees pour l'instant)
    const mockChecks = {
      kbis: {
        valid: true,
        companyName: `Company ${carrierId}`,
        siret: '12345678901234',
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        lastChecked: new Date()
      },
      insurance: {
        valid: true,
        provider: 'Assurance Pro',
        policyNumber: 'POL123456',
        coverage: 1000000,
        expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        lastChecked: new Date()
      },
      license: {
        valid: true,
        licenseNumber: 'LIC123456',
        licenseType: 'heavy',
        expiryDate: new Date(Date.now() + 730 * 24 * 60 * 60 * 1000),
        lastChecked: new Date()
      },
      blacklist: {
        clean: true,
        listed: false,
        severity: 'none',
        lastChecked: new Date()
      }
    };

    // Mettre a jour les checks demandes
    checks.forEach(checkType => {
      if (mockChecks[checkType]) {
        vigilanceCheck.checks[checkType] = mockChecks[checkType];
      }
    });

    // Calculer les scores et statuts
    vigilanceCheck.calculateComplianceScore();
    vigilanceCheck.updateOverallStatus();
    vigilanceCheck.scheduleNextCheck();

    await vigilanceCheck.save();

    res.json({
      success: true,
      data: {
        carrierId: vigilanceCheck.carrierId,
        overallStatus: vigilanceCheck.overallStatus,
        complianceScore: vigilanceCheck.complianceScore,
        checks: vigilanceCheck.checks,
        nextCheckDue: vigilanceCheck.nextCheckDue
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error checking vigilance:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/vigilance/:carrierId
 * Obtenir le statut de vigilance d'un transporteur
 */
exports.getVigilanceStatus = async (req, res) => {
  try {
    const { carrierId } = req.params;

    const vigilanceCheck = await VigilanceCheck.findOne({ carrierId });

    if (!vigilanceCheck) {
      return res.status(404).json({
        success: false,
        error: 'No vigilance check found for this carrier'
      });
    }

    res.json({
      success: true,
      data: vigilanceCheck
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting vigilance status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==================== STATS & REPORTING ====================

/**
 * GET /api/v1/affretia/stats
 * Statistiques globales AFFRET.IA
 */
exports.getStats = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;

    // Stats des sessions
    const sessionStats = await AffretSession.aggregate([
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          successfulSessions: {
            $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] }
          },
          failedSessions: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          avgDuration: { $avg: '$metrics.totalDuration' },
          avgResponseTime: { $avg: '$metrics.responseTime' },
          avgProposalsReceived: { $avg: '$proposalsReceived' },
          avgFinalPrice: { $avg: '$selection.finalPrice' }
        }
      }
    ]);

    const stats = sessionStats[0] || {
      totalSessions: 0,
      successfulSessions: 0,
      failedSessions: 0,
      avgDuration: 0,
      avgResponseTime: 0,
      avgProposalsReceived: 0,
      avgFinalPrice: 0
    };

    // Top carriers
    const topCarriers = await AffretSession.aggregate([
      { $match: { 'selection.carrierId': { $exists: true } } },
      {
        $group: {
          _id: '$selection.carrierId',
          name: { $first: '$selection.carrierName' },
          assignations: { $sum: 1 },
          avgPrice: { $avg: '$selection.finalPrice' },
          avgScore: { $avg: '$selection.overallScore' }
        }
      },
      { $sort: { assignations: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      data: {
        totalSessions: stats.totalSessions,
        successRate: stats.totalSessions > 0
          ? (stats.successfulSessions / stats.totalSessions) * 100
          : 0,
        avgResponseTime: Math.round(stats.avgResponseTime / (1000 * 60)), // minutes
        avgPrice: Math.round(stats.avgFinalPrice * 100) / 100,
        avgDuration: Math.round(stats.avgDuration / (1000 * 60)), // minutes
        avgProposalsReceived: Math.round(stats.avgProposalsReceived * 10) / 10,
        topCarriers: topCarriers.map(c => ({
          carrierId: c._id,
          name: c.name,
          assignations: c.assignations,
          avgPrice: Math.round(c.avgPrice * 100) / 100,
          avgScore: Math.round(c.avgScore * 10) / 10
        }))
      }
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/affretia/stats/:organizationId
 * Statistiques par organisation
 */
exports.getOrganizationStats = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { dateFrom, dateTo } = req.query;

    const stats = await AffretSession.getSessionStats(organizationId, dateFrom, dateTo);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[AFFRETIA CONTROLLER] Error getting organization stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
