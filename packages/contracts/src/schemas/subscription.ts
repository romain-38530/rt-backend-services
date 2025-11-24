import { z } from 'zod';
import {
  SubscriptionPlanType,
  SubscriptionStatus,
  BillingInterval,
  InvoiceStatus,
} from '../types/subscription.types.js';
import { PaymentMethod } from '../enums/index.js';

// Plan Limits Schema
export const planLimitsSchema = z.object({
  maxUsers: z.number().int().min(1),
  maxVehicles: z.number().int().min(0),
  maxOrders: z.number().int().min(0),
  maxStorage: z.number().min(0), // GB
  apiCallsPerDay: z.number().int().min(0),
  includesFeatures: z.array(z.string()),
});

// Subscription Plan Schema
export const createSubscriptionPlanSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(SubscriptionPlanType),
  description: z.string().max(500),
  priceMonthly: z.number().min(0),
  priceYearly: z.number().min(0),
  currency: z.string().length(3).default('EUR'),
  limits: planLimitsSchema,
  features: z.array(z.string()),
  trialDays: z.number().int().min(0).default(14),
});

export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.partial();

// Subscription Schema
export const createSubscriptionSchema = z.object({
  userId: z.string().min(1),
  companyId: z.string().optional(),
  planId: z.string().min(1),
  billingInterval: z.nativeEnum(BillingInterval),
  startTrial: z.boolean().optional().default(false),
  metadata: z.record(z.any()).optional(),
});

export const updateSubscriptionSchema = z.object({
  planId: z.string().optional(),
  billingInterval: z.nativeEnum(BillingInterval).optional(),
  status: z.nativeEnum(SubscriptionStatus).optional(),
  cancelAt: z.coerce.date().optional(),
  metadata: z.record(z.any()).optional(),
});

// Invoice Item Schema
export const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
});

// Invoice Schema
export const createInvoiceSchema = z.object({
  subscriptionId: z.string().min(1),
  userId: z.string().min(1),
  companyId: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1),
  tax: z.number().min(0).default(0),
  dueDate: z.coerce.date(),
  metadata: z.record(z.any()).optional(),
});

export const updateInvoiceSchema = z.object({
  status: z.nativeEnum(InvoiceStatus).optional(),
  paidAt: z.coerce.date().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  metadata: z.record(z.any()).optional(),
});

// Payment Schema
export const createPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().min(0),
  currency: z.string().length(3).default('EUR'),
  method: z.nativeEnum(PaymentMethod),
  transactionId: z.string().optional(),
  provider: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Usage Schema
export const updateUsageSchema = z.object({
  subscriptionId: z.string().min(1),
  userId: z.string().min(1),
  metrics: z.object({
    users: z.number().int().min(0),
    vehicles: z.number().int().min(0),
    orders: z.number().int().min(0),
    storage: z.number().min(0),
    apiCalls: z.number().int().min(0),
  }),
});

// Type exports
export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;
export type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type UpdateUsageInput = z.infer<typeof updateUsageSchema>;
