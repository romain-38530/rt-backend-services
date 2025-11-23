import { BaseEntity } from './common.js';

export enum TrackingStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  LOST_SIGNAL = 'LOST_SIGNAL',
  OFFLINE = 'OFFLINE',
}

export enum VehicleStatus {
  IDLE = 'IDLE',
  IN_TRANSIT = 'IN_TRANSIT',
  LOADING = 'LOADING',
  UNLOADING = 'UNLOADING',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

export interface GeoPosition {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number; // in meters
  heading?: number; // in degrees (0-360)
  speed?: number; // in km/h
  timestamp: Date;
}

export interface VehicleTracking extends BaseEntity {
  vehicleId: string;
  driverId?: string;
  orderId?: string;
  currentPosition: GeoPosition;
  trackingStatus: TrackingStatus;
  vehicleStatus: VehicleStatus;
  batteryLevel?: number; // percentage
  fuel?: number; // percentage or liters
  odometer?: number; // km
  lastUpdate: Date;
  metadata?: Record<string, any>;
}

export interface TrackingHistory extends BaseEntity {
  vehicleId: string;
  positions: GeoPosition[];
  startTime: Date;
  endTime?: Date;
  totalDistance?: number; // in km
  averageSpeed?: number; // in km/h
  orderId?: string;
}

export interface Geofence extends BaseEntity {
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  // For circle
  center?: GeoPosition;
  radius?: number; // in meters
  // For polygon
  polygon?: GeoPosition[];
  enabled: boolean;
  triggers?: GeofenceTrigger[];
}

export interface GeofenceTrigger {
  event: 'enter' | 'exit' | 'dwell';
  actions: string[]; // notification IDs, webhook URLs, etc.
}

export interface GeofenceEvent extends BaseEntity {
  geofenceId: string;
  vehicleId: string;
  driverId?: string;
  event: 'enter' | 'exit' | 'dwell';
  position: GeoPosition;
  timestamp: Date;
}

export interface Route {
  origin: GeoPosition;
  destination: GeoPosition;
  waypoints?: GeoPosition[];
  distance?: number; // in km
  duration?: number; // in minutes
  estimatedArrival?: Date;
  polyline?: string; // encoded polyline
}

export interface CreateTrackingRequest {
  vehicleId: string;
  driverId?: string;
  orderId?: string;
  position: {
    latitude: number;
    longitude: number;
    altitude?: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
  };
  vehicleStatus?: VehicleStatus;
  batteryLevel?: number;
  fuel?: number;
  odometer?: number;
}

export interface UpdatePositionRequest {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  timestamp?: Date;
}

export interface CreateGeofenceRequest {
  name: string;
  description?: string;
  type: 'circle' | 'polygon';
  center?: {
    latitude: number;
    longitude: number;
  };
  radius?: number;
  polygon?: Array<{
    latitude: number;
    longitude: number;
  }>;
  triggers?: GeofenceTrigger[];
}

export interface RouteRequest {
  origin: {
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  waypoints?: Array<{
    latitude: number;
    longitude: number;
  }>;
  optimizeWaypoints?: boolean;
}
