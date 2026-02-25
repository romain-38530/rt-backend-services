# Phase 4: Commandes Essentielles - Cheatsheet

Guide rapide des commandes les plus utilisées pour la Phase 4.

---

## 🚀 Quick Start (3 Commandes)

```bash
# 1. Vérifier les prérequis
bash check-prerequisites.sh

# 2. Tester le downgrade (simulation)
bash downgrade-instances.sh --dry-run

# 3. Exécuter le downgrade (réel)
bash downgrade-instances.sh
```

---

## 📊 Analyse et Calculs (Déjà Exécutés)

```bash
# Analyse CPU des instances (déjà fait)
python analyze-cpu-metrics.py

# Calcul Savings Plan (déjà fait)
python calculate-savings-plan.py

# Résultats disponibles dans:
# - cpu-analysis-results.json
# - savings-plan-calculation.json
```

---

## ✅ Vérifications Pré-Exécution

```bash
# Vérifier tous les prérequis
bash check-prerequisites.sh

# Tester AWS CLI
aws sts get-caller-identity

# Vérifier accès EC2
aws ec2 describe-instances --region eu-central-1 --max-results 1

# Lister toutes les instances
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table \
  --region eu-central-1
```

---

## 🔧 Downgrade d'Instances

### Test (Simulation - SANS modification)

```bash
# Simuler le downgrade complet
bash downgrade-instances.sh --dry-run

# Simuler downgrade progressif (4 instances)
bash downgrade-instances.sh --dry-run --batch 4
```

### Exécution Réelle

```bash
# Downgrade complet (12 instances)
bash downgrade-instances.sh

# Downgrade progressif par batch de 4
bash downgrade-instances.sh --batch 4
# Attendre 48h, vérifier, puis:
bash downgrade-instances.sh --batch 8
# Attendre 48h, vérifier, puis:
bash downgrade-instances.sh --batch 12
```

---

## 🔙 Rollback (En Cas de Problème)

```bash
# Rollback complet (toutes les instances)
bash rollback-instances.sh

# Rollback sélectif (1 instance spécifique)
bash rollback-instances.sh i-07aba2934ad4ed933

# Rollback de plusieurs instances
bash rollback-instances.sh i-07aba2934ad4ed933 i-02260cfd794e7f43f

# Test rollback (simulation)
bash rollback-instances.sh --dry-run
```

---

## 📈 Monitoring Post-Downgrade

### CPU Utilization (Dernières 2 heures)

```bash
# Remplacer i-XXXXX par l'instance ID
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-XXXXX \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region eu-central-1 \
  --output table
```

### CPU Credit Balance (Dernières 24 heures)

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-XXXXX \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average,Minimum \
  --region eu-central-1 \
  --output table
```

### État des Instances

```bash
# État d'une instance
aws ec2 describe-instances \
  --instance-ids i-XXXXX \
  --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name]' \
  --region eu-central-1 \
  --output table

# État de toutes les 12 instances
aws ec2 describe-instances \
  --instance-ids \
    i-07aba2934ad4ed933 \
    i-02260cfd794e7f43f \
    i-03eb51b3c798e010f \
    i-07eb45cf006ecc67a \
    i-02b6585e3c7790e87 \
    i-0e6d027777df2b7c5 \
    i-0a7f175d40c307e46 \
    i-02dd7db8947118d4d \
    i-04abe8e887385e2a2 \
    i-04aeb2a387461a326 \
    i-0c4bbdcabfcc1c478 \
    i-093ef6b78139d9574 \
  --query 'Reservations[].Instances[].[Tags[?Key==`Name`].Value|[0],InstanceId,InstanceType,State.Name]' \
  --region eu-central-1 \
  --output table
```

---

## 💰 Savings Plan

### Obtenir Recommandations AWS

```bash
# Recommandations Compute Savings Plan
aws ce get-savings-plans-purchase-recommendation \
  --savings-plan-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --region eu-central-1
```

### Créer Savings Plan (Après Validation)

```bash
# IMPORTANT: Remplacer <offering-id> par l'ID obtenu des recommandations
aws savingsplans create-savings-plan \
  --savings-plan-offering-id <offering-id> \
  --commitment 0.29 \
  --upfront-payment-amount 0 \
  --region eu-central-1
```

### Vérifier Savings Plans Actifs

```bash
# Lister tous les Savings Plans
aws savingsplans describe-savings-plans \
  --region eu-central-1 \
  --output table

# Détails d'un Savings Plan spécifique
aws savingsplans describe-savings-plans \
  --savings-plan-ids <savings-plan-id> \
  --region eu-central-1
```

### Monitoring Utilisation Savings Plan

```bash
# Utilisation (dernières 24h)
aws ce get-savings-plans-utilization \
  --time-period Start=$(date -u -d '1 day ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --region eu-central-1

# Utilisation détaillée (dernier mois)
aws ce get-savings-plans-utilization-details \
  --time-period Start=$(date -u -d '30 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --region eu-central-1
```

---

## 💵 Coûts et Factures

### Coût EC2 du Mois

```bash
# Coût EC2 du mois en cours
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d 'month ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Elastic Compute Cloud - Compute"]}}' \
  --region eu-central-1
```

### Coût Quotidien (Derniers 7 Jours)

```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '7 days ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Elastic Compute Cloud - Compute"]}}' \
  --region eu-central-1
```

---

## 🔍 Vérifications Diverses

### Vérifier Type d'Instance

```bash
# Une instance
aws ec2 describe-instances \
  --instance-ids i-XXXXX \
  --query 'Reservations[0].Instances[0].InstanceType' \
  --region eu-central-1 \
  --output text
```

### Vérifier Région

```bash
aws ec2 describe-availability-zones --region eu-central-1
```

### Tester Permissions

```bash
# Test read EC2
aws ec2 describe-instances --max-results 1 --region eu-central-1

# Test CloudWatch
aws cloudwatch list-metrics --namespace AWS/EC2 --max-items 1 --region eu-central-1

# Test Billing (Cost Explorer)
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d '1 day ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --region eu-central-1
```

---

## 📝 Logs et Historique

### Consulter Logs Scripts

```bash
# Dernier log de downgrade
ls -lt downgrade-execution-*.log | head -1 | awk '{print $9}' | xargs cat

# Dernier log de rollback
ls -lt rollback-execution-*.log | head -1 | awk '{print $9}' | xargs cat

# Lister tous les logs
ls -lh *-execution-*.log
```

### CloudTrail (Audit des Actions)

```bash
# Actions EC2 récentes
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::EC2::Instance \
  --region eu-central-1 \
  --max-items 10

# Actions Savings Plans récentes
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::SavingsPlans::SavingsPlan \
  --region eu-central-1 \
  --max-items 10
```

---

## 🆘 Troubleshooting

### Instance Ne Démarre Pas

```bash
# Vérifier les logs système
aws ec2 get-console-output \
  --instance-id i-XXXXX \
  --region eu-central-1

# Vérifier status checks
aws ec2 describe-instance-status \
  --instance-ids i-XXXXX \
  --region eu-central-1
```

### CPU Credit Épuisé

```bash
# Activer Unlimited mode (coût additionnel si burst prolongé)
aws ec2 modify-instance-credit-specification \
  --instance-credit-specification InstanceId=i-XXXXX,CpuCredits=unlimited \
  --region eu-central-1

# Vérifier mode actuel
aws ec2 describe-instance-credit-specifications \
  --instance-ids i-XXXXX \
  --region eu-central-1
```

### Revenir en Arrière (Rollback)

```bash
# Rollback immédiat
bash rollback-instances.sh i-XXXXX

# Vérifier le résultat
aws ec2 describe-instances \
  --instance-ids i-XXXXX \
  --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name]' \
  --region eu-central-1
```

---

## 📚 Documentation de Référence

| Commande | Voir Documentation |
|----------|-------------------|
| Scripts Bash | PHASE4-README.md |
| Analyse CPU | phase4-cpu-analysis.md |
| Savings Plan | savings-plan-recommendation.md |
| Plan Complet | phase4-execution-report.md |
| Executive Summary | phase4-executive-summary.md |

---

## 🎯 Workflow Complet (Copy-Paste)

```bash
# ============================================
# PHASE 4a: DOWNGRADE (Jour 1-2)
# ============================================

# 1. Vérifications
bash check-prerequisites.sh

# 2. Test (simulation)
bash downgrade-instances.sh --dry-run

# 3. Exécution (pendant fenêtre de maintenance)
bash downgrade-instances.sh

# 4. Vérification immédiate
aws ec2 describe-instances \
  --instance-ids i-07aba2934ad4ed933 \
  --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name]' \
  --region eu-central-1

# 5. Monitoring (répéter toutes les heures pendant 48h)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-07aba2934ad4ed933 \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region eu-central-1

# ============================================
# PHASE 4b: SAVINGS PLAN (Jour 7+)
# ============================================

# 6. Obtenir recommandations AWS
aws ce get-savings-plans-purchase-recommendation \
  --savings-plan-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --region eu-central-1

# 7. Créer Savings Plan (via AWS Console recommandé)
# OU via CLI:
# aws savingsplans create-savings-plan \
#   --savings-plan-offering-id <offering-id> \
#   --commitment 0.29 \
#   --upfront-payment-amount 0

# 8. Vérifier activation
aws savingsplans describe-savings-plans --region eu-central-1

# 9. Monitoring utilisation (après 24h)
aws ce get-savings-plans-utilization \
  --time-period Start=$(date -u -d '1 day ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --region eu-central-1
```

---

## 📞 Aide Rapide

**En cas de problème:**
1. Consulter les logs: `cat downgrade-execution-*.log`
2. Voir troubleshooting: `PHASE4-README.md` - Section Troubleshooting
3. Rollback si critique: `bash rollback-instances.sh`

**Pour questions:**
- Documentation complète: voir `PHASE4-INDEX.md`
- Équipe Infrastructure: [contact]

---

**Dernière mise à jour:** 23 février 2026
