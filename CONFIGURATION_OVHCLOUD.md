# Configuration OVHcloud - RT SYMPHONI.A

## Vue d'ensemble

Cette documentation décrit l'intégration avec l'API OVHcloud pour gérer :
- **DNS** : Enregistrements DNS (A, AAAA, CNAME, MX, TXT, etc.)
- **Emails** : Comptes email et redirections
- **Domaine** : Informations sur le domaine rt-symphonia.com

## Credentials API

### Application créée sur OVHcloud

| Paramètre | Valeur |
|-----------|---------|
| **Nom de l'application** | symphonia |
| **Description** | api Symphonia |
| **Application Key** | `ed9d52f0f9666bcf` |
| **Application Secret** | `e310afd76f33ae5aa5b92fd0636952f7` |
| **Consumer Key** | `ab3abd0d8ead07b78823e019afa83561` |
| **Endpoint** | ovh-eu (Europe) |
| **Domaine géré** | rt-symphonia.com |

### Créer une application OVHcloud (pour référence future)

1. Aller sur https://eu.api.ovh.com/createApp/
2. Remplir le formulaire :
   - Application name : `symphonia`
   - Application description : `api Symphonia`
3. Noter les credentials générés (Application Key + Application Secret)
4. Générer un Consumer Key avec les droits nécessaires

## Installation

### 1. Installer les dépendances

```bash
cd services/subscriptions-contracts-eb
npm install ovh --save
```

### 2. Configuration des variables d'environnement

#### Développement local

Créer un fichier `.env.local` :

```bash
# OVHcloud API
OVH_APP_KEY=ed9d52f0f9666bcf
OVH_APP_SECRET=e310afd76f33ae5aa5b92fd0636952f7
OVH_CONSUMER_KEY=ab3abd0d8ead07b78823e019afa83561
OVH_ENDPOINT=ovh-eu
OVH_DOMAIN=rt-symphonia.com
```

Charger les variables :

```bash
export $(cat .env.ovhcloud | xargs)
node index.js
```

#### Production (AWS Elastic Beanstalk)

```bash
eb setenv \
  OVH_APP_KEY=ed9d52f0f9666bcf \
  OVH_APP_SECRET=e310afd76f33ae5aa5b92fd0636952f7 \
  OVH_CONSUMER_KEY=ab3abd0d8ead07b78823e019afa83561 \
  OVH_ENDPOINT=ovh-eu \
  OVH_DOMAIN=rt-symphonia.com

eb deploy
```

Ou via la console AWS :
- Elastic Beanstalk → Configuration → Software → Environment properties
- Ajouter les 5 variables manuellement

### 3. Monter les routes dans index.js

Ajouter dans `index.js` :

```javascript
// OVHcloud routes
const ovhcloudRoutes = require('./routes/ovhcloud-routes');
app.use('/api/ovhcloud', ovhcloudRoutes);
console.log('✅ OVHcloud routes mounted successfully');
```

## Utilisation de l'API

### Status et Configuration

#### Vérifier le statut de l'intégration

```bash
GET /api/ovhcloud/status
```

**Réponse :**
```json
{
  "success": true,
  "data": {
    "configured": true,
    "domain": "rt-symphonia.com",
    "info": {
      "domain": "rt-symphonia.com",
      "nameServerType": "hosted",
      "dnssecSupported": true
    }
  }
}
```

#### Lister tous les domaines disponibles

```bash
GET /api/ovhcloud/domains
```

**Réponse :**
```json
{
  "success": true,
  "data": ["rt-symphonia.com"]
}
```

#### Obtenir les informations du domaine principal

```bash
GET /api/ovhcloud/domain
```

---

## Gestion DNS

### Lister les enregistrements DNS

```bash
GET /api/ovhcloud/dns/records
GET /api/ovhcloud/dns/records?fieldType=A
GET /api/ovhcloud/dns/records?subDomain=api
```

**Réponse :**
```json
{
  "success": true,
  "data": [
    {
      "id": 123456789,
      "zone": "rt-symphonia.com",
      "subDomain": "",
      "fieldType": "A",
      "target": "51.178.49.191",
      "ttl": 3600
    },
    {
      "id": 987654321,
      "zone": "rt-symphonia.com",
      "subDomain": "www",
      "fieldType": "CNAME",
      "target": "rt-symphonia.com.",
      "ttl": 3600
    }
  ],
  "count": 2
}
```

### Créer un enregistrement DNS

```bash
POST /api/ovhcloud/dns/records
Content-Type: application/json

{
  "subDomain": "api",
  "fieldType": "A",
  "target": "51.178.49.191",
  "ttl": 3600
}
```

**Types d'enregistrements supportés :**
- `A` : IPv4
- `AAAA` : IPv6
- `CNAME` : Alias
- `MX` : Serveur mail
- `TXT` : Texte (SPF, DKIM, etc.)
- `NS` : Serveur de noms
- `SRV` : Service

**Exemples :**

```bash
# Enregistrement A (IPv4)
{
  "subDomain": "api",
  "fieldType": "A",
  "target": "51.178.49.191"
}

# Enregistrement CNAME
{
  "subDomain": "www",
  "fieldType": "CNAME",
  "target": "rt-symphonia.com."
}

# Enregistrement MX (email)
{
  "subDomain": "",
  "fieldType": "MX",
  "target": "1 mx.ovh.net."
}

# Enregistrement TXT (SPF)
{
  "subDomain": "",
  "fieldType": "TXT",
  "target": "\"v=spf1 include:mx.ovh.com ~all\""
}
```

### Mettre à jour un enregistrement DNS

```bash
PUT /api/ovhcloud/dns/records/123456789
Content-Type: application/json

{
  "target": "52.47.143.238",
  "ttl": 7200
}
```

### Supprimer un enregistrement DNS

```bash
DELETE /api/ovhcloud/dns/records/123456789
```

### Rafraîchir la zone DNS

**Important** : Les changements DNS sont automatiquement appliqués après chaque création/modification/suppression. Cette route est disponible pour forcer un refresh manuel si nécessaire.

```bash
POST /api/ovhcloud/dns/refresh
```

---

## Gestion des Emails

### Lister les comptes email

```bash
GET /api/ovhcloud/email/accounts
```

**Réponse :**
```json
{
  "success": true,
  "data": [
    {
      "accountName": "contact@rt-symphonia.com",
      "email": "contact@rt-symphonia.com",
      "size": 5000000000,
      "isBlocked": false,
      "description": "Contact principal"
    }
  ],
  "count": 1
}
```

### Créer un compte email

```bash
POST /api/ovhcloud/email/accounts
Content-Type: application/json

{
  "accountName": "support",
  "password": "SecureP@ssw0rd!123",
  "size": 5000
}
```

**Paramètres :**
- `accountName` : Nom du compte (ex: "support" pour support@rt-symphonia.com)
- `password` : Mot de passe (min 8 caractères, avec majuscules, minuscules, chiffres)
- `size` : Taille en MB (optionnel, défaut: 5000 MB = 5 GB)

### Modifier le mot de passe d'un compte email

```bash
POST /api/ovhcloud/email/accounts/support/password
Content-Type: application/json

{
  "password": "NewSecureP@ssw0rd!456"
}
```

### Supprimer un compte email

```bash
DELETE /api/ovhcloud/email/accounts/support
```

### Lister les redirections email

```bash
GET /api/ovhcloud/email/redirections
```

**Réponse :**
```json
{
  "success": true,
  "data": [
    {
      "id": "12345",
      "from": "info@rt-symphonia.com",
      "to": "contact@rt-symphonia.com",
      "localCopy": false
    }
  ],
  "count": 1
}
```

### Créer une redirection email

```bash
POST /api/ovhcloud/email/redirections
Content-Type: application/json

{
  "from": "info",
  "to": "contact@rt-symphonia.com",
  "localCopy": false
}
```

**Paramètres :**
- `from` : Email source (ex: "info" pour info@rt-symphonia.com)
- `to` : Email de destination (peut être externe)
- `localCopy` : Garder une copie locale (true/false)

### Supprimer une redirection email

```bash
DELETE /api/ovhcloud/email/redirections/12345
```

---

## Exemples d'Utilisation

### Configuration DNS pour une nouvelle API

```bash
# 1. Créer un enregistrement A pour api.rt-symphonia.com
curl -X POST http://localhost:8080/api/ovhcloud/dns/records \
  -H "Content-Type: application/json" \
  -d '{
    "subDomain": "api",
    "fieldType": "A",
    "target": "51.178.49.191",
    "ttl": 3600
  }'

# 2. Créer un enregistrement A pour app.rt-symphonia.com
curl -X POST http://localhost:8080/api/ovhcloud/dns/records \
  -H "Content-Type: application/json" \
  -d '{
    "subDomain": "app",
    "fieldType": "A",
    "target": "51.178.49.191",
    "ttl": 3600
  }'
```

### Configuration email pour une équipe

```bash
# 1. Créer compte support
curl -X POST http://localhost:8080/api/ovhcloud/email/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "support",
    "password": "SecureSupport123!",
    "size": 10000
  }'

# 2. Créer compte sales
curl -X POST http://localhost:8080/api/ovhcloud/email/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "sales",
    "password": "SecureSales123!",
    "size": 5000
  }'

# 3. Créer redirection info → support
curl -X POST http://localhost:8080/api/ovhcloud/email/redirections \
  -H "Content-Type: application/json" \
  -d '{
    "from": "info",
    "to": "support@rt-symphonia.com",
    "localCopy": false
  }'
```

### Automatisation avec Node.js

```javascript
const ovhcloudService = require('./integrations/ovhcloud-service');

// Initialiser le service
ovhcloudService.initialize();

// Créer plusieurs enregistrements DNS
async function setupSubdomains() {
  const subdomains = ['api', 'app', 'dashboard', 'admin'];
  const ip = '51.178.49.191';

  for (const subdomain of subdomains) {
    try {
      await ovhcloudService.createDNSRecord({
        subDomain: subdomain,
        fieldType: 'A',
        target: ip,
        ttl: 3600
      });
      console.log(`✅ ${subdomain}.rt-symphonia.com créé`);
    } catch (error) {
      console.error(`❌ Erreur ${subdomain}:`, error.message);
    }
  }
}

setupSubdomains();
```

---

## Sécurité

### Protection des Credentials

1. **Ne JAMAIS commiter les credentials dans Git**
   ```bash
   echo ".env.ovhcloud" >> .gitignore
   ```

2. **Utiliser AWS Secrets Manager en production**
   ```bash
   aws secretsmanager create-secret \
     --name rt-symphonia/ovhcloud \
     --description "OVHcloud API credentials" \
     --secret-string '{
       "OVH_APP_KEY":"ed9d52f0f9666bcf",
       "OVH_APP_SECRET":"e310afd76f33ae5aa5b92fd0636952f7",
       "OVH_CONSUMER_KEY":"ab3abd0d8ead07b78823e019afa83561"
     }'
   ```

3. **Rotation des Consumer Keys**
   - Régénérer un nouveau Consumer Key tous les 90 jours
   - Révoquer l'ancien Consumer Key après migration

### Permissions API

Les droits configurés pour l'application "symphonia" :

| Ressource | Droits | Description |
|-----------|--------|-------------|
| `/domain/*` | GET | Lecture informations domaine |
| `/domain/zone/*` | GET, POST, PUT, DELETE | Gestion DNS complète |
| `/email/domain/*` | GET, POST, PUT, DELETE | Gestion email complète |

### Rate Limiting

L'API OVHcloud impose des limites :
- **1200 requêtes / heure** (par IP)
- **20 requêtes / seconde** (burst)

En cas de dépassement : HTTP 429 Too Many Requests

---

## Monitoring

### Health Check

```bash
GET /api/ovhcloud/status
```

Retourne 200 si l'API est accessible, 503 sinon.

### CloudWatch Metrics (recommandé)

```javascript
// Ajouter dans monitoring-middleware.js
cloudwatch.putMetricData({
  Namespace: 'RTSYMPHONIA/OVHcloud',
  MetricData: [{
    MetricName: 'APIRequests',
    Value: 1,
    Unit: 'Count',
    Timestamp: new Date()
  }]
});
```

---

## Troubleshooting

### Erreur "OVHcloud client not initialized"

**Cause** : Variables d'environnement manquantes

**Solution** :
```bash
# Vérifier les variables
echo $OVH_APP_KEY
echo $OVH_APP_SECRET
echo $OVH_CONSUMER_KEY

# Configurer si manquantes
export OVH_APP_KEY=ed9d52f0f9666bcf
export OVH_APP_SECRET=e310afd76f33ae5aa5b92fd0636952f7
export OVH_CONSUMER_KEY=ab3abd0d8ead07b78823e019afa83561
```

### Erreur "Consumer key is not valid"

**Cause** : Consumer Key expiré ou invalide

**Solution** : Régénérer un nouveau Consumer Key sur https://eu.api.ovh.com/createToken/

### Erreur "This call has not been granted"

**Cause** : Droits insuffisants pour l'opération

**Solution** : Vérifier et étendre les droits du Consumer Key

### DNS non propagé

**Cause** : La propagation DNS peut prendre 24-48h

**Solution** :
```bash
# Vérifier la propagation
dig api.rt-symphonia.com
nslookup api.rt-symphonia.com

# Forcer le refresh de la zone
curl -X POST http://localhost:8080/api/ovhcloud/dns/refresh
```

---

## Coûts

### OVHcloud API

- **API gratuite** : Pas de coût pour l'utilisation de l'API
- **Domaine rt-symphonia.com** : ~10€/an
- **Email Pro** : ~2€/mois par compte (si utilisation)

### Estimations

| Service | Coût Mensuel | Coût Annuel |
|---------|--------------|-------------|
| Domaine rt-symphonia.com | ~0.83€ | ~10€ |
| 5 comptes email | 0€ (inclus) | 0€ |
| API (gratuite) | 0€ | 0€ |
| **TOTAL** | **~0.83€** | **~10€** |

---

## Ressources

### Documentation OVHcloud

- API Console : https://eu.api.ovh.com/console/
- Guide API : https://docs.ovh.com/fr/api/
- Node.js SDK : https://github.com/ovh/node-ovh
- Créer une app : https://eu.api.ovh.com/createApp/
- Générer token : https://eu.api.ovh.com/createToken/

### Support

- Documentation OVHcloud : https://docs.ovh.com/
- Forum OVHcloud : https://community.ovh.com/
- Support technique : https://www.ovh.com/manager/

---

## Checklist de Configuration

- [x] Credentials API créés sur OVHcloud
- [x] Variables d'environnement configurées (`.env.ovhcloud`)
- [ ] Dépendance `ovh` installée (`npm install ovh`)
- [ ] Routes OVHcloud montées dans `index.js`
- [ ] Test de connexion réussi (`GET /api/ovhcloud/status`)
- [ ] Enregistrements DNS créés (api, app, etc.)
- [ ] Comptes email créés (support, contact, etc.)
- [ ] Configuration déployée sur AWS EB
- [ ] Monitoring CloudWatch configuré
- [ ] Documentation partagée avec l'équipe

---

**Version** : 1.0.0
**Date** : 26 novembre 2025
**Auteur** : Claude Code
**Application OVHcloud** : symphonia
