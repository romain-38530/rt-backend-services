# Guide: Corriger les Services 502

## ❌ Services Concernés

1. **Planning** - rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com
2. **eCMR** - rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com
3. **Palettes** - rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com

## 🔍 Problème Identifié

Les environnements existent sur AWS mais le déploiement via CLI (eb deploy ou AWS CLI) échoue systématiquement avec "No Application Version found".

## ✅ Solution Recommandée: AWS Console

### Étape 1: Préparer les Archives

Les archives sont déjà créées:
- `services/planning-eb/planning-standalone.zip` ✅
- `services/ecmr-eb/ecmr-standalone.zip` ✅
- `services/palettes-eb/palettes-standalone.zip` ✅

### Étape 2: Déployer via AWS Console

Pour chaque service (Planning, eCMR, Palettes):

1. **Aller dans AWS Elastic Beanstalk Console**
   - URL: https://eu-central-1.console.aws.amazon.com/elasticbeanstalk/home?region=eu-central-1#/environments

2. **Sélectionner l'environnement**
   - Cliquer sur `rt-planning-api-prod` (ou ecmr/palettes)

3. **Upload nouvelle version**
   - Cliquer sur "Upload and deploy"
   - Choisir le fichier: `planning-standalone.zip`
   - Version label: `v1-standalone`
   - Cliquer sur "Deploy"

4. **Attendre le déploiement** (2-3 minutes)

5. **Configurer les variables d'environnement**
   - Aller dans Configuration > Software > Edit
   - Ajouter:
     ```
     MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-[SERVICE]?retryWrites=true&w=majority&appName=StagingRT
     NODE_ENV=production
     CORS_ALLOWED_ORIGINS=http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d1tb834u144p4r.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com,https://main.dzvo8973zaqb.amplifyapp.com,https://main.d3hz3xvddrl94o.amplifyapp.com,https://main.d31p7m90ewg4xm.amplifyapp.com
     ```
   - Remplacer `[SERVICE]` par: `rt-planning`, `rt-ecmr`, ou `rt-palettes`
   - Cliquer sur "Apply"

6. **Tester**
   ```bash
   curl http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com/health
   ```

### Étape 3: Autoriser l'IP dans MongoDB Atlas

Pour chaque environnement déployé, récupérer l'IP et l'autoriser:

1. **Récupérer l'IP**
   ```bash
   # Planning
   ping rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com

   # eCMR
   ping rt-ecmr-api-prod.eba-43ngua6v.eu-central-1.elasticbeanstalk.com

   # Palettes
   ping rt-palettes-api-prod.eba-peea8hx2.eu-central-1.elasticbeanstalk.com
   ```

2. **Ajouter dans MongoDB Atlas**
   - https://cloud.mongodb.com/v2/673e2c5a3a843f7e2d0bd50a#/security/network/accessList
   - Cliquer sur "Add IP Address"
   - Entrer l'IP récupérée
   - Description: `rt-[service]-api-prod`
   - Cliquer sur "Confirm"

## 🔄 Alternative: Recréer les Environnements

Si le déploiement via Console échoue aussi, recréer complètement:

```bash
# 1. Terminer l'environnement existant
aws elasticbeanstalk terminate-environment --environment-name rt-planning-api-prod --region eu-central-1

# 2. Attendre la suppression (5-10 minutes)
aws elasticbeanstalk describe-environments --environment-names rt-planning-api-prod --region eu-central-1

# 3. Recréer avec eb CLI
cd services/planning-eb
eb init -p "Node.js 20 running on 64bit Amazon Linux 2023" -r eu-central-1 rt-planning-api
eb create rt-planning-api-prod --instance-type t3.micro --single

# 4. Configurer MongoDB
eb setenv MONGODB_URI="..." NODE_ENV="production" CORS_ALLOWED_ORIGINS="..."

# 5. Tester
curl http://rt-planning-api-prod.eba-gbhspa2p.eu-central-1.elasticbeanstalk.com/health
```

## 📊 Résumé

**Problème:** Déploiement CLI impossible (version non trouvée)  
**Cause:** Incompatibilité EB CLI avec environnements existants  
**Solution:** Déploiement manuel via AWS Console  
**Temps estimé:** 15-20 minutes (5 min par service)

---

**Fichiers prêts:**
- ✅ planning-standalone.zip
- ✅ ecmr-standalone.zip  
- ✅ palettes-standalone.zip
- ✅ Variables d'environnement documentées
- ✅ IPs MongoDB à autoriser

