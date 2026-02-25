#!/bin/bash
# Script de vérification: État de l'auto-scaling des services Exploit-IA
# Usage: ./check-autoscaling-status.sh

set -e

AWS_REGION="eu-central-1"

# Services à vérifier
ALL_SERVICES=(
    "exploit-ia-api-auth-prod-v1"
    "exploit-ia-affretia-prod-v1"
    "exploit-ia-planning-prod-v3"
    "exploit-ia-api-orders-prod-v1"
    "exploit-ia-profitability-v3"
    "exploit-ia-api-admin-prod-v1"
    "exploit-ia-worker-v3"
    "exploit-ia-worker-ingestion-prod"
    "exploit-ia-planning-prod"
)

echo "========================================="
echo "État Auto-Scaling - Services Exploit-IA"
echo "Date: $(date)"
echo "========================================="
echo ""

for env_name in "${ALL_SERVICES[@]}"; do
    echo "--- $env_name ---"
    
    # Obtenir l'ASG name
    asg_name=$(aws elasticbeanstalk describe-environment-resources \
        --environment-name "$env_name" \
        --region "$AWS_REGION" \
        --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
        --output text 2>/dev/null)
    
    if [ "$asg_name" == "None" ] || [ -z "$asg_name" ]; then
        echo "  ERROR: ASG non trouvé"
        echo ""
        continue
    fi
    
    echo "  ASG: $asg_name"
    
    # État actuel de l'ASG
    asg_info=$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$asg_name" \
        --region "$AWS_REGION" \
        --query 'AutoScalingGroups[0].[MinSize,MaxSize,DesiredCapacity]' \
        --output text 2>/dev/null)
    
    read -r min_size max_size desired <<< "$asg_info"
    echo "  MinSize: $min_size | MaxSize: $max_size | Desired: $desired"
    
    # Instances en cours
    instance_count=$(aws autoscaling describe-auto-scaling-groups \
        --auto-scaling-group-names "$asg_name" \
        --region "$AWS_REGION" \
        --query 'length(AutoScalingGroups[0].Instances)' \
        --output text 2>/dev/null)
    
    echo "  Instances actives: $instance_count"
    
    # Scheduled actions
    scheduled_actions=$(aws autoscaling describe-scheduled-actions \
        --auto-scaling-group-name "$asg_name" \
        --region "$AWS_REGION" \
        --query 'ScheduledUpdateGroupActions[].[ScheduledActionName,Recurrence,MinSize,MaxSize]' \
        --output text 2>/dev/null)
    
    if [ -z "$scheduled_actions" ]; then
        echo "  Scheduled Actions: Aucune (24/7)"
    else
        echo "  Scheduled Actions:"
        echo "$scheduled_actions" | while read -r line; do
            echo "    $line"
        done
    fi
    
    # Santé EB
    eb_health=$(aws elasticbeanstalk describe-environments \
        --environment-names "$env_name" \
        --region "$AWS_REGION" \
        --query 'Environments[0].Health' \
        --output text 2>/dev/null)
    
    echo "  Santé EB: $eb_health"
    echo ""
done

echo "========================================="
echo "Résumé"
echo "========================================="

echo ""
echo "Services avec auto-scaling configuré:"
for env_name in "${ALL_SERVICES[@]}"; do
    asg_name=$(aws elasticbeanstalk describe-environment-resources \
        --environment-name "$env_name" \
        --region "$AWS_REGION" \
        --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
        --output text 2>/dev/null)
    
    if [ "$asg_name" != "None" ] && [ -n "$asg_name" ]; then
        scheduled_count=$(aws autoscaling describe-scheduled-actions \
            --auto-scaling-group-name "$asg_name" \
            --region "$AWS_REGION" \
            --query 'length(ScheduledUpdateGroupActions)' \
            --output text 2>/dev/null)
        
        if [ "$scheduled_count" -gt 0 ]; then
            echo "  ✓ $env_name ($scheduled_count scheduled actions)"
        else
            echo "  ○ $env_name (24/7)"
        fi
    fi
done

echo ""
echo "Vérifications recommandées:"
echo "  - 19h: Les instances doivent s'arrêter (DesiredCapacity=0)"
echo "  - 8h: Les instances doivent redémarrer (DesiredCapacity=1)"
echo "  - Surveiller les logs CloudWatch pour erreurs"
