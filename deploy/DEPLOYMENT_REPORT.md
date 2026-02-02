# RAPPORT DE DÉPLOIEMENT - SYMPHONIA PLATFORM v2.2.0

**Date:** 2026-02-01
**Version:** 2.2.0
**Status:** ✅ Packages Backend Prêts

---

## 📦 PACKAGES CRÉÉS

### Backend Services (3 packages)

| Service | Package | Taille | Status |
|---------|---------|--------|--------|
| **TMS Sync EB** | `tms-sync-eb.zip` | 358 KB | ✅ Prêt |
| **Authz EB** | `authz-eb.zip` | 214 KB | ✅ Prêt |
| **Affret IA API v2** | `affret-ia-api-v2.zip` | 93 KB | ✅ Prêt |

**Total:** 665 KB

### Emplacement
```
deploy/packages/
├── tms-sync-eb.zip          (358 KB)
├── authz-eb.zip             (214 KB)
└── affret-ia-api-v2.zip     (93 KB)
```

---

## 🎯 FONCTIONNALITÉS IMPLÉMENTÉES

### 1. TMS Sync EB (v2.2.0)

#### Cache Redis avec Fallback Mémoire
- ✅ Service Redis (ioredis v5.9.1)
- ✅ Fallback automatique vers cache mémoire (Map)
- ✅ TTLs: 30s (status), 5min (orders), 1h (carriers)
- ✅ Endpoints: `/api/v1/cache/stats`, `/api/v1/cache/invalidate`

#### Système de Monitoring (Toutes les 5 minutes)
- ✅ Job `runMonitoringCheck()` avec 3 types d'anomalies:
  - NO_SYNC: Aucun sync depuis >10min
  - SLOW_SYNC: Sync >2min
  - SYNC_ERROR: Erreurs de synchronisation
- ✅ Alertes SMS via AWS SNS
- ✅ Alertes Email via AWS SES avec détails HTML
- ✅ Collection MongoDB: `monitoring_logs`
- ✅ Endpoint: `GET /api/v1/monitoring/status`

#### CloudWatch Metrics
- ✅ TMS/SyncDuration (Milliseconds)
- ✅ TMS/TransportsSynced (Count)
- ✅ TMS/SyncSuccess (1 ou 0)
- ✅ TMS/SyncErrors (Count)

#### Fichiers Modifiés
- `services/redis-cache.service.js` (NOUVEAU)
- `scheduled-jobs.js` (modifié - +200 lignes)
- `index.js` (modifié - intégration cache + monitoring)
- `package.json` (dépendances: ioredis, @aws-sdk/client-sns, @aws-sdk/client-ses)

---

### 2. Authz EB (v3.5.0)

#### Webhooks Carriers
- ✅ 7 routes CRUD: POST/GET/DELETE/TEST/ROTATE/DELIVERIES
- ✅ Sécurité HMAC-SHA256 (signature `X-Webhook-Signature`)
- ✅ 6 événements supportés:
  - `document.uploaded`, `document.verified`, `document.expired`, `document.rejected`
  - `carrier.validated`, `carrier.suspended`
- ✅ Retry avec backoff exponentiel (3 tentatives)
- ✅ Auto-désactivation après 10 échecs consécutifs
- ✅ Collections: `carrier_webhooks`, `webhook_deliveries`

#### Email Metrics & Analytics
- ✅ 5 endpoints:
  - `GET /api/email-metrics/stats` - Statistiques globales
  - `GET /api/email-metrics/timeline` - Timeline par jour/heure
  - `GET /api/email-metrics/by-type` - Breakdown par type
  - `GET /api/email-metrics/failed` - Liste emails échoués
  - `POST /api/email-metrics/retry/:emailId` - Retry failed email
- ✅ Wrapper `sendEmailWithLogging()` pour logging automatique
- ✅ Collection: `email_logs` (8 types d'emails)

#### Carrier Scoring API
- ✅ 4 endpoints:
  - `GET /api/v1/carriers/leaderboard` - Top performers
  - `GET /api/v1/carriers/:id/score` - Détails score
  - `GET /api/v1/carriers/:id/score-history` - Évolution 30 jours
  - `GET /api/v1/carriers/:id/benchmark` - Comparaison vs marché

#### Alertes SMS Documents Expirants
- ✅ Job cron quotidien à 9h00 (Paris)
- ✅ 4 niveaux d'urgence: J-0 (🚨), J-1 (⚠️), J-3 (⏰), J-7 (📋)
- ✅ Rate limiting: 1 SMS/seconde via AWS SNS
- ✅ Collection: `notification_logs`

#### CloudWatch Metrics
- ✅ Documents/Uploaded (Count)
- ✅ Documents/Verified (Count)
- ✅ Documents/Expired (Count)
- ✅ Documents/OCRSuccess (1 ou 0)
- ✅ Emails/Sent, Delivered, Bounced, Failed (Count)

#### Fichiers Créés/Modifiés
- `routes/carrier-webhooks.js` (NOUVEAU - 600+ lignes)
- `routes/email-metrics.js` (NOUVEAU - 470+ lignes)
- `routes/carrier-scoring.js` (NOUVEAU - 250+ lignes)
- `carriers.js` (modifié - +130 lignes pour alertes SMS et webhooks)
- `email.js` (modifié - wrapper logging)
- `index.js` (modifié - routes + 2 crons)
- `package.json` (dépendances: node-cron, @aws-sdk/client-sns, @aws-sdk/client-ses)

---

### 3. Affret IA API v2 (v1.2.0)

#### Analytics Conversion & Funnel
- ✅ Collection: `affretia_trial_tracking`
- ✅ 4 endpoints:
  - `GET /api/v1/affretia/analytics/conversion` - Funnel complet (registered → eligible → trial → upgraded)
  - `GET /api/v1/affretia/analytics/blockers` - Breakdown blockers (low_score 66.7%, missing_docs 20.4%, etc.)
  - `GET /api/v1/affretia/analytics/timeline` - Timeline activations par jour
  - `GET /api/v1/affretia/analytics/carriers/:id/journey` - Journey individuel carrier

#### CloudWatch Metrics
- ✅ AffretIA/TrialActivations (Count)
- ✅ AffretIA/Upgrades (Count)
- ✅ AffretIA/MatchingDuration (Milliseconds)
- ✅ AffretIA/MatchingResults (Count)

#### Fichiers Créés
- `routes/analytics-routes.js` (NOUVEAU - 400+ lignes)
- `models/AffretIATrialTracking.js` (NOUVEAU - schema)

---

## 🗄️ COLLECTIONS MONGODB REQUISES

### À créer avant déploiement

| Collection | Service | Indexes | Purpose |
|------------|---------|---------|---------|
| `monitoring_logs` | tms-sync-eb | timestamp, anomalies.severity | Logs monitoring TMS |
| `notification_logs` | authz-eb | carrierId, sentAt, type | Historique alertes SMS |
| `carrier_webhooks` | authz-eb | carrierId, active | Configuration webhooks |
| `webhook_deliveries` | authz-eb | webhookId, createdAt, status | Logs webhooks envoyés |
| `email_logs` | authz-eb | sentAt, status, type, to, carrierId | Logs emails envoyés |
| `affretia_trial_tracking` | affret-ia-api-v2 | carrierId, status, eligibleAt | Tracking conversion Affret.IA |

### Scripts Setup Disponibles

```bash
# authz-eb
node scripts/setup-email-logs-indexes.cjs
node scripts/test-email-metrics.cjs
node scripts/test-webhooks.cjs
node scripts/invite-test-carriers.cjs
```

---

## ⚙️ VARIABLES D'ENVIRONNEMENT

### TMS Sync EB
```bash
# MongoDB
MONGODB_URI=mongodb://user:pass@host:27017/rt-technologie?authSource=admin

# Redis Cache (optionnel, fallback mémoire disponible)
REDIS_URL=redis://localhost:6379
CACHE_TTL=300

# Pagination
PAGINATION_DELAY_MS=300

# Monitoring & Alertes
ALERT_SMS_NUMBER=+33612345678
ALERT_EMAIL=admin@symphonia.com
AWS_REGION=eu-west-3
DASHBOARD_URL=https://admin.symphonia.com

# CloudWatch
CLOUDWATCH_METRICS_ENABLED=true

# TMS APIs
DASHDOC_API_KEY=your-dashdoc-api-key
TRANSPOREON_API_KEY=your-transporeon-api-key
```

### Authz EB
```bash
# MongoDB
MONGODB_URI=mongodb://user:pass@host:27017/rt-authz?authSource=admin

# AWS Services
AWS_SES_REGION=eu-west-3
AWS_SNS_REGION=eu-west-3
AWS_S3_REGION=eu-west-3
SES_FROM_EMAIL=ne-pas-repondre@symphonia-controltower.com

# Email Metrics
EMAIL_METRICS_ENABLED=true

# Alertes SMS
ALERT_SMS_NUMBER=+33612345678
ALERT_EMAIL=admin@symphonia.com

# CloudWatch
CLOUDWATCH_METRICS_ENABLED=true

# JWT
JWT_SECRET=your-jwt-secret-key
```

### Affret IA API v2
```bash
# MongoDB
MONGODB_URI=mongodb://user:pass@host:27017/affretia?authSource=admin

# Analytics
AFFRETIA_ANALYTICS_ENABLED=true

# CloudWatch
CLOUDWATCH_METRICS_ENABLED=true
AWS_REGION=eu-west-3

# External APIs
CARRIERS_API_URL=https://authz-api-url.com
SCORING_API_URL=https://scoring-api-url.com
```

---

## 🚀 PROCÉDURE DE DÉPLOIEMENT

### Prérequis
- ✅ AWS CLI configuré (`aws configure`)
- ✅ Applications Elastic Beanstalk créées
- ✅ MongoDB cluster configuré
- ✅ Redis ElastiCache (optionnel pour tms-sync-eb)
- ✅ AWS SES vérifié (domaine + emails)
- ✅ AWS SNS Topic créé pour alertes SMS

### Étape 1: Configuration AWS

#### A. AWS SES (Email)
```bash
# Vérifier domaine
aws ses verify-domain-identity --domain symphonia-controltower.com

# Vérifier email sender
aws ses verify-email-identity --email-address ne-pas-repondre@symphonia-controltower.com

# Sortir du sandbox SES
# Via console AWS: Request production access
```

#### B. AWS SNS (SMS)
```bash
# Créer Topic pour alertes
aws sns create-topic --name symphonia-alerts

# S'abonner (SMS)
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-3:ACCOUNT_ID:symphonia-alerts \
  --protocol sms \
  --notification-endpoint +33612345678
```

#### C. Redis ElastiCache (Optionnel)
```bash
# Via console AWS ou CLI
aws elasticache create-cache-cluster \
  --cache-cluster-id symphonia-cache \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1
```

### Étape 2: Déploiement via Console AWS

Pour chaque service:

1. **Connexion Console AWS Elastic Beanstalk**
   - https://console.aws.amazon.com/elasticbeanstalk

2. **Upload Package**
   - Aller dans l'application (ex: `tms-sync-eb`)
   - Click "Upload and deploy"
   - Sélectionner le fichier ZIP (ex: `deploy/packages/tms-sync-eb.zip`)
   - Version label: `v2.2.0-YYYYMMDD-HHMM`

3. **Configuration Variables**
   - Configuration → Software → Environment properties
   - Ajouter toutes les variables d'environnement (voir section ci-dessus)

4. **Déploiement**
   - Click "Deploy"
   - Attendre ~5-10 minutes

5. **Vérification**
   - Check "Health" = OK (vert)
   - Logs: Voir "Logs" → "Request Logs" → "Last 100 Lines"

### Étape 3: Validation Post-Déploiement

#### TMS Sync EB
```bash
# Health check
curl https://tms-api-url.com/health

# Cache stats
curl https://tms-api-url.com/api/v1/cache/stats

# Monitoring status
curl https://tms-api-url.com/api/v1/monitoring/status
```

#### Authz EB
```bash
# Health check
curl https://authz-api-url.com/health

# Email metrics stats
curl https://authz-api-url.com/api/email-metrics/stats

# Carrier leaderboard
curl https://authz-api-url.com/api/v1/carriers/leaderboard?limit=10
```

#### Affret IA API v2
```bash
# Analytics conversion
curl https://affretia-api-url.com/api/v1/affretia/analytics/conversion

# Blockers
curl https://affretia-api-url.com/api/v1/affretia/analytics/blockers
```

---

## 📊 MONITORING & OBSERVABILITÉ

### CloudWatch Dashboards

Créer dashboards CloudWatch pour visualiser:

1. **TMS Sync Metrics**
   - SyncDuration (avg, max)
   - TransportsSynced (sum)
   - SyncSuccess (rate)
   - SyncErrors (count)

2. **Documents Metrics**
   - Documents uploaded/verified/expired (count)
   - OCR success rate (%)

3. **Email Metrics**
   - Emails sent/delivered/bounced/failed (count)
   - Delivery rate (%)

4. **Affret.IA Metrics**
   - Trial activations (count)
   - Upgrades (count)
   - Matching duration (avg)

### Alarmes CloudWatch

```bash
# Exemple: Alerte si SyncErrors > 10 en 5min
aws cloudwatch put-metric-alarm \
  --alarm-name tms-sync-errors-high \
  --metric-name SyncErrors \
  --namespace TMS \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:eu-west-3:ACCOUNT_ID:symphonia-alerts
```

---

## 🧪 TESTS DISPONIBLES

### Tests E2E (À exécuter en local avant déploiement)

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

**Note:** Les tests nécessitent MongoDB et les services démarrés en local.

### Scripts de Test

```bash
# Tester les webhooks carriers
cd services/authz-eb
node scripts/test-webhooks.cjs

# Tester les email metrics
node scripts/test-email-metrics.cjs

# Inviter 5 transporteurs test
node scripts/invite-test-carriers.cjs
```

---

## 📝 NOTES IMPORTANTES

### ⚠️ Frontend Dashboards

Les 3 dashboards admin frontend ont été créés mais nécessitent:

1. **Installation dépendances manquantes**:
   ```bash
   cd rt-frontend-apps/apps/web-transporter
   npm install @chakra-ui/react react-icons react-leaflet
   ```

2. **Fichiers créés**:
   - `pages/admin/email-metrics.tsx` (✅ Prêt)
   - `pages/admin/carrier-scoring.tsx` (✅ Prêt)
   - `pages/admin/tms-realtime.tsx` (✅ Prêt)
   - `lib/auth.ts` (helper `isAdmin()` ajouté)
   - `lib/api.ts` (3 clients API)

3. **Build frontend**:
   ```bash
   npm run build
   # Erreur actuelle: @chakra-ui/react manquant
   ```

**Action requise:** Installer les dépendances frontend avant build.

---

## ✅ CHECKLIST POST-DÉPLOIEMENT

### Configuration AWS
- [ ] SES domaine vérifié
- [ ] SES email sender vérifié
- [ ] SNS Topic créé pour alertes
- [ ] SNS abonnement SMS configuré
- [ ] Redis ElastiCache créé (optionnel)
- [ ] CloudWatch dashboards créés
- [ ] CloudWatch alarmes configurées

### MongoDB
- [ ] Collections créées (6 collections)
- [ ] Indexes créés (scripts setup exécutés)
- [ ] Backup configuré

### Services Elastic Beanstalk
- [ ] TMS Sync EB déployé (v2.2.0)
- [ ] Authz EB déployé (v3.5.0)
- [ ] Affret IA API v2 déployé (v1.2.0)
- [ ] Variables d'environnement configurées
- [ ] Health checks: OK (vert)

### Tests
- [ ] Tests E2E exécutés en local
- [ ] Endpoints APIs testés en production
- [ ] Webhooks testés avec deliveries
- [ ] Emails testés (envoi + logging)
- [ ] Alertes SMS testées
- [ ] CloudWatch metrics vérifiées

### Monitoring
- [ ] Cron jobs démarrés (vigilance 8h, documents 9h, monitoring 5min)
- [ ] Logs CloudWatch accessibles
- [ ] Dashboards CloudWatch opérationnels
- [ ] Alarmes testées

---

## 📚 DOCUMENTATION COMPLÉMENTAIRE

- **Guide déploiement complet:** [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
- **Plan implémentation 13 jours:** [~/.claude/plans/polymorphic-finding-zebra.md]
- **README principal:** [README.md](../README.md)

---

## 📞 SUPPORT

En cas de problème:

1. **Vérifier logs CloudWatch:**
   ```bash
   aws logs tail /aws/elasticbeanstalk/tms-sync-eb/var/log/nodejs/nodejs.log --follow
   ```

2. **Vérifier health:**
   ```bash
   aws elasticbeanstalk describe-environment-health \
     --environment-name tms-sync-eb-prod \
     --attribute-names All
   ```

3. **Rollback si nécessaire:**
   - Via console: Deploy version précédente
   - Via CLI: `aws elasticbeanstalk update-environment --version-label v2.1.9`

---

**Déploiement préparé par:** Claude Sonnet 4.5
**Date:** 2026-02-01 23:05
**Status:** ✅ Packages Backend Prêts pour Production
