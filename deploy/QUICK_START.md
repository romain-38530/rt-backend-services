# 🚀 QUICK START - DÉPLOIEMENT SYMPHONIA v2.2.0

## ✅ PACKAGES PRÊTS

Tous les packages backend sont créés et prêts pour le déploiement:

```
deploy/packages/
├── tms-sync-eb.zip        (358 KB) ✅
├── authz-eb.zip           (214 KB) ✅
└── affret-ia-api-v2.zip   (93 KB) ✅
```

---

## 📋 DÉPLOIEMENT RAPIDE (3 étapes)

### 1️⃣ Configuration AWS (5-10 min)

```bash
# Vérifier domaine SES
aws ses verify-domain-identity --domain symphonia-controltower.com

# Vérifier email sender
aws ses verify-email-identity --email-address ne-pas-repondre@symphonia-controltower.com

# Créer Topic SNS pour alertes
aws sns create-topic --name symphonia-alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-3:ACCOUNT_ID:symphonia-alerts \
  --protocol sms \
  --notification-endpoint +33612345678
```

### 2️⃣ Upload via Console AWS EB (5 min par service)

1. Ouvrir [AWS Elastic Beanstalk Console](https://console.aws.amazon.com/elasticbeanstalk)
2. Sélectionner l'application (ex: `tms-sync-eb`)
3. Click **"Upload and deploy"**
4. Choisir le fichier: `deploy/packages/tms-sync-eb.zip`
5. Version label: `v2.2.0-YYYYMMDD`
6. Click **"Deploy"**

Répéter pour `authz-eb.zip` et `affret-ia-api-v2.zip`.

### 3️⃣ Configuration Variables d'Environnement

Pour chaque service, aller dans **Configuration → Software → Environment properties** et ajouter:

#### TMS Sync EB
```
MONGODB_URI=mongodb://user:pass@host:27017/rt-technologie?authSource=admin
REDIS_URL=redis://cache-url:6379
ALERT_SMS_NUMBER=+33612345678
ALERT_EMAIL=admin@symphonia.com
AWS_REGION=eu-west-3
CLOUDWATCH_METRICS_ENABLED=true
DASHDOC_API_KEY=your-key
```

#### Authz EB
```
MONGODB_URI=mongodb://user:pass@host:27017/rt-authz?authSource=admin
AWS_SES_REGION=eu-west-3
AWS_SNS_REGION=eu-west-3
SES_FROM_EMAIL=ne-pas-repondre@symphonia-controltower.com
ALERT_SMS_NUMBER=+33612345678
CLOUDWATCH_METRICS_ENABLED=true
JWT_SECRET=your-secret
```

#### Affret IA API v2
```
MONGODB_URI=mongodb://user:pass@host:27017/affretia?authSource=admin
AFFRETIA_ANALYTICS_ENABLED=true
CLOUDWATCH_METRICS_ENABLED=true
AWS_REGION=eu-west-3
CARRIERS_API_URL=https://authz-api-url.com
SCORING_API_URL=https://scoring-api-url.com
```

---

## ✅ VALIDATION POST-DÉPLOIEMENT (5 min)

### Health Checks
```bash
# TMS Sync
curl https://tms-api-url.com/health
curl https://tms-api-url.com/api/v1/monitoring/status

# Authz
curl https://authz-api-url.com/health
curl https://authz-api-url.com/api/email-metrics/stats

# Affret IA
curl https://affretia-api-url.com/api/v1/affretia/analytics/conversion
```

### Vérifier Logs CloudWatch
```bash
# Via AWS CLI
aws logs tail /aws/elasticbeanstalk/tms-sync-eb/var/log/nodejs/nodejs.log --follow

# Ou via Console
https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups
```

### Créer Collections MongoDB
```bash
# Se connecter à MongoDB
mongosh "mongodb://user:pass@host:27017/?authSource=admin"

# Créer les collections
use rt-technologie
db.createCollection("monitoring_logs")

use rt-authz
db.createCollection("notification_logs")
db.createCollection("carrier_webhooks")
db.createCollection("webhook_deliveries")
db.createCollection("email_logs")

use affretia
db.createCollection("affretia_trial_tracking")
```

Ou exécuter les scripts setup:
```bash
cd services/authz-eb
node scripts/setup-email-logs-indexes.cjs
```

---

## 🎯 FONCTIONNALITÉS DISPONIBLES APRÈS DÉPLOIEMENT

### TMS Sync EB ✅
- 🔄 Cache Redis avec fallback mémoire
- 📊 Monitoring automatique (toutes les 5 min)
- 📱 Alertes SMS/Email via SNS/SES
- 📈 Métriques CloudWatch

### Authz EB ✅
- 🔗 Webhooks carriers (HMAC-SHA256)
- 📧 Email metrics & analytics
- 🏆 Carrier scoring (leaderboard, benchmark)
- ⏰ Alertes SMS documents expirants (daily 9h)

### Affret IA API v2 ✅
- 📊 Analytics conversion (funnel tracking)
- 🚫 Blockers analysis
- 📅 Timeline & journey tracking

---

## 📱 DASHBOARDS ADMIN (Frontend)

**Status:** ⚠️ Nécessite installation dépendances

### Installation
```bash
cd rt-frontend-apps/apps/web-transporter
npm install @chakra-ui/react react-icons react-leaflet
npm run build
```

### Dashboards Disponibles
- 📧 `/admin/email-metrics` - Analytics emails (stats, timeline, failed)
- 🏆 `/admin/carrier-scoring` - Scoring carriers (leaderboard, benchmark, trends)
- 🚛 `/admin/tms-realtime` - TMS temps réel (status, GPS map, sync history)

---

## 🔧 TROUBLESHOOTING

### Service Health = "Degraded"
1. Vérifier logs CloudWatch
2. Vérifier variables d'environnement
3. Vérifier connexion MongoDB
4. Redémarrer: Actions → Restart App Server

### Emails ne sont pas envoyés
1. Vérifier SES domaine vérifié: `aws ses get-identity-verification-attributes`
2. Vérifier sortie sandbox SES
3. Vérifier logs: Collection `email_logs` dans MongoDB

### Alertes SMS ne fonctionnent pas
1. Vérifier Topic SNS créé
2. Vérifier abonnement SMS
3. Vérifier crédit SMS AWS
4. Vérifier logs: Collection `notification_logs` dans MongoDB

### Cache Redis indisponible
- ✅ Le système utilise automatiquement le fallback mémoire
- Vérifier logs: "Redis désactivé - Utilisation du cache mémoire"

---

## 📚 DOCUMENTATION COMPLÈTE

- **Rapport détaillé:** [DEPLOYMENT_REPORT.md](./DEPLOYMENT_REPORT.md) (15+ pages)
- **Guide déploiement:** [../DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md) (1200+ lignes)
- **Plan implémentation:** ~/.claude/plans/polymorphic-finding-zebra.md

---

## 🎉 PROCHAINES ÉTAPES

1. ✅ **Packages créés** - 3/3 services (665 KB)
2. ⏳ **Déploiement AWS** - À faire via console EB
3. ⏳ **Configuration MongoDB** - Créer 6 collections
4. ⏳ **Tests E2E** - Exécuter après déploiement
5. ⏳ **Frontend build** - Installer dépendances Chakra UI

---

**Total temps estimé:** 30-45 minutes
**Complexité:** ⭐⭐⭐☆☆ (Moyenne)

Bon déploiement! 🚀
