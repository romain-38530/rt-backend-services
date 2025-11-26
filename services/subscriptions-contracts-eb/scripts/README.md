# Scripts de Configuration - RT SYMPHONI.A

Ce dossier contient les scripts d'automatisation pour configurer les services externes de RT SYMPHONI.A.

---

## Scripts Disponibles

### 1. configure-external-services.sh

Script interactif pour configurer tous les services externes.

**Services configurés :**
- TomTom Telematics API (Tracking Premium)
- AWS Textract (OCR Primary)
- Google Vision API (OCR Fallback)

**Usage :**

```bash
# Linux/Mac
cd services/subscriptions-contracts-eb
bash scripts/configure-external-services.sh

# Windows (Git Bash ou WSL)
cd services/subscriptions-contracts-eb
bash scripts/configure-external-services.sh
```

**Menu interactif :**

```
┌─────────────────────────────────────────────────────────┐
│  RT SYMPHONI.A - External Services Configuration       │
│  Environment: rt-subscriptions-api-prod                │
└─────────────────────────────────────────────────────────┘

1. Configure TomTom Telematics API (Tracking Premium)
2. Configure AWS Textract (OCR Primary)
3. Configure Google Vision API (OCR Fallback)
4. Configure All Services (Full Setup)
5. Test Configuration
6. View Current Configuration
7. Deploy to AWS Elastic Beanstalk
8. Exit
```

---

## Prérequis

### Outils Requis

```bash
# Bash shell (Linux/Mac natif, Windows via Git Bash ou WSL)
bash --version

# AWS CLI (pour déploiement)
aws --version

# EB CLI (optionnel, recommandé)
eb --version

# Node.js (pour tests)
node --version

# curl (pour tests API)
curl --version

# jq (optionnel, pour validation JSON)
jq --version
```

### Installation des Outils

**AWS CLI :**
```bash
# Linux/Mac
pip install awscli

# Windows
# Téléchargez l'installeur : https://aws.amazon.com/cli/
```

**EB CLI :**
```bash
pip install awsebcli
```

**jq (optionnel) :**
```bash
# Linux
sudo apt-get install jq

# Mac
brew install jq

# Windows
# Téléchargez depuis : https://stedolan.github.io/jq/
```

---

## Guide d'Utilisation

### Configuration Complète (Recommandé)

Pour configurer tous les services d'un coup :

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 4 (Configure All Services)
```

Le script vous guidera à travers :

1. **TomTom Telematics**
   - Création du compte développeur
   - Génération de l'API Key
   - Test de connectivité

2. **AWS Textract**
   - Création de l'utilisateur IAM
   - Configuration des permissions
   - Obtention des credentials
   - Test AWS

3. **Google Vision API**
   - Création du projet Google Cloud
   - Activation de l'API Vision
   - Création du Service Account
   - Download du fichier JSON
   - Test Google Vision

4. **Déploiement**
   - Configuration des variables dans AWS EB
   - Déploiement des fichiers de credentials
   - Redémarrage de l'environnement

---

## Configuration Manuelle

Si vous préférez configurer manuellement chaque service :

### 1. TomTom Telematics

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 1
```

**Ce que fait le script :**
- Demande votre TomTom API Key
- Valide le format de la clé
- Teste la connectivité avec l'API TomTom
- Sauvegarde dans `.env.external-services`

**Configuration manuelle alternative :**
```bash
# Ajoutez dans .env
TOMTOM_API_KEY=votre-api-key-ici
TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1

# Déployez dans AWS EB
eb setenv TOMTOM_API_KEY=votre-api-key-ici
```

### 2. AWS Textract

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 2
```

**Ce que fait le script :**
- Demande vos AWS credentials (Access Key + Secret)
- Valide le format des credentials
- Teste la connectivité avec AWS STS
- Sauvegarde dans `.env.external-services`

**Configuration manuelle alternative :**
```bash
# Ajoutez dans .env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=eu-central-1
OCR_PROVIDER=AWS_TEXTRACT

# Déployez dans AWS EB
eb setenv \
  AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE \
  AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/... \
  AWS_REGION=eu-central-1 \
  OCR_PROVIDER=AWS_TEXTRACT
```

### 3. Google Vision API

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 3
```

**Ce que fait le script :**
- Demande le chemin vers votre fichier JSON credentials
- Valide le format JSON
- Extrait les informations du projet
- Copie le fichier dans le projet
- Sauvegarde dans `.env.external-services`

**Configuration manuelle alternative :**
```bash
# Copiez le fichier credentials
cp ~/Downloads/rt-symphonia-ocr-xxxxx.json ./google-credentials.json
chmod 400 ./google-credentials.json

# Ajoutez dans .env
GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json
OCR_ENABLE_FALLBACK=true

# Déployez dans AWS EB
eb setenv \
  GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json \
  OCR_ENABLE_FALLBACK=true

# Copiez le fichier .ebextensions/google-credentials.config.example
cp .ebextensions/google-credentials.config.example \
   .ebextensions/google-credentials.config

# Éditez et ajoutez vos vraies valeurs
nano .ebextensions/google-credentials.config
```

---

## Tests

### Tester la Configuration

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 5 (Test Configuration)
```

**Ce que fait le script :**
- Teste la connectivité TomTom API
- Teste les credentials AWS
- Teste l'API Google Vision
- Affiche un rapport de statut

**Tests manuels :**

```bash
# Test TomTom
curl "https://api.tomtom.com/routing/1/calculateRoute/48.8566,2.3522:45.7640,4.8357/json?key=VOTRE-API-KEY"

# Test AWS (avec AWS CLI)
aws sts get-caller-identity

# Test Node.js
cd services/subscriptions-contracts-eb
npm test -- external-services
```

### Voir la Configuration Actuelle

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 6 (View Current Configuration)
```

Affiche :
- TomTom API Key (masqué)
- AWS Credentials (masqués)
- Google Vision Credentials (chemin)

---

## Déploiement

### Déployer sur AWS Elastic Beanstalk

```bash
bash scripts/configure-external-services.sh
# Sélectionnez l'option 7 (Deploy to AWS Elastic Beanstalk)
```

**Le script va :**
1. Charger la configuration depuis `.env.external-services`
2. Détecter si `eb` CLI ou `aws` CLI est disponible
3. Exécuter les commandes appropriées pour déployer les variables
4. Redémarrer l'environnement AWS EB

**Déploiement manuel (EB CLI) :**

```bash
# Toutes les variables en une commande
eb setenv \
  TOMTOM_API_KEY=votre-api-key \
  AWS_ACCESS_KEY_ID=AKIAXXXX \
  AWS_SECRET_ACCESS_KEY=wJalrXXX \
  AWS_REGION=eu-central-1 \
  GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json \
  OCR_PROVIDER=AWS_TEXTRACT \
  OCR_ENABLE_FALLBACK=true

# Vérifier
eb printenv
```

**Déploiement manuel (AWS CLI) :**

```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=TOMTOM_API_KEY,Value=votre-api-key \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_ACCESS_KEY_ID,Value=AKIAXXXX \
    # ... autres variables
```

---

## Fichiers Générés

Le script génère les fichiers suivants :

### .env.external-services

Fichier de configuration local avec toutes les variables :

```bash
# RT SYMPHONI.A - External Services Configuration
# Generated on: 2024-11-26

# TomTom Configuration
TOMTOM_API_KEY=abc123def456...
TOMTOM_TRACKING_API_URL=https://api.tomtom.com/tracking/1

# AWS Textract Configuration
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/...
AWS_REGION=eu-central-1
OCR_PROVIDER=AWS_TEXTRACT

# Google Vision API Configuration
GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json
OCR_ENABLE_FALLBACK=true
```

**⚠️ IMPORTANT :** Ce fichier contient des secrets. NE PAS commiter dans Git !

Ajoutez au `.gitignore` :
```
.env.external-services
google-credentials.json
.ebextensions/*.config
!.ebextensions/*.config.example
```

---

## Sécurité

### Bonnes Pratiques

1. **Ne jamais commiter les secrets dans Git**
   ```bash
   # Ajoutez au .gitignore
   .env.external-services
   google-credentials.json
   .ebextensions/*.config
   ```

2. **Utiliser AWS Secrets Manager en production**
   ```bash
   # Stocker les secrets
   aws secretsmanager create-secret \
     --name rt-symphonia/tomtom-api-key \
     --secret-string "votre-api-key"

   # Les récupérer au runtime
   TOMTOM_API_KEY=$(aws secretsmanager get-secret-value \
     --secret-id rt-symphonia/tomtom-api-key \
     --query SecretString --output text)
   ```

3. **Restreindre les permissions IAM**
   - Utilisateur IAM avec permissions minimales
   - Pas de permissions `*:*`
   - Rotation régulière des clés

4. **Rotation des secrets**
   - TomTom API Key : tous les 90 jours
   - AWS Access Keys : tous les 90 jours
   - Google Service Account : tous les 180 jours

5. **Monitoring des accès**
   - CloudWatch Logs
   - AWS CloudTrail
   - Google Cloud Audit Logs

---

## Dépannage

### Le script ne démarre pas

```bash
# Vérifier les permissions
chmod +x scripts/configure-external-services.sh

# Vérifier Bash
bash --version  # Doit être >= 4.0

# Sur Windows, utiliser Git Bash ou WSL
```

### Erreur : "Command not found"

```bash
# Installer les outils manquants
pip install awscli
pip install awsebcli

# Ou utiliser le script sans ces outils
# (configuration manuelle via console AWS)
```

### Les variables ne sont pas déployées

```bash
# Vérifier la configuration AWS CLI
aws configure list

# Vérifier les permissions EB
aws elasticbeanstalk describe-environments

# Vérifier manuellement dans la console AWS
# Elastic Beanstalk → Configuration → Software → Environment properties
```

### Tests échouent

```bash
# Test TomTom : vérifier l'API Key
curl "https://api.tomtom.com/routing/1/calculateRoute/48.8566,2.3522:45.7640,4.8357/json?key=VOTRE-KEY"

# Test AWS : vérifier les credentials
aws sts get-caller-identity

# Test avec variables d'environnement
export AWS_ACCESS_KEY_ID=AKIAXXXX
export AWS_SECRET_ACCESS_KEY=wJalrXXX
aws sts get-caller-identity
```

---

## Support

### Documentation Complète

- **TomTom** : `CONFIGURATION_TOMTOM_TELEMATICS.md`
- **AWS & Google** : `CONFIGURATION_OCR_AWS_GOOGLE.md`
- **Tests** : `tests/external-services.test.js`

### Ressources Externes

- TomTom Developer Portal : https://developer.tomtom.com
- AWS Textract : https://aws.amazon.com/textract
- Google Cloud Vision : https://cloud.google.com/vision

### Contact

- Email : support@rt-technologie.com
- Documentation interne : Confluence → RT SYMPHONI.A

---

**Dernière mise à jour** : 2024-11-26
**Auteur** : RT SYMPHONI.A DevOps Team
