import { BaseEntity } from './common.js';

// Contract Types
export enum ContractType {
  ECMR = 'ECMR', // Electronic Consignment Note
  TRANSPORT = 'TRANSPORT',
  SERVICE = 'SERVICE',
  NDA = 'NDA', // Non-Disclosure Agreement
  CUSTOM = 'CUSTOM',
}

export enum ContractStatus {
  DRAFT = 'DRAFT',
  PENDING_SIGNATURES = 'PENDING_SIGNATURES',
  PARTIALLY_SIGNED = 'PARTIALLY_SIGNED',
  FULLY_SIGNED = 'FULLY_SIGNED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum SignatureStatus {
  PENDING = 'PENDING',
  SIGNED = 'SIGNED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export enum SignatureType {
  SIMPLE = 'SIMPLE', // Simple electronic signature
  ADVANCED = 'ADVANCED', // Advanced electronic signature
  QUALIFIED = 'QUALIFIED', // Qualified electronic signature (eIDAS)
}

// Contract Party
export interface ContractParty {
  id: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  email: string;
  phone?: string;
  company?: {
    name: string;
    vatNumber?: string;
    registrationNumber?: string;
    address: string;
  };
  role: 'SENDER' | 'RECEIVER' | 'CARRIER' | 'WITNESS' | 'APPROVER';
  signatureRequired: boolean;
  signatureOrder?: number; // For sequential signing
}

// Contract Template
export interface ContractTemplate extends BaseEntity {
  name: string;
  type: ContractType;
  description: string;
  content: string; // HTML or Markdown content
  variables: TemplateVariable[];
  isActive: boolean;
  createdBy: string;
  version: string;
}

export interface TemplateVariable {
  name: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT';
  required: boolean;
  defaultValue?: any;
  options?: string[]; // For SELECT type
}

// Contract
export interface Contract extends BaseEntity {
  contractNumber: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  templateId?: string;

  // Parties involved
  parties: ContractParty[];

  // Content
  content: string; // Final contract content (HTML/PDF)
  variables?: Record<string, any>; // Template variables filled

  // Dates
  effectiveDate: Date;
  expirationDate?: Date;

  // Workflow
  signingWorkflowId: string;
  isSequentialSigning: boolean; // true = parties sign in order, false = parallel

  // Files
  files: ContractFile[];
  finalDocumentUrl?: string; // URL to signed PDF

  // Metadata
  createdBy: string;
  metadata?: Record<string, any>;
}

export interface ContractFile {
  id: string;
  name: string;
  url: string;
  type: string; // mime type
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
}

// Signature
export interface Signature extends BaseEntity {
  contractId: string;
  workflowId: string;

  // Signer info
  signerId: string; // userId or partyId
  signerName: string;
  signerEmail: string;

  // Signature details
  status: SignatureStatus;
  type: SignatureType;
  signedAt?: Date;
  declinedAt?: Date;
  declineReason?: string;

  // Signature data
  signatureData?: string; // Base64 encoded signature image
  ipAddress?: string;
  userAgent?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };

  // Verification
  certificate?: string; // For qualified signatures
  timestamp?: string; // Trusted timestamp

  // Notifications
  reminderSentAt?: Date;
  expiresAt?: Date;
}

// Signing Workflow
export interface SigningWorkflow extends BaseEntity {
  contractId: string;
  name: string;

  // Workflow configuration
  isSequential: boolean;
  currentStep: number;
  totalSteps: number;

  // Steps
  steps: WorkflowStep[];

  // Status
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  // Notifications
  reminderIntervalDays: number;
  expirationDays: number;
}

export interface WorkflowStep {
  order: number;
  partyId: string;
  partyName: string;
  partyEmail: string;
  signatureId?: string;
  status: SignatureStatus;
  notifiedAt?: Date;
  completedAt?: Date;
}

// Audit Log
export interface ContractAuditLog extends BaseEntity {
  contractId: string;
  action: string;
  actor: string;
  actorType: 'USER' | 'SYSTEM';
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}
