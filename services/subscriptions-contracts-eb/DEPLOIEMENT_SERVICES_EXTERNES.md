# Guide de Déploiement - Services Externes RT SYMPHONI.A

**Version** : 1.6.2-security-final
**Date** : 2024-11-26
**Module** : subscriptions-contracts-eb

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Configuration des Services](#configuration-des-services)
4. [Déploiement sur AWS](#déploiement-sur-aws)
5. [Validation Post-Déploiement](#validation-post-déploiement)
6. [Monitoring et Maintenance](#monitoring-et-maintenance)
7. [Troubleshooting](#troubleshooting)
8. [Checklist Complète](#checklist-complète)

---

## Vue d'Ensemble

### Services à Déployer

RT SYMPHONI.A utilise 3 services externes pour les fonctionnalités avancées :

| Service | Fonction | Coût Mensuel | Statut |
|---------|----------|--------------|--------|
| **TomTom Telematics** | Tracking GPS Premium | ~20€ | **Requis** |
| **AWS Textract** | OCR Primary Provider | ~46€ | **Requis** |
| **Google Vision API** | OCR Fallback | ~1.40€ | Optionnel |
| | **TOTAL** | **~68€/mois** | |

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend Client (Dispatchers, Chauffeurs)              │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTPS
                  ▼
┌─────────────────────────────────────────────────────────┐
│  AWS Elastic Beanstalk                                  │
│  rt-subscriptions-api-prod (eu-central-1)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  index.js → Validation Services au Démarrage    │   │
│  │  - tomtom-integration.js                         │   │
│  │  - ocr-integration-service.js                    │   │
│  └─────────────────────────────────────────────────┘   │
└─────────┬──────────┬──────────────┬────────────────────┘
          │          │              │
          ▼          ▼              ▼
    ┌─────────┐ ┌─────────┐ ┌─────────────┐
    │ TomTom  │ │AWS      │ │Google Vision│
    │ API     │ │Textract │ │API          │
    └─────────┘ └─────────┘ └─────────────┘
```

---

## Prérequis

### Comptes Nécessaires

- [ ] **TomTom Developer Account** (gratuit) → https://developer.tomtom.com
- [ ] **Compte AWS** avec accès administrateur
- [ ] **Compte Google Cloud** (optionnel, pour fallback OCR)
- [ ] **Accès AWS Elastic Beanstalk** : rt-subscriptions-api-prod

### Outils Requis

```bash
# Vérifier les versions
node --version    # >= 20.0.0
npm --version     # >= 9.0.0
aws --version     # >= 2.0.0
eb --version      # >= 3.20.0
```

Installation si nécessaire :

```bash
# Node.js 20 LTS
https://nodejs.org/en/download/

# AWS CLI
pip install awscli --upgrade

# EB CLI
pip install awsebcli --upgrade
```

### Dépendances NPM

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# Installer les dépendances
npm install

# Vérifier les packages critiques
npm list express mongodb aws-sdk @google-cloud/vision
```

---

## Configuration des Services

### Étape 1 : TomTom Telematics API

#### 1.1 Créer le Compte TomTom

1. Accédez à : https://developer.tomtom.com
2. Cliquez sur "Get Started for Free"
3. Remplissez le formulaire :
   - Email : `votre-email@rt-group.com`
   - Company : `RT SYMPHONI.A Transport`
   - Use Case : `Fleet Management`

4. Validez votre email

#### 1.2 Obtenir l'API Key

1. Connectez-vous : https://developer.tomtom.com/user/login
2. Allez dans "My Apps"
3. Créez une nouvelle app :
   - Name : `RT-SYMPHONIA-Tracking-Premium`
   - Services : ✅ Routing, Search, Traffic

4. Copiez l'API Key (format : `abc123...xyz789`)

#### 1.3 Sauvegarder la Clé de Manière Sécurisée

```bash
# Créer un fichier temporaire (NE PAS COMMITER)
echo "TOMTOM_API_KEY=VOTRE_CLE_ICI" > .env.local
```

**Documentation complète** : `CONFIGURATION_TOMTOM_TELEMATICS.md`

---

### Étape 2 : AWS Textract

#### 2.1 Créer l'Utilisateur IAM

Via AWS Console :

1. AWS Console → IAM → Users → Create user
2. User name : `rt-symphonia-textract-user`
3. Access type : ✅ Programmatic access
4. Permissions : `AmazonTextractFullAccess`

5. Télécharger les credentials :
   - Access Key ID : `AKIAIOSFODNN7...`
   - Secret Access Key : `wJalrXUtnFEMI/K7MDENG/...`

Via AWS CLI :

```bash
# Créer l'utilisateur
aws iam create-user --user-name rt-symphonia-textract-user

# Attacher la policy
aws iam attach-user-policy \
  --user-name rt-symphonia-textract-user \
  --policy-arn arn:aws:iam::aws:policy/AmazonTextractFullAccess

# Créer les access keys
aws iam create-access-key --user-name rt-symphonia-textract-user
```

#### 2.2 Sauvegarder les Credentials

```bash
# Ajouter au fichier .env.local
echo "AWS_ACCESS_KEY_ID=VOTRE_ACCESS_KEY_ID" >> .env.local
echo "AWS_SECRET_ACCESS_KEY=VOTRE_SECRET_KEY" >> .env.local
echo "AWS_REGION=eu-central-1" >> .env.local
```

**Documentation complète** : `CONFIGURATION_OCR_AWS_GOOGLE.md`

---

### Étape 3 : Google Vision API (Optionnel)

#### 3.1 Créer le Projet Google Cloud

1. Accédez à : https://console.cloud.google.com
2. Créez un nouveau projet :
   - Name : `rt-symphonia-ocr`
   - Location : Votre organisation

#### 3.2 Activer l'API Vision

1. Navigation → APIs & Services → Library
2. Recherchez "Cloud Vision API"
3. Cliquez "Enable"

#### 3.3 Créer le Service Account

1. APIs & Services → Credentials → Create Credentials → Service account
2. Service account name : `rt-symphonia-vision-sa`
3. Role : `Cloud Vision API User`
4. Créez une clé JSON → Téléchargez le fichier

#### 3.4 Configurer les Credentials

```bash
# Copier le fichier JSON téléchargé
cp ~/Downloads/rt-symphonia-ocr-*.json ./google-credentials.json

# Ajouter au .env.local
echo "GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json" >> .env.local
```

**Documentation complète** : `CONFIGURATION_OCR_AWS_GOOGLE.md`

---

## Déploiement sur AWS

### Option 1 : Déploiement via EB CLI (Recommandé)

#### Étape 1 : Initialiser EB CLI

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# Initialiser EB (si pas déjà fait)
eb init

# Sélectionner :
# - Region : eu-central-1 (Frankfurt)
# - Application : rt-subscriptions-api
# - Environment : rt-subscriptions-api-prod
```

#### Étape 2 : Configurer les Variables d'Environnement

```bash
# TomTom
eb setenv TOMTOM_API_KEY=votre-tomtom-api-key

# AWS Textract
eb setenv AWS_ACCESS_KEY_ID=votre-access-key-id \
         AWS_SECRET_ACCESS_KEY=votre-secret-key \
         AWS_REGION=eu-central-1 \
         OCR_PROVIDER=AWS_TEXTRACT

# OCR Config
eb setenv OCR_ENABLE_FALLBACK=true \
         OCR_TIMEOUT_MS=10000 \
         OCR_MIN_CONFIDENCE=90
```

#### Étape 3 : Déployer les Credentials Google (si configuré)

```bash
# Copier le fichier google-credentials.json dans .ebextensions/
# Modifier .ebextensions/google-credentials.config avec vos vraies valeurs

# Déployer
eb deploy
```

#### Étape 4 : Vérifier le Déploiement

```bash
# Vérifier les variables
eb printenv | grep -E '(TOMTOM|AWS_|GOOGLE|OCR)'

# Vérifier les logs
eb logs | tail -100

# Vérifier le health status
eb health
```

---

### Option 2 : Déploiement via AWS Console

#### Étape 1 : Accéder à la Configuration

1. AWS Console → Elastic Beanstalk → rt-subscriptions-api-prod
2. Configuration → Software → Edit
3. Scroll vers "Environment properties"

#### Étape 2 : Ajouter les Variables

| Name | Value |
|------|-------|
| `TOMTOM_API_KEY` | `votre-tomtom-api-key` |
| `AWS_ACCESS_KEY_ID` | `votre-access-key-id` |
| `AWS_SECRET_ACCESS_KEY` | `votre-secret-key` |
| `AWS_REGION` | `eu-central-1` |
| `OCR_PROVIDER` | `AWS_TEXTRACT` |
| `OCR_ENABLE_FALLBACK` | `true` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/var/app/current/google-credentials.json` |

#### Étape 3 : Appliquer les Modifications

1. Cliquez "Apply"
2. Attendez le redémarrage (2-3 minutes)
3. Vérifiez le status dans "Health"

---

### Option 3 : Script Automatisé

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# Lancer le script de configuration interactif
bash scripts/configure-external-services.sh

# Suivre les instructions à l'écran
```

---

## Validation Post-Déploiement

### Test 1 : Validation Locale (Avant Déploiement)

```bash
# Charger les variables depuis .env.local
export $(cat .env.local | xargs)

# Lancer la validation complète
node scripts/validate-all-external-services.js

# Résultat attendu :
# ✅ TomTom Telematics API : RÉUSSI
# ✅ AWS Textract : RÉUSSI
# ✅ Google Vision API : RÉUSSI (ou OPTIONNEL)
#
# 🎉 VALIDATION RÉUSSIE !
```

### Test 2 : Tests Individuels

```bash
# Test TomTom uniquement
node scripts/test-tomtom-connection.js

# Test AWS Textract uniquement
node scripts/test-textract-ocr.js

# Test Google Vision uniquement
node scripts/test-google-vision-ocr.js
```

### Test 3 : Validation Post-Déploiement (AWS)

```bash
# Se connecter à l'instance EB
eb ssh

# Vérifier les variables
printenv | grep -E '(TOMTOM|AWS_|GOOGLE|OCR)'

# Lancer les tests
cd /var/app/current
node scripts/validate-all-external-services.js

# Vérifier les logs
tail -f /var/log/eb-engine.log
```

### Test 4 : Tests API Endpoints

```bash
export API_URL="https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com"
export JWT_TOKEN="your-jwt-token-here"

# Test TomTom - Calcul d'itinéraire
curl -X POST "$API_URL/api/tracking/calculate-route" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {"lat": 48.8566, "lng": 2.3522},
    "destination": {"lat": 45.7640, "lng": 4.8357}
  }'

# Test OCR - Upload document (simulation)
curl -X POST "$API_URL/api/documents/ocr-extract" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@test-documents/bl-example.png" \
  -F "documentType=BL"
```

---

## Monitoring et Maintenance

### Monitoring CloudWatch

#### Créer un Dashboard CloudWatch

```bash
# Via AWS CLI
aws cloudwatch put-dashboard \
  --dashboard-name RT-SYMPHONIA-External-Services \
  --dashboard-body file://cloudwatch-dashboard.json
```

**Métriques à surveiller** :

- **TomTom** :
  - Nombre de requêtes/jour
  - Temps de réponse moyen
  - Taux d'erreur

- **AWS Textract** :
  - Pages analysées/jour
  - Coût journalier
  - Temps de traitement moyen

- **Google Vision** :
  - Images analysées/jour (fallback)
  - Taux de fallback

#### Configurer les Alarmes

```bash
# Alerte quota TomTom
aws cloudwatch put-metric-alarm \
  --alarm-name tomtom-quota-80percent \
  --alarm-description "TomTom quota at 80%" \
  --metric-name TomTomAPIRequests \
  --namespace RTSYMPHONIA/ExternalServices \
  --statistic Sum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 2000 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:eu-central-1:004843574253:rt-alerts

# Alerte coût AWS Textract
aws budgets create-budget \
  --account-id 004843574253 \
  --budget file://textract-budget.json \
  --notifications-with-subscribers file://budget-notifications.json
```

### Logs et Debugging

```bash
# Logs en temps réel
eb logs --stream

# Filtrer les logs services externes
eb logs | grep -E '(TomTom|Textract|Vision|OCR)'

# Logs CloudWatch
aws logs tail /aws/elasticbeanstalk/rt-subscriptions-api-prod --follow
```

### Rotation des Credentials

**Fréquence recommandée** : Tous les 90 jours

```bash
# 1. Créer de nouvelles credentials AWS
aws iam create-access-key --user-name rt-symphonia-textract-user

# 2. Mettre à jour dans EB
eb setenv AWS_ACCESS_KEY_ID=nouvelle-key \
         AWS_SECRET_ACCESS_KEY=nouveau-secret

# 3. Tester
node scripts/test-textract-ocr.js

# 4. Supprimer l'ancienne clé
aws iam delete-access-key \
  --user-name rt-symphonia-textract-user \
  --access-key-id ancienne-key
```

---

## Troubleshooting

### Problème 1 : TomTom API Key Invalide

**Symptômes** :
```
❌ Error: TomTom API error: 401 - Unauthorized
```

**Solutions** :
1. Vérifier que l'API Key est correcte (sans espaces)
2. Vérifier que les services (Routing, Search) sont activés
3. Régénérer une nouvelle clé si nécessaire

```bash
# Vérifier la clé
eb printenv | grep TOMTOM_API_KEY

# Tester manuellement
curl "https://api.tomtom.com/routing/1/calculateRoute/48.8566,2.3522:45.7640,4.8357/json?key=VOTRE_CLE"
```

---

### Problème 2 : AWS Textract AccessDenied

**Symptômes** :
```
❌ Error: AccessDeniedException: User is not authorized to perform textract:AnalyzeDocument
```

**Solutions** :
1. Vérifier les permissions IAM
2. Attacher la policy `AmazonTextractFullAccess`
3. Attendre 5-10 minutes pour la propagation

```bash
# Vérifier les permissions
aws iam list-attached-user-policies --user-name rt-symphonia-textract-user

# Tester l'identité
aws sts get-caller-identity
```

---

### Problème 3 : Google Vision Credentials Invalid

**Symptômes** :
```
❌ Error: Could not load the default credentials
```

**Solutions** :
1. Vérifier que le fichier JSON existe
2. Vérifier la variable `GOOGLE_APPLICATION_CREDENTIALS`
3. Vérifier les permissions du Service Account

```bash
# Vérifier le fichier
ls -la $GOOGLE_APPLICATION_CREDENTIALS

# Tester les credentials
cat $GOOGLE_APPLICATION_CREDENTIALS | jq .client_email
```

---

### Problème 4 : Variables d'Environnement Non Définies

**Symptômes** :
```
❌ Error: TOMTOM_API_KEY is not defined
```

**Solutions** :
1. Vérifier que les variables sont configurées dans EB
2. Redémarrer l'environnement
3. Vérifier dans les logs

```bash
# Lister toutes les variables
eb printenv

# Redémarrer
eb restart

# Vérifier les logs au démarrage
eb logs | grep -A 10 "Environment variables"
```

---

## Checklist Complète

### Pré-Déploiement

- [ ] Node.js >= 20.0.0 installé
- [ ] AWS CLI configuré
- [ ] EB CLI configuré
- [ ] Dépendances NPM installées (`npm install`)
- [ ] Documentation lue (TomTom, AWS, Google)

### Configuration TomTom

- [ ] Compte TomTom Developer créé
- [ ] Application créée : `RT-SYMPHONIA-Tracking-Premium`
- [ ] Services activés : Routing, Search, Traffic
- [ ] API Key obtenue et sauvegardée
- [ ] Variable `TOMTOM_API_KEY` configurée dans EB
- [ ] Test local réussi : `node scripts/test-tomtom-connection.js`

### Configuration AWS Textract

- [ ] Utilisateur IAM créé : `rt-symphonia-textract-user`
- [ ] Policy `AmazonTextractFullAccess` attachée
- [ ] Access Key ID et Secret Key obtenus
- [ ] Variables AWS configurées dans EB
- [ ] Test local réussi : `node scripts/test-textract-ocr.js`

### Configuration Google Vision (Optionnel)

- [ ] Projet Google Cloud créé : `rt-symphonia-ocr`
- [ ] API Vision activée
- [ ] Service Account créé
- [ ] Fichier JSON credentials téléchargé
- [ ] Configuration `.ebextensions/google-credentials.config` créée
- [ ] Variables Google configurées dans EB
- [ ] Test local réussi : `node scripts/test-google-vision-ocr.js`

### Déploiement

- [ ] Validation locale réussie : `node scripts/validate-all-external-services.js`
- [ ] Variables déployées : `eb setenv ...`
- [ ] Application déployée : `eb deploy`
- [ ] Health check OK : `eb health`
- [ ] Logs vérifiés : `eb logs`

### Post-Déploiement

- [ ] Tests API endpoints réussis (TomTom, OCR)
- [ ] Monitoring CloudWatch configuré
- [ ] Alarmes budget configurées
- [ ] Dashboard créé
- [ ] Documentation mise à jour
- [ ] Équipe formée

---

## Support et Ressources

### Documentation

- **TomTom** : `CONFIGURATION_TOMTOM_TELEMATICS.md`
- **AWS Textract + Google Vision** : `CONFIGURATION_OCR_AWS_GOOGLE.md`
- **Scripts** : `scripts/README.md`

### Liens Utiles

- **TomTom Developer** : https://developer.tomtom.com
- **AWS Textract** : https://aws.amazon.com/textract
- **Google Vision** : https://cloud.google.com/vision

### Contact Interne

- **Email** : devops@rt-technologie.com
- **Slack** : #rt-symphonia-support
- **Documentation** : Confluence → RT SYMPHONI.A

---

## Résumé des Chemins Absolus

```
Configuration :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.env.external-services
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.ebextensions\external-services.config
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.ebextensions\aws-textract-iam.config
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\.ebextensions\google-credentials.config.example

Scripts de Test :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\test-tomtom-connection.js
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\test-textract-ocr.js
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\test-google-vision-ocr.js
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\validate-all-external-services.js
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\scripts\configure-external-services.sh

Documentation :
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\DEPLOIEMENT_SERVICES_EXTERNES.md (ce fichier)
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_TOMTOM_TELEMATICS.md
  c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\CONFIGURATION_OCR_AWS_GOOGLE.md
```

---

**Document créé le** : 2024-11-26
**Auteur** : RT SYMPHONI.A DevOps Team
**Version** : 1.0.0
**Statut** : ✅ Complet - Prêt pour utilisation
