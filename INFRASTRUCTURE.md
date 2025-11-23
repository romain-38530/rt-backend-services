# RT Technologie - Référentiel Infrastructure

Documentation complète de l'infrastructure AWS et MongoDB pour RT Technologie.

## Table des matières

- [MongoDB Atlas](#mongodb-atlas)
- [AWS Elastic Beanstalk - APIs Backend](#aws-elastic-beanstalk---apis-backend)
- [AWS Amplify - Applications Frontend](#aws-amplify---applications-frontend)
- [Variables d'environnement](#variables-denvironnement)
- [Guide de déploiement](#guide-de-déploiement)

---

## MongoDB Atlas

### Cluster Principal

**Nom du cluster:** `stagingrt`
**Type:** M0 (Free Tier)
**Région:** Frankfurt (eu-central-1)
**Provider:** AWS

**Connection String:**
```
mongodb+srv://stagingrt.v2jnoh2.mongodb.net/
```

### Authentification

**Utilisateur:** `rt_admin`
**Mot de passe:** `RtAdmin2024`
**Rôle:** readWriteAnyDatabase

**Connection String complète:**
```
mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/
```

### Bases de données

| Base de données | Description | API associée |
|----------------|-------------|--------------|
| `rt-auth` | Authentification et utilisateurs | api-auth |
| `rt-orders` | Gestion des commandes | api-orders |
| `rt-planning` | Planification et ordonnancement | api-planning |
| `rt-ecmr` | CMR électronique | api-ecmr |
| `rt-palettes` | Gestion des palettes | api-palettes |
| `rt-storage` | Stockage et inventaire | api-storage |
| `rt-chatbot` | Chatbot et historique conversations | api-chatbot |

### Accès MongoDB

**MongoDB Compass:**
- Host: `stagingrt.v2jnoh2.mongodb.net`
- Authentication: Username/Password
- Username: `rt_admin`
- Password: `RtAdmin2024`
- Authentication Database: `admin`

**Atlas Dashboard:**
- URL: https://cloud.mongodb.com
- Organization: RT Technologie
- Project: RT Backend Services

---

## AWS Elastic Beanstalk - APIs Backend

### Région AWS
**Région:** eu-central-1 (Frankfurt)
**Type d'instance:** t3.micro
**Configuration:** Single instance (non load-balanced)

### APIs Déployées

#### 1. API Authentication (api-auth)

**Environment:** `rt-auth-api-prod`
**URL:** http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com
**Port:** 3000
**Database:** `rt-auth`
**Status:** ✅ Deployed

**Endpoints principaux:**
- `POST /api/auth/register` - Inscription utilisateur
- `POST /api/auth/login` - Connexion utilisateur
- `POST /api/auth/refresh` - Rafraîchir le token
- `GET /api/auth/me` - Profil utilisateur
- `POST /api/auth/logout` - Déconnexion

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority
JWT_SECRET=rt-super-secret-jwt-key-2024
JWT_EXPIRES_IN=7d
PORT=3000
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 2. API Orders (api-orders)

**Environment:** `rt-orders-api-prod`
**URL:** http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com
**Port:** 3030
**Database:** `rt-orders`
**Status:** ✅ Deployed

**Endpoints principaux:**
- `GET /api/v1/orders` - Liste des commandes
- `POST /api/v1/orders` - Créer une commande
- `GET /api/v1/orders/:id` - Détails commande
- `PUT /api/v1/orders/:id` - Modifier commande
- `DELETE /api/v1/orders/:id` - Supprimer commande

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-orders?retryWrites=true&w=majority
PORT=3030
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 3. API Planning (api-planning)

**Environment:** `rt-planning-api-prod`
**URL:** http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com
**Port:** 3040
**Database:** `rt-planning`
**Status:** ✅ Deployed

**Endpoints principaux:**
- `GET /api/v1/planning` - Plans de production
- `POST /api/v1/planning` - Créer un plan
- `GET /api/v1/planning/:id` - Détails du plan
- `PUT /api/v1/planning/:id` - Modifier le plan
- `DELETE /api/v1/planning/:id` - Supprimer le plan

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-planning?retryWrites=true&w=majority
PORT=3040
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 4. API eCMR (api-ecmr)

**Environment:** `rt-ecmr-api-prod`
**URL:** http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com
**Port:** 3050
**Database:** `rt-ecmr`
**Status:** ✅ Deployed

**Endpoints principaux:**
- `GET /api/v1/ecmr` - Liste des CMR électroniques
- `POST /api/v1/ecmr` - Créer un CMR
- `GET /api/v1/ecmr/:id` - Détails du CMR
- `PUT /api/v1/ecmr/:id` - Modifier le CMR
- `POST /api/v1/ecmr/:id/sign` - Signer le CMR

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-ecmr?retryWrites=true&w=majority
PORT=3050
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 5. API Palettes (api-palettes)

**Environment:** `rt-palettes-api-prod`
**URL:** http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com
**Port:** 3055
**Database:** `rt-palettes`
**Status:** ✅ Deployed

**Endpoints principaux:**
- `GET /api/v1/palettes` - Liste des palettes
- `POST /api/v1/palettes` - Créer une palette
- `GET /api/v1/palettes/:id` - Détails palette
- `PUT /api/v1/palettes/:id` - Modifier palette
- `POST /api/v1/palettes/:id/track` - Tracker la palette

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-palettes?retryWrites=true&w=majority
PORT=3055
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 6. API Storage (api-storage)

**Environment:** `rt-storage-api-prod`
**URL:** ⏳ Pending (EIP quota limit)
**Port:** 3060
**Database:** `rt-storage`
**Status:** ⏳ Pending deployment

**Note:** Déploiement en attente d'augmentation du quota Elastic IP AWS.

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-storage?retryWrites=true&w=majority
PORT=3060
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

#### 7. API Chatbot (api-chatbot)

**Environment:** `rt-chatbot-api-prod`
**URL:** ⏳ Pending (EIP quota limit)
**Port:** 3070
**Database:** `rt-chatbot`
**Status:** ⏳ Pending deployment

**Note:** Déploiement en attente d'augmentation du quota Elastic IP AWS.

**Variables d'environnement requises:**
```bash
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-chatbot?retryWrites=true&w=majority
PORT=3070
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com
```

---

## AWS Amplify - Applications Frontend

### Applications déployées

#### 1. Backoffice Admin

**App ID:** `dntbizetlc7bm`
**URL:** https://main.dntbizetlc7bm.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/backoffice-admin

**Variables d'environnement:**
```bash
NEXT_PUBLIC_AUTHZ_URL=http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com/api/auth
NEXT_PUBLIC_ORDERS_API=http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com/api/v1/orders
NEXT_PUBLIC_PLANNING_API=http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com/api/v1/planning
NEXT_PUBLIC_ECMR_API=http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com/api/v1/ecmr
NEXT_PUBLIC_PALETTE_API_URL=http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com/api/v1/palettes
NEXT_PUBLIC_STORAGE_API=http://placeholder-storage-api.rt-technologie.com/api/v1/storage
NEXT_PUBLIC_CHATBOT_API=http://placeholder-chatbot-api.rt-technologie.com/api/v1/chatbot
```

#### 2. Industry Portal

**App ID:** `d3b6p09ihn5w7r`
**URL:** https://main.d3b6p09ihn5w7r.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-industry

#### 3. Supplier Portal

**App ID:** `d36m1c29p3akv7`
**URL:** https://main.d36m1c29p3akv7.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-supplier

#### 4. Recipient Portal

**App ID:** `d1rvxvgibz9pn8`
**URL:** https://main.d1rvxvgibz9pn8.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-recipient

#### 5. Transporter Portal

**App ID:** `d2z1x9kqixe4zw`
**URL:** https://main.d2z1x9kqixe4zw.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-transporter

#### 6. Logistician Portal

**App ID:** `d19uh4qzdxoqg3`
**URL:** https://main.d19uh4qzdxoqg3.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-logistician

#### 7. Forwarder Portal

**App ID:** `d2jjdlx33qmgf9`
**URL:** https://main.d2jjdlx33qmgf9.amplifyapp.com
**Repository:** romain-38530/rt-frontend-apps
**Branch:** main
**Path:** apps/web-forwarder

---

## Variables d'environnement

### Configuration locale (.env)

Chaque API doit avoir un fichier `.env` avec la structure suivante:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/{database_name}?retryWrites=true&w=majority

# API Port
PORT={api_port}

# CORS
CORS_ORIGIN=https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.d36m1c29p3akv7.amplifyapp.com,https://main.d1rvxvgibz9pn8.amplifyapp.com,https://main.d2z1x9kqixe4zw.amplifyapp.com,https://main.d19uh4qzdxoqg3.amplifyapp.com,https://main.d2jjdlx33qmgf9.amplifyapp.com

# JWT (pour api-auth uniquement)
JWT_SECRET=rt-super-secret-jwt-key-2024
JWT_EXPIRES_IN=7d
```

### Configuration Elastic Beanstalk

Les variables d'environnement sont configurées via:
```bash
eb setenv MONGODB_URI="..." PORT="..." CORS_ORIGIN="..."
```

Ou via la console AWS:
1. Elastic Beanstalk Console
2. Sélectionner l'environnement
3. Configuration > Software
4. Environment properties

---

## Guide de déploiement

### Prérequis

```bash
# AWS CLI
aws --version

# EB CLI
eb --version

# Node.js 20
node --version
```

### Déployer une API

```bash
# 1. Naviguer vers l'API
cd services/{api-name}

# 2. Initialiser EB (première fois uniquement)
eb init -p "Node.js 20" -r eu-central-1

# 3. Créer l'environnement (première fois uniquement)
eb create rt-{api-name}-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 4. Configurer les variables d'environnement
eb setenv MONGODB_URI="mongodb+srv://..." PORT="3000" CORS_ORIGIN="..."

# 5. Déployer
eb deploy

# 6. Vérifier le statut
eb status

# 7. Voir les logs
eb logs
```

### Mettre à jour les variables d'environnement

```bash
# Via EB CLI
eb setenv KEY1=VALUE1 KEY2=VALUE2

# Vérifier les variables
eb printenv
```

### Redéployer après modification du code

```bash
# 1. Commit les changements
git add .
git commit -m "Description des changements"

# 2. Déployer sur EB
eb deploy

# 3. Pousser sur GitHub
git push origin main
```

### Monitoring

```bash
# Status de l'environnement
eb status

# Logs en temps réel
eb logs --stream

# Logs spécifiques
eb logs -cw enable  # Active CloudWatch

# Health
eb health
```

### Troubleshooting

**Problème:** npm install échoue
**Solution:** Vérifier que `.npmrc` contient:
```
legacy-peer-deps=true
workspaces=false
```

**Problème:** Build TypeScript échoue
**Solution:** Vérifier que `.ebignore` n'exclut pas `src/` et `tsconfig.json`

**Problème:** Quota EIP atteint
**Solution:** Demander une augmentation via AWS Service Quotas Console

**Problème:** CORS errors
**Solution:** Vérifier que `CORS_ORIGIN` contient toutes les URLs Amplify

---

## Sécurité

### Credentials MongoDB

⚠️ **IMPORTANT:** Ne jamais commiter les credentials MongoDB dans le code.

Les credentials sont stockés:
- Localement: fichiers `.env` (gitignorés)
- AWS EB: Environment Properties
- AWS Amplify: Environment Variables

### Rotation des secrets

Pour changer le mot de passe MongoDB:
1. MongoDB Atlas > Database Access > Edit User
2. Mettre à jour `MONGODB_URI` dans toutes les APIs EB
3. Mettre à jour les variables Amplify si nécessaire
4. Redéployer les applications

### JWT Secret

Le `JWT_SECRET` utilisé pour l'authentification doit être:
- Unique par environnement
- Au moins 32 caractères
- Stocké uniquement dans les variables d'environnement
- Changé régulièrement en production

---

## Support et maintenance

### Contacts AWS

**Compte AWS:** {aws_account_id}
**Région principale:** eu-central-1
**Support Plan:** Basic (upgrade recommandé pour Production)

### Contacts MongoDB Atlas

**Organization:** RT Technologie
**Support:** support@mongodb.com
**Tier:** M0 Free (upgrade recommandé pour Production)

### Limites actuelles

| Resource | Limite actuelle | Limite nécessaire | Action |
|----------|----------------|-------------------|---------|
| Elastic IPs | 5 | 10 | Demande de quota en cours |
| MongoDB Storage | 512 MB | 10 GB | Upgrade à M10 recommandé |
| Amplify builds | 1000/mois | OK | - |
| EB Environments | 10 | 7 utilisés | OK |

---

## Changelog

### 2024-11-23
- ✅ Déploiement initial de 5/7 APIs sur Elastic Beanstalk
- ✅ Configuration MongoDB Atlas cluster
- ✅ Déploiement de 7 applications Amplify
- ⏳ api-storage et api-chatbot en attente quota EIP

---

**Document mis à jour le:** 2024-11-23
**Version:** 1.0.0
**Auteur:** RT Technologie DevOps Team
