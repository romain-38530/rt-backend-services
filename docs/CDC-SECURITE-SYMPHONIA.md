# CAHIER DES CHARGES - SÉCURISATION SYMPHONI.A

## Projet : Amélioration de la Cybersécurité RT Backend Services
**Version :** 1.0.0
**Date :** 2026-01-01
**Classification :** CONFIDENTIEL
**Responsable :** RT Technologie

---

## TABLE DES MATIÈRES

1. [Contexte et Objectifs](#1-contexte-et-objectifs)
2. [Périmètre du Projet](#2-périmètre-du-projet)
3. [Phase 1 - Corrections Critiques](#3-phase-1---corrections-critiques-immédiat)
4. [Phase 2 - Corrections Hautes](#4-phase-2---corrections-hautes-court-terme)
5. [Phase 3 - Améliorations Moyennes](#5-phase-3---améliorations-moyennes-moyen-terme)
6. [Phase 4 - Durcissement Avancé](#6-phase-4---durcissement-avancé-long-terme)
7. [Spécifications Techniques Détaillées](#7-spécifications-techniques-détaillées)
8. [Critères de Validation](#8-critères-de-validation)
9. [Annexes](#9-annexes)

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte

Suite à l'audit de cybersécurité réalisé le 01/01/2026, plusieurs vulnérabilités ont été identifiées dans la plateforme SYMPHONI.A. Ce cahier des charges définit les travaux nécessaires pour remédier à ces vulnérabilités et renforcer la posture de sécurité globale du système.

### 1.2 Objectifs

| Objectif | Indicateur de Succès |
|----------|---------------------|
| Éliminer les vulnérabilités critiques | 0 vulnérabilité critique restante |
| Sécuriser la gestion des secrets | 100% des secrets dans un gestionnaire sécurisé |
| Renforcer l'authentification | Score OWASP ASVS Level 2 |
| Protéger contre les injections | 100% des entrées validées |
| Améliorer le monitoring sécurité | Détection < 5 minutes |

### 1.3 Score de Sécurité Cible

| État Actuel | Cible Phase 1 | Cible Phase 2 | Cible Finale |
|-------------|---------------|---------------|--------------|
| 4/10 | 6/10 | 7/10 | 8.5/10 |

---

## 2. PÉRIMÈTRE DU PROJET

### 2.1 Services Concernés

```
services/
├── subscriptions-contracts-eb/    [PRIORITÉ 1 - Service principal]
├── authz-eb/                      [PRIORITÉ 1 - Authentification]
├── affret-ia-api-v2/              [PRIORITÉ 2]
├── billing-api/                   [PRIORITÉ 2 - Données sensibles]
├── tracking-api/                  [PRIORITÉ 2]
├── websocket-api/                 [PRIORITÉ 3]
├── notifications-api-v2/          [PRIORITÉ 3]
└── [autres services]              [PRIORITÉ 3]
```

### 2.2 Composants Impactés

- **Authentification** : JWT, sessions, OTP
- **Autorisation** : RBAC, permissions
- **Validation** : Entrées utilisateur, schémas
- **Secrets** : Credentials, API keys, tokens
- **Communication** : CORS, inter-services
- **Logging** : Audit trail, monitoring

---

## 3. PHASE 1 - CORRECTIONS CRITIQUES (Immédiat)

**Durée estimée : 2-3 jours**
**Priorité : CRITIQUE**

### 3.1 SEC-001 : Gestion Sécurisée des Secrets

#### 3.1.1 Description
Implémenter un système centralisé de gestion des secrets avec AWS Secrets Manager.

#### 3.1.2 Spécifications Fonctionnelles

| ID | Exigence | Priorité |
|----|----------|----------|
| SEC-001-01 | Créer un service `secrets-manager.js` pour charger les secrets | CRITIQUE |
| SEC-001-02 | Migrer tous les secrets des fichiers .env vers AWS Secrets Manager | CRITIQUE |
| SEC-001-03 | Implémenter le cache local des secrets (TTL 5 min) | HAUTE |
| SEC-001-04 | Ajouter la rotation automatique des secrets (90 jours) | HAUTE |
| SEC-001-05 | Supprimer tous les fichiers .env contenant des secrets réels | CRITIQUE |

#### 3.1.3 Spécifications Techniques

**Fichier à créer : `packages/security/secrets-manager.js`**

```javascript
// Structure attendue
class SecretsManager {
  constructor(config) {}

  async getSecret(secretName) {}
  async rotateSecret(secretName) {}
  clearCache() {}
}
```

**Secrets à migrer :**
- `MONGODB_URI`
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- `OVH_APP_KEY` / `OVH_APP_SECRET` / `OVH_CONSUMER_KEY`
- `TOMTOM_API_KEY`
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- `SMTP_PASSWORD`
- `TWILIO_AUTH_TOKEN`
- `ANTHROPIC_API_KEY`

#### 3.1.4 Critères d'Acceptation

- [ ] Aucun secret en clair dans le code source
- [ ] Tous les secrets chargés depuis AWS Secrets Manager
- [ ] Fallback gracieux si Secrets Manager indisponible
- [ ] Logs d'accès aux secrets (sans valeurs)
- [ ] Tests unitaires couvrant 90%+ du module

---

### 3.2 SEC-002 : Correction JWT Security

#### 3.2.1 Description
Renforcer la sécurité du système JWT et éliminer les exports de secrets.

#### 3.2.2 Spécifications Fonctionnelles

| ID | Exigence | Priorité |
|----|----------|----------|
| SEC-002-01 | Ne plus exporter JWT_SECRET et JWT_REFRESH_SECRET | CRITIQUE |
| SEC-002-02 | Valider la longueur minimale des secrets (32 caractères) | CRITIQUE |
| SEC-002-03 | Ajouter l'algorithme explicite dans la signature | HAUTE |
| SEC-002-04 | Implémenter la liste noire des tokens révoqués (Redis) | HAUTE |
| SEC-002-05 | Ajouter le fingerprint device dans le token | MOYENNE |

#### 3.2.3 Spécifications Techniques

**Fichier à modifier : `services/subscriptions-contracts-eb/auth-middleware.js`**

```javascript
// AVANT (vulnérable)
module.exports = {
  JWT_SECRET,           // ❌ Export interdit
  JWT_REFRESH_SECRET,   // ❌ Export interdit
  ...
};

// APRÈS (sécurisé)
const JWT_CONFIG = {
  algorithm: 'HS256',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
  issuer: 'symphonia-api',
  audience: 'symphonia-client'
};

function validateSecrets() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters');
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  requireRole,
  optionalAuth,
  // PAS de secrets exportés
};
```

#### 3.2.4 Critères d'Acceptation

- [ ] Aucun secret JWT exporté du module
- [ ] Échec au démarrage si secrets < 32 caractères
- [ ] Algorithm explicitement défini (HS256 ou RS256)
- [ ] Tests de régression sur l'authentification

---

### 3.3 SEC-003 : Correction Bypass CORS

#### 3.3.1 Description
Corriger le bypass CORS qui autorise toutes les origines malgré le blocage.

#### 3.3.2 Spécifications Techniques

**Fichier à modifier : `services/subscriptions-contracts-eb/security-middleware.js`**

```javascript
// AVANT (vulnérable - ligne 126)
console.warn(`CORS blocked request from origin: ${origin}`);
console.warn(); callback(null, true); // ❌ Autorise quand même !

// APRÈS (sécurisé)
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
      : [
          'https://industrie.symphonia-controltower.com',
          'https://transporteur.symphonia-controltower.com'
        ];

    // Autoriser les requêtes sans origin (mobile apps, Postman en dev uniquement)
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin header required'), false);
      }
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`[SECURITY] CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
  maxAge: 86400
};
```

#### 3.3.3 Critères d'Acceptation

- [ ] Les origines non autorisées reçoivent une erreur CORS
- [ ] Les origines autorisées fonctionnent normalement
- [ ] Logs de sécurité pour les tentatives bloquées
- [ ] Tests E2E validant le comportement CORS

---

### 3.4 SEC-004 : Nettoyage Historique Git

#### 3.4.1 Description
Supprimer les secrets de l'historique Git pour éviter toute récupération.

#### 3.4.2 Procédure

```bash
# 1. Installer BFG Repo-Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/

# 2. Créer un fichier avec les patterns à supprimer
cat > secrets-to-remove.txt << EOF
RtAdmin2024
votre-secret-jwt-a-changer-en-production
7467b1935c28b05e
5dd42ebb267e3e2b97bbaa57fc8329e5
67ee183f23f404a43d4fc8504f8648b6
Demo2025Secure
Wq6Dz2OTIP7NOsEPYgQDnYLRTurEkkiu
EOF

# 3. Nettoyer l'historique
bfg --replace-text secrets-to-remove.txt

# 4. Nettoyer et forcer le push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags

# 5. Notifier tous les développeurs de re-cloner le repo
```

#### 3.4.3 Critères d'Acceptation

- [ ] `git log -p | grep -i "password\|secret\|key"` ne retourne rien de sensible
- [ ] Tous les développeurs ont re-cloné le repository
- [ ] Nouveaux secrets générés et déployés

---

### 3.5 SEC-005 : Rotation des Secrets Compromis

#### 3.5.1 Liste des Secrets à Régénérer

| Secret | Service | Action |
|--------|---------|--------|
| MongoDB Password | Atlas | Régénérer via console Atlas |
| JWT_SECRET | Auth | Générer: `openssl rand -base64 48` |
| JWT_REFRESH_SECRET | Auth | Générer: `openssl rand -base64 48` |
| OVH_APP_SECRET | DNS | Régénérer via console OVH |
| OVH_CONSUMER_KEY | DNS | Régénérer via console OVH |
| SMTP_PASSWORD | Email | Réinitialiser via OVH |
| TOMTOM_API_KEY | Tracking | Régénérer via TomTom Developer Portal |
| STRIPE_SECRET_KEY | Paiements | Régénérer via Stripe Dashboard |

#### 3.5.2 Script de Génération

```bash
#!/bin/bash
# generate-new-secrets.sh

echo "=== Génération des nouveaux secrets ==="
echo ""
echo "JWT_SECRET=$(openssl rand -base64 48)"
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 48)"
echo "STRIPE_WEBHOOK_SECRET=whsec_$(openssl rand -hex 32)"
echo ""
echo "=== Secrets à générer manuellement ==="
echo "1. MongoDB: Console Atlas > Database Access > Edit User"
echo "2. OVH: https://api.ovh.com/createToken/"
echo "3. TomTom: https://developer.tomtom.com/user/me/apps"
echo "4. Stripe: https://dashboard.stripe.com/apikeys"
```

---

## 4. PHASE 2 - CORRECTIONS HAUTES (Court terme)

**Durée estimée : 1-2 semaines**
**Priorité : HAUTE**

### 4.1 SEC-006 : Validation des Entrées avec Joi

#### 4.1.1 Description
Implémenter une validation stricte de toutes les entrées utilisateur avec Joi.

#### 4.1.2 Spécifications

**Fichier à créer : `packages/security/validation-schemas.js`**

```javascript
const Joi = require('joi');

// Schémas communs réutilisables
const commonSchemas = {
  email: Joi.string().email().lowercase().trim().max(255),
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .messages({
      'string.pattern.base': 'Password must contain uppercase, lowercase, number and special character'
    }),
  mongoId: Joi.string().pattern(/^[a-f\d]{24}$/i),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
  siret: Joi.string().pattern(/^\d{14}$/),
  siren: Joi.string().pattern(/^\d{9}$/),
  vatNumber: Joi.string().pattern(/^FR\d{11}$/),
  postalCode: Joi.string().pattern(/^\d{5}$/),
};

// Schémas par endpoint
const authSchemas = {
  register: Joi.object({
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    companyName: Joi.string().min(2).max(200).trim(),
    role: Joi.string().valid('carrier', 'industrial').required(),
    metadata: Joi.object().default({})
  }),

  login: Joi.object({
    email: commonSchemas.email.required(),
    password: Joi.string().required() // Pas de validation pattern pour login
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required()
  }),

  verifyOtp: Joi.object({
    email: commonSchemas.email.required(),
    otp: Joi.string().pattern(/^\d{6,8}$/).required()
  })
};

const carrierSchemas = {
  invite: Joi.object({
    email: commonSchemas.email.required(),
    companyName: Joi.string().min(2).max(200).required(),
    siret: commonSchemas.siret,
    phone: commonSchemas.phone
  }),

  onboard: Joi.object({
    legalInfo: Joi.object({
      siret: commonSchemas.siret.required(),
      siren: commonSchemas.siren.required(),
      vatNumber: commonSchemas.vatNumber,
      companyName: Joi.string().required()
    }).required(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      postalCode: commonSchemas.postalCode.required(),
      country: Joi.string().default('France')
    }).required()
  })
};

module.exports = {
  commonSchemas,
  authSchemas,
  carrierSchemas,
  // ... autres schémas
};
```

**Fichier à créer : `packages/security/validation-middleware.js`**

```javascript
const Joi = require('joi');

/**
 * Middleware factory pour validation Joi
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors
        }
      });
    }

    // Remplacer par les données validées et sanitisées
    req[property] = value;
    next();
  };
}

/**
 * Échapper les caractères spéciaux pour MongoDB regex
 */
function escapeRegex(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sanitize MongoDB query pour prévenir NoSQL injection
 */
function sanitizeMongoQuery(query) {
  if (typeof query !== 'object' || query === null) return query;

  const sanitized = {};
  for (const [key, value] of Object.entries(query)) {
    // Bloquer les opérateurs dangereux
    if (key.startsWith('$')) {
      if (!['$and', '$or', '$in', '$nin', '$eq', '$ne', '$gt', '$gte', '$lt', '$lte'].includes(key)) {
        continue; // Ignorer opérateurs non autorisés
      }
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = {
  validate,
  escapeRegex,
  sanitizeMongoQuery
};
```

#### 4.1.3 Application aux Routes

```javascript
// Exemple d'application dans auth-routes.js
const { validate } = require('@rt-packages/security/validation-middleware');
const { authSchemas } = require('@rt-packages/security/validation-schemas');

router.post('/register',
  rateLimitRegister,
  validate(authSchemas.register),  // ← Validation ajoutée
  checkMongoDB,
  async (req, res) => {
    // req.body est maintenant validé et sanitisé
    const { email, password, companyName, role, metadata } = req.body;
    // ...
  }
);
```

#### 4.1.4 Critères d'Acceptation

- [ ] 100% des endpoints POST/PUT/PATCH ont un schéma de validation
- [ ] Les erreurs de validation retournent un format standardisé
- [ ] Les données sont sanitisées avant usage
- [ ] Tests unitaires pour chaque schéma
- [ ] Documentation des schémas (OpenAPI/Swagger)

---

### 4.2 SEC-007 : Protection NoSQL Injection

#### 4.2.1 Description
Sécuriser toutes les requêtes MongoDB contre les injections, notamment les $regex.

#### 4.2.2 Spécifications

**Fichiers à modifier :**
- `services/subscriptions-contracts-eb/chatbot-routes.js`
- `services/subscriptions-contracts-eb/chatbot-service.js`
- `services/subscriptions-contracts-eb/helpbot-service.js`
- `services/subscriptions-contracts-eb/ticketing-service.js`

```javascript
// AVANT (vulnérable)
{ title: { $regex: q, $options: 'i' } }

// APRÈS (sécurisé)
const { escapeRegex } = require('@rt-packages/security/validation-middleware');
{ title: { $regex: escapeRegex(q), $options: 'i' } }
```

#### 4.2.3 Alternative : Utiliser MongoDB Text Search

```javascript
// Créer un index texte
db.collection('knowledge_base').createIndex({
  title: 'text',
  content: 'text'
});

// Utiliser $text au lieu de $regex
const results = await db.collection('knowledge_base').find({
  $text: { $search: sanitizedQuery }
}).toArray();
```

---

### 4.3 SEC-008 : Renforcement Mot de Passe

#### 4.3.1 Spécifications

**Politique de mot de passe :**
- Longueur minimale : **12 caractères** (au lieu de 8)
- Au moins 1 majuscule
- Au moins 1 minuscule
- Au moins 1 chiffre
- Au moins 1 caractère spécial (@$!%*?&)
- Pas de mots de passe courants (liste noire)
- Pas de répétition de l'email/username

**Fichier à créer : `packages/security/password-validator.js`**

```javascript
const commonPasswords = require('./common-passwords.json'); // Top 10000

class PasswordValidator {
  static validate(password, userContext = {}) {
    const errors = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }

    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('This password is too common');
    }

    if (userContext.email && password.toLowerCase().includes(userContext.email.split('@')[0].toLowerCase())) {
      errors.push('Password cannot contain your email');
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength: this.calculateStrength(password)
    };
  }

  static calculateStrength(password) {
    let score = 0;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[@$!%*?&]/.test(password)) score += 1;
    if (/[^A-Za-z0-9@$!%*?&]/.test(password)) score += 1;

    if (score <= 3) return 'weak';
    if (score <= 5) return 'medium';
    return 'strong';
  }
}

module.exports = PasswordValidator;
```

---

### 4.4 SEC-009 : Protection CSRF

#### 4.4.1 Description
Implémenter la protection CSRF pour les formulaires et requêtes state-changing.

#### 4.4.2 Spécifications

```javascript
const csrf = require('csurf');
const cookieParser = require('cookie-parser');

// Configuration CSRF
const csrfProtection = csrf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 3600 // 1 heure
  }
});

// Middleware pour exposer le token
app.use(cookieParser());
app.use(csrfProtection);

app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
});

// Endpoint pour récupérer le token (SPA)
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

---

### 4.5 SEC-010 : Amélioration OTP

#### 4.5.1 Spécifications

| Paramètre | Actuel | Nouveau |
|-----------|--------|---------|
| Longueur OTP | 6 chiffres | 8 chiffres |
| Tentatives max | 3 | 3 (inchangé) |
| Validité | 15 min | 10 min |
| Cooldown | 60s | 120s |
| Blocage IP | Non | Oui (après 5 échecs) |

**Modifications dans `email-verification-service.js` :**

```javascript
const OTP_CONFIG = {
  length: 8,                    // 8 chiffres (100 millions de combinaisons)
  expiryMinutes: 10,            // 10 minutes validité
  maxAttempts: 3,               // 3 tentatives max
  cooldownSeconds: 120,         // 2 minutes entre envois
  ipBlockThreshold: 5,          // Bloquer IP après 5 échecs
  ipBlockDuration: 3600,        // Blocage 1 heure
  bcryptRounds: 12              // Augmenter les rounds
};
```

---

### 4.6 SEC-011 : Hashage Refresh Tokens

#### 4.6.1 Description
Hasher les refresh tokens avant stockage en base de données.

#### 4.6.2 Spécifications

```javascript
const crypto = require('crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// À l'enregistrement du token
await db.collection('refresh_tokens').insertOne({
  userId,
  tokenHash: hashToken(refreshToken),  // ← Stocker le hash
  createdAt: now,
  expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
});

// À la vérification
const storedToken = await db.collection('refresh_tokens').findOne({
  userId: decoded.userId,
  tokenHash: hashToken(refreshToken)  // ← Comparer le hash
});
```

---

### 4.7 SEC-012 : Rate Limiting Amélioré

#### 4.7.1 Endpoints à Protéger

| Endpoint | Limite Actuelle | Nouvelle Limite |
|----------|-----------------|-----------------|
| POST /api/auth/register | 5/10min | 3/15min |
| POST /api/auth/login | 10/5min | 5/15min + blocage progressif |
| POST /api/auth/refresh | Aucune | 30/min |
| POST /api/auth/send-otp | 3/5min | 2/5min |
| POST /api/stripe/webhook | Aucune | 100/min (IP Stripe only) |

#### 4.7.2 Blocage Progressif

```javascript
const progressiveBlockConfig = {
  'auth:login': [
    { attempts: 3, blockDuration: 60 },      // 3 échecs = 1 min
    { attempts: 5, blockDuration: 300 },     // 5 échecs = 5 min
    { attempts: 10, blockDuration: 3600 },   // 10 échecs = 1 heure
    { attempts: 20, blockDuration: 86400 }   // 20 échecs = 24 heures
  ]
};
```

---

## 5. PHASE 3 - AMÉLIORATIONS MOYENNES (Moyen terme)

**Durée estimée : 2-4 semaines**
**Priorité : MOYENNE**

### 5.1 SEC-013 : Authentification Inter-Services

#### 5.1.1 Description
Implémenter une authentification mutuelle entre les microservices.

#### 5.1.2 Options

**Option A : API Keys Signées (HMAC)**
```javascript
const crypto = require('crypto');

function signRequest(serviceId, secretKey, payload) {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${serviceId}:${timestamp}:${JSON.stringify(payload)}`)
    .digest('hex');

  return { signature, timestamp, serviceId };
}

function verifyRequest(headers, payload, getSecretKey) {
  const { 'x-service-id': serviceId, 'x-timestamp': timestamp, 'x-signature': signature } = headers;

  // Vérifier timestamp (5 min max)
  if (Date.now() - parseInt(timestamp) > 300000) {
    throw new Error('Request expired');
  }

  const secretKey = getSecretKey(serviceId);
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(`${serviceId}:${timestamp}:${JSON.stringify(payload)}`)
    .digest('hex');

  if (signature !== expectedSignature) {
    throw new Error('Invalid signature');
  }

  return true;
}
```

**Option B : mTLS (Recommandé pour production)**
```yaml
# Configuration avec Istio/AWS App Mesh
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
spec:
  mtls:
    mode: STRICT
```

---

### 5.2 SEC-014 : Logging Sécurité Centralisé

#### 5.2.1 Description
Implémenter un système de logging de sécurité centralisé avec alertes.

#### 5.2.2 Événements à Logger

| Événement | Niveau | Alerte |
|-----------|--------|--------|
| Login réussi | INFO | Non |
| Login échoué | WARN | Après 5 en 5min |
| Token invalide | WARN | Après 10 en 5min |
| Rate limit atteint | WARN | Après 20 en 10min |
| CORS bloqué | WARN | Après 10 en 5min |
| Validation échouée | INFO | Non |
| Changement mot de passe | INFO | Email utilisateur |
| Accès admin | INFO | Non |
| Erreur 500 | ERROR | Immédiat |

#### 5.2.3 Format de Log

```javascript
const securityLog = {
  timestamp: new Date().toISOString(),
  level: 'WARN',
  event: 'AUTH_FAILED',
  userId: null,
  ip: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  endpoint: '/api/auth/login',
  details: {
    reason: 'invalid_password',
    email: 'user@example.com' // Masquer partiellement
  },
  requestId: 'uuid-v4',
  serviceId: 'subscriptions-contracts-eb'
};
```

---

### 5.3 SEC-015 : Headers de Sécurité Complets

#### 5.3.1 Headers à Ajouter

```javascript
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.stripe.com'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}));

// Permissions-Policy (Feature-Policy)
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(self), usb=()'
  );
  next();
});
```

---

### 5.4 SEC-016 : Masquage Erreurs Production

#### 5.4.1 Spécifications

```javascript
// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  // Logger l'erreur complète
  console.error({
    timestamp: new Date().toISOString(),
    requestId: req.id,
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Réponse sanitisée
  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      requestId: req.id
    }
  };

  // Ajouter stack trace uniquement en dev
  if (process.env.NODE_ENV !== 'production') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
});
```

---

### 5.5 SEC-017 : Prévention Énumération Utilisateurs

#### 5.5.1 Description
Uniformiser les messages d'erreur pour éviter l'énumération des emails.

```javascript
// AVANT (permet l'énumération)
if (existingUser) {
  return res.status(409).json({
    message: 'An account with this email already exists'  // ❌
  });
}

// APRÈS (message uniforme)
// Pour register - toujours retourner succès (envoyer email de vérification)
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  const existingUser = await db.collection('users').findOne({ email });

  if (existingUser) {
    // Simuler le délai de création pour éviter timing attack
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));

    // Logger pour monitoring interne
    console.log(`[SECURITY] Registration attempt for existing email: ${email}`);
  } else {
    // Créer le compte
    await createUser(email, password);
  }

  // Toujours retourner le même message
  return res.status(200).json({
    success: true,
    message: 'If this email is valid, you will receive a verification code'
  });
});
```

---

## 6. PHASE 4 - DURCISSEMENT AVANCÉ (Long terme)

**Durée estimée : 1-3 mois**
**Priorité : BASSE à MOYENNE**

### 6.1 SEC-018 : Web Application Firewall (WAF)

#### 6.1.1 Description
Déployer AWS WAF devant les API.

#### 6.1.2 Règles Recommandées

- AWS Managed Rules - Core Rule Set
- AWS Managed Rules - SQL Database
- AWS Managed Rules - Known Bad Inputs
- Rate limiting par IP
- Geo-blocking (si applicable)
- Bot Control

### 6.2 SEC-019 : Audit de Dépendances Automatisé

#### 6.2.1 Configuration GitHub Actions

```yaml
# .github/workflows/security.yml
name: Security Audit

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: snyk.sarif
```

### 6.3 SEC-020 : Tests de Pénétration

#### 6.3.1 Scope

- Tests d'authentification (brute force, bypass)
- Tests d'injection (SQL, NoSQL, XSS, SSRF)
- Tests d'autorisation (IDOR, privilege escalation)
- Tests de configuration (headers, CORS, SSL)
- Tests de logique métier

### 6.4 SEC-021 : Conformité RGPD

#### 6.4.1 Points à Implémenter

- Chiffrement des données au repos (MongoDB encryption)
- Anonymisation des logs (IP, emails)
- Export des données utilisateur (DSAR)
- Droit à l'oubli (suppression complète)
- Registre des traitements

---

## 7. SPÉCIFICATIONS TECHNIQUES DÉTAILLÉES

### 7.1 Architecture Cible

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS CloudFront                        │
│                         (CDN + WAF)                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Load Balancer                 │
│                     (SSL Termination)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway (Kong/AWS)                   │
│         Rate Limiting | Auth | Logging | Routing             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Auth API    │   │  Main API     │   │  Billing API  │
│   (authz-eb)  │   │ (subscript.)  │   │  (billing)    │
└───────────────┘   └───────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AWS Secrets Manager                       │
│                   (Secrets Centralisés)                      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  MongoDB Atlas│   │     Redis     │   │    AWS S3     │
│   (Encrypted) │   │   (Sessions)  │   │  (Documents)  │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 7.2 Nouveaux Packages à Créer

```
packages/
├── security/
│   ├── secrets-manager.js        # Gestion AWS Secrets Manager
│   ├── validation-schemas.js     # Schémas Joi
│   ├── validation-middleware.js  # Middleware de validation
│   ├── password-validator.js     # Validation mot de passe
│   ├── security-logger.js        # Logging sécurité
│   ├── rate-limiter.js          # Rate limiting avancé
│   ├── csrf.js                  # Protection CSRF
│   └── inter-service-auth.js    # Auth entre services
```

### 7.3 Variables d'Environnement Requises

```bash
# AWS Secrets Manager
AWS_SECRETS_MANAGER_SECRET_ID=prod/symphonia/secrets
AWS_REGION=eu-west-1

# Security Settings
NODE_ENV=production
SECURITY_LOG_LEVEL=info
RATE_LIMIT_ENABLED=true

# CORS (production)
CORS_ORIGIN=https://industrie.symphonia-controltower.com,https://transporteur.symphonia-controltower.com

# Les secrets suivants sont dans AWS Secrets Manager :
# - JWT_SECRET
# - JWT_REFRESH_SECRET
# - MONGODB_URI
# - STRIPE_SECRET_KEY
# - etc.
```

---

## 8. CRITÈRES DE VALIDATION

### 8.1 Tests de Sécurité Automatisés

| Test | Outil | Critère de Succès |
|------|-------|-------------------|
| Dépendances vulnérables | npm audit / Snyk | 0 vulnérabilité HIGH/CRITICAL |
| Secrets dans le code | gitleaks / trufflehog | 0 secret détecté |
| Headers de sécurité | securityheaders.com | Grade A minimum |
| SSL/TLS | ssllabs.com | Grade A minimum |
| OWASP Top 10 | OWASP ZAP | 0 vulnérabilité HIGH |

### 8.2 Checklist de Validation Phase 1

- [ ] Tous les secrets migrés vers AWS Secrets Manager
- [ ] Fichiers .env supprimés de l'historique Git
- [ ] Nouveaux secrets générés et déployés
- [ ] Bypass CORS corrigé
- [ ] Export JWT secrets supprimé
- [ ] Validation des secrets au démarrage
- [ ] Tests de non-régression passants
- [ ] Revue de code sécurité effectuée

### 8.3 Checklist de Validation Phase 2

- [ ] Validation Joi sur tous les endpoints
- [ ] Protection NoSQL injection (escapeRegex)
- [ ] Politique mot de passe renforcée (12 chars)
- [ ] Protection CSRF implémentée
- [ ] OTP amélioré (8 chiffres, cooldown 2min)
- [ ] Refresh tokens hashés
- [ ] Rate limiting sur /refresh
- [ ] Tests de sécurité automatisés dans CI/CD

### 8.4 Métriques de Succès

| Métrique | Valeur Cible |
|----------|--------------|
| Score de sécurité | ≥ 8/10 |
| Secrets exposés | 0 |
| Couverture validation | 100% endpoints |
| Temps détection incident | < 5 minutes |
| MTTD (Mean Time To Detect) | < 15 minutes |
| MTTR (Mean Time To Respond) | < 1 heure |

---

## 9. ANNEXES

### 9.1 Références

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP ASVS 4.0](https://owasp.org/www-project-application-security-verification-standard/)
- [CWE/SANS Top 25](https://cwe.mitre.org/top25/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [AWS Security Best Practices](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)

### 9.2 Glossaire

| Terme | Définition |
|-------|------------|
| CSRF | Cross-Site Request Forgery |
| JWT | JSON Web Token |
| mTLS | Mutual TLS |
| NoSQL Injection | Injection de requêtes dans bases NoSQL |
| OTP | One-Time Password |
| RBAC | Role-Based Access Control |
| ReDoS | Regular Expression Denial of Service |
| WAF | Web Application Firewall |
| XSS | Cross-Site Scripting |

### 9.3 Contacts

| Rôle | Responsabilité |
|------|----------------|
| Security Lead | Validation des implémentations |
| DevOps | Déploiement et infrastructure |
| Backend Lead | Revue de code |
| QA | Tests de validation |

---

**Document rédigé le :** 2026-01-01
**Prochaine révision :** Après Phase 1
**Classification :** CONFIDENTIEL
