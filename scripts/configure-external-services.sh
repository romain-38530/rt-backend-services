#!/bin/bash

##############################################################################
# Script de Configuration des Services Externes
# RT SYMPHONI.A - TomTom Telematics + AWS Textract
#
# Usage: ./scripts/configure-external-services.sh
#
# Ce script configure automatiquement:
# 1. TomTom Telematics API (Tracking Premium)
# 2. AWS Textract (OCR Documents)
#
# @version 1.0.0
# @date 2025-11-26
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
EB_ENV_NAME="rt-subscriptions-api-prod"
AWS_REGION="eu-central-1"

##############################################################################
# Helper Functions
##############################################################################

print_header() {
    echo ""
    echo -e "${BLUE}============================================================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}============================================================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "Command '$1' not found. Please install it first."
        exit 1
    fi
}

confirm() {
    read -p "$(echo -e ${YELLOW}⚠${NC} $1 [y/N]: )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        return 1
    fi
    return 0
}

##############################################################################
# Prerequisites Check
##############################################################################

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check AWS CLI
    if check_command aws; then
        print_success "AWS CLI installed"
        AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1)
        print_info "Version: $AWS_VERSION"
    else
        print_error "AWS CLI not installed"
        print_info "Install: https://aws.amazon.com/cli/"
        exit 1
    fi

    # Check EB CLI (optional)
    if command -v eb &> /dev/null; then
        print_success "EB CLI installed"
        EB_VERSION=$(eb --version 2>&1)
        print_info "Version: $EB_VERSION"
    else
        print_warning "EB CLI not installed (optional)"
        print_info "Install: pip install awsebcli"
    fi

    # Check AWS credentials
    if aws sts get-caller-identity &> /dev/null; then
        print_success "AWS credentials configured"
        AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
        print_info "Account: $AWS_ACCOUNT"
    else
        print_error "AWS credentials not configured"
        print_info "Run: aws configure"
        exit 1
    fi
}

##############################################################################
# TomTom Configuration
##############################################################################

configure_tomtom() {
    print_header "Configuring TomTom Telematics API"

    print_info "Please obtain your TomTom API Key from:"
    print_info "https://developer.tomtom.com/user/me/apps"
    echo ""

    # Prompt for API Key
    read -p "Enter your TomTom API Key: " TOMTOM_API_KEY

    if [ -z "$TOMTOM_API_KEY" ]; then
        print_error "TomTom API Key cannot be empty"
        return 1
    fi

    # Validate API Key format (basic check)
    if [ ${#TOMTOM_API_KEY} -lt 32 ]; then
        print_warning "API Key seems too short. Are you sure it's correct?"
        if ! confirm "Continue anyway?"; then
            return 1
        fi
    fi

    # Test API Key with sample request
    print_info "Testing TomTom API Key..."

    TEST_URL="https://api.tomtom.com/routing/1/calculateRoute/52.50931,13.42936:52.50274,13.43872/json?key=$TOMTOM_API_KEY"

    if curl -s -f -o /dev/null "$TEST_URL"; then
        print_success "TomTom API Key is valid"
    else
        print_error "TomTom API Key validation failed"
        print_warning "The key might be invalid or TomTom service is down"
        if ! confirm "Continue with configuration anyway?"; then
            return 1
        fi
    fi

    # Configure in AWS EB
    print_info "Configuring TomTom in AWS Elastic Beanstalk..."

    if aws elasticbeanstalk update-environment \
        --environment-name "$EB_ENV_NAME" \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_KEY,Value="$TOMTOM_API_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_URL,Value="https://api.tomtom.com" \
        --region "$AWS_REGION" &> /dev/null; then

        print_success "TomTom configuration applied to AWS EB"
    else
        print_error "Failed to configure TomTom in AWS EB"
        return 1
    fi

    # Save to .env file for local development
    print_info "Saving to .env file for local development..."

    ENV_FILE="services/subscriptions-contracts-eb/.env"

    if [ ! -f "$ENV_FILE" ]; then
        touch "$ENV_FILE"
    fi

    # Remove old TomTom entries
    sed -i '/TOMTOM_API_KEY/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '/TOMTOM_API_URL/d' "$ENV_FILE" 2>/dev/null || true

    # Add new entries
    echo "TOMTOM_API_KEY=$TOMTOM_API_KEY" >> "$ENV_FILE"
    echo "TOMTOM_API_URL=https://api.tomtom.com" >> "$ENV_FILE"

    print_success "TomTom configuration saved to $ENV_FILE"

    echo ""
    print_success "TomTom Telematics API configured successfully!"
    print_info "Tracking Premium (4EUR/vehicule/mois) is now enabled"
}

##############################################################################
# AWS Textract Configuration
##############################################################################

configure_textract() {
    print_header "Configuring AWS Textract OCR"

    print_info "Creating IAM user for Textract..."

    # Create IAM user
    IAM_USER="rt-textract-service"

    if aws iam get-user --user-name "$IAM_USER" &> /dev/null; then
        print_warning "IAM user '$IAM_USER' already exists"
        if ! confirm "Delete and recreate?"; then
            print_info "Skipping IAM user creation"
        else
            # Delete existing user
            aws iam delete-access-key --user-name "$IAM_USER" --access-key-id $(aws iam list-access-keys --user-name "$IAM_USER" --query 'AccessKeyMetadata[0].AccessKeyId' --output text) 2>/dev/null || true
            aws iam delete-user --user-name "$IAM_USER" &> /dev/null || true
            print_info "Existing user deleted"
        fi
    fi

    # Create user if not exists
    if ! aws iam get-user --user-name "$IAM_USER" &> /dev/null; then
        if aws iam create-user --user-name "$IAM_USER" &> /dev/null; then
            print_success "IAM user '$IAM_USER' created"
        else
            print_error "Failed to create IAM user"
            return 1
        fi
    fi

    # Create policy
    POLICY_NAME="RTTextractAccessPolicy"
    POLICY_DOCUMENT='{
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "textract:DetectDocumentText",
            "textract:AnalyzeDocument",
            "textract:GetDocumentAnalysis"
          ],
          "Resource": "*"
        }
      ]
    }'

    # Check if policy exists
    POLICY_ARN=$(aws iam list-policies --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text)

    if [ -z "$POLICY_ARN" ]; then
        # Create policy
        POLICY_ARN=$(aws iam create-policy \
            --policy-name "$POLICY_NAME" \
            --policy-document "$POLICY_DOCUMENT" \
            --query 'Policy.Arn' \
            --output text)

        if [ $? -eq 0 ]; then
            print_success "IAM policy '$POLICY_NAME' created"
        else
            print_error "Failed to create IAM policy"
            return 1
        fi
    else
        print_info "IAM policy already exists: $POLICY_ARN"
    fi

    # Attach policy to user
    if aws iam attach-user-policy --user-name "$IAM_USER" --policy-arn "$POLICY_ARN" &> /dev/null; then
        print_success "Policy attached to user"
    else
        print_warning "Policy might already be attached"
    fi

    # Create access keys
    print_info "Creating access keys..."

    ACCESS_KEY_OUTPUT=$(aws iam create-access-key --user-name "$IAM_USER" --output json)

    if [ $? -eq 0 ]; then
        AWS_ACCESS_KEY_ID=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.AccessKeyId')
        AWS_SECRET_ACCESS_KEY=$(echo "$ACCESS_KEY_OUTPUT" | jq -r '.AccessKey.SecretAccessKey')

        print_success "Access keys created"
        echo ""
        print_warning "Save these credentials securely (they won't be shown again):"
        echo ""
        echo "AWS_ACCESS_KEY_ID: $AWS_ACCESS_KEY_ID"
        echo "AWS_SECRET_ACCESS_KEY: $AWS_SECRET_ACCESS_KEY"
        echo ""

        read -p "Press Enter to continue..."
    else
        print_error "Failed to create access keys"
        return 1
    fi

    # Configure in AWS EB
    print_info "Configuring Textract in AWS Elastic Beanstalk..."

    if aws elasticbeanstalk update-environment \
        --environment-name "$EB_ENV_NAME" \
        --option-settings \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_TEXTRACT_ACCESS_KEY_ID,Value="$AWS_ACCESS_KEY_ID" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_TEXTRACT_SECRET_ACCESS_KEY,Value="$AWS_SECRET_ACCESS_KEY" \
            Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_TEXTRACT_REGION,Value="$AWS_REGION" \
        --region "$AWS_REGION" &> /dev/null; then

        print_success "Textract configuration applied to AWS EB"
    else
        print_error "Failed to configure Textract in AWS EB"
        return 1
    fi

    # Save to .env file
    print_info "Saving to .env file for local development..."

    ENV_FILE="services/subscriptions-contracts-eb/.env"

    # Remove old Textract entries
    sed -i '/AWS_TEXTRACT_ACCESS_KEY_ID/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '/AWS_TEXTRACT_SECRET_ACCESS_KEY/d' "$ENV_FILE" 2>/dev/null || true
    sed -i '/AWS_TEXTRACT_REGION/d' "$ENV_FILE" 2>/dev/null || true

    # Add new entries
    echo "AWS_TEXTRACT_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> "$ENV_FILE"
    echo "AWS_TEXTRACT_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> "$ENV_FILE"
    echo "AWS_TEXTRACT_REGION=$AWS_REGION" >> "$ENV_FILE"

    print_success "Textract configuration saved to $ENV_FILE"

    # Configure budget alert
    print_info "Would you like to configure a budget alert for Textract?"

    if confirm "Create budget alert (recommended)?"; then
        configure_budget_alert
    fi

    echo ""
    print_success "AWS Textract OCR configured successfully!"
    print_info "OCR automatic extraction is now enabled"
}

##############################################################################
# Budget Alert Configuration
##############################################################################

configure_budget_alert() {
    print_info "Configuring AWS Budget Alert for Textract..."

    BUDGET_NAME="RT-SYMPHONIA-Textract-Budget"
    BUDGET_AMOUNT="100.0"  # 100 USD/month
    ALERT_EMAIL=$(aws sts get-caller-identity --query 'Arn' --output text | cut -d':' -f6 | cut -d'/' -f1)@example.com

    read -p "Enter email for budget alerts [$ALERT_EMAIL]: " INPUT_EMAIL
    ALERT_EMAIL=${INPUT_EMAIL:-$ALERT_EMAIL}

    BUDGET_JSON=$(cat <<EOF
{
  "BudgetName": "$BUDGET_NAME",
  "BudgetType": "COST",
  "TimeUnit": "MONTHLY",
  "BudgetLimit": {
    "Amount": "$BUDGET_AMOUNT",
    "Unit": "USD"
  },
  "CostFilters": {
    "Service": ["Amazon Textract"]
  }
}
EOF
)

    NOTIFICATION_JSON=$(cat <<EOF
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      {
        "SubscriptionType": "EMAIL",
        "Address": "$ALERT_EMAIL"
      }
    ]
  }
]
EOF
)

    # Note: Budget creation requires additional setup
    print_info "Budget alert configuration prepared"
    print_info "Budget: $BUDGET_AMOUNT USD/month"
    print_info "Alert email: $ALERT_EMAIL"
    print_warning "Please complete setup in AWS Console > Billing > Budgets"
}

##############################################################################
# Verification
##############################################################################

verify_configuration() {
    print_header "Verifying Configuration"

    # Verify AWS EB environment variables
    print_info "Checking AWS Elastic Beanstalk environment..."

    ENV_VARS=$(aws elasticbeanstalk describe-configuration-settings \
        --environment-name "$EB_ENV_NAME" \
        --region "$AWS_REGION" \
        --query 'ConfigurationSettings[0].OptionSettings[?Namespace==`aws:elasticbeanstalk:application:environment`]' \
        --output json)

    # Check TomTom
    if echo "$ENV_VARS" | grep -q "TOMTOM_API_KEY"; then
        print_success "TomTom API Key configured in AWS EB"
    else
        print_warning "TomTom API Key not found in AWS EB"
    fi

    # Check Textract
    if echo "$ENV_VARS" | grep -q "AWS_TEXTRACT_ACCESS_KEY_ID"; then
        print_success "AWS Textract credentials configured in AWS EB"
    else
        print_warning "AWS Textract credentials not found in AWS EB"
    fi

    echo ""
    print_info "Environment restart required for changes to take effect"

    if confirm "Restart AWS Elastic Beanstalk environment now?"; then
        print_info "Restarting environment..."

        aws elasticbeanstalk restart-app-server \
            --environment-name "$EB_ENV_NAME" \
            --region "$AWS_REGION" &> /dev/null

        print_success "Environment restart initiated"
        print_info "This may take 2-3 minutes..."
    fi
}

##############################################################################
# Main Menu
##############################################################################

main_menu() {
    while true; do
        print_header "RT SYMPHONI.A - External Services Configuration"

        echo "1) Configure TomTom Telematics API (Tracking Premium)"
        echo "2) Configure AWS Textract (OCR Documents)"
        echo "3) Configure Both Services"
        echo "4) Verify Configuration"
        echo "5) Exit"
        echo ""
        read -p "Select option [1-5]: " choice

        case $choice in
            1)
                configure_tomtom
                ;;
            2)
                configure_textract
                ;;
            3)
                configure_tomtom
                configure_textract
                ;;
            4)
                verify_configuration
                ;;
            5)
                echo ""
                print_info "Configuration complete!"
                print_info "Next steps:"
                print_info "1. Verify services in AWS EB Console"
                print_info "2. Test API endpoints"
                print_info "3. Monitor usage and costs"
                echo ""
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac

        echo ""
        read -p "Press Enter to continue..."
    done
}

##############################################################################
# Script Entry Point
##############################################################################

echo ""
echo "============================================================================"
echo "  RT SYMPHONI.A - External Services Configuration"
echo "  Version 1.0.0"
echo "============================================================================"
echo ""

check_prerequisites

main_menu
