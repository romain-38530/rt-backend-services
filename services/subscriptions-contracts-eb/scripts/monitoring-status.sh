#!/bin/bash
################################################################################
# RT SYMPHONI.A - Monitoring Status Report
################################################################################
# Version: 1.0.0
# Description: Genere un rapport de statut complet du monitoring
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="rt-symphonia-monitoring-stack"
REGION="${AWS_REGION:-eu-central-1}"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}RT SYMPHONI.A - Monitoring Status Report${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "Region: ${REGION}"
echo ""

# ============================================================================
# 1. CloudFormation Stack Status
# ============================================================================
echo -e "${YELLOW}[1/6] CloudFormation Stack Status${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" == "CREATE_COMPLETE" ] || [ "$STACK_STATUS" == "UPDATE_COMPLETE" ]; then
  echo -e "Stack Status: ${GREEN}✓ ${STACK_STATUS}${NC}"

  STACK_ID=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].StackId' \
    --output text)
  echo -e "Stack ID: ${STACK_ID}"

  CREATION_TIME=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'Stacks[0].CreationTime' \
    --output text)
  echo -e "Created: ${CREATION_TIME}"

  RESOURCE_COUNT=$(aws cloudformation describe-stack-resources \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --query 'length(StackResources)' \
    --output text)
  echo -e "Resources: ${RESOURCE_COUNT}"
else
  echo -e "Stack Status: ${RED}✗ ${STACK_STATUS}${NC}"
fi

echo ""

# ============================================================================
# 2. SNS Topics and Subscriptions
# ============================================================================
echo -e "${YELLOW}[2/6] SNS Topics and Subscriptions${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

# Critical Alerts Topic
CRITICAL_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CriticalAlertsTopicArn`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$CRITICAL_TOPIC_ARN" ]; then
  echo -e "${GREEN}✓ Critical Alerts Topic${NC}"
  echo -e "  ARN: ${CRITICAL_TOPIC_ARN}"

  CRITICAL_SUBS=$(aws sns list-subscriptions-by-topic \
    --topic-arn ${CRITICAL_TOPIC_ARN} \
    --region ${REGION} \
    --query 'Subscriptions[*].[Endpoint,SubscriptionArn]' \
    --output text)

  if [ -n "$CRITICAL_SUBS" ]; then
    while IFS=$'\t' read -r endpoint sub_arn; do
      if [[ "$sub_arn" == "PendingConfirmation" ]]; then
        echo -e "  Subscription: ${endpoint} ${YELLOW}(Pending Confirmation)${NC}"
      else
        echo -e "  Subscription: ${endpoint} ${GREEN}(Confirmed)${NC}"
      fi
    done <<< "$CRITICAL_SUBS"
  else
    echo -e "  ${YELLOW}⚠ No subscriptions${NC}"
  fi
else
  echo -e "${RED}✗ Critical Alerts Topic not found${NC}"
fi

echo ""

# Warning Alerts Topic
WARNING_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`WarningAlertsTopicArn`].OutputValue' \
  --output text 2>/dev/null || echo "")

if [ -n "$WARNING_TOPIC_ARN" ]; then
  echo -e "${GREEN}✓ Warning Alerts Topic${NC}"
  echo -e "  ARN: ${WARNING_TOPIC_ARN}"

  WARNING_SUBS=$(aws sns list-subscriptions-by-topic \
    --topic-arn ${WARNING_TOPIC_ARN} \
    --region ${REGION} \
    --query 'Subscriptions[*].[Endpoint,SubscriptionArn]' \
    --output text)

  if [ -n "$WARNING_SUBS" ]; then
    while IFS=$'\t' read -r endpoint sub_arn; do
      if [[ "$sub_arn" == "PendingConfirmation" ]]; then
        echo -e "  Subscription: ${endpoint} ${YELLOW}(Pending Confirmation)${NC}"
      else
        echo -e "  Subscription: ${endpoint} ${GREEN}(Confirmed)${NC}"
      fi
    done <<< "$WARNING_SUBS"
  else
    echo -e "  ${YELLOW}⚠ No subscriptions${NC}"
  fi
else
  echo -e "${RED}✗ Warning Alerts Topic not found${NC}"
fi

echo ""

# ============================================================================
# 3. CloudWatch Alarms
# ============================================================================
echo -e "${YELLOW}[3/6] CloudWatch Alarms${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

ALARMS=$(aws cloudwatch describe-alarms \
  --region ${REGION} \
  --query "MetricAlarms[?starts_with(AlarmName, 'production-subscriptions-contracts')].{Name:AlarmName,State:StateValue}" \
  --output text 2>/dev/null)

if [ -n "$ALARMS" ]; then
  ALARM_COUNT=$(echo "$ALARMS" | wc -l)
  OK_COUNT=$(echo "$ALARMS" | grep -c "OK" || echo "0")
  ALARM_COUNT_ACTIVE=$(echo "$ALARMS" | grep -c "ALARM" || echo "0")
  INSUFFICIENT_COUNT=$(echo "$ALARMS" | grep -c "INSUFFICIENT_DATA" || echo "0")

  echo -e "Total Alarms: ${ALARM_COUNT}"
  echo -e "  ${GREEN}✓ OK: ${OK_COUNT}${NC}"
  echo -e "  ${RED}✗ ALARM: ${ALARM_COUNT_ACTIVE}${NC}"
  echo -e "  ${YELLOW}⚠ INSUFFICIENT_DATA: ${INSUFFICIENT_COUNT}${NC}"

  echo ""
  echo -e "Alarm Details:"
  while IFS=$'\t' read -r name state; do
    if [ "$state" == "OK" ]; then
      echo -e "  ${GREEN}✓${NC} ${name}: ${state}"
    elif [ "$state" == "ALARM" ]; then
      echo -e "  ${RED}✗${NC} ${name}: ${state}"
    else
      echo -e "  ${YELLOW}⚠${NC} ${name}: ${state}"
    fi
  done <<< "$ALARMS"
else
  echo -e "${RED}✗ No alarms found${NC}"
fi

echo ""

# ============================================================================
# 4. CloudWatch Dashboards
# ============================================================================
echo -e "${YELLOW}[4/6] CloudWatch Dashboards${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

DASHBOARDS=(
  "RT-SYMPHONIA-production-infrastructure"
  "RT-SYMPHONIA-production-application"
  "RT-SYMPHONIA-production-business"
)

DASHBOARD_COUNT=0
for DASHBOARD_NAME in "${DASHBOARDS[@]}"; do
  DASHBOARD_EXISTS=$(aws cloudwatch get-dashboard \
    --dashboard-name "${DASHBOARD_NAME}" \
    --region ${REGION} 2>/dev/null && echo "yes" || echo "no")

  if [ "$DASHBOARD_EXISTS" == "yes" ]; then
    echo -e "${GREEN}✓${NC} ${DASHBOARD_NAME}"
    DASHBOARD_COUNT=$((DASHBOARD_COUNT + 1))
  else
    echo -e "${RED}✗${NC} ${DASHBOARD_NAME}"
  fi
done

echo ""
echo -e "Dashboards Created: ${DASHBOARD_COUNT}/${#DASHBOARDS[@]}"

# Dashboard URLs
if [ $DASHBOARD_COUNT -gt 0 ]; then
  echo ""
  echo -e "Dashboard URLs:"
  for DASHBOARD_NAME in "${DASHBOARDS[@]}"; do
    DASHBOARD_EXISTS=$(aws cloudwatch get-dashboard \
      --dashboard-name "${DASHBOARD_NAME}" \
      --region ${REGION} 2>/dev/null && echo "yes" || echo "no")

    if [ "$DASHBOARD_EXISTS" == "yes" ]; then
      URL="https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#dashboards:name=${DASHBOARD_NAME}"
      echo -e "  ${URL}"
    fi
  done
fi

echo ""

# ============================================================================
# 5. CloudWatch Log Groups
# ============================================================================
echo -e "${YELLOW}[5/6] CloudWatch Log Groups${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

LOG_GROUPS=(
  "/aws/elasticbeanstalk/rt-subscriptions-api-prod/application"
  "/aws/elasticbeanstalk/rt-subscriptions-api-prod/access"
  "/aws/elasticbeanstalk/rt-subscriptions-api-prod/errors"
)

for LOG_GROUP in "${LOG_GROUPS[@]}"; do
  LOG_GROUP_EXISTS=$(aws logs describe-log-groups \
    --log-group-name-prefix "${LOG_GROUP}" \
    --region ${REGION} \
    --query 'logGroups[0].logGroupName' \
    --output text 2>/dev/null || echo "")

  if [ -n "$LOG_GROUP_EXISTS" ]; then
    # Get retention days
    RETENTION=$(aws logs describe-log-groups \
      --log-group-name "${LOG_GROUP}" \
      --region ${REGION} \
      --query 'logGroups[0].retentionInDays' \
      --output text 2>/dev/null || echo "Never Expire")

    # Get stored bytes
    STORED_BYTES=$(aws logs describe-log-groups \
      --log-group-name "${LOG_GROUP}" \
      --region ${REGION} \
      --query 'logGroups[0].storedBytes' \
      --output text 2>/dev/null || echo "0")

    STORED_MB=$((STORED_BYTES / 1024 / 1024))

    echo -e "${GREEN}✓${NC} ${LOG_GROUP}"
    echo -e "  Retention: ${RETENTION} days"
    echo -e "  Stored: ${STORED_MB} MB"
  else
    echo -e "${RED}✗${NC} ${LOG_GROUP}"
  fi
done

echo ""

# ============================================================================
# 6. Summary and Recommendations
# ============================================================================
echo -e "${YELLOW}[6/6] Summary and Recommendations${NC}"
echo -e "─────────────────────────────────────────────────────────────────────────"

# Calculate overall health
ISSUES=0

if [ "$STACK_STATUS" != "CREATE_COMPLETE" ] && [ "$STACK_STATUS" != "UPDATE_COMPLETE" ]; then
  ISSUES=$((ISSUES + 1))
fi

if [ -z "$CRITICAL_TOPIC_ARN" ] || [ -z "$WARNING_TOPIC_ARN" ]; then
  ISSUES=$((ISSUES + 1))
fi

if [ $DASHBOARD_COUNT -lt 3 ]; then
  ISSUES=$((ISSUES + 1))
fi

if [ "$ALARM_COUNT_ACTIVE" -gt 0 ]; then
  ISSUES=$((ISSUES + 1))
fi

echo -e "Overall Health:"
if [ $ISSUES -eq 0 ]; then
  echo -e "  ${GREEN}✓ All systems operational${NC}"
else
  echo -e "  ${YELLOW}⚠ ${ISSUES} issue(s) detected${NC}"
fi

echo ""
echo -e "Recommendations:"

# Check for pending confirmations
if echo "$CRITICAL_SUBS" | grep -q "PendingConfirmation" || echo "$WARNING_SUBS" | grep -q "PendingConfirmation"; then
  echo -e "  ${YELLOW}→${NC} Confirm SNS email subscriptions"
fi

# Check for alarms in ALARM state
if [ "$ALARM_COUNT_ACTIVE" -gt 0 ]; then
  echo -e "  ${RED}→${NC} Investigate alarms in ALARM state"
fi

# Check for insufficient data
if [ "$INSUFFICIENT_COUNT" -gt 0 ]; then
  echo -e "  ${YELLOW}→${NC} Verify application is sending metrics"
fi

# Check for missing dashboards
if [ $DASHBOARD_COUNT -lt 3 ]; then
  echo -e "  ${YELLOW}→${NC} Create missing dashboards"
fi

if [ $ISSUES -eq 0 ]; then
  echo -e "  ${GREEN}→${NC} No action required, monitoring is fully operational"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}End of Monitoring Status Report${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
