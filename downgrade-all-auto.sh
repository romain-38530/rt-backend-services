#!/bin/bash
# Auto downgrade all remaining instances

REGION="eu-central-1"
NEW_TYPE="t3.micro"

INSTANCES=(
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

echo "=== Phase 4a: Downgrade Instances to t3.micro ==="
echo "Total: ${#INSTANCES[@]} instances"
echo ""

success=0
skip=0
fail=0

for inst in "${INSTANCES[@]}"; do
    id="${inst%%:*}"
    name="${inst##*:}"
    
    echo "--- $name ($id) ---"
    
    # Check current type
    current_type=$(aws ec2 describe-instances --instance-ids "$id" --region "$REGION" --query 'Reservations[0].Instances[0].InstanceType' --output text 2>/dev/null)
    current_state=$(aws ec2 describe-instances --instance-ids "$id" --region "$REGION" --query 'Reservations[0].Instances[0].State.Name' --output text 2>/dev/null)
    
    echo "Current: $current_type ($current_state)"
    
    if [ "$current_type" = "$NEW_TYPE" ]; then
        echo "✓ Already t3.micro, skipping"
        ((skip++))
        echo ""
        continue
    fi
    
    # Stop if running
    if [ "$current_state" = "running" ]; then
        echo "Stopping..."
        aws ec2 stop-instances --instance-ids "$id" --region "$REGION" > /dev/null
        aws ec2 wait instance-stopped --instance-ids "$id" --region "$REGION" 2>/dev/null
        echo "✓ Stopped"
    fi
    
    # Modify
    echo "Modifying to $NEW_TYPE..."
    aws ec2 modify-instance-attribute --instance-id "$id" --instance-type "Value=$NEW_TYPE" --region "$REGION"
    echo "✓ Modified"
    
    # Start
    echo "Starting..."
    aws ec2 start-instances --instance-ids "$id" --region "$REGION" > /dev/null
    aws ec2 wait instance-running --instance-ids "$id" --region "$REGION" 2>/dev/null
    echo "✓ Started"
    
    echo "✅ $name: t3.small → t3.micro"
    ((success++))
    echo ""
    sleep 5
done

echo "=== RESULTS ==="
echo "Success: $success"
echo "Skipped: $skip"
echo "Failed: $fail"
echo ""
echo "Monthly savings: $(echo "$success * 7.5" | bc) EUR"
