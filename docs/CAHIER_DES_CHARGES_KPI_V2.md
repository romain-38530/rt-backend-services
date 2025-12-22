# CAHIER DES CHARGES - Module KPI SYMPHONI.A v2.0

## Document de Spécifications Techniques et Fonctionnelles

**Version:** 2.0
**Date:** 22 Décembre 2025
**Statut:** En cours de développement
**Auteur:** Équipe SYMPHONI.A

---

## 1. CONTEXTE ET OBJECTIFS

### 1.1 Contexte

Le module KPI (Key Performance Indicators) de SYMPHONI.A vise à fournir une vision consolidée et temps réel de la performance transport et logistique à travers tous les univers de la plateforme :

- **Industry** : Donneurs d'ordre industriels
- **Transporter** : Transporteurs et chauffeurs
- **Forwarder** : Commissionnaires de transport
- **Recipient** : Destinataires des marchandises
- **Logistician** : Gestionnaires d'entrepôts et sites logistiques

### 1.2 Objectifs

1. **Centraliser** les indicateurs de performance de tous les univers
2. **Automatiser** la collecte des données depuis les APIs existantes
3. **Visualiser** les KPIs en temps réel avec des dashboards interactifs
4. **Alerter** proactivement sur les anomalies et dépassements de seuils
5. **Exporter** les rapports en PDF et Excel pour le reporting

### 1.3 État Actuel (Audit)

| Composant | État | Problèmes identifiés |
|-----------|------|---------------------|
| Backend KPI API | ✅ Opérationnel | Données simulées (Math.random) |
| Routes API | ⚠️ Partiel | Mismatch `/kpi/*` vs `/api/v1/kpi/*` |
| Dashboard Industry | ❌ Non connecté | Données hardcodées |
| Dashboard Transporter | ❌ Non connecté | Routes inexistantes |
| Interconnexions | ❌ Non implémenté | Pas de collecte réelle |
| WebSocket temps réel | ✅ Implémenté | Non utilisé côté frontend |

---

## 2. ARCHITECTURE TECHNIQUE

### 2.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTENDS (Portails)                               │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│  Industry   │ Transporter │  Forwarder  │  Recipient  │    Logistician      │
│  Dashboard  │  Dashboard  │  Dashboard  │  Dashboard  │     Dashboard       │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────┘
       │             │             │             │                 │
       └─────────────┴─────────────┴─────────────┴─────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │     CloudFront CDN           │
                    │  d57lw7v3zgfpy.cloudfront.net│
                    └──────────────┬───────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │      KPI API v2.0            │
                    │   (Elastic Beanstalk)        │
                    │   rt-kpi-api-prod            │
                    └──────────────┬───────────────┘
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       │                           │                           │
       ▼                           ▼                           ▼
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│   MongoDB    │         │  APIs Sources    │         │   WebSocket  │
│  (KPI Cache) │         │  (Interconnect)  │         │  (Temps réel)│
└──────────────┘         └──────────────────┘         └──────────────┘
                                   │
       ┌───────────┬───────────┬───┴───┬───────────┬───────────┐
       │           │           │       │           │           │
       ▼           ▼           ▼       ▼           ▼           ▼
   Orders API  Tracking API Planning  Billing   Vigilance  Affret.IA
                            Sites API   API       API        API
```

### 2.2 Stack Technique

| Composant | Technologie | Version |
|-----------|-------------|---------|
| Backend | Node.js / Express | 18.x |
| Base de données | MongoDB Atlas | 6.x |
| Cache | MongoDB (snapshots) | - |
| Temps réel | WebSocket (ws) | 8.x |
| Frontend | Next.js / React | 14.x |
| Graphiques | Chart.js / Recharts | - |
| Export PDF | PDFKit | 0.14.x |
| Export Excel | ExcelJS | 4.x |
| Hébergement | AWS Elastic Beanstalk | - |
| CDN | AWS CloudFront | - |
| Scheduling | node-cron | 3.x |

### 2.3 URLs de Production

| Service | URL |
|---------|-----|
| KPI API | `https://d57lw7v3zgfpy.cloudfront.net` |
| Orders API | `https://dh9acecfz0wg0.cloudfront.net` |
| Tracking API | `https://d2mn43ccfvt3ub.cloudfront.net` |
| Planning API | `https://d1bnvnjck6s4u2.cloudfront.net` |
| Billing API | `https://d1234billing.cloudfront.net` |
| Notifications API | `https://d2t9age53em7o5.cloudfront.net` |

---

## 3. SPÉCIFICATIONS FONCTIONNELLES

### 3.1 KPIs par Univers

#### 3.1.1 Industry (Donneur d'ordre)

| KPI | Description | Source | Calcul |
|-----|-------------|--------|--------|
| **Commandes totales** | Nombre de commandes sur période | Orders API | COUNT(orders) |
| **Taux de livraison à l'heure** | % livraisons dans le créneau | Tracking API | (on_time / total) * 100 |
| **Coût moyen transport** | Prix moyen par commande | Orders API | AVG(price) |
| **Taux d'utilisation Affret.IA** | % commandes via Affret.IA | Orders API | (affretia / total) * 100 |
| **Économies réalisées** | Gains vs tarifs référencés | Pricing API | SUM(grid_price - actual_price) |
| **Taux de retard** | % transports en retard | Tracking API | (delayed / total) * 100 |
| **Satisfaction transporteurs** | Score moyen transporteurs | KPI API | AVG(carrier_score) |
| **Documents conformes** | % documents reçus à temps | Documents API | (on_time_docs / total) * 100 |
| **Empreinte carbone** | CO2 total et par transport | Calcul | distance * factor |

#### 3.1.2 Transporter (Transporteur)

| KPI | Description | Source | Calcul |
|-----|-------------|--------|--------|
| **Score global** | Note sur 100 | KPI API | Weighted average (9 critères) |
| **Transports réalisés** | Nombre sur période | Orders API | COUNT(completed) |
| **Taux d'acceptation** | % commandes acceptées | Orders API | (accepted / received) * 100 |
| **Temps de réponse** | Délai moyen de réponse | Orders API | AVG(response_time) |
| **Retards non justifiés** | Nombre de retards | Tracking API | COUNT(unjustified_delays) |
| **Respect créneaux** | % RDV honorés | Planning API | (honored / total) * 100 |
| **Qualité tracking** | Score communication | Tracking API | Score 0-100 |
| **Documents à temps** | % CMR/POD déposés à temps | Documents API | (on_time / total) * 100 |
| **Ranking** | Position vs autres transporteurs | KPI API | RANK(score) |

**Critères de Scoring Transporteur (100 points):**

| Critère | Poids | Description |
|---------|-------|-------------|
| Respect créneaux | 15% | Ponctualité aux RDV |
| Délai dépôt documents | 10% | Rapidité POD/CMR |
| Retards non justifiés | 15% | Pénalité retards |
| Temps de réponse | 10% | Réactivité commandes |
| Conformité vigilance | 15% | Documents en règle |
| Taux annulations | 10% | Fiabilité engagement |
| Qualité tracking | 10% | Communication position |
| Adoption Premium | 5% | Utilisation modules |
| Fiabilité globale | 10% | Historique général |

#### 3.1.3 Forwarder (Commissionnaire)

| KPI | Description | Source | Calcul |
|-----|-------------|--------|--------|
| **Chiffre d'affaires** | CA total sur période | Billing API | SUM(invoiced) |
| **Marge moyenne** | % marge par transport | Billing API | AVG(margin) |
| **Taux de service** | % commandes livrées OK | Orders API | (success / total) * 100 |
| **Délai facturation** | Temps moyen facturation | Billing API | AVG(invoice_delay) |
| **Transporteurs actifs** | Nombre transporteurs utilisés | Orders API | COUNT(DISTINCT carrier) |
| **Top transporteurs** | Meilleurs scores | KPI API | TOP N by score |
| **Litiges en cours** | Nombre de litiges ouverts | Billing API | COUNT(disputes) |
| **Taux recouvrement** | % factures payées | Billing API | (paid / invoiced) * 100 |

#### 3.1.4 Recipient (Destinataire)

| KPI | Description | Source | Calcul |
|-----|-------------|--------|--------|
| **Livraisons attendues** | Prévisions J/J+1/J+7 | Orders API | COUNT(expected) |
| **Livraisons reçues** | Complétées sur période | Orders API | COUNT(delivered) |
| **Taux conformité** | % livraisons conformes | Orders API | (conform / total) * 100 |
| **Retards subis** | Nombre de retards | Tracking API | COUNT(delays) |
| **ETA fiabilité** | Précision des ETAs | Tracking API | AVG(eta_accuracy) |
| **Incidents signalés** | Anomalies déclarées | Orders API | COUNT(incidents) |
| **Temps moyen déchargement** | Durée moyenne | Planning API | AVG(unload_time) |

#### 3.1.5 Logistician (Entrepôt)

| KPI | Description | Source | Calcul |
|-----|-------------|--------|--------|
| **Saturation quais** | % occupation | Planning API | (used / total) * 100 |
| **Temps attente moyen** | Attente avant quai | Planning API | AVG(wait_time) |
| **Temps chargement** | Durée moyenne | Planning API | AVG(load_time) |
| **RDV honorés** | % créneaux respectés | Planning API | (honored / total) * 100 |
| **No-shows** | Transporteurs absents | Planning API | COUNT(no_show) |
| **File d'attente** | Camions en attente | Planning API | COUNT(waiting) |
| **Débit journalier** | Camions traités/jour | Planning API | COUNT(completed)/day |
| **Taux adoption kiosque** | % check-in digitaux | Planning API | (digital / total) * 100 |

### 3.2 Alertes et Seuils

| Type d'alerte | Seuil | Sévérité | Action |
|---------------|-------|----------|--------|
| Retard détecté | > 20 min | High | Notification + Dashboard |
| Chauffeur inactif | > 2h sans position | Medium | Notification |
| Blocage quai | > 30 min | High | Notification urgente |
| Documents manquants | > 24h après livraison | Medium | Relance auto |
| Refus en chaîne | 3 refus consécutifs | High | Escalade Affret.IA |
| Anomalie ETA | Écart > 1h | Medium | Recalcul auto |
| Problème vigilance | Document expiré | Critical | Blocage transporteur |
| No-show | Absence au RDV | High | Pénalité + Notification |
| Capacité critique | Saturation > 90% | High | Alerte planning |
| Anomalie coût | Écart > 20% vs grille | Medium | Vérification manuelle |

### 3.3 Dashboards par Univers

#### 3.3.1 Dashboard Industry

```
┌────────────────────────────────────────────────────────────────────┐
│  SYMPHONI.A - Tableau de bord KPI Industry                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  1,247   │  │  €245K   │  │   892    │  │   96%    │           │
│  │ Commandes│  │ Revenus  │  │Livraisons│  │Satisfaction│          │
│  │  +12%    │  │  +8%     │  │  +5%     │  │  +2%     │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                    │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐ │
│  │ Évolution Commandes (7j)    │  │ Top 5 Transporteurs         │ │
│  │ [Graphique ligne]           │  │ 1. TransExpress    87/100   │ │
│  │                             │  │ 2. FastFreight     82/100   │ │
│  │                             │  │ 3. EuroTrans       79/100   │ │
│  │                             │  │ 4. LogiPro         75/100   │ │
│  │                             │  │ 5. SpeedLog        71/100   │ │
│  └─────────────────────────────┘  └─────────────────────────────┘ │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Alertes Actives (3)                                         │  │
│  │ ⚠️ Retard détecté - CMD-2024-1234 - il y a 15 min          │  │
│  │ ⚠️ Document manquant - CMD-2024-1189 - il y a 2h           │  │
│  │ 🔴 Transporteur bloqué vigilance - TRANS-456                │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  [📥 Export PDF]  [📊 Export Excel]  [⚙️ Paramètres]              │
└────────────────────────────────────────────────────────────────────┘
```

#### 3.3.2 Dashboard Transporter

```
┌────────────────────────────────────────────────────────────────────┐
│  SYMPHONI.A - Mon Score Transporteur                               │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌────────────────────────────────────────┐                       │
│  │           SCORE GLOBAL                 │                       │
│  │              78/100                    │                       │
│  │         ████████████████░░░░           │                       │
│  │      Rang: #23 sur 156 transporteurs   │                       │
│  │      Évolution: ↑ +3 pts ce mois       │                       │
│  └────────────────────────────────────────┘                       │
│                                                                    │
│  Détail des critères:                                              │
│  ├─ Respect créneaux      ████████████░░ 85%  (15 pts)            │
│  ├─ Délai documents       ████████░░░░░░ 60%  (10 pts)            │
│  ├─ Retards non justifiés ██████████████ 95%  (15 pts)            │
│  ├─ Temps de réponse      ████████████░░ 80%  (10 pts)            │
│  ├─ Conformité vigilance  ██████████████ 100% (15 pts)            │
│  ├─ Taux annulations      ████████████░░ 90%  (10 pts)            │
│  ├─ Qualité tracking      ██████░░░░░░░░ 45%  (10 pts)            │
│  ├─ Adoption Premium      ████████░░░░░░ 60%  (5 pts)             │
│  └─ Fiabilité globale     ████████████░░ 82%  (10 pts)            │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Mes statistiques ce mois                                    │  │
│  │ • 47 transports réalisés                                    │  │
│  │ • 92% taux d'acceptation                                    │  │
│  │ • 12 min temps de réponse moyen                             │  │
│  │ • 2 retards signalés                                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. SPÉCIFICATIONS TECHNIQUES API

### 4.1 Routes API v2 (à implémenter)

#### 4.1.1 Routes Globales

```
GET  /api/v1/kpi/dashboard
     Query: ?universe=industry|transporter|forwarder|recipient|logistician
            &period=today|week|month|quarter|year
            &companyId=xxx
     Response: { success, data: { summary, charts, alerts } }

GET  /api/v1/kpi/live
     Response: { success, data: { operational }, wsEndpoint }

GET  /api/v1/kpi/alerts
     Query: ?severity=low|medium|high|critical
            &acknowledged=true|false
     Response: { success, data: [alerts], summary }
```

#### 4.1.2 Routes Industry

```
GET  /api/v1/kpi/industry/:companyId/summary
     Response: {
       success,
       data: {
         orders: { total, trend, byStatus },
         deliveries: { onTime, delayed, rate },
         costs: { average, total, savings },
         carriers: { active, topScores },
         carbon: { total, perTransport }
       }
     }

GET  /api/v1/kpi/industry/:companyId/orders
     Query: ?period=xxx&groupBy=day|week|month
     Response: { success, data: { timeseries, totals } }

GET  /api/v1/kpi/industry/:companyId/carriers
     Response: { success, data: { carriers: [...], ranking } }
```

#### 4.1.3 Routes Transporter

```
GET  /api/v1/kpi/carrier/:carrierId/score
     Response: {
       success,
       data: {
         score,
         scoreDetails: { ... 9 critères ... },
         ranking: { global, percentile, byLane },
         trends: { lastWeek, lastMonth, evolution },
         metrics: { totalTransports, onTime, ... }
       }
     }

GET  /api/v1/kpi/carrier/:carrierId/history
     Query: ?period=3m|6m|1y
     Response: { success, data: { timeseries } }

POST /api/v1/kpi/carrier/:carrierId/dispatch-event
     Body: { orderId, event, responseTimeMinutes, refusalReason }
     Response: { success, data: { metrics, score } }
```

#### 4.1.4 Routes Logistician

```
GET  /api/v1/kpi/warehouse/:warehouseId/summary
     Response: {
       success,
       data: {
         dockPerformance: { saturation, waitTime, loadTime },
         appointments: { honored, noShows, rescheduled },
         realTime: { activeDocks, queue, trucksOnSite },
         throughput: { daily, weekly, trend }
       }
     }

GET  /api/v1/kpi/warehouse/:warehouseId/docks
     Response: { success, data: { docks: [...status...] } }

GET  /api/v1/kpi/warehouse/:warehouseId/queue
     Response: { success, data: { waiting: [...], estimatedTimes } }
```

#### 4.1.5 Routes Export

```
GET  /api/v1/kpi/export/pdf
     Query: ?universe=xxx&companyId=xxx&period=xxx
     Response: application/pdf (download)

GET  /api/v1/kpi/export/excel
     Query: ?universe=xxx&companyId=xxx&period=xxx
     Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### 4.2 Interconnexions avec les APIs Sources

#### 4.2.1 Collecteur de Données

```javascript
// Service de collecte automatique
const KPICollector = {
  // Collecte depuis Orders API
  async collectOrdersData(companyId, period) {
    const response = await fetch(`${ORDERS_API}/api/v1/orders?companyId=${companyId}&period=${period}`);
    return response.json();
  },

  // Collecte depuis Tracking API
  async collectTrackingData(orderIds) {
    const response = await fetch(`${TRACKING_API}/api/v1/tracking/batch`, {
      method: 'POST',
      body: JSON.stringify({ orderIds })
    });
    return response.json();
  },

  // Collecte depuis Planning API
  async collectPlanningData(siteId, date) {
    const response = await fetch(`${PLANNING_API}/api/v1/sites/${siteId}/appointments?date=${date}`);
    return response.json();
  },

  // Agrégation et calcul des KPIs
  async calculateKPIs(rawData) {
    return {
      operational: this.calculateOperational(rawData),
      financial: this.calculateFinancial(rawData),
      quality: this.calculateQuality(rawData),
      environmental: this.calculateEnvironmental(rawData)
    };
  }
};
```

#### 4.2.2 Webhooks Entrants

Les APIs sources doivent envoyer des webhooks au KPI API pour mise à jour temps réel :

```javascript
// Webhook depuis Orders API
POST /api/v1/kpi/webhooks/orders
Body: {
  event: 'order_created' | 'order_completed' | 'order_cancelled',
  orderId: 'xxx',
  data: { ... }
}

// Webhook depuis Tracking API
POST /api/v1/kpi/webhooks/tracking
Body: {
  event: 'position_update' | 'eta_update' | 'delay_detected',
  orderId: 'xxx',
  data: { ... }
}

// Webhook depuis Planning API
POST /api/v1/kpi/webhooks/planning
Body: {
  event: 'appointment_created' | 'check_in' | 'check_out' | 'no_show',
  appointmentId: 'xxx',
  data: { ... }
}
```

### 4.3 Cache et Performance

#### 4.3.1 Stratégie de Cache

| Donnée | TTL | Invalidation |
|--------|-----|--------------|
| KPIs temps réel | 1 min | Automatique |
| Scores transporteurs | 1h | Sur événement |
| Agrégats journaliers | 24h | Cron nuit |
| Agrégats mensuels | 7 jours | Cron hebdo |
| Alertes | Pas de cache | - |

#### 4.3.2 Snapshots MongoDB

```javascript
// Schema KPISnapshot
{
  type: 'operational' | 'carrier' | 'industry' | 'logistics' | 'financial',
  entityId: String,  // companyId, carrierId, warehouseId
  entityType: String,
  period: 'realtime' | 'hourly' | 'daily' | 'weekly' | 'monthly',
  data: Mixed,       // Les KPIs calculés
  calculatedAt: Date,
  validUntil: Date
}
```

---

## 5. PLAN DE DÉPLOIEMENT

### 5.1 Phase 1 : Alignement API (Semaine 1)

**Objectif:** Corriger le mismatch des routes frontend/backend

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Ajouter alias `/api/v1/kpi/*` dans le backend | Haute | 2h |
| Mettre à jour `api.ts` des frontends | Haute | 4h |
| Tester toutes les routes | Haute | 2h |
| Déployer sur EB | Haute | 1h |

### 5.2 Phase 2 : Interconnexions Réelles (Semaine 2-3)

**Objectif:** Remplacer les données simulées par des données réelles

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Implémenter collecteur Orders API | Haute | 8h |
| Implémenter collecteur Tracking API | Haute | 8h |
| Implémenter collecteur Planning API | Moyenne | 6h |
| Implémenter webhooks entrants | Moyenne | 6h |
| Tests d'intégration | Haute | 4h |

### 5.3 Phase 3 : Dashboards Frontend (Semaine 3-4)

**Objectif:** Connecter les dashboards aux vrais KPIs

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Dashboard Industry complet | Haute | 16h |
| Dashboard Transporter (score) | Haute | 12h |
| Dashboard Logistician | Moyenne | 12h |
| Dashboard Forwarder | Moyenne | 8h |
| Dashboard Recipient | Basse | 6h |
| Graphiques Chart.js/Recharts | Moyenne | 8h |

### 5.4 Phase 4 : Temps Réel et Alertes (Semaine 4-5)

**Objectif:** Activer le temps réel et les alertes

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Intégration WebSocket frontend | Haute | 8h |
| Système d'alertes complet | Haute | 12h |
| Notifications push (via Notifications API) | Moyenne | 6h |
| Widget alertes sur dashboards | Moyenne | 4h |

### 5.5 Phase 5 : Exports et Rapports (Semaine 5-6)

**Objectif:** Finaliser les exports PDF/Excel

| Tâche | Priorité | Effort |
|-------|----------|--------|
| Templates PDF améliorés | Moyenne | 8h |
| Templates Excel avec graphiques | Moyenne | 6h |
| Rapports programmés (cron) | Basse | 4h |
| Envoi automatique par email | Basse | 4h |

---

## 6. TESTS ET VALIDATION

### 6.1 Tests Unitaires

```javascript
// Exemple de tests
describe('KPIService', () => {
  describe('calculateCarrierScore', () => {
    it('should calculate score from 9 criteria', async () => {
      const score = await KPIService.calculateCarrierScore('carrier-123');
      expect(score.score).toBeGreaterThanOrEqual(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(Object.keys(score.scoreDetails)).toHaveLength(9);
    });
  });

  describe('calculateOperationalKPIs', () => {
    it('should return all operational metrics', async () => {
      const kpis = await KPIService.calculateOperationalKPIs();
      expect(kpis.transportsInProgress).toBeDefined();
      expect(kpis.delays).toBeDefined();
      expect(kpis.eta).toBeDefined();
    });
  });
});
```

### 6.2 Tests d'Intégration

| Scénario | APIs impliquées | Résultat attendu |
|----------|-----------------|------------------|
| Création commande | Orders → KPI | KPIs mis à jour en < 1 min |
| Retard détecté | Tracking → KPI | Alerte créée + WebSocket |
| Check-in site | Planning → KPI | Saturation recalculée |
| Fin de journée | Tous → KPI | Snapshot daily créé |

### 6.3 Tests de Performance

| Métrique | Objectif | Méthode |
|----------|----------|---------|
| Temps réponse API | < 200ms | Load testing |
| Latence WebSocket | < 100ms | Monitoring |
| Calcul KPIs batch | < 5s pour 1000 orders | Benchmark |
| Export PDF | < 10s | Test manuel |

---

## 7. SÉCURITÉ

### 7.1 Authentification

- JWT Bearer Token requis sur toutes les routes `/api/v1/kpi/*`
- Validation du token via Auth API
- Extraction du `companyId` et `role` depuis le token

### 7.2 Autorisation

| Rôle | Accès |
|------|-------|
| Admin | Tous les KPIs, tous les univers |
| Industry Manager | KPIs de son entreprise uniquement |
| Transporter | Son score et ses métriques |
| Forwarder | KPIs de ses clients/transporteurs |
| Logistician | KPIs de ses sites |

### 7.3 Rate Limiting

| Endpoint | Limite |
|----------|--------|
| `/kpi/live` | 60 req/min |
| `/kpi/export/*` | 10 req/min |
| Autres | 100 req/min |

---

## 8. MONITORING ET OBSERVABILITÉ

### 8.1 Métriques à Surveiller

| Métrique | Seuil alerte | Action |
|----------|--------------|--------|
| API Response Time | > 500ms | Alerte Slack |
| Error Rate | > 1% | Alerte + Investigation |
| WebSocket Connections | > 1000 | Scale up |
| MongoDB CPU | > 80% | Scale up |
| Cache Hit Rate | < 70% | Optimiser TTL |

### 8.2 Logs

```json
{
  "timestamp": "2025-12-22T12:00:00Z",
  "service": "kpi-api",
  "level": "info",
  "message": "KPI calculated",
  "context": {
    "type": "carrier_score",
    "carrierId": "xxx",
    "score": 78,
    "duration_ms": 45
  }
}
```

---

## 9. ANNEXES

### A. Schémas MongoDB

```javascript
// Collection: kpi_snapshots
{
  _id: ObjectId,
  type: String,
  entityId: String,
  entityType: String,
  period: String,
  data: Object,
  calculatedAt: Date,
  validUntil: Date,
  createdAt: Date,
  updatedAt: Date
}

// Collection: carrier_scores
{
  _id: ObjectId,
  carrierId: String,
  carrierName: String,
  score: Number,
  scoreDetails: {
    slotRespect: { value: Number, weight: Number, score: Number },
    documentDelay: { value: Number, weight: Number, score: Number },
    // ... 7 autres critères
  },
  ranking: { global: Number, byLane: Map, percentile: Number },
  trends: { lastWeek: Number, lastMonth: Number, evolution: String },
  metrics: Object,
  period: String,
  calculatedAt: Date
}

// Collection: alerts
{
  _id: ObjectId,
  alertId: String,
  type: String,
  severity: String,
  title: String,
  message: String,
  entityType: String,
  entityId: String,
  data: Object,
  acknowledged: Boolean,
  acknowledgedBy: String,
  acknowledgedAt: Date,
  resolved: Boolean,
  resolvedAt: Date,
  createdAt: Date,
  expiresAt: Date
}
```

### B. Variables d'Environnement

```bash
# KPI API
PORT=8080
NODE_ENV=production
MONGODB_URI=mongodb+srv://...

# APIs Sources
ORDERS_API_URL=https://dh9acecfz0wg0.cloudfront.net
TRACKING_API_URL=https://d2mn43ccfvt3ub.cloudfront.net
PLANNING_API_URL=https://d1bnvnjck6s4u2.cloudfront.net
BILLING_API_URL=https://...
NOTIFICATIONS_API_URL=https://d2t9age53em7o5.cloudfront.net

# Cron
ENABLE_CRON_JOBS=true
SCORING_CRON_SCHEDULE=0 2 * * *

# Cache
CACHE_TTL_REALTIME=60
CACHE_TTL_HOURLY=3600
CACHE_TTL_DAILY=86400
```

### C. Diagramme de Séquence - Calcul Score Transporteur

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌─────────┐
│ Orders  │     │ KPI API │     │ MongoDB  │     │Frontend │
│   API   │     │         │     │          │     │         │
└────┬────┘     └────┬────┘     └────┬─────┘     └────┬────┘
     │               │               │                │
     │ dispatch_event│               │                │
     │──────────────>│               │                │
     │               │               │                │
     │               │ findCarrier   │                │
     │               │──────────────>│                │
     │               │<──────────────│                │
     │               │               │                │
     │               │ updateScore   │                │
     │               │──────────────>│                │
     │               │<──────────────│                │
     │               │               │                │
     │               │ broadcast(ws) │                │
     │               │───────────────────────────────>│
     │               │               │                │
     │  200 OK       │               │                │
     │<──────────────│               │                │
     │               │               │                │
```

---

## 10. CHANGELOG

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0 | Oct 2025 | Création initiale |
| 2.0 | Déc 2025 | Refonte complète multi-univers |

---

**Document approuvé par:** [En attente]
**Date d'approbation:** [En attente]
