#!/bin/bash
#
# Phase 4: Prerequisites Checker
# Verifies all requirements before executing downgrade
#
# Usage: bash check-prerequisites.sh
#

set -e

# Configuration
REGION="eu-central-1"
REQUIRED_INSTANCES=12

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0

print_header() {
    echo ""
    echo "========================================================================"
    echo " $1"
    echo "========================================================================"
    echo ""
}

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

check_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((CHECKS_WARNING++))
}

check_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check 1: AWS CLI installed
check_aws_cli() {
    print_header "Check 1: AWS CLI Installation"

    if command -v aws &> /dev/null; then
        local version=$(aws --version 2>&1 | cut -d' ' -f1)
        check_pass "AWS CLI is installed: $version"
    else
        check_fail "AWS CLI is not installed"
        check_info "Install: https://aws.amazon.com/cli/"
        return 1
    fi
}

# Check 2: AWS credentials configured
check_aws_credentials() {
    print_header "Check 2: AWS Credentials"

    if aws sts get-caller-identity &> /dev/null; then
        local account=$(aws sts get-caller-identity --query 'Account' --output text)
        local user=$(aws sts get-caller-identity --query 'Arn' --output text)
        check_pass "AWS credentials configured"
        check_info "Account: $account"
        check_info "Identity: $user"

        # Verify account ID
        if [ "$account" = "004843574253" ]; then
            check_pass "Correct AWS account (004843574253)"
        else
            check_warning "Different AWS account detected: $account"
            check_warning "Expected: 004843574253"
        fi
    else
        check_fail "AWS credentials not configured or invalid"
        check_info "Run: aws configure"
        return 1
    fi
}

# Check 3: EC2 permissions
check_ec2_permissions() {
    print_header "Check 3: EC2 Permissions"

    if aws ec2 describe-instances --region "$REGION" --max-results 1 &> /dev/null; then
        check_pass "EC2 read permissions (describe-instances)"
    else
        check_fail "Missing EC2 read permissions"
        return 1
    fi

    # Note: Cannot test stop/start/modify without actually doing it
    check_warning "EC2 write permissions (stop/start/modify) cannot be verified without execution"
    check_info "Required permissions: ec2:StopInstances, ec2:StartInstances, ec2:ModifyInstanceAttribute"
}

# Check 4: CloudWatch permissions
check_cloudwatch_permissions() {
    print_header "Check 4: CloudWatch Permissions"

    if aws cloudwatch list-metrics --namespace AWS/EC2 --region "$REGION" --max-items 1 &> /dev/null; then
        check_pass "CloudWatch read permissions"
    else
        check_warning "CloudWatch permissions limited"
        check_info "Not critical for downgrade, but useful for monitoring"
    fi
}

# Check 5: Instance accessibility
check_instances() {
    print_header "Check 5: Target Instances"

    local instances=(
        "i-07aba2934ad4ed933"
        "i-02260cfd794e7f43f"
        "i-03eb51b3c798e010f"
        "i-07eb45cf006ecc67a"
        "i-02b6585e3c7790e87"
        "i-0e6d027777df2b7c5"
        "i-0a7f175d40c307e46"
        "i-02dd7db8947118d4d"
        "i-04abe8e887385e2a2"
        "i-04aeb2a387461a326"
        "i-0c4bbdcabfcc1c478"
        "i-093ef6b78139d9574"
    )

    local accessible=0
    local not_found=0
    local wrong_type=0

    for instance_id in "${instances[@]}"; do
        local result=$(aws ec2 describe-instances \
            --instance-ids "$instance_id" \
            --region "$REGION" \
            --query 'Reservations[0].Instances[0].[InstanceId,InstanceType,State.Name,Tags[?Key==`Name`].Value|[0]]' \
            --output text 2>/dev/null)

        if [ -n "$result" ]; then
            local type=$(echo "$result" | awk '{print $2}')
            local state=$(echo "$result" | awk '{print $3}')
            local name=$(echo "$result" | awk '{print $4}')

            if [ "$type" = "t3.small" ]; then
                check_pass "$instance_id ($name) - Type: $type, State: $state"
                ((accessible++))
            elif [ "$type" = "t3.micro" ]; then
                check_warning "$instance_id ($name) - Already t3.micro (State: $state)"
                ((accessible++))
                ((wrong_type++))
            else
                check_warning "$instance_id ($name) - Unexpected type: $type (State: $state)"
                ((accessible++))
                ((wrong_type++))
            fi
        else
            check_fail "$instance_id - NOT FOUND or NO ACCESS"
            ((not_found++))
        fi
    done

    echo ""
    check_info "Summary: $accessible/$REQUIRED_INSTANCES instances accessible"
    if [ $not_found -gt 0 ]; then
        check_warning "$not_found instances not found or not accessible"
    fi
    if [ $wrong_type -gt 0 ]; then
        check_warning "$wrong_type instances already t3.micro or different type"
    fi

    if [ $accessible -eq $REQUIRED_INSTANCES ]; then
        check_pass "All target instances are accessible"
    else
        check_fail "Some target instances are not accessible"
        return 1
    fi
}

# Check 6: Scripts availability
check_scripts() {
    print_header "Check 6: Required Scripts"

    local scripts=(
        "downgrade-instances.sh"
        "rollback-instances.sh"
    )

    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ] || [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
                check_pass "$script exists"
            else
                check_warning "$script exists but is not executable"
                check_info "Make executable: chmod +x $script"
            fi
        else
            check_fail "$script not found"
        fi
    done
}

# Check 7: Analysis files
check_analysis_files() {
    print_header "Check 7: Analysis Files"

    local files=(
        "cpu-analysis-results.json"
        "phase4-cpu-analysis.md"
        "savings-plan-recommendation.md"
    )

    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            check_pass "$file exists"
        else
            check_warning "$file not found"
            check_info "Not critical, but recommended for reference"
        fi
    done
}

# Check 8: Disk space
check_disk_space() {
    print_header "Check 8: Disk Space"

    if command -v df &> /dev/null; then
        local free_space=$(df -h . | tail -1 | awk '{print $4}')
        check_pass "Available disk space: $free_space"
        check_info "Sufficient for logs and execution"
    else
        check_warning "Cannot check disk space (df command not available)"
    fi
}

# Check 9: Python (for analysis scripts)
check_python() {
    print_header "Check 9: Python Installation (Optional)"

    if command -v python &> /dev/null; then
        local version=$(python --version 2>&1)
        check_pass "Python is installed: $version"

        # Check boto3
        if python -c "import boto3" &> /dev/null; then
            check_pass "boto3 library is installed"
        else
            check_warning "boto3 library not installed"
            check_info "Install: pip install boto3"
            check_info "Not required for downgrade, but useful for analysis"
        fi
    else
        check_warning "Python not installed"
        check_info "Not required for downgrade execution"
    fi
}

# Check 10: Network connectivity
check_network() {
    print_header "Check 10: Network Connectivity"

    if aws ec2 describe-regions --region us-east-1 &> /dev/null; then
        check_pass "AWS API connectivity"
    else
        check_fail "Cannot reach AWS API"
        check_info "Check internet connection and firewall"
        return 1
    fi
}

# Main execution
main() {
    clear
    echo "========================================================================"
    echo " Phase 4: Prerequisites Checker"
    echo " RT Backend Services - AWS Optimization"
    echo "========================================================================"
    echo ""
    echo "This script verifies all requirements before executing the downgrade."
    echo "Region: $REGION"
    echo ""
    read -p "Press Enter to start checks..." -r
    echo ""

    # Run all checks
    check_aws_cli
    check_aws_credentials
    check_ec2_permissions
    check_cloudwatch_permissions
    check_instances
    check_scripts
    check_analysis_files
    check_disk_space
    check_python
    check_network

    # Summary
    print_header "Prerequisites Check Summary"

    echo -e "${GREEN}Checks passed:${NC}   $CHECKS_PASSED"
    echo -e "${YELLOW}Warnings:${NC}        $CHECKS_WARNING"
    echo -e "${RED}Checks failed:${NC}   $CHECKS_FAILED"
    echo ""

    if [ $CHECKS_FAILED -eq 0 ]; then
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}✓ ALL CRITICAL CHECKS PASSED${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo "You can proceed with the downgrade:"
        echo "  1. Test first: bash downgrade-instances.sh --dry-run"
        echo "  2. Execute: bash downgrade-instances.sh"
        echo ""

        if [ $CHECKS_WARNING -gt 0 ]; then
            echo -e "${YELLOW}Note: $CHECKS_WARNING warning(s) detected${NC}"
            echo "Review warnings above, but they are not blocking."
            echo ""
        fi

        exit 0
    else
        echo -e "${RED}========================================${NC}"
        echo -e "${RED}✗ PREREQUISITES CHECK FAILED${NC}"
        echo -e "${RED}========================================${NC}"
        echo ""
        echo "Please fix the issues above before proceeding."
        echo "Critical failures: $CHECKS_FAILED"
        echo ""
        exit 1
    fi
}

# Run main
main
