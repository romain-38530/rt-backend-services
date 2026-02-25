# 🚀 Plan d'Optimisation ULTRA-AGGRESSIVE - AWS

**Date:** 23 février 2026
**Compte:** 004843574253
**Coût actuel:** ~1,855€/mois
**Objectif:** Réduire à ~800-1,000€/mois
**Économies cibles:** **~850-1,055€/mois (45-57%)**

---

## 📊 Répartition Actuelle des Coûts

| Catégorie | Coût/mois | % Total | Status |
|-----------|-----------|---------|--------|
| **Data Transfer** | ~1,249€ | 67% | 🔴 CRITIQUE |
| **EC2 (50 instances)** | ~487€ | 26% | 🟡 Optimisable |
| **ALBs (2)** | ~50€ | 3% | 🟢 OK |
| **EBS Volumes** | ~40€ | 2% | 🟢 OK |
| **ElastiCache Redis** | ~15€ | 1% | 🟡 À supprimer |
| **EIPs non utilisées** | ~14€ | 1% | 🟡 À libérer |
| **TOTAL** | **~1,855€** | 100% | |

---

## 🚨 PROBLÈME #1: Data Transfer (67% des coûts !)

**Coût estimé:** ~1,249€/mois

### Causes Probables

1. **Communication inter-services** (50 services qui communiquent)
2. **Trafic sortant vers Internet** (API responses, fichiers)
3. **Transfert entre régions** (si multi-région)
4. **CloudFront mal configuré** (pas de cache)

### 💡 Solutions ULTRA-AGRESSIVES

#### A. Mettre TOUT derrière CloudFront (Économie: 400-600€/mois)

```bash
# CloudFront offre des prix de data transfer réduits:
# - Internet: 0.085$/GB vs EC2: 0.09$/GB
# - Plus important: CACHE = 70-90% de réduction du trafic

# Actions:
# 1. Créer une distribution CloudFront UNIQUE pour TOUTES les APIs
# 2. Configurer des Origin Groups pour chaque service
# 3. Activer compression automatique
# 4. Cache agressif (TTL: 5 min pour APIs, 1h pour assets)
```

**Économie estimée:** 400-600€/mois (réduction de 50-70% du Data Transfer)

#### B. VPC Endpoints pour Services AWS (Économie: 50-100€/mois)

```bash
# Éviter le Data Transfer via Internet pour accéder aux services AWS
# Créer des VPC Endpoints pour:
# - S3
# - DynamoDB (si utilisé)
# - ECR (si Docker)

aws ec2 create-vpc-endpoint \
  --vpc-id vpc-XXXXXXXX \
  --service-name com.amazonaws.eu-central-1.s3 \
  --route-table-ids rtb-XXXXXXXX

# Économie: ~50-100€/mois en Data Transfer interne
```

#### C. Consolidation d'APIs (Économie: 100-150€/mois)

**Problème:** 50 services = beaucoup de communication inter-services

**Solution:** API Gateway Unifié

```
AVANT (50 services):
Client → Service A → Service B → Service C → Service D
        ↓ Data Transfer à chaque hop

APRÈS (1-3 services consolidés):
Client → API Gateway → Services consolidés (même réseau)
        ↓ Un seul hop, communication interne gratuite
```

**Économie estimée:** 100-150€/mois

---

## 🔧 PROBLÈME #2: 50 Instances EC2 (487€/mois)

### Plan d'Optimisation Agressif

#### Phase 1: Actions Immédiates (Économie: 81€/mois)

1. **Arrêter RT-DeploymentInstance** (t3.medium)
   - Coût: 30€/mois
   - Économie: 21€/mois (si arrêt 70% du temps)

2. **Supprimer 5 anciennes versions**
   - rt-affret-ia-api-prod (t3.micro) - 7.5€
   - rt-orders-api-prod (t3.micro) - 7.5€
   - rt-subscriptions-api-prod-v5 (t3.small) - 15€
   - rt-tms-sync-api-prod (t3.micro) - 7.5€
   - rt-tms-sync-api-v2 (t3.micro) - 7.5€
   - **Total:** 45€/mois

3. **Désactiver ElastiCache Redis**
   - Économie: 15€/mois

**Total Phase 1: 81€/mois**

#### Phase 2: Exploit-IA Auto-Scaling (Économie: 81€/mois)

**Services Exploit-IA (9 instances t3.small = 135€/mois)**

Action: Configurer arrêt automatique nocturne + week-end

```yaml
# .ebextensions/autoscaling-schedule.config
option_settings:
  # Arrêt automatique: 19h (lun-ven)
  aws:autoscaling:scheduledaction:scale_down_evening:
    MinSize: 0
    MaxSize: 0
    Recurrence: "0 19 * * 1-5"

  # Redémarrage: 8h (lun-ven)
  aws:autoscaling:scheduledaction:scale_up_morning:
    MinSize: 1
    MaxSize: 2
    Recurrence: "0 8 * * 1-5"

  # Arrêt week-end: Vendredi 19h
  aws:autoscaling:scheduledaction:scale_down_weekend:
    MinSize: 0
    MaxSize: 0
    Recurrence: "0 19 * * 5"

  # Redémarrage: Lundi 8h
  aws:autoscaling:scheduledaction:scale_up_monday:
    MinSize: 1
    MaxSize: 2
    Recurrence: "0 8 * * 1"
```

**Calcul:**
- Heures de fonctionnement: 13h/jour × 5 jours = 65h/semaine
- Heures d'arrêt: 168h - 65h = 103h/semaine (61%)
- **Économie: 135€ × 0.61 = ~81€/mois**

#### Phase 3: Downgrade t3.small → t3.micro (Économie: 90€/mois)

**12 instances t3.small** (après vérification CPU < 30%)

Candidats principaux:
- rt-admin-api-prod
- exploit-ia-api-admin-prod-v1
- exploit-ia-api-auth-prod-v1
- exploit-ia-api-orders-prod-v1
- Et 8 autres...

**Économie: 7.5€/instance × 12 = 90€/mois**

#### Phase 4: Compute Savings Plan (Économie: 170€/mois)

Engagement 1 an sur 487€/mois:
- Réduction: 35%
- **Économie: ~170€/mois**

**IMPORTANT:** Appliquer APRÈS les optimisations précédentes pour maximiser l'économie

---

## 💡 OPTIMISATIONS STRUCTURELLES

### 1. Migration vers AWS Fargate (Économie: 200-300€/mois)

**Avantages:**
- Pas de gestion d'instances
- Paiement à la seconde
- Auto-scaling intégré

**Services candidats (20-25 services légers):**
- APIs à faible trafic
- Workers
- Cron jobs

**Coût Fargate vs EC2:**
- EC2 t3.micro: 7.50€/mois 24/7
- Fargate (2h/jour usage): ~3€/mois
- **Économie: 4.50€/service**

**20 services migrés = 90€/mois économisé**

### 2. Migration vers AWS Lambda (Économie: 30-50€/mois)

**Services ultra-légers candidats:**
- notifications-api
- webhooks
- cron jobs ponctuels

**Coût:**
- EC2: 7.50€/mois
- Lambda: ~0€ (free tier 1M req/mois)

**5 services migrés = 37.5€/mois économisé**

### 3. Consolidation Agressive d'APIs (Économie: 75-100€/mois)

**Créer 3 API Gateways consolidés au lieu de 41 services:**

1. **API Gateway "Core"** (auth, users, subscriptions)
   - Remplace: 15 micro-services
   - De 15 instances à 3 instances
   - **Économie: 90€/mois**

2. **API Gateway "Operations"** (orders, tracking, documents)
   - Remplace: 12 micro-services
   - De 12 instances à 2 instances
   - **Économie: 75€/mois**

3. **API Gateway "Analytics"** (kpi, billing, scoring)
   - Remplace: 8 micro-services
   - De 8 instances à 2 instances
   - **Économie: 45€/mois**

**Total économisé: 210€/mois**

MAIS: Effort de développement important (4-6 semaines)

---

## 📋 PLAN D'ACTION COMPLET

### 🔥 PHASE 1: Actions Immédiates (Aujourd'hui) - 95€/mois

**Temps: 2 heures**

```bash
# 1. Libérer les 4 Elastic IPs non utilisées
aws ec2 describe-addresses --query 'Addresses[?!InstanceId].[AllocationId]' --output text | \
  xargs -I {} aws ec2 release-address --allocation-id {}
# Économie: 14€/mois

# 2. Arrêter RT-DeploymentInstance
aws ec2 stop-instances --instance-ids i-0ece63fb077366323
# Économie: 21€/mois

# 3. Supprimer 5 anciennes versions
aws ec2 terminate-instances --instance-ids \
  i-03116e7c86d6d3599 \
  i-03ded696fdbef22cb \
  i-02dd7db8947118d4d \
  i-004c65af6eb3b76bb \
  i-0b2104524871b8802
# Économie: 45€/mois

# 4. Désactiver ElastiCache Redis
# Mettre REDIS_ENABLED=false sur tous les services
eb setenv REDIS_ENABLED=false --environment-name [chaque-env]
# Attendre 24h puis:
aws elasticache delete-cache-cluster --cache-cluster-id exploit-ia-redis
# Économie: 15€/mois
```

**Total Phase 1: 95€/mois**

---

### 🚀 PHASE 2: Optimisation Data Transfer (Cette semaine) - 500-700€/mois

**Temps: 1 semaine**

#### 2.1 CloudFront Aggressive Caching

```bash
# 1. Créer une distribution CloudFront unique
aws cloudfront create-distribution --distribution-config file://cloudfront-config.json

# 2. Configurer le cache
# - TTL min: 60s (APIs dynamiques)
# - TTL default: 300s (APIs semi-statiques)
# - TTL max: 3600s (Assets, documents)

# 3. Activer compression
# - Gzip: Yes
# - Brotli: Yes

# 4. Configurer cache behaviors par route
# /api/auth/* → TTL: 60s
# /api/documents/* → TTL: 3600s
# /api/static/* → TTL: 86400s
```

**Économie estimée: 400-600€/mois**

#### 2.2 VPC Endpoints

```bash
# Créer VPC Endpoint pour S3
aws ec2 create-vpc-endpoint \
  --vpc-id vpc-XXXXXXXX \
  --service-name com.amazonaws.eu-central-1.s3 \
  --route-table-ids rtb-XXXXXXXX

# Économie: 50-100€/mois
```

**Total Phase 2: 500-700€/mois**

---

### ⚙️ PHASE 3: Exploit-IA Auto-Scaling (2 semaines) - 81€/mois

**Temps: 3 jours**

```bash
# Pour chaque service Exploit-IA:
cd services/exploit-ia-[service]

# Créer .ebextensions/autoscaling-schedule.config
cat > .ebextensions/autoscaling-schedule.config << 'EOF'
option_settings:
  aws:autoscaling:scheduledaction:evening_scale_down:
    MinSize: 0
    MaxSize: 0
    Recurrence: "0 19 * * 1-5"

  aws:autoscaling:scheduledaction:morning_scale_up:
    MinSize: 1
    MaxSize: 2
    Recurrence: "0 8 * * 1-5"

  aws:autoscaling:scheduledaction:weekend_scale_down:
    MinSize: 0
    MaxSize: 0
    Recurrence: "0 19 * * 5"

  aws:autoscaling:scheduledaction:monday_scale_up:
    MinSize: 1
    MaxSize: 2
    Recurrence: "0 8 * * 1"
EOF

# Déployer
eb deploy
```

**Total Phase 3: 81€/mois**

---

### 🔧 PHASE 4: Downgrade & Savings Plan (1 mois) - 260€/mois

**Temps: 1 semaine**

#### 4.1 Downgrade t3.small → t3.micro (90€/mois)

```bash
# Pour chaque instance t3.small avec CPU < 30%:

# 1. Vérifier CPU moyen sur 7 jours
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-XXXXXXXX \
  --start-time 2026-02-16T00:00:00Z \
  --end-time 2026-02-23T23:59:59Z \
  --period 3600 \
  --statistics Average

# 2. Si CPU < 30%, downgrade
aws ec2 stop-instances --instance-ids i-XXXXXXXX
aws ec2 modify-instance-attribute --instance-id i-XXXXXXXX --instance-type t3.micro
aws ec2 start-instances --instance-ids i-XXXXXXXX
```

#### 4.2 Compute Savings Plan (170€/mois)

```bash
# Via AWS Console: Billing > Savings Plans > Purchase

# Configuration:
# - Type: Compute Savings Plan
# - Engagement: 1 an, No Upfront
# - Montant: 487€/mois × 0.65 = 317€/mois
# - Réduction: 35%
# - Économie: 170€/mois
```

**Total Phase 4: 260€/mois**

---

### 🚀 PHASE 5 (Optionnel): Migrations Structurelles (2-3 mois) - 300€/mois

**Temps: 6-8 semaines**

1. **Migrer 20 services vers Fargate**
   - Économie: 90€/mois

2. **Migrer 5 services vers Lambda**
   - Économie: 37.5€/mois

3. **Consolider 35 APIs en 7 services**
   - Économie: 210€/mois

**Total Phase 5: 337.5€/mois**

---

## 💰 RÉSUMÉ DES ÉCONOMIES

| Phase | Actions | Temps | Économie/mois | Cumulé |
|-------|---------|-------|---------------|--------|
| **0** | État actuel | - | - | 1,855€ |
| **1** | Actions immédiates | 2h | 95€ | 1,760€ |
| **2** | Data Transfer optim | 1 sem | 500-700€ | 1,060-1,260€ |
| **3** | Auto-scaling | 3 jours | 81€ | 979-1,179€ |
| **4** | Downgrade + Savings | 1 sem | 260€ | 719-919€ |
| **5** | Migrations (opt) | 2-3 mois | 300€ | 419-619€ |

---

## 🎯 OBJECTIFS CHIFFRÉS

### Scénario Réaliste (Phases 1-4)

**Délai:** 1 mois
**Coût actuel:** 1,855€/mois
**Coût cible:** 719-919€/mois
**Économie:** **936-1,136€/mois (50-61%)**

### Scénario Agressif (Phases 1-5)

**Délai:** 3 mois
**Coût actuel:** 1,855€/mois
**Coût cible:** 419-619€/mois
**Économie:** **1,236-1,436€/mois (67-77%)**

---

## 🚦 CHECKLIST D'EXÉCUTION

### Aujourd'hui (23 février)

- [ ] Libérer 4 Elastic IPs non utilisées (14€/mois)
- [ ] Arrêter RT-DeploymentInstance (21€/mois)
- [ ] Supprimer 5 anciennes versions (45€/mois)
- [ ] Désactiver Redis ElastiCache (15€/mois)
- **Total: 95€/mois économisé**

### Cette Semaine

- [ ] Analyser les coûts Data Transfer (AWS Cost Explorer)
- [ ] Configurer CloudFront avec cache agressif (400-600€/mois)
- [ ] Créer VPC Endpoints S3 (50-100€/mois)
- [ ] Configurer auto-scaling nocturne Exploit-IA (81€/mois)
- **Total: 531-781€/mois économisé**

### Ce Mois

- [ ] Vérifier CPU de toutes les t3.small
- [ ] Downgrade vers t3.micro (90€/mois)
- [ ] Configurer Compute Savings Plan (170€/mois)
- **Total: 260€/mois économisé**

### 2-3 Mois (Optionnel)

- [ ] Migrer 20 services vers Fargate
- [ ] Migrer 5 services vers Lambda
- [ ] Consolider APIs en 7 services

---

## 📞 Support

### Outils AWS

- **AWS Cost Explorer:** Analyser Data Transfer en détail
- **AWS Trusted Advisor:** Recommandations automatiques
- **AWS Compute Optimizer:** Suggestions de taille d'instance

### Commandes Utiles

```bash
# Analyser Data Transfer
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-23 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://data-transfer-filter.json

# Lister toutes les ressources actives
aws resourcegroupstaggingapi get-resources \
  --output table

# Budget monitoring
aws budgets describe-budgets \
  --account-id 004843574253
```

---

**Version:** 1.0
**Date:** 23 février 2026
**Objectif:** Réduire de 1,855€ à 719-919€/mois (50-61%)

🤖 Généré avec Claude Code
