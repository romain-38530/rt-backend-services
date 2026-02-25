# 🚨 Rapport d'Analyse des Coûts AWS - URGENT

**Date:** 23 février 2026
**Compte AWS:** 004843574253
**Région:** eu-central-1

---

## 📊 Résumé Exécutif

### Coûts Actuels - ALERTE ROUGE 🔴

| Période | Coût USD | Coût EUR | Status |
|---------|----------|----------|--------|
| **Janvier 2026** | 1,429.15 USD | ~1,320€ | 🔴 Très élevé |
| **Février (23/28 jours)** | 1,650.45 USD | ~1,525€ | 🔴 En hausse |
| **Projection Février** | 2,009.24 USD | ~1,855€ | 🔴 CRITIQUE |

### Écart Budgétaire

- **Budget estimé (doc):** 102€/mois
- **Coût réel:** ~1,855€/mois projeté
- **Écart:** **+1,753€/mois (1,719% de dépassement)**

---

## 🔍 Analyse Détaillée des Ressources

### 1. Instances EC2 - **50 INSTANCES ACTIVES** 🚨

#### Répartition par Type

| Type Instance | Quantité | Coût Unitaire/mois | Coût Total/mois |
|---------------|----------|-------------------|-----------------|
| **t3.micro** | 40 | ~7.50€ | ~300€ |
| **t3.small** | 9 | ~15€ | ~135€ |
| **t3.medium** | 1 | ~30€ | ~30€ |
| **TOTAL** | **50** | - | **~465€** |

#### Instances Critiques à Examiner

**Instances t3.small (9x ~15€/mois = ~135€/mois)**
1. `rt-admin-api-prod` (t3.small)
2. `rt-affret-ia-api-prod-v4` (t3.small)
3. `exploit-ia-planning-prod` (t3.small)
4. `exploit-ia-planning-prod-v3` (t3.small)
5. `exploit-ia-worker-v3` (t3.small)
6. `exploit-ia-api-admin-prod-v1` (t3.small)
7. `exploit-ia-worker-ingestion-prod` (t3.small)
8. `rt-subscriptions-api-prod-v5` (t3.small)
9. `exploit-ia-api-auth-prod-v1` (t3.small)
10. `exploit-ia-api-orders-prod-v1` (t3.small)
11. `exploit-ia-profitability-v3` (t3.small)
12. `exploit-ia-affretia-prod-v1` (t3.small)

**Instances t3.medium (1x ~30€/mois)**
- `RT-DeploymentInstance` (t3.medium) - **Probablement inutilisée en continu**

---

### 2. Services Dupliqués / Redondants

**PROBLÈME MAJEUR: Plusieurs versions du même service actives simultanément**

| Service | Versions Actives | Coût Estimé | Action |
|---------|------------------|-------------|--------|
| TMS Sync API | 3 versions | ~22€ | ⚠️ Supprimer v1, v2 |
| Subscriptions API | 3 versions | ~22€ | ⚠️ Garder que v5 |
| Affret IA API | 2 versions | ~22€ | ⚠️ Garder que v4 |
| Orders API | 2 versions | ~15€ | ⚠️ Consolider |

**Économie potentielle: 80-100€/mois** en supprimant les anciennes versions

---

### 3. Cluster ElastiCache Redis

**Status:** ✅ Actif (1 cluster)
- `exploit-ia-redis` (cache.t3.micro) - available
- **Coût:** ~15€/mois

**Recommandation:**
- Évaluer si réellement utilisé
- Votre code a déjà un fallback sur cache mémoire
- Si non essentiel : **Supprimer = économie 15€/mois**

---

### 4. Buckets S3 (15 buckets)

Liste des buckets:
- elasticbeanstalk-eu-central-1-004843574253
- elasticbeanstalk-eu-west-3-004843574253
- exploit-ia-deployments-eu-central-1
- rt-carrier-documents
- rt-eb-deployments
- rt-frontend-logistician
- rt-orders-api-deployments (3 variantes)
- rt-symphonia-documents
- rt-web-transporter-app
- symphonia-app-builds
- symphonia-deploy-packages-004843574253
- symphonia-inbound-emails
- symphonia-pricing-grids

**Actions:**
- Nettoyer les anciens déploiements
- Activer Intelligent-Tiering
- Configurer lifecycle policies

**Économie potentielle: 5-20€/mois**

---

## 💰 Plan d'Action d'Urgence - Économies: 500-800€/mois

### Phase 1: Actions Immédiates (Aujourd'hui) - **Économie: 150-200€/mois**

#### 1.1 Arrêter RT-DeploymentInstance (t3.medium)
```bash
# Arrêter l'instance de déploiement quand non utilisée
aws ec2 stop-instances --instance-ids i-0ece63fb077366323

# Économie: ~30€/mois
# Démarrer seulement quand nécessaire pour déploiements
```

#### 1.2 Supprimer les Anciennes Versions de Services
```bash
# Identifier et arrêter les anciennes versions
# TMS Sync v1 et v2
aws ec2 terminate-instances --instance-ids i-004c65af6eb3b76bb  # v1
aws ec2 terminate-instances --instance-ids i-04c2a160eb0d784f5  # old

# Subscriptions API anciennes versions
aws ec2 terminate-instances --instance-ids i-08170c415fbc5a02f  # v2

# Affret IA API ancienne version
aws ec2 terminate-instances --instance-ids i-03116e7c86d6d3599  # old

# Économie: ~80-100€/mois
```

#### 1.3 Évaluer les Services "exploit-ia-*" (12 instances)
```bash
# Lister toutes les instances exploit-ia
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=exploit-ia-*" "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceId, Tags[?Key==`Name`].Value | [0], InstanceType]' \
  --output table

# Questions:
# - Ces services sont-ils tous en production?
# - Peuvent-ils être consolidés?
# - Certains peuvent-ils être arrêtés en dehors des heures de travail?

# Économie potentielle si consolidation: 50-100€/mois
```

---

### Phase 2: Optimisations Court Terme (Cette semaine) - **Économie: 100-200€/mois**

#### 2.1 Downgrade des Instances Surdimensionnées

**Instances t3.small vers t3.micro (si faible charge)**

Candidats:
- `rt-admin-api-prod` - API d'administration (probablement faible trafic)
- `rt-subscriptions-api-prod-v5` - Peut être downgrade si <50% CPU

```bash
# Pour chaque instance:
# 1. Vérifier utilisation CPU sur les 7 derniers jours
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-02dd7db8947118d4d \
  --start-time 2026-02-16T00:00:00Z \
  --end-time 2026-02-23T23:59:59Z \
  --period 3600 \
  --statistics Average,Maximum \
  --output table

# 2. Si CPU < 30% en moyenne, downgrade vers t3.micro
# Arrêter instance > Changer type > Redémarrer
aws ec2 stop-instances --instance-ids i-XXXXXXXX
aws ec2 modify-instance-attribute --instance-id i-XXXXXXXX --instance-type t3.micro
aws ec2 start-instances --instance-ids i-XXXXXXXX

# Économie par instance: ~7.50€/mois
# Si 5 instances downgradées: ~37.50€/mois
```

#### 2.2 Configurer Auto-Scaling avec Schedule

```bash
# Pour les environnements de développement/staging:
# - Arrêt automatique: 19h (lun-ven)
# - Démarrage automatique: 8h (lun-ven)
# - Arrêt week-end: sam-dim

# Exemple pour un environnement EB
eb config [environment-name]
# Ajouter dans .ebextensions/03-autoscaling.config

# Économie: ~30-40% sur envs non-prod = 50-100€/mois
```

#### 2.3 Désactiver ElastiCache Redis (si non critique)

```bash
# 1. Vérifier les connexions actives
aws elasticache describe-cache-clusters \
  --cache-cluster-id exploit-ia-redis \
  --show-cache-node-info

# 2. Mettre REDIS_ENABLED=false sur tous les services
# 3. Attendre 24h pour vérifier que tout fonctionne
# 4. Supprimer le cluster

aws elasticache delete-cache-cluster --cache-cluster-id exploit-ia-redis

# Économie: 15€/mois
```

---

### Phase 3: Optimisations Moyen Terme (2-4 semaines) - **Économie: 200-400€/mois**

#### 3.1 Reserved Instances (Engagement 1 an)

**Pour les instances qui tournent 24/7/365**

```bash
# Identifier les instances à réserver
# t3.micro: 30 instances stables
# t3.small: 5 instances stables

# Économie avec Reserved Instances (1 an, no upfront):
# - t3.micro: ~30% de réduction = ~2.50€ économisé par instance/mois
#   30 instances x 2.50€ = 75€/mois économisé
#
# - t3.small: ~30% de réduction = ~5€ économisé par instance/mois
#   5 instances x 5€ = 25€/mois économisé
#
# Total économie: ~100€/mois
```

#### 3.2 Compute Savings Plans

Alternative aux Reserved Instances, plus flexible:
- Engagement sur un montant $ par heure
- S'applique automatiquement sur EC2, Fargate, Lambda
- Économie: 30-40%

```bash
# Calculer la baseline actuelle
# Coût EC2 actuel: ~465€/mois
# Avec Savings Plan (30%): économie de ~140€/mois
```

#### 3.3 Consolidation de Services

**Créer un API Gateway Unifié**

Regrouper les micro-services à faible trafic:
- notifications-api
- documents-api
- tracking-api
- appointments-api
- scoring-api
- kpi-api

Au lieu de 6 instances (6 x 7.50€ = 45€), utiliser 2 instances load-balanced (2 x 7.50€ = 15€)

**Économie: 30€/mois**

---

### Phase 4: Optimisations Long Terme (1-2 mois) - **Économie: 100-200€/mois**

#### 4.1 Migration vers AWS Lambda (Serverless)

**Services candidats pour Lambda:**
- APIs à faible trafic (<1000 req/jour)
- APIs avec trafic variable
- Webhooks

Exemples:
- notifications-api
- webhooks
- cron jobs

**Coût Lambda vs EC2:**
- EC2 t3.micro: 7.50€/mois (24/7)
- Lambda: Free tier 1M req/mois, puis ~0.20€ par million

Pour un service à 10k req/jour:
- EC2: 7.50€/mois
- Lambda: ~0€ (dans le free tier)

**Économie potentielle: 30-50€/mois pour 4-5 services migrés**

#### 4.2 Utiliser AWS Fargate Spot

Pour les workers et tâches batch:
- exploit-ia-worker-*
- exploit-ia-worker-ingestion-prod

Fargate Spot = 70% de réduction vs EC2

**Économie: 50-100€/mois**

---

## 📋 Checklist d'Action Prioritaire

### Aujourd'hui (23 février)

- [ ] **URGENT:** Arrêter RT-DeploymentInstance (économie: 30€/mois)
- [ ] Identifier et terminer les anciennes versions de services (économie: 80-100€/mois)
- [ ] Analyser l'utilisation CPU des instances t3.small

### Cette Semaine

- [ ] Downgrade 3-5 instances t3.small vers t3.micro (économie: 22-37€/mois)
- [ ] Évaluer la nécessité de tous les services "exploit-ia-*"
- [ ] Configurer auto-scaling avec schedule (économie: 50-100€/mois)
- [ ] Décider sur ElastiCache Redis (économie: 15€/mois)

### 2 Semaines

- [ ] Nettoyer les buckets S3 anciens (économie: 5-20€/mois)
- [ ] Activer S3 Intelligent-Tiering
- [ ] Créer des alarmes de coûts CloudWatch

### 1 Mois

- [ ] Acheter Reserved Instances pour services stables (économie: 100€/mois)
- [ ] Ou configurer Compute Savings Plan (économie: 140€/mois)
- [ ] Consolider les micro-services (économie: 30€/mois)

---

## 💡 Résumé des Économies Potentielles

| Action | Difficulté | Temps | Économie/mois | Priorité |
|--------|------------|-------|---------------|----------|
| Arrêter RT-DeploymentInstance | ⭐ Facile | 5 min | 30€ | 🔥 URGENT |
| Supprimer anciennes versions | ⭐⭐ Moyen | 1h | 80-100€ | 🔥 URGENT |
| Downgrade t3.small → t3.micro | ⭐⭐ Moyen | 2h | 22-37€ | ⭐⭐⭐ Élevée |
| Auto-scaling schedule | ⭐⭐ Moyen | 3h | 50-100€ | ⭐⭐⭐ Élevée |
| Désactiver Redis | ⭐ Facile | 30 min | 15€ | ⭐⭐ Moyenne |
| S3 optimisation | ⭐ Facile | 1h | 5-20€ | ⭐⭐ Moyenne |
| Reserved Instances | ⭐ Facile | 30 min | 100€ | ⭐⭐ Moyenne |
| Compute Savings Plan | ⭐ Facile | 30 min | 140€ | ⭐⭐ Moyenne |
| Consolidation services | ⭐⭐⭐ Complexe | 1 semaine | 30€ | ⭐ Faible |
| Migration Lambda | ⭐⭐⭐ Complexe | 2 semaines | 30-50€ | ⭐ Faible |

**Total Économies Potentielles: 500-800€/mois**

**Nouvel Objectif de Coût: 1,000-1,200€/mois** (vs 1,855€ actuellement)

---

## 🚨 Alertes et Monitoring

### Créer un Budget AWS

```bash
# Via AWS Console: Billing > Budgets
# Budget mensuel: 1,200€
# Alerte à 80%: 960€
# Alerte à 100%: 1,200€
# Alerte à 120%: 1,440€ (dépassement critique)
```

### Alarmes CloudWatch

```bash
# Créer une alarme pour coût quotidien
aws cloudwatch put-metric-alarm \
  --alarm-name daily-cost-alert \
  --alarm-description "Alerte si coût quotidien > 60 EUR" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 60 \
  --comparison-operator GreaterThanThreshold
```

---

## 📞 Support et Prochaines Étapes

### Ressources AWS
- **AWS Cost Explorer:** Console > Billing > Cost Explorer
- **AWS Trusted Advisor:** Console > Trusted Advisor > Cost Optimization
- **AWS Compute Optimizer:** Console > Compute Optimizer

### Plan d'Action

1. **Aujourd'hui:** Implémenter les actions URGENTES (économie: 110-130€/mois)
2. **Cette semaine:** Optimisations prioritaires (économie: 90-150€/mois)
3. **Ce mois:** Optimisations structurelles (économie: 200-400€/mois)

**Objectif:** Réduire les coûts de 1,855€/mois à ~1,000-1,200€/mois

---

**Version:** 1.0
**Date:** 23 février 2026
**Prochaine révision:** 1er mars 2026

🤖 Généré avec Claude Code
