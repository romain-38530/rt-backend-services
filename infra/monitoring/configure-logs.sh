#!/bin/bash

# Script de configuration des logs CloudWatch pour SYMPHONI.A
REGION="eu-central-1"

# Couleurs pour l'affichage
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Configuration des logs CloudWatch pour SYMPHONI.A ===${NC}\n"

# Liste des environnements Elastic Beanstalk
declare -a ENVIRONMENTS=(
    "rt-tms-sync-api-v2"
    "rt-affret-ia-api-prod"
    "rt-orders-api-prod-v2"
    "rt-subscriptions-api-prod-v5"
    "rt-authz-api-prod"
    "rt-billing-api-prod"
)

# Fonction pour activer les logs sur un environnement
enable_logs() {
    local env_name=$1

    echo -e "${YELLOW}Configuration des logs pour: ${env_name}${NC}"

    # Activer le streaming des logs vers CloudWatch
    aws elasticbeanstalk update-environment \
        --environment-name "${env_name}" \
        --region ${REGION} \
        --option-settings \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=StreamLogs,Value=true \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=DeleteOnTerminate,Value=false \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=RetentionInDays,Value=7 \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=HealthStreamingEnabled,Value=true \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=DeleteOnTerminate,Value=false \
            Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=RetentionInDays,Value=7

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Logs activés pour: ${env_name}${NC}\n"
    else
        echo -e "${RED}✗ Échec activation logs pour: ${env_name}${NC}\n"
    fi
}

# Activer les logs pour tous les environnements
for env_name in "${ENVIRONMENTS[@]}"; do
    enable_logs "${env_name}"

    # Attendre un peu entre chaque configuration pour éviter les limites d'API
    sleep 5
done

echo -e "\n${GREEN}=== Configuration des logs terminée ===${NC}\n"

echo -e "${YELLOW}Pour vérifier les logs d'un environnement:${NC}"
echo "aws logs describe-log-groups --region ${REGION} | grep elasticbeanstalk"
echo ""
echo -e "${YELLOW}Pour consulter les logs en temps réel:${NC}"
echo "aws logs tail /aws/elasticbeanstalk/<env-name>/var/log/nodejs/nodejs.log --follow --region ${REGION}"
echo ""
echo -e "${YELLOW}Groupes de logs créés:${NC}"
for env_name in "${ENVIRONMENTS[@]}"; do
    echo "  - /aws/elasticbeanstalk/${env_name}/var/log/nodejs/nodejs.log"
    echo "  - /aws/elasticbeanstalk/${env_name}/var/log/eb-engine.log"
    echo "  - /aws/elasticbeanstalk/${env_name}/var/log/eb-health.log"
done
