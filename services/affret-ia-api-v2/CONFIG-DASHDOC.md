# Configuration Dashdoc pour v2.7.0

## Variables d'environnement requises

Pour activer l'intégration Dashdoc et les fonctionnalités pricing, configurez ces variables sur Elastic Beanstalk :

```bash
DASHDOC_API_KEY=<votre_clé_api_dashdoc>
DASHDOC_API_URL=https://api.dashdoc.com/api/v4
PRICING_DEFAULT_PERIOD=last_6_months
PRICING_MIN_TRANSPORTS_PREFERRED=3
PRICING_ACCEPTABLE_RANGE_PERCENT=10
```

## Configuration via AWS CLI

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<VOTRE_CLE_API>" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_URL,Value="https://api.dashdoc.com/api/v4" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=PRICING_DEFAULT_PERIOD,Value="last_6_months" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=PRICING_MIN_TRANSPORTS_PREFERRED,Value="3" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=PRICING_ACCEPTABLE_RANGE_PERCENT,Value="10"
```

## Configuration via Console AWS

1. Ouvrir [AWS Elastic Beanstalk Console](https://eu-central-1.console.aws.amazon.com/elasticbeanstalk/home?region=eu-central-1)
2. Sélectionner l'application `rt-affret-ia-api`
3. Sélectionner l'environnement `rt-affret-ia-api-prod-v4`
4. Aller dans **Configuration** → **Software** → **Edit**
5. Ajouter dans **Environment properties** :

| Nom | Valeur |
|-----|--------|
| `DASHDOC_API_KEY` | `<votre_clé_api_dashdoc>` |
| `DASHDOC_API_URL` | `https://api.dashdoc.com/api/v4` |
| `PRICING_DEFAULT_PERIOD` | `last_6_months` |
| `PRICING_MIN_TRANSPORTS_PREFERRED` | `3` |
| `PRICING_ACCEPTABLE_RANGE_PERCENT` | `10` |

6. Cliquer sur **Apply**

---

## Tester l'intégration Dashdoc

### 1. Import historique Dashdoc (dry-run)

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "YOUR_ORG_ID",
    "months": 6,
    "dryRun": true
  }'
```

**Réponse attendue** (dry-run) :
```json
{
  "success": true,
  "message": "DRY RUN - 15 transports seraient importés",
  "count": 15,
  "transports": [...]
}
```

### 2. Import réel (sans dry-run)

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "YOUR_ORG_ID",
    "months": 6,
    "dryRun": false
  }'
```

**Réponse attendue** :
```json
{
  "success": true,
  "message": "15 prix importés depuis Dashdoc",
  "imported": 15,
  "skipped": 2,
  "errors": 0
}
```

---

## Tester les autres endpoints pricing

### 1. Historique des prix pour une ligne

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/price-history \
  -H "Content-Type: application/json" \
  -d '{
    "route": {
      "from": "75000",
      "to": "69000"
    },
    "period": "last_6_months",
    "vehicleType": "SEMI"
  }'
```

**Réponse** :
```json
{
  "success": true,
  "route": { "from": "75000", "to": "69000" },
  "averagePrice": 450,
  "priceRange": { "min": 400, "max": 500, "stdDeviation": 25 },
  "transactionCount": 12,
  "history": [...]
}
```

### 2. Sous-traitants préférés

```bash
curl "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/preferred-subcontractors?organizationId=YOUR_ORG_ID&fromPostalCode=75000&toPostalCode=69000"
```

**Réponse** :
```json
{
  "success": true,
  "subcontractors": [
    {
      "carrierId": "carrier123",
      "carrierName": "Transport Express",
      "totalTransports": 25,
      "avgPrice": 445,
      "onTimeRate": 0.96,
      "reliability": "excellent"
    }
  ],
  "count": 1
}
```

### 3. Calculer prix cible

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/calculate-target-price \
  -H "Content-Type: application/json" \
  -d '{
    "route": {
      "from": "75000",
      "to": "69000"
    },
    "vehicleType": "SEMI"
  }'
```

**Réponse** :
```json
{
  "success": true,
  "targetPrice": 450,
  "acceptableRange": { "min": 405, "max": 495 },
  "hasHistory": true,
  "basedOn": 12
}
```

### 4. Rechercher transporteurs disponibles

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/search-carriers \
  -H "Content-Type: application/json" \
  -d '{
    "route": {
      "from": "75000",
      "to": "69000"
    },
    "requirements": {
      "vehicleType": "SEMI",
      "maxPrice": 500
    }
  }'
```

### 5. Enregistrer un prix négocié

```bash
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/record-price \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order123",
    "carrierId": "carrier456",
    "carrierName": "Transport Express",
    "route": {
      "from": { "city": "Paris", "postalCode": "75000" },
      "to": { "city": "Lyon", "postalCode": "69000" }
    },
    "proposedPrice": 480,
    "price": 450,
    "marketAverage": 450,
    "vehicleType": "SEMI",
    "organizationId": "YOUR_ORG_ID"
  }'
```

**Réponse** :
```json
{
  "success": true,
  "priceId": "60f5e3b4c5d6e7f8a9b0c1d2",
  "price": 450,
  "deviation": 0
}
```

---

## Script CLI pour import Dashdoc

Un script CLI est disponible pour importer l'historique depuis la ligne de commande :

```bash
cd scripts
node import-dashdoc-history.js \
  --org-id YOUR_ORG_ID \
  --months 6 \
  --dry-run
```

**Options** :
- `--org-id` : ID de votre organisation
- `--months` : Nombre de mois à importer (défaut: 6)
- `--dry-run` : Test sans sauvegarder en base

**Exemple sortie** :
```
[DASHDOC IMPORT] Démarrage import historique
[DASHDOC IMPORT] Organisation: org123
[DASHDOC IMPORT] Période: 6 derniers mois
[DASHDOC IMPORT] Mode: DRY RUN

[DASHDOC] 15 transports récupérés depuis Dashdoc
[DASHDOC] Analyse: 13 éligibles, 2 ignorés

✓ Import réussi: 13 transports seraient importés
```

---

## Vérifier que tout fonctionne

Après configuration, vérifier que l'API répond correctement :

```bash
# 1. Health check
curl http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/health

# 2. Test endpoint pricing (sans données)
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/price-history \
  -H "Content-Type: application/json" \
  -d '{"route":{"from":"75000","to":"69000"}}'

# 3. Test import Dashdoc (dry-run)
curl -X POST http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"YOUR_ORG_ID","months":6,"dryRun":true}'
```

---

## Documentation complète

Voir [docs/PRICING-API.md](docs/PRICING-API.md) pour la documentation complète de l'API pricing.

---

## État actuel du déploiement

- ✅ **Environnement** : rt-affret-ia-api-prod-v4
- ✅ **Version** : v2.7.0-COMPLETE
- ✅ **Statut** : GREEN (Health: Ok)
- ✅ **MongoDB** : Connecté
- ✅ **Endpoints pricing** : 6/6 opérationnels
- ⚠️ **DASHDOC_API_KEY** : À configurer (voir ci-dessus)

**URL de l'API** : http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
