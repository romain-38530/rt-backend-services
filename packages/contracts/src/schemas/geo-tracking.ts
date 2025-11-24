import { z } from 'zod';
import { VehicleStatus } from '../types/geo-tracking.types.js';

const geoPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional(),
  accuracy: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
});

export const createTrackingSchema = z.object({
  vehicleId: z.string(),
  driverId: z.string().optional(),
  orderId: z.string().optional(),
  position: geoPositionSchema,
  vehicleStatus: z.nativeEnum(VehicleStatus).optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  fuel: z.number().min(0).optional(),
  odometer: z.number().min(0).optional(),
});

export const updatePositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().optional(),
  accuracy: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  timestamp: z.coerce.date().optional(),
});

export const createGeofenceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(['circle', 'polygon']),
  center: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  radius: z.number().min(0).optional(),
  polygon: z.array(geoPositionSchema).optional(),
  triggers: z
    .array(
      z.object({
        event: z.enum(['enter', 'exit', 'dwell']),
        actions: z.array(z.string()),
      })
    )
    .optional(),
});

export const routeRequestSchema = z.object({
  origin: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  destination: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  waypoints: z
    .array(
      z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
    )
    .optional(),
  optimizeWaypoints: z.boolean().optional(),
});

export type CreateTrackingInput = z.infer<typeof createTrackingSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
export type CreateGeofenceInput = z.infer<typeof createGeofenceSchema>;
export type RouteRequestInput = z.infer<typeof routeRequestSchema>;
