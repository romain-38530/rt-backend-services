# RT SYMPHONI.A - Configuration Automatisée des Services Externes

Version: 2.0.0
Date: 2025-11-26
Auteur: RT SYMPHONI.A Team

---

## Table des Matières

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Installation Rapide](#installation-rapide)
4. [Guide Détaillé](#guide-détaillé)
5. [Scripts Disponibles](#scripts-disponibles)
6. [Maintenance et Monitoring](#maintenance-et-monitoring)
7. [Déploiement en Production](#déploiement-en-production)
8. [Dépannage](#dépannage)
9. [FAQ](#faq)

---

## Vue d'Ensemble

Ce système fournit une **configuration automatisée et guidée** pour les 3 services externes utilisés par RT SYMPHONI.A:

### Services Configurés

| Service           | Usage                  | Coût Mensuel | Statut        |
|-------------------|------------------------|--------------|---------------|
| TomTom Telematics | Tracking GPS           | ~0-20€       | Recommandé    |
| AWS Textract      | OCR Primary            | ~46€         | Obligatoire   |
| Google Vision API | OCR Fallback           | ~1.40€       | Optionnel     |
| **TOTAL**         |                        | **~47-67€**  |               |

### Fonctionnalités Clés

- **Configuration interactive** pas à pas
- **Validation en temps réel** des credentials
- **Automatisation AWS** (IAM User, Policies, Access Keys)
- **Génération automatique** du fichier .env
- **Rotation automatique** des clés (tous les 90 jours)
- **Monitoring des quotas** et coûts
- **Alertes de dépassement** de budget
- **Guides visuels détaillés** avec captures d'écran ASCII

---

## Architecture

### Vue Globale

```
┌──────────────────────────────────────────────────────────┐
│  RT SYMPHONI.A Application                               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐         │
│  │  Routing   │  │    OCR     │  │   OCR      │         │
│  │  Service   │  │  Primary   │  │  Fallback  │         │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘         │
│         │               │               │                │
└─────────┼───────────────┼───────────────┼────────────────┘
          │               │               │
          ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │  TomTom  │    │   AWS    │    │  Google  │
    │   API    │    │ Textract │    │  Vision  │
    └──────────┘    └──────────┘    └──────────┘
```

### Flux de Configuration

```
1. Exécuter setup-external-services-interactive.js
   │
   ├─► 2. Sélectionner service à configurer
   │   │
   │   ├─► TomTom:
   │   │   ├─ Guide interactif (création compte)
   │   │   ├─ Saisie API Key
   │   │   ├─ Validation en temps réel
   │   │   └─ Sauvegarde dans .env
   │   │
   │   ├─► AWS Textract:
   │   │   ├─ Option A: Automatisation (script bash)
   │   │   ├─ Option B: Manuel (guide step-by-step)
   │   │   ├─ Validation credentials
   │   │   └─ Sauvegarde dans .env
   │   │
   │   └─► Google Vision:
   │       ├─ Guide création Service Account
   │       ├─ Upload fichier JSON
   │       ├─ Validation credentials
   │       └─ Sauvegarde dans .env
   │
   ├─► 3. Tests automatiques
   │   ├─ Test TomTom (geocoding)
   │   ├─ Test AWS (caller identity)
   │   └─ Test Google Vision (simple OCR)
   │
   └─► 4. Génération rapport de configuration
       ├─ Services configurés
       ├─ Coûts estimés
       └─ Prochaines étapes
```

---

## Installation Rapide

### Prérequis

```bash
# Node.js 20+
node --version  # v20.x.x ou supérieur

# NPM ou PNPM
npm --version   # 8.x.x ou supérieur
pnpm --version  # 8.x.x ou supérieur (optionnel)

# Git
git --version

# AWS CLI (optionnel, pour automatisation)
aws --version
```

### Installation

```bash
# 1. Cloner le repository (si pas déjà fait)
git clone https://github.com/votre-org/rt-backend-services.git
cd rt-backend-services

# 2. Installer les dépendances
pnpm install
# ou
npm install

# 3. Rendre les scripts exécutables (Linux/Mac)
chmod +x scripts/*.js
chmod +x scripts/*.sh

# Windows: Rien à faire
```

### Lancement Rapide

```bash
# Lancer le configurateur interactif
node scripts/setup-external-services-interactive.js
```

Et suivez les instructions à l'écran ! 🎉

---

## Guide Détaillé

### Étape 1: Configuration Interactive

```bash
node scripts/setup-external-services-interactive.js
```

**Écran d'accueil:**

```
    ██████╗ ████████╗    ███████╗██╗   ██╗███╗   ███╗██████╗ ██╗  ██╗ ██████╗ ███╗   ██╗██╗ █████╗
    ██╔══██╗╚══██╔══╝    ██╔════╝╚██╗ ██╔╝████╗ ████║██╔══██╗██║  ██║██╔═══██╗████╗  ██║██║██╔══██╗
    ██████╔╝   ██║       ███████╗ ╚████╔╝ ██╔████╔██║██████╔╝███████║██║   ██║██╔██╗ ██║██║███████║
    ██╔══██╗   ██║       ╚════██║  ╚██╔╝  ██║╚██╔╝██║██╔═══╝ ██╔══██║██║   ██║██║╚██╗██║██║██╔══██║
    ██║  ██║   ██║       ███████║   ██║   ██║ ╚═╝ ██║██║     ██║  ██║╚██████╔╝██║ ╚████║██║██║  ██║
    ╚═╝  ╚═╝   ╚═╝       ╚══════╝   ╚═╝   ╚═╝     ╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝

Configuration Interactive des Services Externes
Version 2.0.0

Services à configurer:
  1. TomTom Telematics API (~20€/mois)
  2. AWS Textract OCR (~46€/mois)
  3. Google Vision API (~1.40€/mois - optionnel)

Ce script va vous guider:
  ✓ Création de comptes étape par étape
  ✓ Configuration automatique des credentials
  ✓ Validation en temps réel
  ✓ Tests de connexion
  ✓ Génération du fichier .env

Appuyez sur Entrée pour commencer...
```

### Étape 2: Menu Principal

```
╔══════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Configuration Services Externes            ║
╚══════════════════════════════════════════════════════════════╝

  ✅ 1. Configuration TomTom Telematics API (Configuré)
  ⏺ 2. Configuration AWS Textract OCR
  ⏺ 3. Configuration Google Vision API
  ⏺ 4. Tester tous les services
  ⏺ 5. Générer rapport de configuration
  ⏺ 6. Sauvegarder et quitter

Que voulez-vous faire ?
Votre choix:
```

### Étape 3: Configuration TomTom (Exemple)

**Sélectionnez l'option 1:**

```
╔══════════════════════════════════════════════════════════════╗
║  Configuration TomTom Telematics API                         ║
╚══════════════════════════════════════════════════════════════╝

À propos de TomTom:
- Coût: ~20€/mois (5 véhicules + Free Tier API)
- Free Tier: 75,000 requêtes/mois gratuites
- Documentation complète: guides/TOMTOM_SETUP_GUIDE.md

────────────────────────────────────────────────────────

ℹ️  Étape 1: Créer un compte TomTom Developer
  → Visitez: https://developer.tomtom.com/
  → Cliquez sur "Sign up" en haut à droite
  → Remplissez le formulaire d'inscription

Avez-vous créé votre compte TomTom ? (O/n):
```

Le script vous guide **pas à pas** avec:
- ✅ Liens directs vers les pages de configuration
- ✅ Instructions visuelles claires
- ✅ Validation immédiate des credentials
- ✅ Messages d'erreur explicites

### Étape 4: Validation Automatique

Après la saisie de l'API Key:

```
ℹ️  Validation de l'API Key...
⠋ Test de connexion TomTom...

✅ TomTom API Key valide !

Voulez-vous lancer les tests maintenant ? (O/n): o

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 1: Configuration de l'API Key TomTom
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ API Key TomTom configurée
ℹ️  Longueur de la clé : 32 caractères

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Test 2: Calcul d'itinéraire (Paris → Lyon)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Itinéraire calculé avec succès
ℹ️  Distance : 463.15 km
ℹ️  Durée : 269 minutes
```

### Étape 5: Rapport Final

```
╔══════════════════════════════════════════════════════════════╗
║  Rapport de Configuration                                    ║
╚══════════════════════════════════════════════════════════════╝

Services Configurés:

TomTom Telematics API
  Status: ✅ Configuré et testé
  Coût: ~20€/mois

AWS Textract OCR
  Status: ✅ Configuré et testé
  Coût: ~46€/mois

Google Vision API
  Status: ✅ Configuré et testé
  Coût: ~1.40€/mois

────────────────────────────────────────────────────────

Résumé:
  Services configurés: 3/3
  Coût total estimé: ~67.40€/mois

🎉 Tous les services sont configurés !

Prochaines étapes:
  1. Tester tous les services (Option 4 du menu)
  2. Déployer sur AWS Elastic Beanstalk (Option 5)
  3. Configurer le monitoring (scripts/monitor-quotas.js)
  4. Planifier la rotation des clés (scripts/rotate-api-keys.js)
```

---

## Scripts Disponibles

### 1. Script Principal - Configuration Interactive

**Fichier:** `scripts/setup-external-services-interactive.js`

```bash
node scripts/setup-external-services-interactive.js
```

**Fonctionnalités:**
- Menu interactif avec progression
- Configuration guidée pas à pas
- Validation en temps réel
- Génération automatique du .env
- Sauvegarde de l'état de configuration

---

### 2. Automatisation AWS

**Fichier:** `scripts/create-aws-textract-user.sh`

```bash
bash scripts/create-aws-textract-user.sh
```

**Ce qu'il fait:**
- ✅ Crée un IAM User `rt-symphonia-textract-user`
- ✅ Crée une IAM Policy avec permissions minimales
- ✅ Génère les Access Keys automatiquement
- ✅ Affiche les credentials à copier
- ✅ Génère un fichier de backup sécurisé

**Prérequis:**
- AWS CLI installé et configuré
- Permissions admin ou IAM complètes

**Exemple de sortie:**

```bash
╔══════════════════════════════════════════════════════════════╗
║  AWS Textract IAM User - Credentials                        ║
╚══════════════════════════════════════════════════════════════╝

IAM User Name:
  rt-symphonia-textract-user

Access Key ID:
  AKIAIOSFODNN7EXAMPLE

Secret Access Key:
  wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLE

AWS Region (recommandé):
  eu-central-1 (Frankfurt - RGPD compliant)

╔══════════════════════════════════════════════════════════════╗
║  IMPORTANT - Sécurité                                        ║
╚══════════════════════════════════════════════════════════════╝

⚠️  COPIEZ CES CREDENTIALS MAINTENANT !
⚠️  Vous ne pourrez PLUS JAMAIS voir le Secret Access Key
```

---

### 3. Rotation des API Keys

**Fichier:** `scripts/rotate-api-keys.js`

```bash
node scripts/rotate-api-keys.js
```

**Fonctionnalités:**
- Vérification de l'âge des clés
- Rotation guidée (TomTom, AWS, Google)
- Rotation automatique pour AWS
- Historique des rotations
- Alertes si rotation requise (>90 jours)

**Exemple d'utilisation:**

```
╔══════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Rotation des API Keys                      ║
╚══════════════════════════════════════════════════════════════╝

Options:
  1. Vérifier le statut de toutes les clés
  2. Rotation TomTom API Key
  3. Rotation AWS Access Keys
  4. Rotation Google Service Account
  5. Rotation automatique (tous les services requis)
  6. Quitter

Votre choix: 1

TomTom API Key - Statut
═════════════════════════════
ℹ️  Dernière rotation: il y a 45 jours
✅ API Key à jour
ℹ️  Prochaine rotation dans 45 jours

AWS Access Keys - Statut
═════════════════════════════
ℹ️  Dernière rotation: il y a 92 jours
❌ Rotation requise ! (> 90 jours)

Google Service Account - Statut
═════════════════════════════
ℹ️  Dernière rotation: il y a 30 jours
✅ Service Account à jour
ℹ️  Prochaine rotation dans 60 jours
```

---

### 4. Monitoring des Quotas

**Fichier:** `scripts/monitor-quotas.js`

```bash
node scripts/monitor-quotas.js
```

**Fonctionnalités:**
- Suivi en temps réel de l'usage
- Calcul des quotas restants
- Barres de progression visuelles
- Alertes automatiques
- Export JSON des métriques

**Exemple de sortie:**

```
╔══════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Monitoring des Quotas                      ║
╚══════════════════════════════════════════════════════════════╝

TomTom Telematics API - Quotas
═════════════════════════════════════

Quota Quotidien:
  Utilisé:   1,245 / 2,500
  Restant:   1,255
  Usage:     49.8%
  [████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░] 49.8% quotidien

✅ Quota quotidien OK

Quota Mensuel:
  Utilisé:   32,450 / 75,000
  Restant:   42,550
  Usage:     43.3%
  [█████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░] 43.3% mensuel

✅ Quota mensuel OK
```

---

### 5. Alertes de Budget

**Fichier:** `scripts/budget-alerts.js`

```bash
node scripts/budget-alerts.js
```

**Fonctionnalités:**
- Calcul des coûts en temps réel
- Comparaison avec le budget défini
- Alertes par niveaux (warning, critical)
- Envoi de webhooks (optionnel)
- Recommandations d'optimisation

**Configuration:**

Modifiez `CONFIG.budgets` dans le script:

```javascript
const CONFIG = {
  budgets: {
    monthly: 70.0,        // Budget mensuel total
    tomtom: 0.0,          // Free Tier
    aws_textract: 46.0,
    google_vision: 1.50
  },
  webhookURL: process.env.BUDGET_ALERT_WEBHOOK || null
};
```

**Exemple de sortie:**

```
╔══════════════════════════════════════════════════════════════╗
║  RT SYMPHONI.A - Alertes de Dépassement de Budget           ║
╚══════════════════════════════════════════════════════════════╝

Vérification du Budget
═══════════════════════════

Budget Global:
  Coût actuel:   67.40€
  Budget:        70.00€
  Utilisation:   96.3%
  [████████████████████████████████████████████████] 96.3%

⚠️  Budget critique (96.3%)

Rapport Détaillé des Coûts
═══════════════════════════════

TomTom Telematics API:
  Requêtes gratuites: 32,450
  Requêtes payantes:  0
  Coût:               0.00€
  Statut:             Free Tier

AWS Textract:
  Pages totales:      8,234
  DetectDocumentText: 5,764 pages → 8.65€
  AnalyzeDocument:    2,470 pages → 37.05€
  Coût total:         45.70€

Google Vision API:
  Pages gratuites:    1,000
  Pages payantes:     1,200
  Coût:               1.80€
  Statut:             Payant

TOTAL:
  Coût mensuel:       47.50€
  Budget:             70.00€
  Économies:          22.50€

Recommandations d'Optimisation
═══════════════════════════════
  • AWS Textract: Utilisation élevée. Considérez:
      - Améliorer la qualité des images
      - Utiliser Google Vision en fallback plus souvent
      - Activer le cache Redis
```

---

## Maintenance et Monitoring

### Cron Jobs Recommandés

**Linux/Mac:**

```bash
# Éditer crontab
crontab -e

# Ajouter ces lignes:

# Monitoring quotidien des quotas (8h du matin)
0 8 * * * cd /chemin/vers/rt-backend-services && node scripts/monitor-quotas.js >> logs/quota-monitoring.log 2>&1

# Vérification budget quotidienne (18h)
0 18 * * * cd /chemin/vers/rt-backend-services && node scripts/budget-alerts.js >> logs/budget-alerts.log 2>&1

# Vérification rotation des clés (hebdomadaire, lundi 10h)
0 10 * * 1 cd /chemin/vers/rt-backend-services && node scripts/rotate-api-keys.js >> logs/key-rotation.log 2>&1
```

**Windows Task Scheduler:**

1. Ouvrir "Planificateur de tâches"
2. Créer une tâche de base
3. Déclencheur: Quotidien / Hebdomadaire
4. Action: Démarrer un programme
5. Programme: `node.exe`
6. Arguments: `C:\chemin\vers\rt-backend-services\scripts\monitor-quotas.js`

### Webhooks et Notifications

**Configuration Slack:**

```bash
# Dans .env
BUDGET_ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Configuration Discord:**

```bash
BUDGET_ALERT_WEBHOOK=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL
```

**Configuration Email (AWS SES):**

Modifiez `CONFIG.emailConfig` dans `budget-alerts.js`:

```javascript
emailConfig: {
  enabled: true,
  from: 'alerts@rt-symphonia.com',
  to: 'admin@rt-symphonia.com',
  sesRegion: 'eu-west-1'
}
```

---

## Déploiement en Production

### AWS Elastic Beanstalk

#### 1. Configuration des Variables d'Environnement

**Option A: Via EB CLI:**

```bash
eb setenv \
  TOMTOM_API_KEY=your-key \
  AWS_ACCESS_KEY_ID=your-key-id \
  AWS_SECRET_ACCESS_KEY=your-secret \
  AWS_REGION=eu-central-1 \
  GOOGLE_APPLICATION_CREDENTIALS=/var/app/current/google-credentials.json \
  OCR_PROVIDER=AWS_TEXTRACT \
  OCR_ENABLE_FALLBACK=true
```

**Option B: Via AWS Console:**

1. Elastic Beanstalk → Environments
2. Sélectionnez votre environnement
3. Configuration → Software
4. Environment properties → Add
5. Ajoutez toutes les variables
6. Apply

#### 2. Upload Google Credentials

**Créer un .ebextensions:**

```bash
mkdir -p .ebextensions
nano .ebextensions/google-credentials.config
```

**Contenu:**

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
        "private_key_id": "...",
        "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
        "client_email": "rt-symphonia-vision-sa@rt-symphonia-ocr.iam.gserviceaccount.com",
        ...
      }
```

#### 3. Déployer

```bash
eb deploy
```

#### 4. Vérifier

```bash
eb logs | grep -E '(TomTom|AWS Textract|Google Vision)'
```

---

### Docker (Optionnel)

**Dockerfile avec secrets:**

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Google credentials en secret
RUN --mount=type=secret,id=google_creds \
    cat /run/secrets/google_creds > /app/google-credentials.json

ENV GOOGLE_APPLICATION_CREDENTIALS=/app/google-credentials.json

CMD ["node", "index.js"]
```

**Build:**

```bash
docker build --secret id=google_creds,src=./google-credentials.json -t rt-symphonia .
```

---

## Dépannage

### Problème 1: "API Key invalide"

**Symptômes:**
- Validation échoue
- Tests échouent avec "Invalid API Key"

**Solutions:**
1. Vérifiez que la clé est copiée correctement (pas d'espaces)
2. Vérifiez que l'API est activée dans le dashboard du provider
3. Régénérez une nouvelle clé
4. Attendez quelques minutes (propagation)

### Problème 2: Scripts ne s'exécutent pas (Windows)

**Symptômes:**
- `./script.sh: command not found`
- Permission denied

**Solutions:**

```powershell
# Utiliser node au lieu de ./
node scripts/setup-external-services-interactive.js

# Pour les scripts .sh, installer Git Bash ou WSL
```

### Problème 3: AWS CLI non configuré

**Symptômes:**
- `Unable to locate credentials`
- `aws: command not found`

**Solutions:**

```bash
# Installer AWS CLI
# Linux/Mac
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Windows
# Télécharger depuis: https://awscli.amazonaws.com/AWSCLIV2.msi

# Configurer
aws configure
```

### Problème 4: Quotas dépassés

**Symptômes:**
- `Rate limit exceeded`
- `Quota exceeded`

**Solutions:**
1. Vérifier les quotas: `node scripts/monitor-quotas.js`
2. Attendre le reset (quotidien ou mensuel)
3. Upgrader le plan
4. Optimiser les appels (cache, rate limiting)

---

## FAQ

### Q1: Puis-je utiliser ces scripts en CI/CD ?

**R:** Oui, mais avec précautions:
- Stockez les secrets dans le CI (GitHub Secrets, GitLab CI/CD variables)
- N'utilisez pas le mode interactif (créez un mode --non-interactive)
- Automatisez uniquement les tests, pas la configuration initiale

### Q2: Comment changer de région AWS ?

**R:**
1. Modifiez `AWS_REGION` dans `.env.external-services`
2. Vérifiez que Textract est disponible dans cette région
3. Redéployez: `eb deploy`

### Q3: Puis-je désactiver Google Vision ?

**R:** Oui:
```bash
OCR_ENABLE_FALLBACK=false
```

Mais vous perdez la résilience du fallback.

### Q4: Comment ajouter un nouveau service externe ?

**R:**
1. Créez un nouveau module dans `services/xxx/`
2. Ajoutez la configuration dans `.env.external-services`
3. Créez un guide dans `guides/`
4. Ajoutez au script interactif

### Q5: Les coûts sont-ils garantis ?

**R:** Non, ce sont des estimations basées sur:
- 8,000 documents/mois
- Mix 70/30 DetectDocumentText/AnalyzeDocument
- Tarifs de décembre 2024

Les coûts réels peuvent varier.

### Q6: Comment sauvegarder les configurations ?

**R:**
```bash
# Backup manuel
cp .env.external-services .env.external-services.backup
cp .setup-state.json .setup-state.json.backup

# Backup automatique
node scripts/backup-configs.js
```

### Q7: Que faire en cas de fuite de credentials ?

**R:**
1. **Immédiatement** révoquer les clés compromises
2. Générer de nouvelles clés
3. Mettre à jour l'application
4. Vérifier les logs d'accès (CloudTrail, etc.)
5. Activer la rotation automatique

### Q8: Comment tester localement sans consommer de quota ?

**R:**
- Utilisez des mocks/stubs en développement
- Activez `DEBUG_MODE=true` pour simuler les appels
- Créez un environnement de test séparé

### Q9: Puis-je utiliser plusieurs comptes AWS ?

**R:** Oui, configurez plusieurs profiles:
```bash
aws configure --profile production
aws configure --profile development

# Utiliser un profile
AWS_PROFILE=production node scripts/test.js
```

### Q10: Comment contribuer à ce projet ?

**R:**
1. Forkez le repository
2. Créez une branche: `git checkout -b feature/ma-feature`
3. Committez: `git commit -m "feat: Ma feature"`
4. Push: `git push origin feature/ma-feature`
5. Créez une Pull Request

---

## Ressources Supplémentaires

### Guides Détaillés

- **TomTom:** [guides/TOMTOM_SETUP_GUIDE.md](guides/TOMTOM_SETUP_GUIDE.md)
- **AWS Textract:** [guides/AWS_TEXTRACT_SETUP_GUIDE.md](guides/AWS_TEXTRACT_SETUP_GUIDE.md)
- **Google Vision:** [guides/GOOGLE_VISION_SETUP_GUIDE.md](guides/GOOGLE_VISION_SETUP_GUIDE.md)

### Documentation Officielle

- **TomTom API:** https://developer.tomtom.com/
- **AWS Textract:** https://docs.aws.amazon.com/textract/
- **Google Vision:** https://cloud.google.com/vision/docs

### Support

- **Email:** support@rt-symphonia.com
- **Slack:** #rt-symphonia-support
- **Issues GitHub:** https://github.com/votre-org/rt-backend-services/issues

---

## Changelog

### Version 2.0.0 (2025-11-26)

**Nouvelles fonctionnalités:**
- Configuration interactive complète
- Automatisation AWS avec CloudFormation
- Rotation automatique des clés
- Monitoring des quotas
- Alertes de budget
- Guides visuels détaillés

**Améliorations:**
- Interface utilisateur améliorée
- Validation en temps réel
- Gestion d'erreurs robuste
- Documentation complète

**Corrections:**
- Correction des problèmes de permissions
- Amélioration de la compatibilité Windows
- Meilleure gestion des timeouts

---

## Licence

Copyright (c) 2025 RT SYMPHONI.A
Tous droits réservés.

---

**Besoin d'aide ?**

Contactez l'équipe RT SYMPHONI.A:
- Email: support@rt-symphonia.com
- Documentation: https://docs.rt-symphonia.com
- Status: https://status.rt-symphonia.com

---

*Ce guide est maintenu par l'équipe RT SYMPHONI.A*
*Dernière mise à jour: 2025-11-26*
