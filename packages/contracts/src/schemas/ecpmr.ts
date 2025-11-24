import { z } from 'zod';
import { ECMRStatus, ECMRSignatureType, AttachmentType } from '../types/ecpmr.types.js';

const partyInfoSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  city: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().length(2), // ISO country code
  contactName: z.string().max(100).optional(),
  contactPhone: z.string().max(30).optional(),
  contactEmail: z.string().email().optional(),
});

const cargoInfoSchema = z.object({
  description: z.string().min(1).max(500),
  packageType: z.string().min(1).max(50),
  quantity: z.number().int().min(1),
  weight: z.number().min(0),
  volume: z.number().min(0).optional(),
  length: z.number().min(0).optional(),
  width: z.number().min(0).optional(),
  height: z.number().min(0).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().length(3).optional(), // ISO currency code
  dangerousGoods: z.boolean().optional(),
  unNumber: z.string().optional(),
  remarks: z.string().max(500).optional(),
});

export const createECMRSchema = z.object({
  orderId: z.string(),
  sender: partyInfoSchema,
  carrier: partyInfoSchema,
  receiver: partyInfoSchema,
  cargo: z.array(cargoInfoSchema).min(1),
  vehicleRegistration: z.string().max(20).optional(),
  driverId: z.string().optional(),
  trailerRegistration: z.string().max(20).optional(),
  pickupDate: z.coerce.date(),
  instructions: z.string().max(1000).optional(),
});

export const updateECMRSchema = z.object({
  status: z.nativeEnum(ECMRStatus).optional(),
  cargo: z.array(cargoInfoSchema).optional(),
  vehicleRegistration: z.string().max(20).optional(),
  driverId: z.string().optional(),
  trailerRegistration: z.string().max(20).optional(),
  pickupDate: z.coerce.date().optional(),
  deliveryDate: z.coerce.date().optional(),
  instructions: z.string().max(1000).optional(),
  remarks: z.string().max(1000).optional(),
  goodsCondition: z.string().max(500).optional(),
  packagingCondition: z.string().max(500).optional(),
});

export const signECMRSchema = z.object({
  ecmrId: z.string(),
  type: z.nativeEnum(ECMRSignatureType),
  signedBy: z.string().min(1).max(100),
  signatureData: z.string().min(1), // Base64 encoded signature
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).optional(),
});

export const addAttachmentSchema = z.object({
  ecmrId: z.string(),
  type: z.nativeEnum(AttachmentType),
  filename: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  mimeType: z.string().min(1),
  fileSize: z.number().int().min(0),
  uploadedBy: z.string(),
  description: z.string().max(500).optional(),
});

export const ecmrSearchSchema = z.object({
  orderId: z.string().optional(),
  status: z.nativeEnum(ECMRStatus).optional(),
  cmrNumber: z.string().optional(),
  driverId: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type CreateECMRInput = z.infer<typeof createECMRSchema>;
export type UpdateECMRInput = z.infer<typeof updateECMRSchema>;
export type SignECMRInput = z.infer<typeof signECMRSchema>;
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>;
export type ECMRSearchInput = z.infer<typeof ecmrSearchSchema>;
