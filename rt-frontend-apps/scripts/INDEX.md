# Scripts CloudFront - Index

## Vue d'ensemble

Ce dossier contient tous les scripts nécessaires pour gérer l'invalidation du cache CloudFront, particulièrement pour résoudre le problème du bundle JavaScript obsolète sur le site transporteur.symphonia-controltower.com.

---

## Scripts Disponibles

### 🚀 Scripts Principaux

#### 1. **invalidate-cloudfront.ps1** (PowerShell - Recommandé)
Script complet et automatisé pour Windows.

**Caractéristiques**:
- Détection automatique du Distribution ID
- Création d'invalidation avec vérification
- Option pour attendre la complétion
- Gestion complète des erreurs
- Affichage coloré et informatif

**Usage**:
```powershell
.\invalidate-cloudfront.ps1           # Auto-détection
.\invalidate-cloudfront.ps1 -Wait    # Attendre la complétion
.\invalidate-cloudfront.ps1 -Help    # Afficher l'aide
```

**Quand l'utiliser**: Pour une invalidation standard sur Windows

---

#### 2. **invalidate-cloudfront.sh** (Bash)
Version Bash pour Linux/macOS.

**Caractéristiques**:
- Équivalent du script PowerShell
- Support de jq pour le parsing JSON
- Compatible Linux, macOS, WSL

**Usage**:
```bash
chmod +x invalidate-cloudfront.sh
./invalidate-cloudfront.sh                    # Auto-détection
./invalidate-cloudfront.sh E123... --wait    # Avec attente
```

**Quand l'utiliser**: Sur Linux, macOS ou WSL

---

#### 3. **quick-invalidate.ps1** (PowerShell - Rapide)
Version ultra-simplifiée pour une invalidation rapide.

**Caractéristiques**:
- Une seule commande, pas d'options
- Invalide immédiatement
- Sortie minimaliste

**Usage**:
```powershell
.\quick-invalidate.ps1
```

**Quand l'utiliser**: Quand vous voulez juste invalider rapidement sans détails

---

### 🔧 Scripts Utilitaires

#### 4. **invalidate-cloudfront-alternative.ps1** (PowerShell)
Solutions alternatives et outils de diagnostic.

**Caractéristiques**:
- Liste toutes les distributions
- Liste les invalidations existantes
- Guide manuel complet
- Dépannage

**Usage**:
```powershell
# Lister les distributions
.\invalidate-cloudfront-alternative.ps1 -ListDistributions

# Lister les invalidations
.\invalidate-cloudfront-alternative.ps1 -ListInvalidations -DistributionId E123...

# Guide manuel
.\invalidate-cloudfront-alternative.ps1 -Manual
```

**Quand l'utiliser**:
- Quand les scripts principaux échouent
- Pour diagnostiquer des problèmes
- Pour apprendre les commandes manuelles

---

#### 5. **test-cloudfront-setup.ps1** (PowerShell)
Script de test pour vérifier que tout est prêt.

**Caractéristiques**:
- Vérifie AWS CLI
- Vérifie les credentials
- Vérifie les permissions
- Vérifie la connectivité
- Vérifie les scripts

**Usage**:
```powershell
.\test-cloudfront-setup.ps1
```

**Quand l'utiliser**: Avant d'utiliser les scripts d'invalidation pour la première fois

---

## Fichiers de Support

### 📄 Documentation

#### **README-CLOUDFRONT-INVALIDATION.md**
Documentation complète avec:
- Guide d'utilisation détaillé
- Toutes les méthodes d'invalidation
- Dépannage complet
- Intégration CI/CD
- Exemples de commandes
- Tarification
- FAQ

**Quand le lire**: Pour comprendre en détail comment tout fonctionne

---

#### **INDEX.md** (ce fichier)
Index rapide pour naviguer dans les scripts.

---

### 📋 Fichiers Exemples

#### **invalidation-batch-example.json**
Exemple de fichier JSON pour une invalidation batch via AWS CLI.

**Usage**:
```bash
aws cloudfront create-invalidation \
  --distribution-id E123... \
  --invalidation-batch file://invalidation-batch-example.json
```

---

## Guide de Démarrage Rapide

### Première Utilisation

1. **Tester l'environnement**:
   ```powershell
   .\test-cloudfront-setup.ps1
   ```

2. **Invalider le cache**:
   ```powershell
   .\invalidate-cloudfront.ps1 -Wait
   ```

3. **Vérifier le résultat**:
   - Attendez 5-15 minutes
   - Testez: https://transporteur.symphonia-controltower.com
   - Videz le cache du navigateur (Ctrl+Shift+R)

---

### Utilisation Quotidienne

**Pour une invalidation rapide**:
```powershell
.\quick-invalidate.ps1
```

**Pour une invalidation avec suivi**:
```powershell
.\invalidate-cloudfront.ps1 -Wait
```

**Pour diagnostiquer des problèmes**:
```powershell
.\invalidate-cloudfront-alternative.ps1 -ListDistributions
```

---

## Arborescence des Fichiers

```
rt-frontend-apps/scripts/
│
├── invalidate-cloudfront.ps1                    # Script principal (Windows)
├── invalidate-cloudfront.sh                     # Script principal (Linux/Mac)
├── quick-invalidate.ps1                         # Script rapide
├── invalidate-cloudfront-alternative.ps1        # Solutions alternatives
├── test-cloudfront-setup.ps1                    # Tests de configuration
│
├── invalidation-batch-example.json              # Exemple JSON
│
├── README-CLOUDFRONT-INVALIDATION.md            # Documentation complète
└── INDEX.md                                     # Ce fichier
```

---

## Workflow Recommandé

### Scenario 1: Premier Déploiement
```
1. test-cloudfront-setup.ps1           → Vérifier l'environnement
2. README-CLOUDFRONT-INVALIDATION.md   → Lire la documentation
3. invalidate-cloudfront.ps1 -Wait     → Invalider avec attente
```

### Scenario 2: Déploiement Régulier
```
1. quick-invalidate.ps1                → Invalidation rapide
   OU
1. invalidate-cloudfront.ps1           → Invalidation standard
```

### Scenario 3: Problème
```
1. invalidate-cloudfront-alternative.ps1 -ListDistributions  → Vérifier les distributions
2. test-cloudfront-setup.ps1                                 → Vérifier la config
3. invalidate-cloudfront-alternative.ps1 -Manual             → Guide manuel
4. README-CLOUDFRONT-INVALIDATION.md (section Dépannage)     → Solutions
```

### Scenario 4: Intégration CI/CD
```
1. README-CLOUDFRONT-INVALIDATION.md (section Automatisation)  → Exemples
2. invalidate-cloudfront.sh                                    → Adapter le script
```

---

## Commandes AWS CLI Essentielles

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
  --paths "/*" "/_next/static/*"
```

### Vérifier le Statut
```bash
aws cloudfront get-invalidation \
  --distribution-id E1234567890ABC \
  --id I1234567890XYZ
```

### Lister les Invalidations
```bash
aws cloudfront list-invalidations \
  --distribution-id E1234567890ABC
```

---

## Dépannage Rapide

| Problème | Solution |
|----------|----------|
| Script PowerShell bloqué | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` |
| AWS CLI non trouvé | Installer depuis https://aws.amazon.com/cli/ |
| Credentials invalides | `aws configure` |
| Permission denied | Vérifier les permissions IAM CloudFront |
| Distribution non trouvée | `.\invalidate-cloudfront-alternative.ps1 -ListDistributions` |
| Invalidation ne fonctionne pas | Attendre 15 min + vider cache navigateur |

**Pour plus de détails**: Consultez le README-CLOUDFRONT-INVALIDATION.md

---

## Prérequis

### Requis
- ✅ AWS CLI (v2.x)
- ✅ Credentials AWS configurées
- ✅ Permissions IAM CloudFront

### Recommandé
- 📦 jq (pour le script Bash)
- 🔧 PowerShell 5.1+ (Windows)
- 🐧 Bash 4.0+ (Linux/Mac)

---

## Support et Contact

### Documentation
- README complet: `README-CLOUDFRONT-INVALIDATION.md`
- Documentation AWS: https://docs.aws.amazon.com/cloudfront/

### Scripts
- Tests: `test-cloudfront-setup.ps1`
- Diagnostic: `invalidate-cloudfront-alternative.ps1 -Manual`

### Aide
- AWS CLI Help: `aws cloudfront help`
- PowerShell Help: `Get-Help .\invalidate-cloudfront.ps1`

---

## Changelog

### Version 1.0.0 (2025-01-27)
- ✨ Scripts PowerShell et Bash initiaux
- 📚 Documentation complète
- 🧪 Script de test
- 🚀 Script rapide
- 🔧 Outils de diagnostic
- 📋 Exemples JSON

---

## Liens Rapides

- **Console CloudFront**: https://console.aws.amazon.com/cloudfront/
- **IAM Console**: https://console.aws.amazon.com/iam/
- **Documentation AWS**: https://docs.aws.amazon.com/cloudfront/
- **AWS CLI CloudFront**: https://docs.aws.amazon.com/cli/latest/reference/cloudfront/

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

**Pour invalider avec suivi**:
```powershell
.\invalidate-cloudfront.ps1 -Wait
```

**Pour diagnostiquer**:
```powershell
.\test-cloudfront-setup.ps1
```

**Pour en savoir plus**:
Lisez `README-CLOUDFRONT-INVALIDATION.md`
