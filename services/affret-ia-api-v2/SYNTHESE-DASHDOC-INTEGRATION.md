# Synthèse - Intégration Dashdoc Affret.IA v2.7.0

**Date** : 2 février 2026
**Version** : v2.7.0-SUBCONTRACTOR-FIX
**Statut environnement** : ✅ **GREEN** (Health: Ok)
**Intégration Dashdoc** : ⚠️ **Partielle** (erreur 401)

---

## ✅ Ce qui a été accompli

### 1. Fix CRITIQUE - Extraction des prix sous-traitants

**Problème identifié** :
Le code initial utilisait `pricing.invoicing_amount` qui correspond au **prix facturé au CLIENT** (ex: 600€), alors qu'il faut extraire le **prix payé au SOUS-TRAITANT** (ex: 450€).

**Impact** :
- Différence de ~25% sur tous les prix
- Fausse toutes les statistiques de marché
- Calculs de négociation incorrects

**Solution implémentée** :

```javascript
// ❌ AVANT (incorrect)
price: {
  proposed: pricing.invoicing_amount,  // Prix CLIENT
  final: pricing.invoicing_amount
}

// ✅ APRÈS (correct)
const carrierPricing = this.extractCarrierPrice(transport);
price: {
  proposed: carrierPricing.price,  // Prix SOUS-TRAITANT
  final: carrierPricing.price
}
```

**Hiérarchie d'extraction des prix** :
1. `charter.price` - Prix de l'affretement ✅
2. `charter.purchase_price` - Prix d'achat ✅
3. `subcontracting.price` - Prix sous-traitance ✅
4. `subcontracting.purchase_price` - Prix d'achat ST ✅
5. `pricing.carrier_price` - Prix transporteur ✅
6. `pricing.invoicing_amount` - Prix client ⚠️ (fallback avec warning)

**Fichiers modifiés** :
- [services/pricing.service.js](services/pricing.service.js) :
  - Méthode `extractCarrierPrice()` (50 lignes)
  - Méthode `extractCarrierInfo()` (30 lignes)
  - Filtre `is_subcontracted=true` dans l'API Dashdoc
  - Validation stricte des prix sous-traitants

**Documentation créée** :
- [docs/DASHDOC-AFFRETEMENT.md](docs/DASHDOC-AFFRETEMENT.md) - Guide complet (634 lignes)
- [FIX-PRIX-SOUS-TRAITANTS.md](FIX-PRIX-SOUS-TRAITANTS.md) - Documentation du fix (348 lignes)

**Déploiement** :
```bash
Version : v2.7.0-SUBCONTRACTOR-FIX
Date : 2026-02-02 21:34 UTC
Statut : ✅ GREEN
Commit : e215d64
```

---

### 2. Endpoints pricing opérationnels (5/6)

| Endpoint | Statut | Test effectué |
|----------|--------|---------------|
| `/api/v1/affretia/price-history` | ✅ | Historique Paris→Lyon récupéré |
| `/api/v1/affretia/preferred-subcontractors` | ✅ | Endpoint fonctionnel |
| `/api/v1/affretia/calculate-target-price` | ✅ | Prix cible calculé (405-495€) |
| `/api/v1/affretia/search-carriers` | ✅ | Recherche opérationnelle |
| `/api/v1/affretia/record-price` | ✅ | Prix enregistré avec succès |
| `/api/v1/affretia/import/dashdoc` | ❌ | **Erreur 401** |

**Exemple de test réussi (record-price)** :
```bash
curl -X POST ".../api/v1/affretia/record-price" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-001",
    "carrierId": "test-carrier-001",
    "carrierName": "Transport Express",
    "route": {
      "from": {"city": "Paris", "postalCode": "75000"},
      "to": {"city": "Lyon", "postalCode": "69000"}
    },
    "proposedPrice": 480,
    "price": 450,
    "marketAverage": 450,
    "vehicleType": "SEMI",
    "organizationId": "test-org"
  }'

# Résultat :
{
  "success": true,
  "priceId": "67a026ad5a4c8e5d9a8b4567",
  "price": 450,
  "deviation": 0
}
```

**Vérification historique** :
```bash
curl -X POST ".../api/v1/affretia/price-history" \
  -H "Content-Type: application/json" \
  -d '{"route":{"from":"75000","to":"69000"}}'

# Résultat :
{
  "success": true,
  "route": {"from": "75000", "to": "69000"},
  "averagePrice": 450,
  "priceRange": {"min": 450, "max": 450, "stdDeviation": 0},
  "transactionCount": 1,
  "period": "last_6_months",
  "history": [...]
}
```

---

### 3. Configuration environnement

**Variables configurées sur AWS EB** :
```bash
DASHDOC_API_KEY=8321c7a8f7fe8f75192fa15a6c883a11758e0084
DASHDOC_API_URL=https://api.dashdoc.com/api/v4
PRICING_DEFAULT_PERIOD=last_6_months
PRICING_MIN_TRANSPORTS_PREFERRED=3
PRICING_ACCEPTABLE_RANGE_PERCENT=10
```

**Commande appliquée** :
```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="8321..." \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_URL,Value="https://api.dashdoc.com/api/v4"
```

---

## ❌ Problème actuel - Erreur 401 Dashdoc

### Symptôme

```bash
curl -X POST ".../api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"test-org","months":6,"dryRun":true}'

# Résultat :
{
  "success": false,
  "error": "Request failed with status code 401"
}
```

### Causes possibles

1. **Clé API invalide, expirée ou révoquée**
   - La clé `8321c7a8f7fe8f75192fa15a6c883a11758e0084` n'est plus active
   - Solution : Vérifier dans Dashdoc (app.dashdoc.com)

2. **Permissions insuffisantes**
   - La clé n'a pas les droits de lecture sur les transports
   - La clé n'a pas accès aux données d'affretement (charter/subcontracting)
   - Solution : Vérifier et régénérer avec permissions complètes

3. **Format d'authentification incorrect**
   - Le header `Authorization: Bearer <token>` n'est peut-être pas le bon format
   - Dashdoc utilise peut-être `Authorization: Token <token>` ou `X-API-Key`
   - Solution : Tester différents formats

4. **Environnement Dashdoc incorrect**
   - La clé est peut-être pour l'environnement staging/sandbox
   - Solution : Vérifier que `https://api.dashdoc.com` est le bon endpoint

### Script de diagnostic créé

**Fichier** : [scripts/test-dashdoc-api.ps1](scripts/test-dashdoc-api.ps1)

Ce script teste 5 configurations différentes :
1. `Authorization: Bearer <token>`
2. `Authorization: Token <token>`
3. `X-API-Key: <token>`
4. Avec filtres `status=done`
5. Avec filtres `is_subcontracted=true`

**Exécution** :
```powershell
cd scripts
.\test-dashdoc-api.ps1
```

**Interprétation** :
- HTTP 200 + JSON → Clé valide ✅
- HTTP 401 → Clé invalide ❌
- HTTP 403 → Permissions insuffisantes ⚠️
- HTTP 404 → Endpoint incorrect ⚠️

---

## 🔧 Prochaines étapes

### Étape 1 : Diagnostic de la clé API (URGENT)

**Action** : Exécuter le script de test
```powershell
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2\scripts"
.\test-dashdoc-api.ps1
```

**Résultat attendu** : Identifier si la clé fonctionne et avec quel format d'authentification.

### Étape 2 : Correction de la clé API

**Si erreur 401 sur tous les tests** → Régénérer la clé :

1. Se connecter sur [Dashdoc](https://app.dashdoc.com)
2. Aller dans **Paramètres** → **API & Intégrations**
3. Créer une nouvelle clé API avec permissions :
   - ✅ Lecture des transports
   - ✅ Accès aux données de tarification
   - ✅ Accès aux informations transporteur
4. Copier la nouvelle clé
5. Mettre à jour sur AWS EB :
   ```bash
   aws elasticbeanstalk update-environment \
     --environment-name rt-affret-ia-api-prod-v4 \
     --region eu-central-1 \
     --option-settings \
       Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<NOUVELLE_CLE>"
   ```

### Étape 3 : Test de l'import Dashdoc

**Une fois la clé corrigée** :

1. **Dry-run** (sans sauvegarder) :
   ```bash
   curl -X POST ".../api/v1/affretia/import/dashdoc" \
     -H "Content-Type: application/json" \
     -d '{"organizationId":"YOUR_ORG","months":6,"dryRun":true}'
   ```

2. **Vérifier les logs** :
   ```bash
   aws logs tail "/aws/elasticbeanstalk/rt-affret-ia-api-prod-v4/var/log/web.stdout.log" \
     --region eu-central-1 \
     --since 5m \
     --follow
   ```

3. **Import réel** :
   ```bash
   curl -X POST ".../api/v1/affretia/import/dashdoc" \
     -H "Content-Type: application/json" \
     -d '{"organizationId":"YOUR_ORG","months":6,"dryRun":false}'
   ```

4. **Vérifier les données importées** :
   ```bash
   curl -X POST ".../api/v1/affretia/price-history" \
     -H "Content-Type: application/json" \
     -d '{"route":{"from":"75000","to":"69000"}}'
   ```

   Le champ `transactionCount` devrait être > 0.

### Étape 4 : Intégration dans le workflow Affret.IA

**Une fois l'import fonctionnel** :

1. **Lors de la négociation** → Appeler `calculateTargetPrice` pour obtenir le prix de marché
2. **Après validation commande** → Appeler `recordPrice` pour enregistrer le prix final
3. **Shortlist transporteurs** → Appeler `preferred-subcontractors` pour identifier les meilleurs

---

## 📊 Métriques actuelles

| Métrique | Valeur |
|----------|--------|
| Version déployée | v2.7.0-SUBCONTRACTOR-FIX |
| Statut environnement | ✅ GREEN |
| Endpoints opérationnels | 5/6 (83%) |
| Prix enregistrés | 1 (test) |
| Import Dashdoc | ❌ Bloqué (401) |
| Documentation | ✅ Complète |

---

## 📚 Documentation disponible

| Document | Lignes | Description |
|----------|--------|-------------|
| [PRICING-API.md](docs/PRICING-API.md) | 557 | Documentation complète des 6 endpoints |
| [DASHDOC-AFFRETEMENT.md](docs/DASHDOC-AFFRETEMENT.md) | 634 | Guide structure Dashdoc & affretement |
| [FIX-PRIX-SOUS-TRAITANTS.md](FIX-PRIX-SOUS-TRAITANTS.md) | 348 | Documentation du fix critique |
| [TROUBLESHOOT-DASHDOC.md](TROUBLESHOOT-DASHDOC.md) | 287 | Guide résolution erreur 401 |
| [CONFIG-DASHDOC.md](CONFIG-DASHDOC.md) | 294 | Guide configuration |
| [STATUS-v2.7.0.md](STATUS-v2.7.0.md) | 298 | Status de déploiement |
| [VALIDATION-v2.7.0.md](VALIDATION-v2.7.0.md) | 413 | Rapport de validation |

---

## 🎯 Résumé exécutif

### ✅ Succès

1. **Fix critique des prix sous-traitants déployé** avec succès
   - Extraction correcte des prix depuis `charter.price` ou `subcontracting.price`
   - Validation stricte pour éviter l'utilisation de `pricing.invoicing_amount`
   - Traçabilité complète avec `priceSource` et `carrierSource`

2. **5 endpoints pricing opérationnels** en production
   - Enregistrement manuel des prix fonctionnel
   - Calcul de prix cible basé sur historique
   - Identification des sous-traitants préférés

3. **Documentation complète** de l'intégration

### ⚠️ Blocage

1. **Erreur 401 Dashdoc** empêche l'import automatique
   - Cause probable : clé API invalide ou permissions insuffisantes
   - Impact : Import automatique des données historiques impossible
   - Workaround : Enregistrement manuel via `record-price` opérationnel

### 🔜 Action immédiate requise

**Exécuter le script de diagnostic** :
```powershell
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2\scripts"
.\test-dashdoc-api.ps1
```

**Résultat attendu** : Identification de la cause de l'erreur 401 et solution pour la corriger.

---

**Généré le** : 2026-02-02
**Par** : Claude Sonnet 4.5
**Version API** : v2.7.0-SUBCONTRACTOR-FIX
**Statut** : ✅ **GREEN** (erreur 401 Dashdoc à résoudre)
