// Lane Matching Service - Flux Commande AI Lane Detection
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const { ObjectId } = require('mongodb');
const { calculateHaversineDistance } = require('./tomtom-integration');

/**
 * Lane definition:
 * A "lane" is a recurring transport route between two geographic areas
 * Example: Lyon (69000) → Paris (75000) every week
 */

// Distance threshold for considering two addresses as "same area" (in km)
const AREA_THRESHOLD_KM = 50; // 50km radius = same area

// Minimum orders to create a lane
const MIN_ORDERS_FOR_LANE = 3;

// Time window for lane frequency calculation (days)
const LANE_FREQUENCY_WINDOW = 90; // 90 days

/**
 * Detect if an address matches a known area
 * @param {Object} address - Address with coordinates {lat, lng}
 * @param {Object} area - Area with center coordinates {lat, lng}
 * @returns {Boolean} True if address is in area
 */
function isInArea(address, area) {
  if (!address?.coordinates || !area?.coordinates) {
    return false;
  }

  const distance = calculateHaversineDistance(
    address.coordinates,
    area.coordinates
  );

  return distance <= AREA_THRESHOLD_KM;
}

/**
 * Detect lanes from historical orders
 * @param {Object} db - MongoDB database
 * @param {String} industrialId - Industrial ID to analyze
 * @returns {Promise<Array>} Detected lanes
 */
async function detectLanes(db, industrialId) {
  try {
    // Get completed orders from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - LANE_FREQUENCY_WINDOW);

    const orders = await db.collection('transport_orders')
      .find({
        industrialId,
        status: { $in: ['DELIVERED', 'CLOSED'] },
        createdAt: { $gte: ninetyDaysAgo }
      })
      .toArray();

    if (orders.length < MIN_ORDERS_FOR_LANE) {
      return {
        success: true,
        lanes: [],
        message: `Not enough completed orders (${orders.length}/${MIN_ORDERS_FOR_LANE})`
      };
    }

    // Group orders by similar origin-destination pairs
    const laneGroups = new Map();

    for (const order of orders) {
      if (!order.pickupAddress?.coordinates || !order.deliveryAddress?.coordinates) {
        continue;
      }

      // Try to find existing lane group
      let foundGroup = false;
      for (const [key, group] of laneGroups.entries()) {
        const sampleOrder = group.orders[0];

        // Check if this order matches this lane group
        if (
          isInArea(order.pickupAddress, sampleOrder.pickupAddress) &&
          isInArea(order.deliveryAddress, sampleOrder.deliveryAddress)
        ) {
          group.orders.push(order);
          foundGroup = true;
          break;
        }
      }

      // Create new lane group if not found
      if (!foundGroup) {
        const laneId = `${order.pickupAddress.postalCode?.substring(0, 2) || 'XX'}-${order.deliveryAddress.postalCode?.substring(0, 2) || 'XX'}`;
        laneGroups.set(laneId + '-' + laneGroups.size, {
          orders: [order]
        });
      }
    }

    // Analyze each lane group
    const detectedLanes = [];

    for (const [key, group] of laneGroups.entries()) {
      if (group.orders.length < MIN_ORDERS_FOR_LANE) {
        continue; // Skip lanes with too few orders
      }

      const lane = analyzeLaneGroup(group.orders, industrialId);
      detectedLanes.push(lane);
    }

    return {
      success: true,
      lanes: detectedLanes,
      totalOrders: orders.length,
      analyzedPeriodDays: LANE_FREQUENCY_WINDOW
    };

  } catch (error) {
    console.error('Error detecting lanes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Analyze a group of orders to create lane profile
 * @param {Array} orders - Orders in the lane
 * @param {String} industrialId - Industrial ID
 * @returns {Object} Lane profile
 */
function analyzeLaneGroup(orders) {
  // Calculate average coordinates for origin and destination
  const avgOrigin = {
    lat: orders.reduce((sum, o) => sum + o.pickupAddress.coordinates.lat, 0) / orders.length,
    lng: orders.reduce((sum, o) => sum + o.pickupAddress.coordinates.lng, 0) / orders.length
  };

  const avgDestination = {
    lat: orders.reduce((sum, o) => sum + o.deliveryAddress.coordinates.lat, 0) / orders.length,
    lng: orders.reduce((sum, o) => sum + o.deliveryAddress.coordinates.lng, 0) / orders.length
  };

  // Get most common cities
  const originCities = orders.map(o => o.pickupAddress.city).filter(Boolean);
  const destinationCities = orders.map(o => o.deliveryAddress.city).filter(Boolean);

  const mostCommonOriginCity = getMostCommon(originCities);
  const mostCommonDestinationCity = getMostCommon(destinationCities);

  // Calculate frequency (orders per month)
  const firstOrder = new Date(Math.min(...orders.map(o => new Date(o.createdAt))));
  const lastOrder = new Date(Math.max(...orders.map(o => new Date(o.createdAt))));
  const daysDiff = (lastOrder - firstOrder) / (1000 * 60 * 60 * 24);
  const frequency = daysDiff > 0 ? (orders.length / daysDiff) * 30 : 0; // orders per month

  // Analyze carriers
  const carrierStats = analyzeCarriers(orders);

  // Analyze constraints
  const constraintFrequency = {};
  orders.forEach(order => {
    if (order.constraints && Array.isArray(order.constraints)) {
      order.constraints.forEach(constraint => {
        constraintFrequency[constraint] = (constraintFrequency[constraint] || 0) + 1;
      });
    }
  });

  const commonConstraints = Object.entries(constraintFrequency)
    .filter(([_, count]) => count >= orders.length * 0.5) // 50%+ frequency
    .map(([constraint]) => constraint);

  // Calculate average metrics
  const avgWeight = orders.reduce((sum, o) => sum + (o.weight || 0), 0) / orders.length;
  const avgPallets = orders.reduce((sum, o) => sum + (o.pallets || 0), 0) / orders.length;
  const avgVolume = orders.reduce((sum, o) => sum + (o.volume || 0), 0) / orders.length;

  // Calculate distance
  const distance = calculateHaversineDistance(avgOrigin, avgDestination);

  return {
    laneId: `LANE-${mostCommonOriginCity?.substring(0, 3)?.toUpperCase() || 'XXX'}-${mostCommonDestinationCity?.substring(0, 3)?.toUpperCase() || 'XXX'}`,
    origin: {
      city: mostCommonOriginCity,
      postalCode: getMostCommon(orders.map(o => o.pickupAddress.postalCode).filter(Boolean)),
      coordinates: avgOrigin
    },
    destination: {
      city: mostCommonDestinationCity,
      postalCode: getMostCommon(orders.map(o => o.deliveryAddress.postalCode).filter(Boolean)),
      coordinates: avgDestination
    },
    statistics: {
      totalOrders: orders.length,
      frequency: Math.round(frequency * 10) / 10, // orders per month
      avgWeight: Math.round(avgWeight),
      avgPallets: Math.round(avgPallets * 10) / 10,
      avgVolume: Math.round(avgVolume * 10) / 10,
      distance: Math.round(distance)
    },
    carriers: carrierStats,
    commonConstraints,
    confidence: calculateConfidence(orders.length, frequency),
    lastUsed: lastOrder,
    firstUsed: firstOrder,
    orderIds: orders.map(o => o._id.toString())
  };
}

/**
 * Analyze carrier performance on a lane
 * @param {Array} orders - Orders in the lane
 * @returns {Object} Carrier statistics
 */
function analyzeCarriers(orders) {
  const carrierPerformance = new Map();

  orders.forEach(order => {
    if (!order.assignedCarrierId) return;

    const carrierId = order.assignedCarrierId;

    if (!carrierPerformance.has(carrierId)) {
      carrierPerformance.set(carrierId, {
        carrierId,
        orderCount: 0,
        avgScore: 0,
        scores: []
      });
    }

    const stats = carrierPerformance.get(carrierId);
    stats.orderCount++;

    if (order.carrierScore) {
      stats.scores.push(order.carrierScore);
    }
  });

  // Calculate average scores
  for (const stats of carrierPerformance.values()) {
    if (stats.scores.length > 0) {
      stats.avgScore = Math.round(
        stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length
      );
    }
    delete stats.scores; // Remove raw scores
  }

  // Sort by order count and score
  const sorted = Array.from(carrierPerformance.values())
    .sort((a, b) => {
      if (b.orderCount !== a.orderCount) {
        return b.orderCount - a.orderCount;
      }
      return b.avgScore - a.avgScore;
    });

  return {
    totalCarriers: sorted.length,
    preferred: sorted.slice(0, 3), // Top 3 carriers
    all: sorted
  };
}

/**
 * Calculate confidence score for a lane
 * @param {Number} orderCount - Number of orders
 * @param {Number} frequency - Orders per month
 * @returns {String} Confidence level
 */
function calculateConfidence(orderCount, frequency) {
  if (orderCount >= 10 && frequency >= 4) {
    return 'HIGH'; // 10+ orders, 4+ per month
  } else if (orderCount >= 5 && frequency >= 2) {
    return 'MEDIUM'; // 5+ orders, 2+ per month
  } else {
    return 'LOW';
  }
}

/**
 * Get most common element in array
 * @param {Array} arr - Array of elements
 * @returns {*} Most common element
 */
function getMostCommon(arr) {
  if (arr.length === 0) return null;

  const frequency = {};
  arr.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Match an order to known lanes
 * @param {Object} db - MongoDB database
 * @param {Object} order - Order to match
 * @returns {Promise<Object>} Matching results
 */
async function matchOrderToLane(db, order) {
  try {
    if (!order.pickupAddress?.coordinates || !order.deliveryAddress?.coordinates) {
      return {
        success: false,
        error: 'Order missing pickup or delivery coordinates'
      };
    }

    // Get existing lanes for this industrial
    const lanes = await db.collection('transport_lanes')
      .find({ industrialId: order.industrialId })
      .toArray();

    if (lanes.length === 0) {
      return {
        success: true,
        matched: false,
        message: 'No lanes detected yet for this industrial'
      };
    }

    // Find matching lanes
    const matches = [];

    for (const lane of lanes) {
      const originMatch = isInArea(order.pickupAddress, lane.origin);
      const destinationMatch = isInArea(order.deliveryAddress, lane.destination);

      if (originMatch && destinationMatch) {
        // Calculate match score
        const score = calculateMatchScore(order, lane);

        matches.push({
          laneId: lane.laneId,
          lane,
          score,
          confidence: lane.confidence,
          recommendedCarriers: lane.carriers.preferred
        });
      }
    }

    if (matches.length === 0) {
      return {
        success: true,
        matched: false,
        message: 'No matching lanes found'
      };
    }

    // Sort by score
    matches.sort((a, b) => b.score - a.score);

    return {
      success: true,
      matched: true,
      bestMatch: matches[0],
      allMatches: matches,
      totalLanes: lanes.length
    };

  } catch (error) {
    console.error('Error matching order to lane:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Calculate match score between order and lane
 * @param {Object} order - Order
 * @param {Object} lane - Lane
 * @returns {Number} Match score (0-100)
 */
function calculateMatchScore(order, lane) {
  let score = 50; // Base score

  // Weight similarity (±20%)
  if (order.weight && lane.statistics.avgWeight) {
    const weightDiff = Math.abs(order.weight - lane.statistics.avgWeight) / lane.statistics.avgWeight;
    if (weightDiff <= 0.2) score += 15;
    else if (weightDiff <= 0.5) score += 5;
  }

  // Pallet similarity
  if (order.pallets && lane.statistics.avgPallets) {
    const palletDiff = Math.abs(order.pallets - lane.statistics.avgPallets) / lane.statistics.avgPallets;
    if (palletDiff <= 0.2) score += 10;
    else if (palletDiff <= 0.5) score += 5;
  }

  // Constraint match
  if (order.constraints && lane.commonConstraints) {
    const matchingConstraints = order.constraints.filter(c =>
      lane.commonConstraints.includes(c)
    ).length;

    if (matchingConstraints === order.constraints.length) {
      score += 20; // All constraints match
    } else if (matchingConstraints > 0) {
      score += 10; // Partial match
    }
  }

  // Lane confidence bonus
  if (lane.confidence === 'HIGH') score += 5;

  return Math.min(Math.round(score), 100);
}

/**
 * Save detected lanes to database
 * @param {Object} db - MongoDB database
 * @param {String} industrialId - Industrial ID
 * @param {Array} lanes - Detected lanes
 * @returns {Promise<Object>} Save result
 */
async function saveLanes(db, industrialId, lanes) {
  try {
    // Delete existing lanes for this industrial
    await db.collection('transport_lanes').deleteMany({ industrialId });

    // Insert new lanes
    if (lanes.length > 0) {
      const laneDocs = lanes.map(lane => ({
        ...lane,
        industrialId,
        detectedAt: new Date(),
        updatedAt: new Date()
      }));

      const result = await db.collection('transport_lanes').insertMany(laneDocs);

      return {
        success: true,
        inserted: result.insertedCount
      };
    }

    return {
      success: true,
      inserted: 0
    };

  } catch (error) {
    console.error('Error saving lanes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get lanes for an industrial
 * @param {Object} db - MongoDB database
 * @param {String} industrialId - Industrial ID
 * @returns {Promise<Array>} Lanes
 */
async function getLanes(db, industrialId) {
  try {
    const lanes = await db.collection('transport_lanes')
      .find({ industrialId })
      .sort({ 'statistics.frequency': -1 })
      .toArray();

    return {
      success: true,
      lanes,
      count: lanes.length
    };

  } catch (error) {
    console.error('Error getting lanes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  detectLanes,
  matchOrderToLane,
  saveLanes,
  getLanes,
  AREA_THRESHOLD_KM,
  MIN_ORDERS_FOR_LANE,
  LANE_FREQUENCY_WINDOW
};
