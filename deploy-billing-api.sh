#!/bin/bash
# Deploy billing-api to AWS Elastic Beanstalk

SERVICE_DIR="billing-api"
APP_NAME="rt-billing-api"
PORT="3014"
DB_NAME="rt-billing"

MONGODB_BASE="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
CORS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com"
JWT="rt-super-secret-jwt-key-2024"

echo "================================================"
echo "Déploiement: Module Préfacturation & Facturation"
echo "Service: $SERVICE_DIR"
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
  echo "✓ BILLING-API DEPLOYED!"
  echo "URL: http://$URL"
  echo "Health: http://$URL/health"
  echo "$SERVICE_DIR|$APP_NAME|http://$URL|$PORT" >> ../../DEPLOYED_URLS.txt
else
  echo "✗ Échec récupération URL"
fi

cd ../..
echo "Done!"
