# 📊 RT Backend Services - Résumé Complet

**Date:** 24 novembre 2025
**Version:** 2.2.0

---

## 🎯 Services Déployés

### 1. ✅ Service Authz-EB (Validation TVA + Prix)

**Status:** 🟢 Production Ready - HTTPS Actif
**Version:** 2.2.0

#### URLs
- **HTTPS (Production):** `https://d2i50a1vlg138w.cloudfront.net`
- **HTTP (Origin):** `http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com`
- **CloudFront Distribution:** `E8GKHGYOIP84`
- **Health:** Green ✅

#### Fonctionnalités
- ✅ **Validation TVA** avec système de fallback multi-API
  - VIES (gratuite, prioritaire)
  - AbstractAPI (fallback 1)
  - APILayer (fallback 2)
- ✅ **Calcul de prix avec TVA** pour 27+ pays UE
- ✅ **Cache intelligent** (1h pour résultats valides)
- ✅ **Traçabilité API** (champ `source`)

#### Endpoints
```
GET  /health
GET  /
POST /api/vat/validate-format
POST /api/vat/validate
POST /api/vat/calculate-price
```

---

### 2. ✅ Service Subscriptions-Contracts

**Status:** 🟢 Production Ready - HTTPS Actif + MongoDB Atlas
**Version:** 1.0.0

#### URLs
- **HTTPS (Production):** `https://dgze8l03lwl5h.cloudfront.net`
- **HTTP (Origin):** `http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`
- **CloudFront Distribution:** `E1H1CDV902R49R`
- **Health:** Green ✅
- **MongoDB Atlas:** 🟢 Connecté et opérationnel (Cluster: stagingrt.v2jnoh2)

#### Fonctionnalités
- ✅ **Gestion des abonnements**
  - Plans (BASIC, PRO, ENTERPRISE, CUSTOM)
  - Souscriptions avec période d'essai
  - Annulation et renouvellement
- ✅ **Gestion des contrats**
  - Création de contrats
  - Signature électronique
  - Envoi pour signatures
- ✅ **Gestion des factures** (à venir)
- ✅ **Tracking usage** (à venir)

#### Endpoints
```
# Plans
GET  /api/plans
POST /api/plans

# Subscriptions
GET  /api/subscriptions/:id
POST /api/subscriptions
POST /api/subscriptions/:id/cancel
POST /api/subscriptions/:id/renew

# Contracts
GET  /api/contracts/:id
POST /api/contracts
POST /api/contracts/:id/send

# Signatures
POST /api/signatures/:id/sign
```

---

## 📋 Configuration Frontend

### Variables d'Environnement

```typescript
// .env.local
NEXT_PUBLIC_AUTHZ_API_URL=https://d2i50a1vlg138w.cloudfront.net
NEXT_PUBLIC_SUBSCRIPTIONS_API_URL=http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com
```

### Configuration API

```typescript
// src/config/api.config.ts
export const API_CONFIG = {
  authz: {
    baseUrl: process.env.NEXT_PUBLIC_AUTHZ_API_URL || 'https://d2i50a1vlg138w.cloudfront.net',
    timeout: 10000,
  },
  subscriptions: {
    baseUrl: process.env.NEXT_PUBLIC_SUBSCRIPTIONS_API_URL || 'http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com',
    timeout: 15000,
  },
} as const;
```

---

## 🎨 Exemples d'Intégration

### 1. Validation TVA

```typescript
import { validateVAT } from '@/lib/api';

const result = await validateVAT('FR12345678901');

if (result.valid) {
  console.log('Entreprise:', result.companyName);
  console.log('Adresse:', result.companyAddress);
  console.log('Source API:', result.source); // "VIES" | "AbstractAPI" | "APILayer"
}
```

### 2. Calcul Prix avec TVA

```typescript
import { calculatePriceWithVAT } from '@/lib/api';

const price = await calculatePriceWithVAT(100, 'FR');

console.log('Prix HT:', price.priceExclVat); // 100
console.log('Prix TTC:', price.priceInclVat); // 120
console.log('Taux TVA:', price.vatRate); // 20%
```

### 3. Créer un Abonnement

```typescript
const response = await fetch(`${API_CONFIG.subscriptions.baseUrl}/api/subscriptions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    planId: 'plan_pro',
    billingInterval: 'MONTHLY',
    startTrial: true,
  }),
});

const subscription = await response.json();
```

### 4. Créer un Contrat

```typescript
const response = await fetch(`${API_CONFIG.subscriptions.baseUrl}/api/contracts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Contrat de Transport',
    type: 'TRANSPORT',
    content: '<h1>Contrat</h1><p>...</p>',
    parties: [
      {
        type: 'COMPANY',
        name: 'Entreprise A',
        email: 'contact@entreprisea.com',
        role: 'SENDER',
        signatureRequired: true,
      },
    ],
    effectiveDate: '2025-12-01',
  }),
});

const contract = await response.json();
```

---

## 🔐 Sécurité

### Service Authz-EB
- ✅ HTTPS via CloudFront
- ✅ Helmet (security headers)
- ✅ CORS configuré
- ✅ Rate limiting (100 req/15min)

### Service Subscriptions-Contracts
- ⚠️ HTTP uniquement (HTTPS à configurer)
- ✅ Helmet (security headers)
- ✅ CORS configuré
- ✅ Rate limiting (100 req/15min)
- ⏳ Authentication à ajouter

---

## 🌍 Pays Supportés (TVA)

27 pays UE + UK:
- 🇫🇷 France (20%)
- 🇩🇪 Allemagne (19%)
- 🇬🇧 Royaume-Uni (20%)
- 🇪🇸 Espagne (21%)
- 🇮🇹 Italie (22%)
- 🇧🇪 Belgique (21%)
- 🇳🇱 Pays-Bas (21%)
- ... (voir `frontend-types.ts` pour la liste complète)

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (HTTPS)                     │
│                  Next.js / React App                     │
└─────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌──────────────────────┐      ┌───────────────────────────┐
│  Authz-EB Service    │      │ Subscriptions-Contracts   │
│  (Validation TVA)    │      │       Service             │
├──────────────────────┤      ├───────────────────────────┤
│ HTTPS via CloudFront │      │ HTTP (à sécuriser)        │
│ Multi-API Fallback   │      │ MongoDB (à configurer)    │
│ Cache 1h             │      │ Plans, Contrats, Factures │
└──────────────────────┘      └───────────────────────────┘
           │                               │
           ▼                               ▼
┌──────────────────────┐      ┌───────────────────────────┐
│  VIES → Abstract     │      │       MongoDB Atlas        │
│  → APILayer          │      │    (à configurer)          │
└──────────────────────┘      └───────────────────────────┘
```

---

## 🔄 Prochaines Étapes

### Service Authz-EB (Complété ✅)
- [x] Système de fallback multi-API
- [x] HTTPS via CloudFront
- [x] Calcul prix avec TVA
- [x] Cache intelligent
- [x] Documentation complète

### Service Subscriptions-Contracts (En cours 🟡)
- [x] Déploiement HTTP
- [ ] Configuration MongoDB
- [ ] Configuration HTTPS via CloudFront
- [ ] Ajout authentication middleware
- [ ] Tests e2e complets
- [ ] Factures et paiements
- [ ] Tracking usage
- [ ] Notifications email
- [ ] Génération PDF

---

## 📁 Fichiers de Documentation

### Documentation Générale
- **FRONTEND_INTEGRATION.md** - Documentation complète pour le frontend
- **QUICK_REFERENCE.md** - Référence rapide des endpoints
- **SERVICES_SUMMARY.md** - Ce fichier

### Fichiers TypeScript
- **frontend-types.ts** - Tous les types TypeScript
- **frontend-utils.ts** - Fonctions utilitaires et hooks React

### Documentation Spécifique Services
- **services/authz-eb/CLOUDFRONT_CONFIG.md** - Config CloudFront authz-eb
- **services/authz-eb/test-https.ps1** - Script de tests automatisés
- **services/subscriptions-contracts-eb/README.md** - Documentation subscriptions-contracts

---

## 🧪 Tests Rapides

### Test Authz-EB (HTTPS)
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

### Test Subscriptions-Contracts (HTTP)
```bash
# Health check
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health

# API info
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/

# List plans (nécessite MongoDB)
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/plans
```

---

## 📞 Support & Maintenance

### Monitoring
```bash
# Authz-EB
cd services/authz-eb
eb status
eb logs

# Subscriptions-Contracts
cd services/subscriptions-contracts-eb
eb status
eb logs
```

### Invalidation Cache CloudFront
```bash
aws cloudfront create-invalidation \
  --distribution-id E8GKHGYOIP84 \
  --paths "/*"
```

### Déploiement Nouvelles Versions
```bash
# Authz-EB
cd services/authz-eb
eb deploy

# Subscriptions-Contracts
cd services/subscriptions-contracts-eb
eb deploy
```

---

## ✅ Checklist Intégration Frontend

- [ ] Copier `frontend-types.ts` → `src/types/api.ts`
- [ ] Copier `frontend-utils.ts` → `src/lib/api.ts`
- [ ] Ajouter variables d'environnement
- [ ] Tester validation TVA
- [ ] Tester calcul prix
- [ ] Tester création abonnement (quand MongoDB configuré)
- [ ] Tester création contrat (quand MongoDB configuré)
- [ ] Implémenter gestion d'erreurs
- [ ] Ajouter monitoring/analytics
- [ ] Tests e2e

---

**Dernière mise à jour:** 24 novembre 2025, 20h00
**Mainteneur:** RT Technologies
**Version:** 2.2.0
