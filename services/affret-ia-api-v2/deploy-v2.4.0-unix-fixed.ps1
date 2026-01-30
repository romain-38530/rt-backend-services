# Script pour créer package Affret.IA v2.4.0 Unix-compatible SANS node_modules
Write-Host "Creating Affret.IA v2.4.0 Unix-compatible package (no node_modules)..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v2.4.0-unix"
$zipPath = "$sourceDir\deploy-v2.4.0-unix-no-nm.zip"

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

# Créer Procfile standard
Set-Content "$tempDir\Procfile" "web: node index.js"
Write-Host "  Created Procfile: web: node index.js" -ForegroundColor Gray

# Copier dossiers si ils existent
if (Test-Path "$sourceDir\controllers") {
    Copy-Item "$sourceDir\controllers" "$tempDir\controllers" -Recurse
    Write-Host "  Copied controllers/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\routes") {
    Copy-Item "$sourceDir\routes" "$tempDir\routes" -Recurse
    Write-Host "  Copied routes/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\services") {
    Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
    Write-Host "  Copied services/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\models") {
    Copy-Item "$sourceDir\models" "$tempDir\models" -Recurse
    Write-Host "  Copied models/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\middlewares") {
    Copy-Item "$sourceDir\middlewares" "$tempDir\middlewares" -Recurse
    Write-Host "  Copied middlewares/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\middleware") {
    Copy-Item "$sourceDir\middleware" "$tempDir\middleware" -Recurse
    Write-Host "  Copied middleware/" -ForegroundColor Gray
}
if (Test-Path "$sourceDir\modules") {
    Copy-Item "$sourceDir\modules" "$tempDir\modules" -Recurse
    Write-Host "  Copied modules/" -ForegroundColor Gray
}

Write-Host "Source files copied (NO node_modules)" -ForegroundColor Green

# Afficher la taille
$totalSize = (Get-ChildItem $tempDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB
Write-Host "  Total size: $([math]::Round($totalSize, 2)) KB" -ForegroundColor Gray

# Créer ZIP avec Python si disponible, sinon PowerShell
Write-Host "`nCreating ZIP package..." -ForegroundColor Cyan
$pythonZipScript = "$sourceDir\create_unix_zip.py"

if (Test-Path $pythonZipScript) {
    Write-Host "Using Python script for Unix-compatible ZIP..." -ForegroundColor Cyan
    python $pythonZipScript $tempDir $zipPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Python failed, falling back to PowerShell..." -ForegroundColor Yellow
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
    }
} else {
    Write-Host "Python script not found, using PowerShell..." -ForegroundColor Yellow
    # Copier le script Python depuis TMS Sync
    $tmsZipScript = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb\create_unix_zip.py"
    if (Test-Path $tmsZipScript) {
        Copy-Item $tmsZipScript $sourceDir
        python "$sourceDir\create_unix_zip.py" $tempDir $zipPath
    } else {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
    }
}

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "`nCleaned temp directory" -ForegroundColor Green

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
