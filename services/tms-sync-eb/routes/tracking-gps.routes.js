/**
 * Routes API Tracking GPS (Vehizen)
 *
 * Récupération des positions GPS en temps réel depuis Vehizen
 * Pour afficher dans Symphonia au lieu d'envoyer des SMS automatiques
 */

const express = require('express');
const router = express.Router();

let db = null;
let ordersDb = null; // Connexion vers rt-orders (vehizenvehicles)

/**
 * GET /api/v1/tracking-gps/vehicle/:licensePlate
 * Récupérer la position GPS actuelle d'un véhicule
 */
router.get('/vehicle/:licensePlate', async (req, res) => {
  try {
    const { licensePlate } = req.params;

    if (!ordersDb) {
      return res.status(503).json({
        success: false,
        error: 'Service Vehizen non disponible'
      });
    }

    // Chercher le véhicule dans vehizenvehicles
    const vehicle = await ordersDb.collection('vehizenvehicles').findOne({
      registration: licensePlate.toUpperCase()
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: `Véhicule ${licensePlate} non trouvé dans Vehizen`
      });
    }

    // Vérifier si la position est récente (< 30 min)
    const positionAge = vehicle.lastPosition?.timestamp ?
      (Date.now() - new Date(vehicle.lastPosition.timestamp).getTime()) / 1000 / 60 : null;

    return res.json({
      success: true,
      vehicle: {
        licensePlate: vehicle.registration,
        brand: vehicle.brand,
        model: vehicle.model,
        lastPosition: vehicle.lastPosition ? {
          latitude: vehicle.lastPosition.latitude,
          longitude: vehicle.lastPosition.longitude,
          timestamp: vehicle.lastPosition.timestamp,
          speed: vehicle.lastPosition.speed,
          heading: vehicle.lastPosition.heading,
          ageMinutes: Math.round(positionAge),
          isRecent: positionAge < 30
        } : null,
        odometer: vehicle.odometer,
        status: vehicle.status
      }
    });

  } catch (error) {
    console.error('[Tracking GPS] Erreur:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/tracking-gps/transport/:transportUid
 * Récupérer la position GPS du véhicule assigné à un transport
 */
router.get('/transport/:transportUid', async (req, res) => {
  try {
    const { transportUid } = req.params;

    if (!db) {
      return res.status(503).json({
        success: false,
        error: 'Database non disponible'
      });
    }

    // Récupérer le transport depuis le Data Lake
    const transport = await db.collection('dashdoctransports').findOne({
      uid: transportUid
    });

    if (!transport) {
      return res.status(404).json({
        success: false,
        error: `Transport ${transportUid} non trouvé`
      });
    }

    // Extraire la plaque d'immatriculation du véhicule
    const vehiclePlate = transport.vehicle?.licensePlate ||
                        transport.metadata?.vehicle?.licensePlate ||
                        transport.rawData?.segments?.[0]?.vehicle?.license_plate;

    if (!vehiclePlate) {
      return res.status(404).json({
        success: false,
        error: 'Aucun véhicule assigné à ce transport',
        transport: {
          uid: transport.uid,
          sequentialId: transport.sequentialId,
          status: transport.status
        }
      });
    }

    // Récupérer la position depuis Vehizen
    if (!ordersDb) {
      return res.status(503).json({
        success: false,
        error: 'Service Vehizen non disponible'
      });
    }

    const vehicle = await ordersDb.collection('vehizenvehicles').findOne({
      registration: vehiclePlate.toUpperCase()
    });

    if (!vehicle || !vehicle.lastPosition) {
      return res.status(404).json({
        success: false,
        error: `Position GPS non disponible pour ${vehiclePlate}`,
        transport: {
          uid: transport.uid,
          sequentialId: transport.sequentialId,
          vehiclePlate
        }
      });
    }

    const positionAge = (Date.now() - new Date(vehicle.lastPosition.timestamp).getTime()) / 1000 / 60;

    return res.json({
      success: true,
      transport: {
        uid: transport.uid,
        sequentialId: transport.sequentialId,
        status: transport.status,
        vehiclePlate
      },
      position: {
        latitude: vehicle.lastPosition.latitude,
        longitude: vehicle.lastPosition.longitude,
        timestamp: vehicle.lastPosition.timestamp,
        speed: vehicle.lastPosition.speed,
        heading: vehicle.lastPosition.heading,
        ageMinutes: Math.round(positionAge),
        isRecent: positionAge < 30
      }
    });

  } catch (error) {
    console.error('[Tracking GPS] Erreur transport:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/tracking-gps/active
 * Récupérer toutes les positions GPS des véhicules actifs
 */
router.get('/active', async (req, res) => {
  try {
    if (!ordersDb) {
      return res.status(503).json({
        success: false,
        error: 'Service Vehizen non disponible'
      });
    }

    // Récupérer tous les véhicules avec position récente (< 2h)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const vehicles = await ordersDb.collection('vehizenvehicles')
      .find({
        'lastPosition.timestamp': { $gte: twoHoursAgo },
        'lastPosition.latitude': { $exists: true },
        'lastPosition.longitude': { $exists: true }
      })
      .project({
        registration: 1,
        brand: 1,
        model: 1,
        lastPosition: 1,
        status: 1
      })
      .toArray();

    const positions = vehicles.map(v => {
      const positionAge = (Date.now() - new Date(v.lastPosition.timestamp).getTime()) / 1000 / 60;
      return {
        licensePlate: v.registration,
        brand: v.brand,
        model: v.model,
        latitude: v.lastPosition.latitude,
        longitude: v.lastPosition.longitude,
        timestamp: v.lastPosition.timestamp,
        speed: v.lastPosition.speed,
        heading: v.lastPosition.heading,
        ageMinutes: Math.round(positionAge),
        status: v.status
      };
    });

    return res.json({
      success: true,
      count: positions.length,
      vehicles: positions
    });

  } catch (error) {
    console.error('[Tracking GPS] Erreur active:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Configurer les connexions base de données
 */
function setDatabases(localDb, ordersDatabase) {
  db = localDb;
  ordersDb = ordersDatabase;
}

module.exports = router;
module.exports.setDatabases = setDatabases;
