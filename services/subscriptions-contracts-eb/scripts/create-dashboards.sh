#!/bin/bash
################################################################################
# RT SYMPHONI.A - Create CloudWatch Dashboards
################################################################################
# Version: 1.0.0
# Description: Create CloudWatch dashboards for monitoring
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGION="${AWS_REGION:-eu-west-3}"
ENVIRONMENT="${ENVIRONMENT:-production}"
DASHBOARD_PREFIX="RT-SYMPHONIA-${ENVIRONMENT}"

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}RT SYMPHONI.A - Creating CloudWatch Dashboards${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

# Dashboard definitions
DASHBOARDS=(
  "infrastructure:dashboards/infrastructure-dashboard.json"
  "application:dashboards/application-dashboard.json"
  "business:dashboards/business-dashboard.json"
)

TOTAL_DASHBOARDS=${#DASHBOARDS[@]}
CURRENT=0

for DASHBOARD in "${DASHBOARDS[@]}"; do
  CURRENT=$((CURRENT + 1))

  # Split dashboard definition
  DASHBOARD_NAME="${DASHBOARD%%:*}"
  DASHBOARD_FILE="${DASHBOARD##*:}"

  FULL_DASHBOARD_NAME="${DASHBOARD_PREFIX}-${DASHBOARD_NAME}"

  echo -e "${YELLOW}[${CURRENT}/${TOTAL_DASHBOARDS}] Creating dashboard: ${FULL_DASHBOARD_NAME}${NC}"

  # Check if file exists
  if [ ! -f "${DASHBOARD_FILE}" ]; then
    echo -e "${RED}✗ Dashboard file not found: ${DASHBOARD_FILE}${NC}"
    continue
  fi

  # Read dashboard body from file
  DASHBOARD_BODY=$(cat ${DASHBOARD_FILE})

  # Create or update dashboard
  aws cloudwatch put-dashboard \
    --dashboard-name "${FULL_DASHBOARD_NAME}" \
    --dashboard-body "${DASHBOARD_BODY}" \
    --region ${REGION} > /dev/null

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard created: ${FULL_DASHBOARD_NAME}${NC}"
  else
    echo -e "${RED}✗ Failed to create dashboard: ${FULL_DASHBOARD_NAME}${NC}"
  fi
done

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Dashboards Created Successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${YELLOW}Dashboard URLs:${NC}"
echo ""

for DASHBOARD in "${DASHBOARDS[@]}"; do
  DASHBOARD_NAME="${DASHBOARD%%:*}"
  FULL_DASHBOARD_NAME="${DASHBOARD_PREFIX}-${DASHBOARD_NAME}"

  # Generate CloudWatch Console URL
  ENCODED_NAME=$(echo -n "${FULL_DASHBOARD_NAME}" | jq -sRr @uri)
  DASHBOARD_URL="https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${ENCODED_NAME}"

  echo -e "${GREEN}${DASHBOARD_NAME}:${NC}"
  echo -e "  ${DASHBOARD_URL}"
  echo ""
done

echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Open the CloudWatch Console in your browser"
echo -e "2. Navigate to Dashboards section"
echo -e "3. View your newly created dashboards"
echo ""
