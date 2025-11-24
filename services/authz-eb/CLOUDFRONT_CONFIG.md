# Configuration CloudFront pour authz-eb

## URL HTTPS (Recommandée)
- **CloudFront HTTPS:** https://d2i50a1vlg138w.cloudfront.net
- **Distribution ID:** E8GKHGYOIP84
- **Version actuelle:** 2.2.0

## Backend Origin
- **Elastic Beanstalk HTTP:** http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com
- **Region:** eu-central-1
- **Health:** Green ✅

## Configuration CloudFront
- ✅ HTTPS automatique (certificat AWS)
- ✅ Toutes méthodes HTTP (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- ✅ Headers CORS transférés (Origin, Content-Type, Access-Control-*)
- ✅ Query strings et cookies transférés
- ✅ Cache CloudFront activé (GET/HEAD seulement)
- ✅ Global CDN (faible latence mondiale)

## Fonctionnalités v2.2.0
- ✅ **Validation TVA multi-API avec fallback:** VIES → AbstractAPI → APILayer
- ✅ **Calcul de prix avec TVA** (APILayer)
- ✅ **Cache intelligent** (1h pour résultats valides)
- ✅ **Traçabilité API** (champ `source` indique quelle API a répondu)

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

### Validation TVA (Multi-API avec fallback)
```bash
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'
```

**Réponse:**
```json
{
  "success": true,
  "valid": true,
  "countryCode": "FR",
  "vatNumber": "12345678901",
  "requestDate": "2025-11-24T18:34:18.069Z",
  "companyName": "Nom de l'entreprise",
  "companyAddress": "Adresse",
  "source": "VIES"
}
```

### Calcul de prix avec TVA
```bash
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/calculate-price \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"countryCode":"FR"}'
```

**Réponse:**
```json
{
  "success": true,
  "countryCode": "FR",
  "countryName": "France",
  "priceExclVat": 100,
  "priceInclVat": 120,
  "vatRate": 20
}
```

## Frontend Configuration

### Option 1: Appel direct depuis le frontend

**Validation TVA:**
```typescript
const response = await fetch('https://d2i50a1vlg138w.cloudfront.net/api/vat/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ vatNumber })
});
const data = await response.json();
// data.valid, data.source, data.companyName, data.companyAddress
```

**Calcul de prix avec TVA:**
```typescript
const response = await fetch('https://d2i50a1vlg138w.cloudfront.net/api/vat/calculate-price', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ amount: 100, countryCode: 'FR' })
});
const data = await response.json();
// data.priceExclVat, data.priceInclVat, data.vatRate
```

### Option 2: Via le proxy Next.js (recommandé)
```typescript
// apps/marketing-site/src/app/api/vat/validate/route.ts
const BACKEND_URL = 'https://d2i50a1vlg138w.cloudfront.net';
```

## Système de Fallback Multi-API (v2.2.0)

### Ordre de priorité pour validation TVA:
1. **VIES (EU officielle, gratuite)** - Essayée en premier
   - API: `https://ec.europa.eu/taxation_customs/vies/rest-api/ms`
   - Avantage: Gratuite, source officielle UE

2. **AbstractAPI (payante)** - Fallback si VIES échoue
   - API: `https://vat.abstractapi.com/v1/validate`
   - Clé API: configurée via `ABSTRACT_API_KEY`

3. **APILayer (payante)** - Fallback final
   - API: `http://apilayer.net/api/validate`
   - Clé API: configurée via `APILAYER_API_KEY`

### Avantages:
- ✅ Haute disponibilité: Si VIES est HS, les APIs payantes prennent le relais
- ✅ Optimisation coûts: VIES gratuite en priorité
- ✅ Traçabilité: Le champ `source` indique quelle API a répondu
- ✅ Cache intelligent: Résultats valides mis en cache 1h

## Monitoring
```bash
# Vérifier le statut de la distribution CloudFront
aws cloudfront get-distribution --id E8GKHGYOIP84 --query 'Distribution.Status'

# Invalider le cache après déploiement
aws cloudfront create-invalidation --distribution-id E8GKHGYOIP84 --paths "/*"

# Vérifier le statut Elastic Beanstalk
eb status

# Tester l'API en HTTPS
curl https://d2i50a1vlg138w.cloudfront.net/
```

## Notes
- CloudFront met en cache les réponses GET/HEAD par défaut
- Les POST ne sont pas mis en cache (validation TVA toujours fraîche)
- Le déploiement CloudFront prend 5-15 minutes
- L'invalidation du cache prend 1-3 minutes
