# Cahier des Charges - Securisation des Parcours d'Inscription SYMPHONI.A

**Version**: 1.0.0
**Date**: 30 Decembre 2025
**Auteur**: RT Technologie
**Statut**: A Implementer

---

## 1. Contexte et Objectifs

### 1.1 Contexte

Suite a l'audit des parcours d'inscription des clients SYMPHONI.A, plusieurs vulnerabilites et points d'amelioration ont ete identifies:

- Absence de verification d'email
- Pas de rate limiting sur les endpoints publics
- Tokens d'invitation non securises
- Impossibilite de revoquer une invitation
- Pas de notification webhook lors de l'acceptation d'invitation

### 1.2 Objectifs

1. **Securiser** les parcours d'inscription contre les abus
2. **Valider** l'identite des utilisateurs via verification email
3. **Proteger** les endpoints publics contre le spam/brute force
4. **Ameliorer** la tracabilite des invitations
5. **Notifier** les industriels lors des evenements cles

---

## 2. Specifications Fonctionnelles

### 2.1 Verification Email par OTP

#### 2.1.1 Description
Systeme de verification d'email par code OTP 6 chiffres envoye par email.

#### 2.1.2 Flux

```
1. Utilisateur s'inscrit avec email
2. Systeme genere OTP 6 chiffres (validite 15 min)
3. Email envoye avec code OTP
4. Utilisateur saisit le code
5. Si valide: compte active
6. Si invalide: 3 tentatives max, puis nouveau code requis
```

#### 2.1.3 Endpoints

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/api/auth/send-otp` | POST | Envoyer/renvoyer OTP |
| `/api/auth/verify-otp` | POST | Verifier OTP |
| `/api/logisticians/onboarding/verify-email` | POST | Verifier email logisticien |

#### 2.1.4 Schema MongoDB

```javascript
// Collection: email_verifications
{
  _id: ObjectId,
  email: String,           // Email a verifier
  otp: String,             // Code 6 chiffres (hashe)
  otpHash: String,         // Hash bcrypt du OTP
  purpose: String,         // 'registration' | 'password_reset' | 'logisticien_onboarding'
  attempts: Number,        // Nombre de tentatives (max 3)
  expiresAt: Date,         // Date expiration (15 min)
  verified: Boolean,       // true si verifie
  verifiedAt: Date,
  createdAt: Date,
  ipAddress: String,       // IP de la demande
  userAgent: String        // User agent
}
```

#### 2.1.5 Regles Metier

- OTP: 6 chiffres numeriques
- Validite: 15 minutes
- Tentatives max: 3
- Cooldown entre envois: 60 secondes
- Apres 3 echecs: nouveau OTP requis
- OTP hashe en base (bcrypt)

---

### 2.2 Rate Limiting

#### 2.2.1 Description
Protection des endpoints publics contre les abus via limitation du nombre de requetes.

#### 2.2.2 Configuration par Endpoint

| Endpoint | Limite | Fenetre | Cle |
|----------|--------|---------|-----|
| `POST /api/auth/register` | 5 | 10 min | IP |
| `POST /api/auth/login` | 10 | 5 min | IP + Email |
| `POST /api/auth/send-otp` | 3 | 5 min | Email |
| `POST /api/carriers/invite` | 10 | 1 heure | industrielId |
| `POST /api/logisticians/invite` | 10 | 1 heure | industrielId |
| `POST /api/onboarding/submit` | 3 | 1 jour | Email |

#### 2.2.3 Implementation

```javascript
// Middleware rate-limiter-flexible
const rateLimiter = new RateLimiterMongo({
  storeClient: mongoClient,
  keyPrefix: 'rate_limit',
  points: 5,           // Nombre de requetes
  duration: 600,       // Fenetre en secondes (10 min)
  blockDuration: 900   // Blocage 15 min si depasse
});
```

#### 2.2.4 Reponse en cas de depassement

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Trop de requetes. Reessayez dans X minutes.",
    "retryAfter": 900
  }
}
```

---

### 2.3 Tokens d'Invitation Securises

#### 2.3.1 Description
Remplacement des tokens simples par des JWT signes avec expiration.

#### 2.3.2 Structure JWT

```javascript
{
  // Header
  "alg": "HS256",
  "typ": "JWT"

  // Payload
  "sub": "670300000000000000000001",  // logisticianId ou carrierId
  "type": "invitation",
  "purpose": "logisticien_onboarding",
  "industrielId": "670100000000000000000001",
  "email": "logistique@exemple.fr",
  "iat": 1735570000,
  "exp": 1736174800  // 7 jours
}
```

#### 2.3.3 Avantages

- **Signature**: Impossible a falsifier sans la cle secrete
- **Expiration**: Integree dans le token
- **Payload**: Contient les infos necessaires (pas de lookup DB pour verifier)
- **Revocation**: Via blacklist en DB

#### 2.3.4 Collection Blacklist

```javascript
// Collection: revoked_tokens
{
  _id: ObjectId,
  jti: String,           // JWT ID unique
  token: String,         // Token complet (pour reference)
  revokedAt: Date,
  revokedBy: String,     // userId de l'admin/industriel
  reason: String,        // 'manual' | 'security' | 'user_request'
  expiresAt: Date        // Meme expiration que le token original (pour cleanup)
}
```

---

### 2.4 Revocation d'Invitation

#### 2.4.1 Description
Permettre a un industriel de revoquer une invitation envoyee.

#### 2.4.2 Endpoints

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/api/carriers/:id/cancel-invitation` | POST | Revoquer invitation transporteur |
| `/api/logisticians/:id/cancel-invitation` | POST | Revoquer invitation logisticien |

#### 2.4.3 Regles

- Seul l'industriel qui a invite peut revoquer
- Revocation impossible si invitation deja acceptee
- Email de notification envoye au destinataire
- Token ajoute a la blacklist

#### 2.4.4 Reponse

```json
{
  "success": true,
  "message": "Invitation revoquee avec succes",
  "data": {
    "id": "670300000000000000000001",
    "email": "logistique@exemple.fr",
    "status": "cancelled",
    "cancelledAt": "2025-12-30T10:00:00Z"
  }
}
```

---

### 2.5 Webhooks de Notification

#### 2.5.1 Description
Notifications temps reel aux industriels lors d'evenements cles.

#### 2.5.2 Evenements

| Evenement | Declencheur | Destinataire |
|-----------|-------------|--------------|
| `invitation.accepted` | Logisticien/Transporteur accepte | Industriel |
| `invitation.expired` | Token expire sans acceptation | Industriel |
| `invitation.cancelled` | Industriel revoque | Logisticien/Transporteur |
| `onboarding.completed` | Onboarding termine | Industriel |
| `documents.all_verified` | Tous docs valides | Industriel |
| `account.blocked` | Compte bloque | Industriel |

#### 2.5.3 Format Webhook

```javascript
// Collection: webhook_subscriptions
{
  _id: ObjectId,
  industrielId: ObjectId,
  url: String,              // URL du webhook
  events: [String],         // ['invitation.accepted', 'onboarding.completed']
  secret: String,           // Secret pour signature HMAC
  isActive: Boolean,
  createdAt: Date,
  lastDelivery: Date,
  failureCount: Number      // Desactive apres 5 echecs
}

// Payload envoye
{
  "event": "invitation.accepted",
  "timestamp": "2025-12-30T10:00:00Z",
  "data": {
    "type": "logisticien",
    "id": "670300000000000000000001",
    "email": "logistique@exemple.fr",
    "companyName": "Entrepots Durand",
    "acceptedAt": "2025-12-30T10:00:00Z"
  },
  "signature": "sha256=..."  // HMAC-SHA256 du payload
}
```

#### 2.5.4 Retry Policy

- Tentative 1: Immediate
- Tentative 2: +1 minute
- Tentative 3: +5 minutes
- Tentative 4: +30 minutes
- Tentative 5: +2 heures
- Apres 5 echecs: Webhook desactive, email admin

---

## 3. Specifications Techniques

### 3.1 Fichiers a Creer

| Fichier | Description |
|---------|-------------|
| `email-verification-service.js` | Service verification OTP |
| `rate-limiter-middleware.js` | Middleware rate limiting |
| `invitation-token-service.js` | Service generation/validation JWT |
| `webhook-service.js` | Service envoi webhooks |

### 3.2 Fichiers a Modifier

| Fichier | Modifications |
|---------|---------------|
| `auth-routes.js` | Ajouter endpoints OTP |
| `logisticien-routes.js` | Integrer OTP + revocation + webhooks |
| `carrier-referencing-routes.js` | Integrer revocation + webhooks |
| `index.js` | Monter middleware rate limiting |
| `package.json` | Ajouter dependances |

### 3.3 Dependances NPM

```json
{
  "rate-limiter-flexible": "^5.0.0",
  "jsonwebtoken": "^9.0.2",   // Deja present
  "crypto": "native"          // Node.js built-in
}
```

### 3.4 Variables d'Environnement

```env
# JWT
JWT_INVITATION_SECRET=<secret-32-chars-min>
JWT_INVITATION_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=mongodb

# Webhooks
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_RETRIES=5

# OTP
OTP_EXPIRY_MINUTES=15
OTP_MAX_ATTEMPTS=3
OTP_COOLDOWN_SECONDS=60
```

---

## 4. Plan d'Implementation

### Phase 1: Fondations (Priorite Critique)

1. **Rate Limiting** - Protection immediate
   - Creer `rate-limiter-middleware.js`
   - Configurer limites par endpoint
   - Integrer dans `index.js`

2. **Verification Email OTP**
   - Creer `email-verification-service.js`
   - Ajouter collection `email_verifications`
   - Modifier parcours inscription

### Phase 2: Securite (Priorite Haute)

3. **Tokens JWT Securises**
   - Creer `invitation-token-service.js`
   - Migrer tokens existants
   - Ajouter blacklist

4. **Revocation d'Invitation**
   - Ajouter endpoints revocation
   - Integrer avec blacklist
   - Emails de notification

### Phase 3: Observabilite (Priorite Moyenne)

5. **Webhooks**
   - Creer `webhook-service.js`
   - Endpoints configuration webhooks
   - Systeme de retry

---

## 5. Tests et Validation

### 5.1 Tests Unitaires

- Generation/Verification OTP
- Validation JWT
- Rate limiting (compteurs)
- Signature webhook

### 5.2 Tests Integration

- Parcours complet inscription avec OTP
- Revocation et verification token invalide
- Depassement rate limit
- Livraison webhook

### 5.3 Tests Securite

- Brute force OTP
- Token replay attack
- Rate limit bypass attempts
- Webhook signature validation

---

## 6. Metriques et Monitoring

### 6.1 KPIs

| Metrique | Objectif |
|----------|----------|
| Taux verification email | > 80% |
| Taux blocage rate limit | < 5% |
| Temps moyen onboarding | < 10 min |
| Webhooks livres | > 99% |

### 6.2 Alertes

- Rate limit depasse 100 fois/heure
- Webhook echec 3 fois consecutives
- OTP expire sans verification > 50%

---

## 7. Rollback Plan

En cas de probleme:

1. Desactiver rate limiting via `RATE_LIMIT_ENABLED=false`
2. Tokens anciens toujours valides (migration progressive)
3. OTP optionnel via feature flag `EMAIL_VERIFICATION_REQUIRED=false`
4. Webhooks desactivables par industriel

---

## 8. Estimation

| Phase | Effort | Duree |
|-------|--------|-------|
| Phase 1 | Moyen | - |
| Phase 2 | Moyen | - |
| Phase 3 | Faible | - |
| Tests | Moyen | - |
| **Total** | - | - |

---

## 9. Approbation

| Role | Nom | Date | Signature |
|------|-----|------|-----------|
| Product Owner | - | - | - |
| Tech Lead | - | - | - |
| Security | - | - | - |

---

*Document genere automatiquement - RT SYMPHONI.A*
