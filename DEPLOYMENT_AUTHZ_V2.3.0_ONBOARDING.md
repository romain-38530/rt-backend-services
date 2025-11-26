# DÉPLOIEMENT AUTHZ-EB v2.3.0-onboarding - ENDPOINT D'ONBOARDING

## 📋 Informations du Déploiement

**Date:** 25 novembre 2025
**Version:** v2.3.0-onboarding
**Commit:** b12fa35
**Environnement:** rt-authz-api-prod
**Région:** eu-central-1
**Application:** rt-authz-api

---

## ✨ Nouveauté Déployée

### **Endpoint d'Onboarding** - POST /api/onboarding/submit

Permet l'inscription des nouveaux utilisateurs/sociétés depuis le frontend.

---

## 🔧 Détails de l'Endpoint

### Route
```
POST /api/onboarding/submit
```

### Schéma des données
```javascript
{
  email: String (required),        // Email du contact
  companyName: String (required),  // Nom de la société
  siret: String (optional),        // SIRET français
  vatNumber: String (optional),    // Numéro TVA intracommunautaire
  phone: String (optional),        // Téléphone de contact
  address: Object (optional),      // Adresse complète
  subscriptionType: String (optional), // Type d'abonnement souhaité
  source: String (default: 'WEB')  // Source de la demande
}
```

### Validations
1. **Email** (requis)
   - Format valide: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
   - Converti en minuscules
   - Trimmed

2. **Company Name** (requis)
   - String non vide
   - Trimmed

3. **Email Unique**
   - Vérification de doublon
   - Erreur 409 si déjà enregistré

### Réponse SUCCESS (201)
```json
{
  "success": true,
  "message": "Onboarding request submitted successfully",
  "requestId": "673d1a2b45c6e7f8a9b0c1d2",
  "email": "contact@example.com",
  "companyName": "Example Transport SA",
  "status": "pending",
  "createdAt": "2025-11-25T21:38:00.000Z"
}
```

### Codes d'Erreur
- **400 - INVALID_INPUT**: Email ou companyName manquant
- **400 - INVALID_EMAIL**: Format email invalide
- **503 - DATABASE_UNAVAILABLE**: MongoDB non connecté
- **409 - DUPLICATE_REQUEST**: Email déjà enregistré
- **500 - DATABASE_ERROR**: Erreur d'insertion MongoDB
- **500 - INTERNAL_ERROR**: Erreur serveur

---

## 💾 Collection MongoDB

**Collection:** `onboarding_requests`

**Structure du document:**
```javascript
{
  _id: ObjectId,
  email: String (lowercase, trimmed, indexed unique),
  companyName: String (trimmed),
  siret: String | null,
  vatNumber: String | null,
  phone: String | null,
  address: Object | null,
  subscriptionType: String | null,
  source: String (default: 'WEB'),
  status: String (default: 'pending'),
  createdAt: Date,
  updatedAt: Date,
  ipAddress: String (from request),
  userAgent: String (from request headers)
}
```

---

## 📝 Logs Console

### Logs de réception
```
Received onboarding request from: contact@example.com - Company: Example Transport SA
```

### Logs de succès
```
Onboarding request saved successfully: 673d1a2b45c6e7f8a9b0c1d2
```

### Logs d'erreur
```
MongoDB insert error: [error details]
Onboarding endpoint error: [error stack]
```

---

## 🔗 Intégration avec le Frontend

### Exemple d'appel (JavaScript/Fetch)
```javascript
const response = await fetch('https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'contact@example.com',
    companyName: 'Example Transport SA',
    siret: '12345678901234',
    vatNumber: 'FR12345678901',
    phone: '+33123456789',
    subscriptionType: 'premium',
    source: 'WEB'
  })
});

const data = await response.json();

if (data.success) {
  console.log('Inscription réussie !', data.requestId);
} else {
  console.error('Erreur:', data.error);
}
```

### Exemple d'appel (cURL)
```bash
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "contact@example.com",
    "companyName": "Example Transport SA",
    "siret": "12345678901234",
    "vatNumber": "FR12345678901",
    "phone": "+33123456789",
    "subscriptionType": "premium"
  }'
```

---

## 📦 Détails Techniques

### Bundle
- **Nom:** authz-eb-v2.3.0-onboarding.zip
- **Taille:** 30 KB
- **Fichiers:** index.js, package.json, .ebextensions/

### Déploiement AWS
- **S3 Bucket:** elasticbeanstalk-eu-central-1-004843574253
- **Application:** rt-authz-api
- **Version Label:** v2.3.0-onboarding
- **Environnement:** rt-authz-api-prod
- **CNAME:** rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Platform:** Node.js 20 on Amazon Linux 2023 v6.7.0

---

## 🔄 Statut du Déploiement

**Statut Initial:** Updating
**Health:** Grey → En cours de déploiement

**Surveillance:** Vérification après 60 secondes

---

## 🧪 Tests Recommandés

### 1. Test de création basique
```bash
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "companyName": "Test Company"
  }'
```

**Résultat attendu:** 201 Created avec requestId

### 2. Test de validation email
```bash
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invalid-email",
    "companyName": "Test Company"
  }'
```

**Résultat attendu:** 400 Bad Request avec code INVALID_EMAIL

### 3. Test de doublon
```bash
# Premier appel
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@example.com",
    "companyName": "Test Company"
  }'

# Second appel avec même email
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "duplicate@example.com",
    "companyName": "Another Company"
  }'
```

**Résultat attendu:** 409 Conflict avec code DUPLICATE_REQUEST

### 4. Test complet avec tous les champs
```bash
curl -X POST https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "complete@example.com",
    "companyName": "Complete Transport SA",
    "siret": "12345678901234",
    "vatNumber": "FR12345678901",
    "phone": "+33123456789",
    "address": {
      "street": "123 Rue de la Paix",
      "city": "Paris",
      "postalCode": "75001",
      "country": "France"
    },
    "subscriptionType": "premium"
  }'
```

**Résultat attendu:** 201 Created avec toutes les données enregistrées

---

## 📊 Endpoints Disponibles (authz-api)

### Avant v2.3.0
- GET /health
- GET /
- POST /api/vat/validate-format
- POST /api/vat/validate
- POST /api/vat/calculate-price

### Après v2.3.0 (Nouveau) 🆕
- **POST /api/onboarding/submit** - Inscription des nouveaux utilisateurs

---

## 🔒 Sécurité

### Données capturées
- **IP Address:** Capturée depuis `req.headers['x-forwarded-for']` ou `req.socket.remoteAddress`
- **User Agent:** Capturé depuis `req.headers['user-agent']`
- **Timestamps:** `createdAt` et `updatedAt` automatiques

### Validation
- Email format validé par regex
- Trimming automatique des strings
- Lowercase automatique pour les emails
- Protection contre les doublons (index unique MongoDB)

### Logs
- Tous les appels sont loggés dans CloudWatch
- IP et User-Agent enregistrés pour audit

---

## 📧 Prochaines Étapes (Optionnel)

### Envoi d'Email de Confirmation
Pour ajouter l'envoi d'email après inscription :

1. **Installer SendGrid**
```bash
npm install @sendgrid/mail
```

2. **Ajouter dans index.js après l'insertion MongoDB**
```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: email,
  from: 'noreply@rt-backend.com',
  subject: 'Confirmation de votre demande d\'inscription',
  html: `
    <h2>Bonjour ${companyName},</h2>
    <p>Nous avons bien reçu votre demande d'inscription.</p>
    <p>Notre équipe va vous contacter dans les plus brefs délais.</p>
    <p>Référence de votre demande: ${result.insertedId}</p>
  `
};

await sgMail.send(msg);
```

3. **Configurer la variable d'environnement**
```bash
eb setenv SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxx
```

---

## 🗄️ Vérification MongoDB

### Vérifier les inscriptions
```javascript
// Dans MongoDB Compass ou shell
use rt-subscriptions-contracts

// Voir toutes les demandes
db.onboarding_requests.find().sort({createdAt: -1})

// Compter les demandes
db.onboarding_requests.countDocuments()

// Chercher par email
db.onboarding_requests.findOne({email: "test@example.com"})

// Voir les demandes en attente
db.onboarding_requests.find({status: "pending"})
```

---

## 📈 Métriques et Monitoring

### CloudWatch Logs
- Groupe de logs: `/aws/elasticbeanstalk/rt-authz-api-prod/`
- Filtrer par: `"Received onboarding request"`

### Métriques à surveiller
- Nombre de demandes par jour
- Taux d'erreur 400 (validation)
- Taux d'erreur 409 (doublons)
- Temps de réponse moyen

---

## ✅ Checklist Post-Déploiement

- [ ] Vérifier statut Green dans AWS Console
- [ ] Tester l'endpoint avec curl
- [ ] Vérifier les logs CloudWatch
- [ ] Vérifier l'insertion MongoDB
- [ ] Tester la validation d'email
- [ ] Tester la détection de doublons
- [ ] Documenter l'endpoint dans Postman
- [ ] Informer l'équipe frontend
- [ ] Mettre à jour la documentation API
- [ ] Configurer les alertes CloudWatch

---

## 🔗 URLs et Endpoints

### Production
- **Base URL:** https://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Onboarding:** POST /api/onboarding/submit
- **Health Check:** GET /health

### Documentation
- [index.js](./services/authz-eb/index.js) - Code source
- Commit: b12fa35
- Lignes ajoutées: 591-711 (124 lignes)

---

## 🚀 Résumé de l'Implémentation

### Ce qui a été fait
1. ✅ Création de l'endpoint POST /api/onboarding/submit
2. ✅ Validation complète des données (email, companyName)
3. ✅ Stockage MongoDB dans collection `onboarding_requests`
4. ✅ Capture IP et User-Agent pour audit
5. ✅ Gestion des doublons avec code 409
6. ✅ Logs console pour monitoring
7. ✅ Réponses d'erreur détaillées
8. ✅ Documentation complète

### Code ajouté
- **Fichier:** services/authz-eb/index.js
- **Lignes:** 591-711 (124 lignes)
- **Commit:** b12fa35
- **Tests:** Validation syntaxe OK

### Déploiement
- **Bundle créé:** 30 KB
- **Upload S3:** ✅
- **Version créée:** v2.3.0-onboarding
- **Déploiement lancé:** ✅
- **Statut:** En cours (60 secondes)

---

**Statut:** 🔄 Déploiement en cours...
**Prochaine vérification:** Dans 60 secondes

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
