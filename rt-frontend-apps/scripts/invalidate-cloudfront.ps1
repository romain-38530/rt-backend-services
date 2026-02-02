# ============================================================================
# Script d'Invalidation CloudFront Cache
# ============================================================================
# Objectif: Forcer l'invalidation du cache CloudFront pour résoudre le problème
#           du bundle JavaScript obsolète (787220852185cf1e.js)
#
# Domaine cible: transporteur.symphonia-controltower.com
# CloudFront: d3fy85w9zy25oo.cloudfront.net
#
# Usage:
#   .\invalidate-cloudfront.ps1
#   .\invalidate-cloudfront.ps1 -DistributionId E1234567890ABC
#   .\invalidate-cloudfront.ps1 -Wait
#
# Prérequis:
#   - AWS CLI configuré avec les bonnes credentials
#   - Permissions CloudFront: CreateInvalidation, ListDistributions, GetInvalidation
# ============================================================================

param(
    [string]$DistributionId = "",
    [switch]$Wait = $false,
    [switch]$Help = $false
)

# Fonction d'aide
function Show-Help {
    Write-Host @"

Script d'Invalidation CloudFront Cache
======================================

Usage:
  .\invalidate-cloudfront.ps1 [OPTIONS]

Options:
  -DistributionId <ID>    Distribution ID CloudFront (auto-détecté si omis)
  -Wait                   Attendre que l'invalidation soit complète
  -Help                   Afficher cette aide

Exemples:
  .\invalidate-cloudfront.ps1
  .\invalidate-cloudfront.ps1 -DistributionId E1234567890ABC
  .\invalidate-cloudfront.ps1 -Wait

"@
    exit 0
}

if ($Help) {
    Show-Help
}

# Couleurs pour l'affichage
function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }

Write-Info "`n============================================================================"
Write-Info "  Script d'Invalidation CloudFront Cache"
Write-Info "============================================================================`n"

# Vérifier que AWS CLI est installé
Write-Info "[1/6] Vérification de AWS CLI..."
try {
    $awsVersion = aws --version 2>&1
    Write-Success "✓ AWS CLI détecté: $awsVersion"
} catch {
    Write-Error "✗ AWS CLI n'est pas installé ou pas dans le PATH"
    Write-Warning "`nInstallez AWS CLI:"
    Write-Warning "  https://aws.amazon.com/cli/`n"
    exit 1
}

# Vérifier les credentials AWS
Write-Info "`n[2/6] Vérification des credentials AWS..."
try {
    $identity = aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    Write-Success "✓ Connecté en tant que: $($identity.Arn)"
    Write-Info "  Account: $($identity.Account)"
    Write-Info "  UserId: $($identity.UserId)"
} catch {
    Write-Error "✗ Credentials AWS invalides ou non configurées"
    Write-Warning "`nConfigurez vos credentials avec:"
    Write-Warning "  aws configure`n"
    exit 1
}

# Trouver la distribution CloudFront si non spécifiée
if ([string]::IsNullOrEmpty($DistributionId)) {
    Write-Info "`n[3/6] Recherche de la distribution CloudFront..."
    Write-Info "  Recherche du domaine: d3fy85w9zy25oo.cloudfront.net"

    try {
        $distributions = aws cloudfront list-distributions --output json 2>&1 | ConvertFrom-Json

        if ($distributions.DistributionList.Items.Count -eq 0) {
            Write-Error "✗ Aucune distribution CloudFront trouvée"
            exit 1
        }

        Write-Info "  Nombre de distributions trouvées: $($distributions.DistributionList.Items.Count)"

        # Rechercher la distribution correspondante
        $targetDistribution = $null
        foreach ($dist in $distributions.DistributionList.Items) {
            $domainName = $dist.DomainName
            $aliases = $dist.Aliases.Items -join ", "

            Write-Info "  - ID: $($dist.Id) | Domain: $domainName | Aliases: $aliases"

            if ($domainName -eq "d3fy85w9zy25oo.cloudfront.net") {
                $targetDistribution = $dist
                $DistributionId = $dist.Id
                Write-Success "`n✓ Distribution trouvée!"
                Write-Info "  ID: $DistributionId"
                Write-Info "  Domain: $domainName"
                Write-Info "  Status: $($dist.Status)"
                Write-Info "  Enabled: $($dist.Enabled)"
                if ($aliases) {
                    Write-Info "  Aliases: $aliases"
                }
                break
            }
        }

        if ($null -eq $targetDistribution) {
            Write-Error "`n✗ Distribution pour d3fy85w9zy25oo.cloudfront.net non trouvée"
            Write-Warning "`nDistributions disponibles:"
            foreach ($dist in $distributions.DistributionList.Items) {
                Write-Warning "  - $($dist.Id): $($dist.DomainName)"
            }
            exit 1
        }
    } catch {
        Write-Error "✗ Erreur lors de la récupération des distributions"
        Write-Error $_.Exception.Message
        exit 1
    }
} else {
    Write-Info "`n[3/6] Utilisation de la distribution spécifiée: $DistributionId"
}

# Créer l'invalidation
Write-Info "`n[4/6] Création de l'invalidation CloudFront..."

# Chemins à invalider
$paths = @(
    "/*",                      # Tous les fichiers
    "/_next/static/*",         # Fichiers statiques Next.js
    "/_next/static/chunks/*"   # Chunks JavaScript spécifiques
)

Write-Info "  Chemins à invalider:"
foreach ($path in $paths) {
    Write-Info "    - $path"
}

# Générer un CallerReference unique
$callerReference = "invalidation-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# Créer le fichier JSON pour l'invalidation
$invalidationJson = @{
    Paths = @{
        Quantity = $paths.Count
        Items = $paths
    }
    CallerReference = $callerReference
} | ConvertTo-Json -Depth 10

$tempFile = [System.IO.Path]::GetTempFileName()
$invalidationJson | Out-File -FilePath $tempFile -Encoding utf8

try {
    Write-Info "`n  Envoi de la requête d'invalidation..."
    $invalidation = aws cloudfront create-invalidation `
        --distribution-id $DistributionId `
        --invalidation-batch "file://$tempFile" `
        --output json 2>&1 | ConvertFrom-Json

    $invalidationId = $invalidation.Invalidation.Id
    $status = $invalidation.Invalidation.Status
    $createTime = $invalidation.Invalidation.CreateTime

    Write-Success "`n✓ Invalidation créée avec succès!"
    Write-Info "  Invalidation ID: $invalidationId"
    Write-Info "  Status: $status"
    Write-Info "  Create Time: $createTime"
    Write-Info "  Paths invalidés: $($paths.Count)"

} catch {
    Write-Error "✗ Erreur lors de la création de l'invalidation"
    Write-Error $_.Exception.Message
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
    exit 1
} finally {
    Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue
}

# Vérifier le statut de l'invalidation
Write-Info "`n[5/6] Vérification du statut de l'invalidation..."

try {
    $invalidationStatus = aws cloudfront get-invalidation `
        --distribution-id $DistributionId `
        --id $invalidationId `
        --output json 2>&1 | ConvertFrom-Json

    $currentStatus = $invalidationStatus.Invalidation.Status
    Write-Info "  Status actuel: $currentStatus"

    if ($currentStatus -eq "Completed") {
        Write-Success "✓ L'invalidation est déjà complète!"
    } else {
        Write-Warning "⏳ L'invalidation est en cours de traitement..."
        Write-Info "  Cela peut prendre 5-15 minutes."
    }

} catch {
    Write-Warning "⚠ Impossible de vérifier le statut de l'invalidation"
    Write-Warning $_.Exception.Message
}

# Attendre la complétion si demandé
if ($Wait) {
    Write-Info "`n[6/6] Attente de la complétion de l'invalidation..."
    Write-Info "  Vérification toutes les 30 secondes..."

    $maxAttempts = 40  # 20 minutes max
    $attempt = 0
    $completed = $false

    while (-not $completed -and $attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 30
        $attempt++

        try {
            $invalidationStatus = aws cloudfront get-invalidation `
                --distribution-id $DistributionId `
                --id $invalidationId `
                --output json 2>&1 | ConvertFrom-Json

            $currentStatus = $invalidationStatus.Invalidation.Status
            Write-Info "  [$attempt/$maxAttempts] Status: $currentStatus"

            if ($currentStatus -eq "Completed") {
                $completed = $true
                Write-Success "`n✓ Invalidation complète!"
                break
            }
        } catch {
            Write-Warning "  Erreur lors de la vérification du statut (tentative $attempt)"
        }
    }

    if (-not $completed) {
        Write-Warning "`n⚠ Timeout atteint. L'invalidation est toujours en cours."
        Write-Info "  Vérifiez manuellement le statut avec:"
        Write-Info "  aws cloudfront get-invalidation --distribution-id $DistributionId --id $invalidationId"
    }
} else {
    Write-Info "`n[6/6] Suivi de l'invalidation..."
    Write-Info "  Pour suivre le statut en temps réel, exécutez:"
    Write-Info "  aws cloudfront get-invalidation --distribution-id $DistributionId --id $invalidationId"
    Write-Info "`n  Ou relancez ce script avec l'option -Wait:"
    Write-Info "  .\invalidate-cloudfront.ps1 -Wait"
}

# Résumé final
Write-Info "`n============================================================================"
Write-Success "  Invalidation CloudFront - Terminé"
Write-Info "============================================================================`n"

Write-Info "Distribution ID: $DistributionId"
Write-Info "Invalidation ID: $invalidationId"
Write-Info "Status: $currentStatus"
Write-Info "`nProchaines étapes:"
Write-Info "  1. Attendez 5-15 minutes que l'invalidation se propage"
Write-Info "  2. Testez le site: https://transporteur.symphonia-controltower.com"
Write-Info "  3. Vérifiez que le nouveau bundle JavaScript est chargé"
Write-Info "  4. Si nécessaire, videz le cache du navigateur (Ctrl+Shift+R)"

Write-Info "`nCommandes utiles:"
Write-Info "  # Vérifier le statut"
Write-Info "  aws cloudfront get-invalidation --distribution-id $DistributionId --id $invalidationId"
Write-Info "`n  # Lister toutes les invalidations"
Write-Info "  aws cloudfront list-invalidations --distribution-id $DistributionId"
Write-Info "`n  # Via la console AWS"
Write-Info "  https://console.aws.amazon.com/cloudfront/v3/home#/distributions/$DistributionId"

Write-Info "`n============================================================================`n"

# Retourner les informations importantes
return @{
    DistributionId = $DistributionId
    InvalidationId = $invalidationId
    Status = $currentStatus
    Paths = $paths
}
