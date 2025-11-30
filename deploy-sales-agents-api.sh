#!/bin/bash
# Script de deploiement - Sales Agents API
# Module Agents Commerciaux & Commissions

SERVICE_DIR="sales-agents-api"
APP_NAME="rt-sales-agents-api"
PORT="3015"
DB_NAME="rt-sales-agents"

MONGODB_BASE="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
CORS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com"
JWT="rt-super-secret-jwt-key-2024"

echo "================================================"
echo "Deploiement: $SERVICE_DIR"
echo "App: $APP_NAME | Port: $PORT | DB: $DB_NAME"
echo "================================================"

cd "services/$SERVICE_DIR" || exit 1

# Verifier Procfile
if [ ! -f "Procfile" ]; then
  echo "web: node index.js" > Procfile
  echo "✓ Procfile cree"
fi

# Init EB
echo "Init EB..."
eb init -p "Node.js 20" -r "eu-central-1" "$APP_NAME"

# Creer environnement
ENV_NAME="${APP_NAME}-prod"
echo "Creation environnement: $ENV_NAME"

eb create "$ENV_NAME" \
  --instance-type t3.micro \
  --single \
  --timeout 20

# Configurer variables
echo "Configuration variables..."
MONGODB_URI="${MONGODB_BASE}/${DB_NAME}?retryWrites=true&w=majority"

eb setenv \
  NODE_ENV="production" \
  PORT="$PORT" \
  MONGODB_URI="$MONGODB_URI" \
  CORS_ALLOWED_ORIGINS="$CORS" \
  JWT_SECRET="$JWT" \
  LOG_LEVEL="info" \
  COMMISSION_RATE_PER_CLIENT="70" \
  ECMR_API_URL="http://rt-ecmr-api-prod.eu-central-1.elasticbeanstalk.com" \
  SUBSCRIPTIONS_API_URL="http://rt-subscriptions-api-prod.eu-central-1.elasticbeanstalk.com" \
  FRONTEND_URL="https://main.dbg6okncuyyiw.amplifyapp.com"

# Recuperer URL
echo "Recuperation URL..."
sleep 10
URL=$(eb status | grep "CNAME:" | awk '{print $2}')

if [ -n "$URL" ]; then
  echo ""
  echo "✓ SUCCESS!"
  echo "URL: http://$URL"
  echo "Health: http://$URL/health"
  echo "$SERVICE_DIR|$APP_NAME|http://$URL|$PORT" >> ../../DEPLOYED_URLS.txt
else
  echo "✗ Echec recuperation URL"
fi

cd ../..
