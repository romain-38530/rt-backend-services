#!/bin/bash
################################################################################
# RT SYMPHONI.A - Rollback Monitoring
################################################################################
# Version: 1.0.0
# Description: Rollback complet de l'infrastructure de monitoring
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="rt-symphonia-monitoring-stack"
REGION="${AWS_REGION:-eu-central-1}"

echo -e "${RED}============================================================================${NC}"
echo -e "${RED}RT SYMPHONI.A - Rollback Monitoring${NC}"
echo -e "${RED}============================================================================${NC}"
echo ""
echo -e "${YELLOW}ATTENTION: Cette operation va supprimer:${NC}"
echo -e "  - Stack CloudFormation: ${RED}$STACK_NAME${NC}"
echo -e "  - Tous les dashboards CloudWatch"
echo -e "  - Tous les topics SNS"
echo -e "  - Toutes les alarmes CloudWatch"
echo -e "  - Tous les log groups ${RED}(PERTE DE DONNEES)${NC}"
echo ""
read -p "Etes-vous sur de vouloir continuer? (tapez 'ROLLBACK' pour confirmer): " CONFIRM

if [ "$CONFIRM" != "ROLLBACK" ]; then
  echo -e "${GREEN}Rollback annule.${NC}"
  exit 0
fi

echo ""
echo -e "${YELLOW}[1/4] Verification de la stack CloudFormation...${NC}"
STACK_EXISTS=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION 2>&1 || true)

if echo "$STACK_EXISTS" | grep -q "does not exist"; then
  echo -e "${YELLOW}Stack n'existe pas. Passage a la suppression des dashboards.${NC}"
else
  echo -e "${GREEN}Stack trouvee. Preparation de la suppression.${NC}"
fi

echo ""
echo -e "${YELLOW}[2/4] Suppression des dashboards CloudWatch...${NC}"
DASHBOARDS=(
  "RT-SYMPHONIA-production-infrastructure"
  "RT-SYMPHONIA-production-application"
  "RT-SYMPHONIA-production-business"
)

for DASHBOARD in "${DASHBOARDS[@]}"; do
  echo -e "  Suppression: ${DASHBOARD}"
  aws cloudwatch delete-dashboards \
    --dashboard-names "$DASHBOARD" \
    --region $REGION 2>/dev/null && echo -e "  ${GREEN}✓ Supprime${NC}" || echo -e "  ${YELLOW}⚠ Deja supprime ou inexistant${NC}"
done

echo ""
echo -e "${YELLOW}[3/4] Suppression de la stack CloudFormation...${NC}"
if ! echo "$STACK_EXISTS" | grep -q "does not exist"; then
  aws cloudformation delete-stack \
    --stack-name $STACK_NAME \
    --region $REGION

  echo -e "${GREEN}✓ Commande de suppression envoyee${NC}"

  echo ""
  echo -e "${YELLOW}[4/4] Attente de la suppression complete (cela peut prendre plusieurs minutes)...${NC}"
  aws cloudformation wait stack-delete-complete \
    --stack-name $STACK_NAME \
    --region $REGION && echo -e "${GREEN}✓ Stack supprimee${NC}" || echo -e "${RED}✗ Erreur lors de la suppression${NC}"
else
  echo -e "${YELLOW}Stack deja supprimee. Passage a la verification.${NC}"
fi

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Rollback termine avec succes!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

echo -e "${YELLOW}Verification finale:${NC}"
echo ""

# Verification de la stack
echo -e "1. Stack CloudFormation:"
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION 2>&1 | grep -q "does not exist" && echo -e "   ${GREEN}✓ Stack supprimee${NC}" || echo -e "   ${RED}✗ Stack encore presente${NC}"

# Verification des dashboards
echo -e "2. Dashboards CloudWatch:"
REMAINING_DASHBOARDS=$(aws cloudwatch list-dashboards --region $REGION --query "DashboardEntries[?contains(DashboardName, 'RT-SYMPHONIA-production')].DashboardName" --output text)
if [ -z "$REMAINING_DASHBOARDS" ]; then
  echo -e "   ${GREEN}✓ Tous les dashboards supprimes${NC}"
else
  echo -e "   ${RED}✗ Dashboards restants: $REMAINING_DASHBOARDS${NC}"
fi

# Verification des alarmes
echo -e "3. Alarmes CloudWatch:"
REMAINING_ALARMS=$(aws cloudwatch describe-alarms --region $REGION --query "MetricAlarms[?starts_with(AlarmName, 'production-subscriptions-contracts')].AlarmName" --output text)
if [ -z "$REMAINING_ALARMS" ]; then
  echo -e "   ${GREEN}✓ Toutes les alarmes supprimees${NC}"
else
  echo -e "   ${RED}✗ Alarmes restantes: $REMAINING_ALARMS${NC}"
fi

# Verification des topics SNS
echo -e "4. Topics SNS:"
REMAINING_TOPICS=$(aws sns list-topics --region $REGION --query "Topics[?contains(TopicArn, 'rt-symphonia-production')].TopicArn" --output text)
if [ -z "$REMAINING_TOPICS" ]; then
  echo -e "   ${GREEN}✓ Tous les topics supprimes${NC}"
else
  echo -e "   ${RED}✗ Topics restants: $REMAINING_TOPICS${NC}"
fi

echo ""
echo -e "${YELLOW}Note: Les log groups peuvent encore exister. Pour les supprimer:${NC}"
echo -e "  aws logs delete-log-group --log-group-name '/aws/elasticbeanstalk/rt-subscriptions-api-prod/application' --region $REGION"
echo -e "  aws logs delete-log-group --log-group-name '/aws/elasticbeanstalk/rt-subscriptions-api-prod/access' --region $REGION"
echo -e "  aws logs delete-log-group --log-group-name '/aws/elasticbeanstalk/rt-subscriptions-api-prod/errors' --region $REGION"
echo ""

echo -e "${GREEN}Rollback complete!${NC}"
