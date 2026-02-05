# Dashdoc Data Lake

## Architecture

Le Data Lake Dashdoc stocke 100% des données Dashdoc dans MongoDB localement. Les services lisent depuis MongoDB au lieu de faire des appels API directs à Dashdoc.

```
┌─────────────────────────────────────────────────────────────────┐
│                        DASHDOC API                               │
└──────────────┬────────────────────────────────────┬─────────────┘
               │ LECTURE (sync 25s)                  │ ÉCRITURE (direct)
               ▼                                     ▲
┌──────────────────────────────┐    ┌───────────────────────────┐
│   DATALAKE SYNC SERVICE      │    │  DASHDOC UPDATE CONNECTOR │
│   (nouveau)                  │    │  (existant - inchangé)    │
│   - Full sync toutes les 1h  │    │  - PATCH /transports/{uid}│
│   - Incrémental toutes 25s   │    │  - Assignation carrier    │
└──────────────┬───────────────┘    └───────────────────────────┘
               │                                     ▲
               ▼                                     │
┌──────────────────────────────────────────────────────────────────┐
│                     MONGODB (Data Lake)                          │
│  Collections:                                                    │
│  - dashdoc_transports    - dashdoc_vehicles    - dashdoc_invoices│
│  - dashdoc_companies     - dashdoc_trailers    - dashdoc_addresses│
│  - dashdoc_truckers      - dashdoc_contacts    - dashdoc_sync_state│
└──────────────┬───────────────────────────────────────────────────┘
               │ LECTURE SEULE
               ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SERVICES CONSOMMATEURS                       │
│  - affret-ia-api-v2 (pricing, carriers, invitations)            │
│  - tms-sync-eb (routes API /orders, /carriers)                  │
│  - Autres services...                                            │
└──────────────────────────────────────────────────────────────────┘
```

## Stratégie de Synchronisation

| Type | Intervalle | Entités | Description |
|------|------------|---------|-------------|
| **Incrémental** | 25s | transports, counters | Données critiques temps réel |
| **Périodique** | 5 min | companies, vehicles, truckers | Données de référence |
| **Full** | 1h | Toutes | Réconciliation complète |

## Collections MongoDB

- `dashdoc_transports` - Tous les transports Dashdoc
- `dashdoc_companies` - Toutes les entreprises (carriers)
- `dashdoc_vehicles` - Tous les véhicules
- `dashdoc_trailers` - Toutes les remorques
- `dashdoc_truckers` - Tous les chauffeurs
- `dashdoc_contacts` - Tous les contacts
- `dashdoc_invoices` - Toutes les factures
- `dashdoc_addresses` - Toutes les adresses
- `dashdoc_counters` - Compteurs temps réel
- `dashdoc_sync_state` - État de synchronisation

## Utilisation

### Démarrage automatique

Le Data Lake démarre automatiquement avec le service tms-sync-eb via `scheduled-jobs.js`.

### Lecture des données

```javascript
const { createReaders } = require('./services/dashdoc-datalake');

// Créer les readers
const readers = createReaders(db);

// Lire les transports
const transports = await readers.transports.find({
  status: 'PENDING'
}, { limit: 50 }, connectionId);

// Lire les carriers avec stats
const carriers = await readers.carriers.getCarriersWithStats(connectionId);

// Rechercher un véhicule par plaque
const vehicle = await readers.vehicles.getByLicensePlate('AB-123-CD', connectionId);
```

### API REST

```
GET /api/v1/datalake/status                     - Statut du Data Lake
GET /api/v1/datalake/transports                 - Liste des transports
GET /api/v1/datalake/transports/:uid            - Transport par UID
GET /api/v1/datalake/transports/stats/by-status - Stats par statut
GET /api/v1/datalake/carriers                   - Liste des carriers
GET /api/v1/datalake/carriers/with-stats        - Carriers avec stats
GET /api/v1/datalake/carriers/search?q=xxx      - Recherche carriers
GET /api/v1/datalake/vehicles                   - Liste des véhicules
GET /api/v1/datalake/truckers                   - Liste des chauffeurs
GET /api/v1/datalake/freshness                  - Fraîcheur des données
```

### Filtrage par connexion (multi-tenant)

Chaque requête accepte un paramètre `connectionId` pour filtrer les données par connexion Dashdoc (ex: SETT Transports vs autres).

```
GET /api/v1/datalake/transports?connectionId=xxx
```

## Configuration

Variables d'environnement :

```
DATALAKE_ENABLED=true                    # Activer/désactiver le Data Lake
DATALAKE_INCREMENTAL_INTERVAL=25000      # Intervalle sync incrémentale (ms)
DATALAKE_PERIODIC_INTERVAL=300000        # Intervalle sync périodique (ms)
DATALAKE_FULL_INTERVAL=3600000           # Intervalle full sync (ms)
```

## Flux RETOUR (écriture)

Les écritures vers Dashdoc restent **directes** via le connecteur existant :
- `dashdoc-update.connector.js` : PATCH `/transports/{uid}/`
- Assignation de carrier
- Mise à jour de prix

## Monitoring

Le statut du Data Lake est disponible via :
- `GET /api/v1/datalake/status`
- `GET /api/v1/tms/jobs/status` (inclut le statut Data Lake)
