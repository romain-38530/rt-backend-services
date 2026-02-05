# Script pour créer un package complet avec node_modules
Write-Host "Creating full deployment package with node_modules..." -ForegroundColor Cyan

$source = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$destination = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb\deploy-v2.1.5-with-modules.zip"

# Supprimer l'ancien package
if (Test-Path $destination) {
    Remove-Item $destination -Force
    Write-Host "Removed old package" -ForegroundColor Yellow
}

# Fichiers et dossiers à inclure
$includes = @(
    "index.js",
    "package.json",
    "Procfile",
    "scheduled-jobs.js",
    "connectors",
    "services",
    "node_modules"
)

# Créer un dossier temporaire
$tempDir = Join-Path $env:TEMP "tms-sync-full-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Created temp directory: $tempDir" -ForegroundColor Gray

# Copier les fichiers
foreach ($item in $includes) {
    $sourcePath = Join-Path $source $item
    $destPath = Join-Path $tempDir $item

    if (Test-Path $sourcePath) {
        if (Test-Path $sourcePath -PathType Container) {
            Write-Host "  Copying folder: $item..." -ForegroundColor Yellow
            Copy-Item $sourcePath $destPath -Recurse -Force
            Write-Host "  Copied folder: $item" -ForegroundColor Green
        } else {
            Copy-Item $sourcePath $destPath -Force
            Write-Host "  Copied file: $item" -ForegroundColor Green
        }
    } else {
        Write-Host "  Warning: Not found - $item" -ForegroundColor Yellow
    }
}

# Créer le ZIP
Write-Host "`nCreating ZIP archive..." -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $destination, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "Cleaned temp directory" -ForegroundColor Gray

# Afficher le résultat
$zipInfo = Get-Item $destination
Write-Host "`nPackage created successfully!" -ForegroundColor Green
Write-Host "  Path: $destination" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
