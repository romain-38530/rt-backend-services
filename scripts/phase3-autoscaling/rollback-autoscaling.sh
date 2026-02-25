#!/bin/bash
# Script de Rollback: Supprimer l'auto-scaling des services Exploit-IA
# Usage: ./rollback-autoscaling.sh [service-name|all]

set -e

TARGET=${1:-all}
AWS_REGION="eu-central-1"
LOG_FILE="autoscaling-rollback-$(date +%Y%m%d-%H%M%S').log"

# Tous les services configurés
ALL_SERVICES=(
    "exploit-ia-affretia-prod-v1"
    "exploit-ia-planning-prod-v3"
    "exploit-ia-api-orders-prod-v1"
    "exploit-ia-profitability-v3"
    "exploit-ia-api-admin-prod-v1"
    "exploit-ia-worker-v3"
    "exploit-ia-worker-ingestion-prod"
    "exploit-ia-planning-prod"
)

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

rollback_service() {
    local env_name=$1
    
    log "========================================="
    log "Rollback: $env_name"
    log "========================================="
    
    # Obtenir l'ASG name
    log "Recherche de l'ASG..."
    local asg_name=$(aws elasticbeanstalk describe-environment-resources \
        --environment-name "$env_name" \
        --region "$AWS_REGION" \
        --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
        --output text 2>/dev/null)
    
    if [ "$asg_name" == "None" ] || [ -z "$asg_name" ]; then
        log "ERROR: ASG non trouvé pour $env_name"
        return 1
    fi
    
    log "ASG trouvé: $asg_name"
    
    # Supprimer evening_scale_down
    log "Suppression de evening_scale_down..."
    if aws autoscaling delete-scheduled-action \
        --auto-scaling-group-name "$asg_name" \
        --scheduled-action-name "evening_scale_down" \
        --region "$AWS_REGION" 2>&1 | tee -a "$LOG_FILE"; then
        log "✓ Evening scale down supprimé"
    else
        log "⚠ Peut-être déjà supprimé ou inexistant"
    fi
    
    # Supprimer morning_scale_up
    log "Suppression de morning_scale_up..."
    if aws autoscaling delete-scheduled-action \
        --auto-scaling-group-name "$asg_name" \
        --scheduled-action-name "morning_scale_up" \
        --region "$AWS_REGION" 2>&1 | tee -a "$LOG_FILE"; then
        log "✓ Morning scale up supprimé"
    else
        log "⚠ Peut-être déjà supprimé ou inexistant"
    fi
    
    # Remettre MinSize=1, MaxSize=4
    log "Restauration des valeurs par défaut (MinSize=1, MaxSize=4)..."
    if aws autoscaling update-auto-scaling-group \
        --auto-scaling-group-name "$asg_name" \
        --min-size 1 \
        --max-size 4 \
        --region "$AWS_REGION" 2>&1 | tee -a "$LOG_FILE"; then
        log "✓ Paramètres restaurés"
    else
        log "✗ Erreur lors de la restauration"
        return 1
    fi
    
    log "✓ Rollback terminé pour $env_name"
    echo ""
    return 0
}

# Afficher le mode
log "========================================="
log "Rollback Auto-Scaling Exploit-IA"
log "Target: $TARGET"
log "Log file: $LOG_FILE"
log "========================================="
echo ""

if [ "$TARGET" == "all" ]; then
    echo "⚠ ATTENTION: Vous allez supprimer l'auto-scaling de TOUS les services"
    read -p "Êtes-vous sûr? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Rollback annulé par l'utilisateur"
        exit 0
    fi
    
    success_count=0
    fail_count=0
    
    for service in "${ALL_SERVICES[@]}"; do
        if rollback_service "$service"; then
            ((success_count++))
        else
            ((fail_count++))
        fi
        sleep 1
    done
    
    log "========================================="
    log "RAPPORT FINAL"
    log "========================================="
    log "Rollback réussi: $success_count/8"
    log "Rollback échoué: $fail_count/8"
else
    rollback_service "$TARGET"
fi

log ""
log "Rollback terminé. Log complet: $LOG_FILE"
