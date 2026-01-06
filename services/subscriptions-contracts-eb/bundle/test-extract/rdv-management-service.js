// RDV Management Service - Gestion des Rendez-vous de Chargement/Livraison
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { EventTypes } = require('./transport-orders-models');

/**
 * Types de RDV
 */
const RDVTypes = {
  PICKUP: 'PICKUP',       // Rendez-vous chargement
  DELIVERY: 'DELIVERY'    // Rendez-vous livraison
};

/**
 * Statuts de RDV
 */
const RDVStatus = {
  REQUESTED: 'REQUESTED',     // Demandé par transporteur
  PROPOSED: 'PROPOSED',       // Contre-proposition
  CONFIRMED: 'CONFIRMED',     // Confirmé
  CANCELLED: 'CANCELLED',     // Annulé
  COMPLETED: 'COMPLETED'      // Réalisé
};

/**
 * Demander un rendez-vous
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @param {Object} rdvData - Données du RDV
 * @returns {Promise<Object>} Résultat de la demande
 */
async function requestRDV(db, orderId, rdvData) {
  try {
    const {
      type = RDVTypes.PICKUP,
      proposedSlot,
      requestedBy,
      notes = ''
    } = rdvData;

    // Vérifier que la commande existe
    const order = await db.collection('transport_orders')
      .findOne({ _id: new ObjectId(orderId) });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Valider le créneau proposé
    if (!proposedSlot || !proposedSlot.start || !proposedSlot.end) {
      return {
        success: false,
        error: 'Proposed slot must have start and end times'
      };
    }

    const startTime = new Date(proposedSlot.start);
    const endTime = new Date(proposedSlot.end);

    if (startTime >= endTime) {
      return {
        success: false,
        error: 'Start time must be before end time'
      };
    }

    // Créer le RDV
    const rdv = {
      orderId: new ObjectId(orderId),
      reference: order.reference,
      type,
      proposedSlot: {
        start: startTime,
        end: endTime
      },
      confirmedSlot: null,
      status: RDVStatus.REQUESTED,
      requestedBy,
      requestedAt: new Date(),
      confirmedBy: null,
      confirmedAt: null,
      notes,
      history: [
        {
          action: 'REQUESTED',
          timestamp: new Date(),
          by: requestedBy,
          slot: { start: startTime, end: endTime }
        }
      ]
    };

    const result = await db.collection('rdv').insertOne(rdv);

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: new ObjectId(orderId),
      eventType: EventTypes.RDV_REQUESTED,
      timestamp: new Date(),
      data: {
        rdvId: result.insertedId.toString(),
        type,
        proposedSlot: { start: startTime, end: endTime },
        requestedBy
      },
      metadata: {
        source: 'API'
      }
    });

    return {
      success: true,
      rdvId: result.insertedId.toString(),
      rdv: {
        ...rdv,
        _id: result.insertedId
      }
    };

  } catch (error) {
    console.error('Error requesting RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Proposer une contre-proposition de RDV
 * @param {Object} db - MongoDB database
 * @param {String} rdvId - ID du RDV
 * @param {Object} proposalData - Données de la contre-proposition
 * @returns {Promise<Object>} Résultat de la proposition
 */
async function proposeRDV(db, rdvId, proposalData) {
  try {
    const {
      counterSlot,
      proposedBy,
      notes = ''
    } = proposalData;

    // Récupérer le RDV
    const rdv = await db.collection('rdv')
      .findOne({ _id: new ObjectId(rdvId) });

    if (!rdv) {
      return {
        success: false,
        error: 'RDV not found'
      };
    }

    if (rdv.status !== RDVStatus.REQUESTED && rdv.status !== RDVStatus.PROPOSED) {
      return {
        success: false,
        error: `Cannot propose counter-slot for RDV in status ${rdv.status}`
      };
    }

    // Valider le créneau proposé
    if (!counterSlot || !counterSlot.start || !counterSlot.end) {
      return {
        success: false,
        error: 'Counter slot must have start and end times'
      };
    }

    const startTime = new Date(counterSlot.start);
    const endTime = new Date(counterSlot.end);

    if (startTime >= endTime) {
      return {
        success: false,
        error: 'Start time must be before end time'
      };
    }

    // Mettre à jour le RDV
    const updateData = {
      proposedSlot: {
        start: startTime,
        end: endTime
      },
      status: RDVStatus.PROPOSED,
      notes: notes || rdv.notes
    };

    await db.collection('rdv').updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: updateData,
        $push: {
          history: {
            action: 'PROPOSED',
            timestamp: new Date(),
            by: proposedBy,
            slot: { start: startTime, end: endTime },
            notes
          }
        }
      }
    );

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: rdv.orderId,
      eventType: EventTypes.RDV_PROPOSED,
      timestamp: new Date(),
      data: {
        rdvId,
        type: rdv.type,
        counterSlot: { start: startTime, end: endTime },
        proposedBy,
        originalSlot: rdv.proposedSlot
      },
      metadata: {
        source: 'API'
      }
    });

    return {
      success: true,
      rdvId,
      counterSlot: { start: startTime, end: endTime }
    };

  } catch (error) {
    console.error('Error proposing RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Confirmer un rendez-vous
 * @param {Object} db - MongoDB database
 * @param {String} rdvId - ID du RDV
 * @param {Object} confirmData - Données de confirmation
 * @returns {Promise<Object>} Résultat de la confirmation
 */
async function confirmRDV(db, rdvId, confirmData) {
  try {
    const { confirmedBy, notes = '' } = confirmData;

    // Récupérer le RDV
    const rdv = await db.collection('rdv')
      .findOne({ _id: new ObjectId(rdvId) });

    if (!rdv) {
      return {
        success: false,
        error: 'RDV not found'
      };
    }

    if (rdv.status !== RDVStatus.REQUESTED && rdv.status !== RDVStatus.PROPOSED) {
      return {
        success: false,
        error: `Cannot confirm RDV in status ${rdv.status}`
      };
    }

    // Confirmer le RDV avec le dernier créneau proposé
    const confirmedSlot = rdv.proposedSlot;

    await db.collection('rdv').updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RDVStatus.CONFIRMED,
          confirmedSlot,
          confirmedBy,
          confirmedAt: new Date(),
          notes: notes || rdv.notes
        },
        $push: {
          history: {
            action: 'CONFIRMED',
            timestamp: new Date(),
            by: confirmedBy,
            slot: confirmedSlot,
            notes
          }
        }
      }
    );

    // Créer l'événement
    await db.collection('transport_events').insertOne({
      orderId: rdv.orderId,
      eventType: EventTypes.RDV_CONFIRMED,
      timestamp: new Date(),
      data: {
        rdvId,
        type: rdv.type,
        confirmedSlot,
        confirmedBy
      },
      metadata: {
        source: 'API'
      }
    });

    // Mettre à jour les dates de la commande si nécessaire
    const updateOrderData = {};

    if (rdv.type === RDVTypes.PICKUP) {
      updateOrderData.confirmedPickupDate = confirmedSlot.start;
      updateOrderData.pickupTimeWindow = confirmedSlot;
    } else if (rdv.type === RDVTypes.DELIVERY) {
      updateOrderData.confirmedDeliveryDate = confirmedSlot.start;
      updateOrderData.deliveryTimeWindow = confirmedSlot;
    }

    if (Object.keys(updateOrderData).length > 0) {
      await db.collection('transport_orders').updateOne(
        { _id: rdv.orderId },
        { $set: updateOrderData }
      );
    }

    return {
      success: true,
      rdvId,
      confirmed: true,
      confirmedSlot
    };

  } catch (error) {
    console.error('Error confirming RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Annuler un rendez-vous
 * @param {Object} db - MongoDB database
 * @param {String} rdvId - ID du RDV
 * @param {Object} cancelData - Données d'annulation
 * @returns {Promise<Object>} Résultat de l'annulation
 */
async function cancelRDV(db, rdvId, cancelData) {
  try {
    const { cancelledBy, reason = '' } = cancelData;

    const rdv = await db.collection('rdv')
      .findOne({ _id: new ObjectId(rdvId) });

    if (!rdv) {
      return {
        success: false,
        error: 'RDV not found'
      };
    }

    if (rdv.status === RDVStatus.CANCELLED) {
      return {
        success: false,
        error: 'RDV already cancelled'
      };
    }

    await db.collection('rdv').updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RDVStatus.CANCELLED,
          cancelledBy,
          cancelledAt: new Date(),
          cancellationReason: reason
        },
        $push: {
          history: {
            action: 'CANCELLED',
            timestamp: new Date(),
            by: cancelledBy,
            reason
          }
        }
      }
    );

    return {
      success: true,
      rdvId,
      cancelled: true
    };

  } catch (error) {
    console.error('Error cancelling RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir tous les RDV d'une commande
 * @param {Object} db - MongoDB database
 * @param {String} orderId - ID de la commande
 * @returns {Promise<Object>} Liste des RDV
 */
async function getOrderRDVs(db, orderId) {
  try {
    const rdvs = await db.collection('rdv')
      .find({ orderId: new ObjectId(orderId) })
      .sort({ requestedAt: -1 })
      .toArray();

    return {
      success: true,
      rdvs,
      count: rdvs.length
    };

  } catch (error) {
    console.error('Error getting order RDVs:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtenir un RDV spécifique
 * @param {Object} db - MongoDB database
 * @param {String} rdvId - ID du RDV
 * @returns {Promise<Object>} RDV
 */
async function getRDV(db, rdvId) {
  try {
    const rdv = await db.collection('rdv')
      .findOne({ _id: new ObjectId(rdvId) });

    if (!rdv) {
      return {
        success: false,
        error: 'RDV not found'
      };
    }

    return {
      success: true,
      rdv
    };

  } catch (error) {
    console.error('Error getting RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Marquer un RDV comme réalisé
 * @param {Object} db - MongoDB database
 * @param {String} rdvId - ID du RDV
 * @returns {Promise<Object>} Résultat
 */
async function completeRDV(db, rdvId) {
  try {
    const rdv = await db.collection('rdv')
      .findOne({ _id: new ObjectId(rdvId) });

    if (!rdv) {
      return {
        success: false,
        error: 'RDV not found'
      };
    }

    if (rdv.status !== RDVStatus.CONFIRMED) {
      return {
        success: false,
        error: `Cannot complete RDV in status ${rdv.status}`
      };
    }

    await db.collection('rdv').updateOne(
      { _id: new ObjectId(rdvId) },
      {
        $set: {
          status: RDVStatus.COMPLETED,
          completedAt: new Date()
        },
        $push: {
          history: {
            action: 'COMPLETED',
            timestamp: new Date()
          }
        }
      }
    );

    return {
      success: true,
      rdvId,
      completed: true
    };

  } catch (error) {
    console.error('Error completing RDV:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  RDVTypes,
  RDVStatus,
  requestRDV,
  proposeRDV,
  confirmRDV,
  cancelRDV,
  getOrderRDVs,
  getRDV,
  completeRDV
};
