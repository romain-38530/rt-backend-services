#!/bin/bash
# Déploiement de websocket-api

EB="/c/Users/rtard/AppData/Roaming/Python/Python314/Scripts/eb.exe"
MONGODB_BASE="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
CORS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
JWT="rt-super-secret-jwt-key-2024"

echo "================================================"
echo "Déploiement: websocket-api"
echo "================================================"

cd services/websocket-api || exit 1

# Créer Procfile
if [ ! -f "Procfile" ]; then
  echo "web: node index.js" > Procfile
  echo "✓ Procfile créé"
fi

# Init EB
echo "Init EB..."
"$EB" init -p "Node.js 20" -r "eu-central-1" rt-websocket-api

# Créer environnement
echo "Création environnement..."
"$EB" create rt-websocket-api-prod \
  --instance-type t3.micro \
  --single \
  --timeout 20

# Configurer variables
echo "Configuration variables..."
MONGODB_URI="${MONGODB_BASE}/rt-websocket?retryWrites=true&w=majority"

"$EB" setenv \
  NODE_ENV="production" \
  PORT="3010" \
  MONGODB_URI="$MONGODB_URI" \
  CORS_ALLOWED_ORIGINS="$CORS" \
  JWT_SECRET="$JWT" \
  LOG_LEVEL="info"

# Récupérer URL
echo "Récupération URL..."
sleep 10
URL=$("$EB" status | grep "CNAME:" | awk '{print $2}')

if [ -n "$URL" ]; then
  echo ""
  echo "✓ SUCCESS!"
  echo "URL: http://$URL"
  echo "websocket-api|rt-websocket-api|http://$URL|3010" >> ../../DEPLOYED_URLS.txt
else
  echo "✗ Échec"
fi

cd ../..
