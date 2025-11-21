#!/bin/bash

# Build and push Docker images to AWS ECR
# Usage: ./build-and-push.sh [service-name]

set -e

ECR_REGISTRY="${ECR_REGISTRY:-}"
AWS_REGION="${AWS_REGION:-eu-west-3}"
SERVICE_NAME="${1:-all}"

if [ -z "$ECR_REGISTRY" ]; then
  echo "❌ Error: ECR_REGISTRY environment variable is required"
  exit 1
fi

echo "🔨 Building and pushing Docker images"
echo "Registry: $ECR_REGISTRY"

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
)

build_and_push() {
  local service=$1
  local image_name="rt-$service"
  local full_image="$ECR_REGISTRY/$image_name:latest"
  local commit_sha=$(git rev-parse --short HEAD)
  local commit_image="$ECR_REGISTRY/$image_name:$commit_sha"

  echo "📦 Building $service..."

  # Build Docker image
  docker build \
    -t "$image_name:latest" \
    -t "$full_image" \
    -t "$commit_image" \
    -f "services/$service/Dockerfile" \
    .

  echo "⬆️  Pushing $service to ECR..."

  # Push to ECR
  docker push "$full_image"
  docker push "$commit_image"

  echo "✅ $service pushed successfully"
}

if [ "$SERVICE_NAME" == "all" ]; then
  echo "Building all services..."
  for service in "${SERVICES[@]}"; do
    build_and_push "$service"
  done
else
  echo "Building single service: $SERVICE_NAME"
  build_and_push "$SERVICE_NAME"
fi

echo ""
echo "🎉 Build and push complete!"
