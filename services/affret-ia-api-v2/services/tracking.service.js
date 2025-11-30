/**
 * Service de Tracking IA AFFRET.IA
 * Gere le suivi intelligent a 3 niveaux: Basic, Intermediaire, Premium
 *
 * Niveaux:
 * - BASIC: Statuts manuels uniquement (gratuit)
 * - INTERMEDIATE: Geolocalisation toutes les 2h + geofencing
 * - PREMIUM: GPS temps reel (5min) + ETA predictif + alertes avancees
 */

const axios = require('axios');
const TrackingSession = require('../models/TrackingSession');
const AffretSession = require('../models/AffretSession');

class TrackingService {
  constructor() {
    this.tomtomApiKey = process.env.TOMTOM_API_KEY;
    this.trackingApiUrl = process.env.TRACKING_API_URL;
    this.websocketApiUrl = process.env.WEBSOCKET_API_URL;

    // Seuils d'alerte
    this.alertThresholds = {
      delayMinutes: 30,           // Alerte si retard > 30 min
      routeDeviationKm: 10,       // Alerte si ecart > 10 km
      maxSpeedKmh: 130,           // Alerte si vitesse > 130 km/h
      longStopMinutes: 60,        // Alerte si arret > 1h
      noSignalMinutes: 30         // Alerte si pas de signal > 30 min
    };
  }

  // ==================== CONFIGURATION TRACKING ====================

  /**
   * Configurer le tracking pour une commande assignee
   */
  async configureTracking(sessionId, orderId, carrierId, level = 'basic') {
    try {
      // Verifier si une session de tracking existe deja
      const existingTracking = await TrackingSession.findOne({ orderId, status: { $ne: 'completed' } });

      if (existingTracking) {
        // Mettre a jour le niveau si necessaire
        if (existingTracking.level !== level) {
          existingTracking.level = level;
          existingTracking.config = TrackingSession.getLevelConfig(level);
          await existingTracking.save();
        }
        return existingTracking;
      }

      // Recuperer les details de la commande
      let orderData = {};
      try {
        const orderResponse = await axios.get(
          `${process.env.ORDERS_API_URL}/api/v1/orders/${orderId}`
        );
        orderData = orderResponse.data.data;
      } catch (error) {
        console.warn('[TRACKING SERVICE] Could not fetch order details:', error.message);
      }

      // Generer l'ID de tracking
      const trackingId = await TrackingSession.generateTrackingId();

      // Obtenir la configuration par niveau
      const config = TrackingSession.getLevelConfig(level);

      // Creer la session de tracking
      const trackingSession = new TrackingSession({
        trackingId,
        sessionId,
        orderId,
        carrierId,
        level,
        config,
        status: 'pending',
        waypoints: {
          pickup: {
            address: orderData.pickup?.address || '',
            latitude: orderData.pickup?.latitude,
            longitude: orderData.pickup?.longitude,
            plannedArrival: orderData.pickupDate,
            status: 'pending',
            geofenceRadius: 200
          },
          delivery: {
            address: orderData.delivery?.address || '',
            latitude: orderData.delivery?.latitude,
            longitude: orderData.delivery?.longitude,
            plannedArrival: orderData.deliveryDate,
            status: 'pending',
            geofenceRadius: 200
          }
        },
        tripMetrics: {
          plannedDistance: orderData.distance || 0
        }
      });

      // Calculer ETA initial si coordonnees disponibles
      if (orderData.pickup?.latitude && orderData.delivery?.latitude) {
        const distance = trackingSession.calculateDistance(
          orderData.pickup.latitude, orderData.pickup.longitude,
          orderData.delivery.latitude, orderData.delivery.longitude
        );

        // Estimer 60 km/h de moyenne
        const timeMinutes = Math.round((distance / 60) * 60);
        const pickupTime = orderData.pickupDate ? new Date(orderData.pickupDate) : new Date();

        trackingSession.eta.delivery = {
          estimated: new Date(pickupTime.getTime() + timeMinutes * 60 * 1000),
          confidence: 70,
          lastCalculated: new Date(),
          method: 'static',
          distanceRemaining: distance,
          timeRemaining: timeMinutes
        };
      }

      await trackingSession.save();

      // Emettre evenement WebSocket
      this.emitEvent('tracking.configured', {
        trackingId,
        orderId,
        level,
        carrierId
      });

      return trackingSession;

    } catch (error) {
      console.error('[TRACKING SERVICE] Error configuring tracking:', error);
      throw error;
    }
  }

  // ==================== MISE A JOUR POSITION ====================

  /**
   * Mettre a jour la position du transporteur
   */
  async updatePosition(trackingId, position) {
    try {
      const tracking = await TrackingSession.findOne({ trackingId });

      if (!tracking) {
        throw new Error('Tracking session not found');
      }

      // Verifier que le tracking GPS est active pour ce niveau
      if (!tracking.config.gpsEnabled && position.source === 'gps') {
        // Pour le niveau basic, on accepte quand meme les positions manuelles
        if (tracking.level === 'basic' && position.source !== 'manual') {
          return {
            success: false,
            message: 'GPS tracking not enabled for basic level'
          };
        }
      }

      // Sauvegarder l'ancienne position pour comparaison
      const oldPosition = tracking.currentPosition;

      // Mettre a jour la position
      tracking.updatePosition(position);

      // Verifier les geofences si active
      if (tracking.config.geofencingEnabled) {
        await this.checkGeofences(tracking);
      }

      // Detecter les anomalies et generer des alertes
      if (tracking.config.alertsEnabled) {
        await this.detectAnomalies(tracking, oldPosition, position);
      }

      // Recalculer ETA si niveau premium
      if (tracking.config.etaPredictionEnabled) {
        await this.updateETAPrediction(tracking);
      }

      await tracking.save();

      // Emettre evenement WebSocket temps reel
      this.emitEvent('tracking.position.updated', {
        trackingId,
        orderId: tracking.orderId,
        position: tracking.currentPosition,
        eta: tracking.eta.delivery
      });

      return {
        success: true,
        trackingId,
        position: tracking.currentPosition,
        eta: tracking.eta.delivery
      };

    } catch (error) {
      console.error('[TRACKING SERVICE] Error updating position:', error);
      throw error;
    }
  }

  /**
   * Mise a jour de statut manuel (niveau Basic)
   */
  async updateStatus(trackingId, status, notes = '') {
    try {
      const tracking = await TrackingSession.findOne({ trackingId });

      if (!tracking) {
        throw new Error('Tracking session not found');
      }

      const oldStatus = tracking.status;
      tracking.status = status;

      // Mettre a jour les timestamps selon le statut
      const now = new Date();
      switch (status) {
        case 'pickup_en_route':
          tracking.timestamps.started = tracking.timestamps.started || now;
          break;
        case 'at_pickup':
          tracking.timestamps.pickupArrival = now;
          tracking.waypoints.pickup.actualArrival = now;
          tracking.waypoints.pickup.status = 'arrived';
          break;
        case 'in_transit':
          tracking.timestamps.pickupDeparture = now;
          tracking.waypoints.pickup.departureTime = now;
          tracking.waypoints.pickup.status = 'completed';
          break;
        case 'at_delivery':
          tracking.timestamps.deliveryArrival = now;
          tracking.waypoints.delivery.actualArrival = now;
          tracking.waypoints.delivery.status = 'arrived';
          break;
        case 'delivered':
        case 'completed':
          tracking.timestamps.completed = now;
          tracking.waypoints.delivery.status = 'completed';
          break;
      }

      await tracking.save();

      // Emettre evenement
      this.emitEvent('tracking.status.updated', {
        trackingId,
        orderId: tracking.orderId,
        oldStatus,
        newStatus: status,
        notes
      });

      return tracking;

    } catch (error) {
      console.error('[TRACKING SERVICE] Error updating status:', error);
      throw error;
    }
  }

  // ==================== GEOFENCING ====================

  /**
   * Verifier les geofences
   */
  async checkGeofences(tracking) {
    if (!tracking.currentPosition) return;

    const pos = tracking.currentPosition;

    // Verifier geofence pickup
    if (tracking.waypoints.pickup.latitude && tracking.waypoints.pickup.status === 'pending') {
      const isAtPickup = tracking.isInGeofence(
        tracking.waypoints.pickup.latitude,
        tracking.waypoints.pickup.longitude,
        tracking.waypoints.pickup.geofenceRadius
      );

      if (isAtPickup) {
        tracking.waypoints.pickup.status = 'arrived';
        tracking.waypoints.pickup.actualArrival = new Date();
        tracking.addAlert('geofence_enter', 'info', 'Arrivee sur site d\'enlevement detectee', {
          location: 'pickup'
        });
      }
    }

    // Verifier geofence delivery
    if (tracking.waypoints.delivery.latitude &&
        tracking.waypoints.delivery.status === 'pending' &&
        tracking.waypoints.pickup.status === 'completed') {

      const isAtDelivery = tracking.isInGeofence(
        tracking.waypoints.delivery.latitude,
        tracking.waypoints.delivery.longitude,
        tracking.waypoints.delivery.geofenceRadius
      );

      if (isAtDelivery) {
        tracking.waypoints.delivery.status = 'arrived';
        tracking.waypoints.delivery.actualArrival = new Date();
        tracking.addAlert('geofence_enter', 'info', 'Arrivee sur site de livraison detectee', {
          location: 'delivery'
        });
      }
    }
  }

  // ==================== DETECTION ANOMALIES ====================

  /**
   * Detecter les anomalies et generer des alertes
   */
  async detectAnomalies(tracking, oldPosition, newPosition) {
    // Vitesse excessive
    if (newPosition.speed && newPosition.speed > this.alertThresholds.maxSpeedKmh) {
      tracking.addAlert('speed_violation', 'warning',
        `Vitesse excessive detectee: ${newPosition.speed} km/h`, {
          speed: newPosition.speed,
          limit: this.alertThresholds.maxSpeedKmh
        }
      );
    }

    // Perte de signal
    if (oldPosition && oldPosition.timestamp) {
      const timeSinceLastUpdate = (new Date() - new Date(oldPosition.timestamp)) / (1000 * 60);

      if (timeSinceLastUpdate > this.alertThresholds.noSignalMinutes) {
        tracking.addAlert('no_signal', 'warning',
          `Pas de signal GPS depuis ${Math.round(timeSinceLastUpdate)} minutes`, {
            lastSignal: oldPosition.timestamp
          }
        );
      }
    }

    // Arret prolonge
    if (newPosition.speed === 0 && oldPosition && oldPosition.speed === 0) {
      // Calculer duree de l'arret
      const stopDuration = this.calculateStopDuration(tracking.positionHistory);

      if (stopDuration > this.alertThresholds.longStopMinutes) {
        // Verifier si alerte deja emise
        const existingAlert = tracking.alerts.find(a =>
          a.type === 'long_stop' && !a.resolved &&
          (new Date() - new Date(a.createdAt)) < 3600000 // Moins d'1h
        );

        if (!existingAlert) {
          tracking.addAlert('long_stop', 'info',
            `Arret prolonge detecte: ${stopDuration} minutes`, {
              duration: stopDuration
            }
          );
        }
      }
    }

    // Deviation de trajet (si on a la route planifiee)
    if (tracking.level === 'premium' && tracking.waypoints.delivery.latitude) {
      await this.checkRouteDeviation(tracking, newPosition);
    }
  }

  /**
   * Calculer la duree d'un arret
   */
  calculateStopDuration(positionHistory) {
    if (positionHistory.length < 2) return 0;

    let stopStart = null;

    for (let i = positionHistory.length - 1; i >= 0; i--) {
      const pos = positionHistory[i];

      if (pos.speed && pos.speed > 5) {
        // Vehicule en mouvement
        if (stopStart) {
          return Math.round((new Date(positionHistory[positionHistory.length - 1].timestamp) - new Date(stopStart)) / (1000 * 60));
        }
        return 0;
      }

      stopStart = stopStart || pos.timestamp;
    }

    if (stopStart) {
      return Math.round((new Date() - new Date(stopStart)) / (1000 * 60));
    }

    return 0;
  }

  /**
   * Verifier la deviation de trajet
   */
  async checkRouteDeviation(tracking, currentPosition) {
    // Calculer distance au point de livraison
    const directDistance = tracking.calculateDistance(
      currentPosition.latitude, currentPosition.longitude,
      tracking.waypoints.delivery.latitude, tracking.waypoints.delivery.longitude
    );

    // Comparer avec la distance restante estimee
    if (tracking.eta.delivery && tracking.eta.delivery.distanceRemaining) {
      const deviation = directDistance - tracking.eta.delivery.distanceRemaining;

      if (deviation > this.alertThresholds.routeDeviationKm) {
        const existingAlert = tracking.alerts.find(a =>
          a.type === 'route_deviation' && !a.resolved
        );

        if (!existingAlert) {
          tracking.addAlert('route_deviation', 'warning',
            `Ecart de trajet detecte: +${Math.round(deviation)} km`, {
              deviation,
              expectedDistance: tracking.eta.delivery.distanceRemaining,
              actualDistance: directDistance
            }
          );
        }
      }
    }
  }

  // ==================== ETA PREDICTIF ====================

  /**
   * Mettre a jour l'ETA avec prediction intelligente
   */
  async updateETAPrediction(tracking) {
    if (!tracking.currentPosition || !tracking.waypoints.delivery.latitude) return;

    // Calculer la distance restante
    const distanceRemaining = tracking.calculateDistance(
      tracking.currentPosition.latitude, tracking.currentPosition.longitude,
      tracking.waypoints.delivery.latitude, tracking.waypoints.delivery.longitude
    );

    // Calculer la vitesse moyenne des dernieres positions
    let avgSpeed = 60; // Defaut
    if (tracking.positionHistory.length >= 5) {
      const recentSpeeds = tracking.positionHistory
        .slice(-10)
        .filter(p => p.speed && p.speed > 0)
        .map(p => p.speed);

      if (recentSpeeds.length > 0) {
        avgSpeed = recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length;
      }
    }

    // Appliquer facteur de trafic si API TomTom disponible
    let trafficFactor = 1.0;
    if (this.tomtomApiKey) {
      try {
        trafficFactor = await this.getTrafficFactor(
          tracking.currentPosition.latitude,
          tracking.currentPosition.longitude,
          tracking.waypoints.delivery.latitude,
          tracking.waypoints.delivery.longitude
        );
      } catch (error) {
        console.warn('[TRACKING SERVICE] Could not get traffic factor:', error.message);
      }
    }

    // Calculer temps restant avec facteur trafic
    const adjustedSpeed = avgSpeed / trafficFactor;
    const timeRemainingMinutes = Math.round((distanceRemaining / adjustedSpeed) * 60);

    const newETA = new Date(Date.now() + timeRemainingMinutes * 60 * 1000);

    // Verifier changement significatif d'ETA
    const oldETA = tracking.eta.delivery.estimated;
    if (oldETA) {
      const etaChange = Math.abs(newETA - oldETA) / (1000 * 60); // minutes

      if (etaChange > 15) {
        tracking.addAlert('eta_change', 'info',
          `ETA modifie de ${Math.round(etaChange)} minutes`, {
            oldETA,
            newETA,
            reason: etaChange > 0 ? 'delay' : 'faster'
          }
        );
      }
    }

    // Mettre a jour l'ETA
    tracking.eta.delivery = {
      estimated: newETA,
      distanceRemaining: Math.round(distanceRemaining * 10) / 10,
      timeRemaining: timeRemainingMinutes,
      confidence: this.calculateETAConfidence(tracking, trafficFactor),
      lastCalculated: new Date(),
      method: 'predictive'
    };

    // Verifier retard
    if (tracking.waypoints.delivery.plannedArrival) {
      const plannedArrival = new Date(tracking.waypoints.delivery.plannedArrival);
      const delayMinutes = Math.round((newETA - plannedArrival) / (1000 * 60));

      if (delayMinutes > this.alertThresholds.delayMinutes) {
        tracking.tripMetrics.delayMinutes = delayMinutes;

        const existingDelayAlert = tracking.alerts.find(a =>
          a.type === 'delay' && !a.resolved
        );

        if (!existingDelayAlert) {
          tracking.addAlert('delay', 'warning',
            `Retard prevu: ${delayMinutes} minutes`, {
              plannedArrival,
              estimatedArrival: newETA,
              delay: delayMinutes
            }
          );
        }
      }
    }
  }

  /**
   * Obtenir le facteur de trafic via TomTom API
   */
  async getTrafficFactor(fromLat, fromLon, toLat, toLon) {
    if (!this.tomtomApiKey) return 1.0;

    try {
      const response = await axios.get(
        `https://api.tomtom.com/routing/1/calculateRoute/${fromLat},${fromLon}:${toLat},${toLon}/json`,
        {
          params: {
            key: this.tomtomApiKey,
            traffic: true,
            travelMode: 'truck'
          },
          timeout: 5000
        }
      );

      const route = response.data.routes?.[0];
      if (route) {
        const freeFlowTime = route.summary.travelTimeInSeconds;
        const trafficTime = route.summary.trafficDelayInSeconds || 0;
        return 1 + (trafficTime / freeFlowTime);
      }

      return 1.0;

    } catch (error) {
      console.warn('[TRACKING SERVICE] TomTom API error:', error.message);
      return 1.0;
    }
  }

  /**
   * Calculer le niveau de confiance de l'ETA
   */
  calculateETAConfidence(tracking, trafficFactor) {
    let confidence = 80;

    // Ajuster selon la source GPS
    if (tracking.currentPosition.source === 'gps') {
      confidence += 10;
    } else if (tracking.currentPosition.source === 'estimated') {
      confidence -= 20;
    }

    // Ajuster selon l'exactitude GPS
    if (tracking.currentPosition.accuracy) {
      if (tracking.currentPosition.accuracy < 10) confidence += 5;
      else if (tracking.currentPosition.accuracy > 50) confidence -= 10;
    }

    // Ajuster selon le trafic
    if (trafficFactor > 1.5) confidence -= 10;

    // Ajuster selon l'historique
    if (tracking.positionHistory.length < 5) confidence -= 15;

    return Math.max(30, Math.min(95, confidence));
  }

  // ==================== REQUETES ====================

  /**
   * Obtenir les details de tracking
   */
  async getTracking(trackingId) {
    return TrackingSession.findOne({ trackingId });
  }

  /**
   * Obtenir le tracking par orderId
   */
  async getTrackingByOrder(orderId) {
    return TrackingSession.findOne({
      orderId,
      status: { $nin: ['completed', 'cancelled'] }
    });
  }

  /**
   * Obtenir l'ETA d'une commande
   */
  async getETA(orderId) {
    const tracking = await this.getTrackingByOrder(orderId);

    if (!tracking) {
      return null;
    }

    // Recalculer si niveau premium et position disponible
    if (tracking.level === 'premium' && tracking.currentPosition) {
      await this.updateETAPrediction(tracking);
      await tracking.save();
    }

    return {
      trackingId: tracking.trackingId,
      orderId,
      level: tracking.level,
      status: tracking.status,
      currentPosition: tracking.currentPosition,
      eta: tracking.eta,
      waypoints: {
        pickup: {
          address: tracking.waypoints.pickup.address,
          status: tracking.waypoints.pickup.status,
          plannedArrival: tracking.waypoints.pickup.plannedArrival,
          actualArrival: tracking.waypoints.pickup.actualArrival
        },
        delivery: {
          address: tracking.waypoints.delivery.address,
          status: tracking.waypoints.delivery.status,
          plannedArrival: tracking.waypoints.delivery.plannedArrival,
          estimatedArrival: tracking.eta.delivery?.estimated
        }
      },
      alerts: tracking.alerts.filter(a => !a.resolved).length
    };
  }

  /**
   * Obtenir les alertes actives
   */
  async getActiveAlerts(trackingId) {
    const tracking = await TrackingSession.findOne({ trackingId });

    if (!tracking) return [];

    return tracking.alerts
      .filter(a => !a.resolved)
      .sort((a, b) => {
        // Trier par severite puis par date
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }

  // ==================== UTILITAIRES ====================

  /**
   * Emettre un evenement WebSocket
   */
  emitEvent(event, data) {
    if (global.emitEvent) {
      global.emitEvent(event, data);
    }

    // Aussi notifier via API WebSocket si configuree
    if (this.websocketApiUrl) {
      axios.post(`${this.websocketApiUrl}/api/v1/emit`, {
        event,
        data
      }).catch(err => {
        console.warn('[TRACKING SERVICE] Could not emit to WebSocket API:', err.message);
      });
    }
  }
}

module.exports = new TrackingService();
