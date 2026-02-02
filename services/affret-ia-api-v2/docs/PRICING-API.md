# API Pricing & Market Intelligence

Documentation des endpoints de pricing avec historique MongoDB et intégration Dashdoc.

## 📋 Table des matières

- [Vue d'ensemble](#vue-densemble)
- [Configuration](#configuration)
- [Endpoints](#endpoints)
- [Import Dashdoc](#import-dashdoc)
- [Modèle de données](#modèle-de-données)
- [Exemples d'utilisation](#exemples-dutilisation)

---

## Vue d'ensemble

Ce module permet de :
- **Stocker** l'historique des prix de transport dans MongoDB
- **Calculer** les prix moyens du marché par ligne (origine → destination)
- **Négocier** automatiquement vers le prix moyen (±10%)
- **Prioriser** les sous-traitants référencés
- **Importer** l'historique depuis Dashdoc (API v4)

---

## Configuration

### Variables d'environnement

Ajouter dans `.env` :

```bash
# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/symphonia?retryWrites=true&w=majority

# Dashdoc API
DASHDOC_API_URL=https://api.dashdoc.com/api/v4
DASHDOC_API_KEY=votre_api_key_dashdoc

# Affret.IA - Négociation
AFFRET_MAX_PRICE_INCREASE=15         # % max augmentation prix
AFFRET_AUTO_ACCEPT_THRESHOLD=0       # Seuil auto-acceptation
AFFRET_RESPONSE_TIMEOUT=24           # Timeout réponses (heures)
```

### Installation dépendances

```bash
npm install mongoose axios dotenv
```

---

## Endpoints

### 1. Récupérer l'historique des prix

**POST** `/api/v1/affretia/price-history`

Récupère l'historique des prix pour une ligne spécifique.

**Body:**
```json
{
  "route": {
    "from": "75000",  // Code postal origine
    "to": "69000"     // Code postal destination
  },
  "period": "last_6_months",  // last_month | last_3_months | last_6_months | last_year
  "vehicleType": "SEMI",      // Optionnel: VUL | 12T | 19T | SEMI
  "organizationId": "abc123"  // Optionnel: filtrer par organisation
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "route": {
      "from": "75000",
      "to": "69000"
    },
    "averagePrice": 420,
    "priceRange": {
      "min": 350,
      "max": 500,
      "stdDeviation": 45
    },
    "transactionCount": 23,
    "history": [
      {
        "orderId": "ORD-12345",
        "carrierId": "carrier-001",
        "carrierName": "TransExpress",
        "price": {
          "proposed": 450,
          "final": 420,
          "marketAverage": 420
        },
        "completedAt": "2026-01-15T10:30:00Z"
      }
    ],
    "period": "last_6_months"
  }
}
```

---

### 2. Récupérer les sous-traitants préférés

**GET** `/api/v1/affretia/preferred-subcontractors`

Récupère les sous-traitants avec lesquels l'industriel a déjà travaillé.

**Query params:**
```
industrielId=abc123           // Requis
fromPostalCode=75000          // Optionnel
toPostalCode=69000            // Optionnel
minTransports=3               // Minimum transports réalisés (défaut: 3)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subcontractors": [
      {
        "carrierId": "carrier-001",
        "carrierName": "TransExpress Premium",
        "totalTransports": 15,
        "avgPrice": 410,
        "priceRange": {
          "min": 380,
          "max": 450
        },
        "lastTransport": "2026-01-20T14:00:00Z",
        "routesCovered": 8,
        "isPreferred": true
      }
    ],
    "count": 5
  }
}
```

---

### 3. Rechercher des transporteurs disponibles

**POST** `/api/v1/affretia/search-carriers`

Recherche des transporteurs disponibles pour une ligne avec priorisation des sous-traitants.

**Body:**
```json
{
  "route": {
    "from": "75000",
    "to": "69000"
  },
  "requirements": {
    "minScore": 70,
    "vehicleTypes": ["VUL", "12T", "19T", "SEMI"],
    "maxDistance": 50,
    "priceReference": 420,
    "prioritizeSubcontractors": true,
    "organizationId": "abc123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "carriers": [
      {
        "carrierId": "carrier-001",
        "name": "TransExpress Premium",
        "score": 92,
        "distance": 12,
        "vehicleTypes": ["VUL", "12T", "19T", "SEMI"],
        "availableNow": true,
        "estimatedPrice": 415,
        "isPreferred": true,
        "historicalAvgPrice": 410
      }
    ],
    "count": 6,
    "preferredCount": 2
  }
}
```

---

### 4. Enregistrer un prix négocié

**POST** `/api/v1/affretia/record-price`

Enregistre un prix final négocié dans l'historique MongoDB.

**Body:**
```json
{
  "orderId": "ORD-12345",
  "carrierId": "carrier-001",
  "carrierName": "TransExpress",
  "route": {
    "from": "75000",
    "to": "69000",
    "fromCity": "Paris",
    "toCity": "Lyon"
  },
  "price": 415,
  "proposedPrice": 450,
  "marketAverage": 420,
  "vehicleType": "SEMI",
  "negotiationRounds": 2,
  "organizationId": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "priceId": "507f1f77bcf86cd799439011",
    "price": 415,
    "deviation": -1.19  // % écart vs prix moyen marché
  }
}
```

---

### 5. Calculer le prix cible de négociation

**POST** `/api/v1/affretia/calculate-target-price`

Calcule le prix cible basé sur le marché avec fourchette acceptable (±10%).

**Body:**
```json
{
  "route": {
    "from": "75000",
    "to": "69000"
  },
  "vehicleType": "SEMI",
  "organizationId": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "targetPrice": 420,
    "priceRange": {
      "min": 378,        // 420 - 10%
      "max": 462,        // 420 + 10%
      "stdDeviation": 45
    },
    "hasHistory": true,
    "transactionCount": 23,
    "confidence": "high"  // high | medium | low
  }
}
```

---

### 6. Importer depuis Dashdoc

**POST** `/api/v1/affretia/import/dashdoc`

Importe l'historique des transports complétés depuis Dashdoc.

**Body:**
```json
{
  "startDate": "2025-07-01T00:00:00Z",
  "endDate": "2026-02-01T00:00:00Z",
  "organizationId": "abc123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "imported": 156,
    "skipped": 12,
    "errors": [],
    "message": "156 prix importés depuis Dashdoc"
  }
}
```

---

## Import Dashdoc

### Via script CLI

```bash
# Import des 6 derniers mois
node scripts/import-dashdoc-history.js

# Import personnalisé
node scripts/import-dashdoc-history.js --months 12 --org-id industriel-001

# Mode simulation (dry-run)
node scripts/import-dashdoc-history.js --dry-run
```

### Via API

```bash
curl -X POST http://localhost:3000/api/v1/affretia/import/dashdoc \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-06-01",
    "endDate": "2026-02-01",
    "organizationId": "industriel-001"
  }'
```

### Mapping Dashdoc → Symphonia

| Dashdoc | Symphonia |
|---------|-----------|
| `origin.address.postcode` | `route.from.postalCode` |
| `destination.address.postcode` | `route.to.postalCode` |
| `carrier.pk` | `carrierId` (préfixé `dashdoc-`) |
| `carrier.name` | `carrierName` |
| `pricing.invoicing_amount` | `price.final` |
| `vehicle_type` | `transport.vehicleType` |
| `weight_kg` | `transport.weight` |
| `volume_m3` | `transport.volume` |
| `pallets_count` | `transport.palettes` |

---

## Modèle de données

### Collection: `pricehistories`

```javascript
{
  _id: ObjectId,
  orderId: String,
  carrierId: String,
  carrierName: String,

  // Route
  route: {
    from: {
      city: String,
      postalCode: String  // INDEX
    },
    to: {
      city: String,
      postalCode: String  // INDEX
    }
  },

  // Prix
  price: {
    proposed: Number,     // Prix initial proposé
    final: Number,        // Prix final négocié
    marketAverage: Number,// Prix moyen marché
    currency: String      // EUR
  },

  // Transport
  transport: {
    vehicleType: String,  // VUL | 12T | 19T | SEMI
    weight: Number,       // kg
    volume: Number,       // m3
    palettes: Number,
    distance: Number      // km
  },

  // Négociation
  negotiation: {
    rounds: Number,
    method: String,       // auto | manual | direct
    deviation: Number     // % écart vs prix moyen
  },

  // Import Dashdoc
  dashdocImport: {
    imported: Boolean,
    transportId: String,
    importedAt: Date,
    source: String        // dashdoc | manual | api
  },

  organizationId: String, // INDEX
  status: String,         // completed | cancelled | pending
  completedAt: Date,      // INDEX
  createdAt: Date
}
```

### Index MongoDB

```javascript
// Index composites pour performance
{ 'route.from.postalCode': 1, 'route.to.postalCode': 1, completedAt: -1 }
{ organizationId: 1, completedAt: -1 }
{ carrierId: 1, completedAt: -1 }
{ 'transport.vehicleType': 1, completedAt: -1 }
```

---

## Exemples d'utilisation

### Scénario 1: Négociation automatique

```javascript
// 1. Récupérer prix moyen marché
const history = await axios.post('/api/v1/affretia/price-history', {
  route: { from: '75000', to: '69000' },
  period: 'last_6_months'
});

const avgMarketPrice = history.data.data.averagePrice; // 420€

// 2. Calculer fourchette acceptable (±10%)
const minAcceptable = avgMarketPrice * 0.9;  // 378€
const maxAcceptable = avgMarketPrice * 1.1;  // 462€

// 3. Négociation
let proposedPrice = 480;  // Transporteur propose 480€

if (proposedPrice > maxAcceptable) {
  // Trop élevé, négocier vers le bas
  const diff = proposedPrice - avgMarketPrice;
  const counterOffer = proposedPrice - (diff * 0.5);  // Réduire 50% de l'écart
  // counterOffer = 450€
}

// 4. Enregistrer prix final
await axios.post('/api/v1/affretia/record-price', {
  orderId: 'ORD-12345',
  carrierId: 'carrier-001',
  carrierName: 'TransExpress',
  route: { from: '75000', to: '69000' },
  price: 450,
  proposedPrice: 480,
  marketAverage: 420,
  negotiationRounds: 2
});
```

### Scénario 2: Priorisation sous-traitants

```javascript
// 1. Récupérer sous-traitants référencés
const subcontractors = await axios.get('/api/v1/affretia/preferred-subcontractors', {
  params: {
    industrielId: 'abc123',
    fromPostalCode: '75000',
    toPostalCode: '69000'
  }
});

// 2. Rechercher transporteurs avec priorité
const carriers = await axios.post('/api/v1/affretia/search-carriers', {
  route: { from: '75000', to: '69000' },
  requirements: {
    prioritizeSubcontractors: true,
    organizationId: 'abc123',
    priceReference: 420
  }
});

// Les sous-traitants apparaissent en premier avec isPreferred: true
carriers.data.data.carriers.forEach(carrier => {
  if (carrier.isPreferred) {
    console.log(`✅ ${carrier.name} (sous-traitant référencé)`);
    console.log(`   Prix historique moyen: ${carrier.historicalAvgPrice}€`);
  }
});
```

### Scénario 3: Import initial Dashdoc

```bash
# 1. Configurer .env
echo "DASHDOC_API_KEY=votre_cle_api" >> .env
echo "DASHDOC_API_URL=https://api.dashdoc.com/api/v4" >> .env

# 2. Lancer import (12 derniers mois)
node scripts/import-dashdoc-history.js --months 12 --org-id industriel-001

# 3. Vérifier résultats
# ✅ Importés: 234
# ⏭️  Ignorés: 15
```

---

## Tests

### Test unitaire

```bash
npm test -- pricing.service.test.js
```

### Test d'intégration

```bash
# Lancer le serveur
npm run dev

# Tester les endpoints
curl -X POST http://localhost:3000/api/v1/affretia/price-history \
  -H "Content-Type: application/json" \
  -d '{"route":{"from":"75000","to":"69000"},"period":"last_6_months"}'
```

---

## Changelog

### v1.0.0 - 2026-02-02
- ✅ Création modèle PriceHistory avec index MongoDB
- ✅ Service pricing avec 6 méthodes principales
- ✅ Intégration Dashdoc API v4
- ✅ 6 nouveaux endpoints REST
- ✅ Script CLI d'import
- ✅ Négociation automatique vers prix moyen (±10%)
- ✅ Priorisation sous-traitants référencés

---

## Support

Pour toute question:
- 📧 support@symphonia.com
- 📚 [Documentation complète](https://docs.symphonia.com)
- 🐛 [Issues GitHub](https://github.com/symphonia/affret-ia/issues)
