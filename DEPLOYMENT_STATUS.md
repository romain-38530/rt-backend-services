# RT Backend Services - État du Déploiement

**Date:** 2025-11-23  
**Région:** EU-Central-1 (Frankfurt)  
**Platform:** Node.js 20 / Amazon Linux 2023

---

## ✅ Services Fonctionnels (3/7)

### 1. Authz (Authentication)
- **URL:** http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Status:** ✅ **OPÉRATIONNEL**
- **MongoDB:** rt-auth (connecté)
- **Test:** `curl http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/health`
- **Résultat:** Status healthy, MongoDB active

### 2. Notifications
- **URL:** http://rt-notifications-api-prod.eba-usjgee8u.eu-central-1.elasticbeanstalk.com
- **Status:** ✅ **OPÉRATIONNEL**
- **MongoDB:** rt-notifications (connecté)
- **Mailgun:** Configuré (API key à valider)
- **Features:** Express, MongoDB, Mailgun, CORS, Helmet
- **Endpoints:**
  - `GET /health`
  - `GET /api/notifications`
  - `POST /api/notifications/email`

### 3. Geo-Tracking
- **URL:** http://rt-geo-tracking-api-prod.eba-3mi2pcfi.eu-central-1.elasticbeanstalk.com
- **Status:** ✅ **OPÉRATIONNEL & TESTÉ**
- **MongoDB:** rt-geotracking (connecté)
- **Features:** Express, MongoDB (2dsphere indexes), CORS, Helmet
- **Endpoints:**
  - `GET /health`
  - `GET /api/tracking` - Liste positions
  - `POST /api/tracking/position` - Enregistrer position
  - `GET /api/tracking/:vehicleId/history` - Historique
- **Test réussi:** Position TEST-TRUCK-001 enregistrée à Paris

---

## ⚠️ Services Partiels (1/7)

### 4. Orders
- **URL:** http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com
- **Status:** ⚠️ **PARTIELLEMENT OPÉRATIONNEL**
- **MongoDB:** rt-orders
- **Response:** `{"status":"ok","message":"RT Orders API is running"}`
- **Note:** Ancien code déployé, fonctionne mais pas la version standalone

---

## ❌ Services en Erreur (3/7)

### 5. Planning
- **URL:** http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com
- **Status:** ❌ **502 BAD GATEWAY**
- **MongoDB:** rt-planning
- **Action requise:** Redéployer avec code standalone

### 6. eCMR
- **URL:** http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com
- **Status:** ❌ **502 BAD GATEWAY**
- **MongoDB:** rt-ecmr
- **Action requise:** Redéployer avec code standalone

### 7. Palettes
- **URL:** http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com
- **Status:** ❌ **502 BAD GATEWAY**
- **MongoDB:** rt-palettes
- **Action requise:** Redéployer avec code standalone

---

## 📝 Configuration Admin Gateway

Fichier créé: **[services/admin-gateway/.env.production](services/admin-gateway/.env.production)**

Toutes les URLs sont configurées et prêtes pour le gateway.

---

## 🔧 Prochaines Actions

### Priorité 1: Corriger les 502
Les services Planning, eCMR et Palettes ont besoin d'être redéployés avec le code standalone.

**Problème identifié:** 
- Les environnements existent mais le déploiement via `eb deploy` échoue avec "No Application Version found"
- Cause probable: Incompatibilité entre l'init EB local et l'environnement AWS existant

**Solutions possibles:**

#### Option A: Recréer les environnements
```bash
# 1. Supprimer l'environnement existant
aws elasticbeanstalk terminate-environment --environment-name rt-planning-api-prod

# 2. Créer un nouvel environnement avec le code standalone
cd services/planning-eb
eb init -p "Node.js 20" -r eu-central-1 rt-planning-api
eb create rt-planning-api-prod --instance-type t3.micro --single
eb setenv MONGODB_URI="..." NODE_ENV="production" CORS_ALLOWED_ORIGINS="..."
```

#### Option B: Déployer via AWS Console
1. Aller dans AWS Elastic Beanstalk Console
2. Créer une archive zip du code standalone (index.js, package.json, Procfile)
3. Upload manuel de la nouvelle version
4. Configurer les variables d'environnement

#### Option C: Utiliser AWS CLI directement
```bash
# Créer l'archive
cd services/planning-eb
zip -r app.zip index.js package.json Procfile

# Upload via S3
aws s3 cp app.zip s3://elasticbeanstalk-eu-central-1-004843574253/planning-app.zip

# Créer version application
aws elasticbeanstalk create-application-version \
  --application-name rt-planning-api \
  --version-label v1-standalone \
  --source-bundle S3Bucket="elasticbeanstalk-eu-central-1-004843574253",S3Key="planning-app.zip"

# Déployer
aws elasticbeanstalk update-environment \
  --environment-name rt-planning-api-prod \
  --version-label v1-standalone
```

### Priorité 2: Valider Mailgun
Compléter la clé API Mailgun pour tester l'envoi d'emails.

### Priorité 3: Tests end-to-end
Tester tous les services via l'admin-gateway une fois tous opérationnels.

---

## 📊 Score de Déploiement

**Services déployés:** 7/7 (100%)  
**Services fonctionnels:** 3/7 (43%)  
**Services testés:** 3/7 (43%)

---

## 🗂️ Fichiers Créés

1. **[DEPLOYED_SERVICES.md](DEPLOYED_SERVICES.md)** - Liste des services avec URLs
2. **[DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md)** - Ce fichier
3. **[services/admin-gateway/.env.production](services/admin-gateway/.env.production)** - Config gateway
4. **[create-eb-service.sh](create-eb-service.sh)** - Script génération services
5. **Services standalone:**
   - `services/authz-eb/` ✅
   - `services/notifications-eb/` ✅
   - `services/geo-tracking-eb/` ✅
   - `services/orders-eb/` ⚠️
   - `services/planning-eb/` ❌
   - `services/ecmr-eb/` ❌
   - `services/palettes-eb/` ❌

---

**Infrastructure AWS:**
- Account ID: 004843574253
- S3 Bucket: elasticbeanstalk-eu-central-1-004843574253
- MongoDB Cluster: stagingrt.v2jnoh2.mongodb.net
- IP autorisée: 52.58.139.176/32 (authz), 18.198.222.179 (geo-tracking)
