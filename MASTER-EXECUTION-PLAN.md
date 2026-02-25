# 🚀 Plan d'Exécution Maître - Optimisation AWS Complète

**Date de début:** 23 février 2026
**Durée totale:** 4 semaines
**Économie cible:** 859-1,101€/mois (46-59%)
**Coût actuel:** 1,855€/mois → **Coût final:** 754-996€/mois

---

## 📅 TIMELINE GLOBALE

```
Semaine 1: Phase 1A + Phase 2 (Économie: 553-753€/mois)
Semaine 2: Phase 3 (Économie: +74€/mois = 627-827€/mois)
Semaine 3: Phase 4a (Downgrade) (Économie: +90€/mois = 717-917€/mois)
Semaine 4: Phase 4b (Savings Plan) (Économie: +142€/mois = 859-1,101€/mois)
```

**Jalons:**
- ✅ Jour 1: Phase 1A complète (53€/mois)
- ✅ Jour 5: Phase 2 déployée (500-700€/mois)
- ✅ Jour 12: Phase 3 active (74€/mois)
- ✅ Jour 21: Phase 4a déployée (90€/mois)
- ✅ Jour 28: Savings Plan actif (142€/mois)

---

## 🎯 SEMAINE 1 - GAINS RAPIDES (553-753€/mois)

### Lundi 24 février - PHASE 1A (2 heures)

**Objectif:** Économiser 53€/mois avec actions immédiates

#### Matin (9h-11h)

```bash
# 1. Backup de sécurité (9h00-9h15)
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"
mkdir -p backups/phase1
aws ec2 describe-instances > backups/phase1/instances-backup.json
aws ec2 describe-addresses > backups/phase1/eips-backup.json

# 2. Exécution Phase 1A (9h15-10h00)
bash execute-phase1a.sh

# Actions:
# - Libérer 4 Elastic IPs non utilisées (14€/mois)
# - Arrêter RT-DeploymentInstance (21€/mois)
# - Supprimer 2 anciennes versions (18€/mois)
```

#### Après-midi (14h-16h)

```bash
# 3. Validation (14h00-15h00)
# Vérifier que les services actifs fonctionnent
aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table

# Tester les APIs principales
curl https://rt-subscriptions-api-prod-v2.eba-xyz.eu-central-1.elasticbeanstalk.com/health
curl https://rt-orders-api-prod-v2.eba-xyz.eu-central-1.elasticbeanstalk.com/health

# 4. Documentation (15h00-16h00)
# Créer phase1-completion-report.md
echo "Phase 1A complétée - Économie: 53€/mois" > phase1-completion-report.md
```

**✅ Checkpoint Jour 1:**
- [ ] 4 Elastic IPs libérées
- [ ] RT-DeploymentInstance arrêtée
- [ ] 2 anciennes instances supprimées
- [ ] Services actifs validés
- [ ] Rapport créé
- **Économie confirmée:** 53€/mois

---

### Mardi-Mercredi 25-26 février - PHASE 2 (1.5 jours)

**Objectif:** Économiser 500-700€/mois via optimisation Data Transfer

#### Mardi Matin (9h-12h) - Préparation

```bash
# 1. Analyse finale des distributions CloudFront (9h-10h)
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"
aws cloudfront list-distributions --output json > backups/phase2/cloudfront-before.json

# 2. Backup VPC configuration (10h-11h)
aws ec2 describe-vpcs > backups/phase2/vpc-config.json
aws ec2 describe-route-tables > backups/phase2/route-tables.json

# 3. Dry-run complet (11h-12h)
bash deploy-phase2-data-transfer-optimization.sh dry-run
```

#### Mardi Après-midi (14h-18h) - Déploiement Partie 1

```bash
# 4. Création VPC Endpoint S3 (14h-15h)
# Suivre le script partie VPC Endpoints
bash deploy-phase2-data-transfer-optimization.sh deploy-vpc-endpoints

# Validation:
aws ec2 describe-vpc-endpoints --filters "Name=service-name,Values=com.amazonaws.eu-central-1.s3"

# 5. Optimisation CloudFront - Batch 1 (15h-18h)
# Distributions principales (10 distributions)
bash deploy-phase2-data-transfer-optimization.sh deploy-cloudfront-batch1
```

#### Mercredi Matin (9h-12h) - Déploiement Partie 2

```bash
# 6. Optimisation CloudFront - Batch 2 (9h-11h)
# Distributions secondaires (19 distributions restantes)
bash deploy-phase2-data-transfer-optimization.sh deploy-cloudfront-batch2

# 7. Validation complète (11h-12h)
bash deploy-phase2-data-transfer-optimization.sh validate
```

#### Mercredi Après-midi (14h-17h) - Tests & Validation

```bash
# 8. Tests de performance (14h-16h)
# Tester compression
curl -H "Accept-Encoding: gzip,br" https://d2jgmccc3o2t9k.cloudfront.net/api/health -I

# Vérifier cache hit ratio
aws cloudfront get-distribution-statistics

# 9. Monitoring setup (16h-17h)
# Activer CloudWatch monitoring détaillé
aws cloudwatch put-metric-alarm \
  --alarm-name phase2-cache-hit-ratio \
  --alarm-description "CloudFront Cache Hit Ratio monitoring" \
  --metric-name CacheHitRate \
  --namespace AWS/CloudFront
```

**✅ Checkpoint Jour 3 (Mercredi soir):**
- [ ] VPC Endpoint S3 créé et fonctionnel
- [ ] 29 distributions CloudFront optimisées
- [ ] Compression activée (Gzip + Brotli)
- [ ] HTTP/3 enabled
- [ ] Cache behaviors configurés
- [ ] Tests de performance validés
- [ ] Monitoring actif
- **Économie projetée:** 500-700€/mois (validation J+7)

---

### Jeudi-Vendredi 27-28 février - Monitoring Phase 2

**Objectif:** Valider les économies et ajuster si nécessaire

#### Jeudi (Monitoring Jour 1)

```bash
# Vérifier cache hit ratio
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average

# Analyser Data Transfer
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '2 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost
```

#### Vendredi (Ajustements)

- Analyser les logs CloudFront
- Identifier patterns de trafic
- Ajuster TTL si nécessaire
- Documenter première semaine

**✅ Checkpoint Semaine 1:**
- **Phase 1A:** 53€/mois ✅
- **Phase 2:** 500-700€/mois (monitoring en cours)
- **Total Semaine 1:** 553-753€/mois économisé

---

## ⚙️ SEMAINE 2 - AUTO-SCALING (74€/mois supplémentaire)

### Lundi 3 mars - PHASE 3 Préparation

**Objectif:** Analyser et tester auto-scaling Exploit-IA

#### Matin (9h-12h)

```bash
# 1. Analyse des services Exploit-IA (9h-10h)
cd scripts/phase3-autoscaling
bash check-autoscaling-status.sh

# 2. Backup configurations EB (10h-11h)
mkdir -p ../../backups/phase3
for env in $(aws elasticbeanstalk describe-environments --query 'Environments[?contains(EnvironmentName, `exploit-ia`)].EnvironmentName' --output text); do
  aws elasticbeanstalk describe-configuration-settings --environment-name $env > "../../backups/phase3/${env}-config.json"
done

# 3. Dry-run sur 1 service test (11h-12h)
bash deploy-autoscaling-single.sh exploit-ia-planning-prod dry-run
```

#### Après-midi (14h-17h)

```bash
# 4. Déploiement test sur 1 service (14h-15h)
bash deploy-autoscaling-single.sh exploit-ia-planning-prod deploy

# 5. Monitoring 2h (15h-17h)
# Vérifier que l'instance est toujours running (avant 19h)
watch -n 300 'aws ec2 describe-instances --filters "Name=tag:Name,Values=exploit-ia-planning-prod*" --query "Reservations[*].Instances[*].[InstanceId,State.Name]"'
```

### Mardi 4 mars - Test 24h et Validation

#### Matin (8h-12h)

```bash
# 6. Vérifier que le service a redémarré à 8h (8h00-8h30)
aws autoscaling describe-scheduled-actions \
  --auto-scaling-group-name exploit-ia-planning-prod-asg

# Vérifier les instances
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=exploit-ia-planning-prod*" \
  --query 'Reservations[*].Instances[*].[InstanceId,State.Name,LaunchTime]'

# 7. Valider le fonctionnement du service (8h30-9h30)
curl https://exploit-ia-planning-prod.example.com/health

# 8. Déploiement sur les 7 autres services (9h30-12h)
bash deploy-autoscaling-all.sh deploy
```

#### Soir (19h-19h30)

```bash
# 9. Vérifier l'arrêt automatique à 19h
# Se connecter à 19h10 pour vérifier
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=exploit-ia-*" \
  --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table
```

### Mercredi 5 mars - Validation Complète

#### Matin (8h-9h)

```bash
# 10. Vérifier redémarrage automatique à 8h
bash check-autoscaling-status.sh

# Tous les services doivent être "running"
```

**✅ Checkpoint Semaine 2:**
- [ ] 8 services Exploit-IA configurés auto-scaling
- [ ] Test 24h validé (arrêt 19h, redémarrage 8h)
- [ ] Service api-auth reste 24/7
- [ ] Monitoring confirmé
- **Économie confirmée:** 74€/mois
- **Total cumulé:** 627-827€/mois

---

## 💻 SEMAINE 3 - DOWNGRADE INSTANCES (90€/mois supplémentaire)

### Lundi 10 mars - PHASE 4A Analyse Finale

**Objectif:** Downgrade 12 instances t3.small → t3.micro

#### Matin (9h-12h)

```bash
# 1. Refresh analyse CPU (9h-10h)
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"
python3 analyze-cpu-metrics.py --refresh

# 2. Validation finale de la liste (10h-11h)
# Vérifier que les 12 instances ont toujours CPU < 30%
cat cpu-analysis-results.json | jq '.instances[] | select(.recommendation == "DOWNGRADE")'

# 3. Créer planning de maintenance (11h-12h)
# Fenêtre: Mardi 02:00-04:00 UTC
```

#### Après-midi (14h-17h)

```bash
# 4. Notification stakeholders (14h-15h)
# Email aux équipes: maintenance mardi 02:00-04:00

# 5. Backup final (15h-16h)
mkdir -p backups/phase4a
aws ec2 describe-instances > backups/phase4a/instances-before-downgrade.json

# 6. Dry-run final (16h-17h)
bash downgrade-instances.sh --dry-run
```

### Mardi 11 mars - Exécution Downgrade

**⚠️ FENÊTRE DE MAINTENANCE: 02:00-04:00 UTC**

#### Nuit (02:00-04:00)

```bash
# 7. Exécution du downgrade (02:00-03:30)
bash downgrade-instances.sh

# Progression attendue:
# - 12 instances à downgrade
# - ~10 minutes par instance (arrêt, modif, démarrage)
# - Total: ~120 minutes (2h)

# 8. Validation (03:30-04:00)
# Vérifier que toutes les instances sont "running"
aws ec2 describe-instances \
  --instance-ids i-07aba2934ad4ed933 i-02260cfd794e7f43f [...] \
  --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,State.Name]' \
  --output table

# Tester les health checks
for instance in i-07aba2934ad4ed933 i-02260cfd794e7f43f [...]; do
  echo "Testing $instance..."
  # Health check de l'application
done
```

#### Matin (8h-12h)

```bash
# 9. Monitoring post-downgrade (8h-10h)
# Vérifier CPU, Memory, Application performance
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-XXXXXXXX \
  --start-time $(date -u -d '6 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# 10. Tests applicatifs (10h-12h)
# Tester toutes les APIs concernées
# Vérifier temps de réponse < 500ms
```

### Mercredi-Vendredi 12-14 mars - Monitoring 48h

#### Monitoring quotidien

```bash
# Vérifier quotidiennement:
# - CPU utilization (doit rester < 70%)
# - Memory utilization
# - Application performance
# - Error rates

# Si problème: Rollback immédiat
bash rollback-instances.sh
```

**✅ Checkpoint Semaine 3:**
- [ ] 12 instances downgradées avec succès
- [ ] Aucun downtime non planifié
- [ ] Performance applications validée
- [ ] Monitoring 48h OK
- **Économie confirmée:** 90€/mois
- **Total cumulé:** 717-917€/mois

---

## 💰 SEMAINE 4 - SAVINGS PLAN (142€/mois supplémentaire)

### Lundi 17 mars - PHASE 4B Préparation

**Objectif:** Acheter Compute Savings Plan optimal

#### Matin (9h-12h)

```bash
# 1. Calcul final du Savings Plan (9h-10h)
python3 calculate-savings-plan.py --final

# Nouveau baseline après optimisations:
# - Phase 1A: -53€
# - Phase 2: -600€ (moyenne)
# - Phase 3: -74€
# - Phase 4a: -90€
# Nouveau coût EC2: 487 - 817 = 170€/mois (estimation basse)
# OU: 487 - 217 = 270€/mois (estimation conservatrice)

# 2. Recommandation Savings Plan (10h-11h)
# Lire: savings-plan-recommendation.md
# Type: Compute Savings Plan
# Terme: 1 an, No Upfront
# Commitment: Basé sur 270€/mois optimisé
# Montant: 270 * 0.60 = 162€/mois (40% discount)

# 3. Approbation Finance (11h-12h)
# Préparer présentation pour CFO
# ROI: 142€/mois économisé = 1,704€/an
# Engagement: 162€/mois * 12 = 1,944€/an
```

#### Après-midi (14h-17h)

```bash
# 4. Présentation Direction/Finance (14h-16h)
# Présenter:
# - Économies réalisées Phase 1-4a: 717-917€/mois
# - Proposal Savings Plan: +142€/mois
# - Total final: 859-1,059€/mois (46-57%)
# - Coût final: 796-996€/mois vs 1,855€ initial

# 5. Obtenir approbations (16h-17h)
# [ ] CEO/CTO
# [ ] CFO
# [ ] Finance team
```

### Mardi 18 mars - Achat Savings Plan

#### Matin (9h-12h)

```bash
# 6. Achat via AWS Console (9h-10h)
# AWS Console > Billing > Savings Plans > Purchase Savings Plans
#
# Configuration:
# - Savings Plan type: Compute Savings Plan
# - Term: 1 year
# - Payment option: No Upfront
# - Hourly commitment: 0.22 EUR/hour (162 EUR/month)
# - Review: Discount ~40%, Savings ~142 EUR/month
#
# Confirm purchase

# 7. Validation (10h-11h)
aws savingsplans describe-savings-plans --output json

# 8. Documentation (11h-12h)
# Créer savings-plan-activation-report.md
```

**✅ Checkpoint Final (18 mars):**
- [ ] Compute Savings Plan actif
- [ ] Commitment: 162€/mois
- [ ] Économie: 142€/mois
- **Total cumulé:** 859-1,059€/mois
- **Réduction totale:** 46-57%

---

## 📊 SEMAINES 5-8 - MONITORING & OPTIMISATION

### Objectif: Confirmer les économies et ajuster

#### Semaine 5 (24-28 mars)

```bash
# Analyser AWS Cost Explorer
# Comparer:
# - Février 2026: 1,855€
# - Mars 2026: 796-996€ (projeté)

# Ajustements si nécessaire:
# - CloudFront TTL tuning
# - Auto-scaling schedule adjustments
```

#### Semaine 6 (31 mars - 4 avril)

```bash
# Rapport mensuel complet
# Créer: monthly-optimization-report-march-2026.md
#
# Inclure:
# - Économies par phase
# - Métriques performance
# - Recommendations futures
```

#### Semaines 7-8 (Avril)

```bash
# Monitoring continu
# Dashboard CloudWatch
# Alertes si dérive des coûts
```

---

## 📈 TABLEAU DE BORD DES ÉCONOMIES

### Tracking Quotidien

| Jour | Phase | Action | Économie Jour | Économie Cumulée |
|------|-------|--------|---------------|------------------|
| J1 | 1A | Actions immédiates | 53€ | 53€ |
| J5 | 2 | Data Transfer optim | 600€ | 653€ |
| J12 | 3 | Auto-scaling | 74€ | 727€ |
| J21 | 4a | Downgrade | 90€ | 817€ |
| J28 | 4b | Savings Plan | 142€ | 959€ |

### Validation des Économies (AWS Cost Explorer)

```bash
# Commande à exécuter chaque semaine
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-03-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --output table

# Comparer:
# Février: 1,855€
# Mars: 796-996€ (cible)
```

---

## 🚨 PLAN DE ROLLBACK

### Si Problème Majeur en Phase 2

```bash
# Restaurer configurations CloudFront
aws cloudfront update-distribution --id XXXXXXXX --if-match ETAG \
  --distribution-config file://backups/phase2/distribution-XXXXXXXX-backup.json

# Supprimer VPC Endpoint
aws ec2 delete-vpc-endpoints --vpc-endpoint-ids vpce-XXXXXXXX
```

### Si Problème en Phase 3

```bash
# Rollback auto-scaling
cd scripts/phase3-autoscaling
bash rollback-autoscaling.sh
```

### Si Problème en Phase 4a

```bash
# Upgrade instances
bash rollback-instances.sh
```

### Si Problème en Phase 4b

```bash
# Impossible de cancel Savings Plan
# Mais: Pas de pénalité si dépassement de commitment
# Les ressources au-delà du commitment sont facturées On-Demand
```

---

## ✅ CHECKLIST GLOBALE

### Pré-Exécution
- [ ] Backups de toutes les configurations
- [ ] Approbations obtenues (Direction, Finance, Technique)
- [ ] Équipe technique notifiée
- [ ] Fenêtres de maintenance planifiées
- [ ] Plan de rollback documenté

### Phase 1A (Jour 1)
- [ ] 4 Elastic IPs libérées
- [ ] RT-DeploymentInstance arrêtée
- [ ] 2 anciennes instances supprimées
- [ ] Validation fonctionnelle OK
- [ ] Économie: 53€/mois ✅

### Phase 2 (Jours 2-5)
- [ ] VPC Endpoint S3 créé
- [ ] 29 distributions CloudFront optimisées
- [ ] Compression activée
- [ ] HTTP/3 enabled
- [ ] Tests performance OK
- [ ] Économie: 500-700€/mois ✅

### Phase 3 (Jours 8-12)
- [ ] 8 services auto-scaling configurés
- [ ] Test 24h validé
- [ ] Monitoring actif
- [ ] Économie: 74€/mois ✅

### Phase 4a (Jours 17-21)
- [ ] 12 instances downgradées
- [ ] Performance validée
- [ ] Monitoring 48h OK
- [ ] Économie: 90€/mois ✅

### Phase 4b (Jours 24-28)
- [ ] Savings Plan acheté
- [ ] Commitment actif
- [ ] Documentation complète
- [ ] Économie: 142€/mois ✅

### Post-Déploiement
- [ ] Dashboard monitoring actif
- [ ] Alertes configurées
- [ ] Documentation à jour
- [ ] Rapport final créé
- [ ] **Économie totale: 859-1,059€/mois ✅**

---

## 🎯 OBJECTIF FINAL

**Coût actuel:** 1,855€/mois
**Coût optimisé:** 796-996€/mois
**Économie:** 859-1,059€/mois
**Réduction:** **46-57%**
**ROI annuel:** 10,308-12,708€

---

## 📞 CONTACTS & SUPPORT

**Chef de Projet Optimisation:** [Votre nom]
**Backup:** [Nom backup]
**Slack Channel:** #aws-optimization
**Email:** aws-ops@company.com

**En cas d'urgence (24/7):**
- Rollback Phase 2: `bash rollback-phase2.sh`
- Rollback Phase 3: `bash rollback-autoscaling.sh`
- Rollback Phase 4a: `bash rollback-instances.sh`

**Support AWS:**
- AWS Support Center: https://console.aws.amazon.com/support/
- AWS TAM: [Nom du TAM si disponible]

---

**Version:** 1.0
**Créé:** 23 février 2026
**Dernière mise à jour:** 23 février 2026

🤖 Généré avec Claude Code

---

## 🚀 PRÊT À DÉMARRER ?

**Commande pour lancer Phase 1A:**
```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"
bash execute-phase1a.sh
```

**Bonne chance ! 🎉**
