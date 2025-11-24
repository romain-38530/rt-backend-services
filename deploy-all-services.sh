#!/bin/bash

EB_CLI="C:/Users/rtard/AppData/Roaming/Python/Python314/Scripts/eb.exe"

SERVICES=(
  "authz:Authentication:rt-auth"
  "orders:Orders:rt-orders"
  "planning:Planning:rt-planning"
  "ecmr:eCMR:rt-ecmr"
  "palettes:Palettes:rt-palettes"
)

CORS_ORIGINS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com"

for service_config in "${SERVICES[@]}"; do
  IFS=':' read -r SERVICE_NAME SERVICE_LABEL DB_NAME <<< "$service_config"
  
  echo "========================================"
  echo "Deploying $SERVICE_LABEL ($SERVICE_NAME)"
  echo "========================================"
  
  SERVICE_DIR="services/${SERVICE_NAME}-eb"
  cd "$SERVICE_DIR" || continue
  
  # Initialize EB if not already done
  if [ ! -d ".elasticbeanstalk" ]; then
    echo "Initializing EB for $SERVICE_NAME..."
    "$EB_CLI" init -p "Node.js 20 running on 64bit Amazon Linux 2023" -r eu-central-1 "rt-${SERVICE_NAME}-api"
  fi
  
  # Check if environment exists
  ENV_EXISTS=$("$EB_CLI" list 2>&1 | grep -c "rt-${SERVICE_NAME}-api-prod")
  
  if [ "$ENV_EXISTS" -eq 0 ]; then
    echo "Creating environment for $SERVICE_NAME..."
    "$EB_CLI" create "rt-${SERVICE_NAME}-api-prod" --instance-type t3.micro --single
    
    if [ $? -ne 0 ]; then
      echo "❌ Failed to create environment for $SERVICE_NAME"
      cd ../..
      continue
    fi
  else
    echo "Environment already exists, deploying..."
    "$EB_CLI" deploy
  fi
  
  # Configure environment variables
  echo "Configuring environment variables..."
  "$EB_CLI" setenv \
    MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/${DB_NAME}?retryWrites=true&w=majority&appName=StagingRT" \
    NODE_ENV="production" \
    CORS_ALLOWED_ORIGINS="$CORS_ORIGINS"
  
  echo "✅ $SERVICE_LABEL deployed successfully!"
  
  # Get environment URL
  "$EB_CLI" status | grep CNAME
  
  cd ../..
done

echo "========================================"
echo "All services deployed!"
echo "========================================"
