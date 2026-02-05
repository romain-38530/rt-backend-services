# Script pour créer un package déployable v2.3.3 - Auto cleanup obsolete carriers
Write-Host "Creating deployment package v2.3.3 - Auto cleanup..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v2.3.3"
$zipPath = "$sourceDir\deploy-v2.3.3-auto-cleanup.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Créer dossier temp
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copier les fichiers source
Write-Host "Copying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\scheduled-jobs.js" $tempDir
Copy-Item "$sourceDir\connectors" "$tempDir\connectors" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
Write-Host "Source files copied" -ForegroundColor Green

# Installer les dépendances
Write-Host "Installing dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

# Créer le ZIP
Write-Host "Creating ZIP..." -ForegroundColor Cyan
python "$sourceDir\create_unix_zip.py" $tempDir $zipPath

# Nettoyer
Remove-Item $tempDir -Recurse -Force

# Résultat
$zipInfo = Get-Item $zipPath
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Package v2.3.3 created!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host "`nChanges:" -ForegroundColor Yellow
Write-Host "  - Auto cleanup obsolete carriers after sync" -ForegroundColor White
Write-Host "  - Removes carriers with lastSyncAt > 10 minutes" -ForegroundColor White
Write-Host "  - Will automatically remove '1 UP' and other clients" -ForegroundColor White
