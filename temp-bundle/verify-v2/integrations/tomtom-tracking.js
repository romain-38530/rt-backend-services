/**
 * TomTom Telematics API Integration
 * RT SYMPHONI.A - Tracking Premium (4EUR/vehicule/mois)
 *
 * Features:
 * - Real-time GPS tracking
 * - Route calculation with traffic
 * - ETA estimation
 * - Geocoding
 *
 * @version 1.0.0
 * @date 2025-11-26
 */

const axios = require('axios');

class TomTomTrackingService {
  constructor() {
    this.apiKey = process.env.TOMTOM_API_KEY;
    this.baseUrl = process.env.TOMTOM_API_URL || 'https://api.tomtom.com';

    if (!this.apiKey) {
      console.warn('[TomTom] API Key not configured - Premium tracking disabled');
    }

    // Timeout et retry configuration
    this.timeout = 15000; // 15 seconds
    this.maxRetries = 3;
  }

  /**
   * Verifie si TomTom est configure
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Calcule un itineraire avec trafic temps reel
   *
   * @param {Object} origin - Point de depart { lat, lng }
   * @param {Object} destination - Point d'arrivee { lat, lng }
   * @param {Object} options - Options supplementaires
   * @returns {Promise<Object>} Route calculee
   */
  async calculateRoute(origin, destination, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const url = `${this.baseUrl}/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json`;

      const params = {
        key: this.apiKey,
        traffic: true, // Include traffic
        travelMode: options.travelMode || 'truck', // truck, car, van
        vehicleMaxSpeed: options.maxSpeed || 90, // km/h
        vehicleWeight: options.weight || 12000, // kg
        vehicleAxleWeight: options.axleWeight || 2000, // kg
        vehicleLength: options.length || 7.5, // meters
        vehicleWidth: options.width || 2.4, // meters
        vehicleHeight: options.height || 3.5, // meters
        avoid: options.avoid || ['unpavedRoads'], // Options: ferries, tollRoads, motorways
        routeType: 'fastest', // fastest, shortest, eco, thrilling
        departAt: options.departAt || 'now'
      };

      const response = await axios.get(url, {
        params,
        timeout: this.timeout
      });

      return this._parseRouteResponse(response.data);
    } catch (error) {
      console.error('[TomTom] Calculate route error:', error.message);
      throw new Error(`TomTom route calculation failed: ${error.message}`);
    }
  }

  /**
   * Calcule l'ETA (Estimated Time of Arrival) avec trafic
   *
   * @param {Object} currentPosition - Position actuelle { lat, lng }
   * @param {Object} destination - Destination { lat, lng }
   * @param {Object} metadata - Metadata (orderId, vehicleId)
   * @returns {Promise<Object>} ETA et distance
   */
  async calculateETA(currentPosition, destination, metadata = {}) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const route = await this.calculateRoute(currentPosition, destination);

      const eta = {
        orderId: metadata.orderId,
        vehicleId: metadata.vehicleId,
        currentPosition,
        destination,
        distanceMeters: route.distanceMeters,
        distanceKm: Math.round(route.distanceMeters / 1000),
        travelTimeSeconds: route.travelTimeSeconds,
        travelTimeMinutes: Math.round(route.travelTimeSeconds / 60),
        trafficDelaySeconds: route.trafficDelaySeconds,
        trafficDelayMinutes: Math.round(route.trafficDelaySeconds / 60),
        estimatedArrival: new Date(Date.now() + route.travelTimeSeconds * 1000).toISOString(),
        calculatedAt: new Date().toISOString()
      };

      // Detecter retard potentiel
      if (metadata.expectedArrival) {
        const expectedTime = new Date(metadata.expectedArrival).getTime();
        const estimatedTime = new Date(eta.estimatedArrival).getTime();
        const delayMinutes = Math.round((estimatedTime - expectedTime) / 60000);

        eta.delayDetected = delayMinutes > 15; // Retard si >15min
        eta.delayMinutes = delayMinutes;
      }

      return eta;
    } catch (error) {
      console.error('[TomTom] Calculate ETA error:', error.message);
      throw new Error(`TomTom ETA calculation failed: ${error.message}`);
    }
  }

  /**
   * Geocode une adresse en coordonnees GPS
   *
   * @param {string} address - Adresse complete
   * @param {Object} options - Options (country, limit)
   * @returns {Promise<Object>} Coordonnees { lat, lng }
   */
  async geocodeAddress(address, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const url = `${this.baseUrl}/search/2/geocode/${encodeURIComponent(address)}.json`;

      const params = {
        key: this.apiKey,
        limit: options.limit || 1,
        countrySet: options.country || 'FR', // France par defaut
        language: 'fr-FR'
      };

      const response = await axios.get(url, {
        params,
        timeout: this.timeout
      });

      if (!response.data.results || response.data.results.length === 0) {
        throw new Error('Address not found');
      }

      const result = response.data.results[0];

      return {
        address: result.address.freeformAddress,
        coordinates: {
          lat: result.position.lat,
          lng: result.position.lon
        },
        confidence: result.score,
        type: result.type,
        country: result.address.country,
        postalCode: result.address.postalCode,
        city: result.address.municipality
      };
    } catch (error) {
      console.error('[TomTom] Geocode error:', error.message);
      throw new Error(`TomTom geocoding failed: ${error.message}`);
    }
  }

  /**
   * Reverse geocode: coordonnees -> adresse
   *
   * @param {Object} position - Position { lat, lng }
   * @returns {Promise<Object>} Adresse
   */
  async reverseGeocode(position) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const url = `${this.baseUrl}/search/2/reverseGeocode/${position.lat},${position.lng}.json`;

      const params = {
        key: this.apiKey,
        language: 'fr-FR'
      };

      const response = await axios.get(url, {
        params,
        timeout: this.timeout
      });

      if (!response.data.addresses || response.data.addresses.length === 0) {
        throw new Error('No address found for coordinates');
      }

      const address = response.data.addresses[0].address;

      return {
        formattedAddress: address.freeformAddress,
        street: address.streetName,
        streetNumber: address.streetNumber,
        postalCode: address.postalCode,
        city: address.municipality,
        country: address.country,
        coordinates: position
      };
    } catch (error) {
      console.error('[TomTom] Reverse geocode error:', error.message);
      throw new Error(`TomTom reverse geocoding failed: ${error.message}`);
    }
  }

  /**
   * Obtenir informations trafic sur un trajet
   *
   * @param {Object} origin - Depart
   * @param {Object} destination - Arrivee
   * @returns {Promise<Object>} Etat du trafic
   */
  async getTrafficInfo(origin, destination) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const route = await this.calculateRoute(origin, destination);

      return {
        trafficState: route.trafficDelaySeconds > 300 ? 'heavy' :
                      route.trafficDelaySeconds > 120 ? 'moderate' : 'light',
        delaySeconds: route.trafficDelaySeconds,
        delayMinutes: Math.round(route.trafficDelaySeconds / 60),
        freeFlowTime: route.travelTimeSeconds - route.trafficDelaySeconds,
        currentTime: route.travelTimeSeconds,
        impactPercentage: Math.round((route.trafficDelaySeconds / route.travelTimeSeconds) * 100)
      };
    } catch (error) {
      console.error('[TomTom] Traffic info error:', error.message);
      throw new Error(`TomTom traffic info failed: ${error.message}`);
    }
  }

  /**
   * Demarrer tracking pour une commande
   *
   * @param {string} orderId - ID commande
   * @param {string} vehicleId - ID vehicule
   * @param {Object} route - Itineraire (origin, destination)
   * @returns {Promise<Object>} Session tracking
   */
  async startTracking(orderId, vehicleId, route) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      // Calculer itineraire initial
      const calculatedRoute = await this.calculateRoute(route.origin, route.destination);

      // Creer session tracking
      const trackingSession = {
        orderId,
        vehicleId,
        status: 'active',
        route: calculatedRoute,
        startedAt: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        positions: []
      };

      console.log(`[TomTom] Tracking started for order ${orderId}, vehicle ${vehicleId}`);

      return trackingSession;
    } catch (error) {
      console.error('[TomTom] Start tracking error:', error.message);
      throw new Error(`TomTom start tracking failed: ${error.message}`);
    }
  }

  /**
   * Mettre a jour position tracking
   *
   * @param {string} orderId - ID commande
   * @param {Object} position - Position actuelle { lat, lng }
   * @param {Object} destination - Destination
   * @returns {Promise<Object>} Update result avec ETA
   */
  async updateTracking(orderId, position, destination) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      // Recalculer ETA avec position actuelle
      const eta = await this.calculateETA(position, destination, { orderId });

      const update = {
        orderId,
        position,
        eta,
        updatedAt: new Date().toISOString()
      };

      console.log(`[TomTom] Position updated for order ${orderId}, ETA: ${eta.travelTimeMinutes}min`);

      return update;
    } catch (error) {
      console.error('[TomTom] Update tracking error:', error.message);
      throw new Error(`TomTom update tracking failed: ${error.message}`);
    }
  }

  /**
   * Arreter tracking pour une commande
   *
   * @param {string} orderId - ID commande
   * @returns {Promise<Object>} Stop confirmation
   */
  async stopTracking(orderId) {
    if (!this.isConfigured()) {
      throw new Error('TomTom API Key not configured');
    }

    try {
      const result = {
        orderId,
        status: 'stopped',
        stoppedAt: new Date().toISOString()
      };

      console.log(`[TomTom] Tracking stopped for order ${orderId}`);

      return result;
    } catch (error) {
      console.error('[TomTom] Stop tracking error:', error.message);
      throw new Error(`TomTom stop tracking failed: ${error.message}`);
    }
  }

  /**
   * Parse response TomTom API
   * @private
   */
  _parseRouteResponse(data) {
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    const summary = route.summary;

    return {
      distanceMeters: summary.lengthInMeters,
      travelTimeSeconds: summary.travelTimeInSeconds,
      trafficDelaySeconds: summary.trafficDelayInSeconds || 0,
      departureTime: summary.departureTime,
      arrivalTime: summary.arrivalTime,
      legs: route.legs?.map(leg => ({
        summary: leg.summary,
        points: leg.points
      }))
    };
  }
}

// Export singleton instance
const tomtomService = new TomTomTrackingService();

module.exports = tomtomService;
module.exports.TomTomTrackingService = TomTomTrackingService;
