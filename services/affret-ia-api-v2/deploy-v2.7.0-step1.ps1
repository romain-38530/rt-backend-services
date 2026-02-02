# Deploiement Affret.IA v2.7.0 - STEP 1: Model PriceHistory only
Write-Host "`n=== AFFRET.IA v2.7.0 STEP 1: PriceHistory Model ===" -ForegroundColor Cyan

$version = "2.7.0-step1"
$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v$version"
$zipPath = "$sourceDir\deploy-v$version.zip"

# Nettoyage
Write-Host "[1/5] Cleaning..." -ForegroundColor Yellow
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Creation dossier temp
Write-Host "[2/5] Creating temp directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copie fichiers principaux
Write-Host "[3/5] Copying source files..." -ForegroundColor Yellow
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Set-Content "$tempDir\Procfile" "web: node index.js"

# Copie dossiers SAUF les nouveaux controllers/routes modifiés
$folders = @("controllers", "routes", "services", "middleware", "modules", ".ebextensions")
foreach ($folder in $folders) {
    if (Test-Path "$sourceDir\$folder") {
        Copy-Item "$sourceDir\$folder" "$tempDir\$folder" -Recurse
        Write-Host "  Copied $folder/" -ForegroundColor Gray
    }
}

# Copier models mais créer un dossier propre avec PriceHistory
Write-Host "`n  Creating models with PriceHistory..." -ForegroundColor Green
New-Item -ItemType Directory -Path "$tempDir\models" -Force | Out-Null

# Copier tous les modèles existants
Get-ChildItem "$sourceDir\models" -Filter "*.js" | ForEach-Object {
    Copy-Item $_.FullName "$tempDir\models\"
    Write-Host "  + models/$($_.Name)" -ForegroundColor Gray
}

# Vérifier que PriceHistory est présent
if (Test-Path "$tempDir\models\PriceHistory.js") {
    Write-Host "  OK PriceHistory.js present" -ForegroundColor Green
} else {
    Write-Host "  ERROR PriceHistory.js MISSING!" -ForegroundColor Red
    exit 1
}

# IMPORTANT: Supprimer pricing.service.js pour cette étape
if (Test-Path "$tempDir\services\pricing.service.js") {
    Remove-Item "$tempDir\services\pricing.service.js" -Force
    Write-Host "  - Removed pricing.service.js (not in step1)" -ForegroundColor Yellow
}

# Statistiques
Write-Host "`n[4/5] Package statistics..." -ForegroundColor Yellow
$totalFiles = (Get-ChildItem $tempDir -Recurse -File).Count
$totalSize = [math]::Round((Get-ChildItem $tempDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB, 2)
Write-Host "  Total files: $totalFiles" -ForegroundColor Cyan
Write-Host "  Total size: $totalSize KB" -ForegroundColor Cyan

# Creation ZIP
Write-Host "`n[5/5] Creating ZIP package..." -ForegroundColor Yellow
$pythonZipScript = "$sourceDir\create_unix_zip.py"

if (Test-Path $pythonZipScript) {
    Write-Host "  Using Python script..." -ForegroundColor Gray
    python $pythonZipScript $tempDir $zipPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Python failed, using PowerShell..." -ForegroundColor Yellow
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
    }
} else {
    Write-Host "  Using PowerShell..." -ForegroundColor Gray
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
}

# Nettoyage
Remove-Item $tempDir -Recurse -Force

# Resume
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "STEP 1 Package created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
$zipInfo = Get-Item $zipPath
Write-Host "File: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round($zipInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan
Write-Host "Path: $zipPath" -ForegroundColor Cyan
Write-Host "`nChanges in STEP 1:" -ForegroundColor Yellow
Write-Host "  + models/PriceHistory.js" -ForegroundColor Green
Write-Host "  - No controller changes" -ForegroundColor Gray
Write-Host "  - No route changes" -ForegroundColor Gray
Write-Host "  - No pricing service" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Green
