// Geofencing Service - Flux Commande Automatic Status Detection
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const tomtom = require('./tomtom-integration');

/**
 * Geofence zones configuration (in meters)
 */
const GEOFENCE_ZONES = {
  ARRIVED: 500,        // 500m = arrived at location
  DEPARTED: 1000,      // 1000m = departed from location
  NEARBY: 2000,        // 2km = nearby notification
  EN_ROUTE: 5000       // 5km = en route notification
};

/**
 * Geofence status tracking
 * Stores current geofence state for each order
 */
const geofenceStates = new Map();

/**
 * Initialize geofence state for an order
 */
function initializeGeofenceState(orderId) {
  geofenceStates.set(orderId, {
    isAtPickup: false,
    isAtDelivery: false,
    hasLeftPickup: false,
    lastPickupDistance: null,
    lastDeliveryDistance: null,
    lastUpdate: new Date()
  });
}

/**
 * Get geofence state for an order
 */
function getGeofenceState(orderId) {
  if (!geofenceStates.has(orderId)) {
    initializeGeofenceState(orderId);
  }
  return geofenceStates.get(orderId);
}

/**
 * Check if vehicle is in a geofence zone
 */
function isInZone(distance, zoneRadius) {
  return distance <= zoneRadius;
}

/**
 * Detect automatic status based on geofencing
 * @param {Object} order - Transport order
 * @param {Object} currentPosition - Current GPS position {lat, lng}
 * @returns {Object} Status detection result
 */
async function detectStatus(order, currentPosition) {
  try {
    const orderId = order._id.toString();
    const state = getGeofenceState(orderId);

    // Calculate distances
    const distanceToPickup = tomtom.calculateHaversineDistance(
      currentPosition,
      order.pickupAddress.coordinates
    ) * 1000; // Convert km to meters

    const distanceToDelivery = tomtom.calculateHaversineDistance(
      currentPosition,
      order.deliveryAddress.coordinates
    ) * 1000; // Convert km to meters

    // Store distances
    state.lastPickupDistance = distanceToPickup;
    state.lastDeliveryDistance = distanceToDelivery;
    state.lastUpdate = new Date();

    const detections = [];

    // ========== PICKUP DETECTION ==========

    // Arrived at pickup location
    if (!state.isAtPickup && isInZone(distanceToPickup, GEOFENCE_ZONES.ARRIVED)) {
      state.isAtPickup = true;
      detections.push({
        status: 'ARRIVED_PICKUP',
        event: 'order.arrived.pickup',
        confidence: 'high',
        distance: Math.round(distanceToPickup),
        automatic: true,
        message: `Vehicle arrived at pickup location (${Math.round(distanceToPickup)}m)`
      });
    }

    // Departed from pickup location
    if (state.isAtPickup && !state.hasLeftPickup &&
        !isInZone(distanceToPickup, GEOFENCE_ZONES.DEPARTED)) {
      state.hasLeftPickup = true;
      state.isAtPickup = false;
      detections.push({
        status: 'EN_ROUTE_DELIVERY',
        event: 'order.departed.pickup',
        confidence: 'high',
        distance: Math.round(distanceToPickup),
        automatic: true,
        message: `Vehicle departed from pickup location`
      });
    }

    // ========== DELIVERY DETECTION ==========

    // Nearby delivery (2km warning)
    if (state.hasLeftPickup && !state.isAtDelivery &&
        isInZone(distanceToDelivery, GEOFENCE_ZONES.NEARBY) &&
        !isInZone(distanceToDelivery, GEOFENCE_ZONES.ARRIVED)) {
      detections.push({
        status: 'NEARBY_DELIVERY',
        event: 'tracking.nearby.delivery',
        confidence: 'medium',
        distance: Math.round(distanceToDelivery),
        automatic: true,
        message: `Vehicle nearby delivery location (${Math.round(distanceToDelivery / 1000)}km)`,
        notification: true
      });
    }

    // Arrived at delivery location
    if (state.hasLeftPickup && !state.isAtDelivery &&
        isInZone(distanceToDelivery, GEOFENCE_ZONES.ARRIVED)) {
      state.isAtDelivery = true;
      detections.push({
        status: 'ARRIVED_DELIVERY',
        event: 'order.arrived.delivery',
        confidence: 'high',
        distance: Math.round(distanceToDelivery),
        automatic: true,
        message: `Vehicle arrived at delivery location (${Math.round(distanceToDelivery)}m)`
      });
    }

    return {
      success: true,
      detections,
      distances: {
        toPickup: Math.round(distanceToPickup),
        toDelivery: Math.round(distanceToDelivery)
      },
      state: {
        isAtPickup: state.isAtPickup,
        isAtDelivery: state.isAtDelivery,
        hasLeftPickup: state.hasLeftPickup
      }
    };

  } catch (error) {
    console.error('Geofencing detectStatus error:', error.message);
    return {
      success: false,
      error: error.message,
      detections: []
    };
  }
}

/**
 * Check if vehicle is stationary (not moving)
 * @param {Array} recentPositions - Last 3-5 positions with timestamps
 * @returns {Boolean} True if vehicle is stationary
 */
function isVehicleStationary(recentPositions) {
  if (!recentPositions || recentPositions.length < 3) {
    return false;
  }

  // Check if vehicle moved less than 50m in last 5 minutes
  const firstPos = recentPositions[0].position;
  const lastPos = recentPositions[recentPositions.length - 1].position;

  const distance = tomtom.calculateHaversineDistance(firstPos, lastPos) * 1000; // meters
  const timeDiff = (new Date(lastPos.timestamp) - new Date(firstPos.timestamp)) / 1000 / 60; // minutes

  // Stationary = less than 50m movement in 5+ minutes
  return distance < 50 && timeDiff >= 5;
}

/**
 * Detect loading/unloading based on stationary status
 * @param {Object} order - Transport order
 * @param {Array} recentPositions - Recent GPS positions
 * @returns {Object} Loading detection result
 */
function detectLoadingUnloading(order, recentPositions) {
  const state = getGeofenceState(order._id.toString());

  if (!recentPositions || recentPositions.length < 3) {
    return { loading: false, unloading: false };
  }

  const isStationary = isVehicleStationary(recentPositions);
  const currentPos = recentPositions[recentPositions.length - 1].position;

  const distanceToPickup = tomtom.calculateHaversineDistance(
    currentPos,
    order.pickupAddress.coordinates
  ) * 1000;

  const distanceToDelivery = tomtom.calculateHaversineDistance(
    currentPos,
    order.deliveryAddress.coordinates
  ) * 1000;

  return {
    loading: isStationary && isInZone(distanceToPickup, GEOFENCE_ZONES.ARRIVED) && state.isAtPickup,
    unloading: isStationary && isInZone(distanceToDelivery, GEOFENCE_ZONES.ARRIVED) && state.isAtDelivery,
    isStationary,
    stationaryDuration: isStationary ? getStationaryDuration(recentPositions) : 0
  };
}

/**
 * Get stationary duration in minutes
 */
function getStationaryDuration(recentPositions) {
  if (!recentPositions || recentPositions.length < 2) return 0;

  const firstPos = recentPositions[0];
  const lastPos = recentPositions[recentPositions.length - 1];

  return (new Date(lastPos.createdAt) - new Date(firstPos.createdAt)) / 1000 / 60; // minutes
}

/**
 * Get notification priorities based on detection
 */
function getNotificationPriority(detection) {
  const priorities = {
    'ARRIVED_PICKUP': 'high',
    'ARRIVED_DELIVERY': 'high',
    'EN_ROUTE_DELIVERY': 'medium',
    'NEARBY_DELIVERY': 'medium',
    'LOADING': 'low',
    'UNLOADING': 'low'
  };

  return priorities[detection.status] || 'low';
}

/**
 * Should notify based on status change
 */
function shouldNotify(detection, order) {
  const notifiableStatuses = [
    'ARRIVED_PICKUP',
    'EN_ROUTE_DELIVERY',
    'NEARBY_DELIVERY',
    'ARRIVED_DELIVERY'
  ];

  // Always notify for Premium tracking
  if (order.trackingType === 'PREMIUM' && notifiableStatuses.includes(detection.status)) {
    return true;
  }

  // Notify for high confidence detections
  if (detection.confidence === 'high') {
    return true;
  }

  return false;
}

/**
 * Get custom geofence zones (if configured per order)
 */
function getCustomGeofenceZones(order) {
  if (order.geofenceConfig) {
    return {
      ARRIVED: order.geofenceConfig.arrived || GEOFENCE_ZONES.ARRIVED,
      DEPARTED: order.geofenceConfig.departed || GEOFENCE_ZONES.DEPARTED,
      NEARBY: order.geofenceConfig.nearby || GEOFENCE_ZONES.NEARBY,
      EN_ROUTE: order.geofenceConfig.enRoute || GEOFENCE_ZONES.EN_ROUTE
    };
  }
  return GEOFENCE_ZONES;
}

/**
 * Clear geofence state (when order is completed)
 */
function clearGeofenceState(orderId) {
  geofenceStates.delete(orderId);
}

/**
 * Get all active geofence states (for monitoring)
 */
function getAllActiveStates() {
  const states = [];
  for (const [orderId, state] of geofenceStates.entries()) {
    states.push({
      orderId,
      ...state
    });
  }
  return states;
}

/**
 * Calculate speed from recent positions
 */
function calculateSpeed(position1, position2) {
  if (!position1 || !position2) return 0;

  const distance = tomtom.calculateHaversineDistance(
    position1.position,
    position2.position
  ); // km

  const timeDiff = (new Date(position2.createdAt) - new Date(position1.createdAt)) / 1000 / 3600; // hours

  if (timeDiff === 0) return 0;

  return distance / timeDiff; // km/h
}

/**
 * Detect if vehicle is stopped at a location other than pickup/delivery
 * (possible incident, rest area, etc.)
 */
function detectUnexpectedStop(order, currentPosition, recentPositions) {
  const state = getGeofenceState(order._id.toString());

  // Only check if en route
  if (!state.hasLeftPickup || state.isAtDelivery) {
    return { unexpectedStop: false };
  }

  const isStationary = isVehicleStationary(recentPositions);

  if (!isStationary) {
    return { unexpectedStop: false };
  }

  const distanceToPickup = tomtom.calculateHaversineDistance(
    currentPosition,
    order.pickupAddress.coordinates
  ) * 1000;

  const distanceToDelivery = tomtom.calculateHaversineDistance(
    currentPosition,
    order.deliveryAddress.coordinates
  ) * 1000;

  // Stopped but not at pickup or delivery
  const unexpectedStop = !isInZone(distanceToPickup, GEOFENCE_ZONES.ARRIVED) &&
                         !isInZone(distanceToDelivery, GEOFENCE_ZONES.ARRIVED);

  if (unexpectedStop) {
    const duration = getStationaryDuration(recentPositions);
    return {
      unexpectedStop: true,
      duration: Math.round(duration),
      location: currentPosition,
      message: `Vehicle stopped for ${Math.round(duration)} minutes at unexpected location`,
      severity: duration > 30 ? 'high' : duration > 15 ? 'medium' : 'low'
    };
  }

  return { unexpectedStop: false };
}

// ==================== EXPORTS ====================

module.exports = {
  detectStatus,
  detectLoadingUnloading,
  detectUnexpectedStop,
  isVehicleStationary,
  shouldNotify,
  getNotificationPriority,
  clearGeofenceState,
  getAllActiveStates,
  calculateSpeed,
  GEOFENCE_ZONES
};
