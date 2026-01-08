/**
 * Capacity Service
 * Vérification automatique des capacités entrepôts
 */

import { ObjectId } from 'mongodb';

// Seuils par défaut
const DEFAULT_THRESHOLDS = {
  warning: 80,
  critical: 95
};

/**
 * Vérifier la capacité de tous les entrepôts
 * Appelé par cron job toutes les heures
 */
export async function checkAllWarehouseCapacity(db) {
  console.log('[CAPACITY-SERVICE] Vérification capacité tous entrepôts...');

  try {
    // Récupérer tous les entrepôts actifs
    const warehouses = await db.collection('warehouses')
      .find({ status: { $in: ['active', 'validated'] } })
      .toArray();

    console.log(`[CAPACITY-SERVICE] ${warehouses.length} entrepôts à vérifier`);

    let alertsCreated = 0;
    let alertsResolved = 0;

    for (const warehouse of warehouses) {
      // Récupérer capacité
      const capacity = await db.collection('warehouse_capacity').findOne({
        warehouseId: warehouse._id
      });

      if (!capacity || !capacity.totalCapacity) {
        continue; // Pas de capacité configurée
      }

      const usedPercentage = Math.round((capacity.usedCapacity / capacity.totalCapacity) * 100);
      const thresholds = capacity.thresholds || DEFAULT_THRESHOLDS;

      // Vérifier alerte existante
      const existingAlert = await db.collection('warehouse_capacity_alerts').findOne({
        warehouseId: warehouse._id,
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

      // Si sous les seuils et alerte active, résoudre
      if (!alertLevel && existingAlert) {
        await db.collection('warehouse_capacity_alerts').updateOne(
          { _id: existingAlert._id },
          {
            $set: {
              resolvedAt: new Date(),
              resolution: 'Capacité revenue sous les seuils automatiquement'
            }
          }
        );
        alertsResolved++;

        // Log événement
        await db.collection('logistician_events').insertOne({
          type: 'capacity.alert_auto_resolved',
          logisticianId: warehouse.logisticianId,
          data: { warehouseId: warehouse._id, usedPercentage },
          createdAt: new Date()
        });

        continue;
      }

      // Si nouvelle alerte nécessaire
      if (alertLevel && (!existingAlert || existingAlert.level !== alertLevel)) {
        // Résoudre ancienne si changement de niveau
        if (existingAlert) {
          await db.collection('warehouse_capacity_alerts').updateOne(
            { _id: existingAlert._id },
            {
              $set: {
                resolvedAt: new Date(),
                resolution: 'Changement de niveau d\'alerte'
              }
            }
          );
        }

        // Créer nouvelle alerte
        await db.collection('warehouse_capacity_alerts').insertOne({
          warehouseId: warehouse._id,
          logisticianId: warehouse.logisticianId,
          level: alertLevel,
          message,
          usedPercentage,
          thresholds,
          createdAt: new Date(),
          resolvedAt: null
        });

        alertsCreated++;

        // Log événement
        await db.collection('logistician_events').insertOne({
          type: 'capacity.alert_auto_created',
          logisticianId: warehouse.logisticianId,
          data: { warehouseId: warehouse._id, alertLevel, usedPercentage },
          createdAt: new Date()
        });

        // TODO: Envoyer notification email si alerte critique
        if (alertLevel === 'critical') {
          console.log(`[CAPACITY-SERVICE] ALERTE CRITIQUE: Entrepôt ${warehouse.name} à ${usedPercentage}%`);
        }
      }

      // Enregistrer historique journalier (si pas déjà fait aujourd'hui)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingHistory = await db.collection('warehouse_capacity_history').findOne({
        warehouseId: warehouse._id,
        date: { $gte: today }
      });

      if (!existingHistory) {
        await db.collection('warehouse_capacity_history').insertOne({
          warehouseId: warehouse._id,
          logisticianId: warehouse.logisticianId,
          date: new Date(),
          totalCapacity: capacity.totalCapacity,
          usedCapacity: capacity.usedCapacity,
          usedPercentage,
          createdAt: new Date()
        });
      }
    }

    console.log(`[CAPACITY-SERVICE] Terminé: ${alertsCreated} alertes créées, ${alertsResolved} alertes résolues`);

    return { alertsCreated, alertsResolved };

  } catch (error) {
    console.error('[CAPACITY-SERVICE] Erreur:', error.message);
    throw error;
  }
}

/**
 * Recalculer la capacité d'un entrepôt
 * basé sur les stocks actuels
 */
export async function recalculateWarehouseCapacity(db, warehouseId) {
  try {
    // Récupérer tous les stocks de l'entrepôt
    const stocks = await db.collection('warehouse_stocks')
      .find({
        warehouseId: new ObjectId(warehouseId),
        status: 'active'
      })
      .toArray();

    // Calculer volume total utilisé
    let totalUsedVolume = 0;
    for (const stock of stocks) {
      totalUsedVolume += stock.volume || 0;
    }

    // Récupérer entrepôt pour capacité totale
    const warehouse = await db.collection('warehouses').findOne({
      _id: new ObjectId(warehouseId)
    });

    if (!warehouse) {
      throw new Error('Entrepôt non trouvé');
    }

    // Mettre à jour capacité
    await db.collection('warehouse_capacity').updateOne(
      { warehouseId: new ObjectId(warehouseId) },
      {
        $set: {
          usedCapacity: totalUsedVolume,
          updatedAt: new Date(),
          lastRecalculation: new Date()
        },
        $setOnInsert: {
          warehouseId: new ObjectId(warehouseId),
          logisticianId: warehouse.logisticianId,
          totalCapacity: warehouse.storageCapacity || 0,
          unit: 'm3',
          thresholds: DEFAULT_THRESHOLDS,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    return { usedCapacity: totalUsedVolume };

  } catch (error) {
    console.error('[CAPACITY-SERVICE] Erreur recalcul:', error.message);
    throw error;
  }
}

/**
 * Projeter la capacité future basée sur les RDV
 */
export async function projectCapacity(db, warehouseId, days = 7) {
  try {
    const capacity = await db.collection('warehouse_capacity').findOne({
      warehouseId: new ObjectId(warehouseId)
    });

    if (!capacity) {
      return null;
    }

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Récupérer RDV à venir
    const rdvs = await db.collection('rdv')
      .find({
        warehouseId: new ObjectId(warehouseId),
        date: { $gte: today, $lte: endDate },
        status: { $in: ['confirmed', 'pending'] }
      })
      .sort({ date: 1 })
      .toArray();

    // Projections jour par jour
    const projections = [];
    let currentCapacity = capacity.usedCapacity;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const dayRdvs = rdvs.filter(r => {
        const rdvDate = new Date(r.date).toISOString().split('T')[0];
        return rdvDate === dateStr;
      });

      let dayChange = 0;
      for (const rdv of dayRdvs) {
        const volume = rdv.estimatedVolume || 0;
        if (rdv.type === 'delivery') {
          dayChange += volume;
        } else if (rdv.type === 'pickup') {
          dayChange -= volume;
        }
      }

      currentCapacity = Math.max(0, currentCapacity + dayChange);

      projections.push({
        date: dateStr,
        projectedCapacity: currentCapacity,
        projectedPercentage: Math.round((currentCapacity / capacity.totalCapacity) * 100),
        rdvCount: dayRdvs.length,
        volumeChange: dayChange
      });
    }

    return projections;

  } catch (error) {
    console.error('[CAPACITY-SERVICE] Erreur projection:', error.message);
    throw error;
  }
}
