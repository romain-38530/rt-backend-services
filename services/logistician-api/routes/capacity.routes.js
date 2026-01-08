/**
 * Capacity Routes
 * Gestion des alertes capacité entrepôt
 */

import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { authenticateLogistician } from '../index.js';
import { notifyLogistician } from '../index.js';

const router = Router();

// Seuils d'alerte par défaut
const DEFAULT_THRESHOLDS = {
  warning: 80,  // 80% occupation
  critical: 95  // 95% occupation
};

// ===========================================
// GET /api/logisticians/:id/warehouses
// Liste des entrepôts avec capacité
// ===========================================
router.get('/:id/warehouses', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const db = req.db;

    const warehouses = await db.collection('warehouses')
      .find({
        logisticianId: new ObjectId(logisticianId),
        status: { $in: ['active', 'validated'] }
      })
      .toArray();

    // Récupérer capacité actuelle pour chaque entrepôt
    const warehousesWithCapacity = await Promise.all(
      warehouses.map(async (wh) => {
        const capacity = await db.collection('warehouse_capacity').findOne({
          warehouseId: wh._id
        });

        const thresholds = capacity?.thresholds || DEFAULT_THRESHOLDS;
        const usedPercentage = capacity?.usedCapacity
          ? Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100)
          : 0;

        let status = 'normal';
        if (usedPercentage >= thresholds.critical) status = 'critical';
        else if (usedPercentage >= thresholds.warning) status = 'warning';

        return {
          id: wh._id,
          name: wh.name,
          address: wh.address,
          icpeCode: wh.icpeCode,
          totalCapacity: capacity?.totalCapacity || wh.storageCapacity || 0,
          usedCapacity: capacity?.usedCapacity || 0,
          availableCapacity: (capacity?.totalCapacity || 0) - (capacity?.usedCapacity || 0),
          usedPercentage,
          status,
          thresholds,
          lastUpdated: capacity?.updatedAt || null
        };
      })
    );

    res.json({
      warehouses: warehousesWithCapacity,
      totalWarehouses: warehouses.length,
      criticalCount: warehousesWithCapacity.filter(w => w.status === 'critical').length,
      warningCount: warehousesWithCapacity.filter(w => w.status === 'warning').length
    });

  } catch (error) {
    console.error('[CAPACITY] List warehouses error:', error);
    res.status(500).json({ error: 'Erreur récupération entrepôts' });
  }
});

// ===========================================
// GET /api/logisticians/:id/warehouses/:warehouseId/capacity
// Détail capacité d'un entrepôt
// ===========================================
router.get('/:id/warehouses/:warehouseId/capacity', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, warehouseId } = req.params;
    const db = req.db;

    // Vérifier que l'entrepôt appartient au logisticien
    const warehouse = await db.collection('warehouses').findOne({
      _id: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt non trouvé' });
    }

    // Récupérer capacité
    const capacity = await db.collection('warehouse_capacity').findOne({
      warehouseId: new ObjectId(warehouseId)
    });

    // Récupérer historique capacité (30 derniers jours)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await db.collection('warehouse_capacity_history')
      .find({
        warehouseId: new ObjectId(warehouseId),
        date: { $gte: thirtyDaysAgo }
      })
      .sort({ date: 1 })
      .toArray();

    // Récupérer alertes actives
    const activeAlerts = await db.collection('warehouse_capacity_alerts')
      .find({
        warehouseId: new ObjectId(warehouseId),
        resolvedAt: null
      })
      .sort({ createdAt: -1 })
      .toArray();

    // Récupérer RDV à venir qui impactent la capacité
    const upcomingRdv = await db.collection('rdv')
      .find({
        warehouseId: new ObjectId(warehouseId),
        date: { $gte: new Date() },
        status: { $in: ['confirmed', 'pending'] }
      })
      .sort({ date: 1 })
      .limit(20)
      .toArray();

    // Calculer projections
    const projectedCapacity = calculateProjectedCapacity(capacity, upcomingRdv);

    res.json({
      warehouse: {
        id: warehouse._id,
        name: warehouse.name,
        address: warehouse.address
      },
      capacity: {
        total: capacity?.totalCapacity || warehouse.storageCapacity || 0,
        used: capacity?.usedCapacity || 0,
        available: (capacity?.totalCapacity || 0) - (capacity?.usedCapacity || 0),
        usedPercentage: capacity?.usedCapacity
          ? Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100)
          : 0,
        unit: capacity?.unit || 'm3'
      },
      thresholds: capacity?.thresholds || DEFAULT_THRESHOLDS,
      history: history.map(h => ({
        date: h.date,
        usedCapacity: h.usedCapacity,
        usedPercentage: h.usedPercentage
      })),
      activeAlerts: activeAlerts.map(a => ({
        id: a._id,
        level: a.level,
        message: a.message,
        createdAt: a.createdAt
      })),
      projections: projectedCapacity,
      upcomingRdv: upcomingRdv.map(r => ({
        id: r._id,
        date: r.date,
        type: r.type,
        estimatedVolume: r.estimatedVolume || 0,
        impact: r.type === 'delivery' ? '+' : '-'
      }))
    });

  } catch (error) {
    console.error('[CAPACITY] Get capacity error:', error);
    res.status(500).json({ error: 'Erreur récupération capacité' });
  }
});

// ===========================================
// PUT /api/logisticians/:id/warehouses/:warehouseId/capacity
// Mettre à jour capacité
// ===========================================
router.put('/:id/warehouses/:warehouseId/capacity', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, warehouseId } = req.params;
    const { totalCapacity, usedCapacity, unit, thresholds } = req.body;
    const db = req.db;

    // Vérifier que l'entrepôt appartient au logisticien
    const warehouse = await db.collection('warehouses').findOne({
      _id: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt non trouvé' });
    }

    // Validation
    if (totalCapacity !== undefined && totalCapacity < 0) {
      return res.status(400).json({ error: 'Capacité totale invalide' });
    }
    if (usedCapacity !== undefined && usedCapacity < 0) {
      return res.status(400).json({ error: 'Capacité utilisée invalide' });
    }

    const updateData = {
      updatedAt: new Date()
    };

    if (totalCapacity !== undefined) updateData.totalCapacity = totalCapacity;
    if (usedCapacity !== undefined) updateData.usedCapacity = usedCapacity;
    if (unit) updateData.unit = unit;
    if (thresholds) {
      updateData.thresholds = {
        warning: thresholds.warning || DEFAULT_THRESHOLDS.warning,
        critical: thresholds.critical || DEFAULT_THRESHOLDS.critical
      };
    }

    // Upsert capacité
    const result = await db.collection('warehouse_capacity').updateOne(
      { warehouseId: new ObjectId(warehouseId) },
      {
        $set: updateData,
        $setOnInsert: {
          warehouseId: new ObjectId(warehouseId),
          logisticianId: new ObjectId(logisticianId),
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    // Récupérer capacité mise à jour
    const capacity = await db.collection('warehouse_capacity').findOne({
      warehouseId: new ObjectId(warehouseId)
    });

    // Enregistrer historique
    await db.collection('warehouse_capacity_history').insertOne({
      warehouseId: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId),
      date: new Date(),
      totalCapacity: capacity.totalCapacity,
      usedCapacity: capacity.usedCapacity,
      usedPercentage: Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100),
      createdAt: new Date()
    });

    // Vérifier si alerte nécessaire
    await checkCapacityAlerts(db, warehouseId, logisticianId, capacity);

    res.json({
      message: 'Capacité mise à jour',
      capacity: {
        total: capacity.totalCapacity,
        used: capacity.usedCapacity,
        available: capacity.totalCapacity - capacity.usedCapacity,
        usedPercentage: Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100)
      }
    });

  } catch (error) {
    console.error('[CAPACITY] Update capacity error:', error);
    res.status(500).json({ error: 'Erreur mise à jour capacité' });
  }
});

// ===========================================
// POST /api/logisticians/:id/warehouses/:warehouseId/capacity/adjust
// Ajuster capacité (après livraison/expédition)
// ===========================================
router.post('/:id/warehouses/:warehouseId/capacity/adjust', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, warehouseId } = req.params;
    const { adjustment, reason, orderId, rdvId } = req.body;
    const db = req.db;

    if (!adjustment || adjustment === 0) {
      return res.status(400).json({ error: 'Ajustement requis' });
    }

    // Vérifier entrepôt
    const warehouse = await db.collection('warehouses').findOne({
      _id: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt non trouvé' });
    }

    // Récupérer capacité actuelle
    const capacity = await db.collection('warehouse_capacity').findOne({
      warehouseId: new ObjectId(warehouseId)
    });

    if (!capacity) {
      return res.status(400).json({ error: 'Capacité non configurée pour cet entrepôt' });
    }

    const newUsedCapacity = Math.max(0, capacity.usedCapacity + adjustment);

    // Mettre à jour
    await db.collection('warehouse_capacity').updateOne(
      { warehouseId: new ObjectId(warehouseId) },
      {
        $set: {
          usedCapacity: newUsedCapacity,
          updatedAt: new Date()
        }
      }
    );

    // Log ajustement
    await db.collection('warehouse_capacity_adjustments').insertOne({
      warehouseId: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId),
      adjustment,
      previousCapacity: capacity.usedCapacity,
      newCapacity: newUsedCapacity,
      reason: reason || (adjustment > 0 ? 'Livraison' : 'Expédition'),
      orderId: orderId ? new ObjectId(orderId) : null,
      rdvId: rdvId ? new ObjectId(rdvId) : null,
      createdAt: new Date(),
      createdBy: req.user.userId
    });

    // Enregistrer historique
    await db.collection('warehouse_capacity_history').insertOne({
      warehouseId: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId),
      date: new Date(),
      totalCapacity: capacity.totalCapacity,
      usedCapacity: newUsedCapacity,
      usedPercentage: Math.round((newUsedCapacity / capacity.totalCapacity) * 100),
      createdAt: new Date()
    });

    // Vérifier alertes
    const updatedCapacity = { ...capacity, usedCapacity: newUsedCapacity };
    await checkCapacityAlerts(db, warehouseId, logisticianId, updatedCapacity);

    res.json({
      message: 'Capacité ajustée',
      adjustment,
      previousCapacity: capacity.usedCapacity,
      newCapacity: newUsedCapacity,
      usedPercentage: Math.round((newUsedCapacity / capacity.totalCapacity) * 100)
    });

  } catch (error) {
    console.error('[CAPACITY] Adjust capacity error:', error);
    res.status(500).json({ error: 'Erreur ajustement capacité' });
  }
});

// ===========================================
// GET /api/logisticians/:id/capacity/alerts
// Liste des alertes capacité
// ===========================================
router.get('/:id/capacity/alerts', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const { status, warehouseId } = req.query;
    const db = req.db;

    const query = {
      logisticianId: new ObjectId(logisticianId)
    };

    if (status === 'active') {
      query.resolvedAt = null;
    } else if (status === 'resolved') {
      query.resolvedAt = { $ne: null };
    }

    if (warehouseId) {
      query.warehouseId = new ObjectId(warehouseId);
    }

    const alerts = await db.collection('warehouse_capacity_alerts')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // Enrichir avec noms entrepôts
    const warehouseIds = [...new Set(alerts.map(a => a.warehouseId.toString()))];
    const warehouses = await db.collection('warehouses')
      .find({ _id: { $in: warehouseIds.map(id => new ObjectId(id)) } })
      .toArray();

    const warehouseMap = warehouses.reduce((acc, w) => {
      acc[w._id.toString()] = w.name;
      return acc;
    }, {});

    res.json({
      alerts: alerts.map(a => ({
        id: a._id,
        warehouseId: a.warehouseId,
        warehouseName: warehouseMap[a.warehouseId.toString()] || 'Inconnu',
        level: a.level,
        message: a.message,
        usedPercentage: a.usedPercentage,
        createdAt: a.createdAt,
        resolvedAt: a.resolvedAt,
        resolvedBy: a.resolvedBy
      })),
      activeCount: alerts.filter(a => !a.resolvedAt).length
    });

  } catch (error) {
    console.error('[CAPACITY] Get alerts error:', error);
    res.status(500).json({ error: 'Erreur récupération alertes' });
  }
});

// ===========================================
// POST /api/logisticians/:id/capacity/alerts/:alertId/resolve
// Résoudre une alerte
// ===========================================
router.post('/:id/capacity/alerts/:alertId/resolve', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, alertId } = req.params;
    const { resolution } = req.body;
    const db = req.db;

    const alert = await db.collection('warehouse_capacity_alerts').findOne({
      _id: new ObjectId(alertId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!alert) {
      return res.status(404).json({ error: 'Alerte non trouvée' });
    }

    if (alert.resolvedAt) {
      return res.status(400).json({ error: 'Alerte déjà résolue' });
    }

    await db.collection('warehouse_capacity_alerts').updateOne(
      { _id: new ObjectId(alertId) },
      {
        $set: {
          resolvedAt: new Date(),
          resolvedBy: req.user.userId,
          resolution: resolution || 'Résolu manuellement'
        }
      }
    );

    res.json({ message: 'Alerte résolue' });

  } catch (error) {
    console.error('[CAPACITY] Resolve alert error:', error);
    res.status(500).json({ error: 'Erreur résolution alerte' });
  }
});

// ===========================================
// PUT /api/logisticians/:id/warehouses/:warehouseId/thresholds
// Configurer seuils d'alerte
// ===========================================
router.put('/:id/warehouses/:warehouseId/thresholds', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, warehouseId } = req.params;
    const { warning, critical } = req.body;
    const db = req.db;

    // Validation
    if (warning < 0 || warning > 100 || critical < 0 || critical > 100) {
      return res.status(400).json({ error: 'Seuils doivent être entre 0 et 100' });
    }
    if (warning >= critical) {
      return res.status(400).json({ error: 'Seuil warning doit être inférieur à critical' });
    }

    // Vérifier entrepôt
    const warehouse = await db.collection('warehouses').findOne({
      _id: new ObjectId(warehouseId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!warehouse) {
      return res.status(404).json({ error: 'Entrepôt non trouvé' });
    }

    await db.collection('warehouse_capacity').updateOne(
      { warehouseId: new ObjectId(warehouseId) },
      {
        $set: {
          thresholds: { warning, critical },
          updatedAt: new Date()
        },
        $setOnInsert: {
          warehouseId: new ObjectId(warehouseId),
          logisticianId: new ObjectId(logisticianId),
          totalCapacity: warehouse.storageCapacity || 0,
          usedCapacity: 0,
          unit: 'm3',
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    res.json({
      message: 'Seuils mis à jour',
      thresholds: { warning, critical }
    });

  } catch (error) {
    console.error('[CAPACITY] Update thresholds error:', error);
    res.status(500).json({ error: 'Erreur mise à jour seuils' });
  }
});

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function calculateProjectedCapacity(capacity, upcomingRdv) {
  if (!capacity) return [];

  const projections = [];
  let currentCapacity = capacity.usedCapacity;
  const today = new Date();

  // Projections pour les 7 prochains jours
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // Calculer impact des RDV ce jour
    const dayRdv = upcomingRdv.filter(r => {
      const rdvDate = new Date(r.date).toISOString().split('T')[0];
      return rdvDate === dateStr;
    });

    let dayChange = 0;
    dayRdv.forEach(r => {
      const volume = r.estimatedVolume || 0;
      if (r.type === 'delivery') dayChange += volume;
      else if (r.type === 'pickup') dayChange -= volume;
    });

    currentCapacity = Math.max(0, currentCapacity + dayChange);

    projections.push({
      date: dateStr,
      projectedCapacity: currentCapacity,
      projectedPercentage: Math.round((currentCapacity / capacity.totalCapacity) * 100),
      rdvCount: dayRdv.length
    });
  }

  return projections;
}

async function checkCapacityAlerts(db, warehouseId, logisticianId, capacity) {
  const usedPercentage = Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100);
  const thresholds = capacity.thresholds || DEFAULT_THRESHOLDS;

  // Vérifier si alerte active existe déjà
  const existingAlert = await db.collection('warehouse_capacity_alerts').findOne({
    warehouseId: new ObjectId(warehouseId),
    resolvedAt: null
  });

  // Déterminer niveau d'alerte
  let alertLevel = null;
  let message = '';

  if (usedPercentage >= thresholds.critical) {
    alertLevel = 'critical';
    message = `Capacité critique: ${usedPercentage}% d'occupation`;
  } else if (usedPercentage >= thresholds.warning) {
    alertLevel = 'warning';
    message = `Attention capacité: ${usedPercentage}% d'occupation`;
  }

  // Si sous les seuils et alerte active, résoudre automatiquement
  if (!alertLevel && existingAlert) {
    await db.collection('warehouse_capacity_alerts').updateOne(
      { _id: existingAlert._id },
      {
        $set: {
          resolvedAt: new Date(),
          resolution: 'Capacité revenue sous les seuils'
        }
      }
    );

    // Notifier résolution
    notifyLogistician(logisticianId, {
      type: 'capacity.alert_resolved',
      warehouseId: warehouseId,
      usedPercentage,
      timestamp: new Date()
    });

    return;
  }

  // Si nouvelle alerte ou niveau changé
  if (alertLevel) {
    if (!existingAlert || existingAlert.level !== alertLevel) {
      // Résoudre ancienne alerte si existe
      if (existingAlert) {
        await db.collection('warehouse_capacity_alerts').updateOne(
          { _id: existingAlert._id },
          {
            $set: {
              resolvedAt: new Date(),
              resolution: 'Nouveau niveau d\'alerte'
            }
          }
        );
      }

      // Créer nouvelle alerte
      await db.collection('warehouse_capacity_alerts').insertOne({
        warehouseId: new ObjectId(warehouseId),
        logisticianId: new ObjectId(logisticianId),
        level: alertLevel,
        message,
        usedPercentage,
        thresholds,
        createdAt: new Date(),
        resolvedAt: null
      });

      // Notifier en temps réel
      notifyLogistician(logisticianId, {
        type: 'capacity.alert',
        level: alertLevel,
        warehouseId: warehouseId,
        message,
        usedPercentage,
        timestamp: new Date()
      });

      // Log event
      await db.collection('logistician_events').insertOne({
        type: 'capacity.alert_created',
        logisticianId: new ObjectId(logisticianId),
        data: { warehouseId, alertLevel, usedPercentage },
        createdAt: new Date()
      });
    }
  }
}

export default router;
