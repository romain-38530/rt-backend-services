// Carrier Scoring Service - Calcul Automatique des Scores Transporteurs
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { EventTypes, ScoringCriteria } = require('./transport-orders-models');

/**
 * Calculer le score d'un transporteur pour une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Résultat du scoring
 */
async function calculateCarrierScore(db, orderId) {
  try {
    // Récupérer la commande
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    if (!order.assignedCarrierId) {
      return {
        success: false,
        error: 'No carrier assigned to this order'
      };
    }

    // Calculer les métriques
    const metrics = await calculateOrderMetrics(db, order);

    // Calculer le score final
    const scoreBreakdown = {};
    let totalScore = 0;
    let totalWeight = 0;

    // 1. Ponctualité chargement (20 points)
    if (metrics.punctualityPickup !== null) {
      const pickupScore = scorePunctuality(
        metrics.punctualityPickup,
        ScoringCriteria.PUNCTUALITY_PICKUP.thresholds
      );
      scoreBreakdown.punctualityPickup = {
        value: metrics.punctualityPickup,
        score: pickupScore,
        weight: ScoringCriteria.PUNCTUALITY_PICKUP.weight
      };
      totalScore += pickupScore * ScoringCriteria.PUNCTUALITY_PICKUP.weight;
      totalWeight += ScoringCriteria.PUNCTUALITY_PICKUP.weight;
    }

    // 2. Ponctualité livraison (25 points)
    if (metrics.punctualityDelivery !== null) {
      const deliveryScore = scorePunctuality(
        metrics.punctualityDelivery,
        ScoringCriteria.PUNCTUALITY_DELIVERY.thresholds
      );
      scoreBreakdown.punctualityDelivery = {
        value: metrics.punctualityDelivery,
        score: deliveryScore,
        weight: ScoringCriteria.PUNCTUALITY_DELIVERY.weight
      };
      totalScore += deliveryScore * ScoringCriteria.PUNCTUALITY_DELIVERY.weight;
      totalWeight += ScoringCriteria.PUNCTUALITY_DELIVERY.weight;
    }

    // 3. Respect RDV (15 points)
    if (metrics.rdvRespect !== null) {
      const rdvScore = metrics.rdvRespect ? 100 : 50;
      scoreBreakdown.rdvRespect = {
        value: metrics.rdvRespect,
        score: rdvScore,
        weight: ScoringCriteria.RDV_RESPECT.weight
      };
      totalScore += rdvScore * ScoringCriteria.RDV_RESPECT.weight;
      totalWeight += ScoringCriteria.RDV_RESPECT.weight;
    }

    // 4. Réactivité tracking (15 points)
    if (metrics.trackingReactivity !== null) {
      const trackingScore = scoreTrackingReactivity(
        metrics.trackingReactivity,
        ScoringCriteria.TRACKING_REACTIVITY.thresholds
      );
      scoreBreakdown.trackingReactivity = {
        value: metrics.trackingReactivity,
        score: trackingScore,
        weight: ScoringCriteria.TRACKING_REACTIVITY.weight
      };
      totalScore += trackingScore * ScoringCriteria.TRACKING_REACTIVITY.weight;
      totalWeight += ScoringCriteria.TRACKING_REACTIVITY.weight;
    }

    // 5. Délai dépôt POD (15 points)
    if (metrics.podDelay !== null) {
      const podScore = scorePODDelay(
        metrics.podDelay,
        ScoringCriteria.POD_DELAY.thresholds
      );
      scoreBreakdown.podDelay = {
        value: metrics.podDelay,
        score: podScore,
        weight: ScoringCriteria.POD_DELAY.weight
      };
      totalScore += podScore * ScoringCriteria.POD_DELAY.weight;
      totalWeight += ScoringCriteria.POD_DELAY.weight;
    }

    // 6. Incidents (10 points)
    const incidentScore = scoreIncidents(
      metrics.incidents,
      ScoringCriteria.INCIDENTS.thresholds
    );
    scoreBreakdown.incidents = {
      count: metrics.incidents.length,
      score: incidentScore,
      weight: ScoringCriteria.INCIDENTS.weight
    };
    totalScore += incidentScore * ScoringCriteria.INCIDENTS.weight;
    totalWeight += ScoringCriteria.INCIDENTS.weight;

    // Score final (0-100)
    const finalScore = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;

    // Sauvegarder le score dans la commande
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          carrierScore: finalScore,
          carrierScoreBreakdown: scoreBreakdown,
          carrierScoreCalculatedAt: new Date()
        }
      }
    );

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.CARRIER_SCORED,
      timestamp: new Date(),
      data: {
        carrierId: order.assignedCarrierId,
        score: finalScore,
        breakdown: scoreBreakdown
      },
      metadata: {
        source: 'AUTO'
      }
    });

    // Mettre à jour le score global du transporteur
    await updateCarrierGlobalScore(db, order.assignedCarrierId, finalScore);

    return {
      success: true,
      score: finalScore,
      breakdown: scoreBreakdown,
      metrics
    };

  } catch (error) {
    console.error('Error calculating carrier score:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculer les métriques d'une commande
 * @param {Object} db - MongoDB database
 * @param {Object} order - Commande
 * @returns {Promise<Object>} Métriques
 */
async function calculateOrderMetrics(db, order) {
  const metrics = {
    punctualityPickup: null,
    punctualityDelivery: null,
    rdvRespect: null,
    trackingReactivity: null,
    podDelay: null,
    incidents: []
  };

  // Récupérer les événements de la commande
  const events = await db.collection('transport_events')
    .find({ orderId: order._id })
    .sort({ timestamp: 1 })
    .toArray();

  // 1. Ponctualité chargement
  const arrivedPickupEvent = events.find(e => e.eventType === EventTypes.ARRIVED_PICKUP);
  if (arrivedPickupEvent && order.pickupDate) {
    const scheduledTime = new Date(order.pickupDate);
    const actualTime = new Date(arrivedPickupEvent.timestamp);
    metrics.punctualityPickup = (actualTime - scheduledTime) / (1000 * 60); // minutes
  }

  // 2. Ponctualité livraison
  const deliveredEvent = events.find(e => e.eventType === EventTypes.DELIVERED);
  if (deliveredEvent && order.deliveryDate) {
    const scheduledTime = new Date(order.deliveryDate);
    const actualTime = new Date(deliveredEvent.timestamp);
    metrics.punctualityDelivery = (actualTime - scheduledTime) / (1000 * 60); // minutes
  }

  // 3. Respect RDV
  const rdvConfirmedEvents = events.filter(e => e.eventType === EventTypes.RDV_CONFIRMED);
  metrics.rdvRespect = rdvConfirmedEvents.length > 0;

  // 4. Réactivité tracking
  const trackingEvents = events.filter(e =>
    e.eventType === EventTypes.TRACKING_ETA_UPDATED ||
    e.eventType === EventTypes.ARRIVED_PICKUP ||
    e.eventType === EventTypes.LOADED ||
    e.eventType === EventTypes.ARRIVED_DELIVERY
  );

  if (trackingEvents.length > 1) {
    // Calculer la fréquence moyenne de mise à jour (en minutes)
    const firstEvent = trackingEvents[0];
    const lastEvent = trackingEvents[trackingEvents.length - 1];
    const totalTime = (new Date(lastEvent.timestamp) - new Date(firstEvent.timestamp)) / (1000 * 60);
    metrics.trackingReactivity = totalTime / trackingEvents.length;
  }

  // 5. Délai dépôt POD
  const documentsUploadedEvent = events.find(e => e.eventType === EventTypes.DOCUMENTS_UPLOADED);
  if (documentsUploadedEvent && deliveredEvent) {
    const deliveryTime = new Date(deliveredEvent.timestamp);
    const uploadTime = new Date(documentsUploadedEvent.timestamp);
    metrics.podDelay = (uploadTime - deliveryTime) / (1000 * 60 * 60); // heures
  }

  // 6. Incidents
  const incidentEvents = events.filter(e =>
    e.eventType === EventTypes.INCIDENT_REPORTED ||
    e.eventType === EventTypes.DELAY_REPORTED
  );
  metrics.incidents = incidentEvents.map(e => ({
    type: e.data?.type || 'UNKNOWN',
    severity: e.data?.severity || 'MINOR',
    timestamp: e.timestamp
  }));

  return metrics;
}

/**
 * Scorer la ponctualité
 * @param {Number} delayMinutes - Retard en minutes (négatif si en avance)
 * @param {Object} thresholds - Seuils de scoring
 * @returns {Number} Score 0-100
 */
function scorePunctuality(delayMinutes, thresholds) {
  const absDelay = Math.abs(delayMinutes);

  if (absDelay <= 5) return thresholds.onTime;
  if (absDelay <= 15) return thresholds.delay15;
  if (absDelay <= 30) return thresholds.delay30;
  if (absDelay <= 60) return thresholds.delay60;
  return thresholds.delayOver;
}

/**
 * Scorer la réactivité tracking
 * @param {Number} avgMinutes - Fréquence moyenne de mise à jour (minutes)
 * @param {Object} thresholds - Seuils de scoring
 * @returns {Number} Score 0-100
 */
function scoreTrackingReactivity(avgMinutes, thresholds) {
  if (avgMinutes <= 5) return thresholds.realTime;
  if (avgMinutes <= 30) return thresholds.frequent;
  if (avgMinutes <= 60) return thresholds.occasional;
  return thresholds.rare;
}

/**
 * Scorer le délai dépôt POD
 * @param {Number} delayHours - Délai en heures
 * @param {Object} thresholds - Seuils de scoring
 * @returns {Number} Score 0-100
 */
function scorePODDelay(delayHours, thresholds) {
  if (delayHours <= 24) return thresholds.sameDay;
  if (delayHours <= 48) return thresholds.nextDay;
  if (delayHours <= 72) return thresholds.twoDays;
  if (delayHours <= 96) return thresholds.threeDays;
  return thresholds.overThree;
}

/**
 * Scorer les incidents
 * @param {Array} incidents - Liste des incidents
 * @param {Object} thresholds - Seuils de scoring
 * @returns {Number} Score 0-100
 */
function scoreIncidents(incidents, thresholds) {
  if (incidents.length === 0) return thresholds.none;

  const hasCritical = incidents.some(i => i.severity === 'CRITICAL');
  if (hasCritical) return thresholds.critical;

  const hasMajor = incidents.some(i => i.severity === 'MAJOR');
  if (hasMajor) return thresholds.major;

  const hasMinor = incidents.some(i => i.severity === 'MINOR');
  if (hasMinor) return thresholds.minor;

  return thresholds.justified;
}

/**
 * Mettre à jour le score global d'un transporteur
 * @param {Object} db - MongoDB database
 * @param {String} carrierId - ID du transporteur
 * @param {Number} newScore - Nouveau score
 * @returns {Promise<Object>} Résultat de la mise à jour
 */
async function updateCarrierGlobalScore(db, carrierId, newScore) {
  try {
    // Récupérer le transporteur
    const carrier = await db.collection('carriers').findOne({ carrierId });

    if (!carrier) {
      return {
        success: false,
        error: 'Carrier not found'
      };
    }

    // Calculer le nouveau score global (moyenne pondérée)
    const scoreHistory = carrier.scoreHistory || [];
    scoreHistory.push({
      date: new Date(),
      score: newScore
    });

    // Garder seulement les 100 derniers scores
    if (scoreHistory.length > 100) {
      scoreHistory.shift();
    }

    // Calculer la moyenne des scores (pondérée par récence)
    let totalWeightedScore = 0;
    let totalWeight = 0;

    scoreHistory.forEach((entry, index) => {
      const weight = index + 1; // Les scores récents pèsent plus lourd
      totalWeightedScore += entry.score * weight;
      totalWeight += weight;
    });

    const newGlobalScore = totalWeight > 0 ?
      Math.round(totalWeightedScore / totalWeight) :
      newScore;

    // Mettre à jour le transporteur
    await db.collection('carriers').updateOne(
      { carrierId },
      {
        $set: {
          globalScore: newGlobalScore,
          scoreHistory,
          lastScoreUpdate: new Date()
        }
      }
    );

    return {
      success: true,
      oldScore: carrier.globalScore,
      newScore: newGlobalScore
    };

  } catch (error) {
    console.error('Error updating carrier global score:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir l'historique de performance d'un transporteur
 * @param {Object} db - MongoDB database
 * @param {String} carrierId - ID du transporteur
 * @param {Object} options - Options de filtrage
 * @returns {Promise<Object>} Historique de performance
 */
async function getCarrierPerformanceHistory(db, carrierId, options = {}) {
  try {
    const {
      startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 jours par défaut
      endDate = new Date()
    } = options;

    // Récupérer toutes les commandes scorées pour ce transporteur
    const orders = await db.collection('transport_orders')
      .find({
        assignedCarrierId: carrierId,
        carrierScore: { $exists: true },
        carrierScoreCalculatedAt: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ carrierScoreCalculatedAt: -1 })
      .toArray();

    if (orders.length === 0) {
      return {
        success: true,
        carrierId,
        period: { startDate, endDate },
        totalOrders: 0,
        averageScore: null,
        scores: []
      };
    }

    // Calculer les statistiques
    const scores = orders.map(o => o.carrierScore);
    const averageScore = Math.round(
      scores.reduce((sum, s) => sum + s, 0) / scores.length
    );

    const breakdown = {
      punctualityPickup: [],
      punctualityDelivery: [],
      rdvRespect: [],
      trackingReactivity: [],
      podDelay: [],
      incidents: []
    };

    orders.forEach(order => {
      if (order.carrierScoreBreakdown) {
        Object.keys(breakdown).forEach(key => {
          if (order.carrierScoreBreakdown[key]) {
            breakdown[key].push(order.carrierScoreBreakdown[key].score);
          }
        });
      }
    });

    // Calculer les moyennes par critère
    const averageByCategory = {};
    Object.keys(breakdown).forEach(key => {
      if (breakdown[key].length > 0) {
        averageByCategory[key] = Math.round(
          breakdown[key].reduce((sum, s) => sum + s, 0) / breakdown[key].length
        );
      }
    });

    return {
      success: true,
      carrierId,
      period: { startDate, endDate },
      totalOrders: orders.length,
      averageScore,
      averageByCategory,
      scores: orders.map(o => ({
        orderId: o._id.toString(),
        reference: o.reference,
        score: o.carrierScore,
        date: o.carrierScoreCalculatedAt
      }))
    };

  } catch (error) {
    console.error('Error getting carrier performance history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  calculateCarrierScore,
  updateCarrierGlobalScore,
  getCarrierPerformanceHistory,
  scorePunctuality,
  scoreTrackingReactivity,
  scorePODDelay,
  scoreIncidents
};
