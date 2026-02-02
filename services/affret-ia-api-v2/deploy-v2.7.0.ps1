# ===============================================
# Script de déploiement Affret.IA v2.7.0
# Pricing & Market Intelligence + Dashdoc
# ===============================================

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DÉPLOIEMENT AFFRET.IA v2.7.0                             ║" -ForegroundColor Cyan
Write-Host "║  Pricing & Market Intelligence + Dashdoc Integration      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$version = "2.7.0"
$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v$version"
$zipPath = "$sourceDir\deploy-v$version.zip"

# ==================== ÉTAPE 1: Nettoyage ====================
Write-Host "[1/6] Nettoyage..." -ForegroundColor Yellow

if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
    Write-Host "  ✓ Dossier temp nettoyé" -ForegroundColor Gray
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
    Write-Host "  ✓ Ancien ZIP supprimé" -ForegroundColor Gray
}

# ==================== ÉTAPE 2: Création dossier temp ====================
Write-Host "`n[2/6] Création dossier temporaire..." -ForegroundColor Yellow

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "  ✓ $tempDir créé" -ForegroundColor Gray

# ==================== ÉTAPE 3: Copie fichiers sources ====================
Write-Host "`n[3/6] Copie des fichiers sources..." -ForegroundColor Yellow

# Fichiers principaux
Copy-Item "$sourceDir\index.js" $tempDir
Write-Host "  ✓ index.js" -ForegroundColor Gray

Copy-Item "$sourceDir\package.json" $tempDir
Write-Host "  ✓ package.json (v$version)" -ForegroundColor Gray

# Créer Procfile
Set-Content "$tempDir\Procfile" "web: node index.js"
Write-Host "  ✓ Procfile" -ForegroundColor Gray

# Dossiers core
$coreFolders = @("controllers", "routes", "services", "models", "middleware", "modules")
foreach ($folder in $coreFolders) {
    if (Test-Path "$sourceDir\$folder") {
        Copy-Item "$sourceDir\$folder" "$tempDir\$folder" -Recurse
        $fileCount = (Get-ChildItem "$tempDir\$folder" -Recurse -File).Count
        Write-Host "  ✓ $folder/ ($fileCount fichiers)" -ForegroundColor Gray
    }
}

# Nouveau: Dossiers additionnels
$additionalFolders = @("docs", "scripts")
foreach ($folder in $additionalFolders) {
    if (Test-Path "$sourceDir\$folder") {
        Copy-Item "$sourceDir\$folder" "$tempDir\$folder" -Recurse
        $fileCount = (Get-ChildItem "$tempDir\$folder" -Recurse -File).Count
        Write-Host "  ✓ $folder/ ($fileCount fichiers) [NOUVEAU]" -ForegroundColor Green
    }
}

# ==================== ÉTAPE 4: Vérification nouveaux fichiers ====================
Write-Host "`n[4/6] Vérification des nouveaux fichiers v2.7.0..." -ForegroundColor Yellow

$newFiles = @{
    "models\PriceHistory.js" = "Modèle historique prix MongoDB"
    "services\pricing.service.js" = "Service pricing + Dashdoc"
    "scripts\import-dashdoc-history.js" = "Script import Dashdoc CLI"
    "docs\PRICING-API.md" = "Documentation API Pricing"
}

$allPresent = $true
foreach ($file in $newFiles.Keys) {
    $filePath = Join-Path $tempDir $file
    if (Test-Path $filePath) {
        $fileSize = [math]::Round((Get-Item $filePath).Length / 1KB, 1)
        Write-Host "  ✓ $file ($fileSize KB)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file [MANQUANT]" -ForegroundColor Red
        $allPresent = $false
    }
}

if (-not $allPresent) {
    Write-Host "`n❌ Fichiers manquants détectés! Arrêt du déploiement." -ForegroundColor Red
    Remove-Item $tempDir -Recurse -Force
    exit 1
}

# ==================== ÉTAPE 5: Statistiques package ====================
Write-Host "`n[5/6] Statistiques du package..." -ForegroundColor Yellow

$stats = @{
    TotalFiles = (Get-ChildItem $tempDir -Recurse -File).Count
    TotalSize = [math]::Round((Get-ChildItem $tempDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB, 2)
    JsFiles = (Get-ChildItem $tempDir -Recurse -Filter "*.js").Count
    Models = (Get-ChildItem "$tempDir\models" -File).Count
    Services = (Get-ChildItem "$tempDir\services" -File).Count
    Controllers = (Get-ChildItem "$tempDir\controllers" -File).Count
    Routes = (Get-ChildItem "$tempDir\routes" -File).Count
}

Write-Host "  📦 Fichiers totaux: $($stats.TotalFiles)" -ForegroundColor Cyan
Write-Host "  📏 Taille totale: $($stats.TotalSize) KB" -ForegroundColor Cyan
Write-Host "  📜 Fichiers JS: $($stats.JsFiles)" -ForegroundColor Cyan
Write-Host "  🗄️  Modèles: $($stats.Models)" -ForegroundColor Cyan
Write-Host "  ⚙️  Services: $($stats.Services)" -ForegroundColor Cyan
Write-Host "  🎮 Contrôleurs: $($stats.Controllers)" -ForegroundColor Cyan
Write-Host "  🛣️  Routes: $($stats.Routes)" -ForegroundColor Cyan

# ==================== ÉTAPE 6: Création ZIP ====================
Write-Host "`n[6/6] Création du package ZIP..." -ForegroundColor Yellow

$pythonZipScript = "$sourceDir\create_unix_zip.py"

if (Test-Path $pythonZipScript) {
    Write-Host "  → Utilisation script Python (Unix-compatible)..." -ForegroundColor Gray
    python $pythonZipScript $tempDir $zipPath

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ⚠️  Python échoué, fallback PowerShell..." -ForegroundColor Yellow
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
    }
} else {
    Write-Host "  → Utilisation PowerShell..." -ForegroundColor Gray
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
}

# Nettoyage
Remove-Item $tempDir -Recurse -Force
Write-Host "  ✓ Dossier temp nettoyé" -ForegroundColor Gray

# ==================== RÉSUMÉ FINAL ====================
Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  PACKAGE CRÉÉ AVEC SUCCÈS !                               ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green

$zipInfo = Get-Item $zipPath
Write-Host "`n📦 Package Information:" -ForegroundColor Cyan
Write-Host "   Nom: $($zipInfo.Name)" -ForegroundColor White
Write-Host "   Taille: $([math]::Round($zipInfo.Length / 1KB, 2)) KB" -ForegroundColor White
Write-Host "   Path: $zipPath" -ForegroundColor White

Write-Host "`n🆕 Nouveautés v2.7.0:" -ForegroundColor Cyan
Write-Host "   ✓ Modèle PriceHistory avec MongoDB" -ForegroundColor Green
Write-Host "   ✓ Service pricing + Dashdoc API v4" -ForegroundColor Green
Write-Host "   ✓ 6 nouveaux endpoints REST" -ForegroundColor Green
Write-Host "   ✓ Script CLI import Dashdoc" -ForegroundColor Green
Write-Host "   ✓ Négociation automatique vers prix marché" -ForegroundColor Green
Write-Host "   ✓ Priorisation sous-traitants référencés" -ForegroundColor Green

Write-Host "`n📋 Prochaines étapes:" -ForegroundColor Yellow
Write-Host "   1. Configurer DASHDOC_API_KEY dans EB environment" -ForegroundColor White
Write-Host "   2. Déployer: eb deploy rt-affret-ia-api-prod-v2" -ForegroundColor White
Write-Host "   3. Vérifier santé: eb health" -ForegroundColor White
Write-Host "   4. Tester endpoints: /api/v1/affretia/price-history" -ForegroundColor White
Write-Host "   5. Lancer import: node scripts/import-dashdoc-history.js" -ForegroundColor White

Write-Host "`n⚠️  NOTE: node_modules non inclus (EB les installera)" -ForegroundColor Yellow

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Prêt pour déploiement !                                  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
