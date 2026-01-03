/**
 * Modele MongoDB pour le Tracking IA AFFRET.IA
 * Gere le suivi intelligent a 3 niveaux: Basic, Intermediaire, Premium
 */

const mongoose = require('mongoose');

const trackingSessionSchema = new mongoose.Schema({
  // Identifiants
  trackingId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  carrierId: {
    type: String,
    required: true,
    index: true
  },

  // Niveau de tracking
  level: {
    type: String,
    enum: ['basic', 'intermediate', 'premium'],
    default: 'basic',
    required: true
  },

  // Configuration par niveau
  config: {
    // Basic: Statuts manuels uniquement
    // Intermediate: Geolocalisation toutes les 2h
    // Premium: GPS temps reel + ETA predictif
    updateFrequency: {
      type: Number, // minutes
      default: 120  // 2h par defaut
    },
    gpsEnabled: {
      type: Boolean,
      default: false
    },
    etaPredictionEnabled: {
      type: Boolean,
      default: false
    },
    alertsEnabled: {
      type: Boolean,
      default: true
    },
    geofencingEnabled: {
      type: Boolean,
      default: false
    }
  },

  // Statut actuel
  status: {
    type: String,
    enum: [
      'pending',           // En attente de demarrage
      'pickup_en_route',   // En route vers enlevement
      'at_pickup',         // Sur site enlevement
      'loading',           // Chargement en cours
      'in_transit',        // En transit
      'at_delivery',       // Sur site livraison
      'unloading',         // Dechargement en cours
      'delivered',         // Livre
      'completed',         // Termine
      'incident',          // Incident en cours
      'cancelled'          // Annule
    ],
    default: 'pending'
  },

  // Position actuelle
  currentPosition: {
    latitude: Number,
    longitude: Number,
    accuracy: Number,      // metres
    speed: Number,         // km/h
    heading: Number,       // degres
    altitude: Number,
    timestamp: Date,
    source: {
      type: String,
      enum: ['gps', 'manual', 'geofence', 'estimated']
    }
  },

  // Historique des positions
  positionHistory: [{
    latitude: Number,
    longitude: Number,
    accuracy: Number,
    speed: Number,
    timestamp: {
      type: Date,
      default: Date.now
    },
    source: String
  }],

  // Points de passage (waypoints)
  waypoints: {
    pickup: {
      address: String,
      latitude: Number,
      longitude: Number,
      plannedArrival: Date,
      actualArrival: Date,
      departureTime: Date,
      status: {
        type: String,
        enum: ['pending', 'approaching', 'arrived', 'completed']
      },
      geofenceRadius: {
        type: Number,
        default: 200 // metres
      }
    },
    delivery: {
      address: String,
      latitude: Number,
      longitude: Number,
      plannedArrival: Date,
      actualArrival: Date,
      status: {
        type: String,
        enum: ['pending', 'approaching', 'arrived', 'completed']
      },
      geofenceRadius: {
        type: Number,
        default: 200
      }
    },
    intermediates: [{
      name: String,
      address: String,
      latitude: Number,
      longitude: Number,
      plannedArrival: Date,
      actualArrival: Date,
      status: String,
      type: {
        type: String,
        enum: ['stop', 'rest', 'fuel', 'customs', 'other']
      }
    }]
  },

  // ETA (Estimated Time of Arrival)
  eta: {
    pickup: {
      estimated: Date,
      confidence: Number,  // 0-100
      lastCalculated: Date,
      method: {
        type: String,
        enum: ['static', 'dynamic', 'predictive']
      }
    },
    delivery: {
      estimated: Date,
      confidence: Number,
      lastCalculated: Date,
      method: String,
      distanceRemaining: Number,  // km
      timeRemaining: Number       // minutes
    }
  },

  // Alertes
  alerts: [{
    alertId: String,
    type: {
      type: String,
      enum: [
        'delay',              // Retard detecte
        'route_deviation',    // Ecart de trajet
        'speed_violation',    // Vitesse excessive
        'geofence_exit',      // Sortie zone autorisee
        'geofence_enter',     // Entree zone
        'long_stop',          // Arret prolonge
        'no_signal',          // Perte signal GPS
        'eta_change',         // Changement ETA significatif
        'incident',           // Incident signale
        'temperature',        // Alerte temperature (frigo)
        'custom'              // Alerte personnalisee
      ]
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info'
    },
    message: String,
    data: mongoose.Schema.Types.Mixed,
    location: {
      latitude: Number,
      longitude: Number
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    acknowledged: {
      type: Boolean,
      default: false
    },
    acknowledgedAt: Date,
    acknowledgedBy: String,
    resolved: {
      type: Boolean,
      default: false
    },
    resolvedAt: Date,
    resolution: String
  }],

  // Metriques de trajet
  tripMetrics: {
    totalDistance: Number,       // km parcourus
    plannedDistance: Number,     // km prevus
    avgSpeed: Number,            // km/h
    maxSpeed: Number,            // km/h
    totalStopTime: Number,       // minutes
    drivingTime: Number,         // minutes
    delayMinutes: Number,        // retard en minutes
    fuelConsumption: Number,     // litres (si disponible)
    co2Emissions: Number         // kg (estime)
  },

  // Timestamps des evenements
  timestamps: {
    created: {
      type: Date,
      default: Date.now
    },
    started: Date,
    pickupArrival: Date,
    pickupDeparture: Date,
    deliveryArrival: Date,
    completed: Date,
    lastUpdate: Date
  },

  // Notifications envoyees
  notifications: [{
    type: {
      type: String,
      enum: ['sms', 'email', 'push', 'webhook']
    },
    recipient: String,
    message: String,
    sentAt: Date,
    status: String
  }]

}, {
  timestamps: true
});

// Index pour performance
trackingSessionSchema.index({ orderId: 1, status: 1 });
trackingSessionSchema.index({ carrierId: 1, status: 1 });
trackingSessionSchema.index({ 'currentPosition.timestamp': -1 });
trackingSessionSchema.index({ level: 1 });

// ==================== METHODES D'INSTANCE ====================

/**
 * Mettre a jour la position
 */
trackingSessionSchema.methods.updatePosition = function(position) {
  this.currentPosition = {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy || 10,
    speed: position.speed || 0,
    heading: position.heading,
    altitude: position.altitude,
    timestamp: new Date(),
    source: position.source || 'gps'
  };

  // Ajouter a l'historique
  this.positionHistory.push({
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy: position.accuracy,
    speed: position.speed,
    timestamp: new Date(),
    source: position.source || 'gps'
  });

  // Limiter l'historique a 1000 points
  if (this.positionHistory.length > 1000) {
    this.positionHistory = this.positionHistory.slice(-1000);
  }

  this.timestamps.lastUpdate = new Date();

  // Mettre a jour les metriques
  this.updateTripMetrics();
};

/**
 * Mettre a jour les metriques du trajet
 */
trackingSessionSchema.methods.updateTripMetrics = function() {
  if (this.positionHistory.length < 2) return;

  let totalDistance = 0;
  let speeds = [];

  for (let i = 1; i < this.positionHistory.length; i++) {
    const prev = this.positionHistory[i - 1];
    const curr = this.positionHistory[i];

    // Calculer distance entre deux points
    const dist = this.calculateDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );
    totalDistance += dist;

    if (curr.speed) speeds.push(curr.speed);
  }

  this.tripMetrics.totalDistance = Math.round(totalDistance * 100) / 100;

  if (speeds.length > 0) {
    this.tripMetrics.avgSpeed = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
    this.tripMetrics.maxSpeed = Math.max(...speeds);
  }

  // Calculer temps de conduite
  if (this.timestamps.started) {
    const now = new Date();
    this.tripMetrics.drivingTime = Math.round((now - this.timestamps.started) / (1000 * 60));
  }
};

/**
 * Calculer la distance entre deux points (formule Haversine)
 */
trackingSessionSchema.methods.calculateDistance = function(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = this.toRad(lat2 - lat1);
  const dLon = this.toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

trackingSessionSchema.methods.toRad = function(deg) {
  return deg * (Math.PI / 180);
};

/**
 * Ajouter une alerte
 */
trackingSessionSchema.methods.addAlert = function(type, severity, message, data = {}) {
  const alertId = `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  this.alerts.push({
    alertId,
    type,
    severity,
    message,
    data,
    location: this.currentPosition ? {
      latitude: this.currentPosition.latitude,
      longitude: this.currentPosition.longitude
    } : null,
    createdAt: new Date()
  });

  return alertId;
};

/**
 * Reconnaitre une alerte
 */
trackingSessionSchema.methods.acknowledgeAlert = function(alertId, userId) {
  const alert = this.alerts.find(a => a.alertId === alertId);
  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
  }
  return alert;
};

/**
 * Resoudre une alerte
 */
trackingSessionSchema.methods.resolveAlert = function(alertId, resolution) {
  const alert = this.alerts.find(a => a.alertId === alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolvedAt = new Date();
    alert.resolution = resolution;
  }
  return alert;
};

/**
 * Verifier si dans une geofence
 */
trackingSessionSchema.methods.isInGeofence = function(centerLat, centerLon, radiusMeters) {
  if (!this.currentPosition) return false;

  const distance = this.calculateDistance(
    this.currentPosition.latitude,
    this.currentPosition.longitude,
    centerLat,
    centerLon
  ) * 1000; // Convertir en metres

  return distance <= radiusMeters;
};

/**
 * Calculer ETA vers une destination
 */
trackingSessionSchema.methods.calculateETA = function(destLat, destLon, avgSpeedKmh = 60) {
  if (!this.currentPosition) return null;

  const distance = this.calculateDistance(
    this.currentPosition.latitude,
    this.currentPosition.longitude,
    destLat,
    destLon
  );

  // Utiliser la vitesse actuelle si disponible, sinon vitesse moyenne
  const speed = this.currentPosition.speed > 10 ? this.currentPosition.speed : avgSpeedKmh;

  const timeHours = distance / speed;
  const timeMinutes = Math.round(timeHours * 60);

  const eta = new Date(Date.now() + timeMinutes * 60 * 1000);

  return {
    estimated: eta,
    distanceRemaining: Math.round(distance * 10) / 10,
    timeRemaining: timeMinutes,
    confidence: this.currentPosition.source === 'gps' ? 85 : 60,
    method: this.level === 'premium' ? 'predictive' : 'dynamic'
  };
};

// ==================== METHODES STATIQUES ====================

/**
 * Generer un ID de tracking unique
 */
trackingSessionSchema.statics.generateTrackingId = async function() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `TRK-${dateStr}-${random}`;
};

/**
 * Obtenir la configuration par niveau
 */
trackingSessionSchema.statics.getLevelConfig = function(level) {
  const configs = {
    basic: {
      updateFrequency: 0,        // Pas de mise a jour auto
      gpsEnabled: false,
      etaPredictionEnabled: false,
      alertsEnabled: true,
      geofencingEnabled: false,
      description: 'Statuts manuels uniquement'
    },
    intermediate: {
      updateFrequency: 120,      // 2 heures
      gpsEnabled: true,
      etaPredictionEnabled: false,
      alertsEnabled: true,
      geofencingEnabled: true,
      description: 'Geolocalisation toutes les 2h + geofencing'
    },
    premium: {
      updateFrequency: 5,        // 5 minutes
      gpsEnabled: true,
      etaPredictionEnabled: true,
      alertsEnabled: true,
      geofencingEnabled: true,
      description: 'GPS temps reel + ETA predictif + alertes avancees'
    }
  };

  return configs[level] || configs.basic;
};

/**
 * Trouver les sessions actives pour un transporteur
 */
trackingSessionSchema.statics.findActiveByCarrier = function(carrierId) {
  return this.find({
    carrierId,
    status: { $nin: ['completed', 'cancelled'] }
  }).sort({ createdAt: -1 });
};

/**
 * Trouver les sessions avec alertes non resolues
 */
trackingSessionSchema.statics.findWithUnresolvedAlerts = function() {
  return this.find({
    'alerts': {
      $elemMatch: {
        resolved: false,
        severity: { $in: ['warning', 'critical'] }
      }
    }
  });
};

const TrackingSession = mongoose.model('TrackingSession', trackingSessionSchema);

module.exports = TrackingSession;
