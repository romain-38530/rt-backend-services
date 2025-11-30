#!/bin/bash
# Script pour déployer UN service à la fois

SERVICE_DIR=$1
APP_NAME=$2
PORT=$3
DB_NAME=$4

if [ -z "$SERVICE_DIR" ] || [ -z "$APP_NAME" ] || [ -z "$PORT" ] || [ -z "$DB_NAME" ]; then
  echo "Usage: ./deploy-one-service.sh <service_dir> <app_name> <port> <db_name>"
  echo "Example: ./deploy-one-service.sh tracking-api rt-tracking-api 3012 rt-tracking"
  exit 1
fi

MONGODB_BASE="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
CORS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com"
JWT="rt-super-secret-jwt-key-2024"

echo "================================================"
echo "Déploiement: $SERVICE_DIR"
echo "App: $APP_NAME | Port: $PORT | DB: $DB_NAME"
echo "================================================"

cd "services/$SERVICE_DIR" || exit 1

# Créer Procfile si nécessaire
if [ ! -f "Procfile" ]; then
  echo "web: node index.js" > Procfile
  echo "✓ Procfile créé"
fi

# Init EB
echo "Init EB..."
eb init -p "Node.js 20" -r "eu-central-1" "$APP_NAME"

# Créer environnement
ENV_NAME="${APP_NAME}-prod"
echo "Création environnement: $ENV_NAME"

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
  LOG_LEVEL="info"

# Récupérer URL
echo "Récupération URL..."
sleep 10
URL=$(eb status | grep "CNAME:" | awk '{print $2}')

if [ -n "$URL" ]; then
  echo ""
  echo "✓ SUCCESS!"
  echo "URL: http://$URL"
  echo "Health: http://$URL/health"
  echo "$SERVICE_DIR|$APP_NAME|http://$URL|$PORT" >> ../../DEPLOYED_URLS.txt
else
  echo "✗ Échec récupération URL"
fi

cd ../..
