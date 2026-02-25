#!/bin/bash

# ================================================
# SETUP - Optimiseur Autonome AWS
# ================================================
# Configuration rapide et automatique
# Date: 23 février 2026

set -e

echo "================================================"
echo "CONFIGURATION - OPTIMISEUR AUTONOME AWS"
echo "================================================"
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# ÉTAPE 1: Vérification des Prérequis
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ÉTAPE 1: Vérification des Prérequis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Vérifier AWS CLI
if command -v aws &> /dev/null; then
    AWS_VERSION=$(aws --version 2>&1 | awk '{print $1}')
    echo -e "${GREEN}✓${NC} AWS CLI trouvé: $AWS_VERSION"
else
    echo -e "${RED}✗${NC} AWS CLI non trouvé"
    echo "   Installation requise: https://aws.amazon.com/cli/"
    exit 1
fi

# Vérifier jq
if command -v jq &> /dev/null; then
    JQ_VERSION=$(jq --version)
    echo -e "${GREEN}✓${NC} jq trouvé: $JQ_VERSION"
else
    echo -e "${YELLOW}⚠${NC} jq non trouvé - Installation..."

    # Détecter OS
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
        # Windows (Git Bash)
        if [ -f "jq.exe" ]; then
            echo -e "${GREEN}✓${NC} jq.exe déjà présent"
        else
            echo "   Téléchargement jq pour Windows..."
            curl -L --insecure https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe -o jq.exe
            echo -e "${GREEN}✓${NC} jq.exe téléchargé"
        fi
    else
        echo -e "${RED}✗${NC} Veuillez installer jq manuellement"
        echo "   Ubuntu/Debian: sudo apt-get install jq"
        echo "   Amazon Linux: sudo yum install jq"
        exit 1
    fi
fi

# Vérifier credentials AWS
echo ""
echo "Vérification des credentials AWS..."
if aws sts get-caller-identity &> /dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text | awk -F'/' '{print $NF}')
    echo -e "${GREEN}✓${NC} Credentials AWS valides"
    echo "   Compte: $AWS_ACCOUNT"
    echo "   User: $AWS_USER"
else
    echo -e "${RED}✗${NC} Credentials AWS non configurés"
    echo "   Exécutez: aws configure"
    exit 1
fi

echo ""

# ============================================
# ÉTAPE 2: Configuration du Script
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ÉTAPE 2: Configuration du Script"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Vérifier que le script existe
if [ ! -f "autonomous-optimizer.sh" ]; then
    echo -e "${RED}✗${NC} autonomous-optimizer.sh non trouvé"
    exit 1
fi

# Rendre exécutable
chmod +x autonomous-optimizer.sh
echo -e "${GREEN}✓${NC} Script rendu exécutable"

# Créer dossiers nécessaires
mkdir -p backups/autonomous-optimizer
mkdir -p logs
mkdir -p archives
echo -e "${GREEN}✓${NC} Dossiers créés"

echo ""

# ============================================
# ÉTAPE 3: Test Dry-Run
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ÉTAPE 3: Test Dry-Run Initial"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "Exécution du test dry-run..."
echo ""

# Exécuter dry-run
if ./autonomous-optimizer.sh --dry-run; then
    echo ""
    echo -e "${GREEN}✓${NC} Test dry-run réussi"

    # Trouver le dernier rapport
    LATEST_REPORT=$(ls -t autonomous-optimizer-report-*.txt 2>/dev/null | head -1)

    if [ -n "$LATEST_REPORT" ]; then
        echo ""
        echo "Résumé du rapport:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        grep "ÉCONOMIE" "$LATEST_REPORT" || true
        grep "ACTIONS" "$LATEST_REPORT" || true
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        echo "Rapport complet: $LATEST_REPORT"
    fi
else
    echo ""
    echo -e "${RED}✗${NC} Test dry-run échoué"
    echo "   Vérifiez les logs pour plus de détails"
    exit 1
fi

echo ""

# ============================================
# ÉTAPE 4: Configuration Cron (Optionnel)
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ÉTAPE 4: Configuration Cron (Optionnel)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Détecter si cron est disponible
if command -v crontab &> /dev/null; then
    echo "Configuration automatique du cron job disponible."
    echo ""
    echo "Options:"
    echo "  1) Quotidien à 2h00 (recommandé)"
    echo "  2) Quotidien à 2h00 (jours ouvrés seulement)"
    echo "  3) Hebdomadaire (lundi à 2h00)"
    echo "  4) Manuel (je configurerai plus tard)"
    echo ""

    read -p "Choisir une option (1-4): " CRON_CHOICE

    SCRIPT_PATH=$(pwd)/autonomous-optimizer.sh
    LOG_PATH=$(pwd)/logs/autonomous-optimizer.log

    case $CRON_CHOICE in
        1)
            CRON_EXPR="0 2 * * *"
            CRON_DESC="Quotidien à 2h00"
            ;;
        2)
            CRON_EXPR="0 2 * * 1-5"
            CRON_DESC="Quotidien à 2h00 (lun-ven)"
            ;;
        3)
            CRON_EXPR="0 2 * * 1"
            CRON_DESC="Hebdomadaire (lundi 2h00)"
            ;;
        4)
            CRON_EXPR=""
            CRON_DESC="Configuration manuelle"
            ;;
        *)
            CRON_EXPR=""
            CRON_DESC="Configuration manuelle"
            ;;
    esac

    if [ -n "$CRON_EXPR" ]; then
        # Créer nouvelle entrée cron
        CRON_LINE="$CRON_EXPR $SCRIPT_PATH --auto >> $LOG_PATH 2>&1"

        # Vérifier si déjà présent
        if crontab -l 2>/dev/null | grep -q "autonomous-optimizer.sh"; then
            echo -e "${YELLOW}⚠${NC} Entrée cron existante trouvée"
            read -p "Remplacer? (yes/no): " REPLACE

            if [ "$REPLACE" == "yes" ]; then
                # Supprimer ancienne entrée
                crontab -l 2>/dev/null | grep -v "autonomous-optimizer.sh" | crontab -
                # Ajouter nouvelle
                (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
                echo -e "${GREEN}✓${NC} Cron job remplacé: $CRON_DESC"
            fi
        else
            # Ajouter nouvelle entrée
            (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
            echo -e "${GREEN}✓${NC} Cron job configuré: $CRON_DESC"
        fi

        echo ""
        echo "Vérification:"
        crontab -l | grep "autonomous-optimizer.sh"
    else
        echo -e "${YELLOW}⚠${NC} Configuration manuelle choisie"
        echo ""
        echo "Pour configurer manuellement:"
        echo "  crontab -e"
        echo ""
        echo "Ajouter la ligne:"
        echo "  0 2 * * * $SCRIPT_PATH --auto >> $LOG_PATH 2>&1"
    fi
else
    echo -e "${YELLOW}⚠${NC} Cron non disponible sur ce système"
    echo ""
    echo "Alternatives:"
    echo "  - Windows: Utilisez le Planificateur de tâches"
    echo "  - Systemd: Voir AUTONOMOUS-OPTIMIZER-GUIDE.md"
fi

echo ""

# ============================================
# ÉTAPE 5: Résumé et Prochaines Étapes
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "RÉSUMÉ DE LA CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${GREEN}✅ Configuration terminée avec succès !${NC}"
echo ""

echo "Fichiers créés:"
echo "  ✓ autonomous-optimizer.sh (script principal)"
echo "  ✓ AUTONOMOUS-OPTIMIZER-GUIDE.md (documentation)"
echo "  ✓ backups/autonomous-optimizer/ (dossier backups)"
echo "  ✓ logs/ (dossier logs)"
echo ""

echo "Commandes disponibles:"
echo ""
echo "  # Test dry-run"
echo "  ./autonomous-optimizer.sh --dry-run"
echo ""
echo "  # Rapport uniquement"
echo "  ./autonomous-optimizer.sh --report-only"
echo ""
echo "  # Exécution automatique"
echo "  ./autonomous-optimizer.sh --auto"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PROCHAINES ÉTAPES RECOMMANDÉES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "1️⃣  AUJOURD'HUI - Analyser le rapport dry-run"
echo "   cat $LATEST_REPORT"
echo ""

echo "2️⃣  CETTE SEMAINE - Tester en mode auto sur ressources non critiques"
echo "   ./autonomous-optimizer.sh --auto"
echo ""

echo "3️⃣  SEMAINE PROCHAINE - Valider économies dans AWS Cost Explorer"
echo "   https://console.aws.amazon.com/cost-management/home#/cost-explorer"
echo ""

echo "4️⃣  MOIS PROCHAIN - Analyser rapport mensuel"
echo "   ./autonomous-optimizer.sh --report-only > monthly-report.txt"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Créer fichier de statut
cat > autonomous-optimizer-status.txt << EOF
# Status de l'Optimiseur Autonome AWS

**Date d'installation:** $(date '+%Y-%m-%d %H:%M:%S')
**Version:** 1.0
**Status:** ✅ Configuré et opérationnel

## Configuration

- AWS CLI: Configuré
- jq: Installé
- Script: Exécutable
- Test dry-run: Réussi
- Cron job: $CRON_DESC

## Dernier Test

- Date: $(date '+%Y-%m-%d %H:%M:%S')
- Rapport: $LATEST_REPORT
- Status: ✅ Succès

## Prochaine Exécution

Voir crontab pour planification.

---

Pour plus d'informations, consulter: AUTONOMOUS-OPTIMIZER-GUIDE.md
EOF

echo "📄 Status sauvegardé: autonomous-optimizer-status.txt"
echo ""
echo -e "${GREEN}🎉 Installation et configuration terminées !${NC}"
echo ""
