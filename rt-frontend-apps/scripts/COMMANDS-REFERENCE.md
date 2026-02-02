# Référence Rapide des Commandes

## Scripts PowerShell

### Workflow Complet (Automatique)
```powershell
# Exécute tout le workflow: tests, invalidation, attente, vérification
.\run-complete-workflow.ps1

# Sans tests préalables
.\run-complete-workflow.ps1 -SkipTests

# Sans vérification finale
.\run-complete-workflow.ps1 -SkipVerification

# Attente personnalisée (15 minutes)
.\run-complete-workflow.ps1 -WaitMinutes 15
```

### Invalidation Rapide
```powershell
# La façon la plus rapide d'invalider
.\quick-invalidate.ps1
```

### Invalidation Standard
```powershell
# Invalidation avec détection automatique
.\invalidate-cloudfront.ps1

# Avec un Distribution ID spécifique
.\invalidate-cloudfront.ps1 -DistributionId E1234567890ABC

# Attendre la complétion
.\invalidate-cloudfront.ps1 -Wait

# Afficher l'aide
.\invalidate-cloudfront.ps1 -Help
```

### Tests et Diagnostic
```powershell
# Tester la configuration
.\test-cloudfront-setup.ps1

# Vérifier la mise à jour du bundle
.\verify-bundle-update.ps1

# Avec plus de détails
.\verify-bundle-update.ps1 -Verbose

# Vérifier un domaine spécifique
.\verify-bundle-update.ps1 -Domain "autre-domaine.com" -OldBundle "ancien-hash.js"
```

### Solutions Alternatives
```powershell
# Lister toutes les distributions
.\invalidate-cloudfront-alternative.ps1 -ListDistributions

# Lister les invalidations d'une distribution
.\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E1234567890ABC

# Afficher le guide manuel complet
.\invalidate-cloudfront-alternative.ps1 -Manual

# Guide avec Distribution ID
.\invalidate-cloudfront-alternative.ps1 -Manual -DistributionId E1234567890ABC
```

### Politique d'Exécution PowerShell
```powershell
# Autoriser l'exécution pour cette session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Autoriser pour l'utilisateur actuel (permanent)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Vérifier la politique actuelle
Get-ExecutionPolicy -List
```

---

## Scripts Bash (Linux/macOS)

### Invalidation Standard
```bash
# Rendre exécutable
chmod +x invalidate-cloudfront.sh

# Invalidation avec détection automatique
./invalidate-cloudfront.sh

# Avec un Distribution ID spécifique
./invalidate-cloudfront.sh E1234567890ABC

# Attendre la complétion
./invalidate-cloudfront.sh E1234567890ABC --wait
```

---

## AWS CLI - CloudFront

### Distributions

#### Lister toutes les distributions
```bash
# Format JSON
aws cloudfront list-distributions

# Format table
aws cloudfront list-distributions --output table

# Format texte
aws cloudfront list-distributions --output text

# Avec jq (parsing JSON)
aws cloudfront list-distributions --output json | jq '.DistributionList.Items[] | {Id, DomainName, Status}'
```

#### Trouver une distribution spécifique
```bash
# Par domaine CloudFront
aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net']"

# Obtenir uniquement l'ID
aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
  --output text

# Par alias (domaine custom)
aws cloudfront list-distributions \
  --query "DistributionList.Items[?Aliases.Items[?contains(@, 'transporteur.symphonia-controltower.com')]]"
```

#### Détails d'une distribution
```bash
# Distribution complète
aws cloudfront get-distribution --id E1234567890ABC

# Uniquement la configuration
aws cloudfront get-distribution-config --id E1234567890ABC

# Uniquement les aliases
aws cloudfront get-distribution --id E1234567890ABC \
  --query "Distribution.DistributionConfig.Aliases.Items"

# Uniquement les origins
aws cloudfront get-distribution --id E1234567890ABC \
  --query "Distribution.DistributionConfig.Origins.Items[].DomainName"

# Status et activé
aws cloudfront get-distribution --id E1234567890ABC \
  --query "Distribution.{Status:Status,Enabled:DistributionConfig.Enabled}"
```

### Invalidations

#### Créer une invalidation
```bash
# Invalidation simple
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

# Invalidation multiple
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" "/_next/static/*" "/_next/static/chunks/*"

# Avec un fichier batch JSON
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --invalidation-batch file://invalidation-batch.json

# Sauvegarder l'Invalidation ID dans une variable
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "Invalidation créée: $INVALIDATION_ID"
```

#### Vérifier le statut d'une invalidation
```bash
# Status simple
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ

# Uniquement le status
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ \
  --query 'Invalidation.Status' \
  --output text

# Avec tous les détails
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ \
  --output json | jq
```

#### Lister les invalidations
```bash
# Toutes les invalidations
aws cloudfront list-invalidations --distribution-id E1234567890ABC

# Seulement les 5 dernières
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --max-items 5

# Seulement celles en cours
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --query "InvalidationList.Items[?Status=='InProgress']"

# Format table lisible
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --output table

# Avec jq
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --output json | jq '.InvalidationList.Items[] | {Id, Status, CreateTime}'
```

#### Attendre la complétion
```bash
# Bloquer jusqu'à la complétion (peut être long)
aws cloudfront wait invalidation-completed \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ

# Avec timeout (en secondes)
timeout 600 aws cloudfront wait invalidation-completed \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ

# Vérifier périodiquement
while true; do
  STATUS=$(aws cloudfront get-invalidation \
    --distribution-id E1234567890ABC \
    --id I1234567890XYZ \
    --query 'Invalidation.Status' \
    --output text)

  echo "Status: $STATUS"

  if [ "$STATUS" = "Completed" ]; then
    echo "Invalidation complète!"
    break
  fi

  sleep 30
done
```

---

## AWS CLI - Configuration

### Configuration Initiale
```bash
# Configuration interactive
aws configure

# Avec des paramètres spécifiques
aws configure set aws_access_key_id YOUR_ACCESS_KEY
aws configure set aws_secret_access_key YOUR_SECRET_KEY
aws configure set default.region eu-west-1
aws configure set default.output json
```

### Profils Multiples
```bash
# Configurer un profil
aws configure --profile production

# Utiliser un profil
aws cloudfront list-distributions --profile production

# Variable d'environnement
export AWS_PROFILE=production
aws cloudfront list-distributions
```

### Vérification
```bash
# Vérifier la configuration
aws configure list

# Vérifier l'identité
aws sts get-caller-identity

# Vérifier la région
aws configure get region

# Vérifier toutes les configs
aws configure list-profiles
cat ~/.aws/config
cat ~/.aws/credentials
```

---

## Commandes de Vérification

### Tester l'Accessibilité du Site

#### PowerShell
```powershell
# Test simple
Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com" -Method Head

# Avec headers
$response = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com" -UseBasicParsing
$response.Headers

# Vérifier X-Cache
$response.Headers["X-Cache"]

# Vérifier Age
$response.Headers["Age"]
```

#### Bash/curl
```bash
# Test simple
curl -I https://transporteur.symphonia-controltower.com

# Avec plus de détails
curl -v https://transporteur.symphonia-controltower.com

# Uniquement le status code
curl -o /dev/null -s -w "%{http_code}\n" https://transporteur.symphonia-controltower.com

# Headers spécifiques
curl -I https://transporteur.symphonia-controltower.com | grep -i x-cache
curl -I https://transporteur.symphonia-controltower.com | grep -i age
curl -I https://transporteur.symphonia-controltower.com | grep -i cache-control

# Tester un bundle spécifique
curl -I https://transporteur.symphonia-controltower.com/_next/static/chunks/[hash].js
```

### Extraire les Bundles JavaScript

#### PowerShell
```powershell
# Télécharger le HTML
$html = Invoke-WebRequest -Uri "https://transporteur.symphonia-controltower.com/transporteur" -UseBasicParsing

# Extraire les fichiers .js
[regex]::Matches($html.Content, '/_next/static/chunks/[a-f0-9]+\.js') | ForEach-Object { $_.Value } | Sort-Object -Unique

# Rechercher un bundle spécifique
$html.Content -match '787220852185cf1e\.js'
```

#### Bash
```bash
# Télécharger et extraire les bundles
curl -s https://transporteur.symphonia-controltower.com/transporteur | \
  grep -oP '/_next/static/chunks/[a-f0-9]+\.js' | \
  sort -u

# Rechercher un bundle spécifique
curl -s https://transporteur.symphonia-controltower.com/transporteur | \
  grep '787220852185cf1e.js'

# Avec plus de contexte
curl -s https://transporteur.symphonia-controltower.com/transporteur | \
  grep -C 3 '787220852185cf1e.js'
```

### DNS et Résolution

```bash
# Résolution DNS
nslookup transporteur.symphonia-controltower.com
dig transporteur.symphonia-controltower.com

# Vérifier que ça pointe vers CloudFront
dig transporteur.symphonia-controltower.com | grep cloudfront

# Résoudre le CNAME
dig transporteur.symphonia-controltower.com CNAME +short

# Ping (peut ne pas répondre, normal)
ping transporteur.symphonia-controltower.com

# Traceroute
traceroute transporteur.symphonia-controltower.com
```

---

## Fichiers JSON pour AWS CLI

### invalidation-batch.json
```json
{
  "Paths": {
    "Quantity": 3,
    "Items": [
      "/*",
      "/_next/static/*",
      "/_next/static/chunks/*"
    ]
  },
  "CallerReference": "manual-invalidation-2025-01-27"
}
```

**Usage**:
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --invalidation-batch file://invalidation-batch.json
```

### invalidation-targeted.json
```json
{
  "Paths": {
    "Quantity": 1,
    "Items": [
      "/_next/static/chunks/787220852185cf1e.js"
    ]
  },
  "CallerReference": "targeted-invalidation-2025-01-27"
}
```

### invalidation-nextjs-full.json
```json
{
  "Paths": {
    "Quantity": 8,
    "Items": [
      "/",
      "/transporteur",
      "/transporteur/*",
      "/_next/*",
      "/_next/static/*",
      "/_next/static/chunks/*",
      "/_next/data/*",
      "/api/*"
    ]
  },
  "CallerReference": "nextjs-full-invalidation-2025-01-27"
}
```

---

## Scripts Shell Utiles

### Script de Monitoring
```bash
#!/bin/bash
# monitor-invalidation.sh

DIST_ID="E1234567890ABC"
INV_ID="I1234567890XYZ"

while true; do
  STATUS=$(aws cloudfront get-invalidation \
    --distribution-id $DIST_ID \
    --id $INV_ID \
    --query 'Invalidation.Status' \
    --output text)

  echo "$(date '+%Y-%m-%d %H:%M:%S') - Status: $STATUS"

  if [ "$STATUS" = "Completed" ]; then
    echo "✅ Invalidation complète!"
    break
  fi

  sleep 30
done
```

### Script d'Invalidation Automatique
```bash
#!/bin/bash
# auto-invalidate.sh

echo "🔍 Recherche de la distribution..."
DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
  --output text)

if [ -z "$DIST_ID" ]; then
  echo "❌ Distribution non trouvée"
  exit 1
fi

echo "✅ Distribution: $DIST_ID"
echo "🚀 Création de l'invalidation..."

INV_ID=$(aws cloudfront create-invalidation \
  --distribution-id $DIST_ID \
  --paths "/*" "/_next/static/*" \
  --query 'Invalidation.Id' \
  --output text)

echo "✅ Invalidation créée: $INV_ID"
echo "⏳ Attente de la complétion..."

aws cloudfront wait invalidation-completed \
  --distribution-id $DIST_ID \
  --id $INV_ID

echo "✅ Invalidation complète!"
```

---

## Variables d'Environnement

### AWS
```bash
# Credentials
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export AWS_DEFAULT_REGION="eu-west-1"
export AWS_DEFAULT_OUTPUT="json"

# Profil
export AWS_PROFILE="production"

# Config file
export AWS_CONFIG_FILE="~/.aws/config"
export AWS_SHARED_CREDENTIALS_FILE="~/.aws/credentials"
```

### PowerShell
```powershell
# Credentials
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_KEY"
$env:AWS_DEFAULT_REGION = "eu-west-1"
$env:AWS_DEFAULT_OUTPUT = "json"

# Profil
$env:AWS_PROFILE = "production"
```

---

## Commandes Utiles Générales

### Git
```bash
# Commiter les scripts
git add rt-frontend-apps/scripts/
git commit -m "Add CloudFront invalidation scripts"
git push
```

### Navigation
```bash
# Aller au dossier scripts
cd rt-frontend-apps/scripts

# Lister les fichiers
ls -la

# Voir le contenu
cat QUICK-START.txt
cat README-CLOUDFRONT-INVALIDATION.md | less
```

### Permissions
```bash
# Rendre tous les scripts Bash exécutables
chmod +x *.sh

# Vérifier les permissions
ls -l *.sh
```

---

## Aide et Documentation

### AWS CLI
```bash
# Aide générale CloudFront
aws cloudfront help

# Aide sur une commande spécifique
aws cloudfront create-invalidation help
aws cloudfront list-distributions help

# Exemples
aws cloudfront create-invalidation --generate-cli-skeleton
```

### PowerShell
```powershell
# Aide sur un script
Get-Help .\invalidate-cloudfront.ps1
Get-Help .\invalidate-cloudfront.ps1 -Full
Get-Help .\invalidate-cloudfront.ps1 -Examples

# Paramètres d'un script
Get-Help .\invalidate-cloudfront.ps1 -Parameter *
```

---

## Raccourcis Utiles

### Alias Bash
```bash
# Ajouter à ~/.bashrc ou ~/.bash_aliases

alias cf-list='aws cloudfront list-distributions'
alias cf-inv='aws cloudfront create-invalidation'
alias cf-status='aws cloudfront get-invalidation'

# Fonction pour invalider rapidement
cf-invalidate() {
  local dist_id="$1"
  aws cloudfront create-invalidation \
    --distribution-id "$dist_id" \
    --paths "/*" "/_next/static/*"
}
```

### Alias PowerShell
```powershell
# Ajouter à $PROFILE

function Invalidate-CloudFront {
  param([string]$DistId)
  aws cloudfront create-invalidation --distribution-id $DistId --paths "/*"
}

Set-Alias -Name cf-inv -Value Invalidate-CloudFront
```

---

**Auteur**: Équipe Symphonia
**Date**: 2025-01-27
**Version**: 1.0.0
