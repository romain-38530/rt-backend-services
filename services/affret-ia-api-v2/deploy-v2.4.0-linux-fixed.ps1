# Script pour créer un package déployable Affret.IA v2.4.0 (LINUX PATHS)
Write-Host "Creating Affret.IA deployment package v2.4.0 with Linux-compatible paths..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v2.4.0-linux"
$zipPath = "$sourceDir\deploy-v2.4.0-linux-fixed.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copier les fichiers
Write-Host "`nCopying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\controllers" "$tempDir\controllers" -Recurse
Copy-Item "$sourceDir\routes" "$tempDir\routes" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
Copy-Item "$sourceDir\models" "$tempDir\models" -Recurse

# Installer les dépendances
Write-Host "`nInstalling dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

# Créer le ZIP avec 7-Zip (chemins Linux)
Write-Host "`nCreating ZIP with 7-Zip (Linux paths)..." -ForegroundColor Cyan
$7zipPath = "C:\Program Files\7-Zip\7z.exe"

if (Test-Path $7zipPath) {
    Push-Location $tempDir
    & $7zipPath a -tzip "$zipPath" * -r
    Pop-Location
    Write-Host "ZIP created with 7-Zip" -ForegroundColor Green
} else {
    # Fallback to PowerShell
    Write-Host "7-Zip not found, using PowerShell (may have path issues)..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
}

# Nettoyer
Remove-Item $tempDir -Recurse -Force

# Résumé
Write-Host "`nPackage created!" -ForegroundColor Green
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
$zipSize = (Get-Item $zipPath).Length / 1MB
Write-Host "  Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Gray
