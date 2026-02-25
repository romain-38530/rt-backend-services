#!/bin/bash
# Phase 3: Auto-Scaling pour UN service Exploit-IA
# Usage: ./deploy-autoscaling-single.sh <env-name> <app-name>

set -e

ENV_NAME=$1
APP_NAME=$2
AWS_REGION="eu-central-1"

if [ -z "$ENV_NAME" ] || [ -z "$APP_NAME" ]; then
    echo "Usage: $0 <env-name> <app-name>"
    echo "Exemple: $0 exploit-ia-planning-prod exploit-ia-planning"
    exit 1
fi

echo "=== Auto-Scaling Configuration ==="
echo "Environment: $ENV_NAME"
echo "Application: $APP_NAME"
echo "Region: $AWS_REGION"
echo ""

# Obtenir l'ASG name
echo "Recherche de l'Auto Scaling Group..."
ASG_NAME=$(aws elasticbeanstalk describe-environment-resources \
    --environment-name "$ENV_NAME" \
    --region "$AWS_REGION" \
    --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
    --output text)

if [ "$ASG_NAME" == "None" ] || [ -z "$ASG_NAME" ]; then
    echo "ERROR: ASG non trouvé pour $ENV_NAME"
    exit 1
fi

echo "ASG trouvé: $ASG_NAME"
echo ""

# Créer scheduled action: Evening Scale Down (19h Lun-Ven)
echo "Création: evening_scale_down (19h Lun-Ven)"
aws autoscaling put-scheduled-update-group-action \
    --auto-scaling-group-name "$ASG_NAME" \
    --scheduled-action-name "evening_scale_down" \
    --recurrence "0 19 * * 1-5" \
    --min-size 0 \
    --max-size 0 \
    --desired-capacity 0 \
    --region "$AWS_REGION"

echo "✓ Evening scale down créé"
echo ""

# Créer scheduled action: Morning Scale Up (8h Lun-Ven)
echo "Création: morning_scale_up (8h Lun-Ven)"
aws autoscaling put-scheduled-update-group-action \
    --auto-scaling-group-name "$ASG_NAME" \
    --scheduled-action-name "morning_scale_up" \
    --recurrence "0 8 * * 1-5" \
    --min-size 1 \
    --max-size 2 \
    --desired-capacity 1 \
    --region "$AWS_REGION"

echo "✓ Morning scale up créé"
echo ""

# Vérifier les scheduled actions créées
echo "Vérification des scheduled actions:"
aws autoscaling describe-scheduled-actions \
    --auto-scaling-group-name "$ASG_NAME" \
    --region "$AWS_REGION" \
    --query 'ScheduledUpdateGroupActions[].[ScheduledActionName,Recurrence,MinSize,MaxSize]' \
    --output table

echo ""
echo "=== Configuration terminée avec succès! ==="
echo "Surveillance recommandée:"
echo "  - 19h: Vérifier que l'instance s'arrête"
echo "  - 8h: Vérifier que l'instance redémarre"
