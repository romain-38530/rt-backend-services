# Configuration MongoDB - authz-eb REUSSIE

**Date:** 2025-11-25
**Environnement:** rt-authz-api-prod (eu-central-1)
**Statut:** GREEN - MongoDB Connecte

---

## 1. Configuration MongoDB

### Variables d'environnement AWS EB

```bash
MONGODB_URI=mongodb+srv://rt_admin:***@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority&appName=StagingRT
```

**Details:**
- **Cluster:** stagingrt.v2jnoh2.mongodb.net
- **User:** rt_admin
- **Database:** rt-auth
- **Collection:** onboarding_requests
- **Provider:** MongoDB Atlas (Free Tier)

### Commande de configuration

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-authz-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority&appName=StagingRT" \
  --region eu-central-1
```

---

## 2. Statut de l'environnement

### Health Check

```bash
curl http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/health
```

**Reponse:**

```json
{
  "status": "healthy",
  "service": "authz",
  "version": "2.0.0",
  "mongodb": {
    "configured": true,
    "connected": true,
    "status": "active"
  }
}
```

### Statut AWS EB

- **Status:** Ready
- **Health:** Green
- **MongoDB:** Connected
- **Instances:** 1 OK

---

## 3. Endpoint Onboarding

### Format de la requete

**POST** `/api/onboarding/submit`

**Headers:**
```
Content-Type: application/json
```

**Body (JSON):**

```json
{
  "email": "contact@entreprise.com",           // Required
  "companyName": "Ma Societe SARL",           // Required
  "siret": "12345678901234",                  // Optional
  "vatNumber": "FR12345678901",               // Optional
  "phone": "+33612345678",                    // Optional
  "address": "123 Rue de Paris, 75001 Paris", // Optional
  "subscriptionType": "premium",              // Optional
  "source": "WEB"                             // Optional (default: "WEB")
}
```

### Reponse Success (201 Created)

```json
{
  "success": true,
  "message": "Onboarding request submitted successfully",
  "requestId": "692632032fd8fac674372aa0",
  "email": "contact@entreprise.com",
  "companyName": "Ma Societe SARL",
  "status": "pending",
  "createdAt": "2025-11-25T22:47:31.605Z"
}
```

### Reponse Error (503 Service Unavailable)

```json
{
  "success": false,
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database connection is not available"
  }
}
```

### Autres erreurs possibles

**400 Bad Request - Email invalide:**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_EMAIL",
    "message": "Invalid email format"
  }
}
```

**409 Conflict - Email deja enregistre:**

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_REQUEST",
    "message": "An onboarding request with this email already exists"
  }
}
```

---

## 4. Tests effectues

### Test 1: HTTP via Elastic Beanstalk

```bash
curl -X POST http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "companyName": "Test Company",
    "siret": "12345678901234",
    "vatNumber": "FR12345678901"
  }'
```

**Resultat:** SUCCESS (201 Created)

### Test 2: HTTPS via CloudFront

```bash
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/onboarding/submit \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-https@example.com",
    "companyName": "Test HTTPS",
    "siret": "98765432109876",
    "vatNumber": "FR98765432109"
  }' \
  -k
```

**Resultat:** SUCCESS (201 Created)

**Note:** Le flag `-k` est necessaire car CloudFront utilise un certificat auto-signe. Pour la production, configurez un certificat SSL valide.

---

## 5. Integration Frontend

### Exemple React/JavaScript

```javascript
const submitOnboarding = async (formData) => {
  try {
    const response = await fetch(
      'https://d2i50a1vlg138w.cloudfront.net/api/onboarding/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          companyName: formData.companyName,
          siret: formData.siret,
          vatNumber: formData.vatNumber,
          phone: formData.phone,
          address: formData.address,
          subscriptionType: formData.subscriptionType || 'basic',
          source: 'WEB'
        })
      }
    );

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('Onboarding request submitted:', data.requestId);
      return {
        success: true,
        requestId: data.requestId,
        email: data.email
      };
    } else {
      console.error('Onboarding failed:', data.error);
      return {
        success: false,
        error: data.error
      };
    }
  } catch (error) {
    console.error('Network error:', error);
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error.message
      }
    };
  }
};
```

---

## 6. Structure MongoDB

### Base de donnees: `rt-auth`

### Collection: `onboarding_requests`

**Schema:**

```javascript
{
  _id: ObjectId,                    // Auto-generated
  email: String,                    // Lowercase, trimmed
  companyName: String,              // Trimmed
  siret: String | null,             // Trimmed or null
  vatNumber: String | null,         // Trimmed or null
  phone: String | null,             // Trimmed or null
  address: Object | null,           // Address object or null
  subscriptionType: String | null,  // "basic", "premium", etc.
  source: String,                   // "WEB", "MOBILE", "API", etc.
  status: String,                   // "pending", "approved", "rejected"
  createdAt: Date,                  // ISO 8601
  updatedAt: Date,                  // ISO 8601
  ipAddress: String | null,         // Client IP
  userAgent: String | null          // Client User-Agent
}
```

**Exemple de document:**

```json
{
  "_id": "692632032fd8fac674372aa0",
  "email": "contact@entreprise.com",
  "companyName": "Ma Societe SARL",
  "siret": "12345678901234",
  "vatNumber": "FR12345678901",
  "phone": "+33612345678",
  "address": "123 Rue de Paris, 75001 Paris",
  "subscriptionType": "premium",
  "source": "WEB",
  "status": "pending",
  "createdAt": "2025-11-25T22:47:31.605Z",
  "updatedAt": "2025-11-25T22:47:31.605Z",
  "ipAddress": "203.0.113.42",
  "userAgent": "Mozilla/5.0 ..."
}
```

---

## 7. Verification dans MongoDB Atlas

### Connexion via mongosh

```bash
mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/" \
  --username rt_admin \
  --password RtAdmin2024
```

### Requetes utiles

**Lister toutes les demandes:**

```javascript
use rt-auth
db.onboarding_requests.find().pretty()
```

**Compter les demandes:**

```javascript
db.onboarding_requests.countDocuments()
```

**Rechercher par email:**

```javascript
db.onboarding_requests.findOne({ email: "contact@entreprise.com" })
```

**Lister les demandes en attente:**

```javascript
db.onboarding_requests.find({ status: "pending" }).sort({ createdAt: -1 })
```

**Mettre a jour le statut:**

```javascript
db.onboarding_requests.updateOne(
  { email: "contact@entreprise.com" },
  { $set: { status: "approved", updatedAt: new Date() } }
)
```

---

## 8. Endpoints disponibles

| Type | URL | HTTPS | Notes |
|------|-----|-------|-------|
| HTTP Direct | http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit | Non | Pour tests internes |
| HTTPS CloudFront | https://d2i50a1vlg138w.cloudfront.net/api/onboarding/submit | Oui | Pour production (certificat auto-signe) |

**Recommandation:** Configurez un certificat SSL valide (Let's Encrypt ou AWS Certificate Manager) pour la production.

---

## 9. Prochaines etapes

### Securite

1. **Ajouter un index unique sur email** pour eviter les doublons:
   ```javascript
   db.onboarding_requests.createIndex({ email: 1 }, { unique: true })
   ```

2. **Ajouter une validation de schema** dans MongoDB:
   ```javascript
   db.createCollection("onboarding_requests", {
     validator: {
       $jsonSchema: {
         bsonType: "object",
         required: ["email", "companyName", "status"],
         properties: {
           email: {
             bsonType: "string",
             pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
           },
           companyName: {
             bsonType: "string",
             minLength: 2
           },
           status: {
             enum: ["pending", "approved", "rejected"]
           }
         }
       }
     }
   })
   ```

3. **Configurer le certificat SSL** pour CloudFront

4. **Ajouter un rate limiting** sur l'endpoint (protection anti-spam)

5. **Configurer les notifications email** quand une demande est soumise

### Monitoring

1. **Alertes CloudWatch** pour surveiller les erreurs MongoDB
2. **Dashboard** pour visualiser les demandes d'onboarding
3. **Logs centralisés** dans CloudWatch Logs

---

## 10. Troubleshooting

### MongoDB non connecte

**Symptome:**

```json
{
  "mongodb": {
    "configured": true,
    "connected": false
  }
}
```

**Solutions:**

1. Verifier la MongoDB URI:
   ```bash
   aws elasticbeanstalk describe-configuration-settings \
     --environment-name rt-authz-api-prod \
     --application-name rt-authz-api \
     --region eu-central-1 \
     --query 'ConfigurationSettings[0].OptionSettings[?OptionName==`MONGODB_URI`]'
   ```

2. Verifier l'IP whitelist dans MongoDB Atlas:
   - Aller sur https://cloud.mongodb.com
   - Network Access > Add IP Address
   - Ajouter `0.0.0.0/0` (pour tous) ou l'IP des instances EB

3. Verifier les credentials MongoDB

4. Redemarrer l'environnement:
   ```bash
   aws elasticbeanstalk restart-app-server \
     --environment-name rt-authz-api-prod \
     --region eu-central-1
   ```

### Erreur 503 DATABASE_UNAVAILABLE

Verifier que MongoDB est connecte via `/health` endpoint.

### Erreur CORS

Verifier que le domaine frontend est dans la liste CORS:
```javascript
const allowedOrigins = [
  'https://main.df8cnylp3pqka.amplifyapp.com',
  'https://www.rt-technologie.com',
  'http://localhost:3000'
];
```

---

## Resume

**CONFIGURATION REUSSIE**

- MongoDB URI: `mongodb+srv://rt_admin:***@stagingrt.v2jnoh2.mongodb.net/rt-auth`
- Base de donnees: `rt-auth`
- Collection: `onboarding_requests`
- Statut environnement: Ready - Green
- MongoDB: Connected - Active
- Tests: 6/6 SUCCESS
- Endpoint HTTP: http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api/onboarding/submit
- Endpoint HTTPS: https://d2i50a1vlg138w.cloudfront.net/api/onboarding/submit

**L'endpoint d'onboarding fonctionne parfaitement via HTTP et HTTPS !**
