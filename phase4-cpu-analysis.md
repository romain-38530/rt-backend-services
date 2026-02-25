# Phase 4: CPU Analysis Report - EC2 Instance Downgrade

**Date d'analyse:** 23 février 2026
**Période analysée:** 7 jours (16-23 février 2026)
**Compte AWS:** 004843574253
**Région:** eu-central-1

## Executive Summary

L'analyse des métriques CPU CloudWatch sur les 12 instances t3.small candidates montre que **100% des instances** sont largement sous-utilisées et peuvent être downgradées vers t3.micro en toute sécurité.

### Résultats Clés

- **Instances analysées:** 12
- **Recommandées pour downgrade:** 12 (100%)
- **À surveiller:** 0
- **À conserver en t3.small:** 0
- **Économie mensuelle estimée:** 90.00 EUR/mois

## Critères d'Évaluation

Les seuils suivants ont été utilisés pour déterminer l'éligibilité au downgrade:

| Métrique | Seuil | Justification |
|----------|-------|---------------|
| CPU Average | < 30% | Utilisation moyenne bien en dessous de la capacité |
| CPU Maximum | < 60% | Pics de charge gérables par t3.micro |

### Capacités CPU

- **t3.small:** 2 vCPU, baseline 20% par vCPU, burst jusqu'à 100%
- **t3.micro:** 2 vCPU, baseline 10% par vCPU, burst jusqu'à 100%

## Analyse Détaillée par Instance

### 1. rt-admin-api-prod
- **Instance ID:** i-07aba2934ad4ed933
- **CPU Moyenne:** 0.40%
- **CPU Maximum:** 9.58%
- **Datapoints:** 168 (7 jours × 24h)
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Utilisation extrêmement faible, pics largement gérables

### 2. rt-affret-ia-api-prod-v4
- **Instance ID:** i-02260cfd794e7f43f
- **CPU Moyenne:** 0.50%
- **CPU Maximum:** 9.22%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Utilisation très faible avec pics modérés

### 3. exploit-ia-planning-prod
- **Instance ID:** i-03eb51b3c798e010f
- **CPU Moyenne:** 0.21%
- **CPU Maximum:** 0.42%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Utilisation minimale, candidate idéale

### 4. exploit-ia-planning-prod-v3
- **Instance ID:** i-07eb45cf006ecc67a
- **CPU Moyenne:** 0.37%
- **CPU Maximum:** 5.42%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Utilisation faible, pics très gérables

### 5. exploit-ia-worker-v3
- **Instance ID:** i-02b6585e3c7790e87
- **CPU Moyenne:** 0.24%
- **CPU Maximum:** 1.74%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Worker avec utilisation très basse

### 6. exploit-ia-api-admin-prod-v1
- **Instance ID:** i-0e6d027777df2b7c5
- **CPU Moyenne:** 0.29%
- **CPU Maximum:** 0.78%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** API admin très peu sollicitée

### 7. exploit-ia-worker-ingestion-prod
- **Instance ID:** i-0a7f175d40c307e46
- **CPU Moyenne:** 0.20%
- **CPU Maximum:** 0.43%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Worker d'ingestion avec charge minimale

### 8. rt-subscriptions-api-prod-v5
- **Instance ID:** i-02dd7db8947118d4d
- **CPU Moyenne:** 1.01%
- **CPU Maximum:** 2.26%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Instance la plus chargée mais toujours très en dessous des seuils

### 9. exploit-ia-api-auth-prod-v1
- **Instance ID:** i-04abe8e887385e2a2
- **CPU Moyenne:** 0.39%
- **CPU Maximum:** 1.78%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** API d'authentification peu sollicitée

### 10. exploit-ia-api-orders-prod-v1
- **Instance ID:** i-04aeb2a387461a326
- **CPU Moyenne:** 0.26%
- **CPU Maximum:** 0.88%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** API de commandes avec charge très légère

### 11. exploit-ia-profitability-v3
- **Instance ID:** i-0c4bbdcabfcc1c478
- **CPU Moyenne:** 0.27%
- **CPU Maximum:** 0.92%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Service de profitabilité sous-utilisé

### 12. exploit-ia-affretia-prod-v1
- **Instance ID:** i-093ef6b78139d9574
- **CPU Moyenne:** 0.40%
- **CPU Maximum:** 7.91%
- **Datapoints:** 168
- **Recommandation:** ✓ DOWNGRADE TO t3.micro
- **Justification:** Utilisation faible avec pics acceptables

## Tableau Récapitulatif

| Instance Name | Instance ID | CPU Avg | CPU Max | Recommendation |
|---------------|-------------|---------|---------|----------------|
| rt-admin-api-prod | i-07aba2934ad4ed933 | 0.40% | 9.58% | ✓ Downgrade |
| rt-affret-ia-api-prod-v4 | i-02260cfd794e7f43f | 0.50% | 9.22% | ✓ Downgrade |
| exploit-ia-planning-prod | i-03eb51b3c798e010f | 0.21% | 0.42% | ✓ Downgrade |
| exploit-ia-planning-prod-v3 | i-07eb45cf006ecc67a | 0.37% | 5.42% | ✓ Downgrade |
| exploit-ia-worker-v3 | i-02b6585e3c7790e87 | 0.24% | 1.74% | ✓ Downgrade |
| exploit-ia-api-admin-prod-v1 | i-0e6d027777df2b7c5 | 0.29% | 0.78% | ✓ Downgrade |
| exploit-ia-worker-ingestion-prod | i-0a7f175d40c307e46 | 0.20% | 0.43% | ✓ Downgrade |
| rt-subscriptions-api-prod-v5 | i-02dd7db8947118d4d | 1.01% | 2.26% | ✓ Downgrade |
| exploit-ia-api-auth-prod-v1 | i-04abe8e887385e2a2 | 0.39% | 1.78% | ✓ Downgrade |
| exploit-ia-api-orders-prod-v1 | i-04aeb2a387461a326 | 0.26% | 0.88% | ✓ Downgrade |
| exploit-ia-profitability-v3 | i-0c4bbdcabfcc1c478 | 0.27% | 0.92% | ✓ Downgrade |
| exploit-ia-affretia-prod-v1 | i-093ef6b78139d9574 | 0.40% | 7.91% | ✓ Downgrade |

## Analyse de Risque

### Risques Identifiés

1. **Impact sur les performances:** FAIBLE
   - Toutes les instances ont une utilisation CPU < 1% en moyenne
   - Les pics restent largement sous les 10%
   - t3.micro offre la même capacité de burst que t3.small

2. **Crédits CPU burstables:** FAIBLE
   - t3.micro: baseline 10% × 2 vCPU = 20% total
   - Utilisation actuelle max: 9.58% (rt-admin-api-prod)
   - Marge confortable de 10%+

3. **Disponibilité des applications:** MINIMAL
   - Downgrade nécessite un redémarrage (downtime ~2-3 minutes)
   - Recommandation: effectuer pendant une fenêtre de maintenance

### Atténuation des Risques

- **Plan de rollback:** Script de restauration vers t3.small en cas de problème
- **Monitoring post-downgrade:** Surveillance CPU intensive pendant 48h
- **Approche progressive:** Possibilité de downgrader par batch (ex: 4 instances à la fois)

## Impact Financier

### Coût Actuel (t3.small)
- Prix unitaire: ~15.00 EUR/mois
- 12 instances: 180.00 EUR/mois

### Coût Après Downgrade (t3.micro)
- Prix unitaire: ~7.50 EUR/mois
- 12 instances: 90.00 EUR/mois

### Économies
- **Par instance:** 7.50 EUR/mois
- **Total mensuel:** 90.00 EUR/mois
- **Total annuel:** 1,080.00 EUR/an

## Recommandations

### Actions Immédiates

1. ✓ **Valider l'analyse:** Approuver la liste des 12 instances pour downgrade
2. **Planifier la fenêtre de maintenance:** Choisir un créneau à faible trafic
3. **Préparer le monitoring:** Configurer des alertes CloudWatch temporaires
4. **Informer les équipes:** Communiquer sur le changement et la fenêtre de downtime

### Stratégie d'Exécution Recommandée

**Option 1: Downgrade complet (recommandé)**
- Toutes les 12 instances en une seule opération
- Durée estimée: 30-45 minutes
- Économie immédiate: 90 EUR/mois

**Option 2: Downgrade progressif (conservateur)**
- Batch 1: 4 instances test (30 EUR/mois)
- Attendre 48h, vérifier les métriques
- Batch 2: 4 instances supplémentaires (+30 EUR/mois)
- Attendre 48h, vérifier les métriques
- Batch 3: 4 instances finales (+30 EUR/mois)

### Plan de Monitoring Post-Downgrade

**Premières 48 heures (critique):**
- Vérifier CPU utilization toutes les heures
- Surveiller CPU credit balance
- Tester les health checks des applications
- Vérifier les temps de réponse API

**Semaine 1:**
- Monitoring quotidien des métriques
- Alerte si CPU > 50%
- Alerte si CPU credit balance < 50%

**Mois 1:**
- Revue hebdomadaire des métriques
- Validation de la stabilité
- Ajustements si nécessaire

## Conclusion

L'analyse des 7 derniers jours démontre clairement que les 12 instances t3.small sont massivement surdimensionnées pour leur charge actuelle. Le downgrade vers t3.micro est:

- ✓ **Techniquement justifié:** Utilisation CPU moyenne de 0.20-1.01%
- ✓ **Financièrement avantageux:** Économie de 90 EUR/mois (1,080 EUR/an)
- ✓ **Faible risque:** Pics CPU largement gérables, plan de rollback disponible
- ✓ **Aligné avec l'objectif Phase 4:** Contribution de 90 EUR/mois sur 260 EUR target

**Recommandation finale:** APPROUVER le downgrade des 12 instances

## Prochaines Étapes

1. **Validation utilisateur:** Obtenir l'approbation pour le downgrade
2. **Planification:** Définir la fenêtre de maintenance
3. **Exécution:** Lancer le script `downgrade-instances.sh`
4. **Monitoring:** Suivre les métriques post-downgrade pendant 48h
5. **Reporting:** Confirmer les économies réalisées

---

**Fichiers Générés:**
- `cpu-analysis-results.json` - Données brutes de l'analyse
- `downgrade-instances.sh` - Script d'exécution du downgrade
- `rollback-instances.sh` - Script de restauration en cas de problème
- `phase4-cpu-analysis.md` - Ce rapport
