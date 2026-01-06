// Dispatch Service - Flux Commande Intelligent Carrier Assignment
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');

/**
 * Dispatch Chain:
 * Ordered list of carriers to contact for a transport order
 * Priority based on: lane performance, global score, price, availability
 */

// Timeout for carrier response (milliseconds)
const CARRIER_RESPONSE_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours

// Maximum carriers in dispatch chain
const MAX_DISPATCH_CHAIN_LENGTH = 5;

// Minimum carrier score to include in dispatch
const MIN_CARRIER_SCORE = 60; // 0-100

/**
 * Generate dispatch chain for an order
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Dispatch chain
 */
async function generateDispatchChain(db, order, options = {}) {
  try {
    const {
      maxCarriers = MAX_DISPATCH_CHAIN_LENGTH,
      minScore = MIN_CARRIER_SCORE,
      preferLaneCarriers = true
    } = options;

    // Step 1: Get eligible carriers
    const eligibleCarriers = await getEligibleCarriers(db, order);

    if (eligibleCarriers.length === 0) {
      return {
        success: true,
        chain: [],
        escalateToAffretia: true,
        reason: 'No eligible carriers found'
      };
    }

    // Step 2: If order has lane match, prioritize lane carriers
    let scoredCarriers = eligibleCarriers;

    if (preferLaneCarriers && order.laneId) {
      scoredCarriers = await prioritizeLaneCarriers(
        db,
        order,
        eligibleCarriers
      );
    }

    // Step 3: Score each carrier
    scoredCarriers = await scoreCarriers(db, order, scoredCarriers);

    // Step 4: Filter by minimum score
    scoredCarriers = scoredCarriers.filter(c => c.finalScore >= minScore);

    if (scoredCarriers.length === 0) {
      return {
        success: true,
        chain: [],
        escalateToAffretia: true,
        reason: `No carriers meet minimum score (${minScore})`
      };
    }

    // Step 5: Sort by final score
    scoredCarriers.sort((a, b) => b.finalScore - a.finalScore);

    // Step 6: Build dispatch chain
    const chain = scoredCarriers.slice(0, maxCarriers).map((carrier, index) => ({
      carrierId: carrier.carrierId,
      carrierName: carrier.name,
      order: index + 1,
      priority: index === 0 ? 'high' : index < 3 ? 'medium' : 'low',
      score: carrier.finalScore,
      scoreBreakdown: carrier.scoreBreakdown,
      estimatedPrice: carrier.estimatedPrice,
      estimatedResponseTime: '30min',
      timeout: new Date(Date.now() + CARRIER_RESPONSE_TIMEOUT),
      status: 'pending',
      sentAt: null,
      respondedAt: null,
      response: null
    }));

    return {
      success: true,
      chain,
      totalEligible: eligibleCarriers.length,
      totalScored: scoredCarriers.length,
      escalateToAffretia: false
    };

  } catch (error) {
    console.error('Error generating dispatch chain:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get eligible carriers for an order
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @returns {Promise<Array>} Eligible carriers
 */
async function getEligibleCarriers(db, order) {
  try {
    // Get all active carriers
    const carriers = await db.collection('carriers')
      .find({ status: 'active' })
      .toArray();

    const eligible = [];

    for (const carrier of carriers) {
      // Check 1: Vigilance status
      if (carrier.vigilance && carrier.vigilance.status !== 'clear') {
        continue; // Skip carriers with vigilance issues
      }

      // Check 2: Service area (if defined)
      if (carrier.serviceArea && !isInServiceArea(order, carrier.serviceArea)) {
        continue;
      }

      // Check 3: Vehicle capacity
      if (carrier.maxWeight && order.weight > carrier.maxWeight) {
        continue;
      }

      // Check 4: Required constraints
      if (order.constraints && carrier.capabilities) {
        const hasAllConstraints = order.constraints.every(constraint =>
          carrier.capabilities.includes(constraint)
        );
        if (!hasAllConstraints) {
          continue;
        }
      }

      // Check 5: Availability (basic check)
      const isAvailable = await checkCarrierAvailability(
        db,
        carrier._id.toString(),
        order.pickupTimeWindow || {}
      );

      if (!isAvailable) {
        continue;
      }

      eligible.push({
        carrierId: carrier._id.toString(),
        name: carrier.name,
        email: carrier.email,
        phone: carrier.phone,
        capabilities: carrier.capabilities || [],
        maxWeight: carrier.maxWeight,
        serviceArea: carrier.serviceArea,
        globalScore: carrier.score || 70 // Default score if not rated
      });
    }

    return eligible;

  } catch (error) {
    console.error('Error getting eligible carriers:', error);
    return [];
  }
}

/**
 * Check if order is in carrier service area
 * @param {Object} order - Transport order
 * @param {Object} serviceArea - Carrier service area
 * @returns {Boolean} True if in service area
 */
function isInServiceArea(order, serviceArea) {
  // Simple check: if carrier has no service area defined, accept all
  if (!serviceArea || !serviceArea.regions) {
    return true;
  }

  // Check if pickup and delivery regions match
  const pickupRegion = order.pickupAddress?.postalCode?.substring(0, 2);
  const deliveryRegion = order.deliveryAddress?.postalCode?.substring(0, 2);

  return serviceArea.regions.includes(pickupRegion) &&
         serviceArea.regions.includes(deliveryRegion);
}

/**
 * Check carrier availability for time window
 * @param {Object} db - MongoDB database
 * @param {String} carrierId - Carrier ID
 * @param {Object} timeWindow - Pickup time window
 * @returns {Promise<Boolean>} True if available
 */
async function checkCarrierAvailability(db, carrierId, timeWindow) {
  try {
    // For now, simple availability check
    // TODO: Implement actual calendar/capacity management

    // Count ongoing orders for this carrier
    const ongoingOrders = await db.collection('transport_orders')
      .countDocuments({
        assignedCarrierId: carrierId,
        status: {
          $in: [
            'ACCEPTED',
            'TRACKING_STARTED',
            'EN_ROUTE_PICKUP',
            'ARRIVED_PICKUP',
            'LOADING',
            'LOADED',
            'EN_ROUTE_DELIVERY',
            'ARRIVED_DELIVERY',
            'UNLOADING'
          ]
        }
      });

    // Assume carrier can handle max 5 concurrent orders
    return ongoingOrders < 5;

  } catch (error) {
    console.error('Error checking carrier availability:', error);
    return false;
  }
}

/**
 * Prioritize carriers based on lane performance
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @param {Array} carriers - Eligible carriers
 * @returns {Promise<Array>} Prioritized carriers
 */
async function prioritizeLaneCarriers(db, order, carriers) {
  try {
    // Get lane information
    const lane = await db.collection('transport_lanes').findOne({
      laneId: order.laneId
    });

    if (!lane || !lane.carriers || !lane.carriers.preferred) {
      return carriers;
    }

    // Create priority map from lane
    const laneCarrierMap = new Map();
    lane.carriers.preferred.forEach((lc, index) => {
      laneCarrierMap.set(lc.carrierId, {
        laneScore: lc.avgScore,
        laneOrders: lc.orderCount,
        lanePriority: index + 1
      });
    });

    // Add lane information to carriers
    return carriers.map(carrier => {
      const laneInfo = laneCarrierMap.get(carrier.carrierId);
      if (laneInfo) {
        return {
          ...carrier,
          isLanePreferred: true,
          laneScore: laneInfo.laneScore,
          laneOrders: laneInfo.laneOrders,
          lanePriority: laneInfo.lanePriority
        };
      }
      return {
        ...carrier,
        isLanePreferred: false
      };
    });

  } catch (error) {
    console.error('Error prioritizing lane carriers:', error);
    return carriers;
  }
}

/**
 * Score carriers for this specific order
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @param {Array} carriers - Carriers to score
 * @returns {Promise<Array>} Scored carriers
 */
async function scoreCarriers(db, order, carriers) {
  try {
    const scoredCarriers = [];

    for (const carrier of carriers) {
      const scoreBreakdown = {
        globalScore: 0,
        laneBonus: 0,
        priceScore: 0,
        availabilityScore: 0,
        total: 0
      };

      // 1. Global Score (40 points max)
      scoreBreakdown.globalScore = Math.round((carrier.globalScore / 100) * 40);

      // 2. Lane Bonus (30 points max if lane preferred)
      if (carrier.isLanePreferred) {
        // Higher priority in lane = more points
        const lanePriorityPoints = Math.max(0, 10 - carrier.lanePriority * 2);
        const laneScorePoints = Math.round((carrier.laneScore / 100) * 20);
        scoreBreakdown.laneBonus = lanePriorityPoints + laneScorePoints;
      }

      // 3. Price Score (20 points max)
      const estimatedPrice = await estimatePrice(db, order, carrier);
      carrier.estimatedPrice = estimatedPrice;

      // Get price from pricing grid if available
      const gridPrice = await getPriceFromGrid(db, order, carrier.carrierId);

      if (gridPrice) {
        // Compare estimated vs grid price
        const priceDiff = Math.abs(estimatedPrice - gridPrice) / gridPrice;
        if (priceDiff <= 0.1) {
          scoreBreakdown.priceScore = 20; // Within 10%
        } else if (priceDiff <= 0.2) {
          scoreBreakdown.priceScore = 15; // Within 20%
        } else {
          scoreBreakdown.priceScore = 10;
        }
      } else {
        // No grid price, use average
        scoreBreakdown.priceScore = 15;
      }

      // 4. Availability Score (10 points max)
      // Already checked availability, give full points
      scoreBreakdown.availabilityScore = 10;

      // Calculate total
      scoreBreakdown.total =
        scoreBreakdown.globalScore +
        scoreBreakdown.laneBonus +
        scoreBreakdown.priceScore +
        scoreBreakdown.availabilityScore;

      scoredCarriers.push({
        ...carrier,
        finalScore: scoreBreakdown.total,
        scoreBreakdown
      });
    }

    return scoredCarriers;

  } catch (error) {
    console.error('Error scoring carriers:', error);
    return carriers.map(c => ({ ...c, finalScore: 50, scoreBreakdown: {} }));
  }
}

/**
 * Estimate price for order with carrier
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @param {Object} carrier - Carrier
 * @returns {Promise<Number>} Estimated price in EUR
 */
async function estimatePrice(db, order, carrier) {
  try {
    // Simple estimation based on distance and weight
    // TODO: Implement more sophisticated pricing model

    const basePrice = 150; // EUR base

    // Distance component (assume 391 km average)
    const distance = order.distance || 400;
    const distancePrice = distance * 0.8; // 0.8 EUR/km

    // Weight component
    const weightPrice = (order.weight / 1000) * 10; // 10 EUR/ton

    // Constraint surcharges
    let constraintSurcharge = 0;
    if (order.constraints) {
      if (order.constraints.includes('ADR')) constraintSurcharge += 100;
      if (order.constraints.includes('FRIGO')) constraintSurcharge += 80;
      if (order.constraints.includes('HAYON')) constraintSurcharge += 30;
    }

    return Math.round(basePrice + distancePrice + weightPrice + constraintSurcharge);

  } catch (error) {
    console.error('Error estimating price:', error);
    return 500; // Default
  }
}

/**
 * Get price from pricing grid
 * @param {Object} db - MongoDB database
 * @param {Object} order - Transport order
 * @param {String} carrierId - Carrier ID
 * @returns {Promise<Number|null>} Grid price or null
 */
async function getPriceFromGrid(db, order, carrierId) {
  try {
    // Try to find pricing grid for this carrier and lane
    const grid = await db.collection('pricing_grids').findOne({
      carrierId,
      laneId: order.laneId,
      status: 'active'
    });

    if (!grid) {
      return null;
    }

    // Find matching weight bracket
    const weightBracket = grid.weightBrackets?.find(bracket =>
      order.weight >= bracket.minWeight && order.weight <= bracket.maxWeight
    );

    return weightBracket?.price || grid.basePrice || null;

  } catch (error) {
    console.error('Error getting price from grid:', error);
    return null;
  }
}

/**
 * Send order to next carrier in chain
 * @param {Object} db - MongoDB database
 * @param {String} orderId - Order ID
 * @returns {Promise<Object>} Send result
 */
async function sendToNextCarrier(db, orderId) {
  try {
    const order = await db.collection('transport_orders').findOne({
      _id: new ObjectId(orderId)
    });

    if (!order || !order.dispatchChain) {
      return {
        success: false,
        error: 'Order or dispatch chain not found'
      };
    }

    // Find next pending carrier
    const nextCarrier = order.dispatchChain.find(c => c.status === 'pending');

    if (!nextCarrier) {
      // No more carriers, escalate to Affret.IA
      return {
        success: true,
        escalateToAffretia: true,
        reason: 'All carriers contacted'
      };
    }

    // Update carrier status to 'sent'
    await db.collection('transport_orders').updateOne(
      {
        _id: new ObjectId(orderId),
        'dispatchChain.carrierId': nextCarrier.carrierId
      },
      {
        $set: {
          'dispatchChain.$.status': 'sent',
          'dispatchChain.$.sentAt': new Date(),
          currentCarrierId: nextCarrier.carrierId,
          updatedAt: new Date()
        }
      }
    );

    // TODO: Actually send notification to carrier (email/SMS/API)
    console.log(`[DISPATCH] Order ${orderId} sent to carrier ${nextCarrier.carrierId}`);

    return {
      success: true,
      carrier: nextCarrier,
      orderInChain: nextCarrier.order,
      totalInChain: order.dispatchChain.length
    };

  } catch (error) {
    console.error('Error sending to next carrier:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process carrier response
 * @param {Object} db - MongoDB database
 * @param {String} orderId - Order ID
 * @param {String} carrierId - Carrier ID
 * @param {String} response - 'accepted' or 'refused'
 * @param {Object} data - Response data
 * @returns {Promise<Object>} Process result
 */
async function processCarrierResponse(db, orderId, carrierId, response, data = {}) {
  try {
    const order = await db.collection('transport_orders').findOne({
      _id: new ObjectId(orderId)
    });

    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Update dispatch chain
    await db.collection('transport_orders').updateOne(
      {
        _id: new ObjectId(orderId),
        'dispatchChain.carrierId': carrierId
      },
      {
        $set: {
          'dispatchChain.$.status': response,
          'dispatchChain.$.respondedAt': new Date(),
          'dispatchChain.$.response': data,
          updatedAt: new Date()
        }
      }
    );

    if (response === 'accepted') {
      // Carrier accepted! Assign order
      await db.collection('transport_orders').updateOne(
        { _id: new ObjectId(orderId) },
        {
          $set: {
            assignedCarrierId: carrierId,
            status: 'ACCEPTED',
            acceptedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      return {
        success: true,
        action: 'assigned',
        carrierId
      };

    } else if (response === 'refused') {
      // Carrier refused, try next
      const sendResult = await sendToNextCarrier(db, orderId);

      if (sendResult.escalateToAffretia) {
        return {
          success: true,
          action: 'escalate_affretia',
          reason: sendResult.reason
        };
      }

      return {
        success: true,
        action: 'sent_to_next',
        nextCarrier: sendResult.carrier
      };
    }

  } catch (error) {
    console.error('Error processing carrier response:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check for carrier timeouts
 * @param {Object} db - MongoDB database
 * @returns {Promise<Object>} Timeout check result
 */
async function checkTimeouts(db) {
  try {
    const now = new Date();

    // Find orders with timed out carriers
    const timedOutOrders = await db.collection('transport_orders')
      .find({
        'dispatchChain.status': 'sent',
        'dispatchChain.timeout': { $lt: now }
      })
      .toArray();

    const processedCount = 0;

    for (const order of timedOutOrders) {
      // Find timed out carrier
      const timedOutCarrier = order.dispatchChain.find(
        c => c.status === 'sent' && new Date(c.timeout) < now
      );

      if (timedOutCarrier) {
        // Mark as timeout and move to next
        await processCarrierResponse(
          db,
          order._id.toString(),
          timedOutCarrier.carrierId,
          'timeout'
        );
      }
    }

    return {
      success: true,
      checked: timedOutOrders.length,
      processed: processedCount
    };

  } catch (error) {
    console.error('Error checking timeouts:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  generateDispatchChain,
  sendToNextCarrier,
  processCarrierResponse,
  checkTimeouts,
  CARRIER_RESPONSE_TIMEOUT,
  MAX_DISPATCH_CHAIN_LENGTH,
  MIN_CARRIER_SCORE
};
