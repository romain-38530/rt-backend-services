# Troubleshooting Dashdoc API - Erreur 401

**Statut** : L'intégration Dashdoc renvoie une erreur 401 (Unauthorized)

**Configuration actuelle** :
- ✅ `DASHDOC_API_KEY` : configuré sur EB
- ✅ `DASHDOC_API_URL` : https://api.dashdoc.com/api/v4
- ✅ Application redémarrée avec les nouvelles variables
- ❌ API Dashdoc renvoie 401

---

## Causes possibles de l'erreur 401

### 1. Format de la clé API incorrect

**Vérification** : La clé API Dashdoc doit être un token API valide, généralement un UUID ou une chaîne hexadécimale.

**Clé actuelle** : `8321c7a8f7fe8f75192fa15a6c883a11758e0084`

**Format attendu** :
- Token API : `8321c7a8f7fe8f75192fa15a6c883a11758e0084` ✅ (semble correct)
- Ou API Key avec préfixe : `dashdoc_...` (non applicable ici)

### 2. Permissions insuffisantes

La clé API doit avoir les permissions suivantes sur Dashdoc :
- ✅ **Lecture des transports** (`transports:read`)
- ✅ **Accès aux transports complétés** (status: `done`)
- ✅ **Accès aux informations de pricing** (`pricing`)
- ✅ **Accès aux informations carrier** (`carrier`)

**Action** : Vérifier dans les paramètres Dashdoc que la clé API a bien ces permissions.

### 3. Clé API expirée ou révoquée

**Action** : Vérifier dans Dashdoc si la clé est toujours active.

### 4. Endpoint API incorrect

**Endpoint utilisé** : `https://api.dashdoc.com/api/v4/transports/`

**Action** : Vérifier que c'est bien l'endpoint correct dans la documentation Dashdoc v4.

---

## Test manuel de la clé API

### Option 1 : Test direct avec curl (depuis votre poste)

```bash
curl -X GET "https://api.dashdoc.com/api/v4/transports/?status=done&page_size=1" \
  -H "Authorization: Bearer 8321c7a8f7fe8f75192fa15a6c883a11758e0084" \
  -H "Content-Type: application/json"
```

**Résultat attendu** :
```json
{
  "count": 123,
  "results": [
    {
      "uid": "transport-123",
      "status": "done",
      "origin": {...},
      "destination": {...},
      "carrier": {...},
      "pricing": {...}
    }
  ]
}
```

**Si erreur 401** :
```json
{
  "detail": "Invalid token.",
  "code": "authentication_failed"
}
```
→ La clé API n'est pas valide.

**Si erreur 403** :
```json
{
  "detail": "You do not have permission to perform this action.",
  "code": "permission_denied"
}
```
→ La clé n'a pas les bonnes permissions.

### Option 2 : Test via Postman ou interface Dashdoc

1. Ouvrir Postman
2. Créer une requête GET : `https://api.dashdoc.com/api/v4/transports/`
3. Ajouter header : `Authorization: Bearer 8321c7a8f7fe8f75192fa15a6c883a11758e0084`
4. Ajouter params : `status=done`, `page_size=1`
5. Envoyer la requête

---

## Solutions possibles

### Solution 1 : Régénérer une nouvelle clé API

Si la clé actuelle ne fonctionne pas :

1. Se connecter sur [Dashdoc](https://app.dashdoc.com)
2. Aller dans **Paramètres** → **API & Intégrations**
3. Créer une nouvelle clé API avec les permissions :
   - Lecture des transports
   - Accès aux données de tarification
4. Copier la nouvelle clé
5. Mettre à jour sur AWS EB :

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DASHDOC_API_KEY,Value="<NOUVELLE_CLE>"
```

6. Redéployer pour redémarrer l'app :

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --version-label v2.7.0-COMPLETE \
  --region eu-central-1
```

### Solution 2 : Utiliser un compte de service Dashdoc

Si vous utilisez un compte utilisateur, créez un **compte de service** dédié :
- Email : `api-symphonia@votre-domaine.com`
- Rôle : API Access avec permissions limitées aux transports

### Solution 3 : Vérifier l'environnement Dashdoc

Dashdoc a peut-être plusieurs environnements :
- **Production** : `https://api.dashdoc.com/api/v4`
- **Staging** : `https://api.staging.dashdoc.com/api/v4`
- **Sandbox** : `https://api.sandbox.dashdoc.com/api/v4`

**Action** : Vérifier que la clé API correspond au bon environnement.

---

## Test après correction

Une fois la clé API corrigée, tester l'import :

### 1. Import dry-run (sans sauvegarder)

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  --data '{"organizationId":"YOUR_ORG_ID","months":6,"dryRun":true}'
```

**Résultat attendu** :
```json
{
  "success": true,
  "message": "DRY RUN - 15 transports seraient importés",
  "count": 15,
  "transports": [...]
}
```

### 2. Import réel

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  --data '{"organizationId":"YOUR_ORG_ID","months":6,"dryRun":false}'
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

### 3. Vérifier les données importées

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/price-history" \
  -H "Content-Type: application/json" \
  --data '{"route":{"from":"75000","to":"69000"}}'
```

Si l'import a fonctionné, `transactionCount` devrait être > 0.

---

## Alternatives si Dashdoc ne fonctionne pas

En attendant de résoudre le problème d'authentification Dashdoc, vous pouvez :

### 1. Importer manuellement via le script CLI

```bash
cd scripts
node import-dashdoc-history.js --org-id YOUR_ORG --months 6 --dry-run
```

### 2. Enregistrer les prix manuellement

```bash
curl -X POST "http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/affretia/record-price" \
  -H "Content-Type: application/json" \
  --data '{
    "orderId": "order123",
    "carrierId": "carrier456",
    "carrierName": "Transport Express",
    "route": {
      "from": {"city": "Paris", "postalCode": "75000"},
      "to": {"city": "Lyon", "postalCode": "69000"}
    },
    "proposedPrice": 480,
    "price": 450,
    "marketAverage": 450,
    "vehicleType": "SEMI",
    "organizationId": "YOUR_ORG"
  }'
```

### 3. Désactiver temporairement Dashdoc

Commenter l'import Dashdoc et utiliser uniquement l'enregistrement manuel des prix via l'API.

---

## Logs de debugging

Pour activer les logs de debug Dashdoc, ajouter cette variable :

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --region eu-central-1 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DEBUG_DASHDOC,Value="true"
```

Puis consulter les logs :

```bash
aws logs tail "/aws/elasticbeanstalk/rt-affret-ia-api-prod-v4/var/log/web.stdout.log" \
  --region eu-central-1 \
  --since 5m \
  --follow
```

---

## Contact Support Dashdoc

Si le problème persiste, contacter le support Dashdoc :
- **Email** : support@dashdoc.com
- **Documentation** : https://help.dashdoc.com/
- **API Docs** : https://api.dashdoc.com/docs/

**Informations à fournir** :
- Clé API utilisée (8321c7a8...)
- Endpoint appelé (`/api/v4/transports/`)
- Code erreur (401)
- Message d'erreur exact
- Date et heure de la requête

---

## État actuel

- ✅ Application déployée : v2.7.0-COMPLETE (GREEN)
- ✅ Variables d'environnement configurées
- ✅ Endpoints pricing opérationnels (5/6)
- ❌ Import Dashdoc bloqué (erreur 401)

**Prochaine action** : Tester la clé API Dashdoc avec curl depuis votre poste pour identifier la cause exacte de l'erreur 401.
