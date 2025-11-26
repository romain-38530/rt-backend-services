# Getting Started - SYMPHONI.A

Guide de démarrage rapide pour les nouveaux développeurs sur le projet SYMPHONI.A.

---

## 📋 Prérequis

### Outils Requis

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **npm** ou **pnpm** (inclus avec Node.js)
- **Git** ([Download](https://git-scm.com/))
- **MongoDB Compass** (optionnel, pour visualiser la DB) ([Download](https://www.mongodb.com/products/compass))
- **Postman** (optionnel, pour tester l'API) ([Download](https://www.postman.com/))
- **VS Code** (recommandé) ([Download](https://code.visualstudio.com/))

### Comptes & Accès Requis

- **MongoDB Atlas** - Accès au cluster `stagingrt.v2jnoh2.mongodb.net`
- **AWS Console** - Accès aux environnements Elastic Beanstalk
- **Mailgun** - Accès au compte pour tracking email
- **GitHub/Git** - Accès au repository du projet

---

## 🚀 Installation Rapide (5 minutes)

### 1. Cloner le Repository

```bash
# Cloner le projet
git clone https://github.com/votre-org/rt-backend-services.git
cd rt-backend-services

# Créer une branche de travail
git checkout -b feature/ma-feature
```

### 2. Installer les Dépendances

```bash
# Option 1: npm (universel)
cd services/subscriptions-contracts-eb
npm install

# Option 2: pnpm (plus rapide)
cd services/subscriptions-contracts-eb
pnpm install
```

**Temps d'installation:** ~2 minutes

### 3. Configuration Environnement

Créer le fichier `.env` dans `services/subscriptions-contracts-eb/`:

```bash
# Copier le template
cp .env.example .env
```

**Contenu du `.env`:**

```bash
# ===== MongoDB =====
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-technologie

# ===== Server =====
PORT=3001
NODE_ENV=development

# ===== JWT Authentication =====
JWT_SECRET=votre-secret-jwt-local-development
JWT_EXPIRES_IN=7d

# ===== Mailgun (Email Tracking Basic) =====
MAILGUN_API_KEY=votre-mailgun-api-key
MAILGUN_DOMAIN=mg.rt-technologie.com
EMAIL_FROM=RT SYMPHONI.A <noreply@rt-technologie.com>

# ===== TomTom (Tracking Premium - Optionnel) =====
# TOMTOM_API_KEY=votre-tomtom-key

# ===== AWS Textract (OCR - Optionnel) =====
# AWS_ACCESS_KEY_ID=votre-aws-key
# AWS_SECRET_ACCESS_KEY=votre-aws-secret
# AWS_REGION=eu-central-1

# ===== Google Vision API (OCR Fallback - Optionnel) =====
# GOOGLE_VISION_API_KEY=votre-google-key
# GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

⚠️ **Important:** Demander les credentials réels à l'équipe DevOps

### 4. Démarrer le Serveur

```bash
# Démarrer en mode développement
npm run dev

# Ou avec nodemon (auto-reload)
npm run dev:watch
```

**Output attendu:**
```
RT Subscriptions-Contracts API listening on port 3001
Environment: development
✅ MongoDB connected successfully
Features: Subscriptions, Contracts, E-Signatures, e-CMR, Transport Orders
```

### 5. Tester l'API

```bash
# Health check
curl http://localhost:3001/health

# Réponse attendue
{
  "status": "OK",
  "mongodb": { "connected": true },
  "version": "1.6.2",
  "timestamp": "2025-11-26T..."
}
```

---

## 📁 Structure du Projet

```
rt-backend-services/
│
├── services/
│   ├── subscriptions-contracts-eb/          # API principale (50+ endpoints)
│   │   ├── index.js                         # Point d'entrée Express
│   │   ├── transport-orders-routes.js       # Routes transport
│   │   ├── transport-orders-service.js      # Logique métier
│   │   ├── tracking-service.js              # Tracking GPS TomTom
│   │   ├── tracking-basic-service.js        # Tracking Email
│   │   ├── geofencing-service.js            # Geofencing
│   │   ├── lane-matching-service.js         # Lane matching
│   │   ├── dispatch-chain-service.js        # Dispatch chain
│   │   ├── document-management-service.js   # Gestion documents
│   │   ├── ocr-integration-service.js       # OCR AWS/Google
│   │   ├── rdv-management-service.js        # Rendez-vous
│   │   ├── eta-monitoring-service.js        # ETA monitoring
│   │   ├── carrier-scoring-service.js       # Scoring transporteurs
│   │   ├── order-closure-service.js         # Clôture commandes
│   │   ├── package.json
│   │   └── .env                             # Config locale (à créer)
│   │
│   └── authz-eb/                            # API Authorization + VAT
│       ├── index.js
│       └── package.json
│
├── Documentation/                            # 5,600+ lignes
│   ├── README.md                             # ⭐ Point d'entrée
│   ├── SYMPHONIA_PROJET_COMPLET.md          # Synthèse globale
│   ├── GETTING_STARTED.md                   # Ce fichier
│   ├── GUIDE_INTEGRATION_FRONTEND.md        # Guide Next.js/React
│   ├── DOCUMENTATION_WEBHOOKS_EVENTS.md     # Webhooks + WebSocket
│   ├── DASHBOARD_MONITORING_SPECS.md        # Specs dashboard
│   └── CONFIGURATION_OCR_AWS_GOOGLE.md      # Setup OCR
│
└── .git/                                     # Git repository
```

---

## 🔑 Concepts Clés

### 1. Architecture Services

Le backend est divisé en **services indépendants**:

| Service | Responsabilité | Fichier |
|---------|----------------|---------|
| **Transport Orders** | CRUD commandes | transport-orders-service.js |
| **Tracking GPS** | TomTom Premium (4€/véhicule) | tracking-service.js |
| **Tracking Email** | Basic 50€/mois (Mailgun) | tracking-basic-service.js |
| **Geofencing** | Zones géographiques | geofencing-service.js |
| **Lane Matching** | Matching intelligent lanes | lane-matching-service.js |
| **Dispatch Chain** | Cascade + escalade Affret.IA | dispatch-chain-service.js |
| **Documents** | Upload BL/CMR/POD | document-management-service.js |
| **OCR** | Extraction auto documents | ocr-integration-service.js |
| **RDV** | Gestion rendez-vous | rdv-management-service.js |
| **ETA** | Monitoring temps réel | eta-monitoring-service.js |
| **Scoring** | Note transporteurs 0-100 | carrier-scoring-service.js |
| **Closure** | Clôture + archivage 10 ans | order-closure-service.js |

### 2. Pattern Service/Routes

**Exemple: tracking-basic-service.js**

```javascript
// Service (logique métier)
async function sendTrackingEmail(db, orderId, options) {
  // 1. Récupérer la commande
  const order = await db.collection('transport_orders').findOne({ _id: orderId });

  // 2. Générer les tokens sécurisés
  const tokens = generateSecureTokens(orderId);

  // 3. Créer l'email HTML
  const emailHtml = generateTrackingEmail(order, tokens);

  // 4. Envoyer via Mailgun
  const result = await sendMailgunEmail(options.carrierEmail, subject, emailHtml);

  return { success: true, ...result };
}

module.exports = { sendTrackingEmail };
```

**Routes (transport-orders-routes.js)**

```javascript
const trackingBasic = require('./tracking-basic-service');

router.post('/:orderId/tracking/email/send', async (req, res) => {
  try {
    const result = await trackingBasic.sendTrackingEmail(
      getDb(),
      req.params.orderId,
      req.body
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 3. Middleware MongoDB

**Connexion MongoDB:**

```javascript
// index.js
const { MongoClient } = require('mongodb');

let db;
let client;

async function connectToMongoDB() {
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db('rt-technologie');
  console.log('✅ MongoDB connected');
}

function getDb() {
  if (!db) throw new Error('Database not connected');
  return db;
}

// Middleware
function checkMongoDB(req, res, next) {
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  next();
}
```

---

## 🧪 Tester l'API Localement

### 1. Créer une Commande de Test

```bash
curl -X POST http://localhost:3001/api/transport-orders \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "CMD-TEST-001",
    "pickupLocation": {
      "address": "123 Rue de Paris, 75001 Paris",
      "coordinates": [48.8566, 2.3522],
      "date": "2025-11-30T09:00:00Z"
    },
    "deliveryLocation": {
      "address": "456 Avenue de Lyon, 69002 Lyon",
      "coordinates": [45.7640, 4.8357],
      "date": "2025-11-30T18:00:00Z"
    },
    "goods": {
      "description": "Palettes électronique",
      "weight": 1500,
      "volume": 12,
      "quantity": 20
    },
    "pricing": {
      "basePrice": 450.00,
      "totalPrice": 540.00,
      "currency": "EUR"
    }
  }'
```

**Réponse attendue:**
```json
{
  "success": true,
  "order": {
    "_id": "674567890abcdef123456789",
    "reference": "CMD-TEST-001",
    "status": "created",
    "createdAt": "2025-11-26T10:00:00.000Z"
  }
}
```

### 2. Envoyer un Email de Tracking

```bash
# Remplacer ORDER_ID par l'ID reçu
curl -X POST http://localhost:3001/api/transport-orders/ORDER_ID/tracking/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "carrierEmail": "votre-email@example.com",
    "carrierName": "Test Transporteur"
  }'
```

### 3. Vérifier MongoDB

```bash
# Option 1: MongoDB Compass
# Ouvrir Compass, se connecter à:
# mongodb+srv://rt_admin:***@stagingrt.v2jnoh2.mongodb.net/rt-technologie

# Option 2: mongosh CLI
mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/rt-technologie" --username rt_admin

# Voir les commandes
use rt-technologie
db.transport_orders.find().limit(5)
```

---

## 🛠️ Outils de Développement

### VS Code Extensions Recommandées

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",           // ESLint
    "esbenp.prettier-vscode",           // Prettier
    "mongodb.mongodb-vscode",           // MongoDB
    "humao.rest-client",                // REST Client
    "ms-azuretools.vscode-docker",      // Docker
    "streetsidesoftware.code-spell-checker"
  ]
}
```

### Scripts npm Utiles

```json
{
  "scripts": {
    "start": "node index.js",
    "dev": "node index.js",
    "dev:watch": "nodemon index.js",
    "test": "jest",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  }
}
```

### Postman Collection

Importer la collection Postman (à créer):

1. Ouvrir Postman
2. Import → File → `postman-collection.json`
3. Configurer l'environnement:
   - `BASE_URL`: `http://localhost:3001`
   - `TOKEN`: Votre JWT token

---

## 📚 Documentation Essentielle

### Pour Développeurs Backend

1. **[SYMPHONIA_PROJET_COMPLET.md](SYMPHONIA_PROJET_COMPLET.md)** - Vue d'ensemble complète
2. **[transport-orders-routes.js](services/subscriptions-contracts-eb/transport-orders-routes.js)** - Toutes les routes API
3. **Services individuels** - Voir `services/subscriptions-contracts-eb/*.js`

### Pour Développeurs Frontend

1. **[GUIDE_INTEGRATION_FRONTEND.md](GUIDE_INTEGRATION_FRONTEND.md)** - Guide complet Next.js/React
2. **[DOCUMENTATION_WEBHOOKS_EVENTS.md](DOCUMENTATION_WEBHOOKS_EVENTS.md)** - Webhooks + WebSocket temps réel
3. **[DASHBOARD_MONITORING_SPECS.md](DASHBOARD_MONITORING_SPECS.md)** - Specs dashboard avec wireframes

### Pour DevOps

1. **[DEPLOYMENT_V1.6.0_COMPLETE.md](DEPLOYMENT_V1.6.0_COMPLETE.md)** - Guide déploiement
2. **[CONFIGURATION_OCR_AWS_GOOGLE.md](CONFIGURATION_OCR_AWS_GOOGLE.md)** - Setup services externes

---

## 🐛 Dépannage Commun

### Problème: "MongoDB connection failed"

**Cause:** Pas de connexion à MongoDB Atlas

**Solutions:**
1. Vérifier `MONGODB_URI` dans `.env`
2. Vérifier que votre IP est dans la whitelist MongoDB Atlas
3. Vérifier les credentials (username/password)
4. Tester la connexion avec MongoDB Compass

```bash
# Tester la connexion
mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/" --username rt_admin
```

### Problème: "Port 3001 already in use"

**Solution:**

```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3001
kill -9 <PID>

# Ou changer le port dans .env
PORT=3002
```

### Problème: "Module not found"

**Solution:**

```bash
# Réinstaller les dépendances
rm -rf node_modules package-lock.json
npm install

# Ou vider le cache npm
npm cache clean --force
npm install
```

### Problème: "JWT token invalid"

**Solution:**

```bash
# Générer un nouveau secret JWT
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Mettre à jour JWT_SECRET dans .env
```

---

## 🔄 Workflow Git

### Branches

```
main                    # Production (protégée)
  └─ develop            # Développement
       ├─ feature/xxx   # Nouvelles fonctionnalités
       ├─ fix/xxx       # Corrections de bugs
       └─ hotfix/xxx    # Corrections urgentes
```

### Créer une Feature

```bash
# 1. Partir de develop
git checkout develop
git pull origin develop

# 2. Créer une branche feature
git checkout -b feature/tracking-smartphone

# 3. Développer et commiter
git add .
git commit -m "feat: Add smartphone tracking endpoints"

# 4. Pusher
git push origin feature/tracking-smartphone

# 5. Créer une Pull Request sur GitHub
```

### Conventions de Commit

```bash
# Format: <type>(<scope>): <description>

feat(tracking): Add email tracking service        # Nouvelle fonctionnalité
fix(ocr): Fix AWS Textract timeout               # Correction de bug
docs(readme): Update installation guide          # Documentation
refactor(api): Simplify route handlers           # Refactoring
test(orders): Add unit tests for CRUD            # Tests
chore(deps): Update dependencies                 # Maintenance

# Exemples concrets
git commit -m "feat(tracking-basic): Implement Mailgun email sending"
git commit -m "fix(mongodb): Handle connection timeout gracefully"
git commit -m "docs(api): Add Postman collection for testing"
```

---

## 📞 Obtenir de l'Aide

### Canaux de Communication

- **Slack:** `#symphonia-dev`
- **Email:** dev-team@symphonia.com
- **Issues GitHub:** [rt-backend-services/issues](https://github.com/votre-org/rt-backend-services/issues)

### Questions Fréquentes

**Q: Où trouver les credentials MongoDB/Mailgun/AWS?**
→ Voir avec le Tech Lead ou dans le gestionnaire de secrets (1Password/Vault)

**Q: Comment tester les emails sans spammer?**
→ Utiliser [Mailtrap.io](https://mailtrap.io/) en développement

**Q: Puis-je utiliser ma propre base MongoDB locale?**
→ Oui, mais les données de test ne seront pas partagées avec l'équipe

**Q: Comment débugger un service spécifique?**
→ Utiliser `console.log()` ou `debugger` avec VS Code debugger

---

## ✅ Checklist Premier Jour

- [ ] Cloner le repository
- [ ] Installer Node.js 20+
- [ ] Installer les dépendances (`npm install`)
- [ ] Créer le fichier `.env`
- [ ] Obtenir les credentials (MongoDB, Mailgun)
- [ ] Démarrer le serveur (`npm run dev`)
- [ ] Tester le health check (`curl http://localhost:3001/health`)
- [ ] Créer une commande de test
- [ ] Lire [SYMPHONIA_PROJET_COMPLET.md](SYMPHONIA_PROJET_COMPLET.md)
- [ ] Installer MongoDB Compass
- [ ] Installer Postman
- [ ] Rejoindre Slack `#symphonia-dev`
- [ ] Demander accès GitHub/AWS/MongoDB Atlas

---

## 🚀 Prochaines Étapes

Après avoir terminé ce guide:

1. **Explorer le code:**
   - Lire [index.js](services/subscriptions-contracts-eb/index.js)
   - Lire [transport-orders-routes.js](services/subscriptions-contracts-eb/transport-orders-routes.js)
   - Choisir un service à étudier en détail

2. **Faire un premier commit:**
   - Corriger une typo dans la documentation
   - Ajouter un test unitaire
   - Améliorer un commentaire de code

3. **Participer au Daily Standup:**
   - Présenter ce que vous avez appris
   - Poser vos questions
   - Prendre votre première tâche

---

**Bienvenue dans l'équipe SYMPHONI.A! 🎉**

**Version:** 1.0 | **Créé le:** 26 novembre 2025

🤖 Generated with [Claude Code](https://claude.com/claude-code)
