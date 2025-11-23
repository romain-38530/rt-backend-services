# 🚀 Déploiement Immédiat - Commandes à Exécuter

## ✅ Configurations Récupérées de rt-frontend-apps

**MongoDB** : `mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/`
**JWT_SECRET** : `votre-secret-jwt-a-changer-en-production`
**CORS_ORIGIN** : `http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com`

## 📦 Services Prêts à Déployer

- ✅ **notifications-eb** (services/notifications-eb)
- ✅ **geo-tracking-eb** (services/geo-tracking-eb)

---

## 🔥 DÉPLOYER NOTIFICATIONS (Commandes à copier-coller)

```powershell
# 1. Aller dans le répertoire du service
cd C:\Users\rtard\rt-backend-services\services\notifications-eb

# 2. Initialiser EB
python -m awsebcli.core.ebcore init rt-notifications-api --platform "Node.js 20" --region eu-central-1

# 3. Créer l'environnement de production
python -m awsebcli.core.ebcore create rt-notifications-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 4. Configurer les variables d'environnement (EN UNE SEULE COMMANDE)
python -m awsebcli.core.ebcore setenv MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-notifications?retryWrites=true&w=majority&appName=StagingRT" PORT="3000" NODE_ENV="production" JWT_SECRET="votre-secret-jwt-a-changer-en-production" AWS_REGION="eu-central-1" EMAIL_FROM="noreply@rt-technologie.com" CORS_ALLOWED_ORIGINS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com"

# 5. Déployer l'application
python -m awsebcli.core.ebcore deploy

# 6. Vérifier le statut
python -m awsebcli.core.ebcore status

# 7. Ouvrir dans le navigateur
python -m awsebcli.core.ebcore open

# 8. Tester le service
# L'URL sera affichée par la commande status ci-dessus
# Exemple : curl https://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health
```

---

## 🔥 DÉPLOYER GEO-TRACKING (Commandes à copier-coller)

```powershell
# 1. Aller dans le répertoire du service
cd C:\Users\rtard\rt-backend-services\services\geo-tracking-eb

# 2. Initialiser EB
python -m awsebcli.core.ebcore init rt-geotracking-api --platform "Node.js 20" --region eu-central-1

# 3. Créer l'environnement de production
python -m awsebcli.core.ebcore create rt-geotracking-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# 4. Configurer les variables d'environnement (EN UNE SEULE COMMANDE)
python -m awsebcli.core.ebcore setenv MONGODB_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-geotracking?retryWrites=true&w=majority&appName=StagingRT" PORT="3000" NODE_ENV="production" JWT_SECRET="votre-secret-jwt-a-changer-en-production" CORS_ALLOWED_ORIGINS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com"

# 5. Déployer l'application
python -m awsebcli.core.ebcore deploy

# 6. Vérifier le statut
python -m awsebcli.core.ebcore status

# 7. Ouvrir dans le navigateur
python -m awsebcli.core.ebcore open

# 8. Tester le service
# curl https://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com/health
```

---

## 🔍 Vérification Post-Déploiement

```powershell
# Pour chaque service, vérifier :

# 1. Statut EB
python -m awsebcli.core.ebcore status

# 2. Logs (si problème)
python -m awsebcli.core.ebcore logs

# 3. Health check (remplacer [URL] par l'URL du service)
curl [URL]/health

# 4. Variables d'environnement
python -m awsebcli.core.ebcore printenv
```

---

## 📋 URLs des Services Après Déploiement

Après avoir exécuté les commandes ci-dessus, notez les URLs :

| Service | URL de Production |
|---------|-------------------|
| Notifications | `http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com` |
| Geo-Tracking | `http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com` |

## 🔗 Mettre à Jour admin-gateway

Une fois les services déployés, ajoutez leurs URLs dans admin-gateway :

```typescript
// services/admin-gateway/src/routes/index.ts
const SERVICES = {
  // ... autres services ...
  notifications: process.env.NOTIFICATIONS_URL || 'http://rt-notifications-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com',
  geoTracking: process.env.GEO_TRACKING_URL || 'http://rt-geotracking-api-prod.eba-XXXXXXXX.eu-central-1.elasticbeanstalk.com',
};
```

---

## 🎯 En Cas de Problème

### EB CLI Module Not Found

```powershell
# Réinstaller EB CLI
pip install --upgrade awsebcli

# Vérifier l'installation
python -c "from awsebcli.core import ebcore; print('OK')"
```

### MongoDB Connection Error

1. Vérifier que MongoDB Atlas autorise l'IP du serveur AWS
2. Aller sur MongoDB Atlas > Network Access
3. Ajouter `0.0.0.0/0` temporairement pour tester

### Service Won't Start

```powershell
# Voir les logs détaillés
python -m awsebcli.core.ebcore logs --stream

# SSH dans l'instance
python -m awsebcli.core.ebcore ssh

# Une fois connecté :
cd /var/app/current
cat /var/log/eb-engine.log
cat /var/log/nodejs/nodejs.log
```

---

## ✅ Résumé des Actions

1. ✅ Services construits (notifications-eb, geo-tracking-eb)
2. ⏳ Déploiement sur AWS Elastic Beanstalk (à exécuter)
3. ⏳ Configuration MongoDB Atlas Network Access
4. ⏳ Tests des endpoints
5. ⏳ Mise à jour admin-gateway avec les URLs

**Temps estimé** : 15-20 minutes par service

**Coût** : ~$8/mois par service (t3.micro)
