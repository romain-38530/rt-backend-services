#!/bin/bash

# Script d'Analyse des Coûts AWS - Symphonia Platform
# Version: 1.0
# Date: 2026-02-23

echo "======================================"
echo "📊 Analyse des Coûts AWS - Symphonia"
echo "======================================"
echo ""

# Vérifier que AWS CLI est installé
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI n'est pas installé"
    echo "Installation: https://aws.amazon.com/cli/"
    exit 1
fi

# Vérifier les credentials AWS
echo "🔐 Vérification des credentials AWS..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ Credentials AWS non configurés"
    echo "Exécutez: aws configure"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region || echo "eu-central-1")

echo "✓ Compte AWS: $ACCOUNT_ID"
echo "✓ Région: $REGION"
echo ""

# Dates pour l'analyse
START_DATE=$(date -d "first day of last month" +%Y-%m-01 2>/dev/null || date -v-1m -v1d +%Y-%m-01)
END_DATE=$(date +%Y-%m-01)
CURRENT_MONTH_START=$(date +%Y-%m-01)
TODAY=$(date +%Y-%m-%d)

echo "======================================"
echo "💰 Coûts du Mois Dernier"
echo "Période: $START_DATE à $END_DATE"
echo "======================================"
echo ""

# Coût total du mois dernier
echo "📊 Coût Total:"
aws ce get-cost-and-usage \
  --time-period Start=$START_DATE,End=$END_DATE \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --output json | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Total: \(.Amount) \(.Unit)"'

echo ""

# Coûts par service (Top 10)
echo "📦 Top 10 Services les Plus Coûteux (Mois Dernier):"
aws ce get-cost-and-usage \
  --time-period Start=$START_DATE,End=$END_DATE \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --output json | jq -r '.ResultsByTime[0].Groups | sort_by(.Metrics.BlendedCost.Amount | tonumber) | reverse | .[0:10] | .[] | "  \(.Keys[0] | ljust(40)): \(.Metrics.BlendedCost.Amount | tonumber | floor) \(.Metrics.BlendedCost.Unit)"'

echo ""
echo "======================================"
echo "📅 Coûts du Mois en Cours"
echo "Période: $CURRENT_MONTH_START à $TODAY"
echo "======================================"
echo ""

# Coût total du mois en cours
echo "📊 Coût Total (jusqu'à aujourd'hui):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --output json | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Total: \(.Amount) \(.Unit)"'

echo ""

# Projection du mois en cours
DAYS_ELAPSED=$(( ($(date +%s) - $(date -d $CURRENT_MONTH_START +%s)) / 86400 ))
DAYS_IN_MONTH=$(date -d "$CURRENT_MONTH_START +1 month -1 day" +%d)
CURRENT_COST=$(aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --output json | jq -r '.ResultsByTime[0].Total.BlendedCost.Amount')

PROJECTED_COST=$(echo "$CURRENT_COST * $DAYS_IN_MONTH / $DAYS_ELAPSED" | bc -l)

echo "📈 Projection Fin de Mois:"
echo "  Jours écoulés: $DAYS_ELAPSED / $DAYS_IN_MONTH"
echo "  Coût actuel: $CURRENT_COST USD"
printf "  Projection: %.2f USD\n" $PROJECTED_COST

echo ""
echo "======================================"
echo "🔍 Détails par Type de Ressource"
echo "======================================"
echo ""

# EC2 Instances
echo "💻 EC2 (Elastic Beanstalk):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Amazon Elastic Compute Cloud - Compute"]
    }
  }') \
  --output json 2>/dev/null | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Coût: \(.Amount) \(.Unit)"' || echo "  Aucune donnée"

# S3
echo ""
echo "📦 S3 (Stockage):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Amazon Simple Storage Service"]
    }
  }') \
  --output json 2>/dev/null | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Coût: \(.Amount) \(.Unit)"' || echo "  Aucune donnée"

# ElastiCache
echo ""
echo "🔴 ElastiCache (Redis):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Amazon ElastiCache"]
    }
  }') \
  --output json 2>/dev/null | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Coût: \(.Amount) \(.Unit)"' || echo "  Aucune donnée (pas d'ElastiCache actif)"

# CloudFront
echo ""
echo "🌐 CloudFront (CDN):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["Amazon CloudFront"]
    }
  }') \
  --output json 2>/dev/null | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Coût: \(.Amount) \(.Unit)"' || echo "  Aucune donnée"

# Data Transfer
echo ""
echo "📡 Data Transfer (Sortie de données):"
aws ce get-cost-and-usage \
  --time-period Start=$CURRENT_MONTH_START,End=$TODAY \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://<(echo '{
    "Dimensions": {
      "Key": "SERVICE",
      "Values": ["AWS Data Transfer"]
    }
  }') \
  --output json 2>/dev/null | jq -r '.ResultsByTime[0].Total.BlendedCost | "  Coût: \(.Amount) \(.Unit)"' || echo "  Aucune donnée"

echo ""
echo "======================================"
echo "🖥️ Inventaire des Ressources Actives"
echo "======================================"
echo ""

# EC2 Instances
echo "💻 Instances EC2 (Elastic Beanstalk):"
INSTANCE_COUNT=$(aws ec2 describe-instances \
  --filters "Name=instance-state-name,Values=running" \
  --query 'Reservations[*].Instances[*].[InstanceType]' \
  --output text | wc -l)

if [ "$INSTANCE_COUNT" -gt 0 ]; then
  aws ec2 describe-instances \
    --filters "Name=instance-state-name,Values=running" \
    --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value | [0], InstanceType, State.Name]' \
    --output table
else
  echo "  Aucune instance EC2 en cours d'exécution"
fi

# ElastiCache Clusters
echo ""
echo "🔴 Clusters ElastiCache (Redis):"
ELASTICACHE_COUNT=$(aws elasticache describe-cache-clusters \
  --query 'CacheClusters[*]' \
  --output json 2>/dev/null | jq '. | length' || echo 0)

if [ "$ELASTICACHE_COUNT" -gt 0 ]; then
  aws elasticache describe-cache-clusters \
    --query 'CacheClusters[*].[CacheClusterId, CacheNodeType, CacheClusterStatus]' \
    --output table
else
  echo "  ✓ Aucun cluster ElastiCache (Économie potentielle: 15€/mois)"
fi

# S3 Buckets
echo ""
echo "📦 Buckets S3:"
aws s3 ls | awk '{print "  - " $3}'

# Taille totale S3
echo ""
echo "💾 Taille Totale S3:"
TOTAL_SIZE=0
for bucket in $(aws s3 ls | awk '{print $3}'); do
  SIZE=$(aws s3 ls s3://$bucket --recursive --summarize 2>/dev/null | grep "Total Size" | awk '{print $3}')
  if [ -n "$SIZE" ]; then
    TOTAL_SIZE=$((TOTAL_SIZE + SIZE))
    SIZE_MB=$((SIZE / 1024 / 1024))
    echo "  $bucket: ${SIZE_MB}MB"
  fi
done
TOTAL_GB=$((TOTAL_SIZE / 1024 / 1024 / 1024))
echo "  ---"
echo "  Total: ${TOTAL_GB}GB"

echo ""
echo "======================================"
echo "💡 Recommandations d'Optimisation"
echo "======================================"
echo ""

# Analyser et recommander
RECOMMENDATION_COUNT=0

# Vérifier ElastiCache
if [ "$ELASTICACHE_COUNT" -gt 0 ]; then
  RECOMMENDATION_COUNT=$((RECOMMENDATION_COUNT + 1))
  echo "$RECOMMENDATION_COUNT. ⭐⭐⭐ Désactiver ElastiCache"
  echo "   Économie: ~15€/mois"
  echo "   Votre code a déjà un fallback sur cache mémoire"
  echo ""
fi

# Vérifier les instances EC2
if [ "$INSTANCE_COUNT" -gt 2 ]; then
  RECOMMENDATION_COUNT=$((RECOMMENDATION_COUNT + 1))
  echo "$RECOMMENDATION_COUNT. ⭐⭐⭐ Downgrade vers t3.micro"
  echo "   Économie: ~15-22€/mois"
  echo "   Services légers n'ont pas besoin de t3.small"
  echo ""
fi

# Vérifier S3
if [ "$TOTAL_GB" -gt 10 ]; then
  RECOMMENDATION_COUNT=$((RECOMMENDATION_COUNT + 1))
  echo "$RECOMMENDATION_COUNT. ⭐⭐ Activer S3 Intelligent-Tiering"
  echo "   Économie: ~2-5€/mois"
  echo "   Optimisation automatique du stockage"
  echo ""
fi

# Vérifier les Savings Plans
echo "$RECOMMENDATION_COUNT. ⭐ Envisager Reserved Instances ou Savings Plans"
echo "   Économie: ~30% (si engagement 1 an)"
echo ""

echo "======================================"
echo "📄 Rapport Généré"
echo "======================================"
echo ""
echo "Ce rapport a été généré le: $(date)"
echo ""
echo "Prochaines étapes:"
echo "  1. Examiner les recommandations ci-dessus"
echo "  2. Lire le fichier AWS_COST_OPTIMIZATION_PLAN.md"
echo "  3. Décider quelles optimisations implémenter"
echo ""
echo "Pour plus de détails:"
echo "  - AWS Console > Billing > Cost Explorer"
echo "  - AWS Console > Trusted Advisor > Cost Optimization"
echo ""
echo "✓ Analyse terminée"
