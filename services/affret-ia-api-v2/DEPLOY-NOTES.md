# Notes de Déploiement v2.7.0

## Problème Identifié

Le service web Node.js ne démarre pas sur AWS Elastic Beanstalk avec la version v2.7.0.

**Symptômes**:
- Status: Red
- Nginx error: "Connection refused" sur http://127.0.0.1:8080
- Message: "Following services are not running: web"
- L'application fonctionne localement sans problème

**Fichiers nouveaux ajoutés dans v2.7.0**:
- `models/PriceHistory.js` (7.1 KB)
- `services/pricing.service.js` (14.5 KB)
- `scripts/import-dashdoc-history.js` (nouveau)
- `docs/PRICING-API.md` (documentation)
- Modifications dans `controllers/affretia.controller.js`
- Modifications dans `routes/affretia.routes.js`

**Tests effectués**:
- ✅ Code valide localement (node index.js fonctionne sur port 8080)
- ✅ Connexion MongoDB réussie
- ✅ Tous les modules se chargent correctement en local
- ✅ Syntaxe JavaScript valide (node -c)
- ❌ Déploiement EB bloque au démarrage du service

**Hypothèses à explorer**:
1. Problème de dépendances Node.js manquantes sur EB
2. Timeout trop court au démarrage
3. Conflit de routes Express
4. Problème mémoire (t3.micro = 1GB RAM)

## Solution Recommandée

Déployer une version progressive :
1. Ajouter uniquement les modèles (PriceHistory.js)
2. Si OK, ajouter le service (pricing.service.js)
3. Si OK, ajouter les controllers
4. Si OK, ajouter les routes

Cela permettra d'identifier exactement quel fichier cause le blocage.

## Environnement Actuel

- Version déployée: **v2.6.1-axios** (STABLE - GREEN)
- Platform: Node.js 20 on Amazon Linux 2023
- Instance: t3.micro
- MongoDB: mongodb+srv://stagingrt.v2jnoh2.mongodb.net/rt-affret-ia

## Variables d'environnement à configurer après déploiement réussi

```bash
DASHDOC_API_KEY=<à configurer>
DASHDOC_API_URL=https://api.dashdoc.com/api/v4
PRICING_DEFAULT_PERIOD=last_6_months
PRICING_MIN_TRANSPORTS_PREFERRED=3
PRICING_ACCEPTABLE_RANGE_PERCENT=10
```
