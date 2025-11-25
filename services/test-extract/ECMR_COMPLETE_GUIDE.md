# Guide Complet e-CMR - RT Backend Services

**Version:** 2.0.0
**Date:** 24 novembre 2025
**Status:** ✅ Implémentation Complète (sans Yousign pour l'instant)

---

## 📋 Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Endpoints API](#endpoints-api)
4. [Modèle de Données](#modèle-de-données)
5. [Workflow Complet](#workflow-complet)
6. [Génération PDF](#génération-pdf)
7. [Archivage Légal](#archivage-légal)
8. [Intégration Yousign](#intégration-yousign)
9. [Tests](#tests)
10. [Déploiement](#déploiement)

---

## 🎯 Vue d'Ensemble

Le système e-CMR implémente une solution complète de lettre de voiture électronique conforme à:
- **Convention CMR (1956)** - Convention relative au contrat de transport international de marchandises par route
- **Protocole e-CMR (2008)** - Extension électronique de la Convention CMR
- **Règlement eIDAS (2014)** - Cadre européen pour les signatures électroniques

### ✅ Ce qui est Implémenté

| Fonctionnalité | Status | Description |
|----------------|--------|-------------|
| **Modèle e-CMR complet** | ✅ Fait | Tous les champs obligatoires selon Convention CMR |
| **API REST complète** | ✅ Fait | 12 endpoints pour CRUD et workflow |
| **Signatures électroniques** | ✅ Simple | Signature simple avec géolocalisation |
| **Génération PDF/A** | ✅ Fait | PDF conforme avec QR code de vérification |
| **Archivage S3 Glacier** | ✅ Fait | Archivage légal 10 ans (prêt à activer) |
| **Intégration Yousign** | ⏳ Prêt | Structure complète, à activer avec clé API |
| **Suivi GPS** | ✅ Fait | Tracking temps réel |
| **Réserves/anomalies** | ✅ Fait | Signalement avec photos |

---

## 🏗️ Architecture

### Modules

```
subscriptions-contracts-eb/
├── ecmr-models.js      # Modèle de données e-CMR complet
├── ecmr-routes.js      # Routes API REST e-CMR
├── ecmr-pdf.js         # Génération PDF/A + QR code
├── ecmr-archive.js     # Archivage S3 Glacier
├── ecmr-yousign.js     # Intégration Yousign (prêt)
└── index.js            # Service principal
```

### Base de Données

**MongoDB Collections:**
- `contracts` - Tous les e-CMR (type: 'ECMR')
- `signatures` - Historique des signatures
- `tracking` - Positions GPS (optionnel)

---

## 🔌 Endpoints API

### Base URL
```
https://dgze8l03lwl5h.cloudfront.net/api/ecmr
```

### 1. CRUD e-CMR

#### GET /api/ecmr
Liste tous les e-CMR

**Query Parameters:**
- `status` - Filtrer par statut (DRAFT, PENDING_SIGNATURES, IN_TRANSIT, DELIVERED, SIGNED)
- `limit` - Nombre de résultats (défaut: 50)
- `offset` - Pagination (défaut: 0)

**Exemple:**
```bash
curl "https://dgze8l03lwl5h.cloudfront.net/api/ecmr?status=IN_TRANSIT&limit=10"
```

**Réponse:**
```json
{
  "success": true,
  "data": [...],
  "count": 10,
  "total": 45,
  "offset": 0,
  "limit": 10
}
```

#### POST /api/ecmr
Créer un nouvel e-CMR

**Body:**
```json
{
  "sender": {
    "name": "Acme Corp",
    "address": {
      "street": "123 rue de Paris",
      "postalCode": "75001",
      "city": "Paris",
      "country": "FR"
    },
    "contact": {
      "phone": "+33612345678",
      "email": "sender@acme.com"
    }
  },
  "consignee": {
    "name": "Import GmbH",
    "address": {
      "street": "456 Hauptstraße",
      "postalCode": "10115",
      "city": "Berlin",
      "country": "DE"
    },
    "contact": {
      "phone": "+4912345678",
      "email": "receiving@import.de"
    }
  },
  "carrier": {
    "name": "Transport SA",
    "licenseNumber": "TR-123456",
    "vehicle": {
      "registrationNumber": "AB-123-CD"
    },
    "driver": {
      "name": "Jean Dupont",
      "licenseNumber": "DRV-789",
      "phone": "+33698765432"
    },
    "contact": {
      "phone": "+33145678901",
      "email": "dispatch@transport.fr"
    },
    "address": {
      "street": "789 Route Nationale",
      "postalCode": "69000",
      "city": "Lyon",
      "country": "FR"
    }
  },
  "places": {
    "loading": {
      "address": {
        "street": "123 rue de Paris",
        "postalCode": "75001",
        "city": "Paris",
        "country": "FR"
      },
      "date": "2025-12-01T08:00:00Z"
    },
    "delivery": {
      "address": {
        "street": "456 Hauptstraße",
        "postalCode": "10115",
        "city": "Berlin",
        "country": "DE"
      },
      "date": "2025-12-03T18:00:00Z"
    }
  },
  "goods": {
    "description": "Pièces automobiles - Freins et plaquettes",
    "weight": {
      "gross": 5000
    },
    "packages": {
      "count": 100,
      "type": "Palettes EUR"
    },
    "dangerousGoods": {
      "isDangerous": false
    }
  },
  "instructions": {
    "paymentTerms": {
      "method": "Port payé",
      "paymentBy": "SENDER"
    }
  }
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "_id": "674...",
    "cmrNumber": "ECMR-1732483200000-1234",
    "status": "DRAFT",
    ...
  },
  "message": "e-CMR created successfully"
}
```

#### PUT /api/ecmr/:id
Mettre à jour un e-CMR (seulement si status !== SIGNED)

#### DELETE /api/ecmr/:id
Supprimer un e-CMR (seulement si status === DRAFT)

### 2. Workflow e-CMR

#### POST /api/ecmr/:id/validate
Valider et envoyer pour signatures

**Effet:**
- Valide tous les champs obligatoires
- Change le statut vers `PENDING_SIGNATURES`
- Prêt pour signatures

#### POST /api/ecmr/:id/sign/:party
Signer l'e-CMR

**Parties possibles:**
- `sender` - Signature expéditeur
- `carrierPickup` - Signature transporteur (prise en charge)
- `consignee` - Signature destinataire (livraison)

**Body:**
```json
{
  "signatureData": "data:image/png;base64,iVBORw0KGgo...",
  "signedBy": "Jean Dupont",
  "geolocation": {
    "latitude": 48.8566,
    "longitude": 2.3522
  }
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    ...e-CMR avec signature mise à jour
  },
  "signature": {
    "_id": "674...",
    "signedAt": "2025-12-01T10:30:00Z"
  },
  "message": "e-CMR signed by carrierPickup successfully"
}
```

**États après signature:**
- Expéditeur signe → reste `PENDING_SIGNATURES`
- Transporteur signe → passe à `IN_TRANSIT`
- Destinataire signe (et les 2 autres déjà signés) → passe à `SIGNED`

### 3. Réserves et Anomalies

#### POST /api/ecmr/:id/remarks
Ajouter des réserves (chargement ou livraison)

**Body:**
```json
{
  "type": "delivery",
  "description": "2 cartons endommagés, coin supérieur droit",
  "photos": [
    "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  ]
}
```

### 4. Suivi GPS

#### POST /api/ecmr/:id/tracking
Mettre à jour la position GPS

**Body:**
```json
{
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "lastPosition": {
      "latitude": 48.8566,
      "longitude": 2.3522,
      "timestamp": "2025-12-01T12:00:00Z"
    },
    "totalPositions": 45
  }
}
```

### 5. Vérification

#### GET /api/ecmr/:cmrNumber/verify
Vérifier l'authenticité d'un e-CMR via son numéro

**Exemple:**
```bash
curl "https://dgze8l03lwl5h.cloudfront.net/api/ecmr/ECMR-1732483200000-1234/verify"
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "cmrNumber": "ECMR-1732483200000-1234",
    "status": "SIGNED",
    "sender": { "name": "Acme Corp" },
    "consignee": { "name": "Import GmbH" },
    "carrier": { "name": "Transport SA" },
    "createdAt": "2025-12-01T08:00:00Z",
    "signatures": {
      "sender": "SIGNED",
      "carrier": "SIGNED",
      "consignee": "SIGNED"
    }
  },
  "verified": true
}
```

---

## 📊 Modèle de Données

### Structure e-CMR Complète

Voir `ecmr-models.js` pour le schéma complet. Voici les sections principales:

```javascript
{
  // Général
  type: 'ECMR',
  status: 'DRAFT' | 'PENDING_SIGNATURES' | 'IN_TRANSIT' | 'DELIVERED' | 'SIGNED',
  cmrNumber: 'ECMR-1732483200000-1234',

  // Parties
  sender: { ... },      // Expéditeur
  consignee: { ... },   // Destinataire
  carrier: { ... },     // Transporteur + véhicule + conducteur

  // Lieux
  places: {
    loading: { ... },   // Lieu de chargement + date
    delivery: { ... }   // Lieu de livraison + date
  },

  // Marchandises
  goods: {
    description: '...',
    weight: { gross: 5000 },
    packages: { count: 100, type: 'Palettes' },
    dangerousGoods: { isDangerous: false },
    ...
  },

  // Instructions
  instructions: {
    paymentTerms: { method: 'Port payé', paymentBy: 'SENDER' },
    specialInstructions: '...',
    ...
  },

  // Réserves
  remarks: {
    loadingRemarks: { ... },
    deliveryRemarks: { ... }
  },

  // Signatures
  signatures: {
    sender: { status: 'SIGNED', signedAt: '...', ... },
    carrierPickup: { ... },
    consignee: { ... }
  },

  // Suivi GPS
  tracking: {
    enabled: true,
    lastPosition: { latitude: 48.8566, longitude: 2.3522 },
    positions: [ ... ]
  },

  // Métadonnées
  metadata: {
    createdAt: '...',
    archived: false,
    pdfGenerated: false,
    s3Key: '...',        // Si archivé
    archiveId: '...',    // Si Glacier
    ...
  }
}
```

---

## 🔄 Workflow Complet

```
1. CRÉATION
   └─> POST /api/ecmr
       Status: DRAFT

2. MODIFICATION (optionnel)
   └─> PUT /api/ecmr/:id
       Status: DRAFT

3. VALIDATION
   └─> POST /api/ecmr/:id/validate
       Status: PENDING_SIGNATURES
       Vérifie tous les champs obligatoires

4. SIGNATURE EXPÉDITEUR
   └─> POST /api/ecmr/:id/sign/sender
       Status: PENDING_SIGNATURES

5. PRISE EN CHARGE + SIGNATURE TRANSPORTEUR
   └─> POST /api/ecmr/:id/sign/carrierPickup
       Status: IN_TRANSIT
       Début du transport

6. SUIVI GPS (pendant transport)
   └─> POST /api/ecmr/:id/tracking (multiple fois)
       Status: IN_TRANSIT

7. RÉSERVES (si nécessaire)
   └─> POST /api/ecmr/:id/remarks
       type: 'loading' ou 'delivery'

8. LIVRAISON + SIGNATURE DESTINATAIRE
   └─> POST /api/ecmr/:id/sign/consignee
       Status: SIGNED
       Toutes les signatures complètes!

9. GÉNÉRATION PDF (automatique ou manuel)
   └─> Génère PDF/A avec QR code
       metadata.pdfGenerated: true

10. ARCHIVAGE (automatique ou manuel)
    └─> Archive dans S3/Glacier pour 10 ans
        metadata.archived: true
```

---

## 📄 Génération PDF

Le module `ecmr-pdf.js` génère des PDFs conformes PDF/A avec:

- ✅ Toutes les informations e-CMR
- ✅ QR Code de vérification
- ✅ Hash SHA-256 du document
- ✅ Statut des signatures
- ✅ Horodatage
- ✅ Conformité CMR et e-CMR

**Utilisation:**

```javascript
const { generateECMRPdf } = require('./ecmr-pdf');

// Générer PDF
const pdfBuffer = await generateECMRPdf(ecmrData, {
  includeQRCode: true,
  baseUrl: 'https://dgze8l03lwl5h.cloudfront.net'
});

// Sauvegarder
fs.writeFileSync('ecmr.pdf', pdfBuffer);
```

**Dépendances:**
```bash
npm install pdfkit qrcode
```

---

## 💾 Archivage Légal

Le module `ecmr-archive.js` gère l'archivage conforme pour 10 ans:

### Option 1: S3 Standard-IA (Recommandé)

**Coût:** ~0.0125$/GB/mois
**Avantages:** Accès rapide, transition automatique vers Glacier

```javascript
const { archiveToS3 } = require('./ecmr-archive');

const result = await archiveToS3(ecmrData, pdfBuffer);
// result.s3Key = "ecmr/ECMR-xxx/123456.pdf"
```

### Option 2: Glacier Deep Archive

**Coût:** ~0.001$/GB/mois (le moins cher)
**Avantages:** Très économique pour archivage long terme
**Inconvénient:** Récupération lente (12-48h)

```javascript
const { archiveToGlacier } = require('./ecmr-archive');

const result = await archiveToGlacier(ecmrData, pdfBuffer);
// result.archiveId = "xxx..."
```

### Configuration S3

```bash
# 1. Créer bucket
aws s3 mb s3://rt-ecmr-archive --region eu-central-1

# 2. Configurer lifecycle (transition automatique vers Glacier)
aws s3api put-bucket-lifecycle-configuration \
  --bucket rt-ecmr-archive \
  --lifecycle-configuration file://lifecycle-policy.json

# 3. Configurer EB
eb setenv \
  S3_ECMR_BUCKET="rt-ecmr-archive" \
  GLACIER_VAULT="rt-ecmr-vault"
```

**Coûts Estimés (1000 e-CMR/mois, 1MB chacun):**
- S3 Standard-IA: **0.0125$/mois** (12.5 cents!)
- Glacier: **0.004$/mois** (4 cents!)
- Deep Archive: **0.001$/mois** (1 cent!)

---

## 🔐 Intégration Yousign

Le module `ecmr-yousign.js` est prêt pour l'intégration Yousign (signature qualifiée eIDAS).

### Pourquoi Yousign?

- ✅ **Signature qualifiée** conforme eIDAS
- ✅ **Valeur légale maximale** (équivalent signature manuscrite)
- ✅ **Certificat numérique** inclus
- ✅ **Horodatage qualifié**
- ✅ **Audit trail complet**
- ✅ **Archivage légal 10 ans** inclus

### Configuration (quand clé disponible)

```bash
# 1. Obtenir clé API sur https://yousign.com
# 2. Configurer EB
eb setenv \
  YOUSIGN_API_KEY="votre_cle_api" \
  YOUSIGN_ENV="production" \
  YOUSIGN_WEBHOOK_URL="https://dgze8l03lwl5h.cloudfront.net/api/webhooks/yousign"

# 3. Activer dans le code
# Décommenter l'implémentation dans ecmr-yousign.js
```

### Coûts Yousign

- **Plan Essentiel:** 1€/signature
- **Minimum:** 50 signatures/mois = 50€/mois
- **Plan Pro:** 1.50€/signature + fonctionnalités avancées

### Alternative: Signature Simple (Actuelle)

Pour l'instant, le système utilise la signature simple (gratuite) qui est suffisante pour les tests et MVP. Yousign peut être activé plus tard pour la conformité légale maximale.

---

## 🧪 Tests

Créer un e-CMR de test complet:

```bash
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/ecmr \
  -H "Content-Type: application/json" \
  -d @test-ecmr.json
```

Tester le workflow complet - voir le script PowerShell dans le dépôt.

---

## 🚀 Déploiement

### Dépendances à Installer

```bash
cd services/subscriptions-contracts-eb
npm install pdfkit qrcode @aws-sdk/client-s3 @aws-sdk/client-glacier
```

### Déployer sur Elastic Beanstalk

```bash
eb deploy
```

### Variables d'Environnement

```bash
eb setenv \
  MONGODB_URI="mongodb+srv://..." \
  S3_ECMR_BUCKET="rt-ecmr-archive" \
  GLACIER_VAULT="rt-ecmr-vault" \
  YOUSIGN_API_KEY="votre_cle" \
  BASE_URL="https://dgze8l03lwl5h.cloudfront.net"
```

---

## 📚 Ressources

### Documentation Légale
- [Convention CMR (1956)](https://unece.org/fileadmin/DAM/trans/conventn/cmr_f.pdf)
- [Protocole e-CMR (2008)](https://unece.org/fileadmin/DAM/trans/conventn/e-CMR-Protocol-f.pdf)
- [Règlement eIDAS](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32014R0910)

### Intégrations
- [Yousign API](https://developers.yousign.com/)
- [AWS S3 Glacier](https://docs.aws.amazon.com/glacier/)
- [MongoDB Atlas](https://docs.atlas.mongodb.com/)

---

## 🎯 Résumé

### ✅ Implémenté

| Fonctionnalité | Module | Status |
|----------------|--------|--------|
| Modèle e-CMR complet | `ecmr-models.js` | ✅ Fait |
| 12 Endpoints REST | `ecmr-routes.js` | ✅ Fait |
| Génération PDF/A + QR | `ecmr-pdf.js` | ✅ Fait |
| Archivage S3/Glacier | `ecmr-archive.js` | ✅ Fait (prêt) |
| Structure Yousign | `ecmr-yousign.js` | ✅ Prêt (clé API manquante) |
| Signatures simples | `ecmr-routes.js` | ✅ Fait |
| Suivi GPS | `ecmr-routes.js` | ✅ Fait |
| Réserves/anomalies | `ecmr-routes.js` | ✅ Fait |

### ⏳ À Activer Plus Tard

- Yousign (quand clé API disponible)
- Archivage S3/Glacier (quand bucket créé)

**Version:** 2.0.0
**Créé le:** 24 novembre 2025
**Mainteneur:** RT Technologies
