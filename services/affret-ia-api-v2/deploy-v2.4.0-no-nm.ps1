# Script pour créer un package déployable Affret.IA v2.4.0 (SANS node_modules)
Write-Host "Creating Affret.IA deployment package v2.4.0 WITHOUT node_modules..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v2.4.0-no-nm"
$zipPath = "$sourceDir\deploy-v2.4.0-no-nm.zip"

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

# Copier les fichiers source SEULEMENT (PAS de node_modules)
Write-Host "`nCopying source files..." -ForegroundColor Cyan

Copy-Item "$sourceDir\index.js" $tempDir
Write-Host "  [OK] index.js" -ForegroundColor Green

Copy-Item "$sourceDir\package.json" $tempDir
Write-Host "  [OK] package.json" -ForegroundColor Green

Copy-Item "$sourceDir\Procfile" $tempDir
Write-Host "  [OK] Procfile" -ForegroundColor Green

Copy-Item "$sourceDir\controllers" "$tempDir\controllers" -Recurse
$controllersCount = (Get-ChildItem "$sourceDir\controllers" | Measure-Object).Count
Write-Host "  [OK] controllers/ ($controllersCount files)" -ForegroundColor Green

Copy-Item "$sourceDir\routes" "$tempDir\routes" -Recurse
$routesCount = (Get-ChildItem "$sourceDir\routes" | Measure-Object).Count
Write-Host "  [OK] routes/ ($routesCount files)" -ForegroundColor Green

Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
$servicesCount = (Get-ChildItem "$sourceDir\services" | Measure-Object).Count
Write-Host "  [OK] services/ ($servicesCount files)" -ForegroundColor Green

Copy-Item "$sourceDir\models" "$tempDir\models" -Recurse
$modelsCount = (Get-ChildItem "$sourceDir\models" | Measure-Object).Count
Write-Host "  [OK] models/ ($modelsCount files)" -ForegroundColor Green

# Vérifier le contenu
Write-Host "`nTemp directory contents:" -ForegroundColor Cyan
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
Write-Host "`nNOTE: This package does NOT include node_modules." -ForegroundColor Yellow
Write-Host "Elastic Beanstalk will run 'npm install' automatically." -ForegroundColor Yellow
