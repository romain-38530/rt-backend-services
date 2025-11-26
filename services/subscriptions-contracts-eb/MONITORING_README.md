# Monitoring RT SYMPHONI.A - Guide de démarrage rapide

## Version: 1.0.0

---

## Installation rapide

### 1. Installer les dépendances

```bash
cd services/subscriptions-contracts-eb
npm install
```

### 2. Déployer l'infrastructure de monitoring

```bash
# Configurer les variables d'environnement
export AWS_REGION=eu-west-3
export ENVIRONMENT=production
export EB_ENV_NAME=subscriptions-contracts-eb-prod
export EMAIL_CRITICAL=alerts-critical@rt-symphonia.com
export EMAIL_WARNING=alerts-warning@rt-symphonia.com

# Rendre les scripts exécutables
chmod +x scripts/*.sh

# Déployer la stack CloudFormation
./scripts/deploy-monitoring.sh
```

### 3. Créer les dashboards CloudWatch

```bash
./scripts/create-dashboards.sh
```

### 4. Configurer les abonnements SNS

```bash
./scripts/create-sns-subscriptions.sh
```

### 5. Intégrer le monitoring dans l'application

Modifiez `index.js` pour ajouter le middleware de monitoring:

```javascript
// Après les imports existants
const monitoring = require('./middleware/monitoring-middleware');
const healthRoutes = require('./routes/health-routes');

// Après le security middleware
app.use(monitoring.requestMonitoring);

// Remplacer le health check existant par le nouveau
app.use('/health', healthRoutes(mongoClient, mongoConnected));
```

### 6. Tester le système d'alertes

```bash
./scripts/test-alerting.sh
```

---

## Structure des fichiers

```
subscriptions-contracts-eb/
├── .ebextensions/
│   ├── cloudwatch-monitoring.config   # Config agent CloudWatch
│   └── cloudwatch-logs.config         # Config logs CloudWatch
├── cloudformation/
│   └── monitoring-stack.yml           # Stack monitoring complète
├── dashboards/
│   ├── infrastructure-dashboard.json  # Dashboard infra
│   ├── application-dashboard.json     # Dashboard applicatif
│   └── business-dashboard.json        # Dashboard business
├── middleware/
│   └── monitoring-middleware.js       # Middleware Express
├── utils/
│   └── cloudwatch-metrics.js          # Utilitaire métriques
├── routes/
│   └── health-routes.js               # Health checks améliorés
├── scripts/
│   ├── deploy-monitoring.sh           # Déploiement stack
│   ├── create-dashboards.sh           # Création dashboards
│   ├── create-sns-subscriptions.sh    # Config SNS
│   └── test-alerting.sh               # Tests alertes
├── queries/
│   ├── errors-last-24h.query          # Query erreurs
│   ├── slow-requests.query            # Query requêtes lentes
│   ├── security-events.query          # Query sécurité
│   ├── business-metrics.query         # Query business
│   ├── mongodb-errors.query           # Query MongoDB
│   └── request-patterns.query         # Query patterns
├── CONFIGURATION_MONITORING.md        # Doc complète
├── ALERTES_PLAYBOOK.md                # Playbook alertes
└── METRIQUES_BUSINESS.md              # Doc métriques business
```

---

## Dashboards disponibles

### Infrastructure Dashboard
- CPU, Memory, Disk
- Network, TCP Connections
- Node.js Process Metrics
- Disk I/O, Uptime

### Application Dashboard
- API Requests, Errors
- Response Time (p50, p95, p99)
- MongoDB Operations
- Security Events

### Business Dashboard
- Transport Orders, Deliveries
- Revenue, Delay Rate
- Carrier Scores
- e-CMR Signatures
- Subscriptions

---

## Alertes configurées

### Infrastructure
- 🔴 CPU > 95% (Critical)
- 🟡 CPU > 80% (Warning)
- 🔴 Memory > 90% (Critical)
- 🟡 Disk > 85% (Warning)

### Application
- 🔴 Error Rate > 5%
- 🔴 5xx Errors > 10/min
- 🟡 Latency > 1000ms (p95)
- 🔴 MongoDB Failures > 5/min

### Business
- 🟡 Orders < 5/hour
- 🟡 Delay Rate > 20%
- 🟡 Carrier Score < 70

---

## Health Checks

### Endpoints disponibles

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health check (MongoDB, Memory, CPU, Disk)
- `GET /health/ready` - Readiness check (pour load balancers)
- `GET /health/live` - Liveness check (pour containers)
- `GET /health/metrics` - System metrics

### Exemple d'utilisation

```bash
# Basic health
curl https://api.rt-symphonia.com/health

# Detailed health
curl https://api.rt-symphonia.com/health/detailed | jq

# Metrics
curl https://api.rt-symphonia.com/health/metrics | jq
```

---

## Tracking des métriques business

### Exemple: Tracking d'une commande

```javascript
const { logTransportOrderCreated } = require('./middleware/monitoring-middleware');

app.post('/api/transport-orders', async (req, res) => {
  const order = await createTransportOrder(req.body);

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

### Fonctions disponibles

```javascript
const monitoring = require('./middleware/monitoring-middleware');

// Business metrics
monitoring.logTransportOrderCreated(orderId, details);
monitoring.logDeliveryCompleted(orderId, details);
monitoring.logCarrierScoreUpdate(carrierId, score, type);
monitoring.logECMRSignature(cmrId, party, time);
monitoring.logSubscriptionEvent(action, details);

// Security logging
monitoring.logSecurityEvent(type, severity, details);
monitoring.logAuthenticationAttempt(success, userId, ip);
monitoring.logRateLimitExceeded(endpoint, ip);
monitoring.logSuspiciousActivity(type, details);
```

---

## CloudWatch Logs Insights

### Queries prêtes à l'emploi

Toutes les queries sont dans le dossier `queries/`:

1. **errors-last-24h.query** - Erreurs des dernières 24h
2. **slow-requests.query** - Requêtes lentes (>1s)
3. **security-events.query** - Événements de sécurité
4. **business-metrics.query** - Métriques business
5. **mongodb-errors.query** - Erreurs MongoDB
6. **request-patterns.query** - Patterns de requêtes

### Utilisation

1. Ouvrez CloudWatch Console
2. Allez dans "Logs Insights"
3. Sélectionnez le log group approprié
4. Copiez-collez la query
5. Exécutez

---

## Commandes utiles

### Vérifier l'état des alarmes

```bash
aws cloudwatch describe-alarms \
  --state-value ALARM \
  --region eu-west-3
```

### Voir les métriques récentes

```bash
aws cloudwatch get-metric-statistics \
  --namespace RT/SYMPHONIA/SubscriptionsContracts \
  --metric-name APIRequests \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region eu-west-3
```

### Publier une métrique custom

```bash
aws cloudwatch put-metric-data \
  --namespace RT/SYMPHONIA/SubscriptionsContracts \
  --metric-name TestMetric \
  --value 100 \
  --unit Count \
  --region eu-west-3
```

---

## Variables d'environnement

Ajoutez ces variables dans votre configuration Elastic Beanstalk:

```bash
CLOUDWATCH_ENABLED=true
CLOUDWATCH_NAMESPACE=RT/SYMPHONIA/SubscriptionsContracts
CLOUDWATCH_LOG_LEVEL=info
METRICS_ENABLED=true
AWS_REGION=eu-west-3
LOG_DIR=/var/app/current/logs
```

---

## Troubleshooting

### Les métriques ne sont pas envoyées

1. Vérifiez les permissions IAM de l'instance EC2
2. Vérifiez que `METRICS_ENABLED=true`
3. Vérifiez les logs: `eb logs --stream`

### Les alarmes ne se déclenchent pas

1. Attendez 5-10 minutes (période d'évaluation)
2. Vérifiez que les métriques sont bien publiées
3. Vérifiez les seuils de l'alarme

### Les emails SNS ne sont pas reçus

1. Vérifiez que vous avez confirmé l'abonnement
2. Vérifiez les spams
3. Vérifiez l'ARN du topic dans l'alarme

---

## Documentation complète

- **CONFIGURATION_MONITORING.md** - Configuration détaillée
- **ALERTES_PLAYBOOK.md** - Que faire quand une alerte se déclenche
- **METRIQUES_BUSINESS.md** - Description des métriques business

---

## Support

Pour toute question:
- Email: support-tech@rt-symphonia.com
- Slack: #devops-alerts

---

**Bon monitoring !** 📊🔍✅
