#!/bin/bash

# Script d'installation complète du monitoring SYMPHONI.A
# Ce script exécute toutes les étapes de configuration

set -e  # Arrêter en cas d'erreur

REGION="eu-central-1"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=========================================="
echo "  SYMPHONI.A - Installation Monitoring   "
echo "=========================================="
echo -e "${NC}\n"

# Fonction pour afficher les étapes
step() {
    echo -e "\n${BLUE}>>> $1${NC}\n"
}

# Fonction pour afficher les succès
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Fonction pour afficher les warnings
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Fonction pour afficher les erreurs
error() {
    echo -e "${RED}✗ $1${NC}"
}

# Vérifier les prérequis
step "Vérification des prérequis"

if ! command -v aws &> /dev/null; then
    error "AWS CLI n'est pas installé"
    echo "Installez AWS CLI: https://aws.amazon.com/cli/"
    exit 1
fi
success "AWS CLI installé"

# Vérifier la configuration AWS
if ! aws sts get-caller-identity &> /dev/null; then
    error "AWS CLI n'est pas configuré"
    echo "Configurez AWS CLI: aws configure"
    exit 1
fi
success "AWS CLI configuré"

# Afficher l'identité AWS
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_USER=$(aws sts get-caller-identity --query Arn --output text)
echo "Compte AWS: $AWS_ACCOUNT"
echo "Utilisateur: $AWS_USER"

# Demander confirmation
echo -e "\n${YELLOW}Cette opération va créer:${NC}"
echo "  - 42 alarmes CloudWatch"
echo "  - 1 dashboard CloudWatch"
echo "  - Configuration des logs pour 6 services"
echo ""
read -p "Voulez-vous continuer? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation annulée"
    exit 0
fi

# Étape 1: Créer les alarmes
step "Étape 1/3: Création des alarmes CloudWatch"

if [ -f "${SCRIPT_DIR}/create-alarms.sh" ]; then
    chmod +x "${SCRIPT_DIR}/create-alarms.sh"
    "${SCRIPT_DIR}/create-alarms.sh"
    success "Alarmes créées"
else
    error "Fichier create-alarms.sh introuvable"
    exit 1
fi

# Étape 2: Créer le dashboard
step "Étape 2/3: Création du dashboard CloudWatch"

if [ -f "${SCRIPT_DIR}/create-dashboard.sh" ]; then
    chmod +x "${SCRIPT_DIR}/create-dashboard.sh"
    "${SCRIPT_DIR}/create-dashboard.sh"
    success "Dashboard créé"
else
    error "Fichier create-dashboard.sh introuvable"
    exit 1
fi

# Étape 3: Configurer les logs
step "Étape 3/3: Configuration des logs CloudWatch"

echo -e "${YELLOW}⚠ Cette étape peut prendre 3-5 minutes${NC}\n"

if [ -f "${SCRIPT_DIR}/configure-logs.sh" ]; then
    chmod +x "${SCRIPT_DIR}/configure-logs.sh"
    "${SCRIPT_DIR}/configure-logs.sh"
    success "Logs configurés"
else
    error "Fichier configure-logs.sh introuvable"
    exit 1
fi

# Vérification finale
step "Vérification de l'installation"

# Compter les alarmes créées
ALARM_COUNT=$(aws cloudwatch describe-alarms --region ${REGION} --query "MetricAlarms[?starts_with(AlarmName, 'TMS-Sync') || starts_with(AlarmName, 'Affret-IA') || starts_with(AlarmName, 'Orders') || starts_with(AlarmName, 'Subscriptions') || starts_with(AlarmName, 'Auth') || starts_with(AlarmName, 'Billing') || starts_with(AlarmName, 'Frontend') || starts_with(AlarmName, 'SES')].AlarmName" --output text | wc -w)

echo "Alarmes créées: $ALARM_COUNT / 42"
if [ "$ALARM_COUNT" -ge 40 ]; then
    success "Toutes les alarmes ont été créées"
else
    warning "Certaines alarmes n'ont peut-être pas été créées"
fi

# Vérifier le dashboard
if aws cloudwatch get-dashboard --dashboard-name SYMPHONIA-Production --region ${REGION} &> /dev/null; then
    success "Dashboard créé"
else
    warning "Dashboard non trouvé"
fi

# Récapitulatif
echo -e "\n${GREEN}"
echo "=========================================="
echo "  Installation terminée avec succès!     "
echo "=========================================="
echo -e "${NC}\n"

echo -e "${BLUE}Prochaines étapes:${NC}\n"

echo "1. Consultez le dashboard:"
echo "   https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=SYMPHONIA-Production"
echo ""

echo "2. Vérifiez les alarmes:"
echo "   aws cloudwatch describe-alarms --region ${REGION}"
echo ""

echo "3. Intégrez les métriques personnalisées:"
echo "   - TMS Sync: Voir examples/tms-sync-integration.js"
echo "   - Affret.IA: Voir examples/affret-ia-integration.js"
echo ""

echo "4. Configurez les notifications SNS (optionnel):"
echo "   aws sns create-topic --name symphonia-alerts --region ${REGION}"
echo ""

echo "5. Consultez la documentation:"
echo "   ${SCRIPT_DIR}/README.md"
echo "   ${SCRIPT_DIR}/RAPPORT-MONITORING-SYMPHONIA.md"
echo ""

echo -e "${GREEN}Monitoring SYMPHONI.A opérationnel! ✓${NC}\n"
