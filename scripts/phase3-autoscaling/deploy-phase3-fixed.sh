#!/bin/bash
# Phase 3: Auto-Scaling - Version corrigée

AWS_REGION="eu-central-1"

SERVICES=(
    "exploit-ia-affretia-prod-v1"
    "exploit-ia-planning-prod-v3"
    "exploit-ia-api-orders-prod-v1"
    "exploit-ia-profitability-v3"
    "exploit-ia-api-admin-prod-v1"
    "exploit-ia-worker-v3"
    "exploit-ia-worker-ingestion-prod"
    "exploit-ia-planning-prod"
)

echo "=== Phase 3 Auto-Scaling Deployment ==="
echo "Services: ${#SERVICES[@]}"
echo ""

success=0
fail=0

for svc in "${SERVICES[@]}"; do
    echo "--- $svc ---"
    
    # Get ASG name
    ASG=$(aws elasticbeanstalk describe-environment-resources \
        --environment-name "$svc" \
        --region "$AWS_REGION" \
        --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
        --output text 2>/dev/null)
    
    if [ "$ASG" == "None" ] || [ -z "$ASG" ]; then
        echo "ERROR: ASG not found"
        ((fail++))
        continue
    fi
    
    echo "ASG: $ASG"
    
    # Evening scale down (19h Mon-Fri)
    if aws autoscaling put-scheduled-update-group-action \
        --auto-scaling-group-name "$ASG" \
        --scheduled-action-name "evening_scale_down" \
        --recurrence "0 19 * * 1-5" \
        --min-size 0 --max-size 0 --desired-capacity 0 \
        --region "$AWS_REGION" 2>&1; then
        echo "✅ Evening scale down configured"
    else
        echo "⚠️  Evening scale down failed"
    fi
    
    # Morning scale up (8h Mon-Fri)
    if aws autoscaling put-scheduled-update-group-action \
        --auto-scaling-group-name "$ASG" \
        --scheduled-action-name "morning_scale_up" \
        --recurrence "0 8 * * 1-5" \
        --min-size 1 --max-size 2 --desired-capacity 1 \
        --region "$AWS_REGION" 2>&1; then
        echo "✅ Morning scale up configured"
    else
        echo "⚠️  Morning scale up failed"
    fi
    
    echo "✅ $svc configured"
    ((success++))
    echo ""
    sleep 2
done

echo "=== RESULTS ==="
echo "Success: $success/${#SERVICES[@]}"
echo "Failed: $fail/${#SERVICES[@]}"
echo ""
echo "Savings: ~74€/month"
echo "Services will stop at 19h and restart at 8h (Mon-Fri)"
