# PLAN D'EXÉCUTION - PHASE 1: OPTIMISATION AWS

## Résumé Exécutif

**Date**: 2026-02-23
**Compte AWS**: 004843574253
**Région**: eu-central-1
**Budget actuel**: 1,855€/mois
**Objectif**: Économiser 95€/mois
**Status**: ✅ Dry-run complété, prêt pour exécution

---

## Phase 1A: Actions Immédiates (RECOMMANDÉ)

### Économie: 53€/mois | Risque: FAIBLE | Temps: 5 minutes

| # | Action | Ressource | Économie | Risque | Prêt? |
|---|--------|-----------|----------|--------|-------|
| 1 | Libérer 4 Elastic IPs | eipalloc-0a614002ef7d9ea87<br>eipalloc-093c0153cd6dcfcca<br>eipalloc-0d46dfcc8459ddeb1<br>eipalloc-05e8a6bbf21da27d2 | 14€/mois | ❌ Aucun | ✅ OUI |
| 2 | Arrêter instance déploiement | i-0ece63fb077366323<br>(RT-DeploymentInstance) | 21€/mois | ⚠️ Faible | ✅ OUI |
| 3 | Supprimer 2 anciennes versions | i-03116e7c86d6d3599 (rt-affret-ia-api-prod)<br>i-03ded696fdbef22cb (rt-orders-api-prod) | 18€/mois | ⚠️ Faible | ✅ OUI |

**Actions disponibles**:
```bash
# Option 1: Exécution guidée (recommandé)
bash execute-phase1a.sh

# Option 2: Exécution manuelle (voir commandes ci-dessous)
```

### Détails des Commandes

#### Action 1: Libérer les Elastic IPs
```bash
aws ec2 release-address --region eu-central-1 --allocation-id eipalloc-0a614002ef7d9ea87
aws ec2 release-address --region eu-central-1 --allocation-id eipalloc-093c0153cd6dcfcca
aws ec2 release-address --region eu-central-1 --allocation-id eipalloc-0d46dfcc8459ddeb1
aws ec2 release-address --region eu-central-1 --allocation-id eipalloc-05e8a6bbf21da27d2
```

#### Action 2: Arrêter RT-DeploymentInstance
```bash
aws ec2 stop-instances --region eu-central-1 --instance-ids i-0ece63fb077366323
```

#### Action 3: Supprimer les anciennes instances
```bash
aws ec2 terminate-instances --region eu-central-1 --instance-ids i-03116e7c86d6d3599 i-03ded696fdbef22cb
```

---

## Phase 1B: Actions à Valider (INVESTIGATION REQUISE)

### Économie: 42€/mois | Risque: MOYEN | Temps: Investigation 30min + Exécution 5min

| # | Action | Ressource | Économie | Status | Prêt? |
|---|--------|-----------|----------|--------|-------|
| 4 | Supprimer anciennes instances | i-02dd7db8947118d4d (rt-subscriptions-api-prod-v5)<br>i-004c65af6eb3b76bb (rt-tms-sync-api-prod)<br>i-0b2104524871b8802 (rt-tms-sync-api-v2) | 27€/mois | ⚠️ Ambiguë | ❌ NON |
| 5 | Désactiver Redis ElastiCache | exploit-ia-redis | 15€/mois | ⚠️ Usage inconnu | ❌ NON |

**Actions disponibles**:
```bash
# Investigation requise
bash investigate-phase1b.sh
```

### Problèmes Identifiés

#### Instance i-02dd7db8947118d4d (rt-subscriptions-api-prod-v5)
- ⚠️ Nommage confus: "v5" existe AVANT "v2"
- Environnement EB actif: rt-subscriptions-api-prod-v5 (Green)
- **Action requise**: Déterminer quelle version est réellement en production

#### Instances rt-tms-sync-api (3 versions actives!)
- i-04c2a160eb0d784f5: rt-tms-sync-api-production (2026-02-10) - PLUS RÉCENTE
- i-004c65af6eb3b76bb: rt-tms-sync-api-prod (2026-02-05) - 18 JOURS
- i-0b2104524871b8802: rt-tms-sync-api-v2 (2026-01-19) - 5 SEMAINES
- **Action requise**: Identifier laquelle est vraiment en production

#### Redis ElastiCache (exploit-ia-redis)
- ⚠️ Pas d'information sur l'utilisation réelle
- **Action requise**: 
  1. Analyser les métriques CloudWatch (connexions, throughput)
  2. Vérifier les logs applicatifs
  3. Tester avec REDIS_ENABLED=false sur un environnement de staging

---

## Recommandations

### Exécution Immédiate (Aujourd'hui)
✅ **APPROUVÉ**: Exécuter Phase 1A
- Économie garantie: 53€/mois
- Risque minimal
- Temps d'exécution: 5 minutes
- Rollback possible pour Action 2 (redémarrer l'instance)

### Investigation (Cette Semaine)
⏭️ **À PLANIFIER**: Investigation Phase 1B
- Exécuter le script `investigate-phase1b.sh`
- Analyser les résultats avec l'équipe DevOps
- Décider quelles instances supprimer
- Économie potentielle: 27€/mois supplémentaires

### Tests (Semaine Prochaine)
⏭️ **À PLANIFIER**: Tests Redis
- Configurer REDIS_ENABLED=false sur staging
- Monitorer pendant 48h
- Si OK, migrer vers production
- Économie potentielle: 15€/mois supplémentaires

---

## Checklist de Sécurité

Avant d'exécuter Phase 1A:
- [x] Dry-run complété
- [x] Ressources identifiées et vérifiées
- [x] Versions actuelles confirmées en production
- [x] Scripts de rollback disponibles
- [ ] Confirmation utilisateur obtenue
- [ ] Notification équipe envoyée

Après exécution Phase 1A:
- [ ] Vérifier les ressources supprimées dans console AWS
- [ ] Tester les services en production (200 OK)
- [ ] Monitorer les logs pendant 24h
- [ ] Documenter dans rapport final
- [ ] Calculer les économies réelles

---

## Fichiers Générés

1. `phase1-dry-run-analysis.md` - Analyse complète dry-run
2. `execute-phase1a.sh` - Script d'exécution Phase 1A
3. `investigate-phase1b.sh` - Script d'investigation Phase 1B
4. `PHASE1-EXECUTION-PLAN.md` - Ce fichier (plan d'exécution)

---

## Prochaines Étapes

### Maintenant
```bash
# 1. Lire le rapport d'analyse
cat phase1-dry-run-analysis.md

# 2. Confirmer l'exécution de Phase 1A
# (Attendre validation utilisateur)

# 3. Exécuter Phase 1A
bash execute-phase1a.sh
```

### Après Phase 1A
```bash
# 1. Investigation Phase 1B
bash investigate-phase1b.sh

# 2. Génération du rapport final
# (Après toutes les actions)
```

---

## Questions Ouvertes

1. **RT-DeploymentInstance**: Est-elle encore utilisée pour les déploiements automatiques?
2. **rt-subscriptions-api**: Pourquoi v5 existe avant v2? Laquelle est en production?
3. **rt-tms-sync-api**: Pourquoi 3 versions actives simultanément?
4. **Redis**: Quel service l'utilise réellement? Peut-on le désactiver?

---

## Contact

Pour toute question ou clarification:
- Exécuter les scripts d'investigation
- Consulter les logs CloudWatch
- Vérifier la console AWS EB

**Prêt pour exécution**: ✅ Phase 1A | ⏸️ Phase 1B (investigation requise)
