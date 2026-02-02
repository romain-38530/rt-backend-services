# ✅ DÉPLOIEMENT AWS RÉUSSI - SYMPHONIA v2.2.0

**Date:** 2026-02-02 07:55
**Account AWS:** 004843574253
**Région:** eu-west-3

---

## 🎉 INFRASTRUCTURE AWS CRÉÉE AVEC SUCCÈS

### ✅ AWS SES (Email Service)

**Domaine:** symphonia-controltower.com
**Status:** ⚠️ En attente de vérification DNS
**Action requise:** Ajoutez l'enregistrement DNS TXT:

```
Type: TXT
Name: _amazonses.symphonia-controltower.com
Value: tu0vnf0dlySH9xNAg+hc1lhIAGsrR+Oh2nExljRs8dg=
TTL: 1800
```

**Email Sender:** ne-pas-repondre@symphonia-controltower.com
**Status:** ⚠️ En attente de confirmation email
**Action requise:** Cliquez sur le lien reçu par email

**Quota actuel:** 200 emails/jour (mode Sandbox)
**Action recommandée:** Demandez production access via console AWS SES

### ✅ AWS SNS (SMS Alerts)

**Topic ARN:** `arn:aws:sns:eu-west-3:004843574253:symphonia-alerts`
**Abonnement SMS:** +33612345678
**Subscription ARN:** `arn:aws:sns:eu-west-3:004843574253:symphonia-alerts:709c1ee7-e5b6-49e4-8bd7-29000e2f52e2`
**Status:** ✅ Actif

### ✅ AWS S3 (Packages Storage)

**Bucket:** symphonia-deploy-packages-004843574253
**Versioning:** ✅ Activé
**Région:** eu-west-3

**Packages uploadés:**
```
s3://symphonia-deploy-packages-004843574253/
├── packages/tms-sync-eb/v2.2.0-20260202-075033.zip (358 KB)
├── packages/authz-eb/v2.2.0-20260202-075129.zip (214 KB)
└── packages/affret-ia-api-v2/v2.2.0-20260202-075145.zip (93 KB)
```

### ✅ AWS Elastic Beanstalk

**Applications créées:**
1. **symphonia-tms-sync-eb**
   - ARN: arn:aws:elasticbeanstalk:eu-west-3:004843574253:application/symphonia-tms-sync-eb
   - Version: v2.2.0-20260202

2. **symphonia-authz-eb**
   - ARN: arn:aws:elasticbeanstalk:eu-west-3:004843574253:application/symphonia-authz-eb
   - Version: v2.2.0-20260202

3. **symphonia-affret-ia-api-v2**
   - ARN: arn:aws:elasticbeanstalk:eu-west-3:004843574253:application/symphonia-affret-ia-api-v2
   - Version: v2.2.0-20260202

---

## 🚀 PROCHAINES ÉTAPES: CRÉER LES ENVIRONNEMENTS

### Option A: Via Console AWS (Recommandé)

1. **Ouvrir la console Elastic Beanstalk:**
   https://eu-west-3.console.aws.amazon.com/elasticbeanstalk/home?region=eu-west-3

2. **Pour chaque application** (symphonia-tms-sync-eb, symphonia-authz-eb, symphonia-affret-ia-api-v2):

   a. Cliquer sur l'application

   b. Click **"Create environment"**

   c. Configurer:
      - **Environment tier:** Web server environment
      - **Application name:** (pré-rempli)
      - **Environment name:** {app-name}-prod (ex: symphonia-tms-sync-eb-prod)
      - **Domain:** Laisser par défaut ou personnaliser
      - **Platform:** Node.js 20 running on 64bit Amazon Linux 2023
      - **Application code:** Choose existing version → v2.2.0-20260202

   d. Click **"Configure more options"**

   e. **Capacity:**
      - Environment type: Load balanced
      - Instance type: t3.small
      - Min instances: 1
      - Max instances: 4

   f. **Software → Environment properties:** Ajouter les variables d'environnement (voir section ci-dessous)

   g. Click **"Create environment"**

   h. **Attendre 5-10 minutes** par environnement

### Option B: Via AWS CLI (Avancé)

Créer le fichier de configuration pour chaque service puis:

```bash
# TMS Sync EB
aws elasticbeanstalk create-environment \
  --application-name symphonia-tms-sync-eb \
  --environment-name symphonia-tms-sync-eb-prod \
  --version-label v2.2.0-20260202 \
  --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
  --option-settings file://tms-sync-eb-config.json \
  --region eu-west-3

# Authz EB
aws elasticbeanstalk create-environment \
  --application-name symphonia-authz-eb \
  --environment-name symphonia-authz-eb-prod \
  --version-label v2.2.0-20260202 \
  --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
  --option-settings file://authz-eb-config.json \
  --region eu-west-3

# Affret IA API v2
aws elasticbeanstalk create-environment \
  --application-name symphonia-affret-ia-api-v2 \
  --environment-name symphonia-affret-ia-api-v2-prod \
  --version-label v2.2.0-20260202 \
  --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
  --option-settings file://affret-ia-config.json \
  --region eu-west-3
```

---

## ⚙️ VARIABLES D'ENVIRONNEMENT REQUISES

### TMS Sync EB Environment Properties

```
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true
AWS_REGION = eu-west-3
CLOUDWATCH_METRICS_ENABLED = true
ALERT_SMS_NUMBER = +33612345678
ALERT_EMAIL = admin@symphonia.com
REDIS_URL = (optionnel)
DASHDOC_API_KEY = (optionnel)
TRANSPOREON_API_KEY = (optionnel)
```

### Authz EB Environment Properties

```
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true
AWS_REGION = eu-west-3
AWS_SES_REGION = eu-west-3
AWS_SNS_REGION = eu-west-3
SES_FROM_EMAIL = ne-pas-repondre@symphonia-controltower.com
CLOUDWATCH_METRICS_ENABLED = true
ALERT_SMS_NUMBER = +33612345678
JWT_SECRET = RtProd2026KeyAuth0MainToken123456XY
EMAIL_METRICS_ENABLED = true
```

### Affret IA API v2 Environment Properties

```
MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true
AWS_REGION = eu-west-3
CLOUDWATCH_METRICS_ENABLED = true
AFFRETIA_ANALYTICS_ENABLED = true
CARRIERS_API_URL = https://{authz-url}.elasticbeanstalk.com
SCORING_API_URL = https://{scoring-url}.elasticbeanstalk.com
```

---

## 🗄️ CONFIGURATION MONGODB

Une fois les environnements créés, configurez MongoDB:

### Option A: Via mongosh

```bash
mongosh "mongodb+srv://user:pass@cluster.mongodb.net/"
```

Puis exécutez:
```javascript
load('scripts/setup-mongodb-standalone.js')
```

### Option B: Script Auto

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"
mongosh "$MONGODB_URI" < scripts/setup-mongodb-standalone.js
```

**Collections créées:**
- rt-technologie: `monitoring_logs` (3 indexes)
- rt-authz: `notification_logs`, `carrier_webhooks`, `webhook_deliveries`, `email_logs` (19 indexes)
- affretia: `affretia_trial_tracking` (6 indexes)

---

## ✅ VALIDATION POST-DÉPLOIEMENT

Une fois les environnements créés et en santé (Health: OK):

### Récupérer les URLs

```bash
# Lister tous les environnements
aws elasticbeanstalk describe-environments \
  --region eu-west-3 \
  --query 'Environments[*].[EnvironmentName,CNAME,Health,Status]' \
  --output table
```

### Tester les Health Checks

```bash
# TMS Sync
curl http://{tms-cname}.elasticbeanstalk.com/health

# Authz
curl http://{authz-cname}.elasticbeanstalk.com/health

# Affret IA
curl http://{affretia-cname}.elasticbeanstalk.com/health
```

### Tester les Endpoints Principaux

```bash
# TMS Sync - Monitoring
curl http://{tms-cname}.elasticbeanstalk.com/api/v1/monitoring/status

# Authz - Email Metrics
curl http://{authz-cname}.elasticbeanstalk.com/api/email-metrics/stats

# Authz - Carrier Leaderboard
curl http://{authz-cname}.elasticbeanstalk.com/api/v1/carriers/leaderboard

# Affret IA - Analytics
curl http://{affretia-cname}.elasticbeanstalk.com/api/v1/affretia/analytics/conversion
```

---

## 📊 MONITORING

### CloudWatch Logs

Les logs sont dans:
```
/aws/elasticbeanstalk/symphonia-tms-sync-eb-prod/var/log/nodejs/nodejs.log
/aws/elasticbeanstalk/symphonia-authz-eb-prod/var/log/nodejs/nodejs.log
/aws/elasticbeanstalk/symphonia-affret-ia-api-v2-prod/var/log/nodejs/nodejs.log
```

Voir en temps réel:
```bash
aws logs tail /aws/elasticbeanstalk/symphonia-tms-sync-eb-prod/var/log/nodejs/nodejs.log --follow
```

### CloudWatch Metrics

Les métriques custom seront visibles dans CloudWatch sous les namespaces:
- `TMS`
- `Documents`
- `Emails`
- `AffretIA`

---

## 💰 COÛTS ESTIMÉS

### Infrastructure Actuelle

**Elastic Beanstalk (3 services):**
- 3× EC2 t3.small: ~$45/mois
- 3× Application Load Balancer: ~$60/mois
- CloudWatch Logs: ~$2.50/mois
- Data Transfer: ~$1/mois

**Sous-total:** ~$108/mois

**Services AWS:**
- S3 (100 GB): ~$2.30/mois
- SES (10k emails): ~$1/mois
- SNS (1k SMS): ~$8/mois

**Total estimé (hors MongoDB):** ~$119/mois

---

## 🎯 RÉSUMÉ DES COMMANDES

### Vérifier Status Infrastructure

```bash
# Applications EB
aws elasticbeanstalk describe-applications --region eu-west-3

# Environnements (après création)
aws elasticbeanstalk describe-environments --region eu-west-3

# Packages S3
aws s3 ls s3://symphonia-deploy-packages-004843574253/packages/ --recursive

# Topics SNS
aws sns list-topics --region eu-west-3

# SES Identités
aws ses list-identities --region eu-west-3
```

### Créer Dashboards CloudWatch

Via console: https://eu-west-3.console.aws.amazon.com/cloudwatch/home?region=eu-west-3#dashboards

Ou via CLI (exemples dans scripts/create-cloudwatch-dashboards.sh)

---

## 📚 DOCUMENTATION

- **Guide complet:** [DEPLOYMENT_GUIDE.md](../DEPLOYMENT_GUIDE.md)
- **Scripts disponibles:** [scripts/README_DEPLOY.md](../scripts/README_DEPLOY.md)
- **Configuration .env:** [.env.deploy.local](../.env.deploy.local)

---

## ✅ CHECKLIST FINALE

### Infrastructure AWS
- [✅] AWS CLI configuré
- [✅] AWS SES configuré (⚠️ vérification DNS en attente)
- [✅] AWS SNS topic créé et abonnement SMS actif
- [✅] Bucket S3 créé avec versioning
- [✅] 3 packages uploadés sur S3
- [✅] 3 applications EB créées
- [✅] 3 versions d'application créées
- [ ] 3 environnements EB à créer (5-10 min chacun)

### Configuration
- [ ] Variables d'environnement configurées dans chaque environnement EB
- [ ] MongoDB URI fournie
- [ ] Collections MongoDB créées (6 collections)
- [ ] DNS TXT record ajouté pour SES
- [ ] Email SES vérifié

### Tests
- [ ] Health checks OK sur 3 services
- [ ] Endpoints principaux testés
- [ ] CloudWatch metrics visibles
- [ ] CloudWatch logs accessibles

### Monitoring
- [ ] Dashboards CloudWatch créés
- [ ] Alarmes CloudWatch configurées
- [ ] Tests E2E exécutés

---

## 🚀 PRÊT À CONTINUER?

**Prochaine action:** Créer les 3 environnements Elastic Beanstalk via la console AWS

**URL Console EB:** https://eu-west-3.console.aws.amazon.com/elasticbeanstalk/home?region=eu-west-3

**Temps estimé:** 15-30 minutes (5-10 min par environnement)

---

**Status:** ✅ Infrastructure AWS créée - Prêt pour création des environnements
**Version:** 2.2.0
**Date:** 2026-02-02
