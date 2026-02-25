# Phase 3: Auto-Scaling Exploit-IA

## Objectif
Économiser **73.56€/mois (54.5%)** en arrêtant automatiquement les services Exploit-IA hors heures ouvrables.

---

## Scripts Disponibles

### 1. deploy-autoscaling-single.sh - Test
```bash
./deploy-autoscaling-single.sh exploit-ia-planning-prod exploit-ia-planning
```

### 2. deploy-autoscaling-all.sh - Déploiement
```bash
# Simulation
./deploy-autoscaling-all.sh dry-run

# Déploiement réel
./deploy-autoscaling-all.sh deploy
```

### 3. check-autoscaling-status.sh - Vérification
```bash
./check-autoscaling-status.sh
```

### 4. rollback-autoscaling.sh - Annulation
```bash
./rollback-autoscaling.sh all
```

---

## Services Concernés (8/9)

**Business Hours** - Arrêt 19h-8h (Lun-Ven):
- exploit-ia-affretia-prod-v1
- exploit-ia-planning-prod-v3
- exploit-ia-api-orders-prod-v1
- exploit-ia-profitability-v3

**Admin/Workers** - Arrêt 19h-8h (Lun-Ven):
- exploit-ia-api-admin-prod-v1
- exploit-ia-worker-v3
- exploit-ia-worker-ingestion-prod
- exploit-ia-planning-prod

**24/7** - Aucune modification:
- exploit-ia-api-auth-prod-v1

---

## Plan de Déploiement

1. **Dry-Run**: `./deploy-autoscaling-all.sh dry-run`
2. **Test (24h)**: `./deploy-autoscaling-single.sh exploit-ia-planning-prod exploit-ia-planning`
3. **Deploy**: `./deploy-autoscaling-all.sh deploy`
4. **Monitor**: `./check-autoscaling-status.sh`

---

## Configuration

**Evening Scale Down** (19h UTC Lun-Ven):
- MinSize=0, MaxSize=0, DesiredCapacity=0

**Morning Scale Up** (8h UTC Lun-Ven):
- MinSize=1, MaxSize=2, DesiredCapacity=1

**Note**: 19h UTC = 20h Paris (hiver) ou 21h Paris (été)

---

## Économies

| État | Coût/mois |
|------|-----------|
| Actuel | 135€ (9 instances 24/7) |
| Après | 61.44€ |
| **Économie** | **73.56€ (54.5%)** |

---

## Rollback d'Urgence

```bash
./rollback-autoscaling.sh all
```

---

## Validation

- [ ] Dry-run OK
- [ ] Test 24h OK  
- [ ] Deploy 8/8 OK
- [ ] Arrêt 19h vérifié
- [ ] Démarrage 8h vérifié
- [ ] Économies confirmées (J+7)

**Documentation détaillée**: `ANALYSE_CRITICITE_EXPLOIT_IA.md`
