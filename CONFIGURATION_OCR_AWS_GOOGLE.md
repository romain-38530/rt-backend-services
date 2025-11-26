# CONFIGURATION OCR - AWS Textract & Google Vision API

## 📷 Vue d'ensemble

Le service **OCR Integration** (ocr-integration-service.js) permet l'extraction automatique de données depuis les documents de transport (BL, CMR, POD) en utilisant:
- **AWS Textract** (primaire, recommandé pour production)
- **Google Vision API** (fallback/alternative)
- **Azure Form Recognizer** (alternative, architecture prête)

**Service concerné:** `ocr-integration-service.js` (v1.6.1)

---

## 🎯 Capacités d'Extraction

### Documents supportés
- **BL (Bon de Livraison)**
  - Numéro BL
  - Date de livraison
  - Quantité livrée
  - Poids total
  - Réserves éventuelles

- **CMR (Convention de Marchandises par Route)**
  - Numéro CMR
  - Expéditeur (nom, adresse)
  - Destinataire (nom, adresse)
  - Transporteur
  - Date d'expédition

- **POD (Proof of Delivery)**
  - Numéro POD
  - Signatures (détection avancée AWS)
  - Date de réception
  - Nom du réceptionnaire
  - Réserves clients

---

## ☁️ OPTION 1: AWS Textract (Recommandé)

### Avantages
- ✅ **Détection de signatures** avancée (SIGNATURE feature type)
- ✅ **Tables et formulaires** (FORMS, TABLES feature types)
- ✅ **Précision élevée** (~95%+ sur documents structurés)
- ✅ **Intégration AWS** (même région qu'Elastic Beanstalk)
- ✅ **Tarification raisonnable** (1.50$/1000 pages Forms, 1$/1000 pages Tables)

### Prix AWS Textract
| Opération | Prix | Volume inclus (Free Tier 12 mois) |
|-----------|------|-----------------------------------|
| Detect Document Text | 0.0015$/page | 1,000 pages/mois |
| Analyze Document (Forms) | 0.0650$/page | 100 pages/mois |
| Analyze Document (Tables) | 0.0150$/page | 100 pages/mois |

**Estimation pour SYMPHONI.A:**
- 10 commandes/jour × 3 documents (BL+CMR+POD) = 30 docs/jour = 900/mois
- Coût: 900 × 0.065$ = **58.50$/mois** (Forms + Tables + Signatures)

---

### Étape 1.1: Créer un Utilisateur IAM AWS

1. **Se connecter à AWS Console**
   - Région: eu-central-1 (Francfort)

2. **Aller dans IAM** → Users → Create User
   - User name: `symphonia-textract-user`
   - Access type: ✅ Programmatic access

3. **Attacher les permissions**
   - Option 1 (Simple): Attach existing policy: `AmazonTextractFullAccess`
   - Option 2 (Sécurisé): Créer une policy personnalisée:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::rt-transport-documents/*"
    }
  ]
}
```

4. **Récupérer les credentials**
   - Access Key ID: `AKIAIOSFODNN7EXAMPLE`
   - Secret Access Key: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`

⚠️ **Sauvegarder ces clés en sécurité !**

---

### Étape 1.2: Configurer AWS EB avec Textract

```bash
cd "c:\Users\rtard\rt-backend-services"

# Configurer les variables d'environnement
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_ACCESS_KEY_ID,Value="AKIAIOSFODNN7EXAMPLE" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_SECRET_ACCESS_KEY,Value="wJalrXUtnFEMI/K7MDENG/..." \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=AWS_REGION,Value="eu-central-1" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=OCR_PROVIDER,Value="AWS_TEXTRACT" \
  --region eu-central-1

echo "✅ Variables AWS Textract configurées"
```

---

### Étape 1.3: Installer le SDK AWS (déjà fait)

Le fichier `package.json` doit contenir:
```json
{
  "dependencies": {
    "aws-sdk": "^2.1691.0"
  }
}
```

**Vérification:**
```bash
cd services/subscriptions-contracts-eb
cat package.json | grep aws-sdk
```

---

### Étape 1.4: Tester AWS Textract

```bash
# Test via API
curl -X POST https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com/api/transport-orders/ORDER_ID/documents/DOC_ID/ocr/extract \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "provider": "AWS_TEXTRACT",
    "documentType": "BL"
  }'
```

**Réponse attendue (200 OK):**
```json
{
  "success": true,
  "documentId": "DOC_ID",
  "orderId": "ORDER_ID",
  "provider": "AWS_TEXTRACT",
  "extractedData": {
    "blNumber": "BL-20251125-001",
    "deliveryDate": "2025-11-25",
    "quantity": 150,
    "weight": 2500,
    "unit": "kg",
    "reserves": null,
    "signatures": [
      {
        "type": "SIGNATURE",
        "confidence": 98.5,
        "boundingBox": { ... }
      }
    ]
  },
  "confidence": 96.3,
  "extractedAt": "2025-11-25T22:00:00.000Z"
}
```

---

## 🌐 OPTION 2: Google Vision API (Alternative)

### Avantages
- ✅ **OCR multilingue** (50+ langues)
- ✅ **Détection de texte** manuscrit et imprimé
- ✅ **API simple** et bien documentée
- ✅ **Prix compétitif** (1.50$/1000 images pour OCR)

### Prix Google Vision
| Fonctionnalité | Prix | Volume inclus (Free) |
|----------------|------|----------------------|
| Text Detection (OCR) | 1.50$/1000 images | 1,000 images/mois |
| Document Text Detection | 2.50$/1000 images | 1,000 images/mois |

**Estimation pour SYMPHONI.A:**
- 900 documents/mois × 2.50$ = **2.25$/mois** (plus économique qu'AWS !)

---

### Étape 2.1: Activer Google Vision API

1. **Aller sur Google Cloud Console**
   - https://console.cloud.google.com

2. **Créer un projet**
   - Project name: `symphonia-transport`
   - Project ID: `symphonia-transport-123456`

3. **Activer Vision API**
   - API & Services → Library
   - Chercher: "Cloud Vision API"
   - Cliquer: Enable

4. **Créer un Service Account**
   - IAM & Admin → Service Accounts
   - Create Service Account: `symphonia-vision-sa`
   - Role: `Cloud Vision API User`

5. **Créer une clé JSON**
   - Actions → Manage Keys → Add Key → Create new key → JSON
   - Télécharger le fichier: `symphonia-vision-credentials.json`

---

### Étape 2.2: Configurer AWS EB avec Google Vision

**Option A: Via fichier credentials JSON**

1. Uploader le fichier JSON sur S3:
```bash
aws s3 cp symphonia-vision-credentials.json s3://rt-config-files/google-vision-credentials.json
```

2. Configurer le chemin:
```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=GOOGLE_APPLICATION_CREDENTIALS,Value="/var/app/credentials/google-vision-credentials.json" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=OCR_PROVIDER,Value="GOOGLE_VISION" \
  --region eu-central-1
```

**Option B: Via API Key (plus simple)**

1. Créer une API Key dans Google Cloud Console
2. Configurer:
```bash
aws elasticbeanstalk update-environment \
  --environment-name rt-subscriptions-api-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=GOOGLE_VISION_API_KEY,Value="AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=OCR_PROVIDER,Value="GOOGLE_VISION" \
  --region eu-central-1
```

---

### Étape 2.3: Installer le SDK Google (déjà fait)

Le fichier `package.json` doit contenir:
```json
{
  "dependencies": {
    "@google-cloud/vision": "^4.3.2"
  }
}
```

---

### Étape 2.4: Tester Google Vision

```bash
curl -X POST https://rt-subscriptions-api-prod.../api/transport-orders/ORDER_ID/documents/DOC_ID/ocr/extract \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "GOOGLE_VISION",
    "documentType": "CMR"
  }'
```

---

## 🔄 Fallback Automatique

Le code `ocr-integration-service.js` gère automatiquement le fallback:

```javascript
// Ligne 650-690
async function processDocument(db, orderId, documentId, options = {}) {
  try {
    // Tenter AWS Textract (primaire)
    if (provider === 'AWS_TEXTRACT') {
      result = await extractBLFieldsAWS(imageBuffer, options);
    }

    // Fallback vers Google Vision si AWS échoue
    if (!result.success && process.env.GOOGLE_VISION_API_KEY) {
      console.log('AWS Textract failed, falling back to Google Vision');
      result = await extractBLFieldsGoogle(imageBuffer, options);
    }

    return result;
  } catch (error) {
    console.error('OCR processing failed:', error);
    return { success: false, error: error.message };
  }
}
```

---

## 🧪 Tests de Validation

### Test 1: Upload d'un document

```bash
# 1. Uploader un BL (image ou PDF)
curl -X POST https://rt-subscriptions-api-prod.../api/transport-orders/ORDER_ID/documents \
  -H "Content-Type: application/json" \
  -d '{
    "type": "BL",
    "fileName": "bl-20251125-001.pdf",
    "fileUrl": "https://s3.amazonaws.com/rt-documents/bl-20251125-001.pdf"
  }'

# Réponse: { "success": true, "documentId": "DOC_ID" }
```

### Test 2: Extraction OCR

```bash
# 2. Lancer l'extraction OCR
curl -X POST https://rt-subscriptions-api-prod.../api/transport-orders/ORDER_ID/documents/DOC_ID/ocr/extract \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "AWS_TEXTRACT",
    "documentType": "BL"
  }'

# Réponse: { "success": true, "extractedData": { ... } }
```

### Test 3: Récupérer les résultats

```bash
# 3. Récupérer les données extraites
curl -X GET https://rt-subscriptions-api-prod.../api/transport-orders/ORDER_ID/documents/DOC_ID/ocr/results

# Réponse: { "success": true, "ocrData": { ... }, "confidence": 96.3 }
```

---

## 📊 Comparaison AWS vs Google

| Critère | AWS Textract | Google Vision | Recommandation |
|---------|--------------|---------------|----------------|
| **Prix** | 58.50$/mois | 2.25$/mois | 🏆 Google |
| **Précision** | 95-98% | 92-95% | 🏆 AWS |
| **Signatures** | ✅ Détection native | ❌ Pas de détection | 🏆 AWS |
| **Tables** | ✅ Excellente | ⚠️ Basique | 🏆 AWS |
| **Formulaires** | ✅ Excellente | ⚠️ Basique | 🏆 AWS |
| **Multilingue** | ⚠️ Limité | ✅ 50+ langues | 🏆 Google |
| **Région AWS** | ✅ Même région | ❌ Externe | 🏆 AWS |
| **Latence** | ~1-2s | ~2-3s | 🏆 AWS |

**🎯 Recommandation finale:** **AWS Textract** pour production (signatures + tables + précision), avec **Google Vision** en fallback.

---

## 🔒 Sécurité & Bonnes Pratiques

### 1. Stockage sécurisé des clés

**AWS Systems Manager Parameter Store:**
```bash
# Stocker les credentials de manière sécurisée
aws ssm put-parameter \
  --name "/symphonia/ocr/aws-access-key" \
  --value "AKIAIOSFODNN7EXAMPLE" \
  --type "SecureString" \
  --region eu-central-1

aws ssm put-parameter \
  --name "/symphonia/ocr/aws-secret-key" \
  --value "wJalrXUtnFEMI/K7MDENG/..." \
  --type "SecureString" \
  --region eu-central-1
```

### 2. Rotation des clés

- ⚠️ Changer les clés API tous les 90 jours
- ✅ Utiliser IAM roles si possible (au lieu de clés statiques)
- ✅ Activer CloudTrail pour audit des appels Textract

### 3. Limites de rate

| Service | Limite | Action si dépassée |
|---------|--------|-------------------|
| AWS Textract | 1 requête/sec (default) | Demander augmentation |
| Google Vision | 1,800 requêtes/min | Implémenter retry avec backoff |

---

## 📝 Variables d'Environnement Complètes

```bash
# AWS Textract (Primaire)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/...
AWS_REGION=eu-central-1

# Google Vision (Fallback)
GOOGLE_VISION_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
# OU
GOOGLE_APPLICATION_CREDENTIALS=/var/app/credentials/google-vision-credentials.json

# Provider par défaut
OCR_PROVIDER=AWS_TEXTRACT

# S3 pour stockage documents (optionnel)
DOCUMENTS_BUCKET=rt-transport-documents
```

---

## 🐛 Dépannage

### Problème 1: "AWS SDK not found"

**Solution:**
```bash
cd services/subscriptions-contracts-eb
npm install aws-sdk --save
git add package.json package-lock.json
git commit -m "feat: Add aws-sdk for Textract"
# Redéployer
```

### Problème 2: "Access Denied" AWS

**Causes:**
- Clés AWS incorrectes
- Permissions IAM insuffisantes
- Région incorrecte

**Solution:**
1. Vérifier les clés dans AWS Console
2. Vérifier les permissions IAM (AmazonTextractFullAccess)
3. Vérifier `AWS_REGION=eu-central-1`

### Problème 3: "Google credentials not found"

**Solution:**
```bash
# Vérifier que le fichier JSON existe
ls -la /var/app/credentials/google-vision-credentials.json

# OU utiliser API Key au lieu de credentials file
export GOOGLE_VISION_API_KEY="AIzaSy..."
```

### Problème 4: Faible confiance (<80%)

**Causes:**
- Document de mauvaise qualité (flou, résolution basse)
- Texte manuscrit difficile à lire
- Format de document non standard

**Solutions:**
- Demander une meilleure qualité d'image (300 DPI minimum)
- Utiliser Google Vision pour texte manuscrit
- Valider manuellement les résultats <80% confiance

---

## 📚 Ressources

- [AWS Textract Documentation](https://docs.aws.amazon.com/textract/)
- [Google Vision API Documentation](https://cloud.google.com/vision/docs)
- [AWS Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [Google Vision Pricing](https://cloud.google.com/vision/pricing)
- [Code source: ocr-integration-service.js](./services/subscriptions-contracts-eb/ocr-integration-service.js)

---

## ✅ Checklist Configuration

**AWS Textract:**
- [ ] Utilisateur IAM créé avec permissions Textract
- [ ] Access Key ID et Secret Key récupérées
- [ ] Variables d'environnement configurées dans AWS EB
- [ ] Application redémarrée
- [ ] Test d'extraction réussi
- [ ] Confiance > 90% sur documents tests

**Google Vision (Optionnel):**
- [ ] Projet Google Cloud créé
- [ ] Vision API activée
- [ ] Service Account créé
- [ ] Fichier JSON credentials téléchargé
- [ ] Variables configurées dans AWS EB
- [ ] Test d'extraction réussi

**Général:**
- [ ] Fallback AWS → Google testé
- [ ] Logs CloudWatch vérifiés
- [ ] Monitoring configuré
- [ ] Documentation complétée
- [ ] Équipe formée sur l'OCR

---

**Configuration créée le:** 25 novembre 2025
**Par:** Claude Code (Anthropic)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
