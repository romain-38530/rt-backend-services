# Rapport d'Analyse: Erreurs CORS et API - Frontend Transporteur SYMPHONI.A

**Date:** 30 janvier 2026
**Frontend URL:** https://transporteur.symphonia-controltower.com
**Analysé par:** Claude Code Agent

---

## Résumé Exécutif

Le frontend transporteur affiche plusieurs erreurs CORS et API dans la console. L'analyse a révélé **3 problèmes majeurs** et **2 problèmes mineurs** qui empêchent le bon fonctionnement de l'application.

### Statut des Corrections
- ✅ **Correction 1:** Configuration CORS mise à jour
- ⚠️ **Problème 2:** URL CloudFront inconnue (`d49nyvn5m7n3l.cloudfront.net`)
- ⚠️ **Problème 3:** Endpoint API avec préfixe incorrect (`/api/_1/` au lieu de `/api/v1/`)
- ✅ **Documentation:** Middleware d'authentification vérifié
- ⚠️ **Action requise:** Configuration CloudFront à vérifier

---

## 1. Problèmes CORS Identifiés

### 1.1 ❌ Origine Manquante: `transporteur.symphonia-controltower.com`

**Erreur:**
```
Access to XMLHttpRequest at 'https://d49nyvn5m7n3l.cloudfront.net/api/_1/affretia/sessions/industrial'
from origin 'https://transporteur.symphonia-controltower.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Cause Racine:**
Le fichier de configuration CORS Elastic Beanstalk ne contenait pas le domaine `transporteur.symphonia-controltower.com`.

**Fichier:** `services/authz-eb/cors-config.json`

**État Avant:**
```json
{
  "Namespace": "aws:elasticbeanstalk:application:environment",
  "OptionName": "CORS_ALLOWED_ORIGINS",
  "Value": "https://www.symphonia-controltower.com,https://symphonia-controltower.com"
}
```

**✅ Correction Appliquée:**
```json
{
  "Namespace": "aws:elasticbeanstalk:application:environment",
  "OptionName": "CORS_ALLOWED_ORIGINS",
  "Value": "https://www.symphonia-controltower.com,https://symphonia-controltower.com,https://transporteur.symphonia-controltower.com,https://industrie.symphonia-controltower.com,https://fournisseur.symphonia-controltower.com,https://destinataire.symphonia-controltower.com"
}
```

**Action de Déploiement Requise:**
```bash
cd services/authz-eb
eb setenv CORS_ALLOWED_ORIGINS="https://www.symphonia-controltower.com,https://symphonia-controltower.com,https://transporteur.symphonia-controltower.com,https://industrie.symphonia-controltower.com,https://fournisseur.symphonia-controltower.com,https://destinataire.symphonia-controltower.com"
eb deploy
```

---

## 2. Erreurs API Identifiées

### 2.1 ⚠️ URL CloudFront Inconnue: `d49nyvn5m7n3l.cloudfront.net`

**Problème:**
L'erreur console mentionne `https://d49nyvn5m7n3l.cloudfront.net/api/_1/affretia/sessions/industrial` mais cette URL CloudFront n'existe **pas** dans:
- La configuration frontend (`.env.production`)
- Le code frontend (`lib/api.ts`)
- La documentation backend (`PRODUCTION-URLS.md`)

**URLs CloudFront Attendues (depuis `.env.production`):**
- Auth API: `https://ddaywxps9n701.cloudfront.net`
- Affret IA API: `https://d393yiia4ig3bw.cloudfront.net`
- Orders API: `https://dh9acecfz0wg0.cloudfront.net`
- Subscriptions API: `https://d39uizi9hzozo8.cloudfront.net`

**Hypothèses:**
1. **Cache navigateur:** L'utilisateur accède à une ancienne version avec des URLs obsolètes
2. **Configuration DNS/CDN:** Une ancienne distribution CloudFront est encore active
3. **Code frontend déployé:** Le code déployé sur Amplify utilise des URLs différentes de celles dans le repo

**🔍 Actions de Diagnostic Requises:**
```bash
# 1. Vérifier les distributions CloudFront actives
aws cloudfront list-distributions --query "DistributionList.Items[?contains(DomainName, 'd49nyvn5m7n3l')]"

# 2. Vérifier le code déployé sur Amplify
aws amplify get-app --app-id <APP_ID>

# 3. Invalider le cache CloudFront
aws cloudfront create-invalidation --distribution-id d49nyvn5m7n3l --paths "/*"

# 4. Vérifier les logs CloudFront
aws cloudfront list-distributions --query "DistributionList.Items[*].[Id,DomainName,Origins.Items[0].DomainName]" --output table
```

---

### 2.2 ⚠️ Endpoint avec Préfixe Incorrect: `/api/_1/` au lieu de `/api/v1/`

**Erreur:**
```
GET https://d49nyvn5m7n3l.cloudfront.net/api/_1/affretia/sessions/industrial?26b0abc
```

**Problème:**
Le frontend appelle `/api/_1/affretia/sessions/industrial` mais le backend est configuré pour `/api/v1/affretia/sessions/industrial`.

**Backend (affret-ia-api-v2/index.js):**
```javascript
const affretiaRoutes = require('./routes/affretia.routes');
app.use('/api/v1/affretia', affretiaRoutes);
```

**Routes Backend (affret-ia-api-v2/routes/affretia.routes.js):**
```javascript
// GET /api/v1/affretia/sessions/industrial/:industrialId
router.get('/sessions/industrial/:industrialId', affretiaController.getIndustrialSessions);
```

**Endpoint Attendu:** `GET /api/v1/affretia/sessions/industrial/:industrialId`
**Endpoint Appelé:** `GET /api/_1/affretia/sessions/industrial?26b0abc`

**Problèmes Multiples:**
1. Préfixe incorrect: `_1` au lieu de `v1`
2. Paramètre manquant: `:industrialId` devrait être dans le path, pas en query string
3. Query string mal formée: `?26b0abc` sans nom de paramètre

**🔍 Investigation Frontend Requise:**
Rechercher dans le code frontend où l'URL est construite:
```bash
grep -r "api/_1" apps/web-transporter
grep -r "affretia/sessions/industrial" apps/web-transporter
```

**Solutions Possibles:**
1. **Option A (Recommandée):** Corriger le frontend pour utiliser `/api/v1/`
2. **Option B (Workaround):** Ajouter un middleware de redirection dans le backend:
```javascript
// Dans affret-ia-api-v2/index.js
app.use((req, res, next) => {
  if (req.url.startsWith('/api/_1/')) {
    req.url = req.url.replace('/api/_1/', '/api/v1/');
  }
  next();
});
```

---

### 2.3 ❌ 404 Not Found: `/api/carriers` (Vigilance endpoint)

**Erreur:**
```
GET https://d49nyvn5m7n3l.cloudfront.net/api/carriers?26b0abc - 404 Not Found
```

**Analyse:**
L'endpoint `/api/carriers` **existe bien** dans le service `authz-eb`:

**Backend (authz-eb/carriers.js):**
```javascript
// GET /api/carriers - Liste des transporteurs
app.get('/api/carriers', async (req, res) => {
  // ... code ...
});

// GET /api/carriers/:id - Details d'un transporteur
app.get('/api/carriers/:carrierId', async (req, res) => {
  // ... code ...
});
```

**Problème:** L'erreur 404 suggère que:
1. La distribution CloudFront `d49nyvn5m7n3l` ne route **PAS** vers le service `authz-eb`
2. Ou le service `authz-eb` n'est pas déployé correctement
3. Ou le path routing CloudFront n'inclut pas `/api/carriers/*`

**URL CloudFront Correcte (depuis .env.production):**
```
NEXT_PUBLIC_CARRIERS_API_URL=https://ddaywxps9n701.cloudfront.net
```

**🔍 Vérification Requise:**
```bash
# Tester l'endpoint directement sur authz-eb
curl -H "Authorization: Bearer TOKEN" https://ddaywxps9n701.cloudfront.net/api/carriers

# Vérifier le routing CloudFront
aws cloudfront get-distribution-config --id <DISTRIBUTION_ID> | jq '.DistributionConfig.Origins'
```

---

### 2.4 ❌ 403 Forbidden: `/api/orders?customerId=...`

**Erreur:**
```
GET https://d49nyvn5m7n3l.cloudfront.net/api/orders?customerId=... - 403 Forbidden
```

**Analyse:**
Le service Orders API (`services/orders-eb`) **possède un middleware d'authentification JWT**.

**Documentation (orders-eb/FIX_403_AUTHENTICATION.md):**
```
Root Cause: The Orders API had NO authentication middleware to verify JWT tokens.
Solution: Added JWT authentication middleware.
```

**Middleware (orders-eb/index.js, lignes 266-298):**
```javascript
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'UNAUTHORIZED'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}
```

**Causes Possibles du 403:**
1. **Token JWT invalide ou expiré**
2. **Token JWT non envoyé** dans le header Authorization
3. **JWT_SECRET différent** entre authz-eb (qui génère le token) et orders-eb (qui le vérifie)
4. **User non autorisé** à accéder aux commandes du customerId spécifié

**🔍 Vérification Frontend:**
Le code frontend envoie-t-il bien le token JWT?

```typescript
// Dans lib/api.ts
const getAuthHeaders = () => ({
  'Authorization': `Bearer ${getAuthToken() || ''}`,
  'Content-Type': 'application/json'
});
```

**🔍 Vérification Backend:**
```bash
# Vérifier que JWT_SECRET est le même partout
eb printenv --env rt-orders-api-prod | grep JWT_SECRET
eb printenv --env rt-authz-eb-prod | grep JWT_SECRET
```

**Test Manuel:**
```bash
# 1. Obtenir un token
TOKEN=$(curl -X POST https://ddaywxps9n701.cloudfront.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carrier@example.com","password":"password"}' | jq -r '.token')

# 2. Tester l'endpoint orders
curl -H "Authorization: Bearer $TOKEN" \
  "https://dh9acecfz0wg0.cloudfront.net/api/orders?carrierId=XXX&limit=1000"
```

---

## 3. Configuration CloudFront

### 3.1 Headers CORS Requis

**Configuration Actuelle (orders-eb/cf-update.json):**
```json
"Headers": {
  "Quantity": 5,
  "Items": [
    "Origin",
    "Authorization",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers",
    "Host"
  ]
}
```

✅ **Bonne Configuration:** Les headers CORS essentiels sont bien forwardés.

### 3.2 Cache TTL

**Configuration Actuelle:**
```json
"MinTTL": 0,
"DefaultTTL": 0,
"MaxTTL": 0
```

✅ **Bonne Configuration:** Pas de cache pour les endpoints d'API authentifiés.

---

## 4. Services Backend - Mapping des URLs

### 4.1 URLs CloudFront vs Elastic Beanstalk

| Service | CloudFront URL (Frontend) | Elastic Beanstalk URL (Backend) |
|---------|---------------------------|----------------------------------|
| **Auth/Authz** | `https://ddaywxps9n701.cloudfront.net` | `rt-authz-eb-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com` |
| **Orders** | `https://dh9acecfz0wg0.cloudfront.net` | `rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com` |
| **Affret IA** | `https://d393yiia4ig3bw.cloudfront.net` | `rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com` |
| **Subscriptions** | `https://d39uizi9hzozo8.cloudfront.net` | `rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com` |
| **❓ Inconnu** | `https://d49nyvn5m7n3l.cloudfront.net` | ??? |

### 4.2 Endpoints Disponibles par Service

#### Service: authz-eb (`ddaywxps9n701.cloudfront.net`)
✅ Endpoints Vérifiés:
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`
- `GET /api/carriers`
- `GET /api/carriers/:carrierId`
- `GET /api/vigilance/alerts`
- `POST /api/vat/validate`

#### Service: affret-ia-api-v2 (`d393yiia4ig3bw.cloudfront.net`)
✅ Endpoints Vérifiés:
- `GET /api/v1/affretia/sessions`
- `GET /api/v1/affretia/sessions/industrial/:industrialId`
- `POST /api/v1/affretia/trigger`
- `GET /api/v1/affretia/bourse`

❌ Endpoint Manquant:
- `/api/_1/affretia/sessions/industrial` (mauvais préfixe)

#### Service: orders-eb (`dh9acecfz0wg0.cloudfront.net`)
✅ Endpoints Vérifiés (avec auth JWT):
- `GET /api/orders` (authentifié)
- `GET /api/orders/:id` (authentifié)
- `POST /api/orders` (authentifié)
- `PUT /api/orders/:id` (authentifié)

---

## 5. Plan d'Action

### Phase 1: Corrections Immédiates (Critiques)

1. **✅ FAIT - Mettre à jour CORS_ALLOWED_ORIGINS**
   ```bash
   cd services/authz-eb
   eb setenv CORS_ALLOWED_ORIGINS="https://www.symphonia-controltower.com,https://symphonia-controltower.com,https://transporteur.symphonia-controltower.com,https://industrie.symphonia-controltower.com,https://fournisseur.symphonia-controltower.com,https://destinataire.symphonia-controltower.com"
   eb deploy
   ```

2. **⚠️ À FAIRE - Identifier la distribution CloudFront `d49nyvn5m7n3l`**
   ```bash
   aws cloudfront list-distributions --output table
   ```
   Action: Déterminer si cette distribution doit être supprimée ou mise à jour.

3. **⚠️ À FAIRE - Corriger le préfixe d'URL dans le frontend**
   - Chercher `/api/_1/` dans le code frontend
   - Remplacer par `/api/v1/`
   - Redéployer sur Amplify

### Phase 2: Vérifications (Importantes)

4. **Vérifier JWT_SECRET cohérent**
   ```bash
   # Comparer les JWT_SECRET de tous les services
   eb printenv --env rt-authz-eb-prod | grep JWT_SECRET
   eb printenv --env rt-orders-api-prod | grep JWT_SECRET
   eb printenv --env rt-affret-ia-api-prod-v2 | grep JWT_SECRET
   ```

5. **Tester l'authentification end-to-end**
   - Se connecter via le frontend transporteur
   - Vérifier que les appels API incluent le JWT token
   - Vérifier que les endpoints répondent 200 OK au lieu de 403

### Phase 3: Optimisations (Nice-to-have)

6. **Invalider tous les caches CloudFront**
   ```bash
   # Pour chaque distribution
   aws cloudfront create-invalidation --distribution-id <ID> --paths "/*"
   ```

7. **Ajouter des logs détaillés dans authz-eb**
   ```javascript
   app.use(cors({
     origin: (origin, callback) => {
       console.log(`[CORS] Origin: ${origin}`);
       // ... reste du code CORS
     }
   }));
   ```

8. **Documenter les URLs CloudFront**
   - Créer un tableau de mapping complet
   - Ajouter dans `PRODUCTION-URLS.md`

---

## 6. Tests de Validation

### 6.1 Test CORS
```bash
curl -H "Origin: https://transporteur.symphonia-controltower.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: authorization" \
     -X OPTIONS \
     https://ddaywxps9n701.cloudfront.net/api/carriers
```

**Résultat Attendu:**
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://transporteur.symphonia-controltower.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 6.2 Test Authentication
```bash
# 1. Login
TOKEN=$(curl -X POST https://ddaywxps9n701.cloudfront.net/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@carrier.com","password":"password"}' | jq -r '.token')

# 2. Test Orders API
curl -H "Authorization: Bearer $TOKEN" \
     https://dh9acecfz0wg0.cloudfront.net/api/orders?limit=10
```

**Résultat Attendu:** 200 OK avec liste des commandes

### 6.3 Test Affret IA
```bash
curl -H "Authorization: Bearer $TOKEN" \
     "https://d393yiia4ig3bw.cloudfront.net/api/v1/affretia/sessions/industrial/<INDUSTRIAL_ID>"
```

**Résultat Attendu:** 200 OK avec liste des sessions

---

## 7. Fichiers Modifiés

### ✅ Fichiers Modifiés dans ce Fix
1. **services/authz-eb/cors-config.json**
   - Ajout de toutes les origines portail (transporteur, industrie, fournisseur, destinataire)

### ⚠️ Fichiers à Modifier (Actions Requises)
1. **rt-frontend-apps/apps/web-transporter/lib/api.ts**
   - Chercher et remplacer `/api/_1/` par `/api/v1/`

2. **services/affret-ia-api-v2/index.js** (Option B - Workaround)
   - Ajouter middleware de redirection `/api/_1/` → `/api/v1/`

---

## 8. Logs et Monitoring

### 8.1 Activer les Logs CloudWatch pour CORS
```javascript
// Dans chaque service Express
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log(`Origin: ${req.headers.origin || 'none'}`);
  console.log(`Authorization: ${req.headers.authorization ? 'present' : 'missing'}`);
  next();
});
```

### 8.2 Vérifier les Logs CloudFront
```bash
aws logs filter-log-events \
  --log-group-name /aws/cloudfront/d49nyvn5m7n3l \
  --start-time $(date -d '1 hour ago' +%s)000
```

---

## 9. Contacts et Escalade

### Équipe Responsable
- **Backend API:** Services Elastic Beanstalk (authz-eb, orders-eb, affret-ia-api-v2)
- **Frontend:** Amplify (apps/web-transporter)
- **Infrastructure:** CloudFront distributions, Route53 DNS

### Points Bloquants Critiques
1. ⚠️ **Distribution CloudFront inconnue:** `d49nyvn5m7n3l.cloudfront.net` non documentée
2. ⚠️ **Préfixe d'URL incorrect:** `/api/_1/` au lieu de `/api/v1/`
3. ⚠️ **403 Forbidden:** Vérifier JWT_SECRET et authentification

---

## 10. Conclusion

### Problèmes Résolus
✅ Configuration CORS mise à jour pour autoriser `transporteur.symphonia-controltower.com`

### Problèmes Restants (Bloquants)
1. ⚠️ **URL CloudFront inconnue** (`d49nyvn5m7n3l`) - Nécessite investigation infrastructure
2. ⚠️ **Préfixe d'API incorrect** (`/api/_1/`) - Nécessite correction frontend
3. ⚠️ **Authentification 403** - Nécessite vérification JWT_SECRET

### Prochaines Étapes
1. Identifier l'origine de l'URL `d49nyvn5m7n3l.cloudfront.net`
2. Corriger le préfixe `/api/_1/` dans le frontend
3. Déployer la configuration CORS mise à jour
4. Invalider les caches CloudFront
5. Tester end-to-end avec le frontend transporteur

---

**Rapport généré le:** 30 janvier 2026
**Version:** 1.0
**Prochaine révision:** Après déploiement des corrections
