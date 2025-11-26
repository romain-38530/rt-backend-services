#!/bin/bash

# ==============================================================================
# RT SYMPHONI.A - Configuration des Services Externes
# ==============================================================================
# Script interactif pour configurer :
# 1. TomTom Telematics API (Tracking Premium)
# 2. AWS Textract (OCR Primary)
# 3. Google Vision API (OCR Fallback)
#
# Usage: bash scripts/configure-external-services.sh
# ==============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ==============================================================================
# Helper Functions
# ==============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default="$3"

    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " input
        eval $var_name="${input:-$default}"
    else
        read -p "$prompt: " input
        eval $var_name="$input"
    fi
}

prompt_password() {
    local prompt="$1"
    local var_name="$2"

    read -sp "$prompt: " input
    echo ""
    eval $var_name="$input"
}

confirm() {
    local prompt="$1"
    read -p "$prompt [y/N]: " response
    case "$response" in
        [yY][eE][sS]|[yY])
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "Command '$1' not found. Please install it first."
        return 1
    fi
    return 0
}

# ==============================================================================
# Configuration Variables
# ==============================================================================

ENV_NAME="rt-subscriptions-api-prod"
AWS_REGION="eu-central-1"
CONFIG_FILE=".env.external-services"

# ==============================================================================
# Main Menu
# ==============================================================================

show_menu() {
    clear
    echo ""
    echo -e "${BLUE}┌─────────────────────────────────────────────────────────┐${NC}"
    echo -e "${BLUE}│  RT SYMPHONI.A - External Services Configuration       │${NC}"
    echo -e "${BLUE}│  Environment: ${ENV_NAME}                │${NC}"
    echo -e "${BLUE}└─────────────────────────────────────────────────────────┘${NC}"
    echo ""
    echo "1. Configure TomTom Telematics API (Tracking Premium)"
    echo "2. Configure AWS Textract (OCR Primary)"
    echo "3. Configure Google Vision API (OCR Fallback)"
    echo "4. Configure All Services (Full Setup)"
    echo "5. Test Configuration"
    echo "6. View Current Configuration"
    echo "7. Deploy to AWS Elastic Beanstalk"
    echo "8. Exit"
    echo ""
}

# ==============================================================================
# 1. Configure TomTom Telematics
# ==============================================================================

configure_tomtom() {
    print_header "TomTom Telematics API Configuration"

    print_info "This will configure GPS tracking for Premium tier"
    print_info "Documentation: CONFIGURATION_TOMTOM_TELEMATICS.md"
    echo ""

    print_info "Steps to get your TomTom API Key:"
    echo "  1. Go to https://developer.tomtom.com/"
    echo "  2. Create a free account (or log in)"
    echo "  3. Create a new app: 'RT-SYMPHONIA-Tracking-Premium'"
    echo "  4. Enable: Routing API, Search API, Traffic API"
    echo "  5. Copy your API Key"
    echo ""

    if ! confirm "Have you created your TomTom account and obtained an API Key?"; then
        print_warning "Please create your TomTom account first, then run this script again."
        return 1
    fi

    echo ""
    prompt_input "Enter your TomTom API Key" TOMTOM_API_KEY

    if [ -z "$TOMTOM_API_KEY" ]; then
        print_error "TomTom API Key is required"
        return 1
    fi

    # Validate API Key format (basic check)
    if [ ${#TOMTOM_API_KEY} -lt 32 ]; then
        print_warning "API Key seems too short. Typical TomTom keys are 32+ characters."
        if ! confirm "Continue anyway?"; then
            return 1
        fi
    fi

    # Optional: API URL (usually not needed, uses default)
    prompt_input "TomTom API URL (optional)" TOMTOM_TRACKING_API_URL "https://api.tomtom.com/tracking/1"

    # Save to config file
    echo "# TomTom Configuration" >> "$CONFIG_FILE"
    echo "TOMTOM_API_KEY=$TOMTOM_API_KEY" >> "$CONFIG_FILE"
    echo "TOMTOM_TRACKING_API_URL=$TOMTOM_TRACKING_API_URL" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"

    print_success "TomTom configuration saved to $CONFIG_FILE"

    # Test the API key
    if confirm "Do you want to test the TomTom API key now?"; then
        test_tomtom_api "$TOMTOM_API_KEY"
    fi

    echo ""
    print_success "TomTom Telematics configured successfully!"
    print_info "Next: Configure this in AWS EB or continue to next service"
}

test_tomtom_api() {
    local api_key="$1"
    print_info "Testing TomTom API..."

    # Simple routing test (Paris to Lyon)
    local test_url="https://api.tomtom.com/routing/1/calculateRoute/48.8566,2.3522:45.7640,4.8357/json?key=$api_key"

    if check_command "curl"; then
        response=$(curl -s -w "\n%{http_code}" "$test_url")
        http_code=$(echo "$response" | tail -n1)

        if [ "$http_code" = "200" ]; then
            print_success "TomTom API is working! ✓"
        elif [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
            print_error "TomTom API Key is invalid (HTTP $http_code)"
        else
            print_error "TomTom API test failed (HTTP $http_code)"
        fi
    else
        print_warning "curl not found. Skipping API test."
    fi
}

# ==============================================================================
# 2. Configure AWS Textract
# ==============================================================================

configure_aws_textract() {
    print_header "AWS Textract Configuration (OCR Primary)"

    print_info "This will configure AWS Textract for document OCR"
    print_info "Documentation: CONFIGURATION_OCR_AWS_GOOGLE.md"
    echo ""

    print_info "Prerequisites:"
    echo "  1. AWS account with admin access"
    echo "  2. IAM user created with Textract permissions"
    echo "  3. Access Key ID and Secret Access Key"
    echo ""

    print_info "To create IAM user:"
    echo "  1. Go to AWS Console → IAM → Users → Add users"
    echo "  2. Name: rt-symphonia-textract-user"
    echo "  3. Access type: Programmatic access"
    echo "  4. Attach policy: AmazonTextractFullAccess"
    echo "  5. Copy Access Key ID and Secret Access Key"
    echo ""

    if ! confirm "Have you created the IAM user and obtained credentials?"; then
        print_warning "Please create the IAM user first, then run this script again."
        return 1
    fi

    echo ""
    prompt_input "AWS Access Key ID" AWS_ACCESS_KEY_ID
    prompt_password "AWS Secret Access Key" AWS_SECRET_ACCESS_KEY
    prompt_input "AWS Region" AWS_REGION "eu-central-1"

    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        print_error "AWS credentials are required"
        return 1
    fi

    # Validate credentials format
    if [[ ! $AWS_ACCESS_KEY_ID =~ ^AKIA[A-Z0-9]{16}$ ]]; then
        print_warning "Access Key ID format looks unusual. Standard format: AKIAXXXXXXXXXX (20 chars)"
        if ! confirm "Continue anyway?"; then
            return 1
        fi
    fi

    # Save to config file
    echo "# AWS Textract Configuration" >> "$CONFIG_FILE"
    echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID" >> "$CONFIG_FILE"
    echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY" >> "$CONFIG_FILE"
    echo "AWS_REGION=$AWS_REGION" >> "$CONFIG_FILE"
    echo "OCR_PROVIDER=AWS_TEXTRACT" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"

    print_success "AWS Textract configuration saved to $CONFIG_FILE"

    # Test AWS credentials
    if confirm "Do you want to test the AWS credentials now?"; then
        test_aws_credentials "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$AWS_REGION"
    fi

    echo ""
    print_success "AWS Textract configured successfully!"
}

test_aws_credentials() {
    local access_key="$1"
    local secret_key="$2"
    local region="$3"

    print_info "Testing AWS credentials..."

    if check_command "aws"; then
        # Configure AWS CLI temporarily
        export AWS_ACCESS_KEY_ID="$access_key"
        export AWS_SECRET_ACCESS_KEY="$secret_key"
        export AWS_DEFAULT_REGION="$region"

        # Test with a simple STS call
        if aws sts get-caller-identity &> /dev/null; then
            print_success "AWS credentials are valid! ✓"

            # Get account info
            account_id=$(aws sts get-caller-identity --query Account --output text)
            user_arn=$(aws sts get-caller-identity --query Arn --output text)
            print_info "AWS Account: $account_id"
            print_info "User: $user_arn"
        else
            print_error "AWS credentials are invalid or insufficient permissions"
        fi

        # Cleanup
        unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION
    else
        print_warning "AWS CLI not found. Skipping credentials test."
        print_info "Install AWS CLI: https://aws.amazon.com/cli/"
    fi
}

# ==============================================================================
# 3. Configure Google Vision API
# ==============================================================================

configure_google_vision() {
    print_header "Google Vision API Configuration (OCR Fallback)"

    print_info "This will configure Google Vision as OCR fallback"
    print_info "Documentation: CONFIGURATION_OCR_AWS_GOOGLE.md"
    echo ""

    print_info "Prerequisites:"
    echo "  1. Google Cloud account"
    echo "  2. Project created: rt-symphonia-ocr"
    echo "  3. Vision API enabled"
    echo "  4. Service Account created with Vision API User role"
    echo "  5. JSON key file downloaded"
    echo ""

    print_info "To create Service Account:"
    echo "  1. Go to Google Cloud Console → IAM → Service Accounts"
    echo "  2. Create Service Account: rt-symphonia-vision-sa"
    echo "  3. Grant role: Cloud Vision API User"
    echo "  4. Create Key (JSON) and download"
    echo ""

    if ! confirm "Have you created the Service Account and downloaded the JSON key?"; then
        print_warning "Please create the Service Account first, then run this script again."
        return 1
    fi

    echo ""
    prompt_input "Path to Google credentials JSON file" GOOGLE_CREDS_PATH

    if [ ! -f "$GOOGLE_CREDS_PATH" ]; then
        print_error "File not found: $GOOGLE_CREDS_PATH"
        return 1
    fi

    # Validate JSON format
    if check_command "jq"; then
        if jq empty "$GOOGLE_CREDS_PATH" 2>/dev/null; then
            print_success "JSON file is valid"

            # Extract project info
            project_id=$(jq -r '.project_id' "$GOOGLE_CREDS_PATH")
            client_email=$(jq -r '.client_email' "$GOOGLE_CREDS_PATH")

            print_info "Project ID: $project_id"
            print_info "Service Account: $client_email"
        else
            print_error "Invalid JSON file"
            return 1
        fi
    fi

    # Copy JSON to project directory
    local dest_path="./google-credentials.json"
    cp "$GOOGLE_CREDS_PATH" "$dest_path"
    chmod 400 "$dest_path"

    # Save to config file
    echo "# Google Vision API Configuration" >> "$CONFIG_FILE"
    echo "GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json" >> "$CONFIG_FILE"
    echo "OCR_ENABLE_FALLBACK=true" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"

    print_success "Google Vision configuration saved to $CONFIG_FILE"
    print_info "Credentials file copied to: $dest_path"
    print_warning "Remember to deploy this file to AWS EB (see .ebextensions/google-credentials.config)"

    # Test Google Vision API
    if confirm "Do you want to test the Google Vision API now?"; then
        test_google_vision_api "$dest_path"
    fi

    echo ""
    print_success "Google Vision API configured successfully!"
}

test_google_vision_api() {
    local creds_file="$1"
    print_info "Testing Google Vision API..."

    if check_command "node"; then
        # Create a quick test script
        cat > /tmp/test-google-vision.js <<EOF
const vision = require('@google-cloud/vision');
async function test() {
  try {
    const client = new vision.ImageAnnotatorClient({
      keyFilename: '$creds_file'
    });
    console.log('✓ Google Vision API is accessible');
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}
test();
EOF

        if node /tmp/test-google-vision.js 2>&1 | grep -q "✓"; then
            print_success "Google Vision API is working! ✓"
        else
            print_error "Google Vision API test failed"
        fi

        rm /tmp/test-google-vision.js
    else
        print_warning "Node.js not found. Skipping API test."
    fi
}

# ==============================================================================
# 4. Configure All Services
# ==============================================================================

configure_all_services() {
    print_header "Configure All External Services"

    print_info "This will guide you through configuring all 3 services:"
    echo "  1. TomTom Telematics API"
    echo "  2. AWS Textract"
    echo "  3. Google Vision API"
    echo ""

    if ! confirm "Continue with full setup?"; then
        return 0
    fi

    # Initialize config file
    echo "# RT SYMPHONI.A - External Services Configuration" > "$CONFIG_FILE"
    echo "# Generated on: $(date)" >> "$CONFIG_FILE"
    echo "# Environment: $ENV_NAME" >> "$CONFIG_FILE"
    echo "" >> "$CONFIG_FILE"

    # Configure each service
    configure_tomtom
    echo ""
    read -p "Press Enter to continue to AWS Textract..."

    configure_aws_textract
    echo ""
    read -p "Press Enter to continue to Google Vision..."

    configure_google_vision

    echo ""
    print_success "All services configured!"
    print_info "Configuration saved to: $CONFIG_FILE"
    echo ""

    if confirm "Do you want to deploy to AWS Elastic Beanstalk now?"; then
        deploy_to_eb
    fi
}

# ==============================================================================
# 5. Test Configuration
# ==============================================================================

test_configuration() {
    print_header "Test External Services Configuration"

    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found: $CONFIG_FILE"
        print_info "Please configure services first (option 1, 2, or 3)"
        return 1
    fi

    # Load config file
    source "$CONFIG_FILE"

    echo "Testing configured services..."
    echo ""

    # Test TomTom
    if [ -n "$TOMTOM_API_KEY" ]; then
        print_info "Testing TomTom API..."
        test_tomtom_api "$TOMTOM_API_KEY"
    else
        print_warning "TomTom not configured"
    fi

    echo ""

    # Test AWS
    if [ -n "$AWS_ACCESS_KEY_ID" ]; then
        print_info "Testing AWS Textract..."
        test_aws_credentials "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "$AWS_REGION"
    else
        print_warning "AWS Textract not configured"
    fi

    echo ""

    # Test Google Vision
    if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        print_info "Testing Google Vision API..."
        local local_creds_path="./google-credentials.json"
        if [ -f "$local_creds_path" ]; then
            test_google_vision_api "$local_creds_path"
        else
            print_warning "Google credentials file not found locally"
        fi
    else
        print_warning "Google Vision not configured"
    fi

    echo ""
    print_success "Configuration tests completed"
}

# ==============================================================================
# 6. View Current Configuration
# ==============================================================================

view_configuration() {
    print_header "Current Configuration"

    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found: $CONFIG_FILE"
        print_info "No services configured yet"
        return 1
    fi

    echo "Configuration file: $CONFIG_FILE"
    echo ""

    # Load and display (mask sensitive values)
    source "$CONFIG_FILE"

    echo "TomTom Telematics:"
    if [ -n "$TOMTOM_API_KEY" ]; then
        echo "  ✓ API Key: ${TOMTOM_API_KEY:0:8}...${TOMTOM_API_KEY: -4}"
        echo "  ✓ API URL: $TOMTOM_TRACKING_API_URL"
    else
        echo "  ✗ Not configured"
    fi

    echo ""
    echo "AWS Textract:"
    if [ -n "$AWS_ACCESS_KEY_ID" ]; then
        echo "  ✓ Access Key ID: ${AWS_ACCESS_KEY_ID:0:8}...${AWS_ACCESS_KEY_ID: -4}"
        echo "  ✓ Secret Key: ********"
        echo "  ✓ Region: $AWS_REGION"
    else
        echo "  ✗ Not configured"
    fi

    echo ""
    echo "Google Vision API:"
    if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        echo "  ✓ Credentials: $GOOGLE_APPLICATION_CREDENTIALS"
        if [ -f "./google-credentials.json" ]; then
            echo "  ✓ Local file: ./google-credentials.json"
        fi
    else
        echo "  ✗ Not configured"
    fi

    echo ""
}

# ==============================================================================
# 7. Deploy to AWS Elastic Beanstalk
# ==============================================================================

deploy_to_eb() {
    print_header "Deploy to AWS Elastic Beanstalk"

    if [ ! -f "$CONFIG_FILE" ]; then
        print_error "Configuration file not found. Please configure services first."
        return 1
    fi

    # Load config
    source "$CONFIG_FILE"

    print_info "Target environment: $ENV_NAME"
    print_info "Region: $AWS_REGION"
    echo ""

    print_warning "This will update environment variables in AWS Elastic Beanstalk"
    if ! confirm "Continue?"; then
        return 0
    fi

    # Check for EB CLI
    if check_command "eb"; then
        deploy_with_eb_cli
    elif check_command "aws"; then
        deploy_with_aws_cli
    else
        print_error "Neither 'eb' nor 'aws' CLI found"
        print_info "Install AWS CLI: https://aws.amazon.com/cli/"
        print_info "Install EB CLI: pip install awsebcli"
        return 1
    fi
}

deploy_with_eb_cli() {
    print_info "Deploying with EB CLI..."

    source "$CONFIG_FILE"

    # Build setenv command
    local setenv_cmd="eb setenv"

    # Add TomTom vars
    if [ -n "$TOMTOM_API_KEY" ]; then
        setenv_cmd="$setenv_cmd TOMTOM_API_KEY=$TOMTOM_API_KEY"
        setenv_cmd="$setenv_cmd TOMTOM_TRACKING_API_URL=$TOMTOM_TRACKING_API_URL"
    fi

    # Add AWS vars
    if [ -n "$AWS_ACCESS_KEY_ID" ]; then
        setenv_cmd="$setenv_cmd AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
        setenv_cmd="$setenv_cmd AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
        setenv_cmd="$setenv_cmd AWS_REGION=$AWS_REGION"
        setenv_cmd="$setenv_cmd OCR_PROVIDER=AWS_TEXTRACT"
    fi

    # Add Google vars
    if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        setenv_cmd="$setenv_cmd GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_APPLICATION_CREDENTIALS"
        setenv_cmd="$setenv_cmd OCR_ENABLE_FALLBACK=true"
    fi

    # Execute
    print_info "Setting environment variables..."
    eval $setenv_cmd

    if [ $? -eq 0 ]; then
        print_success "Environment variables deployed successfully!"
        print_info "AWS will restart the environment (takes ~2-3 minutes)"
    else
        print_error "Deployment failed"
    fi
}

deploy_with_aws_cli() {
    print_info "Deploying with AWS CLI..."

    source "$CONFIG_FILE"

    # Build option settings
    local options=""

    # Add TomTom vars
    if [ -n "$TOMTOM_API_KEY" ]; then
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_KEY,Value=$TOMTOM_API_KEY"
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_TRACKING_API_URL,Value=$TOMTOM_TRACKING_API_URL"
    fi

    # Add AWS vars
    if [ -n "$AWS_ACCESS_KEY_ID" ]; then
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_ACCESS_KEY_ID,Value=$AWS_ACCESS_KEY_ID"
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_SECRET_ACCESS_KEY,Value=$AWS_SECRET_ACCESS_KEY"
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value=$AWS_REGION"
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=OCR_PROVIDER,Value=AWS_TEXTRACT"
    fi

    # Add Google vars
    if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=GOOGLE_APPLICATION_CREDENTIALS,Value=$GOOGLE_APPLICATION_CREDENTIALS"
        options="$options Namespace=aws:elasticbeanstalk:application:environment,OptionName=OCR_ENABLE_FALLBACK,Value=true"
    fi

    # Execute
    print_info "Updating environment..."
    aws elasticbeanstalk update-environment \
        --environment-name "$ENV_NAME" \
        --option-settings $options \
        --region "$AWS_REGION"

    if [ $? -eq 0 ]; then
        print_success "Environment update initiated!"
        print_info "Check AWS Console for deployment status"
    else
        print_error "Deployment failed"
    fi
}

# ==============================================================================
# Main Program
# ==============================================================================

main() {
    while true; do
        show_menu
        read -p "Select an option [1-8]: " choice

        case $choice in
            1)
                configure_tomtom
                read -p "Press Enter to continue..."
                ;;
            2)
                configure_aws_textract
                read -p "Press Enter to continue..."
                ;;
            3)
                configure_google_vision
                read -p "Press Enter to continue..."
                ;;
            4)
                configure_all_services
                read -p "Press Enter to continue..."
                ;;
            5)
                test_configuration
                read -p "Press Enter to continue..."
                ;;
            6)
                view_configuration
                read -p "Press Enter to continue..."
                ;;
            7)
                deploy_to_eb
                read -p "Press Enter to continue..."
                ;;
            8)
                print_info "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option"
                sleep 1
                ;;
        esac
    done
}

# Run main program
main
