import { z } from 'zod';
import {
  OrderType,
  OrderPriority,
  OrderStatus,
  TransportType,
  VehicleType,
  LoadType,
} from '../enums/index.js';

const geoLocationSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(2).max(2),
  region: z.string().optional(),
  location: geoLocationSchema.optional(),
});

const contactInfoSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
});

const timeRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

const locationDetailsSchema = z.object({
  address: addressSchema,
  contact: contactInfoSchema,
  timeWindow: timeRangeSchema.optional(),
  instructions: z.string().optional(),
});

const cargoDetailsSchema = z.object({
  description: z.string().min(1),
  loadType: z.nativeEnum(LoadType),
  quantity: z.number().positive(),
  weight: z.number().positive(),
  volume: z.number().positive().optional(),
  dimensions: z
    .object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .optional(),
  isFragile: z.boolean().default(false),
  isPerishable: z.boolean().default(false),
  requiresRefrigeration: z.boolean().default(false),
  temperature: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
});

const transportDetailsSchema = z.object({
  type: z.nativeEnum(TransportType),
  vehicleType: z.nativeEnum(VehicleType),
  requiresInsurance: z.boolean().default(false),
  requiresTracking: z.boolean().default(true),
  specialInstructions: z.string().optional(),
});

export const createOrderSchema = z.object({
  type: z.nativeEnum(OrderType),
  priority: z.nativeEnum(OrderPriority).default(OrderPriority.MEDIUM),
  transport: transportDetailsSchema.optional(),
  pickup: locationDetailsSchema,
  delivery: locationDetailsSchema,
  cargo: z.array(cargoDetailsSchema).min(1),
  scheduledPickupAt: z.coerce.date().optional(),
  scheduledDeliveryAt: z.coerce.date().optional(),
  notes: z.string().optional(),
});

export const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  priority: z.nativeEnum(OrderPriority).optional(),
  pickup: locationDetailsSchema.optional(),
  delivery: locationDetailsSchema.optional(),
  cargo: z.array(cargoDetailsSchema).optional(),
  assignedDriverId: z.string().optional(),
  assignedVehicleId: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
});

export const orderListQuerySchema = z.object({
  status: z.array(z.nativeEnum(OrderStatus)).optional(),
  type: z.array(z.nativeEnum(OrderType)).optional(),
  clientId: z.string().optional(),
  driverId: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  search: z.string().optional(),
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
