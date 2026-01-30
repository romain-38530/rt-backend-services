# Script pour créer un package déployable Affret.IA v2.4.0
Write-Host "Creating Affret.IA deployment package v2.4.0 with node_modules..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v2.4.0"
$zipPath = "$sourceDir\deploy-v2.4.0-with-modules.zip"

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

# Copier les fichiers source
Write-Host "`nCopying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
if (Test-Path "$sourceDir\Procfile") { Copy-Item "$sourceDir\Procfile" $tempDir }
if (Test-Path "$sourceDir\controllers") { Copy-Item "$sourceDir\controllers" "$tempDir\controllers" -Recurse }
if (Test-Path "$sourceDir\routes") { Copy-Item "$sourceDir\routes" "$tempDir\routes" -Recurse }
if (Test-Path "$sourceDir\services") { Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse }
if (Test-Path "$sourceDir\models") { Copy-Item "$sourceDir\models" "$tempDir\models" -Recurse }
if (Test-Path "$sourceDir\middlewares") { Copy-Item "$sourceDir\middlewares" "$tempDir\middlewares" -Recurse }
Write-Host "Source files copied" -ForegroundColor Green

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
