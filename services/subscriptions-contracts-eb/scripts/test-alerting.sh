#!/bin/bash
################################################################################
# RT SYMPHONI.A - Test Alerting System
################################################################################
# Version: 1.0.0
# Description: Test CloudWatch alarms and SNS notifications
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
NAMESPACE="RT/SYMPHONIA/SubscriptionsContracts"

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}RT SYMPHONI.A - Testing Alerting System${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

# Function to send test metric
send_test_metric() {
  local METRIC_NAME=$1
  local VALUE=$2
  local UNIT=$3

  echo -e "${YELLOW}Sending test metric: ${METRIC_NAME} = ${VALUE} ${UNIT}${NC}"

  aws cloudwatch put-metric-data \
    --namespace "${NAMESPACE}" \
    --metric-name "${METRIC_NAME}" \
    --value ${VALUE} \
    --unit ${UNIT} \
    --region ${REGION}

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Metric sent successfully${NC}"
  else
    echo -e "${RED}✗ Failed to send metric${NC}"
  fi
}

echo -e "${YELLOW}Test 1: Testing High Error Rate Alarm${NC}"
send_test_metric "ErrorRate" 10 "Percent"
echo ""

echo -e "${YELLOW}Test 2: Testing High Latency Alarm${NC}"
send_test_metric "ResponseTimeP95" 1500 "Milliseconds"
echo ""

echo -e "${YELLOW}Test 3: Testing MongoDB Connection Failure${NC}"
send_test_metric "MongoDBConnectionFailures" 8 "Count"
echo ""

echo -e "${YELLOW}Test 4: Testing Delivery Delay Rate${NC}"
send_test_metric "DeliveryDelayRate" 25 "Percent"
echo ""

echo -e "${YELLOW}Test 5: Testing Low Carrier Score${NC}"
send_test_metric "AverageCarrierScore" 65 "None"
echo ""

echo -e "${YELLOW}Test 6: Testing 5xx Errors${NC}"
for i in {1..12}; do
  send_test_metric "5xxErrors" 1 "Count"
  sleep 1
done
echo ""

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Test Metrics Sent Successfully!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Wait 5-10 minutes for alarms to evaluate metrics"
echo -e "2. Check CloudWatch Alarms console for alarm states"
echo -e "3. Check your email for SNS notifications"
echo ""
echo -e "${YELLOW}Check Alarm Status:${NC}"
echo -e "aws cloudwatch describe-alarms --region ${REGION} --state-value ALARM"
echo ""
echo -e "${YELLOW}Note:${NC}"
echo -e "- Alarms may take several evaluation periods to trigger"
echo -e "- Some alarms require sustained high values to trigger"
echo -e "- Check the specific alarm configuration for thresholds and evaluation periods"
echo ""
