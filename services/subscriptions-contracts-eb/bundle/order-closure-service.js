// Order Closure Service - Workflow de Clôture des Commandes
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { EventTypes, OrderStatus } = require('./transport-orders-models');
const { getOrderDocuments } = require('./document-management-service');
const { calculateCarrierScore } = require('./carrier-scoring-service');

/**
 * Clôturer une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {Object} options - Options de clôture
 * @returns {Promise<Object>} Résultat de la clôture
 */
async function closeOrder(db, orderId, options = {}) {
  try {
    const {
      forceClosure = false,
      skipValidations = false
    } = options;

    // Récupérer la commande
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Vérifier que la commande est livrée
    if (order.status !== OrderStatus.DELIVERED &&
        order.status !== OrderStatus.DOCUMENTS_VALIDATED &&
        !forceClosure) {
      return {
        success: false,
        error: `Order cannot be closed in status ${order.status}`,
        currentStatus: order.status
      };
    }

    const closureSteps = {};

    // ÉTAPE 1: Vérifier que les documents sont uploadés
    if (!skipValidations) {
      const docsResult = await verifyDocuments(db, orderId);
      closureSteps.documents = docsResult;

      if (!docsResult.verified && !forceClosure) {
        return {
          success: false,
          error: 'Documents not validated',
          steps: closureSteps
        };
      }
    }

    // ÉTAPE 2: Calculer le score transporteur
    if (order.assignedCarrierId && !order.carrierScore) {
      const scoreResult = await calculateCarrierScore(db, orderId);
      closureSteps.scoring = scoreResult;

      if (!scoreResult.success) {
        console.warn(`Failed to calculate carrier score: ${scoreResult.error}`);
      }
    } else {
      closureSteps.scoring = {
        success: true,
        skipped: !order.assignedCarrierId ? 'No carrier assigned' : 'Already scored'
      };
    }

    // ÉTAPE 3: Générer la preuve de transport
    const proofResult = await generateTransportProof(db, order);
    closureSteps.proof = proofResult;

    // ÉTAPE 4: Synchroniser avec l'ERP
    const erpResult = await syncToERP(db, order);
    closureSteps.erp = erpResult;

    // ÉTAPE 5: Archiver les documents (marquage pour archivage légal 10 ans)
    const archiveResult = await markForArchive(db, orderId);
    closureSteps.archive = archiveResult;

    // ÉTAPE 6: Mettre à jour les statistiques industrielles
    const statsResult = await updateIndustrialStatistics(db, order);
    closureSteps.statistics = statsResult;

    // ÉTAPE 7: Mettre à jour le statut de la commande
    await db.collection('transport_orders').updateOne(
      { _id: new ObjectId(orderId) },
      {
        $set: {
          status: OrderStatus.CLOSED,
          closedAt: new Date(),
          updatedAt: new Date(),
          closureSteps
        }
      }
    );

    // ÉTAPE 8: Créer l'événement de clôture
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.ORDER_CLOSED,
      timestamp: new Date(),
      data: {
        closedBy: options.closedBy || 'SYSTEM',
        forceClosure,
        steps: Object.keys(closureSteps).map(step => ({
          name: step,
          success: closureSteps[step].success
        }))
      },
      metadata: {
        source: 'API'
      }
    });

    return {
      success: true,
      orderId,
      reference: order.reference,
      closedAt: new Date(),
      steps: closureSteps
    };

  } catch (error) {
    console.error('Error closing order:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Vérifier que les documents sont validés
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Résultat de la vérification
 */
async function verifyDocuments(db, orderId) {
  try {
    const docsResult = await getOrderDocuments(db, orderId);

    if (!docsResult.success) {
      return {
        success: false,
        verified: false,
        error: docsResult.error
      };
    }

    const documents = docsResult.documents;

    if (documents.length === 0) {
      return {
        success: false,
        verified: false,
        error: 'No documents uploaded'
      };
    }

    // Vérifier qu'au moins un POD est validé
    const validatedPOD = documents.find(doc =>
      doc.type === 'POD' && doc.status === 'VALIDATED'
    );

    if (!validatedPOD) {
      return {
        success: false,
        verified: false,
        error: 'No validated POD found',
        documents: documents.map(d => ({
          id: d._id.toString(),
          type: d.type,
          status: d.status
        }))
      };
    }

    return {
      success: true,
      verified: true,
      totalDocuments: documents.length,
      validatedDocuments: documents.filter(d => d.status === 'VALIDATED').length
    };

  } catch (error) {
    console.error('Error verifying documents:', error);
    return {
      success: false,
      verified: false,
      error: error.message
    };
  }
}

/**
 * Générer la preuve de transport
 * @param {Object} db - MongoDB database
 * @param {Object} order - Commande
 * @returns {Promise<Object>} Résultat de la génération
 */
async function generateTransportProof(db, order) {
  try {
    // Générer un document de synthèse
    const proof = {
      orderId: order._id,
      reference: order.reference,
      generatedAt: new Date(),
      industrialId: order.industrialId,
      carrierId: order.assignedCarrierId,
      route: {
        origin: {
          address: order.pickupAddress,
          scheduledDate: order.pickupDate,
          actualDate: order.actualPickupDate
        },
        destination: {
          address: order.deliveryAddress,
          scheduledDate: order.deliveryDate,
          actualDate: order.actualDeliveryDate || order.deliveredAt
        }
      },
      cargo: {
        weight: order.weight,
        pallets: order.pallets,
        volume: order.volume,
        constraints: order.constraints
      },
      score: order.carrierScore,
      status: 'COMPLETED'
    };

    // Sauvegarder la preuve
    const result = await db.collection('transport_proofs').insertOne(proof);

    // Mettre à jour la commande avec l'ID de la preuve
    await db.collection('transport_orders').updateOne(
      { _id: order._id },
      { $set: { transportProofId: result.insertedId } }
    );

    return {
      success: true,
      proofId: result.insertedId.toString(),
      generated: true
    };

  } catch (error) {
    console.error('Error generating transport proof:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Synchroniser avec l'ERP
 * @param {Object} db - MongoDB database
 * @param {Object} order - Commande
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncToERP(db, order) {
  try {
    // TODO: Implémenter l'intégration ERP réelle (webhook, API REST, etc.)

    // Pour l'instant, créer un enregistrement de synchronisation
    const syncRecord = {
      orderId: order._id,
      reference: order.reference,
      industrialId: order.industrialId,
      syncType: 'CLOSURE',
      syncedAt: new Date(),
      status: 'PENDING',
      payload: {
        reference: order.reference,
        status: 'CLOSED',
        deliveredAt: order.deliveredAt || order.actualDeliveryDate,
        carrierScore: order.carrierScore,
        totalAmount: order.totalAmount
      }
    };

    const result = await db.collection('erp_sync_queue').insertOne(syncRecord);

    return {
      success: true,
      synced: true,
      syncId: result.insertedId.toString(),
      pending: true // En attente du traitement asynchrone
    };

  } catch (error) {
    console.error('Error syncing to ERP:', error);
    return {
      success: false,
      synced: false,
      error: error.message
    };
  }
}

/**
 * Marquer pour archivage légal (10 ans)
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Résultat du marquage
 */
async function markForArchive(db, orderId) {
  try {
    const archiveDate = new Date();
    archiveDate.setFullYear(archiveDate.getFullYear() + 10); // 10 ans

    // Mettre à jour tous les documents de la commande
    const result = await db.collection('documents').updateMany(
      { orderId: new ObjectId(orderId) },
      {
        $set: {
          markedForArchive: true,
          archiveExpirationDate: archiveDate,
          markedAt: new Date()
        }
      }
    );

    return {
      success: true,
      documentsMarked: result.modifiedCount,
      expirationDate: archiveDate
    };

  } catch (error) {
    console.error('Error marking for archive:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mettre à jour les statistiques industrielles
 * @param {Object} db - MongoDB database
 * @param {Object} order - Commande
 * @returns {Promise<Object>} Résultat de la mise à jour
 */
async function updateIndustrialStatistics(db, order) {
  try {
    const industrialId = order.industrialId;
    const month = new Date().toISOString().substring(0, 7); // YYYY-MM

    // Récupérer ou créer les statistiques du mois
    let stats = await db.collection('industrial_statistics').findOne({
      industrialId,
      month
    });

    if (!stats) {
      stats = {
        industrialId,
        month,
        totalOrders: 0,
        completedOrders: 0,
        totalWeight: 0,
        totalPallets: 0,
        totalDistance: 0,
        totalAmount: 0,
        avgCarrierScore: 0,
        topLanes: [],
        topCarriers: []
      };
    }

    // Mettre à jour les statistiques
    stats.completedOrders += 1;
    stats.totalWeight += order.weight || 0;
    stats.totalPallets += order.pallets || 0;
    stats.totalAmount += order.totalAmount || 0;

    // Calculer la moyenne du score transporteur
    if (order.carrierScore) {
      const totalScore = (stats.avgCarrierScore * (stats.completedOrders - 1)) + order.carrierScore;
      stats.avgCarrierScore = Math.round(totalScore / stats.completedOrders);
    }

    // Sauvegarder
    await db.collection('industrial_statistics').updateOne(
      { industrialId, month },
      { $set: stats },
      { upsert: true }
    );

    return {
      success: true,
      updated: true,
      month,
      completedOrders: stats.completedOrders
    };

  } catch (error) {
    console.error('Error updating industrial statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir le statut de clôture d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Statut de clôture
 */
async function getClosureStatus(db, orderId) {
  try {
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    const status = {
      orderId,
      reference: order.reference,
      currentStatus: order.status,
      isClosed: order.status === OrderStatus.CLOSED,
      closedAt: order.closedAt,
      readyForClosure: false,
      checks: {}
    };

    // Vérifier si prête pour clôture
    if (order.status !== OrderStatus.CLOSED) {
      // Vérifier les documents
      const docsResult = await verifyDocuments(db, orderId);
      status.checks.documents = docsResult;

      // Vérifier si livré
      status.checks.delivered = {
        verified: order.status === OrderStatus.DELIVERED ||
                  order.status === OrderStatus.DOCUMENTS_VALIDATED ||
                  order.status === OrderStatus.DOCUMENTS_UPLOADED,
        currentStatus: order.status
      };

      // Vérifier le score
      status.checks.scored = {
        verified: !!order.carrierScore,
        score: order.carrierScore
      };

      status.readyForClosure =
        status.checks.delivered.verified &&
        status.checks.documents.verified;
    } else {
      status.closureSteps = order.closureSteps;
    }

    return {
      success: true,
      ...status
    };

  } catch (error) {
    console.error('Error getting closure status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir les statistiques de clôture
 * @param {Object} db - MongoDB database
 * @param {String} industrialId - ID de l'industriel
 * @param {Object} filters - Filtres
 * @returns {Promise<Object>} Statistiques
 */
async function getClosureStatistics(db, industrialId, filters = {}) {
  try {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      endDate = new Date()
    } = filters;

    const orders = await db.collection('transport_orders')
      .find({
        industrialId,
        status: OrderStatus.CLOSED,
        closedAt: { $gte: startDate, $lte: endDate }
      })
      .toArray();

    const stats = {
      totalClosed: orders.length,
      period: { startDate, endDate },
      avgClosureTime: 0,
      closureRate: 0
    };

    if (orders.length > 0) {
      // Calculer le temps moyen de clôture (livraison → clôture)
      const closureTimes = orders
        .filter(o => o.deliveredAt && o.closedAt)
        .map(o => (new Date(o.closedAt) - new Date(o.deliveredAt)) / (1000 * 60 * 60)); // heures

      if (closureTimes.length > 0) {
        stats.avgClosureTime = Math.round(
          closureTimes.reduce((sum, t) => sum + t, 0) / closureTimes.length
        );
      }

      // Calculer le taux de clôture
      const totalOrders = await db.collection('transport_orders')
        .countDocuments({
          industrialId,
          createdAt: { $gte: startDate, $lte: endDate }
        });

      stats.closureRate = totalOrders > 0 ?
        Math.round((orders.length / totalOrders) * 100) :
        0;
    }

    return {
      success: true,
      ...stats
    };

  } catch (error) {
    console.error('Error getting closure statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  closeOrder,
  getClosureStatus,
  getClosureStatistics,
  verifyDocuments,
  generateTransportProof,
  syncToERP,
  markForArchive,
  updateIndustrialStatistics
};
