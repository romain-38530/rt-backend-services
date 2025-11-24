import { BaseEntity } from './common.js';
import {
  PaymentMethod,
  PaymentStatus,
  SubscriptionPlanType,
  SubscriptionStatus,
  BillingInterval,
  InvoiceStatus,
} from '../enums/index.js';

// Feature Limits
export interface PlanLimits {
  maxUsers: number;
  maxVehicles: number;
  maxOrders: number;
  maxStorage: number; // in GB
  apiCallsPerDay: number;
  includesFeatures: string[];
}

// Subscription Plan
export interface SubscriptionPlan extends BaseEntity {
  name: string;
  type: SubscriptionPlanType;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  limits: PlanLimits;
  isActive: boolean;
  features: string[];
  trialDays: number;
}

// User Subscription
export interface Subscription extends BaseEntity {
  userId: string;
  companyId?: string;
  planId: string;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAt?: Date;
  cancelledAt?: Date;
  metadata?: Record<string, any>;
}

// Invoice
export interface Invoice extends BaseEntity {
  subscriptionId: string;
  userId: string;
  companyId?: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  dueDate: Date;
  paidAt?: Date;
  paymentMethod?: PaymentMethod;
  metadata?: Record<string, any>;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// Payment
export interface Payment extends BaseEntity {
  invoiceId: string;
  subscriptionId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  provider?: string;
  processedAt?: Date;
  metadata?: Record<string, any>;
}

// Usage Tracking
export interface Usage extends BaseEntity {
  subscriptionId: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  metrics: {
    users: number;
    vehicles: number;
    orders: number;
    storage: number; // in GB
    apiCalls: number;
  };
}
