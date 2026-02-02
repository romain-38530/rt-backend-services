# RT Frontend Apps - Scripts et Outils

Ce dossier contient les scripts et outils pour gérer les applications frontend React/Next.js de Symphonia, notamment les scripts d'invalidation CloudFront.

## Structure

```
rt-frontend-apps/
└── scripts/
    ├── invalidate-cloudfront.ps1              # Script principal (Windows)
    ├── invalidate-cloudfront.sh               # Script principal (Linux/Mac)
    ├── quick-invalidate.ps1                   # Invalidation rapide
    ├── invalidate-cloudfront-alternative.ps1  # Solutions alternatives
    ├── test-cloudfront-setup.ps1              # Tests de configuration
    ├── verify-bundle-update.ps1               # Vérification mise à jour
    ├── run-complete-workflow.ps1              # Workflow automatique
    ├── invalidation-batch-example.json        # Exemple JSON
    ├── README-CLOUDFRONT-INVALIDATION.md      # Documentation complète
    ├── INDEX.md                               # Index des scripts
    ├── QUICK-START.txt                        # Guide rapide
    └── COMMANDS-REFERENCE.md                  # Référence commandes
```

## Démarrage Rapide

### Problème à Résoudre

Le site **transporteur.symphonia-controltower.com** sert l'ancien bundle JavaScript (`787220852185cf1e.js`) malgré les déploiements. Les scripts de ce dossier permettent d'invalider le cache CloudFront pour forcer le chargement des nouveaux bundles.

### Solution en 3 Étapes

#### 1. Tester la Configuration (première fois uniquement)
```powershell
cd rt-frontend-apps\scripts
.\test-cloudfront-setup.ps1
```

#### 2. Invalider le Cache CloudFront
```powershell
.\quick-invalidate.ps1
```
**OU** avec suivi complet:
```powershell
.\invalidate-cloudfront.ps1 -Wait
```

#### 3. Vérifier la Mise à Jour (après 10-15 minutes)
```powershell
.\verify-bundle-update.ps1
```

## Scripts Disponibles

### Scripts d'Invalidation

| Script | Description | Usage |
|--------|-------------|-------|
| `quick-invalidate.ps1` | Invalidation ultra-rapide | Pour une invalidation immédiate |
| `invalidate-cloudfront.ps1` | Script complet avec options | Pour un contrôle détaillé |
| `invalidate-cloudfront.sh` | Version Bash | Pour Linux/macOS |

### Scripts de Diagnostic

| Script | Description | Usage |
|--------|-------------|-------|
| `test-cloudfront-setup.ps1` | Teste la configuration | Première utilisation |
| `verify-bundle-update.ps1` | Vérifie la mise à jour | Après invalidation |
| `invalidate-cloudfront-alternative.ps1` | Solutions alternatives | En cas de problème |

### Scripts d'Automatisation

| Script | Description | Usage |
|--------|-------------|-------|
| `run-complete-workflow.ps1` | Workflow automatique complet | Processus end-to-end |

## Documentation

| Fichier | Contenu |
|---------|---------|
| `README-CLOUDFRONT-INVALIDATION.md` | Documentation complète (19 KB) |
| `INDEX.md` | Index des scripts avec descriptions |
| `QUICK-START.txt` | Guide rapide format texte |
| `COMMANDS-REFERENCE.md` | Référence de toutes les commandes |

## Exemples d'Utilisation

### Workflow Standard
```powershell
# Tester (première fois)
.\test-cloudfront-setup.ps1

# Invalider
.\invalidate-cloudfront.ps1 -Wait

# Vérifier
.\verify-bundle-update.ps1
```

### Workflow Rapide
```powershell
# Invalidation immédiate
.\quick-invalidate.ps1

# Attendre 10 minutes...

# Tester le site
Start-Process "https://transporteur.symphonia-controltower.com"
```

### Workflow Automatique Complet
```powershell
# Tout en une commande (tests + invalidation + attente + vérification)
.\run-complete-workflow.ps1
```

### Diagnostic de Problèmes
```powershell
# Lister les distributions
.\invalidate-cloudfront-alternative.ps1 -ListDistributions

# Lister les invalidations
.\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E123...

# Guide manuel
.\invalidate-cloudfront-alternative.ps1 -Manual
```

## Prérequis

### Requis
- ✅ **AWS CLI** (version 2.x)
  - Installation: https://aws.amazon.com/cli/
  - Vérification: `aws --version`

- ✅ **Credentials AWS configurées**
  ```bash
  aws configure
  ```

- ✅ **Permissions IAM**
  - `cloudfront:ListDistributions`
  - `cloudfront:CreateInvalidation`
  - `cloudfront:GetInvalidation`
  - `cloudfront:ListInvalidations`

### Recommandé
- 📦 **jq** (pour le script Bash)
  - Ubuntu/Debian: `sudo apt-get install jq`
  - macOS: `brew install jq`

- 🔧 **PowerShell 5.1+** (Windows)
- 🐧 **Bash 4.0+** (Linux/Mac)

## Commandes AWS CLI Rapides

### Trouver le Distribution ID
```bash
aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='d3fy85w9zy25oo.cloudfront.net'].Id" \
  --output text
```

### Créer une Invalidation
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*" "/_next/static/*" "/_next/static/chunks/*"
```

### Vérifier le Statut
```bash
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ
```

## Dépannage

| Problème | Solution |
|----------|----------|
| Script PowerShell bloqué | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| AWS CLI non trouvé | Installer depuis https://aws.amazon.com/cli/ |
| Credentials invalides | Exécuter `aws configure` |
| Permission denied | Vérifier les permissions IAM CloudFront |
| Distribution non trouvée | `.\invalidate-cloudfront-alternative.ps1 -ListDistributions` |
| Invalidation ne fonctionne pas | Attendre 15 min + vider cache navigateur |

**Pour plus de détails**: Consultez `scripts/README-CLOUDFRONT-INVALIDATION.md`

## Informations Techniques

### Site Concerné
- **Domaine custom**: `transporteur.symphonia-controltower.com`
- **Domaine CloudFront**: `d3fy85w9zy25oo.cloudfront.net`
- **Ancien bundle**: `787220852185cf1e.js`

### Chemins Invalidés
```
/*                          # Tous les fichiers
/_next/static/*             # Assets statiques Next.js
/_next/static/chunks/*      # Chunks JavaScript
```

### Durée de l'Invalidation
- **Création**: Instantanée
- **Propagation**: 5-15 minutes
- **Coût**: Gratuit (jusqu'à 1000 chemins/mois)

## Support et Liens

### Documentation Locale
- 📖 [Documentation Complète](scripts/README-CLOUDFRONT-INVALIDATION.md)
- 📋 [Index des Scripts](scripts/INDEX.md)
- ⚡ [Guide Rapide](scripts/QUICK-START.txt)
- 📚 [Référence des Commandes](scripts/COMMANDS-REFERENCE.md)

### Ressources AWS
- 🌐 [Console CloudFront](https://console.aws.amazon.com/cloudfront/)
- 📖 [Documentation AWS](https://docs.aws.amazon.com/cloudfront/)
- 💰 [Tarification](https://aws.amazon.com/cloudfront/pricing/)

### CLI et Outils
- 🔧 [AWS CLI](https://aws.amazon.com/cli/)
- 📦 [jq](https://stedolan.github.io/jq/)

## Contribution

### Ajouter un Nouveau Script

1. Créer le script dans `scripts/`
2. Le rendre exécutable si Bash: `chmod +x script.sh`
3. Ajouter la documentation dans `INDEX.md`
4. Mettre à jour ce README si nécessaire

### Convention de Nommage

- Scripts PowerShell: `nom-du-script.ps1`
- Scripts Bash: `nom-du-script.sh`
- Documentation: `NOM-EN-MAJUSCULES.md` ou `README-*.md`
- Exemples: `*-example.*`

## Changelog

### Version 1.0.0 (2025-01-27)
- ✨ Scripts PowerShell et Bash initiaux
- 📚 Documentation complète
- 🧪 Scripts de test et vérification
- 🚀 Script d'invalidation rapide
- 🔧 Outils de diagnostic
- 📋 Exemples et références

## Licence

Ces scripts sont fournis tels quels, sans garantie. Utilisez-les à vos propres risques.

---

**Auteur**: Équipe Symphonia
**Date**: 2025-01-27
**Version**: 1.0.0

---

## Résumé Ultra-Rapide

**Pour invalider maintenant**:
```powershell
cd rt-frontend-apps\scripts
.\quick-invalidate.ps1
```

**Pour le workflow complet**:
```powershell
.\run-complete-workflow.ps1
```

**Pour diagnostiquer**:
```powershell
.\test-cloudfront-setup.ps1
```

**Pour en savoir plus**:
Lisez `scripts/README-CLOUDFRONT-INVALIDATION.md`
