# Savings Plan Recommendation - Phase 4

**Date:** 23 février 2026
**Compte AWS:** 004843574253
**Région:** eu-central-1
**Préparé pour:** RT Backend Services Infrastructure

## Executive Summary

Suite à l'analyse des coûts EC2 et aux optimisations des Phases 1-3, nous recommandons l'achat d'un **Compute Savings Plan** pour maximiser les économies sur les workloads EC2 restants.

### Recommandation Clé

- **Type:** Compute Savings Plan (flexible)
- **Terme:** 1 an, No Upfront
- **Commitment horaire:** 0.30 EUR/heure
- **Économie mensuelle estimée:** 120-150 EUR/mois
- **Économie annuelle estimée:** 1,440-1,800 EUR/an

## Contexte

### Coûts EC2 Actuels (Baseline)

**Avant optimisations (Phases 1-3):**
- Coût mensuel EC2: ~487 EUR/mois
- Coût horaire moyen: 487 / 730 = 0.667 EUR/h

**Après optimisations (Phases 1-4):**
- Phase 1 (EBS gp3): -42 EUR/mois
- Phase 2 (Stop dev instances): -85 EUR/mois
- Phase 3 (ELB optimization): -20 EUR/mois
- Phase 4 (Downgrade t3.small→t3.micro): -90 EUR/mois
- **Total économies:** -237 EUR/mois

**Nouveau coût EC2 estimé:**
- 487 EUR - 237 EUR = **250 EUR/mois**
- Coût horaire: 250 / 730 = **0.342 EUR/h**

### Architecture Cible

Après downgrade (Phase 4), l'infrastructure EC2 sera composée de:

| Type Instance | Quantité | Usage | Coût Mensuel Estimé |
|---------------|----------|-------|---------------------|
| t3.micro | 12 | Production services (low traffic) | 90 EUR |
| t3.small | 3-5 | Production services (medium traffic) | 45-75 EUR |
| t3.medium | 2-3 | Production services (high traffic) | 60-90 EUR |
| t3.large | 1-2 | Database/critical services | 30-60 EUR |

**Total:** ~250 EUR/mois

## Analyse des Options Savings Plan

### Option 1: Compute Savings Plan (RECOMMANDÉ)

**Caractéristiques:**
- Flexibilité maximale
- S'applique à EC2, Fargate, Lambda
- Indépendant de la région, famille d'instance, OS
- Réduction typique: 40-50% vs On-Demand

**Calcul du Commitment:**

```
Coût horaire post-optimisation: 0.342 EUR/h
Coverage recommandée: 85% (laisser 15% pour flexibilité)
Commitment: 0.342 × 0.85 = 0.291 EUR/h

Arrondissement recommandé: 0.30 EUR/h
```

**Économies Estimées:**

| Métrique | Valeur |
|----------|--------|
| Commitment horaire | 0.30 EUR/h |
| Coût commitment mensuel | 219 EUR/mois |
| Discount rate moyen | 40% |
| Coût On-Demand équivalent | 365 EUR/mois |
| **Économie mensuelle** | **146 EUR/mois** |
| **Économie annuelle** | **1,752 EUR/an** |

**Avantages:**
- ✓ Flexibilité totale (région, instance type, OS)
- ✓ Couvre aussi Fargate et Lambda (future-proof)
- ✓ Optimal pour environnements évolutifs
- ✓ Pas de contrainte sur les migrations

**Inconvénients:**
- Discount légèrement inférieur à EC2 Instance SP

### Option 2: EC2 Instance Savings Plan

**Caractéristiques:**
- Flexibilité limitée à EC2
- Lié à une famille d'instance dans une région
- Réduction typique: 50-60% vs On-Demand

**Calcul du Commitment:**

```
Coût horaire post-optimisation: 0.342 EUR/h
Coverage recommandée: 85%
Commitment: 0.342 × 0.85 = 0.291 EUR/h

Arrondissement recommandé: 0.30 EUR/h
```

**Économies Estimées:**

| Métrique | Valeur |
|----------|--------|
| Commitment horaire | 0.30 EUR/h |
| Coût commitment mensuel | 219 EUR/mois |
| Discount rate moyen | 50% |
| Coût On-Demand équivalent | 438 EUR/mois |
| **Économie mensuelle** | **219 EUR/mois** |
| **Économie annuelle** | **2,628 EUR/an** |

**Avantages:**
- ✓ Discount rate supérieur (50-60%)
- ✓ Économies maximales si architecture stable

**Inconvénients:**
- ✗ Limité à la famille t3 en eu-central-1
- ✗ Pas de couverture Fargate/Lambda
- ✗ Moins flexible pour l'évolution future

### Option 3: Réservations (Reserved Instances)

**Non recommandé** pour les raisons suivantes:
- Moins flexible que Savings Plans
- Nécessite de connaître les instances exactes
- Pénalise les optimisations futures
- Complexe à gérer avec une infrastructure dynamique

## Recommandation Finale

### Compute Savings Plan - 1 an, No Upfront

**Configuration recommandée:**
- **Type:** Compute Savings Plan
- **Terme:** 1 an
- **Payment option:** No Upfront (paiement mensuel)
- **Commitment:** 0.30 EUR/heure (219 EUR/mois)
- **Région:** eu-central-1 (flexible)

**Justification:**

1. **Flexibilité Future**
   - L'infrastructure RT Backend Services évolue (nouvelles APIs, microservices)
   - Possibilité d'utiliser Fargate ou Lambda sans perdre le bénéfice
   - Pas de contrainte sur les types d'instances

2. **Optimisation Continue**
   - Phase 4 downgrade prouve que l'architecture n'est pas figée
   - Compute SP permet de continuer les optimisations sans pénalité
   - Adaptable aux changements de charge

3. **Rapport ROI/Risque Optimal**
   - 40% de réduction est significatif
   - Coverage 85% laisse 15% de flexibilité On-Demand
   - No Upfront = pas de cash flow impact

4. **Future-Proof**
   - Couvre potentielles migrations Fargate
   - Utilisable pour fonctions Lambda
   - Transférable entre comptes AWS si organisation consolidée

## Plan d'Implémentation

### Phase 1: Validation et Calculs Précis (Jour 1-2)

1. **Vérifier les coûts post-optimisation**
   ```bash
   # Utiliser AWS Cost Explorer pour calculer le coût EC2 réel
   # des 7 derniers jours après Phase 1-3
   ```

2. **Affiner le commitment**
   - Si coût réel < 250 EUR/mois → ajuster commitment à 0.25 EUR/h
   - Si coût réel > 250 EUR/mois → ajuster commitment à 0.35 EUR/h

3. **Obtenir les recommandations AWS**
   ```
   AWS Console → Cost Management → Savings Plans → Recommendations
   ```

### Phase 2: Achat du Savings Plan (Jour 3)

**Via AWS Console (recommandé pour première fois):**

1. Naviguer vers **Billing → Savings Plans → Purchase Savings Plans**
2. Cliquer sur **Recommendations** pour voir les suggestions AWS
3. Sélectionner **Compute Savings Plan**
4. Paramètres:
   - **Term length:** 1 year
   - **Payment option:** No Upfront
   - **Hourly commitment:** 0.30 USD (vérifier le taux EUR/USD)
5. Vérifier l'estimation d'économies
6. Confirmer l'achat

**Via AWS CLI (pour automatisation):**

```bash
# 1. Obtenir les recommandations
aws savingsplans describe-savings-plans-offering-rates \
  --product-type EC2 \
  --service-codes EC2,Fargate,Lambda \
  --region eu-central-1

# 2. Créer le Savings Plan
aws savingsplans create-savings-plan \
  --savings-plan-offering-id <offering-id-from-recommendations> \
  --commitment 0.30 \
  --upfront-payment-amount 0 \
  --purchase-time $(date -u +"%Y-%m-%dT%H:%M:%SZ")
```

### Phase 3: Monitoring (Jour 4-30)

**Premières 48 heures:**
- Vérifier l'activation du Savings Plan dans la console
- Confirmer que les instances EC2 sont couvertes
- Vérifier le calcul des économies

**Première semaine:**
- Monitorer le taux d'utilisation du Savings Plan (target: >95%)
- Vérifier les factures pour confirmer les réductions
- Ajuster si nécessaire (possibilité de modifier dans les 7 jours)

**Premier mois:**
- Revue mensuelle de l'utilisation
- Calcul ROI réel vs estimé
- Documentation des économies

## Calcul ROI et Justification Financière

### Investissement

| Item | Coût |
|------|------|
| Commitment mensuel | 219 EUR/mois |
| Commitment annuel | 2,628 EUR/an |
| **Total investissement (1 an)** | **2,628 EUR** |

### Économies vs On-Demand

| Scénario | Sans SP | Avec SP | Économie |
|----------|---------|---------|----------|
| Mensuel | 365 EUR | 219 EUR | 146 EUR (40%) |
| Annuel | 4,380 EUR | 2,628 EUR | 1,752 EUR (40%) |

### ROI Phase 4 Complète (Downgrade + Savings Plan)

| Optimisation | Économie Mensuelle | Économie Annuelle |
|--------------|-------------------|-------------------|
| Downgrade t3.small→t3.micro | 90 EUR | 1,080 EUR |
| Compute Savings Plan | 146 EUR | 1,752 EUR |
| **TOTAL PHASE 4** | **236 EUR/mois** | **2,832 EUR/an** |

### Comparaison avec Objectif Phase 4

| Métrique | Objectif | Réalisé | Écart |
|----------|----------|---------|-------|
| Downgrade instances | 90 EUR/mois | 90 EUR/mois | 0% |
| Savings Plan | 170 EUR/mois | 146 EUR/mois | -14% |
| **Total Phase 4** | **260 EUR/mois** | **236 EUR/mois** | **-9%** |

**Note:** L'écart de -24 EUR/mois peut être comblé en:
1. Augmentant le commitment à 0.35 EUR/h (si le coût réel le permet)
2. Optimisant davantage l'infrastructure (Phase 5?)
3. Acceptant l'écart (236 EUR reste une économie significative)

## Risques et Mitigation

### Risque 1: Sous-utilisation du Commitment

**Probabilité:** Faible
**Impact:** Moyen (paiement sans bénéfice)

**Mitigation:**
- Coverage à 85% au lieu de 100% (15% de buffer)
- Monitoring hebdomadaire de l'utilisation
- Alertes si utilisation < 90%

### Risque 2: Sur-optimisation Future

**Probabilité:** Faible
**Impact:** Faible (commitment non utilisé)

**Mitigation:**
- Compute SP couvre EC2, Fargate, Lambda (pas seulement EC2)
- Terme 1 an seulement (pas 3 ans)
- Flexibilité totale sur les types d'instances

### Risque 3: Croissance Imprévue

**Probabilité:** Moyenne
**Impact:** Faible (coût On-Demand additionnel)

**Mitigation:**
- 15% de capacité On-Demand maintenue
- Possibilité d'acheter un SP supplémentaire si besoin
- Monitoring de la tendance de croissance

### Risque 4: Change de Stack Technologique

**Probabilité:** Faible
**Impact:** Moyen

**Mitigation:**
- Compute SP couvre aussi Fargate et Lambda
- Migration vers containers/serverless toujours couverte
- Terme 1 an limite l'exposition

## Timeline d'Exécution

### Semaine 1: Préparation
- Jour 1: Validation des coûts post-Phase 1-3
- Jour 2: Affinage du commitment (0.25-0.35 EUR/h)
- Jour 3: Revue avec équipe finance

### Semaine 2: Exécution Phase 4a (Downgrade)
- Jour 8: Downgrade des 12 instances t3.small→t3.micro
- Jour 9-10: Monitoring intensif post-downgrade
- Jour 11: Validation stabilité

### Semaine 3: Exécution Phase 4b (Savings Plan)
- Jour 15: Analyse coûts EC2 post-downgrade
- Jour 16: Achat Compute Savings Plan
- Jour 17-21: Monitoring utilisation SP

### Semaine 4: Validation
- Jour 22-28: Revue économies réalisées
- Jour 29: Rapport final Phase 4
- Jour 30: Planification Phase 5 (si nécessaire)

## Alternatives Considérées

### Alternative 1: EC2 Instance Savings Plan

**Pourquoi pas retenu:**
- Économie supérieure (+73 EUR/mois) mais risque de lock-in
- Infrastructure RT Backend Services en évolution
- Perte de flexibilité pas justifiée pour +73 EUR/mois

### Alternative 2: Spot Instances

**Pourquoi pas retenu:**
- Interruptions possibles (pas acceptable pour production)
- Complexité de gestion
- Mieux adapté aux workloads batch/non-critiques

### Alternative 3: Aucun Savings Plan

**Pourquoi pas retenu:**
- Perte de 1,752 EUR/an d'économies potentielles
- Pas de contrainte forte justifiant de rester On-Demand
- ROI évident et immédiat

## Prochaines Étapes

### Actions Immédiates (Semaine 1-2)

1. **Validation utilisateur**
   - [ ] Approuver l'achat d'un Compute Savings Plan
   - [ ] Valider le commitment horaire (0.30 EUR/h)
   - [ ] Définir la fenêtre d'achat

2. **Préparation technique**
   - [ ] Vérifier les coûts EC2 post-optimisations Phase 1-3
   - [ ] Analyser les recommandations AWS
   - [ ] Préparer la documentation d'achat

3. **Exécution**
   - [ ] Acheter le Compute Savings Plan
   - [ ] Configurer les alertes de monitoring
   - [ ] Documenter l'achat

### Monitoring Continu (Mois 1-12)

- Revue mensuelle de l'utilisation du Savings Plan
- Alerte si utilization < 90%
- Tracking des économies réalisées vs estimées
- Ajustement si nécessaire (achat SP additionnel ou modification)

## Conclusion

L'achat d'un **Compute Savings Plan à 0.30 EUR/h** (1 an, No Upfront) est la stratégie optimale pour maximiser les économies Phase 4 tout en maintenant la flexibilité nécessaire pour l'évolution de l'infrastructure RT Backend Services.

**Bénéfices totaux Phase 4:**
- Downgrade instances: 90 EUR/mois
- Savings Plan: 146 EUR/mois
- **Total: 236 EUR/mois (2,832 EUR/an)**

**Recommandation:** APPROUVER l'achat du Compute Savings Plan

---

**Documents Associés:**
- `phase4-cpu-analysis.md` - Analyse CPU et recommandations downgrade
- `downgrade-instances.sh` - Script d'exécution du downgrade
- `savings-plan-recommendation.md` - Ce document
- `phase4-execution-report.md` - Rapport final (à créer après exécution)
