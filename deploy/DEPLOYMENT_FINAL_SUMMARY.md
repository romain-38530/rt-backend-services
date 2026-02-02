# 🎉 SYMPHONIA PLATFORM v2.2.0 - PRÊT POUR DÉPLOIEMENT AWS

**Date:** 2026-02-01 23:15
**Status:** ✅ **TOUT EST PRÊT**

---

## 📦 PACKAGES CRÉÉS

Tous les packages backend sont prêts et optimisés:

```
deploy/packages/
├── tms-sync-eb.zip          358 KB ✅
├── authz-eb.zip             214 KB ✅
└── affret-ia-api-v2.zip      93 KB ✅
───────────────────────────────────
Total:                       665 KB
```

---

## 🚀 DÉPLOIEMENT EN 3 COMMANDES

### Option A: Déploiement Rapide (Recommandé)

```bash
# 1. Éditer la configuration
nano .env.deploy.local

# 2. Lancer le déploiement
bash scripts/quick-deploy.sh
```

**Temps:** 15-20 minutes (première fois)

### Option B: Déploiement Manuel

```bash
# 1. Copier et éditer la configuration
cp .env.deploy .env.deploy.local
nano .env.deploy.local

# 2. Charger les variables
source .env.deploy.local

# 3. Déployer
bash scripts/deploy-aws.sh
```

---

## ⚙️ CONFIGURATION REQUISE

### Variables Minimales (.env.deploy.local)

```bash
# MongoDB (OBLIGATOIRE)
export MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true"

# Alertes (OBLIGATOIRE)
export ALERT_SMS_NUMBER="+33612345678"
export ALERT_EMAIL="admin@symphonia.com"

# Sécurité (OBLIGATOIRE)
export JWT_SECRET=$(openssl rand -base64 32)

# Région AWS (optionnel)
export AWS_REGION="eu-west-3"
```

### Variables Optionnelles

```bash
# Email SES
export SES_DOMAIN="symphonia-controltower.com"
export SES_FROM_EMAIL="ne-pas-repondre@symphonia.com"

# Redis ElastiCache (fallback mémoire si non fourni)
export REDIS_URL="redis://cache-url:6379"

# TMS APIs
export DASHDOC_API_KEY="your-key"
export TRANSPOREON_API_KEY="your-key"
```

---

## 🎯 CE QUI SERA DÉPLOYÉ

### 1. TMS Sync EB
**URL:** `http://symphonia-tms-sync-eb-prod.{region}.elasticbeanstalk.com`

**Fonctionnalités:**
- ✅ Cache Redis avec fallback mémoire automatique
- ✅ Monitoring système (toutes les 5 min)
- ✅ Détection 3 types d'anomalies: NO_SYNC, SLOW_SYNC, SYNC_ERROR
- ✅ Alertes SMS via AWS SNS
- ✅ Alertes Email HTML via AWS SES
- ✅ Métriques CloudWatch (4 metrics)
- ✅ Collection MongoDB: `monitoring_logs`

**Endpoints:**
```bash
GET /health
GET /api/v1/monitoring/status
GET /api/v1/cache/stats
GET /api/v1/cache/invalidate
GET /api/v1/tms/connections/:id
GET /api/v1/tms/orders/filtered
```

---

### 2. Authz EB
**URL:** `http://symphonia-authz-eb-prod.{region}.elasticbeanstalk.com`

**Fonctionnalités:**
- ✅ Webhooks carriers (HMAC-SHA256, 6 événements)
- ✅ Email metrics (5 endpoints analytics)
- ✅ Carrier scoring (leaderboard, benchmark, trends)
- ✅ Alertes SMS documents expirants (daily 9h, 4 urgences)
- ✅ Métriques CloudWatch (7 metrics)
- ✅ 4 collections MongoDB

**Endpoints:**
```bash
# Core
GET /health

# Webhooks
POST   /api/carriers/:id/webhooks
GET    /api/carriers/:id/webhooks
DELETE /api/carriers/:id/webhooks/:webhookId
POST   /api/carriers/:id/webhooks/:webhookId/test

# Email Metrics
GET  /api/email-metrics/stats
GET  /api/email-metrics/timeline
GET  /api/email-metrics/by-type
GET  /api/email-metrics/failed
POST /api/email-metrics/retry/:emailId

# Carrier Scoring
GET /api/v1/carriers/leaderboard
GET /api/v1/carriers/:id/score
GET /api/v1/carriers/:id/score-history
GET /api/v1/carriers/:id/benchmark
```

---

### 3. Affret IA API v2
**URL:** `http://symphonia-affret-ia-api-v2-prod.{region}.elasticbeanstalk.com`

**Fonctionnalités:**
- ✅ Analytics conversion (funnel complet)
- ✅ Blockers analysis (4 types)
- ✅ Timeline activations par jour
- ✅ Journey tracking individuel
- ✅ Métriques CloudWatch (4 metrics)
- ✅ Collection MongoDB: `affretia_trial_tracking`

**Endpoints:**
```bash
GET /health
GET /api/v1/affretia/analytics/conversion
GET /api/v1/affretia/analytics/blockers
GET /api/v1/affretia/analytics/timeline
GET /api/v1/affretia/analytics/carriers/:id/journey
```

---

## 🗄️ MONGODB - 6 Collections

Le script configure automatiquement MongoDB avec:

### rt-technologie
- `monitoring_logs` (3 indexes)

### rt-authz
- `notification_logs` (4 indexes)
- `carrier_webhooks` (3 indexes)
- `webhook_deliveries` (4 indexes)
- `email_logs` (8 indexes)

### affretia
- `affretia_trial_tracking` (6 indexes)

**Configuration manuelle:**
```bash
mongosh "$MONGODB_URI" < scripts/setup-mongodb-standalone.js
```

---

## ☁️ AWS SERVICES CONFIGURÉS

Le script configure automatiquement:

### AWS SES (Email)
- ✅ Vérification domaine
- ✅ Vérification email sender
- ✅ Check quota (Sandbox → Production)

### AWS SNS (SMS)
- ✅ Création topic `symphonia-alerts`
- ✅ Abonnement SMS
- ✅ Configuration SMS transactionnel

### AWS S3
- ✅ Bucket pour packages avec versioning
- ✅ Upload automatique des 3 packages

### AWS Elastic Beanstalk
- ✅ 3 applications créées
- ✅ 3 environnements de production
- ✅ Auto-scaling configuré (1-4 instances)
- ✅ Load balancer
- ✅ Health monitoring activé

### AWS CloudWatch
- ✅ 15+ métriques custom
- ✅ Logs centralisés
- ✅ Prêt pour dashboards et alarmes

---

## 📊 MÉTRIQUES CLOUDWATCH

### TMS Sync
- `TMS/SyncDuration` (Milliseconds)
- `TMS/TransportsSynced` (Count)
- `TMS/SyncSuccess` (1 ou 0)
- `TMS/SyncErrors` (Count)

### Documents (Authz)
- `Documents/Uploaded` (Count)
- `Documents/Verified` (Count)
- `Documents/Expired` (Count)
- `Documents/OCRSuccess` (1 ou 0)

### Emails (Authz)
- `Emails/Sent` (Count)
- `Emails/Delivered` (Count)
- `Emails/Bounced` (Count)
- `Emails/Failed` (Count)

### Affret.IA
- `AffretIA/TrialActivations` (Count)
- `AffretIA/Upgrades` (Count)
- `AffretIA/MatchingDuration` (Milliseconds)
- `AffretIA/MatchingResults` (Count)

---

## ✅ VALIDATION POST-DÉPLOIEMENT

### Automatique

Le script effectue automatiquement:
- ✅ Health checks sur chaque service
- ✅ Vérification URL environnements
- ✅ Test endpoints principaux
- ✅ Génération rapport de déploiement

### Manuelle

```bash
# TMS Sync
curl http://{tms-url}/api/v1/monitoring/status | jq

# Authz
curl http://{authz-url}/api/email-metrics/stats | jq
curl http://{authz-url}/api/v1/carriers/leaderboard | jq

# Affret IA
curl http://{affretia-url}/api/v1/affretia/analytics/conversion | jq
```

### CloudWatch Logs

Vérifier les logs:
```bash
aws logs tail /aws/elasticbeanstalk/symphonia-tms-sync-eb-prod/var/log/nodejs/nodejs.log --follow
```

---

## 🔄 CRON JOBS ACTIFS

### Authz EB

**Job 1: Alertes Vigilance**
- **Schedule:** Tous les jours à 8h00 (Paris)
- **Fonction:** `checkAndSendVigilanceAlerts()`
- **Action:** Vérifie documents expirant à J-30, J-15, J-7
- **Output:** Emails d'alerte aux carriers

**Job 2: Alertes SMS Documents**
- **Schedule:** Tous les jours à 9h00 (Paris)
- **Fonction:** `runDocumentExpiryAlerts()`
- **Action:** Vérifie documents expirant à J-0, J-1, J-3, J-7
- **Output:** SMS via SNS (rate limited 1/s)

### TMS Sync EB

**Job 3: Monitoring TMS**
- **Schedule:** Toutes les 5 minutes
- **Fonction:** `runMonitoringCheck()`
- **Action:** Détecte anomalies (NO_SYNC, SLOW_SYNC, SYNC_ERROR)
- **Output:** SMS + Email si anomalie critique

---

## 📚 DOCUMENTATION COMPLÈTE

### Scripts Disponibles

```bash
scripts/
├── deploy-aws.sh                    # Déploiement complet AWS
├── quick-deploy.sh                  # Déploiement rapide guidé
├── setup-mongodb-standalone.js      # Setup MongoDB manuel
├── deploy-local.bat                 # Création packages Windows
└── README_DEPLOY.md                 # Guide détaillé
```

### Documentation

```
├── .env.deploy                      # Template configuration
├── deploy/
│   ├── QUICK_START.md              # Guide rapide (5 min)
│   ├── DEPLOYMENT_REPORT.md        # Rapport détaillé (15 pages)
│   └── packages/                   # Packages prêts
├── DEPLOYMENT_GUIDE.md             # Guide complet (1200+ lignes)
└── README.md                       # README principal
```

---

## 💰 COÛTS ESTIMÉS AWS

### Infrastructure de Base

**Par Service (t3.small + Load Balancer):**
- Instance EC2 t3.small: ~$15/mois
- Application Load Balancer: ~$20/mois
- CloudWatch Logs (5 Go): ~$2.50/mois
- Data Transfer (10 Go): ~$0.90/mois

**Sous-total par service:** ~$38/mois

**3 Services:** ~$114/mois

### Services Complémentaires

- **MongoDB Atlas M10:** ~$57/mois
- **Redis ElastiCache (cache.t3.micro):** ~$12/mois
- **S3 (100 Go):** ~$2.30/mois
- **SES (10,000 emails/mois):** ~$1
- **SNS (1,000 SMS/mois):** ~$8

**Total estimé:** ~$194/mois

### Optimisations Possibles

- Utiliser t3.micro en staging: **-50%**
- Auto-scaling intelligent: **-20%**
- Reserved Instances (1 an): **-30%**
- Arrêter staging la nuit: **-25%**

**Total optimisé:** ~$97-120/mois

---

## 🧪 TESTS DISPONIBLES

### Tests E2E (Local)

```bash
# Tous les tests
npm run test:e2e

# Tests individuels
npm run test:e2e:monitoring      # Système monitoring
npm run test:e2e:cache           # Cache Redis
npm run test:e2e:dashboards      # Dashboards APIs
npm run test:e2e:analytics       # Analytics Affret.IA
npm run test:e2e:workflow        # Workflow complet
```

### Scripts de Test Backend

```bash
cd services/authz-eb

# Tester webhooks
node scripts/test-webhooks.cjs

# Tester email metrics
node scripts/test-email-metrics.cjs

# Inviter transporteurs test
node scripts/invite-test-carriers.cjs
```

---

## 🎨 DASHBOARDS FRONTEND

**Status:** ⚠️ Nécessite installation dépendances

### Installation

```bash
cd rt-frontend-apps/apps/web-transporter
npm install @chakra-ui/react react-icons react-leaflet leaflet
npm run build
```

### Dashboards Créés

1. **Email Metrics** (`/admin/email-metrics`)
   - 4 tabs: Overview, Delivery, Campaign, Failed
   - 5 KPI cards + 3 charts SVG
   - Auto-refresh 30s

2. **Carrier Scoring** (`/admin/carrier-scoring`)
   - 4 tabs: Leaderboard, My Score, Benchmark, Trends
   - Gauge chart + Radar chart + Line chart
   - Filtres: level, status, sortBy

3. **TMS Real-Time** (`/admin/tms-realtime`)
   - 4 tabs: Live Transports, Connections, Sync History, GPS Map
   - 5 status cards auto-refresh
   - React-Leaflet map avec clustering

---

## 📞 SUPPORT & TROUBLESHOOTING

### Logs de Déploiement

Tous les détails dans:
```
deploy/deploy_aws_YYYYMMDD_HHMMSS.log
```

### Problèmes Courants

**1. AWS credentials non configurées**
```bash
aws configure
```

**2. MongoDB connection failed**
```bash
# Vérifier URI
mongosh "$MONGODB_URI"

# Whitelist IP dans MongoDB Atlas
```

**3. SES domain not verified**
```bash
# Ajouter DNS TXT records fournis par AWS
aws ses get-identity-verification-attributes --identities $SES_DOMAIN
```

**4. Environment health = Degraded**
```bash
# Voir logs
aws logs tail /aws/elasticbeanstalk/{env-name}/var/log/nodejs/nodejs.log --follow
```

### Ressources

- **Guide complet:** [scripts/README_DEPLOY.md](../scripts/README_DEPLOY.md)
- **Guide rapide:** [QUICK_START.md](./QUICK_START.md)
- **Rapport détaillé:** [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md)

---

## 🎯 CHECKLIST FINALE

### Avant Déploiement
- [ ] AWS CLI configuré (`aws sts get-caller-identity`)
- [ ] MongoDB URI accessible
- [ ] `.env.deploy.local` rempli
- [ ] Packages créés (`deploy/packages/*.zip`)
- [ ] SES domaine vérifié (ou en cours)
- [ ] SMS credits AWS suffisants

### Pendant Déploiement
- [ ] Variables chargées (`source .env.deploy.local`)
- [ ] Script lancé (`bash scripts/quick-deploy.sh`)
- [ ] Attendre fin (15-20 min première fois)
- [ ] Vérifier logs (`deploy/deploy_aws_*.log`)

### Après Déploiement
- [ ] Health checks OK sur 3 services
- [ ] Collections MongoDB créées (6)
- [ ] SES production access demandé
- [ ] CloudWatch metrics visibles
- [ ] Tests E2E locaux passent
- [ ] Dashboards CloudWatch créés
- [ ] Alarmes CloudWatch configurées
- [ ] URLs production documentées

---

## 🚀 LANCEMENT

Vous êtes prêt! Pour déployer:

```bash
# Éditer la configuration
nano .env.deploy.local

# Déployer
bash scripts/quick-deploy.sh
```

**C'est parti!** 🎉

---

**Version:** 2.2.0
**Date:** 2026-02-01
**Préparé par:** Claude Sonnet 4.5
**Status:** ✅ Production Ready
