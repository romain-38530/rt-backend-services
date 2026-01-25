# Résumé de l'implémentation - Filtrage "À planifier"

## ✅ Ce qui a été fait

### 1. Exclusion automatique des commandes annulées
**Fichiers modifiés** :
- `connectors/dashdoc.connector.js` (lignes 428-434)
- `index.js` (lignes 420-422, 491-503)

**Comportement** :
- Les commandes avec statut `cancelled` ou `declined` dans Dashdoc sont automatiquement exclues
- Par défaut, aucune commande annulée n'est importée ou affichée
- Applicable à tous les endpoints de filtrage et synchronisation

### 2. Nouveau filtre "À planifier"
**Fichiers modifiés** :
- `index.js` - Endpoint `/api/v1/tms/orders/filtered` (lignes 466-632)
- `services/tms-connection.service.js` - Méthode `executeSync` (lignes 289-320)

**Fonctionnalités** :
- Nouveau paramètre `toPlan=true` pour filtrer uniquement les commandes à planifier
- Commandes "À planifier" = statuts `DRAFT` et `PENDING` dans Symphonia
- Équivalent aux statuts `created` et `unassigned` dans Dashdoc

### 3. Tests automatisés
**Fichiers modifiés** :
- `test-advanced-sync.js` - Ajout du Test 5 (lignes 105-128)

**Ce qui est testé** :
- Le filtre `toPlan=true` retourne uniquement les bons statuts
- Validation que seuls DRAFT et PENDING sont présents
- Vérification du nombre de résultats

### 4. Documentation
**Fichiers créés** :
- `FEATURE-TO-PLAN-FILTER.md` - Documentation complète du filtre
- `RESUME-IMPLEMENTATION.md` - Ce fichier
- `wait-for-docker.ps1` - Script d'aide au démarrage Docker

## 📊 Mapping des statuts

| Dashdoc Status | Symphonia Status | À planifier ? |
|----------------|------------------|---------------|
| `created` | `DRAFT` | ✅ OUI |
| `unassigned` | `PENDING` | ✅ OUI |
| `assigned` | `CONFIRMED` | ❌ Non |
| `confirmed` | `CONFIRMED` | ❌ Non |
| `on_loading_site` | `IN_PROGRESS` | ❌ Non |
| `loading_complete` | `IN_PROGRESS` | ❌ Non |
| `on_unloading_site` | `IN_PROGRESS` | ❌ Non |
| `unloading_complete` | `IN_PROGRESS` | ❌ Non |
| `done` | `COMPLETED` | ❌ Non |
| `cancelled` | `CANCELLED` | ❌ Exclu par défaut |
| `declined` | `CANCELLED` | ❌ Exclu par défaut |

## 🚀 Utilisation

### API - Filtrer les commandes "À planifier"
```bash
# Récupérer toutes les commandes "À planifier"
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&limit=50"

# Avec pagination
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&skip=0&limit=20"

# Combiné avec d'autres filtres (ville)
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true&city=Paris&limit=10"
```

### API - Synchronisation avec filtre
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

### Frontend - Exemple d'intégration
```javascript
// Dans le composant React/Next.js
const fetchToPlanOrders = async () => {
  const response = await fetch(
    '/api/v1/tms/orders/filtered?toPlan=true&limit=50'
  );
  const data = await response.json();

  console.log(`${data.meta.total} commandes à planifier`);
  return data.orders; // Array de commandes DRAFT/PENDING uniquement
};
```

## 🧪 Tests

### Test manuel local
```bash
# 1. Démarrer MongoDB et Redis (une fois Docker prêt)
START-INFRA.bat

# 2. Démarrer le service TMS Sync
cd services/tms-sync-eb
node index.js

# 3. Dans un autre terminal, tester l'API
curl "http://localhost:3000/api/v1/tms/orders/filtered?toPlan=true"

# 4. Lancer la suite de tests complète
node test-advanced-sync.js
```

### Test en production
```bash
# Si déployé sur AWS Elastic Beanstalk
curl "https://your-tms-sync-url.elasticbeanstalk.com/api/v1/tms/orders/filtered?toPlan=true"
```

## 📝 Réponse API type

```json
{
  "success": true,
  "filters": {
    "status": null,
    "toPlan": "true",
    "city": null,
    "postalCode": null,
    "cargoType": null,
    "minWeight": null,
    "maxWeight": null,
    "carrierId": null,
    "carrierName": null,
    "dateFrom": null,
    "dateTo": null,
    "isDangerous": null,
    "isRefrigerated": null
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
      "externalId": "DASH-12345",
      "status": "DRAFT",
      "sequentialId": "T-2026-001",
      "pickup": {
        "address": {
          "city": "Paris",
          "postalCode": "75001"
        },
        "scheduledAt": "2026-01-25T08:00:00Z"
      },
      "delivery": {
        "address": {
          "city": "Lyon",
          "postalCode": "69001"
        },
        "scheduledAt": "2026-01-25T14:00:00Z"
      },
      "cargo": [
        {
          "description": "Palettes",
          "weight": 1500,
          "quantity": 10
        }
      ],
      "createdAt": "2026-01-24T10:00:00Z"
    },
    // ... autres commandes
  ]
}
```

## ⚙️ Configuration requise

### Variables d'environnement
Aucune nouvelle variable requise. Le système utilise les variables existantes :
- `MONGODB_URI` - URI de connexion MongoDB
- `MONGODB_DB_NAME` - Nom de la base de données
- Les tokens API Dashdoc dans `tmsConnections`

### Indexes MongoDB
Les indexes suivants sont créés automatiquement au démarrage :
- `{ externalSource: 1, status: 1, createdAt: -1 }`
- `{ 'pickup.address.city': 1, 'delivery.address.city': 1 }`
- `{ 'pickup.address.postalCode': 1, 'delivery.address.postalCode': 1 }`
- Indexes géospatiaux 2dsphere pour les coordonnées
- Indexes sur cargo, carrier, etc.

## 🔄 Compatibilité

### Rétrocompatibilité
✅ L'ancien endpoint `/api/v1/tms/orders` continue de fonctionner
✅ Les appels sans paramètre `toPlan` fonctionnent comme avant
✅ La synchronisation sans filtre importe tous les statuts (sauf annulés)

### Sync automatique 30 secondes
✅ Le système de sync haute fréquence fonctionne avec les nouveaux filtres
✅ Les jobs scheduled respectent l'exclusion des commandes annulées

## 📌 Prochaines étapes

### 1. Déploiement en production
```bash
# Une fois testé localement, déployer sur AWS EB
cd services/tms-sync-eb
zip -r tms-sync-v2.2.0.zip . -x "node_modules/*" -x ".git/*"
eb deploy
```

### 2. Mise à jour frontend
Modifier l'interface Symphonia pour utiliser `toPlan=true` :
```typescript
// Dans le composant orders.tsx ou équivalent
const loadDashdocOrders = async () => {
  const response = await fetch(
    `${TMS_SYNC_URL}/api/v1/tms/orders/filtered?toPlan=true`
  );
  const data = await response.json();
  setOrders(data.orders); // Uniquement les commandes à planifier
};
```

### 3. Tests de charge
Valider les performances avec un volume élevé :
- 1000+ commandes à planifier
- Vérifier les temps de réponse < 200ms
- Tester la pagination sur grands volumes

### 4. Monitoring
Ajouter des métriques :
- Nombre de commandes "À planifier" par jour
- Temps moyen de traitement
- Taux de conversion (DRAFT → CONFIRMED)

## 🐛 Troubleshooting

### Problème: Aucune commande retournée avec toPlan=true
**Solution** : Vérifier qu'il existe des commandes avec statut DRAFT ou PENDING dans la base de données
```bash
# Via MongoDB shell
db.orders.countDocuments({ status: { $in: ['DRAFT', 'PENDING'] } })
```

### Problème: Commandes annulées apparaissent toujours
**Solution** : Vérifier que le connecteur Dashdoc utilise bien le nouveau code
```bash
# Vérifier les logs du service
grep "Excluding cancelled" services/tms-sync-eb/logs/*
```

### Problème: Erreur 503 "Database not available"
**Solution** : S'assurer que MongoDB est démarré et accessible
```bash
# Vérifier MongoDB
docker ps | grep mongodb
# Ou tester la connexion
mongo mongodb://admin:admin123@localhost:27017/rt-technologie
```

## 📞 Support

En cas de problème, vérifier :
1. Les logs du service TMS Sync : `services/tms-sync-eb/logs/`
2. L'état de MongoDB : `docker logs rt-mongodb`
3. Les connexions TMS : `GET /api/v1/tms/connections`
4. Le statut des jobs : `GET /api/v1/jobs/status`

---

**Version** : 2.2.0
**Date** : 24 janvier 2026
**Auteur** : Claude Sonnet 4.5
**Status** : ✅ Implémenté, en attente de tests
