# Script pour créer package TMS Sync v2.2.0 Unix-compatible SANS node_modules
Write-Host "Creating TMS Sync v2.2.0 Unix-compatible package (no node_modules)..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v2.2.0-unix"
$zipPath = "$sourceDir\deploy-v2.2.0-unix-no-nm.zip"

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

# Copier UNIQUEMENT les fichiers sources (PAS node_modules)
Write-Host "`nCopying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\scheduled-jobs.js" $tempDir
Copy-Item "$sourceDir\connectors" "$tempDir\connectors" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
Write-Host "Source files copied (NO node_modules)" -ForegroundColor Green

# Afficher la taille
$totalSize = (Get-ChildItem $tempDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
Write-Host "  Total size: $([math]::Round($totalSize, 2)) KB" -ForegroundColor Gray

# Créer ZIP avec Python (Unix-compatible)
Write-Host "`nCreating Unix-compatible ZIP with Python..." -ForegroundColor Cyan
python "$sourceDir\create_unix_zip.py" $tempDir $zipPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create ZIP" -ForegroundColor Red
    exit 1
}

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "`nCleaned temp directory" -ForegroundColor Green

# Vérifier backslashes
Write-Host "`nVerifying no backslashes in ZIP..." -ForegroundColor Cyan
$checkBackslash = unzip -l $zipPath | Select-String "\\"
if ($checkBackslash) {
    Write-Host "WARNING: Backslashes found!" -ForegroundColor Red
    $checkBackslash
} else {
    Write-Host "OK: No backslashes found" -ForegroundColor Green
}

# Résumé
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Package created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
$zipInfo = Get-Item $zipPath
Write-Host "  File: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
Write-Host "`nNOTE: node_modules NOT included (EB will install them)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
