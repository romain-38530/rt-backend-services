# Fonctionnalité: Filtrage "À planifier" - TMS Sync

## Résumé
Ajout du support pour filtrer uniquement les commandes "À planifier" depuis Dashdoc dans le système TMS Sync. Ces commandes correspondent aux statuts `created` et `unassigned` dans Dashdoc, mappés vers `DRAFT` et `PENDING` dans Symphonia.

## Modifications apportées

### 1. Endpoint de filtrage `/api/v1/tms/orders/filtered`
**Fichier**: `services/tms-sync-eb/index.js` (lignes 447-632)

#### Nouveau paramètre `toPlan`
- **Type**: boolean
- **Valeur**: `true` pour filtrer uniquement les commandes "À planifier"
- **Effet**: Retourne uniquement les commandes avec statut `DRAFT` ou `PENDING`

#### Exemple d'utilisation
```bash
# Récupérer uniquement les commandes "À planifier"
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&limit=50"
```

#### Réponse
```json
{
  "success": true,
  "filters": {
    "status": null,
    "toPlan": true,
    ...
  },
  "meta": {
    "total": 42,
    "skip": 0,
    "limit": 50,
    "returned": 42,
    "page": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "orders": [
    {
      "externalId": "abc123",
      "status": "DRAFT",
      ...
    },
    {
      "externalId": "xyz789",
      "status": "PENDING",
      ...
    }
  ]
}
```

### 2. Synchronisation manuelle avec filtre "À planifier"
**Fichier**: `services/tms-sync-eb/services/tms-connection.service.js` (lignes 289-320)

#### Support du paramètre `toPlan` dans executeSync
Permet de synchroniser uniquement les commandes "À planifier" depuis Dashdoc.

#### Exemple d'utilisation
```bash
# Synchroniser uniquement les commandes "À planifier"
curl -X POST http://localhost:3000/api/v1/tms/connections/{connectionId}/sync \
  -H "Content-Type: application/json" \
  -d '{
    "toPlan": true,
    "transportLimit": 0,
    "maxPages": 10
  }'
```

#### Mapping Dashdoc → Symphonia
Quand `toPlan: true` :
- Dashdoc `created` → Symphonia `DRAFT`
- Dashdoc `unassigned` → Symphonia `PENDING`

### 3. Tests automatisés
**Fichier**: `services/tms-sync-eb/test-advanced-sync.js` (lignes 105-128)

#### Nouveau Test 5: Filtrage "À planifier"
Vérifie que :
1. L'API retourne uniquement des commandes avec statut `DRAFT` ou `PENDING`
2. Le nombre de commandes correspond aux attentes
3. Aucune commande avec un autre statut n'est retournée

```javascript
// Test 5: Filtrage "À planifier" - Commandes créées ou non assignées
const toPlanFilter = await axios.get(`${BASE_URL}/api/v1/tms/orders/filtered`, {
  params: { toPlan: true, limit: 10 }
});

// Vérifier que ce sont bien des commandes DRAFT ou PENDING
const statuses = toPlanFilter.data.orders.map(o => o.status);
const allToPlan = statuses.every(s => s === 'DRAFT' || s === 'PENDING');
```

## Statuts Dashdoc et mapping Symphonia

| Statut Dashdoc | Statut Symphonia | "À planifier" ? | Description |
|----------------|------------------|----------------|-------------|
| `created` | `DRAFT` | ✅ Oui | Commande créée, non assignée |
| `unassigned` | `PENDING` | ✅ Oui | Commande en attente d'assignation |
| `assigned` | `CONFIRMED` | ❌ Non | Transporteur assigné |
| `confirmed` | `CONFIRMED` | ❌ Non | Commande confirmée |
| `on_loading_site` | `IN_PROGRESS` | ❌ Non | Sur site de chargement |
| `loading_complete` | `IN_PROGRESS` | ❌ Non | Chargement terminé |
| `on_unloading_site` | `IN_PROGRESS` | ❌ Non | Sur site de livraison |
| `unloading_complete` | `IN_PROGRESS` | ❌ Non | Déchargement terminé |
| `done` | `COMPLETED` | ❌ Non | Livraison terminée |
| `cancelled` | `CANCELLED` | ❌ Non | Commande annulée |
| `declined` | `CANCELLED` | ❌ Non | Commande refusée |

## Exclusion des commandes annulées

**Important**: Par défaut, les commandes annulées (`cancelled`, `declined`) sont exclues de toutes les synchronisations et filtres, sauf si explicitement demandé.

### Dans la synchronisation
**Fichier**: `services/tms-sync-eb/connectors/dashdoc.connector.js` (lignes 428-434)

```javascript
// Par défaut, exclure les commandes annulées
let statusFilter = options.status__in;
if (!statusFilter && options.excludeCancelled !== false) {
  statusFilter = 'created,unassigned,assigned,confirmed,on_loading_site,loading_complete,on_unloading_site,unloading_complete,done';
}
```

### Dans le filtrage
**Fichier**: `services/tms-sync-eb/index.js` (lignes 491-503)

```javascript
// Filtre "À planifier" (to plan) - commandes créées ou non assignées
if (toPlan === 'true') {
  query.status = { $in: ['DRAFT', 'PENDING'] };
}
// Par défaut, exclure les commandes annulées
else {
  query.status = { $ne: 'CANCELLED' };
}
```

## Tests manuels

### 1. Tester le filtrage "À planifier"
```bash
# Démarrer le service TMS Sync
cd services/tms-sync-eb
node index.js

# Dans un autre terminal, tester le filtre
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&limit=10"
```

### 2. Tester la synchronisation avec filtre
```bash
# Récupérer l'ID de connexion
curl "http://localhost:3000/api/v1/tms/connections"

# Lancer une sync avec filtre "À planifier"
curl -X POST http://localhost:3000/api/v1/tms/connections/YOUR_CONNECTION_ID/sync \
  -H "Content-Type: application/json" \
  -d '{"toPlan": true, "transportLimit": 0, "maxPages": 5}'
```

### 3. Lancer la suite de tests complète
```bash
cd services/tms-sync-eb
node test-advanced-sync.js
```

## Utilisation dans le frontend

Pour afficher uniquement les commandes "À planifier" dans l'interface Symphonia :

```javascript
// Exemple d'appel API depuis le frontend
const response = await fetch(
  'http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&limit=50'
);
const data = await response.json();

// data.orders contient uniquement les commandes DRAFT et PENDING
console.log(`${data.meta.total} commandes à planifier`);
```

## Notes importantes

1. **Performance**: Les indexes MongoDB sur le champ `status` assurent des requêtes rapides
2. **Compatibilité**: L'ancien endpoint `/api/v1/tms/orders` reste fonctionnel
3. **Pagination**: Supporte skip/limit pour gérer de grandes listes
4. **Exclusion automatique**: Les commandes annulées sont toujours exclues par défaut
5. **Sync haute fréquence**: Fonctionne avec le système de sync automatique 30 secondes

## Prochaines étapes

- [ ] Déployer en production
- [ ] Mettre à jour l'interface frontend pour utiliser le filtre `toPlan=true`
- [ ] Vérifier les performances avec un volume élevé de commandes
- [ ] Ajouter des tests d'intégration automatisés
