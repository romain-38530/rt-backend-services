#!/bin/bash
################################################################################
# Script de Déploiement Automatisé SYMPHONIA Platform sur AWS
# Version: 2.2.0
# Date: 2026-02-01
#
# Prérequis:
# - AWS CLI configuré (aws configure)
# - MongoDB URI accessible
# - Packages dans deploy/packages/
################################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DEPLOY_DIR="$ROOT_DIR/deploy"
PACKAGES_DIR="$DEPLOY_DIR/packages"
LOG_FILE="$DEPLOY_DIR/deploy_aws_$(date +%Y%m%d_%H%M%S).log"

# AWS Configuration
AWS_REGION="${AWS_REGION:-eu-west-3}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")

# Services Configuration
declare -A SERVICES=(
    ["tms-sync-eb"]="tms-sync-eb.zip"
    ["authz-eb"]="authz-eb.zip"
    ["affret-ia-api-v2"]="affret-ia-api-v2.zip"
)

# Application Configuration
APP_PREFIX="symphonia"
ENV_SUFFIX="prod"

################################################################################
# Functions
################################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1" | tee -a "$LOG_FILE"
}

print_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo ""
}

check_prerequisites() {
    print_header "Vérification des Prérequis"

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI n'est pas installé. Installez avec: pip install awscli"
        exit 1
    fi
    log_success "AWS CLI installé: $(aws --version)"

    # Check AWS credentials
    if [ -z "$AWS_ACCOUNT_ID" ]; then
        log_error "AWS credentials non configurées. Exécutez: aws configure"
        exit 1
    fi
    log_success "AWS Account ID: $AWS_ACCOUNT_ID"

    # Check packages exist
    for service in "${!SERVICES[@]}"; do
        package="${SERVICES[$service]}"
        if [ ! -f "$PACKAGES_DIR/$package" ]; then
            log_error "Package manquant: $PACKAGES_DIR/$package"
            exit 1
        fi
        log_success "Package trouvé: $package ($(du -h "$PACKAGES_DIR/$package" | cut -f1))"
    done

    # Check MongoDB URI
    if [ -z "$MONGODB_URI" ]; then
        log_warning "MONGODB_URI non défini. Utilisez: export MONGODB_URI='mongodb://...'"
        read -p "Voulez-vous continuer sans MongoDB URI? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "MongoDB URI configuré"
    fi
}

configure_aws_ses() {
    print_header "Configuration AWS SES (Email)"

    local domain="${SES_DOMAIN:-symphonia-controltower.com}"
    local sender_email="${SES_FROM_EMAIL:-ne-pas-repondre@symphonia-controltower.com}"

    log "Vérification du domaine SES: $domain"

    # Check if domain is already verified
    local domain_status=$(aws ses get-identity-verification-attributes \
        --region "$AWS_REGION" \
        --identities "$domain" \
        --query "VerificationAttributes.\"$domain\".VerificationStatus" \
        --output text 2>/dev/null || echo "NotFound")

    if [ "$domain_status" = "Success" ]; then
        log_success "Domaine SES déjà vérifié: $domain"
    else
        log "Demande de vérification du domaine: $domain"
        aws ses verify-domain-identity \
            --region "$AWS_REGION" \
            --domain "$domain" &>> "$LOG_FILE" || true
        log_warning "Domaine en attente de vérification. Ajoutez les enregistrements DNS TXT."
    fi

    # Verify sender email
    log "Vérification de l'email sender: $sender_email"
    local email_status=$(aws ses get-identity-verification-attributes \
        --region "$AWS_REGION" \
        --identities "$sender_email" \
        --query "VerificationAttributes.\"$sender_email\".VerificationStatus" \
        --output text 2>/dev/null || echo "NotFound")

    if [ "$email_status" = "Success" ]; then
        log_success "Email SES déjà vérifié: $sender_email"
    else
        log "Envoi email de vérification à: $sender_email"
        aws ses verify-email-identity \
            --region "$AWS_REGION" \
            --email-address "$sender_email" &>> "$LOG_FILE" || true
        log_warning "Email de vérification envoyé. Cliquez sur le lien reçu."
    fi

    # Check SES sending limits
    local send_quota=$(aws ses get-send-quota \
        --region "$AWS_REGION" \
        --query 'Max24HourSend' \
        --output text 2>/dev/null || echo "0")

    if [ "$send_quota" = "200" ]; then
        log_warning "SES en mode Sandbox (200 emails/jour). Demandez production access."
    else
        log_success "SES Production Mode activé (quota: $send_quota emails/jour)"
    fi
}

configure_aws_sns() {
    print_header "Configuration AWS SNS (SMS)"

    local topic_name="${SNS_TOPIC_NAME:-symphonia-alerts}"
    local sms_number="${ALERT_SMS_NUMBER}"

    # Create SNS Topic
    log "Création du topic SNS: $topic_name"
    local topic_arn=$(aws sns create-topic \
        --region "$AWS_REGION" \
        --name "$topic_name" \
        --query 'TopicArn' \
        --output text 2>/dev/null || echo "")

    if [ -n "$topic_arn" ]; then
        log_success "Topic SNS créé: $topic_arn"

        # Subscribe SMS if number provided
        if [ -n "$sms_number" ]; then
            log "Abonnement SMS: $sms_number"
            aws sns subscribe \
                --region "$AWS_REGION" \
                --topic-arn "$topic_arn" \
                --protocol sms \
                --notification-endpoint "$sms_number" &>> "$LOG_FILE" || true
            log_success "Abonnement SMS configuré"
        fi

        # Set SMS preferences
        log "Configuration préférences SMS..."
        aws sns set-sms-attributes \
            --region "$AWS_REGION" \
            --attributes \
                DefaultSMSType=Transactional \
                DefaultSenderID=Symphonia &>> "$LOG_FILE" || true

    else
        # Topic already exists
        topic_arn=$(aws sns list-topics \
            --region "$AWS_REGION" \
            --query "Topics[?contains(TopicArn, '$topic_name')].TopicArn" \
            --output text 2>/dev/null)

        if [ -n "$topic_arn" ]; then
            log_success "Topic SNS existant: $topic_arn"
        else
            log_error "Impossible de créer le topic SNS"
        fi
    fi

    # Export topic ARN for later use
    export SNS_TOPIC_ARN="$topic_arn"
}

create_s3_bucket_for_packages() {
    print_header "Configuration S3 pour Packages"

    local bucket_name="${S3_BUCKET_NAME:-symphonia-deploy-packages-$AWS_ACCOUNT_ID}"

    log "Vérification du bucket S3: $bucket_name"

    # Check if bucket exists
    if aws s3 ls "s3://$bucket_name" &> /dev/null; then
        log_success "Bucket S3 existant: $bucket_name"
    else
        log "Création du bucket S3: $bucket_name"

        if [ "$AWS_REGION" = "us-east-1" ]; then
            aws s3 mb "s3://$bucket_name" &>> "$LOG_FILE"
        else
            aws s3 mb "s3://$bucket_name" \
                --region "$AWS_REGION" \
                --create-bucket-configuration LocationConstraint="$AWS_REGION" &>> "$LOG_FILE"
        fi

        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$bucket_name" \
            --versioning-configuration Status=Enabled &>> "$LOG_FILE"

        log_success "Bucket S3 créé avec versioning: $bucket_name"
    fi

    export S3_BUCKET_NAME="$bucket_name"
}

upload_packages_to_s3() {
    print_header "Upload des Packages vers S3"

    local version="v2.2.0-$(date +%Y%m%d-%H%M%S)"

    for service in "${!SERVICES[@]}"; do
        local package="${SERVICES[$service]}"
        local s3_key="packages/$service/$version.zip"

        log "Upload: $package → s3://$S3_BUCKET_NAME/$s3_key"

        aws s3 cp "$PACKAGES_DIR/$package" \
            "s3://$S3_BUCKET_NAME/$s3_key" \
            --region "$AWS_REGION" &>> "$LOG_FILE"

        log_success "Package uploadé: $service"

        # Store S3 key for deployment
        declare -g "S3_KEY_${service//-/_}=$s3_key"
    done
}

create_eb_application() {
    local app_name="$1"

    log "Création application EB: $app_name"

    # Check if application exists
    if aws elasticbeanstalk describe-applications \
        --region "$AWS_REGION" \
        --application-names "$app_name" &> /dev/null; then
        log_success "Application EB existante: $app_name"
    else
        aws elasticbeanstalk create-application \
            --region "$AWS_REGION" \
            --application-name "$app_name" \
            --description "Symphonia Platform - $app_name" &>> "$LOG_FILE"

        log_success "Application EB créée: $app_name"
    fi
}

create_eb_environment() {
    local app_name="$1"
    local env_name="$2"
    local service_name="$3"
    local version_label="$4"

    log "Création environnement EB: $env_name"

    # Check if environment exists
    if aws elasticbeanstalk describe-environments \
        --region "$AWS_REGION" \
        --environment-names "$env_name" \
        --no-include-deleted &> /dev/null 2>&1; then

        log_success "Environnement EB existant: $env_name"
        return 0
    fi

    # Get option settings based on service
    local option_settings=$(get_env_option_settings "$service_name")

    # Create environment
    aws elasticbeanstalk create-environment \
        --region "$AWS_REGION" \
        --application-name "$app_name" \
        --environment-name "$env_name" \
        --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
        --version-label "$version_label" \
        --tier Name=WebServer,Type=Standard \
        --option-settings "$option_settings" &>> "$LOG_FILE"

    log_success "Environnement EB créé: $env_name (démarrage en cours...)"
}

get_env_option_settings() {
    local service="$1"
    local mongodb_uri="${MONGODB_URI}"

    # Base settings
    local settings='[
        {
            "Namespace": "aws:autoscaling:launchconfiguration",
            "OptionName": "InstanceType",
            "Value": "t3.small"
        },
        {
            "Namespace": "aws:autoscaling:asg",
            "OptionName": "MinSize",
            "Value": "1"
        },
        {
            "Namespace": "aws:autoscaling:asg",
            "OptionName": "MaxSize",
            "Value": "4"
        },
        {
            "Namespace": "aws:elasticbeanstalk:environment",
            "OptionName": "EnvironmentType",
            "Value": "LoadBalanced"
        },
        {
            "Namespace": "aws:elasticbeanstalk:environment",
            "OptionName": "ServiceRole",
            "Value": "aws-elasticbeanstalk-service-role"
        },
        {
            "Namespace": "aws:elasticbeanstalk:healthreporting:system",
            "OptionName": "SystemType",
            "Value": "enhanced"
        }'

    # Add environment variables based on service
    case "$service" in
        "tms-sync-eb")
            settings+='
        ,{
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "MONGODB_URI",
            "Value": "'"$mongodb_uri"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AWS_REGION",
            "Value": "'"$AWS_REGION"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "CLOUDWATCH_METRICS_ENABLED",
            "Value": "true"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "ALERT_SMS_NUMBER",
            "Value": "'"${ALERT_SMS_NUMBER}"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "ALERT_EMAIL",
            "Value": "'"${ALERT_EMAIL:-admin@symphonia.com}"'"
        }'
            ;;
        "authz-eb")
            settings+='
        ,{
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "MONGODB_URI",
            "Value": "'"$mongodb_uri"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AWS_REGION",
            "Value": "'"$AWS_REGION"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AWS_SES_REGION",
            "Value": "'"$AWS_REGION"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AWS_SNS_REGION",
            "Value": "'"$AWS_REGION"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "SES_FROM_EMAIL",
            "Value": "'"${SES_FROM_EMAIL:-ne-pas-repondre@symphonia-controltower.com}"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "CLOUDWATCH_METRICS_ENABLED",
            "Value": "true"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "JWT_SECRET",
            "Value": "'"${JWT_SECRET:-RtProd2026KeyAuth0MainToken123456XY}"'"
        }'
            ;;
        "affret-ia-api-v2")
            settings+='
        ,{
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "MONGODB_URI",
            "Value": "'"$mongodb_uri"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AWS_REGION",
            "Value": "'"$AWS_REGION"'"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "CLOUDWATCH_METRICS_ENABLED",
            "Value": "true"
        },
        {
            "Namespace": "aws:elasticbeanstalk:application:environment",
            "OptionName": "AFFRETIA_ANALYTICS_ENABLED",
            "Value": "true"
        }'
            ;;
    esac

    settings+=']'

    echo "$settings"
}

create_application_version() {
    local app_name="$1"
    local version_label="$2"
    local s3_key="$3"

    log "Création version application: $version_label"

    aws elasticbeanstalk create-application-version \
        --region "$AWS_REGION" \
        --application-name "$app_name" \
        --version-label "$version_label" \
        --source-bundle S3Bucket="$S3_BUCKET_NAME",S3Key="$s3_key" \
        --description "Symphonia v2.2.0 - Automated deployment $(date +%Y-%m-%d)" &>> "$LOG_FILE"

    log_success "Version créée: $version_label"
}

deploy_service() {
    local service="$1"
    local app_name="${APP_PREFIX}-${service}"
    local env_name="${app_name}-${ENV_SUFFIX}"
    local version_label="v2.2.0-$(date +%Y%m%d-%H%M%S)"
    local s3_key_var="S3_KEY_${service//-/_}"
    local s3_key="${!s3_key_var}"

    print_header "Déploiement: $service"

    # 1. Create application
    create_eb_application "$app_name"

    # 2. Create application version
    create_application_version "$app_name" "$version_label" "$s3_key"

    # 3. Create or update environment
    if aws elasticbeanstalk describe-environments \
        --region "$AWS_REGION" \
        --environment-names "$env_name" \
        --no-include-deleted &> /dev/null 2>&1; then

        log "Mise à jour environnement existant: $env_name"

        aws elasticbeanstalk update-environment \
            --region "$AWS_REGION" \
            --environment-name "$env_name" \
            --version-label "$version_label" &>> "$LOG_FILE"

        log_success "Mise à jour lancée: $env_name"
    else
        create_eb_environment "$app_name" "$env_name" "$service" "$version_label"
    fi

    # 4. Wait for environment to be ready (optional)
    if [ "${WAIT_FOR_READY:-false}" = "true" ]; then
        log "Attente de l'environnement (peut prendre 5-10 min)..."

        aws elasticbeanstalk wait environment-updated \
            --region "$AWS_REGION" \
            --environment-names "$env_name" || true

        # Check health
        local health=$(aws elasticbeanstalk describe-environment-health \
            --region "$AWS_REGION" \
            --environment-name "$env_name" \
            --attribute-names HealthStatus \
            --query 'HealthStatus' \
            --output text 2>/dev/null || echo "Unknown")

        if [ "$health" = "Ok" ]; then
            log_success "Environnement prêt et en bonne santé: $env_name"
        else
            log_warning "Environnement démarré mais health status: $health"
        fi
    fi
}

configure_mongodb() {
    print_header "Configuration MongoDB"

    if [ -z "$MONGODB_URI" ]; then
        log_warning "MONGODB_URI non défini. Configuration MongoDB ignorée."
        return 0
    fi

    # Create MongoDB setup script
    local mongo_script="$DEPLOY_DIR/setup-mongodb.js"

    cat > "$mongo_script" << 'EOF'
// MongoDB Setup Script for Symphonia v2.2.0

// Switch to rt-technologie database
db = db.getSiblingDB('rt-technologie');

// Create monitoring_logs collection with indexes
if (!db.getCollectionNames().includes('monitoring_logs')) {
    db.createCollection('monitoring_logs');
    print('✓ Collection created: monitoring_logs');
}
db.monitoring_logs.createIndex({ timestamp: -1 });
db.monitoring_logs.createIndex({ 'anomalies.severity': 1 });
db.monitoring_logs.createIndex({ 'anomalies.type': 1 });
print('✓ Indexes created for monitoring_logs');

// Switch to rt-authz database
db = db.getSiblingDB('rt-authz');

// Create notification_logs collection
if (!db.getCollectionNames().includes('notification_logs')) {
    db.createCollection('notification_logs');
    print('✓ Collection created: notification_logs');
}
db.notification_logs.createIndex({ carrierId: 1 });
db.notification_logs.createIndex({ sentAt: -1 });
db.notification_logs.createIndex({ type: 1 });

// Create carrier_webhooks collection
if (!db.getCollectionNames().includes('carrier_webhooks')) {
    db.createCollection('carrier_webhooks');
    print('✓ Collection created: carrier_webhooks');
}
db.carrier_webhooks.createIndex({ carrierId: 1 });
db.carrier_webhooks.createIndex({ active: 1 });

// Create webhook_deliveries collection
if (!db.getCollectionNames().includes('webhook_deliveries')) {
    db.createCollection('webhook_deliveries');
    print('✓ Collection created: webhook_deliveries');
}
db.webhook_deliveries.createIndex({ webhookId: 1 });
db.webhook_deliveries.createIndex({ createdAt: -1 });
db.webhook_deliveries.createIndex({ status: 1 });

// Create email_logs collection
if (!db.getCollectionNames().includes('email_logs')) {
    db.createCollection('email_logs');
    print('✓ Collection created: email_logs');
}
db.email_logs.createIndex({ sentAt: -1 });
db.email_logs.createIndex({ status: 1 });
db.email_logs.createIndex({ type: 1 });
db.email_logs.createIndex({ to: 1 });
db.email_logs.createIndex({ carrierId: 1 });
db.email_logs.createIndex({ type: 1, status: 1, sentAt: -1 });
db.email_logs.createIndex({ status: 1, sentAt: -1 });

// Switch to affretia database
db = db.getSiblingDB('affretia');

// Create affretia_trial_tracking collection
if (!db.getCollectionNames().includes('affretia_trial_tracking')) {
    db.createCollection('affretia_trial_tracking');
    print('✓ Collection created: affretia_trial_tracking');
}
db.affretia_trial_tracking.createIndex({ carrierId: 1 }, { unique: true });
db.affretia_trial_tracking.createIndex({ status: 1 });
db.affretia_trial_tracking.createIndex({ eligibleAt: -1 });
db.affretia_trial_tracking.createIndex({ trialActivatedAt: -1 });

print('\n✓ MongoDB configuration complete!');
EOF

    log "Exécution du script MongoDB..."

    if command -v mongosh &> /dev/null; then
        mongosh "$MONGODB_URI" < "$mongo_script" &>> "$LOG_FILE"
        log_success "MongoDB configuré avec mongosh"
    elif command -v mongo &> /dev/null; then
        mongo "$MONGODB_URI" < "$mongo_script" &>> "$LOG_FILE"
        log_success "MongoDB configuré avec mongo"
    else
        log_warning "Client MongoDB non installé. Script sauvegardé: $mongo_script"
        log_warning "Exécutez manuellement: mongosh '$MONGODB_URI' < $mongo_script"
    fi
}

validate_deployment() {
    print_header "Validation du Déploiement"

    for service in "${!SERVICES[@]}"; do
        local app_name="${APP_PREFIX}-${service}"
        local env_name="${app_name}-${ENV_SUFFIX}"

        log "Vérification: $env_name"

        # Get environment URL
        local env_url=$(aws elasticbeanstalk describe-environments \
            --region "$AWS_REGION" \
            --environment-names "$env_name" \
            --query 'Environments[0].CNAME' \
            --output text 2>/dev/null || echo "")

        if [ -n "$env_url" ] && [ "$env_url" != "None" ]; then
            log_success "URL: http://$env_url"

            # Test health endpoint
            if curl -s "http://$env_url/health" &> /dev/null; then
                log_success "Health check: OK"
            else
                log_warning "Health check: En attente..."
            fi
        else
            log_warning "URL non disponible (environnement en cours de création)"
        fi
    done
}

generate_deployment_summary() {
    print_header "Résumé du Déploiement"

    local summary_file="$DEPLOY_DIR/deployment-summary-$(date +%Y%m%d-%H%M%S).txt"

    {
        echo "SYMPHONIA PLATFORM - DÉPLOIEMENT AWS"
        echo "===================================="
        echo ""
        echo "Date: $(date)"
        echo "Version: v2.2.0"
        echo "Région AWS: $AWS_REGION"
        echo "Account ID: $AWS_ACCOUNT_ID"
        echo ""
        echo "SERVICES DÉPLOYÉS"
        echo "-----------------"

        for service in "${!SERVICES[@]}"; do
            local app_name="${APP_PREFIX}-${service}"
            local env_name="${app_name}-${ENV_SUFFIX}"

            echo ""
            echo "Service: $service"
            echo "  Application: $app_name"
            echo "  Environnement: $env_name"

            local env_url=$(aws elasticbeanstalk describe-environments \
                --region "$AWS_REGION" \
                --environment-names "$env_name" \
                --query 'Environments[0].CNAME' \
                --output text 2>/dev/null || echo "N/A")

            if [ "$env_url" != "N/A" ] && [ "$env_url" != "None" ]; then
                echo "  URL: http://$env_url"
            fi
        done

        echo ""
        echo "AWS SERVICES CONFIGURÉS"
        echo "-----------------------"
        echo "  SES Domain: ${SES_DOMAIN:-symphonia-controltower.com}"
        echo "  SES Email: ${SES_FROM_EMAIL:-ne-pas-repondre@symphonia-controltower.com}"
        echo "  SNS Topic: ${SNS_TOPIC_ARN:-N/A}"
        echo "  S3 Bucket: ${S3_BUCKET_NAME}"
        echo ""
        echo "MONGODB COLLECTIONS"
        echo "-------------------"
        echo "  rt-technologie:"
        echo "    - monitoring_logs"
        echo "  rt-authz:"
        echo "    - notification_logs"
        echo "    - carrier_webhooks"
        echo "    - webhook_deliveries"
        echo "    - email_logs"
        echo "  affretia:"
        echo "    - affretia_trial_tracking"
        echo ""
        echo "LOG FICHIER"
        echo "-----------"
        echo "  $LOG_FILE"
        echo ""

    } > "$summary_file"

    cat "$summary_file"

    log_success "Résumé sauvegardé: $summary_file"
}

################################################################################
# Main
################################################################################

main() {
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║    SYMPHONIA PLATFORM - DÉPLOIEMENT AWS             ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
    echo "Version: 2.2.0"
    echo "Date: $(date)"
    echo "Log: $LOG_FILE"
    echo ""

    # Create deploy directory if needed
    mkdir -p "$DEPLOY_DIR"

    # Run deployment steps
    check_prerequisites
    configure_aws_ses
    configure_aws_sns
    create_s3_bucket_for_packages
    upload_packages_to_s3

    # Deploy each service
    for service in "${!SERVICES[@]}"; do
        deploy_service "$service"
    done

    # Configure MongoDB
    configure_mongodb

    # Validate deployment
    if [ "${SKIP_VALIDATION:-false}" != "true" ]; then
        validate_deployment
    fi

    # Generate summary
    generate_deployment_summary

    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║           DÉPLOIEMENT TERMINÉ AVEC SUCCÈS            ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
    echo "Consultez le log complet: $LOG_FILE"
    echo ""
}

# Execute main
main "$@"
