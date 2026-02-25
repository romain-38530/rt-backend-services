#!/bin/bash
# Script d'investigation Phase 1B - Actions à Valider
# Économie potentielle: 42€/mois

set -e

REGION="eu-central-1"

echo "================================================"
echo "PHASE 1B: INVESTIGATION - INSTANCES AMBIGÜES"
echo "================================================"
echo ""

# Instance 1: rt-subscriptions-api-prod-v5
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Instance 1: rt-subscriptions-api-prod-v5"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Vérification des environnements Elastic Beanstalk..."
echo ""

aws elasticbeanstalk describe-environments --region $REGION \
  --application-name rt-subscriptions-api \
  --query "Environments[].[EnvironmentName,Status,Health,DateCreated,DateUpdated]" \
  --output table

echo ""
echo "Vérification des instances EC2..."
echo ""

aws ec2 describe-instances --region $REGION \
  --filters "Name=tag:elasticbeanstalk:environment-name,Values=rt-subscriptions-api-prod-v5,rt-subscriptions-api-prod-v2" \
  --query "Reservations[*].Instances[*].[InstanceId,Tags[?Key=='elasticbeanstalk:environment-name'].Value|[0],State.Name,LaunchTime,PrivateIpAddress]" \
  --output table

echo ""
echo "Vérification du trafic (Target Groups)..."
echo ""

# Trouver les target groups associés
aws elbv2 describe-target-groups --region $REGION \
  --query "TargetGroups[?contains(TargetGroupName,'subscriptions')].{Name:TargetGroupName,Health:HealthCheckPath}" \
  --output table

echo ""
echo ""

# Instance 2 & 3: rt-tms-sync-api
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Instances 2-3: rt-tms-sync-api (3 versions)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Vérification des environnements Elastic Beanstalk..."
echo ""

aws elasticbeanstalk describe-environments --region $REGION \
  --application-name rt-api-tms-sync \
  --query "Environments[].[EnvironmentName,Status,Health,DateCreated,DateUpdated]" \
  --output table

echo ""
echo "Vérification des instances EC2..."
echo ""

aws ec2 describe-instances --region $REGION \
  --filters "Name=tag:Name,Values=rt-tms-sync-api*" "Name=instance-state-name,Values=running" \
  --query "Reservations[*].Instances[*].[InstanceId,Tags[?Key=='Name'].Value|[0],State.Name,LaunchTime,PrivateIpAddress]" \
  --output table

echo ""
echo "Vérification du trafic (Target Groups)..."
echo ""

aws elbv2 describe-target-groups --region $REGION \
  --query "TargetGroups[?contains(TargetGroupName,'tms-sync')].{Name:TargetGroupName,Health:HealthCheckPath}" \
  --output table

echo ""
echo ""

# Investigation ElastiCache Redis
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ElastiCache Redis: Usage Analysis"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Cluster: exploit-ia-redis"
echo ""

# Obtenir les métriques CloudWatch pour les 7 derniers jours
echo "Récupération des métriques CloudWatch (7 derniers jours)..."
echo ""

aws cloudwatch get-metric-statistics --region $REGION \
  --namespace AWS/ElastiCache \
  --metric-name NetworkBytesIn \
  --dimensions Name=CacheClusterId,Value=exploit-ia-redis \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average,Maximum \
  --query "Datapoints[*].[Timestamp,Average,Maximum]" \
  --output table

echo ""
echo "Connexions actives..."
echo ""

aws cloudwatch get-metric-statistics --region $REGION \
  --namespace AWS/ElastiCache \
  --metric-name CurrConnections \
  --dimensions Name=CacheClusterId,Value=exploit-ia-redis \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 86400 \
  --statistics Average,Maximum \
  --query "Datapoints[*].[Timestamp,Average,Maximum]" \
  --output table

echo ""
echo ""
echo "================================================"
echo "ANALYSE TERMINÉE"
echo "================================================"
echo ""
echo "Actions recommandées:"
echo ""
echo "1. Analyser les résultats ci-dessus"
echo "2. Identifier les environnements actifs vs anciens"
echo "3. Vérifier l'usage Redis dans les logs applicatifs"
echo "4. Décider quelles instances peuvent être supprimées"
echo ""
