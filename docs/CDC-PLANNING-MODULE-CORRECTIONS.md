# CAHIER DES CHARGES - Module Planning Chargement & Livraison

## SYMPHONI.A - Correction et Integration Complete

**Date**: 12 Janvier 2026
**Version**: 1.0
**Statut**: A IMPLEMENTER
**Priorite**: CRITIQUE

---

## 1. CONTEXTE ET DIAGNOSTIC

### 1.1 Situation Actuelle

Le module Planning Chargement & Livraison est present dans les 3 univers (Logisticien, Industrie, Transporteur) mais **aucune API backend n'est accessible**.

| Composant | Fichier | Statut |
|-----------|---------|--------|
| Frontend Logisticien | `web-logistician/pages/planning.tsx` | UI OK, mock data |
| Frontend Industrie | `web-industry/pages/planning.tsx` | UI OK, mock data |
| Frontend Transporteur | `web-transporter/pages/planning.tsx` | UI OK, mock data |
| Backend Routes | `subscriptions-contracts-eb/planning-routes.js` | Code OK, non deploye |
| Backend Service | `subscriptions-contracts-eb/planning-service.js` | Code OK, non deploye |
| API Planning | `dpw23bg2dclr1.cloudfront.net` | HTTP 000 (down) |
| API Subscriptions | `dgze8l03lwl5h.cloudfront.net` | HTTP 502 (crash) |

### 1.2 Problemes Identifies

1. **Backend subscriptions-contracts-eb en erreur 502** - MongoDB non connecte
2. **API Planning inexistante** - CloudFront pointe vers rien
3. **Incompatibilite des prefixes URL** - Frontend `/api/v1/` vs Backend `/api/`
4. **Pas de synchronisation inter-univers** - Chaque univers isole
5. **Pas de notifications temps reel** - Pas de WebSocket

---

## 2. OBJECTIFS

### 2.1 Objectifs Fonctionnels

- [ ] Restaurer l'acces aux APIs backend
- [ ] Permettre la gestion complete des plannings de sites
- [ ] Synchroniser les RDV entre les 3 univers
- [ ] Implementer le tracking temps reel des chauffeurs
- [ ] Connecter le module Planning aux modules RDV et Tracking

### 2.2 Objectifs Techniques

- [ ] Deployer un backend stable avec connexion MongoDB
- [ ] Standardiser les prefixes d'URL API
- [ ] Implementer WebSocket pour les notifications temps reel
- [ ] Creer des webhooks inter-univers

---

## 3. SPECIFICATIONS FONCTIONNELLES

### 3.1 Module Planning - Vue Logisticien

#### 3.1.1 Gestion des Creneaux (Slots)

**Fonctionnalites:**
- Visualiser le calendrier des creneaux par jour/semaine/quai
- Bloquer/Debloquer des creneaux
- Modifier la capacite des creneaux
- Generer automatiquement les creneaux pour une periode

**Endpoints requis:**
```
GET    /api/v1/planning/slots?date=YYYY-MM-DD&siteId=xxx
POST   /api/v1/planning/slots
PUT    /api/v1/planning/slots/:id
POST   /api/v1/planning/slots/:id/block
POST   /api/v1/planning/slots/:id/unblock
DELETE /api/v1/planning/slots/:id
```

#### 3.1.2 Gestion des Quais (Docks)

**Fonctionnalites:**
- Lister les quais d'un site
- Creer/Modifier/Supprimer des quais
- Activer/Desactiver des quais
- Definir le type (chargement/dechargement/both)

**Endpoints requis:**
```
GET    /api/v1/planning/sites/:siteId/docks
POST   /api/v1/planning/sites/:siteId/docks
PUT    /api/v1/planning/sites/:siteId/docks/:dockId
PUT    /api/v1/planning/sites/:siteId/docks/:dockId/status
DELETE /api/v1/planning/sites/:siteId/docks/:dockId
```

#### 3.1.3 Validation des Demandes de RDV

**Fonctionnalites:**
- Recevoir les demandes de RDV des transporteurs
- Approuver/Refuser les demandes
- Proposer un creneau alternatif
- Envoyer des notifications au transporteur

**Endpoints requis:**
```
GET    /api/v1/planning/bookings?status=pending
POST   /api/v1/planning/bookings/:id/approve
POST   /api/v1/planning/bookings/:id/reject
POST   /api/v1/planning/bookings/:id/propose-alternative
```

#### 3.1.4 Suivi Temps Reel

**Fonctionnalites:**
- Voir les vehicules en approche (geofencing)
- Recevoir les ETA des transporteurs
- Gerer la file d'attente au site
- Enregistrer check-in/check-out

**Endpoints requis:**
```
GET    /api/v1/planning/sites/:siteId/incoming
GET    /api/v1/planning/sites/:siteId/queue
POST   /api/v1/planning/bookings/:id/checkin
POST   /api/v1/planning/bookings/:id/checkout
WebSocket: /ws/planning/site/:siteId
```

### 3.2 Module Planning - Vue Industrie

#### 3.2.1 Configuration des Sites

**Fonctionnalites:**
- Creer/Modifier des sites de chargement/livraison
- Definir les horaires d'ouverture
- Configurer les jours feries
- Gerer les quais par site

**Endpoints requis:**
```
GET    /api/v1/planning/sites
POST   /api/v1/planning/sites
PUT    /api/v1/planning/sites/:id
DELETE /api/v1/planning/sites/:id
GET    /api/v1/planning/sites/:id/config
PUT    /api/v1/planning/sites/:id/config
```

#### 3.2.2 Delegation aux Logisticiens

**Fonctionnalites:**
- Deleguer la gestion d'un site a un logisticien
- Definir les permissions du logisticien
- Suivre l'activite du site

**Endpoints requis:**
```
POST   /api/v1/planning/sites/:id/delegate
PUT    /api/v1/planning/sites/:id/delegation/:logisticianId
DELETE /api/v1/planning/sites/:id/delegation/:logisticianId
GET    /api/v1/planning/sites/:id/activity
```

### 3.3 Module Planning - Vue Transporteur

#### 3.3.1 Reservation de Creneaux

**Fonctionnalites:**
- Rechercher les creneaux disponibles
- Reserver un creneau
- Modifier/Annuler une reservation
- Voir l'historique des reservations

**Endpoints requis:**
```
GET    /api/v1/planning/slots/available?siteId=xxx&date=xxx&type=loading
POST   /api/v1/planning/bookings
PUT    /api/v1/planning/bookings/:id
DELETE /api/v1/planning/bookings/:id
GET    /api/v1/planning/bookings/my
```

#### 3.3.2 Borne Virtuelle Chauffeur

**Fonctionnalites:**
- Check-in a l'arrivee sur site (QR code ou geolocalisation)
- Signaler son arrivee au quai
- Declarer le debut/fin d'operation
- Check-out au depart

**Endpoints requis:**
```
POST   /api/v1/planning/driver/approaching
POST   /api/v1/planning/driver/checkin
POST   /api/v1/planning/driver/at-dock
POST   /api/v1/planning/driver/start-operation
POST   /api/v1/planning/driver/complete-operation
POST   /api/v1/planning/driver/checkout
GET    /api/v1/planning/driver/status/:bookingId
```

---

## 4. SPECIFICATIONS TECHNIQUES

### 4.1 Architecture Cible

```
                                    +------------------+
                                    |   CloudFront     |
                                    |  (HTTPS Proxy)   |
                                    +--------+---------+
                                             |
              +------------------------------+------------------------------+
              |                              |                              |
     +--------v--------+          +----------v----------+         +--------v--------+
     | web-logistician |          |    web-industry     |         | web-transporter |
     |   (Next.js)     |          |     (Next.js)       |         |    (Next.js)    |
     +--------+--------+          +----------+----------+         +--------+--------+
              |                              |                              |
              +------------------------------+------------------------------+
                                             |
                                    +--------v---------+
                                    |   API Gateway    |
                                    | planning-api-eb  |
                                    +--------+---------+
                                             |
              +------------------------------+------------------------------+
              |                              |                              |
     +--------v--------+          +----------v----------+         +--------v--------+
     |  Planning DB    |          |   Notifications     |         |   WebSocket     |
     |   (MongoDB)     |          |   (Redis PubSub)    |         |    Server       |
     +-----------------+          +---------------------+         +-----------------+
```

### 4.2 Backend - Nouvelle API Planning

#### 4.2.1 Service Elastic Beanstalk

**Nom**: `rt-planning-api`
**Region**: eu-west-3 (Paris)
**Platform**: Node.js 18
**Instance**: t3.small

**Variables d'environnement:**
```
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...
JWT_SECRET=xxx
CORS_ORIGINS=https://logisticien.symphonia.fr,https://industrie.symphonia.fr,https://transporteur.symphonia.fr
```

#### 4.2.2 Structure du Code

```
services/planning-api-eb/
├── index.js                    # Point d'entree Express
├── package.json
├── Procfile
├── routes/
│   ├── sites.routes.js         # CRUD sites
│   ├── docks.routes.js         # CRUD quais
│   ├── slots.routes.js         # CRUD creneaux
│   ├── bookings.routes.js      # Reservations
│   ├── driver.routes.js        # Borne virtuelle
│   └── stats.routes.js         # Statistiques
├── services/
│   ├── planning.service.js     # Logique metier planning
│   ├── booking.service.js      # Logique reservations
│   ├── driver-checkin.service.js
│   ├── notification.service.js # Envoi notifications
│   └── geofence.service.js     # Detection approche
├── models/
│   ├── site.model.js
│   ├── dock.model.js
│   ├── slot.model.js
│   ├── booking.model.js
│   └── driver-event.model.js
├── middleware/
│   ├── auth.middleware.js
│   └── validation.middleware.js
└── websocket/
    └── planning.ws.js          # WebSocket server
```

#### 4.2.3 Modeles de Donnees MongoDB

**Collection: planning_sites**
```javascript
{
  _id: ObjectId,
  organizationId: ObjectId,          // Industriel proprietaire
  delegatedTo: ObjectId,             // Logisticien delegue (optionnel)
  name: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: String,
    coordinates: { lat: Number, lng: Number }
  },
  type: 'warehouse' | 'factory' | 'hub' | 'cross_dock',
  operatingHours: {
    monday: { open: String, close: String },
    // ...autres jours
  },
  holidays: [Date],
  geofenceRadius: Number,            // metres
  config: {
    timeSlotDuration: 15 | 30 | 60,  // minutes
    autoApprove: Boolean,
    maxAdvanceBooking: Number,       // jours
    minAdvanceBooking: Number        // heures
  },
  status: 'active' | 'inactive',
  createdAt: Date,
  updatedAt: Date
}
```

**Collection: planning_docks**
```javascript
{
  _id: ObjectId,
  siteId: ObjectId,
  name: String,
  type: 'loading' | 'unloading' | 'both',
  capacity: {
    maxPallets: Number,
    maxWeight: Number,               // kg
    maxVehicleLength: Number         // metres
  },
  vehicleTypes: ['semi', 'porteur', 'camionnette'],
  equipment: ['hayon', 'transpalette', 'chariot'],
  status: 'available' | 'occupied' | 'maintenance' | 'blocked',
  position: Number,                  // ordre d'affichage
  createdAt: Date,
  updatedAt: Date
}
```

**Collection: planning_slots**
```javascript
{
  _id: ObjectId,
  siteId: ObjectId,
  dockId: ObjectId,
  date: Date,
  startTime: String,                 // "08:00"
  endTime: String,                   // "10:00"
  type: 'loading' | 'unloading' | 'both',
  capacity: {
    maxPallets: Number,
    usedPallets: Number,
    maxWeight: Number,
    usedWeight: Number
  },
  status: 'available' | 'booked' | 'blocked' | 'in_progress' | 'completed',
  blockedReason: String,
  blockedBy: ObjectId,
  bookingId: ObjectId,               // si reserve
  createdAt: Date,
  updatedAt: Date
}
```

**Collection: planning_bookings**
```javascript
{
  _id: ObjectId,
  bookingNumber: String,             // "RDV-2026-001234"
  siteId: ObjectId,
  slotId: ObjectId,
  dockId: ObjectId,

  // Transporteur
  carrierId: ObjectId,
  carrierName: String,

  // Commande associee
  orderId: ObjectId,
  orderRef: String,

  // Details
  type: 'loading' | 'unloading',
  requestedDate: Date,
  requestedTimeSlot: String,
  confirmedDate: Date,
  confirmedTime: String,

  // Cargo
  cargo: {
    palletCount: Number,
    weight: Number,
    description: String,
    dangerous: Boolean,
    temperature: String
  },

  // Vehicule
  vehicle: {
    plate: String,
    trailerPlate: String,
    type: String
  },

  // Chauffeur
  driver: {
    name: String,
    phone: String,
    email: String
  },

  // Workflow
  status: 'pending' | 'confirmed' | 'rejected' | 'checked_in' |
          'at_dock' | 'in_progress' | 'completed' | 'cancelled' | 'no_show',

  workflow: {
    requestedAt: Date,
    confirmedAt: Date,
    confirmedBy: ObjectId,
    rejectedAt: Date,
    rejectedBy: ObjectId,
    rejectionReason: String,
    checkedInAt: Date,
    atDockAt: Date,
    operationStartedAt: Date,
    operationCompletedAt: Date,
    checkedOutAt: Date
  },

  // Tracking
  tracking: {
    eta: String,
    etaUpdatedAt: Date,
    lastPosition: {
      lat: Number,
      lng: Number,
      timestamp: Date
    },
    distanceRemaining: Number        // km
  },

  // Notes
  notes: String,
  internalNotes: String,

  createdAt: Date,
  updatedAt: Date
}
```

**Collection: planning_driver_events**
```javascript
{
  _id: ObjectId,
  bookingId: ObjectId,
  driverId: ObjectId,
  event: 'approaching' | 'geofence_enter' | 'checkin' | 'at_dock' |
         'operation_start' | 'operation_complete' | 'checkout' | 'geofence_exit',
  timestamp: Date,
  location: {
    lat: Number,
    lng: Number
  },
  data: {
    // Donnees specifiques a l'event
  },
  createdAt: Date
}
```

### 4.3 Frontend - Modifications

#### 4.3.1 Configuration API (api.ts)

**Fichier**: `apps/web-logistician/lib/api.ts`

Modifier l'URL de l'API Planning:
```typescript
export const API_CONFIG = {
  // ...autres APIs...

  // Planning API - NOUVELLE URL
  PLANNING_API: process.env.NEXT_PUBLIC_PLANNING_API_URL || 'https://d[NEW_ID].cloudfront.net',
};
```

#### 4.3.2 Standardisation des Endpoints

Aligner tous les appels API sur le format `/api/v1/planning/...`:

| Endpoint Frontend | Endpoint Backend |
|-------------------|------------------|
| `/api/v1/planning/sites` | `/api/v1/planning/sites` |
| `/api/v1/planning/slots` | `/api/v1/planning/slots` |
| `/api/v1/planning/bookings` | `/api/v1/planning/bookings` |
| `/api/v1/planning/driver/*` | `/api/v1/planning/driver/*` |

### 4.4 WebSocket - Notifications Temps Reel

#### 4.4.1 Events WebSocket

**Namespace**: `/ws/planning`

**Events Server -> Client:**
```typescript
// Nouveau RDV demande
socket.emit('booking:requested', {
  bookingId: string,
  carrierName: string,
  requestedDate: string,
  requestedTime: string,
  type: 'loading' | 'unloading'
});

// Chauffeur en approche
socket.emit('driver:approaching', {
  bookingId: string,
  driverName: string,
  eta: string,
  distanceKm: number
});

// Check-in effectue
socket.emit('driver:checkedIn', {
  bookingId: string,
  driverName: string,
  vehiclePlate: string,
  timestamp: Date
});

// Mise a jour ETA
socket.emit('tracking:etaUpdate', {
  bookingId: string,
  newEta: string,
  previousEta: string,
  reason: 'traffic' | 'delay' | 'early'
});

// Slot status change
socket.emit('slot:statusChanged', {
  slotId: string,
  oldStatus: string,
  newStatus: string
});
```

**Events Client -> Server:**
```typescript
// S'abonner aux events d'un site
socket.emit('subscribe:site', { siteId: string });

// Se desabonner
socket.emit('unsubscribe:site', { siteId: string });
```

### 4.5 Integration Inter-Modules

#### 4.5.1 Planning <-> RDV Transporteurs

Quand un RDV est confirme dans le module Planning:
1. Creer/mettre a jour l'entree dans `planning_bookings`
2. Envoyer notification WebSocket au transporteur
3. Envoyer email de confirmation au transporteur
4. Mettre a jour le slot comme "booked"

#### 4.5.2 Planning <-> Tracking

Quand le tracking detecte un vehicule:
1. Recevoir la position GPS du vehicule
2. Calculer l'ETA vers le site
3. Detecter l'entree dans la geofence
4. Mettre a jour `booking.tracking`
5. Envoyer notification WebSocket au logisticien

#### 4.5.3 Planning <-> eCMR

Quand une operation est completee:
1. Generer le document eCMR pre-rempli
2. Collecter les signatures (chauffeur, magasinier)
3. Archiver le document
4. Lier l'eCMR au booking

---

## 5. PLAN D'IMPLEMENTATION

### Phase 1: Restauration Backend (Semaine 1)

| Tache | Description | Fichiers |
|-------|-------------|----------|
| 1.1 | Corriger connexion MongoDB subscriptions-contracts-eb | `index.js` |
| 1.2 | Deployer version stable v4.3.3 | `create-bundle-py.py` |
| 1.3 | Verifier tous les endpoints | Tests manuels |
| 1.4 | Ajouter routes planning dans index.js | `index.js` |

### Phase 2: Nouvelle API Planning (Semaine 2)

| Tache | Description | Fichiers |
|-------|-------------|----------|
| 2.1 | Creer service EB rt-planning-api | AWS Console |
| 2.2 | Implementer routes sites/docks/slots | `routes/*.js` |
| 2.3 | Implementer routes bookings | `routes/bookings.routes.js` |
| 2.4 | Implementer routes driver | `routes/driver.routes.js` |
| 2.5 | Configurer CloudFront | AWS Console |

### Phase 3: Integration Frontend (Semaine 3)

| Tache | Description | Fichiers |
|-------|-------------|----------|
| 3.1 | Mettre a jour API_CONFIG | `lib/api.ts` |
| 3.2 | Retirer les mock data | `pages/planning.tsx` |
| 3.3 | Connecter aux vrais endpoints | `pages/planning.tsx` |
| 3.4 | Tester sur les 3 univers | Tests manuels |

### Phase 4: WebSocket & Notifications (Semaine 4)

| Tache | Description | Fichiers |
|-------|-------------|----------|
| 4.1 | Implementer serveur WebSocket | `websocket/planning.ws.js` |
| 4.2 | Ajouter client WebSocket frontend | `lib/websocket.ts` |
| 4.3 | Implementer notifications temps reel | `pages/planning.tsx` |
| 4.4 | Tester flux complet | Tests E2E |

### Phase 5: Tests & Documentation (Semaine 5)

| Tache | Description | Fichiers |
|-------|-------------|----------|
| 5.1 | Tests unitaires backend | `tests/*.test.js` |
| 5.2 | Tests integration | `tests/integration/*.test.js` |
| 5.3 | Documentation API (Swagger) | `swagger.yaml` |
| 5.4 | Guide utilisateur | `docs/USER_GUIDE.md` |

---

## 6. CRITERES D'ACCEPTATION

### 6.1 Backend

- [ ] API Planning accessible via CloudFront (HTTP 200)
- [ ] Connexion MongoDB stable
- [ ] Tous les endpoints retournent des reponses valides
- [ ] Authentification JWT fonctionnelle
- [ ] Temps de reponse < 500ms

### 6.2 Frontend Logisticien

- [ ] Calendrier affiche les vrais creneaux de la BDD
- [ ] Blocage/Deblocage de creneaux persiste
- [ ] Approbation/Rejet de RDV envoie notification
- [ ] Suivi temps reel affiche les positions GPS
- [ ] Stats calculees depuis les vraies donnees

### 6.3 Frontend Industrie

- [ ] Creation de site persiste en BDD
- [ ] Configuration des quais fonctionnelle
- [ ] Delegation a logisticien operationnelle
- [ ] Vue activite site temps reel

### 6.4 Frontend Transporteur

- [ ] Recherche creneaux disponibles fonctionnelle
- [ ] Reservation de creneau cree un booking
- [ ] Borne virtuelle permet check-in/check-out
- [ ] Historique des reservations affiche depuis BDD

### 6.5 Integration

- [ ] Notification WebSocket recue en < 2 secondes
- [ ] Email de confirmation envoye a la validation RDV
- [ ] eCMR genere automatiquement a la fin d'operation
- [ ] Synchronisation inter-univers fonctionnelle

---

## 7. RISQUES ET MITIGATIONS

| Risque | Impact | Probabilite | Mitigation |
|--------|--------|-------------|------------|
| MongoDB Atlas indisponible | Critique | Faible | Multi-region, backups |
| Surcharge API | Haut | Moyen | Rate limiting, cache Redis |
| Perte de connexion WebSocket | Moyen | Moyen | Reconnexion auto, fallback polling |
| Incompatibilite navigateur | Faible | Faible | Polyfills, feature detection |

---

## 8. ANNEXES

### 8.1 Liste des Fichiers a Creer/Modifier

**Backend - A CREER:**
```
services/planning-api-eb/
├── index.js
├── package.json
├── Procfile
├── routes/sites.routes.js
├── routes/docks.routes.js
├── routes/slots.routes.js
├── routes/bookings.routes.js
├── routes/driver.routes.js
├── routes/stats.routes.js
├── services/planning.service.js
├── services/booking.service.js
├── services/driver-checkin.service.js
├── services/notification.service.js
├── services/geofence.service.js
├── models/site.model.js
├── models/dock.model.js
├── models/slot.model.js
├── models/booking.model.js
├── models/driver-event.model.js
├── middleware/auth.middleware.js
├── middleware/validation.middleware.js
└── websocket/planning.ws.js
```

**Frontend - A MODIFIER:**
```
apps/web-logistician/
├── lib/api.ts                    # Mettre a jour PLANNING_API URL
├── lib/websocket.ts              # A CREER - Client WebSocket
├── pages/planning.tsx            # Retirer mock data, connecter API
├── pages/tracking.tsx            # Connecter WebSocket
└── pages/rdv-transporteurs.tsx   # Connecter API RDV

apps/web-industry/
├── lib/api.ts
└── pages/planning.tsx

apps/web-transporter/
├── lib/api.ts
└── pages/planning.tsx
```

### 8.2 Commandes de Deploiement

```bash
# Creer le bundle backend
cd services/planning-api-eb
python create-bundle.py

# Upload vers S3
aws s3 cp bundle/deploy-v1.0.0.zip s3://elasticbeanstalk-eu-west-3-004843574253/rt-planning-api/v1.0.0.zip

# Creer la version applicative
aws elasticbeanstalk create-application-version \
  --application-name rt-planning-api \
  --version-label v1.0.0 \
  --source-bundle S3Bucket=elasticbeanstalk-eu-west-3-004843574253,S3Key=rt-planning-api/v1.0.0.zip

# Deployer
aws elasticbeanstalk update-environment \
  --environment-name rt-planning-api-prod \
  --version-label v1.0.0
```

### 8.3 Configuration CloudFront

```json
{
  "Origins": {
    "Items": [
      {
        "DomainName": "rt-planning-api-prod.eu-west-3.elasticbeanstalk.com",
        "OriginPath": "",
        "CustomOriginConfig": {
          "HTTPPort": 80,
          "HTTPSPort": 443,
          "OriginProtocolPolicy": "http-only"
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "AllowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "POST", "DELETE"],
    "CachedMethods": ["GET", "HEAD"],
    "ForwardedValues": {
      "Headers": ["Authorization", "Content-Type", "Origin"],
      "QueryString": true
    },
    "ViewerProtocolPolicy": "redirect-to-https"
  }
}
```

---

**FIN DU CAHIER DES CHARGES**

Document genere le 12/01/2026
Auteur: Claude Code Assistant
Version: 1.0
