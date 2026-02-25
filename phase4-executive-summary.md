# Phase 4: Executive Summary - Downgrade & Savings Plan

**Date:** 23 février 2026
**Compte AWS:** 004843574253
**Préparé pour:** Direction RT Backend Services

---

## En Bref

La Phase 4 du plan d'optimisation AWS permettra d'économiser **232 EUR/mois** (2,784 EUR/an) via deux actions:

1. **Downgrade de 12 instances EC2** sous-utilisées (90 EUR/mois)
2. **Achat d'un Compute Savings Plan** (142 EUR/mois)

**Statut:** ✅ Analyse complétée, prêt pour exécution
**Risque:** 🟢 Faible (plan de rollback disponible)
**Approbation requise:** 🔴 OUI

---

## Analyse CPU - Résultats Clés

**12 instances t3.small analysées** (métriques CloudWatch sur 7 jours):

- **CPU Moyenne:** 0.20% à 1.01% (très faible)
- **CPU Maximum:** 0.42% à 9.58% (largement gérables)
- **Verdict:** 12/12 instances éligibles au downgrade vers t3.micro

| Métrique | Seuil | Réalité | Statut |
|----------|-------|---------|--------|
| CPU Average | < 30% | 0.2-1.0% | ✅ |
| CPU Maximum | < 60% | 0.4-9.6% | ✅ |

**Conclusion:** Les instances t3.small sont massivement surdimensionnées.

---

## Recommandations

### Action 1: Downgrade d'Instances

**Quoi:** Réduire 12 instances de t3.small (2 vCPU baseline 20%) vers t3.micro (2 vCPU baseline 10%)

**Pourquoi:** Utilisation CPU actuelle < 1% en moyenne, capacité t3.micro suffisante

**Risques:**
- Downtime: 2-3 minutes par instance (fenêtre de maintenance)
- Performance: FAIBLE (monitoring 48h + rollback disponible)

**Économie:** 90 EUR/mois (1,080 EUR/an)

**Timeline:** 1 jour d'exécution + 2 jours de validation

### Action 2: Compute Savings Plan

**Quoi:** Engagement d'achat de 0.29 EUR/h de capacité compute AWS

**Pourquoi:** 40% de réduction vs tarif On-Demand

**Caractéristiques:**
- **Type:** Compute Savings Plan (flexible)
- **Terme:** 1 an
- **Paiement:** No Upfront (mensuel)
- **Commitment:** 0.29 EUR/h = 212 EUR/mois

**Avantages:**
- ✅ Couvre EC2, Fargate, Lambda (future-proof)
- ✅ Flexible (région, type d'instance, OS)
- ✅ Optimal pour infrastructure évolutive

**Économie:** 142 EUR/mois (1,700 EUR/an)

**Timeline:** Achat après validation du downgrade (J+7)

---

## Impact Financier

### Phase 4 Isolée

| Action | Économie Mensuelle | Économie Annuelle |
|--------|-------------------|-------------------|
| Downgrade instances | 90 EUR | 1,080 EUR |
| Compute Savings Plan | 142 EUR | 1,700 EUR |
| **TOTAL PHASE 4** | **232 EUR** | **2,780 EUR** |

### Impact Cumulé (Phases 1-4)

| Phase | Action | Économie |
|-------|--------|----------|
| Phase 1 | Migration EBS gp2→gp3 | 42 EUR/mois |
| Phase 2 | Stop instances dev hors heures | 85 EUR/mois |
| Phase 3 | Optimisation Load Balancers | 20 EUR/mois |
| **Phase 4** | **Downgrade + Savings Plan** | **232 EUR/mois** |
| **TOTAL** | | **379 EUR/mois** |

**Réduction globale:** 487 EUR → 108 EUR/mois (**-77.8%**)
**Économie annuelle totale:** 4,548 EUR/an

---

## Plan d'Exécution

### Semaine 1: Downgrade

| Jour | Action | Durée |
|------|--------|-------|
| J+1 | Approbation finale | 1h |
| J+2 | Exécution downgrade (02:00-04:00) | 1h |
| J+3-4 | Monitoring intensif | 4h |
| J+5-7 | Validation stabilité | 2h |

### Semaine 2: Savings Plan

| Jour | Action | Durée |
|------|--------|-------|
| J+8 | Analyse coûts post-downgrade | 1h |
| J+10 | Achat Compute Savings Plan | 1h |
| J+11-14 | Monitoring utilisation SP | 2h |

**Effort total:** ~12 heures sur 2 semaines

---

## Risques et Mitigation

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Performance dégradée | Faible | Moyen | Monitoring 48h + rollback script |
| Downtime maintenance | Certaine | Faible | Fenêtre hors heures (02:00-04:00) |
| Sous-utilisation SP | Faible | Moyen | Coverage 85%, monitoring |

**Plan de rollback:** Script prêt, restauration en 30 minutes

---

## Validation Requise

### Approbations Nécessaires

- [ ] **Technique** (Équipe Infrastructure)
  - Valider la liste des 12 instances
  - Approuver la fenêtre de maintenance
  - Confirmer le plan de rollback

- [ ] **Financière** (Direction/Budget)
  - Approuver l'engagement Savings Plan (212 EUR/mois × 12 mois)
  - Valider le commitment annuel (2,550 EUR)

- [ ] **Business** (Product Owners)
  - Accepter le downtime de 2-3 min/instance
  - Valider la fenêtre de maintenance (mardi 02:00-04:00)

---

## Recommandation

**✅ APPROUVER** l'exécution de la Phase 4

**Justification:**
1. Analyse technique solide (12/12 instances très sous-utilisées)
2. ROI immédiat (232 EUR/mois d'économies)
3. Risque faible avec plan de mitigation complet
4. Contribution majeure à l'objectif d'optimisation (-77.8% total)

**Prochaine action:** Obtenir les approbations et planifier la fenêtre de maintenance

---

## Livrables

Tous les documents et scripts sont prêts:

✅ **Rapports d'analyse**
- Analyse CPU détaillée (12 instances sur 7 jours)
- Recommandation Savings Plan avec calculs ROI
- Plan d'exécution complet

✅ **Scripts automatisés**
- Script de downgrade avec vérifications
- Script de rollback (sécurité)
- Scripts d'analyse (déjà exécutés)

✅ **Documentation**
- Guide d'utilisation (README)
- Executive Summary (ce document)
- Rapport d'exécution détaillé

---

## Contact

**Équipe Infrastructure RT Backend Services**

Pour questions ou clarifications:
- Documentation complète: voir dossier Phase 4
- Scripts et logs: disponibles dans le repository

---

**Décision requise:** OUI / NON / CLARIFICATIONS NÉCESSAIRES

**Signature:** ________________
**Date:** ________________
