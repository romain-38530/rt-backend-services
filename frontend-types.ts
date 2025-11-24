/**
 * Types TypeScript pour l'intégration Frontend
 * RT Backend Services - Version 2.2.0
 *
 * Copiez ce fichier dans votre projet frontend:
 * src/types/api.ts
 */

// ==================== Configuration ====================

export const API_CONFIG = {
  authz: {
    baseUrl: process.env.NEXT_PUBLIC_AUTHZ_API_URL || 'https://d2i50a1vlg138w.cloudfront.net',
    timeout: 10000,
  },
  subscriptions: {
    baseUrl: process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL || 'http://localhost:3005',
    timeout: 15000,
  },
} as const;

// ==================== Validation TVA ====================

export type VATAPISource = 'VIES' | 'AbstractAPI' | 'APILayer' | 'none';

export interface VATFormatValidationRequest {
  vatNumber: string;
}

export interface VATFormatValidationResponse {
  success: boolean;
  valid: boolean;
  countryCode?: string;
  vatNumber?: string;
  message?: string;
}

export interface VATValidationRequest {
  vatNumber: string;
}

export interface VATValidationResponse {
  success: boolean;
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  requestDate: string;
  companyName: string;
  companyAddress: string;
  source: VATAPISource;
  errorCode?: string;
  errorMessage?: string;
}

// ==================== Calcul de Prix ====================

export interface PriceCalculationRequest {
  amount: number;
  countryCode: string;
}

export interface PriceCalculationResponse {
  success: boolean;
  countryCode: string;
  countryName: string;
  priceExclVat: number;
  priceInclVat: number;
  vatRate: number;
}

// ==================== Health Check ====================

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  port: string;
  env: string;
  features: string[];
  mongodb: {
    configured: boolean;
    connected: boolean;
    status: string;
  };
  vat?: {
    apiUrl: string;
    cacheSize: number;
    supportedCountries: number;
  };
}

export interface APIInfoResponse {
  message: string;
  version: string;
  features: string[];
  endpoints: string[];
}

// ==================== Pays UE ====================

export interface EUCountry {
  code: string;
  name: string;
  vatRate: number;
}

export const EU_COUNTRIES: EUCountry[] = [
  { code: 'AT', name: 'Autriche', vatRate: 20 },
  { code: 'BE', name: 'Belgique', vatRate: 21 },
  { code: 'BG', name: 'Bulgarie', vatRate: 20 },
  { code: 'CY', name: 'Chypre', vatRate: 19 },
  { code: 'CZ', name: 'République Tchèque', vatRate: 21 },
  { code: 'DE', name: 'Allemagne', vatRate: 19 },
  { code: 'DK', name: 'Danemark', vatRate: 25 },
  { code: 'EE', name: 'Estonie', vatRate: 20 },
  { code: 'EL', name: 'Grèce', vatRate: 24 },
  { code: 'ES', name: 'Espagne', vatRate: 21 },
  { code: 'FI', name: 'Finlande', vatRate: 24 },
  { code: 'FR', name: 'France', vatRate: 20 },
  { code: 'GB', name: 'Royaume-Uni', vatRate: 20 },
  { code: 'HR', name: 'Croatie', vatRate: 25 },
  { code: 'HU', name: 'Hongrie', vatRate: 27 },
  { code: 'IE', name: 'Irlande', vatRate: 23 },
  { code: 'IT', name: 'Italie', vatRate: 22 },
  { code: 'LT', name: 'Lituanie', vatRate: 21 },
  { code: 'LU', name: 'Luxembourg', vatRate: 17 },
  { code: 'LV', name: 'Lettonie', vatRate: 21 },
  { code: 'MT', name: 'Malte', vatRate: 18 },
  { code: 'NL', name: 'Pays-Bas', vatRate: 21 },
  { code: 'PL', name: 'Pologne', vatRate: 23 },
  { code: 'PT', name: 'Portugal', vatRate: 23 },
  { code: 'RO', name: 'Roumanie', vatRate: 19 },
  { code: 'SE', name: 'Suède', vatRate: 25 },
  { code: 'SI', name: 'Slovénie', vatRate: 22 },
  { code: 'SK', name: 'Slovaquie', vatRate: 20 },
];

// ==================== Erreurs ====================

export class APIError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const ERROR_CODES = {
  // Erreurs réseau
  NETWORK_ERROR: 'Erreur de connexion au serveur',
  TIMEOUT: 'La requête a expiré',

  // Erreurs validation TVA
  INVALID_VAT_FORMAT: 'Format de numéro TVA invalide',
  ALL_APIS_FAILED: 'Tous les services de validation sont indisponibles',
  INVALID_INPUT: 'Données invalides',

  // Erreurs générales
  NOT_FOUND: 'Ressource non trouvée',
  UNAUTHORIZED: 'Non autorisé',
  FORBIDDEN: 'Accès refusé',
  INTERNAL_ERROR: 'Erreur interne du serveur',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// ==================== Abonnements (À venir) ====================

export type SubscriptionPlanType = 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type PaymentMethod = 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'CARD';
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: SubscriptionPlanType;
  description: string;
  price: number;
  billingInterval: BillingInterval;
  trialDays: number;
  features: {
    maxApiCalls: number;
    maxUsers: number;
    maxVehicles: number;
    maxStorageGB: number;
    support: string;
    customFeatures: string[];
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: string;
  endDate: string;
  trialEndDate?: string;
  billingInterval: BillingInterval;
  amount: number;
  currency: string;
  autoRenew: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  userId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  dueDate: string;
  paidAt?: string;
  invoiceUrl?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  subscriptionId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  transactionId?: string;
  processedAt?: string;
  createdAt: string;
}

// ==================== Contrats (À venir) ====================

export type ContractType = 'ECMR' | 'TRANSPORT' | 'SERVICE' | 'NDA' | 'CUSTOM';
export type ContractStatus = 'DRAFT' | 'PENDING_SIGNATURES' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';
export type SignatureType = 'SIMPLE' | 'ADVANCED' | 'QUALIFIED';
export type SignatureStatus = 'PENDING' | 'SIGNED' | 'DECLINED';
export type PartyType = 'INDIVIDUAL' | 'COMPANY';

export interface ContractParty {
  id: string;
  type: PartyType;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  role: string;
  signatureRequired: boolean;
  signatureOrder?: number;
}

export interface Contract {
  id: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  content: string;
  parties: ContractParty[];
  templateId?: string;
  effectiveDate: string;
  expiryDate?: string;
  isSequentialSigning: boolean;
  metadata?: Record<string, any>;
  documentUrl?: string;
  signedDocumentUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  signedAt?: string;
  cancelledAt?: string;
}

export interface Signature {
  id: string;
  contractId: string;
  partyId: string;
  signatureType: SignatureType;
  status: SignatureStatus;
  signatureData?: string;
  signedAt?: string;
  ipAddress?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
  declinedAt?: string;
  declineReason?: string;
  certificateUrl?: string;
  createdAt: string;
}

export interface ContractTemplate {
  id: string;
  name: string;
  type: ContractType;
  description: string;
  content: string;
  variables: string[];
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== Utilitaires ====================

/**
 * Formate un numéro TVA pour l'affichage
 */
export function formatVATNumber(vatNumber: string): string {
  if (!vatNumber) return '';

  // Supprimer les espaces
  const cleaned = vatNumber.replace(/\s/g, '');

  // Séparer le code pays et le numéro
  const countryCode = cleaned.substring(0, 2);
  const number = cleaned.substring(2);

  // Formater avec des espaces tous les 3 chiffres
  const formatted = number.replace(/(\d{3})(?=\d)/g, '$1 ');

  return `${countryCode} ${formatted}`.trim();
}

/**
 * Valide le format d'un numéro TVA (regex simple)
 */
export function isVATNumberFormat(vatNumber: string): boolean {
  const cleaned = vatNumber.replace(/\s/g, '');
  // Format: 2 lettres + chiffres (entre 8 et 12 caractères)
  return /^[A-Z]{2}\d{8,12}$/.test(cleaned);
}

/**
 * Formate un montant en euros
 */
export function formatPrice(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Formate une date ISO en date lisible
 */
export function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(isoDate));
}

/**
 * Calcule le montant de TVA
 */
export function calculateVATAmount(priceExcl: number, vatRate: number): number {
  return (priceExcl * vatRate) / 100;
}

/**
 * Calcule le prix TTC à partir du HT
 */
export function calculatePriceIncl(priceExcl: number, vatRate: number): number {
  return priceExcl + calculateVATAmount(priceExcl, vatRate);
}

/**
 * Calcule le prix HT à partir du TTC
 */
export function calculatePriceExcl(priceIncl: number, vatRate: number): number {
  return priceIncl / (1 + vatRate / 100);
}
