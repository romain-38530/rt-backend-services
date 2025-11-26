#!/bin/bash
################################################################################
# RT SYMPHONI.A - Deploy Monitoring Stack
################################################################################
# Version: 1.0.0
# Description: Deploy CloudWatch monitoring infrastructure
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="rt-symphonia-subscriptions-contracts-monitoring"
TEMPLATE_FILE="cloudformation/monitoring-stack.yml"
REGION="${AWS_REGION:-eu-west-3}"
ENVIRONMENT="${ENVIRONMENT:-production}"
EB_ENV_NAME="${EB_ENV_NAME:-subscriptions-contracts-eb-prod}"

# Email addresses for alerts
EMAIL_CRITICAL="${EMAIL_CRITICAL:-alerts-critical@rt-symphonia.com}"
EMAIL_WARNING="${EMAIL_WARNING:-alerts-warning@rt-symphonia.com}"

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}RT SYMPHONI.A - Deploying Monitoring Stack${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "Stack Name: ${YELLOW}${STACK_NAME}${NC}"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo -e "EB Environment: ${YELLOW}${EB_ENV_NAME}${NC}"
echo ""

# Validate CloudFormation template
echo -e "${YELLOW}[1/4] Validating CloudFormation template...${NC}"
aws cloudformation validate-template \
  --template-body file://${TEMPLATE_FILE} \
  --region ${REGION} > /dev/null

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Template is valid${NC}"
else
  echo -e "${RED}✗ Template validation failed${NC}"
  exit 1
fi

# Check if stack exists
echo -e "${YELLOW}[2/4] Checking if stack exists...${NC}"
STACK_EXISTS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} 2>&1 || true)

if echo "${STACK_EXISTS}" | grep -q "does not exist"; then
  echo -e "${YELLOW}Stack does not exist. Creating new stack...${NC}"
  STACK_OPERATION="create-stack"
else
  echo -e "${YELLOW}Stack exists. Updating stack...${NC}"
  STACK_OPERATION="update-stack"
fi

# Deploy stack
echo -e "${YELLOW}[3/4] Deploying CloudFormation stack...${NC}"

if [ "${STACK_OPERATION}" = "create-stack" ]; then
  aws cloudformation create-stack \
    --stack-name ${STACK_NAME} \
    --template-body file://${TEMPLATE_FILE} \
    --parameters \
      ParameterKey=EnvironmentName,ParameterValue=${ENVIRONMENT} \
      ParameterKey=EmailAlertCritical,ParameterValue=${EMAIL_CRITICAL} \
      ParameterKey=EmailAlertWarning,ParameterValue=${EMAIL_WARNING} \
      ParameterKey=ElasticBeanstalkEnvironmentName,ParameterValue=${EB_ENV_NAME} \
    --capabilities CAPABILITY_IAM \
    --region ${REGION} \
    --tags \
      Key=Environment,Value=${ENVIRONMENT} \
      Key=Application,Value=subscriptions-contracts \
      Key=ManagedBy,Value=CloudFormation

  echo -e "${YELLOW}Waiting for stack creation to complete...${NC}"
  aws cloudformation wait stack-create-complete \
    --stack-name ${STACK_NAME} \
    --region ${REGION}

  echo -e "${GREEN}✓ Stack created successfully${NC}"
else
  # Try to update the stack
  UPDATE_OUTPUT=$(aws cloudformation update-stack \
    --stack-name ${STACK_NAME} \
    --template-body file://${TEMPLATE_FILE} \
    --parameters \
      ParameterKey=EnvironmentName,ParameterValue=${ENVIRONMENT} \
      ParameterKey=EmailAlertCritical,ParameterValue=${EMAIL_CRITICAL} \
      ParameterKey=EmailAlertWarning,ParameterValue=${EMAIL_WARNING} \
      ParameterKey=ElasticBeanstalkEnvironmentName,ParameterValue=${EB_ENV_NAME} \
    --capabilities CAPABILITY_IAM \
    --region ${REGION} 2>&1 || true)

  if echo "${UPDATE_OUTPUT}" | grep -q "No updates are to be performed"; then
    echo -e "${YELLOW}No updates needed - stack is up to date${NC}"
  else
    echo -e "${YELLOW}Waiting for stack update to complete...${NC}"
    aws cloudformation wait stack-update-complete \
      --stack-name ${STACK_NAME} \
      --region ${REGION}

    echo -e "${GREEN}✓ Stack updated successfully${NC}"
  fi
fi

# Get stack outputs
echo -e "${YELLOW}[4/4] Retrieving stack outputs...${NC}"
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs' \
  --output table)

echo ""
echo -e "${GREEN}Stack Outputs:${NC}"
echo "${STACK_OUTPUTS}"

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Monitoring Stack Deployed Successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Confirm SNS email subscriptions for alerts"
echo -e "2. Create CloudWatch Dashboards: ./scripts/create-dashboards.sh"
echo -e "3. Test alerting: ./scripts/test-alerting.sh"
echo ""
echo -e "${YELLOW}Important Notes:${NC}"
echo -e "- Check your email (${EMAIL_CRITICAL} and ${EMAIL_WARNING}) for SNS subscription confirmations"
echo -e "- Dashboards will be available in CloudWatch console after creation"
echo -e "- Alarms will start monitoring immediately"
echo ""
