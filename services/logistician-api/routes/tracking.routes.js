/**
 * Tracking Routes
 * Visibilité chauffeurs en approche pour logisticien
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authenticateLogistician } from '../index.js';
import { notifyLogistician } from '../index.js';

const router = Router();

// ===========================================
// GET /api/logisticians/:id/tracking/incoming
// Liste des chauffeurs en approche
// ===========================================
router.get('/:id/tracking/incoming', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { warehouseId, date } = req.query;
    const db = req.db;

    // Récupérer les entrepôts du logisticien
    const warehouseQuery = {
      logisticianId: new ObjectId(logisticianId),
      status: { $in: ['active', 'validated'] }
    };
    if (warehouseId) {
      warehouseQuery._id = new ObjectId(warehouseId);
    }

    const warehouses = await db.collection('warehouses')
      .find(warehouseQuery)
      .toArray();

    const warehouseIds = warehouses.map(w => w._id);

    // Date de recherche (aujourd'hui par défaut)
    const searchDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(searchDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(searchDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Récupérer RDV avec tracking actif
    const rdvs = await db.collection('rdv')
      .find({
        warehouseId: { $in: warehouseIds },
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['confirmed', 'in_progress'] }
      })
      .toArray();

    // Enrichir avec données de tracking
    const trackingData = await Promise.all(
      rdvs.map(async (rdv) => {
        // Récupérer dernière position du chauffeur
        const tracking = await db.collection('driver_tracking')
          .findOne({
            rdvId: rdv._id,
            active: true
          });

        // Récupérer infos chauffeur
        const driver = rdv.driverId
          ? await db.collection('drivers').findOne({ _id: new ObjectId(rdv.driverId) })
          : null;

        // Récupérer infos transporteur
        const transporter = rdv.transporterId
          ? await db.collection('transporters').findOne({ _id: new ObjectId(rdv.transporterId) })
          : null;

        // Calculer statut
        let trackingStatus = 'unknown';
        let eta = null;
        let distanceKm = null;

        if (tracking) {
          trackingStatus = tracking.status || 'en_route';
          eta = tracking.eta;
          distanceKm = tracking.distanceKm;
        }

        const warehouse = warehouses.find(w => w._id.toString() === rdv.warehouseId.toString());

        return {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber || `RDV-${rdv._id.toString().slice(-6)}`,
          scheduledTime: rdv.date,
          slotStart: rdv.slotStart,
          slotEnd: rdv.slotEnd,
          type: rdv.type, // delivery/pickup
          warehouse: {
            id: warehouse?._id,
            name: warehouse?.name,
            address: warehouse?.address
          },
          driver: driver ? {
            id: driver._id,
            name: `${driver.firstName} ${driver.lastName}`,
            phone: driver.phone,
            vehiclePlate: driver.vehiclePlate
          } : null,
          transporter: transporter ? {
            id: transporter._id,
            name: transporter.companyName
          } : null,
          tracking: {
            status: trackingStatus,
            eta: eta,
            distanceKm: distanceKm,
            lastUpdate: tracking?.updatedAt || null,
            position: tracking?.position || null
          },
          orderReference: rdv.orderReference,
          estimatedVolume: rdv.estimatedVolume,
          notes: rdv.notes
        };
      })
    );

    // Trier par ETA puis par heure de RDV
    trackingData.sort((a, b) => {
      if (a.tracking.eta && b.tracking.eta) {
        return new Date(a.tracking.eta) - new Date(b.tracking.eta);
      }
      if (a.tracking.eta) return -1;
      if (b.tracking.eta) return 1;
      return new Date(a.scheduledTime) - new Date(b.scheduledTime);
    });

    // Résumé
    const summary = {
      total: trackingData.length,
      enRoute: trackingData.filter(t => t.tracking.status === 'en_route').length,
      approaching: trackingData.filter(t => t.tracking.distanceKm && t.tracking.distanceKm < 10).length,
      arrived: trackingData.filter(t => t.tracking.status === 'arrived').length,
      noTracking: trackingData.filter(t => t.tracking.status === 'unknown').length
    };

    res.json({
      date: searchDate.toISOString().split('T')[0],
      incoming: trackingData,
      summary
    });

  } catch (error) {
    console.error('[TRACKING] Get incoming error:', error);
    res.status(500).json({ error: 'Erreur récupération tracking' });
  }
});

// ===========================================
// GET /api/logisticians/:id/tracking/rdv/:rdvId
// Détail tracking d'un RDV
// ===========================================
router.get('/:id/tracking/rdv/:rdvId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, rdvId } = req.params;
    const db = req.db;

    // Vérifier que le RDV concerne un entrepôt du logisticien
    const rdv = await db.collection('rdv').findOne({
      _id: new ObjectId(rdvId)
    });

    if (!rdv) {
      return res.status(404).json({ error: 'RDV non trouvé' });
    }

    const warehouse = await db.collection('warehouses').findOne({
      _id: rdv.warehouseId,
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Récupérer tracking actif
    const tracking = await db.collection('driver_tracking').findOne({
      rdvId: new ObjectId(rdvId),
      active: true
    });

    // Récupérer historique des positions
    const positionHistory = await db.collection('driver_tracking_history')
      .find({ rdvId: new ObjectId(rdvId) })
      .sort({ timestamp: -1 })
      .limit(100)
      .toArray();

    // Récupérer événements
    const events = await db.collection('tracking_events')
      .find({ rdvId: new ObjectId(rdvId) })
      .sort({ timestamp: -1 })
      .toArray();

    // Infos chauffeur
    const driver = rdv.driverId
      ? await db.collection('drivers').findOne({ _id: new ObjectId(rdv.driverId) })
      : null;

    res.json({
      rdv: {
        id: rdv._id,
        rdvNumber: rdv.rdvNumber,
        scheduledTime: rdv.date,
        slotStart: rdv.slotStart,
        slotEnd: rdv.slotEnd,
        type: rdv.type,
        status: rdv.status
      },
      warehouse: {
        id: warehouse._id,
        name: warehouse.name,
        address: warehouse.address,
        coordinates: warehouse.coordinates
      },
      driver: driver ? {
        id: driver._id,
        name: `${driver.firstName} ${driver.lastName}`,
        phone: driver.phone,
        vehiclePlate: driver.vehiclePlate
      } : null,
      tracking: tracking ? {
        status: tracking.status,
        eta: tracking.eta,
        distanceKm: tracking.distanceKm,
        durationMinutes: tracking.durationMinutes,
        position: tracking.position,
        speed: tracking.speed,
        heading: tracking.heading,
        lastUpdate: tracking.updatedAt
      } : null,
      positionHistory: positionHistory.map(p => ({
        position: p.position,
        timestamp: p.timestamp,
        speed: p.speed
      })),
      events: events.map(e => ({
        type: e.type,
        message: e.message,
        timestamp: e.timestamp
      }))
    });

  } catch (error) {
    console.error('[TRACKING] Get RDV tracking error:', error);
    res.status(500).json({ error: 'Erreur récupération tracking RDV' });
  }
});

// ===========================================
// POST /api/tracking/update (Internal - appelé par app chauffeur)
// Mise à jour position chauffeur
// ===========================================
router.post('/update', async (req, res) => {
  try {
    const { rdvId, driverId, position, speed, heading } = req.body;
    const db = req.db;

    if (!rdvId || !position || !position.lat || !position.lng) {
      return res.status(400).json({ error: 'Données incomplètes' });
    }

    // Récupérer RDV
    const rdv = await db.collection('rdv').findOne({
      _id: new ObjectId(rdvId)
    });

    if (!rdv) {
      return res.status(404).json({ error: 'RDV non trouvé' });
    }

    // Récupérer entrepôt pour calculer distance
    const warehouse = await db.collection('warehouses').findOne({
      _id: rdv.warehouseId
    });

    // Calculer distance et ETA
    let distanceKm = null;
    let eta = null;
    let durationMinutes = null;

    if (warehouse?.coordinates) {
      distanceKm = calculateDistance(
        position.lat, position.lng,
        warehouse.coordinates.lat, warehouse.coordinates.lng
      );

      // Estimation simple: 50 km/h en moyenne
      durationMinutes = Math.round((distanceKm / 50) * 60);
      eta = new Date(Date.now() + durationMinutes * 60 * 1000);
    }

    // Déterminer statut
    let status = 'en_route';
    if (distanceKm !== null) {
      if (distanceKm < 0.1) status = 'arrived';
      else if (distanceKm < 1) status = 'approaching';
      else if (distanceKm < 10) status = 'nearby';
    }

    // Upsert tracking
    await db.collection('driver_tracking').updateOne(
      { rdvId: new ObjectId(rdvId) },
      {
        $set: {
          driverId: driverId ? new ObjectId(driverId) : null,
          position,
          speed: speed || null,
          heading: heading || null,
          distanceKm,
          durationMinutes,
          eta,
          status,
          active: true,
          updatedAt: new Date()
        },
        $setOnInsert: {
          rdvId: new ObjectId(rdvId),
          warehouseId: rdv.warehouseId,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    // Sauvegarder historique
    await db.collection('driver_tracking_history').insertOne({
      rdvId: new ObjectId(rdvId),
      driverId: driverId ? new ObjectId(driverId) : null,
      position,
      speed,
      heading,
      distanceKm,
      timestamp: new Date()
    });

    // Notifier logisticien si changement de statut significatif
    if (warehouse) {
      const logisticianId = warehouse.logisticianId.toString();

      // Notifier si chauffeur à moins de 10 km
      if (distanceKm && distanceKm < 10) {
        notifyLogistician(logisticianId, {
          type: 'tracking.driver_nearby',
          rdvId: rdvId,
          rdvNumber: rdv.rdvNumber,
          distanceKm,
          eta,
          warehouseName: warehouse.name,
          timestamp: new Date()
        });
      }

      // Notifier si arrivée
      if (status === 'arrived') {
        notifyLogistician(logisticianId, {
          type: 'tracking.driver_arrived',
          rdvId: rdvId,
          rdvNumber: rdv.rdvNumber,
          warehouseName: warehouse.name,
          timestamp: new Date()
        });

        // Créer événement
        await db.collection('tracking_events').insertOne({
          rdvId: new ObjectId(rdvId),
          type: 'arrived',
          message: 'Chauffeur arrivé à destination',
          timestamp: new Date()
        });
      }
    }

    res.json({
      message: 'Position mise à jour',
      status,
      distanceKm,
      eta
    });

  } catch (error) {
    console.error('[TRACKING] Update position error:', error);
    res.status(500).json({ error: 'Erreur mise à jour position' });
  }
});

// ===========================================
// POST /api/tracking/event (Internal - appelé par app chauffeur)
// Événement tracking (départ, pause, arrivée)
// ===========================================
router.post('/event', async (req, res) => {
  try {
    const { rdvId, driverId, eventType, message, position } = req.body;
    const db = req.db;

    if (!rdvId || !eventType) {
      return res.status(400).json({ error: 'Données incomplètes' });
    }

    const validEvents = ['started', 'paused', 'resumed', 'arrived', 'unloading', 'completed', 'issue'];
    if (!validEvents.includes(eventType)) {
      return res.status(400).json({ error: 'Type événement invalide' });
    }

    // Récupérer RDV
    const rdv = await db.collection('rdv').findOne({
      _id: new ObjectId(rdvId)
    });

    if (!rdv) {
      return res.status(404).json({ error: 'RDV non trouvé' });
    }

    // Créer événement
    await db.collection('tracking_events').insertOne({
      rdvId: new ObjectId(rdvId),
      driverId: driverId ? new ObjectId(driverId) : null,
      type: eventType,
      message: message || getEventMessage(eventType),
      position: position || null,
      timestamp: new Date()
    });

    // Mettre à jour tracking
    const trackingUpdate = {
      status: eventType,
      updatedAt: new Date()
    };

    if (eventType === 'completed') {
      trackingUpdate.active = false;
      trackingUpdate.completedAt = new Date();
    }

    await db.collection('driver_tracking').updateOne(
      { rdvId: new ObjectId(rdvId) },
      { $set: trackingUpdate }
    );

    // Notifier logisticien
    const warehouse = await db.collection('warehouses').findOne({
      _id: rdv.warehouseId
    });

    if (warehouse) {
      notifyLogistician(warehouse.logisticianId.toString(), {
        type: `tracking.${eventType}`,
        rdvId: rdvId,
        rdvNumber: rdv.rdvNumber,
        message: message || getEventMessage(eventType),
        warehouseName: warehouse.name,
        timestamp: new Date()
      });
    }

    res.json({ message: 'Événement enregistré' });

  } catch (error) {
    console.error('[TRACKING] Event error:', error);
    res.status(500).json({ error: 'Erreur enregistrement événement' });
  }
});

// ===========================================
// GET /api/logisticians/:id/tracking/stats
// Statistiques tracking
// ===========================================
router.get('/:id/tracking/stats', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { period = '7d' } = req.query;
    const db = req.db;

    // Calculer dates
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '24h': startDate.setHours(startDate.getHours() - 24); break;
      case '7d': startDate.setDate(startDate.getDate() - 7); break;
      case '30d': startDate.setDate(startDate.getDate() - 30); break;
      default: startDate.setDate(startDate.getDate() - 7);
    }

    // Récupérer entrepôts
    const warehouses = await db.collection('warehouses')
      .find({ logisticianId: new ObjectId(logisticianId) })
      .toArray();

    const warehouseIds = warehouses.map(w => w._id);

    // RDV dans la période
    const rdvs = await db.collection('rdv')
      .find({
        warehouseId: { $in: warehouseIds },
        date: { $gte: startDate, $lte: endDate }
      })
      .toArray();

    // Statistiques ponctualité
    const completed = rdvs.filter(r => r.status === 'completed');
    let onTime = 0;
    let late = 0;
    let totalDelay = 0;

    for (const rdv of completed) {
      const arrival = await db.collection('tracking_events').findOne({
        rdvId: rdv._id,
        type: 'arrived'
      });

      if (arrival) {
        const scheduledTime = new Date(rdv.date);
        const arrivalTime = new Date(arrival.timestamp);
        const delayMinutes = (arrivalTime - scheduledTime) / (1000 * 60);

        if (delayMinutes <= 15) {
          onTime++;
        } else {
          late++;
          totalDelay += delayMinutes;
        }
      }
    }

    // Utilisation tracking
    const withTracking = await db.collection('driver_tracking')
      .countDocuments({
        warehouseId: { $in: warehouseIds },
        createdAt: { $gte: startDate, $lte: endDate }
      });

    res.json({
      period,
      startDate,
      endDate,
      stats: {
        totalRdv: rdvs.length,
        completed: completed.length,
        onTime,
        late,
        onTimeRate: completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0,
        averageDelay: late > 0 ? Math.round(totalDelay / late) : 0,
        trackingUsage: rdvs.length > 0 ? Math.round((withTracking / rdvs.length) * 100) : 0
      },
      byWarehouse: await Promise.all(warehouses.map(async (wh) => {
        const whRdvs = rdvs.filter(r => r.warehouseId.toString() === wh._id.toString());
        return {
          warehouseId: wh._id,
          warehouseName: wh.name,
          totalRdv: whRdvs.length,
          completed: whRdvs.filter(r => r.status === 'completed').length
        };
      }))
    });

  } catch (error) {
    console.error('[TRACKING] Get stats error:', error);
    res.status(500).json({ error: 'Erreur récupération statistiques' });
  }
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 10) / 10; // Arrondi à 1 décimale
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function getEventMessage(eventType) {
  const messages = {
    started: 'Chauffeur parti vers destination',
    paused: 'Pause en cours',
    resumed: 'Trajet repris',
    arrived: 'Chauffeur arrivé',
    unloading: 'Déchargement en cours',
    completed: 'Opération terminée',
    issue: 'Problème signalé'
  };
  return messages[eventType] || eventType;
}

export default router;
