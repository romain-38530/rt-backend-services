# Script pour créer un package déployable v2.3.2 - Fix filtre basé sur remoteId
Write-Host "Creating deployment package v2.3.2 - Remote ID filter..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v2.3.2"
$zipPath = "$sourceDir\deploy-v2.3.2-remote-id-filter.zip"

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
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\scheduled-jobs.js" $tempDir
Copy-Item "$sourceDir\connectors" "$tempDir\connectors" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
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

# Créer le ZIP avec chemins Unix
Write-Host "`nCreating Unix-compatible ZIP package..." -ForegroundColor Cyan
python "$sourceDir\create_unix_zip.py" $tempDir $zipPath

if ($LASTEXITCODE -eq 0) {
    # Nettoyer
    Remove-Item $tempDir -Recurse -Force
    Write-Host "Cleaned temp directory" -ForegroundColor Gray

    # Afficher le résultat
    $zipInfo = Get-Item $zipPath
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "Package v2.3.2 created successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Path: $zipPath" -ForegroundColor Cyan
    Write-Host "Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host "`nChanges:" -ForegroundColor Yellow
    Write-Host "  - Filter clients by remoteId pattern (^C\d+$)" -ForegroundColor White
    Write-Host "  - Removes account_type='invited' filter (too strict)" -ForegroundColor White
    Write-Host "  - Keeps is_carrier=true & is_shipper=false in API" -ForegroundColor White
    Write-Host "  - Should exclude '1 UP' (remoteId: C10006)" -ForegroundColor White
    Write-Host "`nDeploy at:" -ForegroundColor Yellow
    Write-Host "https://eu-central-1.console.aws.amazon.com/elasticbeanstalk/home?region=eu-central-1#/environment/dashboard?applicationName=rt-api-tms-sync&environmentId=e-t6vmjupsn9" -ForegroundColor Gray
} else {
    Write-Host "`nFailed to create ZIP package" -ForegroundColor Red
    exit 1
}
