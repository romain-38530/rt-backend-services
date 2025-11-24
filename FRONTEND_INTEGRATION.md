# 🚀 Documentation Intégration Frontend - RT Backend Services

**Date:** 24 novembre 2025
**Version:** 2.2.0

## 📋 Table des Matières

1. [Services Disponibles](#services-disponibles)
2. [Configuration Frontend](#configuration-frontend)
3. [Service Authz-EB (Validation TVA)](#service-authz-eb)
4. [Service Subscriptions-Contracts](#service-subscriptions-contracts)
5. [Gestion des Erreurs](#gestion-des-erreurs)
6. [Exemples d'Intégration](#exemples-dintégration)

---

## 🎯 Services Disponibles

### ✅ Service Authz-EB (OPÉRATIONNEL)
**URL HTTPS:** `https://d2i50a1vlg138w.cloudfront.net`
**Status:** 🟢 Green - Production Ready
**Version:** 2.2.0

**Fonctionnalités:**
- ✅ Validation TVA avec système de fallback (VIES → AbstractAPI → APILayer)
- ✅ Calcul de prix avec TVA pour tous les pays UE
- ✅ Cache intelligent (1h pour résultats valides)
- ✅ HTTPS via CloudFront (CDN global)

### ⏳ Service Subscriptions-Contracts (EN DÉVELOPPEMENT)
**URL:** À déterminer après déploiement
**Status:** 🟡 Non déployé

**Fonctionnalités:**
- Gestion des abonnements (plans, facturation, usage)
- Signature électronique de contrats
- Gestion des modèles de contrats

---

## ⚙️ Configuration Frontend

### Variables d'Environnement

```typescript
// .env.local ou .env.production
NEXT_PUBLIC_AUTHZ_API_URL=https://d2i50a1vlg138w.cloudfront.net
NEXT_PUBLIC_SUBSCRIPTIONS_API_URL=https://to-be-deployed.com
```

### Configuration TypeScript

```typescript
// src/config/api.config.ts
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
```

---

## 🔐 Service Authz-EB

### Base URL
```
https://d2i50a1vlg138w.cloudfront.net
```

### Endpoints Disponibles

#### 1. Health Check
```typescript
GET /health

// Réponse
{
  "status": "healthy",
  "service": "authz",
  "version": "2.2.0",
  "mongodb": {
    "connected": true,
    "status": "active"
  }
}
```

#### 2. Info API
```typescript
GET /

// Réponse
{
  "message": "RT Authentication API with VAT Validation",
  "version": "2.2.0",
  "features": [
    "Express",
    "MongoDB",
    "CORS",
    "Helmet",
    "VAT Validation (Multi-API Fallback: VIES -> AbstractAPI -> APILayer)",
    "Price Calculation"
  ],
  "endpoints": [
    "GET /health",
    "GET /",
    "POST /api/vat/validate-format",
    "POST /api/vat/validate",
    "POST /api/vat/calculate-price"
  ]
}
```

#### 3. Validation Format TVA
```typescript
POST /api/vat/validate-format

// Requête
{
  "vatNumber": "FR12345678901"
}

// Réponse Succès
{
  "success": true,
  "valid": true,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "message": "VAT number format is valid"
}

// Réponse Échec
{
  "success": false,
  "valid": false,
  "message": "Invalid VAT number format"
}
```

#### 4. Validation TVA Complète (Multi-API avec Fallback)
```typescript
POST /api/vat/validate

// Requête
{
  "vatNumber": "FR12345678901"
}

// Réponse Succès
{
  "success": true,
  "valid": true,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "requestDate": "2025-11-24T18:34:18.069Z",
  "companyName": "ACME CORP",
  "companyAddress": "123 RUE DE LA PAIX, 75001 PARIS",
  "source": "VIES"  // Indique quelle API a répondu: "VIES" | "AbstractAPI" | "APILayer"
}

// Réponse Échec
{
  "success": true,
  "valid": false,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "requestDate": "2025-11-24T18:34:18.069Z",
  "companyName": "---",
  "companyAddress": "---",
  "source": "VIES",
  "errorCode": "INVALID_VAT",
  "errorMessage": "VAT number is not valid"
}

// Réponse Toutes APIs Échouées
{
  "success": false,
  "valid": false,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "requestDate": "2025-11-24T18:34:18.069Z",
  "errorCode": "ALL_APIS_FAILED",
  "errorMessage": "VIES: timeout | AbstractAPI: quota exceeded | APILayer: API key invalid",
  "source": "none"
}
```

**Système de Fallback:**
1. **VIES** (gratuite, officielle EU) - Essayée en premier
2. **AbstractAPI** (payante) - Si VIES échoue
3. **APILayer** (payante) - Si AbstractAPI échoue

#### 5. Calcul de Prix avec TVA
```typescript
POST /api/vat/calculate-price

// Requête
{
  "amount": 100,
  "countryCode": "FR"
}

// Réponse
{
  "success": true,
  "countryCode": "FR",
  "countryName": "France",
  "priceExclVat": 100,
  "priceInclVat": 120,
  "vatRate": 20
}

// Exemples par pays
// France: 20%
// Allemagne: 19%
// UK: 20%
// Espagne: 21%
// Italie: 22%
```

### Fonctions TypeScript Helper

```typescript
// src/lib/vat.ts
import { API_CONFIG } from '@/config/api.config';

export interface VATValidationResult {
  success: boolean;
  valid: boolean;
  countryCode: string;
  vatNumber: string;
  requestDate: string;
  companyName: string;
  companyAddress: string;
  source: 'VIES' | 'AbstractAPI' | 'APILayer' | 'none';
  errorCode?: string;
  errorMessage?: string;
}

export interface PriceCalculationResult {
  success: boolean;
  countryCode: string;
  countryName: string;
  priceExclVat: number;
  priceInclVat: number;
  vatRate: number;
}

/**
 * Valide le format d'un numéro TVA
 */
export async function validateVATFormat(vatNumber: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_CONFIG.authz.baseUrl}/api/vat/validate-format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vatNumber }),
      signal: AbortSignal.timeout(API_CONFIG.authz.timeout),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error('VAT format validation error:', error);
    return false;
  }
}

/**
 * Valide un numéro TVA avec les APIs (VIES, AbstractAPI, APILayer)
 * Retourne les informations de l'entreprise si le numéro est valide
 */
export async function validateVAT(vatNumber: string): Promise<VATValidationResult> {
  const response = await fetch(`${API_CONFIG.authz.baseUrl}/api/vat/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vatNumber }),
    signal: AbortSignal.timeout(API_CONFIG.authz.timeout),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Calcule le prix TTC à partir d'un prix HT et d'un code pays
 */
export async function calculatePriceWithVAT(
  amount: number,
  countryCode: string
): Promise<PriceCalculationResult> {
  const response = await fetch(`${API_CONFIG.authz.baseUrl}/api/vat/calculate-price`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, countryCode }),
    signal: AbortSignal.timeout(API_CONFIG.authz.timeout),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
```

### Composant React Exemple

```typescript
// src/components/VATValidationForm.tsx
'use client';

import { useState } from 'react';
import { validateVAT, type VATValidationResult } from '@/lib/vat';

export function VATValidationForm() {
  const [vatNumber, setVatNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VATValidationResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const data = await validateVAT(vatNumber);
      setResult(data);
    } catch (error) {
      console.error('Validation error:', error);
      alert('Erreur lors de la validation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="vat" className="block text-sm font-medium">
          Numéro TVA
        </label>
        <input
          id="vat"
          type="text"
          value={vatNumber}
          onChange={(e) => setVatNumber(e.target.value)}
          placeholder="FR12345678901"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Validation en cours...' : 'Valider'}
      </button>

      {result && (
        <div className={`rounded-md p-4 ${result.valid ? 'bg-green-50' : 'bg-red-50'}`}>
          <h3 className="font-semibold">
            {result.valid ? '✅ Numéro TVA valide' : '❌ Numéro TVA invalide'}
          </h3>
          {result.valid && (
            <div className="mt-2 space-y-1 text-sm">
              <p><strong>Entreprise:</strong> {result.companyName}</p>
              <p><strong>Adresse:</strong> {result.companyAddress}</p>
              <p><strong>Pays:</strong> {result.countryCode}</p>
              <p className="text-gray-500">Source: {result.source}</p>
            </div>
          )}
          {result.errorMessage && (
            <p className="mt-2 text-sm text-red-600">{result.errorMessage}</p>
          )}
        </div>
      )}
    </form>
  );
}
```

### Composant Calcul Prix

```typescript
// src/components/PriceCalculator.tsx
'use client';

import { useState } from 'react';
import { calculatePriceWithVAT, type PriceCalculationResult } from '@/lib/vat';

const EU_COUNTRIES = [
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Allemagne' },
  { code: 'GB', name: 'Royaume-Uni' },
  { code: 'ES', name: 'Espagne' },
  { code: 'IT', name: 'Italie' },
  { code: 'BE', name: 'Belgique' },
  { code: 'NL', name: 'Pays-Bas' },
  // ... autres pays
];

export function PriceCalculator() {
  const [amount, setAmount] = useState(100);
  const [countryCode, setCountryCode] = useState('FR');
  const [result, setResult] = useState<PriceCalculationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const data = await calculatePriceWithVAT(amount, countryCode);
      setResult(data);
    } catch (error) {
      console.error('Calculation error:', error);
      alert('Erreur lors du calcul');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium">Prix HT (€)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Pays</label>
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
        >
          {EU_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleCalculate}
        disabled={loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      >
        Calculer le prix TTC
      </button>

      {result && result.success && (
        <div className="rounded-md bg-blue-50 p-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">{result.countryName}</p>
            <div className="flex justify-between text-lg">
              <span>Prix HT:</span>
              <span className="font-semibold">{result.priceExclVat.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>TVA ({result.vatRate}%):</span>
              <span>{(result.priceInclVat - result.priceExclVat).toFixed(2)} €</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-xl font-bold">
              <span>Prix TTC:</span>
              <span className="text-blue-600">{result.priceInclVat.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 📦 Service Subscriptions-Contracts

### ✅ Status: OPÉRATIONNEL - HTTPS ACTIF

**URL HTTPS (Production):** `https://dgze8l03lwl5h.cloudfront.net`
**URL HTTP (Origin):** `http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`
**CloudFront Distribution:** `E1H1CDV902R49R`
**Status:** 🟢 Green - Production Ready
**Version:** 1.0.0
**Health:** Green ✅

⚠️ **Note:** MongoDB à configurer (Atlas recommandé pour production)

Le service subscriptions-contracts fournit les endpoints suivants:

### Endpoints Disponibles

#### Plans d'Abonnement
```typescript
POST   /api/plans              // Créer un plan
GET    /api/plans              // Lister les plans
GET    /api/plans/:id          // Détails d'un plan
PUT    /api/plans/:id          // Modifier un plan
DELETE /api/plans/:id          // Désactiver un plan
```

#### Abonnements
```typescript
POST   /api/subscriptions                    // Créer un abonnement
GET    /api/subscriptions/:id                // Détails abonnement
GET    /api/subscriptions/user/:userId/active // Abonnement actif d'un user
PUT    /api/subscriptions/:id                // Modifier abonnement
POST   /api/subscriptions/:id/cancel         // Annuler abonnement
POST   /api/subscriptions/:id/renew          // Renouveler abonnement
```

#### Factures
```typescript
POST   /api/invoices           // Créer une facture
GET    /api/invoices/:id       // Détails facture
POST   /api/invoices/:id/pay   // Marquer comme payée
```

#### Usage
```typescript
POST   /api/usage                         // Mettre à jour l'usage
GET    /api/usage/:subscriptionId/limits  // Vérifier les limites
```

#### Contrats
```typescript
POST   /api/contracts              // Créer un contrat
GET    /api/contracts/:id          // Détails contrat
GET    /api/contracts/user/:userId // Contrats d'un user
PUT    /api/contracts/:id          // Modifier contrat
POST   /api/contracts/:id/send     // Envoyer pour signatures
POST   /api/contracts/:id/cancel   // Annuler contrat
```

#### Signatures
```typescript
GET    /api/contracts/:contractId/signatures // Liste des signatures
POST   /api/signatures/:signatureId/sign     // Signer
POST   /api/signatures/:signatureId/decline  // Refuser
```

### Types TypeScript

```typescript
// Types pour les abonnements
export type SubscriptionPlanType = 'BASIC' | 'PRO' | 'ENTERPRISE' | 'CUSTOM';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED' | 'SUSPENDED';
export type BillingInterval = 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: SubscriptionPlanType;
  description: string;
  price: number;
  billingInterval: BillingInterval;
  features: {
    maxApiCalls: number;
    maxUsers: number;
    maxVehicles: number;
    maxStorageGB: number;
    support: string;
  };
  isActive: boolean;
}

// Types pour les contrats
export type ContractType = 'ECMR' | 'TRANSPORT' | 'SERVICE' | 'NDA' | 'CUSTOM';
export type SignatureType = 'SIMPLE' | 'ADVANCED' | 'QUALIFIED';
export type ContractStatus = 'DRAFT' | 'PENDING_SIGNATURES' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';

export interface Contract {
  id: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  content: string;
  parties: ContractParty[];
  effectiveDate: string;
  expiryDate?: string;
  isSequentialSigning: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContractParty {
  type: 'INDIVIDUAL' | 'COMPANY';
  name: string;
  email: string;
  role: string;
  signatureRequired: boolean;
  signatureOrder?: number;
}
```

---

## ⚠️ Gestion des Erreurs

### Codes d'Erreur Communs

```typescript
// src/lib/errors.ts
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

  // Erreurs générales
  INVALID_INPUT: 'Données invalides',
  NOT_FOUND: 'Ressource non trouvée',
  UNAUTHORIZED: 'Non autorisé',
  INTERNAL_ERROR: 'Erreur interne du serveur',
} as const;

/**
 * Gestionnaire d'erreurs centralisé
 */
export function handleAPIError(error: unknown): APIError {
  if (error instanceof APIError) {
    return error;
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new APIError('NETWORK_ERROR', ERROR_CODES.NETWORK_ERROR, 0);
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new APIError('TIMEOUT', ERROR_CODES.TIMEOUT, 0);
  }

  return new APIError(
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : 'Une erreur inconnue est survenue',
    500
  );
}
```

### Utilisation

```typescript
try {
  const result = await validateVAT(vatNumber);
  // ...
} catch (error) {
  const apiError = handleAPIError(error);

  // Logger l'erreur
  console.error('VAT validation failed:', apiError);

  // Afficher un message utilisateur
  toast.error(apiError.message);

  // Envoyer à un service de monitoring
  if (apiError.code !== 'NETWORK_ERROR') {
    Sentry.captureException(apiError);
  }
}
```

---

## 🔧 Tests

### Tests Unitaires

```typescript
// src/lib/__tests__/vat.test.ts
import { describe, it, expect, vi } from 'vitest';
import { validateVAT, calculatePriceWithVAT } from '../vat';

describe('VAT Validation', () => {
  it('should validate a correct French VAT number', async () => {
    const result = await validateVAT('FR12345678901');
    expect(result.success).toBe(true);
    expect(result.countryCode).toBe('FR');
  });

  it('should calculate price with VAT for France', async () => {
    const result = await calculatePriceWithVAT(100, 'FR');
    expect(result.success).toBe(true);
    expect(result.priceInclVat).toBe(120);
    expect(result.vatRate).toBe(20);
  });
});
```

---

## 📊 Monitoring & Performance

### Métriques à Suivre

```typescript
// src/lib/monitoring.ts
export async function trackAPICall(
  endpoint: string,
  duration: number,
  status: 'success' | 'error'
) {
  // Envoyer à votre service d'analytics
  console.log(`API Call: ${endpoint} - ${duration}ms - ${status}`);

  // Exemple avec Google Analytics
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'api_call', {
      endpoint,
      duration,
      status,
    });
  }
}

// Wrapper avec monitoring
export async function monitoredFetch(url: string, options?: RequestInit) {
  const start = Date.now();
  let status: 'success' | 'error' = 'error';

  try {
    const response = await fetch(url, options);
    status = response.ok ? 'success' : 'error';
    return response;
  } finally {
    const duration = Date.now() - start;
    trackAPICall(url, duration, status);
  }
}
```

---

## 🎯 Checklist Intégration

### Pour le Frontend

- [ ] Ajouter les variables d'environnement
- [ ] Installer les dépendances (si nécessaire)
- [ ] Copier les fonctions helper dans `src/lib/vat.ts`
- [ ] Copier la gestion d'erreurs dans `src/lib/errors.ts`
- [ ] Créer les composants de validation TVA
- [ ] Créer les composants de calcul de prix
- [ ] Ajouter les tests unitaires
- [ ] Tester en développement
- [ ] Tester en production

### Tests à Effectuer

```bash
# Test 1: Health check
curl https://d2i50a1vlg138w.cloudfront.net/health

# Test 2: Validation format
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate-format \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'

# Test 3: Validation complète
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'

# Test 4: Calcul prix
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/calculate-price \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"countryCode":"FR"}'
```

---

## 📞 Support

- **Documentation:** Ce fichier
- **Configuration CloudFront:** `services/authz-eb/CLOUDFRONT_CONFIG.md`
- **Tests automatisés:** `services/authz-eb/test-https.ps1`

---

## 📝 Changelog

### Version 2.2.0 (24/11/2025)
- ✅ Système de fallback multi-API (VIES → AbstractAPI → APILayer)
- ✅ Calcul de prix avec TVA (APILayer)
- ✅ Cache intelligent (1h)
- ✅ HTTPS via CloudFront
- ✅ Traçabilité API (champ `source`)

### Version 2.1.0 (24/11/2025)
- ✅ Intégration AbstractAPI
- ✅ Intégration APILayer pour prix

### Version 2.0.0 (23/11/2025)
- ✅ Migration VIES REST API
- ✅ Validation TVA UE (27 pays)
- ✅ CloudFront HTTPS

---

**Dernière mise à jour:** 24 novembre 2025
**Mainteneur:** RT Technologies
