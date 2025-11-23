import { Collection } from 'mongodb';
import { BaseRepository } from '@rt/data-mongo';
import {
  VehicleTracking,
  TrackingHistory,
  Geofence,
  GeofenceEvent,
  TrackingStatus,
} from '@rt/contracts';

export class TrackingRepository extends BaseRepository<VehicleTracking> {
  constructor(collection: Collection<VehicleTracking>) {
    super(collection);
  }

  async findByVehicleId(vehicleId: string): Promise<VehicleTracking | null> {
    return this.collection.findOne({ vehicleId });
  }

  async findByDriverId(driverId: string): Promise<VehicleTracking[]> {
    return this.collection.find({ driverId }).toArray();
  }

  async findByOrderId(orderId: string): Promise<VehicleTracking | null> {
    return this.collection.findOne({ orderId });
  }

  async findActiveTracking(): Promise<VehicleTracking[]> {
    return this.collection
      .find({ trackingStatus: TrackingStatus.ACTIVE })
      .toArray();
  }

  async findNearby(
    latitude: number,
    longitude: number,
    radiusInMeters: number
  ): Promise<VehicleTracking[]> {
    return this.collection
      .find({
        'currentPosition.latitude': {
          $gte: latitude - radiusInMeters / 111320,
          $lte: latitude + radiusInMeters / 111320,
        },
        'currentPosition.longitude': {
          $gte: longitude - radiusInMeters / (111320 * Math.cos(latitude)),
          $lte: longitude + radiusInMeters / (111320 * Math.cos(latitude)),
        },
      })
      .toArray();
  }

  async updatePosition(
    vehicleId: string,
    position: any,
    updates?: Partial<VehicleTracking>
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { vehicleId },
      {
        $set: {
          currentPosition: { ...position, timestamp: new Date() },
          lastUpdate: new Date(),
          updatedAt: new Date(),
          ...updates,
        },
      }
    );
    return result.modifiedCount > 0;
  }
}

export class TrackingHistoryRepository extends BaseRepository<TrackingHistory> {
  constructor(collection: Collection<TrackingHistory>) {
    super(collection);
  }

  async findByVehicleId(
    vehicleId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<TrackingHistory[]> {
    const query: any = { vehicleId };

    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = startDate;
      if (endDate) query.startTime.$lte = endDate;
    }

    return this.collection.find(query).sort({ startTime: -1 }).toArray();
  }

  async addPosition(vehicleId: string, position: any): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.collection.updateOne(
      {
        vehicleId,
        startTime: { $gte: today },
        endTime: { $exists: false },
      },
      {
        $push: { positions: position },
        $set: { updatedAt: new Date() },
      },
      { upsert: true }
    );

    return result.modifiedCount > 0 || result.upsertedCount > 0;
  }
}

export class GeofenceRepository extends BaseRepository<Geofence> {
  constructor(collection: Collection<Geofence>) {
    super(collection);
  }

  async findActive(): Promise<Geofence[]> {
    return this.collection.find({ enabled: true }).toArray();
  }

  async checkGeofence(
    latitude: number,
    longitude: number
  ): Promise<Geofence[]> {
    const geofences = await this.findActive();
    const triggeredGeofences: Geofence[] = [];

    for (const geofence of geofences) {
      if (geofence.type === 'circle' && geofence.center && geofence.radius) {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          geofence.center.latitude,
          geofence.center.longitude
        );

        if (distance <= geofence.radius) {
          triggeredGeofences.push(geofence);
        }
      }
      // TODO: Implement polygon check
    }

    return triggeredGeofences;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

export class GeofenceEventRepository extends BaseRepository<GeofenceEvent> {
  constructor(collection: Collection<GeofenceEvent>) {
    super(collection);
  }

  async findByGeofence(geofenceId: string): Promise<GeofenceEvent[]> {
    return this.collection
      .find({ geofenceId })
      .sort({ timestamp: -1 })
      .toArray();
  }

  async findByVehicle(vehicleId: string): Promise<GeofenceEvent[]> {
    return this.collection
      .find({ vehicleId })
      .sort({ timestamp: -1 })
      .toArray();
  }
}
