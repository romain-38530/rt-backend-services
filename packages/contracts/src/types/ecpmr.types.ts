import { BaseEntity } from './common.js';

export enum ECMRStatus {
  DRAFT = 'DRAFT',
  PENDING_SIGNATURE = 'PENDING_SIGNATURE',
  SIGNED = 'SIGNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ECMRSignatureType {
  SENDER = 'SENDER',
  CARRIER = 'CARRIER',
  RECEIVER = 'RECEIVER',
}

export enum AttachmentType {
  PHOTO = 'PHOTO',
  DOCUMENT = 'DOCUMENT',
  SIGNATURE = 'SIGNATURE',
  DAMAGE_REPORT = 'DAMAGE_REPORT',
}

export interface ECMR extends BaseEntity {
  cmrNumber: string;
  orderId: string;
  status: ECMRStatus;

  // Sender information
  sender: PartyInfo;

  // Carrier information
  carrier: PartyInfo;

  // Receiver information
  receiver: PartyInfo;

  // Cargo information
  cargo: CargoInfo[];

  // Transport details
  vehicleRegistration?: string;
  driverId?: string;
  trailerRegistration?: string;

  // Dates
  pickupDate: Date;
  deliveryDate?: Date;

  // Signatures
  signatures: ECMRSignature[];

  // Attachments (photos, documents)
  attachments: Attachment[];

  // Special instructions
  instructions?: string;
  remarks?: string;

  // Conditions
  goodsCondition?: string;
  packagingCondition?: string;

  metadata?: Record<string, any>;
}

export interface PartyInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface CargoInfo {
  description: string;
  packageType: string; // Pallet, Box, Container, etc.
  quantity: number;
  weight: number; // in kg
  volume?: number; // in m³
  length?: number; // in cm
  width?: number; // in cm
  height?: number; // in cm
  value?: number; // goods value
  currency?: string;
  dangerousGoods?: boolean;
  unNumber?: string; // UN number for dangerous goods
  remarks?: string;
}

export interface ECMRSignature {
  type: ECMRSignatureType;
  signedBy: string;
  signedAt: Date;
  signatureData: string; // Base64 encoded signature image
  location?: {
    latitude: number;
    longitude: number;
  };
  ipAddress?: string;
}

export interface Attachment {
  id: string;
  type: AttachmentType;
  filename: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number; // in bytes
  uploadedAt: Date;
  uploadedBy: string;
  description?: string;
}

export interface CreateECMRRequest {
  orderId: string;
  sender: PartyInfo;
  carrier: PartyInfo;
  receiver: PartyInfo;
  cargo: CargoInfo[];
  vehicleRegistration?: string;
  driverId?: string;
  trailerRegistration?: string;
  pickupDate: Date;
  instructions?: string;
}

export interface UpdateECMRRequest {
  status?: ECMRStatus;
  cargo?: CargoInfo[];
  vehicleRegistration?: string;
  driverId?: string;
  trailerRegistration?: string;
  pickupDate?: Date;
  deliveryDate?: Date;
  instructions?: string;
  remarks?: string;
  goodsCondition?: string;
  packagingCondition?: string;
}

export interface SignECMRRequest {
  ecmrId: string;
  type: ECMRSignatureType;
  signedBy: string;
  signatureData: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface AddAttachmentRequest {
  ecmrId: string;
  type: AttachmentType;
  filename: string;
  fileUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  description?: string;
}

export interface ECMRSearchCriteria {
  orderId?: string;
  status?: ECMRStatus;
  cmrNumber?: string;
  driverId?: string;
  startDate?: Date;
  endDate?: Date;
}
