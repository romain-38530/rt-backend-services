#!/bin/bash
# Quick test script for all deployed backend services
# Date: 2025-11-27

echo "========================================"
echo "RT BACKEND SERVICES - HEALTH CHECK"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Service endpoints
declare -A SERVICES=(
  ["tracking-api"]="http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com/health"
  ["appointments-api"]="http://rt-appointments-api-prod.eba-b5rcxvcw.eu-central-1.elasticbeanstalk.com/health"
  ["documents-api"]="http://rt-documents-api-prod.eba-xscabiv8.eu-central-1.elasticbeanstalk.com/health"
  ["scoring-api"]="http://rt-scoring-api-prod.eba-ygb5kqyw.eu-central-1.elasticbeanstalk.com/health"
  ["affret-ia-api"]="http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/health"
  ["websocket-api"]="http://rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com/health"
)

success_count=0
total_count=${#SERVICES[@]}

# Test each service
for service in "${!SERVICES[@]}"; do
  url="${SERVICES[$service]}"

  echo "Testing $service..."

  # Get HTTP status code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")

  # Get response body
  response=$(curl -s --max-time 10 "$url")

  if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✅ $service${NC}"
    echo "   Status: HTTP $http_code"
    echo "   Response: $response"
    ((success_count++))
  else
    echo -e "${RED}❌ $service${NC}"
    echo "   Status: HTTP $http_code"
    echo "   Response: $response"
  fi
  echo ""
done

echo "========================================"
echo "RESULT: $success_count/$total_count services operational"
echo "========================================"

if [ $success_count -eq $total_count ]; then
  echo -e "${GREEN}All services are healthy!${NC}"
  exit 0
else
  echo -e "${RED}Some services are down!${NC}"
  exit 1
fi
