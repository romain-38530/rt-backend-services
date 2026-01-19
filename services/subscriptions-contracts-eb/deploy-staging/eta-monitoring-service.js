// ETA Monitoring Service - Monitoring des ETA et Détection Retards
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { EventTypes } = require('./transport-orders-models');
const tomtom = require('./tomtom-integration');

/**
 * Seuils de détection de retard (en minutes)
 */
const DELAY_THRESHOLDS = {
  WARNING: 30,    // Alerte à partir de 30 min
  CRITICAL: 60    // Critique à partir de 60 min
};

/**
 * Calculer et mettre à jour l'ETA d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {Object} currentPosition - Position actuelle {lat, lng}
 * @returns {Promise<Object>} Résultat du calcul
 */
async function updateETA(db, orderId, currentPosition) {
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

    // Déterminer la destination en fonction du statut
    let destination;
    let etaType;

    if (!order.actualPickupDate) {
      // En route vers le chargement
      destination = order.pickupAddress.coordinates;
      etaType = 'PICKUP';
    } else {
      // En route vers la livraison
      destination = order.deliveryAddress.coordinates;
      etaType = 'DELIVERY';
    }

    // Calculer l'ETA avec TomTom
    const routeResult = await tomtom.calculateRoute(currentPosition, destination);

    if (!routeResult.success) {
      return {
        success: false,
        error: `Failed to calculate ETA: ${routeResult.error}`
      };
    }

    const eta = {
      type: etaType,
      estimatedArrival: routeResult.eta,
      distanceRemaining: routeResult.distance,
      travelTimeRemaining: routeResult.travelTime,
      currentPosition,
      calculatedAt: new Date()
    };

    // Sauvegarder l'ETA dans la commande
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          currentETA: eta,
          lastETAUpdate: new Date()
        },
        $push: {
          etaHistory: {
            $each: [eta],
            $slice: -50 // Garder seulement les 50 dernières
          }
        }
      }
    );

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.TRACKING_ETA_UPDATED,
      timestamp: new Date(),
      data: {
        eta: routeResult.eta,
        type: etaType,
        distanceRemaining: routeResult.distance,
        travelTimeRemaining: routeResult.travelTime,
        currentPosition
      },
      metadata: {
        source: 'TOMTOM'
      }
    });

    return {
      success: true,
      eta: routeResult.eta,
      etaType,
      distanceRemaining: routeResult.distance,
      travelTimeRemaining: routeResult.travelTime
    };

  } catch (error) {
    console.error('Error updating ETA:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Détecter les retards d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Résultat de la détection
 */
async function detectDelay(db, orderId) {
  try {
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    if (!order.currentETA) {
      return {
        success: true,
        hasDelay: false,
        reason: 'No ETA available'
      };
    }

    // Déterminer la date prévue
    let scheduledTime;
    let delayType;

    if (order.currentETA.type === 'PICKUP') {
      scheduledTime = order.pickupDate || order.pickupTimeWindow?.start;
      delayType = 'PICKUP_DELAY';
    } else {
      scheduledTime = order.deliveryDate || order.deliveryTimeWindow?.start;
      delayType = 'DELIVERY_DELAY';
    }

    if (!scheduledTime) {
      return {
        success: true,
        hasDelay: false,
        reason: 'No scheduled time'
      };
    }

    // Calculer le retard
    const scheduledDate = new Date(scheduledTime);
    const etaDate = new Date(order.currentETA.estimatedArrival);
    const delayMinutes = (etaDate - scheduledDate) / (1000 * 60);

    // Pas de retard si en avance ou à l'heure
    if (delayMinutes <= 0) {
      return {
        success: true,
        hasDelay: false,
        ahead: true,
        aheadMinutes: Math.abs(delayMinutes)
      };
    }

    // Déterminer la sévérité
    let severity;
    if (delayMinutes >= DELAY_THRESHOLDS.CRITICAL) {
      severity = 'CRITICAL';
    } else if (delayMinutes >= DELAY_THRESHOLDS.WARNING) {
      severity = 'WARNING';
    } else {
      // Retard mineur, pas d'alerte
      return {
        success: true,
        hasDelay: true,
        severity: 'MINOR',
        delayMinutes: Math.round(delayMinutes),
        silentDelay: true
      };
    }

    // Vérifier si une alerte a déjà été envoyée récemment
    const recentAlert = await db.collection('transport_events')
      .findOne({
        orderId: new ObjectId(orderId),
        eventType: EventTypes.TRACKING_DELAY_DETECTED,
        timestamp: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // 30 minutes
      });

    if (recentAlert) {
      return {
        success: true,
        hasDelay: true,
        severity,
        delayMinutes: Math.round(delayMinutes),
        alertAlreadySent: true
      };
    }

    // Créer l'événement de retard
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.TRACKING_DELAY_DETECTED,
      timestamp: new Date(),
      data: {
        delayType,
        severity,
        delayMinutes: Math.round(delayMinutes),
        scheduledTime,
        estimatedArrival: etaDate,
        currentETA: order.currentETA
      },
      metadata: {
        source: 'AUTO',
        alertSent: true
      }
    });

    // Mettre à jour le statut de la commande si nécessaire
    if (severity === 'CRITICAL' && order.status !== 'DELAYED') {
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            delayDetected: true,
            delayInfo: {
              type: delayType,
              severity,
              delayMinutes: Math.round(delayMinutes),
              detectedAt: new Date()
            }
          }
        }
      );
    }

    return {
      success: true,
      hasDelay: true,
      severity,
      delayMinutes: Math.round(delayMinutes),
      delayType,
      alertSent: true
    };

  } catch (error) {
    console.error('Error detecting delay:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Monitorer toutes les commandes actives pour les retards
 * @param {Object} db - MongoDB database
 * @returns {Promise<Object>} Résultat du monitoring
 */
async function monitorActiveOrders(db) {
  try {
    // Récupérer toutes les commandes en cours de transport
    const activeOrders = await db.collection('transport_orders')
      .find({
        status: {
          $in: [
            'TRACKING_STARTED',
            'EN_ROUTE_PICKUP',
            'LOADED',
            'EN_ROUTE_DELIVERY'
          ]
        },
        currentETA: { $exists: true }
      })
      .toArray();

    const results = {
      totalChecked: activeOrders.length,
      delaysDetected: 0,
      warnings: 0,
      critical: 0,
      orders: []
    };

    for (const order of activeOrders) {
      const delayResult = await detectDelay(db, order._id.toString());

      if (delayResult.success && delayResult.hasDelay) {
        results.delaysDetected++;

        if (delayResult.severity === 'WARNING') {
          results.warnings++;
        } else if (delayResult.severity === 'CRITICAL') {
          results.critical++;
        }

        results.orders.push({
          orderId: order._id.toString(),
          reference: order.reference,
          severity: delayResult.severity,
          delayMinutes: delayResult.delayMinutes,
          delayType: delayResult.delayType
        });
      }
    }

    return {
      success: true,
      ...results,
      timestamp: new Date()
    };

  } catch (error) {
    console.error('Error monitoring active orders:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir l'historique ETA d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Historique ETA
 */
async function getETAHistory(db, orderId) {
  try {
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    return {
      success: true,
      currentETA: order.currentETA,
      history: order.etaHistory || [],
      totalUpdates: (order.etaHistory || []).length
    };

  } catch (error) {
    console.error('Error getting ETA history:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculer la progression du trajet (%)
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Progression
 */
async function calculateProgress(db, orderId) {
  try {
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    if (!order.currentETA) {
      return {
        success: true,
        progress: 0,
        reason: 'No ETA available'
      };
    }

    // Calculer la distance totale
    let origin, destination;

    if (order.currentETA.type === 'PICKUP') {
      origin = order.pickupAddress.coordinates;
      destination = order.pickupAddress.coordinates;
      // En route vers pickup, pas encore de progression sur le trajet principal
      return {
        success: true,
        progress: 0,
        stage: 'TO_PICKUP',
        distanceRemaining: order.currentETA.distanceRemaining
      };
    } else {
      origin = order.pickupAddress.coordinates;
      destination = order.deliveryAddress.coordinates;
    }

    const totalDistance = tomtom.calculateHaversineDistance(origin, destination);
    const remainingDistance = order.currentETA.distanceRemaining;

    const completedDistance = totalDistance - remainingDistance;
    const progress = (completedDistance / totalDistance) * 100;

    return {
      success: true,
      progress: Math.max(0, Math.min(100, Math.round(progress))),
      stage: 'TO_DELIVERY',
      totalDistance: Math.round(totalDistance),
      completedDistance: Math.round(completedDistance),
      remainingDistance: Math.round(remainingDistance)
    };

  } catch (error) {
    console.error('Error calculating progress:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir les statistiques de retard d'un industriel
 * @param {Object} db - MongoDB database
 * @param {String} industrialId - ID de l'industriel
 * @param {Object} filters - Filtres
 * @returns {Promise<Object>} Statistiques
 */
async function getDelayStatistics(db, industrialId, filters = {}) {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = filters;

    const delayEvents = await db.collection('transport_events')
      .aggregate([
        {
          $match: {
            eventType: EventTypes.TRACKING_DELAY_DETECTED,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $lookup: {
            from: 'transport_orders',
            localField: 'orderId',
            foreignField: '_id',
            as: 'order'
          }
        },
        {
          $unwind: '$order'
        },
        {
          $match: {
            'order.industrialId': industrialId
          }
        }
      ])
      .toArray();

    const stats = {
      totalDelays: delayEvents.length,
      warnings: delayEvents.filter(e => e.data.severity === 'WARNING').length,
      critical: delayEvents.filter(e => e.data.severity === 'CRITICAL').length,
      pickupDelays: delayEvents.filter(e => e.data.delayType === 'PICKUP_DELAY').length,
      deliveryDelays: delayEvents.filter(e => e.data.delayType === 'DELIVERY_DELAY').length,
      avgDelayMinutes: 0
    };

    if (delayEvents.length > 0) {
      const totalDelay = delayEvents.reduce((sum, e) => sum + e.data.delayMinutes, 0);
      stats.avgDelayMinutes = Math.round(totalDelay / delayEvents.length);
    }

    return {
      success: true,
      period: { startDate, endDate },
      ...stats
    };

  } catch (error) {
    console.error('Error getting delay statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  DELAY_THRESHOLDS,
  updateETA,
  detectDelay,
  monitorActiveOrders,
  getETAHistory,
  calculateProgress,
  getDelayStatistics
};
