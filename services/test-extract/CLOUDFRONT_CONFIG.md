# Configuration CloudFront pour subscriptions-contracts-eb

## URL HTTPS (Production)
- **CloudFront HTTPS:** https://dgze8l03lwl5h.cloudfront.net
- **Distribution ID:** E1H1CDV902R49R
- **Version actuelle:** 1.0.0
- **Status:** 🟡 Déploiement en cours (5-15 minutes)

## Backend Origin
- **Elastic Beanstalk HTTP:** http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com
- **Region:** eu-central-1
- **Health:** Green ✅

## Configuration CloudFront
- ✅ HTTPS automatique (certificat AWS)
- ✅ Toutes méthodes HTTP (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- ✅ Headers CORS transférés (Origin, Content-Type, Authorization, Access-Control-*)
- ✅ Query strings et cookies transférés
- ✅ Cache CloudFront activé (GET/HEAD seulement)
- ✅ Global CDN (faible latence mondiale)

## Fonctionnalités v1.0.0
- ✅ **Gestion des abonnements:** Plans, souscriptions, annulations, renouvellements
- ✅ **Gestion des contrats:** Création, signature électronique, workflows
- ✅ **Gestion des factures:** Création, paiement (à venir)
- ✅ **Tracking usage:** Suivi de l'utilisation (à venir)
- ⚠️ **MongoDB:** Configuré (localhost, à migrer vers Atlas)

## Endpoints disponibles

### Health Check
```bash
# HTTP
curl http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/health

# HTTPS (une fois CloudFront déployé)
curl https://dgze8l03lwl5h.cloudfront.net/health
```

### API Info
```bash
curl https://dgze8l03lwl5h.cloudfront.net/
```

### Plans d'Abonnement
```bash
# Lister les plans
curl https://dgze8l03lwl5h.cloudfront.net/api/plans

# Créer un plan
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/plans \
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

**Réponse:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Pro Plan",
    "type": "PRO",
    "price": 49.99,
    "billingInterval": "MONTHLY",
    "isActive": true,
    "createdAt": "2025-11-24T20:00:00.000Z"
  }
}
```

### Abonnements
```bash
# Créer un abonnement avec période d'essai
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "planId": "507f1f77bcf86cd799439011",
    "billingInterval": "MONTHLY",
    "startTrial": true
  }'

# Détails d'un abonnement
curl https://dgze8l03lwl5h.cloudfront.net/api/subscriptions/507f1f77bcf86cd799439011

# Annuler un abonnement
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/subscriptions/507f1f77bcf86cd799439011/cancel \
  -H "Content-Type: application/json" \
  -d '{"reason": "Customer request"}'
```

**Réponse Création:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "user123",
    "planId": "507f1f77bcf86cd799439011",
    "status": "TRIAL",
    "startDate": "2025-11-24T20:00:00.000Z",
    "trialEndDate": "2025-12-08T20:00:00.000Z",
    "billingInterval": "MONTHLY",
    "autoRenew": true,
    "createdAt": "2025-11-24T20:00:00.000Z"
  }
}
```

### Contrats
```bash
# Créer un contrat
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/contracts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Contrat de Transport Paris-Lyon",
    "type": "TRANSPORT",
    "content": "<h1>Contrat de Transport</h1><p>Détails...</p>",
    "parties": [
      {
        "type": "COMPANY",
        "name": "Entreprise A",
        "email": "contact@entreprisea.com",
        "role": "SENDER",
        "signatureRequired": true
      },
      {
        "type": "COMPANY",
        "name": "Transporteur B",
        "email": "contact@transportb.com",
        "role": "CARRIER",
        "signatureRequired": true
      }
    ],
    "effectiveDate": "2025-12-01"
  }'

# Envoyer pour signatures
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/contracts/507f1f77bcf86cd799439011/send \
  -H "Content-Type: application/json"

# Détails d'un contrat
curl https://dgze8l03lwl5h.cloudfront.net/api/contracts/507f1f77bcf86cd799439011
```

**Réponse Création:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "title": "Contrat de Transport Paris-Lyon",
    "type": "TRANSPORT",
    "status": "DRAFT",
    "parties": [...],
    "effectiveDate": "2025-12-01T00:00:00.000Z",
    "createdAt": "2025-11-24T20:00:00.000Z"
  }
}
```

### Signatures
```bash
# Signer un document
curl -X POST https://dgze8l03lwl5h.cloudfront.net/api/signatures/507f1f77bcf86cd799439011/sign \
  -H "Content-Type: application/json" \
  -d '{
    "signatureData": "data:image/png;base64,iVBORw0KGgo...",
    "geolocation": {
      "latitude": 48.8566,
      "longitude": 2.3522
    }
  }'
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "status": "SIGNED",
    "signedAt": "2025-11-24T20:00:00.000Z",
    "ipAddress": "192.168.1.1",
    "geolocation": {
      "latitude": 48.8566,
      "longitude": 2.3522
    }
  },
  "message": "Document signed successfully"
}
```

## Frontend Configuration

### Option 1: Appel direct depuis le frontend

**Créer un abonnement:**
```typescript
const response = await fetch('https://dgze8l03lwl5h.cloudfront.net/api/subscriptions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    planId: 'plan_pro',
    billingInterval: 'MONTHLY',
    startTrial: true,
  }),
});
const data = await response.json();
// data.success, data.data.status, data.data.trialEndDate
```

**Créer un contrat:**
```typescript
const response = await fetch('https://dgze8l03lwl5h.cloudfront.net/api/contracts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Contrat de Transport',
    type: 'TRANSPORT',
    content: '<h1>Contrat</h1>',
    parties: [
      {
        type: 'COMPANY',
        name: 'Entreprise A',
        email: 'contact@entreprisea.com',
        role: 'SENDER',
        signatureRequired: true,
      },
    ],
    effectiveDate: '2025-12-01',
  }),
});
const data = await response.json();
// data.success, data.data._id, data.data.status
```

### Option 2: Via le proxy Next.js (recommandé)
```typescript
// apps/marketing-site/src/app/api/subscriptions/route.ts
const BACKEND_URL = 'https://dgze8l03lwl5h.cloudfront.net';
```

## Monitoring

```bash
# Vérifier le statut de la distribution CloudFront
aws cloudfront get-distribution --id E1H1CDV902R49R --query 'Distribution.Status'

# Invalider le cache après déploiement
aws cloudfront create-invalidation --distribution-id E1H1CDV902R49R --paths "/*"

# Vérifier le statut Elastic Beanstalk
cd services/subscriptions-contracts-eb
eb status

# Tester l'API en HTTPS
curl https://dgze8l03lwl5h.cloudfront.net/
```

## Configuration MongoDB Production

⚠️ **Important:** L'URI MongoDB actuelle pointe vers localhost. Pour la production, configurez MongoDB Atlas:

```bash
# 1. Créer un cluster MongoDB Atlas
# 2. Obtenir l'URI de connexion
# 3. Configurer via EB CLI
eb setenv MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts"

# 4. Redéployer
eb deploy
```

## Notes

- CloudFront met en cache les réponses GET/HEAD par défaut
- Les POST ne sont pas mis en cache (données toujours fraîches)
- Le déploiement CloudFront prend 5-15 minutes
- L'invalidation du cache prend 1-3 minutes
- MongoDB doit être migré vers Atlas pour la production

## Sécurité

- ✅ HTTPS activé via CloudFront
- ✅ Helmet (security headers)
- ✅ CORS configuré pour Amplify et rt-technologie.com
- ✅ Rate limiting (100 req/15min par IP)
- ⏳ Authentication middleware à ajouter

## Prochaines Étapes

1. Attendre le déploiement CloudFront (5-15 min)
2. Migrer MongoDB vers Atlas
3. Ajouter authentication middleware
4. Configurer génération PDF (pdfkit)
5. Configurer emails (nodemailer)
6. Ajouter tests e2e
7. Monitoring et alertes

---

**Créé le:** 24 novembre 2025
**Distribution ID:** E1H1CDV902R49R
**Status:** 🟡 En cours de déploiement
