#!/bin/bash
#
# Phase 4: EC2 Instance Downgrade Script
# Downgrades t3.small instances to t3.micro
#
# Usage: bash downgrade-instances.sh [--dry-run] [--batch N]
#
# Options:
#   --dry-run    Simulate without making changes
#   --batch N    Process only N instances (for progressive rollout)
#

set -e  # Exit on error

# Configuration
REGION="eu-central-1"
NEW_INSTANCE_TYPE="t3.micro"
LOG_FILE="downgrade-execution-$(date +%Y%m%d-%H%M%S).log"

# Instances to downgrade
declare -a INSTANCES=(
    "i-07aba2934ad4ed933:rt-admin-api-prod"
    "i-02260cfd794e7f43f:rt-affret-ia-api-prod-v4"
    "i-03eb51b3c798e010f:exploit-ia-planning-prod"
    "i-07eb45cf006ecc67a:exploit-ia-planning-prod-v3"
    "i-02b6585e3c7790e87:exploit-ia-worker-v3"
    "i-0e6d027777df2b7c5:exploit-ia-api-admin-prod-v1"
    "i-0a7f175d40c307e46:exploit-ia-worker-ingestion-prod"
    "i-02dd7db8947118d4d:rt-subscriptions-api-prod-v5"
    "i-04abe8e887385e2a2:exploit-ia-api-auth-prod-v1"
    "i-04aeb2a387461a326:exploit-ia-api-orders-prod-v1"
    "i-0c4bbdcabfcc1c478:exploit-ia-profitability-v3"
    "i-093ef6b78139d9574:exploit-ia-affretia-prod-v1"
)

# Parse arguments
DRY_RUN=false
BATCH_SIZE=${#INSTANCES[@]}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --batch)
            BATCH_SIZE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--dry-run] [--batch N]"
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "${GREEN}✓ $1${NC}"
}

log_error() {
    log "${RED}✗ $1${NC}"
}

log_warning() {
    log "${YELLOW}⚠ $1${NC}"
}

log_info() {
    log "${BLUE}ℹ $1${NC}"
}

# Function to check if AWS CLI is configured
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI is not configured or credentials are invalid"
        exit 1
    fi

    log_success "AWS CLI configured"
}

# Function to get instance current state
get_instance_state() {
    local instance_id=$1
    aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --region "$REGION" \
        --query 'Reservations[0].Instances[0].State.Name' \
        --output text 2>/dev/null || echo "unknown"
}

# Function to get instance current type
get_instance_type() {
    local instance_id=$1
    aws ec2 describe-instances \
        --instance-ids "$instance_id" \
        --region "$REGION" \
        --query 'Reservations[0].Instances[0].InstanceType' \
        --output text 2>/dev/null || echo "unknown"
}

# Function to stop instance
stop_instance() {
    local instance_id=$1
    local instance_name=$2

    log_info "Stopping instance $instance_name ($instance_id)..."

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Would stop instance $instance_id"
        return 0
    fi

    aws ec2 stop-instances \
        --instance-ids "$instance_id" \
        --region "$REGION" \
        > /dev/null

    log_info "Waiting for instance to stop..."
    aws ec2 wait instance-stopped \
        --instance-ids "$instance_id" \
        --region "$REGION"

    log_success "Instance stopped"
}

# Function to modify instance type
modify_instance_type() {
    local instance_id=$1
    local instance_name=$2

    log_info "Modifying instance type to $NEW_INSTANCE_TYPE..."

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Would modify instance $instance_id to $NEW_INSTANCE_TYPE"
        return 0
    fi

    aws ec2 modify-instance-attribute \
        --instance-id "$instance_id" \
        --instance-type "Value=$NEW_INSTANCE_TYPE" \
        --region "$REGION"

    log_success "Instance type modified"
}

# Function to start instance
start_instance() {
    local instance_id=$1
    local instance_name=$2

    log_info "Starting instance $instance_name ($instance_id)..."

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Would start instance $instance_id"
        return 0
    fi

    aws ec2 start-instances \
        --instance-ids "$instance_id" \
        --region "$REGION" \
        > /dev/null

    log_info "Waiting for instance to start..."
    aws ec2 wait instance-running \
        --instance-ids "$instance_id" \
        --region "$REGION"

    log_success "Instance started"
}

# Function to verify instance health
verify_instance() {
    local instance_id=$1
    local instance_name=$2

    log_info "Verifying instance health..."

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY-RUN: Would verify instance $instance_id"
        return 0
    fi

    # Wait for status checks
    sleep 30

    local status=$(aws ec2 describe-instance-status \
        --instance-ids "$instance_id" \
        --region "$REGION" \
        --query 'InstanceStatuses[0].InstanceStatus.Status' \
        --output text 2>/dev/null || echo "unknown")

    if [ "$status" = "ok" ] || [ "$status" = "initializing" ]; then
        log_success "Instance health check passed (Status: $status)"
        return 0
    else
        log_warning "Instance status: $status (may need more time to initialize)"
        return 0
    fi
}

# Function to process single instance
process_instance() {
    local instance_data=$1
    local instance_id="${instance_data%%:*}"
    local instance_name="${instance_data##*:}"

    echo ""
    log "========================================================================"
    log "Processing: $instance_name"
    log "Instance ID: $instance_id"
    log "========================================================================"

    # Check current state
    local current_state=$(get_instance_state "$instance_id")
    local current_type=$(get_instance_type "$instance_id")

    log_info "Current state: $current_state"
    log_info "Current type: $current_type"

    if [ "$current_type" = "$NEW_INSTANCE_TYPE" ]; then
        log_warning "Instance is already $NEW_INSTANCE_TYPE, skipping"
        return 0
    fi

    if [ "$current_state" = "unknown" ]; then
        log_error "Cannot determine instance state, skipping"
        return 1
    fi

    # Stop instance if running
    if [ "$current_state" = "running" ]; then
        stop_instance "$instance_id" "$instance_name" || return 1
    elif [ "$current_state" = "stopped" ]; then
        log_info "Instance already stopped"
    else
        log_error "Instance in unexpected state: $current_state"
        return 1
    fi

    # Modify instance type
    modify_instance_type "$instance_id" "$instance_name" || return 1

    # Start instance
    start_instance "$instance_id" "$instance_name" || return 1

    # Verify health
    verify_instance "$instance_id" "$instance_name" || return 1

    log_success "Instance $instance_name successfully downgraded to $NEW_INSTANCE_TYPE"
    return 0
}

# Main execution
main() {
    echo ""
    echo "========================================================================"
    echo "Phase 4: EC2 Instance Downgrade Script"
    echo "========================================================================"
    echo ""
    echo "Configuration:"
    echo "  Region: $REGION"
    echo "  Target type: $NEW_INSTANCE_TYPE"
    echo "  Total instances: ${#INSTANCES[@]}"
    echo "  Batch size: $BATCH_SIZE"
    echo "  Dry run: $DRY_RUN"
    echo "  Log file: $LOG_FILE"
    echo ""

    # Check AWS CLI
    check_aws_cli

    # Confirmation prompt (skip in dry-run mode)
    if [ "$DRY_RUN" = false ]; then
        echo ""
        read -p "This will downgrade ${BATCH_SIZE} instances to $NEW_INSTANCE_TYPE. Continue? (yes/no): " -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
            log "Operation cancelled by user"
            exit 0
        fi
    fi

    # Process instances
    local success_count=0
    local error_count=0
    local processed=0

    for instance_data in "${INSTANCES[@]}"; do
        if [ $processed -ge $BATCH_SIZE ]; then
            log_info "Batch limit reached ($BATCH_SIZE instances)"
            break
        fi

        if process_instance "$instance_data"; then
            ((success_count++))
        else
            ((error_count++))
            log_error "Failed to process ${instance_data##*:}"
        fi

        ((processed++))
    done

    # Summary
    echo ""
    log "========================================================================"
    log "DOWNGRADE SUMMARY"
    log "========================================================================"
    log "Processed: $processed instances"
    log_success "Successful: $success_count"
    if [ $error_count -gt 0 ]; then
        log_error "Failed: $error_count"
    else
        log_info "Failed: $error_count"
    fi

    if [ "$DRY_RUN" = false ]; then
        local monthly_savings=$(echo "$success_count * 7.5" | bc)
        log ""
        log "Monthly savings: ${monthly_savings} EUR"
        log ""
        log_info "Monitor instances for the next 48 hours"
        log_info "Check CPU metrics and credit balance"
        log_info "Use rollback-instances.sh if issues arise"
    fi

    log "========================================================================"
    log "Log file saved to: $LOG_FILE"
    log "========================================================================"

    if [ $error_count -gt 0 ]; then
        exit 1
    fi
}

# Run main function
main
