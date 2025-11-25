# Déploiement v2.6.0 - JWT Authentication & Stripe Payments

## 📦 Bundle Créé

**Fichier**: `jwt-stripe-v2.6.0-1764077202.zip`
**Taille**: 56 KB (54 KB compressé)
**Date**: 25 novembre 2024, 14:26
**Contenu**: 17 fichiers

## ✨ Nouvelles Fonctionnalités (v2.6.0)

### 1. JWT Authentication System
- **auth-middleware.js** (3.7 KB) - Middleware JWT avec vérification de tokens
- **auth-routes.js** (15.5 KB) - 6 endpoints d'authentification
- Génération de tokens JWT (access + refresh)
- Hachage bcrypt pour les mots de passe (SALT_ROUNDS=10)
- Contrôle d'accès basé sur les rôles (carrier, industrial, admin)

### 2. Stripe Payment Integration
- **stripe-routes.js** (18.7 KB) - 8 endpoints Stripe
- Checkout sessions pour abonnements
- Payment intents pour paiements uniques
- Gestion des abonnements (liste, annulation)
- Webhooks pour événements Stripe
- Historique des paiements

### 3. Fonctionnalités Existantes (Conservées)
- e-CMR (Electronic Consignment Note)
- Account Types Management
- Carrier Referencing (SYMPHONI.A)
- Pricing Grids Management (v2.5.0)
- Industrial Transport Configuration (v2.5.0)

## 📋 Variables d'Environnement Requises

### JWT Configuration
```bash
JWT_SECRET=your-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-change-in-production
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

### Stripe Configuration
```bash
STRIPE_SECRET_KEY=sk_live_your_stripe_key_or_sk_test_for_dev
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
FRONTEND_URL=https://your-frontend-domain.com
```

### MongoDB (Existant)
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rt-subscriptions-contracts
```

### Autres (Existants)
```bash
NODE_ENV=production
PORT=8080
CORS_ORIGIN=https://your-frontend-domain.com
```

## 🚀 Déploiement sur Elastic Beanstalk

### Option 1: Via Console AWS

1. **Aller dans Elastic Beanstalk Console**
   - https://console.aws.amazon.com/elasticbeanstalk/

2. **Sélectionner l'environnement**
   - Application: `subscriptions-contracts`
   - Environnement: `subscriptions-contracts-env`

3. **Uploader le bundle**
   - Cliquer sur "Upload and Deploy"
   - Choisir le fichier: `jwt-stripe-v2.6.0-1764077202.zip`
   - Version label: `v2.6.0-jwt-stripe`
   - Description: "Add JWT authentication and Stripe payment integration"

4. **Configurer les variables d'environnement**
   - Configuration → Software → Environment properties
   - Ajouter les variables JWT et Stripe (voir section ci-dessus)

5. **Déployer**
   - Cliquer sur "Deploy"
   - Attendre 2-5 minutes

### Option 2: Via AWS CLI

```bash
# 1. Créer une nouvelle version d'application
aws elasticbeanstalk create-application-version \
  --application-name subscriptions-contracts \
  --version-label v2.6.0-jwt-stripe \
  --source-bundle S3Bucket="elasticbeanstalk-us-east-1-ACCOUNT_ID",S3Key="jwt-stripe-v2.6.0-1764077202.zip" \
  --description "JWT authentication and Stripe payment integration"

# 2. Déployer sur l'environnement
aws elasticbeanstalk update-environment \
  --environment-name subscriptions-contracts-env \
  --version-label v2.6.0-jwt-stripe

# 3. Vérifier le statut
aws elasticbeanstalk describe-environments \
  --environment-names subscriptions-contracts-env \
  --query 'Environments[0].Health'
```

### Option 3: Via EB CLI

```bash
# 1. Initialiser EB CLI (si pas déjà fait)
cd services/deploy-jwt-stripe-v2.6.0
eb init

# 2. Déployer
eb deploy --label v2.6.0-jwt-stripe

# 3. Vérifier le statut
eb status

# 4. Voir les logs en temps réel
eb logs --stream
```

## 🔐 Configuration Stripe Post-Déploiement

### 1. Créer les Produits et Prix dans Stripe

```bash
# Exemple via Stripe CLI
stripe products create \
  --name "RT Premium Subscription" \
  --description "Accès premium aux fonctionnalités RT"

stripe prices create \
  --product prod_ABC123 \
  --unit-amount 4900 \
  --currency eur \
  --recurring[interval]=month
```

### 2. Configurer le Webhook Stripe

1. **Aller dans Stripe Dashboard**
   - https://dashboard.stripe.com/webhooks

2. **Ajouter un endpoint**
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Description: "RT Backend Webhook"

3. **Sélectionner les événements**
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

4. **Copier le Webhook Secret**
   - Ajouter `STRIPE_WEBHOOK_SECRET` dans EB Environment Properties

## 🧪 Tests Post-Déploiement

### 1. Health Check
```bash
curl https://your-domain.com/health
```

Réponse attendue:
```json
{
  "status": "healthy",
  "features": [
    "jwt-authentication",
    "stripe-payments",
    "pricing-grids",
    "industrial-transport-config",
    "carrier-referencing",
    "account-types",
    "ecmr"
  ],
  "mongodb": {
    "connected": true,
    "status": "active"
  }
}
```

### 2. Test Inscription (Register)
```bash
curl -X POST https://your-domain.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "companyName": "Test Company",
    "role": "carrier"
  }'
```

### 3. Test Login
```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123"
  }'
```

### 4. Test Endpoint Protégé
```bash
# Remplacer TOKEN par le accessToken obtenu du login
curl https://your-domain.com/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

### 5. Test Liste Produits Stripe (Public)
```bash
curl https://your-domain.com/api/stripe/products
```

### 6. Test Création Checkout (Authentifié)
```bash
curl -X POST https://your-domain.com/api/stripe/create-checkout-session \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_1234567890"
  }'
```

## 📊 Collections MongoDB à Créer

Les collections suivantes seront automatiquement créées lors de la première utilisation:

### Nouvelles Collections (v2.6.0)
- `users` - Comptes utilisateurs avec mots de passe hachés
- `refresh_tokens` - Tokens JWT de rafraîchissement
- `checkout_sessions` - Sessions de paiement Stripe
- `payment_intents` - Intentions de paiement
- `subscription_events` - Événements d'abonnement
- `invoices` - Factures Stripe
- `stripe_webhooks` - Historique des webhooks Stripe

### Collections Existantes (Conservées)
- `ecmr_documents` - Documents e-CMR
- `account_types` - Types de comptes
- `carriers` - Transporteurs
- `pricing_grids` - Grilles de prix
- `industrial_transport_configs` - Configurations transport industriel

## 🔄 Rollback en Cas de Problème

### Via Console AWS
1. Aller dans Elastic Beanstalk Console
2. Sélectionner l'environnement
3. Cliquer sur "Actions" → "Restore Previous Version"
4. Sélectionner v2.4.0 ou v2.5.0
5. Confirmer le rollback

### Via EB CLI
```bash
# Lister les versions disponibles
eb appversion lifecycle --print

# Rollback vers v2.4.0
eb deploy --version v2.4.0
```

## 📝 API Endpoints - Récapitulatif

### Authentication (JWT) - 6 endpoints
- `POST /api/auth/register` - Créer un compte utilisateur
- `POST /api/auth/login` - Se connecter (obtenir tokens JWT)
- `POST /api/auth/refresh` - Rafraîchir access token
- `POST /api/auth/logout` - Se déconnecter (révoquer refresh token)
- `GET /api/auth/me` - Obtenir profil utilisateur (auth requis)
- `PUT /api/auth/change-password` - Changer mot de passe (auth requis)

### Stripe Payments - 8 endpoints
- `POST /api/stripe/create-checkout-session` - Créer checkout Stripe (auth)
- `POST /api/stripe/create-payment-intent` - Créer payment intent (auth)
- `GET /api/stripe/subscriptions` - Liste abonnements utilisateur (auth)
- `POST /api/stripe/cancel-subscription` - Annuler abonnement (auth)
- `GET /api/stripe/payment-history` - Historique paiements (auth)
- `POST /api/stripe/webhook` - Webhook Stripe (NO auth)
- `GET /api/stripe/products` - Liste produits Stripe (public)

### Autres Features (Conservées)
- 10 endpoints e-CMR
- 7 endpoints Account Types
- 10 endpoints Carrier Referencing
- 12 endpoints Pricing Grids
- 5 endpoints Industrial Transport Config

**Total**: 58 endpoints REST API

## 🎯 Checklist Finale

- [ ] Bundle ZIP créé (56 KB)
- [ ] Variables d'environnement JWT configurées dans EB
- [ ] Variables d'environnement Stripe configurées dans EB
- [ ] MONGODB_URI configuré et testé
- [ ] Bundle uploadé sur Elastic Beanstalk
- [ ] Déploiement réussi (statut Green)
- [ ] Health check répond avec toutes les features
- [ ] Test register/login fonctionne
- [ ] Produits créés dans Stripe Dashboard
- [ ] Webhook Stripe configuré avec la bonne URL
- [ ] STRIPE_WEBHOOK_SECRET ajouté dans EB
- [ ] Tests endpoints authentifiés fonctionnent
- [ ] Tests endpoints Stripe fonctionnent
- [ ] Documentation API mise à jour

## 📞 Support

En cas de problème:
1. Vérifier les logs: `eb logs --stream`
2. Vérifier le statut: `eb status`
3. Vérifier les variables d'environnement dans AWS Console
4. Tester les endpoints avec curl
5. Vérifier la configuration Stripe Webhook

## 🏆 Succès Déploiement

Une fois déployé avec succès, vous aurez:
- ✅ API REST complète avec 58 endpoints
- ✅ Authentification JWT sécurisée
- ✅ Intégration Stripe complète
- ✅ Toutes les fonctionnalités v2.4.0 + v2.5.0
- ✅ Gestion des abonnements automatisée
- ✅ Webhooks Stripe configurés

**Version**: v2.6.0
**Date**: 25 novembre 2024
**Status**: Prêt pour déploiement ✅
