/**
 * Service de facturation automatique
 * Connecte Orders API a Billing API pour generer des prefactures automatiquement
 */

const BILLING_API_URL = process.env.BILLING_API_URL || 'http://rt-facturation-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

/**
 * Genere une prefacture automatique lors de la livraison d'une commande
 * @param {Object} order - L'objet commande livre
 * @returns {Object} Resultat de la creation de prefacture
 */
async function createPrefacturationOnDelivery(order) {
  console.log(`[BILLING] Creating prefacturation for order ${order.orderNumber}`);

  try {
    // Preparer les donnees pour la prefacture
    const prefacturationData = {
      // Reference commande
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,

      // Client (expediteur)
      customer: {
        customerId: order.organizationId,
        name: order.customerName || order.pickup?.name || 'Client',
        address: order.customerAddress || order.pickup?.address,
        city: order.pickup?.city,
        postalCode: order.pickup?.postalCode,
        country: order.pickup?.country || 'FR'
      },

      // Transporteur
      carrier: {
        carrierId: order.assignedCarrier?.carrierId || order.carrier?.id,
        name: order.assignedCarrier?.carrierName || order.carrier?.name || 'Transporteur',
        vehiclePlate: order.assignedCarrier?.vehiclePlate,
        driverName: order.assignedCarrier?.driverName
      },

      // Details transport
      route: {
        pickup: {
          name: order.pickup?.name,
          address: order.pickup?.address,
          city: order.pickup?.city,
          postalCode: order.pickup?.postalCode,
          country: order.pickup?.country || 'FR',
          date: order.pickupDate
        },
        delivery: {
          name: order.delivery?.name,
          address: order.delivery?.address,
          city: order.delivery?.city,
          postalCode: order.delivery?.postalCode,
          country: order.delivery?.country || 'FR',
          date: order.deliveryDate || order.deliveredAt
        },
        distance: order.distance
      },

      // Marchandise
      cargo: {
        description: order.cargo?.description,
        quantity: order.cargo?.quantity,
        weight: order.cargo?.weight?.value,
        weightUnit: order.cargo?.weight?.unit || 'kg',
        volume: order.cargo?.volume?.value,
        volumeUnit: order.cargo?.volume?.unit || 'm3',
        type: order.cargo?.type,
        hazardous: order.cargo?.hazardous || false
      },

      // Prix et facturation
      pricing: {
        agreedPrice: order.assignedPrice || order.pricing?.agreedPrice || order.estimatedPrice,
        currency: order.currency || 'EUR',
        priceType: 'fixed', // fixed, per_km, per_kg
        breakdown: order.pricing?.breakdown || []
      },

      // Metadata
      metadata: {
        source: 'orders_api_auto',
        deliveredAt: order.deliveredAt || new Date(),
        vehicleType: order.vehicleType,
        services: order.services || {}
      }
    };

    // Appeler l'API Billing
    const response = await fetch(`${BILLING_API_URL}/api/billing/prefacturation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prefacturationData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[BILLING] API error ${response.status}:`, errorText);
      return {
        success: false,
        error: `Billing API returned ${response.status}`,
        details: errorText
      };
    }

    const result = await response.json();
    console.log(`[BILLING] Prefacturation created:`, result.data?._id || result);

    return {
      success: true,
      data: result.data || result,
      prefacturationId: result.data?._id || result._id
    };

  } catch (error) {
    console.error(`[BILLING] Error creating prefacturation:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verifie si une commande a deja une prefacture
 * @param {string} orderId - ID de la commande
 * @returns {Object|null} Prefacture existante ou null
 */
async function getPrefacturationForOrder(orderId) {
  try {
    const response = await fetch(`${BILLING_API_URL}/api/billing/prefacturation?orderId=${orderId}`);

    if (!response.ok) return null;

    const result = await response.json();
    if (result.data && result.data.length > 0) {
      return result.data[0];
    }
    return null;
  } catch (error) {
    console.warn(`[BILLING] Could not check existing prefacturation:`, error.message);
    return null;
  }
}

/**
 * Handler pour l'evenement de livraison complete
 * A appeler depuis le PUT /orders/:id quand status devient 'delivered'
 */
async function handleOrderDelivered(order) {
  // Verifier qu'on a les infos necessaires
  if (!order.assignedCarrier?.carrierId && !order.carrier?.id) {
    console.warn(`[BILLING] Order ${order.orderNumber} has no assigned carrier, skipping prefacturation`);
    return { success: false, error: 'No carrier assigned' };
  }

  // Verifier si prefacture existe deja
  const existing = await getPrefacturationForOrder(order._id.toString());
  if (existing) {
    console.log(`[BILLING] Prefacturation already exists for order ${order.orderNumber}`);
    return { success: true, existing: true, prefacturationId: existing._id };
  }

  // Creer la prefacture
  return createPrefacturationOnDelivery(order);
}

/**
 * Genere un rapport de facturation pour une periode
 */
async function getBillingReport(organizationId, startDate, endDate) {
  try {
    const params = new URLSearchParams({
      customerId: organizationId,
      startDate,
      endDate
    });

    const response = await fetch(`${BILLING_API_URL}/api/billing/report?${params}`);

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error(`[BILLING] Error getting report:`, error.message);
    return null;
  }
}

module.exports = {
  createPrefacturationOnDelivery,
  getPrefacturationForOrder,
  handleOrderDelivered,
  getBillingReport,
  BILLING_API_URL
};
