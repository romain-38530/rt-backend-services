#!/bin/bash
################################################################################
# Quick Deploy Script - Symphonia Platform
# Usage: bash scripts/quick-deploy.sh
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║    SYMPHONIA PLATFORM - QUICK DEPLOY                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check if .env.deploy.local exists
if [ ! -f "$ROOT_DIR/.env.deploy.local" ]; then
    echo "⚠️  Fichier .env.deploy.local non trouvé."
    echo ""
    echo "Création à partir du template..."
    cp "$ROOT_DIR/.env.deploy" "$ROOT_DIR/.env.deploy.local"
    echo ""
    echo "✓ Fichier créé: .env.deploy.local"
    echo ""
    echo "⚠️  IMPORTANT: Vous devez éditer .env.deploy.local avec vos valeurs"
    echo ""
    echo "Variables REQUISES à configurer:"
    echo "  - MONGODB_URI"
    echo "  - ALERT_SMS_NUMBER"
    echo "  - ALERT_EMAIL"
    echo "  - JWT_SECRET"
    echo ""
    read -p "Voulez-vous éditer maintenant? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} "$ROOT_DIR/.env.deploy.local"
    else
        echo "Éditez le fichier manuellement puis relancez ce script."
        exit 1
    fi
fi

# Load environment variables
echo "📋 Chargement de la configuration..."
source "$ROOT_DIR/.env.deploy.local"

# Verify critical variables
if [ -z "$MONGODB_URI" ]; then
    echo "❌ ERREUR: MONGODB_URI non défini dans .env.deploy.local"
    exit 1
fi

echo "✓ Configuration chargée"
echo ""
echo "Configuration:"
echo "  AWS Region: ${AWS_REGION:-eu-west-3}"
echo "  MongoDB: ${MONGODB_URI:0:30}..."
echo "  SMS Alerts: ${ALERT_SMS_NUMBER}"
echo "  Email Alerts: ${ALERT_EMAIL}"
echo ""

# Check packages exist
if [ ! -d "$ROOT_DIR/deploy/packages" ]; then
    echo "⚠️  Packages non trouvés dans deploy/packages/"
    echo ""
    read -p "Voulez-vous créer les packages maintenant? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Création des packages..."
        mkdir -p "$ROOT_DIR/deploy/packages"

        # Create packages using PowerShell (Windows compatible)
        cd "$ROOT_DIR/services/tms-sync-eb"
        powershell -Command "Compress-Archive -Path *.js, *.json, services, connectors, utils -DestinationPath ../../deploy/packages/tms-sync-eb.zip -Force" || true

        cd "$ROOT_DIR/services/authz-eb"
        powershell -Command "Compress-Archive -Path *.js, *.json, routes, scripts -DestinationPath ../../deploy/packages/authz-eb.zip -Force" || true

        cd "$ROOT_DIR/services/affret-ia-api-v2"
        powershell -Command "Compress-Archive -Path *.js, *.json, routes, models -DestinationPath ../../deploy/packages/affret-ia-api-v2.zip -Force" || true

        cd "$ROOT_DIR"
        echo "✓ Packages créés"
    else
        echo "Créez les packages manuellement puis relancez ce script."
        exit 1
    fi
fi

# Confirm deployment
echo "═══════════════════════════════════════════════════════"
echo ""
echo "Prêt à déployer les 3 services sur AWS:"
echo "  1. TMS Sync EB"
echo "  2. Authz EB"
echo "  3. Affret IA API v2"
echo ""
echo "Ce déploiement va:"
echo "  • Configurer AWS SES (email)"
echo "  • Configurer AWS SNS (SMS)"
echo "  • Créer un bucket S3"
echo "  • Uploader les packages"
echo "  • Créer/mettre à jour les applications EB"
echo "  • Configurer MongoDB"
echo ""
read -p "Continuer? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Déploiement annulé."
    exit 0
fi

# Run deployment
echo ""
echo "🚀 Lancement du déploiement..."
echo ""

bash "$SCRIPT_DIR/deploy-aws.sh"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           DÉPLOIEMENT TERMINÉ                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Consultez les URLs de vos services dans:"
echo "  deploy/deployment-summary-*.txt"
echo ""
