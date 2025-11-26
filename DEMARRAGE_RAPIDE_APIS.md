# GUIDE DE DÉMARRAGE RAPIDE - APIs SYMPHONI.A

**🎯 Objectif:** Démarrer tous les services backend en 15 minutes

---

## PRÉREQUIS

✅ Node.js 18+ installé
✅ MongoDB Atlas account (ou MongoDB local)
✅ Git installé

---

## ÉTAPE 1: CONFIGURATION MONGODB (5 min)

### Option A: MongoDB Atlas (RECOMMANDÉ)

1. Allez sur https://www.mongodb.com/cloud/atlas
2. Créez un compte gratuit (M0 Cluster - Free)
3. Créez un cluster nommé "symphonia"
4. Dans "Database Access", créez un utilisateur:
   - Username: `symphonia_admin`
   - Password: (générez un mot de passe fort)
5. Dans "Network Access", ajoutez `0.0.0.0/0` (pour dev uniquement)
6. Cliquez "Connect" → "Connect your application"
7. Copiez la connection string:
   ```
   mongodb+srv://symphonia_admin:<password>@cluster0.xxxxx.mongodb.net/symphonia?retryWrites=true&w=majority
   ```

### Option B: MongoDB Local

```bash
# Installer MongoDB Community Server
# Puis démarrer:
mongod --dbpath /data/db

# Connection string:
mongodb://localhost:27017/symphonia
```

---

## ÉTAPE 2: CONFIGURATION GLOBALE (3 min)

Créez un fichier `.env.global` à la racine avec les valeurs communes:

```bash
# Dans /c/Users/rtard/rt-backend-services/
cat > .env.global << 'EOF'
# MongoDB (REQUIS)
MONGODB_URI=mongodb+srv://symphonia_admin:VOTRE_MOT_DE_PASSE@cluster0.xxxxx.mongodb.net/symphonia?retryWrites=true&w=majority

# JWT (REQUIS)
JWT_SECRET=votre-secret-jwt-super-securise-changez-moi

# CORS (REQUIS)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# URLs inter-services (localhost pour dev)
WEBSOCKET_URL=http://localhost:3010
AUTHZ_API_URL=http://localhost:3001
CARRIERS_API_URL=http://localhost:3002
PRICING_API_URL=http://localhost:3003
SCORING_API_URL=http://localhost:3016
ORDERS_API_URL=http://localhost:3011
TRACKING_API_URL=http://localhost:3012

# Services optionnels (laisser vide pour l'instant)
TOMTOM_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
EOF
```

---

## ÉTAPE 3: SCRIPT D'INSTALLATION AUTOMATIQUE (2 min)

Créez un script pour installer toutes les dépendances:

```bash
# Créer le script
cat > install-all.sh << 'EOF'
#!/bin/bash

echo "🚀 Installation des dépendances pour tous les services..."

services=(
  "websocket-api"
  "orders-api-v2"
  "tracking-api"
  "appointments-api"
  "documents-api"
  "notifications-api-v2"
  "scoring-api"
  "affret-ia-api-v2"
)

for service in "${services[@]}"; do
  echo ""
  echo "📦 Installation de $service..."
  cd "/c/Users/rtard/rt-backend-services/services/$service"

  # Copier .env depuis .env.example
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "✓ .env créé"
  fi

  # Installer les dépendances
  npm install

  echo "✅ $service installé"
done

echo ""
echo "🎉 Toutes les installations sont terminées!"
EOF

# Rendre exécutable
chmod +x install-all.sh

# Lancer l'installation
./install-all.sh
```

**Windows PowerShell:**
```powershell
# Créer install-all.ps1
@"
Write-Host "🚀 Installation des dépendances..." -ForegroundColor Green

$services = @(
  "websocket-api",
  "orders-api-v2",
  "tracking-api",
  "appointments-api",
  "documents-api",
  "notifications-api-v2",
  "scoring-api",
  "affret-ia-api-v2"
)

foreach ($service in $services) {
  Write-Host "`n📦 Installation de $service..." -ForegroundColor Yellow
  Set-Location "C:\Users\rtard\rt-backend-services\services\$service"

  if (Test-Path .env.example) {
    Copy-Item .env.example .env
    Write-Host "✓ .env créé" -ForegroundColor Green
  }

  npm install
  Write-Host "✅ $service installé" -ForegroundColor Green
}

Write-Host "`n🎉 Installation terminée!" -ForegroundColor Green
"@ | Out-File -FilePath install-all.ps1

# Exécuter
.\install-all.ps1
```

---

## ÉTAPE 4: CONFIGURATION .ENV PAR SERVICE (5 min)

Pour chaque service, éditez le fichier `.env` créé et remplacez les valeurs par celles de `.env.global`:

**OU utilisez ce script automatique:**

```bash
cat > configure-env.sh << 'EOF'
#!/bin/bash

# Charger les variables globales
source .env.global

services=(
  "websocket-api:3010"
  "orders-api-v2:3011"
  "tracking-api:3012"
  "appointments-api:3013"
  "documents-api:3014"
  "notifications-api-v2:3015"
  "scoring-api:3016"
  "affret-ia-api-v2:3017"
)

for item in "${services[@]}"; do
  IFS=':' read -r service port <<< "$item"

  echo "⚙️  Configuration de $service..."

  cat > "/c/Users/rtard/rt-backend-services/services/$service/.env" << ENVFILE
PORT=$port
NODE_ENV=development
MONGODB_URI=$MONGODB_URI
JWT_SECRET=$JWT_SECRET
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
WEBSOCKET_URL=$WEBSOCKET_URL
AUTHZ_API_URL=$AUTHZ_API_URL
CARRIERS_API_URL=$CARRIERS_API_URL
PRICING_API_URL=$PRICING_API_URL
SCORING_API_URL=$SCORING_API_URL
ORDERS_API_URL=$ORDERS_API_URL
TRACKING_API_URL=$TRACKING_API_URL
WEBSOCKET_ENABLED=true
TOMTOM_API_KEY=$TOMTOM_API_KEY
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET=$AWS_S3_BUCKET
AWS_REGION=eu-west-3
SENDGRID_API_KEY=$SENDGRID_API_KEY
SENDGRID_FROM_EMAIL=$SENDGRID_FROM_EMAIL
TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER
APP_URL=http://localhost:3000
ENVFILE

  echo "✅ $service configuré (port $port)"
done

echo "🎉 Configuration terminée!"
EOF

chmod +x configure-env.sh
./configure-env.sh
```

---

## ÉTAPE 5: DÉMARRAGE DES SERVICES

### Option A: Démarrage manuel (Terminal multiple)

Ouvrez 8 terminaux et lancez:

```bash
# Terminal 1 - WebSocket (CRITIQUE - À démarrer en premier)
cd /c/Users/rtard/rt-backend-services/services/websocket-api
npm run dev

# Terminal 2 - Orders
cd /c/Users/rtard/rt-backend-services/services/orders-api-v2
npm run dev

# Terminal 3 - Tracking
cd /c/Users/rtard/rt-backend-services/services/tracking-api
npm run dev

# Terminal 4 - Appointments
cd /c/Users/rtard/rt-backend-services/services/appointments-api
npm run dev

# Terminal 5 - Documents
cd /c/Users/rtard/rt-backend-services/services/documents-api
npm run dev

# Terminal 6 - Notifications
cd /c/Users/rtard/rt-backend-services/services/notifications-api-v2
npm run dev

# Terminal 7 - Scoring
cd /c/Users/rtard/rt-backend-services/services/scoring-api
npm run dev

# Terminal 8 - Affret.IA
cd /c/Users/rtard/rt-backend-services/services/affret-ia-api-v2
npm run dev
```

### Option B: Démarrage avec PM2 (RECOMMANDÉ)

```bash
# Installer PM2 globalement
npm install -g pm2

# Créer fichier ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'websocket-api',
      cwd: './services/websocket-api',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3010
      }
    },
    {
      name: 'orders-api',
      cwd: './services/orders-api-v2',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3011
      }
    },
    {
      name: 'tracking-api',
      cwd: './services/tracking-api',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3012
      }
    },
    {
      name: 'appointments-api',
      cwd: './services/appointments-api',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3013
      }
    },
    {
      name: 'documents-api',
      cwd: './services/documents-api',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3014
      }
    },
    {
      name: 'notifications-api',
      cwd: './services/notifications-api-v2',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3015
      }
    },
    {
      name: 'scoring-api',
      cwd: './services/scoring-api',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3016
      }
    },
    {
      name: 'affret-ia-api',
      cwd: './services/affret-ia-api-v2',
      script: 'index.js',
      watch: true,
      env: {
        PORT: 3017
      }
    }
  ]
};
EOF

# Démarrer tous les services
pm2 start ecosystem.config.js

# Voir les logs
pm2 logs

# Voir le statut
pm2 status

# Arrêter tous les services
pm2 stop all

# Redémarrer tous les services
pm2 restart all
```

---

## ÉTAPE 6: VÉRIFICATION (2 min)

### Test des health checks

```bash
# Créer script de test
cat > test-health.sh << 'EOF'
#!/bin/bash

echo "🏥 Vérification de santé des services..."

services=(
  "WebSocket API:3010"
  "Orders API:3011"
  "Tracking API:3012"
  "Appointments API:3013"
  "Documents API:3014"
  "Notifications API:3015"
  "Scoring API:3016"
  "Affret.IA API:3017"
)

for item in "${services[@]}"; do
  IFS=':' read -r name port <<< "$item"

  response=$(curl -s http://localhost:$port/health)

  if [ $? -eq 0 ]; then
    echo "✅ $name (port $port) - OK"
  else
    echo "❌ $name (port $port) - ERREUR"
  fi
done
EOF

chmod +x test-health.sh
./test-health.sh
```

**Windows PowerShell:**
```powershell
@"
Write-Host "🏥 Vérification de santé..." -ForegroundColor Green

$services = @(
  @{Name="WebSocket"; Port=3010},
  @{Name="Orders"; Port=3011},
  @{Name="Tracking"; Port=3012},
  @{Name="Appointments"; Port=3013},
  @{Name="Documents"; Port=3014},
  @{Name="Notifications"; Port=3015},
  @{Name="Scoring"; Port=3016},
  @{Name="Affret.IA"; Port=3017}
)

foreach ($service in $services) {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$($service.Port)/health" -UseBasicParsing
    Write-Host "✅ $($service.Name) API (port $($service.Port)) - OK" -ForegroundColor Green
  } catch {
    Write-Host "❌ $($service.Name) API (port $($service.Port)) - ERREUR" -ForegroundColor Red
  }
}
"@ | Out-File -FilePath test-health.ps1

.\test-health.ps1
```

### Test WebSocket (optionnel)

```bash
# Installer wscat
npm install -g wscat

# Se connecter au WebSocket
wscat -c ws://localhost:3010

# Une fois connecté, vous devriez voir un message de connexion
```

---

## RÉSUMÉ DES URLS

Tous les services sont maintenant disponibles:

| Service | URL | Port |
|---------|-----|------|
| WebSocket API | http://localhost:3010 | 3010 |
| Orders API v2 | http://localhost:3011 | 3011 |
| Tracking API | http://localhost:3012 | 3012 |
| Appointments API | http://localhost:3013 | 3013 |
| Documents API | http://localhost:3014 | 3014 |
| Notifications API v2 | http://localhost:3015 | 3015 |
| Scoring API | http://localhost:3016 | 3016 |
| Affret.IA API v2 | http://localhost:3017 | 3017 |

---

## TESTS FONCTIONNELS DE BASE

### 1. Créer une commande

```bash
curl -X POST http://localhost:3011/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org-test",
    "createdBy": "user-test",
    "pickup": {
      "name": "Expéditeur Test",
      "street": "10 Rue Test",
      "city": "Paris",
      "postalCode": "75001",
      "country": "France"
    },
    "delivery": {
      "name": "Destinataire Test",
      "street": "20 Avenue Test",
      "city": "Lyon",
      "postalCode": "69001",
      "country": "France"
    },
    "pickupDate": "2024-12-01",
    "deliveryDate": "2024-12-02",
    "cargo": {
      "type": "palette",
      "quantity": 5,
      "weight": { "value": 250, "unit": "kg" }
    },
    "transportType": "standard"
  }'
```

### 2. Lister les commandes

```bash
curl http://localhost:3011/api/v1/orders?organizationId=org-test
```

### 3. Télécharger template CSV

```bash
curl http://localhost:3011/api/v1/orders/import/template/csv -o template.csv
```

### 4. Rechercher transporteurs (Affret.IA)

```bash
curl -X POST http://localhost:3017/api/v1/affret-ia/search \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-order-1",
    "pickupPostalCode": "75001",
    "deliveryPostalCode": "69001",
    "pickupDate": "2024-12-01",
    "vehicleType": "19T"
  }'
```

---

## DÉPANNAGE

### Service ne démarre pas

1. **Vérifier MongoDB:**
   ```bash
   # Tester la connexion
   mongosh "votre-connection-string"
   ```

2. **Vérifier les ports:**
   ```bash
   # Windows
   netstat -ano | findstr :3010

   # Linux/Mac
   lsof -i :3010
   ```

3. **Vérifier les logs:**
   ```bash
   # Si PM2
   pm2 logs [nom-service]

   # Sinon, voir la console du terminal
   ```

### Erreur de connexion MongoDB

- Vérifiez que l'IP `0.0.0.0/0` est autorisée dans MongoDB Atlas Network Access
- Vérifiez le mot de passe dans la connection string
- Vérifiez que le cluster est démarré

### WebSocket ne se connecte pas

- Vérifiez que WebSocket API est démarré (port 3010)
- Vérifiez les CORS dans `.env`
- Testez avec wscat: `wscat -c ws://localhost:3010`

---

## COMMANDES UTILES PM2

```bash
# Démarrer tous les services
pm2 start ecosystem.config.js

# Voir les logs en temps réel
pm2 logs

# Voir le statut
pm2 status

# Redémarrer un service
pm2 restart websocket-api

# Arrêter tous les services
pm2 stop all

# Supprimer tous les services
pm2 delete all

# Monitoring
pm2 monit
```

---

## PROCHAINES ÉTAPES

Une fois tous les services démarrés:

1. **Connecter le frontend:**
   - Configurer les URLs dans le frontend
   - Tester l'intégration WebSocket
   - Tester la création de commandes

2. **Configurer les services optionnels:**
   - TomTom API (tracking)
   - AWS S3 + Textract (documents)
   - SendGrid (emails)
   - Twilio (SMS)

3. **Déployer en production:**
   - Voir `RAPPORT_FINAL_APIS_SYMPHONIA.md`
   - Section "Déploiement AWS Elastic Beanstalk"

---

## SUPPORT

En cas de problème:
1. Vérifier les logs du service concerné
2. Vérifier la connexion MongoDB
3. Vérifier les variables d'environnement
4. Consulter le README du service
5. Consulter le RAPPORT_FINAL_APIS_SYMPHONIA.md

---

**🎉 Félicitations! Tous vos services backend sont maintenant opérationnels!**
