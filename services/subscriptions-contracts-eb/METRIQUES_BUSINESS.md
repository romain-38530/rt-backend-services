# Métriques Business - RT SYMPHONI.A

## Version: 1.0.0
## Module: subscriptions-contracts-eb

---

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [KPIs Commandes & Livraisons](#kpis-commandes--livraisons)
3. [KPIs Transporteurs](#kpis-transporteurs)
4. [KPIs Abonnements](#kpis-abonnements)
5. [KPIs e-CMR](#kpis-e-cmr)
6. [Revenus](#revenus)
7. [Utilisation des métriques](#utilisation-des-métriques)

---

## Vue d'ensemble

Ce document décrit les métriques business suivies dans RT SYMPHONI.A pour mesurer la performance opérationnelle et financière de la plateforme.

### Objectifs des métriques business

- **Suivi de performance**: Mesurer la santé de l'activité
- **Détection d'anomalies**: Identifier rapidement les problèmes
- **Optimisation**: Améliorer les processus métier
- **Reporting**: Fournir des données pour la direction
- **Prévision**: Anticiper les tendances

### Catégories de métriques

1. **Commandes & Livraisons**: Volume, délais, qualité
2. **Transporteurs**: Performance, scoring, compliance
3. **Abonnements**: Souscriptions, renouvellements, churns
4. **e-CMR**: Signatures, validation, conformité
5. **Revenus**: Ventes, ARR, MRR

---

## KPIs Commandes & Livraisons

### 📊 Transport Orders Created

**Description**: Nombre de commandes de transport créées

**Métrique CloudWatch**: `TransportOrdersCreated`

**Calcul**: Count par période (heure, jour, mois)

**Objectifs**:
- Jour: > 50 commandes
- Semaine: > 350 commandes
- Mois: > 1500 commandes

**Tracking dans le code**:

```javascript
const { logTransportOrderCreated } = require('./middleware/monitoring-middleware');

app.post('/api/transport-orders', async (req, res) => {
  // Créer la commande
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

**Query CloudWatch Logs Insights**:

```
fields @timestamp, metric, value, metadata.orderId, metadata.totalAmount
| filter metric = "transport_order_created"
| stats count() as order_count, sum(metadata.totalAmount) as total_revenue by bin(1d)
```

---

### 📊 Delivery Completed

**Description**: Nombre de livraisons terminées

**Métrique CloudWatch**: `DeliveryCompleted`

**Dimensions**:
- `OnTime`: true/false (livraison à l'heure ou en retard)

**Objectifs**:
- Taux de complétion: > 95%
- Délai moyen: < 24h

**Tracking**:

```javascript
const { logDeliveryCompleted } = require('./middleware/monitoring-middleware');

app.post('/api/transport-orders/:id/complete', async (req, res) => {
  const order = await completeDelivery(req.params.id);

  const onTime = order.actualDeliveryTime <= order.expectedDeliveryTime;
  const delayMinutes = onTime ? 0 : calculateDelay(order);

  logDeliveryCompleted(order._id, {
    onTime,
    delayed: !onTime,
    delayMinutes,
    actualDeliveryTime: order.actualDeliveryTime,
    expectedDeliveryTime: order.expectedDeliveryTime
  });

  res.json({ success: true, data: order });
});
```

---

### 📊 Delivery Delay Rate

**Description**: Pourcentage de livraisons en retard

**Métrique CloudWatch**: `DeliveryDelayRate`

**Calcul**: (Livraisons en retard / Total livraisons) × 100

**Seuils**:
- ✅ Excellent: < 5%
- 🟡 Acceptable: 5-20%
- 🔴 Problématique: > 20%

**Dashboard**: Business Dashboard widget "Delivery Delay Rate"

**Query d'analyse**:

```
fields @timestamp, metadata.onTime, metadata.delay
| filter metric = "delivery_completed"
| stats sum(metadata.onTime = false) as delayed_deliveries, count() as total_deliveries
| eval delay_rate = (delayed_deliveries / total_deliveries) * 100
```

---

### 📊 Delivery Delay Duration

**Description**: Durée moyenne et maximale des retards

**Métrique CloudWatch**: `DeliveryDelay`

**Unité**: Minutes

**Tracking**: Automatique lors du `logDeliveryCompleted` si retard détecté

**Objectifs**:
- Délai moyen: < 30 minutes
- Délai maximum: < 2 heures

**Query d'analyse des pires retards**:

```
fields @timestamp, metadata.orderId, metadata.delay, metadata.carrierId
| filter metric = "delivery_completed" and metadata.onTime = false
| sort metadata.delay desc
| limit 20
```

---

## KPIs Transporteurs

### 📊 Average Carrier Score

**Description**: Score moyen de performance des transporteurs

**Métrique CloudWatch**: `AverageCarrierScore`

**Échelle**: 0-100

**Calcul**: Moyenne pondérée de:
- Ponctualité (40%)
- Qualité du service (30%)
- Satisfaction client (20%)
- Compliance documentaire (10%)

**Seuils**:
- ✅ Excellent: > 85
- 🟡 Acceptable: 70-85
- 🔴 Problématique: < 70

**Tracking**:

```javascript
const { logCarrierScoreUpdate } = require('./middleware/monitoring-middleware');

async function updateCarrierScore(carrierId, deliveryData) {
  const currentScore = await getCarrierScore(carrierId);

  // Calculer nouveau score
  const newScore = calculateScore({
    punctuality: deliveryData.onTime,
    serviceQuality: deliveryData.rating,
    clientSatisfaction: deliveryData.feedback,
    compliance: deliveryData.documentsComplete
  });

  await saveCarrierScore(carrierId, newScore);

  logCarrierScoreUpdate(carrierId, {
    previous: currentScore,
    current: newScore
  }, 'delivery_completion');

  return newScore;
}
```

---

### 📊 Carrier Score Updates

**Description**: Nombre de mises à jour de score transporteur

**Métrique CloudWatch**: `CarrierScoreUpdates`

**Dimensions**:
- `ScoreType`: delivery_completion, incident, customer_feedback, etc.

**Utilité**: Mesurer la fréquence d'évaluation des transporteurs

**Query d'analyse**:

```
fields @timestamp, metadata.carrierId, metadata.newScore, metadata.previousScore
| filter metric = "carrier_score_updated"
| stats count() as update_count, avg(metadata.newScore) as avg_score by metadata.carrierId
| sort avg_score asc
```

---

### 📊 Carrier Performance by Type

**Description**: Performance par type de transport

**Dimensions personnalisées**:
- Type de transport (standard, express, frigorifique, etc.)
- Zone géographique
- Type de marchandise

**Query d'analyse**:

```
fields metadata.transportType, metadata.onTime
| filter metric = "delivery_completed"
| stats
    count() as total,
    sum(metadata.onTime) as on_time,
    avg(metadata.delay) as avg_delay
  by metadata.transportType
| eval punctuality_rate = (on_time / total) * 100
| sort punctuality_rate desc
```

---

## KPIs Abonnements

### 📊 Subscription Events

**Description**: Événements liés aux abonnements

**Métrique CloudWatch**: `SubscriptionEvents`

**Dimensions**:
- `Action`: created, renewed, upgraded, downgraded, cancelled
- `PlanType`: basic, pro, premium, enterprise

**Tracking**:

```javascript
const { logSubscriptionEvent } = require('./middleware/monitoring-middleware');

app.post('/api/subscriptions', async (req, res) => {
  const subscription = await createSubscription(req.body);

  logSubscriptionEvent('created', {
    planType: subscription.planType,
    userId: subscription.userId,
    amount: subscription.amount
  });

  res.json({ success: true, data: subscription });
});
```

---

### 📊 Subscription Revenue

**Description**: Revenus des abonnements

**Métrique CloudWatch**: `SubscriptionRevenue`

**Dimensions**:
- `PlanType`: basic, pro, premium, enterprise

**Calculs dérivés**:
- **MRR** (Monthly Recurring Revenue): Revenus mensuels récurrents
- **ARR** (Annual Recurring Revenue): MRR × 12
- **ARPU** (Average Revenue Per User): MRR / Nombre d'abonnés actifs

**Query MRR**:

```
fields @timestamp, metadata.amount, metadata.planType
| filter metric = "subscription_event" and metadata.action = "created"
| stats sum(metadata.amount) as mrr by bin(30d)
```

---

### 📊 Churn Rate

**Description**: Taux d'attrition des abonnements

**Calcul**: (Abonnements annulés / Total abonnements actifs début période) × 100

**Objectif**: < 5% par mois

**Query**:

```
fields metadata.action
| filter metric = "subscription_event"
| stats
    sum(metadata.action = "cancelled") as cancelled,
    sum(metadata.action = "created") as created
  by bin(30d)
| eval churn_rate = (cancelled / created) * 100
```

---

## KPIs e-CMR

### 📊 e-CMR Signatures

**Description**: Nombre de signatures e-CMR

**Métrique CloudWatch**: `ECMRSignatures`

**Dimensions**:
- `Party`: sender, carrierPickup, carrierDelivery, consignee

**Workflow complet**:
1. Sender signe (création e-CMR)
2. Carrier Pickup signe (prise en charge)
3. Carrier Delivery signe (livraison)
4. Consignee signe (réception)

**Tracking**:

```javascript
const { logECMRSignature } = require('./middleware/monitoring-middleware');

app.post('/api/ecmr/:id/sign/:party', async (req, res) => {
  const startTime = Date.now();

  const ecmr = await signECMR(req.params.id, req.params.party, req.body);

  const signatureTime = Date.now() - startTime;

  logECMRSignature(ecmr._id, req.params.party, signatureTime);

  res.json({ success: true, data: ecmr });
});
```

---

### 📊 Signature Time

**Description**: Temps moyen de signature e-CMR

**Métrique CloudWatch**: `SignatureTime`

**Unité**: Millisecondes

**Objectifs**:
- Moyenne: < 500ms
- p95: < 1000ms

**Dashboard**: Business Dashboard widget "e-CMR Signature Time"

---

### 📊 e-CMR Completion Rate

**Description**: Taux de complétion des e-CMR (toutes signatures collectées)

**Calcul**: (e-CMR complètement signés / Total e-CMR créés) × 100

**Objectif**: > 95%

**Query**:

```
fields @timestamp, metadata.cmrId, metadata.party
| filter metric = "ecmr_signature"
| stats count() as signature_count by metadata.cmrId
| filter signature_count = 4
| stats count() as complete_ecmr
```

---

## Revenus

### 📊 Order Revenue

**Description**: Revenus des commandes de transport

**Métrique CloudWatch**: `OrderRevenue`

**Dimensions**:
- `Status`: completed, cancelled, refunded

**Tracking**: Automatique lors du `logTransportOrderCreated`

---

### 📊 Total Revenue

**Description**: Revenus totaux (Commandes + Abonnements)

**Calcul**: `OrderRevenue + SubscriptionRevenue`

**Dashboard**: Widget avec expression mathématique CloudWatch

**Query globale**:

```
fields @timestamp, metric, value
| filter metric in ["transport_order_created", "subscription_event"]
| stats sum(metadata.totalAmount + metadata.amount) as total_revenue by bin(1d)
```

---

### 📊 Revenue by Source

**Description**: Répartition des revenus par source

**Sources**:
- Transport orders
- Subscriptions
- Premium features (GPS tracking, etc.)

**Query**:

```
fields metric, metadata.totalAmount, metadata.amount
| stats
    sum(metadata.totalAmount) as order_revenue,
    sum(metadata.amount) as subscription_revenue
| eval total = order_revenue + subscription_revenue
| eval order_percent = (order_revenue / total) * 100
| eval subscription_percent = (subscription_revenue / total) * 100
```

---

## Utilisation des métriques

### Dashboard Business

Accédez au dashboard business:

```
CloudWatch Console → Dashboards → RT-SYMPHONIA-production-business
```

Widgets disponibles:
- Transport Orders Created
- Deliveries Completed
- Order Revenue
- Delivery Delay Rate
- Average Carrier Score
- e-CMR Signatures
- Subscription Revenue
- Total Revenue

---

### Alerts Business

Configurées dans CloudFormation:

- ⚠️ Low Order Volume: < 5 commandes/heure
- ⚠️ High Delivery Delay Rate: > 20%
- ⚠️ Low Carrier Score: < 70

---

### Rapports automatiques

#### Rapport quotidien

```bash
# Script à programmer dans cron (exemple)
#!/bin/bash
aws cloudwatch get-metric-statistics \
  --namespace RT/SYMPHONIA/SubscriptionsContracts \
  --metric-name TransportOrdersCreated \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT00:00:00) \
  --end-time $(date -u +%Y-%m-%dT00:00:00) \
  --period 86400 \
  --statistics Sum \
  --region eu-west-3
```

#### Rapport mensuel

Utilisez CloudWatch Logs Insights avec la période de 30 jours.

---

### Export des données

#### Vers S3 (archivage)

```bash
aws logs create-export-task \
  --log-group-name /aws/elasticbeanstalk/subscriptions-contracts-eb/business-metrics \
  --from $(date -d '30 days ago' +%s)000 \
  --to $(date +%s)000 \
  --destination rt-symphonia-logs-archive \
  --destination-prefix business-metrics/$(date +%Y/%m)
```

#### Vers Excel/CSV

1. Exécutez une query dans Logs Insights
2. Cliquez sur "Export results"
3. Choisissez le format CSV
4. Ouvrez dans Excel pour analyse

---

### Intégration BI Tools

#### Tableau / Power BI

1. Utilisez CloudWatch Logs Insights API
2. Créez un connector custom
3. Rafraîchissement automatique des données

#### Google Data Studio

1. Utilisez BigQuery Export (via Kinesis Firehose)
2. Connectez Data Studio à BigQuery
3. Créez des dashboards personnalisés

---

## Métriques avancées (Future)

### Prédictions ML

- Prévision du volume de commandes
- Détection d'anomalies
- Optimisation des prix

### Segmentation clients

- RFM Analysis (Recency, Frequency, Monetary)
- Customer Lifetime Value (CLV)
- Cohort Analysis

### Performance opérationnelle

- Taux d'utilisation de la capacité
- Coût par livraison
- Marge par commande

---

## Glossaire

- **MRR**: Monthly Recurring Revenue (Revenus mensuels récurrents)
- **ARR**: Annual Recurring Revenue (Revenus annuels récurrents)
- **ARPU**: Average Revenue Per User (Revenu moyen par utilisateur)
- **Churn**: Taux d'attrition (clients perdus)
- **CAC**: Customer Acquisition Cost (Coût d'acquisition client)
- **LTV**: Lifetime Value (Valeur vie client)
- **KPI**: Key Performance Indicator (Indicateur clé de performance)
- **SLA**: Service Level Agreement (Accord de niveau de service)

---

**Version**: 1.0.0
**Dernière mise à jour**: 26 novembre 2025
**Auteur**: RT SYMPHONI.A Business Analytics Team
