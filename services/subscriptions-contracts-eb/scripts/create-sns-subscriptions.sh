#!/bin/bash
################################################################################
# RT SYMPHONI.A - Create SNS Subscriptions
################################################################################
# Version: 1.0.0
# Description: Create additional SNS subscriptions (Slack, SMS, etc.)
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
STACK_NAME="rt-symphonia-subscriptions-contracts-monitoring"

echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}RT SYMPHONI.A - Create SNS Subscriptions${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""

# Get SNS Topic ARNs from CloudFormation stack
echo -e "${YELLOW}Retrieving SNS Topic ARNs from stack...${NC}"

CRITICAL_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`CriticalAlertsTopicArn`].OutputValue' \
  --output text)

WARNING_TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name ${STACK_NAME} \
  --region ${REGION} \
  --query 'Stacks[0].Outputs[?OutputKey==`WarningAlertsTopicArn`].OutputValue' \
  --output text)

echo -e "${GREEN}Critical Alerts Topic: ${CRITICAL_TOPIC_ARN}${NC}"
echo -e "${GREEN}Warning Alerts Topic: ${WARNING_TOPIC_ARN}${NC}"
echo ""

# Function to create subscription
create_subscription() {
  local TOPIC_ARN=$1
  local PROTOCOL=$2
  local ENDPOINT=$3
  local TOPIC_NAME=$4

  echo -e "${YELLOW}Creating ${PROTOCOL} subscription to ${TOPIC_NAME}...${NC}"

  aws sns subscribe \
    --topic-arn "${TOPIC_ARN}" \
    --protocol "${PROTOCOL}" \
    --notification-endpoint "${ENDPOINT}" \
    --region ${REGION} > /dev/null

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Subscription created${NC}"
    if [ "${PROTOCOL}" = "email" ] || [ "${PROTOCOL}" = "email-json" ]; then
      echo -e "${YELLOW}  → Check ${ENDPOINT} for confirmation email${NC}"
    fi
  else
    echo -e "${RED}✗ Failed to create subscription${NC}"
  fi
}

# Interactive subscription creation
echo -e "${YELLOW}Would you like to add additional email subscriptions? (y/n)${NC}"
read -r ADD_EMAIL

if [ "${ADD_EMAIL}" = "y" ] || [ "${ADD_EMAIL}" = "Y" ]; then
  echo -e "${YELLOW}Enter email address for CRITICAL alerts (or 'skip'):${NC}"
  read -r CRITICAL_EMAIL

  if [ "${CRITICAL_EMAIL}" != "skip" ] && [ -n "${CRITICAL_EMAIL}" ]; then
    create_subscription "${CRITICAL_TOPIC_ARN}" "email" "${CRITICAL_EMAIL}" "Critical Alerts"
  fi

  echo ""
  echo -e "${YELLOW}Enter email address for WARNING alerts (or 'skip'):${NC}"
  read -r WARNING_EMAIL

  if [ "${WARNING_EMAIL}" != "skip" ] && [ -n "${WARNING_EMAIL}" ]; then
    create_subscription "${WARNING_TOPIC_ARN}" "email" "${WARNING_EMAIL}" "Warning Alerts"
  fi
fi

echo ""
echo -e "${YELLOW}Would you like to add SMS subscriptions? (y/n)${NC}"
read -r ADD_SMS

if [ "${ADD_SMS}" = "y" ] || [ "${ADD_SMS}" = "Y" ]; then
  echo -e "${YELLOW}Enter phone number for CRITICAL alerts (format: +33612345678, or 'skip'):${NC}"
  read -r CRITICAL_PHONE

  if [ "${CRITICAL_PHONE}" != "skip" ] && [ -n "${CRITICAL_PHONE}" ]; then
    create_subscription "${CRITICAL_TOPIC_ARN}" "sms" "${CRITICAL_PHONE}" "Critical Alerts"
  fi
fi

echo ""
echo -e "${YELLOW}Would you like to add Slack webhook integration? (y/n)${NC}"
read -r ADD_SLACK

if [ "${ADD_SLACK}" = "y" ] || [ "${ADD_SLACK}" = "Y" ]; then
  echo -e "${YELLOW}Enter Slack webhook URL for CRITICAL alerts (or 'skip'):${NC}"
  read -r CRITICAL_SLACK

  if [ "${CRITICAL_SLACK}" != "skip" ] && [ -n "${CRITICAL_SLACK}" ]; then
    create_subscription "${CRITICAL_TOPIC_ARN}" "https" "${CRITICAL_SLACK}" "Critical Alerts (Slack)"
  fi

  echo ""
  echo -e "${YELLOW}Enter Slack webhook URL for WARNING alerts (or 'skip'):${NC}"
  read -r WARNING_SLACK

  if [ "${WARNING_SLACK}" != "skip" ] && [ -n "${WARNING_SLACK}" ]; then
    create_subscription "${WARNING_TOPIC_ARN}" "https" "${WARNING_SLACK}" "Warning Alerts (Slack)"
  fi
fi

echo ""
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}SNS Subscriptions Configuration Complete!${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${YELLOW}List all subscriptions:${NC}"
echo ""

# List all subscriptions for critical topic
echo -e "${GREEN}Critical Alerts Subscriptions:${NC}"
aws sns list-subscriptions-by-topic \
  --topic-arn "${CRITICAL_TOPIC_ARN}" \
  --region ${REGION} \
  --query 'Subscriptions[*].[Protocol,Endpoint,SubscriptionArn]' \
  --output table

echo ""

# List all subscriptions for warning topic
echo -e "${GREEN}Warning Alerts Subscriptions:${NC}"
aws sns list-subscriptions-by-topic \
  --topic-arn "${WARNING_TOPIC_ARN}" \
  --region ${REGION} \
  --query 'Subscriptions[*].[Protocol,Endpoint,SubscriptionArn]' \
  --output table

echo ""
echo -e "${YELLOW}Important:${NC}"
echo -e "- Email and SMS subscriptions require confirmation"
echo -e "- Check your inbox/phone for confirmation messages"
echo -e "- Slack webhooks are active immediately"
echo ""
