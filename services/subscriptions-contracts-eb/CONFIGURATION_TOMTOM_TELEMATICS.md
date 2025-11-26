# Configuration TomTom Telematics API
## Guide Complet - RT SYMPHONI.A Tracking Premium

---

## Table des Matières

1. [Présentation](#présentation)
2. [Coûts et Tarification](#coûts-et-tarification)
3. [Prérequis](#prérequis)
4. [Création du Compte TomTom](#création-du-compte-tomtom)
5. [Obtention de l'API Key](#obtention-de-lapi-key)
6. [Configuration AWS Elastic Beanstalk](#configuration-aws-elastic-beanstalk)
7. [Variables d'Environnement](#variables-denvironnement)
8. [Tests de Validation](#tests-de-validation)
9. [Validation avec 5 Véhicules](#validation-avec-5-véhicules)
10. [Monitoring et Alertes](#monitoring-et-alertes)
11. [Dépannage](#dépannage)

---

## Présentation

### Objectif

TomTom Telematics API permet de débloquer l'**offre Premium** de RT SYMPHONI.A avec tracking GPS temps réel pour les véhicules.

### Fonctionnalités Activées

- **Tracking GPS temps réel** : Position en direct des véhicules
- **Calcul d'itinéraires optimisés** : Routes avec prise en compte du trafic
- **ETA précis** : Temps d'arrivée estimé avec trafic en temps réel
- **Détection de retards** : Alertes automatiques si retard prévu
- **Géocodage avancé** : Conversion adresses ↔ coordonnées GPS
- **Informations trafic** : État du trafic sur les routes

### Architecture

```
┌─────────────────────┐
│  Frontend Client    │
│   (Dispatchers)     │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│   AWS Elastic       │
│   Beanstalk API     │
│ (subscriptions-eb)  │
└──────────┬──────────┘
           │ HTTPS
           ▼
┌─────────────────────┐
│   TomTom API        │
│ api.tomtom.com      │
└─────────────────────┘
```

---

## Coûts et Tarification

### Modèle de Tarification

| Offre | Service | Coût Unitaire | Volume Test (5 véhicules) | Coût Mensuel Estimé |
|-------|---------|---------------|---------------------------|---------------------|
| **Tracking Premium** | TomTom Telematics | **4€/véhicule/mois** | 5 véhicules | **20€/mois** |
| Calcul d'itinéraire | TomTom Routing API | Inclus dans API Key | Illimité* | Inclus |
| Géocodage | TomTom Search API | Inclus dans API Key | Illimité* | Inclus |
| Trafic temps réel | TomTom Traffic API | Inclus dans API Key | Illimité* | Inclus |

**Note** : *Limites selon le plan souscrit (voir détails ci-dessous)

### Plans TomTom Developer

| Plan | Prix | Requêtes/jour | Requêtes/mois | Recommandation |
|------|------|---------------|---------------|----------------|
| **Free Tier** | 0€/mois | 2,500 | ~75,000 | ✅ **Parfait pour 5 véhicules test** |
| **Pay-as-you-go** | Variable | Illimité | Illimité | Pour production >20 véhicules |
| **Enterprise** | Sur devis | Illimité | Illimité | Pour flottes >100 véhicules |

### Calcul des Besoins pour 5 Véhicules

Hypothèse : 5 véhicules, tracking toutes les 5 minutes, 10h/jour, 22 jours/mois

```
Calcul :
- Positions GPS : 5 véhicules × 12 positions/h × 10h × 22j = 13,200 requêtes/mois
- Calcul ETA : 5 véhicules × 20 calculs/jour × 22j = 2,200 requêtes/mois
- Géocodage : ~500 requêtes/mois
─────────────────────────────────────────────────────────────────
TOTAL : ~16,000 requêtes/mois
```

**✅ Verdict : Le plan GRATUIT de TomTom (75,000 requêtes/mois) est largement suffisant**

### Coût Réel pour Production

Pour une flotte de **50 véhicules** en production :

```
- Coût TomTom : 4€ × 50 = 200€/mois
- Requêtes estimées : ~160,000/mois
- Plan recommandé : Pay-as-you-go (~0.0005€/requête) = ~80€/mois
─────────────────────────────────────────────────────────────────
TOTAL : 280€/mois pour 50 véhicules
```

---

## Prérequis

### Comptes Nécessaires

- [ ] Compte TomTom Developer (gratuit)
- [ ] Accès AWS Elastic Beanstalk (rt-subscriptions-api-prod)
- [ ] Accès administrateur à la console AWS

### Outils Requis

- Navigateur web moderne
- AWS CLI (optionnel, recommandé)
- EB CLI (optionnel, pour déploiements automatisés)

---

## Création du Compte TomTom

### Étape 1 : Inscription

1. **Accédez au portail développeur TomTom** :
   ```
   https://developer.tomtom.com/
   ```

2. **Cliquez sur "Get Started for Free"** (en haut à droite)

3. **Remplissez le formulaire d'inscription** :
   ```
   - Email : votre-email@rt-group.com
   - Nom : Votre Nom
   - Société : RT Group / RT SYMPHONI.A
   - Pays : France
   - Cas d'usage : Fleet Management / Route Optimization
   ```

4. **Vérifiez votre email** :
   - Vous recevrez un email de confirmation
   - Cliquez sur le lien de validation
   - Votre compte est maintenant actif

### Étape 2 : Configuration du Profil

1. **Connectez-vous** : https://developer.tomtom.com/user/login

2. **Complétez votre profil** :
   - Allez dans "My Account" → "Profile"
   - Ajoutez les informations de facturation (si nécessaire)
   - Sélectionnez le plan "Free Tier" pour commencer

### Capture d'écran - Inscription

```
┌────────────────────────────────────────────┐
│  TomTom Developer Portal                   │
│  ─────────────────────────────────────     │
│                                            │
│  Create your free account                 │
│                                            │
│  Email: [_____________________]            │
│  Password: [_____________________]         │
│  Company: [RT SYMPHONI.A Transport______]  │
│  Country: [France           ▼]            │
│                                            │
│  Use case: Fleet Management ☑              │
│                                            │
│  [Create Account]                          │
└────────────────────────────────────────────┘
```

---

## Obtention de l'API Key

### Méthode 1 : Via le Dashboard (Recommandé)

1. **Accédez au Dashboard** :
   ```
   https://developer.tomtom.com/user/me/apps
   ```

2. **Créez une nouvelle application** :
   - Cliquez sur "Create a New App"
   - Nom : `RT-SYMPHONIA-Tracking-Premium`
   - Description : `GPS Tracking for RT SYMPHONI.A Transport Management System`

3. **Configurez les services** :
   - Cochez les services suivants :
     - ✅ **Routing API** (calcul d'itinéraires)
     - ✅ **Search API** (géocodage)
     - ✅ **Traffic API** (informations trafic)
     - ✅ **Maps API** (optionnel, pour affichage)

4. **Générez l'API Key** :
   - Cliquez sur "Create"
   - Votre API Key s'affiche : `YOUR-API-KEY-HERE`
   - **Format** : `abcdef123456789012345678901234567890`

5. **Copiez et sauvegardez l'API Key** :
   ```bash
   # Sauvegardez immédiatement dans un endroit sécurisé
   # ATTENTION : Cette clé ne sera affichée qu'une seule fois !
   ```

### Méthode 2 : Via l'API (Avancé)

Pour automatiser la création d'API Keys (multi-environnements) :

```bash
curl -X POST "https://api.tomtom.com/keys/v1/keys" \
  -H "Authorization: Bearer YOUR-ACCOUNT-TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "RT-SYMPHONIA-Production",
    "allowedOrigins": ["https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com"]
  }'
```

### Capture d'écran - API Key Dashboard

```
┌──────────────────────────────────────────────────────────┐
│  My Applications                                         │
│  ───────────────────────────────────────────────────     │
│                                                          │
│  RT-SYMPHONIA-Tracking-Premium                           │
│  Created: 2024-11-26                                     │
│                                                          │
│  API Key: abc123def456ghi789jkl012mno345pqr678           │
│           [Copy to Clipboard]                            │
│                                                          │
│  Services:                                               │
│  • Routing API      ✅ Active                            │
│  • Search API       ✅ Active                            │
│  • Traffic API      ✅ Active                            │
│                                                          │
│  Usage this month:                                       │
│  ███████░░░░░░░  16,234 / 75,000 requests (21.6%)       │
│                                                          │
│  [View Details]  [Regenerate Key]  [Delete App]          │
└──────────────────────────────────────────────────────────┘
```

### Sécurité de l'API Key

**⚠️ IMPORTANT - Bonnes Pratiques** :

1. **Ne jamais commiter l'API Key dans Git** :
   ```bash
   # Ajouter au .gitignore
   .env
   .env.local
   .env.production
   ```

2. **Restreindre par domaine** (optionnel) :
   - Dans le dashboard TomTom
   - Section "API Key Restrictions"
   - Ajouter : `rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com`

3. **Restreindre par IP** (pour production) :
   - Récupérer les IPs publiques d'Elastic Beanstalk
   - Les ajouter dans les restrictions

4. **Rotation régulière** :
   - Recommandé : tous les 90 jours
   - Générer nouvelle clé → Tester → Remplacer l'ancienne

---

## Configuration AWS Elastic Beanstalk

### Option 1 : Via la Console AWS (Interface Graphique)

#### Étape 1 : Accéder à l'environnement

1. **Connectez-vous à AWS Console** : https://console.aws.amazon.com

2. **Naviguez vers Elastic Beanstalk** :
   ```
   Services → Elastic Beanstalk → Environments
   ```

3. **Sélectionnez l'environnement** :
   ```
   rt-subscriptions-api-prod
   ```

#### Étape 2 : Configurer les variables d'environnement

1. **Allez dans Configuration** :
   - Cliquez sur "Configuration" dans la barre latérale
   - Section "Software" → Cliquez sur "Edit"

2. **Ajoutez les variables TomTom** :

   Faites défiler jusqu'à "Environment properties" et ajoutez :

   | Name | Value | Description |
   |------|-------|-------------|
   | `TOMTOM_API_KEY` | `votre-api-key-ici` | Clé API TomTom (obligatoire) |
   | `TOMTOM_TRACKING_API_URL` | `https://api.tomtom.com/tracking/1` | URL de l'API TomTom |

3. **Cliquez sur "Apply"** :
   - AWS redémarrera automatiquement l'environnement
   - Attendez ~2-3 minutes pour le redémarrage complet

#### Capture d'écran - Console AWS

```
┌────────────────────────────────────────────────────────────────┐
│  Elastic Beanstalk > Environments > rt-subscriptions-api-prod  │
│  ─────────────────────────────────────────────────────────     │
│                                                                │
│  Configuration > Software > Environment properties             │
│                                                                │
│  Name                      Value                               │
│  ──────────────────────    ─────────────────────────────       │
│  MONGODB_URI               mongodb+srv://user:***@cluster...   │
│  JWT_SECRET                *********************************** │
│  STRIPE_SECRET_KEY         sk_live_*************************** │
│                                                                │
│  → TOMTOM_API_KEY          abc123def456ghi789jkl012mno345pqr   │
│  → TOMTOM_TRACKING_API_URL https://api.tomtom.com/tracking/1   │
│                                                                │
│  [Add environment property]                                    │
│                                                                │
│  [Cancel]  [Apply]                                             │
└────────────────────────────────────────────────────────────────┘
```

### Option 2 : Via AWS CLI (Ligne de Commande)

```bash
# 1. Configurer AWS CLI (si pas déjà fait)
aws configure
# AWS Access Key ID: YOUR_ACCESS_KEY
# AWS Secret Access Key: YOUR_SECRET_KEY
# Default region: eu-central-1
# Default output format: json

# 2. Définir les variables d'environnement
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_KEY,Value=votre-api-key-ici \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_TRACKING_API_URL,Value=https://api.tomtom.com/tracking/1

# 3. Vérifier la configuration
aws elasticbeanstalk describe-configuration-settings \
  --environment-name rt-subscriptions-api-prod \
  --query 'ConfigurationSettings[0].OptionSettings[?Namespace==`aws:elasticbeanstalk:application:environment`]'
```

### Option 3 : Via EB CLI (Recommandé pour Automatisation)

```bash
# 1. Installer EB CLI (si pas déjà fait)
pip install awsebcli

# 2. Initialiser EB dans le projet
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb
eb init

# 3. Configurer les variables
eb setenv TOMTOM_API_KEY=votre-api-key-ici \
         TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1

# 4. Vérifier la configuration
eb printenv
```

### Option 4 : Script Automatisé (Voir section suivante)

Utilisez le script `scripts/configure-external-services.sh` pour une configuration interactive.

---

## Variables d'Environnement

### Variables Requises

| Variable | Type | Exemple | Description |
|----------|------|---------|-------------|
| `TOMTOM_API_KEY` | **String (Obligatoire)** | `abc123def456...` | Clé API TomTom obtenue sur le portail développeur |
| `TOMTOM_TRACKING_API_URL` | String (Optionnel) | `https://api.tomtom.com/tracking/1` | URL de base de l'API (valeur par défaut incluse dans le code) |

### Configuration dans .env (Développement Local)

Pour tester en local avant le déploiement :

```bash
# Fichier : .env.local
# Ne pas commiter ce fichier !

# TomTom Configuration
TOMTOM_API_KEY=votre-api-key-de-test-ici
TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1
```

### Vérification de la Configuration

Après avoir configuré les variables :

```bash
# Via EB CLI
eb printenv | grep TOMTOM

# Sortie attendue :
# TOMTOM_API_KEY = abc123def456ghi789jkl012mno345pqr678
# TOMTOM_TRACKING_API_URL = https://api.tomtom.com/tracking/1
```

---

## Tests de Validation

### Test 1 : Endpoint Health Check TomTom

Créez un fichier de test pour valider la connexion :

```bash
# Test basique de l'API TomTom
curl "https://api.tomtom.com/routing/1/calculateRoute/52.50931,13.42936:52.50274,13.43872/json?key=VOTRE-API-KEY"
```

**Réponse attendue** (succès) :

```json
{
  "formatVersion": "0.0.12",
  "routes": [
    {
      "summary": {
        "lengthInMeters": 734,
        "travelTimeInSeconds": 117,
        "trafficDelayInSeconds": 0,
        "departureTime": "2024-11-26T10:00:00+00:00",
        "arrivalTime": "2024-11-26T10:01:57+00:00"
      },
      "legs": [...]
    }
  ]
}
```

### Test 2 : Endpoint API Backend

Testez votre propre API backend :

```bash
# Remplacez par votre URL Elastic Beanstalk
export API_URL="https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com"

# Test 1 : Calcul d'itinéraire
curl -X POST "$API_URL/api/tracking/calculate-route" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -d '{
    "origin": {"lat": 48.8566, "lng": 2.3522},
    "destination": {"lat": 48.8606, "lng": 2.3376}
  }'

# Test 2 : Calcul ETA
curl -X POST "$API_URL/api/tracking/calculate-eta" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -d '{
    "currentPosition": {"lat": 48.8566, "lng": 2.3522},
    "destination": {"lat": 48.8606, "lng": 2.3376},
    "orderId": "ORDER123"
  }'

# Test 3 : Géocodage
curl -X POST "$API_URL/api/tracking/geocode" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -d '{
    "address": "10 Rue de la Paix, 75002 Paris, France"
  }'
```

### Test 3 : Tests Automatisés (Jest)

Voir le fichier `tests/external-services.test.js` pour les tests unitaires complets.

```bash
# Installer les dépendances de test
npm install --save-dev jest

# Lancer les tests
npm test -- tomtom
```

---

## Validation avec 5 Véhicules

### Scénario de Test Complet

#### Objectif

Valider le tracking de 5 véhicules pendant une journée complète (10h de tracking).

#### Configuration

```javascript
// Configuration de test
const testConfig = {
  vehicles: [
    { id: 'V001', name: 'Truck 1', route: 'Paris → Lyon' },
    { id: 'V002', name: 'Truck 2', route: 'Lyon → Marseille' },
    { id: 'V003', name: 'Truck 3', route: 'Marseille → Toulouse' },
    { id: 'V004', name: 'Truck 4', route: 'Toulouse → Bordeaux' },
    { id: 'V005', name: 'Truck 5', route: 'Bordeaux → Nantes' }
  ],
  trackingInterval: 5, // minutes
  testDuration: 10, // heures
  trackingHours: '08:00-18:00'
};
```

#### Étape 1 : Créer les Commandes de Test

```bash
# Script de création de 5 commandes
curl -X POST "$API_URL/api/transport-orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -d @test-orders.json

# Fichier test-orders.json
[
  {
    "orderNumber": "TEST-001",
    "vehicleId": "V001",
    "origin": {"address": "Paris, France"},
    "destination": {"address": "Lyon, France"},
    "deliveryTimeWindow": {
      "start": "2024-11-27T08:00:00Z",
      "end": "2024-11-27T14:00:00Z"
    }
  },
  // ... 4 autres commandes
]
```

#### Étape 2 : Simuler le Tracking GPS

```javascript
// Script : simulate-tracking.js
const tomtom = require('./tomtom-integration');

async function simulateTracking() {
  const vehicles = testConfig.vehicles;

  // Tracking toutes les 5 minutes pendant 10h
  const trackingDuration = 10 * 60; // minutes
  const interval = 5; // minutes
  const iterations = trackingDuration / interval; // 120 itérations

  for (let i = 0; i < iterations; i++) {
    for (const vehicle of vehicles) {
      // Simuler position GPS (dans la vraie vie, reçu du device GPS)
      const currentPosition = {
        lat: 48.8566 + (Math.random() * 0.1),
        lng: 2.3522 + (Math.random() * 0.1)
      };

      // Calculer ETA
      const eta = await tomtom.calculateETA(
        currentPosition,
        vehicle.destination,
        { vehicleId: vehicle.id }
      );

      console.log(`[${vehicle.id}] ETA: ${eta.eta}, Distance: ${eta.distance}m`);
    }

    // Attendre 5 minutes
    await sleep(5 * 60 * 1000);
  }
}
```

#### Étape 3 : Collecter les Métriques

Après 10h de test, vérifiez :

1. **Nombre de requêtes TomTom** :
   ```
   Dashboard TomTom → Usage Statistics
   Attendu : ~600 requêtes (5 véhicules × 120 positions)
   ```

2. **Précision des ETAs** :
   ```
   Comparez les ETAs calculés avec les arrivées réelles
   Marge d'erreur acceptable : ±15 minutes
   ```

3. **Détection de retards** :
   ```
   Vérifiez les alertes envoyées en cas de retard prévu
   ```

### Métriques de Succès

| Métrique | Cible | Résultat Test | Statut |
|----------|-------|---------------|--------|
| Disponibilité API | >99.5% | ... | ⬜ |
| Temps de réponse | <500ms | ... | ⬜ |
| Précision ETA | ±15min | ... | ⬜ |
| Requêtes réussies | >98% | ... | ⬜ |
| Coût journalier | <1€ | ... | ⬜ |

---

## Monitoring et Alertes

### Dashboard TomTom

Accédez au dashboard de monitoring :

```
https://developer.tomtom.com/user/me/apps/YOUR-APP-ID/analytics
```

**Métriques disponibles** :

- Nombre de requêtes par jour/mois
- Latence moyenne des requêtes
- Taux d'erreur
- Usage par service (Routing, Search, Traffic)

### Alertes à Configurer

#### 1. Alerte Quota TomTom

Créez une alerte quand vous atteignez 80% de votre quota :

```javascript
// Dans votre code backend
const DAILY_QUOTA = 2500; // Free tier
const currentUsage = await getTomTomUsage();

if (currentUsage > DAILY_QUOTA * 0.8) {
  sendAlert('TomTom quota at 80%! Current: ' + currentUsage);
}
```

#### 2. Alerte Erreurs TomTom

Surveillez les erreurs d'API :

```javascript
// Middleware de logging
app.use('/api/tracking/*', (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      logError('TomTom API error', {
        endpoint: req.path,
        status: res.statusCode,
        timestamp: new Date()
      });
    }
  });
  next();
});
```

#### 3. Monitoring AWS CloudWatch

Créez des métriques CloudWatch personnalisées :

```javascript
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({ region: 'eu-central-1' });

async function logTomTomMetric(metricName, value) {
  await cloudwatch.putMetricData({
    Namespace: 'RTSYMPHONIA/TomTom',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: 'Count',
      Timestamp: new Date()
    }]
  }).promise();
}

// Utilisation
await logTomTomMetric('TomTomAPIRequests', 1);
await logTomTomMetric('TomTomAPIErrors', 0);
```

### Budget Alerts (AWS)

Configurez des alertes de budget dans AWS :

1. **AWS Console** → Billing → Budgets
2. **Create Budget** :
   - Type : Cost budget
   - Amount : 50€/mois
   - Alert threshold : 80% (40€)
   - Email : votre-email@rt-group.com

---

## Dépannage

### Problème 1 : API Key Invalide

**Symptôme** :
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

**Solution** :
1. Vérifiez que l'API Key est correctement copiée (sans espaces)
2. Vérifiez que la clé n'a pas expiré
3. Régénérez une nouvelle clé si nécessaire

### Problème 2 : Quota Dépassé

**Symptôme** :
```json
{
  "error": "Quota exceeded",
  "message": "Daily request limit reached"
}
```

**Solution** :
1. Vérifiez votre usage sur le dashboard TomTom
2. Attendez le reset du quota (minuit UTC)
3. Passez à un plan supérieur si nécessaire

### Problème 3 : Timeout

**Symptôme** :
```
Error: Request timeout after 10000ms
```

**Solution** :
1. Augmentez le timeout dans votre code :
   ```javascript
   const timeout = 15000; // 15 secondes
   ```
2. Vérifiez votre connexion réseau
3. Vérifiez le statut de l'API TomTom : https://status.tomtom.com

### Problème 4 : Variable Non Définie

**Symptôme** :
```javascript
Error: TOMTOM_API_KEY is not defined
```

**Solution** :
1. Vérifiez que la variable est configurée dans AWS EB :
   ```bash
   eb printenv | grep TOMTOM_API_KEY
   ```
2. Redémarrez l'environnement :
   ```bash
   eb restart
   ```

---

## Checklist de Configuration

Utilisez cette checklist pour valider votre configuration :

- [ ] Compte TomTom Developer créé
- [ ] Email vérifié
- [ ] Application TomTom créée (`RT-SYMPHONIA-Tracking-Premium`)
- [ ] API Key obtenue et sauvegardée de manière sécurisée
- [ ] Services activés (Routing, Search, Traffic)
- [ ] Variable `TOMTOM_API_KEY` configurée dans AWS EB
- [ ] Variable `TOMTOM_TRACKING_API_URL` configurée (optionnel)
- [ ] Test 1 : Health check TomTom API (✅ Succès)
- [ ] Test 2 : Endpoint backend `/api/tracking/calculate-route` (✅ Succès)
- [ ] Test 3 : Endpoint backend `/api/tracking/calculate-eta` (✅ Succès)
- [ ] Test 4 : Géocodage (✅ Succès)
- [ ] Validation avec 5 véhicules (✅ Succès)
- [ ] Monitoring configuré (Dashboard TomTom)
- [ ] Alertes configurées (Quota, Erreurs, Budget)
- [ ] Documentation mise à jour
- [ ] Équipe formée sur l'utilisation

---

## Support et Ressources

### Documentation Officielle

- **TomTom Developer Portal** : https://developer.tomtom.com
- **API Reference** : https://developer.tomtom.com/routing-api/documentation
- **Code Samples** : https://github.com/tomtom-international

### Support TomTom

- **Email** : support@tomtom.com
- **Forum** : https://developer.tomtom.com/forum
- **Status Page** : https://status.tomtom.com

### Contact RT SYMPHONI.A

- **Email** : support@rt-technologie.com
- **Documentation interne** : Confluence → RT SYMPHONI.A

---

## Historique des Versions

| Version | Date | Modifications |
|---------|------|---------------|
| 1.0.0 | 2024-11-26 | Version initiale - Configuration TomTom Telematics |

---

**Document créé le** : 2024-11-26
**Auteur** : RT SYMPHONI.A DevOps Team
**Dernière mise à jour** : 2024-11-26
