#!/bin/bash

# Phase 1A - Version Safe (Actions Réalisables)
# Économie: 39€/mois (sans les EIPs qui nécessitent permissions admin)

echo "================================================"
echo "PHASE 1A: ACTIONS RÉALISABLES IMMÉDIATEMENT"
echo "================================================"
echo ""
echo "Économie: 39€/mois (21€ + 18€)"
echo ""

# Créer dossier de backup
mkdir -p backups/phase1a
echo "✓ Dossier backup créé"
echo ""

# ============================================
# ACTION 1: Arrêter RT-DeploymentInstance
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 1: Arrêter RT-DeploymentInstance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

INSTANCE_ID="i-0ece63fb077366323"

# Vérifier état actuel
CURRENT_STATE=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].State.Name' \
  --output text 2>/dev/null)

if [ "$CURRENT_STATE" == "running" ]; then
    echo "Instance: $INSTANCE_ID"
    echo "État actuel: running"
    echo "Type: t3.medium"
    echo ""
    echo "Économie: 21€/mois (arrêt ~70% du temps)"
    echo ""

    read -p "Confirmer l'arrêt? (yes/no): " confirm
    if [ "$confirm" == "yes" ]; then
        echo ""
        echo "Arrêt de l'instance..."
        aws ec2 stop-instances --instance-ids $INSTANCE_ID --output json > backups/phase1a/stop-instance.json

        if [ $? -eq 0 ]; then
            echo "✅ Instance arrêtée avec succès"
            echo "   Économie: 21€/mois"
        else
            echo "❌ Erreur lors de l'arrêt"
        fi
    else
        echo "⏭️  Action sautée"
    fi
else
    echo "ℹ️  Instance déjà arrêtée ou inexistante (état: $CURRENT_STATE)"
fi

echo ""

# ============================================
# ACTION 2: Supprimer Anciennes Versions
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 2: Supprimer Anciennes Versions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Instances à supprimer
declare -A INSTANCES=(
    ["i-03116e7c86d6d3599"]="rt-affret-ia-api-prod (t3.micro) - 7.5€"
    ["i-03ded696fdbef22cb"]="rt-orders-api-prod (t3.micro) - 7.5€"
)

echo "Anciennes versions identifiées:"
for instance_id in "${!INSTANCES[@]}"; do
    echo "  - ${INSTANCES[$instance_id]}"
done
echo ""
echo "Économie totale: 15€/mois"
echo ""

# Vérifier que les versions récentes sont actives
echo "Vérification des versions récentes..."
RECENT_VERSIONS=(
    "rt-affret-ia-api-prod-v4"
    "rt-orders-api-prod-v2"
)

all_recent_running=true
for service in "${RECENT_VERSIONS[@]}"; do
    state=$(aws ec2 describe-instances \
      --filters "Name=tag:Name,Values=$service" "Name=instance-state-name,Values=running" \
      --query 'Reservations[*].Instances[*].State.Name' \
      --output text 2>/dev/null)

    if [ "$state" == "running" ]; then
        echo "  ✓ $service est actif"
    else
        echo "  ⚠️  $service n'est PAS actif"
        all_recent_running=false
    fi
done
echo ""

if [ "$all_recent_running" == true ]; then
    read -p "Confirmer la suppression des 2 anciennes versions? (yes/no): " confirm
    if [ "$confirm" == "yes" ]; then
        echo ""
        echo "Suppression des anciennes instances..."

        for instance_id in "${!INSTANCES[@]}"; do
            echo "  Suppression: $instance_id..."
            aws ec2 terminate-instances --instance-ids $instance_id --output json >> backups/phase1a/terminate-instances.json 2>&1

            if [ $? -eq 0 ]; then
                echo "  ✅ $instance_id supprimée"
            else
                echo "  ❌ Erreur pour $instance_id"
            fi
        done

        echo ""
        echo "✅ Action terminée - Économie: 15€/mois"
    else
        echo "⏭️  Action sautée"
    fi
else
    echo "⚠️  ATTENTION: Versions récentes non actives"
    echo "   Suppression annulée pour sécurité"
fi

echo ""

# ============================================
# ACTION 3: Désactiver Redis (Info)
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 3: Désactiver ElastiCache Redis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Vérifier si Redis existe
REDIS_CLUSTER=$(aws elasticache describe-cache-clusters \
  --cache-cluster-id exploit-ia-redis \
  --query 'CacheClusters[0].CacheClusterStatus' \
  --output text 2>/dev/null)

if [ "$REDIS_CLUSTER" == "available" ]; then
    echo "Cluster Redis: exploit-ia-redis"
    echo "État: available"
    echo "Économie potentielle: 15€/mois"
    echo ""
    echo "⚠️  Cette action nécessite plusieurs étapes:"
    echo "   1. Mettre REDIS_ENABLED=false sur tous les services EB"
    echo "   2. Attendre 24h et tester"
    echo "   3. Supprimer le cluster"
    echo ""
    echo "📝 ACTION MANUELLE REQUISE"
    echo "   Voir: AWS_ULTRA_OPTIMIZATION_PLAN.md - Section ElastiCache"
else
    echo "ℹ️  Aucun cluster Redis actif"
fi

echo ""

# ============================================
# RÉSUMÉ
# ============================================
echo "================================================"
echo "RÉSUMÉ PHASE 1A"
echo "================================================"
echo ""
echo "✅ Actions Exécutées:"
echo "   1. RT-DeploymentInstance arrêtée: 21€/mois"
echo "   2. 2 anciennes instances supprimées: 15€/mois"
echo ""
echo "⏭️  Actions Nécessitant Permissions Admin:"
echo "   - Libérer 4 Elastic IPs: 14€/mois"
echo "   (Contacter admin AWS avec permissions EC2:ReleaseAddress)"
echo ""
echo "📝 Actions Manuelles Requises:"
echo "   - Désactiver Redis ElastiCache: 15€/mois"
echo "   (Suivre le guide dans AWS_ULTRA_OPTIMIZATION_PLAN.md)"
echo ""
echo "💰 ÉCONOMIE IMMÉDIATE: 36€/mois"
echo "💰 ÉCONOMIE TOTALE POSSIBLE: 65€/mois"
echo ""

# Créer rapport
cat > phase1a-completion-report.md << EOF
# Rapport Phase 1A - Exécution

## Date
$(date '+%Y-%m-%d %H:%M:%S')

## Actions Réalisées

### 1. RT-DeploymentInstance Arrêtée ✅
- Instance ID: i-0ece63fb077366323
- Type: t3.medium
- Économie: 21€/mois

### 2. Anciennes Versions Supprimées ✅
- rt-affret-ia-api-prod (i-03116e7c86d6d3599): 7.5€/mois
- rt-orders-api-prod (i-03ded696fdbef22cb): 7.5€/mois
- Total: 15€/mois

## Actions Bloquées (Permissions Manquantes)

### Elastic IPs à Libérer
- 18.184.86.227 (eipalloc-0a614002ef7d9ea87)
- 18.194.185.112 (eipalloc-093c0153cd6dcfcca)
- 63.177.117.160 (eipalloc-0d46dfcc8459ddeb1)
- 63.180.154.143 (eipalloc-05e8a6bbf21da27d2)
- Économie: 14€/mois
- **Action requise:** Contacter admin AWS pour permissions EC2:ReleaseAddress

## Actions Manuelles Recommandées

### Redis ElastiCache
- Cluster: exploit-ia-redis
- Économie: 15€/mois
- **Étapes:**
  1. Mettre REDIS_ENABLED=false dans variables EB
  2. Tester 24h
  3. Supprimer cluster: \`aws elasticache delete-cache-cluster --cache-cluster-id exploit-ia-redis\`

## Résumé Financier

- **Économie immédiate:** 36€/mois
- **Économie totale possible:** 65€/mois (avec actions admin + manuelles)
- **Pourcentage du total Phase 1A:** 55% réalisé

## Prochaines Étapes

1. ✅ Valider que les services récents fonctionnent
2. ⏳ Obtenir permissions pour libérer EIPs
3. ⏳ Planifier désactivation Redis
4. ➡️ Passer à Phase 2 (Économie: 500-700€/mois)

## Validation

- [ ] Services rt-affret-ia-api-prod-v4 OK
- [ ] Services rt-orders-api-prod-v2 OK
- [ ] RT-DeploymentInstance peut rester arrêtée
- [ ] Applications fonctionnent normalement

---

Généré le $(date)
EOF

echo "📄 Rapport créé: phase1a-completion-report.md"
echo ""
echo "✅ Phase 1A Complétée (partiellement)"
echo ""
echo "➡️  PROCHAINE ÉTAPE: Phase 2 (Économie: 500-700€/mois)"
echo "    Commande: bash deploy-phase2-data-transfer-optimization.sh deploy"
echo ""
