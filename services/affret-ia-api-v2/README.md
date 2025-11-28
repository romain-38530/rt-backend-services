# AFFRET.IA API v2.0

**Affreteur Virtuel Intelligent 24/7**

Service d'affretement automatique qui recherche, selectionne et assigne des transporteurs lorsque le reseau reference ne peut pas repondre a une commande.

---

## Table des Matieres

1. [Vue d'Ensemble](#vue-densemble)
2. [Fonctionnalites](#fonctionnalites)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Configuration](#configuration)
6. [Endpoints API](#endpoints-api)
7. [Workflow Complet](#workflow-complet)
8. [Modeles de Donnees](#modeles-de-donnees)
9. [Moteur IA](#moteur-ia)
10. [Integration](#integration)
11. [Deploiement](#deploiement)

---

## Vue d'Ensemble

AFFRET.IA est un systeme intelligent qui automatise 100% du processus d'affretement:

- **Declenchement automatique** quand aucun transporteur reference n'est disponible
- **Analyse IA** de la commande pour evaluer la complexite
- **Generation de shortlist** des 5-10 meilleurs transporteurs
- **Diffusion multi-canal** (Email, Bourse AFFRET.IA, Push)
- **Gestion des reponses** avec negociation automatique (+15% max)
- **Selection IA** basee sur scoring multi-criteres (Prix 40% + Qualite 60%)
- **Assignation automatique** au meilleur candidat
- **Tracking IA** adaptatif (3 niveaux)
- **Scoring final** post-livraison pour feed-back IA

---

## Fonctionnalites

### Phase 1: Fondations (COMPLETE)

- ✅ Modeles de donnees complets
  - `AffretSession` - Session d'affretement
  - `CarrierProposal` - Propositions transporteurs
  - `BroadcastCampaign` - Campagnes de diffusion
  - `VigilanceCheck` - Verification conformite

- ✅ Moteur IA de Scoring
  - Analyse complexite commande
  - Score Prix (40%)
  - Score Qualite (60%)
  - Generation shortlist intelligente
  - Auto-acceptation / negociation

### Phase 2: En Cours

- 🔨 Endpoints API complets (reference cahier des charges page 19)
- 🔨 Systeme de diffusion multi-canal
- 🔨 Gestion propositions et negociation
- 🔨 Devoir de vigilance
- 🔨 Tracking IA multi-niveaux

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  AFFRET.IA API v2.0 (Port 3017)             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MOTEUR IA DE SCORING                                │  │
│  │  - Analyse complexite commande                       │  │
│  │  - Scoring multi-criteres (Prix 40% + Qualite 60%)  │  │
│  │  - Generation shortlist intelligente                 │  │
│  │  - Auto-acceptation / negociation                    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DIFFUSION MULTI-CANAL                               │  │
│  │  - Email professionnel (SendGrid)                    │  │
│  │  - Bourse AFFRET.IA publique                         │  │
│  │  - Push notifications intelligentes                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DEVOIR DE VIGILANCE                                 │  │
│  │  - Verification KBIS                                 │  │
│  │  - Verification assurances                           │  │
│  │  - Check blacklist                                   │  │
│  │  - Conformite reglementaire                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation

```bash
cd /path/to/rt-backend-services/services/affret-ia-api-v2

# Installer les dependances
npm install

# Copier le fichier de configuration
cp .env.example .env

# Editer .env avec vos parametres
nano .env

# Demarrer en developpement
npm run dev

# Demarrer en production
npm start
```

---

## Configuration

### Variables d'Environnement

```env
# Port
PORT=3017

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/symphonia

# JWT
JWT_SECRET=your-jwt-secret

# Services internes
WEBSOCKET_URL=https://websocket.symphonia.com
ORDERS_API_URL=https://orders.symphonia.com
SCORING_API_URL=https://scoring.symphonia.com
CARRIERS_API_URL=https://carriers.symphonia.com
PRICING_API_URL=https://pricing.symphonia.com
NOTIFICATIONS_API_URL=https://notifications.symphonia.com

# Services externes
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=affret@symphonia.com

# Configuration AFFRET.IA
AFFRET_MAX_PRICE_INCREASE=15          # % maximum au-dessus du prix estime
AFFRET_AUTO_ACCEPT_THRESHOLD=0        # % - acceptation auto si <= prix estime
AFFRET_NEGOTIATION_MAX_ROUNDS=3       # Nombre max de tours de negociation
AFFRET_RESPONSE_TIMEOUT=24            # Heures avant timeout
AFFRET_SHORTLIST_SIZE=10              # Nombre de transporteurs dans shortlist
```

---

## Endpoints API

### 1. DECLENCHEMENT

#### POST /api/v1/affretia/trigger

Declenche AFFRET.IA pour une commande

**Request:**
```json
{
  "orderId": "ORD251127001",
  "triggerType": "auto_failure",
  "reason": "Aucun transporteur disponible dans le reseau",
  "userId": "user123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "AFFRET-20251127-0001",
    "status": "analyzing",
    "createdAt": "2025-11-27T10:00:00Z"
  }
}
```

### 2. ANALYSE IA

#### POST /api/v1/affretia/analyze

Lance l'analyse IA d'une commande

**Request:**
```json
{
  "sessionId": "AFFRET-20251127-0001"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "complexity": 35,
    "category": "simple",
    "factors": [
      { "factor": "distance", "value": 465, "points": 10 },
      { "factor": "weight_volume", "value": { "weight": 450, "volume": 2 }, "points": 5 }
    ],
    "estimatedPrice": 450,
    "shortlist": [
      {
        "carrierId": "TR001",
        "carrierName": "Transport Express",
        "matchScore": 92,
        "estimatedPrice": 430,
        "capacity": true,
        "distance": 25,
        "reason": "Excellent candidat - Score 92/100"
      }
    ]
  }
}
```

### 3. DIFFUSION

#### POST /api/v1/affretia/broadcast

Lance la diffusion multi-canal

**Request:**
```json
{
  "sessionId": "AFFRET-20251127-0001",
  "channels": ["email", "bourse", "push"],
  "carrierIds": ["TR001", "TR002", "TR003"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "campaignId": "BC20251127-0001",
    "recipientsCount": 8,
    "channels": [
      { "type": "email", "sent": 8, "status": "sent" },
      { "type": "bourse", "published": true, "status": "sent" },
      { "type": "push", "sent": 5, "status": "sent" }
    ]
  }
}
```

### 4. BOURSE AFFRET.IA

#### GET /api/v1/affretia/bourse

Consulter les offres disponibles (endpoint public)

**Query Params:**
- `postalCodePickup` (optional)
- `postalCodeDelivery` (optional)
- `pickupDateFrom` (optional)
- `pickupDateTo` (optional)
- `vehicleType` (optional)
- `limit` (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "sessionId": "AFFRET-20251127-0001",
      "orderId": "ORD251127001",
      "pickupCity": "Paris",
      "pickupPostalCode": "75001",
      "deliveryCity": "Lyon",
      "deliveryPostalCode": "69001",
      "pickupDate": "2025-11-29",
      "cargo": {
        "type": "palette",
        "quantity": 2,
        "weight": 450
      },
      "estimatedPrice": 450,
      "validUntil": "2025-11-28T10:00:00Z",
      "url": "https://bourse.affretia.com/AFFRET-20251127-0001"
    }
  ]
}
```

#### POST /api/v1/affretia/bourse/submit

Soumettre une proposition via la bourse

**Request:**
```json
{
  "sessionId": "AFFRET-20251127-0001",
  "carrierId": "TR005",
  "proposedPrice": 440,
  "vehicleType": "VUL",
  "vehiclePlate": "AB-123-CD",
  "driverName": "Jean Dupont",
  "driverPhone": "+33612345678",
  "estimatedPickupDate": "2025-11-29T08:00:00Z",
  "estimatedDeliveryDate": "2025-11-29T14:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "proposalId": "PROP-001",
    "status": "pending",
    "submittedAt": "2025-11-27T10:30:00Z"
  }
}
```

### 5. GESTION PROPOSITIONS

#### GET /api/v1/affretia/proposals/:sessionId

Liste des propositions pour une session

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "PROP-001",
      "sessionId": "AFFRET-20251127-0001",
      "carrierId": "TR001",
      "carrierName": "Transport Express",
      "proposedPrice": 430,
      "status": "pending",
      "scores": {
        "price": 95,
        "quality": 93,
        "overall": 94
      },
      "submittedAt": "2025-11-27T10:05:00Z"
    }
  ]
}
```

#### PUT /api/v1/affretia/proposals/:proposalId/accept

Accepter une proposition

**Response:**
```json
{
  "success": true,
  "data": {
    "proposalId": "PROP-001",
    "status": "accepted",
    "respondedAt": "2025-11-27T10:35:00Z"
  }
}
```

#### POST /api/v1/affretia/proposals/:proposalId/negotiate

Lancer une negociation

**Request:**
```json
{
  "counterPrice": 420,
  "message": "Nous pouvons vous proposer 420€ pour cette prestation."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "proposalId": "PROP-001",
    "negotiationId": "NEG-001",
    "status": "negotiating",
    "currentRound": 1,
    "maxRounds": 3
  }
}
```

### 6. SELECTION IA

#### POST /api/v1/affretia/select

Selectionner automatiquement le meilleur transporteur

**Request:**
```json
{
  "sessionId": "AFFRET-20251127-0001",
  "algorithm": "ai"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selectedCarrierId": "TR001",
    "selectedCarrierName": "Transport Express",
    "selectedPrice": 430,
    "scores": {
      "price": 95,
      "quality": 93,
      "overall": 94
    },
    "justification": "TR001 selectionne: meilleur score global (94/100), prix competitif (430€), excellent historique (93% ponctualite)"
  }
}
```

#### GET /api/v1/affretia/ranking/:sessionId

Classement des propositions

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "carrierId": "TR001",
      "carrierName": "Transport Express",
      "proposedPrice": 430,
      "scores": {
        "price": 95,
        "quality": 93,
        "overall": 94
      },
      "status": "pending"
    },
    {
      "rank": 2,
      "carrierId": "TR003",
      "carrierName": "Logistique Pro",
      "proposedPrice": 455,
      "scores": {
        "price": 88,
        "quality": 93,
        "overall": 91
      },
      "status": "negotiating"
    }
  ]
}
```

### 7. VIGILANCE

#### POST /api/v1/affretia/vigilance/check

Verifier la conformite d'un transporteur

**Request:**
```json
{
  "carrierId": "TR001",
  "checks": ["kbis", "insurance", "license", "blacklist"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "carrierId": "TR001",
    "overallStatus": "compliant",
    "complianceScore": 100,
    "checks": {
      "kbis": { "valid": true, "expiryDate": "2026-12-31" },
      "insurance": { "valid": true, "expiryDate": "2026-03-15" },
      "license": { "valid": true, "expiryDate": "2027-01-01" },
      "blacklist": { "clean": true }
    }
  }
}
```

### 8. REPORTING

#### GET /api/v1/affretia/sessions

Liste des sessions AFFRET.IA

**Query Params:**
- `status` (optional)
- `organizationId` (optional)
- `dateFrom` (optional)
- `dateTo` (optional)
- `limit` (default: 50)

#### GET /api/v1/affretia/stats

Statistiques globales AFFRET.IA

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSessions": 156,
    "successRate": 92.3,
    "avgResponseTime": 18,
    "avgPrice": 425,
    "avgDuration": 32,
    "topCarriers": [
      { "carrierId": "TR001", "name": "Transport Express", "assignations": 45 }
    ]
  }
}
```

---

## Workflow Complet

### Scenario: Commande sans Transporteur

```
1. DECLENCHEMENT
   POST /api/v1/affretia/trigger
   → Session AFFRET-20251127-0001 creee

2. ANALYSE IA
   POST /api/v1/affretia/analyze
   → Complexite: 35/100
   → Prix estime: 450€
   → Shortlist: 8 transporteurs

3. DIFFUSION
   POST /api/v1/affretia/broadcast
   → 8 emails envoyes
   → Publication bourse
   → 5 push notifications

4. RECEPTION PROPOSITIONS
   - TR001: 430€ → Score 94/100
   - TR002: 480€ → Rejetee (> +15%)
   - TR003: 465€ → Score 91/100

5. NEGOCIATION AUTO
   TR003 propose 465€ (+3.3%)
   → IA contre-propose 455€
   → TR003 accepte 455€

6. SELECTION IA
   POST /api/v1/affretia/select
   → TR001 selectionne (meilleur score global)

7. VERIFICATION VIGILANCE
   POST /api/v1/affretia/vigilance/check
   → Tous les checks OK

8. ASSIGNATION
   → Commande assignee a TR001
   → Notifications envoyees
   → Tracking configure (niveau Premium)

9. EXECUTION TRANSPORT
   → Enlevement Paris 08:30
   → Livraison Lyon 13:45

10. SCORING FINAL
    → Score transport: 98/100
    → Mise a jour profil TR001
    → Feed-back IA
```

---

## Modeles de Donnees

### AffretSession

Session complete d'affretement AFFRET.IA

**Champs principaux:**
- `sessionId` - ID unique (AFFRET-YYYYMMDD-XXXX)
- `orderId` - Commande associee
- `status` - Statut (analyzing, broadcasting, assigned, etc.)
- `analysis` - Resultat analyse IA
- `shortlist` - Liste transporteurs selectionnes
- `broadcast` - Details diffusion
- `selection` - Transporteur final
- `metrics` - Metriques de performance

### CarrierProposal

Proposition d'un transporteur

**Champs principaux:**
- `sessionId` - Session associee
- `carrierId` - Transporteur
- `proposedPrice` - Prix propose
- `status` - Statut (pending, accepted, negotiating, etc.)
- `scores` - Scores (price, quality, overall)
- `negotiationHistory` - Historique negociations
- `vigilanceCheck` - Verification conformite

### BroadcastCampaign

Campagne de diffusion multi-canal

**Champs principaux:**
- `campaignId` - ID campagne
- `sessionId` - Session associee
- `channels` - Canaux utilises (email, bourse, push)
- `recipients` - Liste destinataires avec tracking
- `stats` - Statistiques (sent, delivered, opened, responded)
- `reminders` - Relances

### VigilanceCheck

Verification conformite transporteur

**Champs principaux:**
- `carrierId` - Transporteur
- `checks` - Verifications (KBIS, assurance, licence, blacklist)
- `overallStatus` - Statut global (compliant, warning, non_compliant)
- `complianceScore` - Score 0-100
- `alerts` - Alertes actives

---

## Moteur IA

### Algorithme de Scoring

```javascript
Score Global = (Score Prix × 40%) + (Score Qualite × 60%)

Score Prix (0-100):
  - 100 si prix <= estimation
  - Decroit lineairement si prix > estimation
  - Penalites:
    * +5%: 90-100
    * +5% a +15%: 50-90
    * +15% a +30%: 20-50
    * > +30%: 0-20

Score Qualite (0-100):
  - Historique performances: 25%
  - Ponctualite: 15%
  - Taux acceptation: 10%
  - Reactivite: 5%
  - Capacite: 5%
```

### Analyse Complexite

```javascript
Complexite Commande (0-100):
  - Distance: 0-30 points
  - Poids/Volume: 0-20 points
  - Contraintes speciales: 0-30 points
  - Delai serre: 0-20 points

Categories:
  - 0-20: Tres simple
  - 20-40: Simple
  - 40-60: Modere
  - 60-80: Complexe
  - 80-100: Tres complexe
```

### Auto-Acceptation

```javascript
Conditions:
  1. Prix <= estimation + 0%
  2. Score qualite >= 70/100
  3. Score global >= 75/100

→ Acceptation automatique
```

### Negociation Automatique

```javascript
Si prix > estimation ET prix <= estimation + 15%:
  → Contre-proposition intelligente
  → Max 3 tours de negociation
  → Timeout 24h
```

---

## Integration

### Services Utilises

```javascript
// WebSocket (Port 3010)
websocket.emit('emit-event', {
  eventName: 'affret.session.created',
  data: { sessionId, orderId }
});

// Orders API (Port 3011)
GET /api/v1/orders/:orderId
PUT /api/v1/orders/:orderId

// Scoring API (Port 3016)
GET /api/v1/carriers/:carrierId/score

// Notifications API (Port 3015)
POST /api/v1/notifications/send
```

### Evenements WebSocket

```javascript
// Evenements emis
'affret.session.created'
'affret.analysis.completed'
'affret.broadcast.started'
'affret.proposal.received'
'affret.proposal.auto_rejected'
'affret.negotiation.started'
'affret.carrier.selected'
'affret.tracking.configured'
```

---

## Deploiement

### AWS Elastic Beanstalk

```bash
# Initialiser EB
eb init -p node.js-18 affret-ia-api-v2 --region eu-west-3

# Creer environnement
eb create affret-ia-prod --instance-type t3.small

# Configurer variables d'environnement
eb setenv MONGODB_URI=xxx JWT_SECRET=xxx SCORING_API_URL=xxx

# Deployer
eb deploy
```

### Docker

```bash
# Build
docker build -t affret-ia-api-v2 .

# Run
docker run -p 3017:3017 --env-file .env affret-ia-api-v2
```

### Health Check

```bash
curl https://affret-ia.symphonia.com/health
```

---

## Licence

Copyright (c) 2025 RT Technologie - SYMPHONI.A Platform
All rights reserved.

---

**Developpe avec ❤️ par l'equipe SYMPHONI.A**
**Version:** 2.0.0
**Date:** 27 Novembre 2025
