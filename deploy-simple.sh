#!/bin/bash
# Simple deployment script for new services

set -e

echo "=== RT Backend Services - Simple Deployment ==="
echo ""

# Check prerequisites
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI not found"
    exit 1
fi

if ! command -v python &> /dev/null; then
    echo "Error: Python not found"
    exit 1
fi

echo "✓ AWS CLI found"
echo "✓ Python found"
echo ""

# Check AWS credentials
echo "Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "Error: AWS credentials not configured"
    exit 1
fi

echo "✓ AWS credentials OK"
echo ""

# Since the monorepo services can't be deployed directly,
# we inform the user about manual deployment steps
echo "DEPLOYMENT OPTIONS:"
echo ""
echo "Option 1: Use existing deployed Planning service (already on AWS)"
echo "  - Already deployed at: http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com"
echo ""
echo "Option 2: Deploy notifications manually:"
echo "  1. Create standalone version based on authz-eb template"
echo "  2. Copy services/notifications/src to new standalone directory"
echo "  3. Add dependencies to package.json"
echo "  4. Run: eb init && eb create && eb deploy"
echo ""
echo "Option 3: Deploy geo-tracking manually (same process)"
echo ""
echo "The issue: Monorepo services need to be converted to standalone format first."
echo "This requires bundling shared packages (@rt/contracts, @rt/utils, etc.)"
echo ""
echo "RECOMMENDATION:"
echo "Since notifications and geo-tracking are complete and working locally,"
echo "the best approach is to:"
echo "1. Test them locally first: pnpm dev"
echo "2. Then create standalone deployable versions manually"
echo "3. Or wait for the PowerShell script fix"
echo ""
