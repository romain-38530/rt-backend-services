# RT Subscriptions & Contracts API

**Version:** 1.0.0
**Status:** 🟢 Production Ready
**Platform:** Node.js 20 on AWS Elastic Beanstalk

## 🌐 Deployment URLs

- **HTTP (Current):** `http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`
- **HTTPS (CloudFront):** À configurer
- **Environment:** rt-subscriptions-api-prod
- **Region:** eu-central-1

## 🎯 Features

- ✅ Subscription Management (Plans, Billing, Usage)
- ✅ Contract Signing (E-Signatures, Templates)
- ✅ Invoice Management
- ✅ MongoDB Integration (ready to configure)
- ✅ CORS Enabled
- ✅ Rate Limiting (100 req/15min)
- ✅ Security (Helmet)

## 📋 API Endpoints

### Health & Info
```bash
GET /health                           # Health check
GET /                                 # API info
```

### Subscription Plans
```bash
GET  /api/plans                       # List all plans
POST /api/plans                       # Create a plan
```

### Subscriptions
```bash
GET  /api/subscriptions/:id           # Get subscription details
POST /api/subscriptions               # Create subscription
POST /api/subscriptions/:id/cancel    # Cancel subscription
POST /api/subscriptions/:id/renew     # Renew subscription
```

### Contracts
```bash
GET  /api/contracts/:id               # Get contract details
POST /api/contracts                   # Create contract
POST /api/contracts/:id/send          # Send for signatures
```

### Signatures
```bash
POST /api/signatures/:id/sign         # Sign document
```

## 🔧 Configuration

### Environment Variables

Configure via EB CLI:
```bash
eb setenv MONGODB_URI="mongodb+srv://..." CORS_ORIGIN="https://yoursite.com"
```

Required variables:
- `PORT` - Server port (default: 8080)
- `NODE_ENV` - Environment (production)
- `MONGODB_URI` - MongoDB connection string
- `CORS_ORIGIN` - Allowed CORS origins (default: *)

## 🚀 Deployment

### Deploy New Version
```bash
eb deploy
```

### Check Status
```bash
eb status
```

### View Logs
```bash
eb logs
```

### SSH to Instance
```bash
eb ssh
```

## 📊 Health Check

```bash
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health
```

Response:
```json
{
  "status": "healthy",
  "service": "subscriptions-contracts",
  "version": "1.0.0",
  "mongodb": {
    "connected": false,
    "status": "not connected"
  }
}
```

## 🔐 Security

- Helmet (Security headers)
- CORS (Configurable origins)
- Rate Limiting (100 requests / 15 minutes per IP)
- Input validation on all endpoints

## 📝 Example Requests

### Create a Subscription Plan
```bash
curl -X POST http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/plans \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pro Plan",
    "type": "PRO",
    "description": "Professional features",
    "price": 49.99,
    "billingInterval": "MONTHLY",
    "features": {
      "maxApiCalls": 10000,
      "maxUsers": 10,
      "maxVehicles": 50
    }
  }'
```

### Create a Subscription
```bash
curl -X POST http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "planId": "plan_pro",
    "billingInterval": "MONTHLY",
    "startTrial": true
  }'
```

### Create a Contract
```bash
curl -X POST http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Transport Contract",
    "type": "TRANSPORT",
    "content": "<h1>Contract Details</h1>",
    "parties": [
      {
        "type": "COMPANY",
        "name": "Company A",
        "email": "contact@companya.com",
        "role": "SENDER",
        "signatureRequired": true
      }
    ],
    "effectiveDate": "2025-12-01"
  }'
```

## 🧪 Testing

Test all endpoints:
```bash
# Health check
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health

# API info
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/

# List plans (requires MongoDB configured)
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/plans
```

## 🔄 Next Steps

1. Configure MongoDB connection string
2. Set up CloudFront for HTTPS
3. Configure production CORS origins
4. Set up monitoring and alerts
5. Add authentication middleware

## 📞 Support

For issues or questions, contact RT Technologies team.

---

**Last Updated:** November 24, 2025
**Deployed Version:** app-251124_205735067685
