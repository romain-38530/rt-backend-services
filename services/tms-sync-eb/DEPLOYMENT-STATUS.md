# Statut du Déploiement TMS Sync v2.1.5

**Date**: 2026-01-25
**Environnement**: rt-tms-sync-api-v2
**URL**: https://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com

---

## ✅ Modifications Implémentées en Local

Toutes les fonctionnalités suivantes fonctionnent parfaitement en local:

### 1. Filtre "À planifier" (toPlan)
- **Fichier**: [index.js:491-503](index.js#L491-L503)
- **Paramètre**: `?toPlan=true`
- **Fonction**: Retourne uniquement les commandes DRAFT et PENDING (statuts "À planifier")

### 2. Exclusion automatique des commandes annulées
- **Fichier**: [connectors/dashdoc.connector.js:428-434](connectors/dashdoc.connector.js#L428-L434)
- **Fonction**: Exclut automatiquement les commandes `cancelled` et `declined` lors de l'importation

### 3. Pagination automatique
- **Fichier**: [connectors/dashdoc.connector.js:99-128](connectors/dashdoc.connector.js#L99-L128)
- **Fonction**: Récupère toutes les commandes Dashdoc sans limite de 100

### 4. Synchronisation automatique 30s
- **Fichier**: [scheduled-jobs.js](scheduled-jobs.js)
- **Fonction**: Synchronise toutes les connexions actives toutes les 30 secondes pour Affret.IA

### 5. Support dotenv
- **Fichier**: [index.js:19](index.js#L19)
- **Fonction**: Charge les variables d'environnement depuis .env

---

## ✅ Variables d'Environnement Configurées sur AWS

Les variables d'environnement ont été mises à jour avec succès sur AWS Elastic Beanstalk:

```bash
MONGODB_URI=mongodb+srv://rt-technologie:RT2024Transport@cluster-symphonia.mongodb.net/rt-tms-sync?retryWrites=true&w=majority
NODE_ENV=production
CORS_ORIGIN=https://app.symphonia.fr,https://admin.symphonia.fr,https://backoffice.symphonia.fr
```

**Cluster MongoDB**: `cluster-symphonia.mongodb.net`
**Database**: `rt-tms-sync`
**User**: `rt-technologie`

---

## ❌ Problème de Déploiement

### Symptômes
Tous les déploiements échouent avec:
```
ERROR: Instance deployment failed. For details, see 'eb-engine.log'.
ERROR: Your source bundle has issues that caused the deployment to fail.
```

L'environnement fait automatiquement un rollback vers `v2.1.4` (l'ancienne version).

### Tentatives de Déploiement

| Version | Taille | Statut | Erreur |
|---------|--------|--------|--------|
| v2.1.5-toPlan-filter | 24.8 KB | ❌ Failed | Backslashes dans ZIP |
| v2.1.5-toPlan-filter-clean | 18.3 KB | ❌ Failed | Backslashes dans ZIP |
| v2.1.5-final | 18.4 KB | ❌ Failed | Source bundle issues |

### Packages S3
- ✅ `deploy-v2.1.5.zip` - Uploadé mais échec (backslashes)
- ✅ `deploy-v2.1.5-clean.zip` - Uploadé mais échec (backslashes)
- ✅ `deploy-v2.1.5-final.zip` - Uploadé mais échec (source bundle)

### Contenu du Package (v2.1.5-final)
```
.ebignore
connectors/
  - dashdoc.connector.js
index.js
package.json
Procfile
scheduled-jobs.js
services/
  - tms-connection.service.js
```

### Version Actuelle (v2.1.4 - Fonctionne)
```
index.js (version basique, 2.4 KB)
package.json
Procfile
```

Pas de dossiers `connectors/` ni `services/`.

---

## 🔍 Analyse du Problème

### Hypothèses Testées

1. ✅ **Backslashes Windows dans ZIP**
   → Résolu en utilisant System.IO.Compression.FileSystem (compatible Linux)

2. ✅ **Procfile manquant**
   → Ajouté au package

3. ⚠️ **npm install échoue sur le serveur**
   → Probable cause actuelle
   → Pas de package-lock.json (car projet uses pnpm workspaces)
   → Peut-être incompatibilité de versions des dépendances

4. ❓ **Dépendances dotenv**
   → dotenv est listée dans package.json
   → Mais peut-être qu'elle n'arrive pas à s'installer sur AWS

5. ❓ **Structure de dossiers**
   → La version qui fonctionne (v2.1.4) n'a pas de sous-dossiers
   → Ma version a connectors/ et services/

---

## 📋 Prochaines Étapes Recommandées

### Option 1: Vérifier les Logs Détaillés
```bash
# Récupérer les logs complets depuis la console AWS
aws elasticbeanstalk request-environment-info \
  --environment-name rt-tms-sync-api-v2 \
  --info-type bundle \
  --region eu-central-1

# Attendre 30 secondes puis récupérer
aws elasticbeanstalk retrieve-environment-info \
  --environment-name rt-tms-sync-api-v2 \
  --info-type bundle \
  --region eu-central-1
```

Cela donnera accès à `eb-engine.log` qui contient l'erreur exacte.

### Option 2: Tester avec node_modules Inclus
Créer un package avec node_modules pré-installés (comme v2.0.x):
```powershell
# Installer les dépendances
cd services\tms-sync-eb
npm install --production

# Créer le package avec node_modules
Compress-Archive -Path index.js,package.json,Procfile,connectors,services,scheduled-jobs.js,node_modules -DestinationPath deploy-with-modules.zip
```

**Avantage**: Évite npm install sur le serveur
**Inconvénient**: Package très gros (~3 MB)

### Option 3: Simplifier l'Architecture
Fusionner tout le code dans un seul fichier index.js (comme v2.1.4):
- Copier le contenu de connectors/dashdoc.connector.js dans index.js
- Copier le contenu de services/tms-connection.service.js dans index.js
- Copier le contenu de scheduled-jobs.js dans index.js

**Avantage**: Structure simple qui fonctionne
**Inconvénient**: Code moins maintenable

### Option 4: Vérifier MongoDB Atlas
Le cluster `cluster-symphonia.mongodb.net` n'est pas accessible depuis ton PC local:
```
Error: querySrv ECONNREFUSED _mongodb._tcp.cluster-symphonia.mongodb.net
```

**Actions**:
1. Aller sur https://cloud.mongodb.com
2. Vérifier que le cluster n'est pas pausé
3. Vérifier que l'IP whitelist contient `0.0.0.0/0` (ou les IPs d'AWS)
4. Vérifier que les credentials sont corrects

### Option 5: Déployer via Console AWS
1. Aller sur https://eu-central-1.console.aws.amazon.com/elasticbeanstalk
2. Sélectionner l'application `rt-api-tms-sync`
3. Uploader manuellement `deploy-v2.1.5-final.zip`
4. Observer les logs en temps réel dans la console

---

## 📊 Résumé

| Composant | Statut | Notes |
|-----------|--------|-------|
| Code Local | ✅ Fonctionnel | Toutes les fonctionnalités testées |
| MongoDB Local | ✅ Connecté | Docker: localhost:27017 |
| Service Local | ✅ Running | Port 3000, sync 30s active |
| Vars ENV AWS | ✅ Configured | MongoDB Atlas URI set |
| Package ZIP | ✅ Créé | Compatible Linux, tous les fichiers |
| Déploiement AWS | ❌ Échec | npm install fails (probable) |
| MongoDB Atlas | ⚠️ Inaccessible | Depuis PC local |

---

## 🛠️ Commandes Utiles

### Vérifier le Statut
```bash
aws elasticbeanstalk describe-environments \
  --environment-names rt-tms-sync-api-v2 \
  --region eu-central-1 \
  --query "Environments[0].[Status,Health,VersionLabel]"
```

### Récupérer les Événements
```bash
aws elasticbeanstalk describe-events \
  --environment-name rt-tms-sync-api-v2 \
  --region eu-central-1 \
  --max-items 10
```

### Redéployer une Version
```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-tms-sync-api-v2 \
  --version-label v2.1.5-final \
  --region eu-central-1
```

### Rollback Vers v2.1.4
```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-tms-sync-api-v2 \
  --version-label v2.1.4 \
  --region eu-central-1
```

---

## 📞 Support

**Version Actuelle en Production**: v2.1.4 (ancienne version sans les nouvelles fonctionnalités)
**Dernière Tentative**: v2.1.5-final (échec)
**Prochaine Action**: Vérifier les logs eb-engine.log ou tester Option 2 (inclure node_modules)

---

**Fichiers Créés**:
- [create-package.ps1](create-package.ps1) - Script pour créer le package de déploiement
- [.ebignore](.ebignore) - Fichiers à exclure du package
- [.env.example](.env.example) - Template des variables d'environnement
- [update-env.json](update-env.json) - Variables ENV pour AWS
- [README-IMPLEMENTATION.md](README-IMPLEMENTATION.md) - Documentation complète

**Logs**:
- [deployment-logs.txt](deployment-logs.txt) - Logs du premier déploiement échoué
