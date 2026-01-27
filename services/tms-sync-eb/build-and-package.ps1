# Script pour créer un package ZIP compatible UNIX pour AWS Elastic Beanstalk
Write-Host "Creating UNIX-compatible deployment package v2.1.7..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v2.1.7-unix"
$zipPath = "$sourceDir\deploy-v2.1.7-unix.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Write-Host "Cleaning old temp directory..." -ForegroundColor Yellow
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Write-Host "Removing old ZIP..." -ForegroundColor Yellow
    Remove-Item $zipPath -Force
}

# Créer dossier temp
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Created temp directory: $tempDir" -ForegroundColor Gray

# Copier fichiers essentiels
Write-Host "`nCopying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\scheduled-jobs.js" $tempDir
Copy-Item "$sourceDir\connectors" "$tempDir\connectors" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
Write-Host "✅ Source files copied" -ForegroundColor Green

# Installer node_modules
Write-Host "`nInstalling production dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

if (Test-Path "$tempDir\node_modules") {
    $moduleCount = (Get-ChildItem "$tempDir\node_modules" -Directory).Count
    Write-Host "✅ Dependencies installed ($moduleCount packages)" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Créer ZIP avec Python (Unix-compatible)
Write-Host "`nCreating UNIX-compatible ZIP with Python..." -ForegroundColor Cyan
python "$sourceDir\create_unix_zip.py" $tempDir $zipPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to create ZIP" -ForegroundColor Red
    exit 1
}

# Nettoyer
Write-Host "`nCleaning temp directory..." -ForegroundColor Gray
Remove-Item $tempDir -Recurse -Force
Write-Host "✅ Cleaned" -ForegroundColor Green

# Afficher le résultat
Write-Host "`n============================================================================" -ForegroundColor Green
Write-Host "Package ready for deployment!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
$zipInfo = Get-Item $zipPath
Write-Host "  File: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Upload to S3: aws s3 cp `"$zipPath`" s3://elasticbeanstalk-eu-central-1-515713931678/tms-sync/" -ForegroundColor Gray
Write-Host "  2. Deploy via EB console or CLI" -ForegroundColor Gray
Write-Host "============================================================================" -ForegroundColor Green
