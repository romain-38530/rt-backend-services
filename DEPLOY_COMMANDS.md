# Commandes de Déploiement Rapide

## Déploiement Complet Automatique

```powershell
# Construire et déployer les 3 services
.\deploy-new-services.ps1

# Construire seulement (sans déployer)
.\deploy-new-services.ps1 -OnlyBuild

# Déployer un service spécifique
.\deploy-new-services.ps1 -Service notifications
.\deploy-new-services.ps1 -Service planning
.\deploy-new-services.ps1 -Service geo-tracking
```

## Déploiement Manuel par Service

### Notifications

```powershell
# 1. Construire le service standalone
cd services
.\build-standalone-service.ps1 -ServiceName notifications -Port 3004

# 2. Déployer
cd notifications-eb
eb init -p "Node.js 20" -r eu-central-1
eb create rt-notifications-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 3. Configurer
eb setenv `
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-notifications?retryWrites=true&w=majority" `
  PORT="3000" `
  JWT_SECRET="your-secret" `
  AWS_REGION="eu-central-1" `
  EMAIL_FROM="noreply@rt-technologie.com" `
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# 4. Déployer
eb deploy

# 5. Vérifier
eb status
eb open
curl http://[url]/health
```

### Planning

```powershell
# 1. Construire
cd services
.\build-standalone-service.ps1 -ServiceName planning -Port 3005

# 2. Déployer
cd planning-eb
eb init -p "Node.js 20" -r eu-central-1
eb create rt-planning-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 3. Configurer
eb setenv `
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-planning?retryWrites=true&w=majority" `
  PORT="3000" `
  JWT_SECRET="your-secret" `
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# 4. Déployer
eb deploy

# 5. Vérifier
eb status
eb open
curl http://[url]/health
```

### Geo-Tracking

```powershell
# 1. Construire
cd services
.\build-standalone-service.ps1 -ServiceName geo-tracking -Port 3016

# 2. Déployer
cd geo-tracking-eb
eb init -p "Node.js 20" -r eu-central-1
eb create rt-geotracking-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 3. Configurer
eb setenv `
  MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-geotracking?retryWrites=true&w=majority" `
  PORT="3000" `
  JWT_SECRET="your-secret" `
  TOMTOM_API_KEY="your-tomtom-key" `
  CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

# 4. Déployer
eb deploy

# 5. Vérifier
eb status
eb open
curl http://[url]/health
```

## Commandes Utiles Post-Déploiement

### Vérifier le statut
```powershell
cd services/notifications-eb
eb status

cd services/planning-eb
eb status

cd services/geo-tracking-eb
eb status
```

### Voir les logs
```powershell
cd services/notifications-eb
eb logs
eb logs --stream  # Temps réel

cd services/planning-eb
eb logs

cd services/geo-tracking-eb
eb logs
```

### Mettre à jour après modifications
```powershell
# Pour chaque service
cd services/[service-name]-eb
eb deploy
```

### Tester les endpoints

```bash
# Health checks
curl http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health
curl http://rt-planning-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health
curl http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health

# Notifications - Envoyer un email test
curl -X POST http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "content": "<h1>Hello from RT Notifications</h1>"
  }'

# Planning - Créer un planning test
curl -X POST http://rt-planning-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/api/planning \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Planning",
    "startDate": "2025-01-01T08:00:00Z",
    "endDate": "2025-01-01T18:00:00Z"
  }'

# Geo-Tracking - Créer un tracking test
curl -X POST http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/api/tracking \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "vehicle-001",
    "position": {
      "latitude": 48.8566,
      "longitude": 2.3522,
      "speed": 50
    }
  }'
```

## Dépannage

### Service ne démarre pas
```powershell
cd services/[service-name]-eb
eb logs
# Rechercher les erreurs dans les logs
```

### Erreur de connexion MongoDB
```powershell
# Vérifier que MongoDB Atlas autorise les IPs
# Ajouter 0.0.0.0/0 dans Network Access pour tester

# Vérifier la variable
cd services/[service-name]-eb
eb printenv | Select-String "MONGODB"
```

### Mettre à jour une variable d'environnement
```powershell
cd services/[service-name]-eb
eb setenv KEY=VALUE
eb restart  # Redémarrer pour appliquer
```

### Reconstruire depuis le monorepo
```powershell
# Si vous avez modifié le code dans le monorepo
cd services
.\build-standalone-service.ps1 -ServiceName [service-name] -Port [port]
cd [service-name]-eb
eb deploy
```

## Checklist de Déploiement

- [ ] AWS CLI installé et configuré
- [ ] EB CLI installé (`pip install awsebcli`)
- [ ] MongoDB Atlas configuré avec Network Access
- [ ] JWT_SECRET défini
- [ ] AWS SES configuré (pour notifications)
- [ ] Variables d'environnement configurées
- [ ] Services construits en standalone
- [ ] Environnements EB créés
- [ ] Déploiement effectué
- [ ] Health checks passent
- [ ] Tests fonctionnels OK
- [ ] URLs ajoutées dans admin-gateway
- [ ] Documentation mise à jour
