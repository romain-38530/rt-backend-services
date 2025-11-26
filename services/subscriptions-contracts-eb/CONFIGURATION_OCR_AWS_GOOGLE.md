# Configuration OCR - AWS Textract & Google Vision API
## Guide Complet - RT SYMPHONI.A Document Intelligence

---

## Table des Matières

1. [Présentation](#présentation)
2. [Coûts et Tarification](#coûts-et-tarification)
3. [Architecture OCR](#architecture-ocr)
4. [Configuration AWS Textract (Primary)](#configuration-aws-textract-primary)
5. [Configuration Google Vision API (Fallback)](#configuration-google-vision-api-fallback)
6. [Variables d'Environnement](#variables-denvironnement)
7. [Tests de Validation](#tests-de-validation)
8. [Budget Alerts](#budget-alerts)
9. [Monitoring et Performance](#monitoring-et-performance)
10. [Dépannage](#dépannage)

---

## Présentation

### Objectif

Extraction automatique de données depuis les documents de transport (BL, CMR, POD) pour automatiser le flux de travail de RT SYMPHONI.A.

### Fonctionnalités

Conformité au cahier des charges (Page 8) :

- **Extraction automatique numéros BL/CMR**
- **Détection signatures**
- **Extraction dates de livraison**
- **Extraction quantités**
- **Détection réserves éventuelles**
- **Validation croisée des informations**

### Architecture Multi-Provider

```
┌──────────────────┐
│  Document Upload │
│  (BL, CMR, POD)  │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AWS Textract    │  ← Provider Primary (Recommandé)
│  (High Accuracy) │
└────────┬─────────┘
         │ Error?
         ▼
┌──────────────────┐
│ Google Vision    │  ← Fallback Provider
│ (Alternative)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Extracted Data  │
│  (Structured)    │
└──────────────────┘
```

### Comparaison des Providers

| Critère | AWS Textract | Google Vision API |
|---------|--------------|-------------------|
| **Précision** | 95-98% | 90-95% |
| **Détection signatures** | ✅ Native | ⚠️ Basique (mots-clés) |
| **Détection tables** | ✅ Excellente | ⚠️ Moyenne |
| **Formulaires structurés** | ✅ Excellente | ⚠️ Moyenne |
| **Coût par page** | ~0.0058€ | ~0.0002€ |
| **Recommandation** | ✅ **Primary** | ⚠️ **Fallback** |

---

## Coûts et Tarification

### AWS Textract (Primary Provider)

#### Modèle de Tarification

| Type d'Analyse | Coût par Page | Volume Mensuel (10k pages) | Coût Mensuel |
|----------------|---------------|----------------------------|--------------|
| **Detect Document Text** | $0.0015 | 10,000 | **$15** (~14€) |
| **Analyze Document (Forms)** | $0.050 | 10,000 | **$50** (~47€) |
| **Analyze Document (Tables)** | $0.015 | 10,000 | **$15** (~14€) |
| **TOTAL (Forms + Tables)** | **$0.065** | **10,000** | **$650** (~**58€**) |

**Note** : Tarifs région us-east-1 / eu-central-1 (similaires)

#### Calcul pour RT SYMPHONI.A

Hypothèse : 10,000 documents/mois (BL + CMR)

```
Scénario réaliste :
- 7,000 BL (Bons de Livraison) → Forms + Tables
- 3,000 CMR (Lettres de Voiture) → Forms + Tables + Signatures
────────────────────────────────────────────────────────────
Coût AWS Textract :
- Forms : 10,000 × $0.050 = $500
- Tables : 10,000 × $0.015 = $150
────────────────────────────────────────────────────────────
TOTAL : $650/mois (~58€/mois)
```

#### Free Tier AWS

⚠️ **Attention** : AWS Textract n'a **PAS de Free Tier permanent**

Offre ponctuelle pour nouveaux comptes AWS :
- 1,000 pages gratuites/mois pendant 3 mois
- Puis tarification normale

### Google Vision API (Fallback Provider)

#### Modèle de Tarification

| Type d'Analyse | Coût par 1000 Images | Volume Mensuel (10k images) | Coût Mensuel |
|----------------|----------------------|-----------------------------|--------------|
| **Document Text Detection** | $1.50 | 10,000 | **$15** (~**14€**) |
| **First 1,000/month** | **GRATUIT** | 1,000 | $0 |

**Note** : Beaucoup moins cher, mais précision inférieure (90% vs 98%)

#### Calcul pour RT SYMPHONI.A

```
Scénario Fallback (Google Vision utilisé à 20% seulement) :
- 2,000 documents/mois en fallback (AWS Textract échoue)
- 1,000 documents gratuits
- 1,000 documents payants
────────────────────────────────────────────────────────────
Coût Google Vision :
- (2,000 - 1,000) × $0.0015 = $1.50
────────────────────────────────────────────────────────────
TOTAL : $1.50/mois (~1.40€/mois)
```

### Coût Total Estimé

| Provider | Utilisation | Coût Mensuel | Coût Annuel |
|----------|-------------|--------------|-------------|
| **AWS Textract (Primary)** | 80% (8,000 docs) | **46€** | **552€** |
| **Google Vision (Fallback)** | 20% (2,000 docs) | **1.40€** | **17€** |
| **TOTAL OCR** | 10,000 docs/mois | **~48€/mois** | **~570€/an** |

---

## Architecture OCR

### Workflow d'Extraction

```
1. Client Upload Document
   └─> POST /api/documents/upload

2. Backend reçoit le fichier
   └─> Stockage temporaire (Buffer)

3. Tentative 1 : AWS Textract
   ├─> Succès ? → Extraction des données
   └─> Échec ? → Tentative 2

4. Tentative 2 : Google Vision API (Fallback)
   ├─> Succès ? → Extraction des données
   └─> Échec ? → Erreur + Log

5. Enregistrement dans MongoDB
   └─> Collection: documents
       {
         ocrData: { ... },
         ocrProvider: 'AWS_TEXTRACT',
         ocrConfidence: 96.5,
         ocrExtractedAt: Date
       }

6. Réponse au client
   └─> JSON avec données extraites
```

### Structure des Données Extraites

```json
{
  "success": true,
  "provider": "AWS_TEXTRACT",
  "confidence": 96.5,
  "data": {
    "blNumber": {
      "value": "BL-2024-11-001234",
      "confidence": 98.2
    },
    "deliveryDate": {
      "value": "26/11/2024",
      "confidence": 97.5
    },
    "quantity": {
      "value": "24",
      "confidence": 99.1
    },
    "weight": {
      "value": "1500",
      "confidence": 98.8
    },
    "recipient": {
      "value": "RT SYMPHONI.A Transport",
      "confidence": 95.3
    },
    "reserves": {
      "value": "Aucune réserve",
      "confidence": 92.1
    },
    "signatures": {
      "detected": true,
      "count": 2,
      "positions": [
        {
          "confidence": 94.5,
          "boundingBox": {
            "left": 0.1,
            "top": 0.8,
            "width": 0.15,
            "height": 0.05
          }
        }
      ]
    }
  }
}
```

---

## Configuration AWS Textract (Primary)

### Prérequis

- [ ] Compte AWS actif
- [ ] Accès administrateur AWS (ou IAM avec permissions Textract)
- [ ] AWS CLI installé (optionnel, recommandé)

### Étape 1 : Créer un Utilisateur IAM pour Textract

#### Via Console AWS (Interface Graphique)

1. **Connectez-vous à AWS Console** : https://console.aws.amazon.com

2. **Accédez à IAM** :
   ```
   Services → IAM (Identity and Access Management)
   ```

3. **Créez un utilisateur** :
   - Cliquez sur "Users" → "Add users"
   - **User name** : `rt-symphonia-textract-user`
   - **Access type** : ✅ Access key - Programmatic access
   - Cliquez "Next: Permissions"

4. **Attribuez les permissions** :

   **Option A : Policy prédéfinie (Recommandé pour démarrer)**
   - Cliquez "Attach existing policies directly"
   - Recherchez et cochez : `AmazonTextractFullAccess`

   **Option B : Policy personnalisée (Recommandé pour production)**
   - Cliquez "Create policy"
   - Mode JSON :
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "textract:AnalyzeDocument",
           "textract:DetectDocumentText",
           "textract:GetDocumentAnalysis",
           "textract:GetDocumentTextDetection"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "s3:GetObject",
           "s3:PutObject"
         ],
         "Resource": "arn:aws:s3:::rt-ecmr-documents/*"
       }
     ]
   }
   ```
   - Nommez la policy : `RT-SYMPHONIA-Textract-Policy`

5. **Récupérez les credentials** :
   - Après création, AWS affiche :
     - **Access Key ID** : `AKIAIOSFODNN7EXAMPLE`
     - **Secret Access Key** : `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
   - ⚠️ **IMPORTANT** : Copiez immédiatement ces valeurs, elles ne seront plus affichées !
   - Téléchargez le fichier CSV pour backup

#### Via AWS CLI (Ligne de Commande)

```bash
# 1. Créer l'utilisateur IAM
aws iam create-user --user-name rt-symphonia-textract-user

# 2. Créer la policy
cat > textract-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument",
        "textract:DetectDocumentText"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name RT-SYMPHONIA-Textract-Policy \
  --policy-document file://textract-policy.json

# 3. Attacher la policy à l'utilisateur
aws iam attach-user-policy \
  --user-name rt-symphonia-textract-user \
  --policy-arn arn:aws:iam::004843574253:policy/RT-SYMPHONIA-Textract-Policy

# 4. Créer les access keys
aws iam create-access-key \
  --user-name rt-symphonia-textract-user

# Sortie :
# {
#   "AccessKey": {
#     "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
#     "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
#   }
# }
```

### Étape 2 : Configurer les Variables dans AWS Elastic Beanstalk

#### Via Console AWS

1. **Elastic Beanstalk** → **rt-subscriptions-api-prod** → **Configuration** → **Software** → **Edit**

2. **Ajoutez les variables AWS Textract** :

   | Name | Value | Description |
   |------|-------|-------------|
   | `AWS_ACCESS_KEY_ID` | `AKIAIOSFODNN7EXAMPLE` | Access Key de l'utilisateur IAM Textract |
   | `AWS_SECRET_ACCESS_KEY` | `wJalrXUtnFEMI/K7MDENG/...` | Secret Access Key (ne jamais partager !) |
   | `AWS_REGION` | `eu-central-1` | Région AWS (Frankfurt pour l'Europe) |
   | `OCR_PROVIDER` | `AWS_TEXTRACT` | Provider OCR par défaut |

3. **Cliquez sur "Apply"**

#### Via EB CLI

```bash
# Configurer toutes les variables AWS Textract
eb setenv \
  AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE \
  AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  AWS_REGION=eu-central-1 \
  OCR_PROVIDER=AWS_TEXTRACT

# Vérifier
eb printenv | grep -E '(AWS_|OCR_)'
```

### Étape 3 : Installer le SDK AWS dans le Projet

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# Installer aws-sdk
npm install aws-sdk --save

# Vérifier l'installation
npm list aws-sdk
```

### Étape 4 : Test AWS Textract

Créez un script de test :

```javascript
// test-aws-textract.js
const AWS = require('aws-sdk');
const fs = require('fs');

// Configuration
const textract = new AWS.Textract({
  region: process.env.AWS_REGION || 'eu-central-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

async function testTextract() {
  try {
    // Lire un document de test (BL exemple)
    const imageBuffer = fs.readFileSync('./test-documents/bl-example.png');

    const params = {
      Document: { Bytes: imageBuffer },
      FeatureTypes: ['FORMS', 'TABLES', 'SIGNATURES']
    };

    console.log('⏳ Analyzing document with AWS Textract...');
    const result = await textract.analyzeDocument(params).promise();

    console.log('✅ Success!');
    console.log(`📄 Blocks detected: ${result.Blocks.length}`);
    console.log(`📊 Document confidence: ${getAverageConfidence(result.Blocks)}%`);

    // Afficher les signatures détectées
    const signatures = result.Blocks.filter(b => b.BlockType === 'SIGNATURE');
    console.log(`✍️ Signatures detected: ${signatures.length}`);

    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

function getAverageConfidence(blocks) {
  const confidences = blocks.filter(b => b.Confidence).map(b => b.Confidence);
  const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return Math.round(avg * 100) / 100;
}

// Exécuter le test
testTextract()
  .then(() => console.log('✅ Test completed'))
  .catch(() => process.exit(1));
```

Exécutez :

```bash
node test-aws-textract.js
```

**Sortie attendue** :

```
⏳ Analyzing document with AWS Textract...
✅ Success!
📄 Blocks detected: 247
📊 Document confidence: 96.78%
✍️ Signatures detected: 2
✅ Test completed
```

---

## Configuration Google Vision API (Fallback)

### Prérequis

- [ ] Compte Google Cloud actif
- [ ] Carte de crédit (pour vérification, mais Free Tier disponible)

### Étape 1 : Créer un Projet Google Cloud

#### Via Console Google Cloud

1. **Accédez à Google Cloud Console** : https://console.cloud.google.com

2. **Créez un nouveau projet** :
   - Cliquez sur le sélecteur de projet (en haut)
   - Cliquez "New Project"
   - **Project name** : `rt-symphonia-ocr`
   - **Project ID** : `rt-symphonia-ocr` (sera peut-être modifié par Google)
   - **Location** : Choisissez votre organisation (ou "No organization")
   - Cliquez "Create"

3. **Sélectionnez le projet** :
   - Cliquez sur le sélecteur de projet
   - Sélectionnez `rt-symphonia-ocr`

### Étape 2 : Activer l'API Vision

1. **Accédez à la bibliothèque d'API** :
   ```
   Navigation menu → APIs & Services → Library
   ```

2. **Recherchez "Vision API"** :
   - Tapez "Vision" dans la barre de recherche
   - Cliquez sur "Cloud Vision API"

3. **Activez l'API** :
   - Cliquez sur "Enable"
   - Attendez ~30 secondes pour l'activation

### Étape 3 : Créer un Service Account

1. **Accédez aux Credentials** :
   ```
   APIs & Services → Credentials
   ```

2. **Créez un Service Account** :
   - Cliquez "Create Credentials" → "Service account"
   - **Service account name** : `rt-symphonia-vision-sa`
   - **Service account ID** : `rt-symphonia-vision-sa` (auto-généré)
   - **Description** : `Service account for OCR document processing`
   - Cliquez "Create and Continue"

3. **Attribuez les rôles** :
   - **Role** : Cloud Vision AI → `Cloud Vision API User`
   - Cliquez "Continue"
   - Cliquez "Done"

4. **Créez une clé JSON** :
   - Dans la liste des service accounts, cliquez sur `rt-symphonia-vision-sa`
   - Onglet "Keys" → "Add Key" → "Create new key"
   - **Key type** : JSON
   - Cliquez "Create"
   - Un fichier JSON est téléchargé : `rt-symphonia-ocr-xxxxx.json`

5. **Sauvegardez le fichier JSON** :
   ```
   Fichier téléchargé : rt-symphonia-ocr-xxxxx.json
   Contenu :
   {
     "type": "service_account",
     "project_id": "rt-symphonia-ocr",
     "private_key_id": "abc123...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com",
     "client_id": "123456789...",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
   }
   ```

### Étape 4 : Configurer le Service Account dans AWS

Vous avez 2 options pour utiliser le fichier JSON de credentials :

#### Option A : Stocker le JSON dans S3 (Recommandé)

```bash
# 1. Uploader le fichier JSON dans S3
aws s3 cp rt-symphonia-ocr-xxxxx.json \
  s3://elasticbeanstalk-eu-central-1-004843574253/google-credentials/

# 2. Configurer le chemin dans EB
eb setenv GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json

# 3. Ajouter un script de déploiement pour télécharger le fichier
# Créer : .ebextensions/google-credentials.config
```

Contenu de `.ebextensions/google-credentials.config` :

```yaml
files:
  "/var/app/current/google-credentials.json":
    mode: "000400"
    owner: webapp
    group: webapp
    content: |
      {
        "type": "service_account",
        "project_id": "rt-symphonia-ocr",
        "private_key_id": "VOTRE_PRIVATE_KEY_ID",
        "private_key": "-----BEGIN PRIVATE KEY-----\nVOTRE_PRIVATE_KEY\n-----END PRIVATE KEY-----\n",
        "client_email": "rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com",
        "client_id": "VOTRE_CLIENT_ID",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token"
      }
```

#### Option B : Utiliser des Variables d'Environnement (Alternative)

```bash
# Extraire les valeurs du JSON et les mettre en variables
eb setenv \
  GOOGLE_CLOUD_PROJECT_ID=rt-symphonia-ocr \
  GOOGLE_CLOUD_CLIENT_EMAIL=rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com \
  GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Étape 5 : Installer le SDK Google Vision

```bash
cd c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb

# Installer @google-cloud/vision
npm install @google-cloud/vision --save

# Vérifier l'installation
npm list @google-cloud/vision
```

### Étape 6 : Test Google Vision API

```javascript
// test-google-vision.js
const vision = require('@google-cloud/vision');
const fs = require('fs');

async function testGoogleVision() {
  try {
    // Configuration
    const client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
    });

    // Lire un document de test
    const imageBuffer = fs.readFileSync('./test-documents/bl-example.png');

    console.log('⏳ Analyzing document with Google Vision...');
    const [result] = await client.documentTextDetection({
      image: { content: imageBuffer.toString('base64') }
    });

    const fullText = result.fullTextAnnotation;

    console.log('✅ Success!');
    console.log(`📄 Text detected: ${fullText.text.substring(0, 100)}...`);
    console.log(`📊 Pages: ${fullText.pages.length}`);
    console.log(`📊 Confidence: ${getGoogleConfidence(fullText)}%`);

    return result;
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

function getGoogleConfidence(fullText) {
  const page = fullText.pages[0];
  const confidences = page.blocks.map(b => b.confidence || 0);
  const avg = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return Math.round(avg * 100);
}

// Exécuter le test
testGoogleVision()
  .then(() => console.log('✅ Test completed'))
  .catch(() => process.exit(1));
```

Exécutez :

```bash
node test-google-vision.js
```

---

## Variables d'Environnement

### Récapitulatif Complet

Ajoutez toutes ces variables dans AWS Elastic Beanstalk :

#### AWS Textract (Primary)

```bash
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=eu-central-1
```

#### Google Vision API (Fallback)

```bash
# Option A : Fichier JSON
GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json

# Option B : Variables individuelles
GOOGLE_CLOUD_PROJECT_ID=rt-symphonia-ocr
GOOGLE_CLOUD_CLIENT_EMAIL=rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com
GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

#### Configuration Générale

```bash
# Provider par défaut
OCR_PROVIDER=AWS_TEXTRACT

# Enable/Disable fallback
OCR_ENABLE_FALLBACK=true
```

### Commande Unique (EB CLI)

```bash
eb setenv \
  AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE \
  AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  AWS_REGION=eu-central-1 \
  GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json \
  OCR_PROVIDER=AWS_TEXTRACT \
  OCR_ENABLE_FALLBACK=true
```

---

## Tests de Validation

### Test 1 : Extraction BL (Bon de Livraison)

```bash
curl -X POST "https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/documents/ocr-extract" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-documents/bl-example.png" \
  -F "documentType=BL"
```

**Réponse attendue** :

```json
{
  "success": true,
  "provider": "AWS_TEXTRACT",
  "confidence": 96.8,
  "data": {
    "blNumber": {
      "value": "BL-2024-001234",
      "confidence": 98.2
    },
    "deliveryDate": {
      "value": "26/11/2024",
      "confidence": 97.5
    },
    "quantity": {
      "value": "24",
      "confidence": 99.1
    },
    "signatures": {
      "detected": true,
      "count": 2
    }
  }
}
```

### Test 2 : Extraction CMR (Lettre de Voiture)

```bash
curl -X POST "https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/documents/ocr-extract" \
  -H "Authorization: Bearer YOUR-JWT-TOKEN" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test-documents/cmr-example.pdf" \
  -F "documentType=CMR"
```

### Test 3 : Fallback (Google Vision)

Simulez une erreur AWS pour tester le fallback :

```bash
# Temporairement invalider la clé AWS
eb setenv AWS_ACCESS_KEY_ID=INVALID_KEY

# Tester → Devrait utiliser Google Vision
curl -X POST "..." -F "file=@test-documents/bl-example.png" -F "documentType=BL"

# Réponse attendue avec fallback :
# {
#   "success": true,
#   "provider": "GOOGLE_VISION",
#   "fallback": true,
#   ...
# }

# Restaurer la vraie clé AWS
eb setenv AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
```

---

## Budget Alerts

### AWS Cost Explorer

1. **Accédez à AWS Cost Explorer** :
   ```
   AWS Console → Billing → Cost Explorer
   ```

2. **Créez un Budget pour Textract** :
   - Billing → Budgets → Create budget
   - **Budget type** : Cost budget
   - **Budget name** : `RT-SYMPHONIA-Textract-Monthly`
   - **Period** : Monthly
   - **Budget amount** : 100€
   - **Alert threshold** : 80% (80€)
   - **Email** : votre-email@rt-group.com

### Google Cloud Budgets

1. **Accédez à Google Cloud Billing** :
   ```
   Google Cloud Console → Billing → Budgets & alerts
   ```

2. **Créez un Budget** :
   - **Budget name** : `RT-SYMPHONIA-Vision-Monthly`
   - **Projects** : rt-symphonia-ocr
   - **Services** : Cloud Vision API
   - **Budget amount** : 20€
   - **Alert threshold** : 80% (16€)
   - **Email** : votre-email@rt-group.com

---

## Monitoring et Performance

### Métriques à Surveiller

| Métrique | Cible | Action si Dépassement |
|----------|-------|-----------------------|
| **Temps de réponse OCR** | <3s | Optimiser taille images |
| **Taux de succès AWS** | >95% | Vérifier credentials |
| **Taux de fallback Google** | <20% | Investiguer erreurs AWS |
| **Coût mensuel** | <60€ | Optimiser usage |
| **Confiance moyenne** | >90% | Améliorer qualité images |

### Logs CloudWatch

Créez des métriques personnalisées :

```javascript
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({ region: 'eu-central-1' });

async function logOCRMetric(provider, success, duration) {
  await cloudwatch.putMetricData({
    Namespace: 'RTSYMPHONIA/OCR',
    MetricData: [{
      MetricName: 'OCRRequests',
      Dimensions: [
        { Name: 'Provider', Value: provider },
        { Name: 'Success', Value: success.toString() }
      ],
      Value: 1,
      Unit: 'Count'
    }, {
      MetricName: 'OCRDuration',
      Dimensions: [{ Name: 'Provider', Value: provider }],
      Value: duration,
      Unit: 'Milliseconds'
    }]
  }).promise();
}
```

---

## Dépannage

### Erreur AWS Textract : "AccessDenied"

**Solution** :
1. Vérifiez que l'utilisateur IAM a les bonnes permissions
2. Vérifiez que les credentials sont corrects dans EB

### Erreur Google Vision : "Invalid credentials"

**Solution** :
1. Vérifiez que le fichier JSON est bien déployé
2. Vérifiez la variable `GOOGLE_APPLICATION_CREDENTIALS`

### Erreur : "Document too large"

**Solution** :
```javascript
// Compresser l'image avant envoi
const sharp = require('sharp');
const compressed = await sharp(imageBuffer)
  .resize(2000, 2000, { fit: 'inside' })
  .jpeg({ quality: 85 })
  .toBuffer();
```

---

## Checklist de Configuration

- [ ] Utilisateur IAM AWS créé pour Textract
- [ ] Permissions IAM configurées
- [ ] AWS Access Key et Secret Key obtenus
- [ ] Variables AWS configurées dans EB
- [ ] SDK aws-sdk installé
- [ ] Test AWS Textract réussi
- [ ] Projet Google Cloud créé
- [ ] API Vision activée
- [ ] Service Account créé
- [ ] Fichier JSON credentials téléchargé
- [ ] Credentials Google configurés dans EB
- [ ] SDK @google-cloud/vision installé
- [ ] Test Google Vision réussi
- [ ] Budget alerts configurés (AWS + Google)
- [ ] Monitoring CloudWatch configuré
- [ ] Tests de fallback réussis
- [ ] Documentation équipe complétée

---

**Document créé le** : 2024-11-26
**Auteur** : RT SYMPHONI.A DevOps Team
**Dernière mise à jour** : 2024-11-26
