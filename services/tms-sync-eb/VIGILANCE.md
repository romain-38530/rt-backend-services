# Système de Vigilance des Transporteurs

## Vue d'ensemble

Le système de vigilance calcule automatiquement un score de qualité pour chaque transporteur (carrier) synchronisé depuis Dashdoc. Ce score permet d'évaluer la fiabilité et la performance des sous-traitants.

## Score de vigilance (0-100%)

Le score est calculé sur 100 points selon 4 critères:

### 1. Documents légaux (30 points)
- **SIRET** (10 points) : Numéro SIRET valide à 14 chiffres
- **TVA** (10 points) : Numéro de TVA intracommunautaire
- **Licence de transport** (10 points) : Licence professionnelle

### 2. Performance (40 points)
- **Taux de qualité/ponctualité** : Basé sur le score Dashdoc
  - < 50% : -40 points
  - 50-69% : -30 points
  - 70-84% : -15 points
  - 85-94% : -5 points
  - ≥ 95% : 0 points (excellent)

### 3. Activité récente (20 points)
- **Dernière commande** :
  - > 6 mois : -20 points
  - 3-6 mois : -15 points
  - 1-3 mois : -8 points
  - 1 semaine - 1 mois : -3 points
  - < 1 semaine : 0 points (actif)

### 4. Volume de commandes (10 points)
- **Nombre total de commandes** :
  - 0 commandes : -10 points
  - 1-4 commandes : -8 points
  - 5-19 commandes : -5 points
  - 20-49 commandes : -2 points
  - ≥ 50 commandes : 0 points (bon volume)

## Niveaux de vigilance

Selon le score calculé, le carrier est classé dans un niveau:

| Score | Niveau | Code | Description |
|-------|--------|------|-------------|
| 95-100 | N1-Premium | `N1_premium` | Excellent partenaire, tous critères au vert |
| 85-94 | N1-Référence | `N1_referenced` | Bon partenaire de confiance |
| 70-84 | Actif | `active` | Partenaire actif avec quelques points à améliorer |
| 50-69 | N2-Invité | `N2_guest` | Partenaire occasionnel, vigilance requise |
| 0-49 | En Observation | `observation` | Partenaire à surveiller, manque plusieurs critères |

## API Endpoints

### 1. Récupérer tous les carriers
```bash
GET /api/v1/tms/carriers?limit=50&skip=0&search=ACME&level=N1_premium

Query params:
- limit: Nombre de résultats (défaut: 50)
- skip: Offset pagination (défaut: 0)
- search: Recherche par nom ou SIRET
- status: Filtre par statut (pending, active, inactive)
- level: Filtre par niveau de vigilance (N1_premium, N1_referenced, active, N2_guest, observation)

Response:
{
  "success": true,
  "total": 150,
  "limit": 50,
  "skip": 0,
  "carriers": [...]
}
```

### 2. Récupérer un carrier par ID
```bash
GET /api/v1/tms/carriers/:id

Response:
{
  "success": true,
  "carrier": {
    "_id": "...",
    "companyName": "ACME Transport",
    "siret": "12345678901234",
    "vigilance": {
      "score": 85,
      "level": "N1-Référence",
      "levelCode": "N1_referenced",
      "checks": [...],
      "calculatedAt": "2026-01-30T..."
    },
    ...
  }
}
```

### 3. Calculer la vigilance d'un carrier
```bash
GET /api/v1/tms/carriers/:id/vigilance

Response:
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
      },
      {
        "type": "onTimeRate",
        "status": "good",
        "value": 87,
        "impact": -5,
        "message": "Bon taux de qualité (87%)"
      },
      ...
    ],
    "summary": {
      "legal": [...],
      "performance": [...],
      "activity": [...],
      "volume": [...]
    },
    "calculatedAt": "2026-01-30T...",
    "carrierId": "...",
    "carrierName": "ACME Transport"
  }
}
```

### 4. Mettre à jour la vigilance d'un carrier
```bash
POST /api/v1/tms/carriers/:id/vigilance/update

Response:
{
  "success": true,
  "vigilance": {...}
}
```

### 5. Mettre à jour tous les carriers
```bash
POST /api/v1/tms/carriers/vigilance/update-all

Response:
{
  "success": true,
  "updated": 145,
  "failed": 5,
  "total": 150,
  "errors": [...]
}
```

### 6. Statistiques globales de vigilance
```bash
GET /api/v1/tms/carriers/vigilance/stats

Response:
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
      "excellent": 15,  // 90-100
      "good": 52,       // 75-89
      "medium": 61,     // 50-74
      "low": 18,        // 25-49
      "poor": 4         // 0-24
    },
    "averageScore": 72,
    "withVigilance": 145,
    "withoutVigilance": 5
  }
}
```

## Jobs automatiques

Le système met à jour automatiquement les scores de vigilance:

### 1. Synchronisation des carriers
- **Fréquence**: Toutes les 5 minutes
- **Job**: `carriersSync`
- **Action**: Récupère les carriers depuis Dashdoc avec leurs statistiques

### 2. Mise à jour de la vigilance
- **Fréquence**: Toutes les heures
- **Job**: `vigilanceUpdate`
- **Action**: Recalcule les scores de vigilance de tous les carriers

### Exécution manuelle des jobs
```bash
# Synchroniser les carriers
POST /api/v1/jobs/carriersSync/run

# Mettre à jour la vigilance
POST /api/v1/jobs/vigilanceUpdate/run

# Voir le statut des jobs
GET /api/v1/jobs/status
```

## Tests

### 1. Synchroniser les carriers depuis Dashdoc
```bash
curl -X POST http://localhost:3000/api/v1/jobs/carriersSync/run
```

### 2. Calculer la vigilance de tous les carriers
```bash
curl -X POST http://localhost:3000/api/v1/tms/carriers/vigilance/update-all
```

### 3. Récupérer les carriers
```bash
# Tous les carriers
curl http://localhost:3000/api/v1/tms/carriers

# Avec filtres
curl "http://localhost:3000/api/v1/tms/carriers?level=N1_premium&limit=10"

# Recherche
curl "http://localhost:3000/api/v1/tms/carriers?search=ACME"
```

### 4. Voir la vigilance d'un carrier
```bash
curl http://localhost:3000/api/v1/tms/carriers/{id}/vigilance
```

### 5. Statistiques globales
```bash
curl http://localhost:3000/api/v1/tms/carriers/vigilance/stats
```

## Structure MongoDB

Les carriers sont stockés dans la collection `carriers` avec la structure suivante:

```javascript
{
  _id: ObjectId("..."),
  externalId: "12345",  // PK Dashdoc
  externalSource: "dashdoc",
  companyName: "ACME Transport",
  legalName: "ACME Transport SARL",
  siret: "12345678901234",
  siren: "123456789",
  vatNumber: "FR12345678901",
  email: "contact@acme.com",
  phone: "+33123456789",

  // Stats de performance
  totalOrders: 125,
  completedOrders: 120,
  lastOrderAt: ISODate("2026-01-25T10:00:00Z"),
  score: 92,  // Score Dashdoc (taux de ponctualité)

  // Score de vigilance calculé
  vigilance: {
    score: 85,
    level: "N1-Référence",
    levelCode: "N1_referenced",
    checks: [...],
    summary: {...},
    calculatedAt: ISODate("2026-01-30T12:00:00Z"),
    carrierId: "...",
    carrierName: "ACME Transport"
  },
  vigilanceScore: 85,  // Pour requêtes rapides
  vigilanceLevel: "N1_referenced",  // Pour filtres
  vigilanceUpdatedAt: ISODate("2026-01-30T12:00:00Z"),

  lastSyncAt: ISODate("2026-01-30T11:00:00Z"),
  tmsConnectionId: "..."
}
```

## Intégration Frontend

Le frontend peut utiliser ces endpoints pour:

1. **Afficher la liste des carriers** avec leur score de vigilance
2. **Filtrer par niveau** (N1-Premium, N1-Référence, etc.)
3. **Afficher les détails** d'un carrier avec le breakdown du score
4. **Visualiser les statistiques** globales de vigilance

### Exemple d'utilisation React

```javascript
// Récupérer les carriers avec vigilance
const { data } = await fetch('/api/v1/tms/carriers?limit=50');

// Afficher le score avec badge coloré
const getScoreColor = (score) => {
  if (score >= 90) return 'green';
  if (score >= 75) return 'blue';
  if (score >= 50) return 'orange';
  return 'red';
};

// Component
<Badge color={getScoreColor(carrier.vigilanceScore)}>
  {carrier.vigilanceScore}% - {carrier.vigilance.level}
</Badge>
```

## Notes importantes

1. **Performance**: Le calcul de vigilance est léger et rapide (< 10ms par carrier)
2. **Actualisation**: Les scores sont recalculés toutes les heures automatiquement
3. **Données manquantes**: Si un carrier n'a pas de données (ex: pas de SIRET), le score est pénalisé
4. **Évolution**: Le score évolue automatiquement avec les nouvelles commandes et mises à jour Dashdoc
5. **Historique**: Les scores de vigilance ne sont pas historisés (seul le score actuel est conservé)
