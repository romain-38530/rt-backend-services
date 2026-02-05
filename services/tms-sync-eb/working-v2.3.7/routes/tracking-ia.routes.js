/**
 * Routes API Tracking IA
 * Gestion des événements de tracking en temps réel
 *
 * Ces routes permettent à Tracking IA d'écrire des événements dans Dashdoc
 * et de les synchroniser immédiatement dans le Data Lake.
 */

const express = require('express');
const router = express.Router();
const DashdocUpdateConnector = require('../connectors/dashdoc-update.connector');

// Instance du connecteur (sera initialisée avec le db dans index.js)
let updateConnector = null;
let db = null;

/**
 * Initialiser le connecteur avec la connexion Dashdoc active
 */
async function getUpdateConnector() {
  if (!db) {
    throw new Error('Database not configured');
  }

  // Récupérer la connexion Dashdoc active
  const connection = await db.collection('tmsConnections').findOne({
    tmsType: 'dashdoc',
    isActive: true,
    connectionStatus: 'connected'
  });

  if (!connection) {
    throw new Error('Aucune connexion Dashdoc active trouvée');
  }

  // Créer ou réutiliser le connecteur
  if (!updateConnector || updateConnector.apiToken !== connection.credentials.apiToken) {
    updateConnector = new DashdocUpdateConnector(connection.credentials.apiToken, {
      baseUrl: connection.credentials.apiUrl,
      connectionId: connection._id.toString(),
      datalakeDb: db
    });
  }

  return updateConnector;
}

/**
 * POST /api/v1/tracking-ia/events
 * Ajouter un événement Tracking IA sur un transport
 *
 * Body:
 * {
 *   "transportUid": "abc-123-def",
 *   "type": "position|eta|delay|alert|arrival|departure|loading|unloading|incident",
 *   "message": "Description de l'événement",
 *   "data": {
 *     "latitude": 48.8566,
 *     "longitude": 2.3522,
 *     "eta": "2024-01-15T14:30:00Z",
 *     "delayMinutes": 15,
 *     "reason": "Trafic dense"
 *   },
 *   "source": "tracking-ia|gps|driver|geofence",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */
router.post('/events', async (req, res) => {
  try {
    const { transportUid, type, message, data, source, timestamp } = req.body;

    if (!transportUid) {
      return res.status(400).json({
        success: false,
        error: 'transportUid est requis'
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'message est requis'
      });
    }

    const connector = await getUpdateConnector();

    const result = await connector.addTrackingEvent(transportUid, {
      type: type || 'tracking',
      message,
      data: data || {},
      source: source || 'tracking-ia',
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'Événement ajouté avec succès',
        data: result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }
  } catch (error) {
    console.error('[Tracking IA] Erreur ajout événement:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tracking-ia/position
 * Mettre à jour la position GPS d'un transport
 *
 * Body:
 * {
 *   "transportUid": "abc-123-def",
 *   "latitude": 48.8566,
 *   "longitude": 2.3522,
 *   "address": "123 Rue Example, 75001 Paris",
 *   "timestamp": "2024-01-15T10:30:00Z"
 * }
 */
router.post('/position', async (req, res) => {
  try {
    const { transportUid, latitude, longitude, address, timestamp } = req.body;

    if (!transportUid || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        error: 'transportUid, latitude et longitude sont requis'
      });
    }

    const connector = await getUpdateConnector();

    const result = await connector.updateTrackingPosition(transportUid, {
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      address,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'Position mise à jour',
        data: result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Tracking IA] Erreur mise à jour position:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tracking-ia/eta
 * Mettre à jour l'ETA (heure d'arrivée estimée) d'un transport
 *
 * Body:
 * {
 *   "transportUid": "abc-123-def",
 *   "eta": "2024-01-15T14:30:00Z",
 *   "delayMinutes": 15,
 *   "reason": "Trafic dense sur A6"
 * }
 */
router.post('/eta', async (req, res) => {
  try {
    const { transportUid, eta, delayMinutes, reason } = req.body;

    if (!transportUid || !eta) {
      return res.status(400).json({
        success: false,
        error: 'transportUid et eta sont requis'
      });
    }

    const connector = await getUpdateConnector();

    const result = await connector.updateTrackingETA(transportUid, {
      eta: new Date(eta),
      delayMinutes: delayMinutes ? parseInt(delayMinutes) : 0,
      reason
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'ETA mise à jour',
        data: result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Tracking IA] Erreur mise à jour ETA:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tracking-ia/status
 * Signaler un événement de statut (arrivée, départ, chargement, etc.)
 *
 * Body:
 * {
 *   "transportUid": "abc-123-def",
 *   "eventType": "arrival|departure|loading|unloading|break|incident|geofence_enter|geofence_exit",
 *   "message": "Message optionnel personnalisé",
 *   "data": {
 *     "latitude": 48.8566,
 *     "longitude": 2.3522,
 *     "locationName": "Entrepôt Paris Nord"
 *   }
 * }
 */
router.post('/status', async (req, res) => {
  try {
    const { transportUid, eventType, message, data } = req.body;

    if (!transportUid || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'transportUid et eventType sont requis'
      });
    }

    const validTypes = ['arrival', 'departure', 'loading', 'unloading', 'break', 'incident', 'geofence_enter', 'geofence_exit'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: `eventType invalide. Valeurs acceptées: ${validTypes.join(', ')}`
      });
    }

    const connector = await getUpdateConnector();

    const result = await connector.addTrackingStatusEvent(transportUid, eventType, {
      message,
      ...data
    });

    if (result.success) {
      return res.json({
        success: true,
        message: `Événement ${eventType} enregistré`,
        data: result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Tracking IA] Erreur événement statut:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/tracking-ia/history/:transportUid
 * Récupérer l'historique des événements Tracking d'un transport
 *
 * Query params:
 * - limit: nombre max d'événements (default: 50)
 * - type: filtrer par type d'événement
 * - since: date ISO depuis laquelle récupérer
 */
router.get('/history/:transportUid', async (req, res) => {
  try {
    const { transportUid } = req.params;
    const { limit = 50, type, since } = req.query;

    const connector = await getUpdateConnector();

    const result = await connector.getTrackingHistory(transportUid, {
      limit: parseInt(limit),
      type,
      since
    });

    if (result.success) {
      return res.json({
        success: true,
        transportUid,
        events: result.events,
        lastPosition: result.lastPosition,
        lastEta: result.lastEta,
        count: result.count
      });
    } else {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    console.error('[Tracking IA] Erreur historique:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tracking-ia/batch
 * Envoyer plusieurs événements en batch
 *
 * Body:
 * {
 *   "events": [
 *     { "transportUid": "abc", "type": "position", "message": "...", "data": {...} },
 *     { "transportUid": "def", "type": "eta", "message": "...", "data": {...} }
 *   ]
 * }
 */
router.post('/batch', async (req, res) => {
  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'events array est requis'
      });
    }

    const connector = await getUpdateConnector();

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const event of events) {
      try {
        const result = await connector.addTrackingEvent(event.transportUid, {
          type: event.type || 'tracking',
          message: event.message,
          data: event.data || {},
          source: event.source || 'tracking-ia',
          timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
        });

        results.push({
          transportUid: event.transportUid,
          success: result.success,
          error: result.error
        });

        if (result.success) successCount++;
        else errorCount++;
      } catch (err) {
        results.push({
          transportUid: event.transportUid,
          success: false,
          error: err.message
        });
        errorCount++;
      }
    }

    return res.json({
      success: errorCount === 0,
      message: `${successCount}/${events.length} événements traités`,
      results,
      summary: {
        total: events.length,
        success: successCount,
        errors: errorCount
      }
    });
  } catch (error) {
    console.error('[Tracking IA] Erreur batch:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Configurer la base de données pour les routes
 */
function setDatabase(database) {
  db = database;
  updateConnector = null; // Reset connector pour utiliser la nouvelle db
}

module.exports = router;
module.exports.setDatabase = setDatabase;
