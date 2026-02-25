#!/bin/bash
# Phase 3: Auto-Scaling pour TOUS les services Exploit-IA

set -e

MODE=${1:-dry-run}
AWS_REGION="eu-central-1"
LOG_FILE="autoscaling-$(date +%Y%m%d-%H%M%S).log"

BUSINESS_HOURS=(
    "exploit-ia-affretia-prod-v1"
    "exploit-ia-planning-prod-v3"
    "exploit-ia-api-orders-prod-v1"
    "exploit-ia-profitability-v3"
)

ADMIN_WORKERS=(
    "exploit-ia-api-admin-prod-v1"
    "exploit-ia-worker-v3"
    "exploit-ia-worker-ingestion-prod"
    "exploit-ia-planning-prod"
)

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

configure_service() {
    local env_name=$1
    log "--- $env_name ---"
    
    local asg_name=$(aws elasticbeanstalk describe-environment-resources         --environment-name "$env_name"         --region "$AWS_REGION"         --query 'EnvironmentResources.AutoScalingGroups[0].Name'         --output text 2>/dev/null)
    
    if [ "$asg_name" == "None" ] || [ -z "$asg_name" ]; then
        log "ERROR: ASG non trouvé"
        return 1
    fi
    
    log "ASG: $asg_name"
    
    if [ "$MODE" == "dry-run" ]; then
        log "[DRY-RUN] Scheduled actions:"
        log "  - evening_scale_down: 19h Lun-Ven (0/0/0)"
        log "  - morning_scale_up: 8h Lun-Ven (1/2/1)"
        return 0
    fi
    
    log "Création evening_scale_down..."
    aws autoscaling put-scheduled-update-group-action         --auto-scaling-group-name "$asg_name"         --scheduled-action-name "evening_scale_down"         --recurrence "0 19 * * 1-5"         --min-size 0 --max-size 0 --desired-capacity 0         --region "$AWS_REGION" 2>&1 | tee -a "$LOG_FILE"
    
    log "Création morning_scale_up..."
    aws autoscaling put-scheduled-update-group-action         --auto-scaling-group-name "$asg_name"         --scheduled-action-name "morning_scale_up"         --recurrence "0 8 * * 1-5"         --min-size 1 --max-size 2 --desired-capacity 1         --region "$AWS_REGION" 2>&1 | tee -a "$LOG_FILE"
    
    log "OK: $env_name"
    return 0
}

log "Phase 3 Auto-Scaling - Mode: $MODE"
log "Log: $LOG_FILE"

if [ "$MODE" == "dry-run" ]; then
    log ""
    log "=== DRY-RUN MODE ==="
    log "Aucune modification ne sera appliquée"
    log ""
fi

success=0
fail=0

log "=== Business Hours (4 services) ==="
for svc in "${BUSINESS_HOURS[@]}"; do
    if configure_service "$svc"; then
        ((success++))
    else
        ((fail++))
    fi
    sleep 1
done

log ""
log "=== Admin/Workers (4 services) ==="
for svc in "${ADMIN_WORKERS[@]}"; do
    if configure_service "$svc"; then
        ((success++))
    else
        ((fail++))
    fi
    sleep 1
done

log ""
log "=== RAPPORT ==="
log "Succès: $success/8"
log "Échecs: $fail/8"

if [ "$MODE" == "dry-run" ]; then
    log ""
    log "Pour déployer: ./deploy-autoscaling-all.sh deploy"
    log "Économies: ~74€/mois (54.5%)"
else
    if [ $fail -eq 0 ]; then
        log "Déploiement réussi!"
        log "Surveillez à 19h et 8h"
    else
        log "Déploiement partiel - vérifiez les erreurs"
    fi
fi
