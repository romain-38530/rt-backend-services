# 🚚 SYMPHONI.A - Système de Gestion des Commandes de Transport

**Version**: 1.0.0
**Date**: 25 novembre 2024
**Type**: Spécification complète

---

## 📋 Vue d'Ensemble

SYMPHONI.A est un système complet de gestion des commandes de transport qui gère tout le cycle de vie d'une commande, de la création à l'archivage, en passant par l'affectation des transporteurs, le tracking GPS, et le scoring.

### Fonctionnalités Principales

✅ **Création multi-canal** - ERP API, UI Industriel, Duplication
✅ **Lane Matching IA** - Identification automatique des lignes de transport
✅ **Dispatch Chain** - Chaîne d'affectation avec fallback automatique
✅ **Tracking Multi-niveaux** - Basic Email, GPS Smartphone, TomTom Premium
✅ **Gestion RDV** - Prise et confirmation de rendez-vous automatique
✅ **Documents** - OCR, validation, archivage 10 ans
✅ **Scoring** - Notation automatique des transporteurs
✅ **Affret.IA** - Escalade automatique vers 40 000 transporteurs

---

## 🔄 Processus Complet (12 Phases)

### Phase 1: Création (order.created)
- **Canaux**: ERP API, UI Industriel, Duplication
- **Status**: `NEW` → `AWAITING_ASSIGNMENT`
- **Données**: référence, adresses, fenêtres horaires, contraintes

### Phase 2: Lane Matching (order.lane.detected)
- **IA interne**: Analyse origine, destination, type, historique
- **Sortie**: Ligne de transport identifiée

### Phase 3: Dispatch Chain (dispatch.chain.generated)
- **Logique**: Chaîne d'affectation définie par industriel
- **Vérifications**: vigilance, disponibilité, scoring, grille tarifaire
- **Fallback**: Passage automatique au suivant si non conforme

### Phase 4: Envoi Transporteur (order.sent.to.carrier)
- **Canaux**: Email, Notification portail, SMS optionnel
- **Délai**: 2 heures configurable
- **Status**: `SENT_TO_CARRIER` → `AWAITING_CARRIER_RESPONSE`

### Phase 5: Réponse Transporteur
- **Acceptation** (`carrier.accepted`) → Status `ACCEPTED`
- **Refus** (`carrier.refused`) → Passer au suivant
- **Timeout** (`carrier.timeout`) → Passer au suivant automatiquement

### Phase 6: Affret.IA (order.escalated.to.affretia)
- **Trigger**: Aucun transporteur n'accepte
- **Réseau**: 40 000 transporteurs
- **Pricing**: IA automatique
- **Sélection**: Par scoring

### Phase 7: Tracking (tracking.started)

#### Version BASIC (50€/mois)
- Mises à jour par email clic
- Statuts manuels chauffeur
- Pas de GPS temps réel

#### Version INTERMEDIATE (150€/mois)
- GPS Smartphone 30 sec
- Application mobile
- Géofencing simple
- Carte temps réel

#### Version PREMIUM (4€/transport)
- GPS télématique 1-5 sec
- ETA TomTom en direct
- IA prédictive retards
- Replanification auto RDV

### Phase 8: Rendez-vous (rdv.*)
- **rdv.requested**: Transporteur propose créneau
- **rdv.proposed**: Fournisseur/destinataire propose
- **rdv.confirmed**: Confirmation finale

### Phase 9: Suivi Temps Réel
- `order.arrived.pickup` - Arrivée chargement (géofence)
- `order.loaded` - Chargé (app/OCR)
- `order.departed.pickup` - Départ chargement
- `order.arrived.delivery` - Arrivée livraison
- `order.delivered` - Livré (confirmation)

### Phase 10: Documents (documents.uploaded)
- **Upload**: Email, App, eCMR auto
- **OCR**: Lecture automatique
- **Validation**: Vérification conformité
- **Classement**: Archivage automatique
- **Sync ERP**: Mise à jour industriel

### Phase 11: Scoring (carrier.scored)

**Critères de notation (0-100)** :
- Ponctualité chargement (20%)
- Ponctualité livraison (25%)
- Respect RDV (15%)
- Réactivité tracking (15%)
- Délai dépôt POD (15%)
- Incidents (10%)

### Phase 12: Archivage (order.closed)
- Synchronisation ERP
- Génération preuve transport
- Clôture documentaire
- Archivage 10 ans
- Mise à jour statistiques
- Mise à jour scoring transporteur

---

## 📊 Modèles de Données

### Transport Order
```javascript
{
  _id: ObjectId,
  reference: "ORD-241125-0001",
  industrialId: "IND001",

  // Adresses
  pickupAddress: {
    name: "Entrepôt A",
    street: "123 Rue de la Logistique",
    city: "Lyon",
    postalCode: "69000",
    country: "FR",
    coordinates: { lat: 45.764043, lng: 4.835659 }
  },
  deliveryAddress: { /* même structure */ },

  // Fenêtres horaires
  pickupTimeWindow: {
    start: ISODate("2024-11-26T08:00:00Z"),
    end: ISODate("2024-11-26T12:00:00Z")
  },
  deliveryTimeWindow: { /* même structure */ },

  // Marchandise
  weight: 15000, // kg
  pallets: 15,
  volume: 30, // m³

  // Contraintes
  constraints: ["FTL", "HAYON", "RDV"],

  // Statut & affectation
  status: "AWAITING_ASSIGNMENT",
  assignedCarrierId: null,
  dispatchChain: [
    { carrierId: "CAR001", order: 1, status: "pending" },
    { carrierId: "CAR002", order: 2, status: "pending" },
    { carrierId: "AFFRETIA", order: 3, status: "pending" }
  ],

  // Tracking
  trackingType: "PREMIUM",
  currentPosition: { lat: 45.764, lng: 4.835, timestamp: ISODate() },
  eta: ISODate("2024-11-26T15:30:00Z"),

  // Documents
  documents: [
    {
      type: "BL",
      url: "s3://...",
      uploadedAt: ISODate(),
      validated: true
    }
  ],

  // Scoring
  carrierScore: null,
  scoreMetrics: {},

  // Métadonnées
  creationChannel: "ERP_API",
  createdAt: ISODate(),
  updatedAt: ISODate(),
  closedAt: null
}
```

### Transport Event
```javascript
{
  _id: ObjectId,
  orderId: ObjectId("..."),
  eventType: "order.arrived.pickup",
  timestamp: ISODate(),
  data: {
    location: { lat: 45.764, lng: 4.835 },
    carrierReference: "CAR001",
    driverName: "Jean Dupont"
  },
  metadata: {
    source: "GPS",
    confidence: 0.95
  }
}
```

### Carrier Score
```javascript
{
  _id: ObjectId,
  carrierId: "CAR001",
  orderId: ObjectId("..."),
  score: 87,
  breakdown: {
    punctualityPickup: 85,
    punctualityDelivery: 90,
    rdvRespect: 100,
    trackingReactivity: 80,
    podDelay: 75,
    incidents: 100
  },
  scoredAt: ISODate()
}
```

---

## 🔌 API Endpoints

### 1. Création de Commandes

#### POST /api/transport-orders
Créer une nouvelle commande de transport

**Body**:
```json
{
  "reference": "ORD-241125-0001",
  "industrialId": "IND001",
  "pickupAddress": { /* ... */ },
  "deliveryAddress": { /* ... */ },
  "pickupTimeWindow": { /* ... */ },
  "deliveryTimeWindow": { /* ... */ },
  "weight": 15000,
  "pallets": 15,
  "constraints": ["FTL", "HAYON"],
  "creationChannel": "ERP_API"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "6743...",
    "reference": "ORD-241125-0001",
    "status": "NEW",
    "events": [
      { "type": "order.created", "timestamp": "..." }
    ]
  }
}
```

---

### 2. Lane Matching

#### POST /api/transport-orders/:orderId/lane-match
Déclencher le lane matching IA

**Response**:
```json
{
  "success": true,
  "data": {
    "laneId": "LANE-LYON-PARIS",
    "confidence": 0.95,
    "historicalData": {
      "averagePrice": 450,
      "averageDuration": "6h30",
      "topCarriers": ["CAR001", "CAR002"]
    }
  }
}
```

---

### 3. Dispatch Chain

#### POST /api/transport-orders/:orderId/generate-dispatch
Générer la chaîne d'affectation

**Response**:
```json
{
  "success": true,
  "data": {
    "dispatchChain": [
      {
        "carrierId": "CAR001",
        "order": 1,
        "status": "pending",
        "checksPassed": {
          "vigilance": true,
          "availability": true,
          "scoring": true,
          "pricingGrid": true
        }
      }
    ]
  }
}
```

#### POST /api/transport-orders/:orderId/send-to-carrier
Envoyer commande au transporteur suivant

---

### 4. Réponses Transporteur

#### POST /api/transport-orders/:orderId/carrier-response
Enregistrer réponse du transporteur

**Body**:
```json
{
  "carrierId": "CAR001",
  "response": "accepted", // or "refused"
  "reason": "Optionnel si refus"
}
```

---

### 5. Affret.IA

#### POST /api/transport-orders/:orderId/escalate-affretia
Escalader vers Affret.IA

---

### 6. Tracking

#### POST /api/transport-orders/:orderId/start-tracking
Démarrer le tracking

**Body**:
```json
{
  "trackingType": "PREMIUM", // BASIC, INTERMEDIATE, PREMIUM
  "driverContact": "..."
}
```

#### POST /api/transport-orders/:orderId/update-position
Mettre à jour position GPS

**Body**:
```json
{
  "lat": 45.764,
  "lng": 4.835,
  "speed": 85,
  "heading": 45,
  "timestamp": "..."
}
```

#### GET /api/transport-orders/:orderId/tracking
Obtenir l'état du tracking temps réel

---

### 7. Rendez-vous

#### POST /api/transport-orders/:orderId/rdv/request
Demander un RDV

#### POST /api/transport-orders/:orderId/rdv/propose
Proposer un créneau

#### POST /api/transport-orders/:orderId/rdv/confirm
Confirmer le RDV

---

### 8. Statuts Transport

#### POST /api/transport-orders/:orderId/status/arrived-pickup
Signaler arrivée chargement

#### POST /api/transport-orders/:orderId/status/loaded
Signaler chargement terminé

#### POST /api/transport-orders/:orderId/status/departed-pickup
Signaler départ chargement

#### POST /api/transport-orders/:orderId/status/arrived-delivery
Signaler arrivée livraison

#### POST /api/transport-orders/:orderId/status/delivered
Signaler livraison terminée

---

### 9. Documents

#### POST /api/transport-orders/:orderId/documents
Uploader un document (BL, CMR, POD)

**Body**: multipart/form-data
```
file: <file>
type: "BL" | "CMR" | "POD"
```

#### GET /api/transport-orders/:orderId/documents
Lister les documents

---

### 10. Scoring

#### POST /api/transport-orders/:orderId/score
Calculer le score du transporteur

**Body**:
```json
{
  "metrics": {
    "pickupDelay": 0, // minutes
    "deliveryDelay": -10, // en avance
    "rdvRespected": true,
    "trackingQuality": "excellent",
    "podDelay": 0, // jours
    "incidents": []
  }
}
```

---

### 11. Incidents

#### POST /api/transport-orders/:orderId/incidents
Signaler un incident

**Body**:
```json
{
  "type": "DELAY",
  "description": "Bouchon A7",
  "estimatedDelay": 30, // minutes
  "location": { "lat": ..., "lng": ... }
}
```

---

### 12. Recherche & Listing

#### GET /api/transport-orders
Lister les commandes avec filtres

**Query params**:
- `industrialId` - Filtrer par industriel
- `status` - Filtrer par statut
- `carrierId` - Filtrer par transporteur
- `dateFrom` / `dateTo` - Période
- `page`, `limit` - Pagination

#### GET /api/transport-orders/:orderId
Obtenir détails commande complète

#### GET /api/transport-orders/:orderId/events
Historique complet des événements

---

## 📈 Événements Système

Tous les événements sont enregistrés dans la collection `transport_events` :

```javascript
{
  orderId: ObjectId,
  eventType: "order.created",
  timestamp: ISODate(),
  data: { /* spécifique à l'événement */ },
  userId: "USER123", // optionnel
  source: "API" | "UI" | "SYSTEM"
}
```

---

## 🔒 Sécurité & Permissions

### Rôles
- **Admin** - Accès complet
- **Industrial** - CRUD sur ses commandes uniquement
- **Carrier** - Lecture commandes assignées, update statuts tracking
- **Driver** - Update statuts, upload documents

### Authentification
Tous les endpoints nécessitent JWT authentification (sauf webhooks avec signature)

---

## 📊 Collections MongoDB

1. `transport_orders` - Commandes de transport
2. `transport_events` - Événements système
3. `carrier_scores` - Scores transporteurs
4. `dispatch_chains` - Chaînes d'affectation
5. `tracking_positions` - Positions GPS historiques
6. `transport_documents` - Métadonnées documents
7. `rdv_history` - Historique rendez-vous
8. `incidents` - Incidents déclarés

---

## 🚀 Intégrations

### Externes
- **API TomTom** - ETA, routing, télématique
- **API VIES** - Validation TVA transporteurs
- **AWS S3** - Stockage documents
- **SendGrid** - Notifications email
- **Twilio** - Notifications SMS

### Internes
- **Carrier Referencing** - Vérification vigilance
- **Pricing Grids** - Calcul tarifs
- **JWT Auth** - Authentification
- **Industrial Config** - Configuration industriels

---

## 📝 Notes d'Implémentation

### Phase 1 (MVP)
✅ Création commandes (3 canaux)
✅ Dispatch chain basique
✅ Tracking Basic email
✅ Documents upload simples
✅ Scoring manuel

### Phase 2
- Lane matching IA
- Tracking GPS intermédiaire
- RDV automatique
- OCR documents

### Phase 3
- Affret.IA complet
- Tracking Premium TomTom
- IA prédictive retards
- Replanification auto

---

**Spécification créée le**: 25 novembre 2024
**Version**: 1.0.0
**Status**: 📋 **SPECIFICATION COMPLÈTE**
