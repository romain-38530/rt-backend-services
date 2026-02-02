# ============================================================================
# Vérification de l'Installation - Scripts CloudFront
# ============================================================================
# Vérifie que tous les fichiers ont été correctement installés
# ============================================================================

function Write-Success { param($Message) Write-Host $Message -ForegroundColor Green }
function Write-Info { param($Message) Write-Host $Message -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host $Message -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host $Message -ForegroundColor Red }

Write-Info "`n============================================================================"
Write-Info "  Vérification de l'Installation - Scripts CloudFront"
Write-Info "============================================================================`n"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

$filesOk = 0
$filesMissing = 0

function Test-File {
    param([string]$Path, [string]$Description)

    $fullPath = Join-Path $rootDir $Path

    if (Test-Path $fullPath) {
        $size = (Get-Item $fullPath).Length
        $sizeKB = [math]::Round($size / 1KB, 1)
        Write-Success "✓ $Description"
        Write-Info "  Fichier: $Path"
        Write-Info "  Taille: $sizeKB KB"
        $script:filesOk++
        return $true
    } else {
        Write-Error "✗ $Description"
        Write-Warning "  Fichier manquant: $Path"
        $script:filesMissing++
        return $false
    }
}

# ============================================================================
# Vérifier les fichiers racine
# ============================================================================
Write-Info "`n[1/5] Vérification des fichiers racine...`n"

Test-File "README.md" "Documentation principale"
Test-File "INSTALLATION-COMPLETE.md" "Documentation d'installation"

# ============================================================================
# Vérifier les scripts d'invalidation
# ============================================================================
Write-Info "`n[2/5] Vérification des scripts d'invalidation...`n"

Test-File "scripts\invalidate-cloudfront.ps1" "Script principal (PowerShell)"
Test-File "scripts\invalidate-cloudfront.sh" "Script principal (Bash)"
Test-File "scripts\quick-invalidate.ps1" "Script rapide"

# ============================================================================
# Vérifier les scripts de diagnostic
# ============================================================================
Write-Info "`n[3/5] Vérification des scripts de diagnostic...`n"

Test-File "scripts\test-cloudfront-setup.ps1" "Tests de configuration"
Test-File "scripts\verify-bundle-update.ps1" "Vérification mise à jour"
Test-File "scripts\generate-report.ps1" "Génération de rapport"

# ============================================================================
# Vérifier les scripts utilitaires
# ============================================================================
Write-Info "`n[4/5] Vérification des scripts utilitaires...`n"

Test-File "scripts\invalidate-cloudfront-alternative.ps1" "Solutions alternatives"
Test-File "scripts\run-complete-workflow.ps1" "Workflow automatique"

# ============================================================================
# Vérifier la documentation
# ============================================================================
Write-Info "`n[5/5] Vérification de la documentation...`n"

Test-File "scripts\README-CLOUDFRONT-INVALIDATION.md" "Guide complet"
Test-File "scripts\INDEX.md" "Index des scripts"
Test-File "scripts\QUICK-START.txt" "Guide rapide"
Test-File "scripts\COMMANDS-REFERENCE.md" "Référence des commandes"
Test-File "scripts\invalidation-batch-example.json" "Exemple JSON"

# ============================================================================
# Résumé
# ============================================================================
Write-Info "`n============================================================================"
Write-Info "  Résumé de la Vérification"
Write-Info "============================================================================`n"

$totalFiles = $filesOk + $filesMissing
Write-Info "Fichiers vérifiés: $totalFiles"
Write-Success "Fichiers présents: $filesOk"

if ($filesMissing -gt 0) {
    Write-Error "Fichiers manquants: $filesMissing"
    Write-Warning "`nVeuillez réinstaller les fichiers manquants.`n"
} else {
    Write-Success "`n✅ Installation complète et valide!`n"
    Write-Info "Tous les fichiers sont présents et accessibles.`n"
}

# ============================================================================
# Vérification des permissions
# ============================================================================
Write-Info "`nVérification des permissions d'exécution...`n"

$shScript = Join-Path $scriptDir "invalidate-cloudfront.sh"
if (Test-Path $shScript) {
    # Sur Windows, vérifier que le fichier existe (les permissions Unix n'existent pas vraiment)
    Write-Success "✓ invalidate-cloudfront.sh trouvé"
    Write-Info "  Note: Sur Windows, les permissions d'exécution Unix ne sont pas vérifiables"
    Write-Info "  Sur Linux/Mac, exécutez: chmod +x *.sh"
} else {
    Write-Warning "⚠ invalidate-cloudfront.sh non trouvé"
}

# ============================================================================
# Taille totale
# ============================================================================
Write-Info "`nCalcul de la taille totale...`n"

$totalSize = 0
$scriptsPath = Join-Path $rootDir "scripts"

if (Test-Path $scriptsPath) {
    Get-ChildItem -Path $scriptsPath -File -Recurse | ForEach-Object {
        $totalSize += $_.Length
    }
}

Get-ChildItem -Path $rootDir -File | ForEach-Object {
    $totalSize += $_.Length
}

$totalSizeKB = [math]::Round($totalSize / 1KB, 1)
$totalSizeMB = [math]::Round($totalSize / 1MB, 2)

Write-Info "Taille totale: $totalSizeKB KB ($totalSizeMB MB)"

# ============================================================================
# Structure de dossiers
# ============================================================================
Write-Info "`nStructure de dossiers:`n"

Write-Info "rt-frontend-apps/"
Write-Info "├── README.md"
Write-Info "├── INSTALLATION-COMPLETE.md"
Write-Info "└── scripts/"
Write-Info "    ├── Scripts d'Invalidation (3)"
Write-Info "    ├── Scripts de Diagnostic (3)"
Write-Info "    ├── Scripts Utilitaires (2)"
Write-Info "    ├── Documentation (5)"
Write-Info "    └── Exemples (1)"

# ============================================================================
# Prochaines étapes
# ============================================================================
if ($filesMissing -eq 0) {
    Write-Info "`n============================================================================"
    Write-Success "  Installation Validée - Prochaines Étapes"
    Write-Info "============================================================================`n"

    Write-Info "1. Tester la configuration AWS:"
    Write-Info "   .\test-cloudfront-setup.ps1`n"

    Write-Info "2. Invalider le cache CloudFront:"
    Write-Info "   .\quick-invalidate.ps1`n"

    Write-Info "3. Ou utiliser le workflow complet:"
    Write-Info "   .\run-complete-workflow.ps1`n"

    Write-Info "4. Lire la documentation:"
    Write-Info "   notepad README-CLOUDFRONT-INVALIDATION.md`n"

    Write-Info "5. Consulter le guide rapide:"
    Write-Info "   type QUICK-START.txt`n"

    Write-Info "============================================================================`n"
}

# Retourner le résultat
exit $(if ($filesMissing -eq 0) { 0 } else { 1 })
