# Rapport de Problème: Déploiement v2.7.0 Affret.IA

**Date**: 2026-02-02
**Version**: 2.7.0
**Statut**: ❌ Blocage déploiement AWS Elastic Beanstalk

---

## Résumé Exécutif

Le code **v2.7.0 - Pricing & Market Intelligence** a été développé avec succès et **fonctionne parfaitement en local**, mais **échoue systématiquement sur AWS Elastic Beanstalk**. Le service Node.js refuse de démarrer, rendant impossible le déploiement en production.

---

## Fonctionnalités Développées ✅

### Nouveaux Fichiers

1. **`models/PriceHistory.js`** (327 lignes)
   - Modèle MongoDB pour historique des prix
   - Indexes optimisés sur route, dates, carrierId
   - Méthodes: `getRouteHistory()`, `getAveragePrice()`, `getCarrierAverages()`, `recordPrice()`

2. **`services/pricing.service.js`** (410 lignes)
   - Intégration Dashdoc API v4
   - Calcul prix marché et prix cible
   - Recherche transporteurs avec scraping
   - Priorisation sous-traitants référencés

3. **`scripts/import-dashdoc-history.js`** (130 lignes)
   - CLI pour import historique Dashdoc
   - Options: --months, --org-id, --dry-run

4. **`docs/PRICING-API.md`** (450 lignes)
   - Documentation complète API
   - Exemples request/response
   - Guide intégration Dashdoc

### Nouveaux Endpoints REST

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/v1/affretia/price-history` | POST | Récupérer historique prix pour une ligne |
| `/api/v1/affretia/preferred-subcontractors` | GET | Lister sous-traitants préférés |
| `/api/v1/affretia/search-carriers` | POST | Rechercher transporteurs disponibles |
| `/api/v1/affretia/record-price` | POST | Enregistrer prix négocié |
| `/api/v1/affretia/import/dashdoc` | POST | Importer historique Dashdoc |
| `/api/v1/affretia/calculate-target-price` | POST | Calculer prix cible négociation |

### Modifications Existantes

- **`controllers/affretia.controller.js`**: +208 lignes (6 nouvelles fonctions)
- **`routes/affretia.routes.js`**: +45 lignes (6 nouvelles routes)
- **`package.json`**: Version 2.7.0
- **`.env.example`**: Variables Dashdoc et pricing

---

## Tests Effectués ✅

### Tests Locaux (Windows)

```bash
# Syntaxe JavaScript
✓ node -c index.js
✓ node -c models/PriceHistory.js
✓ node -c services/pricing.service.js
✓ node -c controllers/affretia.controller.js

# Exécution locale
✓ PORT=8080 node index.js
  [AFFRET.IA API v2] Running on port 8080
  [MONGODB] Connected

# Test endpoints
✓ curl http://localhost:8080/
  {"success":true,"service":"AFFRET.IA API v2","version":"2.7.0"...}

✓ curl http://localhost:8080/health
  {"success":true,"mongodb":"connected","uptime":...}
```

**Conclusion**: Le code fonctionne **parfaitement en local**.

---

## Problème de Déploiement ❌

### Symptôme Principal

```
HealthStatus: Severe
Causes: "Following services are not running: web."
Nginx Error: connect() failed (111: Connection refused) while connecting to upstream
```

Le service Node.js **ne démarre pas du tout** sur Elastic Beanstalk.

### Tentatives de Résolution

#### Tentative 1: Upgrade Instance
- **Action**: t3.micro (1GB) → t3.small (2GB RAM)
- **Résultat**: ❌ Échec (même erreur)

#### Tentative 2: Health Check Endpoints
- **Action**: Ajout `/` et `/health` endpoints
- **Résultat**: ❌ Échec (même erreur)

#### Tentative 3: Configuration EB (.ebextensions)
- **Action**: Ajout `01_app_config.config` avec health check path
- **Résultat**: ❌ Échec (erreurs de validation)

#### Tentative 4: Procfile Modification
- **Action**: `web: node index.js` → `web: npm start`
- **Résultat**: ❌ Échec (même erreur)

#### Tentative 5: Déploiement Progressif
- **Action**: Déployer uniquement modèle `PriceHistory.js` sans service/controller
- **Résultat**: ❌ Échec (même erreur)

#### Tentative 6: Nouvel Environnement EB
- **Action**: Créer `rt-affret-ia-api-prod-v27` complètement neuf
- **Résultat**: ❌ Échec (même erreur)

### Logs Collectés

```
CloudWatch: /aws/elasticbeanstalk/rt-affret-ia-api-prod-v27/var/log/web.stdout.log
Status: Vide (aucun log)

CloudWatch: /aws/elasticbeanstalk/rt-affret-ia-api-prod-v27/var/log/nginx/error.log
[error] connect() failed (111: Connection refused) while connecting to upstream
upstream: "http://127.0.0.1:8080/health"
```

Le processus Node.js **ne génère AUCUN log**, ce qui suggère qu'il **ne démarre même pas**.

---

## Environnement de Production Actuel

### Configuration Stable

- **Version déployée**: v2.6.1-axios
- **Statut**: ✅ GREEN (fonctionnel)
- **Instance**: t3.small (2GB RAM)
- **Platform**: Node.js 20 on Amazon Linux 2023
- **CNAME**: rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com

### Variables d'Environnement

```bash
NODE_ENV=production
PORT=8080
MONGODB_URI=mongodb+srv://stagingrt.v2jnoh2.mongodb.net/rt-affret-ia
JWT_SECRET=<configured>
AWS_REGION=eu-central-1
CARRIERS_API_URL=http://rt-carriers-api-prod.eba-...
ORDERS_API_URL=http://rt-orders-api-prod-v2.eba-...
PRICING_API_URL=http://rt-pricing-grids-api-prod.eba-...
```

---

## Analyse Technique

### Hypothèses Éliminées ❌

1. ~~Problème de mémoire (t3.micro)~~ → Testé avec t3.small
2. ~~Health check manquant~~ → Endpoints ajoutés
3. ~~Configuration EB incorrecte~~ → Testé sans .ebextensions
4. ~~Dépendances manquantes~~ → package.json inchangé (mêmes dépendances que v2.6.1)
5. ~~Erreur syntaxe JavaScript~~ → Vérifié avec `node -c`
6. ~~Problème environnement existant~~ → Testé sur nouvel environnement

### Hypothèses Restantes ⚠️

1. **Conflit de versions Node.js/dépendances**
   - Même si package.json est identique, une dépendance pourrait avoir un comportement différent
   - À investiguer: Tester avec `npm ci` au lieu de `npm install` sur EB

2. **Timeout au démarrage trop court**
   - L'application pourrait mettre plus de temps à démarrer avec les nouveaux modules
   - À investiguer: Augmenter timeout EB

3. **Problème de permissions fichiers**
   - Les nouveaux fichiers pourraient avoir des permissions incorrectes sur EB
   - À investiguer: Vérifier permissions dans le ZIP

4. **Problème de chargement module MongoDB**
   - PriceHistory.js utilise mongoose 8.0.3 avec des fonctionnalités avancées
   - À investiguer: Tester avec une version plus simple du modèle

5. **Problème AWS IAM/Credentials**
   - Les nouveaux services pourraient nécessiter des permissions AWS supplémentaires
   - À investiguer: Vérifier IAM role permissions

---

## Solutions Recommandées

### Solution 1: Investigation SSH ⭐ (Recommandé)
Se connecter directement sur l'instance EC2 pour voir les logs Node.js.

```bash
# Activer SSH sur l'environnement EB
aws elasticbeanstalk update-environment \
  --environment-name rt-affret-ia-api-prod-v4 \
  --option-settings Namespace=aws:autoscaling:launchconfiguration,OptionName=EC2KeyName,Value=<key-name>

# Connexion SSH
ssh ec2-user@<instance-ip>

# Voir logs Node.js
sudo tail -f /var/log/nodejs/nodejs.log
sudo tail -f /var/log/eb-engine.log

# Tester manuellement
cd /var/app/current
node index.js
```

### Solution 2: Docker/ECS ⭐⭐
Déployer sur AWS ECS avec Docker pour avoir plus de contrôle.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "index.js"]
```

### Solution 3: Déploiement Incrémental
Ajouter les fonctionnalités v2.7.0 **une par une** à v2.6.1.

1. Ajouter `PriceHistory.js` (sans références)
2. Si OK, ajouter `pricing.service.js`
3. Si OK, ajouter controllers
4. Si OK, ajouter routes

### Solution 4: Environnement de Développement EB
Créer un environnement EB de **développement** séparé pour débugger v2.7.0.

---

## Code Committé ✅

Le code v2.7.0 complet est disponible sur Git:

```
Commit: 7088bc5
Branch: main
Message: "feat(affret-ia): Add v2.7.0 Pricing & Market Intelligence + Dashdoc integration"
Files: 7 changed, 1498 insertions(+)
```

---

## Configuration Variables Dashdoc (À ajouter après déploiement réussi)

```bash
# Dashdoc API
DASHDOC_API_KEY=<à obtenir>
DASHDOC_API_URL=https://api.dashdoc.com/api/v4

# Pricing
PRICING_DEFAULT_PERIOD=last_6_months
PRICING_MIN_TRANSPORTS_PREFERRED=3
PRICING_ACCEPTABLE_RANGE_PERCENT=10
PRICING_MIN_CONFIDENCE_SCORE=50

# Features
FEATURE_DASHDOC_IMPORT=true
FEATURE_AUTO_NEGOTIATION=true
FEATURE_SUBCONTRACTOR_PRIORITY=true
FEATURE_MARKET_PRICING=true
```

---

## Prochaines Étapes

1. **Investigation SSH** (1-2h)
   - Se connecter sur instance EB
   - Lire logs `/var/log/nodejs/nodejs.log`
   - Identifier erreur exacte au démarrage

2. **Alternative Docker** (4-6h)
   - Créer Dockerfile
   - Déployer sur AWS ECS/Fargate
   - Tester en environnement conteneurisé

3. **Support AWS** (24-48h)
   - Ouvrir ticket AWS Support
   - Fournir logs et configuration
   - Obtenir assistance EB spécialisée

---

## Contact & Documentation

- **Code Source**: `services/affret-ia-api-v2/`
- **Documentation API**: `docs/PRICING-API.md`
- **Scripts Déploiement**: `deploy-v2.7.0-simple.ps1`
- **Notes**: `DEPLOY-NOTES.md`
