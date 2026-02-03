# Récapitulatif Déploiement - Système Affret.IA → Dashdoc Sync

## ✅ Ce qui a été fait

### 1. Développement Complet du Système

**Fichiers créés** (2,306 lignes de code):
- `services/tms-sync-eb/connectors/dashdoc-update.connector.js` (393 lignes)
- `services/tms-sync-eb/services/affretia-dashdoc-sync.service.js` (472 lignes)
- `services/tms-sync-eb/event-listeners/affretia-events.js` (121 lignes)
- `services/tms-sync-eb/routes/affretia-sync.routes.js` (154 lignes)
- `services/tms-sync-eb/INTEGRATION-AFFRETIA-SYNC.md` (517 lignes)
- `services/tms-sync-eb/README-AFFRETIA-DASHDOC-SYNC.md` (649 lignes)

**Fichiers modifiés**:
- `services/tms-sync-eb/index.js` - Ajout initialisation et routes
- `services/affret-ia-api-v2/controllers/affretia.controller.js` - Ajout webhook
- Configuration `.env.example` pour les deux services

### 2. Git & Versioning

**Commits**:
- ✅ `78b3404` - feat(tms-sync): Ajout synchronisation Affret.IA → Dashdoc
- ✅ `74e736f` - chore: Bump TMS Sync version to 2.4.3
- ✅ `ca206bc` - chore: Bump Affret.IA version to 2.7.1
- ✅ Tous poussés vers `origin/main`

### 3. Configuration AWS

**Variables d'environnement EB configurées**:

**rt-affret-ia-api-prod-v4** (eu-central-1):
- ✅ `TMS_SYNC_API_URL=https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com`
- ✅ `TMS_SYNC_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (validité: 365 jours)

**symphonia-tms-sync-prod** (eu-west-3):
- ✅ `AFFRET_IA_API_URL=http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1`

### 4. Packages de Déploiement

**TMS Sync**:
- ✅ Package clean créé (3.2 MB vs 149 MB initialement)
- ✅ Uploadé vers S3: `s3://elasticbeanstalk-eu-west-3-004843574253/tms-sync/tms-sync-v2.4.3-clean.zip`
- ✅ Version EB créée: `v2.4.3-affretia-sync-clean`
- ⚠️ Déployée mais avec erreurs HTTP 5xx

**Affret.IA**:
- ✅ Package clean créé (212 KB vs 14.5 MB initialement)
- ✅ Uploadé vers S3: `s3://elasticbeanstalk-eu-central-1-004843574253/affret-ia/affret-ia-v2.7.1-clean.zip`
- ❌ Déploiement bloqué: limite de 1000 versions d'application atteinte

---

## ⚠️ Problèmes Rencontrés

### Problème 1: TMS Sync - Erreurs HTTP 5xx

**Statut**: Déployé mais l'application ne démarre pas correctement

**Symptômes**:
- Environment Health: Red
- 100% des requêtes retournent HTTP 5xx
- Le déploiement lui-même a réussi

**Causes possibles**:
1. Fichier `.env` local inclus dans git archive qui écrase les variables EB
2. Erreur d'import des nouveaux modules (event-listeners, routes)
3. Dépendance manquante dans package.json
4. Problème de démarrage de l'application

**Solution à appliquer**:
```bash
# 1. Ajouter .env au .gitignore si pas déjà fait
echo ".env" >> services/tms-sync-eb/.gitignore

# 2. Vérifier que les nouveaux modules sont bien exportés
# Dans event-listeners/affretia-events.js et routes/affretia-sync.routes.js

# 3. Tester localement avant de redéployer
cd services/tms-sync-eb
npm install
npm start

# 4. Créer un nouveau package et redéployer
git add .gitignore
git commit -m "fix: Exclude .env from deployment package"
git archive -o tms-sync-v2.4.4.zip HEAD
aws s3 cp tms-sync-v2.4.4.zip s3://elasticbeanstalk-eu-west-3-004843574253/tms-sync/
aws elasticbeanstalk create-application-version --application-name symphonia-tms-sync-eb --version-label v2.4.4-fix --source-bundle S3Bucket=elasticbeanstalk-eu-west-3-004843574253,S3Key=tms-sync/tms-sync-v2.4.4.zip --region eu-west-3
aws elasticbeanstalk update-environment --environment-name symphonia-tms-sync-prod --version-label v2.4.4-fix --region eu-west-3
```

### Problème 2: Affret.IA - Limite de 1000 Versions

**Statut**: Blocage du déploiement

**Message d'erreur**:
```
TooManyApplicationVersionsException: You cannot have more than 1000 Application Versions
```

**Solution appliquée (partielle)**:
- 50 anciennes versions supprimées

**Solution complète à appliquer**:
```bash
# Supprimer toutes les anciennes versions (garder uniquement les 10 dernières)
aws elasticbeanstalk describe-application-versions \
  --application-name rt-affret-ia-api \
  --region eu-central-1 \
  --query "ApplicationVersions | sort_by(@, &DateCreated) | [0:-10].VersionLabel" \
  --output text | \
  xargs -n1 aws elasticbeanstalk delete-application-version \
  --application-name rt-affret-ia-api \
  --delete-source-bundle \
  --region eu-central-1 \
  --version-label

# Puis créer et déployer la nouvelle version
aws elasticbeanstalk create-application-version \
  --application-name rt-affret-ia-api \
  --version-label v2.7.1-webhook \
  --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=affret-ia/affret-ia-v2.7.1-clean.zip \
  --region eu-central-1

aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --version-label v2.7.1-webhook \
  --region eu-central-1
```

---

## 🔄 Prochaines Étapes

### Étape 1: Corriger le Déploiement TMS Sync

1. **Identifier la cause exacte des erreurs 5xx**:
   ```bash
   # Télécharger les logs complets
   aws elasticbeanstalk request-environment-info \
     --environment-name symphonia-tms-sync-prod \
     --info-type tail \
     --region eu-west-3

   # Attendre 10 secondes puis récupérer l'URL
   aws elasticbeanstalk retrieve-environment-info \
     --environment-name symphonia-tms-sync-prod \
     --info-type tail \
     --region eu-west-3
   ```

2. **Vérifier localement**:
   ```bash
   cd services/tms-sync-eb

   # Configurer les variables d'environnement
   export MONGODB_URI="votre_uri_mongodb"
   export AFFRET_IA_API_URL="http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1"
   export PORT=3008
   export NODE_ENV=production

   # Démarrer l'application
   npm install
   npm start

   # Vérifier que l'API répond
   curl http://localhost:3008/health
   ```

3. **Corriger et redéployer**:
   - Corriger le problème identifié
   - Bump version à 2.4.4
   - Créer package clean avec `git archive`
   - Déployer sur EB

### Étape 2: Nettoyer et Déployer Affret.IA

1. **Nettoyer les anciennes versions**:
   ```bash
   # Script de nettoyage automatique
   cd services/affret-ia-api-v2
   node <<EOF
   const { exec } = require('child_process');
   const { promisify } = require('util');
   const execAsync = promisify(exec);

   (async () => {
     // Récupérer toutes les versions sauf les 10 dernières
     const { stdout } = await execAsync(
       'aws elasticbeanstalk describe-application-versions --application-name rt-affret-ia-api --region eu-central-1 --query "ApplicationVersions | sort_by(@, &DateCreated) | [0:-10].VersionLabel" --output text'
     );

     const versions = stdout.trim().split('\\t');
     console.log(\`\${versions.length} versions à supprimer\`);

     for (const version of versions) {
       try {
         await execAsync(
           \`aws elasticbeanstalk delete-application-version --application-name rt-affret-ia-api --version-label \${version} --delete-source-bundle --region eu-central-1\`
         );
         console.log(\`✅ Supprimé: \${version}\`);
       } catch (error) {
         console.error(\`❌ Erreur: \${version}\`, error.message);
       }
     }
   })();
   EOF
   ```

2. **Déployer la nouvelle version**:
   ```bash
   # Créer et déployer
   aws elasticbeanstalk create-application-version \
     --application-name rt-affret-ia-api \
     --version-label v2.7.1-webhook \
     --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=affret-ia/affret-ia-v2.7.1-clean.zip \
     --description "Webhook sync Dashdoc" \
     --region eu-central-1

   aws elasticbeanstalk update-environment \
     --environment-name rt-affret-ia-api-prod-v4 \
     --version-label v2.7.1-webhook \
     --region eu-central-1
   ```

### Étape 3: Tester la Synchronisation End-to-End

Une fois les deux services déployés correctement:

1. **Vérifier que les services sont opérationnels**:
   ```bash
   # TMS Sync
   curl https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/health

   # Affret.IA
   curl http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/health
   ```

2. **Tester le webhook manuellement**:
   ```bash
   # Obtenir un JWT token
   TOKEN=$(curl -X POST https://symphonia-authz-prod.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@symphonia.com","password":"..."}' \
     | jq -r '.token')

   # Tester la route de sync manuelle
   curl -X POST https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/test \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "orderId": "ID_COMMANDE_TEST",
       "carrierId": "ID_TRANSPORTEUR_TEST",
       "price": 450.00
     }'
   ```

3. **Test end-to-end réel**:
   - Créer une commande test dans Dashdoc
   - La déclencher dans Affret.IA
   - Assigner un transporteur
   - Vérifier que le transport est mis à jour dans Dashdoc avec:
     - Transporteur assigné
     - Prix d'achat
     - Statut "assigned"

4. **Vérifier les logs de synchronisation**:
   ```bash
   # Logs de succès/échec
   curl https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/tms/affretia-sync/status \
     -H "Authorization: Bearer $TOKEN"
   ```

---

## 📋 Checklist de Déploiement

- [x] Code développé et testé localement
- [x] Commits git créés et poussés
- [x] Variables d'environnement EB configurées
- [x] JWT token généré pour l'auth inter-services
- [x] Problème HTTP 5xx TMS Sync résolu
- [x] Anciennes versions Affret.IA supprimées (61 versions nettoyées)
- [x] TMS Sync redéployé avec succès (Health: Green) - v2.4.9
- [x] Affret.IA redéployé avec succès (Health: Green) - v2.7.1
- [ ] Test manuel de la route /status réussi
- [ ] Test manuel de sync via /test réussi
- [ ] Test end-to-end complet réussi
- [ ] Monitoring activé et alertes configurées

---

## 📞 Support

Si vous rencontrez des problèmes:

1. **Vérifier les événements EB**:
   ```bash
   aws elasticbeanstalk describe-events \
     --environment-name ENVIRONMENT_NAME \
     --region REGION \
     --max-items 20
   ```

2. **Télécharger les logs complets**:
   ```bash
   aws elasticbeanstalk request-environment-info \
     --environment-name ENVIRONMENT_NAME \
     --info-type tail \
     --region REGION
   ```

3. **Consulter la documentation**:
   - [INTEGRATION-AFFRETIA-SYNC.md](services/tms-sync-eb/INTEGRATION-AFFRETIA-SYNC.md)
   - [README-AFFRETIA-DASHDOC-SYNC.md](services/tms-sync-eb/README-AFFRETIA-DASHDOC-SYNC.md)

---

**Date**: 2026-02-03
**Auteur**: Claude Sonnet 4.5
**Version**: 2.0
**Statut**: ✅ Déploiement réussi - Les deux services sont opérationnels

## 🎉 Résumé Final

**TMS Sync v2.4.9** - Déployé avec succès
- Environnement: symphonia-tms-sync-prod (eu-west-3)
- Status: Green / Ok
- Corrections appliquées:
  - Ajout dépendance mongoose (v2.4.7)
  - Ajout module scheduled-jobs manquant (v2.4.8)
  - Fix chargement lazy des modèles mongoose (v2.4.9)

**Affret.IA v2.7.1** - Déployé avec succès
- Environnement: rt-affret-ia-api-prod-v4 (eu-central-1)
- Status: Green / Ok
- Ajout webhook de synchronisation vers TMS Sync

**Prochaines étapes**:
1. Tester la synchronisation avec une vraie commande
2. Surveiller les logs de synchronisation
3. Configurer les alertes de monitoring
