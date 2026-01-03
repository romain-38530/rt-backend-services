# CAHIER DES CHARGES - CONFORMITÉ 100%
## SYMPHONI.A Control Tower - RT Technologie

**Version:** 1.0.0
**Date:** 2 Janvier 2026
**Classification:** Confidentiel
**Auteur:** Audit Automatisé Claude Opus 4.5

---

## TABLE DES MATIÈRES

1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Module 1: Conformité RGPD](#2-module-1-conformité-rgpd)
3. [Module 2: Sécurité Authentification](#3-module-2-sécurité-authentification)
4. [Module 3: Infrastructure & Scalabilité](#4-module-3-infrastructure--scalabilité)
5. [Module 4: Conformité Réglementaire Transport](#5-module-4-conformité-réglementaire-transport)
6. [Module 5: Qualité du Code](#6-module-5-qualité-du-code)
7. [Module 6: Tests & Couverture](#7-module-6-tests--couverture)
8. [Module 7: Documentation](#8-module-7-documentation)
9. [Planning de Réalisation](#9-planning-de-réalisation)
10. [Budget Estimatif](#10-budget-estimatif)
11. [Critères d'Acceptation](#11-critères-dacceptation)

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte

Suite à l'audit complet de la plateforme SYMPHONI.A Control Tower réalisé le 2 janvier 2026, plusieurs axes d'amélioration ont été identifiés pour atteindre un niveau de conformité permettant une commercialisation sereine.

### 1.2 Scores Actuels vs Objectifs

| Domaine | Score Actuel | Objectif | Écart |
|---------|--------------|----------|-------|
| Conformité RGPD | 52/100 | 95/100 | +43 |
| Sécurité Auth | 76/100 | 95/100 | +19 |
| Infrastructure | 78/100 | 95/100 | +17 |
| Conformité Transport | 78/100 | 95/100 | +17 |
| Qualité Code | 72/100 | 90/100 | +18 |
| Tests | 45/100 | 85/100 | +40 |
| Documentation | 65/100 | 90/100 | +25 |
| **GLOBAL** | **73/100** | **95/100** | **+22** |

### 1.3 Objectifs

- Atteindre un score global de **95/100** minimum
- Éliminer tous les points bloquants critiques
- Permettre une commercialisation sans risque juridique
- Supporter **5000+ utilisateurs simultanés**
- Garantir une disponibilité de **99.9%**

---

## 2. MODULE 1: CONFORMITÉ RGPD

**Score actuel:** 52/100
**Score cible:** 95/100
**Priorité:** 🔴 CRITIQUE
**Délai:** 30 jours

### 2.1 Droit à l'Effacement (Article 17 RGPD)

#### 2.1.1 Endpoint de Suppression Utilisateur

**Fichier à créer:** `gdpr-routes.js`

```javascript
// Spécification de l'endpoint
POST /api/gdpr/users/:userId/delete-request
DELETE /api/gdpr/users/:userId/data
```

**Fonctionnalités requises:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| RGPD-001 | Demande de suppression avec vérification identité (2FA) | Critique |
| RGPD-002 | Délai de rétractation de 7 jours avant suppression effective | Critique |
| RGPD-003 | Anonymisation des données liées (commandes, factures) | Critique |
| RGPD-004 | Suppression physique des données personnelles | Critique |
| RGPD-005 | Conservation données fiscales anonymisées (10 ans) | Critique |
| RGPD-006 | Notification par email de la suppression effective | Haute |
| RGPD-007 | Journal d'audit des suppressions | Haute |

**Données à supprimer par collection:**

```yaml
users:
  - email → anonymiser: "deleted_[hash]@anonymized.local"
  - phone → supprimer
  - firstName, lastName → anonymiser: "Utilisateur Supprimé"
  - address → supprimer
  - passwordHash → supprimer
  - twoFactorSecret → supprimer

carriers:
  - contact.email → anonymiser
  - contact.phone → supprimer
  - contact.name → anonymiser
  - bankDetails → supprimer

logisticians:
  - email → anonymiser
  - phone → supprimer
  - contacts[].* → anonymiser
  - bankDetails → supprimer

transport_orders:
  - driverPhone → supprimer
  - driverEmail → supprimer
  - driverName → anonymiser
  - consignee.contact → anonymiser
  - sender.contact → anonymiser

ecmr:
  - signatures[].signerEmail → anonymiser
  - signatures[].signerName → anonymiser
  - sender.email → anonymiser
  - consignee.email → anonymiser

chatbot_conversations:
  - supprimer intégralement après 1 an
  - ou anonymiser userId

tracking_positions:
  - supprimer après 30 jours (déjà implémenté)
```

**Critères d'acceptation:**
- [ ] L'utilisateur peut demander la suppression de ses données
- [ ] La suppression est effective sous 30 jours maximum
- [ ] Les données fiscales sont conservées anonymisées
- [ ] Un email de confirmation est envoyé
- [ ] Le journal d'audit trace toutes les opérations

---

### 2.2 Droit à la Portabilité (Article 20 RGPD)

#### 2.2.1 Endpoint d'Export des Données

**Fichier à créer:** `gdpr-routes.js`

```javascript
// Spécification de l'endpoint
GET /api/gdpr/users/:userId/export
GET /api/gdpr/users/:userId/export/status/:requestId
GET /api/gdpr/users/:userId/export/download/:requestId
```

**Fonctionnalités requises:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| PORT-001 | Export JSON structuré de toutes les données personnelles | Critique |
| PORT-002 | Export CSV optionnel | Haute |
| PORT-003 | Génération asynchrone avec notification email | Haute |
| PORT-004 | Lien de téléchargement sécurisé (24h validité) | Critique |
| PORT-005 | Limite de 1 export par semaine par utilisateur | Moyenne |
| PORT-006 | Compression ZIP des données | Moyenne |

**Structure de l'export JSON:**

```json
{
  "exportDate": "2026-01-02T10:00:00Z",
  "dataController": {
    "name": "RT Technologie - SYMPHONI.A",
    "address": "...",
    "dpo": "dpo@symphonia-controltower.com"
  },
  "userData": {
    "profile": { ... },
    "preferences": { ... },
    "consents": [ ... ]
  },
  "activityData": {
    "transportOrders": [ ... ],
    "ecmrs": [ ... ],
    "invoices": [ ... ],
    "chatbotConversations": [ ... ]
  },
  "trackingData": {
    "positions": [ ... ],
    "geofenceEvents": [ ... ]
  }
}
```

---

### 2.3 Gestion du Consentement (Article 7 RGPD)

#### 2.3.1 Système de Consentement

**Fichier à créer:** `consent-service.js`, `consent-routes.js`

**Modèle de données:**

```javascript
// consent-models.js
const ConsentType = {
  TERMS_OF_SERVICE: 'terms_of_service',      // CGU - Obligatoire
  PRIVACY_POLICY: 'privacy_policy',           // Politique confidentialité - Obligatoire
  MARKETING_EMAIL: 'marketing_email',         // Emails marketing - Optionnel
  MARKETING_SMS: 'marketing_sms',             // SMS marketing - Optionnel
  ANALYTICS: 'analytics',                     // Analytics/Cookies - Optionnel
  THIRD_PARTY_SHARING: 'third_party_sharing', // Partage tiers - Optionnel
  GPS_TRACKING: 'gps_tracking',               // Tracking GPS - Requis pour service
  DATA_PROCESSING: 'data_processing'          // Traitement données - Obligatoire
};

const consentSchema = {
  _id: ObjectId,
  userId: ObjectId,
  consentType: String,          // Enum ConsentType
  granted: Boolean,
  version: String,              // Version des CGU/Politique
  grantedAt: Date,
  revokedAt: Date,
  ipAddress: String,
  userAgent: String,
  source: String,               // 'registration', 'settings', 'prompt'
  history: [{
    action: String,             // 'granted', 'revoked'
    timestamp: Date,
    ipAddress: String
  }]
};
```

**Endpoints:**

```javascript
GET    /api/consent/types                    // Liste des types de consentement
GET    /api/consent/user/:userId             // Consentements d'un utilisateur
POST   /api/consent/user/:userId/grant       // Accorder un consentement
POST   /api/consent/user/:userId/revoke      // Révoquer un consentement
POST   /api/consent/user/:userId/bulk        // Mise à jour groupée
GET    /api/consent/versions                 // Versions CGU/Politique
```

**Fonctionnalités requises:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| CONS-001 | Collecte consentement à l'inscription (CGU, Politique) | Critique |
| CONS-002 | Interface de gestion des consentements | Critique |
| CONS-003 | Historique horodaté de chaque consentement | Critique |
| CONS-004 | Versioning des documents légaux | Haute |
| CONS-005 | Re-demande de consentement si version change | Haute |
| CONS-006 | Preuve de consentement exportable | Haute |
| CONS-007 | Consentement GPS explicite avant tracking | Critique |

---

### 2.4 Sanitization des Logs

#### 2.4.1 Service de Log Sécurisé

**Fichier à créer:** `secure-logger.js`

**Fonctionnalités requises:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| LOG-001 | Masquage automatique des emails (a]**@b**.com) | Critique |
| LOG-002 | Masquage des numéros de téléphone (****1234) | Critique |
| LOG-003 | Suppression des tokens/passwords des logs | Critique |
| LOG-004 | Masquage SIRET/SIREN (***456789) | Haute |
| LOG-005 | Masquage adresses IP partielles (192.168.*.*)| Moyenne |
| LOG-006 | Rotation des logs (30 jours max) | Haute |

**Patterns à masquer:**

```javascript
const PII_PATTERNS = {
  email: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  siret: /\d{14}/g,
  siren: /\d{9}/g,
  iban: /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}/g,
  creditCard: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
  jwt: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/]*/g,
  password: /"password"\s*:\s*"[^"]+"/gi,
  apiKey: /(sk_|pk_|api_key|apikey|secret)[A-Za-z0-9_-]+/gi
};
```

---

### 2.5 Politique de Rétention des Données

#### 2.5.1 Configuration des Durées de Rétention

**Fichier à créer:** `data-retention-policy.js`

```javascript
const RETENTION_POLICY = {
  // Données opérationnelles
  tracking_positions: {
    duration: 30,
    unit: 'days',
    action: 'delete'
  },

  // Données de session
  sessions: {
    duration: 24,
    unit: 'hours',
    action: 'delete'
  },

  // OTP et codes temporaires
  email_verifications: {
    duration: 24,
    unit: 'hours',
    action: 'delete'
  },

  // Tokens révoqués
  revoked_tokens: {
    duration: 7,
    unit: 'days',
    action: 'delete'
  },

  // Conversations chatbot
  chatbot_conversations: {
    duration: 1,
    unit: 'years',
    action: 'anonymize'
  },

  // Commandes de transport
  transport_orders: {
    duration: 5,
    unit: 'years',
    action: 'anonymize'
  },

  // Documents fiscaux (factures)
  invoices: {
    duration: 10,
    unit: 'years',
    action: 'archive'
  },

  // e-CMR
  ecmr: {
    duration: 10,
    unit: 'years',
    action: 'archive'
  },

  // Logs d'audit
  audit_logs: {
    duration: 5,
    unit: 'years',
    action: 'archive'
  },

  // Webhooks deliveries
  webhook_deliveries: {
    duration: 30,
    unit: 'days',
    action: 'delete'
  }
};
```

**Scheduled Job de Rétention:**

```javascript
// À ajouter dans scheduled-jobs.js
async function runDataRetentionPolicy() {
  // Exécution quotidienne à 3h du matin
  // Parcours de chaque collection
  // Application de la politique appropriée
}
```

---

## 3. MODULE 2: SÉCURITÉ AUTHENTIFICATION

**Score actuel:** 76/100
**Score cible:** 95/100
**Priorité:** 🔴 CRITIQUE
**Délai:** 15 jours

### 3.1 Suppression des Secrets Hardcodés

#### 3.1.1 Fichiers à Corriger

| Fichier | Ligne | Problème | Solution |
|---------|-------|----------|----------|
| `logisticien-routes.js` | 38 | `'symphonia-logisticien-secret-2024'` | Utiliser `JWT_SECRET` env |
| `bundle/auth-middleware.js` | 7-8 | Secrets par défaut | Supprimer le dossier bundle |
| `stripe-routes.js` | 6 | `'sk_test_your_stripe_key'` | Throw si non configuré |

**Code à implémenter:**

```javascript
// Pattern de validation des secrets (à ajouter dans chaque service)
function validateRequiredEnvVars(vars) {
  const missing = vars.filter(v => !process.env[v]);
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`[SECURITY] Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Appel au démarrage
validateRequiredEnvVars([
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_INVITATION_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'MONGODB_URI'
]);
```

### 3.2 Rotation des Refresh Tokens

#### 3.2.1 Implémentation Token Rotation

**Fichier à modifier:** `auth-routes.js`

**Comportement attendu:**
1. À chaque utilisation d'un refresh token pour obtenir un nouvel access token
2. L'ancien refresh token est invalidé
3. Un nouveau refresh token est généré et retourné
4. Détection des tokens réutilisés (potentielle compromission)

```javascript
// Endpoint /auth/refresh modifié
async function handleRefresh(req, res) {
  const { refreshToken } = req.body;

  // 1. Vérifier le token
  const decoded = verifyRefreshToken(refreshToken);

  // 2. Vérifier si le token a déjà été utilisé (rotation)
  const tokenHash = hashToken(refreshToken);
  const storedToken = await db.collection('refresh_tokens').findOne({
    tokenHash,
    userId: decoded.userId
  });

  if (!storedToken) {
    // Token déjà utilisé ou invalide = possible vol
    // Révoquer TOUS les tokens de l'utilisateur
    await revokeAllUserTokens(decoded.userId);
    return res.status(401).json({
      error: 'TOKEN_REUSE_DETECTED',
      message: 'Session invalidée pour raisons de sécurité'
    });
  }

  // 3. Générer nouveaux tokens
  const newAccessToken = generateAccessToken(decoded);
  const newRefreshToken = generateRefreshToken(decoded);

  // 4. Invalider l'ancien, stocker le nouveau
  await db.collection('refresh_tokens').deleteOne({ _id: storedToken._id });
  await db.collection('refresh_tokens').insertOne({
    userId: decoded.userId,
    tokenHash: hashToken(newRefreshToken),
    familyId: storedToken.familyId, // Pour tracker la chaîne de rotation
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  // 5. Retourner les nouveaux tokens
  return res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  });
}
```

### 3.3 Authentification WebSocket

#### 3.3.1 Validation JWT sur Connexion WS

**Fichier à modifier:** `planning-websocket.js`

```javascript
// Modification du handler de connexion
wss.on('connection', (ws, req) => {
  // Extraire le token de la query string
  const url = new URL(req.url, 'ws://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Authentication required');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256']
    });

    // Attacher les infos utilisateur
    ws.userId = decoded.userId;
    ws.userRole = decoded.role;
    ws.organizationId = decoded.organizationId;

    // Vérifier les permissions pour les rooms
    ws.on('message', (message) => {
      const data = JSON.parse(message);
      if (data.type === 'subscribe') {
        // Vérifier que l'utilisateur a accès à cette room
        if (!canAccessRoom(ws, data.room)) {
          ws.send(JSON.stringify({ error: 'ACCESS_DENIED' }));
          return;
        }
      }
      // ...
    });

  } catch (error) {
    ws.close(4002, 'Invalid token');
    return;
  }
});
```

### 3.4 Limite de Sessions Concurrentes

#### 3.4.1 Configuration

```javascript
const SESSION_CONFIG = {
  maxConcurrentSessions: 5,        // Max 5 sessions par utilisateur
  maxSessionsPerDevice: 1,         // 1 session par device
  sessionTimeout: 30 * 60 * 1000,  // 30 minutes d'inactivité
  forceLogoutOldest: true          // Déconnecter la plus ancienne si max atteint
};
```

**Fonctionnalités:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| SESS-001 | Limite de 5 sessions simultanées | Haute |
| SESS-002 | Liste des sessions actives pour l'utilisateur | Haute |
| SESS-003 | Possibilité de révoquer une session spécifique | Haute |
| SESS-004 | Notification si nouvelle connexion depuis nouveau device | Moyenne |
| SESS-005 | Déconnexion automatique après 30min d'inactivité | Moyenne |

### 3.5 Restriction Création Compte Admin

#### 3.5.1 Modification de l'Endpoint Register

**Fichier à modifier:** `auth-routes.js`

```javascript
// Dans POST /auth/register
if (role === 'admin') {
  // Vérifier que la requête vient d'un admin existant
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(403).json({
      error: 'ADMIN_CREATION_RESTRICTED',
      message: 'Seul un administrateur peut créer un compte admin'
    });
  }

  const creatorToken = authHeader.split(' ')[1];
  const creator = jwt.verify(creatorToken, JWT_SECRET);

  if (creator.role !== 'admin') {
    return res.status(403).json({
      error: 'INSUFFICIENT_PRIVILEGES',
      message: 'Droits insuffisants pour créer un compte admin'
    });
  }
}
```

---

## 4. MODULE 3: INFRASTRUCTURE & SCALABILITÉ

**Score actuel:** 62/100
**Score cible:** 95/100
**Priorité:** 🟠 HAUTE
**Délai:** 45 jours

### 4.1 Auto-Scaling Elastic Beanstalk

#### 4.1.1 Configuration .ebextensions

**Fichier à créer:** `.ebextensions/01-autoscaling.config`

```yaml
option_settings:
  aws:autoscaling:asg:
    MinSize: 2
    MaxSize: 10
    Cooldown: 300

  aws:autoscaling:trigger:
    MeasureName: CPUUtilization
    Statistic: Average
    Unit: Percent
    Period: 1
    EvaluationPeriods: 2
    UpperThreshold: 70
    UpperBreachScaleIncrement: 2
    LowerThreshold: 30
    LowerBreachScaleIncrement: -1

  aws:elasticbeanstalk:environment:
    LoadBalancerType: application
    ServiceRole: aws-elasticbeanstalk-service-role

  aws:elbv2:listener:443:
    Protocol: HTTPS
    SSLCertificateArns: arn:aws:acm:eu-central-1:ACCOUNT_ID:certificate/CERT_ID

  aws:elasticbeanstalk:healthreporting:system:
    SystemType: enhanced

  aws:elasticbeanstalk:cloudwatch:logs:
    StreamLogs: true
    DeleteOnTerminate: false
    RetentionInDays: 30
```

### 4.2 Cache Redis/ElastiCache

#### 4.2.1 Configuration Redis

**Fichier à créer:** `cache-service.js`

```javascript
const Redis = require('ioredis');

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,

  // Cluster mode si nécessaire
  // cluster: process.env.REDIS_CLUSTER === 'true'
});

// Wrapper avec fallback
class CacheService {
  constructor() {
    this.client = redisClient;
    this.defaultTTL = 300; // 5 minutes
  }

  async get(key) {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[Cache] Get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error.message);
      return false;
    }
  }

  async invalidate(pattern) {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      return true;
    } catch (error) {
      console.error('[Cache] Invalidate error:', error.message);
      return false;
    }
  }
}
```

**Données à cacher:**

| Clé | TTL | Description |
|-----|-----|-------------|
| `plans:all` | 1h | Liste des plans Stripe |
| `prices:all` | 1h | Prix Stripe |
| `user:${id}:subscription` | 5min | Abonnement utilisateur |
| `features:${userType}:${planLevel}` | 1h | Features par plan |
| `faq:all` | 1h | FAQ chatbot |
| `knowledge:${category}` | 30min | Base de connaissances |
| `carrier:${id}:score` | 15min | Score transporteur |

### 4.3 WebSocket Multi-Instance (Redis Adapter)

#### 4.3.1 Configuration Socket.io avec Redis

**Fichier à modifier:** `planning-websocket.js`

```javascript
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

async function initializeWebSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(','),
      methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
  });

  // Configuration Redis adapter pour multi-instance
  if (process.env.REDIS_HOST) {
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);

    io.adapter(createAdapter(pubClient, subClient));
    console.log('[WebSocket] Redis adapter configured for multi-instance');
  }

  // Middleware d'authentification
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  return io;
}
```

### 4.4 Migration Scheduled Jobs vers AWS Lambda

#### 4.4.1 Architecture Cible

```
┌─────────────────────────────────────────────────────────┐
│                    EventBridge                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Every 1min  │  │ Every 5min  │  │ Every 1hour │     │
│  │ monitorETA  │  │ checkTimeout│  │ cleanup     │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │            │
└─────────┼────────────────┼────────────────┼────────────┘
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐     ┌──────────┐     ┌──────────┐
    │  Lambda  │     │  Lambda  │     │  Lambda  │
    │ monitor  │     │  check   │     │  cleanup │
    │   ETA    │     │ Timeouts │     │   Jobs   │
    └──────────┘     └──────────┘     └──────────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   MongoDB    │
                    │    Atlas     │
                    └──────────────┘
```

**Fichier à créer:** `lambda/monitor-eta/handler.js`

```javascript
const { MongoClient } = require('mongodb');

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const client = await MongoClient.connect(process.env.MONGODB_URI, {
    maxPoolSize: 1
  });

  cachedDb = client.db();
  return cachedDb;
}

exports.handler = async (event) => {
  const db = await connectToDatabase();

  // Logique de monitoring ETA
  const activeOrders = await db.collection('transport_orders').find({
    status: { $in: ['EN_ROUTE', 'PICKUP', 'TRANSIT'] }
  }).toArray();

  for (const order of activeOrders) {
    // Vérifier ETA, envoyer alertes si nécessaire
    await checkOrderETA(db, order);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      processed: activeOrders.length
    })
  };
};
```

### 4.5 Configuration MongoDB Optimisée

#### 4.5.1 Options de Connexion

**Fichier à modifier:** `index.js`

```javascript
const mongoOptions = {
  // Pool de connexions
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,

  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,

  // Read preference pour scaling lecture
  readPreference: 'secondaryPreferred',

  // Write concern
  w: 'majority',
  wtimeoutMS: 5000,

  // Compression
  compressors: ['zlib'],

  // Retry
  retryWrites: true,
  retryReads: true
};

const mongoClient = new MongoClient(process.env.MONGODB_URI, mongoOptions);
```

#### 4.5.2 Index Additionnels

**Fichier à modifier:** `index.js` (fonction createSecurityIndexes)

```javascript
async function createAllIndexes(db) {
  // Index existants...

  // Nouveaux index pour performance

  // transport_orders
  await db.collection('transport_orders').createIndexes([
    { key: { status: 1, industrialId: 1 }, name: 'status_industrial' },
    { key: { carrierId: 1, status: 1 }, name: 'carrier_status' },
    { key: { createdAt: -1 }, name: 'created_desc' },
    { key: { 'tracking.currentStatus': 1 }, name: 'tracking_status' }
  ]);

  // users
  await db.collection('users').createIndexes([
    { key: { email: 1 }, name: 'email_unique', unique: true },
    { key: { organizationId: 1 }, name: 'organization' },
    { key: { role: 1, isActive: 1 }, name: 'role_active' }
  ]);

  // carriers
  await db.collection('carriers').createIndexes([
    { key: { organizationId: 1, status: 1 }, name: 'org_status' },
    { key: { 'vigilance.overallStatus': 1 }, name: 'vigilance_status' },
    { key: { referenceLevel: 1 }, name: 'reference_level' }
  ]);

  // logisticians
  await db.collection('logisticians').createIndexes([
    { key: { industrielId: 1, status: 1 }, name: 'industrial_status' },
    { key: { email: 1 }, name: 'email' }
  ]);

  // ecmr
  await db.collection('ecmr').createIndexes([
    { key: { transportOrderId: 1 }, name: 'transport_order' },
    { key: { status: 1, createdAt: -1 }, name: 'status_created' }
  ]);

  // chatbot_conversations
  await db.collection('chatbot_conversations').createIndexes([
    { key: { userId: 1, status: 1 }, name: 'user_status' },
    { key: { createdAt: -1 }, name: 'created_desc' },
    { key: { 'ticket.status': 1 }, name: 'ticket_status' }
  ]);

  console.log('[MongoDB] All indexes created');
}
```

---

## 5. MODULE 4: CONFORMITÉ RÉGLEMENTAIRE TRANSPORT

**Score actuel:** 78/100
**Score cible:** 95/100
**Priorité:** 🟠 HAUTE
**Délai:** 60 jours

### 5.1 Module Temps de Conduite (Règlement UE 561/2006)

#### 5.1.1 Service de Contrôle des Temps

**Fichier à créer:** `driving-time-service.js`

**Règles à implémenter:**

| Règle | Description | Action |
|-------|-------------|--------|
| COND-001 | Max 9h conduite/jour (10h 2x/semaine) | Alerte + Blocage |
| COND-002 | Max 56h conduite/semaine | Alerte |
| COND-003 | Max 90h conduite/2 semaines | Alerte |
| COND-004 | Pause 45min après 4h30 conduite | Alerte préventive |
| COND-005 | Repos journalier 11h (9h 3x/semaine) | Alerte |
| COND-006 | Repos hebdomadaire 45h (24h 1x/2 sem) | Alerte |

**Modèle de données:**

```javascript
const drivingTimeSchema = {
  _id: ObjectId,
  driverId: ObjectId,
  carrierId: ObjectId,

  // Temps de la journée en cours
  currentDay: {
    date: Date,
    drivingTime: Number,      // minutes
    breakTime: Number,        // minutes
    lastBreakAt: Date,
    continuousDriving: Number // minutes depuis dernière pause
  },

  // Historique semaine
  weeklyStats: {
    weekStart: Date,
    totalDriving: Number,     // minutes
    totalRest: Number,        // minutes
    extendedDays: Number      // jours à 10h utilisés
  },

  // Historique 2 semaines
  biweeklyStats: {
    periodStart: Date,
    totalDriving: Number
  },

  // Alertes en cours
  alerts: [{
    type: String,             // 'WARNING', 'CRITICAL', 'VIOLATION'
    rule: String,             // 'COND-001', etc.
    message: String,
    createdAt: Date,
    acknowledgedAt: Date
  }],

  // Source des données
  dataSource: String,         // 'manual', 'tachograph', 'gps'

  updatedAt: Date
};
```

**Endpoints:**

```javascript
GET    /api/driving-time/driver/:driverId/status     // Statut temps actuel
GET    /api/driving-time/driver/:driverId/history    // Historique
POST   /api/driving-time/driver/:driverId/record     // Enregistrer activité
GET    /api/driving-time/carrier/:carrierId/alerts   // Alertes transporteur
GET    /api/driving-time/carrier/:carrierId/report   // Rapport conformité
POST   /api/driving-time/tachograph/import           // Import données tacho
```

**Fonctionnalités:**

| Ref | Fonctionnalité | Priorité |
|-----|----------------|----------|
| DRT-001 | Calcul automatique temps conduite depuis GPS | Haute |
| DRT-002 | Alertes préventives (30min avant dépassement) | Critique |
| DRT-003 | Blocage assignation si conducteur en infraction | Critique |
| DRT-004 | Rapport hebdomadaire par conducteur | Haute |
| DRT-005 | Dashboard temps de conduite par flotte | Haute |
| DRT-006 | Import fichiers tachygraphe (.ddd, .v1b) | Moyenne |
| DRT-007 | Export rapport pour inspection | Haute |

### 5.2 Calcul Émissions CO2 (Article L229-25)

#### 5.2.1 Service de Calcul Carbone

**Fichier à créer:** `carbon-footprint-service.js`

**Facteurs d'émission ADEME:**

```javascript
const EMISSION_FACTORS = {
  // gCO2e/t.km - Source ADEME 2024
  road: {
    'articule_40t': 81,         // Ensemble articulé 40t
    'porteur_19t': 124,         // Porteur 19t
    'porteur_12t': 165,         // Porteur 12t
    'vul_3.5t': 289,            // VUL < 3.5t
    'frigorifique': 1.2,        // Multiplicateur frigo
    'euro6': 1.0,               // Norme Euro 6
    'euro5': 1.08,              // Norme Euro 5
    'euro4': 1.15,              // Norme Euro 4
    'electrique': 0.15          // Multiplicateur électrique
  },

  // Facteurs par mode
  modes: {
    'road': 1.0,
    'rail': 0.15,
    'waterway': 0.25,
    'air': 4.5
  }
};

class CarbonFootprintService {
  /**
   * Calculer les émissions CO2 d'un transport
   * @param {Object} params
   * @returns {Object} Émissions calculées
   */
  calculateEmissions(params) {
    const {
      weight,           // tonnes
      distance,         // km
      vehicleType,      // 'articule_40t', etc.
      euroNorm,         // 'euro6', etc.
      isFrigorific,
      isElectric,
      transportMode
    } = params;

    // Facteur de base
    let factor = EMISSION_FACTORS.road[vehicleType] || 100;

    // Ajustement norme Euro
    factor *= EMISSION_FACTORS.road[euroNorm] || 1.0;

    // Ajustement frigo
    if (isFrigorific) {
      factor *= EMISSION_FACTORS.road.frigorifique;
    }

    // Ajustement électrique
    if (isElectric) {
      factor *= EMISSION_FACTORS.road.electrique;
    }

    // Ajustement mode
    factor *= EMISSION_FACTORS.modes[transportMode] || 1.0;

    // Calcul émissions (gCO2e)
    const emissions = weight * distance * factor;

    return {
      emissions: Math.round(emissions),          // gCO2e
      emissionsKg: Math.round(emissions / 1000), // kgCO2e
      factor: factor,
      formula: `${weight}t × ${distance}km × ${factor}gCO2e/t.km`,
      source: 'ADEME Base Carbone 2024'
    };
  }

  /**
   * Générer le rapport CO2 mensuel
   */
  async generateMonthlyReport(organizationId, month, year) {
    // ...
  }
}
```

**Intégration dans les documents:**

```javascript
// Ajout dans ecmr-pdf.js et factures
const carbonData = carbonService.calculateEmissions({
  weight: order.weight,
  distance: order.distance,
  vehicleType: carrier.vehicleType,
  // ...
});

// Mention obligatoire sur CMR/Facture:
// "Émissions CO2: XX kg CO2e - Source ADEME Base Carbone"
```

### 5.3 Intégration Registre National Transporteurs

#### 5.3.1 Vérification Automatique

**Fichier à créer:** `registre-transporteurs-service.js`

```javascript
// API RENT (Registre Électronique National des Transporteurs)
// Note: Nécessite convention avec le ministère des transports

class RegistreTransporteursService {
  constructor() {
    this.baseUrl = process.env.RENT_API_URL;
    this.apiKey = process.env.RENT_API_KEY;
  }

  /**
   * Vérifier l'inscription d'un transporteur
   * @param {string} siret - Numéro SIRET
   * @returns {Object} Informations du registre
   */
  async verifyTransporter(siret) {
    // Appel API RENT
    // Retourne: inscrit, type licence, validité, sanctions
  }

  /**
   * Vérifier la capacité professionnelle
   */
  async verifyProfessionalCapacity(siret) {
    // ...
  }

  /**
   * Récupérer les sanctions administratives
   */
  async getSanctions(siret) {
    // ...
  }
}
```

**Alternative via API Pappers/Infogreffe:**

```javascript
// En attendant accès API RENT, utiliser Pappers
const pappersService = {
  async getCompanyInfo(siret) {
    const response = await axios.get(
      `https://api.pappers.fr/v2/entreprise?siret=${siret}`,
      { headers: { Authorization: `Bearer ${process.env.PAPPERS_API_KEY}` }}
    );
    return response.data;
  },

  async checkTransportLicense(siret) {
    const info = await this.getCompanyInfo(siret);
    // Vérifier code NAF transport (49.41, 49.42, etc.)
    // Vérifier existence et validité
    return {
      hasTransportActivity: info.code_naf?.startsWith('49'),
      companyName: info.denomination,
      status: info.statut_rcs,
      // ...
    };
  }
};
```

### 5.4 Marchandises Dangereuses ADR Complet

#### 5.4.1 Base de Données ONU

**Fichier à créer:** `adr-database.js`

```javascript
// Base de données des numéros ONU (extrait)
const UN_DATABASE = {
  'UN1202': {
    name: 'Gazole',
    class: '3',
    packingGroup: 'III',
    labels: ['3'],
    tunnel: 'D/E',
    specialProvisions: ['640C']
  },
  'UN1203': {
    name: 'Essence',
    class: '3',
    packingGroup: 'II',
    labels: ['3'],
    tunnel: 'D/E',
    specialProvisions: ['640C', '640D']
  },
  // ... 3000+ entrées
};

// Règles d'incompatibilité
const INCOMPATIBILITY_MATRIX = {
  '1': ['3', '4.1', '4.2', '4.3', '5.1', '5.2'],  // Explosifs
  '2.1': ['3', '5.1'],                             // Gaz inflammables
  // ...
};

class ADRService {
  validateUN(unNumber) {
    const data = UN_DATABASE[unNumber];
    if (!data) {
      return { valid: false, error: 'Numéro ONU inconnu' };
    }
    return { valid: true, data };
  }

  checkCompatibility(unNumbers) {
    // Vérifier compatibilités entre marchandises
    const issues = [];
    for (let i = 0; i < unNumbers.length; i++) {
      for (let j = i + 1; j < unNumbers.length; j++) {
        const class1 = UN_DATABASE[unNumbers[i]]?.class;
        const class2 = UN_DATABASE[unNumbers[j]]?.class;

        if (INCOMPATIBILITY_MATRIX[class1]?.includes(class2)) {
          issues.push({
            un1: unNumbers[i],
            un2: unNumbers[j],
            reason: `Incompatibilité classes ${class1} et ${class2}`
          });
        }
      }
    }
    return issues;
  }

  checkDriverCertification(driverId, requiredClasses) {
    // Vérifier que le conducteur a les certifications ADR nécessaires
  }

  generateADRDocuments(order) {
    // Générer les documents de transport ADR obligatoires
  }
}
```

---

## 6. MODULE 5: QUALITÉ DU CODE

**Score actuel:** 72/100
**Score cible:** 90/100
**Priorité:** 🟡 MOYENNE
**Délai:** 45 jours

### 6.1 Réorganisation Structure Projet

#### 6.1.1 Structure Cible

```
services/subscriptions-contracts-eb/
├── src/
│   ├── config/
│   │   ├── database.js
│   │   ├── redis.js
│   │   ├── stripe.js
│   │   └── constants.js
│   │
│   ├── routes/
│   │   ├── index.js              # Router principal
│   │   ├── auth.routes.js
│   │   ├── carriers.routes.js
│   │   ├── logisticians.routes.js
│   │   ├── transport-orders.routes.js
│   │   ├── ecmr.routes.js
│   │   ├── planning.routes.js
│   │   ├── stripe.routes.js
│   │   ├── chatbot.routes.js
│   │   ├── affretia.routes.js
│   │   └── gdpr.routes.js
│   │
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── carrier.service.js
│   │   ├── notification.service.js
│   │   ├── tracking.service.js
│   │   ├── carbon-footprint.service.js
│   │   ├── driving-time.service.js
│   │   ├── gdpr.service.js
│   │   └── ...
│   │
│   ├── models/
│   │   ├── schemas/
│   │   │   ├── user.schema.js
│   │   │   ├── carrier.schema.js
│   │   │   └── ...
│   │   └── index.js
│   │
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   ├── validation.middleware.js
│   │   ├── rate-limiter.middleware.js
│   │   ├── security.middleware.js
│   │   └── error-handler.middleware.js
│   │
│   ├── validators/
│   │   ├── auth.validators.js
│   │   ├── carrier.validators.js
│   │   └── ...
│   │
│   ├── utils/
│   │   ├── logger.js
│   │   ├── helpers.js
│   │   ├── constants.js
│   │   └── errors.js
│   │
│   └── app.js                    # Configuration Express
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   └── utils/
│   ├── integration/
│   │   └── routes/
│   └── e2e/
│
├── lambda/
│   ├── monitor-eta/
│   ├── cleanup-jobs/
│   └── ...
│
├── .ebextensions/
│   ├── 01-autoscaling.config
│   ├── 02-cloudwatch.config
│   └── 03-environment.config
│
├── index.js                      # Point d'entrée
├── package.json
├── jest.config.js
├── .eslintrc.js
├── .prettierrc
└── README.md
```

### 6.2 Configuration ESLint & Prettier

#### 6.2.1 ESLint

**Fichier à créer:** `.eslintrc.js`

```javascript
module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    'plugin:security/recommended',
    'prettier'
  ],
  plugins: ['security'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Sécurité
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-regexp': 'warn',
    'security/detect-unsafe-regex': 'error',
    'security/detect-buffer-noassert': 'error',
    'security/detect-eval-with-expression': 'error',
    'security/detect-no-csrf-before-method-override': 'error',
    'security/detect-possible-timing-attacks': 'warn',

    // Qualité
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-debugger': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'prefer-const': 'error',
    'no-var': 'error',

    // Async
    'require-await': 'error',
    'no-return-await': 'error',
    'no-async-promise-executor': 'error',

    // Complexité
    'complexity': ['warn', 15],
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', 100],
    'max-params': ['warn', 5]
  }
};
```

#### 6.2.2 Prettier

**Fichier à créer:** `.prettierrc`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

### 6.3 Gestion Centralisée des Erreurs

#### 6.3.1 Classes d'Erreurs Personnalisées

**Fichier à créer:** `src/utils/errors.js`

```javascript
class AppError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Non authentifié') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Accès non autorisé') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Ressource') {
    super(`${resource} non trouvé(e)`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter) {
    super('Trop de requêtes', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
  }
}

class InternalError extends AppError {
  constructor(message = 'Erreur interne du serveur') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalError
};
```

#### 6.3.2 Middleware de Gestion d'Erreurs

**Fichier à créer:** `src/middleware/error-handler.middleware.js`

```javascript
const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // Log l'erreur
  logger.error({
    message: err.message,
    code: err.code,
    stack: err.stack,
    requestId: req.id,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Erreur opérationnelle (attendue)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details
      }
    });
  }

  // Erreur Joi validation
  if (err.name === 'ValidationError' && err.isJoi) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Données invalides',
        details: err.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      }
    });
  }

  // Erreur MongoDB
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_KEY',
          message: 'Cette ressource existe déjà'
        }
      });
    }
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token invalide ou expiré'
      }
    });
  }

  // Erreur non gérée (bug)
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction
        ? 'Une erreur interne est survenue'
        : err.message
    }
  });
}

module.exports = errorHandler;
```

### 6.4 Refactorisation Duplication de Code

#### 6.4.1 Helper de Réponses

**Fichier à créer:** `src/utils/response.js`

```javascript
class ResponseHelper {
  static success(res, data = {}, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      data
    });
  }

  static created(res, data = {}) {
    return this.success(res, data, 201);
  }

  static noContent(res) {
    return res.status(204).send();
  }

  static paginated(res, items, pagination) {
    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit)
      }
    });
  }
}

module.exports = ResponseHelper;
```

#### 6.4.2 Wrapper Async Handler

**Fichier à créer:** `src/utils/async-handler.js`

```javascript
/**
 * Wrapper pour les handlers async qui attrape automatiquement les erreurs
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

// Usage:
// router.get('/users', asyncHandler(async (req, res) => {
//   const users = await userService.findAll();
//   return ResponseHelper.success(res, users);
// }));
```

---

## 7. MODULE 6: TESTS & COUVERTURE

**Score actuel:** 45/100
**Score cible:** 85/100
**Priorité:** 🟠 HAUTE
**Délai:** 30 jours

### 7.1 Configuration Jest

**Fichier à créer:** `jest.config.js`

```javascript
module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/config/**',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['./tests/setup.js'],
  testTimeout: 10000,
  verbose: true
};
```

### 7.2 Tests Unitaires Requis

#### 7.2.1 Services

| Service | Fichier Test | Couverture Min |
|---------|--------------|----------------|
| auth.service.js | auth.service.test.js | 90% |
| carrier.service.js | carrier.service.test.js | 85% |
| notification.service.js | notification.service.test.js | 80% |
| gdpr.service.js | gdpr.service.test.js | 95% |
| driving-time.service.js | driving-time.service.test.js | 90% |
| carbon-footprint.service.js | carbon-footprint.service.test.js | 90% |
| consent.service.js | consent.service.test.js | 95% |

#### 7.2.2 Exemple Test Auth Service

**Fichier à créer:** `tests/unit/services/auth.service.test.js`

```javascript
const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const AuthService = require('../../../src/services/auth.service');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('AuthService', () => {
  let authService;
  let mockDb;

  beforeEach(() => {
    mockDb = {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn(),
        insertOne: jest.fn(),
        updateOne: jest.fn(),
        deleteOne: jest.fn()
      })
    };
    authService = new AuthService(mockDb);
  });

  describe('register', () => {
    it('devrait créer un utilisateur avec mot de passe hashé', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      mockDb.collection().findOne.mockResolvedValue(null);
      mockDb.collection().insertOne.mockResolvedValue({ insertedId: 'user123' });

      const result = await authService.register(userData);

      expect(result.success).toBe(true);
      expect(result.user.id).toBe('user123');
      expect(result.user.password).toBeUndefined();
    });

    it('devrait rejeter si email existe déjà', async () => {
      mockDb.collection().findOne.mockResolvedValue({ email: 'test@example.com' });

      await expect(authService.register({ email: 'test@example.com' }))
        .rejects.toThrow('Email déjà utilisé');
    });

    it('devrait rejeter un mot de passe faible', async () => {
      await expect(authService.register({
        email: 'test@example.com',
        password: '123'
      })).rejects.toThrow('Mot de passe trop faible');
    });
  });

  describe('login', () => {
    it('devrait retourner des tokens pour credentials valides', async () => {
      const hashedPassword = await bcrypt.hash('SecurePassword123!', 10);
      mockDb.collection().findOne.mockResolvedValue({
        _id: 'user123',
        email: 'test@example.com',
        password: hashedPassword,
        isActive: true
      });

      const result = await authService.login('test@example.com', 'SecurePassword123!');

      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('devrait rejeter un mot de passe incorrect', async () => {
      mockDb.collection().findOne.mockResolvedValue({
        _id: 'user123',
        email: 'test@example.com',
        password: await bcrypt.hash('CorrectPassword', 10)
      });

      await expect(authService.login('test@example.com', 'WrongPassword'))
        .rejects.toThrow('Identifiants invalides');
    });

    it('devrait bloquer un compte inactif', async () => {
      mockDb.collection().findOne.mockResolvedValue({
        _id: 'user123',
        isActive: false
      });

      await expect(authService.login('test@example.com', 'password'))
        .rejects.toThrow('Compte désactivé');
    });
  });

  describe('refreshToken', () => {
    it('devrait détecter une réutilisation de token', async () => {
      // Test rotation sécurité
      mockDb.collection().findOne.mockResolvedValue(null); // Token déjà utilisé

      await expect(authService.refreshToken('old-token'))
        .rejects.toThrow('TOKEN_REUSE_DETECTED');
    });
  });
});
```

### 7.3 Tests d'Intégration Requis

#### 7.3.1 Routes

| Route | Fichier Test | Scénarios |
|-------|--------------|-----------|
| /api/auth/* | auth.routes.test.js | Register, Login, Refresh, 2FA, Logout |
| /api/carriers/* | carriers.routes.test.js | CRUD, Invitation, Documents |
| /api/gdpr/* | gdpr.routes.test.js | Export, Suppression, Consentement |
| /api/stripe/* | stripe.routes.test.js | Checkout, Webhook, Abonnements |

#### 7.3.2 Exemple Test Routes GDPR

**Fichier à créer:** `tests/integration/routes/gdpr.routes.test.js`

```javascript
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const app = require('../../../src/app');

describe('GDPR Routes', () => {
  let mongoServer;
  let mongoClient;
  let db;
  let userToken;
  let userId;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = await MongoClient.connect(mongoServer.getUri());
    db = mongoClient.db();

    // Créer un utilisateur de test
    const result = await db.collection('users').insertOne({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      // ...
    });
    userId = result.insertedId.toString();
    userToken = generateTestToken(userId);
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  describe('GET /api/gdpr/users/:userId/export', () => {
    it('devrait lancer un export des données', async () => {
      const response = await request(app)
        .get(`/api/gdpr/users/${userId}/export`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.requestId).toBeDefined();
    });

    it('devrait rejeter sans authentification', async () => {
      await request(app)
        .get(`/api/gdpr/users/${userId}/export`)
        .expect(401);
    });

    it('devrait rejeter pour un autre utilisateur', async () => {
      await request(app)
        .get('/api/gdpr/users/other-user-id/export')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('DELETE /api/gdpr/users/:userId/data', () => {
    it('devrait supprimer les données utilisateur', async () => {
      const response = await request(app)
        .delete(`/api/gdpr/users/${userId}/data`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ confirmation: true, reason: 'Test' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Vérifier que les données sont anonymisées
      const user = await db.collection('users').findOne({ _id: userId });
      expect(user.email).toMatch(/^deleted_.*@anonymized\.local$/);
    });

    it('devrait conserver les données fiscales anonymisées', async () => {
      // Vérifier que les factures existent toujours mais anonymisées
      const invoices = await db.collection('invoices').find({ userId }).toArray();
      expect(invoices.length).toBeGreaterThan(0);
      invoices.forEach(invoice => {
        expect(invoice.customerEmail).toMatch(/anonymized/);
      });
    });
  });
});
```

### 7.4 Tests E2E Requis

**Scénarios critiques:**

1. **Parcours inscription complet**
   - Register → Email verification → Login → 2FA → Dashboard

2. **Parcours commande transport**
   - Création commande → Affectation transporteur → Tracking → Livraison → e-CMR

3. **Parcours RGPD**
   - Export données → Téléchargement → Demande suppression → Confirmation

4. **Parcours abonnement Stripe**
   - Sélection plan → Paiement → Activation → Upgrade → Annulation

---

## 8. MODULE 7: DOCUMENTATION

**Score actuel:** 65/100
**Score cible:** 90/100
**Priorité:** 🟡 MOYENNE
**Délai:** 20 jours

### 8.1 Documentation API (OpenAPI/Swagger)

#### 8.1.1 Configuration Swagger

**Fichier à créer:** `src/config/swagger.js`

```javascript
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SYMPHONI.A Control Tower API',
      version: '3.1.0',
      description: 'API TMS complète pour la gestion du transport',
      contact: {
        name: 'RT Technologie',
        email: 'support@symphonia-controltower.com'
      }
    },
    servers: [
      {
        url: 'https://api.symphonia-controltower.com',
        description: 'Production'
      },
      {
        url: 'https://staging-api.symphonia-controltower.com',
        description: 'Staging'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    security: [
      { bearerAuth: [] }
    ]
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerJsdoc(options);
```

#### 8.1.2 Documentation Endpoints

Chaque route doit être documentée avec JSDoc Swagger:

```javascript
/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Authentification utilisateur
 *     tags: [Authentification]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 12
 *     responses:
 *       200:
 *         description: Authentification réussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Identifiants invalides
 *       429:
 *         description: Trop de tentatives
 */
router.post('/login', ...);
```

### 8.2 README Principal

**Fichier à créer:** `README.md`

Structure requise:
- Présentation du projet
- Prérequis
- Installation
- Configuration (variables d'environnement)
- Démarrage (développement, production)
- Architecture
- API Documentation (lien Swagger)
- Tests
- Déploiement
- Contribution
- Licence

### 8.3 Documentation Technique

**Documents à créer:**

| Document | Contenu |
|----------|---------|
| `docs/ARCHITECTURE.md` | Schéma architecture, flux de données |
| `docs/DATABASE.md` | Schémas MongoDB, index, relations |
| `docs/SECURITY.md` | Politique sécurité, authentification |
| `docs/DEPLOYMENT.md` | Guide déploiement AWS |
| `docs/API-CHANGELOG.md` | Historique des versions API |
| `docs/GDPR.md` | Conformité RGPD, procédures |

---

## 9. PLANNING DE RÉALISATION

### 9.1 Vue d'Ensemble

```
Semaine    1    2    3    4    5    6    7    8    9   10   11   12
           |====|====|====|====|====|====|====|====|====|====|====|====|
RGPD       [███████████████████]
Sécurité        [██████████████]
Scalabilité          [████████████████████████████]
Transport                 [█████████████████████████████████]
Qualité                        [██████████████████████]
Tests                               [████████████████████████]
Documentation                            [██████████████]
```

### 9.2 Planning Détaillé

#### Phase 1: Semaines 1-4 (RGPD + Sécurité Critique)

| Semaine | Tâches | Livrables |
|---------|--------|-----------|
| S1 | RGPD-001 à RGPD-007 (Suppression) | Endpoint /gdpr/delete |
| S2 | PORT-001 à PORT-006 (Export) | Endpoint /gdpr/export |
| S2 | Secrets hardcodés | Fichiers corrigés |
| S3 | CONS-001 à CONS-007 (Consentement) | Service consentement |
| S3 | LOG-001 à LOG-006 (Sanitization) | Logger sécurisé |
| S4 | Rotation tokens, Auth WS | Auth améliorée |
| S4 | **Tests Phase 1** | 70% couverture RGPD |

#### Phase 2: Semaines 5-8 (Scalabilité + Transport)

| Semaine | Tâches | Livrables |
|---------|--------|-----------|
| S5 | Auto-scaling EB | .ebextensions |
| S5 | Cache Redis | Service cache |
| S6 | WebSocket multi-instance | Redis adapter |
| S6 | MongoDB optimisation | Index + config |
| S7 | Migration Lambda jobs | Fonctions Lambda |
| S7 | DRT-001 à DRT-007 (Temps conduite) | Service temps conduite |
| S8 | CO2 (Art. L229-25) | Service carbone |
| S8 | **Tests Phase 2** | 80% couverture |

#### Phase 3: Semaines 9-12 (Qualité + Finalisation)

| Semaine | Tâches | Livrables |
|---------|--------|-----------|
| S9 | Réorganisation code | Nouvelle structure |
| S9 | ESLint + Prettier | Config + fix |
| S10 | Gestion erreurs | Middleware + classes |
| S10 | Tests unitaires complets | 85% couverture |
| S11 | Tests intégration | Suite complète |
| S11 | Documentation Swagger | API documentée |
| S12 | Documentation technique | Docs/*.md |
| S12 | **Audit final** | Score 95%+ |

---

## 10. BUDGET ESTIMATIF

### 10.1 Ressources Humaines

| Rôle | Jours | TJM | Total |
|------|-------|-----|-------|
| Développeur Senior Backend | 45 | 600€ | 27 000€ |
| Développeur DevOps | 15 | 650€ | 9 750€ |
| QA Engineer | 20 | 500€ | 10 000€ |
| Tech Writer | 10 | 450€ | 4 500€ |
| **Sous-total RH** | **90** | - | **51 250€** |

### 10.2 Infrastructure

| Service | Coût Mensuel | 3 Mois |
|---------|-------------|--------|
| AWS ElastiCache (Redis) | 150€ | 450€ |
| AWS Lambda (jobs) | 50€ | 150€ |
| AWS ELB (scaling) | 100€ | 300€ |
| MongoDB Atlas upgrade | 200€ | 600€ |
| **Sous-total Infra** | **500€/mois** | **1 500€** |

### 10.3 Services Tiers

| Service | Coût |
|---------|------|
| API Pappers (vérification entreprises) | 500€/an |
| Intégration signature qualifiée (Yousign) | 2 000€ setup |
| Audit sécurité externe | 5 000€ |
| **Sous-total Services** | **7 500€** |

### 10.4 Budget Total

| Catégorie | Montant |
|-----------|---------|
| Ressources Humaines | 51 250€ |
| Infrastructure (3 mois) | 1 500€ |
| Services Tiers | 7 500€ |
| Contingence (10%) | 6 025€ |
| **TOTAL** | **66 275€** |

---

## 11. CRITÈRES D'ACCEPTATION

### 11.1 Critères Fonctionnels

| ID | Critère | Validation |
|----|---------|------------|
| ACC-001 | Export RGPD génère fichier JSON/CSV complet | Test E2E |
| ACC-002 | Suppression anonymise toutes les données PII | Test + Audit manuel |
| ACC-003 | Consentement tracé avec horodatage et IP | Test intégration |
| ACC-004 | Temps de conduite calcule correctement les alertes | Tests unitaires |
| ACC-005 | Émissions CO2 affichées sur CMR et factures | Test visuel |
| ACC-006 | Scaling horizontal fonctionne sans perte de session | Test charge |

### 11.2 Critères de Performance

| ID | Critère | Seuil | Validation |
|----|---------|-------|------------|
| PERF-001 | Temps réponse API p95 | < 200ms | Monitoring |
| PERF-002 | Utilisateurs simultanés | > 2000 | Test charge |
| PERF-003 | Disponibilité | > 99.5% | Monitoring 30j |
| PERF-004 | Temps de scaling | < 5 min | Test |

### 11.3 Critères de Sécurité

| ID | Critère | Validation |
|----|---------|------------|
| SEC-001 | Aucun secret hardcodé | Scan automatisé |
| SEC-002 | Couverture tests sécurité > 90% | Jest coverage |
| SEC-003 | Logs sans PII | Audit logs |
| SEC-004 | Rapport OWASP Top 10 clean | Scan sécurité |

### 11.4 Critères de Qualité

| ID | Critère | Seuil | Validation |
|----|---------|-------|------------|
| QUAL-001 | Couverture tests globale | > 85% | Jest |
| QUAL-002 | ESLint errors | 0 | CI/CD |
| QUAL-003 | Documentation API | 100% endpoints | Swagger |
| QUAL-004 | Score SonarQube | > A | Scan |

---

## ANNEXES

### Annexe A: Checklist de Validation Finale

- [ ] Tous les endpoints RGPD testés et fonctionnels
- [ ] Consentement collecté à chaque inscription
- [ ] Logs sanitizés validés par audit
- [ ] Scaling testé jusqu'à 3000 utilisateurs
- [ ] Documentation Swagger complète et à jour
- [ ] Tests avec couverture > 85%
- [ ] Audit sécurité externe passé
- [ ] Score global > 95/100

### Annexe B: Contacts

| Rôle | Contact |
|------|---------|
| Chef de Projet | projet@rt-technologie.com |
| DPO | dpo@symphonia-controltower.com |
| Support Technique | support@symphonia-controltower.com |
| Urgences Sécurité | security@rt-technologie.com |

---

**Document rédigé le:** 2 Janvier 2026
**Prochaine révision:** 1 Février 2026
**Version:** 1.0.0
