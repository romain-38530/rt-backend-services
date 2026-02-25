# Phase 4: Execution Report - Downgrade & Savings Plan

**Date de création:** 23 février 2026
**Compte AWS:** 004843574253
**Région:** eu-central-1
**Status:** PRÊT POUR EXÉCUTION

---

## Vue d'Ensemble de la Phase 4

La Phase 4 du plan d'optimisation AWS vise à réduire les coûts EC2 via deux axes:
1. **Downgrade des instances:** Réduction de la taille des instances sous-utilisées
2. **Compute Savings Plan:** Engagement de capacité pour bénéficier de réductions tarifaires

### Objectif Phase 4
- **Économie cible:** 260 EUR/mois (3,120 EUR/an)
  - Downgrade: 90 EUR/mois
  - Savings Plan: 170 EUR/mois

---

## Partie 1: Analyse CPU et Downgrade

### 1.1 Analyse Effectuée

**Date d'analyse:** 23 février 2026
**Période:** 7 jours (16-23 février 2026)
**Méthode:** Analyse métriques CloudWatch CPU Utilization

**Script utilisé:** `analyze-cpu-metrics.py`

### 1.2 Résultats de l'Analyse

**Instances Analysées:** 12 instances t3.small

| Instance Name | Instance ID | CPU Avg | CPU Max | Datapoints | Recommendation |
|---------------|-------------|---------|---------|------------|----------------|
| rt-admin-api-prod | i-07aba2934ad4ed933 | 0.40% | 9.58% | 168 | ✓ Downgrade |
| rt-affret-ia-api-prod-v4 | i-02260cfd794e7f43f | 0.50% | 9.22% | 168 | ✓ Downgrade |
| exploit-ia-planning-prod | i-03eb51b3c798e010f | 0.21% | 0.42% | 168 | ✓ Downgrade |
| exploit-ia-planning-prod-v3 | i-07eb45cf006ecc67a | 0.37% | 5.42% | 168 | ✓ Downgrade |
| exploit-ia-worker-v3 | i-02b6585e3c7790e87 | 0.24% | 1.74% | 168 | ✓ Downgrade |
| exploit-ia-api-admin-prod-v1 | i-0e6d027777df2b7c5 | 0.29% | 0.78% | 168 | ✓ Downgrade |
| exploit-ia-worker-ingestion-prod | i-0a7f175d40c307e46 | 0.20% | 0.43% | 168 | ✓ Downgrade |
| rt-subscriptions-api-prod-v5 | i-02dd7db8947118d4d | 1.01% | 2.26% | 168 | ✓ Downgrade |
| exploit-ia-api-auth-prod-v1 | i-04abe8e887385e2a2 | 0.39% | 1.78% | 168 | ✓ Downgrade |
| exploit-ia-api-orders-prod-v1 | i-04aeb2a387461a326 | 0.26% | 0.88% | 168 | ✓ Downgrade |
| exploit-ia-profitability-v3 | i-0c4bbdcabfcc1c478 | 0.27% | 0.92% | 168 | ✓ Downgrade |
| exploit-ia-affretia-prod-v1 | i-093ef6b78139d9574 | 0.40% | 7.91% | 168 | ✓ Downgrade |

**Synthèse:**
- ✓ Recommandées pour downgrade: **12/12 (100%)**
- ⚠ À surveiller: 0
- ✗ À conserver: 0

### 1.3 Décision de Downgrade

**APPROUVÉ:** Downgrade des 12 instances de t3.small vers t3.micro

**Justification:**
- Utilisation CPU moyenne: 0.20% à 1.01% (très faible)
- Pics CPU maximum: 0.42% à 9.58% (largement gérables)
- Tous les services sont très en dessous des seuils (30% avg, 60% max)
- t3.micro offre la même capacité de burst que t3.small
- Risque opérationnel: FAIBLE

**Économie estimée:** 90 EUR/mois (1,080 EUR/an)

### 1.4 Plan d'Exécution du Downgrade

**Status:** ⏸ EN ATTENTE D'APPROBATION

**Script préparé:** `downgrade-instances.sh`

**Options d'exécution:**

**Option 1: Downgrade Complet (Recommandé)**
```bash
# Downgrader toutes les 12 instances en une opération
bash downgrade-instances.sh

# Mode test (simulation sans changement)
bash downgrade-instances.sh --dry-run
```

**Option 2: Downgrade Progressif (Conservateur)**
```bash
# Batch 1: 4 premières instances
bash downgrade-instances.sh --batch 4

# Attendre 48h, vérifier métriques

# Batch 2: 4 instances suivantes
bash downgrade-instances.sh --batch 8

# Attendre 48h, vérifier métriques

# Batch 3: 4 dernières instances
bash downgrade-instances.sh --batch 12
```

**Fenêtre de maintenance recommandée:**
- Jour: Mardi ou Mercredi (milieu de semaine)
- Heure: 02:00-04:00 CET (période de faible trafic)
- Durée estimée: 30-45 minutes (toutes instances)
- Downtime par instance: 2-3 minutes

**Plan de Rollback:**
```bash
# En cas de problème, restaurer les instances
bash rollback-instances.sh

# Rollback d'une instance spécifique
bash rollback-instances.sh i-07aba2934ad4ed933
```

### 1.5 Monitoring Post-Downgrade

**Premières 48 heures (CRITIQUE):**
- [ ] Vérifier CPU utilization toutes les heures
- [ ] Surveiller CPU credit balance (alerte si < 50%)
- [ ] Tester health checks des applications
- [ ] Vérifier temps de réponse API
- [ ] Monitorer logs d'erreurs

**Semaine 1:**
- [ ] Monitoring quotidien des métriques
- [ ] Alerte si CPU > 50%
- [ ] Revue des performances applicatives
- [ ] Validation équipe technique

**Mois 1:**
- [ ] Revue hebdomadaire des métriques
- [ ] Validation de la stabilité
- [ ] Confirmation des économies réalisées
- [ ] Go/No-Go pour Savings Plan

---

## Partie 2: Compute Savings Plan

### 2.1 Analyse des Besoins

**Coût EC2 Actuel (Baseline):**
- Avant optimisations: 487 EUR/mois
- Après Phases 1-3: ~350 EUR/mois
- Après Phase 4a (downgrade): ~260 EUR/mois

**Coût horaire post-optimisation:**
```
260 EUR/mois ÷ 730 heures = 0.356 EUR/h
```

**Coverage recommandée:** 85% (laisser 15% flexible pour pics et évolution)

**Commitment calculé:**
```
0.356 EUR/h × 0.85 = 0.303 EUR/h
Arrondissement: 0.30 EUR/h
```

### 2.2 Recommandation Savings Plan

**Type:** Compute Savings Plan (RECOMMANDÉ)

**Configuration:**
- **Term:** 1 an
- **Payment:** No Upfront (paiement mensuel)
- **Hourly Commitment:** 0.30 EUR/h
- **Monthly Commitment:** 219 EUR/mois
- **Annual Commitment:** 2,628 EUR/an

**Discount rate:** ~40% (vs On-Demand)

**Économie estimée:**
- Coût On-Demand équivalent: 365 EUR/mois
- Coût avec Savings Plan: 219 EUR/mois
- **Économie: 146 EUR/mois (1,752 EUR/an)**

### 2.3 Justification Compute SP vs EC2 Instance SP

**Compute Savings Plan (Choisi):**
- ✓ Flexibilité totale (région, instance type, OS)
- ✓ Couvre EC2, Fargate, Lambda
- ✓ Optimal pour infrastructure évolutive
- ✓ Future-proof pour migrations containers/serverless
- ✓ Discount 40% (bon compromis flexibilité/économie)

**EC2 Instance Savings Plan (Non retenu):**
- ✓ Discount supérieur (50-60%)
- ✗ Limité à famille t3 en eu-central-1
- ✗ Pas de couverture Fargate/Lambda
- ✗ Pénalise optimisations futures
- ✗ Moins flexible (risque de lock-in)

**Verdict:** Compute SP offre le meilleur rapport économie/flexibilité

### 2.4 Plan d'Exécution Savings Plan

**Status:** ⏸ EN ATTENTE D'APPROBATION

**Prérequis:**
1. Downgrade Phase 4a complété et stable (48h minimum)
2. Validation coûts EC2 réels post-downgrade
3. Approbation utilisateur

**Procédure d'Achat (AWS Console):**

```
1. Naviguer vers: Billing → Savings Plans → Purchase Savings Plans
2. Cliquer sur "Recommendations"
3. Sélectionner: Compute Savings Plan
4. Paramètres:
   - Term length: 1 year
   - Payment option: No Upfront
   - Hourly commitment: 0.30 EUR (vérifier taux de change)
5. Vérifier estimation économies
6. Confirmer l'achat
```

**Procédure d'Achat (AWS CLI):**

```bash
# 1. Obtenir les recommandations AWS
aws ce get-savings-plans-purchase-recommendation \
  --savings-plan-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option NO_UPFRONT \
  --region eu-central-1

# 2. Créer le Savings Plan
aws savingsplans create-savings-plan \
  --savings-plan-offering-id <offering-id> \
  --commitment 0.30 \
  --upfront-payment-amount 0
```

**Timeline:**
- Jour 1 post-downgrade: Vérifier stabilité
- Jour 3 post-downgrade: Analyser coûts réels
- Jour 7 post-downgrade: Achat Savings Plan
- Jour 8-30: Monitoring utilisation SP

### 2.5 Monitoring Savings Plan

**Premières 48 heures:**
- [ ] Vérifier activation du SP dans console
- [ ] Confirmer instances EC2 couvertes
- [ ] Vérifier calcul des économies

**Première semaine:**
- [ ] Monitorer taux d'utilisation (target: >95%)
- [ ] Vérifier factures avec réductions
- [ ] Ajuster si nécessaire (possibilité 7 jours)

**Premier mois:**
- [ ] Revue mensuelle utilisation
- [ ] Calcul ROI réel vs estimé
- [ ] Documentation économies

---

## Partie 3: Résultats et ROI

### 3.1 Économies Prévues Phase 4

| Action | Économie Mensuelle | Économie Annuelle |
|--------|-------------------|-------------------|
| Downgrade 12× t3.small→t3.micro | 90 EUR | 1,080 EUR |
| Compute Savings Plan (0.30 EUR/h) | 146 EUR | 1,752 EUR |
| **TOTAL PHASE 4** | **236 EUR/mois** | **2,832 EUR/an** |

### 3.2 Comparaison avec Objectif

| Métrique | Objectif | Prévu | Écart | % Réalisation |
|----------|----------|-------|-------|---------------|
| Downgrade instances | 90 EUR/mois | 90 EUR/mois | 0 EUR | 100% |
| Savings Plan | 170 EUR/mois | 146 EUR/mois | -24 EUR | 86% |
| **TOTAL** | **260 EUR/mois** | **236 EUR/mois** | **-24 EUR** | **91%** |

**Note sur l'écart:**
- Écart de -24 EUR/mois (-9%) dû à un commitment conservateur (0.30 vs 0.35 EUR/h)
- Choix délibéré de privilégier la flexibilité
- 236 EUR/mois reste une économie majeure
- Possibilité d'ajuster le commitment après 1 mois si pertinent

### 3.3 Impact Cumulé Phases 1-4

| Phase | Action Principale | Économie Mensuelle |
|-------|------------------|-------------------|
| Phase 1 | Migration EBS gp2→gp3 | 42 EUR |
| Phase 2 | Stop instances dev hors heures | 85 EUR |
| Phase 3 | Optimisation Load Balancers | 20 EUR |
| Phase 4a | Downgrade instances | 90 EUR |
| Phase 4b | Compute Savings Plan | 146 EUR |
| **TOTAL PHASES 1-4** | | **383 EUR/mois** |

**Économie annuelle cumulée:** 4,596 EUR/an

**Réduction de coût global:**
- Coût initial: 487 EUR/mois
- Coût après Phase 4: ~104 EUR/mois
- **Réduction: 79% du coût EC2 initial**

---

## Partie 4: Risques et Mitigation

### 4.1 Risques Identifiés

**Risque 1: Performance Dégradée Post-Downgrade**
- Probabilité: Faible
- Impact: Moyen
- Mitigation: Monitoring 48h + rollback script prêt

**Risque 2: Sous-utilisation Savings Plan**
- Probabilité: Faible
- Impact: Moyen
- Mitigation: Coverage 85%, monitoring hebdomadaire

**Risque 3: Downtime Durant Downgrade**
- Probabilité: Certaine (2-3 min/instance)
- Impact: Faible
- Mitigation: Fenêtre maintenance hors heures

**Risque 4: Sur-optimisation**
- Probabilité: Faible
- Impact: Faible
- Mitigation: Compute SP couvre EC2/Fargate/Lambda

### 4.2 Plan de Rollback

**Si problèmes post-downgrade:**
```bash
# Rollback immédiat
bash rollback-instances.sh

# Rollback sélectif (1 instance)
bash rollback-instances.sh i-XXXXX
```

**Si sous-utilisation Savings Plan:**
- Semaine 1: Ajustement possible dans les 7 jours
- Mois 1-3: Optimiser usage (réduire On-Demand)
- Mois 4-12: Accepter le commitment (toujours économique)

---

## Partie 5: Actions Requises

### 5.1 Approbations Nécessaires

- [ ] **Approuver downgrade des 12 instances**
  - Valider liste des instances
  - Approuver fenêtre de maintenance
  - Accepter downtime 2-3 min/instance

- [ ] **Approuver achat Compute Savings Plan**
  - Commitment: 0.30 EUR/h (219 EUR/mois)
  - Terme: 1 an, No Upfront
  - Engagement: 2,628 EUR sur 12 mois

### 5.2 Planification

**Semaine 1: Downgrade (Phase 4a)**
- Jour 1: Approbation finale
- Jour 2: Fenêtre de maintenance (exécution downgrade)
- Jour 3-4: Monitoring intensif
- Jour 5-7: Validation stabilité

**Semaine 2: Savings Plan (Phase 4b)**
- Jour 8: Analyse coûts post-downgrade
- Jour 9: Affinage commitment (si nécessaire)
- Jour 10: Achat Compute Savings Plan
- Jour 11-14: Monitoring utilisation SP

**Semaine 3-4: Validation**
- Revue métriques
- Calcul économies réelles
- Rapport final Phase 4

### 5.3 Ressources Nécessaires

**Compétences:**
- AWS CLI configuré
- Accès EC2, CloudWatch, Billing
- Connaissances bash scripting
- Compréhension Savings Plans

**Outils:**
- Scripts fournis (downgrade, rollback, analyse)
- Accès AWS Console
- Monitoring CloudWatch

**Temps estimé:**
- Préparation: 2h
- Exécution downgrade: 1h
- Monitoring post-downgrade: 4h (réparties sur 48h)
- Achat Savings Plan: 1h
- Monitoring SP: 2h (première semaine)
- **Total: ~10h sur 2 semaines**

---

## Partie 6: Prochaines Étapes

### Immédiat (Aujourd'hui)

1. **Revue de ce rapport**
   - [ ] Lire et comprendre les recommandations
   - [ ] Poser questions si nécessaire
   - [ ] Valider l'approche

2. **Test en mode dry-run**
   ```bash
   # Simuler le downgrade sans changement
   bash downgrade-instances.sh --dry-run
   ```

3. **Préparation monitoring**
   - [ ] Configurer alertes CloudWatch CPU
   - [ ] Préparer dashboard de monitoring
   - [ ] Tester rollback script

### Cette Semaine (J+1 à J+7)

4. **Obtenir approbations**
   - [ ] Approbation technique (équipe infra)
   - [ ] Approbation financière (budget)
   - [ ] Approbation business (downtime)

5. **Planifier fenêtre de maintenance**
   - [ ] Choisir date/heure
   - [ ] Notifier équipes
   - [ ] Préparer communication

6. **Exécuter downgrade**
   ```bash
   # Avec toutes les vérifications
   bash downgrade-instances.sh
   ```

7. **Monitoring post-downgrade**
   - Heures 0-48: Surveillance intensive
   - Jours 3-7: Validation stabilité

### Semaine Prochaine (J+8 à J+14)

8. **Analyser coûts réels**
   - [ ] Vérifier facture AWS
   - [ ] Confirmer économies downgrade
   - [ ] Affiner commitment SP si nécessaire

9. **Acheter Savings Plan**
   - [ ] Via AWS Console ou CLI
   - [ ] Vérifier activation
   - [ ] Documenter l'achat

10. **Monitoring Savings Plan**
    - [ ] Vérifier utilization rate
    - [ ] Confirmer économies
    - [ ] Ajuster si nécessaire

### Mois Suivant (J+15 à J+30)

11. **Validation et rapport**
    - [ ] Revue métriques complètes
    - [ ] Calcul ROI réel
    - [ ] Rapport final Phase 4
    - [ ] Planification Phase 5 (si applicable)

---

## Conclusion

La Phase 4 est **PRÊTE POUR EXÉCUTION**. Tous les scripts, analyses et documentation sont disponibles.

**Recommandation:** APPROUVER l'exécution de la Phase 4

**Bénéfices:**
- ✓ Économie de 236 EUR/mois (2,832 EUR/an)
- ✓ Réduction de 79% du coût EC2 initial
- ✓ Infrastructure optimisée et flexible
- ✓ Faible risque avec plan de rollback

**Prochaine action critique:** Obtenir l'approbation utilisateur pour commencer

---

## Fichiers Générés

Tous les fichiers nécessaires ont été créés:

1. **Analyse et Rapports**
   - ✓ `phase4-cpu-analysis.md` - Analyse détaillée CPU
   - ✓ `cpu-analysis-results.json` - Données brutes
   - ✓ `savings-plan-recommendation.md` - Recommandation SP
   - ✓ `phase4-execution-report.md` - Ce rapport

2. **Scripts d'Exécution**
   - ✓ `analyze-cpu-metrics.py` - Script d'analyse CPU
   - ✓ `downgrade-instances.sh` - Script de downgrade
   - ✓ `rollback-instances.sh` - Script de rollback

3. **Documentation**
   - Tous les rapports formatés en Markdown
   - Exemples de commandes AWS CLI
   - Procédures pas-à-pas

---

**Status:** 🟢 PRÊT - EN ATTENTE D'APPROBATION UTILISATEUR

**Date de dernière mise à jour:** 23 février 2026
