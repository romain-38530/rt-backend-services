/**
 * Service de synchronisation Planning
 * Connecte Orders API a Planning API pour creer des RDV automatiquement
 */

const PLANNING_API_URL = process.env.PLANNING_API_URL || 'http://rt-planning-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

/**
 * Cree une demande de RDV pour le chargement ou la livraison
 * @param {Object} order - La commande
 * @param {string} type - 'pickup' ou 'delivery'
 * @returns {Object} Resultat de la demande de RDV
 */
async function requestRdv(order, type) {
  const location = type === 'pickup' ? order.pickup : order.delivery;
  const requestedDate = type === 'pickup' ? order.pickupDate : order.deliveryDate;

  if (!location || !requestedDate) {
    return { success: false, error: `Missing ${type} location or date` };
  }

  console.log(`[PLANNING] Requesting ${type} RDV for order ${order.orderNumber}`);

  try {
    const rdvData = {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      type, // 'pickup' ou 'delivery'

      // Site
      site: {
        siteId: location.siteId,
        name: location.name,
        address: location.address,
        city: location.city,
        postalCode: location.postalCode,
        country: location.country || 'FR',
        contactName: location.contactName,
        contactPhone: location.phone
      },

      // Creneau demande
      requestedDate: new Date(requestedDate),
      requestedTimeSlot: location.timeSlot || (type === 'pickup' ? '08:00-12:00' : '14:00-18:00'),

      // Infos transport
      transport: {
        vehicleType: order.vehicleType,
        vehiclePlate: order.assignedCarrier?.vehiclePlate,
        driverName: order.assignedCarrier?.driverName,
        driverPhone: order.assignedCarrier?.driverPhone,
        carrierId: order.assignedCarrier?.carrierId || order.carrier?.id,
        carrierName: order.assignedCarrier?.carrierName || order.carrier?.name
      },

      // Marchandise
      cargo: {
        description: order.cargo?.description,
        quantity: order.cargo?.quantity,
        weight: order.cargo?.weight?.value,
        volume: order.cargo?.volume?.value,
        pallets: order.cargo?.pallets
      },

      // Duree estimee
      estimatedDuration: order.estimatedDuration || 60, // minutes

      // Metadata
      organizationId: order.organizationId,
      source: 'orders_api_auto'
    };

    const response = await fetch(`${PLANNING_API_URL}/api/planning/rdv/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rdvData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[PLANNING] API error ${response.status}:`, errorText);
      return { success: false, error: `Planning API returned ${response.status}` };
    }

    const result = await response.json();
    console.log(`[PLANNING] RDV ${type} created:`, result.data?._id || result);

    return {
      success: true,
      data: result.data || result,
      rdvId: result.data?._id || result._id
    };

  } catch (error) {
    console.error(`[PLANNING] Error requesting ${type} RDV:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Cree les RDV de chargement et livraison pour une commande
 * @param {Object} order - La commande nouvellement creee
 * @returns {Object} { pickup: {...}, delivery: {...} }
 */
async function createRdvsForOrder(order) {
  console.log(`[PLANNING] Creating RDVs for order ${order.orderNumber}`);

  const results = {
    pickup: null,
    delivery: null
  };

  // RDV Chargement
  if (order.pickup && order.pickupDate) {
    results.pickup = await requestRdv(order, 'pickup');
  }

  // RDV Livraison
  if (order.delivery && order.deliveryDate) {
    results.delivery = await requestRdv(order, 'delivery');
  }

  return results;
}

/**
 * Obtenir les RDV existants pour une commande
 * @param {string} orderId - ID de la commande
 */
async function getRdvsForOrder(orderId) {
  try {
    const response = await fetch(`${PLANNING_API_URL}/api/planning/rdv/by-order/${orderId}`);

    if (!response.ok) return { pickup: null, delivery: null };

    const result = await response.json();
    const rdvs = result.data || [];

    return {
      pickup: rdvs.find(r => r.type === 'pickup') || null,
      delivery: rdvs.find(r => r.type === 'delivery') || null,
      all: rdvs
    };
  } catch (error) {
    console.warn(`[PLANNING] Could not fetch RDVs:`, error.message);
    return { pickup: null, delivery: null };
  }
}

/**
 * Met a jour un RDV (par exemple apres modification de commande)
 * @param {string} rdvId - ID du RDV
 * @param {Object} updates - Donnees a mettre a jour
 */
async function updateRdv(rdvId, updates) {
  try {
    const response = await fetch(`${PLANNING_API_URL}/api/planning/rdv/${rdvId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (!response.ok) return { success: false };

    const result = await response.json();
    return { success: true, data: result.data };
  } catch (error) {
    console.error(`[PLANNING] Error updating RDV:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Annule les RDV d'une commande
 * @param {string} orderId - ID de la commande
 * @param {string} reason - Raison de l'annulation
 */
async function cancelRdvsForOrder(orderId, reason = 'Commande annulee') {
  const rdvs = await getRdvsForOrder(orderId);
  const results = [];

  for (const rdv of rdvs.all || []) {
    if (rdv && rdv._id) {
      try {
        const response = await fetch(`${PLANNING_API_URL}/api/planning/rdv/cancel/${rdv._id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });

        results.push({
          rdvId: rdv._id,
          type: rdv.type,
          cancelled: response.ok
        });
      } catch (error) {
        results.push({
          rdvId: rdv._id,
          type: rdv.type,
          cancelled: false,
          error: error.message
        });
      }
    }
  }

  return results;
}

/**
 * Handler pour la creation de commande
 * A appeler apres POST /orders
 */
async function handleOrderCreated(order) {
  // Creer les RDVs automatiquement si les dates sont definies
  if (order.pickupDate || order.deliveryDate) {
    const rdvResults = await createRdvsForOrder(order);

    return {
      planning: {
        pickupRdvId: rdvResults.pickup?.rdvId,
        pickupStatus: rdvResults.pickup?.success ? 'requested' : 'failed',
        deliveryRdvId: rdvResults.delivery?.rdvId,
        deliveryStatus: rdvResults.delivery?.success ? 'requested' : 'failed'
      }
    };
  }

  return { planning: null };
}

/**
 * Handler pour la modification de commande
 * A appeler apres PUT /orders/:id si dates changent
 */
async function handleOrderUpdated(order, previousDates) {
  const rdvs = await getRdvsForOrder(order._id.toString());

  // Si dates ont change, mettre a jour les RDVs
  if (previousDates?.pickupDate !== order.pickupDate && rdvs.pickup) {
    await updateRdv(rdvs.pickup._id, {
      requestedDate: order.pickupDate,
      requestedTimeSlot: order.pickup?.timeSlot
    });
  }

  if (previousDates?.deliveryDate !== order.deliveryDate && rdvs.delivery) {
    await updateRdv(rdvs.delivery._id, {
      requestedDate: order.deliveryDate,
      requestedTimeSlot: order.delivery?.timeSlot
    });
  }

  return { updated: true };
}

/**
 * Handler pour l'annulation de commande
 */
async function handleOrderCancelled(order) {
  return cancelRdvsForOrder(order._id.toString(), 'Commande annulee');
}

module.exports = {
  requestRdv,
  createRdvsForOrder,
  getRdvsForOrder,
  updateRdv,
  cancelRdvsForOrder,
  handleOrderCreated,
  handleOrderUpdated,
  handleOrderCancelled,
  PLANNING_API_URL
};
