// TomTom Integration - Flux Commande Premium Tracking
// RT Backend Services - SYMPHONI.A Suite
// Version 1.0.0

const https = require('https');

// TomTom API Configuration
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || 'ZQ9AaXfe1bDR3egvxV0I5owWAl9q2JBU';
const TOMTOM_BASE_URL = 'api.tomtom.com';

/**
 * Make HTTPS request to TomTom API
 */
function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: TOMTOM_BASE_URL,
      path: path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            resolve(data);
          }
        } else {
          reject(new Error(`TomTom API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Calculate route between two points
 * @param {Object} origin - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @param {Object} options - Additional routing options
 * @returns {Promise<Object>} Route details with ETA
 */
async function calculateRoute(origin, destination, options = {}) {
  try {
    const {
      departAt = new Date().toISOString(),
      traffic = true,
      vehicleType = 'truck',
      vehicleWeight = 15000, // kg
      vehicleHeight = 4, // meters
      vehicleWidth = 2.5, // meters
      vehicleLength = 16.5 // meters
    } = options;

    // TomTom Routing API v1
    const path = `/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?key=${TOMTOM_API_KEY}&traffic=${traffic}&vehicleCommercial=true&vehicleLoadType=USHazmatClass9&vehicleMaxSpeed=90&vehicleWeight=${vehicleWeight}&vehicleHeight=${vehicleHeight}&vehicleWidth=${vehicleWidth}&vehicleLength=${vehicleLength}&departAt=${encodeURIComponent(departAt)}`;

    const response = await makeRequest(path);

    if (!response.routes || response.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = response.routes[0];
    const summary = route.summary;

    return {
      success: true,
      distance: summary.lengthInMeters, // meters
      duration: summary.travelTimeInSeconds, // seconds
      durationTraffic: summary.trafficDelayInSeconds, // seconds
      estimatedArrival: new Date(Date.now() + summary.travelTimeInSeconds * 1000),
      delayMinutes: Math.round(summary.trafficDelayInSeconds / 60),
      departureTime: new Date(departAt),
      route: {
        points: route.legs[0].points.map(p => ({lat: p.latitude, lng: p.longitude})),
        instructions: route.guidance?.instructions || []
      }
    };

  } catch (error) {
    console.error('TomTom calculateRoute error:', error.message);
    return {
      success: false,
      error: error.message,
      fallback: true
    };
  }
}

/**
 * Calculate ETA from current position to destination
 * @param {Object} currentPosition - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @param {Object} options - Vehicle and traffic options
 * @returns {Promise<Object>} ETA details
 */
async function calculateETA(currentPosition, destination, options = {}) {
  try {
    const routeData = await calculateRoute(currentPosition, destination, options);

    if (!routeData.success) {
      // Fallback to simple calculation
      const distance = calculateHaversineDistance(currentPosition, destination);
      const averageSpeed = options.averageSpeed || 70; // km/h
      const durationHours = distance / averageSpeed;

      return {
        success: true,
        fallback: true,
        eta: new Date(Date.now() + durationHours * 60 * 60 * 1000),
        distance: distance * 1000, // convert to meters
        duration: durationHours * 3600, // convert to seconds
        method: 'haversine'
      };
    }

    return {
      success: true,
      eta: routeData.estimatedArrival,
      distance: routeData.distance,
      duration: routeData.duration,
      trafficDelay: routeData.durationTraffic,
      delayMinutes: routeData.delayMinutes,
      method: 'tomtom'
    };

  } catch (error) {
    console.error('TomTom calculateETA error:', error.message);

    // Fallback
    const distance = calculateHaversineDistance(currentPosition, destination);
    const averageSpeed = options.averageSpeed || 70;
    const durationHours = distance / averageSpeed;

    return {
      success: true,
      fallback: true,
      eta: new Date(Date.now() + durationHours * 60 * 60 * 1000),
      distance: distance * 1000,
      duration: durationHours * 3600,
      method: 'haversine',
      error: error.message
    };
  }
}

/**
 * Detect potential delays based on current position and ETA
 * @param {Object} order - Transport order with delivery window
 * @param {Object} currentPosition - Current GPS position
 * @returns {Promise<Object>} Delay detection results
 */
async function detectDelay(order, currentPosition) {
  try {
    if (!order.deliveryTimeWindow || !order.deliveryAddress?.coordinates) {
      return {
        hasDelay: false,
        reason: 'Missing delivery time window or coordinates'
      };
    }

    const etaData = await calculateETA(
      currentPosition,
      order.deliveryAddress.coordinates,
      {
        vehicleWeight: order.weight,
        averageSpeed: 70
      }
    );

    const deliveryWindowEnd = new Date(order.deliveryTimeWindow.end);
    const estimatedArrival = new Date(etaData.eta);

    const delayMinutes = (estimatedArrival - deliveryWindowEnd) / (1000 * 60);
    const hasDelay = delayMinutes > 0;

    return {
      hasDelay,
      delayMinutes: Math.round(delayMinutes),
      estimatedArrival,
      deliveryWindowEnd,
      currentETA: etaData,
      trafficDelay: etaData.trafficDelay,
      recommendation: hasDelay ? getDelayRecommendation(delayMinutes) : null
    };

  } catch (error) {
    console.error('TomTom detectDelay error:', error.message);
    return {
      hasDelay: false,
      error: error.message
    };
  }
}

/**
 * Get delay recommendation
 */
function getDelayRecommendation(delayMinutes) {
  if (delayMinutes < 15) {
    return {
      severity: 'low',
      action: 'Monitor situation',
      notify: false
    };
  } else if (delayMinutes < 30) {
    return {
      severity: 'medium',
      action: 'Notify customer of potential delay',
      notify: true,
      message: `Estimated delay: ${delayMinutes} minutes`
    };
  } else {
    return {
      severity: 'high',
      action: 'Reschedule delivery appointment',
      notify: true,
      message: `Significant delay detected: ${delayMinutes} minutes. Recommend rescheduling.`
    };
  }
}

/**
 * Get traffic information along route
 * @param {Array} routePoints - Array of {lat, lng} points
 * @returns {Promise<Object>} Traffic information
 */
async function getTrafficInfo(routePoints) {
  try {
    // TomTom Traffic Flow API
    const centerPoint = routePoints[Math.floor(routePoints.length / 2)];
    const path = `/traffic/services/4/flowSegmentData/absolute/10/json?key=${TOMTOM_API_KEY}&point=${centerPoint.lat},${centerPoint.lng}`;

    const response = await makeRequest(path);

    return {
      success: true,
      currentSpeed: response.flowSegmentData?.currentSpeed || 0,
      freeFlowSpeed: response.flowSegmentData?.freeFlowSpeed || 0,
      confidence: response.flowSegmentData?.confidence || 0,
      roadClosure: response.flowSegmentData?.roadClosure || false
    };

  } catch (error) {
    console.error('TomTom getTrafficInfo error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Geocode address to coordinates
 * @param {String} address - Full address string
 * @returns {Promise<Object>} Coordinates
 */
async function geocodeAddress(address) {
  try {
    const encodedAddress = encodeURIComponent(address);
    const path = `/search/2/geocode/${encodedAddress}.json?key=${TOMTOM_API_KEY}&limit=1`;

    const response = await makeRequest(path);

    if (!response.results || response.results.length === 0) {
      throw new Error('Address not found');
    }

    const result = response.results[0];

    return {
      success: true,
      coordinates: {
        lat: result.position.lat,
        lng: result.position.lon
      },
      address: result.address.freeformAddress,
      confidence: result.score
    };

  } catch (error) {
    console.error('TomTom geocodeAddress error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Reverse geocode coordinates to address
 * @param {Object} coordinates - {lat, lng}
 * @returns {Promise<Object>} Address details
 */
async function reverseGeocode(coordinates) {
  try {
    const path = `/search/2/reverseGeocode/${coordinates.lat},${coordinates.lng}.json?key=${TOMTOM_API_KEY}`;

    const response = await makeRequest(path);

    if (!response.addresses || response.addresses.length === 0) {
      throw new Error('Address not found');
    }

    const result = response.addresses[0];

    return {
      success: true,
      address: result.address.freeformAddress,
      street: result.address.streetName,
      city: result.address.municipality,
      postalCode: result.address.postalCode,
      country: result.address.country
    };

  } catch (error) {
    console.error('TomTom reverseGeocode error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if vehicle is in geofence zone
 * @param {Object} vehiclePosition - {lat, lng}
 * @param {Object} zoneCenter - {lat, lng}
 * @param {Number} radiusMeters - Geofence radius in meters
 * @returns {Boolean} True if in zone
 */
function isInGeofence(vehiclePosition, zoneCenter, radiusMeters = 500) {
  const distance = calculateHaversineDistance(vehiclePosition, zoneCenter) * 1000; // convert km to m
  return distance <= radiusMeters;
}

/**
 * Calculate distance using Haversine formula
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {Number} Distance in kilometers
 */
function calculateHaversineDistance(point1, point2) {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(point2.lat - point1.lat);
  const dLon = deg2rad(point2.lng - point1.lng);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(point1.lat)) * Math.cos(deg2rad(point2.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Get suggested departure time to arrive on time
 * @param {Object} origin - {lat, lng}
 * @param {Object} destination - {lat, lng}
 * @param {Date} desiredArrival - Desired arrival time
 * @returns {Promise<Object>} Suggested departure details
 */
async function getSuggestedDeparture(origin, destination, desiredArrival) {
  try {
    const routeData = await calculateRoute(origin, destination, {
      departAt: new Date().toISOString()
    });

    if (!routeData.success) {
      throw new Error('Could not calculate route');
    }

    const travelTimeMs = routeData.duration * 1000;
    const bufferMs = 15 * 60 * 1000; // 15 minutes buffer
    const suggestedDeparture = new Date(desiredArrival - travelTimeMs - bufferMs);

    return {
      success: true,
      suggestedDeparture,
      travelTime: routeData.duration,
      distance: routeData.distance,
      buffer: 15, // minutes
      desiredArrival
    };

  } catch (error) {
    console.error('TomTom getSuggestedDeparture error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== EXPORTS ====================

module.exports = {
  calculateRoute,
  calculateETA,
  detectDelay,
  getTrafficInfo,
  geocodeAddress,
  reverseGeocode,
  isInGeofence,
  getSuggestedDeparture,
  calculateHaversineDistance,
  TOMTOM_API_KEY
};
