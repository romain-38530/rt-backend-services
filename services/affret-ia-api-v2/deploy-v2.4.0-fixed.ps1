# Script pour créer un package déployable Affret.IA v2.4.0 (FIXED)
Write-Host "Creating Affret.IA deployment package v2.4.0 with ALL required files..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v2.4.0-fixed"
$zipPath = "$sourceDir\deploy-v2.4.0-fixed.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
    Write-Host "Cleaned temp directory" -ForegroundColor Yellow
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
    Write-Host "Removed old ZIP" -ForegroundColor Yellow
}

# Créer dossier temp
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Created temp directory: $tempDir" -ForegroundColor Gray

# Copier les fichiers source (AVEC VERIFICATION)
Write-Host "`nCopying source files..." -ForegroundColor Cyan

Copy-Item "$sourceDir\index.js" $tempDir
Write-Host "  [OK] index.js" -ForegroundColor Green

Copy-Item "$sourceDir\package.json" $tempDir
Write-Host "  [OK] package.json" -ForegroundColor Green

if (Test-Path "$sourceDir\Procfile") {
    Copy-Item "$sourceDir\Procfile" $tempDir
    Write-Host "  [OK] Procfile" -ForegroundColor Green
}

if (Test-Path "$sourceDir\controllers") {
    Copy-Item "$sourceDir\controllers" "$tempDir\controllers" -Recurse
    Write-Host "  [OK] controllers/ ($(Get-ChildItem $sourceDir\controllers | Measure-Object).Count files)" -ForegroundColor Green
}

if (Test-Path "$sourceDir\routes") {
    Copy-Item "$sourceDir\routes" "$tempDir\routes" -Recurse
    $routeCount = (Get-ChildItem "$sourceDir\routes" | Measure-Object).Count
    Write-Host "  [OK] routes/ ($routeCount files)" -ForegroundColor Green
} else {
    Write-Host "  [MISSING] routes/ NOT FOUND!" -ForegroundColor Red
}

if (Test-Path "$sourceDir\services") {
    Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
    $servicesCount = (Get-ChildItem "$sourceDir\services" | Measure-Object).Count
    Write-Host "  [OK] services/ ($servicesCount files)" -ForegroundColor Green
} else {
    Write-Host "  [MISSING] services/ NOT FOUND!" -ForegroundColor Red
}

if (Test-Path "$sourceDir\models") {
    Copy-Item "$sourceDir\models" "$tempDir\models" -Recurse
    $modelsCount = (Get-ChildItem "$sourceDir\models" | Measure-Object).Count
    Write-Host "  [OK] models/ ($modelsCount files)" -ForegroundColor Green
}

if (Test-Path "$sourceDir\middlewares") {
    Copy-Item "$sourceDir\middlewares" "$tempDir\middlewares" -Recurse
    Write-Host "  [OK] middlewares/" -ForegroundColor Green
} else {
    Write-Host "  [SKIP] middlewares/ (does not exist)" -ForegroundColor Gray
}

# Installer les dépendances SANS workspace
Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Dependencies installed successfully" -ForegroundColor Green
    $nmSize = (Get-ChildItem node_modules -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  node_modules size: $([math]::Round($nmSize, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Vérifier le contenu avant ZIP
Write-Host "`nVerifying temp directory contents..." -ForegroundColor Cyan
$tempContents = Get-ChildItem $tempDir
foreach ($item in $tempContents) {
    Write-Host "  - $($item.Name)" -ForegroundColor Gray
}

# Créer le ZIP
Write-Host "`nCreating ZIP package..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "Cleaned temp directory" -ForegroundColor Yellow

# Résumé
Write-Host "`nPackage created successfully!" -ForegroundColor Green
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Gray

Write-Host "`nTo deploy:" -ForegroundColor Yellow
Write-Host "  aws elasticbeanstalk create-application-version --application-name rt-affret-ia-api --version-label v2.4.0-fixed-$(Get-Date -Format 'yyyyMMdd-HHmmss') --source-bundle S3Bucket=`"elasticbeanstalk-eu-central-1-617145383256`",S3Key=`"affret-ia-api/deploy-v2.4.0-fixed.zip`" --region eu-central-1" -ForegroundColor Gray
