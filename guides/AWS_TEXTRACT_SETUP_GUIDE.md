# Guide de Configuration AWS Textract OCR

Version: 1.0.0
Date: 2025-11-26
Auteur: RT SYMPHONI.A Team
Durée estimée: 20 minutes

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Coûts et Tarification](#coûts-et-tarification)
4. [Guide Étape par Étape](#guide-étape-par-étape)
5. [Automatisation avec CloudFormation](#automatisation-avec-cloudformation)
6. [Configuration dans l'Application](#configuration-dans-lapplication)
7. [Tests et Validation](#tests-et-validation)
8. [Dépannage](#dépannage)
9. [FAQ](#faq)

---

## Vue d'Ensemble

AWS Textract est un service OCR (Optical Character Recognition) basé sur le Machine Learning qui permet d'extraire du texte et des données structurées de documents scannés.

### Capacités de Textract

- **Extraction de texte** simple (comme Tesseract)
- **Détection de tables** et extraction structurée
- **Détection de formulaires** (clé-valeur)
- **Analyse de documents** multi-pages
- **Détection d'écriture manuscrite**
- **Précision: 95-99%** sur documents imprimés

### Architecture de l'Intégration

```
┌──────────────────┐
│  RT SYMPHONI.A   │
│   Application    │
└────────┬─────────┘
         │ AWS SDK
         │ IAM Credentials
         ▼
┌──────────────────┐
│   AWS Textract   │
│   (eu-central-1) │
└────────┬─────────┘
         │
    ┌────┴────┬────────────┐
    ▼         ▼            ▼
┌─────────┐ ┌──────┐  ┌──────────┐
│ Detect  │ │Analyze│ │ Async    │
│  Text   │ │Document│ │Processing│
└─────────┘ └──────┘  └──────────┘
```

---

## Prérequis

### Compte AWS
- [ ] Compte AWS actif
- [ ] Carte bancaire valide
- [ ] Accès à la Console AWS

### Environnement Technique
- [ ] AWS CLI installé (optionnel mais recommandé)
- [ ] Node.js v20+
- [ ] Accès administrateur sur votre machine

### Connaissances Requises
- [ ] Notions de base AWS (IAM, Regions, Services)
- [ ] Compréhension des credentials AWS
- [ ] Ligne de commande

---

## Coûts et Tarification

### Tarification AWS Textract (Décembre 2024)

```
┌─────────────────────────────────────────────────────────────┐
│  AWS Textract - Région EU (Frankfurt)                      │
├─────────────────────────────────────────────────────────────┤
│  API DetectDocumentText:                                    │
│    ├─ Premier 1M pages/mois:     1.50 USD / 1,000 pages    │
│    └─ Au-delà:                   0.60 USD / 1,000 pages    │
│                                                             │
│  API AnalyzeDocument (Tables):                              │
│    ├─ Premier 1M pages/mois:     15.00 USD / 1,000 pages   │
│    └─ Au-delà:                    10.00 USD / 1,000 pages  │
│                                                             │
│  API AnalyzeDocument (Forms):                               │
│    ├─ Premier 1M pages/mois:     50.00 USD / 1,000 pages   │
│    └─ Au-delà:                    40.00 USD / 1,000 pages  │
└─────────────────────────────────────────────────────────────┘
```

### Calcul pour RT SYMPHONI.A

**Hypothèses:**
- 8,000 documents/mois
- Mix: 70% DetectDocumentText + 30% AnalyzeDocument (Tables)

**Détail des coûts:**
```
DetectDocumentText:
  5,600 pages × 1.50 USD / 1,000 = 8.40 USD

AnalyzeDocument (Tables):
  2,400 pages × 15.00 USD / 1,000 = 36.00 USD

TOTAL MENSUEL: ~44.40 USD (≈ 42€)
```

### Free Tier

```
┌─────────────────────────────────────────────┐
│  AWS Free Tier - Textract                  │
├─────────────────────────────────────────────┤
│  Durée:               12 mois               │
│  DetectDocumentText:  1,000 pages/mois      │
│  AnalyzeDocument:     100 pages/mois        │
│                                             │
│  Note: Disponible uniquement pour          │
│        les nouveaux comptes AWS             │
└─────────────────────────────────────────────┘
```

---

## Guide Étape par Étape

### Étape 1: Créer un Compte AWS

**Durée: 10 minutes** (si vous n'avez pas déjà un compte)

1. Visitez: https://aws.amazon.com/

2. Cliquez sur **"Créer un compte AWS"**

   ```
   ┌────────────────────────────────────┐
   │  Amazon Web Services               │
   │                                    │
   │  [Créer un compte AWS]  ◄── Cliquez ici
   └────────────────────────────────────┘
   ```

3. Remplissez le formulaire:

   | Champ                | Valeur                      |
   |----------------------|-----------------------------|
   | Email                | admin@votre-entreprise.com  |
   | Nom du compte AWS    | RT SYMPHONI.A               |
   | Mot de passe         | (min. 8 caractères)         |

4. **Informations de contact:**
   - Type de compte: Professionnel
   - Entreprise: RT SYMPHONI.A
   - Adresse complète
   - Téléphone

5. **Informations de paiement:**
   - Carte bancaire requise
   - 1€ sera prélevé pour vérification (remboursé)

6. **Vérification d'identité:**
   - Vous recevrez un appel ou SMS avec un code

7. **Choisir un plan:**
   - Sélectionnez **"Plan gratuit de base"**

8. **Connexion:**
   - Utilisez vos identifiants pour vous connecter
   - Console URL: https://console.aws.amazon.com/

---

### Étape 2: Activer AWS Textract

**Durée: 2 minutes**

1. Dans la Console AWS, recherchez **"Textract"**

   ```
   ┌────────────────────────────────────┐
   │  Search: [Textract]           🔍   │
   └────────────────────────────────────┘
   ```

2. Cliquez sur **"Amazon Textract"**

3. **Vérifiez la région:**
   - En haut à droite, sélectionnez **"Europe (Frankfurt) eu-central-1"**
   - Important pour RGPD et latence

   ```
   ┌────────────────────────────────────┐
   │  Region: [Europe (Frankfurt)]  ▼  │
   └────────────────────────────────────┘
   ```

4. Cliquez sur **"Get started"** ou **"Try Textract"**

5. Testez avec un document sample pour activer le service

---

### Étape 3: Créer un IAM User pour Textract

**Durée: 5 minutes**

**Pourquoi un IAM User dédié ?**
- Principe du moindre privilège
- Traçabilité des accès
- Facilite la rotation des credentials

#### 3.1 Accéder à IAM

1. Dans la Console AWS, recherchez **"IAM"**

2. Cliquez sur **"Users"** dans le menu de gauche

3. Cliquez sur **"Add users"**

#### 3.2 Configurer l'Utilisateur

**User name:** `rt-symphonia-textract-user`

```
┌────────────────────────────────────────────┐
│  Add user                                  │
├────────────────────────────────────────────┤
│  User name:                                │
│  [rt-symphonia-textract-user]              │
│                                            │
│  Access type:                              │
│  ☑ Access key - Programmatic access       │
│  ☐ Password - AWS Management Console      │
└────────────────────────────────────────────┘
```

Cliquez sur **"Next: Permissions"**

#### 3.3 Attacher les Permissions

Option A: **Politique AWS Managée** (Rapide)

1. Cliquez sur **"Attach existing policies directly"**

2. Recherchez: `AmazonTextractFullAccess`

3. Cochez la case

   ```
   ☑ AmazonTextractFullAccess
     Provides full access to Amazon Textract
   ```

4. Cliquez sur **"Next: Tags"**

Option B: **Politique Personnalisée** (Recommandé - Plus sécurisé)

Créez une politique avec uniquement les permissions nécessaires:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument",
        "textract:GetDocumentAnalysis",
        "textract:GetDocumentTextDetection"
      ],
      "Resource": "*"
    }
  ]
}
```

#### 3.4 Ajouter des Tags (Optionnel)

```
Key: Project      Value: RT-SYMPHONIA
Key: Service      Value: Textract-OCR
Key: Environment  Value: Production
```

#### 3.5 Créer l'Utilisateur

1. Cliquez sur **"Next: Review"**

2. Vérifiez la configuration

3. Cliquez sur **"Create user"**

---

### Étape 4: Télécharger les Credentials

**IMPORTANT:** Cette étape est critique !

1. Après création, vous verrez:

   ```
   ┌────────────────────────────────────────────────────────────┐
   │  Success! User created                                     │
   ├────────────────────────────────────────────────────────────┤
   │  User: rt-symphonia-textract-user                          │
   │                                                            │
   │  Access key ID:      AKIAIOSFODNN7EXAMPLE                  │
   │  Secret access key:  wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLE │
   │                                                            │
   │  [Download .csv]  ◄── TÉLÉCHARGEZ CE FICHIER              │
   │  [Show]           ◄── Ou copiez les valeurs               │
   └────────────────────────────────────────────────────────────┘
   ```

2. **TÉLÉCHARGEZ le fichier .csv** immédiatement

3. **COPIEZ les credentials** dans un endroit sûr

   **ATTENTION:**
   - Vous ne pourrez **PLUS JAMAIS** voir le Secret Access Key
   - Si vous le perdez, il faudra en générer un nouveau

4. **Conservez les credentials en sécurité:**
   - Ne les committez JAMAIS dans Git
   - Ne les partagez JAMAIS par email/Slack
   - Utilisez un gestionnaire de mots de passe

---

### Étape 5: Installer et Configurer AWS CLI (Optionnel)

**Durée: 5 minutes**

#### 5.1 Installation

**Windows:**
```powershell
# Télécharger et installer depuis:
https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Linux/Mac:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

#### 5.2 Configuration

```bash
aws configure
```

Remplissez:
```
AWS Access Key ID [None]: AKIAIOSFODNN7EXAMPLE
AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLE
Default region name [None]: eu-central-1
Default output format [None]: json
```

#### 5.3 Test

```bash
aws sts get-caller-identity
```

**Résultat attendu:**
```json
{
  "UserId": "AIDAIOSFODNN7EXAMPLE",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/rt-symphonia-textract-user"
}
```

Si vous voyez cette réponse: **AWS CLI configuré correctement!** ✅

---

## Automatisation avec CloudFormation

Pour automatiser la création de l'IAM User, utilisez notre script:

```bash
cd /chemin/vers/rt-backend-services
bash scripts/create-aws-textract-user.sh
```

Ce script crée automatiquement:
- IAM User `rt-symphonia-textract-user`
- IAM Policy avec permissions minimales
- Access Keys
- Affiche les credentials à copier

---

## Configuration dans l'Application

### Option A: Configuration Automatique (Recommandé)

```bash
node scripts/setup-external-services-interactive.js
```

Sélectionnez option 2 et suivez les instructions.

### Option B: Configuration Manuelle

1. Ouvrez `.env.external-services`:

   ```bash
   nano services/subscriptions-contracts-eb/.env.external-services
   ```

2. Configurez les variables:

   ```bash
   # AWS Credentials
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLE
   AWS_REGION=eu-central-1

   # OCR Configuration
   OCR_PROVIDER=AWS_TEXTRACT
   OCR_ENABLE_FALLBACK=true
   OCR_TIMEOUT_MS=10000
   OCR_MIN_CONFIDENCE=90
   ```

3. Sauvegardez et fermez

---

## Tests et Validation

### Test 1: Validation des Credentials

```bash
cd services/subscriptions-contracts-eb
node scripts/test-textract-ocr.js
```

**Résultat attendu:**
```
╔══════════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Test AWS Textract OCR                          ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Validation des Credentials AWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ AWS Credentials valides
ℹ️  Region: eu-central-1
ℹ️  User: rt-symphonia-textract-user
```

### Test 2: Extraction de Texte Simple

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 2: Extraction de Texte (DetectDocumentText)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Texte extrait avec succès
ℹ️  Blocs détectés: 42
ℹ️  Confiance moyenne: 98.7%
ℹ️  Temps de traitement: 1,234 ms
```

### Test 3: Analyse de Tables

**Résultat attendu:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 3: Analyse de Tables (AnalyzeDocument)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Tables extraites avec succès
ℹ️  Tables trouvées: 2
ℹ️  Lignes extraites: 15
ℹ️  Confiance: 97.3%
```

---

## Dépannage

### Problème 1: "AccessDenied" ou "UnauthorizedOperation"

**Symptôme:**
```
❌ Error: User is not authorized to perform: textract:DetectDocumentText
```

**Solutions:**

1. Vérifiez que l'IAM policy est bien attachée
2. Vérifiez les permissions dans IAM Console
3. Attendez quelques minutes (propagation AWS)
4. Recréez l'IAM User si nécessaire

**Commande de diagnostic:**
```bash
aws iam list-attached-user-policies --user-name rt-symphonia-textract-user
```

---

### Problème 2: "InvalidCredentials"

**Symptôme:**
```
❌ Error: The security token included in the request is invalid
```

**Solutions:**

1. Vérifiez que les credentials sont corrects
2. Vérifiez qu'il n'y a pas d'espaces avant/après
3. Régénérez de nouvelles Access Keys

**Commande de test:**
```bash
aws sts get-caller-identity
```

---

### Problème 3: "ThrottlingException"

**Symptôme:**
```
❌ Error: Rate exceeded
```

**Explication:**
Vous envoyez trop de requêtes simultanées

**Limites AWS Textract:**
- DetectDocumentText: 5 transactions/sec
- AnalyzeDocument: 1 transaction/sec

**Solutions:**

1. Implémentez un rate limiter
2. Utilisez les API asynchrones pour gros volumes
3. Distribuez les requêtes dans le temps

---

### Problème 4: Coûts Élevés

**Symptôme:**
Facture AWS supérieure aux prévisions

**Solutions:**

1. Activez AWS Cost Explorer
2. Créez un budget alert dans AWS Budgets
3. Utilisez le monitoring de quotas:
   ```bash
   node scripts/monitor-quotas.js
   ```
4. Optimisez les appels API (cache, détection préalable)

---

## FAQ

### Q1: Puis-je utiliser mon compte AWS root ?

**R:** Non recommandé. Créez toujours un IAM User dédié pour chaque service.

### Q2: Combien de temps pour activer Textract ?

**R:** Immédiat, dès l'activation du service dans la console.

### Q3: Les données sont-elles stockées par AWS ?

**R:** Non, AWS ne conserve pas les documents après traitement.

### Q4: Textract supporte quels formats ?

**R:** PNG, JPEG, TIFF, PDF (jusqu'à 3000 pages).

### Q5: Quelle est la taille max des fichiers ?

**R:**
- Synchrone: 5 MB
- Asynchrone: 500 MB

### Q6: Textract détecte l'écriture manuscrite ?

**R:** Oui, mais avec une précision moindre que le texte imprimé (~85%).

### Q7: Comment améliorer la précision ?

**R:**
- Images haute résolution (300 DPI minimum)
- Bon contraste
- Documents droits (pas de rotation)
- Format PDF quand possible

### Q8: Textract est-il conforme RGPD ?

**R:** Oui, si vous utilisez la région EU (Frankfurt ou Ireland).

### Q9: Puis-je tester gratuitement ?

**R:** Oui, Free Tier: 1,000 pages/mois pendant 12 mois.

### Q10: Comment révoquer un Access Key ?

**R:**
```bash
aws iam delete-access-key --access-key-id AKIAIOSFODNN7EXAMPLE --user-name rt-symphonia-textract-user
```

---

## Ressources Supplémentaires

### Documentation Officielle

- **API Reference:** https://docs.aws.amazon.com/textract/latest/dg/API_Reference.html
- **Developer Guide:** https://docs.aws.amazon.com/textract/
- **SDK JavaScript:** https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-textract/

### Outils Utiles

- **Textract Console:** https://console.aws.amazon.com/textract/
- **Pricing Calculator:** https://calculator.aws/
- **Cost Explorer:** https://console.aws.amazon.com/cost-management/

### Monitoring

- **CloudWatch Metrics:** https://console.aws.amazon.com/cloudwatch/
- **AWS Budgets:** https://console.aws.amazon.com/billing/home#/budgets

---

## Prochaines Étapes

Après avoir configuré AWS Textract:

1. [ ] Configurer Google Vision API (fallback)
2. [ ] Tester tous les services ensemble
3. [ ] Configurer le monitoring des coûts
4. [ ] Planifier la rotation des Access Keys
5. [ ] Déployer sur AWS Elastic Beanstalk

---

**Besoin d'aide ?**
- Documentation: `CONFIGURATION_EXTERNE_AUTOMATISEE.md`
- Support AWS: https://aws.amazon.com/support/

---

*Ce guide est maintenu par l'équipe RT SYMPHONI.A*
*Dernière mise à jour: 2025-11-26*
