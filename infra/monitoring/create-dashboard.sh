#!/bin/bash

# Script de création du dashboard CloudWatch pour SYMPHONI.A
REGION="eu-central-1"
DASHBOARD_NAME="SYMPHONIA-Production"
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "\033[0;32m=== Création du Dashboard CloudWatch SYMPHONI.A ===\033[0m\n"

# Vérifier que le fichier de configuration existe
if [ ! -f "${SCRIPT_DIR}/dashboard-config.json" ]; then
    echo -e "\033[0;31mErreur: Le fichier dashboard-config.json n'existe pas!\033[0m"
    exit 1
fi

echo "Création du dashboard: ${DASHBOARD_NAME}"

# Créer le dashboard
aws cloudwatch put-dashboard \
    --dashboard-name "${DASHBOARD_NAME}" \
    --dashboard-body file://"${SCRIPT_DIR}/dashboard-config.json" \
    --region ${REGION}

if [ $? -eq 0 ]; then
    echo -e "\n\033[0;32m✓ Dashboard créé avec succès!\033[0m\n"
    echo -e "URL du dashboard:"
    echo "https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=${DASHBOARD_NAME}"
    echo ""
    echo -e "\033[1;33mPour voir le dashboard:\033[0m"
    echo "aws cloudwatch get-dashboard --dashboard-name ${DASHBOARD_NAME} --region ${REGION}"
else
    echo -e "\n\033[0;31m✗ Échec de création du dashboard\033[0m\n"
    exit 1
fi
