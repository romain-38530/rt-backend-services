# Configuration CloudFront pour authz-eb

## URL HTTPS (Recommandée)
- **CloudFront HTTPS:** https://d2i50a1vlg138w.cloudfront.net
- **Distribution ID:** E8GKHGYOIP84

## Backend Origin
- **Elastic Beanstalk HTTP:** http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Region:** eu-central-1

## Configuration CloudFront
- ✅ HTTPS automatique (certificat AWS)
- ✅ Toutes méthodes HTTP (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- ✅ Headers CORS transférés (Origin, Content-Type, Access-Control-*)
- ✅ Query strings et cookies transférés
- ✅ Cache CloudFront activé (GET/HEAD seulement)
- ✅ Global CDN (faible latence mondiale)

## Endpoints disponibles

### Health Check
```bash
curl https://d2i50a1vlg138w.cloudfront.net/health
```

### Validation TVA (format)
```bash
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate-format \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'
```

### Validation TVA (VIES)
```bash
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'
```

## Frontend Configuration

### Option 1: Appel direct depuis le frontend
```typescript
const response = await fetch('https://d2i50a1vlg138w.cloudfront.net/api/vat/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vatNumber })
});
```

### Option 2: Via le proxy Next.js (recommandé si besoin de cacher la clé API)
```typescript
// apps/marketing-site/src/app/api/vat/validate/route.ts
const BACKEND_URL = 'https://d2i50a1vlg138w.cloudfront.net';
```

## Monitoring
```bash
# Vérifier le statut de la distribution
aws cloudfront get-distribution --id E8GKHGYOIP84 --query 'Distribution.Status'

# Vérifier les logs
aws cloudfront get-distribution --id E8GKHGYOIP84
```

## Notes
- CloudFront met en cache les réponses par défaut
- Pour invalidation du cache : `aws cloudfront create-invalidation --distribution-id E8GKHGYOIP84 --paths "/*"`
- Le déploiement CloudFront prend 5-15 minutes
