#!/bin/bash
# Script d'exécution Phase 1A - Actions Immédiates
# Économie cible: 53€/mois

set -e

REGION="eu-central-1"

echo "================================================"
echo "PHASE 1A: OPTIMISATION AWS - ACTIONS IMMÉDIATES"
echo "================================================"
echo ""
echo "Économie cible: 53€/mois"
echo "Risque: FAIBLE"
echo ""

# Action 1: Libérer les Elastic IPs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 1: Libérer les Elastic IPs non utilisées"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "EIPs à libérer:"
echo "  - 18.184.86.227 (eipalloc-0a614002ef7d9ea87)"
echo "  - 18.194.185.112 (eipalloc-093c0153cd6dcfcca)"
echo "  - 63.177.117.160 (eipalloc-0d46dfcc8459ddeb1)"
echo "  - 63.180.154.143 (eipalloc-05e8a6bbf21da27d2)"
echo ""
echo "Économie: 14€/mois"
echo ""
read -p "Confirmer la libération des 4 Elastic IPs? (yes/no): " confirm1

if [ "$confirm1" = "yes" ]; then
    echo "Libération des EIPs..."
    aws ec2 release-address --region $REGION --allocation-id eipalloc-0a614002ef7d9ea87 && echo "  ✅ 18.184.86.227 libérée"
    aws ec2 release-address --region $REGION --allocation-id eipalloc-093c0153cd6dcfcca && echo "  ✅ 18.194.185.112 libérée"
    aws ec2 release-address --region $REGION --allocation-id eipalloc-0d46dfcc8459ddeb1 && echo "  ✅ 63.177.117.160 libérée"
    aws ec2 release-address --region $REGION --allocation-id eipalloc-05e8a6bbf21da27d2 && echo "  ✅ 63.180.154.143 libérée"
    echo "✅ Action 1 terminée - Économie: 14€/mois"
else
    echo "⏭️  Action 1 ignorée"
fi

echo ""
echo ""

# Action 2: Arrêter RT-DeploymentInstance
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 2: Arrêter RT-DeploymentInstance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Instance: i-0ece63fb077366323"
echo "Type: t3.medium"
echo "État actuel: running"
echo ""
echo "Économie: 21€/mois"
echo ""
echo "Note: L'instance peut être redémarrée à tout moment si besoin"
echo ""
read -p "Confirmer l'arrêt de RT-DeploymentInstance? (yes/no): " confirm2

if [ "$confirm2" = "yes" ]; then
    echo "Arrêt de l'instance..."
    aws ec2 stop-instances --region $REGION --instance-ids i-0ece63fb077366323
    echo "✅ Action 2 terminée - Économie: 21€/mois"
    echo "Note: Attendre 1-2 minutes pour arrêt complet"
else
    echo "⏭️  Action 2 ignorée"
fi

echo ""
echo ""

# Action 3: Supprimer les anciennes instances
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ACTION 3: Supprimer les anciennes instances"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Instances à supprimer:"
echo "  1. i-03116e7c86d6d3599 - rt-affret-ia-api-prod (lancée: 2025-11-23)"
echo "     Version actuelle: rt-affret-ia-api-prod-v4 (lancée: 2026-02-02)"
echo ""
echo "  2. i-03ded696fdbef22cb - rt-orders-api-prod (lancée: 2026-01-04)"
echo "     Version actuelle: rt-orders-api-prod-v2 (lancée: 2026-01-27)"
echo ""
echo "Économie: 18€/mois"
echo ""
echo "⚠️  ATTENTION: Action irréversible (terminate)"
echo ""
read -p "Confirmer la suppression des 2 anciennes instances? (yes/no): " confirm3

if [ "$confirm3" = "yes" ]; then
    echo "Suppression des instances..."
    aws ec2 terminate-instances --region $REGION --instance-ids i-03116e7c86d6d3599 && echo "  ✅ i-03116e7c86d6d3599 supprimée"
    aws ec2 terminate-instances --region $REGION --instance-ids i-03ded696fdbef22cb && echo "  ✅ i-03ded696fdbef22cb supprimée"
    echo "✅ Action 3 terminée - Économie: 18€/mois"
else
    echo "⏭️  Action 3 ignorée"
fi

echo ""
echo ""
echo "================================================"
echo "RÉSUMÉ PHASE 1A"
echo "================================================"
echo ""
echo "Économie totale: 53€/mois"
echo ""
echo "Prochaines étapes:"
echo "  1. Vérifier les ressources supprimées dans la console AWS"
echo "  2. Monitorer les applications pendant 24h"
echo "  3. Passer à la Phase 1B (actions à valider)"
echo ""
echo "Rapport complet: phase1-execution-report.md"
echo ""
