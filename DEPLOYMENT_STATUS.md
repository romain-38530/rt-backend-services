# État du Déploiement - RT Backend Services

## Services Déployés sur AWS Elastic Beanstalk

### ✅ Services en Production (5/13)

| Service | URL | Status | Base de données |
|---------|-----|--------|-----------------|
| Auth API | http://rt-auth-api-prod.eba-g2psqhq5.eu-central-1.elasticbeanstalk.com | ✅ Déployé | rt-auth |
| Orders API | http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com | ✅ Déployé | rt-orders |
| Planning API | http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com | ✅ Déployé | rt-planning |
| eCMR API | http://rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com | ✅ Déployé | rt-ecmr |
| Palettes API | http://rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com | ✅ Déployé | rt-palettes |

### 🟡 Services Prêts à Déployer (3/13)

Ces services sont complètement implémentés et prêts pour le déploiement :

| Service | Port Local | Base de données | Script de Build |
|---------|------------|-----------------|-----------------|
| **Notifications** | 3004 | rt-notifications | `.\build-standalone-service.ps1 -ServiceName notifications -Port 3004` |
| **Planning** | 3005 | rt-planning | `.\build-standalone-service.ps1 -ServiceName planning -Port 3005` |
| **Geo-Tracking** | 3016 | rt-geotracking | `.\build-standalone-service.ps1 -ServiceName geo-tracking -Port 3016` |

### ⚠️ Limitation Actuelle

**Elastic IPs**: 5/5 utilisées en région eu-central-1

Options pour déployer les 3 nouveaux services :
1. **Utiliser --single** : Mode single instance sans Load Balancer (pas d'EIP nécessaire) ✅
2. Augmenter la limite EIP via AWS Support
3. Déployer dans une autre région (eu-west-1)

## Déploiement Automatique

### Option 1 : Tout déployer automatiquement

```powershell
# Construire et déployer les 3 services en une commande
.\deploy-new-services.ps1
```

### Option 2 : Déployer un service à la fois

```powershell
# Notifications
.\deploy-new-services.ps1 -Service notifications

# Planning (déjà déployé - redéploiement)
.\deploy-new-services.ps1 -Service planning

# Geo-Tracking
.\deploy-new-services.ps1 -Service geo-tracking
```

### Option 3 : Construire seulement (tester localement d'abord)

```powershell
# Construire sans déployer
.\deploy-new-services.ps1 -OnlyBuild

# Tester localement
cd services/notifications-eb
npm install
npm run dev

# Puis déployer plus tard
.\deploy-new-services.ps1 -SkipBuild
```

## Variables d'Environnement Requises

### Communes à tous les services
```bash
MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/[database]?retryWrites=true&w=majority"
PORT="3000"
JWT_SECRET="your-jwt-secret-key"
CORS_ALLOWED_ORIGINS="https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
```

### Notifications (en plus)
```bash
AWS_REGION="eu-central-1"
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
EMAIL_FROM="noreply@rt-technologie.com"
```

### Geo-Tracking (en plus)
```bash
TOMTOM_API_KEY="your-tomtom-api-key"  # Optionnel
```

## Étapes Post-Déploiement

### 1. Vérifier les Health Checks

```bash
# Notifications
curl http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health

# Planning
curl http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com/health

# Geo-Tracking
curl http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health
```

### 2. Configurer MongoDB Atlas

Ajouter les IPs des instances EB dans MongoDB Atlas Network Access :
- Aller sur MongoDB Atlas > Network Access
- Ajouter les IPs des nouvelles instances EB
- Ou temporairement : 0.0.0.0/0 (à sécuriser ensuite)

### 3. Mettre à jour admin-gateway

Ajouter les routes vers les nouveaux services dans `admin-gateway` :

```typescript
// services/admin-gateway/src/routes/index.ts
const SERVICES = {
  // ... existant ...
  notifications: process.env.NOTIFICATIONS_URL || 'http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com',
  // planning déjà existant
  geoTracking: process.env.GEO_TRACKING_URL || 'http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com',
};

// Ajouter les routes
app.use('/api/v1/notifications', createProxyMiddleware({ target: SERVICES.notifications }));
app.use('/api/v1/tracking', createProxyMiddleware({ target: SERVICES.geoTracking }));
```

### 4. Tester les Endpoints

Voir [DEPLOY_COMMANDS.md](DEPLOY_COMMANDS.md) pour les exemples de tests curl.

## Monitoring

### Logs en temps réel

```powershell
cd services/notifications-eb
eb logs --stream

cd services/planning-eb
eb logs --stream

cd services/geo-tracking-eb
eb logs --stream
```

### Métriques CloudWatch

Accéder via la console AWS :
- CloudWatch > Metrics > ECS
- Filtrer par environment name

## Coûts Estimés

| Service | Instance Type | Coût mensuel estimé |
|---------|---------------|---------------------|
| Notifications | t3.micro single | ~$8 |
| Planning | t3.micro single | ~$8 (déjà déployé) |
| Geo-Tracking | t3.micro single | ~$8 |
| **Total nouveaux** | - | **~$16/mois** |

Mode `--single` = Pas de Load Balancer = Économie de ~$16/mois par service

## Rollback

En cas de problème :

```powershell
cd services/[service-name]-eb

# Voir les versions
eb appversion

# Déployer une version précédente
eb deploy --version [version-number]

# Ou terminer l'environnement
eb terminate rt-[service-name]-api-prod
```

## Checklist de Déploiement

### Avant le déploiement
- [ ] AWS CLI installé et configuré
- [ ] EB CLI installé (`pip install awsebcli`)
- [ ] MongoDB Atlas prêt avec bases de données créées
- [ ] Variables d'environnement notées (JWT_SECRET, AWS keys, etc.)
- [ ] Services testés localement
- [ ] Code committé sur GitHub

### Pendant le déploiement
- [ ] Scripts de build exécutés sans erreur
- [ ] Environnements EB créés avec succès
- [ ] Variables d'environnement configurées
- [ ] Déploiement complété sans erreur
- [ ] Health checks retournent 200 OK

### Après le déploiement
- [ ] IPs ajoutées dans MongoDB Atlas
- [ ] Endpoints testés avec curl
- [ ] Admin-gateway mis à jour et redéployé
- [ ] Documentation mise à jour avec les URLs
- [ ] Frontend testé avec les nouveaux services
- [ ] Logs vérifiés (pas d'erreurs critiques)

## Support

En cas de problème :
1. Vérifier les logs : `eb logs`
2. Vérifier les variables : `eb printenv`
3. Vérifier le statut : `eb status`
4. Consulter [DEPLOY_COMMANDS.md](DEPLOY_COMMANDS.md) pour le troubleshooting

---

**Dernière mise à jour** : 2025-01-23
**Région AWS** : eu-central-1 (Frankfurt)
**MongoDB** : MongoDB Atlas (stagingrt.v2jnoh2.mongodb.net)
