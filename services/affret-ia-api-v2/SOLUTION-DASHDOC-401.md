# Solution - Erreur 401 Dashdoc API

**Date** : 2 février 2026
**Problème** : Erreur 401 "Informations d'authentification non fournies" / "Token invalide"
**Cause identifiée** : Clé API invalide, expirée ou révoquée

---

## 🔍 Diagnostic effectué

J'ai testé **5 méthodes d'authentification différentes** avec la clé API `8321c7a8f7fe8f75192fa15a6c883a11758e0084` :

| Méthode | Résultat | Message d'erreur |
|---------|----------|------------------|
| `Authorization: Bearer <token>` | ❌ 401 | "Informations d'authentification non fournies." |
| `Authorization: Token <token>` | ❌ 401 | "Token invalide" |
| `X-API-Key: <token>` | ❌ 401 | "Informations d'authentification non fournies." |
| Bearer + `status=done` | ❌ 401 | "Informations d'authentification non fournies." |
| Bearer + `is_subcontracted=true` | ❌ 401 | "Informations d'authentification non fournies." |

**Conclusion** : ❌ **Aucune méthode ne fonctionne** → La clé API est invalide

---

## ✅ Solution : Régénérer la clé API Dashdoc

### Étape 1 : Se connecter à Dashdoc

1. Ouvrir [https://app.dashdoc.com](https://app.dashdoc.com)
2. Se connecter avec les identifiants de l'entreprise

### Étape 2 : Accéder aux paramètres API

1. Cliquer sur **Paramètres** (Settings) en haut à droite
2. Aller dans **API & Intégrations**
3. Section **Clés API** (API Keys)

### Étape 3 : Vérifier la clé actuelle

Vérifier si la clé `8321c7a8f7fe8f75192fa15a6c883a11758e0084` est :
- ❌ **Inactive** → Elle a été désactivée
- ❌ **Expirée** → Elle a dépassé sa date d'expiration
- ❌ **Révoquée** → Elle a été supprimée
- ❌ **Inexistante** → Ce n'est pas une clé Dashdoc valide

### Étape 4 : Créer une nouvelle clé API

1. Cliquer sur **Créer une clé API** (Create API Key)
2. **Nom** : `Affret.IA - Production - Sous-traitance`
3. **Description** : `Import automatique des transports sous-traités pour Affret.IA`
4. **Permissions requises** :
   - ✅ **Lecture des transports** (`transports:read`)
   - ✅ **Accès aux données de tarification** (`pricing:read`)
   - ✅ **Accès aux informations transporteur** (`carrier:read`)
   - ✅ **Accès aux données d'affretement** (`charter:read`, `subcontracting:read`)
5. **Environnement** : Production
6. **Expiration** : 1 an (ou jamais)
7. Cliquer sur **Générer**

### Étape 5 : Copier la nouvelle clé

⚠️ **IMPORTANT** : La clé ne sera affichée **qu'une seule fois**.

```
Exemple de clé : a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

📋 **Copier la clé** et la sauvegarder temporairement dans un fichier texte sécurisé.

---

## 🔧 Étape 6 : Mettre à jour la clé sur AWS Elastic Beanstalk

### Option A : Via AWS CLI (recommandé)

```powershell
aws elasticbeanstalk update-environment `
  --environment-name rt-affret-ia-api-prod-v4 `
  --region eu-central-1 `
  --option-settings `
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<NOUVELLE_CLE>"
```

**Remplacer** `<NOUVELLE_CLE>` par la clé copiée à l'étape 5.

### Option B : Via Console AWS

1. Ouvrir [AWS Elastic Beanstalk Console](https://eu-central-1.console.aws.amazon.com/elasticbeanstalk/home?region=eu-central-1)
2. Cliquer sur **rt-affret-ia-api**
3. Cliquer sur **rt-affret-ia-api-prod-v4**
4. Aller dans **Configuration** → **Software** → **Edit**
5. Dans **Environment properties**, modifier :
   ```
   DASHDOC_API_KEY = <NOUVELLE_CLE>
   ```
6. Cliquer sur **Apply**
7. ⏳ Attendre 2-3 minutes que l'environnement redémarre

---

## 🧪 Étape 7 : Tester la nouvelle clé

### Test 1 : Script de diagnostic (local)

Modifier [scripts/test-dashdoc-simple.js](scripts/test-dashdoc-simple.js) ligne 6 :

```javascript
const DASHDOC_API_KEY = '<NOUVELLE_CLE>';
```

Puis exécuter :

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
node scripts/test-dashdoc-simple.js
```

**Résultat attendu** :
```
✅ SUCCÈS - HTTP 200
Nombre de résultats: 123
```

### Test 2 : Import dry-run (production)

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"test-org","months":6,"dryRun":true}'
```

**Résultat attendu** :
```json
{
  "success": true,
  "message": "DRY RUN - 15 transports seraient importés",
  "imported": 15,
  "skipped": 2
}
```

### Test 3 : Vérifier les logs

```bash
aws logs tail "/aws/elasticbeanstalk/rt-affret-ia-api-prod-v4/var/log/web.stdout.log" \
  --region eu-central-1 \
  --since 5m \
  --follow
```

**Logs attendus** :
```
[DASHDOC] 15 transports récupérés depuis Dashdoc
[DASHDOC] Analyse: 13 éligibles, 2 ignorés
[DASHDOC] transport-123: 75000→69000, 450€ (charter.price)
```

---

## 🚀 Étape 8 : Import réel des données

**Une fois les tests réussis**, lancer l'import réel :

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "YOUR_ORG_ID",
    "months": 6,
    "dryRun": false
  }'
```

**Résultat attendu** :
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

## 🔍 Étape 9 : Vérifier les données importées

### Vérifier l'historique des prix

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/price-history" \
  -H "Content-Type: application/json" \
  -d '{
    "route": {
      "from": "75000",
      "to": "69000"
    }
  }'
```

**Résultat attendu** :
```json
{
  "success": true,
  "route": { "from": "75000", "to": "69000" },
  "averagePrice": 450,
  "priceRange": { "min": 400, "max": 500, "stdDeviation": 25 },
  "transactionCount": 12,  // ✅ > 0 = import réussi
  "period": "last_6_months",
  "history": [...]
}
```

### Vérifier les sources de prix (traçabilité)

Les données importées doivent avoir :
- `dashdocImport.imported = true`
- `dashdocImport.priceSource` = `charter.price` ou `subcontracting.price` ✅
- `dashdocImport.priceSource` ≠ `pricing.invoicing_amount` ❌

---

## ⚠️ Si l'erreur 401 persiste après régénération

### Vérifier les permissions de la clé

La clé doit avoir accès à :
1. **Transports** en lecture
2. **Pricing/Tarification** en lecture
3. **Carrier/Transporteur** en lecture
4. **Charter/Affretement** en lecture
5. **Subcontracting/Sous-traitance** en lecture

### Vérifier l'environnement Dashdoc

Dashdoc peut avoir plusieurs environnements :
- **Production** : `https://api.dashdoc.com/api/v4` ✅
- **Staging** : `https://api.staging.dashdoc.com/api/v4`
- **Sandbox** : `https://api.sandbox.dashdoc.com/api/v4`

Vérifier que la clé correspond bien à l'environnement **production**.

### Contacter le support Dashdoc

Si le problème persiste :

**Email** : support@dashdoc.com

**Informations à fournir** :
- Clé API (première partie : `a1b2c3d4...`)
- Endpoint appelé : `https://api.dashdoc.com/api/v4/transports/`
- Code erreur : 401
- Message d'erreur : "Informations d'authentification non fournies."
- Date et heure de la requête
- Headers utilisés : `Authorization: Bearer <token>`

---

## 📊 Checklist de vérification

- [ ] Se connecter à Dashdoc (app.dashdoc.com)
- [ ] Vérifier le statut de la clé actuelle
- [ ] Créer une nouvelle clé API avec permissions complètes
- [ ] Copier la nouvelle clé (elle ne sera affichée qu'une fois)
- [ ] Mettre à jour DASHDOC_API_KEY sur AWS EB
- [ ] Attendre le redémarrage de l'environnement (2-3 min)
- [ ] Tester avec test-dashdoc-simple.js → HTTP 200 ✅
- [ ] Tester import dry-run → "DRY RUN - X transports..." ✅
- [ ] Lancer import réel → "X prix importés..." ✅
- [ ] Vérifier price-history → transactionCount > 0 ✅
- [ ] Vérifier traçabilité → priceSource = charter.price ✅

---

## 📈 Après la correction

### Automatiser l'import

Une fois que l'import fonctionne, configurer un import automatique :
- **Fréquence** : 1x par jour (nuit)
- **Période** : 6 derniers mois (rolling)
- **Filtre** : `is_subcontracted=true`, `status=done`

### Monitorer la qualité des données

Vérifier régulièrement :
- **Taux d'import** : `imported / (imported + skipped)` > 80%
- **Source des prix** : `priceSource = 'charter.price'` ou `'subcontracting.price'`
- **Warnings** : Surveiller les logs pour `⚠️ [DASHDOC] Utilisation de invoicing_amount`

---

## 🎯 Résumé

**Problème** : Clé API Dashdoc invalide → Erreur 401

**Solution** :
1. Régénérer une nouvelle clé API dans Dashdoc avec permissions complètes
2. Mettre à jour DASHDOC_API_KEY sur AWS EB
3. Tester avec dry-run
4. Lancer l'import réel

**Durée estimée** : 10-15 minutes

**Impact** :
- ✅ Import automatique des prix sous-traitants fonctionnel
- ✅ Market intelligence basée sur données réelles
- ✅ Négociation automatique avec prix cibles calculés

---

**Généré le** : 2026-02-02
**Par** : Claude Sonnet 4.5
**Version** : v2.7.0-SUBCONTRACTOR-FIX
