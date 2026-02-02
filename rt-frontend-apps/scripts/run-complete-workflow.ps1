# ============================================================================
# Workflow Complet - Invalidation CloudFront
# ============================================================================
# Exécute le workflow complet:
#   1. Test de la configuration
#   2. Invalidation CloudFront
#   3. Attente de la complétion
#   4. Vérification de la mise à jour
# ============================================================================

param(
    [switch]$SkipTests = $false,
    [switch]$SkipVerification = $false,
    [int]$WaitMinutes = 10
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }
function Write-Step { param($Message) Write-Host "`n$Message" -ForegroundColor Yellow -BackgroundColor DarkBlue }

Write-Info @"

================================================================================
         WORKFLOW COMPLET D'INVALIDATION CLOUDFRONT
================================================================================

Ce script va exécuter automatiquement:
  1. Tests de configuration
  2. Invalidation CloudFront
  3. Attente de la complétion
  4. Vérification de la mise à jour

Durée estimée: $($WaitMinutes + 5) minutes

================================================================================

"@

Start-Sleep -Seconds 2

# ============================================================================
# Étape 1: Test de la Configuration
# ============================================================================
if (-not $SkipTests) {
    Write-Step "═══ ÉTAPE 1/4: TEST DE LA CONFIGURATION ═══"

    Write-Info "`nExécution de test-cloudfront-setup.ps1...`n"

    $testScript = Join-Path $scriptDir "test-cloudfront-setup.ps1"
    if (Test-Path $testScript) {
        & $testScript

        if ($LASTEXITCODE -ne 0) {
            Write-Error "`n❌ Les tests de configuration ont échoué!"
            Write-Warning "Veuillez corriger les problèmes avant de continuer."
            Write-Info ""
            Read-Host "Appuyez sur Entrée pour quitter"
            exit 1
        }

        Write-Success "`n✅ Tests de configuration réussis!"
        Start-Sleep -Seconds 3
    } else {
        Write-Warning "Script de test non trouvé, passage à l'étape suivante..."
    }
} else {
    Write-Warning "Tests de configuration ignorés (SkipTests activé)"
}

# ============================================================================
# Étape 2: Invalidation CloudFront
# ============================================================================
Write-Step "`n═══ ÉTAPE 2/4: INVALIDATION CLOUDFRONT ═══"

Write-Info "`nExécution de invalidate-cloudfront.ps1...`n"

$invalidateScript = Join-Path $scriptDir "invalidate-cloudfront.ps1"
if (Test-Path $invalidateScript) {
    $result = & $invalidateScript -Wait

    if ($LASTEXITCODE -ne 0) {
        Write-Error "`n❌ L'invalidation a échoué!"
        Write-Info ""
        Write-Info "Options:"
        Write-Info "  1. Réessayez avec: .\quick-invalidate.ps1"
        Write-Info "  2. Utilisez la console AWS manuelle"
        Write-Info "  3. Consultez: README-CLOUDFRONT-INVALIDATION.md"
        Write-Info ""
        Read-Host "Appuyez sur Entrée pour quitter"
        exit 1
    }

    Write-Success "`n✅ Invalidation créée avec succès!"

    # Extraire les informations si possible
    if ($result) {
        Write-Info "  Distribution ID: $($result.DistributionId)"
        Write-Info "  Invalidation ID: $($result.InvalidationId)"
    }

    Start-Sleep -Seconds 3
} else {
    Write-Error "Script d'invalidation non trouvé!"
    Write-Info "Vérifiez que tous les fichiers sont présents."
    exit 1
}

# ============================================================================
# Étape 3: Attente de la Propagation
# ============================================================================
Write-Step "`n═══ ÉTAPE 3/4: ATTENTE DE LA PROPAGATION ═══"

Write-Info "`nL'invalidation est en cours de propagation sur tous les edge locations CloudFront."
Write-Info "Cela peut prendre 5-15 minutes."
Write-Info ""
Write-Info "Attente de $WaitMinutes minutes avant vérification..."
Write-Info ""

# Countdown avec barre de progression
$totalSeconds = $WaitMinutes * 60
for ($i = 0; $i -lt $totalSeconds; $i++) {
    $remaining = $totalSeconds - $i
    $minutes = [Math]::Floor($remaining / 60)
    $seconds = $remaining % 60

    $percentComplete = ($i / $totalSeconds) * 100
    Write-Progress `
        -Activity "Attente de la propagation CloudFront" `
        -Status "$minutes min $seconds sec restantes" `
        -PercentComplete $percentComplete

    Start-Sleep -Seconds 1
}

Write-Progress -Activity "Attente de la propagation CloudFront" -Completed
Write-Success "`n✅ Attente terminée!"
Start-Sleep -Seconds 2

# ============================================================================
# Étape 4: Vérification de la Mise à Jour
# ============================================================================
if (-not $SkipVerification) {
    Write-Step "`n═══ ÉTAPE 4/4: VÉRIFICATION DE LA MISE À JOUR ═══"

    Write-Info "`nExécution de verify-bundle-update.ps1...`n"

    $verifyScript = Join-Path $scriptDir "verify-bundle-update.ps1"
    if (Test-Path $verifyScript) {
        & $verifyScript

        if ($LASTEXITCODE -eq 0) {
            Write-Success "`n✅ Vérification réussie!"
        } else {
            Write-Warning "`n⚠️ Vérification incomplète ou problèmes détectés"
            Write-Info ""
            Write-Info "Actions recommandées:"
            Write-Info "  1. Attendez 5-10 minutes supplémentaires"
            Write-Info "  2. Relancez la vérification: .\verify-bundle-update.ps1"
            Write-Info "  3. Testez manuellement dans le navigateur"
        }

        Start-Sleep -Seconds 3
    } else {
        Write-Warning "Script de vérification non trouvé, vérification manuelle requise"
    }
} else {
    Write-Warning "Vérification ignorée (SkipVerification activé)"
}

# ============================================================================
# Résumé Final
# ============================================================================
Write-Info ""
Write-Info "================================================================================`n"
Write-Success "         🎉 WORKFLOW COMPLET TERMINÉ 🎉"
Write-Info "`n================================================================================`n"

Write-Info "Résumé:"
Write-Success "  ✓ Configuration testée" * (-not $SkipTests)
Write-Success "  ✓ Invalidation CloudFront créée"
Write-Success "  ✓ Propagation attendue ($WaitMinutes minutes)"
Write-Success "  ✓ Mise à jour vérifiée" * (-not $SkipVerification)

Write-Info "`nProchaines étapes:"
Write-Info "  1. Testez le site dans votre navigateur"
Write-Info "     → https://transporteur.symphonia-controltower.com"
Write-Info ""
Write-Info "  2. Videz le cache du navigateur si nécessaire"
Write-Info "     → Chrome/Edge: Ctrl+Shift+R"
Write-Info "     → Firefox: Ctrl+Shift+Delete"
Write-Info ""
Write-Info "  3. Vérifiez que le nouveau bundle est chargé"
Write-Info "     → F12 → Network → Recherchez les fichiers .js"
Write-Info ""
Write-Info "  4. Si problème persiste:"
Write-Info "     → Attendez 10 minutes supplémentaires"
Write-Info "     → Relancez: .\verify-bundle-update.ps1"
Write-Info "     → Créez une nouvelle invalidation: .\quick-invalidate.ps1"
Write-Info ""

Write-Info "Documentation complète:"
Write-Info "  README-CLOUDFRONT-INVALIDATION.md"
Write-Info ""

Write-Info "Support:"
Write-Info "  • Console CloudFront: https://console.aws.amazon.com/cloudfront/"
Write-Info "  • Documentation AWS: https://docs.aws.amazon.com/cloudfront/"
Write-Info ""

Write-Info "================================================================================`n"

Write-Success "✅ Terminé avec succès!`n"

# Proposer d'ouvrir le site
Write-Info "Voulez-vous ouvrir le site dans votre navigateur? (O/N)"
$response = Read-Host

if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
    Start-Process "https://transporteur.symphonia-controltower.com/transporteur"
    Write-Success "Site ouvert dans le navigateur par défaut"
}

Write-Info ""
Write-Info "Merci d'avoir utilisé le workflow d'invalidation CloudFront!"
Write-Info ""
