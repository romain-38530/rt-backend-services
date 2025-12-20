# SYMPHONI.A - URLs de Production

## Services Backend (Elastic Beanstalk - eu-central-1)

| Service | URL ELB | Port | Status |
|---------|---------|------|--------|
| **Auth/Authz API** | rt-authz-eb-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Orders API v2** | rt-orders-api-prod-v2.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Tracking API** | rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Affret.IA API v2** | rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Billing API** | rt-billing-api-prod.eba-jg9uugnp.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Planning Sites API** | rt-planning-sites-api-prod.eba-uc2vvehf.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **KPI API** | rt-kpi-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Subscriptions Pricing API** | rt-subscriptions-pricing-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Sales Agents API** | rt-sales-agents-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **eCMR Signature API** | rt-ecmr-signature-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Pricing Grids API** | rt-pricing-grids-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Vigilance API** | rt-vigilance-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **WebSocket API** | rt-websocket-api-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |
| **Subscriptions Contracts** | rt-subscriptions-contracts-prod.eba-xxxxx.eu-central-1.elasticbeanstalk.com | 8080 | Production |

## Frontend (CloudFront CDN)

| Application | URL CloudFront |
|-------------|----------------|
| **Industrie** | https://industrie.symphonia-controltower.com |
| **Transporteur** | https://transporteur.symphonia-controltower.com |
| **Admin** | https://admin.symphonia-controltower.com |
| **Destinataire** | https://destinataire.symphonia-controltower.com |

## CloudFront API Distribution

Base URL: `https://d3b0j7f2tnxc8h.cloudfront.net`

| Endpoint | Path |
|----------|------|
| Auth | /api/v1/auth/* |
| Orders | /api/v1/orders/* |
| Tracking | /api/v1/tracking/* |
| Affret.IA | /api/v1/affret/* |
| Planning | /api/v1/planning/* |
| KPI | /api/v1/kpi/* |
| Billing | /api/v1/billing/* |

## Bases de Donnees

| Service | Type | Connection String Pattern |
|---------|------|---------------------------|
| **MongoDB Atlas** | Cluster M10+ | mongodb+srv://user:pass@cluster.mongodb.net/dbname |
| **Redis ElastiCache** | r6g.large | redis://symphonia-cache.xxxxx.euc1.cache.amazonaws.com:6379 |

## Services AWS

| Service | Region | Description |
|---------|--------|-------------|
| **S3** | eu-west-3 | Stockage documents, factures, CMR |
| **SES** | eu-central-1 | Envoi emails transactionnels |
| **CloudWatch** | eu-central-1 | Logs et monitoring |
| **Elastic Beanstalk** | eu-central-1 | Hebergement APIs |

## Notes

- Tous les services ELB utilisent le port 8080 en interne
- Les variables `xxxxx` doivent etre remplacees par les vraies valeurs de l'environnement
- En production, utiliser les URL internes ELB pour la communication inter-services (pas CloudFront)
- CloudFront est reserve pour les appels frontend -> backend

## Configuration Elastic Beanstalk

Variables d'environnement requises pour chaque service:
- `NODE_ENV=production`
- `PORT=8080`
- `MONGODB_URI=...`
- `JWT_SECRET=...`
- URLs des services dependants

## Mise a jour: 2024

Document genere automatiquement - Maintenir a jour lors de chaque deploiement
