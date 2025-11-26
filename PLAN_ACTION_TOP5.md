# PLAN D'ACTION DETAILLE - TOP 5 TACHES PRIORITAIRES

**Date:** 26 novembre 2025
**Projet:** RT SYMPHONI.A
**Version:** 1.0.0

---

## TABLE DES MATIERES

1. [Tache #1 - Configuration Services Externes](#tache-1)
2. [Tache #2 - Securite API](#tache-2)
3. [Tache #3 - Monitoring & Alertes Production](#tache-3)
4. [Tache #4 - Tests Automatises E2E](#tache-4)
5. [Tache #5 - Developpement Services Skeleton](#tache-5)
6. [Timeline Globale](#timeline-globale)
7. [Ressources Necessaires](#ressources-necessaires)

---

<a name="tache-1"></a>
## TACHE #1 - CONFIGURATION SERVICES EXTERNES

**Priorite:** CRITIQUE
**Duree totale:** 2 semaines (10 jours ouvrables)
**Complexite:** 2/5
**Impact Business:** 10/10
**Responsable:** DevOps Lead + Backend Lead

### Objectif
Configurer TomTom Telematics API et AWS Textract pour debloquer les offres commerciales Premium (4EUR/vehicule/mois) et OCR automatique.

---

### PHASE 1: TomTom Telematics API (6 jours)

#### Jour 1: Creation Compte et Decouverte API
**Objectif:** Obtenir acces API TomTom Telematics

**Actions:**
1. Creer compte TomTom Telematics Business
   - Aller sur https://telematics.tomtom.com/
   - S'inscrire avec compte entreprise
   - Choisir plan "Fleet Management API"

2. Obtenir API Key
   - Acceder au dashboard TomTom
   - Section "API Keys"
   - Generer nouvelle cle production
   - Stocker en securite (1Password, AWS Secrets Manager)

3. Lire documentation API
   - Endpoints tracking temps reel
   - Format donnees GPS
   - Rate limits et quotas
   - Webhooks disponibles

**Livrables:**
- API Key TomTom obtenue
- Documentation endpoints clefs identifiee
- Compte notes techniques

**Criteres de succes:**
- Compte TomTom actif
- API Key valide

---

#### Jour 2-3: Integration Backend et Tests Dev
**Objectif:** Implementer integration TomTom dans subscriptions-contracts-eb

**Actions:**
1. Configurer variables d'environnement
   ```bash
   # Ajouter dans .env
   TOMTOM_API_KEY=your-api-key
   TOMTOM_API_URL=https://api.tomtom.com/fleet-management/v1
   ```

2. Creer module integration TomTom
   ```javascript
   // services/subscriptions-contracts-eb/integrations/tomtom-tracking.js
   const axios = require('axios');

   class TomTomTrackingService {
     constructor() {
       this.apiKey = process.env.TOMTOM_API_KEY;
       this.apiUrl = process.env.TOMTOM_API_URL;
     }

     async getVehiclePosition(vehicleId) {
       // Implementation
     }

     async startTracking(orderId, vehicleId) {
       // Implementation
     }

     async stopTracking(orderId) {
       // Implementation
     }
   }
   ```

3. Implementer endpoints API
   ```javascript
   // POST /api/transport-orders/:orderId/tracking/premium/start
   // GET /api/transport-orders/:orderId/tracking/premium/position
   // POST /api/transport-orders/:orderId/tracking/premium/stop
   ```

4. Tester sur environnement dev
   - Simuler tracking vehicule
   - Verifier reception donnees GPS
   - Tester mise a jour position temps reel

**Livrables:**
- Module tomtom-tracking.js cree
- 3 endpoints API implementes
- Tests manuels reussis

**Criteres de succes:**
- API retourne positions GPS valides
- Mise a jour position temps reel fonctionne

---

#### Jour 4: Configuration AWS Elastic Beanstalk Production
**Objectif:** Deployer configuration TomTom en production

**Actions:**
1. Configurer variable environnement AWS EB
   ```bash
   aws elasticbeanstalk update-environment \
     --application-name rt-subscriptions-api \
     --environment-name rt-subscriptions-api-prod \
     --option-settings \
       Namespace=aws:elasticbeanstalk:application:environment,\
       OptionName=TOMTOM_API_KEY,Value=your-api-key
   ```

2. Deployer nouvelle version
   ```bash
   cd services/subscriptions-contracts-eb
   npm run build
   # Creer package zip
   # Deployer via AWS Console ou CLI
   ```

3. Verifier deployment
   ```bash
   curl https://rt-subscriptions-api-prod.../health
   # Verifier TOMTOM_API_KEY configured: true
   ```

**Livrables:**
- Variable TOMTOM_API_KEY configuree en prod
- Deployment reussi
- Health check OK

**Criteres de succes:**
- API TomTom accessible depuis production
- Aucune erreur logs

---

#### Jour 5-6: Tests Production et Validation Couts
**Objectif:** Valider integration avec 5 vehicules test

**Actions:**
1. Tester tracking 5 vehicules reels
   - Creer 5 commandes test
   - Demarrer tracking premium
   - Suivre positions GPS pendant 24h
   - Verifier precision et frequence mise a jour

2. Analyser couts reel
   - Verifier facturation TomTom
   - Calculer cout par vehicule/mois
   - Comparer avec prevision (4EUR/vehicule/mois)
   - Ajuster tarifs si necessaire

3. Documenter configuration
   - Creer guide CONFIGURATION_TOMTOM_TELEMATICS.md
   - Documenter troubleshooting
   - Ajouter exemples API calls

**Livrables:**
- 5 vehicules test suivis avec succes
- Rapport couts reel vs prevision
- Documentation complete

**Criteres de succes:**
- Tracking fonctionne 24/7 sans interruption
- Couts conformes budget (4-5EUR/vehicule/mois)

---

### PHASE 2: AWS Textract OCR (4 jours)

#### Jour 7: Configuration IAM et Permissions
**Objectif:** Preparer acces AWS Textract

**Actions:**
1. Creer utilisateur IAM dedie
   ```bash
   aws iam create-user --user-name rt-textract-service
   ```

2. Attacher politique Textract
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "textract:DetectDocumentText",
           "textract:AnalyzeDocument",
           "textract:GetDocumentAnalysis"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

3. Generer Access Keys
   ```bash
   aws iam create-access-key --user-name rt-textract-service
   # Stocker AWS_ACCESS_KEY_ID et AWS_SECRET_ACCESS_KEY
   ```

4. Configurer region
   ```bash
   AWS_REGION=eu-central-1  # Frankfurt (RGPD compliant)
   ```

**Livrables:**
- Utilisateur IAM rt-textract-service cree
- Access Keys generes et stockes
- Permissions configurees

**Criteres de succes:**
- Acces Textract valide
- Region EU configuree

---

#### Jour 8-9: Integration Backend et Tests
**Objectif:** Implementer extraction OCR automatique

**Actions:**
1. Installer SDK AWS
   ```bash
   cd services/subscriptions-contracts-eb
   npm install @aws-sdk/client-textract
   ```

2. Creer service OCR
   ```javascript
   // services/subscriptions-contracts-eb/services/ocr-textract.js
   const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract');

   class TextractOCRService {
     constructor() {
       this.client = new TextractClient({
         region: process.env.AWS_REGION,
         credentials: {
           accessKeyId: process.env.AWS_ACCESS_KEY_ID,
           secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
         }
       });
     }

     async extractText(documentBuffer) {
       // Implementation extraction
     }

     async extractPODData(documentBuffer) {
       // Implementation extraction POD structuree
     }
   }
   ```

3. Implementer endpoints OCR
   ```javascript
   // Mettre a jour endpoints existants
   // POST /api/transport-orders/:orderId/documents/:id/ocr/extract
   // GET /api/transport-orders/:orderId/documents/:id/ocr/results
   ```

4. Tester sur 10 documents POD reels
   - Documents varies (scan, photo, qualite differente)
   - Verifier taux extraction
   - Mesurer temps traitement
   - Evaluer precision donnees extraites

**Livrables:**
- Service TextractOCRService implemente
- Endpoints OCR mis a jour
- Tests 10 documents reussis

**Criteres de succes:**
- Taux extraction > 90%
- Temps traitement < 5 secondes/document
- Donnees extraites precises

---

#### Jour 10: Configuration Production et Monitoring Couts
**Objectif:** Deployer en production et controler couts

**Actions:**
1. Configurer variables AWS EB
   ```bash
   aws elasticbeanstalk update-environment \
     --application-name rt-subscriptions-api \
     --environment-name rt-subscriptions-api-prod \
     --option-settings \
       Namespace=aws:elasticbeanstalk:application:environment,\
       OptionName=AWS_ACCESS_KEY_ID,Value=xxx \
       Namespace=aws:elasticbeanstalk:application:environment,\
       OptionName=AWS_SECRET_ACCESS_KEY,Value=xxx \
       Namespace=aws:elasticbeanstalk:application:environment,\
       OptionName=AWS_REGION,Value=eu-central-1
   ```

2. Configurer alertes budget AWS
   ```bash
   # AWS Budgets
   # Alerte si couts Textract > 100EUR/mois
   ```

3. Deployer nouvelle version

4. Verifier logs CloudWatch
   - Monitoring appels Textract
   - Tracking couts temps reel
   - Alertes erreurs

**Livrables:**
- Variables AWS configurees prod
- Alertes budget activees
- Deployment reussi

**Criteres de succes:**
- OCR fonctionne en production
- Alertes budget configurees
- Couts < 58EUR pour 10k pages/mois

---

### RISQUES ET MITIGATIONS

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Delai approbation compte TomTom | Moyenne | Haut | Demarrer demande immediatement |
| Couts TomTom superieurs prevus | Faible | Moyen | Tester avec 5 vehicules avant scaling |
| Precision OCR insuffisante | Moyenne | Moyen | Implementer fallback Google Vision API |
| Depassement budget AWS | Faible | Haut | Configurer alertes budget strictes |
| API TomTom rate limiting | Faible | Moyen | Implementer caching positions |

---

### CRITERES DE SUCCES GLOBAUX

1. TomTom Telematics API:
   - API Key obtenue et configuree
   - Tracking temps reel fonctionne 24/7
   - 5 vehicules test suivis avec succes
   - Couts conformes budget (4-5EUR/vehicule/mois)

2. AWS Textract OCR:
   - Utilisateur IAM configure
   - Extraction fonctionne sur 10+ documents
   - Taux extraction > 90%
   - Temps traitement < 5s/document
   - Couts < 60EUR/mois pour usage prevu

3. Documentation:
   - Guide configuration complete
   - Troubleshooting documente
   - Exemples API documentes

---

<a name="tache-2"></a>
## TACHE #2 - SECURITE API

**Priorite:** HAUTE
**Duree totale:** 1 semaine (5 jours ouvrables)
**Complexite:** 3/5
**Impact Business:** 9/10
**Responsable:** Backend Lead

### Objectif
Securiser l'API production contre abus et attaques via rate limiting, CORS stricte, et signatures webhooks.

---

### JOUR 1-2: Rate Limiting

**Objectif:** Proteger API contre abus et DDoS

**Actions:**

1. Installer dependance
   ```bash
   cd services/subscriptions-contracts-eb
   npm install express-rate-limit
   ```

2. Creer middleware rate limiting
   ```javascript
   // middleware/rate-limiter.js
   const rateLimit = require('express-rate-limit');

   // Rate limiter lecture (GET)
   const readLimiter = rateLimit({
     windowMs: 60 * 1000, // 1 minute
     max: 100, // 100 requetes max
     message: 'Too many requests, please try again later.',
     standardHeaders: true,
     legacyHeaders: false
   });

   // Rate limiter ecriture (POST, PUT, DELETE)
   const writeLimiter = rateLimit({
     windowMs: 60 * 1000,
     max: 20,
     message: 'Too many write requests, please slow down.'
   });

   // Rate limiter upload documents
   const uploadLimiter = rateLimit({
     windowMs: 60 * 1000,
     max: 5,
     message: 'Too many file uploads, please wait.'
   });

   module.exports = { readLimiter, writeLimiter, uploadLimiter };
   ```

3. Appliquer aux routes
   ```javascript
   // index.js
   const { readLimiter, writeLimiter, uploadLimiter } = require('./middleware/rate-limiter');

   // Routes GET
   app.use('/api/*', readLimiter);

   // Routes POST/PUT/DELETE
   app.post('/api/*', writeLimiter);
   app.put('/api/*', writeLimiter);
   app.delete('/api/*', writeLimiter);

   // Upload documents
   app.post('/api/*/documents/upload', uploadLimiter);
   ```

4. Tester rate limiting
   - Creer script test bombardement requetes
   - Verifier blocage apres seuils
   - Tester differents endpoints
   - Verifier headers X-RateLimit-*

5. Documenter limites dans API docs
   - Ajouter section "Rate Limiting" dans documentation
   - Documenter limites par endpoint
   - Expliquer headers retournes

**Livrables:**
- Middleware rate-limiter.js cree
- Rate limiting applique a tous endpoints
- Tests reussis
- Documentation mise a jour

**Criteres de succes:**
- Rate limiting bloque exces requetes
- Headers X-RateLimit correctement retournes
- Performance API non impactee

---

### JOUR 3: CORS Configuration Stricte

**Objectif:** Bloquer acces non autorise depuis autres domaines

**Actions:**

1. Configurer CORS stricte
   ```javascript
   // middleware/cors-config.js
   const cors = require('cors');

   // Domaines autorises production
   const allowedOrigins = [
     'https://app.symphonia.fr',
     'https://dashboard.symphonia.fr',
     'https://api.symphonia.fr'
   ];

   // Ajouter domaines dev si NODE_ENV=development
   if (process.env.NODE_ENV === 'development') {
     allowedOrigins.push('http://localhost:3000');
     allowedOrigins.push('http://localhost:3001');
   }

   const corsOptions = {
     origin: function (origin, callback) {
       // Autoriser requetes sans origin (Postman, curl)
       if (!origin) return callback(null, true);

       if (allowedOrigins.indexOf(origin) !== -1) {
         callback(null, true);
       } else {
         callback(new Error('Not allowed by CORS'));
       }
     },
     credentials: true,
     methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     allowedHeaders: ['Content-Type', 'Authorization'],
     maxAge: 86400 // 24h cache preflight
   };

   module.exports = cors(corsOptions);
   ```

2. Appliquer CORS
   ```javascript
   // index.js
   const corsMiddleware = require('./middleware/cors-config');
   app.use(corsMiddleware);
   ```

3. Tester depuis frontend Next.js
   - Verifier requetes depuis domaines autorises OK
   - Verifier blocage depuis autres domaines
   - Tester preflight OPTIONS requests
   - Verifier cookies/credentials

4. Configurer variables environnement
   ```bash
   # .env
   CORS_ALLOWED_ORIGINS=https://app.symphonia.fr,https://dashboard.symphonia.fr
   ```

**Livrables:**
- Middleware cors-config.js cree
- CORS stricte appliquee
- Tests cross-domain reussis
- Variables env configurees

**Criteres de succes:**
- Requetes domaines autorises OK
- Requetes autres domaines bloquees
- Preflight requests fonctionnent

---

### JOUR 4-5: Webhook Signatures HMAC

**Objectif:** Securiser webhooks avec signatures cryptographiques

**Actions:**

1. Generer secrets webhook par client
   ```javascript
   // utils/webhook-secrets.js
   const crypto = require('crypto');

   function generateWebhookSecret() {
     return crypto.randomBytes(32).toString('hex');
   }

   function signWebhookPayload(payload, secret) {
     const hmac = crypto.createHmac('sha256', secret);
     hmac.update(JSON.stringify(payload));
     return hmac.digest('hex');
   }

   function verifyWebhookSignature(payload, signature, secret) {
     const expectedSignature = signWebhookPayload(payload, secret);
     return crypto.timingSafeEqual(
       Buffer.from(signature),
       Buffer.from(expectedSignature)
     );
   }

   module.exports = {
     generateWebhookSecret,
     signWebhookPayload,
     verifyWebhookSignature
   };
   ```

2. Implementer signature webhooks
   ```javascript
   // services/webhook-service.js
   const { signWebhookPayload } = require('../utils/webhook-secrets');

   async function sendWebhook(url, event, data) {
     // Recuperer secret client depuis DB
     const client = await db.collection('clients').findOne({ webhookUrl: url });
     const secret = client.webhookSecret;

     const payload = {
       event,
       data,
       timestamp: Date.now()
     };

     const signature = signWebhookPayload(payload, secret);

     await fetch(url, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'X-Webhook-Signature': signature,
         'X-Webhook-Timestamp': payload.timestamp
       },
       body: JSON.stringify(payload)
     });
   }
   ```

3. Creer endpoint generation secret client
   ```javascript
   // POST /api/webhooks/generate-secret
   app.post('/api/webhooks/generate-secret', authMiddleware, async (req, res) => {
     const secret = generateWebhookSecret();

     // Sauvegarder secret pour client
     await db.collection('clients').updateOne(
       { _id: req.user.clientId },
       { $set: { webhookSecret: secret } }
     );

     res.json({ secret });
   });
   ```

4. Documenter verification signature cote client
   ```markdown
   # DOCUMENTATION_WEBHOOKS_EVENTS.md

   ## Verification Signature Webhook

   Chaque webhook inclut header `X-Webhook-Signature` SHA-256 HMAC.

   ### Exemple verification Node.js
   ```javascript
   const crypto = require('crypto');

   function verifyWebhook(req) {
     const signature = req.headers['x-webhook-signature'];
     const payload = req.body;
     const secret = 'your-webhook-secret';

     const hmac = crypto.createHmac('sha256', secret);
     hmac.update(JSON.stringify(payload));
     const expectedSignature = hmac.digest('hex');

     return signature === expectedSignature;
   }
   ```
   ```

5. Tester webhooks signatures
   - Envoyer webhooks test
   - Verifier signature correcte
   - Tester rejet signature invalide
   - Tester replay attack prevention (timestamp)

**Livrables:**
- Utils webhook-secrets.js cree
- Signatures implementees dans webhook-service.js
- Endpoint generation secret cree
- Documentation verification client complete
- Tests signatures reussis

**Criteres de succes:**
- Tous webhooks incluent signature HMAC
- Verification signature fonctionne
- Documentation claire pour clients

---

### RISQUES ET MITIGATIONS

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Faux positifs rate limiting | Moyenne | Moyen | Ajuster seuils apres monitoring 1 semaine |
| Blocage requetes legitimes CORS | Faible | Haut | Tester exhaustivement depuis frontend |
| Clients perdent webhook secret | Faible | Faible | Endpoint regeneration secret |
| Performance impactee middlewares | Faible | Moyen | Benchmarking avant/apres |

---

### CRITERES DE SUCCES GLOBAUX

1. Rate Limiting:
   - Middleware applique a tous endpoints
   - Seuils configures par type endpoint
   - Tests bombardement valides
   - Documentation complete

2. CORS:
   - Whitelist domaines stricte
   - Blocage autres origines
   - Tests cross-domain OK

3. Webhook Signatures:
   - Signatures HMAC SHA-256 implementees
   - Endpoint generation secret OK
   - Documentation verification client claire
   - Tests signatures valides

---

<a name="tache-3"></a>
## TACHE #3 - MONITORING & ALERTES PRODUCTION

**Priorite:** HAUTE
**Duree totale:** 1 semaine (5 jours ouvrables)
**Complexite:** 2/5
**Impact Business:** 9/10
**Responsable:** DevOps Lead

### Objectif
Deployer monitoring avance et alertes pour garantir uptime 99.9% et detection proactive incidents.

---

### JOUR 1-2: CloudWatch Alertes

**Objectif:** Configurer alertes AWS CloudWatch

**Actions:**

1. Creer alarmes CloudWatch
   ```bash
   # Alerte CPU > 80%
   aws cloudwatch put-metric-alarm \
     --alarm-name rt-subscriptions-high-cpu \
     --alarm-description "CPU utilization > 80% for 5 minutes" \
     --metric-name CPUUtilization \
     --namespace AWS/ElasticBeanstalk \
     --statistic Average \
     --period 300 \
     --threshold 80 \
     --comparison-operator GreaterThanThreshold \
     --evaluation-periods 1

   # Alerte Memory > 90%
   aws cloudwatch put-metric-alarm \
     --alarm-name rt-subscriptions-high-memory \
     --metric-name MemoryUtilization \
     --threshold 90

   # Alerte Erreurs API > 5%
   aws cloudwatch put-metric-alarm \
     --alarm-name rt-subscriptions-high-errors \
     --metric-name 4XXError \
     --threshold 5

   # Alerte Response Time > 1s
   aws cloudwatch put-metric-alarm \
     --alarm-name rt-subscriptions-slow-response \
     --metric-name Latency \
     --threshold 1000
   ```

2. Configurer SNS notifications
   ```bash
   # Creer topic SNS
   aws sns create-topic --name rt-subscriptions-alerts

   # Ajouter subscription email
   aws sns subscribe \
     --topic-arn arn:aws:sns:eu-central-1:xxx:rt-subscriptions-alerts \
     --protocol email \
     --notification-endpoint alerts@symphonia.fr
   ```

3. Lier alarmes a SNS
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name rt-subscriptions-high-cpu \
     --alarm-actions arn:aws:sns:eu-central-1:xxx:rt-subscriptions-alerts
   ```

4. Tester alarmes manuellement
   - Creer charge CPU artificielle
   - Verifier declenchement alarme
   - Verifier reception email
   - Tester recovery notification

**Livrables:**
- 4+ alarmes CloudWatch configurees
- Topic SNS cree avec subscriptions
- Tests alarmes reussis
- Emails notifications recus

**Criteres de succes:**
- Alarmes declenchent correctement
- Notifications emails fonctionnent
- Recovery notifications OK

---

### JOUR 3-5: Dashboard Monitoring Avance

**Objectif:** Deployer Datadog ou New Relic pour monitoring avance

**OPTION A: Datadog (Recommande)**

**Actions:**

1. Creer compte Datadog
   - S'inscrire sur https://www.datadoghq.com/
   - Choisir plan Pro (34$/host/mois)
   - Obtenir API Key

2. Installer agent Datadog sur EC2
   ```bash
   # .ebextensions/datadog-agent.config
   files:
     "/opt/datadog-install.sh":
       mode: "000755"
       content: |
         #!/bin/bash
         DD_API_KEY=xxx DD_SITE="datadoghq.eu" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script.sh)"

   commands:
     01_install_datadog:
       command: "/opt/datadog-install.sh"
   ```

3. Configurer integration Node.js
   ```bash
   npm install dd-trace
   ```

   ```javascript
   // index.js (top of file)
   const tracer = require('dd-trace').init({
     service: 'rt-subscriptions-api',
     env: process.env.NODE_ENV,
     version: '1.6.2'
   });
   ```

4. Creer custom metrics business
   ```javascript
   // utils/metrics.js
   const StatsD = require('node-statsd');
   const metrics = new StatsD({
     host: 'localhost',
     port: 8125,
     prefix: 'symphonia.'
   });

   // Incrementer commandes creees
   metrics.increment('orders.created');

   // Mesurer temps livraison
   metrics.histogram('orders.delivery_time', deliveryTimeHours);

   // Gauge transporteurs actifs
   metrics.gauge('carriers.active', activeCount);

   module.exports = metrics;
   ```

5. Configurer metriques business
   - Nombre commandes/jour
   - Temps moyen livraison
   - Taux ponctualite
   - Score moyen transporteurs
   - Taux completion documents
   - Erreurs OCR

6. Creer dashboards Datadog
   - Dashboard Infrastructure (CPU, Memory, Disk, Network)
   - Dashboard Application (Response time, Throughput, Errors)
   - Dashboard Business (Commandes, Livraisons, Scores)
   - Dashboard Alertes (Incidents en cours)

7. Configurer alertes business
   - Commandes/jour < 10 (alerte baisse activite)
   - Taux ponctualite < 90% (alerte qualite service)
   - Score transporteurs < 4.0 (alerte satisfaction)
   - Taux erreurs OCR > 10% (alerte probleme technique)

**Livrables:**
- Agent Datadog deploye
- Integration Node.js configuree
- Custom metrics business implementees
- 4+ dashboards crees
- Alertes business configurees

**Criteres de succes:**
- Datadog collecte metriques temps reel
- Dashboards affichent donnees correctes
- Alertes business fonctionnent

---

**OPTION B: New Relic (Alternative)**

Similaire a Datadog, remplacer par:
- Installer agent New Relic
- Utiliser newrelic npm package
- Configurer dashboards New Relic

---

### RISQUES ET MITIGATIONS

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Cout Datadog eleve | Moyenne | Moyen | Commencer avec 1-2 hosts, evaluer ROI |
| Faux positifs alertes | Moyenne | Faible | Ajuster seuils apres 1 semaine monitoring |
| Performance impactee agent | Faible | Moyen | Benchmarking avant/apres |

---

### CRITERES DE SUCCES GLOBAUX

1. CloudWatch Alertes:
   - 4+ alarmes configurees et actives
   - SNS notifications fonctionnent
   - Tests alarmes reussis

2. Datadog/New Relic:
   - Agent deploye et collecte metriques
   - 4+ dashboards crees
   - Custom metrics business implementees
   - Alertes business configurees
   - Cout < 100$/mois

3. Detection Incidents:
   - Detection incidents < 5 minutes
   - Notifications equipe automatiques
   - Dashboards accessibles 24/7

---

<a name="tache-4"></a>
## TACHE #4 - TESTS AUTOMATISES E2E

**Priorite:** HAUTE
**Duree totale:** 2 semaines (10 jours ouvrables)
**Complexite:** 3/5
**Impact Business:** 8/10
**Responsable:** QA Engineer + Backend Lead

### Objectif
Creer suite tests E2E complete pour garantir qualite et prevenir regressions.

---

### SEMAINE 1: Tests End-to-End Playwright

**JOUR 1-2: Setup Infrastructure Tests**

**Actions:**

1. Installer Playwright
   ```bash
   cd services/subscriptions-contracts-eb
   npm install -D @playwright/test
   npx playwright install
   ```

2. Configurer Playwright
   ```javascript
   // playwright.config.js
   const { defineConfig } = require('@playwright/test');

   module.exports = defineConfig({
     testDir: './tests/e2e',
     timeout: 60000,
     retries: 2,
     workers: 4,
     use: {
       baseURL: 'http://localhost:3000',
       trace: 'on-first-retry',
       screenshot: 'only-on-failure'
     },
     projects: [
       { name: 'API Tests', testDir: './tests/e2e/api' }
     ]
   });
   ```

3. Creer fixtures tests
   ```javascript
   // tests/fixtures/test-data.js
   module.exports = {
     testOrder: {
       reference: 'TEST-001',
       pickup: {
         address: '123 Rue Test, Paris',
         date: '2025-12-01T10:00:00Z'
       },
       delivery: {
         address: '456 Ave Test, Lyon',
         date: '2025-12-02T16:00:00Z'
       }
     },
     testCarrier: {
       name: 'Test Transport SARL',
       siret: '12345678901234',
       email: 'test@carrier.com'
     }
   };
   ```

**Livrables:**
- Playwright installe et configure
- Structure tests creee
- Fixtures test data preparees

---

**JOUR 3-5: Implementation Tests Workflow Complet**

**Actions:**

1. Test creation commande
   ```javascript
   // tests/e2e/api/01-order-creation.spec.js
   const { test, expect } = require('@playwright/test');
   const { testOrder } = require('../../fixtures/test-data');

   test.describe('Order Creation', () => {
     test('should create new transport order', async ({ request }) => {
       const response = await request.post('/api/transport-orders', {
         data: testOrder
       });

       expect(response.status()).toBe(201);
       const order = await response.json();
       expect(order).toHaveProperty('orderId');
       expect(order.reference).toBe(testOrder.reference);

       // Stocker orderId pour tests suivants
       global.testOrderId = order.orderId;
     });
   });
   ```

2. Test assignation transporteur
   ```javascript
   // tests/e2e/api/02-carrier-assignment.spec.js
   test('should assign carrier to order', async ({ request }) => {
     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/assign-carrier`,
       { data: { carrierId: 'carrier-test-123' } }
     );

     expect(response.status()).toBe(200);
     const result = await response.json();
     expect(result.assignedCarrier).toBe('carrier-test-123');
   });
   ```

3. Test tracking GPS
   ```javascript
   // tests/e2e/api/03-tracking.spec.js
   test('should start GPS tracking', async ({ request }) => {
     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/tracking/start`,
       { data: { vehicleId: 'vehicle-123' } }
     );

     expect(response.status()).toBe(200);
   });

   test('should update GPS position', async ({ request }) => {
     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/tracking/update`,
       {
         data: {
           lat: 48.8566,
           lng: 2.3522,
           timestamp: new Date().toISOString()
         }
       }
     );

     expect(response.status()).toBe(200);
   });
   ```

4. Test upload documents
   ```javascript
   // tests/e2e/api/04-documents.spec.js
   test('should upload POD document', async ({ request }) => {
     const filePath = path.join(__dirname, '../../fixtures/test-pod.pdf');
     const file = fs.readFileSync(filePath);

     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/documents`,
       {
         multipart: {
           document: {
             name: 'test-pod.pdf',
             mimeType: 'application/pdf',
             buffer: file
           },
           documentType: 'POD'
         }
       }
     );

     expect(response.status()).toBe(200);
     const result = await response.json();
     global.testDocumentId = result.documentId;
   });
   ```

5. Test extraction OCR
   ```javascript
   // tests/e2e/api/05-ocr.spec.js
   test('should extract OCR from document', async ({ request }) => {
     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/documents/${global.testDocumentId}/ocr/extract`
     );

     expect(response.status()).toBe(200);
   });

   test('should get OCR results', async ({ request }) => {
     // Attendre traitement OCR
     await new Promise(resolve => setTimeout(resolve, 5000));

     const response = await request.get(
       `/api/transport-orders/${global.testOrderId}/documents/${global.testDocumentId}/ocr/results`
     );

     expect(response.status()).toBe(200);
     const results = await response.json();
     expect(results).toHaveProperty('extractedText');
   });
   ```

6. Test cloture commande
   ```javascript
   // tests/e2e/api/06-order-closure.spec.js
   test('should close order', async ({ request }) => {
     const response = await request.post(
       `/api/transport-orders/${global.testOrderId}/close`,
       {
         data: {
           deliveredAt: new Date().toISOString(),
           signature: 'base64-signature'
         }
       }
     );

     expect(response.status()).toBe(200);
     const result = await response.json();
     expect(result.status).toBe('closed');
   });
   ```

7. Configurer CI/CD GitHub Actions
   ```yaml
   # .github/workflows/tests.yml
   name: E2E Tests

   on:
     push:
       branches: [main, develop]
     pull_request:
       branches: [main]

   jobs:
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: '20'
         - run: npm install
         - run: npm run test:e2e
         - uses: actions/upload-artifact@v3
           if: failure()
           with:
             name: test-results
             path: test-results/
   ```

**Livrables:**
- 20+ tests E2E couvrant workflow complet
- Tests automatises dans CI/CD
- Coverage > 80% endpoints critiques

**Criteres de succes:**
- Tous tests passent
- Workflow complet teste
- CI/CD execute tests automatiquement

---

### SEMAINE 2: Tests de Charge

**JOUR 6-7: Tests API avec K6**

**Actions:**

1. Installer K6
   ```bash
   # Windows: choco install k6
   # Linux: brew install k6
   ```

2. Creer script test charge API
   ```javascript
   // tests/load/api-load-test.js
   import http from 'k6/http';
   import { check, sleep } from 'k6';

   export const options = {
     stages: [
       { duration: '1m', target: 50 },   // Ramp-up a 50 users
       { duration: '3m', target: 100 },  // Stay at 100 users
       { duration: '1m', target: 200 },  // Spike to 200 users
       { duration: '1m', target: 0 }     // Ramp-down
     ],
     thresholds: {
       http_req_duration: ['p(95)<500'], // 95% requetes < 500ms
       http_req_failed: ['rate<0.05']    // Taux erreur < 5%
     }
   };

   export default function () {
     // Test GET orders
     const getRes = http.get('https://api.symphonia.fr/api/transport-orders');
     check(getRes, {
       'GET status 200': (r) => r.status === 200,
       'GET response time < 500ms': (r) => r.timings.duration < 500
     });

     // Test POST order
     const postRes = http.post(
       'https://api.symphonia.fr/api/transport-orders',
       JSON.stringify({ reference: `LOAD-TEST-${Date.now()}` }),
       { headers: { 'Content-Type': 'application/json' } }
     );
     check(postRes, {
       'POST status 201': (r) => r.status === 201
     });

     sleep(1);
   }
   ```

3. Executer tests charge
   ```bash
   k6 run tests/load/api-load-test.js
   ```

4. Analyser resultats
   - Response time p50, p95, p99
   - Throughput (req/s)
   - Taux erreur
   - Identifier bottlenecks

**Livrables:**
- Script K6 tests charge API
- Rapport resultats tests
- Identification bottlenecks

---

**JOUR 8-9: Tests MongoDB et Optimisation**

**Actions:**

1. Test charge MongoDB
   ```javascript
   // tests/load/mongodb-load-test.js
   const { MongoClient } = require('mongodb');
   const { performance } = require('perf_hooks');

   async function loadTestMongoDB() {
     const client = new MongoClient(process.env.MONGODB_URI);
     await client.connect();
     const db = client.db();

     // Inserer 10k commandes
     const startInsert = performance.now();
     const orders = [];
     for (let i = 0; i < 10000; i++) {
       orders.push({
         reference: `LOAD-${i}`,
         status: 'pending',
         createdAt: new Date()
       });
     }
     await db.collection('transport-orders').insertMany(orders);
     const insertTime = performance.now() - startInsert;
     console.log(`Insert 10k orders: ${insertTime}ms`);

     // Queries
     const startQuery = performance.now();
     const result = await db.collection('transport-orders')
       .find({ status: 'pending' })
       .limit(100)
       .toArray();
     const queryTime = performance.now() - startQuery;
     console.log(`Query 100 orders: ${queryTime}ms`);

     await client.close();
   }
   ```

2. Optimiser indexes MongoDB
   ```javascript
   // Creer indexes
   await db.collection('transport-orders').createIndex({ reference: 1 }, { unique: true });
   await db.collection('transport-orders').createIndex({ status: 1 });
   await db.collection('transport-orders').createIndex({ createdAt: -1 });
   await db.collection('transport-orders').createIndex({ 'pickup.date': 1 });
   await db.collection('transport-orders').createIndex({ 'assignedCarrier.id': 1 });
   ```

3. Tester queries optimisees
   - Comparer temps execution avant/apres indexes
   - Utiliser explain() pour analyser plans execution
   - Identifier queries lentes

**Livrables:**
- Script tests charge MongoDB
- Indexes optimises crees
- Rapport amelioration performance

---

**JOUR 10: Tests WebSocket et Auto-Scaling**

**Actions:**

1. Test charge WebSocket
   ```javascript
   // tests/load/websocket-load-test.js (K6)
   import ws from 'k6/ws';
   import { check } from 'k6';

   export const options = {
     stages: [
       { duration: '1m', target: 100 },
       { duration: '2m', target: 500 },
       { duration: '1m', target: 0 }
     ]
   };

   export default function () {
     const url = 'wss://api.symphonia.fr/ws';
     const response = ws.connect(url, function (socket) {
       socket.on('open', () => {
         socket.send(JSON.stringify({ action: 'subscribe', orderId: 'test' }));
       });

       socket.on('message', (data) => {
         check(data, {
           'message received': (d) => d.length > 0
         });
       });

       socket.setTimeout(() => {
         socket.close();
       }, 60000);
     });
   }
   ```

2. Configurer auto-scaling AWS EB
   ```yaml
   # .ebextensions/autoscaling.config
   option_settings:
     - namespace: aws:autoscaling:asg
       option_name: MinSize
       value: "2"
     - namespace: aws:autoscaling:asg
       option_name: MaxSize
       value: "10"
     - namespace: aws:autoscaling:trigger
       option_name: MeasureName
       value: CPUUtilization
     - namespace: aws:autoscaling:trigger
       option_name: UpperThreshold
       value: "70"
     - namespace: aws:autoscaling:trigger
       option_name: LowerThreshold
       value: "30"
   ```

3. Tester auto-scaling
   - Generer charge CPU elevee
   - Verifier scaling up
   - Reduire charge
   - Verifier scaling down

**Livrables:**
- Script tests charge WebSocket
- Auto-scaling configure
- Tests scaling reussis

---

### CRITERES DE SUCCES GLOBAUX

1. Tests E2E:
   - 20+ tests Playwright
   - Coverage > 80%
   - CI/CD execute tests
   - Tous tests passent

2. Tests Charge:
   - API supporte 100+ req/s
   - p95 response time < 500ms
   - Taux erreur < 5%
   - MongoDB optimise (indexes)
   - WebSocket supporte 500+ connexions
   - Auto-scaling fonctionne

---

<a name="tache-5"></a>
## TACHE #5 - DEVELOPPEMENT SERVICES SKELETON

**Priorite:** MOYENNE
**Duree totale:** 4-6 semaines
**Complexite:** 4/5
**Impact Business:** 7/10
**Responsable:** Backend Lead + 2 Backend Devs

### Objectif
Developper les services skeleton (orders-eb, ecmr-eb, palettes-eb, planning-eb) avec logique metier complete.

---

### APPROCHE GENERALE

**Pattern a suivre:** Copier architecture subscriptions-contracts-eb
- Structure dossiers identique
- Middlewares partages
- Validation Zod
- MongoDB patterns
- Error handling
- Logging
- Tests

---

### SERVICE 1: orders-eb (1.5 semaines)

**Objectif:** API Commandes complete avec CRUD, validation, recherche

**SEMAINE 1-2:**

1. Structure projet
   ```
   orders-eb/
   ├── index.js                 # Main server
   ├── routes/
   │   └── orders.js           # Routes commandes
   ├── controllers/
   │   └── orders-controller.js
   ├── models/
   │   └── order-schema.js     # Zod schema
   ├── services/
   │   └── order-service.js
   ├── middleware/
   │   ├── auth.js
   │   ├── validation.js
   │   └── error-handler.js
   └── tests/
       └── orders.test.js
   ```

2. Implementer endpoints CRUD
   ```javascript
   // routes/orders.js
   const express = require('express');
   const router = express.Router();
   const ordersController = require('../controllers/orders-controller');
   const { validateRequest } = require('../middleware/validation');
   const { orderSchema } = require('../models/order-schema');

   // CRUD
   router.post('/', validateRequest(orderSchema), ordersController.create);
   router.get('/', ordersController.list);
   router.get('/:orderId', ordersController.getById);
   router.put('/:orderId', validateRequest(orderSchema), ordersController.update);
   router.delete('/:orderId', ordersController.delete);

   // Recherche avancee
   router.get('/search', ordersController.search);

   // Status
   router.patch('/:orderId/status', ordersController.updateStatus);

   module.exports = router;
   ```

3. Schema validation Zod
   ```javascript
   // models/order-schema.js
   const { z } = require('zod');

   const orderSchema = z.object({
     reference: z.string().min(3),
     clientId: z.string(),
     pickup: z.object({
       address: z.string(),
       date: z.string().datetime(),
       contact: z.string().optional()
     }),
     delivery: z.object({
       address: z.string(),
       date: z.string().datetime(),
       contact: z.string().optional()
     }),
     goods: z.array(z.object({
       description: z.string(),
       quantity: z.number().positive(),
       weight: z.number().positive(),
       volume: z.number().positive().optional()
     })),
     priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal')
   });

   module.exports = { orderSchema };
   ```

4. Tests unitaires
   ```javascript
   // tests/orders.test.js
   const { test, expect } = require('@playwright/test');

   test.describe('Orders API', () => {
     test('should create order', async ({ request }) => {
       const response = await request.post('/api/orders', {
         data: {
           reference: 'TEST-001',
           clientId: 'client-123',
           pickup: { address: 'Paris', date: '2025-12-01T10:00:00Z' },
           delivery: { address: 'Lyon', date: '2025-12-02T16:00:00Z' },
           goods: [{ description: 'Colis', quantity: 1, weight: 10 }]
         }
       });

       expect(response.status()).toBe(201);
     });
   });
   ```

**Livrables:**
- API orders-eb complete
- 10+ endpoints CRUD + recherche
- Validation Zod
- Tests unitaires
- Documentation API

---

### SERVICE 2: ecmr-eb (1.5 semaines)

**Objectif:** API eCMR avec generation documents, signature electronique, export PDF

**SEMAINE 3-4:**

1. Endpoints principaux
   ```javascript
   // Routes eCMR
   POST   /api/ecmr                    # Creer eCMR
   GET    /api/ecmr/:ecmrId           # Obtenir eCMR
   POST   /api/ecmr/:ecmrId/sign      # Signer electroniquement
   GET    /api/ecmr/:ecmrId/pdf       # Export PDF
   POST   /api/ecmr/:ecmrId/send      # Envoyer par email
   ```

2. Generation PDF avec PDFKit
   ```javascript
   // services/ecmr-pdf-generator.js
   const PDFDocument = require('pdfkit');

   function generateECMRPDF(ecmrData) {
     const doc = new PDFDocument();

     // Header
     doc.fontSize(20).text('e-CMR - Electronic Consignment Note', {
       align: 'center'
     });

     // Expediteur
     doc.fontSize(12).text('Sender:', { underline: true });
     doc.text(ecmrData.sender.name);
     doc.text(ecmrData.sender.address);

     // Destinataire
     doc.text('Consignee:', { underline: true });
     doc.text(ecmrData.consignee.name);
     doc.text(ecmrData.consignee.address);

     // Marchandises
     doc.text('Goods:', { underline: true });
     ecmrData.goods.forEach(item => {
       doc.text(`- ${item.description}: ${item.quantity} x ${item.weight}kg`);
     });

     // Signature
     if (ecmrData.signature) {
       doc.image(ecmrData.signature, { width: 200 });
     }

     return doc;
   }
   ```

3. Signature electronique
   ```javascript
   // controllers/ecmr-controller.js
   async function signECMR(req, res) {
     const { ecmrId } = req.params;
     const { signature, signerName, signerRole } = req.body;

     // Sauvegarder signature
     await db.collection('ecmr').updateOne(
       { _id: ecmrId },
       {
         $push: {
           signatures: {
             signature,
             signerName,
             signerRole,
             signedAt: new Date()
           }
         }
       }
     );

     res.json({ success: true });
   }
   ```

**Livrables:**
- API ecmr-eb complete
- Generation PDF eCMR
- Signature electronique
- Export et email
- Tests

---

### SERVICE 3: palettes-eb (1 semaine)

**Objectif:** API Gestion palettes avec stock, echanges, soldes

**SEMAINE 5:**

1. Endpoints
   ```javascript
   POST   /api/palettes/exchanges        # Enregistrer echange
   GET    /api/palettes/stock/:clientId  # Stock palettes client
   GET    /api/palettes/balance/:clientId # Solde palettes
   POST   /api/palettes/return           # Retour palettes
   ```

2. Logique metier
   ```javascript
   // services/palettes-service.js
   async function recordExchange(data) {
     const exchange = {
       clientId: data.clientId,
       orderId: data.orderId,
       palettesOut: data.palettesOut,
       palettesIn: data.palettesIn,
       date: new Date()
     };

     await db.collection('palette-exchanges').insertOne(exchange);

     // Mettre a jour stock
     await updateStock(data.clientId);
   }

   async function calculateBalance(clientId) {
     const exchanges = await db.collection('palette-exchanges')
       .find({ clientId })
       .toArray();

     const totalOut = exchanges.reduce((sum, e) => sum + e.palettesOut, 0);
     const totalIn = exchanges.reduce((sum, e) => sum + e.palettesIn, 0);

     return totalOut - totalIn;
   }
   ```

**Livrables:**
- API palettes-eb complete
- Logique stock et soldes
- Rapports echanges
- Tests

---

### SERVICE 4: planning-eb (1.5 semaines)

**Objectif:** API Planning avec tournees, optimisation routes, calendrier chauffeurs

**SEMAINE 6:**

1. Endpoints
   ```javascript
   POST   /api/planning/tours              # Creer tournee
   GET    /api/planning/tours/:tourId      # Obtenir tournee
   POST   /api/planning/tours/:tourId/optimize # Optimiser route
   GET    /api/planning/drivers/:driverId/calendar # Calendrier chauffeur
   POST   /api/planning/assignments        # Assigner commande a tournee
   ```

2. Optimisation routes basique
   ```javascript
   // services/route-optimizer.js
   function optimizeRoute(stops) {
     // Algorithme simple nearest neighbor
     const optimized = [];
     let current = stops[0];
     optimized.push(current);

     let remaining = stops.slice(1);

     while (remaining.length > 0) {
       let nearest = findNearestStop(current, remaining);
       optimized.push(nearest);
       current = nearest;
       remaining = remaining.filter(s => s !== nearest);
     }

     return optimized;
   }

   function findNearestStop(current, stops) {
     // Calculer distance entre current et chaque stop
     // Retourner le plus proche
   }
   ```

**Livrables:**
- API planning-eb complete
- Optimisation routes basique
- Calendrier chauffeurs
- Tests

---

### CRITERES DE SUCCES GLOBAUX

1. 4 services developpes:
   - orders-eb: API CRUD complete
   - ecmr-eb: Generation PDF + signatures
   - palettes-eb: Gestion stock
   - planning-eb: Tournees + optimisation

2. Qualite code:
   - Validation Zod
   - Error handling
   - Logging
   - Tests unitaires
   - Documentation API

3. Deploiement:
   - 4 environnements AWS EB crees
   - CI/CD configure
   - Health checks OK

---

<a name="timeline-globale"></a>
## TIMELINE GLOBALE TOP 5

```
Semaine 1-2:  Tache #1 - Configuration Services Externes
              ├─ TomTom Telematics API (6j)
              └─ AWS Textract OCR (4j)

Semaine 3:    Tache #2 - Securite API
              ├─ Rate Limiting (2j)
              ├─ CORS (1j)
              └─ Webhook Signatures (2j)

Semaine 4:    Tache #3 - Monitoring & Alertes
              ├─ CloudWatch (2j)
              └─ Datadog/New Relic (3j)

Semaine 5-6:  Tache #4 - Tests Automatises E2E
              ├─ Tests E2E Playwright (5j)
              └─ Tests Charge K6 (5j)

Semaine 7-12: Tache #5 - Developpement Services Skeleton
              ├─ orders-eb (1.5 sem)
              ├─ ecmr-eb (1.5 sem)
              ├─ palettes-eb (1 sem)
              └─ planning-eb (1.5 sem)
```

**Duree totale:** 12 semaines (3 mois)

**Possibilite parallelisation:**
- Taches #1, #2, #3 peuvent etre parallelisees (semaines 1-4)
- Tache #4 peut commencer semaine 3
- Tache #5 necessite Tache #4 complete

**Timeline optimisee avec parallelisation:** 8-10 semaines (2-2.5 mois)

---

<a name="ressources-necessaires"></a>
## RESSOURCES NECESSAIRES

### Equipe

| Role | Taches | Duree | FTE |
|------|--------|-------|-----|
| DevOps Lead | Tache #1, #3 | 3 semaines | 1.0 |
| Backend Lead | Tache #2, #4, #5 | 10 semaines | 1.0 |
| Backend Dev 1 | Tache #5 | 6 semaines | 1.0 |
| Backend Dev 2 | Tache #5 | 6 semaines | 1.0 |
| QA Engineer | Tache #4 | 2 semaines | 1.0 |

**Total FTE:** ~3-4 personnes en parallele

---

### Budget

| Categorie | Details | Cout Mensuel | Cout Total |
|-----------|---------|--------------|------------|
| **Services Externes** | | | |
| TomTom Telematics | 5 vehicules test | 20EUR | 60EUR (3 mois) |
| AWS Textract | ~1000 pages test | 6EUR | 18EUR (3 mois) |
| **Monitoring** | | | |
| Datadog | 2 hosts Pro | 68EUR | 204EUR (3 mois) |
| AWS CloudWatch | Alarmes + logs | 10EUR | 30EUR (3 mois) |
| **Infra AWS** | | | |
| Elastic Beanstalk | 6 environnements | 150EUR | 450EUR (3 mois) |
| **Total** | | **254EUR/mois** | **762EUR (3 mois)** |

---

### Outils & Licences

- Playwright: Gratuit
- K6: Gratuit (OSS)
- Datadog: 34$/host/mois
- New Relic: Alternative ~30$/host/mois
- AWS Services: Pay-as-you-go

---

## CONCLUSION

Ce plan d'action detaille couvre les 5 taches prioritaires identifiees pour RT SYMPHONI.A:

1. **Configuration Services Externes** - Debloquer revenus commerciaux
2. **Securite API** - Proteger production
3. **Monitoring & Alertes** - Garantir uptime 99.9%
4. **Tests Automatises E2E** - Qualite et fiabilite
5. **Developpement Services Skeleton** - Completude plateforme

**Timeline realiste:** 12 semaines (3 mois)
**Timeline optimisee:** 8-10 semaines avec parallelisation
**Budget total:** ~762EUR (3 mois)
**Equipe:** 3-4 personnes

**Recommandation:** Commencer immediatement par Tache #1 (Configuration Services Externes) pour debloquer revenus le plus rapidement possible.

---

**Document genere:** 26 novembre 2025
**Version:** 1.0.0

Generated with [Claude Code](https://claude.com/claude-code)
