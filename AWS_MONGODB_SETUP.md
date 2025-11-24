# Guide de Configuration AWS & MongoDB

Ce guide vous aide à configurer les connexions AWS et MongoDB pour SYMPHONI.A backend services.

## Table des matières

- [Configuration AWS](#configuration-aws)
- [Configuration MongoDB](#configuration-mongodb)
- [Test des connexions](#test-des-connexions)
- [Troubleshooting](#troubleshooting)

---

## Configuration AWS

### Prérequis

- AWS CLI installé (version 2.x recommandée)
- Compte AWS avec permissions appropriées

### 1. Installation AWS CLI

**Windows:**
```powershell
# Télécharger et installer depuis:
# https://awscli.amazonaws.com/AWSCLIV2.msi

# Ou via winget:
winget install Amazon.AWSCLI
```

**Linux/Mac:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 2. Configuration des Credentials AWS

#### Option A: Configuration Interactive

```bash
aws configure
```

Entrez:
- **AWS Access Key ID:** Votre clé d'accès AWS
- **AWS Secret Access Key:** Votre clé secrète AWS
- **Default region name:** `eu-central-1` (Frankfurt)
- **Default output format:** `json`

#### Option B: Fichier de Configuration Manuel

Créez/éditez `~/.aws/credentials` (Linux/Mac) ou `C:\Users\USERNAME\.aws\credentials` (Windows):

```ini
[default]
aws_access_key_id = VOTRE_ACCESS_KEY_ID
aws_secret_access_key = VOTRE_SECRET_ACCESS_KEY
```

Créez/éditez `~/.aws/config`:

```ini
[default]
region = eu-central-1
output = json
```

### 3. Test de la Connexion AWS

```bash
# Test basic
aws sts get-caller-identity

# Test Elastic Beanstalk
aws elasticbeanstalk describe-applications

# Test Amplify
aws amplify list-apps
```

### 4. Permissions AWS Requises

Votre utilisateur AWS doit avoir les permissions suivantes:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticbeanstalk:*",
        "amplify:*",
        "ec2:DescribeAddresses",
        "ec2:AllocateAddress",
        "ec2:ReleaseAddress",
        "servicequotas:*"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Configuration MongoDB

### Prérequis

- MongoDB Compass (recommandé pour GUI)
- Node.js avec MongoDB driver

### 1. Installation MongoDB Compass

**Télécharger:**
- https://www.mongodb.com/try/download/compass

### 2. Configuration de la Connexion

#### Informations de connexion SYMPHONI.A:

```
Cluster: stagingrt
Région: Frankfurt (eu-central-1)
Provider: AWS
Type: M0 (Free Tier)

Connection String:
mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/

Host: stagingrt.v2jnoh2.mongodb.net
Utilisateur: rt_admin
Mot de passe: RtAdmin2024
Auth Database: admin
```

#### Connexion via MongoDB Compass:

1. Ouvrir MongoDB Compass
2. Cliquer sur "New Connection"
3. Entrer la connection string:
   ```
   mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/
   ```
4. Cliquer sur "Connect"

#### Connexion via Node.js:

```javascript
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ Erreur MongoDB:', err));
```

### 3. Bases de Données Disponibles

| Database | Description | API associée |
|----------|-------------|--------------|
| rt-auth | Authentification | api-auth |
| rt-orders | Commandes | api-orders |
| rt-planning | Planification | api-planning |
| rt-ecmr | CMR électronique | api-ecmr |
| rt-palettes | Gestion palettes | api-palettes |
| rt-storage | Stockage | api-storage |
| rt-chatbot | Chatbot | api-chatbot |

### 4. Test de Connexion MongoDB

**Via MongoDB Compass:**
- Une fois connecté, vous devriez voir la liste des databases dans le panneau gauche

**Via CLI (mongo shell):**
```bash
mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/" --username rt_admin --password RtAdmin2024

# Dans le shell:
show dbs
use rt-auth
show collections
```

**Via Node.js (test.js):**
```javascript
const mongoose = require('mongoose');

async function testConnection() {
  try {
    await mongoose.connect('mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth');
    console.log('✅ MongoDB: Connexion réussie!');

    const databases = await mongoose.connection.db.admin().listDatabases();
    console.log('📚 Databases disponibles:');
    databases.databases.forEach(db => console.log('  -', db.name));

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  }
}

testConnection();
```

---

## Configuration des Variables d'Environnement

### 1. Créer le fichier .env

Pour chaque API dans `services/`, créez un fichier `.env`:

```bash
# services/authz-eb/.env
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth?retryWrites=true&w=majority
PORT=3000
JWT_SECRET=rt-super-secret-jwt-key-2024
JWT_EXPIRES_IN=7d
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

```bash
# services/orders/.env
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-orders?retryWrites=true&w=majority
PORT=3030
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

### 2. Script de Configuration Automatique

Créez `setup-env.sh`:

```bash
#!/bin/bash

SERVICES=("authz-eb" "orders" "planning" "ecmr" "palettes" "storage" "chatbot")
DATABASES=("rt-auth" "rt-orders" "rt-planning" "rt-ecmr" "rt-palettes" "rt-storage" "rt-chatbot")
PORTS=(3000 3030 3040 3050 3055 3060 3070)

for i in "${!SERVICES[@]}"; do
  SERVICE="${SERVICES[$i]}"
  DATABASE="${DATABASES[$i]}"
  PORT="${PORTS[$i]}"

  if [ -d "services/$SERVICE" ]; then
    echo "Configuring $SERVICE..."
    cat > "services/$SERVICE/.env" << EOF
MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/$DATABASE?retryWrites=true&w=majority
PORT=$PORT
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
EOF
    echo "✅ $SERVICE configured"
  fi
done

echo ""
echo "✨ All services configured!"
```

Exécuter:
```bash
chmod +x setup-env.sh
./setup-env.sh
```

---

## Test des Connexions

### Script de Test Complet

Créez `test-connections.js`:

```javascript
const mongoose = require('mongoose');

const SERVICES = [
  { name: 'Auth', db: 'rt-auth', port: 3000 },
  { name: 'Orders', db: 'rt-orders', port: 3030 },
  { name: 'Planning', db: 'rt-planning', port: 3040 },
  { name: 'eCMR', db: 'rt-ecmr', port: 3050 },
  { name: 'Palettes', db: 'rt-palettes', port: 3055 },
  { name: 'Storage', db: 'rt-storage', port: 3060 },
  { name: 'Chatbot', db: 'rt-chatbot', port: 3070 }
];

async function testMongoDB(service) {
  const uri = `mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/${service.db}?retryWrites=true&w=majority`;

  try {
    await mongoose.connect(uri);
    console.log(`✅ ${service.name}: MongoDB OK`);
    await mongoose.connection.close();
    return true;
  } catch (error) {
    console.error(`❌ ${service.name}: ${error.message}`);
    return false;
  }
}

async function testAll() {
  console.log('🧪 Testing MongoDB connections...\n');

  let success = 0;
  let failed = 0;

  for (const service of SERVICES) {
    const result = await testMongoDB(service);
    if (result) success++;
    else failed++;
  }

  console.log(`\n📊 Results: ${success}/${SERVICES.length} successful`);
  if (failed === 0) {
    console.log('🎉 All connections working!');
  }
}

testAll();
```

Exécuter:
```bash
cd services/authz-eb  # ou n'importe quel service
npm install
node ../../test-connections.js
```

---

## Troubleshooting

### Problème: AWS CLI commande introuvable

**Solution:**
```bash
# Vérifier l'installation
aws --version

# Si non installé, suivre les étapes d'installation ci-dessus
```

### Problème: Access Denied AWS

**Solutions:**
1. Vérifier que les credentials sont corrects:
   ```bash
   aws sts get-caller-identity
   ```

2. Vérifier les permissions IAM dans AWS Console

3. Regénérer les access keys si nécessaire

### Problème: MongoDB Network Error

**Solutions:**
1. Vérifier que votre IP est autorisée dans MongoDB Atlas:
   - Aller sur https://cloud.mongodb.com
   - Network Access > Add IP Address
   - Ajouter votre IP ou `0.0.0.0/0` (tous) pour le développement

2. Vérifier la connection string:
   ```bash
   # Test avec mongosh
   mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/" --username rt_admin
   ```

3. Vérifier le firewall local

### Problème: MongoDB Authentication Failed

**Solutions:**
1. Vérifier username/password
2. Vérifier que l'utilisateur existe dans MongoDB Atlas
3. Régénérer le mot de passe si nécessaire:
   - MongoDB Atlas > Database Access > Edit User

### Problème: Connection Timeout

**Solutions:**
1. Vérifier la connexion Internet
2. Tester avec ping:
   ```bash
   ping stagingrt.v2jnoh2.mongodb.net
   ```
3. Vérifier si un VPN interfère
4. Essayer avec un autre réseau

---

## Commandes Utiles

### AWS

```bash
# Lister les environnements EB
aws elasticbeanstalk describe-environments

# Lister les apps Amplify
aws amplify list-apps

# Vérifier les quotas
aws service-quotas list-service-quotas --service-code ec2

# Changer de région
export AWS_DEFAULT_REGION=eu-central-1
```

### MongoDB

```bash
# Connexion shell
mongosh "mongodb+srv://stagingrt.v2jnoh2.mongodb.net/" --username rt_admin

# Export data
mongodump --uri="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth"

# Import data
mongorestore --uri="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-auth" dump/
```

---

## Support

Pour plus d'aide:
- Documentation AWS: https://docs.aws.amazon.com/
- Documentation MongoDB: https://docs.mongodb.com/
- SYMPHONI.A Infrastructure: Voir `INFRASTRUCTURE.md`

---

**Dernière mise à jour:** 2024-11-23
**Version:** 1.0.0
