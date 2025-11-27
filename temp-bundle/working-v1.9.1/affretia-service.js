/**
 * AFFRET.IA - Module d'Affrètement Intelligent Automatisé
 * Service métier principal
 * Version: 1.0.0
 */

const { AffretiaAIEnhancement } = require('./affretia-ai-enhancement');
const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const {
  TriggerTypes,
  TriggerReasons,
  AffretiaStatus,
  ResponseTypes,
  RejectionReasons,
  BroadcastChannels,
  ScoringCriteria,
  TrackingLevels,
  DocumentTypes,
  DocumentStatus,
  DefaultConfig
} = require('./affretia-models');


// AI Enhancement Service
const affretiaAI = new AffretiaAIEnhancement();
// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  ...DefaultConfig,
  // Surchargeable via variables d'environnement
  timeouts: {
    analysisTimeout: parseInt(process.env.AFFRETIA_ANALYSIS_TIMEOUT) || 5,
    broadcastDuration: parseInt(process.env.AFFRETIA_BROADCAST_DURATION) || 120,
    responseTimeout: parseInt(process.env.AFFRETIA_RESPONSE_TIMEOUT) || 60,
    reminderBefore: parseInt(process.env.AFFRETIA_REMINDER_BEFORE) || 30,
    selectionTimeout: parseInt(process.env.AFFRETIA_SELECTION_TIMEOUT) || 15,
    assignmentTimeout: parseInt(process.env.AFFRETIA_ASSIGNMENT_TIMEOUT) || 10
  }
};

// ============================================================================
// UTILITAIRES
// ============================================================================

function generateSessionId() {
  return `AFF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function generateTrackingToken() {
  return crypto.randomBytes(32).toString('hex');
}

function calculateDistance(coord1, coord2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// 1. DÉCLENCHEMENT AFFRET.IA
// ============================================================================

/**
 * Déclenche une session AFFRET.IA
 */
async function triggerAffretia(db, params) {
  const {
    transportOrderId,
    organizationId,
    triggerType,
    triggerReason,
    triggeredBy,
    context = {}
  } = params;

  // Vérifier que la commande existe
  const order = await db.collection('transport_orders').findOne({
    _id: new ObjectId(transportOrderId)
  });

  if (!order) {
    throw new Error('Commande de transport non trouvée');
  }

  // Vérifier qu'il n'y a pas déjà une session active
  const existingSession = await db.collection('affretia_sessions').findOne({
    transportOrderId: new ObjectId(transportOrderId),
    status: { $nin: [AffretiaStatus.COMPLETED, AffretiaStatus.FAILED, AffretiaStatus.CANCELLED] }
  });

  if (existingSession) {
    throw new Error(`Une session AFFRET.IA est déjà active: ${existingSession.sessionId}`);
  }

  // Créer la session
  const session = {
    sessionId: generateSessionId(),
    transportOrderId: new ObjectId(transportOrderId),
    organizationId: new ObjectId(organizationId),

    trigger: {
      type: triggerType || TriggerTypes.MANUAL_ACTIVATION,
      reason: triggerReason || TriggerReasons.OTHER,
      triggeredBy: triggeredBy ? new ObjectId(triggeredBy) : null,
      triggeredAt: new Date(),
      context
    },

    mission: {
      reference: order.reference || order.orderNumber,
      origin: order.origin || order.pickupLocation,
      destination: order.destination || order.deliveryLocation,
      pickupDate: order.pickupDate || order.scheduledPickup,
      deliveryDate: order.deliveryDate || order.scheduledDelivery,
      goods: order.goods || order.cargo,
      requirements: order.requirements || {},
      budget: {
        initial: order.price || order.budget || 0,
        maxNegotiation: CONFIG.limits.maxPriceIncrease,
        currency: order.currency || 'EUR'
      }
    },

    analysis: null,
    shortlist: [],
    broadcast: null,
    responses: [],
    selection: null,
    tracking: null,
    documents: [],
    vigilance: null,
    finalScoring: null,

    status: AffretiaStatus.TRIGGERED,
    statusHistory: [{
      status: AffretiaStatus.TRIGGERED,
      changedAt: new Date(),
      changedBy: triggeredBy ? new ObjectId(triggeredBy) : null,
      reason: `Déclenchement ${triggerType}: ${triggerReason}`
    }],

    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    metadata: {
      version: '1.0.0',
      source: 'affretia_service',
      tags: []
    }
  };

  const result = await db.collection('affretia_sessions').insertOne(session);
  session._id = result.insertedId;

  // Mettre à jour la commande
  await db.collection('transport_orders').updateOne(
    { _id: new ObjectId(transportOrderId) },
    {
      $set: {
        affretiaSessionId: session._id,
        affretiaStatus: AffretiaStatus.TRIGGERED,
        updatedAt: new Date()
      }
    }
  );

  console.log(`[AFFRET.IA] Session ${session.sessionId} créée pour commande ${transportOrderId}`);

  return session;
}

// ============================================================================
// 2. ANALYSE IA ET GÉNÉRATION SHORTLIST
// ============================================================================

/**
 * Analyse IA pour générer la shortlist de transporteurs
 */
async function analyzeAndGenerateShortlist(db, sessionId) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  // Mettre à jour le statut
  await updateSessionStatus(db, sessionId, AffretiaStatus.ANALYZING, 'Analyse IA en cours');

  const analysisStart = new Date();

  try {
    // Récupérer tous les transporteurs externes éligibles
    const carriers = await db.collection('carriers').find({
      status: 'active',
      type: { $in: ['external', 'partner', 'marketplace'] },
      // Filtrer par zone de couverture si disponible
      $or: [
        { 'coverage.countries': session.mission.origin?.country },
        { 'coverage.regions': { $exists: false } }
      ]
    }).toArray();

    console.log(`[AFFRET.IA] ${carriers.length} transporteurs trouvés pour analyse`);

    // Scorer chaque transporteur
    const scoredCarriers = await Promise.all(
      carriers.map(async (carrier) => {
        const score = await calculateCarrierScore(db, carrier, session);
        return {
          carrierId: carrier._id,
          carrierName: carrier.name || carrier.companyName,
          score: score.total,
          scoreBreakdown: score.breakdown,
          ranking: 0,
          reasons: score.reasons,
          contacted: false,
          contactedAt: null,
          channels: determineChannels(carrier)
        };
      })
    );

    // Trier par score décroissant
    scoredCarriers.sort((a, b) => b.score - a.score);

    // Attribuer les rankings
    scoredCarriers.forEach((c, index) => {
      c.ranking = index + 1;
    });

    // Limiter la shortlist
    const shortlist = scoredCarriers.slice(0, CONFIG.limits.maxShortlist);

    // S'assurer d'avoir au moins le minimum requis
    if (shortlist.length < CONFIG.limits.minShortlist) {
      console.log(`[AFFRET.IA] Shortlist réduite: ${shortlist.length} transporteurs (min: ${CONFIG.limits.minShortlist})`);
    }

    const analysisEnd = new Date();

    // Mettre à jour la session
    await db.collection('affretia_sessions').updateOne(
      { sessionId },
      {
        $set: {
          analysis: {
            startedAt: analysisStart,
            completedAt: analysisEnd,
            shortlistCount: shortlist.length,
            criteria: CONFIG.scoring.weights,
            recommendations: generateRecommendations(shortlist, session)
          },
          shortlist,
          status: AffretiaStatus.SHORTLIST_READY,
          updatedAt: new Date()
        },
        $push: {
          statusHistory: {
            status: AffretiaStatus.SHORTLIST_READY,
            changedAt: new Date(),
            reason: `Shortlist générée: ${shortlist.length} transporteurs`
          }
        }
      }
    );

    console.log(`[AFFRET.IA] Analyse terminée. Shortlist: ${shortlist.length} transporteurs`);

    return {
      sessionId,
      shortlistCount: shortlist.length,
      topCarriers: shortlist.slice(0, 5).map(c => ({
        name: c.carrierName,
        score: c.score
      })),
      analysisTime: analysisEnd - analysisStart
    };

  } catch (error) {
    await updateSessionStatus(db, sessionId, AffretiaStatus.FAILED, `Erreur analyse: ${error.message}`);
    throw error;
  }
}

/**
 * Calcule le score d'un transporteur pour une mission
 */
async function calculateCarrierScore(db, carrier, session) {
  const breakdown = {};
  const reasons = [];
  let total = 0;

  // 1. Prix (30 points)
  const priceScore = calculatePriceScore(carrier, session);
  breakdown.price = priceScore;
  total += priceScore * (ScoringCriteria.PRICE.weight / 100);
  if (priceScore > 80) reasons.push('Prix compétitif');

  // 2. Disponibilité (25 points)
  const availabilityScore = await calculateAvailabilityScore(db, carrier, session);
  breakdown.availability = availabilityScore;
  total += availabilityScore * (ScoringCriteria.AVAILABILITY.weight / 100);
  if (availabilityScore > 80) reasons.push('Forte disponibilité');

  // 3. Score historique (20 points)
  const historicalScore = await calculateHistoricalScore(db, carrier);
  breakdown.historical = historicalScore;
  total += historicalScore * (ScoringCriteria.HISTORICAL_SCORE.weight / 100);
  if (historicalScore > 80) reasons.push('Excellent historique');

  // 4. Temps de réponse moyen (10 points)
  const responseTimeScore = await calculateResponseTimeScore(db, carrier);
  breakdown.responseTime = responseTimeScore;
  total += responseTimeScore * (ScoringCriteria.RESPONSE_TIME.weight / 100);
  if (responseTimeScore > 80) reasons.push('Réponse rapide');

  // 5. Adéquation équipement (10 points)
  const equipmentScore = calculateEquipmentScore(carrier, session);
  breakdown.equipment = equipmentScore;
  total += equipmentScore * (ScoringCriteria.EQUIPMENT_MATCH.weight / 100);
  if (equipmentScore > 80) reasons.push('Équipement adapté');

  // 6. Conformité (5 points)
  const complianceScore = await calculateComplianceScore(db, carrier);
  breakdown.compliance = complianceScore;
  total += complianceScore * (ScoringCriteria.COMPLIANCE.weight / 100);
  if (complianceScore > 80) reasons.push('Documents à jour');

  return {
    total: Math.round(total),
    breakdown,
    reasons
  };
}

function calculatePriceScore(carrier, session) {
  // Score basé sur les tarifs historiques si disponibles
  if (carrier.averageRate && session.mission.budget.initial) {
    const ratio = carrier.averageRate / session.mission.budget.initial;
    if (ratio <= 0.9) return 100;
    if (ratio <= 1.0) return 90;
    if (ratio <= 1.1) return 70;
    if (ratio <= 1.15) return 50;
    return 30;
  }
  return 70; // Score par défaut si pas d'historique
}

async function calculateAvailabilityScore(db, carrier, session) {
  // Vérifier les missions en cours
  const activeMissions = await db.collection('transport_orders').countDocuments({
    carrierId: carrier._id,
    status: { $in: ['assigned', 'in_transit', 'loading'] }
  });

  const capacity = carrier.fleetSize || 5;
  const utilization = activeMissions / capacity;

  if (utilization < 0.5) return 100;
  if (utilization < 0.7) return 80;
  if (utilization < 0.9) return 60;
  return 40;
}

async function calculateHistoricalScore(db, carrier) {
  // Récupérer les missions passées
  const pastMissions = await db.collection('transport_orders').find({
    carrierId: carrier._id,
    status: 'delivered',
    completedAt: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }
  }).toArray();

  if (pastMissions.length === 0) return 60; // Score neutre pour nouveaux

  let totalScore = 0;
  pastMissions.forEach(mission => {
    // Livraison à temps
    if (mission.deliveredAt <= mission.scheduledDelivery) {
      totalScore += 30;
    } else {
      const hoursLate = (mission.deliveredAt - mission.scheduledDelivery) / (1000 * 60 * 60);
      totalScore += Math.max(0, 30 - hoursLate * 5);
    }

    // Documents complets
    if (mission.documentsComplete) totalScore += 20;

    // Pas d'incidents
    if (!mission.incidents || mission.incidents.length === 0) totalScore += 30;

    // Feedback positif
    if (mission.rating && mission.rating >= 4) totalScore += 20;
  });

  return Math.round(totalScore / pastMissions.length);
}

async function calculateResponseTimeScore(db, carrier) {
  // Temps de réponse moyen aux sollicitations
  const responses = await db.collection('affretia_sessions').aggregate([
    { $unwind: '$responses' },
    { $match: { 'responses.carrierId': carrier._id } },
    {
      $project: {
        responseTime: {
          $subtract: ['$responses.receivedAt', '$broadcast.startedAt']
        }
      }
    }
  ]).toArray();

  if (responses.length === 0) return 70;

  const avgResponseTime = responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length;
  const avgMinutes = avgResponseTime / (1000 * 60);

  if (avgMinutes < 15) return 100;
  if (avgMinutes < 30) return 85;
  if (avgMinutes < 60) return 70;
  return 50;
}

function calculateEquipmentScore(carrier, session) {
  if (!session.mission.requirements?.vehicleType) return 80;

  const requiredType = session.mission.requirements.vehicleType.toLowerCase();
  const carrierVehicles = (carrier.vehicles || carrier.fleet || []).map(v =>
    (v.type || '').toLowerCase()
  );

  // Correspondance exacte
  if (carrierVehicles.includes(requiredType)) return 100;

  // Correspondance partielle
  if (carrierVehicles.some(v => v.includes(requiredType) || requiredType.includes(v))) {
    return 70;
  }

  return 40;
}

async function calculateComplianceScore(db, carrier) {
  let score = 100;

  // Vérifier les documents obligatoires
  const requiredDocs = ['license', 'insurance', 'kbis'];
  const missingDocs = requiredDocs.filter(doc => {
    const docData = carrier.documents?.[doc];
    if (!docData) return true;
    if (docData.expiresAt && new Date(docData.expiresAt) < new Date()) return true;
    return false;
  });

  score -= missingDocs.length * 15;

  // Vérifier le statut vigilance
  if (carrier.vigilanceStatus === 'blocked') score -= 50;
  if (carrier.vigilanceStatus === 'warning') score -= 20;

  return Math.max(0, score);
}

function determineChannels(carrier) {
  const channels = [];

  if (carrier.email) channels.push(BroadcastChannels.EMAIL);
  if (carrier.marketplaceEnabled) channels.push(BroadcastChannels.MARKETPLACE);
  if (carrier.pushEnabled) channels.push(BroadcastChannels.PUSH_NOTIFICATION);
  if (carrier.phone && carrier.smsEnabled) channels.push(BroadcastChannels.SMS);
  if (carrier.webhookUrl) channels.push(BroadcastChannels.WEBHOOK);

  return channels.length > 0 ? channels : [BroadcastChannels.EMAIL];
}

function generateRecommendations(shortlist, session) {
  const recommendations = [];

  if (shortlist.length < 20) {
    recommendations.push('Shortlist limitée - Envisager d\'élargir les critères de recherche');
  }

  const avgScore = shortlist.reduce((sum, c) => sum + c.score, 0) / shortlist.length;
  if (avgScore < 60) {
    recommendations.push('Scores moyens faibles - Revoir les exigences ou le budget');
  }

  const topScore = shortlist[0]?.score || 0;
  if (topScore > 90) {
    recommendations.push('Excellent candidat identifié - Attribution rapide recommandée');
  }

  return recommendations;
}

// ============================================================================
// 3. DIFFUSION MULTI-CANAL
// ============================================================================

/**
 * Diffuse la demande aux transporteurs de la shortlist
 */
async function broadcastRequest(db, sessionId, options = {}) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  if (!session.shortlist || session.shortlist.length === 0) {
    throw new Error('Shortlist vide - Exécuter l\'analyse d\'abord');
  }

  const {
    channels = [BroadcastChannels.EMAIL, BroadcastChannels.MARKETPLACE],
    expiresInMinutes = CONFIG.timeouts.broadcastDuration,
    customMessage = null
  } = options;

  await updateSessionStatus(db, sessionId, AffretiaStatus.BROADCASTING, 'Diffusion en cours');

  const broadcastStart = new Date();
  const expiresAt = new Date(broadcastStart.getTime() + expiresInMinutes * 60 * 1000);

  const results = {
    sent: 0,
    failed: 0,
    errors: []
  };

  // Diffuser à chaque transporteur de la shortlist
  for (const carrier of session.shortlist) {
    try {
      const carrierData = await db.collection('carriers').findOne({ _id: carrier.carrierId });

      if (!carrierData) {
        results.failed++;
        results.errors.push(`Transporteur ${carrier.carrierId} non trouvé`);
        continue;
      }

      // Envoyer sur chaque canal disponible
      for (const channel of channels) {
        if (!carrier.channels.includes(channel)) continue;

        await sendBroadcastMessage(db, {
          carrier: carrierData,
          session,
          channel,
          expiresAt,
          customMessage
        });
      }

      // Marquer comme contacté
      await db.collection('affretia_sessions').updateOne(
        { sessionId, 'shortlist.carrierId': carrier.carrierId },
        {
          $set: {
            'shortlist.$.contacted': true,
            'shortlist.$.contactedAt': new Date()
          }
        }
      );

      results.sent++;

    } catch (error) {
      results.failed++;
      results.errors.push(`Erreur ${carrier.carrierName}: ${error.message}`);
    }
  }

  // Mettre à jour la session
  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        broadcast: {
          startedAt: broadcastStart,
          channels,
          messageTemplate: customMessage || 'default',
          expiresAt,
          reminderSent: false,
          reminderAt: null
        },
        status: AffretiaStatus.AWAITING_RESPONSES,
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status: AffretiaStatus.AWAITING_RESPONSES,
          changedAt: new Date(),
          reason: `Diffusion envoyée à ${results.sent} transporteurs`
        }
      }
    }
  );

  console.log(`[AFFRET.IA] Diffusion terminée: ${results.sent} envoyés, ${results.failed} échecs`);

  // Programmer le rappel
  scheduleReminder(db, sessionId, expiresAt);

  return {
    sessionId,
    broadcastedTo: results.sent,
    failed: results.failed,
    expiresAt,
    errors: results.errors
  };
}

async function sendBroadcastMessage(db, { carrier, session, channel, expiresAt, customMessage }) {
  const message = buildBroadcastMessage(session, expiresAt, customMessage);

  switch (channel) {
    case BroadcastChannels.EMAIL:
      await sendBroadcastEmail(carrier, message, session);
      break;

    case BroadcastChannels.MARKETPLACE:
      await publishToMarketplace(db, session, carrier);
      break;

    case BroadcastChannels.PUSH_NOTIFICATION:
      await sendPushNotification(carrier, message);
      break;

    case BroadcastChannels.SMS:
      await sendBroadcastSMS(carrier, message);
      break;

    case BroadcastChannels.WEBHOOK:
      await sendWebhook(carrier, session);
      break;
  }
}

function buildBroadcastMessage(session, expiresAt, customMessage) {
  if (customMessage) return customMessage;

  const m = session.mission;
  return {
    subject: `[AFFRET.IA] Demande de transport ${m.reference}`,
    body: `
Nouvelle demande de transport disponible:

Référence: ${m.reference}
Trajet: ${m.origin?.city || 'N/A'} → ${m.destination?.city || 'N/A'}
Date chargement: ${m.pickupDate ? new Date(m.pickupDate).toLocaleDateString('fr-FR') : 'N/A'}
Date livraison: ${m.deliveryDate ? new Date(m.deliveryDate).toLocaleDateString('fr-FR') : 'N/A'}

Marchandise: ${m.goods?.description || 'N/A'}
Poids: ${m.goods?.weight || 'N/A'} kg
Volume: ${m.goods?.volume || 'N/A'} m³

Budget indicatif: ${m.budget?.initial || 'Sur demande'} ${m.budget?.currency || 'EUR'}

Répondez avant le: ${expiresAt.toLocaleString('fr-FR')}

Cliquez ici pour répondre: [LIEN_REPONSE]
    `.trim()
  };
}

async function sendBroadcastEmail(carrier, message, session) {
  // Utiliser le service de notification existant
  const notificationService = require('./notification-service');

  await notificationService.sendEmail({
    to: carrier.email,
    subject: message.subject,
    text: message.body,
    html: `<pre>${message.body}</pre>`,
    tags: ['affretia', 'broadcast', session.sessionId]
  });
}

async function publishToMarketplace(db, session, carrier) {
  // Publier sur la marketplace interne
  await db.collection('marketplace_listings').insertOne({
    sessionId: session.sessionId,
    transportOrderId: session.transportOrderId,
    type: 'freight_request',
    mission: session.mission,
    targetCarrierId: carrier.carrierId,
    status: 'active',
    expiresAt: session.broadcast?.expiresAt,
    createdAt: new Date()
  });
}

async function sendPushNotification(carrier, message) {
  // Placeholder pour intégration Firebase/OneSignal
  console.log(`[AFFRET.IA] Push notification à ${carrier.name}: ${message.subject}`);
}

async function sendBroadcastSMS(carrier, message) {
  const notificationService = require('./notification-service');

  const smsText = `AFFRET.IA: Nouvelle demande ${message.subject.substring(0, 100)}. Connectez-vous pour répondre.`;

  await notificationService.sendSMS({
    to: carrier.phone,
    body: smsText
  });
}

async function sendWebhook(carrier, session) {
  const fetch = require('node-fetch');

  if (!carrier.webhookUrl) return;

  await fetch(carrier.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'affretia.broadcast',
      sessionId: session.sessionId,
      mission: session.mission,
      timestamp: new Date().toISOString()
    })
  });
}

function scheduleReminder(db, sessionId, expiresAt) {
  const reminderTime = new Date(expiresAt.getTime() - CONFIG.timeouts.reminderBefore * 60 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (delay > 0) {
    setTimeout(async () => {
      await sendReminder(db, sessionId);
    }, delay);
  }
}

async function sendReminder(db, sessionId) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session || session.status !== AffretiaStatus.AWAITING_RESPONSES) return;

  // Envoyer rappel aux transporteurs qui n'ont pas répondu
  const respondedCarrierIds = session.responses.map(r => r.carrierId.toString());
  const pendingCarriers = session.shortlist.filter(c =>
    c.contacted && !respondedCarrierIds.includes(c.carrierId.toString())
  );

  for (const carrier of pendingCarriers) {
    const carrierData = await db.collection('carriers').findOne({ _id: carrier.carrierId });
    if (carrierData?.email) {
      await sendBroadcastEmail(carrierData, {
        subject: `[RAPPEL] Demande AFFRET.IA ${session.mission.reference}`,
        body: `Rappel: Votre réponse est attendue avant ${session.broadcast.expiresAt.toLocaleString('fr-FR')}`
      }, session);
    }
  }

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        'broadcast.reminderSent': true,
        'broadcast.reminderAt': new Date()
      }
    }
  );
}

// ============================================================================
// 4. GESTION DES RÉPONSES
// ============================================================================

/**
 * Enregistre une réponse de transporteur
 */
async function recordResponse(db, sessionId, response) {
  const {
    carrierId,
    responseType,
    price,
    counterOfferPrice,
    availability,
    vehicleInfo,
    rejectionReason,
    comments
  } = response;

  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  if (session.status !== AffretiaStatus.AWAITING_RESPONSES) {
    throw new Error(`Session non en attente de réponses (statut: ${session.status})`);
  }

  // Vérifier que le transporteur fait partie de la shortlist
  const carrierInShortlist = session.shortlist.find(c =>
    c.carrierId.toString() === carrierId.toString()
  );

  if (!carrierInShortlist) {
    throw new Error('Transporteur non présent dans la shortlist');
  }

  // Vérifier si le transporteur a déjà répondu
  const existingResponse = session.responses.find(r =>
    r.carrierId.toString() === carrierId.toString()
  );

  if (existingResponse) {
    throw new Error('Ce transporteur a déjà répondu');
  }

  // Gérer les contre-offres
  let acceptedPrice = price;
  let negotiationNeeded = false;

  if (responseType === ResponseTypes.COUNTER_OFFER) {
    const maxAcceptable = session.mission.budget.initial * (1 + CONFIG.limits.maxPriceIncrease / 100);

    if (counterOfferPrice <= maxAcceptable) {
      // Auto-acceptation si dans la limite
      acceptedPrice = counterOfferPrice;
      console.log(`[AFFRET.IA] Contre-offre auto-acceptée: ${counterOfferPrice}€ (max: ${maxAcceptable}€)`);
    } else {
      negotiationNeeded = true;
    }
  }

  // Calculer le score de la réponse
  const responseScore = calculateResponseScore(response, session, carrierInShortlist);

  const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });

  const responseRecord = {
    carrierId: new ObjectId(carrierId),
    carrierName: carrier?.name || carrierInShortlist.carrierName,
    responseType,
    receivedAt: new Date(),
    price: acceptedPrice,
    originalPrice: session.mission.budget.initial,
    counterOfferPrice: counterOfferPrice || null,
    availability: availability || null,
    vehicleInfo: vehicleInfo || null,
    rejectionReason: rejectionReason || null,
    comments: comments || null,
    score: responseScore.total,
    scoreBreakdown: responseScore.breakdown,
    negotiationNeeded
  };

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $push: { responses: responseRecord },
      $set: { updatedAt: new Date() }
    }
  );

  console.log(`[AFFRET.IA] Réponse enregistrée de ${responseRecord.carrierName}: ${responseType}`);

  // Vérifier si on peut passer à la sélection
  await checkAndTriggerSelection(db, sessionId);

  return responseRecord;
}

function calculateResponseScore(response, session, shortlistEntry) {
  const breakdown = {};
  let total = shortlistEntry.score; // Score de base de la shortlist

  // Bonus/malus selon le type de réponse
  if (response.responseType === ResponseTypes.ACCEPT) {
    total += 10;
    breakdown.responseBonus = 10;
  } else if (response.responseType === ResponseTypes.COUNTER_OFFER) {
    const priceIncrease = ((response.counterOfferPrice - session.mission.budget.initial) /
      session.mission.budget.initial) * 100;
    breakdown.priceIncrease = -priceIncrease;
    total -= priceIncrease;
  }

  // Bonus pour réponse rapide
  const responseTime = (Date.now() - session.broadcast.startedAt.getTime()) / (1000 * 60);
  if (responseTime < 30) {
    total += 5;
    breakdown.quickResponse = 5;
  }

  // Bonus pour disponibilité confirmée
  if (response.availability?.confirmed) {
    total += 5;
    breakdown.availabilityConfirmed = 5;
  }

  return {
    total: Math.round(Math.max(0, Math.min(100, total))),
    breakdown
  };
}

async function checkAndTriggerSelection(db, sessionId) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  const acceptedResponses = session.responses.filter(r =>
    r.responseType === ResponseTypes.ACCEPT ||
    (r.responseType === ResponseTypes.COUNTER_OFFER && !r.negotiationNeeded)
  );

  // Passer à la sélection si:
  // 1. On a au moins le nombre minimum de réponses acceptables
  // 2. OU le délai de diffusion est expiré
  const broadcastExpired = session.broadcast?.expiresAt && new Date() >= session.broadcast.expiresAt;

  if (acceptedResponses.length >= CONFIG.limits.minResponsesToSelect || broadcastExpired) {
    if (acceptedResponses.length > 0) {
      await updateSessionStatus(db, sessionId, AffretiaStatus.RESPONSES_COLLECTED,
        `${acceptedResponses.length} réponses acceptables collectées`);
    } else if (broadcastExpired) {
      await updateSessionStatus(db, sessionId, AffretiaStatus.NO_RESPONSES,
        'Aucune réponse reçue dans le délai');
    }
  }
}

// ============================================================================
// 5. SÉLECTION DU TRANSPORTEUR
// ============================================================================

/**
 * Sélectionne le meilleur transporteur parmi les réponses
 */
async function selectBestCarrier(db, sessionId, options = {}) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  const acceptableResponses = session.responses.filter(r =>
    r.responseType === ResponseTypes.ACCEPT ||
    (r.responseType === ResponseTypes.COUNTER_OFFER && !r.negotiationNeeded)
  );

  if (acceptableResponses.length === 0) {
    throw new Error('Aucune réponse acceptable pour la sélection');
  }

  await updateSessionStatus(db, sessionId, AffretiaStatus.SELECTING, 'Sélection en cours');

  // Trier par score décroissant
  acceptableResponses.sort((a, b) => b.score - a.score);

  // Sélection automatique ou manuelle
  let selectedResponse;

  if (options.manualSelection && options.selectedCarrierId) {
    selectedResponse = acceptableResponses.find(r =>
      r.carrierId.toString() === options.selectedCarrierId.toString()
    );

    if (!selectedResponse) {
      throw new Error('Transporteur sélectionné non trouvé parmi les réponses');
    }
  } else {
    // Sélection automatique du meilleur score
    selectedResponse = acceptableResponses[0];
  }

  // Mettre à jour la session
  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        selection: {
          selectedCarrierId: selectedResponse.carrierId,
          selectedAt: new Date(),
          selectionCriteria: {
            method: options.manualSelection ? 'manual' : 'automatic',
            score: selectedResponse.score,
            scoreBreakdown: selectedResponse.scoreBreakdown
          },
          finalPrice: selectedResponse.price,
          negotiationHistory: []
        },
        status: AffretiaStatus.CARRIER_SELECTED,
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status: AffretiaStatus.CARRIER_SELECTED,
          changedAt: new Date(),
          reason: `${selectedResponse.carrierName} sélectionné (score: ${selectedResponse.score})`
        }
      }
    }
  );

  console.log(`[AFFRET.IA] Transporteur sélectionné: ${selectedResponse.carrierName}`);

  return {
    sessionId,
    selectedCarrier: {
      id: selectedResponse.carrierId,
      name: selectedResponse.carrierName,
      score: selectedResponse.score,
      price: selectedResponse.price
    },
    alternativeCount: acceptableResponses.length - 1
  };
}

// ============================================================================
// 6. ATTRIBUTION
// ============================================================================

/**
 * Attribue la mission au transporteur sélectionné
 */
async function assignToCarrier(db, sessionId, options = {}) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  if (!session.selection?.selectedCarrierId) {
    throw new Error('Aucun transporteur sélectionné');
  }

  await updateSessionStatus(db, sessionId, AffretiaStatus.ASSIGNING, 'Attribution en cours');

  const carrier = await db.collection('carriers').findOne({
    _id: session.selection.selectedCarrierId
  });

  const selectedResponse = session.responses.find(r =>
    r.carrierId.toString() === session.selection.selectedCarrierId.toString()
  );

  // Mettre à jour la commande de transport
  const updateData = {
    carrierId: session.selection.selectedCarrierId,
    carrierName: carrier?.name || selectedResponse?.carrierName,
    status: 'assigned',
    assignedAt: new Date(),
    assignedVia: 'affretia',
    affretiaSessionId: session._id,
    price: session.selection.finalPrice,
    driverInfo: selectedResponse?.vehicleInfo || null,
    updatedAt: new Date()
  };

  await db.collection('transport_orders').updateOne(
    { _id: session.transportOrderId },
    { $set: updateData }
  );

  // Générer un token de tracking
  const trackingToken = generateTrackingToken();
  const trackingLevel = options.trackingLevel || TrackingLevels.BASIC.key;

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        tracking: {
          level: trackingLevel,
          token: trackingToken,
          activatedAt: null,
          lastUpdate: null,
          positions: [],
          eta: null,
          geofenceEvents: []
        },
        status: AffretiaStatus.ASSIGNED,
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status: AffretiaStatus.ASSIGNED,
          changedAt: new Date(),
          reason: `Mission attribuée à ${carrier?.name}`
        }
      }
    }
  );

  // Notifier le transporteur
  await notifyCarrierAssignment(db, carrier, session, trackingToken);

  // Notifier les autres transporteurs du refus
  await notifyRejectedCarriers(db, session);

  console.log(`[AFFRET.IA] Mission attribuée à ${carrier?.name}`);

  return {
    sessionId,
    transportOrderId: session.transportOrderId,
    assignedTo: {
      carrierId: carrier?._id,
      carrierName: carrier?.name,
      price: session.selection.finalPrice
    },
    trackingToken,
    trackingLevel
  };
}

async function notifyCarrierAssignment(db, carrier, session, trackingToken) {
  const notificationService = require('./notification-service');

  const message = `
Félicitations ! Votre offre pour la mission ${session.mission.reference} a été acceptée.

Détails:
- Trajet: ${session.mission.origin?.city} → ${session.mission.destination?.city}
- Date chargement: ${new Date(session.mission.pickupDate).toLocaleDateString('fr-FR')}
- Prix convenu: ${session.selection.finalPrice} €

Token de tracking: ${trackingToken}

Merci de confirmer la prise en charge.
  `;

  if (carrier?.email) {
    await notificationService.sendEmail({
      to: carrier.email,
      subject: `[AFFRET.IA] Mission ${session.mission.reference} attribuée`,
      text: message
    });
  }
}

async function notifyRejectedCarriers(db, session) {
  const notificationService = require('./notification-service');

  const rejectedCarriers = session.responses.filter(r =>
    r.carrierId.toString() !== session.selection.selectedCarrierId.toString() &&
    r.responseType !== ResponseTypes.REJECT
  );

  for (const response of rejectedCarriers) {
    const carrier = await db.collection('carriers').findOne({ _id: response.carrierId });

    if (carrier?.email) {
      await notificationService.sendEmail({
        to: carrier.email,
        subject: `[AFFRET.IA] Mission ${session.mission.reference} - Résultat`,
        text: `Nous vous remercions pour votre proposition concernant la mission ${session.mission.reference}.
Malheureusement, un autre transporteur a été retenu pour cette mission.
Nous ne manquerons pas de vous solliciter pour de prochaines opportunités.`
      });
    }
  }
}

// ============================================================================
// 7. TRACKING
// ============================================================================

/**
 * Active le tracking pour la session
 */
async function activateTracking(db, sessionId) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  if (!session.tracking?.token) {
    throw new Error('Token de tracking non généré');
  }

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        'tracking.activatedAt': new Date(),
        status: AffretiaStatus.TRACKING_ACTIVE,
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status: AffretiaStatus.TRACKING_ACTIVE,
          changedAt: new Date(),
          reason: 'Tracking activé'
        }
      }
    }
  );

  return {
    sessionId,
    trackingToken: session.tracking.token,
    trackingLevel: session.tracking.level
  };
}

/**
 * Enregistre une position de tracking
 */
async function updateTrackingPosition(db, sessionId, position) {
  const { lat, lng, speed, heading, timestamp } = position;

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        'tracking.lastUpdate': new Date(),
        updatedAt: new Date()
      },
      $push: {
        'tracking.positions': {
          lat,
          lng,
          speed: speed || null,
          heading: heading || null,
          timestamp: timestamp ? new Date(timestamp) : new Date()
        }
      }
    }
  );

  // Calculer l'ETA si destination connue
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (session?.mission?.destination?.coordinates) {
    const distance = calculateDistance(
      { lat, lng },
      session.mission.destination.coordinates
    );

    const avgSpeed = speed || 60; // km/h par défaut
    const etaHours = distance / avgSpeed;
    const estimatedArrival = new Date(Date.now() + etaHours * 60 * 60 * 1000);

    await db.collection('affretia_sessions').updateOne(
      { sessionId },
      {
        $set: {
          'tracking.eta': {
            estimated: estimatedArrival,
            confidence: speed ? 0.8 : 0.5,
            distanceRemaining: distance
          }
        }
      }
    );
  }
}

/**
 * Enregistre un événement de géofence
 */
async function recordGeofenceEvent(db, sessionId, event) {
  const { type, location, coordinates } = event;

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $push: {
        'tracking.geofenceEvents': {
          type, // 'enter', 'exit'
          location,
          coordinates,
          timestamp: new Date()
        }
      },
      $set: { updatedAt: new Date() }
    }
  );

  // Mettre à jour le statut de la commande si nécessaire
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (type === 'enter' && location === 'destination') {
    await db.collection('transport_orders').updateOne(
      { _id: session.transportOrderId },
      {
        $set: {
          status: 'arrived',
          arrivedAt: new Date()
        }
      }
    );
  }
}

// ============================================================================
// 8. GESTION DES DOCUMENTS
// ============================================================================

/**
 * Télécharge et traite un document
 */
async function uploadDocument(db, sessionId, documentData) {
  const {
    type,
    fileUrl,
    uploadedBy,
    metadata = {}
  } = documentData;

  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  const documentId = new ObjectId();

  const document = {
    documentId,
    type,
    status: DocumentStatus.UPLOADED,
    uploadedAt: new Date(),
    uploadedBy: uploadedBy ? new ObjectId(uploadedBy) : null,
    fileUrl,
    ocrData: null,
    verified: false,
    verifiedAt: null,
    verifiedBy: null,
    metadata
  };

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $push: { documents: document },
      $set: {
        status: AffretiaStatus.DOCUMENTS_PENDING,
        updatedAt: new Date()
      }
    }
  );

  // Lancer le traitement OCR si applicable
  if ([DocumentTypes.CMR, DocumentTypes.BOL, DocumentTypes.POD, DocumentTypes.INVOICE].includes(type)) {
    processDocumentOCR(db, sessionId, documentId, fileUrl).catch(err => {
      console.error(`[AFFRET.IA] Erreur OCR document ${documentId}:`, err.message);
    });
  }

  return {
    documentId,
    type,
    status: DocumentStatus.UPLOADED
  };
}

/**
 * Traite un document avec OCR
 */
async function processDocumentOCR(db, sessionId, documentId, fileUrl) {
  await db.collection('affretia_sessions').updateOne(
    { sessionId, 'documents.documentId': documentId },
    {
      $set: {
        'documents.$.status': DocumentStatus.PROCESSING
      }
    }
  );

  try {
    // Utiliser le service OCR existant
    const ocrService = require('./ocr-integration-service');

    const ocrResult = await ocrService.processDocument(fileUrl);

    await db.collection('affretia_sessions').updateOne(
      { sessionId, 'documents.documentId': documentId },
      {
        $set: {
          'documents.$.status': DocumentStatus.VERIFIED,
          'documents.$.ocrData': ocrResult,
          'documents.$.verified': true,
          'documents.$.verifiedAt': new Date()
        }
      }
    );

    console.log(`[AFFRET.IA] Document ${documentId} traité avec succès`);

  } catch (error) {
    await db.collection('affretia_sessions').updateOne(
      { sessionId, 'documents.documentId': documentId },
      {
        $set: {
          'documents.$.status': DocumentStatus.REJECTED,
          'documents.$.ocrData': { error: error.message }
        }
      }
    );

    throw error;
  }
}

// ============================================================================
// 9. VÉRIFICATION VIGILANCE
// ============================================================================

/**
 * Effectue les vérifications de vigilance
 */
async function performVigilanceCheck(db, sessionId) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  await updateSessionStatus(db, sessionId, AffretiaStatus.VIGILANCE_CHECK, 'Vérification vigilance');

  const carrier = await db.collection('carriers').findOne({
    _id: session.selection.selectedCarrierId
  });

  const checks = [];
  const alerts = [];

  // 1. Vérification licence transport
  const licenseCheck = {
    type: 'transport_license',
    passed: false,
    details: ''
  };

  if (carrier?.documents?.license) {
    const license = carrier.documents.license;
    if (license.verified && (!license.expiresAt || new Date(license.expiresAt) > new Date())) {
      licenseCheck.passed = true;
      licenseCheck.details = 'Licence valide';
    } else {
      licenseCheck.details = 'Licence expirée ou non vérifiée';
      alerts.push('Licence de transport expirée');
    }
  } else {
    licenseCheck.details = 'Licence non fournie';
    alerts.push('Licence de transport manquante');
  }
  checks.push(licenseCheck);

  // 2. Vérification assurance
  const insuranceCheck = {
    type: 'insurance',
    passed: false,
    details: ''
  };

  if (carrier?.documents?.insurance) {
    const insurance = carrier.documents.insurance;
    if (insurance.verified && (!insurance.expiresAt || new Date(insurance.expiresAt) > new Date())) {
      insuranceCheck.passed = true;
      insuranceCheck.details = 'Assurance valide';
    } else {
      insuranceCheck.details = 'Assurance expirée ou non vérifiée';
      alerts.push('Assurance expirée');
    }
  } else {
    insuranceCheck.details = 'Assurance non fournie';
    alerts.push('Assurance manquante');
  }
  checks.push(insuranceCheck);

  // 3. Vérification URSSAF/attestation
  const urssafCheck = {
    type: 'urssaf',
    passed: true,
    details: 'Non vérifié'
  };

  if (carrier?.documents?.urssaf) {
    const urssaf = carrier.documents.urssaf;
    if (urssaf.verified) {
      urssafCheck.passed = true;
      urssafCheck.details = 'Attestation URSSAF valide';
    }
  }
  checks.push(urssafCheck);

  // 4. Vérification sanctions/blocage
  const sanctionCheck = {
    type: 'sanctions',
    passed: carrier?.vigilanceStatus !== 'blocked',
    details: carrier?.vigilanceStatus === 'blocked' ? 'Transporteur bloqué' : 'Aucune sanction'
  };

  if (!sanctionCheck.passed) {
    alerts.push('Transporteur sur liste de blocage');
  }
  checks.push(sanctionCheck);

  const allPassed = checks.every(c => c.passed);

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        vigilance: {
          checkedAt: new Date(),
          status: allPassed ? 'passed' : 'warning',
          checks,
          alerts
        },
        updatedAt: new Date()
      }
    }
  );

  return {
    sessionId,
    status: allPassed ? 'passed' : 'warning',
    checksCount: checks.length,
    passedCount: checks.filter(c => c.passed).length,
    alerts
  };
}

// ============================================================================
// 10. SCORING FINAL ET CLÔTURE
// ============================================================================

/**
 * Calcule le scoring final de la mission
 */
async function calculateFinalScoring(db, sessionId, feedback = {}) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  await updateSessionStatus(db, sessionId, AffretiaStatus.SCORING, 'Calcul du score final');

  const order = await db.collection('transport_orders').findOne({
    _id: session.transportOrderId
  });

  const breakdown = {
    onTimeDelivery: 0,
    documentCompliance: 0,
    communication: 0,
    priceRespect: 0,
    incidentFree: 0
  };

  // 1. Livraison à temps (25 points)
  if (order?.deliveredAt && order?.scheduledDelivery) {
    const diff = (order.deliveredAt - order.scheduledDelivery) / (1000 * 60 * 60);
    if (diff <= 0) {
      breakdown.onTimeDelivery = 25;
    } else if (diff <= 2) {
      breakdown.onTimeDelivery = 20;
    } else if (diff <= 6) {
      breakdown.onTimeDelivery = 15;
    } else {
      breakdown.onTimeDelivery = 5;
    }
  } else {
    breakdown.onTimeDelivery = feedback.onTimeDelivery || 15;
  }

  // 2. Conformité documentaire (25 points)
  const requiredDocTypes = [DocumentTypes.CMR, DocumentTypes.POD];
  const uploadedDocTypes = session.documents.map(d => d.type);
  const verifiedDocs = session.documents.filter(d => d.verified).length;

  const docsComplete = requiredDocTypes.every(t => uploadedDocTypes.includes(t));
  breakdown.documentCompliance = docsComplete ? 25 : Math.round((verifiedDocs / requiredDocTypes.length) * 25);

  // 3. Communication (20 points)
  breakdown.communication = feedback.communication || 15;

  // 4. Respect du prix (15 points)
  if (session.selection?.finalPrice <= session.mission.budget.initial) {
    breakdown.priceRespect = 15;
  } else {
    const overage = ((session.selection.finalPrice - session.mission.budget.initial) /
      session.mission.budget.initial) * 100;
    breakdown.priceRespect = Math.max(0, 15 - overage);
  }

  // 5. Absence d'incidents (15 points)
  const incidents = order?.incidents || [];
  breakdown.incidentFree = Math.max(0, 15 - incidents.length * 5);

  const overallScore = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

  let recommendation = 'maintain';
  if (overallScore >= 85) recommendation = 'preferred';
  else if (overallScore < 60) recommendation = 'review';
  else if (overallScore < 40) recommendation = 'blacklist';

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        finalScoring: {
          calculatedAt: new Date(),
          overallScore,
          breakdown,
          feedback: feedback.comments || null,
          recommendation
        },
        updatedAt: new Date()
      }
    }
  );

  // Mettre à jour le score du transporteur
  await updateCarrierScore(db, session.selection.selectedCarrierId, overallScore);

  return {
    sessionId,
    overallScore,
    breakdown,
    recommendation
  };
}

async function updateCarrierScore(db, carrierId, newScore) {
  const carrier = await db.collection('carriers').findOne({ _id: carrierId });

  const currentScore = carrier?.affretiaScore || 70;
  const missionsCount = carrier?.affretiaMissionsCount || 0;

  // Moyenne pondérée avec les missions passées
  const updatedScore = Math.round(
    (currentScore * missionsCount + newScore) / (missionsCount + 1)
  );

  await db.collection('carriers').updateOne(
    { _id: carrierId },
    {
      $set: { affretiaScore: updatedScore },
      $inc: { affretiaMissionsCount: 1 }
    }
  );
}

/**
 * Clôture la session AFFRET.IA
 */
async function closeSession(db, sessionId, status = AffretiaStatus.COMPLETED) {
  const session = await db.collection('affretia_sessions').findOne({ sessionId });

  if (!session) {
    throw new Error('Session AFFRET.IA non trouvée');
  }

  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        status,
        completedAt: new Date(),
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status,
          changedAt: new Date(),
          reason: 'Session clôturée'
        }
      }
    }
  );

  console.log(`[AFFRET.IA] Session ${sessionId} clôturée avec statut: ${status}`);

  return {
    sessionId,
    status,
    completedAt: new Date()
  };
}

// ============================================================================
// UTILITAIRES
// ============================================================================

async function updateSessionStatus(db, sessionId, status, reason = '') {
  await db.collection('affretia_sessions').updateOne(
    { sessionId },
    {
      $set: {
        status,
        updatedAt: new Date()
      },
      $push: {
        statusHistory: {
          status,
          changedAt: new Date(),
          reason
        }
      }
    }
  );
}

async function getSession(db, sessionId) {
  return db.collection('affretia_sessions').findOne({ sessionId });
}

async function getSessionsByOrder(db, transportOrderId) {
  return db.collection('affretia_sessions').find({
    transportOrderId: new ObjectId(transportOrderId)
  }).sort({ createdAt: -1 }).toArray();
}

async function getActiveSessions(db, organizationId) {
  const query = {
    status: { $nin: [AffretiaStatus.COMPLETED, AffretiaStatus.FAILED, AffretiaStatus.CANCELLED] }
  };

  if (organizationId) {
    query.organizationId = new ObjectId(organizationId);
  }

  return db.collection('affretia_sessions').find(query)
    .sort({ createdAt: -1 })
    .toArray();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constantes
  CONFIG,

  // Déclenchement
  triggerAffretia,

  // Analyse
  analyzeAndGenerateShortlist,
  calculateCarrierScore,

  // Diffusion
  broadcastRequest,
  sendReminder,

  // Réponses
  recordResponse,

  // Sélection
  selectBestCarrier,

  // Attribution
  assignToCarrier,

  // Tracking
  activateTracking,
  updateTrackingPosition,
  recordGeofenceEvent,

  // Documents
  uploadDocument,
  processDocumentOCR,

  // Vigilance
  performVigilanceCheck,

  // Scoring et clôture
  calculateFinalScoring,
  closeSession,

  // Utilitaires
  getSession,
  getSessionsByOrder,
  getActiveSessions,
  updateSessionStatus,
  generateSessionId,
  generateTrackingToken
};
