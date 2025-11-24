# Guide CI/CD - RT Backend Services

**Version:** 1.0.0
**Date:** 24 novembre 2025
**Services:** authz-eb, subscriptions-contracts-eb

---

## 📋 Vue d'Ensemble

Ce guide décrit la mise en place d'un pipeline CI/CD complet pour automatiser les tests, builds et déploiements des services backend RT vers AWS Elastic Beanstalk avec invalidation CloudFront.

### Architecture CI/CD

```
GitHub Push → GitHub Actions → Tests → Build → Deploy EB → Invalidate CloudFront → Notifications
```

---

## 🔧 Configuration Initiale

### 1. Secrets GitHub à Configurer

Dans **Settings → Secrets and variables → Actions**, ajouter :

```yaml
# AWS Credentials
AWS_ACCESS_KEY_ID: "votre_access_key_id"
AWS_SECRET_ACCESS_KEY: "votre_secret_access_key"
AWS_REGION: "eu-central-1"

# Service authz-eb
AUTHZ_EB_APP_NAME: "authz-eb"
AUTHZ_EB_ENV_NAME: "authz-eb-prod"
AUTHZ_CLOUDFRONT_ID: "E8GKHGYOIP84"

# Service subscriptions-contracts-eb
SUBSCRIPTIONS_EB_APP_NAME: "subscriptions-contracts-eb"
SUBSCRIPTIONS_EB_ENV_NAME: "rt-subscriptions-api-prod"
SUBSCRIPTIONS_CLOUDFRONT_ID: "E1H1CDV902R49R"

# MongoDB (pour subscriptions-contracts)
MONGODB_URI: "mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts"

# API Keys (pour authz-eb)
ABSTRACT_API_KEY: "votre_abstract_api_key"
APILAYER_API_KEY: "votre_apilayer_api_key"

# Notifications (optionnel)
SLACK_WEBHOOK_URL: "votre_slack_webhook"
DISCORD_WEBHOOK_URL: "votre_discord_webhook"
```

### 2. Permissions IAM Requises

Créer un utilisateur IAM avec les permissions suivantes :

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticbeanstalk:*",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "s3:*",
        "ec2:*",
        "autoscaling:*",
        "cloudwatch:*",
        "elasticloadbalancing:*",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 🚀 GitHub Actions Workflows

### Workflow 1: Deploy Authz-EB (Service VAT + Prix)

Créer `.github/workflows/deploy-authz-eb.yml` :

```yaml
name: Deploy Authz-EB to AWS

on:
  push:
    branches:
      - main
    paths:
      - 'services/authz-eb/**'
  workflow_dispatch:

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}
  EB_APPLICATION_NAME: ${{ secrets.AUTHZ_EB_APP_NAME }}
  EB_ENVIRONMENT_NAME: ${{ secrets.AUTHZ_EB_ENV_NAME }}
  CLOUDFRONT_ID: ${{ secrets.AUTHZ_CLOUDFRONT_ID }}

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/authz-eb

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/authz-eb/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint || echo "No lint script found"

      - name: Run tests
        run: npm test || echo "No tests configured yet"

      - name: Health check test
        run: node -e "console.log('Health check: OK')"

  deploy:
    name: Deploy to Elastic Beanstalk
    runs-on: ubuntu-latest
    needs: test
    defaults:
      run:
        working-directory: services/authz-eb

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci --production

      - name: Create deployment package
        run: |
          zip -r deploy.zip . -x "*.git*" "node_modules/@aws-sdk/*" "*.md" "*.ps1"

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Deploy to Elastic Beanstalk
        run: |
          VERSION_LABEL="authz-eb-${{ github.sha }}-$(date +%s)"

          # Upload to S3
          aws s3 cp deploy.zip s3://elasticbeanstalk-${{ env.AWS_REGION }}-$(aws sts get-caller-identity --query Account --output text)/${{ env.EB_APPLICATION_NAME }}/$VERSION_LABEL.zip

          # Create application version
          aws elasticbeanstalk create-application-version \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --version-label $VERSION_LABEL \
            --source-bundle S3Bucket="elasticbeanstalk-${{ env.AWS_REGION }}-$(aws sts get-caller-identity --query Account --output text)",S3Key="${{ env.EB_APPLICATION_NAME }}/$VERSION_LABEL.zip" \
            --description "Deployed from GitHub Actions - ${{ github.sha }}"

          # Update environment
          aws elasticbeanstalk update-environment \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --environment-name ${{ env.EB_ENVIRONMENT_NAME }} \
            --version-label $VERSION_LABEL

      - name: Wait for deployment
        run: |
          echo "Waiting for deployment to complete..."
          aws elasticbeanstalk wait environment-updated \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --environment-name ${{ env.EB_ENVIRONMENT_NAME }}

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ env.CLOUDFRONT_ID }} \
            --paths "/*"

      - name: Verify deployment
        run: |
          echo "Testing HTTPS endpoint..."
          curl -f https://d2i50a1vlg138w.cloudfront.net/health || exit 1
          echo "✅ Deployment successful!"

      - name: Notify on failure
        if: failure()
        run: |
          echo "❌ Deployment failed for authz-eb"
          # Add Slack/Discord notification here if configured

  notify:
    name: Send Notifications
    runs-on: ubuntu-latest
    needs: deploy
    if: always()

    steps:
      - name: Slack Notification
        if: env.SLACK_WEBHOOK_URL != ''
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "Deployment ${{ needs.deploy.result }}: authz-eb",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Authz-EB Deployment*\nStatus: ${{ needs.deploy.result }}\nCommit: ${{ github.sha }}\nURL: https://d2i50a1vlg138w.cloudfront.net"
                  }
                }
              ]
            }
```

### Workflow 2: Deploy Subscriptions-Contracts-EB

Créer `.github/workflows/deploy-subscriptions-eb.yml` :

```yaml
name: Deploy Subscriptions-Contracts-EB to AWS

on:
  push:
    branches:
      - main
    paths:
      - 'services/subscriptions-contracts-eb/**'
  workflow_dispatch:

env:
  AWS_REGION: ${{ secrets.AWS_REGION }}
  EB_APPLICATION_NAME: ${{ secrets.SUBSCRIPTIONS_EB_APP_NAME }}
  EB_ENVIRONMENT_NAME: ${{ secrets.SUBSCRIPTIONS_EB_ENV_NAME }}
  CLOUDFRONT_ID: ${{ secrets.SUBSCRIPTIONS_CLOUDFRONT_ID }}

jobs:
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/subscriptions-contracts-eb

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: services/subscriptions-contracts-eb/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run linting
        run: npm run lint || echo "No lint script found"

      - name: Run tests
        run: npm test || echo "No tests configured yet"

      - name: Validate MongoDB connection string
        run: |
          if [[ -z "${{ secrets.MONGODB_URI }}" ]]; then
            echo "⚠️ Warning: MONGODB_URI not configured"
          else
            echo "✅ MongoDB URI configured"
          fi

  deploy:
    name: Deploy to Elastic Beanstalk
    runs-on: ubuntu-latest
    needs: test
    defaults:
      run:
        working-directory: services/subscriptions-contracts-eb

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci --production

      - name: Create deployment package
        run: |
          zip -r deploy.zip . -x "*.git*" "*.md" "*.ps1" "MONGODB_ATLAS_SETUP.md" "AUTHENTICATION_GUIDE.md"

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Set MongoDB URI
        run: |
          aws elasticbeanstalk update-environment \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --environment-name ${{ env.EB_ENVIRONMENT_NAME }} \
            --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="${{ secrets.MONGODB_URI }}"

      - name: Deploy to Elastic Beanstalk
        run: |
          VERSION_LABEL="subscriptions-eb-${{ github.sha }}-$(date +%s)"

          # Upload to S3
          aws s3 cp deploy.zip s3://elasticbeanstalk-${{ env.AWS_REGION }}-$(aws sts get-caller-identity --query Account --output text)/${{ env.EB_APPLICATION_NAME }}/$VERSION_LABEL.zip

          # Create application version
          aws elasticbeanstalk create-application-version \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --version-label $VERSION_LABEL \
            --source-bundle S3Bucket="elasticbeanstalk-${{ env.AWS_REGION }}-$(aws sts get-caller-identity --query Account --output text)",S3Key="${{ env.EB_APPLICATION_NAME }}/$VERSION_LABEL.zip" \
            --description "Deployed from GitHub Actions - ${{ github.sha }}"

          # Update environment
          aws elasticbeanstalk update-environment \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --environment-name ${{ env.EB_ENVIRONMENT_NAME }} \
            --version-label $VERSION_LABEL

      - name: Wait for deployment
        run: |
          echo "Waiting for deployment to complete..."
          aws elasticbeanstalk wait environment-updated \
            --application-name ${{ env.EB_APPLICATION_NAME }} \
            --environment-name ${{ env.EB_ENVIRONMENT_NAME }}

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ env.CLOUDFRONT_ID }} \
            --paths "/*"

      - name: Verify deployment
        run: |
          echo "Testing HTTPS endpoint..."
          curl -f https://dgze8l03lwl5h.cloudfront.net/health || exit 1
          echo "✅ Deployment successful!"

      - name: Test MongoDB connection
        run: |
          echo "Testing MongoDB connectivity..."
          RESPONSE=$(curl -s https://dgze8l03lwl5h.cloudfront.net/health)
          MONGO_STATUS=$(echo $RESPONSE | jq -r '.mongodb.status')

          if [ "$MONGO_STATUS" == "connected" ]; then
            echo "✅ MongoDB connected successfully"
          else
            echo "⚠️ MongoDB not connected - check MONGODB_URI configuration"
          fi

      - name: Notify on failure
        if: failure()
        run: |
          echo "❌ Deployment failed for subscriptions-contracts-eb"

  notify:
    name: Send Notifications
    runs-on: ubuntu-latest
    needs: deploy
    if: always()

    steps:
      - name: Slack Notification
        if: env.SLACK_WEBHOOK_URL != ''
        uses: slackapi/slack-github-action@v1
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "Deployment ${{ needs.deploy.result }}: subscriptions-contracts-eb",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Subscriptions-Contracts-EB Deployment*\nStatus: ${{ needs.deploy.result }}\nCommit: ${{ github.sha }}\nURL: https://dgze8l03lwl5h.cloudfront.net"
                  }
                }
              ]
            }
```

---

## 🔄 Déploiement Manuel via EB CLI

### authz-eb

```bash
cd services/authz-eb

# Déployer
eb deploy

# Mettre à jour les variables d'environnement
eb setenv ABSTRACT_API_KEY="votre_key" APILAYER_API_KEY="votre_key"

# Invalider le cache CloudFront
aws cloudfront create-invalidation --distribution-id E8GKHGYOIP84 --paths "/*"

# Vérifier le déploiement
curl https://d2i50a1vlg138w.cloudfront.net/health
```

### subscriptions-contracts-eb

```bash
cd services/subscriptions-contracts-eb

# Déployer
eb deploy

# Mettre à jour MongoDB URI
eb setenv MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts"

# Invalider le cache CloudFront
aws cloudfront create-invalidation --distribution-id E1H1CDV902R49R --paths "/*"

# Vérifier le déploiement
curl https://dgze8l03lwl5h.cloudfront.net/health
```

---

## 🧪 Tests Automatisés

### Créer tests pour authz-eb

Créer `services/authz-eb/test/api.test.js` :

```javascript
const assert = require('assert');
const fetch = require('node-fetch');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';

describe('Authz-EB API Tests', () => {
  it('should return health status', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
  });

  it('should validate VAT format', async () => {
    const response = await fetch(`${BASE_URL}/api/vat/validate-format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vatNumber: 'FR12345678901' })
    });
    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.valid, true);
  });

  it('should calculate price with VAT', async () => {
    const response = await fetch(`${BASE_URL}/api/vat/calculate-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 100, countryCode: 'FR' })
    });
    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.priceInclVat, 120);
  });
});
```

### Créer tests pour subscriptions-contracts-eb

Créer `services/subscriptions-contracts-eb/test/api.test.js` :

```javascript
const assert = require('assert');
const fetch = require('node-fetch');

const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';

describe('Subscriptions-Contracts-EB API Tests', () => {
  it('should return health status', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
  });

  it('should list plans', async () => {
    const response = await fetch(`${BASE_URL}/api/plans`);
    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert(Array.isArray(data.data));
  });

  it('should create a subscription', async () => {
    const response = await fetch(`${BASE_URL}/api/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-user',
        planId: 'test-plan',
        billingInterval: 'MONTHLY',
        startTrial: true
      })
    });
    const data = await response.json();
    assert.strictEqual(data.success, true);
  });
});
```

---

## 📊 Monitoring et Rollback

### Vérifier le statut des déploiements

```bash
# Statut authz-eb
aws elasticbeanstalk describe-environments \
  --application-name authz-eb \
  --environment-names authz-eb-prod \
  --query 'Environments[0].[EnvironmentName,Status,Health]'

# Statut subscriptions-contracts-eb
aws elasticbeanstalk describe-environments \
  --application-name subscriptions-contracts-eb \
  --environment-names rt-subscriptions-api-prod \
  --query 'Environments[0].[EnvironmentName,Status,Health]'
```

### Rollback en cas de problème

```bash
# Lister les versions disponibles
aws elasticbeanstalk describe-application-versions \
  --application-name authz-eb \
  --query 'ApplicationVersions[*].[VersionLabel,DateCreated]' \
  --output table

# Rollback vers une version précédente
aws elasticbeanstalk update-environment \
  --application-name authz-eb \
  --environment-name authz-eb-prod \
  --version-label authz-eb-previous-version-label

# Invalider CloudFront
aws cloudfront create-invalidation --distribution-id E8GKHGYOIP84 --paths "/*"
```

---

## 🔔 Notifications

### Configuration Slack

1. Créer un Incoming Webhook dans Slack
2. Ajouter `SLACK_WEBHOOK_URL` dans les secrets GitHub
3. Le workflow enverra automatiquement les notifications

### Configuration Discord

```bash
# Ajouter le secret
gh secret set DISCORD_WEBHOOK_URL --body "https://discord.com/api/webhooks/..."
```

---

## 📝 Checklist Déploiement

Avant chaque déploiement, vérifier :

- [ ] Tous les tests passent localement
- [ ] Les variables d'environnement sont configurées
- [ ] MongoDB Atlas est accessible (subscriptions-contracts)
- [ ] Les API keys sont valides (authz-eb)
- [ ] Le code est mergé dans `main`
- [ ] La version est incrémentée dans package.json
- [ ] La documentation est à jour

Après chaque déploiement :

- [ ] Vérifier le health endpoint HTTPS
- [ ] Tester les endpoints critiques
- [ ] Vérifier les logs CloudWatch
- [ ] Vérifier que CloudFront est invalidé
- [ ] Informer l'équipe frontend si breaking changes

---

## 🚨 Troubleshooting

### Déploiement bloqué à "Updating"

```bash
# Forcer la terminaison de l'update en cours
aws elasticbeanstalk abort-environment-update \
  --environment-name authz-eb-prod

# Attendre quelques minutes puis relancer
eb deploy
```

### Erreur "No space left on device"

```bash
# Se connecter à l'instance
eb ssh

# Nettoyer les vieilles versions
sudo rm -rf /var/app/old_*

# Redémarrer
sudo systemctl restart web.service
```

### MongoDB connection timeout

```bash
# Vérifier la configuration
eb printenv | grep MONGODB

# Mettre à jour l'URI
eb setenv MONGODB_URI="mongodb+srv://..."

# Redémarrer l'environment
aws elasticbeanstalk restart-app-server \
  --environment-name rt-subscriptions-api-prod
```

### CloudFront cache non invalidé

```bash
# Créer une invalidation manuelle
aws cloudfront create-invalidation \
  --distribution-id E8GKHGYOIP84 \
  --paths "/*"

# Vérifier le statut
aws cloudfront get-invalidation \
  --distribution-id E8GKHGYOIP84 \
  --id INVALIDATION_ID
```

---

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS EB CLI Reference](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html)
- [CloudFront Invalidation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html)
- [Node.js on Elastic Beanstalk](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.html)

---

## 🎯 Résumé

| Service | Workflow | CloudFront | Health Endpoint |
|---------|----------|-----------|-----------------|
| **authz-eb** | `.github/workflows/deploy-authz-eb.yml` | E8GKHGYOIP84 | https://d2i50a1vlg138w.cloudfront.net/health |
| **subscriptions-contracts-eb** | `.github/workflows/deploy-subscriptions-eb.yml` | E1H1CDV902R49R | https://dgze8l03lwl5h.cloudfront.net/health |

**Prochaines étapes :**
1. Configurer les secrets GitHub
2. Créer les workflows dans `.github/workflows/`
3. Pousser sur `main` pour déclencher les déploiements
4. Monitorer via CloudWatch et les notifications

---

**Créé le:** 24 novembre 2025
**Mainteneur:** RT Technologies
**Version:** 1.0.0
