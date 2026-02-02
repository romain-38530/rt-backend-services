# Implementation Jours 8-11 - SYMPHONI.A

## Vue d'ensemble

Cette implementation couvre les jours 8 a 11 du plan de developpement, incluant:
- Dashboards Carrier Scoring et TMS Real-Time (Jours 8-9)
- Analytics Affret.IA (Jour 10)
- CloudWatch Metrics Integration (Jour 11)

## Jour 8-9: Dashboards Carrier Scoring + TMS Real-Time

### Backend: Routes Carrier Scoring

**Fichiers crees:**
- `services/authz-eb/routes/carrier-scoring.js`

**Endpoints:**

#### GET /api/v1/carriers/leaderboard
Classement des transporteurs par score.

**Query Parameters:**
- `limit` (default: 20) - Nombre de resultats
- `minTransports` (default: 5) - Nombre minimum de transports notes
- `level` - Filtrer par niveau (bronze, silver, gold, platinum)
- `status` - Filtrer par statut (active, pending, suspended)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "carrierId": "carrier-123",
      "carrierName": "Transport ABC",
      "company": "ABC Logistique",
      "rank": 1,
      "averageScores": {
        "overall": 92,
        "punctualityPickup": 95,
        "punctualityDelivery": 90,
        "appointmentRespect": 88,
        "trackingReactivity": 94,
        "podDelay": 91,
        "incidentsManaged": 93,
        "delaysJustified": 87
      },
      "trend": {
        "direction": "up",
        "change": 3.5
      },
      "stats": {
        "totalScored": 45,
        "lastScoreDate": "2026-01-30T10:00:00Z"
      },
      "level": "gold",
      "status": "active"
    }
  ],
  "count": 20
}
```

#### GET /api/v1/carriers/:id/score
Score detaille d'un transporteur.

**Response:**
```json
{
  "success": true,
  "data": {
    "carrierId": "carrier-123",
    "carrierName": "Transport ABC",
    "averageScores": { ... },
    "trend": { ... },
    "stats": { ... },
    "rank": 5,
    "carrier": {
      "company": "ABC Logistique",
      "email": "contact@abc.com",
      "level": "gold",
      "status": "active"
    }
  }
}
```

#### GET /api/v1/carriers/:id/score-history
Historique des scores d'un transporteur.

**Query Parameters:**
- `limit` (default: 50)
- `startDate` - Date de debut (ISO 8601)
- `endDate` - Date de fin (ISO 8601)

#### GET /api/v1/carriers/:id/benchmark
Benchmark d'un transporteur vs la moyenne du marche.

**Response:**
```json
{
  "success": true,
  "data": {
    "carrier": {
      "carrierId": "carrier-123",
      "carrierName": "Transport ABC",
      "scores": { ... }
    },
    "marketAverage": {
      "punctualityPickup": 75,
      "punctualityDelivery": 78,
      ...
    },
    "comparison": {
      "punctualityPickup": +20,
      "punctualityDelivery": +12,
      ...
      "overall": +17
    },
    "rank": 5,
    "totalCarriers": 150,
    "percentile": 3
  }
}
```

### Frontend: Dashboard Carrier Scoring

**Fichier cree:**
- `rt-frontend-apps/apps/web-transporter/pages/admin/carrier-scoring.tsx`

**Fonctionnalites:**

1. **Tab Leaderboard:**
   - Table avec ranking, score, trend, level, status
   - Filtres: level, status, limit
   - Icons pour top 3 (medailles)
   - Badges colores par niveau et statut

2. **Tab My Score:**
   - Gauge chart du score global (react-gauge-chart)
   - Card avec details des criteres
   - Stats: rang, transports notes, dernier score

3. **Tab Benchmark:**
   - Radar chart (ApexCharts) comparant carrier vs moyenne marche
   - Liste des ecarts par critere
   - Stats: rang, percentile, score vs marche

4. **Tab Tendances:**
   - Line chart d'evolution du score (30 derniers jours)
   - Table d'historique recent (10 derniers scores)

**Dependencies requises:**
```json
{
  "react-gauge-chart": "^0.4.1",
  "react-apexcharts": "^1.4.0",
  "apexcharts": "^3.41.0"
}
```

### Frontend: Dashboard TMS Real-Time

**Fichier cree:**
- `rt-frontend-apps/apps/web-transporter/pages/admin/tms-realtime.tsx`

**Fonctionnalites:**

1. **Status Cards (auto-refresh 30s):**
   - Last Sync
   - Active Connections
   - Orders Synced
   - GPS Available
   - Errors
   - Uptime

2. **Tab Live Transports:**
   - Table avec reference, transporteur, statut, enlevement, livraison, TMS, GPS, derniere MAJ
   - Badge "LIVE" avec animation
   - Indicateur GPS (vert si disponible)

3. **Tab Connections Status:**
   - Cards par connexion TMS
   - Statut, derniere sync, taux de reussite
   - Affichage des erreurs

4. **Tab Sync History:**
   - Table des logs de synchronisation
   - Timestamp, connexion, statut, items synced, duree, details

5. **Tab GPS Map:**
   - Carte interactive (react-leaflet)
   - Markers pour enlevements et livraisons
   - Popups avec details des transports

**Dependencies requises:**
```json
{
  "react-leaflet": "^4.2.0",
  "leaflet": "^1.9.4"
}
```

**Note:** Ajouter dans `_app.tsx`:
```tsx
import 'leaflet/dist/leaflet.css';
```

## Jour 10: Analytics Affret.IA

### Backend: Routes Analytics

**Fichier cree:**
- `services/affret-ia-api-v2/routes/analytics-routes.js`

**Endpoints:**

#### GET /api/v1/affretia/analytics/conversion
Funnel de conversion du trial Affret.IA.

**Query Parameters:**
- `startDate` - Date de debut
- `endDate` - Date de fin
- `carrierId` - Filtrer par carrier

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "steps": {
      "step1_start": 150,
      "step2_doc_upload": 120,
      "step3_info_complete": 100,
      "step4_tms_connect": 75,
      "step5_first_affret": 50,
      "step6_conversion": 30
    },
    "rates": {
      "start_to_doc": 80,
      "doc_to_info": 67,
      "info_to_tms": 50,
      "tms_to_affret": 33,
      "affret_to_conversion": 20,
      "overall": 20
    },
    "dropOffs": {
      "start_to_doc": 30,
      "doc_to_info": 20,
      ...
    }
  }
}
```

#### GET /api/v1/affretia/analytics/blockers
Analyse des blockers dans le funnel.

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 45,
    "resolved": 20,
    "pending": 25,
    "byType": {
      "missing_documents": 15,
      "invalid_documents": 10,
      "incomplete_profile": 8,
      "tms_connection_failed": 7,
      "payment_failed": 3,
      "vigilance_alert": 2
    },
    "byStep": {
      "document_upload": 25,
      "info_complete": 8,
      "tms_connect": 7,
      "conversion": 5
    },
    "topBlockers": [
      { "type": "missing_documents", "count": 15 },
      { "type": "invalid_documents", "count": 10 },
      ...
    ]
  }
}
```

#### GET /api/v1/affretia/analytics/timeline
Timeline des etapes par jour.

**Query Parameters:**
- `startDate`
- `endDate`
- `step` - Filtrer par etape specifique

**Response:**
```json
{
  "success": true,
  "data": {
    "2026-01-15": {
      "trial_start": 12,
      "document_upload": 8,
      "info_complete": 5
    },
    "2026-01-16": {
      "trial_start": 15,
      "document_upload": 10,
      ...
    }
  }
}
```

#### GET /api/v1/affretia/analytics/carriers/:carrierId/journey
Journey complet d'un carrier dans le funnel.

**Response:**
```json
{
  "success": true,
  "data": {
    "carrierId": "carrier-123",
    "metrics": {
      "totalSteps": 5,
      "currentStep": "tms_connect",
      "startDate": "2026-01-15T10:00:00Z",
      "lastUpdate": "2026-01-20T14:30:00Z",
      "durationDays": 5,
      "hasBlockers": true,
      "blockers": [
        {
          "step": "document_upload",
          "type": "invalid_documents",
          "reason": "Document rejected",
          "resolved": true,
          "createdAt": "2026-01-16T10:00:00Z"
        }
      ],
      "completed": false
    },
    "timeline": [
      {
        "step": "trial_start",
        "timestamp": "2026-01-15T10:00:00Z",
        "metadata": {},
        "blocker": null
      },
      {
        "step": "document_upload",
        "timestamp": "2026-01-16T10:00:00Z",
        "metadata": { "documentType": "kbis" },
        "blocker": { "blocked": true, ... }
      },
      ...
    ]
  }
}
```

### Collection MongoDB

**Schema: affretia_trial_tracking**

```javascript
{
  carrierId: String,          // ID du carrier
  carrierEmail: String,       // Email
  companyName: String,        // Nom entreprise
  step: String,               // Etape du funnel
  metadata: Object,           // Metadata specifique a l'etape
  source: String,             // Source (web, email, sms, api)
  ipAddress: String,
  userAgent: String,
  sessionId: String,
  blocker: {
    blocked: Boolean,
    type: String,
    reason: String,
    details: Object,
    resolvedAt: Date,
    resolved: Boolean
  },
  campaign: Object,
  referrer: String,
  utm: Object,
  timeSpent: Number,
  createdAt: Date
}
```

**Steps enum:**
- `trial_start` - Debut du trial
- `document_upload` - Upload de document
- `info_complete` - Informations completes
- `tms_connect` - Connexion TMS
- `first_affret` - Premier affret
- `conversion` - Conversion finale

**Blocker types:**
- `missing_documents`
- `invalid_documents`
- `incomplete_profile`
- `tms_connection_failed`
- `payment_failed`
- `vigilance_alert`
- `manual_review`
- `other`

### Integration Analytics Tracker

**Fichier cree:**
- `services/authz-eb/helpers/analytics-tracker.js`

**Fonctions:**
- `trackTrialStart(carrier, req)` - Track debut trial
- `trackDocumentUpload(carrier, document, req)` - Track upload doc
- `trackInfoComplete(carrier, req)` - Track completion infos
- `trackTMSConnect(carrier, connection, req)` - Track connexion TMS
- `trackFirstAffret(carrier, affret, req)` - Track premier affret
- `trackConversion(carrier, subscription, req)` - Track conversion
- `resolveBlocker(carrierId, step)` - Resoudre un blocker

**Integration dans authz-eb/carriers.js:**
- Track document upload dans `/api/carriers/:carrierId/documents/confirm-upload`
- Track conversion dans `/api/carriers/onboard`

## Jour 11: CloudWatch Metrics

### Module CloudWatch

**Fichier existant:**
- `infra/monitoring/cloudwatch-metrics.js`

**Classes:**
- `CloudWatchMetrics` - Classe de base
- `TMSSyncMetrics` - Metriques TMS Sync
- `AffretIAMetrics` - Metriques Affret.IA

**Methodes principales:**
```javascript
// Envoyer une metrique
await metrics.sendMetric(name, value, unit, dimensions);

// Incrementer un compteur
await metrics.incrementCounter(name, dimensions);

// Enregistrer une duree
await metrics.recordDuration(name, durationMs, dimensions);

// Enregistrer une taille
await metrics.recordSize(name, sizeBytes, dimensions);

// Mesurer temps d'execution
await metrics.measureExecutionTime(name, fn, dimensions);

// Flush manuel
await metrics.flush();
```

### Integration TMS Sync

**Fichier modifie:**
- `services/tms-sync-eb/scheduled-jobs.js`

**Metriques envoyees:**
- `TMS-Sync-Success` - Sync reussie (Count)
- `TMS-Sync-Failure` - Sync echouee (Count)
- `TMS-Sync-Duration` - Duree de sync (Milliseconds)
- `TMS-Sync-Items` - Nombre d'items synced (Count)

**Code integration:**
```javascript
const { TMSSyncMetrics } = require('../../infra/monitoring/cloudwatch-metrics');

let metrics = new TMSSyncMetrics({ enabled: true });

// Dans runAutoSync:
await metrics.recordSyncSuccess(duration, itemCount);
// ou
await metrics.recordSyncFailure(duration, errorType);
```

### Integration Authz-EB

**Fichiers modifies:**
- `services/authz-eb/carriers.js`
- `services/authz-eb/email.js`

**Metriques Carriers:**
- `Carrier-Document-Upload` - Upload de document (Count)
  - Dimensions: DocumentType, Status

**Metriques Email:**
- `Email-Sent-Success` - Email envoye avec succes (Count)
- `Email-Sent-Failure` - Email echoue (Count)
- `Email-Send-Duration` - Duree d'envoi (Milliseconds)
  - Dimensions: Type, Status

### Integration Affret.IA

**Fichier modifie:**
- `services/affret-ia-api-v2/index.js`

**Metriques envoyees:**
- `Affret-IA-Requests` - Requetes AI (Count)
- `Affret-IA-Success` - Requetes reussies (Count)
- `Affret-IA-Errors` - Requetes echouees (Count)
- `Affret-IA-Processing-Time` - Temps de traitement (Milliseconds)
- `Affret-IA-Match-Count` - Nombre de matches (Count)
- `Affret-IA-Matching-Duration` - Duree de matching (Milliseconds)

**Code integration:**
```javascript
const { AffretIAMetrics } = require('../../infra/monitoring/cloudwatch-metrics');

let metrics = new AffretIAMetrics({ enabled: true });

// Dans /api/v1/affret-ia/search:
await metrics.recordAIRequest(duration, success);
await metrics.recordMatchingResult(matchCount, duration);
```

## Scripts de Test

### test-carrier-scoring.js

Test des endpoints de scoring:
- Leaderboard
- Carrier score
- Score history
- Benchmark
- Filtres

**Execution:**
```bash
cd rt-backend-services
node tests/test-carrier-scoring.js
```

**Variables d'environnement:**
- `API_URL` - URL de l'API authz-eb (default: http://localhost:3000)
- `SCORING_API_URL` - URL de l'API scoring (default: http://localhost:3016)

### test-affretia-analytics.js

Test des endpoints analytics Affret.IA:
- Conversion funnel
- Blockers analysis
- Timeline
- Carrier journey

**Execution:**
```bash
cd rt-backend-services
node tests/test-affretia-analytics.js
```

**Variables d'environnement:**
- `AFFRET_IA_API_URL` - URL de l'API Affret.IA (default: http://localhost:3017)
- `MONGODB_URI` - URI MongoDB

### test-cloudwatch-metrics.js

Test de l'integration CloudWatch:
- Metriques basiques
- TMS Sync metrics
- Affret.IA metrics
- Buffering
- Execution time measurement

**Execution:**
```bash
cd rt-backend-services
node tests/test-cloudwatch-metrics.js
```

**Pre-requis:**
- Variables AWS configurees: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

## Configuration requise

### Variables d'environnement

**authz-eb:**
```bash
SCORING_API_URL=http://localhost:3016
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

**tms-sync-eb:**
```bash
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

**affret-ia-api-v2:**
```bash
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Dependencies NPM

**Frontend (web-transporter):**
```bash
npm install react-gauge-chart react-apexcharts apexcharts react-leaflet leaflet
```

**Backend (tous les services):**
Les dependencies AWS SDK sont deja installees via le module cloudwatch-metrics.

## Deploiement

### 1. Backend

```bash
# authz-eb
cd services/authz-eb
eb deploy

# tms-sync-eb
cd services/tms-sync-eb
eb deploy

# affret-ia-api-v2
cd services/affret-ia-api-v2
eb deploy

# scoring-api (si modifications)
cd services/scoring-api
npm start
```

### 2. Frontend

```bash
cd rt-frontend-apps/apps/web-transporter
npm run build
# Deploy selon votre methode (Vercel, AWS, etc.)
```

### 3. MongoDB Indexes

```javascript
// Collection affretia_trial_tracking
db.affretia_trial_tracking.createIndex({ carrierId: 1, createdAt: -1 });
db.affretia_trial_tracking.createIndex({ step: 1, createdAt: -1 });
db.affretia_trial_tracking.createIndex({ "blocker.blocked": 1, step: 1 });
db.affretia_trial_tracking.createIndex({ carrierEmail: 1, step: 1 });
db.affretia_trial_tracking.createIndex({ sessionId: 1, createdAt: 1 });
```

## Verification

### 1. Tester les endpoints

```bash
# Leaderboard
curl http://localhost:3000/api/v1/carriers/leaderboard?limit=10

# Analytics conversion
curl http://localhost:3017/api/v1/affretia/analytics/conversion?startDate=2026-01-01&endDate=2026-01-31

# Analytics blockers
curl http://localhost:3017/api/v1/affretia/analytics/blockers
```

### 2. Verifier CloudWatch

1. Aller sur AWS CloudWatch Console
2. Metrics > SYMPHONIA namespace
3. Verifier les metriques:
   - TMS-Sync-Success
   - Email-Sent-Success
   - Affret-IA-Requests
   - etc.

### 3. Tester les dashboards

1. Frontend Carrier Scoring: `http://localhost:3000/admin/carrier-scoring`
2. Frontend TMS Real-Time: `http://localhost:3000/admin/tms-realtime`

## Troubleshooting

### Erreur: "CloudWatch metrics failed to send"

**Solution:**
- Verifier les credentials AWS
- Verifier la region AWS
- Verifier les permissions IAM (cloudwatch:PutMetricData)

### Erreur: "No data in analytics endpoints"

**Solution:**
- Verifier que la collection affretia_trial_tracking existe
- Verifier que des trackings ont ete crees
- Utiliser le script de seed du test

### Erreur: "Scoring API not available"

**Solution:**
- Verifier que scoring-api tourne sur le port 3016
- Verifier SCORING_API_URL dans authz-eb

### Dashboard ne charge pas

**Solution:**
- Verifier les dependencies npm (react-gauge-chart, react-apexcharts, react-leaflet)
- Verifier que leaflet.css est importe dans _app.tsx
- Verifier la console browser pour les erreurs

## Performance

### CloudWatch Metrics

- **Buffering:** Les metriques sont bufferisees avant envoi (default: 20 metriques)
- **Auto-flush:** Flush automatique toutes les 60 secondes
- **Batch size:** Max 1000 metriques par requete CloudWatch

### Analytics Queries

- **Indexes:** Tous les indexes necessaires sont crees
- **Pagination:** Les queries supportent limit/offset
- **Cache:** Pas de cache pour le moment, a implementer si necessaire

## Prochaines etapes

1. Ajouter des graphiques supplementaires dans les dashboards
2. Implementer le cache Redis pour les analytics
3. Ajouter des alertes CloudWatch basees sur les metriques
4. Creer un dashboard CloudWatch pour visualiser toutes les metriques
5. Implementer l'export CSV des analytics
6. Ajouter des filtres avances dans les dashboards

## Support

Pour toute question ou probleme:
1. Verifier ce README
2. Consulter les logs des services
3. Utiliser les scripts de test pour identifier le probleme
4. Verifier la configuration AWS et MongoDB
