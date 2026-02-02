# 🚀 Guide de Déploiement AWS - Symphonia Platform

## Vue d'Ensemble

Ce guide explique comment déployer automatiquement tous les services Symphonia Platform sur AWS Elastic Beanstalk avec un seul script.

## 📋 Prérequis

### 1. AWS CLI Configuré

```bash
# Installer AWS CLI (si non installé)
pip install awscli

# Configurer les credentials
aws configure
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region name: eu-west-3
# Default output format: json

# Vérifier la configuration
aws sts get-caller-identity
```

### 2. MongoDB Accessible

Vous avez besoin d'une instance MongoDB accessible depuis AWS:

**Option A: MongoDB Atlas (Recommandé)**
```
1. Créer un cluster gratuit sur https://www.mongodb.com/cloud/atlas
2. Whitelist AWS IP ranges ou 0.0.0.0/0 (tous)
3. Créer un user avec droits readWrite
4. Copier la connection string
```

**Option B: MongoDB Auto-hébergé**
```
Assurez-vous que MongoDB est accessible depuis internet
ou configurez AWS VPC peering
```

### 3. Packages Prêts

Les packages doivent être dans `deploy/packages/`:
```
deploy/packages/
├── tms-sync-eb.zip
├── authz-eb.zip
└── affret-ia-api-v2.zip
```

Si non créés, exécutez d'abord:
```bash
cd scripts
./deploy-local.bat  # Windows
# ou
bash deploy-local.sh  # Linux/Mac
```

---

## 🚀 Déploiement Rapide (5 Minutes)

### Étape 1: Configuration

Copiez et éditez le fichier de configuration:

```bash
# Copier le template
cp .env.deploy .env.deploy.local

# Éditer avec vos valeurs
nano .env.deploy.local
```

**Variables REQUISES à configurer:**

```bash
# MongoDB URI (OBLIGATOIRE)
export MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true"

# Alertes SMS/Email
export ALERT_SMS_NUMBER="+33612345678"
export ALERT_EMAIL="admin@symphonia.com"

# JWT Secret (générez-en un fort)
export JWT_SECRET=$(openssl rand -base64 32)
```

### Étape 2: Charger la Configuration

```bash
# Charger les variables d'environnement
source .env.deploy.local
```

### Étape 3: Lancer le Déploiement

```bash
# Déploiement complet automatisé
bash scripts/deploy-aws.sh
```

Le script va:
1. ✅ Vérifier les prérequis (AWS CLI, packages)
2. ✅ Configurer AWS SES (email)
3. ✅ Configurer AWS SNS (SMS)
4. ✅ Créer un bucket S3 pour les packages
5. ✅ Uploader les 3 packages
6. ✅ Créer les applications Elastic Beanstalk
7. ✅ Créer/mettre à jour les environnements
8. ✅ Configurer MongoDB (collections + indexes)
9. ✅ Valider le déploiement
10. ✅ Générer un rapport

**Temps estimé:**
- Première fois: 15-20 minutes (création environnements EB)
- Déploiements suivants: 5-10 minutes

---

## 📊 Suivi du Déploiement

### En Temps Réel

Le script affiche les étapes en cours:
```
═══════════════════════════════════════════════════════
Configuration AWS SES (Email)
═══════════════════════════════════════════════════════

✓ Domaine SES déjà vérifié: symphonia-controltower.com
✓ Email SES déjà vérifié: ne-pas-repondre@symphonia.com
✓ SES Production Mode activé (quota: 50000 emails/jour)
```

### Logs Détaillés

Tous les détails sont sauvegardés dans:
```
deploy/deploy_aws_YYYYMMDD_HHMMSS.log
```

### Console AWS

Suivez la progression sur:
- **Elastic Beanstalk:** https://console.aws.amazon.com/elasticbeanstalk
- **CloudWatch Logs:** https://console.aws.amazon.com/cloudwatch

---

## 🎯 Services Déployés

### 1. TMS Sync EB
- **URL:** `http://symphonia-tms-sync-eb-prod.{region}.elasticbeanstalk.com`
- **Port:** 3000
- **Endpoints:**
  - `GET /health` - Health check
  - `GET /api/v1/monitoring/status` - Monitoring status
  - `GET /api/v1/cache/stats` - Cache statistics

### 2. Authz EB
- **URL:** `http://symphonia-authz-eb-prod.{region}.elasticbeanstalk.com`
- **Port:** 3000
- **Endpoints:**
  - `GET /health` - Health check
  - `GET /api/email-metrics/stats` - Email metrics
  - `GET /api/v1/carriers/leaderboard` - Carrier leaderboard

### 3. Affret IA API v2
- **URL:** `http://symphonia-affret-ia-api-v2-prod.{region}.elasticbeanstalk.com`
- **Port:** 3000
- **Endpoints:**
  - `GET /health` - Health check
  - `GET /api/v1/affretia/analytics/conversion` - Analytics

---

## ✅ Validation Post-Déploiement

### Vérification Automatique

Le script valide automatiquement:
```bash
# Health checks sur chaque service
curl http://{service-url}/health
```

### Vérification Manuelle

```bash
# TMS Sync - Monitoring
curl https://{tms-url}/api/v1/monitoring/status | jq

# Authz - Email Metrics
curl https://{authz-url}/api/email-metrics/stats | jq

# Affret IA - Analytics
curl https://{affretia-url}/api/v1/affretia/analytics/conversion | jq
```

### Vérifier MongoDB

```bash
# Se connecter à MongoDB
mongosh "$MONGODB_URI"

# Vérifier les collections
use rt-technologie
show collections
# Doit afficher: monitoring_logs

use rt-authz
show collections
# Doit afficher: notification_logs, carrier_webhooks, webhook_deliveries, email_logs

use affretia
show collections
# Doit afficher: affretia_trial_tracking
```

### Vérifier AWS SES

```bash
# Vérifier statut domaine
aws ses get-identity-verification-attributes \
  --identities symphonia-controltower.com \
  --region eu-west-3

# Vérifier quota SES
aws ses get-send-quota --region eu-west-3
```

### Vérifier AWS SNS

```bash
# Lister les topics
aws sns list-topics --region eu-west-3

# Lister les abonnements
aws sns list-subscriptions --region eu-west-3
```

---

## 🔧 Options Avancées

### Attendre la Fin du Déploiement

Par défaut, le script lance les déploiements et continue. Pour attendre:

```bash
export WAIT_FOR_READY=true
bash scripts/deploy-aws.sh
```

⚠️ Cela peut prendre 5-10 minutes par service.

### Déployer un Seul Service

Modifiez le script pour commenter les services non désirés:

```bash
# Dans deploy-aws.sh, ligne ~50
declare -A SERVICES=(
    ["tms-sync-eb"]="tms-sync-eb.zip"
    # ["authz-eb"]="authz-eb.zip"  # Commenté
    # ["affret-ia-api-v2"]="affret-ia-api-v2.zip"  # Commenté
)
```

### Déployer en Staging

```bash
export ENV_SUFFIX="staging"
bash scripts/deploy-aws.sh
```

Créera des environnements:
- `symphonia-tms-sync-eb-staging`
- `symphonia-authz-eb-staging`
- `symphonia-affret-ia-api-v2-staging`

---

## 🐛 Troubleshooting

### Erreur: "AWS credentials non configurées"

```bash
# Solution:
aws configure

# Vérifier:
aws sts get-caller-identity
```

### Erreur: "Package manquant"

```bash
# Solution: Créer les packages
cd scripts
./deploy-local.bat  # Windows
# ou
bash deploy-local.sh  # Linux/Mac
```

### Erreur: "MongoDB connection failed"

```bash
# Vérifier l'URI MongoDB
mongosh "$MONGODB_URI"

# Vérifier whitelist IP
# Si MongoDB Atlas: Ajouter 0.0.0.0/0 dans Network Access
```

### Erreur: "SES domain not verified"

```bash
# Vérifier statut
aws ses get-identity-verification-attributes \
  --identities symphonia-controltower.com

# Si "Pending": Ajoutez les DNS TXT records fournis par AWS
# Si "Failed": Vérifiez les DNS records
```

### Erreur: "Environment health = Degraded"

```bash
# Voir les logs
aws elasticbeanstalk describe-environment-health \
  --environment-name symphonia-tms-sync-eb-prod \
  --attribute-names All

# Ou via console CloudWatch Logs
```

### Service ne démarre pas

```bash
# Vérifier les logs CloudWatch
aws logs tail \
  /aws/elasticbeanstalk/symphonia-tms-sync-eb-prod/var/log/nodejs/nodejs.log \
  --follow

# Causes communes:
# 1. MONGODB_URI invalide
# 2. Variables d'environnement manquantes
# 3. Port déjà utilisé
```

---

## 🔄 Mise à Jour / Redéploiement

### Mettre à Jour un Service

1. Modifier le code
2. Recréer le package:
```bash
cd services/tms-sync-eb
# Faire vos modifications
cd ../..
# Recréer le package
bash scripts/deploy-local.sh
```

3. Redéployer:
```bash
source .env.deploy.local
bash scripts/deploy-aws.sh
```

Le script détectera l'environnement existant et fera une mise à jour (pas de recreation).

### Rollback vers Version Précédente

Via console AWS EB:
1. Aller dans l'environnement
2. Actions → Deploy different version
3. Sélectionner version précédente

Via CLI:
```bash
aws elasticbeanstalk update-environment \
  --environment-name symphonia-tms-sync-eb-prod \
  --version-label v2.1.9-20260101-1200
```

---

## 📈 Monitoring Production

### CloudWatch Dashboards

Créez des dashboards pour:
- TMS Sync Metrics (SyncDuration, TransportsSynced, Errors)
- Email Metrics (Sent, Delivered, Bounced, Failed)
- Affret.IA Metrics (TrialActivations, Upgrades)

### CloudWatch Alarms

Exemple d'alarme pour erreurs TMS:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name tms-sync-errors-high \
  --metric-name SyncErrors \
  --namespace TMS \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:eu-west-3:123456:symphonia-alerts
```

### Logs Centralisés

Tous les logs sont dans CloudWatch Logs:
```
/aws/elasticbeanstalk/symphonia-tms-sync-eb-prod/var/log/nodejs/nodejs.log
/aws/elasticbeanstalk/symphonia-authz-eb-prod/var/log/nodejs/nodejs.log
/aws/elasticbeanstalk/symphonia-affret-ia-api-v2-prod/var/log/nodejs/nodejs.log
```

---

## 💰 Coûts Estimés

### Par Service (Elastic Beanstalk t3.small)

- **Instance EC2 t3.small:** ~$15/mois
- **Load Balancer:** ~$20/mois
- **CloudWatch Logs:** ~$0.50/Go
- **Data Transfer:** ~$0.09/Go

**Total par service:** ~$35-40/mois

**3 services:** ~$105-120/mois

### Services Additionnels

- **MongoDB Atlas (M10):** ~$57/mois
- **Redis ElastiCache (cache.t3.micro):** ~$12/mois
- **SES:** $0.10/1000 emails
- **SNS SMS:** $0.008/SMS (Europe)
- **S3:** $0.023/Go

### Optimisations

- Utiliser t3.micro en staging: -50% coûts
- Auto-scaling basé sur la charge
- Arrêter staging la nuit: -30% coûts

---

## 📚 Ressources

- **AWS Elastic Beanstalk:** https://docs.aws.amazon.com/elasticbeanstalk/
- **AWS SES:** https://docs.aws.amazon.com/ses/
- **AWS SNS:** https://docs.aws.amazon.com/sns/
- **MongoDB Atlas:** https://docs.atlas.mongodb.com/

---

## ✅ Checklist Déploiement

- [ ] AWS CLI configuré (`aws configure`)
- [ ] MongoDB URI configuré
- [ ] `.env.deploy.local` rempli avec toutes les variables
- [ ] Packages créés dans `deploy/packages/`
- [ ] Variables chargées (`source .env.deploy.local`)
- [ ] Script exécuté (`bash scripts/deploy-aws.sh`)
- [ ] Domaine SES vérifié
- [ ] Email sender SES vérifié
- [ ] Topic SNS créé
- [ ] Abonnement SMS configuré
- [ ] Collections MongoDB créées
- [ ] Health checks OK sur tous les services
- [ ] CloudWatch metrics visibles
- [ ] Tests E2E passent
- [ ] Dashboards CloudWatch créés
- [ ] Alarmes CloudWatch configurées
- [ ] Documentation mise à jour avec URLs de production

---

**Bon déploiement! 🚀**

Support: Si problème, consultez les logs dans `deploy/deploy_aws_*.log`
