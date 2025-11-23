#!/bin/bash

echo "🚀 Starting RT Technologie Backend Services"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Start infrastructure
echo "📦 Starting MongoDB and Redis..."
docker-compose up -d mongodb redis

# Wait for MongoDB to be ready
echo "⏳ Waiting for MongoDB to be ready..."
sleep 5

# Check MongoDB
if docker exec rt-mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
  echo "✅ MongoDB is ready"
else
  echo "⚠️  MongoDB is starting... (this may take a few more seconds)"
fi

# Check Redis
if docker exec rt-redis redis-cli ping > /dev/null 2>&1; then
  echo "✅ Redis is ready"
else
  echo "⚠️  Redis is starting..."
fi

echo ""
echo "🎯 Starting backend services..."
echo ""
echo "Services will start on the following ports:"
echo "  - admin-gateway:    http://localhost:3001"
echo "  - authz:            http://localhost:3002"
echo "  - notifications:    http://localhost:3004"
echo "  - planning:         http://localhost:3005"
echo "  - tms-sync:         http://localhost:3006"
echo "  - core-orders:      http://localhost:3007"
echo "  - vigilance:        http://localhost:3008"
echo "  - palette:          http://localhost:3009"
echo "  - affret-ia:        http://localhost:3010"
echo "  - training:         http://localhost:3012"
echo "  - ecpmr:            http://localhost:3014"
echo "  - storage-market:   http://localhost:3015"
echo "  - geo-tracking:     http://localhost:3016"
echo "  - chatbot-ai:       http://localhost:3019"
echo ""
echo "📝 Logs will appear below..."
echo "🛑 Press Ctrl+C to stop all services"
echo ""

# Start all services
pnpm dev
