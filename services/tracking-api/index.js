/**
 * SYMPHONI.A Tracking API
 * API de tracking GPS, géofencing et intégration TomTom
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const io = require('socket.io-client');
const geolib = require('geolib');

const app = express();
const PORT = process.env.PORT || 3012;

// Configuration API Carriers (authz-eb)
const CARRIERS_API_URL = process.env.CARRIERS_API_URL || 'https://ddaywxps9n701.cloudfront.net';

// Helper: Push performance data to carriers API
async function pushCarrierPerformance(carrierId, performanceData) {
  if (!carrierId) {
    console.log('[TRACKING] No carrierId provided, skipping performance push');
    return null;
  }

  try {
    const response = await axios.post(
      `${CARRIERS_API_URL}/api/carriers/${carrierId}/performance`,
      performanceData,
      { timeout: 5000 }
    );
    console.log(`[TRACKING] Performance pushed to carriers API for carrier ${carrierId}`);
    return response.data;
  } catch (error) {
    console.error(`[TRACKING] Failed to push performance to carriers API:`, error.message);
    return null;
  }
}

app.use(cors());
app.use(express.json());

// WebSocket connection
let websocket = null;
if (process.env.WEBSOCKET_URL) {
  websocket = io(process.env.WEBSOCKET_URL);
}

// MongoDB Schemas
const locationSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  deviceId: String,
  coordinates: {
    type: { type: String, default: 'Point' },
    coordinates: [Number] // [longitude, latitude]
  },
  latitude: Number,
  longitude: Number,
  altitude: Number,
  accuracy: Number,
  speed: Number,
  heading: Number,
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, enum: ['gps', 'manual', 'tomtom'], default: 'gps' }
}, { timestamps: true });

locationSchema.index({ coordinates: '2dsphere' });

const geofenceEventSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  type: { type: String, enum: ['entered', 'exited'], required: true },
  location: {
    name: String,
    type: { type: String, enum: ['pickup', 'delivery'] },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  timestamp: { type: Date, default: Date.now },
  distance: Number
});

const Location = mongoose.model('Location', locationSchema);
const GeofenceEvent = mongoose.model('GeofenceEvent', geofenceEventSchema);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected'))
  .catch(err => console.error('[MONGODB] Error:', err));

// Helper functions
function emitEvent(eventName, data) {
  if (websocket && websocket.connected) {
    websocket.emit('emit-event', { eventName, data });
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  return geolib.getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  );
}

// Route alias: /api/v1/tracking/* -> /api/v1/tracking/*
// (No rewrite needed - routes are already at /api/v1/tracking/*)

// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'tracking-api',
    version: '1.0.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: websocket?.connected ? 'connected' : 'disconnected',
    tomtom: !!process.env.TOMTOM_API_KEY
  });
});

// API v1 Health check
app.get('/api/v1/tracking/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'tracking-api',
    version: '1.0.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: websocket?.connected ? 'connected' : 'disconnected',
    tomtom: !!process.env.TOMTOM_API_KEY
  });
});

// POST /api/v1/tracking/pair - Pairer un appareil avec une commande (QR code)
app.post('/api/v1/tracking/pair', async (req, res) => {
  try {
    const { orderId, deviceId } = req.body;

    if (!orderId || !deviceId) {
      return res.status(400).json({
        success: false,
        error: 'orderId and deviceId are required'
      });
    }

    // Émettre événement de démarrage du tracking
    emitEvent('tracking.started', {
      orderId,
      deviceId,
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Device paired successfully',
      orderId,
      deviceId
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tracking/location - Enregistrer une position GPS
app.post('/api/v1/tracking/location', async (req, res) => {
  try {
    const { orderId, deviceId, latitude, longitude, accuracy, speed, heading, altitude } = req.body;

    if (!orderId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'orderId, latitude, and longitude are required'
      });
    }

    const location = new Location({
      orderId,
      deviceId,
      latitude,
      longitude,
      coordinates: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      accuracy,
      speed,
      heading,
      altitude,
      source: 'gps'
    });

    await location.save();

    // Émettre événement WebSocket
    emitEvent('tracking.location.update', {
      orderId,
      latitude,
      longitude,
      speed,
      timestamp: location.timestamp
    });

    // Vérifier géofencing (simplifié)
    // TODO: Implémenter vérification complète avec zones définies

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tracking/:orderId/locations - Obtenir l'historique des positions
app.get('/api/v1/tracking/:orderId/locations', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { limit = 100, startDate, endDate } = req.query;

    const query = { orderId };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const locations = await Location.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: locations,
      count: locations.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tracking/:orderId/current - Position actuelle
app.get('/api/v1/tracking/:orderId/current', async (req, res) => {
  try {
    const location = await Location.findOne({ orderId: req.params.orderId })
      .sort({ timestamp: -1 });

    if (!location) {
      return res.status(404).json({
        success: false,
        error: 'No location data found for this order'
      });
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tracking/geofence-event - Enregistrer un événement de géofencing
app.post('/api/v1/tracking/geofence-event', async (req, res) => {
  try {
    const { orderId, type, location, distance } = req.body;

    const event = new GeofenceEvent({
      orderId,
      type,
      location,
      distance
    });

    await event.save();

    // Émettre événement WebSocket
    const eventName = type === 'entered' ? 'geofence.entered' : 'geofence.exited';
    emitEvent(eventName, {
      orderId,
      location: location.name,
      locationType: location.type,
      timestamp: event.timestamp
    });

    // Événements spécifiques selon le lieu
    if (type === 'entered' && location.type === 'pickup') {
      emitEvent('order.arrived.pickup', { orderId });
    } else if (type === 'entered' && location.type === 'delivery') {
      emitEvent('order.arrived.delivery', { orderId });
    }

    res.json({
      success: true,
      data: event
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== INTÉGRATION TOMTOM ====================

// GET /api/v1/tracking/tomtom/:orderId/eta - Calculer ETA avec TomTom
app.get('/api/v1/tracking/tomtom/:orderId/eta', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { destinationLat, destinationLon } = req.query;

    // Obtenir position actuelle
    const currentLocation = await Location.findOne({ orderId })
      .sort({ timestamp: -1 });

    if (!currentLocation) {
      return res.status(404).json({
        success: false,
        error: 'No location data found'
      });
    }

    if (!destinationLat || !destinationLon) {
      return res.status(400).json({
        success: false,
        error: 'destinationLat and destinationLon are required'
      });
    }

    // Appel API TomTom Routing
    const tomtomUrl = `${process.env.TOMTOM_ROUTING_API_URL}/${currentLocation.latitude},${currentLocation.longitude}:${destinationLat},${destinationLon}/json`;

    const response = await axios.get(tomtomUrl, {
      params: {
        key: process.env.TOMTOM_API_KEY,
        traffic: true,
        travelMode: 'truck'
      }
    });

    const route = response.data.routes[0];
    const travelTimeSeconds = route.summary.travelTimeInSeconds;
    const eta = new Date(Date.now() + travelTimeSeconds * 1000);

    // Émettre événement WebSocket
    emitEvent('tracking.eta.update', {
      orderId,
      eta,
      travelTimeSeconds,
      distanceMeters: route.summary.lengthInMeters
    });

    res.json({
      success: true,
      data: {
        eta,
        travelTimeSeconds,
        distanceMeters: route.summary.lengthInMeters,
        route: route.legs
      }
    });
  } catch (error) {
    console.error('[TOMTOM] ETA error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tracking/tomtom/:orderId/route - Obtenir itinéraire optimisé
app.get('/api/v1/tracking/tomtom/:orderId/route', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { pickupLat, pickupLon, deliveryLat, deliveryLon } = req.query;

    if (!pickupLat || !pickupLon || !deliveryLat || !deliveryLon) {
      return res.status(400).json({
        success: false,
        error: 'All coordinates are required'
      });
    }

    const tomtomUrl = `${process.env.TOMTOM_ROUTING_API_URL}/${pickupLat},${pickupLon}:${deliveryLat},${deliveryLon}/json`;

    const response = await axios.get(tomtomUrl, {
      params: {
        key: process.env.TOMTOM_API_KEY,
        traffic: true,
        travelMode: 'truck',
        avoid: 'unpavedRoads'
      }
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('[TOMTOM] Route error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tracking/tomtom/:orderId/replan - Replanifier l'itinéraire
app.post('/api/v1/tracking/tomtom/:orderId/replan', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, newDestination } = req.body;

    // Obtenir position actuelle
    const currentLocation = await Location.findOne({ orderId })
      .sort({ timestamp: -1 });

    if (!currentLocation) {
      return res.status(404).json({
        success: false,
        error: 'No location data found'
      });
    }

    // Calculer nouveau trajet avec TomTom
    const tomtomUrl = `${process.env.TOMTOM_ROUTING_API_URL}/${currentLocation.latitude},${currentLocation.longitude}:${newDestination.latitude},${newDestination.longitude}/json`;

    const response = await axios.get(tomtomUrl, {
      params: {
        key: process.env.TOMTOM_API_KEY,
        traffic: true,
        travelMode: 'truck'
      }
    });

    const route = response.data.routes[0];

    // Émettre événement
    emitEvent('tracking.route.replanned', {
      orderId,
      reason,
      newEta: new Date(Date.now() + route.summary.travelTimeInSeconds * 1000)
    });

    res.json({
      success: true,
      data: {
        newRoute: route,
        reason
      }
    });
  } catch (error) {
    console.error('[TOMTOM] Replan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/orders/:id/status - Mettre à jour le statut (basic tracking)
app.put('/api/v1/orders/:id/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, location } = req.body;

    // Enregistrer le changement de statut comme un événement de tracking
    const statuses = {
      'pickup_arrived': 'order.arrived.pickup',
      'pickup_departed': 'order.departed.pickup',
      'loaded': 'order.loaded',
      'delivery_arrived': 'order.arrived.delivery',
      'delivered': 'order.delivered'
    };

    if (statuses[status]) {
      emitEvent(statuses[status], {
        orderId,
        timestamp: new Date(),
        location
      });
    }

    res.json({
      success: true,
      message: 'Status updated'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DELIVERY COMPLETION & CARRIER PERFORMANCE ====================

// POST /api/v1/tracking/:orderId/complete - Completer une livraison avec rapport de performance
app.post('/api/v1/tracking/:orderId/complete', async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      carrierId,
      deliveredAt,
      expectedAt,
      damageReported,
      damageDescription,
      communicationRating,
      incidentType,
      incidentDescription,
      notes
    } = req.body;

    if (!carrierId) {
      return res.status(400).json({
        success: false,
        error: 'carrierId is required'
      });
    }

    // Obtenir les evenements de geofencing pour cet ordre
    const geofenceEvents = await GeofenceEvent.find({ orderId })
      .sort({ timestamp: 1 })
      .lean();

    // Calculer le type de livraison
    const deliveryTime = deliveredAt ? new Date(deliveredAt) : new Date();
    const expectedTime = expectedAt ? new Date(expectedAt) : null;

    let deliveryType = 'on_time';
    let delayMinutes = 0;

    if (expectedTime) {
      const diffMs = deliveryTime - expectedTime;
      delayMinutes = Math.round(diffMs / (1000 * 60));

      if (delayMinutes > 15) {
        deliveryType = 'late';
      } else if (delayMinutes < -15) {
        deliveryType = 'early';
        delayMinutes = 0;
      } else {
        deliveryType = 'on_time';
        delayMinutes = 0;
      }
    }

    // Determiner le type d'incident
    let finalIncidentType = incidentType || 'none';
    if (damageReported && finalIncidentType === 'none') {
      finalIncidentType = 'damage';
    } else if (deliveryType === 'late' && delayMinutes > 60 && finalIncidentType === 'none') {
      finalIncidentType = 'delay';
    }

    // Construire les donnees de performance
    const performanceData = {
      orderId,
      deliveryType,
      delayMinutes: Math.max(0, delayMinutes),
      damageReported: damageReported || false,
      damageDescription,
      communicationRating: communicationRating ? parseInt(communicationRating) : null,
      incidentType: finalIncidentType,
      incidentDescription,
      deliveredAt: deliveryTime.toISOString(),
      expectedAt: expectedTime ? expectedTime.toISOString() : null,
      geofenceEvents: geofenceEvents.map(e => ({
        type: e.type,
        locationType: e.location?.type,
        locationName: e.location?.name,
        timestamp: e.timestamp
      }))
    };

    // Push vers l'API carriers
    const carrierResponse = await pushCarrierPerformance(carrierId, performanceData);

    // Emettre evenement WebSocket
    emitEvent('order.delivered', {
      orderId,
      carrierId,
      deliveryType,
      delayMinutes: performanceData.delayMinutes,
      timestamp: deliveryTime
    });

    res.json({
      success: true,
      orderId,
      carrierId,
      performance: {
        deliveryType,
        delayMinutes: performanceData.delayMinutes,
        damageReported: performanceData.damageReported,
        incidentType: finalIncidentType
      },
      carrierMetrics: carrierResponse?.performanceMetrics || null,
      notes
    });

  } catch (error) {
    console.error('[TRACKING] Delivery completion error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tracking/:orderId/incident - Signaler un incident pendant le transport
app.post('/api/v1/tracking/:orderId/incident', async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      carrierId,
      incidentType,  // 'delay', 'damage', 'breakdown', 'accident', 'weather', 'other'
      description,
      severity,      // 'low', 'medium', 'high', 'critical'
      location,
      estimatedDelay // en minutes
    } = req.body;

    if (!incidentType) {
      return res.status(400).json({
        success: false,
        error: 'incidentType is required'
      });
    }

    // Enregistrer l'incident
    const incident = {
      orderId,
      carrierId,
      incidentType,
      description,
      severity: severity || 'medium',
      location,
      estimatedDelay: estimatedDelay || 0,
      timestamp: new Date(),
      status: 'open'
    };

    // Emettre evenement WebSocket
    emitEvent('tracking.incident', {
      orderId,
      carrierId,
      incidentType,
      severity: incident.severity,
      estimatedDelay,
      timestamp: incident.timestamp
    });

    // Si retard significatif, notifier via API
    if (estimatedDelay && estimatedDelay > 30) {
      emitEvent('tracking.significant-delay', {
        orderId,
        carrierId,
        estimatedDelay,
        reason: incidentType
      });
    }

    res.json({
      success: true,
      incident
    });

  } catch (error) {
    console.error('[TRACKING] Incident report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tracking/:orderId/summary - Resume complet du tracking pour une commande
app.get('/api/v1/tracking/:orderId/summary', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Obtenir toutes les locations
    const locations = await Location.find({ orderId })
      .sort({ timestamp: 1 })
      .lean();

    // Obtenir tous les evenements de geofencing
    const geofenceEvents = await GeofenceEvent.find({ orderId })
      .sort({ timestamp: 1 })
      .lean();

    // Calculer stats
    const firstLocation = locations[0];
    const lastLocation = locations[locations.length - 1];
    const totalDistance = locations.reduce((acc, loc, i) => {
      if (i === 0) return 0;
      const prev = locations[i - 1];
      return acc + calculateDistance(prev.latitude, prev.longitude, loc.latitude, loc.longitude);
    }, 0);

    res.json({
      success: true,
      orderId,
      summary: {
        locationCount: locations.length,
        geofenceEventCount: geofenceEvents.length,
        startTime: firstLocation?.timestamp,
        lastUpdate: lastLocation?.timestamp,
        totalDistanceMeters: totalDistance,
        currentPosition: lastLocation ? {
          latitude: lastLocation.latitude,
          longitude: lastLocation.longitude,
          timestamp: lastLocation.timestamp
        } : null
      },
      geofenceEvents: geofenceEvents.map(e => ({
        type: e.type,
        location: e.location,
        timestamp: e.timestamp
      })),
      recentLocations: locations.slice(-10)
    });

  } catch (error) {
    console.error('[TRACKING] Summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         SYMPHONI.A Tracking API                              ║
║                                                               ║
║  Status:     Running                                         ║
║  Port:       ${PORT}                                              ║
║  TomTom:     ${process.env.TOMTOM_API_KEY ? 'Configured' : 'Not configured'}                                    ║
║                                                               ║
║  Features:   ✓ GPS Tracking                                  ║
║              ✓ Géofencing                                    ║
║              ✓ TomTom Integration                            ║
║              ✓ ETA Calculation                               ║
║              ✓ Carrier Performance Sync                      ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
