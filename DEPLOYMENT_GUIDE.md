# Guide de Déploiement - Symphonia Platform

Version: 2.2.0
Date: 1er février 2026
Auteur: RT Technologie

---

## Table des Matières

1. [Checklist de Déploiement](#checklist-de-déploiement)
2. [Variables d'Environnement](#variables-denvironnement)
3. [Collections MongoDB](#collections-mongodb)
4. [Configuration AWS](#configuration-aws)
5. [Déploiement Elastic Beanstalk](#déploiement-elastic-beanstalk)
6. [Post-Déploiement](#post-déploiement)
7. [Troubleshooting](#troubleshooting)

---

## Checklist de Déploiement

### Prérequis Infrastructure

- [ ] Compte AWS configuré avec accès administrateur
- [ ] MongoDB Atlas cluster créé et accessible
- [ ] Nom de domaine enregistré et DNS configuré
- [ ] Certificat SSL/TLS (ACM) généré pour le domaine
- [ ] AWS CLI installé et configuré (`aws configure`)
- [ ] EB CLI installé (`pip install awsebcli`)

### Configuration des Services AWS

- [ ] **AWS SES (Simple Email Service)**
  - [ ] Domaine vérifié
  - [ ] Adresse email émettrice vérifiée
  - [ ] Sortie du sandbox mode (quota 200 emails/jour → illimité)
  - [ ] Templates d'emails créés
  - [ ] SNS notifications configurées (bounces, complaints)

- [ ] **AWS SNS (Simple Notification Service)**
  - [ ] Topic créé pour les alertes
  - [ ] Numéro de téléphone vérifié
  - [ ] Permissions SMS configurées
  - [ ] Budget alertes configuré

- [ ] **AWS CloudWatch**
  - [ ] Namespace personnalisé créé (`Symphonia/Production`)
  - [ ] Dashboards configurés
  - [ ] Alertes configurées
  - [ ] Log groups créés pour chaque service

- [ ] **AWS S3**
  - [ ] Bucket pour les documents (`symphonia-documents-prod`)
  - [ ] Bucket pour les logs (`symphonia-logs-prod`)
  - [ ] CORS configuré sur bucket documents
  - [ ] Lifecycle policies configurées
  - [ ] Versioning activé

- [ ] **AWS ElastiCache Redis (optionnel)**
  - [ ] Cluster Redis créé
  - [ ] Security group configuré
  - [ ] Endpoint Redis récupéré
  - [ ] Mode cluster vs standalone décidé

### Configuration MongoDB

- [ ] **Base de données principale**
  - [ ] Collections créées avec schemas
  - [ ] Indexes créés pour la performance
  - [ ] Utilisateurs et rôles configurés
  - [ ] Backup automatique activé
  - [ ] Connection string sécurisée

- [ ] **Collections vérifiées**
  - [ ] carriers
  - [ ] documents
  - [ ] orders
  - [ ] scoring_history
  - [ ] email_logs
  - [ ] webhook_logs
  - [ ] monitoring_logs
  - [ ] affretia_trial_tracking
  - [ ] cache_entries (si pas de Redis)

### Déploiement des Services

- [ ] **TMS Sync EB** (`tms-sync-eb`)
  - [ ] Variables d'environnement configurées
  - [ ] Build réussi
  - [ ] Déployé sur Elastic Beanstalk
  - [ ] Health checks passent
  - [ ] Cron jobs configurés

- [ ] **Authz EB** (`authz-eb`)
  - [ ] Variables d'environnement configurées
  - [ ] JWT secret généré et configuré
  - [ ] SMTP configuré pour emails
  - [ ] Déployé et healthy

- [ ] **Affret.IA API v2** (`affret-ia-api-v2`)
  - [ ] Variables d'environnement configurées
  - [ ] SendGrid/SES configuré
  - [ ] Services internes accessibles
  - [ ] Déployé et healthy

### Tests Post-Déploiement

- [ ] Health checks de tous les services (200 OK)
- [ ] Test de connexion MongoDB
- [ ] Test d'envoi d'email (SES)
- [ ] Test d'envoi de SMS (SNS)
- [ ] Test de cache (Redis ou Memory)
- [ ] Test de monitoring CloudWatch
- [ ] Tests end-to-end complets
- [ ] Dashboards accessibles et fonctionnels

---

## Variables d'Environnement

### Service: TMS Sync EB (`tms-sync-eb`)

#### Variables Obligatoires

```bash
# Service Configuration
PORT=3000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rt-tms-sync?retryWrites=true&w=majority
MONGODB_DB_NAME=rt-tms-sync

# CORS
CORS_ORIGIN=https://app.symphonia.fr,https://admin.symphonia.fr,https://backoffice.symphonia.fr

# API
API_VERSION=v1
```

#### Variables Optionnelles

```bash
# Redis Cache (optionnel)
REDIS_ENABLED=true
REDIS_URL=redis://symphonia-redis.cache.amazonaws.com:6379
REDIS_TTL=300

# AWS CloudWatch
AWS_REGION=eu-central-1
CLOUDWATCH_NAMESPACE=Symphonia/Production
CLOUDWATCH_ENABLED=true

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000
ALERT_PHONE_NUMBER=+33612345678
ALERT_EMAIL=admin@symphonia.fr

# TMS Sync
DASHDOC_API_KEY=your_dashdoc_api_key
DASHDOC_WEBHOOK_SECRET=your_webhook_secret
SYNC_INTERVAL_MINUTES=1
```

#### Valeurs par Défaut

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | 3000 | Port du serveur |
| `NODE_ENV` | development | Environnement |
| `REDIS_ENABLED` | false | Activation Redis |
| `REDIS_TTL` | 300 | TTL cache (secondes) |
| `MONITORING_ENABLED` | true | Monitoring actif |
| `MONITORING_INTERVAL` | 60000 | Intervalle monitoring (ms) |
| `SYNC_INTERVAL_MINUTES` | 1 | Fréquence sync TMS |

---

### Service: Authz EB (`authz-eb`)

#### Variables Obligatoires

```bash
# Service
PORT=3001
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/rt-auth?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-random
JWT_EXPIRATION=7d

# CORS
CORS_ORIGIN=http://localhost:3000,https://app.symphonia.fr
```

#### Variables Optionnelles

```bash
# Email (AWS SES)
AWS_REGION=eu-central-1
AWS_SES_SENDER=noreply@symphonia.fr
AWS_SES_ENABLED=true

# OU Email (SMTP)
SMTP_HOST=email-smtp.eu-central-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-username
SMTP_PASSWORD=your-ses-smtp-password
SMTP_FROM=noreply@symphonia.fr

# Frontend
FRONTEND_URL=https://app.symphonia.fr

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Session
SESSION_SECRET=your-session-secret-min-32-chars
SESSION_EXPIRATION=86400000
```

---

### Service: Affret.IA API v2 (`affret-ia-api-v2`)

#### Variables Obligatoires

```bash
# Service
PORT=3017
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/symphonia?retryWrites=true&w=majority

# JWT
JWT_SECRET=your-jwt-secret-here

# Services Internes
WEBSOCKET_URL=https://websocket.symphonia.com
ORDERS_API_URL=https://orders.symphonia.com
CARRIERS_API_URL=https://carriers.symphonia.com
SCORING_API_URL=https://scoring.symphonia.com
PRICING_API_URL=https://pricing.symphonia.com
NOTIFICATIONS_API_URL=https://notifications.symphonia.com
```

#### Variables Optionnelles

```bash
# Email (SendGrid)
SENDGRID_API_KEY=SG.your-sendgrid-api-key
SENDGRID_FROM_EMAIL=affret@symphonia.com

# OU Email (AWS SES)
AWS_SES_SENDER=affret@symphonia.fr
AWS_SES_ENABLED=true

# Bourse Publique
BOURSE_BASE_URL=https://bourse.affretia.com

# Configuration Affret.IA
AFFRET_MAX_PRICE_INCREASE=15
AFFRET_AUTO_ACCEPT_THRESHOLD=0
AFFRET_NEGOTIATION_MAX_ROUNDS=3
AFFRET_RESPONSE_TIMEOUT=24
AFFRET_SHORTLIST_SIZE=10

# Trial Tracking
TRIAL_DURATION_DAYS=30
TRIAL_REMINDER_DAYS=7,14,21
TRIAL_AUTO_CONVERT=false
```

---

## Collections MongoDB

### Script d'Initialisation

Exécutez ce script MongoDB pour créer toutes les collections et indexes nécessaires.

```javascript
// Connexion à la base de données
use symphonia;

// 1. Collection: carriers
db.createCollection("carriers");
db.carriers.createIndex({ "siret": 1 }, { unique: true });
db.carriers.createIndex({ "email": 1 });
db.carriers.createIndex({ "status": 1 });
db.carriers.createIndex({ "createdAt": -1 });
db.carriers.createIndex({ "metadata.dashdocId": 1 }, { sparse: true });

// 2. Collection: documents
db.createCollection("documents");
db.documents.createIndex({ "carrierId": 1 });
db.documents.createIndex({ "type": 1 });
db.documents.createIndex({ "status": 1 });
db.documents.createIndex({ "uploadedAt": -1 });
db.documents.createIndex({ "carrierId": 1, "type": 1 });

// 3. Collection: orders
db.createCollection("orders");
db.orders.createIndex({ "orderNumber": 1 }, { unique: true });
db.orders.createIndex({ "carrierId": 1 });
db.orders.createIndex({ "status": 1 });
db.orders.createIndex({ "createdAt": -1 });
db.orders.createIndex({ "pickupDate": 1 });
db.orders.createIndex({ "deliveryDate": 1 });

// 4. Collection: scoring_history
db.createCollection("scoring_history");
db.scoring_history.createIndex({ "carrierId": 1 });
db.scoring_history.createIndex({ "calculatedAt": -1 });
db.scoring_history.createIndex({ "carrierId": 1, "calculatedAt": -1 });

// 5. Collection: email_logs
db.createCollection("email_logs");
db.email_logs.createIndex({ "to": 1 });
db.email_logs.createIndex({ "type": 1 });
db.email_logs.createIndex({ "status": 1 });
db.email_logs.createIndex({ "sentAt": -1 });
db.email_logs.createIndex({ "metadata.carrierId": 1 }, { sparse: true });

// 6. Collection: webhook_logs
db.createCollection("webhook_logs");
db.webhook_logs.createIndex({ "event": 1 });
db.webhook_logs.createIndex({ "status": 1 });
db.webhook_logs.createIndex({ "createdAt": -1 });
db.webhook_logs.createIndex({ "payload.carrierId": 1 }, { sparse: true });

// 7. Collection: monitoring_logs
db.createCollection("monitoring_logs");
db.monitoring_logs.createIndex({ "level": 1 });
db.monitoring_logs.createIndex({ "service": 1 });
db.monitoring_logs.createIndex({ "timestamp": -1 });
db.monitoring_logs.createIndex({ "alertTriggered": 1 }, { sparse: true });
// TTL index: supprimer les logs après 30 jours
db.monitoring_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 2592000 });

// 8. Collection: affretia_trial_tracking
db.createCollection("affretia_trial_tracking");
db.affretia_trial_tracking.createIndex({ "carrierId": 1 }, { unique: true });
db.affretia_trial_tracking.createIndex({ "status": 1 });
db.affretia_trial_tracking.createIndex({ "invitedAt": -1 });
db.affretia_trial_tracking.createIndex({ "convertedAt": 1 }, { sparse: true });

// 9. Collection: cache_entries (si pas de Redis)
db.createCollection("cache_entries");
db.cache_entries.createIndex({ "key": 1 }, { unique: true });
// TTL index: expiration automatique
db.cache_entries.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

print("✓ Collections et indexes créés avec succès!");
```

### Schemas des Collections Principales

#### carriers

```javascript
{
  _id: ObjectId,
  name: String,              // Nom de l'entreprise
  siret: String,             // Unique
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    zipCode: String,
    country: String
  },
  legalForm: String,         // SARL, SAS, etc.
  registrationNumber: String,
  vatNumber: String,
  status: String,            // active, inactive, pending
  score: Number,             // 0-100
  documentsCompleted: Number,
  metadata: {
    dashdocId: String,       // ID dans Dashdoc TMS
    affretiaEligible: Boolean,
    testData: Boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

#### documents

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,
  type: String,              // kbis, insurance, license, etc.
  fileName: String,
  mimeType: String,
  size: Number,
  s3Key: String,             // Chemin dans S3
  s3Bucket: String,
  status: String,            // pending, validated, rejected
  uploadedAt: Date,
  validatedAt: Date,
  ocrResults: {
    extractedData: Object,
    confidence: Number,
    processedAt: Date
  },
  metadata: Object
}
```

#### affretia_trial_tracking

```javascript
{
  _id: ObjectId,
  carrierId: ObjectId,       // Unique
  status: String,            // invited, active, converted, churned
  invitedAt: Date,
  startedTrialAt: Date,
  firstOrderAt: Date,
  convertedAt: Date,
  churnedAt: Date,
  stages: {
    invited: { date: Date, completed: Boolean },
    started_trial: { date: Date, completed: Boolean },
    first_order: { date: Date, completed: Boolean },
    converted: { date: Date, completed: Boolean }
  },
  blockers: [String],        // Raisons de blocage
  lastStage: String,
  metadata: Object
}
```

---

## Configuration AWS

### 1. AWS SES (Simple Email Service)

#### Étape 1: Vérifier le domaine

```bash
# Via AWS Console
# 1. Aller dans SES > Identities
# 2. Cliquer "Create identity"
# 3. Choisir "Domain"
# 4. Entrer: symphonia.fr
# 5. Copier les enregistrements DNS (MX, TXT)
# 6. Ajouter dans votre DNS provider
# 7. Attendre vérification (peut prendre 72h)

# Via AWS CLI
aws ses verify-domain-identity --domain symphonia.fr --region eu-central-1
```

#### Étape 2: Vérifier l'adresse email émettrice

```bash
aws ses verify-email-identity \
  --email-address noreply@symphonia.fr \
  --region eu-central-1
```

#### Étape 3: Sortir du Sandbox Mode

```bash
# Via AWS Console
# 1. Aller dans SES > Account dashboard
# 2. Cliquer "Request production access"
# 3. Remplir le formulaire:
#    - Mail Type: Transactional
#    - Website URL: https://symphonia.fr
#    - Use case: "Plateforme de transport - emails transactionnels (confirmations, alertes)"
#    - Bounce handling: Oui, via SNS
#    - Expected volume: 10,000 emails/mois
# 4. Attendre approbation (24-48h)
```

#### Étape 4: Créer des Templates d'Emails

```bash
# Template: Invitation Affret.IA
aws ses create-template --cli-input-json file://templates/affretia-invitation.json

# Contenu de affretia-invitation.json:
{
  "Template": {
    "TemplateName": "affretia-invitation",
    "SubjectPart": "Invitation à essayer Affret.IA - Plateforme de fret intelligente",
    "HtmlPart": "<html>...</html>",
    "TextPart": "Bonjour {{name}}, vous êtes invité..."
  }
}
```

#### Étape 5: Configurer SNS pour Bounces/Complaints

```bash
# Créer un topic SNS
aws sns create-topic --name ses-bounces-complaints --region eu-central-1

# Configurer SES pour publier les bounces
aws ses set-identity-notification-topic \
  --identity symphonia.fr \
  --notification-type Bounce \
  --sns-topic arn:aws:sns:eu-central-1:ACCOUNT_ID:ses-bounces-complaints \
  --region eu-central-1
```

---

### 2. AWS SNS (Simple Notification Service)

#### Étape 1: Créer un Topic pour les Alertes

```bash
aws sns create-topic \
  --name symphonia-alerts \
  --region eu-central-1

# Récupérer l'ARN
# arn:aws:sns:eu-central-1:ACCOUNT_ID:symphonia-alerts
```

#### Étape 2: Vérifier le Numéro de Téléphone

```bash
# Via Console (recommandé)
# 1. SNS > Text messaging (SMS) > Sandbox destination phone numbers
# 2. Add phone number: +33612345678
# 3. Vérifier le code reçu par SMS

# Sortir du sandbox pour SMS (demande spéciale)
# Support > Create case > Service limit increase > SNS SMS
```

#### Étape 3: Configurer les Quotas SMS

```bash
# Définir le budget mensuel (en USD)
aws sns set-sms-attributes \
  --attributes MonthlySpendLimit=50 \
  --region eu-central-1

# Type de message par défaut
aws sns set-sms-attributes \
  --attributes DefaultSMSType=Transactional \
  --region eu-central-1
```

---

### 3. AWS CloudWatch

#### Étape 1: Créer un Namespace Personnalisé

```bash
# Le namespace est créé automatiquement lors de la première métrique
# Namespace: Symphonia/Production
```

#### Étape 2: Créer un Dashboard

Créez `cloudwatch-dashboard.json`:

```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["Symphonia/Production", "CarriersCreated", {"stat": "Sum"}],
          [".", "DocumentsUploaded", {"stat": "Sum"}],
          [".", "ScoresCalculated", {"stat": "Sum"}]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "eu-central-1",
        "title": "Platform Activity"
      }
    }
  ]
}
```

```bash
aws cloudwatch put-dashboard \
  --dashboard-name Symphonia-Production \
  --dashboard-body file://cloudwatch-dashboard.json \
  --region eu-central-1
```

#### Étape 3: Créer des Alarmes

```bash
# Alarme: Trop d'erreurs
aws cloudwatch put-metric-alarm \
  --alarm-name symphonia-high-error-rate \
  --alarm-description "Taux d'erreur élevé" \
  --metric-name ErrorCount \
  --namespace Symphonia/Production \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --actions-enabled \
  --alarm-actions arn:aws:sns:eu-central-1:ACCOUNT_ID:symphonia-alerts \
  --region eu-central-1
```

---

### 4. AWS S3

#### Étape 1: Créer les Buckets

```bash
# Bucket pour documents
aws s3 mb s3://symphonia-documents-prod --region eu-central-1

# Bucket pour logs
aws s3 mb s3://symphonia-logs-prod --region eu-central-1
```

#### Étape 2: Configurer CORS sur le Bucket Documents

Créez `cors-config.json`:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.symphonia.fr", "https://admin.symphonia.fr"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

```bash
aws s3api put-bucket-cors \
  --bucket symphonia-documents-prod \
  --cors-configuration file://cors-config.json
```

#### Étape 3: Activer le Versioning

```bash
aws s3api put-bucket-versioning \
  --bucket symphonia-documents-prod \
  --versioning-configuration Status=Enabled
```

#### Étape 4: Configurer Lifecycle Policy

Créez `lifecycle-policy.json`:

```json
{
  "Rules": [
    {
      "Id": "archive-old-documents",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 2555
      }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket symphonia-documents-prod \
  --lifecycle-configuration file://lifecycle-policy.json
```

---

### 5. AWS ElastiCache Redis (Optionnel)

#### Étape 1: Créer un Security Group

```bash
aws ec2 create-security-group \
  --group-name symphonia-redis-sg \
  --description "Security group for Symphonia Redis" \
  --vpc-id vpc-XXXXXXXX \
  --region eu-central-1

# Autoriser l'accès depuis les instances EB
aws ec2 authorize-security-group-ingress \
  --group-id sg-XXXXXXXX \
  --protocol tcp \
  --port 6379 \
  --source-group sg-YYYYYYYY \
  --region eu-central-1
```

#### Étape 2: Créer le Cluster Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id symphonia-redis-prod \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --security-group-ids sg-XXXXXXXX \
  --region eu-central-1
```

#### Étape 3: Récupérer l'Endpoint

```bash
aws elasticache describe-cache-clusters \
  --cache-cluster-id symphonia-redis-prod \
  --show-cache-node-info \
  --region eu-central-1 \
  --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
  --output text

# Résultat: symphonia-redis-prod.cache.amazonaws.com
```

---

## Déploiement Elastic Beanstalk

### Prérequis

```bash
# Installer EB CLI
pip install awsebcli

# Vérifier l'installation
eb --version
# EB CLI 3.20.x (Python 3.x)
```

### Configuration `.ebextensions`

Chaque service doit avoir un dossier `.ebextensions/` avec les fichiers de configuration.

#### Exemple: `tms-sync-eb/.ebextensions/01-environment.config`

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    PORT: 8080
  aws:elasticbeanstalk:container:nodejs:
    NodeCommand: "node index.js"
    NodeVersion: 18.x
  aws:autoscaling:launchconfiguration:
    InstanceType: t3.small
    RootVolumeType: gp3
    RootVolumeSize: 10
  aws:elasticbeanstalk:environment:
    EnvironmentType: LoadBalanced
    LoadBalancerType: application
  aws:elasticbeanstalk:environment:process:default:
    HealthCheckPath: /health
    HealthCheckInterval: 30
    HealthCheckTimeout: 5
    HealthyThresholdCount: 2
    UnhealthyThresholdCount: 3
```

#### Exemple: `.ebextensions/02-cron.config` (pour TMS Sync)

```yaml
files:
  "/etc/cron.d/tms-sync":
    mode: "000644"
    owner: root
    group: root
    content: |
      # Sync toutes les minutes
      * * * * * root curl -X POST http://localhost:8080/api/v1/sync/trigger

commands:
  remove_old_cron:
    command: "rm -f /etc/cron.d/*.bak"
```

### Déploiement d'un Service

#### Étape 1: Préparer le Package

```bash
cd services/tms-sync-eb

# Installer les dépendances
npm install --production

# Créer le package (exclure node_modules de dev)
zip -r ../../deploy/tms-sync-eb-v2.2.0.zip . \
  -x "*.git*" "*.env*" "node_modules/@types/*" "test/*"
```

#### Étape 2: Initialiser EB (première fois seulement)

```bash
eb init

# Choisir:
# Region: eu-central-1 (Frankfurt)
# Application name: tms-sync-eb
# Platform: Node.js 18
# SSH: Yes
# Keypair: (créer ou sélectionner)
```

#### Étape 3: Créer l'Environnement (première fois seulement)

```bash
eb create tms-sync-eb-prod \
  --instance-type t3.small \
  --envvars \
    NODE_ENV=production,\
    MONGODB_URI=mongodb+srv://...,\
    REDIS_ENABLED=true
```

#### Étape 4: Déployer

```bash
# Déployer une nouvelle version
eb deploy tms-sync-eb-prod

# Suivre les logs en temps réel
eb logs --stream
```

#### Étape 5: Configurer les Variables d'Environnement

```bash
# Via CLI
eb setenv \
  MONGODB_URI="mongodb+srv://..." \
  REDIS_URL="redis://..." \
  AWS_REGION="eu-central-1" \
  --environment tms-sync-eb-prod

# Via Console (recommandé pour les secrets)
# 1. EB > Environments > tms-sync-eb-prod
# 2. Configuration > Software
# 3. Edit > Environment properties
# 4. Ajouter les variables
# 5. Apply
```

### Health Checks

Chaque service doit exposer un endpoint `/health`:

```javascript
// Exemple: health endpoint
app.get('/health', async (req, res) => {
  try {
    // Vérifier MongoDB
    await mongoose.connection.db.admin().ping();

    // Vérifier Redis (si activé)
    if (redisClient) {
      await redisClient.ping();
    }

    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      mongodb: 'connected',
      redis: redisClient ? 'connected' : 'disabled',
      version: process.env.npm_package_version,
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
    });
  }
});
```

### Rollback en Cas d'Échec

```bash
# Lister les versions
eb appversion

# Rollback vers une version précédente
eb deploy --version v2.1.0

# OU via Console
# EB > Environments > Actions > Deploy a different version
```

---

## Post-Déploiement

### 1. Tests de Fumée (Smoke Tests)

```bash
# Test 1: Health checks
curl https://tms-sync.symphonia.fr/health
# Attendu: {"status":"OK",...}

curl https://authz.symphonia.fr/health
# Attendu: {"status":"OK",...}

curl https://affretia.symphonia.fr/health
# Attendu: {"status":"OK",...}

# Test 2: Test d'authentification
curl -X POST https://authz.symphonia.fr/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Test 3: Test de cache
curl https://carriers.symphonia.fr/api/v1/cache/stats

# Test 4: Test de monitoring
curl https://tms-sync.symphonia.fr/api/v1/monitoring/status
```

### 2. Vérification des Crons

```bash
# Se connecter à l'instance EB
eb ssh tms-sync-eb-prod

# Vérifier les crons
sudo cat /etc/cron.d/tms-sync

# Vérifier les logs cron
sudo tail -f /var/log/cron

# Tester manuellement le sync
curl -X POST http://localhost:8080/api/v1/sync/trigger
```

### 3. Vérification des Webhooks

```bash
# Test webhook local
curl -X POST http://localhost:8080/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"event":"carrier.created","data":{"id":"test123"}}'

# Vérifier les logs de webhooks dans MongoDB
mongo> db.webhook_logs.find().sort({createdAt:-1}).limit(5)
```

### 4. Vérification des Dashboards

Accéder aux dashboards:

1. **Email Metrics**: https://admin.symphonia.fr/dashboards/email-metrics
2. **Carrier Scoring**: https://admin.symphonia.fr/dashboards/carrier-scoring
3. **TMS Real-Time**: https://admin.symphonia.fr/dashboards/tms-monitoring

Vérifier:
- Chargement des données
- Graphiques s'affichent
- Temps de réponse < 500ms
- Pas d'erreurs dans la console

### 5. Monitoring CloudWatch

```bash
# Vérifier que les métriques sont envoyées
aws cloudwatch list-metrics \
  --namespace Symphonia/Production \
  --region eu-central-1

# Vérifier une métrique spécifique
aws cloudwatch get-metric-statistics \
  --namespace Symphonia/Production \
  --metric-name CarriersCreated \
  --start-time 2026-02-01T00:00:00Z \
  --end-time 2026-02-01T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region eu-central-1
```

### 6. Tests End-to-End Automatisés

```bash
cd rt-backend-services

# Configurer les URLs de production dans .env
cat > .env.prod << EOF
TMS_API_URL=https://tms-sync.symphonia.fr
AUTHZ_API_URL=https://authz.symphonia.fr
CARRIERS_API_URL=https://carriers.symphonia.fr
AFFRETIA_API_URL=https://affretia.symphonia.fr
MONGODB_URI=mongodb+srv://...
EOF

# Exécuter les tests
node tests/test-e2e-monitoring.cjs
node tests/test-e2e-cache-redis.cjs
node tests/test-e2e-dashboards.cjs
node tests/test-e2e-analytics.cjs
node tests/test-e2e-complete-workflow.cjs

# OU lancer tous les tests
npm run test:e2e
```

---

## Troubleshooting

### Problème: Service ne démarre pas

**Symptôme**: Environment health = Red, logs montrent des erreurs

**Diagnostic**:

```bash
# Voir les logs
eb logs --stream

# Vérifier les erreurs récentes
eb logs | grep -i error

# Se connecter à l'instance
eb ssh

# Vérifier les logs Node.js
sudo tail -f /var/log/nodejs/nodejs.log

# Vérifier les variables d'environnement
sudo /opt/elasticbeanstalk/bin/get-config environment
```

**Solutions courantes**:

1. **Variable d'environnement manquante**:
   ```bash
   eb setenv MISSING_VAR=value
   ```

2. **Problème de connexion MongoDB**:
   - Vérifier l'IP de l'instance EB dans la whitelist MongoDB Atlas
   - Tester la connexion: `mongo "mongodb+srv://..."`

3. **Port incorrect**:
   - Elastic Beanstalk utilise le port 8080 par défaut
   - Vérifier: `process.env.PORT || 8080`

---

### Problème: MongoDB connection timeout

**Symptôme**: `MongoNetworkError: connection timeout`

**Solutions**:

1. **Vérifier la whitelist MongoDB Atlas**:
   - Aller dans Network Access
   - Ajouter l'IP de l'instance EB ou `0.0.0.0/0` (temporairement)

2. **Vérifier le connection string**:
   ```bash
   # Bon format:
   mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority

   # Mauvais format (manque le nom de DB):
   mongodb+srv://username:password@cluster.mongodb.net
   ```

3. **Augmenter le timeout**:
   ```javascript
   mongoose.connect(uri, {
     serverSelectionTimeoutMS: 30000,
     socketTimeoutMS: 45000,
   });
   ```

---

### Problème: Redis connection failed

**Symptôme**: Cache ne fonctionne pas, logs montrent `ECONNREFUSED`

**Solutions**:

1. **Vérifier le Security Group**:
   - EB instance doit être dans un SG autorisé
   - Port 6379 doit être ouvert

2. **Fallback sur cache mémoire**:
   ```javascript
   let cache;
   try {
     cache = await createRedisClient();
   } catch (error) {
     console.warn('Redis unavailable, using memory cache');
     cache = new MemoryCache();
   }
   ```

3. **Vérifier l'endpoint Redis**:
   ```bash
   aws elasticache describe-cache-clusters \
     --cache-cluster-id symphonia-redis-prod \
     --show-cache-node-info
   ```

---

### Problème: Emails ne sont pas envoyés

**Symptôme**: Aucun email reçu, pas d'erreur dans les logs

**Diagnostic**:

```bash
# Vérifier les email logs dans MongoDB
db.email_logs.find().sort({sentAt:-1}).limit(10)

# Vérifier le statut SES
aws ses get-account-sending-enabled --region eu-central-1

# Vérifier les quotas
aws ses get-send-quota --region eu-central-1
```

**Solutions**:

1. **Toujours en Sandbox**:
   - Demander production access (voir section AWS SES)
   - En sandbox, seules les adresses vérifiées peuvent recevoir

2. **Adresse émettrice non vérifiée**:
   ```bash
   aws ses verify-email-identity \
     --email-address noreply@symphonia.fr
   ```

3. **Credentials incorrects (SMTP)**:
   - Régénérer les credentials SMTP dans SES
   - Attention: Username SMTP ≠ Access Key

---

### Problème: Cron jobs ne s'exécutent pas

**Symptôme**: Sync TMS ne se lance pas automatiquement

**Diagnostic**:

```bash
# SSH dans l'instance
eb ssh

# Vérifier que le cron est installé
sudo cat /etc/cron.d/tms-sync

# Vérifier les logs cron
sudo tail -f /var/log/cron
```

**Solutions**:

1. **Cron non installé**:
   - Vérifier `.ebextensions/02-cron.config`
   - Redéployer: `eb deploy`

2. **URL incorrecte dans le cron**:
   ```bash
   # Devrait être:
   * * * * * root curl -X POST http://localhost:8080/api/v1/sync/trigger

   # PAS http://127.0.0.1 ou l'URL publique
   ```

3. **Permissions du fichier cron**:
   ```bash
   sudo chmod 644 /etc/cron.d/tms-sync
   sudo chown root:root /etc/cron.d/tms-sync
   ```

---

### Problème: CloudWatch metrics ne s'affichent pas

**Symptôme**: Dashboard vide, métriques introuvables

**Diagnostic**:

```bash
# Lister les métriques disponibles
aws cloudwatch list-metrics \
  --namespace Symphonia/Production

# Vérifier les credentials AWS dans l'instance
eb ssh
aws sts get-caller-identity
```

**Solutions**:

1. **IAM role manquant**:
   - L'instance EB doit avoir un role avec `cloudwatch:PutMetricData`
   - Créer un custom role ou utiliser `aws-elasticbeanstalk-ec2-role`

2. **Région incorrecte**:
   ```bash
   # Vérifier que AWS_REGION est défini
   eb printenv | grep AWS_REGION
   ```

3. **Métriques dans le mauvais namespace**:
   ```javascript
   // Bon:
   cloudwatch.putMetricData({
     Namespace: 'Symphonia/Production',
     //...
   });

   // Mauvais:
   Namespace: 'Symphonia-Production' // pas de /
   ```

---

### Commandes de Diagnostic Utiles

```bash
# Status général
eb status

# Logs en temps réel
eb logs --stream

# Voir les événements récents
eb events --follow

# Configuration actuelle
eb config

# Lister toutes les variables d'environnement
eb printenv

# Santé de l'environnement
eb health

# Se connecter en SSH
eb ssh

# Redémarrer l'application
eb restart

# Rebuilder l'environnement (last resort)
eb rebuild
```

---

## Support et Ressources

### Documentation Officielle

- [AWS Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/)
- [MongoDB Atlas](https://docs.atlas.mongodb.com/)
- [AWS SES](https://docs.aws.amazon.com/ses/)
- [AWS SNS](https://docs.aws.amazon.com/sns/)
- [AWS CloudWatch](https://docs.aws.amazon.com/cloudwatch/)

### Logs et Monitoring

- **CloudWatch Logs**: Console AWS > CloudWatch > Log groups
- **EB Logs**: `eb logs` ou Console EB > Logs
- **MongoDB Logs**: Atlas Console > Database > Monitoring

### Contacts

- **Support Technique**: support@symphonia.fr
- **Urgences**: +33 6 12 34 56 78
- **Documentation**: https://docs.symphonia.fr

---

**Version**: 2.2.0
**Dernière mise à jour**: 1er février 2026
**Auteur**: RT Technologie

🤖 Généré avec Claude Code
