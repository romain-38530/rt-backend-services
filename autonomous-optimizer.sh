#!/bin/bash
################################################################################
# AWS Autonomous Optimizer - Symphonia Platform
################################################################################
# Description:
#   Système d'optimisation autonome qui monitore et optimise automatiquement
#   les ressources AWS selon des règles prédéfinies.
#
# Usage:
#   bash autonomous-optimizer.sh [--dry-run] [--report-only]
#
# Options:
#   --dry-run       Simulation sans modifications réelles
#   --report-only   Génère uniquement un rapport d'opportunités
#   --auto         Mode automatique complet (optimisations safe)
#
# Cron recommandé: 0 2 * * * /path/to/autonomous-optimizer.sh --auto
################################################################################

set -euo pipefail

# Ajouter le répertoire du script au PATH (support Windows jq.exe)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$SCRIPT_DIR:$PATH"

# Configuration
REGION="eu-central-1"
REPORT_DIR="./reports/autonomous-optimization"
BACKUP_DIR="./backups/autonomous"
LOG_FILE="$REPORT_DIR/autonomous-optimizer-$(date +%Y%m%d-%H%M%S).log"
EMAIL_ALERT="devops@symphonia.com"  # Configurer si nécessaire

# Mode d'exécution
DRY_RUN=false
REPORT_ONLY=false
AUTO_MODE=false

# Compteurs
OPPORTUNITIES_FOUND=0
OPTIMIZATIONS_APPLIED=0
SAVINGS_MONTHLY=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true; shift ;;
        --report-only) REPORT_ONLY=true; shift ;;
        --auto) AUTO_MODE=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Créer répertoires
mkdir -p "$REPORT_DIR" "$BACKUP_DIR"

################################################################################
# Fonctions Utilitaires
################################################################################

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "✓ $1"
}

log_warning() {
    log "⚠ $1"
}

log_error() {
    log "✗ $1"
}

log_opportunity() {
    log "💡 OPPORTUNITÉ: $1"
    OPPORTUNITIES_FOUND=$((OPPORTUNITIES_FOUND + 1))
}

send_alert() {
    local subject=$1
    local message=$2

    # Envoyer notification (configurer selon votre système)
    # aws sns publish --topic-arn "arn:aws:sns:..." --subject "$subject" --message "$message"
    log "📧 Alert: $subject"
}

################################################################################
# Vérifications de Sécurité
################################################################################

check_prerequisites() {
    log "Vérification des prérequis..."

    # AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI non installé"
        exit 1
    fi

    # Credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "Credentials AWS invalides"
        exit 1
    fi

    # jq (support Windows jq.exe)
    if ! command -v jq &> /dev/null && ! command -v jq.exe &> /dev/null; then
        log_error "jq non installé"
        exit 1
    fi

    log_success "Prérequis OK"
}

create_backup() {
    local resource_type=$1
    local backup_name="$BACKUP_DIR/${resource_type}-$(date +%Y%m%d-%H%M%S).json"

    log "Backup: $backup_name"
    return 0
}

################################################################################
# Module 1: Détection Elastic IPs Non Attachées
################################################################################

optimize_elastic_ips() {
    log "=== Module: Elastic IPs Non Attachées ==="

    # Trouver les EIPs non attachées
    local unattached_eips=$(aws ec2 describe-addresses \
        --region "$REGION" \
        --query 'Addresses[?AssociationId==`null`]' \
        --output json)

    local count=$(echo "$unattached_eips" | jq 'length')

    if [ "$count" -eq 0 ]; then
        log "Aucune Elastic IP non attachée"
        return 0
    fi

    log_opportunity "Trouvé $count Elastic IP(s) non attachée(s) - Économie: $((count * 4))€/mois"

    if [ "$REPORT_ONLY" = true ]; then
        return 0
    fi

    # Libérer les EIPs (si permissions)
    echo "$unattached_eips" | jq -r '.[].AllocationId' | while read alloc_id; do
        local public_ip=$(echo "$unattached_eips" | jq -r ".[] | select(.AllocationId==\"$alloc_id\") | .PublicIp")

        log "Libération EIP: $public_ip ($alloc_id)"

        if [ "$DRY_RUN" = false ] && [ "$AUTO_MODE" = true ]; then
            if aws ec2 release-address --allocation-id "$alloc_id" --region "$REGION" 2>/dev/null; then
                log_success "EIP libérée: $public_ip"
                ((OPTIMIZATIONS_APPLIED++))
                SAVINGS_MONTHLY=$((SAVINGS_MONTHLY + 4))
            else
                log_warning "Échec libération EIP: $alloc_id (permissions manquantes?)"
            fi
        else
            log "[DRY-RUN] Libérerait EIP: $public_ip"
        fi
    done
}

################################################################################
# Module 2: Instances EC2 Arrêtées Depuis Longtemps
################################################################################

optimize_stopped_instances() {
    log "=== Module: Instances Arrêtées Anciennes ==="

    # Trouver instances arrêtées depuis > 30 jours
    local cutoff_date=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-30d +%Y-%m-%dT%H:%M:%S)

    local stopped_instances=$(aws ec2 describe-instances \
        --region "$REGION" \
        --filters "Name=instance-state-name,Values=stopped" \
        --query "Reservations[].Instances[?LaunchTime<'$cutoff_date'].[InstanceId,InstanceType,LaunchTime,Tags[?Key=='Name'].Value|[0]]" \
        --output json 2>/dev/null)

    local count=$(echo "$stopped_instances" | jq 'length' 2>/dev/null || echo "0")

    if [ "$count" -eq 0 ] || [ -z "$count" ]; then
        log "Aucune instance arrêtée ancienne"
        return 0
    fi

    log_opportunity "Trouvé $count instance(s) arrêtée(s) depuis >30 jours"
    log "ACTION MANUELLE REQUISE: Vérifier si ces instances peuvent être terminées"
    return 0
}

################################################################################
# Module 3: Volumes EBS Non Attachés
################################################################################

optimize_unattached_volumes() {
    log "=== Module: Volumes EBS Non Attachés ==="

    local unattached_volumes=$(aws ec2 describe-volumes \
        --region "$REGION" \
        --filters "Name=status,Values=available" \
        --query 'Volumes[*].[VolumeId,Size,VolumeType,CreateTime]' \
        --output json)

    local count=$(echo "$unattached_volumes" | jq 'length')

    if [ "$count" -eq 0 ]; then
        log "Aucun volume EBS non attaché"
        return 0
    fi

    # Calculer économie (prix moyen gp3: 0.08€/GB/mois)
    local total_size=$(echo "$unattached_volumes" | jq '[.[1]] | add')
    local monthly_cost=$(echo "$total_size * 0.08" | bc)

    log_opportunity "Trouvé $count volume(s) non attaché(s) - Taille: ${total_size}GB - Économie: ${monthly_cost}€/mois"

    if [ "$REPORT_ONLY" = true ]; then
        return 0
    fi

    # Snapshot + suppression si > 90 jours
    local cutoff_date=$(date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-90d +%Y-%m-%dT%H:%M:%S)

    echo "$unattached_volumes" | jq -r '.[]' | while read -r volume_data; do
        local volume_id=$(echo "$volume_data" | jq -r '.[0]')
        local size=$(echo "$volume_data" | jq -r '.[1]')
        local create_time=$(echo "$volume_data" | jq -r '.[3]')

        if [[ "$create_time" < "$cutoff_date" ]]; then
            log "Volume ancien non attaché: $volume_id (${size}GB)"

            if [ "$DRY_RUN" = false ] && [ "$AUTO_MODE" = true ]; then
                # Créer snapshot avant suppression
                local snapshot_id=$(aws ec2 create-snapshot \
                    --volume-id "$volume_id" \
                    --description "Backup before auto-cleanup $(date)" \
                    --region "$REGION" \
                    --query 'SnapshotId' \
                    --output text)

                log "Snapshot créé: $snapshot_id"

                # Supprimer le volume
                if aws ec2 delete-volume --volume-id "$volume_id" --region "$REGION"; then
                    log_success "Volume supprimé: $volume_id"
                    ((OPTIMIZATIONS_APPLIED++))
                    local vol_saving=$(echo "$size * 0.08" | bc)
                    SAVINGS_MONTHLY=$(echo "$SAVINGS_MONTHLY + $vol_saving" | bc)
                fi
            else
                log "[DRY-RUN] Créerait snapshot + supprimerait: $volume_id"
            fi
        fi
    done
}

################################################################################
# Module 4: Snapshots EBS Anciens
################################################################################

optimize_old_snapshots() {
    log "=== Module: Snapshots EBS Anciens ==="

    # Trouver snapshots > 180 jours
    local cutoff_date=$(date -u -d '180 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-180d +%Y-%m-%dT%H:%M:%S)

    local old_snapshots=$(aws ec2 describe-snapshots \
        --region "$REGION" \
        --owner-ids self \
        --query "Snapshots[?StartTime<'$cutoff_date'].[SnapshotId,VolumeSize,StartTime,Description]" \
        --output json)

    local count=$(echo "$old_snapshots" | jq 'length')

    if [ "$count" -eq 0 ]; then
        log "Aucun snapshot ancien (>180 jours)"
        return 0
    fi

    # Calculer économie (prix snapshot: 0.05€/GB/mois)
    local total_size=$(echo "$old_snapshots" | jq '[.[1]] | add')
    local monthly_cost=$(echo "$total_size * 0.05" | bc)

    log_opportunity "Trouvé $count snapshot(s) ancien(s) - Taille: ${total_size}GB - Économie: ${monthly_cost}€/mois"

    # Ne pas supprimer automatiquement (risque perte données)
    log_warning "ACTION MANUELLE REQUISE: Vérifier et nettoyer snapshots anciens"
}

################################################################################
# Module 5: Load Balancers Non Utilisés
################################################################################

optimize_unused_load_balancers() {
    log "=== Module: Load Balancers Non Utilisés ==="

    # Trouver ALBs avec 0 targets sains
    local albs=$(aws elbv2 describe-load-balancers \
        --region "$REGION" \
        --query 'LoadBalancers[*].[LoadBalancerArn,LoadBalancerName,CreatedTime]' \
        --output json)

    local unused_count=0

    echo "$albs" | jq -r '.[] | @tsv' | while IFS=$'\t' read -r arn name created_time; do
        # Vérifier les target groups
        local target_groups=$(aws elbv2 describe-target-groups \
            --load-balancer-arn "$arn" \
            --region "$REGION" \
            --query 'TargetGroups[*].TargetGroupArn' \
            --output json 2>/dev/null || echo '[]')

        local has_healthy_targets=false

        echo "$target_groups" | jq -r '.[]' | while read -r tg_arn; do
            local healthy=$(aws elbv2 describe-target-health \
                --target-group-arn "$tg_arn" \
                --region "$REGION" \
                --query 'length(TargetHealthDescriptions[?TargetHealth.State==`healthy`])' \
                --output text 2>/dev/null || echo "0")

            if [ "$healthy" -gt 0 ]; then
                has_healthy_targets=true
                break
            fi
        done

        if [ "$has_healthy_targets" = false ]; then
            log_opportunity "ALB sans targets sains: $name - Économie: 25€/mois"
            ((unused_count++))

            # Ne pas supprimer automatiquement (trop risqué)
            log_warning "ACTION MANUELLE REQUISE: Vérifier ALB $name"
        fi
    done

    if [ "$unused_count" -eq 0 ]; then
        log "Tous les ALBs ont des targets actifs"
    fi
}

################################################################################
# Module 6: CloudFront Distribution Non Optimisée
################################################################################

optimize_cloudfront_distributions() {
    log "=== Module: CloudFront Optimisations ==="

    local distributions=$(aws cloudfront list-distributions \
        --query 'DistributionList.Items[*].[Id,DefaultCacheBehavior.Compress,HttpVersion]' \
        --output json)

    local total=$(echo "$distributions" | jq 'length')
    local needs_optimization=0

    echo "$distributions" | jq -r '.[] | @tsv' | while IFS=$'\t' read -r dist_id compress http_version; do
        local needs_update=false
        local updates=""

        if [ "$compress" != "true" ]; then
            needs_update=true
            updates="$updates compression"
        fi

        if [[ "$http_version" != "http3"* ]]; then
            needs_update=true
            updates="$updates http3"
        fi

        if [ "$needs_update" = true ]; then
            log_opportunity "CloudFront $dist_id nécessite:$updates"
            ((needs_optimization++))

            # Auto-optimisation si mode AUTO
            if [ "$DRY_RUN" = false ] && [ "$AUTO_MODE" = true ]; then
                log "Auto-optimisation CloudFront: $dist_id"

                # Obtenir config actuelle
                local config_file="$BACKUP_DIR/cloudfront-$dist_id-config.json"
                aws cloudfront get-distribution-config \
                    --id "$dist_id" > "$config_file"

                local etag=$(jq -r '.ETag' "$config_file")

                # Modifier config
                jq '.DistributionConfig |
                    .DefaultCacheBehavior.Compress = true |
                    .HttpVersion = "http3"' "$config_file" > "$config_file.new"

                # Appliquer
                if aws cloudfront update-distribution \
                    --id "$dist_id" \
                    --if-match "$etag" \
                    --distribution-config "file://$config_file.new" > /dev/null 2>&1; then
                    log_success "CloudFront $dist_id optimisé"
                    ((OPTIMIZATIONS_APPLIED++))
                else
                    log_warning "Échec optimisation CloudFront $dist_id"
                fi
            fi
        fi
    done

    if [ "$needs_optimization" -eq 0 ]; then
        log "Toutes les distributions CloudFront sont optimisées"
    fi
}

################################################################################
# Module 7: Monitoring CPU pour Auto-Scaling
################################################################################

check_underutilized_instances() {
    log "=== Module: Instances Sous-Utilisées ==="

    # Vérifier toutes les instances running
    local instances=$(aws ec2 describe-instances \
        --region "$REGION" \
        --filters "Name=instance-state-name,Values=running" \
        --query 'Reservations[*].Instances[*].[InstanceId,InstanceType,Tags[?Key==`Name`].Value|[0]]' \
        --output json | jq -c '.[][]')

    local underutilized_count=0

    echo "$instances" | while IFS= read -r instance; do
        local instance_id=$(echo "$instance" | jq -r '.[0]')
        local instance_type=$(echo "$instance" | jq -r '.[1]')
        local instance_name=$(echo "$instance" | jq -r '.[2]')

        # Vérifier CPU moyenne sur 7 jours
        local avg_cpu=$(aws cloudwatch get-metric-statistics \
            --namespace AWS/EC2 \
            --metric-name CPUUtilization \
            --dimensions Name=InstanceId,Value="$instance_id" \
            --start-time "$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -v-7d +%Y-%m-%dT%H:%M:%S)" \
            --end-time "$(date -u +%Y-%m-%dT%H:%M:%S)" \
            --period 86400 \
            --statistics Average \
            --region "$REGION" \
            --query 'Datapoints[*].Average' \
            --output json | jq 'add/length')

        if [ $(echo "$avg_cpu" | awk '{print ($1 < 5)}') -eq 1 ]; then
            log_opportunity "Instance sous-utilisée: $instance_name ($instance_id) - CPU: ${avg_cpu}%"
            ((underutilized_count++))

            # Suggérer downgrade si t3.small
            if [[ "$instance_type" == "t3.small" ]]; then
                log "  → Suggestion: Downgrade vers t3.micro (économie: 7.5€/mois)"
            fi
        fi
    done

    if [ "$underutilized_count" -eq 0 ]; then
        log "Aucune instance significativement sous-utilisée"
    fi
}

################################################################################
# Module 8: Détection Services Qui Pourraient Auto-Scale
################################################################################

suggest_autoscaling_opportunities() {
    log "=== Module: Opportunités Auto-Scaling ==="

    # Vérifier les instances EB sans auto-scaling programmé
    local eb_envs=$(aws elasticbeanstalk describe-environments \
        --region "$REGION" \
        --query 'Environments[?Status==`Ready`].EnvironmentName' \
        --output json)

    local count_without_autoscaling=0

    echo "$eb_envs" | jq -r '.[]' | while read -r env_name; do
        # Obtenir l'ASG
        local asg_name=$(aws elasticbeanstalk describe-environment-resources \
            --environment-name "$env_name" \
            --region "$REGION" \
            --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
            --output text 2>/dev/null)

        if [ -z "$asg_name" ] || [ "$asg_name" = "None" ]; then
            continue
        fi

        # Vérifier scheduled actions
        local scheduled_actions=$(aws autoscaling describe-scheduled-actions \
            --auto-scaling-group-name "$asg_name" \
            --region "$REGION" \
            --query 'ScheduledUpdateGroupActions' \
            --output json 2>/dev/null || echo '[]')

        if [ "$(echo "$scheduled_actions" | jq 'length')" -eq 0 ]; then
            # Vérifier si service non-critique (pas "auth", "api-", etc.)
            if [[ ! "$env_name" =~ (auth|api-core|critical) ]]; then
                log_opportunity "Service sans auto-scaling: $env_name - Économie potentielle: 8-10€/mois"
                ((count_without_autoscaling++))
            fi
        fi
    done

    if [ "$count_without_autoscaling" -eq 0 ]; then
        log "Tous les services éligibles ont de l'auto-scaling"
    fi
}

################################################################################
# Génération du Rapport
################################################################################

generate_report() {
    local report_file="$REPORT_DIR/optimization-report-$(date +%Y%m%d-%H%M%S).md"

    cat > "$report_file" <<EOF
# Rapport d'Optimisation Autonome AWS

**Date:** $(date '+%Y-%m-%d %H:%M:%S')
**Mode:** $( [ "$DRY_RUN" = true ] && echo "Dry-Run" || echo "Production" )
**Région:** $REGION

---

## 📊 Résumé

- **Opportunités détectées:** $OPPORTUNITIES_FOUND
- **Optimisations appliquées:** $OPTIMIZATIONS_APPLIED
- **Économies estimées:** ${SAVINGS_MONTHLY}€/mois

---

## 🔍 Détails

Voir le log complet: \`$LOG_FILE\`

---

## 🎯 Actions Recommandées

### Actions Automatiques Appliquées
$( [ "$OPTIMIZATIONS_APPLIED" -gt 0 ] && echo "- $OPTIMIZATIONS_APPLIED optimisation(s) appliquée(s) automatiquement" || echo "- Aucune optimisation automatique appliquée" )

### Actions Manuelles Requises
Consultez le log pour les actions nécessitant intervention manuelle.

---

## 📈 Prochaine Exécution

Recommandée: $(date -d '+1 day' '+%Y-%m-%d 02:00:00' 2>/dev/null || date -v+1d '+%Y-%m-%d 02:00:00')

---

**Généré par:** AWS Autonomous Optimizer v1.0
EOF

    log "Rapport généré: $report_file"
    echo "$report_file"
}

################################################################################
# Fonction Principale
################################################################################

main() {
    log "=========================================="
    log "AWS Autonomous Optimizer - Démarrage"
    log "=========================================="
    log "Mode: $( [ "$DRY_RUN" = true ] && echo "DRY-RUN" || echo "PRODUCTION" )"
    log "Auto: $( [ "$AUTO_MODE" = true ] && echo "Oui" || echo "Non" )"
    log "Report Only: $( [ "$REPORT_ONLY" = true ] && echo "Oui" || echo "Non" )"
    log ""

    # Prérequis
    check_prerequisites

    # Exécution des modules
    optimize_elastic_ips
    optimize_stopped_instances
    optimize_unattached_volumes
    optimize_old_snapshots
    optimize_unused_load_balancers
    optimize_cloudfront_distributions
    check_underutilized_instances
    suggest_autoscaling_opportunities

    # Rapport final
    log ""
    log "=========================================="
    log "Résumé de l'Exécution"
    log "=========================================="
    log "Opportunités trouvées: $OPPORTUNITIES_FOUND"
    log "Optimisations appliquées: $OPTIMIZATIONS_APPLIED"
    log "Économies mensuelles: ${SAVINGS_MONTHLY}€"
    log ""

    # Générer rapport
    local report_path=$(generate_report)

    # Alertes si opportunités importantes
    if [ "$OPPORTUNITIES_FOUND" -gt 5 ]; then
        send_alert "AWS Optimizer: $OPPORTUNITIES_FOUND opportunités détectées" \
                   "Consultez le rapport: $report_path"
    fi

    log "✓ Optimisation autonome terminée"

    # Exit code
    if [ "$OPPORTUNITIES_FOUND" -gt 0 ] && [ "$OPTIMIZATIONS_APPLIED" -eq 0 ] && [ "$AUTO_MODE" = true ]; then
        exit 1  # Opportunités détectées mais non appliquées
    fi

    exit 0
}

# Exécution
main "$@"
