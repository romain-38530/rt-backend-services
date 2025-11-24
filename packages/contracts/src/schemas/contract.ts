import { z } from 'zod';
import {
  ContractType,
  ContractStatus,
  SignatureStatus,
  SignatureType,
} from '../enums/index.js';

// Contract Party Schema
export const contractPartySchema = z.object({
  type: z.enum(['INDIVIDUAL', 'COMPANY']),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z
    .object({
      name: z.string().min(1),
      vatNumber: z.string().optional(),
      registrationNumber: z.string().optional(),
      address: z.string().min(1),
    })
    .optional(),
  role: z.enum(['SENDER', 'RECEIVER', 'CARRIER', 'WITNESS', 'APPROVER']),
  signatureRequired: z.boolean(),
  signatureOrder: z.number().int().min(1).optional(),
});

// Template Variable Schema
export const templateVariableSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT']),
  required: z.boolean(),
  defaultValue: z.any().optional(),
  options: z.array(z.string()).optional(),
});

// Contract Template Schema
export const createContractTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.nativeEnum(ContractType),
  description: z.string().max(1000),
  content: z.string().min(1),
  variables: z.array(templateVariableSchema).default([]),
  version: z.string().default('1.0.0'),
});

export const updateContractTemplateSchema = createContractTemplateSchema.partial();

// Contract File Schema
export const contractFileSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  type: z.string().min(1),
  size: z.number().int().min(0),
  uploadedBy: z.string().min(1),
});

// Create Contract Schema
export const createContractSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.nativeEnum(ContractType),
  templateId: z.string().optional(),
  parties: z.array(contractPartySchema).min(2),
  content: z.string().min(1),
  variables: z.record(z.any()).optional(),
  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date().optional(),
  isSequentialSigning: z.boolean().default(false),
  files: z.array(contractFileSchema).default([]),
  metadata: z.record(z.any()).optional(),
});

export const updateContractSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.nativeEnum(ContractStatus).optional(),
  parties: z.array(contractPartySchema).optional(),
  content: z.string().optional(),
  variables: z.record(z.any()).optional(),
  effectiveDate: z.coerce.date().optional(),
  expirationDate: z.coerce.date().optional(),
  files: z.array(contractFileSchema).optional(),
  finalDocumentUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

// Signature Schema
export const createSignatureSchema = z.object({
  contractId: z.string().min(1),
  signerEmail: z.string().email(),
  type: z.nativeEnum(SignatureType).default(SignatureType.SIMPLE),
  expirationDays: z.number().int().min(1).default(30),
});

export const signDocumentSchema = z.object({
  signatureData: z.string().min(1), // Base64 signature image
  ipAddress: z.string().optional(),
  geolocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export const declineSignatureSchema = z.object({
  reason: z.string().min(1).max(500),
});

// Workflow Step Schema
export const workflowStepSchema = z.object({
  order: z.number().int().min(1),
  partyId: z.string().min(1),
  partyName: z.string().min(1),
  partyEmail: z.string().email(),
  status: z.nativeEnum(SignatureStatus).default(SignatureStatus.PENDING),
});

// Signing Workflow Schema
export const createSigningWorkflowSchema = z.object({
  contractId: z.string().min(1),
  name: z.string().min(1).max(200),
  isSequential: z.boolean().default(false),
  steps: z.array(workflowStepSchema).min(1),
  reminderIntervalDays: z.number().int().min(1).default(3),
  expirationDays: z.number().int().min(1).default(30),
});

// Audit Log Schema
export const createAuditLogSchema = z.object({
  contractId: z.string().min(1),
  action: z.string().min(1),
  actor: z.string().min(1),
  actorType: z.enum(['USER', 'SYSTEM']),
  details: z.record(z.any()),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

// Type exports
export type ContractPartyInput = z.infer<typeof contractPartySchema>;
export type CreateContractTemplateInput = z.infer<typeof createContractTemplateSchema>;
export type UpdateContractTemplateInput = z.infer<typeof updateContractTemplateSchema>;
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;
export type SignDocumentInput = z.infer<typeof signDocumentSchema>;
export type DeclineSignatureInput = z.infer<typeof declineSignatureSchema>;
export type CreateSigningWorkflowInput = z.infer<typeof createSigningWorkflowSchema>;
export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
