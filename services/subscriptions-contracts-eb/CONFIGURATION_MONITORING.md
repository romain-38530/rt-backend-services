# Configuration du Monitoring - RT SYMPHONI.A

## Version: 1.0.0
## Module: subscriptions-contracts-eb

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture du monitoring](#architecture-du-monitoring)
3. [Installation et déploiement](#installation-et-déploiement)
4. [Configuration CloudWatch](#configuration-cloudwatch)
5. [Alertes SNS](#alertes-sns)
6. [Dashboards](#dashboards)
7. [Métriques personnalisées](#métriques-personnalisées)
8. [Logs](#logs)
9. [Maintenance](#maintenance)

---

## Vue d'ensemble

Le système de monitoring pour RT SYMPHONI.A - Subscriptions & Contracts API (v1.6.2) fournit une surveillance complète de l'infrastructure, de l'application et des métriques métier.

### Composants principaux

- **CloudWatch Metrics**: Métriques infrastructure et applicatives
- **CloudWatch Logs**: Centralisation des logs
- **CloudWatch Alarms**: Alertes automatiques
- **CloudWatch Dashboards**: Visualisation en temps réel
- **SNS Topics**: Notifications multi-canaux
- **Custom Metrics**: Métriques métier personnalisées

### Métriques surveillées

#### Infrastructure
- CPU (warning: >80%, critical: >95%)
- Memory (critical: >90%)
- Disk Space (warning: >85%)
- Network I/O
- TCP Connections

#### Application
- API Requests (total, par endpoint)
- Error Rate (critical: >5%)
- Response Time (p50, p95, p99)
- 5xx Errors (critical: >10/min)
- MongoDB Operations
- Security Events

#### Business
- Transport Orders Created
- Deliveries Completed
- Delivery Delay Rate (warning: >20%)
- Carrier Scores (warning: <70)
- e-CMR Signatures
- Subscription Events
- Revenue Tracking

---

## Architecture du monitoring

```
┌─────────────────────────────────────────────────────────────────┐
│                    Application (Node.js)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Express.js  │→ │  Monitoring  │→ │  CloudWatch Metrics  │  │
│  │  Middleware  │  │  Middleware  │  │      SDK Client      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      AWS CloudWatch                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Metrics    │  │     Logs     │  │      Alarms          │  │
│  │  - Custom    │  │  - Access    │  │  - Infrastructure    │  │
│  │  - System    │  │  - Errors    │  │  - Application       │  │
│  │  - Business  │  │  - Security  │  │  - Business          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      SNS Topics                                 │
│  ┌──────────────────────┐  ┌──────────────────────────────┐    │
│  │  Critical Alerts     │  │     Warning Alerts           │    │
│  │  - Email             │  │     - Email                  │    │
│  │  - SMS               │  │     - Slack                  │    │
│  │  - Slack             │  │                              │    │
│  └──────────────────────┘  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Installation et déploiement

### Prérequis

- AWS CLI configuré avec les bonnes permissions
- Node.js 20+ (déjà installé sur Elastic Beanstalk)
- Accès aux services AWS:
  - CloudWatch (Metrics, Logs, Alarms, Dashboards)
  - SNS
  - CloudFormation
  - Elastic Beanstalk

### Étape 1: Installer les dépendances

Ajoutez le SDK CloudWatch à votre package.json:

```bash
npm install @aws-sdk/client-cloudwatch
```

### Étape 2: Déployer la stack CloudFormation

```bash
cd services/subscriptions-contracts-eb

# Configurer les variables d'environnement
export AWS_REGION=eu-west-3
export ENVIRONMENT=production
export EB_ENV_NAME=subscriptions-contracts-eb-prod
export EMAIL_CRITICAL=alerts-critical@rt-symphonia.com
export EMAIL_WARNING=alerts-warning@rt-symphonia.com

# Déployer la stack de monitoring
chmod +x scripts/deploy-monitoring.sh
./scripts/deploy-monitoring.sh
```

### Étape 3: Créer les dashboards

```bash
chmod +x scripts/create-dashboards.sh
./scripts/create-dashboards.sh
```

### Étape 4: Configurer les abonnements SNS

```bash
chmod +x scripts/create-sns-subscriptions.sh
./scripts/create-sns-subscriptions.sh
```

### Étape 5: Mettre à jour l'application

Intégrez le middleware de monitoring dans votre application (voir section [Métriques personnalisées](#métriques-personnalisées)).

### Étape 6: Tester le système

```bash
chmod +x scripts/test-alerting.sh
./scripts/test-alerting.sh
```

---

## Configuration CloudWatch

### Agent CloudWatch

L'agent CloudWatch est configuré via `.ebextensions/cloudwatch-monitoring.config` et collecte:

- CPU, Memory, Disk, Network
- Processus Node.js (CPU, Memory, Uptime)
- Logs applicatifs

Configuration détaillée dans `/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json`.

### Groupes de logs

| Groupe de logs | Description | Rétention |
|----------------|-------------|-----------|
| `/aws/elasticbeanstalk/.../application` | Logs applicatifs | 30 jours |
| `/aws/elasticbeanstalk/.../errors` | Logs d'erreurs | 30 jours |
| `/aws/elasticbeanstalk/.../access` | Logs d'accès HTTP | 30 jours |
| `/aws/elasticbeanstalk/.../security` | Événements de sécurité | 30 jours |
| `/aws/elasticbeanstalk/.../business-metrics` | Métriques métier | 30 jours |

### Namespace des métriques

Toutes les métriques personnalisées sont publiées dans le namespace:

```
RT/SYMPHONIA/SubscriptionsContracts
```

---

## Alertes SNS

### Topics SNS

#### Critical Alerts Topic
- **Nom**: `rt-symphonia-production-critical-alerts`
- **Canaux**: Email, SMS, Slack
- **Utilisation**: Alertes critiques nécessitant une action immédiate

#### Warning Alerts Topic
- **Nom**: `rt-symphonia-production-warning-alerts`
- **Canaux**: Email, Slack
- **Utilisation**: Alertes de surveillance, action non urgente

### Alarmes configurées

| Alarme | Seuil | Évaluation | Action |
|--------|-------|------------|--------|
| High CPU | >80% | 5 min | Warning |
| Critical CPU | >95% | 5 min | Critical |
| High Memory | >90% | 10 min | Critical |
| High Disk | >85% | 5 min | Warning |
| High Error Rate | >5% | 10 min | Critical |
| 5xx Errors | >10/min | 3 min | Critical |
| High Latency | >1000ms | 10 min | Warning |
| MongoDB Failures | >5/min | 1 min | Critical |
| Low Order Volume | <5/hour | 2 hours | Warning |
| High Delay Rate | >20% | 1 hour | Warning |
| Low Carrier Score | <70 | 2 hours | Warning |

### Ajouter des abonnements

#### Via AWS CLI

```bash
# Email
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-3:ACCOUNT_ID:rt-symphonia-production-critical-alerts \
  --protocol email \
  --notification-endpoint votre-email@example.com

# SMS
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-3:ACCOUNT_ID:rt-symphonia-production-critical-alerts \
  --protocol sms \
  --notification-endpoint +33612345678

# Slack (webhook HTTPS)
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-west-3:ACCOUNT_ID:rt-symphonia-production-critical-alerts \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

#### Via Script interactif

```bash
./scripts/create-sns-subscriptions.sh
```

---

## Dashboards

### Infrastructure Dashboard

**Nom**: `RT-SYMPHONIA-production-infrastructure`

**Widgets**:
- CPU Utilization (Average, Maximum)
- Memory Utilization
- Disk Space Utilization
- Network Traffic (In/Out)
- TCP Connections
- Node.js Process Metrics
- Disk I/O
- Process Uptime
- Recent Application Errors (Logs)

### Application Dashboard

**Nom**: `RT-SYMPHONIA-production-application`

**Widgets**:
- API Requests (Total)
- API Errors (4xx, 5xx)
- Error Rate
- Response Time (Average, p50, p95, p99)
- Response Time Percentiles
- MongoDB Operations
- MongoDB Connection Failures
- MongoDB Health Status
- MongoDB Operation Duration
- Slow Requests (>1s)
- Security Events
- Application Errors
- Recent 5xx Errors (Logs)
- Slowest Requests (Logs)

### Business Dashboard

**Nom**: `RT-SYMPHONIA-production-business`

**Widgets**:
- Transport Orders Created
- Deliveries Completed
- Order Revenue
- Delivery Delay Rate
- Delivery Delay Duration
- Average Carrier Score
- Carrier Score Updates
- e-CMR Signatures
- e-CMR Signature Time
- Subscription Events
- Subscription Revenue
- Total Revenue (Orders + Subscriptions)
- Recent Transport Orders (Logs)
- Recent Delayed Deliveries (Logs)
- Recent Carrier Score Updates (Logs)

### Accéder aux dashboards

```
https://console.aws.amazon.com/cloudwatch/home?region=eu-west-3#dashboards:
```

---

## Métriques personnalisées

### Intégration dans l'application

#### 1. Ajouter le middleware de monitoring

Modifiez `index.js`:

```javascript
const monitoring = require('./middleware/monitoring-middleware');
const healthRoutes = require('./routes/health-routes');

// Ajouter le middleware de monitoring (après security middleware)
app.use(monitoring.requestMonitoring);

// Monter les routes de health check améliorées
app.use('/health', healthRoutes(mongoClient, mongoConnected));
```

#### 2. Utiliser les fonctions de tracking

```javascript
const {
  logTransportOrderCreated,
  logDeliveryCompleted,
  logCarrierScoreUpdate,
  logECMRSignature,
  logSubscriptionEvent
} = require('./middleware/monitoring-middleware');

// Exemple: Tracker une commande
app.post('/api/transport-orders', async (req, res) => {
  // ... créer la commande ...

  // Log business metric
  logTransportOrderCreated(order._id, {
    status: order.status,
    totalAmount: order.totalAmount,
    carrierId: order.carrierId,
    origin: order.origin,
    destination: order.destination
  });

  res.json({ success: true, data: order });
});
```

### Métriques disponibles

#### Infrastructure
- `NodeProcessCPU`: Utilisation CPU du processus Node.js
- `NodeProcessMemory`: Utilisation mémoire du processus
- `NodeProcessUptime`: Uptime du processus
- `MongoDBHealthy`: État de santé MongoDB (1=healthy, 0=unhealthy)

#### Application
- `APIRequests`: Nombre de requêtes API
- `ResponseTime`: Temps de réponse
- `ResponseTimeP50/P95/P99`: Percentiles de temps de réponse
- `4xxErrors`: Erreurs client
- `5xxErrors`: Erreurs serveur
- `ErrorRate`: Taux d'erreur en pourcentage
- `SlowRequests`: Requêtes lentes (>1s)
- `MongoDBOperations`: Opérations MongoDB
- `MongoDBConnectionFailures`: Échecs de connexion MongoDB
- `MongoDBOperationDuration`: Durée des opérations MongoDB
- `SecurityEvents`: Événements de sécurité
- `RateLimitExceeded`: Dépassements de limite de taux

#### Business
- `TransportOrdersCreated`: Commandes de transport créées
- `OrderRevenue`: Revenus des commandes
- `DeliveryCompleted`: Livraisons terminées
- `DeliveryDelayRate`: Taux de retard de livraison
- `DeliveryDelay`: Durée du retard
- `CarrierScoreUpdates`: Mises à jour de score transporteur
- `AverageCarrierScore`: Score moyen transporteur
- `ECMRSignatures`: Signatures e-CMR
- `SignatureTime`: Temps de signature
- `SubscriptionEvents`: Événements d'abonnement
- `SubscriptionRevenue`: Revenus d'abonnements

---

## Logs

### Structure des logs

Tous les logs sont au format JSON pour faciliter le parsing:

```json
{
  "timestamp": "2025-11-26T10:30:45.123Z",
  "level": "INFO",
  "requestId": "req_1732618245123_abc123",
  "method": "POST",
  "url": "/api/transport-orders",
  "statusCode": 201,
  "duration": 145,
  "ip": "192.168.1.1",
  "userId": "user_12345"
}
```

### Queries CloudWatch Logs Insights

#### Erreurs des dernières 24h

```
fields @timestamp, level, @message, requestId, method, url, statusCode
| filter level = "ERROR" or statusCode >= 500
| sort @timestamp desc
| limit 100
```

#### Requêtes lentes (>1s)

```
fields @timestamp, method, url, duration, statusCode, requestId
| filter duration > 1000
| sort duration desc
| limit 50
```

#### Événements de sécurité

```
fields @timestamp, eventType, severity, details.ip, details.userId
| filter severity = "critical" or severity = "warning"
| sort @timestamp desc
| limit 100
```

#### Métriques métier

```
fields @timestamp, metric, value, metadata
| stats count(*) as event_count by metric
| sort event_count desc
```

#### Erreurs MongoDB

```
fields @timestamp, @message, requestId
| filter @message like /MongoDB/ and (@message like /error/ or @message like /failed/)
| sort @timestamp desc
| limit 100
```

#### Patterns de requêtes

```
fields method, url, statusCode, duration
| stats count(*) as request_count, avg(duration) as avg_duration, max(duration) as max_duration by url, method
| sort request_count desc
| limit 50
```

### Utiliser les queries

1. Ouvrez CloudWatch Console
2. Allez dans "Logs Insights"
3. Sélectionnez le log group
4. Copiez-collez une query
5. Sélectionnez la période
6. Cliquez sur "Run query"

---

## Maintenance

### Vérifier l'état du monitoring

```bash
# Vérifier les alarmes en état ALARM
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --region eu-west-3

# Vérifier les métriques récentes
aws cloudwatch get-metric-statistics \
  --namespace RT/SYMPHONIA/SubscriptionsContracts \
  --metric-name APIRequests \
  --start-time 2025-11-26T00:00:00Z \
  --end-time 2025-11-26T23:59:59Z \
  --period 3600 \
  --statistics Sum \
  --region eu-west-3
```

### Mettre à jour la stack

```bash
# Modifier cloudformation/monitoring-stack.yml
# Puis redéployer
./scripts/deploy-monitoring.sh
```

### Nettoyer les anciennes données

Les logs sont automatiquement supprimés après 30 jours (configurable dans la stack CloudFormation).

Pour modifier la rétention:

```bash
aws logs put-retention-policy \
  --log-group-name /aws/elasticbeanstalk/subscriptions-contracts-eb/application \
  --retention-in-days 60 \
  --region eu-west-3
```

### Désactiver temporairement les alertes

```bash
# Désactiver une alarme
aws cloudwatch disable-alarm-actions \
  --alarm-names production-subscriptions-contracts-high-cpu \
  --region eu-west-3

# Réactiver
aws cloudwatch enable-alarm-actions \
  --alarm-names production-subscriptions-contracts-high-cpu \
  --region eu-west-3
```

### Supprimer le monitoring

```bash
# Supprimer les dashboards
aws cloudwatch delete-dashboards \
  --dashboard-names RT-SYMPHONIA-production-infrastructure \
                    RT-SYMPHONIA-production-application \
                    RT-SYMPHONIA-production-business \
  --region eu-west-3

# Supprimer la stack CloudFormation
aws cloudformation delete-stack \
  --stack-name rt-symphonia-subscriptions-contracts-monitoring \
  --region eu-west-3
```

---

## Support

Pour toute question ou problème:

- **Email**: support-tech@rt-symphonia.com
- **Documentation AWS CloudWatch**: https://docs.aws.amazon.com/cloudwatch/
- **Documentation Elastic Beanstalk**: https://docs.aws.amazon.com/elasticbeanstalk/

---

**Version**: 1.0.0
**Dernière mise à jour**: 26 novembre 2025
**Auteur**: RT SYMPHONI.A DevOps Team
