# Guide de déploiement - API d'authentification sur AWS Elastic Beanstalk

## Étape 1: Configurer MongoDB Atlas (5 minutes)

### 1.1 Créer un compte MongoDB Atlas

1. Allez sur https://www.mongodb.com/cloud/atlas/register
2. Créez un compte gratuit
3. Choisissez le plan **FREE** (M0 Sandbox - 512 MB)

### 1.2 Créer un cluster

1. Cliquez sur **"Build a Database"**
2. Choisissez **FREE** (M0)
3. Sélectionnez la région **AWS / Frankfurt (eu-central-1)** (même région que vos apps)
4. Nommez votre cluster: `rt-auth-cluster`
5. Cliquez sur **"Create"**

### 1.3 Configurer l'accès réseau

1. Dans le menu latéral, cliquez sur **"Network Access"**
2. Cliquez sur **"Add IP Address"**
3. Cliquez sur **"Allow Access from Anywhere"** (0.0.0.0/0)
   - ⚠️ En production, limitez à l'IP de votre Elastic Beanstalk
4. Cliquez sur **"Confirm"**

### 1.4 Créer un utilisateur de base de données

1. Dans le menu latéral, cliquez sur **"Database Access"**
2. Cliquez sur **"Add New Database User"**
3. Choisissez **"Password"** comme méthode d'authentification
4. Nom d'utilisateur: `rtadmin`
5. Générez un mot de passe sécurisé (notez-le!)
6. Database User Privileges: **"Read and write to any database"**
7. Cliquez sur **"Add User"**

### 1.5 Obtenir la chaîne de connexion

1. Cliquez on **"Database"** dans le menu latéral
2. Cliquez sur **"Connect"** sur votre cluster
3. Choisissez **"Connect your application"**
4. Copiez la chaîne de connexion (format: `mongodb+srv://rtadmin:<password>@rt-auth-cluster...`)
5. Remplacez `<password>` par votre mot de passe d'utilisateur
6. Ajoutez le nom de la base à la fin: `/rt-auth`

**Exemple de chaîne de connexion finale:**
```
mongodb+srv://rtadmin:VotreMo2Passe@rt-auth-cluster.xxxxx.mongodb.net/rt-auth?retryWrites=true&w=majority
```

✅ **Gardez cette chaîne de connexion pour l'étape 3!**

---

## Étape 2: Préparer l'environnement AWS

### 2.1 Installer AWS CLI

```bash
# Windows (avec winget)
winget install Amazon.AWSCLI

# Ou téléchargez depuis: https://aws.amazon.com/cli/
```

### 2.2 Configurer AWS CLI

```bash
aws configure
```

Entrez:
- AWS Access Key ID: [Votre clé]
- AWS Secret Access Key: [Votre secret]
- Default region name: `eu-central-1`
- Default output format: `json`

### 2.3 Installer EB CLI

```bash
pip install awsebcli
```

Vérifiez l'installation:
```bash
eb --version
```

---

## Étape 3: Déployer sur Elastic Beanstalk

### 3.1 Initialiser Elastic Beanstalk

```bash
cd apps/api-auth
eb init
```

Répondez aux questions:
- Select a default region: `14` (eu-central-1)
- Application name: `rt-auth-api` (ou appuyez sur Entrée)
- Platform: `Node.js`
- Platform version: Choisissez la dernière version Node.js 20
- Set up SSH: `n` (non nécessaire pour l'instant)

### 3.2 Créer l'environnement

```bash
eb create rt-auth-api-prod
```

Attendez 5-10 minutes pendant la création...

### 3.3 Configurer les variables d'environnement

```bash
eb setenv \
  MONGODB_URI="mongodb+srv://rtadmin:VotreMo2Passe@rt-auth-cluster.xxxxx.mongodb.net/rt-auth?retryWrites=true&w=majority" \
  JWT_SECRET="votre-secret-jwt-super-securise-changez-moi" \
  NODE_ENV="production" \
  CORS_ORIGIN="https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com"
```

⚠️ **Important:**
- Remplacez `MONGODB_URI` par votre vraie chaîne de connexion MongoDB Atlas
- Remplacez `JWT_SECRET` par une chaîne aléatoire sécurisée (32+ caractères)
- `CORS_ORIGIN` contient les URLs de tous vos portails AWS Amplify

### 3.4 Déployer l'application

```bash
eb deploy
```

### 3.5 Obtenir l'URL de l'API

```bash
eb status
```

Cherchez la ligne **"CNAME:"** - c'est l'URL de votre API!

Exemple: `rt-auth-api-prod.eu-central-1.elasticbeanstalk.com`

---

## Étape 4: Tester l'API déployée

```bash
# Test health check
curl https://rt-auth-api-prod.eu-central-1.elasticbeanstalk.com/health

# Devrait retourner: {"status":"ok","message":"RT Auth API is running"}
```

---

## Étape 5: Mettre à jour les applications frontend

### 5.1 Ajouter la variable d'environnement dans AWS Amplify

Pour chaque application (web-industry, web-transporter, etc.):

1. Allez sur AWS Amplify Console
2. Sélectionnez votre application
3. Cliquez sur **"Environment variables"** dans le menu
4. Cliquez sur **"Manage variables"**
5. Ajoutez:
   - Variable: `NEXT_PUBLIC_API_URL`
   - Value: `https://rt-auth-api-prod.eu-central-1.elasticbeanstalk.com`
6. Cliquez sur **"Save"**
7. Redéployez l'application

### 5.2 Automatiser avec AWS CLI

```bash
# Pour chaque app
aws amplify update-app \
  --app-id dbg6okncuyyiw \
  --region eu-central-1 \
  --environment-variables NEXT_PUBLIC_API_URL=https://rt-auth-api-prod.eu-central-1.elasticbeanstalk.com

# Déclencher un nouveau déploiement
aws amplify start-job \
  --app-id dbg6okncuyyiw \
  --branch-name main \
  --job-type RELEASE \
  --region eu-central-1
```

Répétez pour tous les app IDs:
- `dbg6okncuyyiw` (web-industry)
- `d1tb834u144p4r` (web-transporter)
- `d3b6p09ihn5w7r` (web-recipient)
- `dzvo8973zaqb` (web-supplier)
- `d3hz3xvddrl94o` (web-forwarder)
- `d31p7m90ewg4xm` (web-logistician)

---

## Étape 6: Créer un utilisateur de test

```bash
curl -X POST https://rt-auth-api-prod.eu-central-1.elasticbeanstalk.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@rt-technologie.com",
    "password": "Admin123!",
    "name": "Admin RT",
    "portal": "industry"
  }'
```

---

## Commandes utiles

```bash
# Voir les logs
eb logs

# Ouvrir l'app dans le navigateur
eb open

# Voir le statut
eb status

# Redéployer après modifications
eb deploy

# SSH dans l'instance (si configuré)
eb ssh

# Supprimer l'environnement (attention!)
eb terminate rt-auth-api-prod
```

---

## Monitoring et Maintenance

### Voir les logs en temps réel
```bash
eb logs --stream
```

### Scaler l'application
```bash
# Dans la console AWS Elastic Beanstalk:
# Configuration > Capacity > Auto Scaling
```

### Coût estimé
- MongoDB Atlas (M0): **Gratuit**
- Elastic Beanstalk: **Gratuit** (tier gratuit AWS 12 mois)
- EC2 t3.micro: ~5-10€/mois après le tier gratuit

---

## Sécurité en production

### 1. Restreindre CORS
Mettez uniquement les URLs de vos apps au lieu de "*"

### 2. Restreindre l'accès MongoDB
Dans MongoDB Atlas > Network Access, limitez aux IPs de votre Elastic Beanstalk

### 3. Utiliser HTTPS
Elastic Beanstalk fournit déjà HTTPS par défaut ✅

### 4. Secrets Manager (optionnel mais recommandé)
Stockez JWT_SECRET dans AWS Secrets Manager au lieu d'une variable d'environnement

---

## Troubleshooting

### L'API ne démarre pas
```bash
eb logs
# Vérifiez les erreurs de connexion MongoDB
```

### Erreur de connexion MongoDB
- Vérifiez que l'IP 0.0.0.0/0 est autorisée dans MongoDB Atlas
- Vérifiez que le mot de passe dans MONGODB_URI est correct
- Vérifiez qu'il n'y a pas de caractères spéciaux non encodés dans l'URL

### Erreurs CORS
- Vérifiez que CORS_ORIGIN contient l'URL exacte de votre frontend
- Format: `https://main.d123456.amplifyapp.com` (sans slash à la fin)

---

**🎉 Votre API est maintenant déployée et prête à l'emploi!**
