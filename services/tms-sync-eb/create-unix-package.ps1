# Script pour créer un package ZIP compatible UNIX/Linux
Write-Host "Creating UNIX-compatible deployment package v2.1.2..." -ForegroundColor Cyan

$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-unix"
$zipPath = "$sourceDir\deploy-v2.1.2-unix.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Créer dossier temp
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Created temp directory" -ForegroundColor Gray

# Copier fichiers
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\Procfile" $tempDir
Copy-Item "$sourceDir\scheduled-jobs.js" $tempDir
Copy-Item "$sourceDir\connectors" "$tempDir\connectors" -Recurse
Copy-Item "$sourceDir\services" "$tempDir\services" -Recurse
Write-Host "Source files copied" -ForegroundColor Green

# Installer node_modules
Write-Host "Installing dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location
Write-Host "Dependencies installed" -ForegroundColor Green

# Créer ZIP avec 7-Zip (compatible Unix paths)
Write-Host "Creating UNIX-compatible ZIP..." -ForegroundColor Cyan
$7zipPath = "C:\Program Files\7-Zip\7z.exe"

if (Test-Path $7zipPath) {
    # Utiliser 7-Zip avec l'option -tzip pour chemins Unix
    Push-Location $tempDir
    & $7zipPath a -tzip "$zipPath" * -r 2>&1 | Out-Null
    Pop-Location
    Write-Host "ZIP created with 7-Zip" -ForegroundColor Green
} else {
    # Fallback: créer avec Python (cross-platform)
    Write-Host "7-Zip not found, using Python..." -ForegroundColor Yellow
    $pythonScript = @'
import zipfile
import os

def create_unix_zip(source_dir, zip_path):
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Convert Windows path to Unix path
                arcname = os.path.relpath(file_path, source_dir).replace('\\', '/')
                zipf.write(file_path, arcname)

create_unix_zip(r'$tempDir', r'$zipPath')
'@
    $pythonScript | python -
    Write-Host "ZIP created with Python" -ForegroundColor Green
}

# Nettoyer
Remove-Item $tempDir -Recurse -Force
Write-Host "Cleaned temp directory" -ForegroundColor Gray

# Afficher le résultat
$zipInfo = Get-Item $zipPath
Write-Host "`nPackage created successfully!" -ForegroundColor Green
Write-Host "  Path: $zipPath" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
