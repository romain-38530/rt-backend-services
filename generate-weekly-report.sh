#!/bin/bash
################################################################################
# Générateur de Rapport Hebdomadaire - Routine Autonome AWS
################################################################################
# Génère un résumé hebdomadaire des opportunités détectées
# Usage: ./generate-weekly-report.sh [nombre_de_jours]
################################################################################

# Paramètres
DAYS=${1:-7}
REPORT_DIR="reports/weekly"
TODAY=$(date +%Y%m%d)
REPORT_FILE="$REPORT_DIR/weekly-report-$TODAY.md"

# Créer le dossier si nécessaire
mkdir -p "$REPORT_DIR"

# En-tête du rapport
cat > "$REPORT_FILE" << EOF
# 📊 Rapport Hebdomadaire - Optimisation AWS

**Période :** $(date --date="$DAYS days ago" +"%d/%m/%Y") - $(date +"%d/%m/%Y")
**Généré le :** $(date +"%d/%m/%Y à %H:%M")

---

## 🎯 RÉSUMÉ EXÉCUTIF

EOF

# Compter les exécutions
echo "### Statistiques d'Exécution" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

EXECUTION_COUNT=$(ls logs/daily-optimizer-*.log 2>/dev/null | wc -l)
echo "- **Exécutions totales :** $EXECUTION_COUNT" >> "$REPORT_FILE"

# Compter les opportunités
echo "" >> "$REPORT_FILE"
echo "### Opportunités Détectées" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Opportunités par type
INSTANCES_COUNT=$(grep -h "Instance.*arrêtée" logs/daily-optimizer-*.log 2>/dev/null | wc -l)
ALB_COUNT=$(grep -h "ALB sans targets" logs/daily-optimizer-*.log 2>/dev/null | wc -l)
TOTAL_OPP=$(grep -h "OPPORTUNITÉ" logs/daily-optimizer-*.log 2>/dev/null | wc -l)

echo "| Type | Détections |" >> "$REPORT_FILE"
echo "|------|-----------|" >> "$REPORT_FILE"
echo "| Instances arrêtées | $INSTANCES_COUNT |" >> "$REPORT_FILE"
echo "| Load Balancers inutilisés | $ALB_COUNT |" >> "$REPORT_FILE"
echo "| **Total** | **$TOTAL_OPP** |" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Économies potentielles
echo "### 💰 Économies Potentielles Détectées" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

INSTANCES_SAVINGS=$((INSTANCES_COUNT * 10))
ALB_SAVINGS=$((ALB_COUNT * 25))
TOTAL_SAVINGS=$((INSTANCES_SAVINGS + ALB_SAVINGS))

echo "| Catégorie | Économie Mensuelle |" >> "$REPORT_FILE"
echo "|-----------|-------------------|" >> "$REPORT_FILE"
echo "| Instances arrêtées | ${INSTANCES_SAVINGS}€/mois |" >> "$REPORT_FILE"
echo "| Load Balancers | ${ALB_SAVINGS}€/mois |" >> "$REPORT_FILE"
echo "| **TOTAL** | **${TOTAL_SAVINGS}€/mois** |" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Économie annuelle potentielle : $((TOTAL_SAVINGS * 12))€**" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Détails des opportunités
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 📋 DÉTAILS DES OPPORTUNITÉS" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Instances arrêtées
if [ $INSTANCES_COUNT -gt 0 ]; then
    echo "### Instances Arrêtées >30 jours" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    grep -h "Instance.*arrêtée" logs/daily-optimizer-*.log 2>/dev/null | sort -u >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# Load Balancers
if [ $ALB_COUNT -gt 0 ]; then
    echo "### Load Balancers Sans Targets" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    grep -h "ALB sans targets" logs/daily-optimizer-*.log 2>/dev/null | sort -u >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# Tendances
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 📈 TENDANCES" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Opportunités par Jour" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Date | Opportunités |" >> "$REPORT_FILE"
echo "|------|-------------|" >> "$REPORT_FILE"

for log in $(ls -r logs/daily-optimizer-*.log 2>/dev/null | head -$DAYS); do
    LOG_DATE=$(basename "$log" | sed 's/daily-optimizer-\([0-9]*\).log/\1/')
    FORMATTED_DATE=$(echo $LOG_DATE | sed 's/\([0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\)/\3\/\2\/\1/')
    OPP_COUNT=$(grep -c "OPPORTUNITÉ" "$log" 2>/dev/null || echo "0")
    echo "| $FORMATTED_DATE | $OPP_COUNT |" >> "$REPORT_FILE"
done

echo "" >> "$REPORT_FILE"

# Recommandations
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## ✅ RECOMMANDATIONS" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ $INSTANCES_COUNT -gt 0 ]; then
    echo "### Instances Arrêtées" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Action recommandée :** Vérifier si ces instances peuvent être terminées." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo '```bash' >> "$REPORT_FILE"
    echo "# Lister les instances arrêtées" >> "$REPORT_FILE"
    echo "aws ec2 describe-instances --filters \"Name=instance-state-name,Values=stopped\" --query \"Reservations[].Instances[].[InstanceId,Tags[?Key=='Name'].Value|[0]]\" --output table" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

if [ $ALB_COUNT -gt 0 ]; then
    echo "### Load Balancers" >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo "**Action recommandée :** Vérifier si ces ALBs sont toujours nécessaires." >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
    echo '```bash' >> "$REPORT_FILE"
    echo "# Lister les load balancers" >> "$REPORT_FILE"
    echo "aws elbv2 describe-load-balancers --query \"LoadBalancers[].[LoadBalancerName,State.Code]\" --output table" >> "$REPORT_FILE"
    echo '```' >> "$REPORT_FILE"
    echo "" >> "$REPORT_FILE"
fi

# Impact global
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 🌟 IMPACT GLOBAL" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "### Économies Cumulées (Toutes Optimisations)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "| Phase | Économie Mensuelle | Économie Annuelle |" >> "$REPORT_FILE"
echo "|-------|-------------------|-------------------|" >> "$REPORT_FILE"
echo "| Phase 2 - Data Transfer | 500-700€ | 6,000-8,400€ |" >> "$REPORT_FILE"
echo "| Phase 3 - Auto-Scaling | 74€ | 888€ |" >> "$REPORT_FILE"
echo "| Routine Autonome (détectées) | ${TOTAL_SAVINGS}€ | $((TOTAL_SAVINGS * 12))€ |" >> "$REPORT_FILE"
echo "| **TOTAL** | **$((574 + TOTAL_SAVINGS))-$((774 + TOTAL_SAVINGS))€** | **$((6888 + TOTAL_SAVINGS * 12))-$((9288 + TOTAL_SAVINGS * 12))€** |" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Prochaines étapes
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 🎯 PROCHAINES ÉTAPES" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

echo "1. ☐ Analyser les opportunités détectées" >> "$REPORT_FILE"
echo "2. ☐ Agir sur les ressources identifiées" >> "$REPORT_FILE"
echo "3. ☐ Mesurer les économies réalisées" >> "$REPORT_FILE"
echo "4. ☐ Ajuster les seuils si nécessaire" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Footer
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "*Rapport généré automatiquement par la routine autonome AWS Optimizer*" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**Logs source :** \`logs/daily-optimizer-*.log\`" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Afficher le résumé
echo "============================================="
echo "RAPPORT HEBDOMADAIRE GÉNÉRÉ"
echo "============================================="
echo ""
echo "📄 Fichier: $REPORT_FILE"
echo ""
echo "📊 Résumé:"
echo "  - Exécutions: $EXECUTION_COUNT"
echo "  - Opportunités détectées: $TOTAL_OPP"
echo "  - Économies potentielles: ${TOTAL_SAVINGS}€/mois"
echo ""
echo "✅ Rapport créé avec succès!"
echo ""

# Ouvrir le rapport (optionnel)
if command -v code &> /dev/null; then
    read -p "Ouvrir le rapport dans VS Code? (y/n): " open_code
    if [ "$open_code" == "y" ]; then
        code "$REPORT_FILE"
    fi
fi

echo "Commande pour voir le rapport:"
echo "  cat $REPORT_FILE"
echo ""
