import {
  VehicleTracking,
  TrackingHistory,
  Geofence,
  GeofenceEvent,
  Route,
  CreateTrackingRequest,
  UpdatePositionRequest,
  CreateGeofenceRequest,
  RouteRequest,
  TrackingStatus,
  VehicleStatus,
} from '@rt/contracts';
import { createLogger } from '@rt/utils';
import {
  TrackingRepository,
  TrackingHistoryRepository,
  GeofenceRepository,
  GeofenceEventRepository,
} from '../repositories/tracking.repository.js';

const logger = createLogger('tracking-service');

export class TrackingService {
  constructor(
    private trackingRepo: TrackingRepository,
    private historyRepo: TrackingHistoryRepository,
    private geofenceRepo: GeofenceRepository,
    private geofenceEventRepo: GeofenceEventRepository
  ) {}

  async createTracking(
    request: CreateTrackingRequest
  ): Promise<VehicleTracking> {
    try {
      const tracking: VehicleTracking = {
        _id: `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        vehicleId: request.vehicleId,
        driverId: request.driverId,
        orderId: request.orderId,
        currentPosition: {
          ...request.position,
          timestamp: new Date(),
        },
        trackingStatus: TrackingStatus.ACTIVE,
        vehicleStatus: request.vehicleStatus || VehicleStatus.IDLE,
        batteryLevel: request.batteryLevel,
        fuel: request.fuel,
        odometer: request.odometer,
        lastUpdate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await this.trackingRepo.create(tracking);
      logger.info('Tracking created', { vehicleId: request.vehicleId });

      return created;
    } catch (error: any) {
      logger.error('Failed to create tracking', { error: error.message });
      throw error;
    }
  }

  async updatePosition(
    vehicleId: string,
    request: UpdatePositionRequest
  ): Promise<VehicleTracking | null> {
    try {
      const position = {
        latitude: request.latitude,
        longitude: request.longitude,
        altitude: request.altitude,
        accuracy: request.accuracy,
        heading: request.heading,
        speed: request.speed,
        timestamp: request.timestamp || new Date(),
      };

      // Update current tracking
      await this.trackingRepo.updatePosition(vehicleId, position);

      // Add to history
      await this.historyRepo.addPosition(vehicleId, position);

      // Check geofences
      await this.checkGeofences(vehicleId, position);

      const updated = await this.trackingRepo.findByVehicleId(vehicleId);
      logger.info('Position updated', { vehicleId });

      return updated;
    } catch (error: any) {
      logger.error('Failed to update position', {
        vehicleId,
        error: error.message,
      });
      throw error;
    }
  }

  async getTracking(vehicleId: string): Promise<VehicleTracking | null> {
    return this.trackingRepo.findByVehicleId(vehicleId);
  }

  async getAllActiveTracking(): Promise<VehicleTracking[]> {
    return this.trackingRepo.findActiveTracking();
  }

  async getTrackingByDriver(driverId: string): Promise<VehicleTracking[]> {
    return this.trackingRepo.findByDriverId(driverId);
  }

  async getTrackingByOrder(orderId: string): Promise<VehicleTracking | null> {
    return this.trackingRepo.findByOrderId(orderId);
  }

  async getNearbyVehicles(
    latitude: number,
    longitude: number,
    radiusInMeters: number
  ): Promise<VehicleTracking[]> {
    return this.trackingRepo.findNearby(latitude, longitude, radiusInMeters);
  }

  // Geofence management
  async createGeofence(request: CreateGeofenceRequest): Promise<Geofence> {
    try {
      const geofence: Geofence = {
        _id: `geo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: request.name,
        description: request.description,
        type: request.type,
        center: request.center
          ? {
              latitude: request.center.latitude,
              longitude: request.center.longitude,
              timestamp: new Date(),
            }
          : undefined,
        radius: request.radius,
        polygon: request.polygon?.map((p) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          timestamp: new Date(),
        })),
        enabled: true,
        triggers: request.triggers,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const created = await this.geofenceRepo.create(geofence);
      logger.info('Geofence created', { geofenceId: created._id });

      return created;
    } catch (error: any) {
      logger.error('Failed to create geofence', { error: error.message });
      throw error;
    }
  }

  async getGeofences(): Promise<Geofence[]> {
    return this.geofenceRepo.findMany({});
  }

  async deleteGeofence(id: string): Promise<boolean> {
    return this.geofenceRepo.deleteById(id);
  }

  private async checkGeofences(vehicleId: string, position: any): Promise<void> {
    try {
      const triggeredGeofences = await this.geofenceRepo.checkGeofence(
        position.latitude,
        position.longitude
      );

      for (const geofence of triggeredGeofences) {
        // Create geofence event
        const event: GeofenceEvent = {
          _id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          geofenceId: geofence._id!,
          vehicleId,
          event: 'enter',
          position,
          timestamp: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await this.geofenceEventRepo.create(event);
        logger.info('Geofence triggered', {
          vehicleId,
          geofenceId: geofence._id,
        });

        // TODO: Trigger actions (notifications, webhooks, etc.)
      }
    } catch (error: any) {
      logger.error('Failed to check geofences', { error: error.message });
    }
  }

  // Route calculation
  async calculateRoute(request: RouteRequest): Promise<Route> {
    // TODO: Integrate with routing API (TomTom, Google Maps, etc.)
    logger.info('Calculating route', { request });

    return {
      origin: {
        latitude: request.origin.latitude,
        longitude: request.origin.longitude,
        timestamp: new Date(),
      },
      destination: {
        latitude: request.destination.latitude,
        longitude: request.destination.longitude,
        timestamp: new Date(),
      },
      waypoints: request.waypoints?.map((w) => ({
        latitude: w.latitude,
        longitude: w.longitude,
        timestamp: new Date(),
      })),
      distance: 0,
      duration: 0,
    };
  }

  // History
  async getHistory(
    vehicleId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TrackingHistory[]> {
    return this.historyRepo.findByVehicleId(vehicleId, startDate, endDate);
  }
}
