# 📋 Référence Rapide - API Backend RT

## 🔐 Service Authz-EB (Validation TVA + Prix)

### Base URL
```
https://d2i50a1vlg138w.cloudfront.net
```

### Variables d'Environnement
```env
NEXT_PUBLIC_AUTHZ_API_URL=https://d2i50a1vlg138w.cloudfront.net
```

---

## 🎯 Endpoints Disponibles

### 1️⃣ Validation Format TVA
```typescript
POST /api/vat/validate-format
{ "vatNumber": "FR12345678901" }

→ { "success": true, "valid": true, "countryCode": "FR", "vatNumber": "12345678901" }
```

### 2️⃣ Validation TVA Complète (avec infos entreprise)
```typescript
POST /api/vat/validate
{ "vatNumber": "FR12345678901" }

→ {
  "success": true,
  "valid": true,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "companyName": "ACME CORP",
  "companyAddress": "123 RUE DE LA PAIX",
  "source": "VIES"  // "VIES" | "AbstractAPI" | "APILayer"
}
```

### 3️⃣ Calcul Prix TTC
```typescript
POST /api/vat/calculate-price
{ "amount": 100, "countryCode": "FR" }

→ {
  "success": true,
  "countryCode": "FR",
  "countryName": "France",
  "priceExclVat": 100,
  "priceInclVat": 120,
  "vatRate": 20
}
```

---

## 💻 Code TypeScript

### Configuration
```typescript
// src/config/api.config.ts
export const API_CONFIG = {
  authz: {
    baseUrl: 'https://d2i50a1vlg138w.cloudfront.net',
    timeout: 10000,
  },
};
```

### Fonction Validation TVA
```typescript
// src/lib/vat.ts
export async function validateVAT(vatNumber: string) {
  const response = await fetch(
    `${API_CONFIG.authz.baseUrl}/api/vat/validate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vatNumber }),
    }
  );
  return response.json();
}
```

### Fonction Calcul Prix
```typescript
export async function calculatePrice(amount: number, countryCode: string) {
  const response = await fetch(
    `${API_CONFIG.authz.baseUrl}/api/vat/calculate-price`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, countryCode }),
    }
  );
  return response.json();
}
```

---

## 🎨 Composant React

```tsx
'use client';
import { useState } from 'react';

export function VATForm() {
  const [vat, setVat] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch(
      'https://d2i50a1vlg138w.cloudfront.net/api/vat/validate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vatNumber: vat }),
      }
    );
    setResult(await res.json());
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={vat}
        onChange={(e) => setVat(e.target.value)}
        placeholder="FR12345678901"
      />
      <button type="submit">Valider</button>
      {result?.valid && (
        <div>
          ✅ {result.companyName} - {result.companyAddress}
        </div>
      )}
    </form>
  );
}
```

---

## 🌍 Codes Pays UE

```typescript
const EU_COUNTRIES = [
  'AT', // Autriche (20%)
  'BE', // Belgique (21%)
  'BG', // Bulgarie (20%)
  'CY', // Chypre (19%)
  'CZ', // République Tchèque (21%)
  'DE', // Allemagne (19%)
  'DK', // Danemark (25%)
  'EE', // Estonie (20%)
  'EL', // Grèce (24%)
  'ES', // Espagne (21%)
  'FI', // Finlande (24%)
  'FR', // France (20%)
  'HR', // Croatie (25%)
  'HU', // Hongrie (27%)
  'IE', // Irlande (23%)
  'IT', // Italie (22%)
  'LT', // Lituanie (21%)
  'LU', // Luxembourg (17%)
  'LV', // Lettonie (21%)
  'MT', // Malte (18%)
  'NL', // Pays-Bas (21%)
  'PL', // Pologne (23%)
  'PT', // Portugal (23%)
  'RO', // Roumanie (19%)
  'SE', // Suède (25%)
  'SI', // Slovénie (22%)
  'SK', // Slovaquie (20%)
];
```

---

## ⚡ Tests Rapides

```bash
# Health check
curl https://d2i50a1vlg138w.cloudfront.net/health

# Validation TVA
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'

# Calcul prix
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/calculate-price \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"countryCode":"FR"}'
```

---

## 🔄 Système de Fallback

L'API essaie automatiquement 3 sources dans l'ordre:

1. **VIES** (gratuite, officielle UE) ← Priorité
2. **AbstractAPI** (payante)
3. **APILayer** (payante)

Le champ `source` dans la réponse indique quelle API a répondu.

---

## 📦 Service Subscriptions-Contracts

### Base URL
```
https://dgze8l03lwl5h.cloudfront.net
```

### Variables d'Environnement
```env
NEXT_PUBLIC_SUBSCRIPTIONS_API_URL=https://dgze8l03lwl5h.cloudfront.net
```

### Endpoints

#### 1️⃣ Créer un Abonnement
```typescript
POST /api/subscriptions
{
  "userId": "user123",
  "planId": "plan_pro",
  "billingInterval": "MONTHLY",
  "startTrial": true
}

→ {
  "success": true,
  "data": {
    "_id": "507f...",
    "status": "TRIAL",
    "trialEndDate": "2025-12-08T20:00:00.000Z"
  }
}
```

#### 2️⃣ Créer un Contrat
```typescript
POST /api/contracts
{
  "title": "Contrat de Transport",
  "type": "TRANSPORT",
  "content": "<h1>Contrat</h1>",
  "parties": [...],
  "effectiveDate": "2025-12-01"
}

→ {
  "success": true,
  "data": {
    "_id": "507f...",
    "status": "DRAFT"
  }
}
```

#### Tests Rapides
```bash
# Health check
curl https://dgze8l03lwl5h.cloudfront.net/health

# API info
curl https://dgze8l03lwl5h.cloudfront.net/

# Créer un plan
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/plans \
  -H "Content-Type: application/json" \
  -d '{"name":"Pro Plan","type":"PRO","price":49.99,"billingInterval":"MONTHLY"}'
```

---

## 📚 Documentation Complète

- **FRONTEND_INTEGRATION.md** - Documentation complète
- **SERVICES_SUMMARY.md** - Résumé des 2 services
- **frontend-types.ts** - Types TypeScript
- **frontend-utils.ts** - Fonctions utilitaires
- **services/authz-eb/CLOUDFRONT_CONFIG.md** - Config authz-eb
- **services/subscriptions-contracts-eb/CLOUDFRONT_CONFIG.md** - Config subscriptions
- **services/subscriptions-contracts-eb/test-https.ps1** - Tests automatisés

---

## 🎯 Résumé

| Service | URL HTTPS | Status |
|---------|-----------|--------|
| **Authz-EB** | `https://d2i50a1vlg138w.cloudfront.net` | 🟢 Opérationnel |
| **Subscriptions** | `https://dgze8l03lwl5h.cloudfront.net` | 🟢 Opérationnel (MongoDB à config) |

**Version:** 2.2.0 | **Status:** 🟢 Production
