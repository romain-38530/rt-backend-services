#!/bin/bash
################################################################################
# RT SYMPHONI.A - Generate Monitoring Report
################################################################################
# Version: 1.0.0
# Description: Generate a comprehensive monitoring status report
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION="${AWS_REGION:-eu-west-3}"
ENVIRONMENT="${ENVIRONMENT:-production}"
NAMESPACE="RT/SYMPHONIA/SubscriptionsContracts"
STACK_NAME="rt-symphonia-subscriptions-contracts-monitoring"

# Time range (last 24 hours)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
START_TIME=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}RT SYMPHONI.A - Monitoring Report${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "Generated: $(date)"
echo -e "Environment: ${YELLOW}${ENVIRONMENT}${NC}"
echo -e "Region: ${YELLOW}${REGION}${NC}"
echo -e "Time Range: ${START_TIME} to ${END_TIME}"
echo ""

# ============================================================================
# CLOUDFORMATION STACK STATUS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}1. CloudFormation Stack Status${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>&1 || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$STACK_STATUS" = "UPDATE_COMPLETE" ]; then
  echo -e "${GREEN}✓ Stack Status: ${STACK_STATUS}${NC}"
else
  echo -e "${RED}✗ Stack Status: ${STACK_STATUS}${NC}"
fi

echo ""

# ============================================================================
# ALARMS STATUS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}2. CloudWatch Alarms Status${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Get alarms in ALARM state
ALARMS_IN_ALARM=$(aws cloudwatch describe-alarms \
  --state-value ALARM \
  --region ${REGION} \
  --query 'MetricAlarms[*].[AlarmName,StateReason]' \
  --output text)

if [ -z "$ALARMS_IN_ALARM" ]; then
  echo -e "${GREEN}✓ No alarms in ALARM state${NC}"
else
  echo -e "${RED}⚠ Alarms in ALARM state:${NC}"
  echo "$ALARMS_IN_ALARM"
fi

echo ""

# Count alarms by state
echo "Alarms Summary:"
aws cloudwatch describe-alarms \
  --region ${REGION} \
  --query 'MetricAlarms[*].StateValue' \
  --output text | tr '\t' '\n' | sort | uniq -c

echo ""

# ============================================================================
# DASHBOARDS STATUS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}3. CloudWatch Dashboards${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

DASHBOARD_PREFIX="RT-SYMPHONIA-${ENVIRONMENT}"

DASHBOARDS=$(aws cloudwatch list-dashboards \
  --region ${REGION} \
  --query "DashboardEntries[?starts_with(DashboardName, '${DASHBOARD_PREFIX}')].DashboardName" \
  --output text)

if [ -n "$DASHBOARDS" ]; then
  echo -e "${GREEN}✓ Dashboards found:${NC}"
  for DASHBOARD in $DASHBOARDS; do
    echo "  - $DASHBOARD"
  done
else
  echo -e "${RED}✗ No dashboards found${NC}"
fi

echo ""

# ============================================================================
# METRICS SUMMARY (Last 24h)
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}4. Metrics Summary (Last 24 hours)${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Function to get metric value
get_metric() {
  local METRIC_NAME=$1
  local STAT=$2

  aws cloudwatch get-metric-statistics \
    --namespace ${NAMESPACE} \
    --metric-name ${METRIC_NAME} \
    --start-time ${START_TIME} \
    --end-time ${END_TIME} \
    --period 86400 \
    --statistics ${STAT} \
    --region ${REGION} \
    --query "Datapoints[0].${STAT}" \
    --output text 2>/dev/null || echo "N/A"
}

echo "API Metrics:"
API_REQUESTS=$(get_metric "APIRequests" "Sum")
ERROR_RATE=$(get_metric "ErrorRate" "Average")
RESPONSE_TIME=$(get_metric "ResponseTime" "Average")

echo "  - Total API Requests: ${API_REQUESTS}"
echo "  - Average Error Rate: ${ERROR_RATE}%"
echo "  - Average Response Time: ${RESPONSE_TIME}ms"
echo ""

echo "Business Metrics:"
ORDERS_CREATED=$(get_metric "TransportOrdersCreated" "Sum")
DELIVERIES=$(get_metric "DeliveryCompleted" "Sum")
DELAY_RATE=$(get_metric "DeliveryDelayRate" "Average")

echo "  - Transport Orders Created: ${ORDERS_CREATED}"
echo "  - Deliveries Completed: ${DELIVERIES}"
echo "  - Delivery Delay Rate: ${DELAY_RATE}%"
echo ""

echo "System Health:"
MONGODB_HEALTHY=$(get_metric "MongoDBHealthy" "Average")
MONGODB_FAILURES=$(get_metric "MongoDBConnectionFailures" "Sum")

echo "  - MongoDB Health: ${MONGODB_HEALTHY} (1=healthy, 0=unhealthy)"
echo "  - MongoDB Failures: ${MONGODB_FAILURES}"
echo ""

# ============================================================================
# SNS SUBSCRIPTIONS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}5. SNS Subscriptions${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Get SNS topic ARNs
CRITICAL_TOPIC=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CriticalAlertsTopicArn`].OutputValue' \
  --output text 2>/dev/null || echo "")

WARNING_TOPIC=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`WarningAlertsTopicArn`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$CRITICAL_TOPIC" ]; then
  echo "Critical Alerts Topic:"
  CRITICAL_SUBS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${CRITICAL_TOPIC}" \
    --region ${REGION} \
    --query 'Subscriptions[*].[Protocol,Endpoint,SubscriptionArn]' \
    --output table)
  echo "$CRITICAL_SUBS"
  echo ""
fi

if [ -n "$WARNING_TOPIC" ]; then
  echo "Warning Alerts Topic:"
  WARNING_SUBS=$(aws sns list-subscriptions-by-topic \
    --topic-arn "${WARNING_TOPIC}" \
    --region ${REGION} \
    --query 'Subscriptions[*].[Protocol,Endpoint,SubscriptionArn]' \
    --output table)
  echo "$WARNING_SUBS"
  echo ""
fi

# ============================================================================
# LOG GROUPS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}6. CloudWatch Log Groups${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

LOG_GROUPS=$(aws logs describe-log-groups \
  --log-group-name-prefix "/aws/elasticbeanstalk/subscriptions-contracts-eb" \
  --region ${REGION} \
  --query 'logGroups[*].[logGroupName,storedBytes,retentionInDays]' \
  --output table 2>/dev/null || echo "No log groups found")

echo "$LOG_GROUPS"
echo ""

# ============================================================================
# RECENT ERRORS (Last 1 hour)
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}7. Recent Errors (Last 1 hour)${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# This would require CloudWatch Logs Insights query - simplified version
echo "To view recent errors, run:"
echo ""
echo "  aws logs start-query \\"
echo "    --log-group-name /aws/elasticbeanstalk/subscriptions-contracts-eb/application \\"
echo "    --start-time \$(date -d '1 hour ago' +%s) \\"
echo "    --end-time \$(date +%s) \\"
echo "    --query-string 'fields @timestamp, level, @message | filter level = \"ERROR\" | sort @timestamp desc | limit 20' \\"
echo "    --region ${REGION}"
echo ""

# ============================================================================
# HEALTH STATUS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}8. Application Health Check${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Try to get health from API (if accessible)
# This assumes the API is publicly accessible
# Adjust URL as needed
echo "Note: To check application health, run:"
echo "  curl https://your-api-domain.com/health/detailed | jq"
echo ""

# ============================================================================
# RECOMMENDATIONS
# ============================================================================

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}9. Recommendations${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

RECOMMENDATIONS=()

# Check if alarms exist
if [ -z "$ALARMS_IN_ALARM" ]; then
  RECOMMENDATIONS+=("${GREEN}✓ All systems operational${NC}")
else
  RECOMMENDATIONS+=("${RED}⚠ Investigate alarms in ALARM state${NC}")
fi

# Check error rate
if [ "$ERROR_RATE" != "N/A" ]; then
  ERROR_RATE_INT=${ERROR_RATE%.*}
  if [ "$ERROR_RATE_INT" -gt 5 ]; then
    RECOMMENDATIONS+=("${RED}⚠ Error rate is high (${ERROR_RATE}%). Investigate errors.${NC}")
  fi
fi

# Check delivery delay rate
if [ "$DELAY_RATE" != "N/A" ]; then
  DELAY_RATE_INT=${DELAY_RATE%.*}
  if [ "$DELAY_RATE_INT" -gt 20 ]; then
    RECOMMENDATIONS+=("${YELLOW}⚠ Delivery delay rate is high (${DELAY_RATE}%). Contact carriers.${NC}")
  fi
fi

# Output recommendations
if [ ${#RECOMMENDATIONS[@]} -eq 0 ]; then
  echo -e "${GREEN}No recommendations at this time.${NC}"
else
  for REC in "${RECOMMENDATIONS[@]}"; do
    echo -e "  - $REC"
  done
fi

echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}Report Complete${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo "For more details:"
echo "  - View dashboards: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:"
echo "  - View alarms: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#alarmsV2:"
echo "  - View logs: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#logsV2:log-groups"
echo ""
