# Phase 4: Downgrade & Savings Plan - Guide d'Utilisation

## Vue d'Ensemble

Ce dossier contient tous les scripts, analyses et documentation pour exécuter la **Phase 4** du plan d'optimisation AWS.

**Objectif Phase 4:** Économiser 236-260 EUR/mois via:
1. Downgrade de 12 instances t3.small → t3.micro (90 EUR/mois)
2. Achat d'un Compute Savings Plan (142-170 EUR/mois)

## Fichiers Disponibles

### 📊 Rapports et Analyses

| Fichier | Description | Usage |
|---------|-------------|-------|
| `phase4-execution-report.md` | Rapport complet Phase 4 avec plan d'exécution | Lire en premier pour comprendre la phase |
| `phase4-cpu-analysis.md` | Analyse détaillée CPU des 12 instances | Revue des métriques et justifications |
| `savings-plan-recommendation.md` | Recommandation détaillée Savings Plan | Comprendre le choix Compute SP |
| `PHASE4-README.md` | Ce fichier - Guide d'utilisation | Point d'entrée de la documentation |

### 📈 Données Brutes

| Fichier | Description | Format |
|---------|-------------|--------|
| `cpu-analysis-results.json` | Métriques CPU brutes des 12 instances | JSON |
| `savings-plan-calculation.json` | Calculs Savings Plan détaillés | JSON |

### 🔧 Scripts d'Exécution

| Fichier | Description | Usage |
|---------|-------------|-------|
| `analyze-cpu-metrics.py` | Analyse CloudWatch CPU (déjà exécuté) | Python |
| `calculate-savings-plan.py` | Calculateur Savings Plan (déjà exécuté) | Python |
| `downgrade-instances.sh` | Script de downgrade des instances | Bash |
| `rollback-instances.sh` | Script de rollback (en cas de problème) | Bash |

## Quick Start - 3 Étapes

### Étape 1: Comprendre l'Analyse ✅ COMPLÉTÉ

**L'analyse a déjà été effectuée** et les résultats sont disponibles:

```bash
# Les métriques CPU ont été collectées et analysées
# Résultats: 12/12 instances recommandées pour downgrade
# Voir: phase4-cpu-analysis.md
```

**Résumé:**
- ✅ 12 instances analysées (7 jours de métriques)
- ✅ 100% éligibles au downgrade (CPU avg < 1%, max < 10%)
- ✅ Économie estimée: 90 EUR/mois

### Étape 2: Exécuter le Downgrade ⏸ EN ATTENTE

**Prérequis:**
- AWS CLI configuré avec les bonnes credentials
- Accès aux instances EC2 en eu-central-1
- Fenêtre de maintenance planifiée (2-3 min downtime/instance)

**Test en mode simulation (sans changement):**
```bash
# Vérifier que tout est prêt sans faire de modifications
bash downgrade-instances.sh --dry-run
```

**Exécution réelle:**
```bash
# Option 1: Downgrade complet (recommandé)
bash downgrade-instances.sh

# Option 2: Downgrade progressif par batch de 4
bash downgrade-instances.sh --batch 4
# Attendre 48h, vérifier métriques, puis:
bash downgrade-instances.sh --batch 8
# Attendre 48h, vérifier métriques, puis:
bash downgrade-instances.sh --batch 12
```

**En cas de problème:**
```bash
# Rollback complet
bash rollback-instances.sh

# Rollback d'une instance spécifique
bash rollback-instances.sh i-07aba2934ad4ed933
```

**Monitoring post-downgrade (48h):**
```bash
# Vérifier CPU des instances downgradées
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value=i-XXXXX \
  --start-time $(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum \
  --region eu-central-1

# Vérifier CPU Credit Balance (important pour t3.micro)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUCreditBalance \
  --dimensions Name=InstanceId,Value=i-XXXXX \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average \
  --region eu-central-1
```

### Étape 3: Acheter le Savings Plan ⏸ EN ATTENTE

**Prérequis:**
- Downgrade complété et stable (attendre 48h minimum)
- Coûts EC2 vérifiés après downgrade
- Accès AWS Console avec permissions Billing

**Procédure (AWS Console):**

1. Naviguer vers: `Billing → Savings Plans → Purchase Savings Plans`

2. Cliquer sur `Recommendations`

3. Sélectionner: `Compute Savings Plan`

4. Paramètres:
   - **Term length:** 1 year
   - **Payment option:** No Upfront
   - **Hourly commitment:** 0.29-0.30 EUR/h (vérifier le taux de change EUR/USD)

5. Vérifier l'estimation des économies (~142 EUR/mois)

6. Confirmer l'achat

**Procédure alternative (AWS CLI):**

```bash
# 1. Obtenir les recommandations AWS
aws ce get-savings-plans-purchase-recommendation \
  --savings-plan-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --region eu-central-1

# 2. Créer le Savings Plan (remplacer offering-id)
aws savingsplans create-savings-plan \
  --savings-plan-offering-id <offering-id-from-step-1> \
  --commitment 0.29 \
  --upfront-payment-amount 0
```

**Vérification post-achat:**
```bash
# Vérifier que le Savings Plan est actif
aws savingsplans describe-savings-plans --region eu-central-1

# Vérifier l'utilisation (après 24h)
aws ce get-savings-plans-utilization \
  --time-period Start=$(date -u -d '1 day ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --region eu-central-1
```

## Timeline d'Exécution Recommandée

```
Semaine 1: Préparation et Downgrade
├── Jour 1 (Lundi)
│   └── Revue finale des rapports et approbation
├── Jour 2 (Mardi 02:00-04:00)
│   └── Exécution du downgrade (fenêtre de maintenance)
├── Jour 3-4 (Mercredi-Jeudi)
│   └── Monitoring intensif post-downgrade
└── Jour 5-7 (Vendredi-Dimanche)
    └── Validation stabilité

Semaine 2: Savings Plan
├── Jour 8 (Lundi)
│   └── Analyse coûts EC2 post-downgrade
├── Jour 9 (Mardi)
│   └── Affinage commitment si nécessaire
├── Jour 10 (Mercredi)
│   └── Achat Compute Savings Plan
└── Jour 11-14 (Jeudi-Dimanche)
    └── Monitoring utilisation SP

Semaine 3-4: Validation
└── Revue complète et rapport final
```

## Checklist d'Exécution

### Phase 4a: Downgrade (Semaine 1)

- [ ] **Préparation**
  - [ ] Lire `phase4-execution-report.md` intégralement
  - [ ] Vérifier accès AWS CLI et credentials
  - [ ] Tester mode dry-run: `bash downgrade-instances.sh --dry-run`
  - [ ] Planifier fenêtre de maintenance
  - [ ] Notifier les équipes du downtime prévu

- [ ] **Exécution**
  - [ ] Exécuter le downgrade: `bash downgrade-instances.sh`
  - [ ] Vérifier les logs d'exécution
  - [ ] Confirmer que toutes les instances sont redémarrées
  - [ ] Tester les applications (health checks)

- [ ] **Monitoring (48h)**
  - [ ] Surveiller CPU utilization (toutes les heures)
  - [ ] Surveiller CPU credit balance (alertes < 50%)
  - [ ] Vérifier logs applicatifs (pas d'erreurs)
  - [ ] Vérifier temps de réponse API
  - [ ] Valider avec l'équipe technique

- [ ] **Validation**
  - [ ] Pas de dégradation de performance constatée
  - [ ] CPU credit balance stable
  - [ ] Applications fonctionnelles
  - [ ] ✅ GO pour Phase 4b (Savings Plan)

### Phase 4b: Savings Plan (Semaine 2)

- [ ] **Analyse Post-Downgrade**
  - [ ] Vérifier coûts EC2 réels (AWS Cost Explorer)
  - [ ] Comparer avec estimation (250 EUR/mois attendu)
  - [ ] Ajuster commitment si écart > 10%
  - [ ] Relire `savings-plan-recommendation.md`

- [ ] **Achat**
  - [ ] Accéder à AWS Console → Billing → Savings Plans
  - [ ] Vérifier recommandations AWS
  - [ ] Configurer: Compute SP, 1 an, No Upfront, 0.29 EUR/h
  - [ ] Confirmer l'achat
  - [ ] Documenter (ID du SP, date, commitment)

- [ ] **Monitoring (7 jours)**
  - [ ] Vérifier activation du SP (AWS Console)
  - [ ] Vérifier que les instances EC2 sont couvertes
  - [ ] Monitorer taux d'utilisation (target: >95%)
  - [ ] Vérifier les factures (réductions appliquées)

- [ ] **Validation**
  - [ ] Utilization rate > 90%
  - [ ] Économies conformes aux estimations
  - [ ] ✅ Phase 4 complétée

## Résultats Attendus

### Économies Phase 4

| Action | Économie Mensuelle | Économie Annuelle |
|--------|-------------------|-------------------|
| Downgrade 12× t3.small→t3.micro | 90.00 EUR | 1,080 EUR |
| Compute Savings Plan (0.29 EUR/h) | 141.67 EUR | 1,700 EUR |
| **TOTAL PHASE 4** | **231.67 EUR** | **2,780 EUR** |

### Impact Cumulé (Phases 1-4)

| Phase | Action | Économie |
|-------|--------|----------|
| Phase 1 | EBS gp2→gp3 | 42 EUR/mois |
| Phase 2 | Stop dev instances | 85 EUR/mois |
| Phase 3 | ELB optimization | 20 EUR/mois |
| Phase 4a | Instance downgrade | 90 EUR/mois |
| Phase 4b | Savings Plan | 142 EUR/mois |
| **TOTAL** | | **379 EUR/mois** |

**Réduction globale:** 77.8% du coût EC2 initial (487 → 108 EUR/mois)

## Troubleshooting

### Problème: CPU élevé après downgrade

**Symptômes:** CPU > 50%, applications lentes

**Solution:**
```bash
# Rollback immédiat de l'instance problématique
bash rollback-instances.sh i-XXXXX

# Investiguer la cause (nouveau trafic? workload inattendu?)
# Décider: garder cette instance en t3.small
```

### Problème: CPU Credit Balance faible

**Symptômes:** Credit balance < 50%, performances dégradées

**Solution:**
```bash
# Option 1: Rollback vers t3.small
bash rollback-instances.sh i-XXXXX

# Option 2: Passer en t3.micro Unlimited (coût additionnel si burst prolongé)
aws ec2 modify-instance-credit-specification \
  --instance-credit-specification InstanceId=i-XXXXX,CpuCredits=unlimited \
  --region eu-central-1
```

### Problème: Sous-utilisation Savings Plan

**Symptômes:** Utilization rate < 80%

**Causes possibles:**
- Instances arrêtées non prévues
- Migration de workloads
- Sur-optimisation

**Solutions:**
- Semaine 1: Ajustement possible du commitment (délai 7 jours)
- Mois 1-12: Optimiser l'usage (réduire On-Demand, consolider workloads)
- Accepter le commitment (toujours plus économique que On-Demand)

### Problème: Script downgrade échoue

**Symptômes:** Erreur lors de l'exécution

**Solutions:**
```bash
# Vérifier les logs
cat downgrade-execution-*.log

# Vérifier AWS CLI
aws sts get-caller-identity

# Vérifier permissions
aws ec2 describe-instances --region eu-central-1

# Réessayer en mode verbose
bash -x downgrade-instances.sh
```

## Support et Questions

### Documentation Complète

- `phase4-execution-report.md` - Plan d'exécution complet
- `phase4-cpu-analysis.md` - Analyse CPU détaillée
- `savings-plan-recommendation.md` - Justification Savings Plan
- `cpu-analysis-results.json` - Données brutes CPU
- `savings-plan-calculation.json` - Calculs détaillés

### Commandes Utiles

**Vérifier l'état des instances:**
```bash
aws ec2 describe-instances \
  --instance-ids i-07aba2934ad4ed933 \
  --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name]' \
  --region eu-central-1
```

**Lister toutes les instances du compte:**
```bash
aws ec2 describe-instances \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,Tags[?Key==`Name`].Value|[0],State.Name]' \
  --output table \
  --region eu-central-1
```

**Vérifier les coûts EC2 du mois:**
```bash
aws ce get-cost-and-usage \
  --time-period Start=$(date -u -d 'month ago' +%Y-%m-%d),End=$(date -u +%Y-%m-%d) \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --filter file://filter.json \
  --region eu-central-1

# filter.json:
# {
#   "Dimensions": {
#     "Key": "SERVICE",
#     "Values": ["Amazon Elastic Compute Cloud - Compute"]
#   }
# }
```

## Logs et Historique

Les scripts génèrent automatiquement des logs:

- `downgrade-execution-YYYYMMDD-HHMMSS.log` - Log du downgrade
- `rollback-execution-YYYYMMDD-HHMMSS.log` - Log du rollback

**Conserver ces logs** pour audit et troubleshooting.

## Prochaines Étapes (Phase 5?)

Après la Phase 4, considérer:
- Consolidation d'instances supplémentaires
- Migration vers Fargate pour certains services
- Optimisation réseau (NAT Gateway, VPC Endpoints)
- Right-sizing continu avec AWS Compute Optimizer

---

**Status Actuel:** 🟢 PRÊT POUR EXÉCUTION

**Dernière mise à jour:** 23 février 2026

**Contact:** Équipe Infrastructure RT Backend Services
