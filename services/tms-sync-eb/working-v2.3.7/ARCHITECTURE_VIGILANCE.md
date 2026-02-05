# Architecture - Système de Vigilance

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                             │
│                   Transporteurs - Suivi Vigilance                   │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     │ HTTP REST API
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│                    RT TMS Sync API (Express)                        │
│                         Port 3000                                    │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Carriers Endpoints                                          │  │
│  │  • GET /api/v1/tms/carriers                                  │  │
│  │  • GET /api/v1/tms/carriers/:id                              │  │
│  │  • GET /api/v1/tms/carriers/:id/vigilance                    │  │
│  │  • POST /api/v1/tms/carriers/:id/vigilance/update            │  │
│  │  • POST /api/v1/tms/carriers/vigilance/update-all            │  │
│  │  • GET /api/v1/tms/carriers/vigilance/stats                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Vigilance Service                                           │  │
│  │  services/vigilance.service.js                               │  │
│  │                                                               │  │
│  │  • calculateVigilanceScore(carrierId)                        │  │
│  │  • updateCarrierVigilance(carrierId)                         │  │
│  │  • updateAllVigilanceScores()                                │  │
│  │  • getVigilanceStats()                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Scheduled Jobs                                              │  │
│  │  scheduled-jobs.js                                           │  │
│  │                                                               │  │
│  │  • carriersSync (5 min)     → Sync Dashdoc carriers         │  │
│  │  • vigilanceUpdate (1h)     → Update scores                 │  │
│  │  • symphoniaSync (1 min)    → Sync tagged transports        │  │
│  │  • autoSync (30s)           → High-frequency sync           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────┬─────────────────────┘
               │                               │
               │                               │
       ┌───────▼────────┐             ┌────────▼─────────┐
       │   MongoDB      │             │  Dashdoc API v4  │
       │                │             │                  │
       │  Collection:   │             │  /companies/     │
       │   'carriers'   │             │  /transports/    │
       │                │             │  ?is_carrier=true│
       └────────────────┘             └──────────────────┘
```

## Flux de données détaillé

### 1. Synchronisation des Carriers

```
┌──────────────┐    1. Trigger    ┌──────────────────┐
│ Scheduled Job│─────────────────>│ runCarriersSync  │
│ (5 minutes)  │                  │                  │
└──────────────┘                  └────────┬─────────┘
                                           │
                                   2. Fetch carriers
                                           │
                                  ┌────────▼────────────┐
                                  │ Dashdoc Connector   │
                                  │ syncCarriersWithStats│
                                  └────────┬────────────┘
                                           │
                          3. GET /companies/?is_carrier=true
                                           │
                                  ┌────────▼────────┐
                                  │  Dashdoc API    │
                                  │  Returns 500    │
                                  │  carriers max   │
                                  └────────┬────────┘
                                           │
                          4. For each carrier: getCarrierStats
                                           │
                                  ┌────────▼────────┐
                                  │ GET /transports/│
                                  │ ?carrier={id}   │
                                  │                 │
                                  │ Calculate:      │
                                  │ - totalOrders   │
                                  │ - lastOrderAt   │
                                  │ - onTimeRate    │
                                  └────────┬────────┘
                                           │
                              5. Map to SYMPHONI.A format
                                           │
                                  ┌────────▼────────┐
                                  │ mapCarrier()    │
                                  │                 │
                                  │ Returns:        │
                                  │ - companyName   │
                                  │ - siret, vat    │
                                  │ - totalOrders   │
                                  │ - score (%)     │
                                  └────────┬────────┘
                                           │
                                6. Upsert to MongoDB
                                           │
                                  ┌────────▼────────┐
                                  │ MongoDB         │
                                  │ carriers        │
                                  │ collection      │
                                  └─────────────────┘
```

### 2. Calcul de la Vigilance

```
┌──────────────┐    1. Trigger    ┌────────────────────┐
│ Scheduled Job│─────────────────>│runVigilanceUpdate  │
│ (1 hour)     │                  │                    │
└──────────────┘                  └─────────┬──────────┘
                                            │
                            2. Get all carriers from MongoDB
                                            │
                                   ┌────────▼─────────┐
                                   │ MongoDB          │
                                   │ carriers.find({})│
                                   └────────┬─────────┘
                                            │
                          3. For each carrier: calculateVigilanceScore
                                            │
                                   ┌────────▼─────────────────────┐
                                   │ VigilanceService             │
                                   │ calculateVigilanceScore()    │
                                   │                              │
                                   │ ┌──────────────────────────┐│
                                   │ │ 1. Documents (30 pts)    ││
                                   │ │   • SIRET: 10 pts        ││
                                   │ │   • VAT: 10 pts          ││
                                   │ │   • License: 10 pts      ││
                                   │ └──────────────────────────┘│
                                   │                              │
                                   │ ┌──────────────────────────┐│
                                   │ │ 2. Performance (40 pts)  ││
                                   │ │   • onTimeRate           ││
                                   │ │   • 95%+: 0 penalty      ││
                                   │ │   • <50%: -40 pts        ││
                                   │ └──────────────────────────┘│
                                   │                              │
                                   │ ┌──────────────────────────┐│
                                   │ │ 3. Activity (20 pts)     ││
                                   │ │   • lastOrderAt          ││
                                   │ │   • <1w: 0 penalty       ││
                                   │ │   • >6m: -20 pts         ││
                                   │ └──────────────────────────┘│
                                   │                              │
                                   │ ┌──────────────────────────┐│
                                   │ │ 4. Volume (10 pts)       ││
                                   │ │   • totalOrders          ││
                                   │ │   • 50+: 0 penalty       ││
                                   │ │   • 0: -10 pts           ││
                                   │ └──────────────────────────┘│
                                   │                              │
                                   │ ┌──────────────────────────┐│
                                   │ │ Total Score: 0-100       ││
                                   │ │ Level: N1/N2/Active/Obs  ││
                                   │ └──────────────────────────┘│
                                   └────────┬─────────────────────┘
                                            │
                                4. Update carrier in MongoDB
                                            │
                                   ┌────────▼─────────┐
                                   │ MongoDB          │
                                   │ carriers.update()│
                                   │                  │
                                   │ Set:             │
                                   │ - vigilance {}   │
                                   │ - vigilanceScore │
                                   │ - vigilanceLevel │
                                   │ - updatedAt      │
                                   └──────────────────┘
```

### 3. Requête Frontend

```
┌──────────────┐  1. HTTP GET   ┌──────────────────────────┐
│   Frontend   │───────────────>│ GET /api/v1/tms/carriers │
│   (React)    │                │ ?level=N1_premium        │
└──────────────┘                └────────┬─────────────────┘
                                         │
                              2. Query MongoDB with filters
                                         │
                                ┌────────▼──────────┐
                                │ MongoDB           │
                                │ carriers.find({   │
                                │   vigilanceLevel: │
                                │   'N1_premium'    │
                                │ })                │
                                │ .sort().limit()   │
                                └────────┬──────────┘
                                         │
                                 3. Return carriers
                                         │
┌──────────────┐  4. JSON       ┌────────▼─────────────────┐
│   Frontend   │<───────────────│ Response {               │
│   Display    │                │   success: true,         │
│   Table      │                │   total: 15,             │
│              │                │   carriers: [...]        │
│              │                │ }                        │
└──────────────┘                └──────────────────────────┘
```

## Score de Vigilance - Détail du calcul

```
Score Initial: 100 points
│
├─ Documents Légaux (-0 à -30 pts)
│  ├─ SIRET manquant/invalide: -10
│  ├─ VAT manquant: -10
│  └─ Licence manquante: -10
│
├─ Performance (-0 à -40 pts)
│  ├─ onTimeRate >= 95%: -0
│  ├─ onTimeRate 85-94%: -5
│  ├─ onTimeRate 70-84%: -15
│  ├─ onTimeRate 50-69%: -30
│  └─ onTimeRate < 50%: -40
│
├─ Activité Récente (-0 à -20 pts)
│  ├─ < 1 semaine: -0
│  ├─ 1 semaine - 1 mois: -3
│  ├─ 1-3 mois: -8
│  ├─ 3-6 mois: -15
│  ├─ > 6 mois: -20
│  └─ Aucune commande: -20
│
└─ Volume de Commandes (-0 à -10 pts)
   ├─ >= 50 commandes: -0
   ├─ 20-49 commandes: -2
   ├─ 5-19 commandes: -5
   ├─ 1-4 commandes: -8
   └─ 0 commandes: -10

= Score Final (0-100)
│
└─ Niveau assigné:
   ├─ 95-100: N1-Premium
   ├─ 85-94: N1-Référence
   ├─ 70-84: Actif
   ├─ 50-69: N2-Invité
   └─ 0-49: En Observation
```

## Structure de données MongoDB

```javascript
// Collection: carriers
{
  _id: ObjectId("67a1b2c3d4e5f6789abcdef0"),

  // ========== DONNÉES DASHDOC ==========
  externalId: "12345",
  externalSource: "dashdoc",
  remoteId: "ACME-001",

  // Infos entreprise
  companyName: "ACME Transport",
  legalName: "ACME Transport SARL",
  siret: "12345678901234",
  siren: "123456789",
  vatNumber: "FR12345678901",
  licenseNumber: "LC-2024-001",

  // Contact
  email: "contact@acme.com",
  phone: "+33123456789",
  website: "https://acme-transport.com",

  // Adresse
  address: {
    street: "123 rue du Transport",
    city: "Paris",
    postalCode: "75001",
    country: "France",
    location: {
      type: "Point",
      coordinates: [2.3522, 48.8566]  // [longitude, latitude]
    }
  },

  // ========== STATS PERFORMANCE ==========
  totalOrders: 125,
  completedOrders: 120,
  lastOrderAt: ISODate("2026-01-25T10:30:00Z"),
  score: 92,  // Taux de ponctualité Dashdoc (onTimeRate)

  // ========== VIGILANCE (CALCULÉ) ==========
  vigilance: {
    score: 85,
    level: "N1-Référence",
    levelCode: "N1_referenced",

    checks: [
      {
        type: "siret",
        status: "valid",
        impact: 0,
        value: "12345678901234",
        message: "SIRET valide"
      },
      {
        type: "vat",
        status: "valid",
        impact: 0,
        value: "FR12345678901",
        message: "TVA valide"
      },
      {
        type: "license",
        status: "valid",
        impact: 0,
        value: "LC-2024-001",
        message: "Licence valide"
      },
      {
        type: "onTimeRate",
        status: "good",
        value: 92,
        impact: -5,
        message: "Bon taux de qualité (92%)"
      },
      {
        type: "activity",
        status: "active",
        days: 5,
        impact: 0,
        message: "Actif récemment (5 jours)"
      },
      {
        type: "volume",
        status: "good",
        value: 125,
        impact: 0,
        message: "Bon volume (125 commandes)"
      }
    ],

    summary: {
      legal: [
        { type: "siret", status: "valid", impact: 0 },
        { type: "vat", status: "valid", impact: 0 },
        { type: "license", status: "valid", impact: 0 }
      ],
      performance: [
        { type: "onTimeRate", status: "good", value: 92, impact: -5 }
      ],
      activity: [
        { type: "activity", status: "active", days: 5, impact: 0 }
      ],
      volume: [
        { type: "volume", status: "good", value: 125, impact: 0 }
      ]
    },

    calculatedAt: ISODate("2026-01-30T12:00:00Z"),
    carrierId: "67a1b2c3d4e5f6789abcdef0",
    carrierName: "ACME Transport"
  },

  // Champs indexés pour requêtes rapides
  vigilanceScore: 85,
  vigilanceLevel: "N1_referenced",
  vigilanceUpdatedAt: ISODate("2026-01-30T12:00:00Z"),

  // ========== SYNC METADATA ==========
  lastSyncAt: ISODate("2026-01-30T11:55:00Z"),
  tmsConnectionId: "67a1b2c3d4e5f6789abcdef1",

  // ========== AUTRES ==========
  status: "active",
  level: "N1_referenced",
  isVerified: true,
  accountType: "carrier",
  logo: "https://...",
  tags: ["Premium", "France"],
  country: "FR",
  legalForm: "SARL",

  documentsStatus: {
    valid: 7,
    expiringSoon: 0,
    expired: 0,
    missing: 0
  }
}
```

## API Response Examples

### GET /api/v1/tms/carriers

```json
{
  "success": true,
  "total": 150,
  "limit": 50,
  "skip": 0,
  "carriers": [
    {
      "_id": "67a1b2c3d4e5f6789abcdef0",
      "companyName": "ACME Transport",
      "siret": "12345678901234",
      "vigilanceScore": 85,
      "vigilanceLevel": "N1_referenced",
      "vigilance": {
        "score": 85,
        "level": "N1-Référence",
        "levelCode": "N1_referenced"
      },
      "lastOrderAt": "2026-01-25T10:30:00Z",
      "totalOrders": 125
    }
  ]
}
```

### GET /api/v1/tms/carriers/:id/vigilance

```json
{
  "success": true,
  "vigilance": {
    "score": 85,
    "level": "N1-Référence",
    "levelCode": "N1_referenced",
    "checks": [
      {
        "type": "siret",
        "status": "valid",
        "impact": 0,
        "value": "12345678901234",
        "message": "SIRET valide"
      }
    ],
    "summary": {
      "legal": [...],
      "performance": [...],
      "activity": [...],
      "volume": [...]
    },
    "calculatedAt": "2026-01-30T12:00:00Z",
    "carrierId": "67a1b2c3d4e5f6789abcdef0",
    "carrierName": "ACME Transport"
  }
}
```

### GET /api/v1/tms/carriers/vigilance/stats

```json
{
  "success": true,
  "stats": {
    "total": 150,
    "byLevel": {
      "N1_premium": 12,
      "N1_referenced": 45,
      "active": 58,
      "N2_guest": 28,
      "observation": 7
    },
    "byScoreRange": {
      "excellent": 15,
      "good": 52,
      "medium": 61,
      "low": 18,
      "poor": 4
    },
    "averageScore": 72,
    "withVigilance": 145,
    "withoutVigilance": 5
  }
}
```

## Indexation MongoDB recommandée

```javascript
// Pour optimiser les performances des requêtes
db.carriers.createIndex({ "vigilanceLevel": 1 });
db.carriers.createIndex({ "vigilanceScore": -1 });
db.carriers.createIndex({ "companyName": "text", "siret": "text" });
db.carriers.createIndex({ "lastSyncAt": -1 });
db.carriers.createIndex({ "externalSource": 1, "externalId": 1 }, { unique: true });
```

## Monitoring et Logs

Les logs des jobs incluent:

```
🔄 [CRON] Running carriers sync...
[CRON CARRIERS] Fetching carriers with stats...
✅ [CRON CARRIERS] 125 carriers synchronized

🔄 [CRON] Running vigilance update...
[VIGILANCE] Starting update for 125 carriers...
[VIGILANCE] ✓ ACME Transport: 85% (N1-Référence)
[VIGILANCE] ✓ XYZ Logistics: 92% (N1-Premium)
[VIGILANCE] ✗ ABC Freight: Error calculating score
✅ [CRON VIGILANCE] 124/125 carriers updated
⚠️  [CRON VIGILANCE] 1 failures
```

## Performance

- Calcul de vigilance : **< 10ms** par carrier
- Sync 500 carriers : **~30 secondes**
- Update vigilance (100 carriers) : **~1 seconde**
- Query MongoDB (filtrée) : **< 50ms**
