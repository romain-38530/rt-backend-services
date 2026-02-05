/**
 * Vehizen Connector
 *
 * Connecteur pour l'API Vehizen - Récupération du kilométrage réel des véhicules
 * Documentation: https://api.vehizen.com/docs
 */

const axios = require('axios');

class VechizenConnector {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseUrl = config.baseUrl || 'https://api.vehizen.com/v1';
    this.organizationId = config.organizationId;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Rate limiting
    this.requestQueue = [];
    this.isProcessing = false;
    this.requestsPerSecond = 5;
    this.lastRequestTime = 0;

    // Intercepteur pour authentification
    this.client.interceptors.request.use((config) => {
      config.headers['X-API-Key'] = this.apiKey;
      config.headers['X-API-Secret'] = this.apiSecret;
      return config;
    });

    // Intercepteur pour logging
    this.client.interceptors.response.use(
      (response) => {
        console.log(`[VEHIZEN] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        return response;
      },
      (error) => {
        console.error(`[VEHIZEN] Error: ${error.message}`, {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });
        throw error;
      }
    );
  }

  /**
   * Rate-limited request execution
   */
  async executeWithRateLimit(requestFn) {
    const now = Date.now();
    const minInterval = 1000 / this.requestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    return requestFn();
  }

  /**
   * Récupère tous les véhicules du compte
   */
  async getVehicles(options = {}) {
    const { page = 1, limit = 100, updatedSince } = options;

    const params = { page, limit };
    if (updatedSince) {
      params.updated_since = updatedSince.toISOString();
    }

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get('/vehicles', { params });
      return {
        vehicles: response.data.data || response.data.vehicles || [],
        pagination: response.data.pagination || {
          page,
          limit,
          total: response.data.total || 0,
          hasMore: response.data.hasMore || false,
        },
      };
    });
  }

  /**
   * Récupère un véhicule par ID
   */
  async getVehicle(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}`);
      return response.data;
    });
  }

  /**
   * Récupère un véhicule par immatriculation
   */
  async getVehicleByLicensePlate(licensePlate) {
    const normalizedPlate = licensePlate.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get('/vehicles', {
        params: { license_plate: normalizedPlate },
      });
      const vehicles = response.data.data || response.data.vehicles || [];
      return vehicles.length > 0 ? vehicles[0] : null;
    });
  }

  /**
   * Récupère le kilométrage actuel d'un véhicule
   */
  async getCurrentMileage(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/mileage/current`);
      return {
        vehicleId,
        mileage: response.data.mileage || response.data.odometer,
        recordedAt: response.data.recorded_at || response.data.timestamp,
        source: 'vehizen',
        location: response.data.location,
      };
    });
  }

  /**
   * Récupère l'historique du kilométrage d'un véhicule
   */
  async getMileageHistory(vehicleId, options = {}) {
    const { from, to, limit = 100 } = options;

    const params = { limit };
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/mileage/history`, { params });
      return {
        vehicleId,
        records: (response.data.data || response.data.records || []).map(r => ({
          mileage: r.mileage || r.odometer,
          recordedAt: r.recorded_at || r.timestamp,
          source: 'vehizen',
          context: r.context || r.event_type,
          location: r.location,
          tripId: r.trip_id,
          driverId: r.driver_id,
        })),
        pagination: response.data.pagination,
      };
    });
  }

  /**
   * Récupère le kilométrage de tous les véhicules (batch)
   */
  async getAllVehiclesMileage(vehicleIds = null) {
    return this.executeWithRateLimit(async () => {
      const params = {};
      if (vehicleIds && vehicleIds.length > 0) {
        params.vehicle_ids = vehicleIds.join(',');
      }

      const response = await this.client.get('/mileage/current', { params });
      return (response.data.data || response.data.vehicles || []).map(v => ({
        vehicleId: v.vehicle_id || v.id,
        licensePlate: v.license_plate,
        mileage: v.mileage || v.odometer,
        recordedAt: v.recorded_at || v.timestamp,
        source: 'vehizen',
      }));
    });
  }

  /**
   * Récupère les trajets récents d'un véhicule
   */
  async getTrips(vehicleId, options = {}) {
    const { from, to, limit = 50 } = options;

    const params = { limit };
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/trips`, { params });
      return {
        vehicleId,
        trips: (response.data.data || response.data.trips || []).map(t => ({
          tripId: t.id || t.trip_id,
          startTime: t.start_time || t.started_at,
          endTime: t.end_time || t.ended_at,
          startMileage: t.start_mileage || t.odometer_start,
          endMileage: t.end_mileage || t.odometer_end,
          distance: t.distance,
          duration: t.duration,
          startLocation: t.start_location,
          endLocation: t.end_location,
          driverId: t.driver_id,
          driverName: t.driver_name,
          fuelConsumption: t.fuel_consumption,
          avgSpeed: t.avg_speed,
        })),
      };
    });
  }

  /**
   * Récupère la position actuelle d'un véhicule
   */
  async getCurrentPosition(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/position`);
      return {
        vehicleId,
        position: {
          lat: response.data.latitude || response.data.lat,
          lng: response.data.longitude || response.data.lng,
          heading: response.data.heading,
          speed: response.data.speed,
        },
        address: response.data.address,
        timestamp: response.data.timestamp,
        ignition: response.data.ignition,
      };
    });
  }

  /**
   * Récupère les alertes d'un véhicule (pannes, entretiens)
   */
  async getAlerts(vehicleId, options = {}) {
    const { status, type, limit = 50 } = options;

    const params = { limit };
    if (status) params.status = status;
    if (type) params.type = type;

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/alerts`, { params });
      return (response.data.data || response.data.alerts || []).map(a => ({
        alertId: a.id || a.alert_id,
        type: a.type || a.alert_type,
        severity: a.severity,
        message: a.message || a.description,
        triggeredAt: a.triggered_at || a.created_at,
        acknowledgedAt: a.acknowledged_at,
        resolvedAt: a.resolved_at,
        mileageAtAlert: a.mileage,
        data: a.data || a.details,
      }));
    });
  }

  /**
   * Récupère les données du conducteur actuel
   */
  async getCurrentDriver(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/driver`);
      if (!response.data || !response.data.driver_id) return null;

      return {
        driverId: response.data.driver_id,
        name: response.data.name || response.data.driver_name,
        cardNumber: response.data.card_number,
        assignedAt: response.data.assigned_at,
      };
    });
  }

  /**
   * Récupère les données du chronotachygraphe
   */
  async getTachographData(vehicleId, options = {}) {
    const { from, to } = options;

    const params = {};
    if (from) params.from = from.toISOString();
    if (to) params.to = to.toISOString();

    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/tachograph`, { params });
      return {
        vehicleId,
        deviceInfo: {
          serialNumber: response.data.serial_number,
          brand: response.data.brand,
          model: response.data.model,
          softwareVersion: response.data.software_version,
        },
        calibration: {
          date: response.data.calibration_date,
          expiryDate: response.data.calibration_expiry,
          constantW: response.data.constant_w,
          coefficientK: response.data.coefficient_k,
          circumferenceL: response.data.circumference_l,
        },
        lastDownload: response.data.last_download,
        driverActivities: response.data.driver_activities || [],
      };
    });
  }

  /**
   * Récupère les données du limiteur de vitesse
   */
  async getSpeedLimiterData(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/speed-limiter`);
      return {
        vehicleId,
        isActive: response.data.is_active,
        limitedSpeed: response.data.limited_speed,
        lastVerification: response.data.last_verification,
        nextVerificationDue: response.data.next_verification_due,
        sealNumber: response.data.seal_number,
        isConform: response.data.is_conform,
      };
    });
  }

  /**
   * Récupère les prochains entretiens planifiés
   */
  async getMaintenanceSchedule(vehicleId) {
    return this.executeWithRateLimit(async () => {
      const response = await this.client.get(`/vehicles/${vehicleId}/maintenance/schedule`);
      return (response.data.data || response.data.schedule || []).map(m => ({
        maintenanceId: m.id,
        type: m.type,
        description: m.description,
        dueDate: m.due_date,
        dueMileage: m.due_mileage,
        priority: m.priority,
        estimatedCost: m.estimated_cost,
        lastPerformed: m.last_performed,
      }));
    });
  }

  /**
   * Test de connexion à l'API
   */
  async testConnection() {
    try {
      const response = await this.client.get('/ping');
      return {
        success: true,
        message: 'Connexion Vehizen établie',
        apiVersion: response.data.version,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        message: `Erreur de connexion Vehizen: ${error.message}`,
        error: error.response?.data || error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Transforme les données véhicule Vehizen vers format interne
   */
  transformVehicle(vechizenVehicle) {
    return {
      vechizenId: vechizenVehicle.id || vechizenVehicle.vehicle_id,
      licensePlate: (vechizenVehicle.license_plate || vechizenVehicle.registration)?.replace(/[^A-Z0-9]/gi, '').toUpperCase(),
      vin: vechizenVehicle.vin,
      brand: vechizenVehicle.brand || vechizenVehicle.make,
      model: vechizenVehicle.model,
      year: vechizenVehicle.year || vechizenVehicle.registration_year,
      vehicleType: this.mapVehicleType(vechizenVehicle.type || vechizenVehicle.category),

      // Kilométrage
      currentMileage: vechizenVehicle.current_mileage || vechizenVehicle.odometer,
      mileageUpdatedAt: vechizenVehicle.mileage_updated_at,

      // Technique
      fuelType: this.mapFuelType(vechizenVehicle.fuel_type),
      enginePower: vechizenVehicle.engine_power,
      ptac: vechizenVehicle.gross_weight || vechizenVehicle.ptac,
      payload: vechizenVehicle.payload,
      axles: vechizenVehicle.axles,

      // Statut
      status: this.mapStatus(vechizenVehicle.status),
      isActive: vechizenVehicle.is_active !== false,

      // Position
      lastPosition: vechizenVehicle.last_position ? {
        lat: vechizenVehicle.last_position.lat,
        lng: vechizenVehicle.last_position.lng,
        address: vechizenVehicle.last_position.address,
        timestamp: vechizenVehicle.last_position.timestamp,
      } : null,

      // Équipements
      equipment: {
        hasTachograph: vechizenVehicle.has_tachograph !== false,
        tachographType: vechizenVehicle.tachograph_type,
        hasSpeedLimiter: vechizenVehicle.has_speed_limiter,
        hasGps: vechizenVehicle.has_gps !== false,
      },

      // Métadonnées
      _vechizenRawData: vechizenVehicle,
      syncedAt: new Date(),
    };
  }

  mapVehicleType(type) {
    const mapping = {
      'truck': 'truck',
      'tractor': 'tractor',
      'van': 'van',
      'trailer': 'trailer',
      'semi_trailer': 'semi_trailer',
    };
    return mapping[type?.toLowerCase()] || 'other';
  }

  mapFuelType(fuel) {
    const mapping = {
      'diesel': 'diesel',
      'gasoline': 'essence',
      'petrol': 'essence',
      'electric': 'electrique',
      'hybrid': 'hybride',
      'cng': 'gnv',
      'lng': 'gnl',
    };
    return mapping[fuel?.toLowerCase()] || fuel;
  }

  mapStatus(status) {
    const mapping = {
      'active': 'active',
      'inactive': 'inactive',
      'maintenance': 'maintenance',
      'repair': 'maintenance',
      'out_of_service': 'hors_service',
    };
    return mapping[status?.toLowerCase()] || 'active';
  }
}

// Factory function
function createVechizenConnector(connection) {
  if (!connection?.config?.apiKey) {
    throw new Error('Configuration Vehizen manquante: apiKey requis');
  }

  return new VechizenConnector({
    apiKey: connection.config.apiKey,
    apiSecret: connection.config.apiSecret,
    baseUrl: connection.config.baseUrl,
    organizationId: connection.organizationId,
  });
}

module.exports = {
  VechizenConnector,
  createVechizenConnector,
};
