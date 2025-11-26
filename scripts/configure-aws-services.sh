#!/bin/bash

# ============================================================================
# SYMPHONI.A - Configuration AWS Services
# ============================================================================
# Ce script configure les services externes nécessaires pour SYMPHONI.A:
# - TomTom Telematics API
# - AWS Textract (OCR)
# - Google Vision API (Optionnel)
# - Mailgun
#
# Usage: ./configure-aws-services.sh [environment]
# Environment: development | production (default: production)
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
AWS_REGION="eu-central-1"
EB_APP_NAME="rt-subscriptions-api"
EB_ENV_NAME="rt-subscriptions-api-prod"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}SYMPHONI.A - Configuration AWS Services${NC}"
echo -e "${BLUE}Environment: $ENVIRONMENT${NC}"
echo -e "${BLUE}================================================${NC}\n"

# ============================================================================
# Functions
# ============================================================================

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ AWS CLI found${NC}"
}

check_eb_cli() {
    if ! command -v eb &> /dev/null; then
        echo -e "${YELLOW}⚠️  EB CLI not found (optional)${NC}"
    else
        echo -e "${GREEN}✅ EB CLI found${NC}"
    fi
}

configure_mailgun() {
    echo -e "\n${BLUE}📧 Configuring Mailgun...${NC}"

    read -p "Enter Mailgun API Key (or press Enter to skip): " MAILGUN_API_KEY
    if [ -z "$MAILGUN_API_KEY" ]; then
        echo -e "${YELLOW}⏭️  Skipped Mailgun configuration${NC}"
        return
    fi

    read -p "Enter Mailgun Domain (e.g., mg.yourdomain.com): " MAILGUN_DOMAIN

    aws elasticbeanstalk update-environment \
        --environment-name $EB_ENV_NAME \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=MAILGUN_API_KEY,Value="$MAILGUN_API_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=MAILGUN_DOMAIN,Value="$MAILGUN_DOMAIN" \
        --region $AWS_REGION

    echo -e "${GREEN}✅ Mailgun configured${NC}"
}

configure_tomtom() {
    echo -e "\n${BLUE}🚗 Configuring TomTom Telematics...${NC}"

    read -p "Enter TomTom API Key (or press Enter to skip): " TOMTOM_API_KEY
    if [ -z "$TOMTOM_API_KEY" ]; then
        echo -e "${YELLOW}⏭️  Skipped TomTom configuration${NC}"
        return
    fi

    aws elasticbeanstalk update-environment \
        --environment-name $EB_ENV_NAME \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_KEY,Value="$TOMTOM_API_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_TRACKING_API_URL,Value="https://api.tomtom.com/tracking/1" \
        --region $AWS_REGION

    echo -e "${GREEN}✅ TomTom configured${NC}"
}

configure_textract() {
    echo -e "\n${BLUE}📄 Configuring AWS Textract...${NC}"

    read -p "Enter AWS Access Key ID for Textract (or press Enter to skip): " AWS_ACCESS_KEY
    if [ -z "$AWS_ACCESS_KEY" ]; then
        echo -e "${YELLOW}⏭️  Skipped AWS Textract configuration${NC}"
        return
    fi

    read -sp "Enter AWS Secret Access Key: " AWS_SECRET_KEY
    echo ""

    aws elasticbeanstalk update-environment \
        --environment-name $EB_ENV_NAME \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_ACCESS_KEY_ID,Value="$AWS_ACCESS_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_SECRET_ACCESS_KEY,Value="$AWS_SECRET_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value="$AWS_REGION" \
        --region $AWS_REGION

    echo -e "${GREEN}✅ AWS Textract configured${NC}"
}

configure_google_vision() {
    echo -e "\n${BLUE}🔍 Configuring Google Vision API (Optional)...${NC}"

    read -p "Enter Google Vision API Key (or press Enter to skip): " GOOGLE_API_KEY
    if [ -z "$GOOGLE_API_KEY" ]; then
        echo -e "${YELLOW}⏭️  Skipped Google Vision configuration${NC}"
        return
    fi

    aws elasticbeanstalk update-environment \
        --environment-name $EB_ENV_NAME \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=GOOGLE_VISION_API_KEY,Value="$GOOGLE_API_KEY" \
        --region $AWS_REGION

    echo -e "${GREEN}✅ Google Vision configured${NC}"
}

verify_configuration() {
    echo -e "\n${BLUE}🔍 Verifying configuration...${NC}"

    aws elasticbeanstalk describe-configuration-settings \
        --environment-name $EB_ENV_NAME \
        --application-name $EB_APP_NAME \
        --region $AWS_REGION \
        --query 'ConfigurationSettings[0].OptionSettings[?Namespace==`aws:elasticbeanstalk:application:environment`]' \
        --output table

    echo -e "${GREEN}✅ Configuration retrieved${NC}"
}

wait_for_environment() {
    echo -e "\n${BLUE}⏳ Waiting for environment to be ready...${NC}"

    while true; do
        STATUS=$(aws elasticbeanstalk describe-environments \
            --environment-names $EB_ENV_NAME \
            --region $AWS_REGION \
            --query 'Environments[0].Status' \
            --output text)

        HEALTH=$(aws elasticbeanstalk describe-environments \
            --environment-names $EB_ENV_NAME \
            --region $AWS_REGION \
            --query 'Environments[0].Health' \
            --output text)

        echo -e "Status: $STATUS | Health: $HEALTH"

        if [ "$STATUS" == "Ready" ]; then
            if [ "$HEALTH" == "Green" ]; then
                echo -e "${GREEN}✅ Environment is ready and healthy${NC}"
                break
            elif [ "$HEALTH" == "Yellow" ]; then
                echo -e "${YELLOW}⚠️  Environment is ready but with warnings${NC}"
                break
            else
                echo -e "${RED}❌ Environment health is $HEALTH${NC}"
            fi
        elif [ "$STATUS" == "Terminated" ]; then
            echo -e "${RED}❌ Environment is terminated${NC}"
            exit 1
        fi

        sleep 10
    done
}

test_health_endpoint() {
    echo -e "\n${BLUE}🏥 Testing health endpoint...${NC}"

    ENDPOINT_URL=$(aws elasticbeanstalk describe-environments \
        --environment-names $EB_ENV_NAME \
        --region $AWS_REGION \
        --query 'Environments[0].CNAME' \
        --output text)

    echo -e "Endpoint: https://$ENDPOINT_URL/health"

    RESPONSE=$(curl -s "https://$ENDPOINT_URL/health" || echo '{"error": "Failed to connect"}')

    echo "Response: $RESPONSE"

    if echo "$RESPONSE" | grep -q '"status":"OK"'; then
        echo -e "${GREEN}✅ Health check passed${NC}"
    else
        echo -e "${RED}❌ Health check failed${NC}"
    fi
}

# ============================================================================
# Main execution
# ============================================================================

main() {
    echo -e "${BLUE}Starting configuration...${NC}\n"

    # Check prerequisites
    check_aws_cli
    check_eb_cli

    # Configuration menu
    echo -e "\n${BLUE}What would you like to configure?${NC}"
    echo "1) Mailgun (Email tracking - 50€/mois)"
    echo "2) TomTom Telematics (GPS tracking - 4€/véhicule/mois)"
    echo "3) AWS Textract (OCR - ~58€/mois)"
    echo "4) Google Vision API (OCR fallback - ~2€/mois)"
    echo "5) All services"
    echo "6) Verify current configuration"
    echo "7) Test health endpoint"
    echo "0) Exit"

    read -p "Choice [0-7]: " CHOICE

    case $CHOICE in
        1)
            configure_mailgun
            wait_for_environment
            ;;
        2)
            configure_tomtom
            wait_for_environment
            ;;
        3)
            configure_textract
            wait_for_environment
            ;;
        4)
            configure_google_vision
            wait_for_environment
            ;;
        5)
            configure_mailgun
            configure_tomtom
            configure_textract
            configure_google_vision
            wait_for_environment
            ;;
        6)
            verify_configuration
            ;;
        7)
            test_health_endpoint
            ;;
        0)
            echo -e "${BLUE}Exiting...${NC}"
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid choice${NC}"
            exit 1
            ;;
    esac

    echo -e "\n${GREEN}================================================${NC}"
    echo -e "${GREEN}✅ Configuration complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo -e "\nNext steps:"
    echo -e "1. Test the API: curl https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health"
    echo -e "2. Check CloudWatch logs for any errors"
    echo -e "3. Test tracking email: POST /api/transport-orders/:id/tracking/email/send"
    echo -e "4. Review documentation: cat ../CONFIGURATION_OCR_AWS_GOOGLE.md"
}

# Run main function
main