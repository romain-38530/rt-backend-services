# Guide de Déploiement Final - RT Backend Services

## ✅ État Actuel

### Services Construits et Prêts

Les services suivants sont construits en version standalone et prêts pour le déploiement :

| Service | Répertoire | Port Local | Base MongoDB |
|---------|------------|------------|--------------|
| **Notifications** | `services/notifications-eb` | 3004 | rt-notifications |
| **Geo-Tracking** | `services/geo-tracking-eb` | 3016 | rt-geotracking |

### Prérequis Vérifiés

- ✅ AWS CLI installé et configuré
- ✅ Compte AWS connecté (ID: 004843574253)
- ✅ Credentials AWS valides
- ✅ Services compilés en standalone
- ✅ MongoDB Atlas prêt

## 🚀 Déploiement sur AWS Elastic Beanstalk

### Option 1 : Déploiement via EB CLI (PowerShell)

**Pour le service Notifications :**

```powershell
cd services\notifications-eb

# 1. Initialiser EB
python -m awsebcli.core.ebcore init rt-notifications-api --platform "Node.js 20" --region eu-central-1

# 2. Créer l'environnement
python -m awsebcli.core.ebcore create rt-notifications-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 3. Configurer les variables d'environnement
python -m awsebcli.core.ebcore setenv `
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-notifications?retryWrites=true&w=majority" `
  PORT="3000" `
  NODE_ENV="production" `
  JWT_SECRET="rt-jwt-secret-2024-change-in-production" `
  AWS_REGION="eu-central-1" `
  EMAIL_FROM="noreply@rt-technologie.com" `
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# 4. Déployer
python -m awsebcli.core.ebcore deploy

# 5. Vérifier
python -m awsebcli.core.ebcore status
python -m awsebcli.core.ebcore open
```

**Pour le service Geo-Tracking :**

```powershell
cd services\geo-tracking-eb

# 1. Initialiser EB
python -m awsebcli.core.ebcore init rt-geotracking-api --platform "Node.js 20" --region eu-central-1

# 2. Créer l'environnement
python -m awsebcli.core.ebcore create rt-geotracking-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 3. Configurer les variables d'environnement
python -m awsebcli.core.ebcore setenv `
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-geotracking?retryWrites=true&w=majority" `
  PORT="3000" `
  NODE_ENV="production" `
  JWT_SECRET="rt-jwt-secret-2024-change-in-production" `
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# 4. Déployer
python -m awsebcli.core.ebcore deploy

# 5. Vérifier
python -m awsebcli.core.ebcore status
python -m awsebcli.core.ebcore open
```

### Option 2 : Déploiement via AWS Console

1. **Connectez-vous à AWS Console** : https://console.aws.amazon.com
2. **Naviguez vers Elastic Beanstalk**
3. **Créez une nouvelle application** :
   - Nom : `rt-notifications-api` ou `rt-geotracking-api`
   - Plateforme : Node.js 20
   - Code source : Upload le fichier ZIP du service

4. **Créez un environnement** :
   - Nom : `rt-[service]-api-prod`
   - Type : Single instance
   - Instance : t3.micro

5. **Configurez les variables d'environnement** dans Configuration > Software

6. **Déployez** le code

### Option 3 : Déploiement via AWS CLI

```bash
# Créer une archive ZIP
cd services/notifications-eb
zip -r ../notifications.zip .

# Créer l'application EB
aws elasticbeanstalk create-application \
  --application-name rt-notifications-api \
  --region eu-central-1

# Créer la version de l'application
aws elasticbeanstalk create-application-version \
  --application-name rt-notifications-api \
  --version-label v1 \
  --source-bundle S3Bucket=my-bucket,S3Key=notifications.zip

# Créer l'environnement
aws elasticbeanstalk create-environment \
  --application-name rt-notifications-api \
  --environment-name rt-notifications-api-prod \
  --solution-stack-name "64bit Amazon Linux 2023 v6.1.0 running Node.js 20" \
  --option-settings file://options.json
```

## 📋 Configuration MongoDB Atlas

### 1. Autoriser les IPs AWS

Une fois les environnements créés, récupérez les IPs et ajoutez-les dans MongoDB Atlas :

```powershell
# Obtenir l'IP de l'instance
python -m awsebcli.core.ebcore ssh --command "curl https://api.ipify.org"
```

Dans MongoDB Atlas :
1. Network Access > Add IP Address
2. Ajouter les IPs des instances EB
3. Ou temporairement : `0.0.0.0/0` (à sécuriser ensuite)

### 2. Créer les Bases de Données

Les bases seront créées automatiquement lors de la première connexion :
- `rt-notifications`
- `rt-geotracking`

## 🔐 Sécurité Post-Déploiement

### 1. Changer JWT_SECRET

```powershell
python -m awsebcli.core.ebcore setenv JWT_SECRET="[nouveau-secret-fort]"
```

### 2. Configurer AWS SES (pour notifications)

1. Vérifier le domaine dans AWS SES
2. Ajouter les clés AWS dans les variables d'environnement :

```powershell
python -m awsebcli.core.ebcore setenv `
  AWS_ACCESS_KEY_ID="AKIA..." `
  AWS_SECRET_ACCESS_KEY="..."
```

### 3. Activer HTTPS

Dans AWS Console > Elastic Beanstalk > Configuration > Load Balancer :
- Ajouter un listener HTTPS sur port 443
- Configurer le certificat SSL

## 🧪 Tests Post-Déploiement

### Notifications Service

```bash
# Health check
curl https://rt-notifications-api-prod.[region].elasticbeanstalk.com/health

# Envoyer un email test
curl -X POST https://rt-notifications-api-prod.[region].elasticbeanstalk.com/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test from RT Notifications",
    "content": "<h1>Hello from AWS!</h1>"
  }'
```

### Geo-Tracking Service

```bash
# Health check
curl https://rt-geotracking-api-prod.[region].elasticbeanstalk.com/health

# Créer un tracking test
curl -X POST https://rt-geotracking-api-prod.[region].elasticbeanstalk.com/api/tracking \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "test-001",
    "position": {
      "latitude": 48.8566,
      "longitude": 2.3522,
      "speed": 50
    }
  }'
```

## 🔄 Mise à Jour des Services

Pour déployer une nouvelle version :

```powershell
cd services/[service-name]-eb

# Rebuild depuis le monorepo si nécessaire
cd ../../
.\services\build-standalone-service.ps1 -ServiceName [service-name] -Port [port]

# Déployer
cd services/[service-name]-eb
python -m awsebcli.core.ebcore deploy
```

## 📊 Monitoring

### CloudWatch Logs

```powershell
# Voir les logs en temps réel
python -m awsebcli.core.ebcore logs --stream

# Télécharger les logs
python -m awsebcli.core.ebcore logs --cloudwatch-logs
```

### Métriques

Dans AWS Console > CloudWatch > Dashboards :
- CPU Utilization
- Request Count
- Response Time
- Error Rate

## 🆘 Dépannage

### Service ne démarre pas

```powershell
# Vérifier les logs
python -m awsebcli.core.ebcore logs

# Vérifier les variables
python -m awsebcli.core.ebcore printenv

# SSH dans l'instance
python -m awsebcli.core.ebcore ssh
```

### Erreur de connexion MongoDB

1. Vérifier que l'IP est autorisée dans MongoDB Atlas
2. Tester la connexion :

```bash
# Sur l'instance EB
curl -I https://stagingrt.v2jnoh2.mongodb.net
```

### Out of Memory

Augmenter la taille de l'instance :

```powershell
python -m awsebcli.core.ebcore scale 1 -i t3.small
```

## 💰 Coûts Estimés

| Ressource | Coût Mensuel |
|-----------|--------------|
| t3.micro (notifications) | ~$8 |
| t3.micro (geo-tracking) | ~$8 |
| MongoDB Atlas (M10) | $57 |
| Data Transfer | ~$5 |
| **Total** | **~$78/mois** |

## 📝 Checklist de Déploiement

- [ ] Services construits en standalone
- [ ] MongoDB Atlas configuré
- [ ] IPs autorisées dans MongoDB
- [ ] Variables d'environnement configurées
- [ ] JWT_SECRET changé en production
- [ ] AWS SES configuré (notifications)
- [ ] Services déployés sur EB
- [ ] Health checks passent
- [ ] Tests fonctionnels OK
- [ ] Logs vérifiés
- [ ] Monitoring configuré
- [ ] Documentation mise à jour

## 🔗 Liens Utiles

- **MongoDB Atlas** : https://cloud.mongodb.com
- **AWS Console** : https://console.aws.amazon.com
- **AWS SES** : https://console.aws.amazon.com/ses/
- **Elastic Beanstalk** : https://console.aws.amazon.com/elasticbeanstalk/

---

**Dernière mise à jour** : 2025-01-23
**Support** : Vérifier les logs avec `python -m awsebcli.core.ebcore logs`
