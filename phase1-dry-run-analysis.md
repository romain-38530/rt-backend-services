# Phase 1: Rapport d'Analyse Dry-Run - Optimisation AWS
**Date**: 2026-02-23
**Compte AWS**: 004843574253
**Région**: eu-central-1
**Objectif Phase 1**: Économiser 95€/mois

---

## 1. Elastic IPs Non Utilisées

### Status: ✅ PRÊT POUR EXÉCUTION

**Elastic IPs détectées (non attachées)**:
| IP Publique | Allocation ID | Nom |
|-------------|---------------|-----|
| 18.184.86.227 | eipalloc-0a614002ef7d9ea87 | None |
| 18.194.185.112 | eipalloc-093c0153cd6dcfcca | None |
| 63.177.117.160 | eipalloc-0d46dfcc8459ddeb1 | None |
| 63.180.154.143 | eipalloc-05e8a6bbf21da27d2 | None |

**Total**: 4 Elastic IPs non attachées
**Coût mensuel**: 4 × 3.50€ = 14€/mois
**Action**: Libérer toutes les IPs non attachées
**Risque**: ❌ AUCUN (pas attachées à des ressources)

---

## 2. RT-DeploymentInstance

### Status: ⚠️ ATTENTION - INSTANCE ACTIVE

**Détails**:
- Instance ID: i-0ece63fb077366323
- Nom: RT-DeploymentInstance
- État: **RUNNING** ⚠️
- Type: t3.medium
- Lancée le: 2025-11-19 (3 mois d'uptime)

**Coût mensuel estimé**: 21€/mois
**Action recommandée**: Arrêter l'instance (pas de suppression)
**Risque**: ⚠️ MOYEN - Vérifier si utilisée pour les déploiements

**Questions à valider**:
1. Cette instance est-elle encore utilisée pour les déploiements?
2. Peut-on la démarrer à la demande si besoin?

---

## 3. Instances Anciennes Versions - ANALYSE CRITIQUE

### ⚠️ ALERTE: CERTAINES INSTANCES SONT ENCORE ACTIVES

#### Instance 1: rt-affret-ia-api-prod (i-03116e7c86d6d3599)
- **État**: RUNNING
- **Lancée**: 2025-11-23 (3 mois)
- **Type**: t3.micro
- **Environnement EB**: rt-affret-ia-api-prod (Ready/Green) ✅
- **Version actuelle**: rt-affret-ia-api-prod-v4 (i-02260cfd794e7f43f) lancée 2026-02-02
- **Statut**: ✅ ANCIENNE VERSION - Peut être supprimée
- **Économie**: 9€/mois

#### Instance 2: rt-orders-api-prod (i-03ded696fdbef22cb)
- **État**: RUNNING
- **Lancée**: 2026-01-04 (7 semaines)
- **Type**: t3.micro
- **Environnement EB**: rt-orders-api-prod (Ready/Green) ✅
- **Version actuelle**: rt-orders-api-prod-v2 (i-01a914a86c6c841b0) lancée 2026-01-27
- **Statut**: ✅ ANCIENNE VERSION - Peut être supprimée
- **Économie**: 9€/mois

#### Instance 3: rt-subscriptions-api-prod-v5 (i-02dd7db8947118d4d)
- **État**: RUNNING
- **Lancée**: 2026-01-13 (6 semaines)
- **Type**: t3.small
- **Environnement EB**: rt-subscriptions-api-prod-v5 (Ready/Green) ✅
- **Version actuelle**: rt-subscriptions-api-prod-v2 (i-08170c415fbc5a02f) lancée 2026-02-01
- **Statut**: ❌ **ATTENTION** - Noms confus (v5 vs v2), vérifier laquelle est vraiment active
- **Économie potentielle**: 18€/mois (t3.small)

#### Instance 4: rt-tms-sync-api-prod (i-004c65af6eb3b76bb)
- **État**: RUNNING
- **Lancée**: 2026-02-05 (18 jours)
- **Type**: t3.micro
- **Environnement EB**: rt-tms-sync-api-prod (Ready/Green) ✅
- **Version la plus récente**: rt-tms-sync-api-production (i-04c2a160eb0d784f5) lancée 2026-02-10
- **Statut**: ⚠️ **RÉCENTE** - Seulement 18 jours, peut être un rollback
- **Économie**: 9€/mois

#### Instance 5: rt-tms-sync-api-v2 (i-0b2104524871b8802)
- **État**: RUNNING
- **Lancée**: 2026-01-19 (5 semaines)
- **Type**: t3.micro
- **Environnement EB**: rt-tms-sync-api-v2 (Ready/Green) ✅
- **Statut**: ⚠️ Environnement actif, vérifier si c'est un environnement de staging
- **Économie**: 9€/mois

### Résumé Instances
| Instance ID | Nom | Âge | Type | Peut être supprimée? | Économie |
|-------------|-----|-----|------|---------------------|----------|
| i-03116e7c86d6d3599 | rt-affret-ia-api-prod | 3 mois | t3.micro | ✅ OUI | 9€ |
| i-03ded696fdbef22cb | rt-orders-api-prod | 7 sem. | t3.micro | ✅ OUI | 9€ |
| i-02dd7db8947118d4d | rt-subscriptions-api-prod-v5 | 6 sem. | t3.small | ⚠️ VÉRIFIER | 18€ |
| i-004c65af6eb3b76bb | rt-tms-sync-api-prod | 18 jours | t3.micro | ⚠️ RÉCENTE | 9€ |
| i-0b2104524871b8802 | rt-tms-sync-api-v2 | 5 sem. | t3.micro | ⚠️ ENV ACTIF | 9€ |

**Total économie potentielle**: 45€/mois (si toutes supprimées)
**Total économie sûre**: 18€/mois (2 premières instances uniquement)

---

## 4. ElastiCache Redis

### Status: ✅ DÉTECTÉ

**Détails**:
- Cluster ID: exploit-ia-redis
- Type: cache.t3.micro
- État: available
- Nombre de nœuds: 1
- Version: Redis 7.1.0

**Coût mensuel estimé**: 15€/mois
**Action recommandée**:
1. Étape 1: Configurer REDIS_ENABLED=false sur tous les environnements EB
2. Étape 2: Monitorer pendant 24-48h
3. Étape 3: Supprimer le cluster si aucun problème

**Risque**: ⚠️ ÉLEVÉ - Nécessite tests approfondis

---

## Plan d'Action Recommandé

### Phase 1A: Actions Immédiates (Risque Faible)

✅ **Action 1**: Libérer les 4 Elastic IPs
- Économie: 14€/mois
- Risque: Aucun
- Temps: 2 minutes

✅ **Action 2**: Arrêter RT-DeploymentInstance
- Économie: 21€/mois
- Risque: Faible (peut redémarrer si besoin)
- Temps: 1 minute

✅ **Action 3**: Supprimer 2 anciennes instances confirmées
- Instances: i-03116e7c86d6d3599, i-03ded696fdbef22cb
- Économie: 18€/mois
- Risque: Faible (versions plus récentes actives)
- Temps: 2 minutes

**Total Phase 1A**: 53€/mois d'économie

### Phase 1B: Actions à Valider (Risque Moyen)

⚠️ **Action 4**: Analyser et potentiellement supprimer 3 autres instances
- Instances: i-02dd7db8947118d4d, i-004c65af6eb3b76bb, i-0b2104524871b8802
- Économie potentielle: 27€/mois
- Nécessite: Investigation approfondie des environnements EB

⚠️ **Action 5**: Désactiver Redis ElastiCache
- Économie: 15€/mois
- Nécessite: Tests applicatifs complets
- Timeline: 2-3 jours

**Total Phase 1B**: 42€/mois d'économie (après validation)

---

## Économies Totales Prévisionnelles

- **Phase 1A (Sûr)**: 53€/mois
- **Phase 1B (À valider)**: 42€/mois
- **TOTAL**: 95€/mois ✅ (Objectif atteint)

---

## Prochaines Étapes

1. ✅ Valider ce rapport avec l'équipe
2. ⏭️ Exécuter Phase 1A (actions immédiates)
3. ⏭️ Investiguer les 3 instances restantes
4. ⏭️ Planifier la migration Redis
5. ⏭️ Générer rapport post-exécution

---

**Recommandation**: Procéder avec la Phase 1A immédiatement (économie garantie de 53€/mois), puis investiguer la Phase 1B.
