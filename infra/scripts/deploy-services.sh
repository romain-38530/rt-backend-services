#!/bin/bash

# Deploy services to AWS ECS
# Usage: ./deploy-services.sh [service-name]
# If no service name is provided, all services will be deployed

set -e

AWS_REGION="${AWS_REGION:-eu-west-3}"
CLUSTER_NAME="rt-technologie-cluster"
SERVICE_NAME="${1:-all}"

echo "🚀 Deploying services to AWS ECS"
echo "Region: $AWS_REGION"
echo "Cluster: $CLUSTER_NAME"

# List of all services
SERVICES=(
  "admin-gateway"
  "authz"
  "core-orders"
  "notifications"
  "planning"
  "palette"
  "vigilance"
  "affret-ia"
  "chatbot"
  "geo-tracking"
  "storage-market"
  "tms-sync"
  "ecpmr"
  "training"
  "bourse"
  "erp-sync"
  "wms-sync"
  "tracking-ia"
  "pricing-grids"
  "client-onboarding"
)

deploy_service() {
  local service=$1
  echo "📦 Deploying $service..."

  # Update ECS service to force new deployment
  aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "rt-$service" \
    --force-new-deployment \
    --region "$AWS_REGION" \
    > /dev/null

  echo "✅ $service deployment triggered"
}

if [ "$SERVICE_NAME" == "all" ]; then
  echo "Deploying all services..."
  for service in "${SERVICES[@]}"; do
    deploy_service "$service"
  done
else
  echo "Deploying single service: $SERVICE_NAME"
  deploy_service "$SERVICE_NAME"
fi

echo ""
echo "🎉 Deployment complete!"
echo "Monitor status with: aws ecs describe-services --cluster $CLUSTER_NAME --services rt-$SERVICE_NAME --region $AWS_REGION"
