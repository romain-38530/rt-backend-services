# Guide d'Invalidation CloudFront Cache

## Contexte

Le site **transporteur.symphonia-controltower.com** sert toujours l'ancien bundle JavaScript (`787220852185cf1e.js`) malgré plusieurs déploiements. Ce guide vous explique comment forcer l'invalidation du cache CloudFront pour résoudre ce problème définitivement.

### Informations du Site
- **Domaine custom**: `transporteur.symphonia-controltower.com`
- **Domaine CloudFront**: `d3fy85w9zy25oo.cloudfront.net`
- **Problème**: Ancien bundle JavaScript mis en cache
- **Solution**: Invalidation CloudFront

---

## Scripts Disponibles

### 1. Script PowerShell Principal
**Fichier**: `invalidate-cloudfront.ps1`

Script automatisé pour Windows qui:
- Détecte automatiquement le Distribution ID CloudFront
- Crée une invalidation pour tous les chemins nécessaires
- Vérifie le statut de l'invalidation
- Offre une option pour attendre la complétion

**Usage**:
```powershell
# Invalidation automatique (détection auto du Distribution ID)
.\invalidate-cloudfront.ps1

# Avec un Distribution ID spécifique
.\invalidate-cloudfront.ps1 -DistributionId E1234567890ABC

# Attendre la complétion de l'invalidation
.\invalidate-cloudfront.ps1 -Wait

# Afficher l'aide
.\invalidate-cloudfront.ps1 -Help
```

### 2. Script PowerShell Alternatif
**Fichier**: `invalidate-cloudfront-alternative.ps1`

Offre des solutions alternatives et des outils de diagnostic:

```powershell
# Lister toutes les distributions CloudFront
.\invalidate-cloudfront-alternative.ps1 -ListDistributions

# Lister les invalidations existantes
.\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E1234567890ABC

# Afficher le guide manuel complet
.\invalidate-cloudfront-alternative.ps1 -Manual

# Guide manuel avec Distribution ID
.\invalidate-cloudfront-alternative.ps1 -Manual -DistributionId E1234567890ABC
```

### 3. Script Bash
**Fichier**: `invalidate-cloudfront.sh`

Pour Linux/macOS:

```bash
# Rendre le script exécutable
chmod +x invalidate-cloudfront.sh

# Invalidation automatique
./invalidate-cloudfront.sh

# Avec un Distribution ID spécifique
./invalidate-cloudfront.sh E1234567890ABC

# Attendre la complétion
./invalidate-cloudfront.sh E1234567890ABC --wait
```

---

## Prérequis

### AWS CLI
- **Version minimale**: 2.x
- **Installation**: https://aws.amazon.com/cli/

**Vérification**:
```bash
aws --version
```

### Credentials AWS
Configurez vos credentials avec:
```bash
aws configure
```

Vous aurez besoin de:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (ex: `eu-west-1`)
- Default output format (recommandé: `json`)

### Permissions IAM Requises
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:ListDistributions",
        "cloudfront:GetDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:GetInvalidation",
        "cloudfront:ListInvalidations"
      ],
      "Resource": "*"
    }
  ]
}
```

### Outils Optionnels
- **jq** (pour le script Bash): Parsing JSON
  - Ubuntu/Debian: `sudo apt-get install jq`
  - macOS: `brew install jq`
  - Windows: Télécharger depuis https://stedolan.github.io/jq/

---

## Guide Rapide

### Méthode 1: Script Automatique (Recommandé)

**Windows PowerShell**:
```powershell
cd rt-frontend-apps\scripts
.\invalidate-cloudfront.ps1 -Wait
```

**Linux/macOS**:
```bash
cd rt-frontend-apps/scripts
./invalidate-cloudfront.sh --wait
```

**Résultat attendu**:
```
============================================================================
  Script d'Invalidation CloudFront Cache
============================================================================

[1/6] Vérification de AWS CLI...
✓ AWS CLI détecté: aws-cli/2.x.x

[2/6] Vérification des credentials AWS...
✓ Connecté en tant que: arn:aws:iam::123456789012:user/your-user

[3/6] Recherche de la distribution CloudFront...
✓ Distribution trouvée!
  ID: E1234567890ABC
  Domain: d3fy85w9zy25oo.cloudfront.net
  Status: Deployed

[4/6] Création de l'invalidation CloudFront...
✓ Invalidation créée avec succès!
  Invalidation ID: I1234567890XYZ
  Status: InProgress

[5/6] Vérification du statut de l'invalidation...
  Status actuel: InProgress
⏳ L'invalidation est en cours de traitement...

[6/6] Attente de la complétion de l'invalidation...
  [1/40] Status: InProgress
  [2/40] Status: InProgress
  ...
  [8/40] Status: Completed
✓ Invalidation complète!
```

### Méthode 2: AWS CLI Manuel

**Trouver le Distribution ID**:
```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
  --output text
```

**Créer l'invalidation**:
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" "/_next/static/*" "/_next/static/chunks/*"
```

**Vérifier le statut**:
```bash
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ
```

### Méthode 3: Console AWS (Interface Web)

1. **Accéder à CloudFront**:
   - URL: https://console.aws.amazon.com/cloudfront/
   - Connectez-vous avec vos credentials AWS

2. **Trouver la distribution**:
   - Recherchez `d3fy85w9zy25oo.cloudfront.net`
   - Ou l'alias `transporteur.symphonia-controltower.com`
   - Cliquez sur le Distribution ID

3. **Créer une invalidation**:
   - Allez dans l'onglet **"Invalidations"**
   - Cliquez sur **"Create invalidation"**
   - Dans **"Object paths"**, entrez:
     ```
     /*
     /_next/static/*
     /_next/static/chunks/*
     ```
   - Cliquez sur **"Create invalidation"**

4. **Attendre la complétion**:
   - Status: **"In Progress"** → **"Completed"**
   - Durée: 5-15 minutes

---

## Chemins à Invalider

### Invalidation Complète (Recommandé)
```
/*
/_next/static/*
/_next/static/chunks/*
```

**Avantages**:
- Garantit que tous les fichiers sont mis à jour
- Résout tous les problèmes de cache

**Coût**:
- Gratuit (jusqu'à 1000 chemins/mois)

### Invalidation Ciblée (Économique)
Si vous connaissez le fichier exact:
```
/_next/static/chunks/787220852185cf1e.js
/_next/static/chunks/nouveau-hash.js
```

**Avantages**:
- Plus rapide
- Consomme moins de quotas

**Inconvénients**:
- Peut manquer d'autres fichiers problématiques

### Invalidation Progressive
Pour un déploiement Next.js complet:
```bash
# Phase 1: Pages HTML
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/transporteur" "/transporteur/*"

# Phase 2: Assets statiques
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/_next/static/*"

# Phase 3: Tout le reste
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

---

## Vérification Post-Invalidation

### 1. Vérifier l'invalidation CloudFront

**Status de l'invalidation**:
```bash
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ
```

**Toutes les invalidations récentes**:
```bash
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --max-items 10
```

### 2. Tester les URLs

**URL CloudFront directe**:
```bash
curl -I https://d3fy85w9zy25oo.cloudfront.net/_next/static/chunks/[hash].js
```

**URL avec domaine custom**:
```bash
curl -I https://transporteur.symphonia-controltower.com/_next/static/chunks/[hash].js
```

**Headers importants à vérifier**:
```
X-Cache: Miss from cloudfront    # Première requête après invalidation
X-Cache: Hit from cloudfront     # Requêtes suivantes (normal)
Age: 0                           # Contenu fraîchement récupéré
Cache-Control: max-age=31536000  # Durée de cache
```

### 3. Tester dans le navigateur

**Chrome/Edge**:
1. Ouvrir DevTools (F12)
2. Onglet **"Network"**
3. Cocher **"Disable cache"**
4. Recharger la page (Ctrl+Shift+R)
5. Vérifier les fichiers `.js` chargés

**Firefox**:
1. Ouvrir DevTools (F12)
2. Onglet **"Réseau"**
3. Cocher **"Désactiver le cache"**
4. Recharger (Ctrl+Shift+R)

**Safari**:
1. Développement → Afficher l'inspecteur web
2. Onglet **"Réseau"**
3. Vider les caches (Cmd+Option+E)
4. Recharger (Cmd+R)

### 4. Vérifier le nouveau bundle

**Inspecter le HTML**:
```bash
curl https://transporteur.symphonia-controltower.com/transporteur | grep -o '_next/static/chunks/[^"]*\.js' | head -5
```

**Comparer avec l'ancien**:
- **Ancien**: `787220852185cf1e.js`
- **Nouveau**: Devrait être un hash différent

---

## Dépannage

### Problème: Permission Denied

**Erreur**:
```
An error occurred (AccessDenied) when calling the CreateInvalidation operation
```

**Solution**:
1. Vérifiez vos permissions IAM
2. Vérifiez le profil AWS utilisé:
   ```bash
   aws configure list
   aws sts get-caller-identity
   ```
3. Utilisez un profil spécifique:
   ```bash
   aws cloudfront create-invalidation \
     --profile production \
     --distribution-id E1234567890ABC \
     --paths "/*"
   ```

### Problème: Distribution Non Trouvée

**Erreur**:
```
An error occurred (NoSuchDistribution) when calling the GetDistribution operation
```

**Solution**:
1. Listez toutes vos distributions:
   ```bash
   aws cloudfront list-distributions --output table
   ```
2. Vérifiez que vous êtes dans la bonne région AWS
3. CloudFront est un service **global**, pas régional

### Problème: L'invalidation ne fonctionne pas

**Symptômes**:
- Status "Completed" mais ancien bundle toujours servi
- Cache du navigateur toujours obsolète

**Solutions**:

1. **Vérifier les behaviors de cache**:
   ```bash
   aws cloudfront get-distribution --id E1234567890ABC \
     --query "Distribution.DistributionConfig.CacheBehaviors"
   ```

2. **Vérifier les headers de l'origine**:
   ```bash
   curl -I https://[origine-amplify].amplifyapp.com/_next/static/chunks/[hash].js
   ```

3. **Vider le cache du navigateur**:
   - Complètement, pas juste Ctrl+R
   - Utilisez le mode navigation privée pour tester

4. **Attendre plus longtemps**:
   - Les invalidations peuvent prendre jusqu'à 15 minutes
   - Les edge locations peuvent se propager différemment

5. **Créer une nouvelle invalidation**:
   - Parfois une seconde invalidation résout le problème
   - Utilisez `/*` pour être sûr

### Problème: Coûts Élevés

**Symptômes**:
- Facture CloudFront élevée
- Trop d'invalidations

**Solutions**:

1. **Limiter les chemins**:
   - Utilisez des chemins spécifiques au lieu de `/*`
   - Groupez les invalidations

2. **Optimiser les déploiements**:
   - Invalidez uniquement ce qui a changé
   - Utilisez des versions dans les noms de fichiers

3. **Tarification CloudFront**:
   - **1000 premiers chemins/mois**: Gratuit
   - **Au-delà**: $0.005 par chemin
   - **Wildcard (`/*`)**: Compte comme 1 chemin

4. **Alternative aux invalidations**:
   - Utilisez des versions dans les URLs
   - Exemple: `/static/v2/bundle.js` au lieu de `/static/bundle.js`
   - CloudFront met en cache par URL complète

### Problème: Script PowerShell Bloqué

**Erreur**:
```
execution of scripts is disabled on this system
```

**Solution**:
```powershell
# Temporaire (session actuelle)
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Permanent (pour l'utilisateur)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Problème: AWS CLI Non Configuré

**Erreur**:
```
Unable to locate credentials
```

**Solution**:
```bash
# Configuration interactive
aws configure

# Ou exporter les variables d'environnement
export AWS_ACCESS_KEY_ID="YOUR_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="YOUR_SECRET_KEY"
export AWS_DEFAULT_REGION="eu-west-1"
```

---

## Tarification CloudFront

### Invalidations
| Quantité | Coût |
|----------|------|
| 0-1000 chemins/mois | **Gratuit** |
| Au-delà de 1000 | $0.005 par chemin |

### Exemples
- **Invalidation complète** (`/*`): 1 chemin → **Gratuit**
- **3 chemins spécifiques**: 3 chemins → **Gratuit**
- **2000 chemins**: 1000 gratuits + 1000 × $0.005 = **$5.00**

### Optimisation des Coûts
1. Utilisez des wildcards (`/*` = 1 chemin)
2. Groupez les invalidations
3. Invalidez uniquement ce qui change
4. Préférez les versions dans les URLs

---

## Automatisation

### Intégration CI/CD

**GitHub Actions**:
```yaml
name: Deploy and Invalidate CloudFront

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: eu-west-1

      - name: Deploy to Amplify
        run: |
          # Votre script de déploiement
          npm run build
          # ...

      - name: Invalidate CloudFront
        run: |
          DISTRIBUTION_ID=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
            --output text)

          aws cloudfront create-invalidation \
            --distribution-id $DISTRIBUTION_ID \
            --paths "/*" "/_next/static/*"
```

### Script Post-Déploiement

**post-deploy.sh**:
```bash
#!/bin/bash

echo "Déploiement terminé, invalidation du cache CloudFront..."

# Trouver le Distribution ID
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
  --output text)

if [ -z "$DISTRIBUTION_ID" ]; then
  echo "❌ Distribution non trouvée"
  exit 1
fi

echo "📦 Distribution ID: $DISTRIBUTION_ID"

# Créer l'invalidation
INVALIDATION=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" "/_next/static/*" \
  --output json)

INVALIDATION_ID=$(echo "$INVALIDATION" | jq -r '.Invalidation.Id')

echo "✅ Invalidation créée: $INVALIDATION_ID"
echo "⏳ Attendez 5-15 minutes pour la propagation complète"

# Optionnel: Attendre la complétion
echo "Attente de la complétion..."
aws cloudfront wait invalidation-completed \
  --distribution-id "$DISTRIBUTION_ID" \
  --id "$INVALIDATION_ID"

echo "✅ Invalidation complète!"
```

### Intégration Amplify

**amplify.yml**:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*

  # Post-build: Invalidation CloudFront
  postBuild:
    commands:
      - |
        if [ "$AWS_BRANCH" = "main" ]; then
          echo "Invalidation CloudFront pour la production..."
          DIST_ID=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
            --output text)
          aws cloudfront create-invalidation \
            --distribution-id $DIST_ID \
            --paths "/*" "/_next/static/*"
        fi
```

---

## Commandes Utiles

### Lister les Distributions
```bash
# Format table
aws cloudfront list-distributions --output table

# Format JSON (avec jq)
aws cloudfront list-distributions --output json | jq -r '.DistributionList.Items[] | "\(.Id) - \(.DomainName)"'

# Filtrer par domaine
aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net']"
```

### Obtenir les Détails d'une Distribution
```bash
aws cloudfront get-distribution --id E1234567890ABC

# Uniquement les aliases
aws cloudfront get-distribution --id E1234567890ABC \
  --query "Distribution.DistributionConfig.Aliases.Items"

# Uniquement les origins
aws cloudfront get-distribution --id E1234567890ABC \
  --query "Distribution.DistributionConfig.Origins.Items[].DomainName"
```

### Lister les Invalidations
```bash
# Toutes les invalidations
aws cloudfront list-invalidations --distribution-id E1234567890ABC

# Seulement les 5 dernières
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --max-items 5

# Filtrer par status
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC \
  --query "InvalidationList.Items[?Status=='InProgress']"
```

### Créer des Invalidations
```bash
# Invalidation simple
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"

# Invalidation multiple
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" "/index.html" "/_next/*"

# Avec un fichier batch
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --invalidation-batch file://invalidation.json
```

**invalidation.json**:
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
  "CallerReference": "invalidation-2025-01-27-001"
}
```

### Attendre la Complétion
```bash
# Bloquer jusqu'à la complétion
aws cloudfront wait invalidation-completed \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ

# Avec timeout (600 secondes max)
timeout 600 aws cloudfront wait invalidation-completed \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ
```

---

## Liens Utiles

### Documentation AWS
- **CloudFront Invalidation**: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html
- **AWS CLI CloudFront**: https://docs.aws.amazon.com/cli/latest/reference/cloudfront/index.html
- **Tarification**: https://aws.amazon.com/cloudfront/pricing/
- **Best Practices**: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/best-practices.html

### Console AWS
- **CloudFront Home**: https://console.aws.amazon.com/cloudfront/v3/home
- **IAM Permissions**: https://console.aws.amazon.com/iam/home#/users
- **CloudWatch Metrics**: https://console.aws.amazon.com/cloudwatch/

### Outils
- **AWS CLI Installation**: https://aws.amazon.com/cli/
- **jq (JSON processor)**: https://stedolan.github.io/jq/
- **AWS CLI Completer**: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-completion.html

---

## Support

### Problèmes Scripts
Si vous rencontrez des problèmes avec les scripts:
1. Vérifiez les prérequis (AWS CLI, credentials, permissions)
2. Utilisez le script alternatif pour diagnostiquer
3. Utilisez le guide manuel en dernier recours

### AWS Support
- **Support gratuit**: Forums AWS, Stack Overflow
- **Support payant**: AWS Support Plans
- **Documentation**: Toujours à jour et complète

### Next.js / Amplify
- **Next.js Caching**: https://nextjs.org/docs/app/building-your-application/deploying
- **Amplify Hosting**: https://docs.amplify.aws/
- **CloudFront with Next.js**: Best practices

---

## Changelog

### Version 1.0.0 (2025-01-27)
- Scripts PowerShell et Bash initiaux
- Guide complet d'utilisation
- Solutions alternatives
- Intégration CI/CD

---

## Licence

Ces scripts sont fournis tels quels, sans garantie. Utilisez-les à vos propres risques.

---

**Auteur**: Équipe Symphonia
**Date**: 2025-01-27
**Version**: 1.0.0
