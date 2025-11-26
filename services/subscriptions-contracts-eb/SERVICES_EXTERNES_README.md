# Configuration Services Externes - RT SYMPHONI.A

**Date de création** : 2024-11-26
**Projet** : RT SYMPHONI.A Transport Management System
**Version** : 1.0.0

---

## Vue d'Ensemble

Ce dossier contient toute la documentation et les scripts nécessaires pour configurer les 3 services externes de RT SYMPHONI.A :

1. **TomTom Telematics API** - Tracking GPS Premium
2. **AWS Textract** - OCR automatique (Primary)
3. **Google Vision API** - OCR automatique (Fallback)

---

## Fichiers Créés - Vue d'Ensemble

```
services/subscriptions-contracts-eb/
│
├── CONFIGURATION_TOMTOM_TELEMATICS.md        ← Guide complet TomTom (15 KB)
├── CONFIGURATION_OCR_AWS_GOOGLE.md           ← Guide complet AWS + Google (20 KB)
├── CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md ← Rapport récapitulatif (10 KB)
├── SERVICES_EXTERNES_README.md               ← Ce fichier
│
├── scripts/
│   ├── configure-external-services.sh        ← Script interactif (18 KB)
│   └── README.md                             ← Documentation scripts (8 KB)
│
├── tests/
│   └── external-services.test.js             ← Suite de tests Jest (15 KB)
│
├── .ebextensions/
│   └── google-credentials.config.example     ← Template Google Cloud (2 KB)
│
└── .env.example                               ← Variables d'env (DÉJÀ MIS À JOUR)
```

---

## Démarrage Rapide

### Option 1 : Script Automatisé (Recommandé)

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb
bash scripts/configure-external-services.sh
```

Le script vous guidera à travers toute la configuration.

### Option 2 : Configuration Manuelle

1. **Lisez la documentation** :
   - TomTom : `CONFIGURATION_TOMTOM_TELEMATICS.md`
   - OCR : `CONFIGURATION_OCR_AWS_GOOGLE.md`

2. **Créez les comptes** sur les portails respectifs

3. **Configurez les variables** dans AWS Elastic Beanstalk

4. **Testez** : `npm test -- external-services`

---

## Documentation Complète

### 1. CONFIGURATION_TOMTOM_TELEMATICS.md

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_TOMTOM_TELEMATICS.md`

**Contenu** :
- Guide de création compte TomTom Developer
- Obtention de l'API Key
- Configuration AWS Elastic Beanstalk
- Tests de validation
- Validation avec 5 véhicules test
- Calcul des coûts réels
- Monitoring et alertes
- Dépannage complet

**Sections principales** :
1. Présentation
2. Coûts et Tarification (20€/mois pour 5 véhicules)
3. Création du Compte TomTom
4. Obtention de l'API Key
5. Configuration AWS EB (3 méthodes)
6. Variables d'Environnement
7. Tests de Validation (3 niveaux)
8. Validation 5 Véhicules (scénario complet)
9. Monitoring et Alertes
10. Dépannage (4 problèmes courants)

### 2. CONFIGURATION_OCR_AWS_GOOGLE.md

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_OCR_AWS_GOOGLE.md`

**Contenu** :
- Configuration AWS Textract (Primary)
  - Création utilisateur IAM
  - Configuration permissions
  - Obtention credentials
  - Tests d'extraction

- Configuration Google Vision API (Fallback)
  - Création projet Google Cloud
  - Activation Vision API
  - Création Service Account
  - Download JSON credentials
  - Configuration dans AWS EB

- Architecture multi-provider
- Tests de fallback
- Budget alerts
- Monitoring et performance

**Sections principales** :
1. Présentation
2. Coûts et Tarification (58€/mois pour 10k pages)
3. Architecture OCR (AWS primary → Google fallback)
4. Configuration AWS Textract (6 étapes)
5. Configuration Google Vision (6 étapes)
6. Variables d'Environnement
7. Tests de Validation
8. Budget Alerts (AWS + Google)
9. Monitoring et Performance
10. Dépannage

### 3. CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md`

**Contenu** :
- Résumé exécutif
- Services configurés (vue d'ensemble)
- Fichiers créés (liste complète)
- Coûts mensuels estimés (3 scénarios)
- Instructions de déploiement
- Tests de validation
- Checklist de configuration (30+ items)
- Support et maintenance

---

## Scripts

### scripts/configure-external-services.sh

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\configure-external-services.sh`

**Description** :
Script Bash interactif pour configurer automatiquement tous les services.

**Fonctionnalités** :
- Menu interactif à 8 options
- Configuration TomTom (API Key + validation)
- Configuration AWS Textract (IAM credentials + tests)
- Configuration Google Vision (JSON credentials + validation)
- Tests de connectivité pour chaque service
- Déploiement automatique vers AWS EB
- Sauvegarde locale dans `.env.external-services`

**Usage** :
```bash
bash scripts/configure-external-services.sh
```

**Prérequis** :
- Bash 4.0+
- curl (pour tests API)
- AWS CLI ou EB CLI (pour déploiement)
- Node.js (pour tests)
- jq (optionnel, pour validation JSON)

### scripts/README.md

Documentation complète du script avec :
- Guide d'utilisation détaillé
- Prérequis et installation des outils
- Configuration manuelle (alternatives)
- Tests et validation
- Dépannage

---

## Tests

### tests/external-services.test.js

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\tests\external-services.test.js`

**Description** :
Suite complète de tests Jest pour valider tous les services externes.

**Tests Couverts** :

#### TomTom Telematics (11 tests)
- Configuration : API Key présente
- calculateRoute : Paris → Lyon
- calculateETA : Temps d'arrivée estimé
- detectDelay : Détection de retards
- geocodeAddress : Adresse → GPS
- reverseGeocode : GPS → Adresse
- isInGeofence : Détection zone
- calculateHaversineDistance : Distance correcte
- getTrafficInfo : Informations trafic
- getSuggestedDeparture : Heure de départ optimale

#### AWS Textract (6 tests)
- Configuration : Credentials présentes
- extractBLFieldsAWS : Extraction BL
- extractCMRFieldsAWS : Extraction CMR
- detectSignatures : Détection signatures
- extractDeliveryData : Fonction unifiée
- Performance : <10s

#### Google Vision API (4 tests)
- Configuration : Credentials présentes
- extractBLFieldsGoogle : Extraction BL
- extractCMRFieldsGoogle : Extraction CMR
- Fallback : AWS → Google si erreur

#### Tests d'Intégration (4 tests)
- End-to-End Tracking : Route → ETA → Geofence
- End-to-End OCR : AWS → Google fallback
- Performance : TomTom <5s, OCR <10s
- Cost Validation : Budget pour 5 véhicules

**Lancer les tests** :
```bash
# Tous les tests
npm test -- external-services

# Tests TomTom uniquement
npm test -- --testNamePattern="TomTom"

# Tests AWS uniquement
npm test -- --testNamePattern="AWS Textract"

# Tests Google uniquement
npm test -- --testNamePattern="Google Vision"

# Tests d'intégration
npm test -- --testNamePattern="Integration"
```

---

## Configuration

### .env.example

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.env.example`

**Statut** : ✅ **DÉJÀ MIS À JOUR** avec toutes les variables nécessaires

**Variables ajoutées** :

```bash
# TomTom Telematics
TOMTOM_API_KEY=your-tomtom-api-key
TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1

# AWS Textract
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=eu-central-1
OCR_PROVIDER=AWS_TEXTRACT

# Google Vision API
GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json
OCR_ENABLE_FALLBACK=true
```

### .ebextensions/google-credentials.config.example

**Chemin** : `c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.ebextensions\google-credentials.config.example`

**Description** :
Template de configuration pour déployer les credentials Google Cloud dans AWS Elastic Beanstalk.

**Usage** :
1. Copiez : `cp google-credentials.config.example google-credentials.config`
2. Éditez et remplacez `VOTRE_*` par vos vraies valeurs
3. Déployez : `eb deploy`

**⚠️ IMPORTANT** : Ne commitez JAMAIS le fichier `.config` (sans `.example`) dans Git !

---

## Coûts Estimés

### Scénario Recommandé (5 Véhicules)

```
┌─────────────────────────────────────────────────┐
│  Service              │  Utilisation │  Coût    │
├─────────────────────────────────────────────────┤
│  TomTom (5 véh.)      │  Free Tier   │  20€     │
│  AWS Textract (8k)    │  80%         │  46€     │
│  Google Vision (2k)   │  20%         │  1.40€   │
├─────────────────────────────────────────────────┤
│  TOTAL                │              │  ~68€/m  │
└─────────────────────────────────────────────────┘

Coût annuel : ~810€/an
```

**Détails** :
- **TomTom** : Free Tier API (75k requêtes/mois) + 5 véhicules × 4€
- **AWS Textract** : 8,000 pages × $0.065 = ~46€
- **Google Vision** : 2,000 images (1,000 gratuits + 1,000 payants) = ~1.40€

### Autres Scénarios

Voir le fichier `CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md` pour :
- Scénario Test (5 véhicules, 1k docs) : ~61€/mois
- Scénario Production (10 véhicules, 10k docs) : ~541€/mois

---

## Workflow de Déploiement

### Étape 1 : Préparation

```bash
# 1. Cloner/Pull le repo
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# 2. Lire la documentation
# - CONFIGURATION_TOMTOM_TELEMATICS.md
# - CONFIGURATION_OCR_AWS_GOOGLE.md

# 3. Créer les comptes
# - TomTom Developer : https://developer.tomtom.com
# - AWS IAM User : Console AWS → IAM
# - Google Cloud : https://console.cloud.google.com
```

### Étape 2 : Configuration

**Option A : Script automatisé**
```bash
bash scripts/configure-external-services.sh
# Suivre les instructions à l'écran
```

**Option B : Manuelle**
```bash
# Obtenir les credentials manuellement
# Configurer via AWS EB Console ou CLI
eb setenv TOMTOM_API_KEY=xxx AWS_ACCESS_KEY_ID=xxx ...
```

### Étape 3 : Tests

```bash
# Tests unitaires
npm test -- external-services

# Tests manuels
curl "https://api.tomtom.com/routing/1/calculateRoute/..."
aws sts get-caller-identity
```

### Étape 4 : Déploiement

```bash
# Si modifications dans .ebextensions/
eb deploy

# Si uniquement variables d'env
eb setenv VARIABLE=value
# (redémarre automatiquement)
```

### Étape 5 : Validation

```bash
# Vérifier les variables
eb printenv | grep -E '(TOMTOM|AWS_|GOOGLE|OCR)'

# Vérifier les logs
eb logs

# Tester l'API
curl https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/tracking/...
```

---

## Checklist Complète

### Pré-Déploiement

- [ ] Documentation lue et comprise
- [ ] Comptes créés (TomTom, AWS, Google)
- [ ] Credentials obtenus et sauvegardés de manière sécurisée
- [ ] Scripts et tests installés
- [ ] Budget alerts configurés

### Configuration TomTom

- [ ] Compte TomTom Developer créé
- [ ] Application créée : `RT-SYMPHONIA-Tracking-Premium`
- [ ] API Key obtenue
- [ ] Services activés : Routing, Search, Traffic
- [ ] Variable `TOMTOM_API_KEY` configurée dans AWS EB
- [ ] Test API : curl route Paris-Lyon fonctionne
- [ ] Test backend : `/api/tracking/calculate-route` OK

### Configuration AWS Textract

- [ ] Utilisateur IAM créé : `rt-symphonia-textract-user`
- [ ] Permissions IAM configurées
- [ ] Access Key ID obtenue
- [ ] Secret Access Key obtenue
- [ ] Variables AWS configurées dans EB
- [ ] Test AWS : `aws sts get-caller-identity` OK
- [ ] Test backend : `/api/documents/ocr-extract` OK

### Configuration Google Vision

- [ ] Projet Google Cloud créé : `rt-symphonia-ocr`
- [ ] API Vision activée
- [ ] Service Account créé
- [ ] Fichier JSON téléchargé
- [ ] Configuration `.ebextensions/*.config` créée
- [ ] Variables Google configurées dans EB
- [ ] Test fallback : AWS fail → Google used

### Tests et Validation

- [ ] Tests unitaires : 25/25 passés
- [ ] Tests d'intégration : Tous passés
- [ ] Tests de performance : <5s TomTom, <10s OCR
- [ ] Validation 5 véhicules : Budget OK
- [ ] Logs AWS : Pas d'erreurs
- [ ] Monitoring : Dashboards configurés

---

## Support

### Documentation

- **TomTom** : https://developer.tomtom.com
- **AWS Textract** : https://aws.amazon.com/textract
- **Google Vision** : https://cloud.google.com/vision

### Contact Interne

- Email : devops@rt-technologie.com
- Slack : #rt-symphonia-devops
- Confluence : RT SYMPHONI.A Documentation

### Ressources

- **Rapport complet** : `CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md`
- **Scripts** : `scripts/README.md`
- **Tests** : `tests/external-services.test.js`

---

## Sécurité

### Fichiers à NE PAS Commiter

```gitignore
# Ajoutez au .gitignore
.env
.env.local
.env.production
.env.external-services
google-credentials.json
.ebextensions/*.config
!.ebextensions/*.config.example
```

### Bonnes Pratiques

1. **Secrets Manager** : Utilisez AWS Secrets Manager en production
2. **Rotation** : Rotez les secrets tous les 90 jours
3. **Permissions** : Principe du moindre privilège
4. **Monitoring** : CloudWatch Logs + Alerts
5. **Audit** : AWS CloudTrail + Google Audit Logs

---

## Prochaines Étapes

1. **Lire la documentation complète** (3 fichiers MD)
2. **Créer les comptes** sur les 3 services
3. **Lancer le script de configuration** ou configurer manuellement
4. **Tester** avec la suite de tests
5. **Déployer** sur AWS Elastic Beanstalk
6. **Valider** avec 5 véhicules pendant 1 semaine
7. **Monitorer** les coûts quotidiens
8. **Documenter** dans Confluence

---

## Résumé des Chemins Absolus

```
Documentation :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_TOMTOM_TELEMATICS.md
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_OCR_AWS_GOOGLE.md
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_EXTERNE_SERVICES_RAPPORT.md
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\SERVICES_EXTERNES_README.md

Scripts :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\configure-external-services.sh
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\README.md

Tests :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\tests\external-services.test.js

Configuration :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.env.example
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.ebextensions\google-credentials.config.example
```

---

**Document créé le** : 2024-11-26
**Auteur** : RT SYMPHONI.A DevOps Team
**Version** : 1.0.0
**Statut** : ✅ Complet - Prêt pour déploiement

