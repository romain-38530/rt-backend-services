# Guide de Configuration Google Vision API

Version: 1.0.0
Date: 2025-11-26
Auteur: RT SYMPHONI.A Team
Durée estimée: 15 minutes

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Coûts et Tarification](#coûts-et-tarification)
4. [Guide Étape par Étape](#guide-étape-par-étape)
5. [Configuration dans l'Application](#configuration-dans-lapplication)
6. [Tests et Validation](#tests-et-validation)
7. [Dépannage](#dépannage)
8. [FAQ](#faq)

---

## Vue d'Ensemble

Google Cloud Vision API est un service de reconnaissance d'image et OCR alimenté par le Machine Learning de Google.

### Capacités de Vision API

- **OCR (Text Detection)** - Extraction de texte imprimé
- **Document Text Detection** - OCR optimisé pour documents
- **Handwriting Detection** - Détection d'écriture manuscrite
- **Label Detection** - Classification d'images
- **Object Detection** - Détection d'objets
- **Face Detection** - Détection de visages
- **Landmark Detection** - Reconnaissance de monuments

**Pour RT SYMPHONI.A:** Nous utilisons uniquement **DOCUMENT_TEXT_DETECTION**

### Architecture de l'Intégration

```
┌──────────────────┐
│  RT SYMPHONI.A   │
│   Application    │
└────────┬─────────┘
         │ Google Cloud Client Library
         │ Service Account JSON
         ▼
┌──────────────────┐
│  Google Vision   │
│      API         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   OCR Fallback   │
│   (si AWS fail)  │
└──────────────────┘
```

### Usage dans RT SYMPHONI.A

Google Vision est configuré comme **service de fallback**:

```
Document Upload
    │
    ▼
Essai AWS Textract
    │
    ├─ Succès ────► Résultat AWS
    │
    └─ Échec ─────► Essai Google Vision
                        │
                        └─► Résultat Google (fallback)
```

---

## Prérequis

### Compte Google Cloud
- [ ] Compte Google (Gmail)
- [ ] Carte bancaire (pour activer GCP)
- [ ] Accès à Google Cloud Console

### Environnement Technique
- [ ] Node.js v20+
- [ ] Navigateur web récent
- [ ] Éditeur de texte

---

## Coûts et Tarification

### Tarification Google Vision API (Décembre 2024)

```
┌─────────────────────────────────────────────────────────────┐
│  Google Vision API - Document Text Detection               │
├─────────────────────────────────────────────────────────────┤
│  Premiers 1,000 unités/mois:     GRATUIT                   │
│  1,001 - 5,000,000:              1.50 USD / 1,000 pages    │
│  5,000,001 - 20,000,000:         0.60 USD / 1,000 pages    │
│  Au-delà de 20M:                 0.30 USD / 1,000 pages    │
└─────────────────────────────────────────────────────────────┘
```

**Unité = 1 page de document**

### Calcul pour RT SYMPHONI.A (Fallback)

**Hypothèses:**
- 8,000 documents/mois total
- 25% échouent sur AWS → Fallback Google Vision
- 2,000 documents/mois sur Google Vision

**Détail des coûts:**
```
Premiers 1,000:     GRATUIT
Suivants 1,000:     1,000 × 1.50 USD / 1,000 = 1.50 USD

TOTAL MENSUEL: ~1.50 USD (≈ 1.40€)
```

### Free Tier Permanent

```
┌─────────────────────────────────────────────┐
│  Google Vision Free Tier                    │
├─────────────────────────────────────────────┤
│  Durée:               Permanent             │
│  Unités gratuites:    1,000 / mois          │
│                                             │
│  Note: Renouvelé chaque mois                │
│        Pas de limite dans le temps          │
└─────────────────────────────────────────────┘
```

**Excellent pour:**
- Tests
- Développement
- Faible volume (<1,000 docs/mois)

---

## Guide Étape par Étape

### Étape 1: Créer un Projet Google Cloud

**Durée: 3 minutes**

1. Visitez: https://console.cloud.google.com/

2. Si c'est votre premier projet, acceptez les Terms of Service

3. Cliquez sur le sélecteur de projet en haut

   ```
   ┌────────────────────────────────────┐
   │  [My Project ▼]                    │
   └────────────────────────────────────┘
   ```

4. Cliquez sur **"New Project"**

   ```
   ┌────────────────────────────────────────┐
   │  New Project                           │
   ├────────────────────────────────────────┤
   │  Project name:                         │
   │  [rt-symphonia-ocr]                    │
   │                                        │
   │  Organization:                         │
   │  [No organization]                     │
   │                                        │
   │  Location:                             │
   │  [No organization]                     │
   └────────────────────────────────────────┘
   ```

5. Nom suggéré: **rt-symphonia-ocr**

6. Cliquez sur **"Create"**

7. Attendez quelques secondes (création du projet)

8. Sélectionnez le nouveau projet dans le sélecteur

---

### Étape 2: Activer la Facturation

**Durée: 5 minutes** (si première fois)

1. Menu hamburger (☰) → **"Billing"**

2. Cliquez sur **"Link a billing account"**

3. Si vous n'avez pas de compte de facturation:
   - Cliquez sur **"Create billing account"**
   - Suivez l'assistant

4. Remplissez les informations:

   | Champ              | Valeur                    |
   |--------------------|---------------------------|
   | Account name       | RT SYMPHONI.A             |
   | Country            | France                    |
   | Currency           | EUR (€)                   |
   | Payment method     | Carte bancaire            |

5. **Carte bancaire:**
   - Numéro de carte
   - Date d'expiration
   - CVV
   - Adresse de facturation

6. **Free Trial:**
   - Google offre 300$ de crédits gratuits
   - Valable 90 jours
   - Aucun débit automatique sans votre accord

7. Cliquez sur **"Start my free trial"**

---

### Étape 3: Activer Vision API

**Durée: 2 minutes**

1. Dans la Console, recherchez **"Vision API"**

   ```
   ┌────────────────────────────────────┐
   │  Search: [Vision API]         🔍   │
   └────────────────────────────────────┘
   ```

2. Cliquez sur **"Cloud Vision API"**

3. Cliquez sur **"Enable"**

   ```
   ┌────────────────────────────────────┐
   │  Cloud Vision API                  │
   ├────────────────────────────────────┤
   │  [Enable]  ◄── Cliquez ici         │
   └────────────────────────────────────┘
   ```

4. Attendez quelques secondes (activation)

5. Vous êtes redirigé vers le dashboard de l'API

   ```
   ✅ Cloud Vision API enabled
   ```

---

### Étape 4: Créer un Service Account

**Durée: 3 minutes**

#### 4.1 Naviguer vers IAM & Admin

1. Menu hamburger (☰) → **"IAM & Admin"** → **"Service Accounts"**

2. Cliquez sur **"Create Service Account"**

#### 4.2 Détails du Service Account

**Step 1: Service account details**

```
┌────────────────────────────────────────────┐
│  Service account details                   │
├────────────────────────────────────────────┤
│  Service account name:                     │
│  [rt-symphonia-vision-sa]                  │
│                                            │
│  Service account ID:                       │
│  [rt-symphonia-vision-sa] (auto-généré)    │
│                                            │
│  Service account description:              │
│  [OCR Service Account for RT SYMPHONI.A]   │
└────────────────────────────────────────────┘
```

Cliquez sur **"Create and Continue"**

#### 4.3 Attribuer les Rôles

**Step 2: Grant this service account access to project**

1. Cliquez sur **"Select a role"**

2. Recherchez: **"Cloud Vision API User"**

   ```
   Filter roles...

   ☑ Cloud Vision API User
     Read-only access to Vision API
   ```

3. Sélectionnez ce rôle

4. Cliquez sur **"Continue"**

#### 4.4 Finaliser

**Step 3: Grant users access to this service account**

- Laissez vide (optionnel)

Cliquez sur **"Done"**

---

### Étape 5: Créer et Télécharger la Clé JSON

**Durée: 2 minutes**

#### 5.1 Générer la Clé

1. Vous êtes sur la page **"Service Accounts"**

2. Trouvez votre service account: **rt-symphonia-vision-sa**

3. Cliquez sur les **3 points verticaux** (⋮) à droite

4. Sélectionnez **"Manage keys"**

   ```
   ┌────────────────────────────────────────────┐
   │  rt-symphonia-vision-sa@...                │
   │                                        [⋮] │
   │    ├─ View service account                 │
   │    ├─ Manage keys               ◄── Cliquez│
   │    ├─ Delete                                │
   │    └─ ...                                   │
   └────────────────────────────────────────────┘
   ```

5. Cliquez sur **"Add Key"** → **"Create new key"**

6. Sélectionnez **"JSON"**

   ```
   ┌────────────────────────────────────┐
   │  Key type:                         │
   │  ● JSON  (recommended)             │
   │  ○ P12                             │
   └────────────────────────────────────┘
   ```

7. Cliquez sur **"Create"**

#### 5.2 Téléchargement Automatique

- Un fichier JSON est automatiquement téléchargé:
  ```
  rt-symphonia-ocr-a1b2c3d4e5f6.json
  ```

- **CONSERVEZ CE FICHIER EN SÉCURITÉ !**
  - Il contient la clé privée
  - Ne le partagez JAMAIS
  - Ne le committez JAMAIS dans Git

#### 5.3 Structure du Fichier JSON

Le fichier contient:

```json
{
  "type": "service_account",
  "project_id": "rt-symphonia-ocr",
  "private_key_id": "a1b2c3d4e5f6...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

---

### Étape 6: Stocker le Fichier de Credentials

**Pour développement local:**

```bash
# Créer un dossier sécurisé
mkdir -p ~/.gcloud

# Déplacer le fichier téléchargé
mv ~/Downloads/rt-symphonia-ocr-*.json ~/.gcloud/rt-symphonia-vision-credentials.json

# Restreindre les permissions
chmod 600 ~/.gcloud/rt-symphonia-vision-credentials.json
```

**Pour production (AWS Elastic Beanstalk):**

Le fichier sera uploadé lors du déploiement (voir section déploiement).

---

## Configuration dans l'Application

### Option A: Configuration Automatique (Recommandé)

```bash
node scripts/setup-external-services-interactive.js
```

Sélectionnez option 3 et fournissez le chemin vers votre fichier JSON.

### Option B: Configuration Manuelle

1. Ouvrez `.env.external-services`:

   ```bash
   nano services/subscriptions-contracts-eb/.env.external-services
   ```

2. Configurez la variable:

   ```bash
   # Google Vision Configuration
   GOOGLE_APPLICATION_CREDENTIALS=/home/user/.gcloud/rt-symphonia-vision-credentials.json

   # Activer le fallback
   OCR_ENABLE_FALLBACK=true
   ```

3. **Alternative:** Variables individuelles (si pas de fichier)

   ```bash
   GOOGLE_CLOUD_PROJECT_ID=rt-symphonia-ocr
   GOOGLE_CLOUD_CLIENT_EMAIL=rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com
   GOOGLE_CLOUD_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

---

## Tests et Validation

### Test 1: Validation du Fichier Credentials

```bash
cd services/subscriptions-contracts-eb
node scripts/test-google-vision-ocr.js
```

**Résultat attendu:**
```
╔══════════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Test Google Vision API                         ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Validation du Fichier Credentials
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Fichier credentials trouvé
✅ Format JSON valide
✅ Champs requis présents
ℹ️  Project: rt-symphonia-ocr
ℹ️  Email: rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com
```

### Test 2: OCR Document Simple

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 2: OCR Document Simple
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Document traité avec succès
ℹ️  Texte extrait: 234 caractères
ℹ️  Confiance: 98.5%
ℹ️  Temps de traitement: 892 ms
```

### Test 3: Fallback Automatique

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 3: Fallback AWS → Google
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️  Simulation: AWS Textract échoue
ℹ️  Tentative fallback Google Vision...
✅ Fallback réussi !
ℹ️  Provider utilisé: GOOGLE_VISION
```

---

## Dépannage

### Problème 1: "GOOGLE_APPLICATION_CREDENTIALS not found"

**Symptôme:**
```
❌ Error: Unable to detect a Project Id in the current environment
```

**Solutions:**

1. Vérifiez que le fichier existe:
   ```bash
   ls -la ~/.gcloud/rt-symphonia-vision-credentials.json
   ```

2. Vérifiez la variable d'environnement:
   ```bash
   echo $GOOGLE_APPLICATION_CREDENTIALS
   ```

3. Exportez la variable (temporaire):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=~/.gcloud/rt-symphonia-vision-credentials.json
   ```

---

### Problème 2: "Permission denied" ou "Insufficient permissions"

**Symptôme:**
```
❌ Error: Permission 'vision.images.annotate' denied
```

**Solutions:**

1. Vérifiez que l'API est activée:
   - Console GCP → APIs & Services → Enabled APIs
   - Cherchez "Cloud Vision API"

2. Vérifiez les rôles du Service Account:
   - IAM & Admin → Service Accounts
   - Vérifiez le rôle "Cloud Vision API User"

3. Recréez le Service Account si nécessaire

---

### Problème 3: "Quota exceeded"

**Symptôme:**
```
❌ Error: Quota exceeded for quota metric 'vision.googleapis.com/document_text_requests'
```

**Explication:**
- Free Tier: 1,000 requêtes/mois dépassé
- Limites par défaut: 600 requêtes/min, 10,000/jour

**Solutions:**

1. Vérifiez les quotas dans la console:
   - APIs & Services → Vision API → Quotas

2. Demandez une augmentation de quota (gratuit):
   - Cliquez sur "Edit Quotas"
   - Justifiez votre demande

3. Activez la facturation pour supprimer les limites gratuites

---

### Problème 4: "Invalid image format"

**Symptôme:**
```
❌ Error: The image data is not in a valid format
```

**Solutions:**

1. Vérifiez le format du fichier (PNG, JPEG, TIFF, PDF)

2. Vérifiez la taille (max 20 MB par image)

3. Encodez correctement en base64:
   ```javascript
   const imageBuffer = fs.readFileSync('image.png');
   const base64Image = imageBuffer.toString('base64');
   ```

---

## FAQ

### Q1: Google Vision est-il vraiment gratuit ?

**R:** Oui, 1,000 requêtes/mois gratuites à vie. Au-delà, c'est payant.

### Q2: Quelle est la différence entre TEXT_DETECTION et DOCUMENT_TEXT_DETECTION ?

**R:**
- **TEXT_DETECTION:** Optimisé pour texte dans les images (panneaux, menus)
- **DOCUMENT_TEXT_DETECTION:** Optimisé pour documents (factures, contrats)

Pour RT SYMPHONI.A: Utilisez **DOCUMENT_TEXT_DETECTION**

### Q3: Google Vision vs AWS Textract ?

**R:**

| Critère              | Google Vision      | AWS Textract       |
|----------------------|--------------------|--------------------|
| Précision texte      | 96-98%             | 95-99%             |
| Détection tables     | ❌ Non             | ✅ Oui             |
| Détection formulaires| ❌ Non             | ✅ Oui             |
| Prix (1000 pages)    | 1.50 USD           | 1.50 - 15 USD      |
| Free Tier            | 1,000/mois à vie   | 1,000/mois 12 mois |

**Conclusion:** AWS Textract pour fonctionnalités avancées, Google Vision pour fallback.

### Q4: Puis-je utiliser le même Service Account pour plusieurs projets ?

**R:** Oui, mais non recommandé. Créez un SA par environnement/projet.

### Q5: Comment révoquer un Service Account ?

**R:**
1. IAM & Admin → Service Accounts
2. Sélectionnez le SA
3. Cliquez sur "Delete"

### Q6: Les données sont-elles stockées par Google ?

**R:** Non, Google ne conserve pas les images après traitement (RGPD compliant).

### Q7: Google Vision détecte l'écriture manuscrite ?

**R:** Oui, mais précision ~80-85% (moins bon que le texte imprimé).

### Q8: Puis-je traiter des documents multi-pages ?

**R:** Oui, utilisez l'API asynchrone (Async Batch File Annotation).

### Q9: Quelle région pour RGPD ?

**R:** Les données sont traitées dans des datacenters européens automatiquement.

### Q10: Comment monitorer mes quotas ?

**R:**
```bash
node scripts/monitor-quotas.js
```

---

## Ressources Supplémentaires

### Documentation Officielle

- **API Reference:** https://cloud.google.com/vision/docs/reference/rest
- **Client Libraries:** https://cloud.google.com/vision/docs/libraries
- **Pricing:** https://cloud.google.com/vision/pricing

### Outils Utiles

- **Vision API Console:** https://console.cloud.google.com/apis/api/vision.googleapis.com
- **API Explorer:** https://cloud.google.com/vision/docs/drag-and-drop
- **Quota Management:** https://console.cloud.google.com/iam-admin/quotas

### Code Samples

- **GitHub Samples:** https://github.com/googleapis/nodejs-vision
- **Tutorials:** https://cloud.google.com/vision/docs/tutorials

---

## Prochaines Étapes

Après avoir configuré Google Vision:

1. [ ] Tester tous les services ensemble
2. [ ] Configurer le fallback automatique
3. [ ] Déployer sur AWS Elastic Beanstalk
4. [ ] Configurer le monitoring des quotas
5. [ ] Planifier la rotation des Service Accounts

---

**Besoin d'aide ?**
- Documentation: `CONFIGURATION_EXTERNE_AUTOMATISEE.md`
- Support Google Cloud: https://cloud.google.com/support/

---

*Ce guide est maintenu par l'équipe RT SYMPHONI.A*
*Dernière mise à jour: 2025-11-26*
