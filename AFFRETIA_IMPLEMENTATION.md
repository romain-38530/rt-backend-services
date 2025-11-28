# AFFRET.IA - Plan d'Implementation Complet

**Date:** 27 Novembre 2025
**Version:** 1.0.0
**Statut:** En cours d'implementation

---

## TABLE DES MATIERES

1. [Executive Summary](#executive-summary)
2. [Etat des Lieux du Codebase](#etat-des-lieux-du-codebase)
3. [Architecture Proposee](#architecture-proposee)
4. [Plan d'Implementation Detaille](#plan-dimplementation-detaille)
5. [Modeles de Donnees](#modeles-de-donnees)
6. [Endpoints API](#endpoints-api)
7. [Modules Techniques Prioritaires](#modules-techniques-prioritaires)
8. [Integration avec Services Existants](#integration-avec-services-existants)
9. [Workflow Complet AFFRET.IA](#workflow-complet-affretia)
10. [Prochaines Etapes](#prochaines-etapes)

---

## EXECUTIVE SUMMARY

AFFRET.IA est un **affreteur virtuel intelligent 24/7** qui automatise la recherche et selection de transporteurs lorsque le reseau reference ne peut pas repondre a une commande.

### Objectifs Cles

- Automatiser 100% du processus d'affretement
- Reponse en < 5 minutes pour 80% des demandes
- Taux de reussite > 90% sur affectations
- Reduction des couts operationnels de 40%
- Interface IA conversationnelle et intelligente

### Statut Actuel

- **Service de base EXISTANT:** `affret-ia-api-v2` avec fonctionnalites de recherche et assignation simple
- **Infrastructure disponible:** WebSocket, Scoring, Notifications, Documents, Tracking
- **A developper:** Workflow complet d'affretement selon cahier des charges

---

## ETAT DES LIEUX DU CODEBASE

### Architecture Backend Existante

```
rt-backend-services/services/
├── websocket-api (Port 3010)          ✅ EXISTANT - Communication temps reel
├── orders-api-v2 (Port 3011)          ✅ EXISTANT - Gestion commandes
├── tracking-api (Port 3012)           ✅ EXISTANT - GPS & Geofencing
├── appointments-api (Port 3013)       ✅ EXISTANT - Rendez-vous
├── documents-api (Port 3014)          ✅ EXISTANT - Stockage & OCR
├── notifications-api-v2 (Port 3015)   ✅ EXISTANT - Multi-canal
├── scoring-api (Port 3016)            ✅ EXISTANT - Notation transporteurs
└── affret-ia-api-v2 (Port 3017)       ⚠️  BASIQUE - A completer
```

### Service affret-ia-api-v2 Actuel

**Fichier:** `/c/Users/rtard/rt-backend-services/services/affret-ia-api-v2/index.js`

**Fonctionnalites EXISTANTES:**
- ✅ Recherche de transporteurs disponibles
- ✅ Calcul de match score (0-100)
- ✅ 4 algorithmes d'affectation (best_score, best_price, balanced, manual)
- ✅ Integration scoring transporteurs
- ✅ Historique des affectations
- ✅ Websocket pour evenements

**Endpoints EXISTANTS:**
```
POST   /api/v1/affret-ia/search              - Rechercher transporteurs
GET    /api/v1/affret-ia/carriers-available  - Liste disponibles
POST   /api/v1/affret-ia/assign               - Assigner transporteur
GET    /api/v1/affret-ia/pricing              - Tarif estimatif
GET    /api/v1/affret-ia/assignments          - Historique
GET    /api/v1/affret-ia/assignments/:id      - Details affectation
```

### GAPS Identifies (Selon Cahier des Charges)

#### Manquants Critiques

1. **Workflow Complet d'Affretement**
   - ❌ Conditions de declenchement (echec affectation, incapacite technique, activation manuelle)
   - ❌ Analyse IA prealable avec generation de shortlist
   - ❌ Diffusion multi-canal (E-mails, Bourse AFFRET.IA, Push intelligent)
   - ❌ Gestion des reponses (acceptation, refus, negociation)
   - ❌ Negociation automatique (max +15%)

2. **Moteur IA Avance**
   - ❌ Scoring multi-criteres (prix 40%, qualite 60%)
   - ❌ Selection IA intelligente avec apprentissage
   - ❌ Shortlist de 5-10 transporteurs pertinents

3. **Diffusion Multi-Canal**
   - ❌ Template emails professionnels
   - ❌ Bourse AFFRET.IA (plateforme publique)
   - ❌ Push intelligent (notifications ciblees)
   - ❌ Relances automatiques

4. **Tracking IA Multi-Niveaux**
   - ❌ Niveau Basic (statuts manuels)
   - ❌ Niveau Intermediaire (geolocalisation periodique)
   - ❌ Niveau Premium (GPS temps reel + alertes)

5. **Gestion Documentaire Avancee**
   - ❌ Upload CMR/POD avec OCR
   - ❌ Validation automatique
   - ❌ Alertes si documents manquants

6. **Devoir de Vigilance**
   - ❌ Verification KBIS
   - ❌ Verification assurances
   - ❌ Blacklist
   - ❌ Conformite reglementaire

7. **Scoring Final**
   - ❌ Notation post-livraison
   - ❌ Feed-back loop pour IA
   - ❌ Mise a jour profil transporteur

---

## ARCHITECTURE PROPOSEE

### Schema General AFFRET.IA v2.0

```
┌─────────────────────────────────────────────────────────────┐
│                    COMMANDE SANS TRANSPORTEUR                │
│                   (Declenchement AFFRET.IA)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   1. DECLENCHEMENT               │
         │   - Echec affectation reseau     │
         │   - Incapacite technique         │
         │   - Activation manuelle          │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   2. ANALYSE IA PREALABLE        │
         │   - Analyse commande             │
         │   - Extraction criteres          │
         │   - Calcul score complexite      │
         │   - Generation shortlist 5-10    │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   3. DIFFUSION MULTI-CANAL       │
         │   ├─ Email (template pro)        │
         │   ├─ Bourse AFFRET.IA            │
         │   └─ Push intelligent            │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   4. GESTION REPONSES            │
         │   - Acceptation immediate        │
         │   - Refus justifie               │
         │   - Negociation (max +15%)       │
         │   - Timeout (24h)                │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   5. SELECTION IA                │
         │   - Score Prix (40%)             │
         │   - Score Qualite (60%)          │
         │   - Choix meilleur candidat      │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   6. ASSIGNATION AUTO            │
         │   - Notification transporteur    │
         │   - Notification donneur ordre   │
         │   - Mise a jour commande         │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   7. TRACKING IA                 │
         │   - Basic / Intermediaire / Premium
         │   - Alertes automatiques         │
         │   - ETA intelligent              │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   8. GESTION DOCUMENTAIRE        │
         │   - Upload CMR/POD               │
         │   - OCR automatique              │
         │   - Validation                   │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   9. SCORING FINAL               │
         │   - Notation transporteur        │
         │   - Feed-back IA                 │
         │   - Mise a jour profil           │
         └────────────────┬─────────────────┘
                          │
         ┌────────────────▼─────────────────┐
         │   10. CLOTURE & SYNC ERP         │
         │   - Facture                      │
         │   - Export compta                │
         │   - Archivage                    │
         └──────────────────────────────────┘
```

### Microservices AFFRET.IA

```
┌─────────────────────────────────────────────────────────────┐
│                    AFFRET.IA API v2.0 (Port 3017)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 1: DECLENCHEMENT                             │  │
│  │  - Detecter conditions                                │  │
│  │  - Creer session AFFRET.IA                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 2: MOTEUR IA                                 │  │
│  │  - Analyse commande                                   │  │
│  │  - Scoring multi-criteres                            │  │
│  │  - Generation shortlist                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 3: DIFFUSION                                 │  │
│  │  - Email service (SendGrid)                          │  │
│  │  - Bourse AFFRET.IA                                  │  │
│  │  - Push notifications                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 4: NEGOCIATION                               │  │
│  │  - Gestion offres                                     │  │
│  │  - Contre-propositions                               │  │
│  │  - Validation +15% max                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 5: VIGILANCE                                 │  │
│  │  - Verification KBIS                                 │  │
│  │  - Verification assurances                           │  │
│  │  - Blacklist check                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MODULE 6: TRACKING IA                               │  │
│  │  - Gestion 3 niveaux                                 │  │
│  │  - Alertes intelligentes                             │  │
│  │  - ETA prediction                                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## PLAN D'IMPLEMENTATION DETAILLE

### Phase 1: Fondations (Semaine 1)

**Objectif:** Ameliorer le service existant avec les modeles de donnees complets

#### 1.1 Modeles de Donnees

- ✅ `Assignment` (existant) - A enrichir
- 🔨 `AffretSession` - Session complete d'affretement
- 🔨 `CarrierProposal` - Proposition transporteur
- 🔨 `Negotiation` - Historique negociations
- 🔨 `BroadcastCampaign` - Campagne de diffusion
- 🔨 `VigilanceCheck` - Verification conformite
- 🔨 `TrackingLevel` - Configuration tracking

#### 1.2 Endpoints de Base

```
POST   /api/v1/affretia/trigger           - Declencher AFFRET.IA
POST   /api/v1/affretia/analyze            - Analyser commande IA
GET    /api/v1/affretia/sessions/:id       - Details session
PUT    /api/v1/affretia/sessions/:id       - Mettre a jour session
```

### Phase 2: Diffusion Multi-Canal (Semaine 2)

**Objectif:** Systeme de diffusion complet

#### 2.1 Template Emails

- 🔨 Templates HTML professionnels
- 🔨 Variables dynamiques (commande, transporteur, prix)
- 🔨 Integration SendGrid

#### 2.2 Bourse AFFRET.IA

- 🔨 Endpoint public pour consulter offres
- 🔨 Filtres (zone, type vehicule, date)
- 🔨 Systeme de soumission

#### 2.3 Push Intelligent

- 🔨 Ciblage transporteurs pertinents
- 🔨 Scoring de pertinence
- 🔨 Historique interactions

**Endpoints:**
```
POST   /api/v1/affretia/broadcast          - Lancer diffusion
GET    /api/v1/affretia/bourse              - Consulter bourse
POST   /api/v1/affretia/bourse/submit      - Soumettre proposition
GET    /api/v1/affretia/broadcasts/:id     - Details campagne
```

### Phase 3: Gestion Reponses & Negociation (Semaine 2-3)

**Objectif:** Workflow complet de gestion des propositions

#### 3.1 Reception Propositions

- 🔨 Validation propositions
- 🔨 Calcul ecart prix
- 🔨 Auto-acceptation si criteres OK

#### 3.2 Negociation Automatique

- 🔨 Contre-proposition intelligente
- 🔨 Limite +15% du prix reference
- 🔨 Historique negociations
- 🔨 Timeout automatique

**Endpoints:**
```
POST   /api/v1/affretia/proposals           - Creer proposition
PUT    /api/v1/affretia/proposals/:id/accept    - Accepter
PUT    /api/v1/affretia/proposals/:id/reject    - Refuser
POST   /api/v1/affretia/proposals/:id/negotiate - Negocier
GET    /api/v1/affretia/proposals/:id/history   - Historique nego
```

### Phase 4: Selection IA (Semaine 3)

**Objectif:** Moteur de selection intelligent

#### 4.1 Algorithme de Scoring

- 🔨 Score Prix (40%): Competitivite tarifaire
- 🔨 Score Qualite (60%):
  - Historique performances (25%)
  - Ponctualite (15%)
  - Taux acceptation (10%)
  - Reactivity (5%)
  - Capacite disponible (5%)

#### 4.2 Selection Automatique

- 🔨 Classement propositions
- 🔨 Choix meilleur candidat
- 🔨 Justification decision (explainability)

**Endpoints:**
```
POST   /api/v1/affretia/select              - Selectionner transporteur IA
GET    /api/v1/affretia/ranking/:sessionId  - Classement propositions
GET    /api/v1/affretia/decision/:sessionId - Justification decision
```

### Phase 5: Devoir de Vigilance (Semaine 4)

**Objectif:** Conformite et securite

#### 5.1 Verifications Automatiques

- 🔨 API KBIS (verification entreprise)
- 🔨 Verification assurances (dates validite)
- 🔨 Check blacklist interne
- 🔨 Verification licences transport

#### 5.2 Gestion Alertes

- 🔨 Alertes si non-conformite
- 🔨 Blocage automatique
- 🔨 Notification admin

**Endpoints:**
```
POST   /api/v1/affretia/vigilance/check     - Verifier transporteur
GET    /api/v1/affretia/vigilance/:carrierId - Statut conformite
POST   /api/v1/affretia/blacklist           - Ajouter blacklist
GET    /api/v1/affretia/blacklist           - Consulter blacklist
```

### Phase 6: Tracking IA Multi-Niveaux (Semaine 4-5)

**Objectif:** Systeme de tracking intelligent adaptatif

#### 6.1 Niveau Basic

- 🔨 Statuts manuels uniquement
- 🔨 Notifications evenements cles
- 🔨 Pas de geolocalisation

#### 6.2 Niveau Intermediaire

- 🔨 Geolocalisation toutes les 2h
- 🔨 Alertes automatiques (retards)
- 🔨 ETA estime

#### 6.3 Niveau Premium

- 🔨 GPS temps reel
- 🔨 Geofencing automatique
- 🔨 ETA dynamique (TomTom)
- 🔨 Alertes predictives

**Endpoints:**
```
POST   /api/v1/affretia/tracking/configure  - Configurer niveau
GET    /api/v1/affretia/tracking/:orderId   - Statut tracking
POST   /api/v1/affretia/tracking/alert      - Creer alerte
GET    /api/v1/affretia/tracking/eta/:orderId - ETA intelligent
```

### Phase 7: Integration Complete (Semaine 5-6)

**Objectif:** Tests end-to-end et optimisations

#### 7.1 Tests Integration

- 🔨 Test workflow complet
- 🔨 Test cas d'erreur
- 🔨 Test performance

#### 7.2 Optimisations

- 🔨 Cache Redis pour scoring
- 🔨 Queue asynchrone (Bull)
- 🔨 Rate limiting

#### 7.3 Documentation

- 🔨 README complet
- 🔨 Swagger/OpenAPI
- 🔨 Guide integration frontend

---

## MODELES DE DONNEES

### 1. AffretSession

```javascript
const affretSessionSchema = new mongoose.Schema({
  // Identifiants
  sessionId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },

  // Declenchement
  trigger: {
    type: { type: String, enum: ['auto_failure', 'technical_incapacity', 'manual'], required: true },
    reason: String,
    triggeredBy: String,
    triggeredAt: { type: Date, default: Date.now }
  },

  // Statut global
  status: {
    type: String,
    enum: [
      'analyzing',           // Analyse en cours
      'shortlist_created',   // Shortlist generee
      'broadcasting',        // Diffusion en cours
      'awaiting_responses',  // Attente reponses
      'negotiating',         // Negociation en cours
      'selecting',           // Selection en cours
      'assigned',            // Transporteur assigne
      'failed',              // Echec
      'cancelled'            // Annule
    ],
    default: 'analyzing',
    index: true
  },

  // Analyse IA
  analysis: {
    complexity: { type: Number, min: 0, max: 100 },
    constraints: [String],
    estimatedPrice: Number,
    suggestedCarriers: Number,
    analyzedAt: Date
  },

  // Shortlist
  shortlist: [{
    carrierId: String,
    carrierName: String,
    matchScore: Number,
    estimatedPrice: Number,
    capacity: Boolean,
    reason: String // Pourquoi selectionne
  }],

  // Diffusion
  broadcast: {
    channels: [{
      type: { type: String, enum: ['email', 'bourse', 'push'] },
      sentAt: Date,
      recipients: Number,
      status: String
    }],
    totalRecipients: Number,
    startedAt: Date,
    completedAt: Date
  },

  // Propositions recues
  proposalsReceived: { type: Number, default: 0 },
  proposalsAccepted: { type: Number, default: 0 },
  proposalsRejected: { type: Number, default: 0 },
  proposalsNegotiated: { type: Number, default: 0 },

  // Selection finale
  selection: {
    carrierId: String,
    carrierName: String,
    finalPrice: Number,
    selectionReason: String,
    priceScore: Number,
    qualityScore: Number,
    overallScore: Number,
    selectedAt: Date,
    selectedBy: { type: String, enum: ['ai', 'manual'] }
  },

  // Timeline
  timeline: [{
    event: String,
    timestamp: Date,
    data: mongoose.Schema.Types.Mixed
  }],

  // Metriques
  metrics: {
    totalDuration: Number, // ms
    analysisTime: Number,
    broadcastTime: Number,
    responseTime: Number,
    selectionTime: Number
  },

  // Notes
  notes: String,
  cancelledReason: String

}, { timestamps: true });

affretSessionSchema.index({ status: 1, createdAt: -1 });
affretSessionSchema.index({ organizationId: 1, status: 1 });
```

### 2. CarrierProposal

```javascript
const carrierProposalSchema = new mongoose.Schema({
  // Identifiants
  sessionId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  carrierId: { type: String, required: true, index: true },
  carrierName: String,

  // Proposition
  proposedPrice: { type: Number, required: true },
  currency: { type: String, default: 'EUR' },
  priceBreakdown: {
    base: Number,
    fuel: Number,
    services: Number,
    taxes: Number
  },

  // Details
  vehicleType: String,
  vehiclePlate: String,
  driverName: String,
  driverPhone: String,
  estimatedPickupDate: Date,
  estimatedDeliveryDate: Date,

  // Statut
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'negotiating', 'timeout'],
    default: 'pending',
    index: true
  },

  // Scoring
  scores: {
    price: Number,      // 0-100
    quality: Number,    // 0-100
    overall: Number     // 0-100
  },

  // Historique
  submittedAt: { type: Date, default: Date.now },
  respondedAt: Date,
  response: {
    status: String,
    reason: String,
    respondedBy: String
  },

  // Negociation
  negotiationHistory: [{
    proposedPrice: Number,
    counterPrice: Number,
    proposedBy: { type: String, enum: ['carrier', 'ai'] },
    timestamp: Date,
    message: String
  }],

  // Conformite
  vigilanceCheck: {
    kbis: { valid: Boolean, checkedAt: Date },
    insurance: { valid: Boolean, expiryDate: Date },
    blacklist: { clean: Boolean, checkedAt: Date },
    overall: Boolean
  },

  // Notes
  notes: String

}, { timestamps: true });

carrierProposalSchema.index({ sessionId: 1, status: 1 });
carrierProposalSchema.index({ carrierId: 1, createdAt: -1 });
```

### 3. BroadcastCampaign

```javascript
const broadcastCampaignSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  orderId: { type: String, required: true },

  // Configuration
  channels: [{
    type: { type: String, enum: ['email', 'bourse', 'push'], required: true },
    enabled: Boolean,
    config: mongoose.Schema.Types.Mixed
  }],

  // Destinataires
  recipients: [{
    carrierId: String,
    carrierName: String,
    channel: String,
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    respondedAt: Date,
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'failed', 'bounced'] }
  }],

  // Statistiques
  stats: {
    total: Number,
    sent: Number,
    delivered: Number,
    opened: Number,
    clicked: Number,
    responded: Number,
    failed: Number
  },

  // Relances
  reminders: [{
    sentAt: Date,
    recipients: Number,
    channel: String
  }],

  // Templates
  emailTemplate: String,
  pushTemplate: String,

  // Statut
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'completed', 'failed'],
    default: 'draft'
  },

  startedAt: Date,
  completedAt: Date

}, { timestamps: true });
```

### 4. VigilanceCheck

```javascript
const vigilanceCheckSchema = new mongoose.Schema({
  carrierId: { type: String, required: true, index: true },
  carrierName: String,

  // Verifications
  checks: {
    kbis: {
      valid: Boolean,
      companyName: String,
      siret: String,
      registrationDate: Date,
      lastChecked: Date,
      expiryDate: Date,
      error: String
    },
    insurance: {
      valid: Boolean,
      insuranceType: String,
      provider: String,
      policyNumber: String,
      coverage: Number,
      expiryDate: Date,
      lastChecked: Date,
      error: String
    },
    license: {
      valid: Boolean,
      licenseNumber: String,
      expiryDate: Date,
      lastChecked: Date,
      error: String
    },
    blacklist: {
      clean: Boolean,
      reason: String,
      addedAt: Date,
      lastChecked: Date
    }
  },

  // Statut global
  overallStatus: {
    type: String,
    enum: ['compliant', 'warning', 'non_compliant', 'blacklisted'],
    default: 'compliant'
  },

  // Alertes
  alerts: [{
    type: String,
    severity: { type: String, enum: ['info', 'warning', 'critical'] },
    message: String,
    createdAt: Date,
    resolvedAt: Date
  }],

  // Derniere verification
  lastFullCheck: Date,
  nextCheckDue: Date,

  // Notes
  notes: String,
  checkedBy: String

}, { timestamps: true });

vigilanceCheckSchema.index({ overallStatus: 1 });
vigilanceCheckSchema.index({ 'checks.insurance.expiryDate': 1 });
```

### 5. TrackingConfiguration

```javascript
const trackingConfigSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  carrierId: { type: String, required: true },

  // Niveau de tracking
  level: {
    type: String,
    enum: ['basic', 'intermediate', 'premium'],
    default: 'basic',
    required: true
  },

  // Configuration par niveau
  config: {
    basic: {
      manualUpdatesOnly: Boolean,
      requiredEvents: [String] // ['pickup', 'delivery', 'loaded']
    },
    intermediate: {
      updateFrequency: { type: Number, default: 120 }, // minutes
      alertsEnabled: Boolean,
      etaEstimation: Boolean
    },
    premium: {
      realTimeGPS: Boolean,
      geofencingEnabled: Boolean,
      dynamicETA: Boolean,
      predictiveAlerts: Boolean,
      tomtomIntegration: Boolean
    }
  },

  // Alertes configurees
  alerts: [{
    type: { type: String, enum: ['delay', 'geofence', 'eta_update', 'incident'] },
    enabled: Boolean,
    threshold: mongoose.Schema.Types.Mixed,
    recipients: [String]
  }],

  // Geofences (Premium)
  geofences: [{
    name: String,
    type: { type: String, enum: ['pickup', 'delivery', 'waypoint'] },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: [Number] // [longitude, latitude]
    },
    radius: Number, // meters
    triggered: Boolean,
    triggeredAt: Date
  }],

  // Statut
  isActive: { type: Boolean, default: true },
  activatedAt: Date,
  deactivatedAt: Date

}, { timestamps: true });

trackingConfigSchema.index({ level: 1 });
trackingConfigSchema.index({ 'geofences.location': '2dsphere' });
```

---

## ENDPOINTS API

### Reference Cahier des Charges Page 19

**Endpoints a implementer selon specifications:**

### 1. DECLENCHEMENT

```
POST /api/v1/affretia/trigger
Description: Declenche AFFRET.IA pour une commande
Body: {
  orderId: string,
  triggerType: 'auto_failure' | 'technical_incapacity' | 'manual',
  reason?: string,
  userId?: string
}
Response: {
  success: boolean,
  data: {
    sessionId: string,
    status: string,
    createdAt: string
  }
}
```

### 2. ANALYSE IA

```
POST /api/v1/affretia/analyze
Description: Lance l'analyse IA d'une commande
Body: {
  sessionId: string
}
Response: {
  success: boolean,
  data: {
    complexity: number,
    constraints: string[],
    estimatedPrice: number,
    shortlist: CarrierShortlist[]
  }
}
```

### 3. DIFFUSION

```
POST /api/v1/affretia/broadcast
Description: Lance la diffusion multi-canal
Body: {
  sessionId: string,
  channels: ('email' | 'bourse' | 'push')[],
  carrierIds?: string[]
}
Response: {
  success: boolean,
  data: {
    campaignId: string,
    recipientsCount: number,
    channels: BroadcastChannel[]
  }
}
```

```
GET /api/v1/affretia/bourse
Description: Consulter les offres disponibles sur la bourse (public)
Query: {
  postalCodePickup?: string,
  postalCodeDelivery?: string,
  pickupDateFrom?: string,
  pickupDateTo?: string,
  vehicleType?: string,
  limit?: number
}
Response: {
  success: boolean,
  data: AffretOffer[]
}
```

```
POST /api/v1/affretia/bourse/submit
Description: Soumettre une proposition via la bourse
Body: {
  sessionId: string,
  carrierId: string,
  proposedPrice: number,
  details: ProposalDetails
}
Response: {
  success: boolean,
  data: {
    proposalId: string,
    status: string
  }
}
```

### 4. GESTION PROPOSITIONS

```
GET /api/v1/affretia/proposals/:sessionId
Description: Liste des propositions pour une session
Response: {
  success: boolean,
  data: CarrierProposal[]
}
```

```
PUT /api/v1/affretia/proposals/:proposalId/accept
Description: Accepter une proposition
Response: {
  success: boolean,
  data: {
    proposalId: string,
    status: 'accepted'
  }
}
```

```
PUT /api/v1/affretia/proposals/:proposalId/reject
Description: Refuser une proposition
Body: {
  reason: string
}
Response: {
  success: boolean,
  data: {
    proposalId: string,
    status: 'rejected'
  }
}
```

```
POST /api/v1/affretia/proposals/:proposalId/negotiate
Description: Lancer une negociation
Body: {
  counterPrice: number,
  message?: string
}
Response: {
  success: boolean,
  data: {
    proposalId: string,
    negotiationId: string,
    status: 'negotiating'
  }
}
```

### 5. SELECTION IA

```
POST /api/v1/affretia/select
Description: Selectionner automatiquement le meilleur transporteur
Body: {
  sessionId: string,
  algorithm?: 'ai' | 'best_price' | 'best_quality' | 'balanced'
}
Response: {
  success: boolean,
  data: {
    selectedCarrierId: string,
    selectedPrice: number,
    scores: {
      price: number,
      quality: number,
      overall: number
    },
    justification: string
  }
}
```

```
GET /api/v1/affretia/ranking/:sessionId
Description: Classement des propositions
Response: {
  success: boolean,
  data: RankedProposal[]
}
```

### 6. VIGILANCE

```
POST /api/v1/affretia/vigilance/check
Description: Verifier la conformite d'un transporteur
Body: {
  carrierId: string,
  checks: ('kbis' | 'insurance' | 'license' | 'blacklist')[]
}
Response: {
  success: boolean,
  data: VigilanceCheck
}
```

```
GET /api/v1/affretia/vigilance/:carrierId
Description: Statut de conformite d'un transporteur
Response: {
  success: boolean,
  data: VigilanceCheck
}
```

```
POST /api/v1/affretia/blacklist
Description: Ajouter un transporteur a la blacklist
Body: {
  carrierId: string,
  reason: string,
  severity: 'warning' | 'blacklist'
}
```

### 7. TRACKING IA

```
POST /api/v1/affretia/tracking/configure
Description: Configurer le niveau de tracking
Body: {
  orderId: string,
  level: 'basic' | 'intermediate' | 'premium',
  alerts?: AlertConfig[]
}
Response: {
  success: boolean,
  data: TrackingConfiguration
}
```

```
GET /api/v1/affretia/tracking/:orderId
Description: Statut du tracking
Response: {
  success: boolean,
  data: {
    level: string,
    isActive: boolean,
    lastUpdate: string,
    currentLocation?: Location,
    eta?: string
  }
}
```

### 8. REPORTING

```
GET /api/v1/affretia/sessions
Description: Liste des sessions AFFRET.IA
Query: {
  status?: string,
  organizationId?: string,
  dateFrom?: string,
  dateTo?: string,
  limit?: number
}
Response: {
  success: boolean,
  data: AffretSession[],
  pagination: Pagination
}
```

```
GET /api/v1/affretia/sessions/:sessionId
Description: Details d'une session
Response: {
  success: boolean,
  data: AffretSession
}
```

```
GET /api/v1/affretia/stats
Description: Statistiques globales AFFRET.IA
Query: {
  organizationId?: string,
  period: 'day' | 'week' | 'month' | 'year'
}
Response: {
  success: boolean,
  data: {
    totalSessions: number,
    successRate: number,
    avgResponseTime: number,
    avgPrice: number,
    topCarriers: Carrier[]
  }
}
```

---

## MODULES TECHNIQUES PRIORITAIRES

### Reference Cahier des Charges Page 20

### Module 1: Moteur IA de Scoring (PRIORITE 1)

**Fichier:** `src/modules/ai-scoring-engine.js`

**Fonctions:**
- Analyse complexite commande
- Calcul score Prix (40%)
- Calcul score Qualite (60%)
- Generation shortlist intelligente
- Apprentissage performances

**Algorithme Scoring:**
```javascript
function calculateAIScore(proposal, orderContext) {
  // Score Prix (40%)
  const priceScore = calculatePriceScore(
    proposal.proposedPrice,
    orderContext.estimatedPrice
  );

  // Score Qualite (60%)
  const qualityScore = calculateQualityScore({
    historicalPerformance: 0.25,  // 25% du score qualite
    punctuality: 0.15,            // 15%
    acceptanceRate: 0.10,         // 10%
    reactivity: 0.05,             // 5%
    capacity: 0.05                // 5%
  });

  // Score final
  return (priceScore * 0.4) + (qualityScore * 0.6);
}
```

### Module 2: Systeme de Diffusion (PRIORITE 2)

**Fichier:** `src/modules/broadcast-system.js`

**Composants:**
- Template email engine
- SendGrid integration
- Bourse publique API
- Push notification service
- Queue system (Bull/Redis)

### Module 3: Negociation Automatique (PRIORITE 3)

**Fichier:** `src/modules/auto-negotiation.js`

**Regles:**
- Acceptation auto si prix < estimation
- Contre-proposition si ecart < 15%
- Refus auto si ecart > 15%
- Historique negociations
- Timeout 24h

### Module 4: Devoir de Vigilance (PRIORITE 4)

**Fichier:** `src/modules/vigilance-service.js`

**Integrations externes:**
- API KBIS (InfoGreffe)
- Verification assurances
- Blacklist interne
- Licences transport

### Module 5: Tracking IA Adaptatif (PRIORITE 5)

**Fichier:** `src/modules/tracking-ia.js`

**Niveaux:**
- Basic: Statuts manuels uniquement
- Intermediate: Geo toutes les 2h + alertes
- Premium: GPS temps reel + geofencing + ETA TomTom

---

## INTEGRATION AVEC SERVICES EXISTANTS

### Services Utilises

```javascript
// 1. WebSocket API (Port 3010)
// Utilise pour: Evenements temps reel
const WebSocketService = {
  emit: (event, data) => {
    websocket.emit('emit-event', { eventName: event, data });
  },
  events: [
    'affret.session.created',
    'affret.analysis.completed',
    'affret.broadcast.started',
    'affret.proposal.received',
    'affret.carrier.selected',
    'affret.tracking.configured'
  ]
};

// 2. Orders API (Port 3011)
// Utilise pour: Recuperer details commande, mettre a jour statut
const OrdersService = {
  getOrder: async (orderId) => {
    return await axios.get(`${ORDERS_API_URL}/api/v1/orders/${orderId}`);
  },
  updateOrder: async (orderId, data) => {
    return await axios.put(`${ORDERS_API_URL}/api/v1/orders/${orderId}`, data);
  }
};

// 3. Scoring API (Port 3016)
// Utilise pour: Recuperer scores transporteurs
const ScoringService = {
  getCarrierScore: async (carrierId) => {
    return await axios.get(`${SCORING_API_URL}/api/v1/carriers/${carrierId}/score`);
  }
};

// 4. Notifications API (Port 3015)
// Utilise pour: Envoyer emails, SMS, notifications
const NotificationsService = {
  sendEmail: async (to, template, data) => {
    return await axios.post(`${NOTIFICATIONS_API_URL}/api/v1/notifications/send`, {
      type: 'email',
      to,
      template,
      data
    });
  }
};

// 5. Documents API (Port 3014)
// Utilise pour: Verification documents transporteur
const DocumentsService = {
  getCarrierDocuments: async (carrierId) => {
    return await axios.get(`${DOCUMENTS_API_URL}/api/v1/documents/carrier/${carrierId}`);
  }
};

// 6. Tracking API (Port 3012)
// Utilise pour: Configuration et suivi tracking
const TrackingService = {
  configureTracking: async (orderId, config) => {
    return await axios.post(`${TRACKING_API_URL}/api/v1/tracking/configure`, {
      orderId,
      ...config
    });
  }
};
```

---

## WORKFLOW COMPLET AFFRET.IA

### Scenario Type: Commande sans Transporteur

```
ETAPE 1: DECLENCHEMENT
─────────────────────────
Commande #ORD251127001 creee
Aucun transporteur du reseau disponible
→ AFFRET.IA declenche automatiquement

API Call: POST /api/v1/affretia/trigger
{
  "orderId": "ORD251127001",
  "triggerType": "auto_failure",
  "reason": "Aucun transporteur disponible dans le reseau"
}

Response: {
  "sessionId": "AFFRET-2025-001",
  "status": "analyzing"
}

WebSocket Event: affret.session.created

ETAPE 2: ANALYSE IA
─────────────────────────
Analyse de la commande:
- Origine: Paris 75001
- Destination: Lyon 69001
- Distance: 465 km
- Type: 2 palettes EUR
- Poids: 450 kg
- Date enlevement: 29/11/2025
- Contraintes: Hayon requis

Calcul complexite: 35/100 (commande standard)
Estimation prix: 450€ HT

Generation shortlist: 8 transporteurs pertinents

API Call: POST /api/v1/affretia/analyze
Response: {
  "complexity": 35,
  "estimatedPrice": 450,
  "shortlist": [
    { "carrierId": "TR001", "matchScore": 92, "estimatedPrice": 430 },
    { "carrierId": "TR002", "matchScore": 88, "estimatedPrice": 445 },
    ...
  ]
}

WebSocket Event: affret.analysis.completed

ETAPE 3: DIFFUSION MULTI-CANAL
─────────────────────────────────
Lancement diffusion vers 8 transporteurs:
- 8 emails (SendGrid)
- 1 publication Bourse AFFRET.IA
- 5 push notifications (transporteurs actifs)

API Call: POST /api/v1/affretia/broadcast
{
  "sessionId": "AFFRET-2025-001",
  "channels": ["email", "bourse", "push"]
}

Response: {
  "campaignId": "BC-001",
  "recipientsCount": 8,
  "channels": [
    { "type": "email", "sent": 8 },
    { "type": "bourse", "published": true },
    { "type": "push", "sent": 5 }
  ]
}

WebSocket Event: affret.broadcast.started

ETAPE 4: RECEPTION PROPOSITIONS
─────────────────────────────────
T+5min: Proposition TR001 - 430€
T+12min: Proposition TR002 - 480€ (> +15%, rejetee auto)
T+18min: Proposition TR003 - 465€
T+25min: Proposition TR004 - 510€ (> +15%, rejetee auto)

WebSocket Events:
- affret.proposal.received (x4)
- affret.proposal.auto_rejected (x2)

ETAPE 5: NEGOCIATION AUTO
─────────────────────────────────
TR003 propose 465€ (+3.3% vs estimation)
→ IA contre-propose 455€

API Call: POST /api/v1/affretia/proposals/PR003/negotiate
{
  "counterPrice": 455,
  "message": "Nous pouvons accepter 455€ HT pour cette prestation"
}

TR003 accepte 455€

WebSocket Event: affret.negotiation.accepted

ETAPE 6: SELECTION IA
─────────────────────────────────
Classement final:
1. TR001 - 430€ - Score: 94/100 (Prix: 95, Qualite: 93)
2. TR003 - 455€ - Score: 91/100 (Prix: 88, Qualite: 93)

Selection automatique: TR001 (meilleur score global)

API Call: POST /api/v1/affretia/select
{
  "sessionId": "AFFRET-2025-001",
  "algorithm": "ai"
}

Response: {
  "selectedCarrierId": "TR001",
  "selectedPrice": 430,
  "scores": {
    "price": 95,
    "quality": 93,
    "overall": 94
  },
  "justification": "TR001 selectionne: meilleur score global (94/100), prix competitif (430€), excellent historique (93% ponctualite)"
}

WebSocket Event: affret.carrier.selected

ETAPE 7: VERIFICATION VIGILANCE
─────────────────────────────────
Verification automatique TR001:
- KBIS: ✓ Valide (expire 2026)
- Assurance RCP: ✓ Valide (expire mars 2026)
- Licence transport: ✓ Valide
- Blacklist: ✓ Clean

API Call: POST /api/v1/affretia/vigilance/check
Response: {
  "overallStatus": "compliant",
  "checks": {
    "kbis": { "valid": true },
    "insurance": { "valid": true },
    "license": { "valid": true },
    "blacklist": { "clean": true }
  }
}

ETAPE 8: ASSIGNATION
─────────────────────────────────
Mise a jour commande:
- Statut: accepted
- Transporteur: TR001
- Prix: 430€ HT

Notifications envoyees:
- Email donneur d'ordre
- Email transporteur TR001
- SMS transporteur TR001

API Call: PUT /api/v1/orders/ORD251127001
{
  "status": "accepted",
  "assignedCarrier": {
    "carrierId": "TR001",
    "price": 430
  }
}

WebSocket Event: order.carrier.assigned

ETAPE 9: CONFIGURATION TRACKING
─────────────────────────────────
Configuration tracking niveau: Premium
(Commande > 400€, client Premium)

API Call: POST /api/v1/affretia/tracking/configure
{
  "orderId": "ORD251127001",
  "level": "premium",
  "alerts": [
    { "type": "delay", "threshold": 30 },
    { "type": "geofence", "enabled": true }
  ]
}

Response: {
  "level": "premium",
  "config": {
    "realTimeGPS": true,
    "geofencingEnabled": true,
    "dynamicETA": true
  }
}

WebSocket Event: affret.tracking.configured

ETAPE 10: EXECUTION TRANSPORT
─────────────────────────────────
29/11 08:30 - Enlevement Paris
29/11 13:45 - Livraison Lyon (15min avance)

Upload POD avec signature electronique
OCR automatique: ✓ Valide

ETAPE 11: SCORING FINAL
─────────────────────────────────
Notation automatique TR001:
- Ponctualite enlevement: 100/100
- Ponctualite livraison: 100/100
- Respect RDV: 100/100
- Upload POD: 100/100 (< 1h)
- Communication: 95/100

Score final: 98/100

API Call: POST /api/v1/scoring/calculate
{
  "orderId": "ORD251127001",
  "carrierId": "TR001",
  "criteria": {
    "punctualityPickup": 100,
    "punctualityDelivery": 100,
    "appointmentRespect": 100,
    "podDelay": 100
  }
}

→ Mise a jour profil TR001
→ Feed-back IA pour futurs matchs

ETAPE 12: CLOTURE
─────────────────────────────────
Cloture commande:
- Facture generee: 430€ HT + TVA
- Export comptable
- Archivage documents
- Session AFFRET.IA cloturee

Duree totale session: 32 minutes
Taux de reussite: 100%
```

---

## PROCHAINES ETAPES

### Immediate (Cette Semaine)

1. ✅ **Analyse complete terminee**
2. 🔨 **Creer modeles de donnees** (AffretSession, CarrierProposal, etc.)
3. 🔨 **Implementer endpoints de declenchement**
4. 🔨 **Implementer moteur IA de scoring**

### Court Terme (2 Semaines)

5. 🔨 **Systeme de diffusion multi-canal**
6. 🔨 **Gestion propositions et negociation**
7. 🔨 **Devoir de vigilance**
8. 🔨 **Tests integration**

### Moyen Terme (1 Mois)

9. 🔨 **Tracking IA multi-niveaux**
10. 🔨 **Bourse AFFRET.IA publique**
11. 🔨 **Dashboard analytics**
12. 🔨 **Documentation complete**

### Integration Frontend

13. 🔨 **Composants React AFFRET.IA**
14. 🔨 **Interface de monitoring**
15. 🔨 **Dashboard transporteurs**

---

## DEPENDANCES IDENTIFIEES

### Services Externes

- **SendGrid** - Envoi emails
- **Twilio** - SMS (optionnel)
- **InfoGreffe API** - Verification KBIS
- **API Assurances** - Verification couvertures
- **TomTom API** - Calcul routes et ETA

### Services Internes

- WebSocket API (3010) - Events temps reel
- Orders API (3011) - Gestion commandes
- Tracking API (3012) - Geolocalisation
- Notifications API (3015) - Notifications multi-canal
- Scoring API (3016) - Notation transporteurs
- Documents API (3014) - Stockage documents

### Infrastructure

- **MongoDB Atlas** - Base de donnees
- **Redis** - Cache et queues
- **AWS S3** - Stockage documents
- **AWS Textract** - OCR
- **Bull Queue** - Traitement asynchrone

---

## METRIQUES DE SUCCES

### KPIs Techniques

- **Temps reponse < 5s** pour 95% endpoints
- **Disponibilite > 99.5%**
- **Taux erreur < 0.1%**

### KPIs Business

- **Taux reussite affectation > 90%**
- **Temps moyen affectation < 30 min**
- **Satisfaction transporteurs > 4/5**
- **Reduction couts operationnels 40%**

---

**Document maintenu par:** Equipe Developpement SYMPHONI.A
**Derniere mise a jour:** 27 Novembre 2025
**Version:** 1.0.0
**Statut:** ANALYSE COMPLETE - IMPLEMENTATION EN COURS
