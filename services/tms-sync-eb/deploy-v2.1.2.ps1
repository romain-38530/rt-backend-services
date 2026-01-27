# Script pour créer un package déployable avec node_modules
Write-Host "Creating deployment package v2.1.2 with node_modules..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v2.1.2"
$zipPath = "$sourceDir\deploy-v2.1.2-with-modules.zip"

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
    # Afficher la taille de node_modules
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
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "Cleaned temp directory" -ForegroundColor Gray

# Afficher le résultat
$zipInfo = Get-Item $zipPath
Write-Host "`nPackage created successfully!" -ForegroundColor Green
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
