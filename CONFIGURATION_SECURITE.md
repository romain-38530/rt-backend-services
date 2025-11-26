# Configuration de Sécurité - RT SYMPHONI.A

**Version:** v1.6.2-security
**Dernière mise à jour:** 26 novembre 2025

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Middleware de sécurité](#middleware-de-sécurité)
3. [Rate Limiting](#rate-limiting)
4. [CORS Configuration](#cors-configuration)
5. [Helmet Security Headers](#helmet-security-headers)
6. [Input Sanitization](#input-sanitization)
7. [Autres Middlewares](#autres-middlewares)
8. [Configuration des Variables](#configuration-des-variables)
9. [Tests de Sécurité](#tests-de-sécurité)
10. [Recommandations Production](#recommandations-production)

---

## 🛡️ Vue d'ensemble

RT SYMPHONI.A implémente un système de sécurité multi-couches pour protéger l'API contre les attaques courantes :

### ✅ Fonctionnalités de Sécurité Implémentées

- ✅ **Rate Limiting** - 4 niveaux (général, strict, upload, auth)
- ✅ **CORS** - Cross-Origin Resource Sharing avec whitelist
- ✅ **Helmet** - 9 headers de sécurité HTTP
- ✅ **Input Sanitization** - Protection XSS et injection
- ✅ **Request Logging** - Traçabilité complète
- ✅ **IP Whitelisting** - Restriction par IP (optionnel)
- ✅ **API Key Validation** - Authentification par clé API (optionnel)
- ✅ **Request Size Limiting** - Protection contre payloads trop larges

### 📁 Fichiers Modifiés/Créés

```
services/subscriptions-contracts-eb/
├── middleware/
│   └── security.js          [CRÉÉ] - Middleware de sécurité (382 lignes)
├── index.js                 [MODIFIÉ] - Intégration sécurité
├── .env.example             [MODIFIÉ] - Variables de configuration
└── scripts/
    └── configure-aws-services.sh [CRÉÉ] - Script de configuration
```

---

## 🔐 Middleware de Sécurité

### Fichier: `middleware/security.js`

#### Structure du Middleware

```javascript
const security = require('./middleware/security');

// Exports disponibles:
security.generalLimiter      // Rate limiter général
security.strictLimiter       // Rate limiter strict
security.uploadLimiter       // Rate limiter pour uploads
security.authLimiter         // Rate limiter auth
security.cors                // CORS middleware configuré
security.helmet              // Helmet middleware configuré
security.ipWhitelist()       // Fonction IP whitelisting
security.requestSizeLimiter()// Fonction size limiting
security.requestLogger       // Logger middleware
security.validateApiKey      // Validation API key
security.sanitizeInput       // Sanitization XSS
```

---

## ⏱️ Rate Limiting

### 1. General Limiter (Toutes les routes API)

**Application:** `/api/*` (toutes les routes API)

```javascript
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 100,                   // 100 requêtes max
```

**Exemple de réponse:**
```json
{
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests from this IP, please try again later.",
    "retryAfter": "15 minutes"
  }
}
```

**Headers de réponse:**
- `RateLimit-Limit: 100`
- `RateLimit-Remaining: 75`
- `RateLimit-Reset: 1637251200`

---

### 2. Auth Limiter (Authentification)

**Application:** `/api/auth/login`, `/api/auth/register`

```javascript
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 5,                     // 5 tentatives max
skipSuccessfulRequests: true // Ne compte que les échecs
```

**Protection contre:**
- Brute force attacks sur login
- Account enumeration
- Password spraying

---

### 3. Upload Limiter (Documents)

**Application:**
- `/api/transport-orders/:orderId/documents`
- `/api/transport-orders/tracking/document-upload/:token`

```javascript
windowMs: 60 * 60 * 1000,  // 1 heure
max: 10,                    // 10 uploads max
```

**Protection contre:**
- Flood d'uploads
- Storage exhaustion attacks
- DoS via uploads massifs

---

### 4. Strict Limiter (Routes sensibles)

**Application:** Routes admin et opérations critiques

```javascript
windowMs: 15 * 60 * 1000,  // 15 minutes
max: 20,                    // 20 requêtes max
```

**Utilisation:**
```javascript
// Dans les routes:
router.delete('/admin/users/:id', security.strictLimiter, async (req, res) => {
  // Code sensible
});
```

---

### Configuration Rate Limiting

**Variables d'environnement (.env):**

```bash
# Rate limit window (en millisecondes)
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes

# Max requêtes par fenêtre
RATE_LIMIT_MAX_REQUESTS=100
```

**Personnalisation par route:**

```javascript
const customLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 heure
  max: 50,                    // 50 requêtes
  message: {
    error: {
      code: 'CUSTOM_LIMIT',
      message: 'Limite personnalisée atteinte'
    }
  }
});

app.use('/api/custom-route', customLimiter);
```

---

## 🌐 CORS Configuration

### Configuration Dynamique

**Fichier:** `middleware/security.js` (lignes 105-144)

```javascript
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://yourdomain.com',
          'https://app.yourdomain.com'
        ];

    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'Accept'
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset'
  ],
  maxAge: 86400  // 24 heures
};
```

### Variables d'Environnement

```bash
# .env
# Liste séparée par des virgules
CORS_ORIGIN=http://localhost:3000,https://app.symphonia.com,https://dashboard.symphonia.com

# Autoriser credentials (cookies, headers auth)
CORS_CREDENTIALS=true
```

### Exemples de Configuration

#### Développement
```bash
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

#### Production
```bash
CORS_ORIGIN=https://app.symphonia.com,https://dashboard.symphonia.com,https://mobile.symphonia.com
```

#### Autoriser tous (⚠️ Non recommandé)
```bash
CORS_ORIGIN=*
```

---

## 🪖 Helmet Security Headers

### Configuration

**Fichier:** `middleware/security.js` (lignes 153-179)

### Headers Configurés

#### 1. Content Security Policy (CSP)

```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  }
}
```

**Protection:** XSS, injection de code malicieux

---

#### 2. HTTP Strict Transport Security (HSTS)

```javascript
hsts: {
  maxAge: 31536000,        // 1 an
  includeSubDomains: true,
  preload: true
}
```

**Protection:** Force HTTPS, empêche downgrade attacks

---

#### 3. X-Frame-Options

```javascript
frameguard: { action: 'deny' }
```

**Protection:** Clickjacking attacks

---

#### 4. X-Content-Type-Options

```javascript
noSniff: true
```

**Protection:** MIME type sniffing attacks

---

#### 5. X-XSS-Protection

```javascript
xssFilter: true
```

**Protection:** Cross-site scripting (legacy browsers)

---

#### 6. Referrer-Policy

```javascript
referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
```

**Protection:** Fuite d'informations via Referrer header

---

#### 7. Hide Powered-By

```javascript
hidePoweredBy: true
```

**Protection:** Masque `X-Powered-By: Express` (obscurité)

---

#### 8. DNS Prefetch Control

```javascript
dnsPrefetchControl: { allow: false }
```

**Protection:** Empêche DNS prefetching non autorisé

---

#### 9. IE No Open

```javascript
ieNoOpen: true
```

**Protection:** Force download de fichiers (Internet Explorer)

---

### Vérification des Headers

**Commande:**
```bash
curl -I https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health
```

**Résultat attendu:**
```
HTTP/1.1 200 OK
X-DNS-Prefetch-Control: off
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Download-Options: noopen
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
```

---

## 🧹 Input Sanitization

### Protection XSS

**Fichier:** `middleware/security.js` (lignes 313-355)

#### Fonction `sanitizeInput`

Appliqué automatiquement à tous les endpoints:
- `req.body`
- `req.query`
- `req.params` (non implémenté par défaut)

#### Sanitization Appliquée

```javascript
// Supprime:
- <script>...</script>           // Balises script
- <iframe>...</iframe>           // Balises iframe
- javascript:...                 // Protocole javascript:
- on[event]="..."               // Event handlers (onclick, onload, etc.)

// Préserve:
- Texte normal
- HTML sécurisé (à valider manuellement)
- Objets et tableaux (récursif)
```

#### Exemple

**Avant sanitization:**
```json
{
  "name": "<script>alert('XSS')</script>John Doe",
  "email": "john@example.com",
  "bio": "Hello <iframe src='evil.com'></iframe> world"
}
```

**Après sanitization:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "bio": "Hello  world"
}
```

---

## 🔧 Autres Middlewares

### 1. IP Whitelisting (Optionnel)

**Usage:**
```javascript
const allowedIPs = ['192.168.1.100', '10.0.0.5'];

app.use('/api/admin', security.ipWhitelist(allowedIPs));
```

**Configuration:**
- Détection IP via: `X-Forwarded-For`, `X-Real-IP`, `remoteAddress`
- Logs des IPs bloquées
- Réponse 403 Forbidden si IP non autorisée

---

### 2. Request Size Limiter

**Usage:**
```javascript
// Limite les requêtes à 5MB
app.use(security.requestSizeLimiter('5'));
```

**Configuration actuelle:**
```javascript
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

---

### 3. Request Logger

**Fichier:** `middleware/security.js` (lignes 252-268)

**Logs:**
- Timestamp ISO 8601
- Méthode HTTP
- Path
- Status code
- Durée de traitement

**Exemple:**
```
[2025-11-26T10:30:45.123Z] POST /api/transport-orders
[2025-11-26T10:30:45.234Z] POST /api/transport-orders - 201 - 111ms
```

---

### 4. API Key Validation (Optionnel)

**Usage:**
```javascript
// Appliqué à une route
app.get('/api/protected', security.validateApiKey, (req, res) => {
  res.json({ message: 'Protected data' });
});
```

**Configuration (.env):**
```bash
# Clés séparées par des virgules
API_KEYS=key1-xxxxxxxx,key2-yyyyyyyy,key3-zzzzzzzz
```

**Génération de clés:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Header requis:**
```bash
curl -H "X-API-Key: key1-xxxxxxxx" https://api.example.com/api/protected
```

---

## ⚙️ Configuration des Variables

### Fichier: `.env`

```bash
# =============================================================================
# RATE LIMITING CONFIGURATION
# =============================================================================

RATE_LIMIT_WINDOW_MS=900000        # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100        # 100 requêtes

# =============================================================================
# CORS CONFIGURATION
# =============================================================================

CORS_ORIGIN=http://localhost:3000,https://app.symphonia.com
CORS_CREDENTIALS=true

# =============================================================================
# API KEYS (Optionnel)
# =============================================================================

API_KEYS=key1-abc123,key2-def456

# =============================================================================
# SECURITY TRACKING
# =============================================================================

SECRET_KEY=your-secret-key-change-this
TRACKING_TOKEN_EXPIRES_IN=86400    # 24 heures
```

### Configuration AWS Elastic Beanstalk

**Via Console AWS:**

1. Aller dans: **Configuration → Software → Environment Properties**
2. Ajouter les variables:

| **Clé** | **Valeur** | **Description** |
|---------|------------|-----------------|
| `RATE_LIMIT_WINDOW_MS` | `900000` | Fenêtre rate limiting (15min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requêtes par fenêtre |
| `CORS_ORIGIN` | `https://app.symphonia.com,https://dashboard.symphonia.com` | Origines CORS autorisées |
| `CORS_CREDENTIALS` | `true` | Autoriser credentials |
| `API_KEYS` | `key1,key2` | Clés API (optionnel) |

**Via AWS CLI:**

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=RATE_LIMIT_MAX_REQUESTS,Value="100" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=CORS_ORIGIN,Value="https://app.symphonia.com" \
  --region eu-central-1
```

**Via Script:**

```bash
cd scripts
chmod +x configure-aws-services.sh
./configure-aws-services.sh
```

---

## 🧪 Tests de Sécurité

### 1. Test Rate Limiting

**Script de test:**
```bash
# test-rate-limit.sh
for i in {1..110}; do
  echo "Request $i"
  curl -s https://api.example.com/api/transport-orders | jq -r '.error.code'
  sleep 0.1
done
```

**Résultat attendu:**
- Requêtes 1-100: Succès (200 OK)
- Requêtes 101+: `TOO_MANY_REQUESTS` (429)

---

### 2. Test CORS

**Script de test:**
```bash
# Test origine autorisée
curl -H "Origin: https://app.symphonia.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://api.example.com/api/transport-orders

# Test origine non autorisée
curl -H "Origin: https://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://api.example.com/api/transport-orders
```

**Résultat attendu:**
- Origine autorisée: Headers `Access-Control-Allow-Origin` présent
- Origine non autorisée: Erreur CORS

---

### 3. Test Input Sanitization

**Script de test:**
```bash
curl -X POST https://api.example.com/api/test \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<script>alert(\"XSS\")</script>Test",
    "email": "test@example.com"
  }'
```

**Résultat attendu:**
```json
{
  "name": "Test",
  "email": "test@example.com"
}
```

---

### 4. Test Helmet Headers

**Script de test:**
```bash
curl -I https://api.example.com/health | grep -E "(X-Frame-Options|Strict-Transport-Security|X-Content-Type-Options)"
```

**Résultat attendu:**
```
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
```

---

### 5. Test API Key Validation

**Script de test:**
```bash
# Sans clé API
curl https://api.example.com/api/protected

# Avec clé API invalide
curl -H "X-API-Key: invalid-key" \
     https://api.example.com/api/protected

# Avec clé API valide
curl -H "X-API-Key: key1-xxxxxxxx" \
     https://api.example.com/api/protected
```

**Résultat attendu:**
- Sans clé: 401 `API_KEY_MISSING`
- Clé invalide: 401 `API_KEY_INVALID`
- Clé valide: 200 OK

---

## 🚀 Recommandations Production

### ✅ Configuration Sécurisée

1. **Rate Limiting:**
   - Ajuster les limites selon le traffic réel
   - Monitorer les 429 errors dans CloudWatch
   - Créer des limites personnalisées par client

2. **CORS:**
   - ⚠️ **NE JAMAIS utiliser `*` en production**
   - Lister explicitement tous les domaines autorisés
   - Vérifier les sous-domaines

3. **API Keys:**
   - Générer des clés fortes (32+ caractères)
   - Stocker dans AWS Secrets Manager
   - Rotation régulière (tous les 90 jours)

4. **Secrets:**
   - Générer avec: `openssl rand -base64 64`
   - Ne jamais commit dans Git
   - Utiliser AWS Secrets Manager ou Parameter Store

---

### 🔍 Monitoring

#### CloudWatch Logs

```javascript
// À ajouter dans index.js
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatchLogs();

// Log toutes les requêtes bloquées par rate limiting
app.use((req, res, next) => {
  if (res.statusCode === 429) {
    console.error({
      event: 'RATE_LIMIT_EXCEEDED',
      ip: req.ip,
      path: req.path,
      timestamp: new Date().toISOString()
    });
  }
  next();
});
```

#### Métriques à Surveiller

| **Métrique** | **Seuil** | **Action** |
|--------------|-----------|------------|
| Requêtes 429 (Rate Limited) | > 100/hour | Investiguer IP source |
| Requêtes 403 (CORS) | > 50/hour | Vérifier origines frontend |
| Tentatives login échouées | > 10/hour/IP | Bloquer IP temporairement |
| Uploads > 10MB | > 5/hour | Vérifier client |

---

### 🔒 Sécurité Avancée

#### 1. Web Application Firewall (WAF)

```bash
# Configurer AWS WAF devant Elastic Beanstalk
aws wafv2 create-web-acl \
  --name symphonia-waf \
  --scope REGIONAL \
  --default-action Allow={} \
  --rules file://waf-rules.json
```

#### 2. IP Blocking Automatique

```javascript
// À implémenter dans middleware/security.js
const blockedIPs = new Set();

function autoBlockIP(ip, duration = 3600000) {
  blockedIPs.add(ip);
  setTimeout(() => blockedIPs.delete(ip), duration);
  console.warn(`IP ${ip} blocked for ${duration}ms`);
}

// Dans rate limiter:
onLimitReached: (req, res, options) => {
  autoBlockIP(req.ip);
}
```

#### 3. JWT Refresh Token Rotation

```javascript
// Rotation automatique des refresh tokens
// À implémenter dans auth-routes.js
const revokedTokens = new Set();

function revokeToken(token) {
  revokedTokens.add(token);
  // Stocker dans Redis pour persistence
}
```

---

### 📊 Audit de Sécurité

#### Outils Recommandés

1. **OWASP ZAP** - Test de pénétration automatisé
   ```bash
   docker run -t owasp/zap2docker-stable zap-baseline.py \
     -t https://api.example.com
   ```

2. **npm audit** - Vulnérabilités dépendances
   ```bash
   npm audit
   npm audit fix
   ```

3. **Snyk** - Scan sécurité continu
   ```bash
   npm install -g snyk
   snyk test
   ```

4. **SSL Labs** - Test SSL/TLS
   ```
   https://www.ssllabs.com/ssltest/analyze.html?d=api.example.com
   ```

---

### 📝 Checklist Déploiement

Avant chaque déploiement production:

- [ ] Secrets générés avec `openssl rand -base64 64`
- [ ] Variables d'environnement configurées dans AWS EB
- [ ] CORS configuré avec domaines spécifiques (pas de `*`)
- [ ] Rate limits ajustés selon le traffic
- [ ] Helmet headers configurés
- [ ] Input sanitization active
- [ ] Logs CloudWatch configurés
- [ ] Alertes CloudWatch créées (CPU, erreurs, 429)
- [ ] API Keys générées et stockées dans Secrets Manager
- [ ] Tests de sécurité exécutés (rate limit, CORS, XSS)
- [ ] Documentation à jour
- [ ] Backup MongoDB configuré
- [ ] SSL/TLS activé (HTTPS only)
- [ ] WAF configuré (optionnel)

---

## 📚 Ressources

### Documentation

- **Express Rate Limit:** https://www.npmjs.com/package/express-rate-limit
- **Helmet:** https://helmetjs.github.io/
- **CORS:** https://www.npmjs.com/package/cors
- **OWASP Top 10:** https://owasp.org/www-project-top-ten/

### Scripts Utiles

#### Générer Secret Key
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Générer API Key
```bash
node -e "console.log('api-' + require('crypto').randomBytes(32).toString('hex'))"
```

#### Test Load (Apache Bench)
```bash
ab -n 1000 -c 10 https://api.example.com/health
```

#### Test CORS
```bash
curl -H "Origin: https://app.symphonia.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://api.example.com/api/transport-orders -v
```

---

## 🤝 Support

Pour toute question sur la configuration de sécurité:

- **Documentation:** [INDEX_DOCUMENTATION.md](INDEX_DOCUMENTATION.md)
- **Issues GitHub:** https://github.com/rt-technologie/symphonia/issues
- **Email:** security@rt-technologie.com

---

**Dernière mise à jour:** 26 novembre 2025

🤖 Generated with [Claude Code](https://claude.com/claude-code)
