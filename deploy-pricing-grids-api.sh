#!/bin/bash
# Déploiement du service pricing-grids-api

APP_NAME="rt-pricing-grids-api"
ENV_NAME="rt-pricing-grids-api-prod"
SERVICE_DIR="services/pricing-grids-api"
REGION="eu-central-1"
S3_BUCKET="elasticbeanstalk-eu-central-1-975050024946"
VERSION="v1.0.0"

MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-pricing-grids?retryWrites=true&w=majority"
JWT_SECRET="rt-super-secret-jwt-key-2024"
CORS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://symphonia-industry.amplifyapp.com,https://symphonia-transporter.amplifyapp.com"

# AWS S3
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
AWS_REGION="eu-west-3"
S3_BUCKET_FILES="symphonia-pricing-grids"

echo "================================================"
echo "Deploying: $APP_NAME"
echo "Version: $VERSION"
echo "Region: $REGION"
echo "================================================"

# 1. Créer le ZIP
echo "Creating deployment package..."
cd "$SERVICE_DIR" || exit 1
ZIP_FILE="${APP_NAME}-${VERSION}.zip"
zip -r "../../$ZIP_FILE" index.js package.json Procfile .env.example
cd ../..

# 2. Upload to S3
echo "Uploading to S3..."
aws s3 cp "$ZIP_FILE" "s3://${S3_BUCKET}/${ZIP_FILE}" --region "$REGION"

# 3. Create application if not exists
echo "Creating application..."
aws elasticbeanstalk create-application \
  --application-name "$APP_NAME" \
  --description "SYMPHONIA Pricing Grids API - Custom pricing grid configurations" \
  --region "$REGION" 2>/dev/null || echo "Application already exists"

# 4. Create application version
echo "Creating application version..."
aws elasticbeanstalk create-application-version \
  --application-name "$APP_NAME" \
  --version-label "$VERSION" \
  --source-bundle S3Bucket="$S3_BUCKET",S3Key="$ZIP_FILE" \
  --region "$REGION"

# 5. Create or update environment
echo "Creating/updating environment..."
aws elasticbeanstalk create-environment \
  --application-name "$APP_NAME" \
  --environment-name "$ENV_NAME" \
  --solution-stack-name "64bit Amazon Linux 2023 v6.4.1 running Node.js 20" \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=NODE_ENV,Value=production \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=PORT,Value=3020 \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="$MONGODB_URI" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=JWT_SECRET,Value="$JWT_SECRET" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=CORS_ALLOWED_ORIGINS,Value="$CORS" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value="$AWS_REGION" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=S3_BUCKET,Value="$S3_BUCKET_FILES" \
    Namespace=aws:autoscaling:launchconfiguration,OptionName=InstanceType,Value=t3.micro \
    Namespace=aws:elasticbeanstalk:environment,OptionName=EnvironmentType,Value=SingleInstance \
  --region "$REGION" 2>/dev/null || \
aws elasticbeanstalk update-environment \
  --application-name "$APP_NAME" \
  --environment-name "$ENV_NAME" \
  --version-label "$VERSION" \
  --region "$REGION"

echo ""
echo "Deployment initiated!"
echo "Check status: aws elasticbeanstalk describe-environments --environment-names $ENV_NAME --region $REGION"
