# Déploiement des Nouveaux Services

Ce guide explique comment déployer les 3 nouveaux services sur AWS Elastic Beanstalk :
- **notifications** (port 3004)
- **planning** (port 3005)
- **geo-tracking** (port 3016)

## Prérequis

- AWS CLI installé et configuré
- EB CLI installé (`pip install awsebcli`)
- Accès au compte AWS RT Technologie
- MongoDB Atlas configuré

## Option 1 : Déploiement Automatique (Recommandé)

Utilisez le script PowerShell fourni :

```powershell
.\deploy-new-services.ps1
```

Ce script va :
1. Construire les 3 services en mode standalone
2. Créer les applications Elastic Beanstalk
3. Déployer les environnements de production
4. Configurer les variables d'environnement

## Option 2 : Déploiement Manuel

### 1. Notifications Service

```bash
# Construire le service standalone
cd services
.\build-standalone-service.ps1 -ServiceName notifications -Port 3004

# Aller dans le dossier déployable
cd notifications-eb

# Initialiser EB (première fois seulement)
eb init -p "Node.js 20" -r eu-central-1

# Créer l'environnement de production
eb create rt-notifications-api-prod \
  --region eu-central-1 \
  --platform "Node.js 20" \
  --instance-type t3.micro \
  --single

# Configurer les variables d'environnement
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-notifications?retryWrites=true&w=majority" \
  PORT="3000" \
  JWT_SECRET="your-jwt-secret-key" \
  AWS_REGION="eu-central-1" \
  AWS_ACCESS_KEY_ID="your-access-key" \
  AWS_SECRET_ACCESS_KEY="your-secret-key" \
  EMAIL_FROM="noreply@rt-technologie.com" \
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# Déployer
eb deploy

# Vérifier
eb status
eb open
```

### 2. Planning Service

```bash
# Construire le service standalone
cd services
.\build-standalone-service.ps1 -ServiceName planning -Port 3005

# Aller dans le dossier déployable
cd planning-eb

# Initialiser EB
eb init -p "Node.js 20" -r eu-central-1

# Créer l'environnement
eb create rt-planning-api-prod \
  --region eu-central-1 \
  --platform "Node.js 20" \
  --instance-type t3.micro \
  --single

# Configurer les variables
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-planning?retryWrites=true&w=majority" \
  PORT="3000" \
  JWT_SECRET="your-jwt-secret-key" \
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# Déployer
eb deploy
eb status
eb open
```

### 3. Geo-Tracking Service

```bash
# Construire le service standalone
cd services
.\build-standalone-service.ps1 -ServiceName geo-tracking -Port 3016

# Aller dans le dossier déployable
cd geo-tracking-eb

# Initialiser EB
eb init -p "Node.js 20" -r eu-central-1

# Créer l'environnement
eb create rt-geotracking-api-prod \
  --region eu-central-1 \
  --platform "Node.js 20" \
  --instance-type t3.micro \
  --single

# Configurer les variables
eb setenv \
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-geotracking?retryWrites=true&w=majority" \
  PORT="3000" \
  JWT_SECRET="your-jwt-secret-key" \
  TOMTOM_API_KEY="your-tomtom-api-key" \
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# Déployer
eb deploy
eb status
eb open
```

## Variables d'Environnement par Service

### Notifications
- `MONGODB_URI` - Connexion MongoDB Atlas
- `PORT` - Port du service (3000 sur EB)
- `JWT_SECRET` - Clé secrète JWT
- `AWS_REGION` - Région AWS (eu-central-1)
- `AWS_ACCESS_KEY_ID` - Clé d'accès AWS pour SES
- `AWS_SECRET_ACCESS_KEY` - Clé secrète AWS
- `EMAIL_FROM` - Email expéditeur par défaut
- `CORS_ALLOWED_ORIGINS` - Origins CORS autorisées

### Planning
- `MONGODB_URI` - Connexion MongoDB Atlas
- `PORT` - Port du service (3000 sur EB)
- `JWT_SECRET` - Clé secrète JWT
- `CORS_ALLOWED_ORIGINS` - Origins CORS autorisées

### Geo-Tracking
- `MONGODB_URI` - Connexion MongoDB Atlas
- `PORT` - Port du service (3000 sur EB)
- `JWT_SECRET` - Clé secrète JWT
- `TOMTOM_API_KEY` - Clé API TomTom (optionnel)
- `CORS_ALLOWED_ORIGINS` - Origins CORS autorisées

## URLs de Production

Après déploiement, les services seront disponibles à :

- **Notifications**: `http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com`
- **Planning**: `http://rt-planning-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com`
- **Geo-Tracking**: `http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com`

## Vérification du Déploiement

Pour chaque service :

```bash
# Tester le health endpoint
curl http://[service-url]/health

# Vérifier les logs
cd services/[service-name]-eb
eb logs

# Statut de l'environnement
eb status
```

## Redéploiement après modifications

```bash
cd services/[service-name]-eb
eb deploy
eb status
```

## Troubleshooting

### Service ne démarre pas
```bash
eb logs
# Vérifier les erreurs dans les logs
```

### Problème de connexion MongoDB
```bash
eb printenv
# Vérifier que MONGODB_URI est correcte
```

### Variables d'environnement manquantes
```bash
eb setenv KEY=VALUE
```

## Notes Importantes

1. **MongoDB Atlas** : Assurez-vous que les IPs des instances EB sont autorisées dans MongoDB Atlas Network Access
2. **AWS SES** : Pour le service notifications, vérifiez que SES est configuré et vérifié
3. **Elastic IPs** : Limite de 5 EIPs par région - actuellement 5/5 utilisées
4. **Instance Type** : t3.micro utilisé pour minimiser les coûts
5. **Région** : eu-central-1 (Frankfurt) utilisée pour tous les services

## Coûts Estimés

Par service (t3.micro single instance) :
- Instance EC2 : ~$8/mois
- Load Balancer : $0 (single instance, pas d'ELB)
- Bandwidth : Variable selon usage

**Total pour 3 services : ~$24/mois**
