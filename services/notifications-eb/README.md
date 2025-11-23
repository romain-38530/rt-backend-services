# notifications Service - Elastic Beanstalk Deployment

This is a standalone version of the notifications service for AWS Elastic Beanstalk deployment.

## Deployment

`ash
# Initialize EB (first time only)
eb init -p "Node.js 20" -r eu-central-1

# Create environment
eb create rt-notifications-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# Set environment variables
eb setenv MONGODB_URI="..." PORT="3000" JWT_SECRET="..."

# Deploy
eb deploy

# Check status
eb status
eb open
`

## Local Testing

`ash
npm install
npm run dev
`

## Environment Variables

See DEPLOY_NEW_SERVICES.md in the root directory for full list of required environment variables.
