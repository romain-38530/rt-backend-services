#!/bin/bash
################################################################################
# Générateur de Dashboard HTML - Routine Autonome AWS
################################################################################
# Crée un tableau de bord visuel des opportunités d'optimisation
################################################################################

DASHBOARD_FILE="dashboard.html"
TODAY=$(date +"%d/%m/%Y à %H:%M")

# Collecter les données
TOTAL_OPP=$(grep -h "OPPORTUNITÉ" logs/daily-optimizer-*.log 2>/dev/null | wc -l)
INSTANCES=$(grep -h "Instance.*arrêtée" logs/daily-optimizer-*.log 2>/dev/null | wc -l)
ALBS=$(grep -h "ALB sans targets" logs/daily-optimizer-*.log 2>/dev/null | wc -l)

INSTANCES_SAVINGS=$((INSTANCES * 10))
ALB_SAVINGS=$((ALBS * 25))
TOTAL_SAVINGS=$((INSTANCES_SAVINGS + ALB_SAVINGS))

# Générer le HTML
cat > "$DASHBOARD_FILE" << 'EOF'
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Optimizer - Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
        }

        .header {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            margin-bottom: 30px;
        }

        h1 {
            color: #2d3748;
            font-size: 2.5em;
            margin-bottom: 10px;
        }

        .subtitle {
            color: #718096;
            font-size: 1.1em;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
        }

        .stat-icon {
            font-size: 3em;
            margin-bottom: 10px;
        }

        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #2d3748;
            margin: 10px 0;
        }

        .stat-label {
            color: #718096;
            font-size: 0.95em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .savings {
            color: #48bb78 !important;
        }

        .opportunities {
            color: #4299e1 !important;
        }

        .details-section {
            background: white;
            padding: 30px;
            border-radius: 15px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            margin-bottom: 30px;
        }

        h2 {
            color: #2d3748;
            margin-bottom: 20px;
            font-size: 1.8em;
        }

        .opportunity-list {
            list-style: none;
        }

        .opportunity-item {
            background: #f7fafc;
            padding: 15px 20px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid #4299e1;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .opportunity-title {
            font-weight: 600;
            color: #2d3748;
        }

        .opportunity-savings {
            background: #48bb78;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-weight: bold;
        }

        .footer {
            text-align: center;
            color: white;
            padding: 20px;
            opacity: 0.9;
        }

        .progress-bar {
            background: #e2e8f0;
            height: 30px;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }

        .progress-fill {
            background: linear-gradient(90deg, #48bb78, #38a169);
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            transition: width 1s ease;
        }

        .chart-container {
            margin: 30px 0;
            padding: 20px;
            background: #f7fafc;
            border-radius: 10px;
        }

        .bar {
            background: #4299e1;
            height: 40px;
            margin: 10px 0;
            border-radius: 5px;
            display: flex;
            align-items: center;
            padding: 0 15px;
            color: white;
            font-weight: bold;
            transition: width 1s ease;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AWS Optimizer Dashboard</h1>
            <p class="subtitle">Routine Autonome d'Optimisation - Symphonia Platform</p>
            <p class="subtitle">DASHBOARD_DATE</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-value savings">TOTAL_SAVINGS€</div>
                <div class="stat-label">Économies Mensuelles Détectées</div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">💡</div>
                <div class="stat-value opportunities">TOTAL_OPP</div>
                <div class="stat-label">Opportunités Trouvées</div>
            </div>

            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-value">ANNUAL_SAVINGS€</div>
                <div class="stat-label">Économies Annuelles</div>
            </div>
        </div>

        <div class="details-section">
            <h2>📋 Détails des Opportunités</h2>

            <div class="chart-container">
                <h3 style="margin-bottom: 15px; color: #2d3748;">Répartition par Type</h3>
                <div class="bar" style="width: INSTANCES_WIDTH%;">
                    Instances Arrêtées: INSTANCES_COUNT (INSTANCES_SAVINGS€/mois)
                </div>
                <div class="bar" style="width: ALB_WIDTH%;">
                    Load Balancers: ALBS_COUNT (ALB_SAVINGS€/mois)
                </div>
            </div>

            <ul class="opportunity-list">
                OPPORTUNITIES_HTML
            </ul>
        </div>

        <div class="details-section">
            <h2>🌟 Impact Global</h2>

            <h3 style="color: #2d3748; margin: 20px 0;">Économies Cumulées (Toutes Phases)</h3>

            <div class="opportunity-item">
                <span class="opportunity-title">Phase 2 - Data Transfer</span>
                <span class="opportunity-savings">500-700€/mois</span>
            </div>

            <div class="opportunity-item">
                <span class="opportunity-title">Phase 3 - Auto-Scaling</span>
                <span class="opportunity-savings">74€/mois</span>
            </div>

            <div class="opportunity-item" style="border-left-color: #48bb78;">
                <span class="opportunity-title">Routine Autonome (détectées)</span>
                <span class="opportunity-savings">TOTAL_SAVINGS€/mois</span>
            </div>

            <div style="margin-top: 30px; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; color: white;">
                <h3 style="color: white; margin-bottom: 10px;">💎 Total Mensuel</h3>
                <div style="font-size: 3em; font-weight: bold;">COMBINED_MIN-COMBINED_MAX€</div>
                <p style="opacity: 0.9; margin-top: 10px;">Soit ANNUAL_COMBINED_MIN-ANNUAL_COMBINED_MAX€/an économisés !</p>
            </div>
        </div>

        <div class="footer">
            <p>Généré automatiquement par la Routine Autonome AWS Optimizer</p>
            <p style="margin-top: 10px; opacity: 0.8;">📁 Logs: logs/daily-optimizer-*.log</p>
        </div>
    </div>
</body>
</html>
EOF

# Remplacer les placeholders
sed -i "s/DASHBOARD_DATE/$TODAY/" "$DASHBOARD_FILE"
sed -i "s/TOTAL_SAVINGS/$TOTAL_SAVINGS/" "$DASHBOARD_FILE"
sed -i "s/TOTAL_OPP/$TOTAL_OPP/" "$DASHBOARD_FILE"
sed -i "s/ANNUAL_SAVINGS/$((TOTAL_SAVINGS * 12))/" "$DASHBOARD_FILE"
sed -i "s/INSTANCES_COUNT/$INSTANCES/" "$DASHBOARD_FILE"
sed -i "s/ALBS_COUNT/$ALBS/" "$DASHBOARD_FILE"
sed -i "s/INSTANCES_SAVINGS/$INSTANCES_SAVINGS/" "$DASHBOARD_FILE"
sed -i "s/ALB_SAVINGS/$ALB_SAVINGS/" "$DASHBOARD_FILE"

# Calculer les largeurs des barres (max 100%)
if [ $TOTAL_SAVINGS -gt 0 ]; then
    INSTANCES_WIDTH=$(( (INSTANCES_SAVINGS * 100) / TOTAL_SAVINGS ))
    ALB_WIDTH=$(( (ALB_SAVINGS * 100) / TOTAL_SAVINGS ))
else
    INSTANCES_WIDTH=50
    ALB_WIDTH=50
fi

sed -i "s/INSTANCES_WIDTH/$INSTANCES_WIDTH/" "$DASHBOARD_FILE"
sed -i "s/ALB_WIDTH/$ALB_WIDTH/" "$DASHBOARD_FILE"

# Totaux combinés
COMBINED_MIN=$((574 + TOTAL_SAVINGS))
COMBINED_MAX=$((774 + TOTAL_SAVINGS))
ANNUAL_COMBINED_MIN=$((6888 + TOTAL_SAVINGS * 12))
ANNUAL_COMBINED_MAX=$((9288 + TOTAL_SAVINGS * 12))

sed -i "s/COMBINED_MIN/$COMBINED_MIN/" "$DASHBOARD_FILE"
sed -i "s/COMBINED_MAX/$COMBINED_MAX/" "$DASHBOARD_FILE"
sed -i "s/ANNUAL_COMBINED_MIN/$ANNUAL_COMBINED_MIN/" "$DASHBOARD_FILE"
sed -i "s/ANNUAL_COMBINED_MAX/$ANNUAL_COMBINED_MAX/" "$DASHBOARD_FILE"

# Générer la liste HTML des opportunités
OPPORTUNITIES_HTML=""

# Instances
if [ $INSTANCES -gt 0 ]; then
    OPPORTUNITIES_HTML+='<li class="opportunity-item"><span class="opportunity-title">🖥️ '
    OPPORTUNITIES_HTML+="$INSTANCES Instance(s) arrêtée(s) >30 jours"
    OPPORTUNITIES_HTML+='</span><span class="opportunity-savings">'
    OPPORTUNITIES_HTML+="${INSTANCES_SAVINGS}€/mois</span></li>"
fi

# ALBs
if [ $ALBS -gt 0 ]; then
    OPPORTUNITIES_HTML+='<li class="opportunity-item"><span class="opportunity-title">⚖️ '
    OPPORTUNITIES_HTML+="$ALBS Load Balancer(s) sans targets"
    OPPORTUNITIES_HTML+='</span><span class="opportunity-savings">'
    OPPORTUNITIES_HTML+="${ALB_SAVINGS}€/mois</span></li>"
fi

if [ -z "$OPPORTUNITIES_HTML" ]; then
    OPPORTUNITIES_HTML='<li class="opportunity-item"><span class="opportunity-title">✅ Aucune opportunité détectée actuellement</span></li>'
fi

# Échapper les caractères spéciaux pour sed
OPPORTUNITIES_HTML_ESCAPED=$(echo "$OPPORTUNITIES_HTML" | sed 's/[\/&]/\\&/g')
sed -i "s/OPPORTUNITIES_HTML/$OPPORTUNITIES_HTML_ESCAPED/" "$DASHBOARD_FILE"

echo "============================================="
echo "DASHBOARD GÉNÉRÉ"
echo "============================================="
echo ""
echo "📄 Fichier: $DASHBOARD_FILE"
echo ""
echo "📊 Statistiques:"
echo "  - Opportunités: $TOTAL_OPP"
echo "  - Économies: ${TOTAL_SAVINGS}€/mois"
echo "  - Total combiné: ${COMBINED_MIN}-${COMBINED_MAX}€/mois"
echo ""
echo "🌐 Ouvrir le dashboard:"
if command -v start &> /dev/null; then
    echo "  start $DASHBOARD_FILE"
    read -p "Ouvrir maintenant? (y/n): " open_browser
    if [ "$open_browser" == "y" ]; then
        start "$DASHBOARD_FILE"
    fi
elif command -v open &> /dev/null; then
    echo "  open $DASHBOARD_FILE"
elif command -v xdg-open &> /dev/null; then
    echo "  xdg-open $DASHBOARD_FILE"
fi
echo ""
echo "✅ Dashboard créé avec succès!"
echo ""
