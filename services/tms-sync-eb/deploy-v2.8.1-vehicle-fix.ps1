# Script pour creer et deployer le package v2.8.1 avec fix vehicule/chauffeur
Write-Host "Creating deployment package v2.8.1 - Vehicle/Driver Fix..." -ForegroundColor Cyan

$version = "2.8.1"
$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"
$tempDir = "C:\temp\tms-sync-v$version"
$zipPath = "$sourceDir\..\..\tms-sync-eb-v$version-vehicle-fix.zip"

# Nettoyer
if (Test-Path $tempDir) {
    Write-Host "Cleaning old temp directory..." -ForegroundColor Yellow
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Write-Host "Removing old ZIP..." -ForegroundColor Yellow
    Remove-Item $zipPath -Force
}

# Creer dossier temp
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Write-Host "Created temp directory: $tempDir" -ForegroundColor Gray

# Copier fichiers essentiels A LA RACINE
Write-Host "Copying source files..." -ForegroundColor Cyan
Copy-Item "$sourceDir\index.js" "$tempDir\index.js"
Copy-Item "$sourceDir\package.json" "$tempDir\package.json"
Copy-Item "$sourceDir\Procfile" "$tempDir\Procfile"
Copy-Item "$sourceDir\scheduled-jobs.js" "$tempDir\scheduled-jobs.js"

# Creer repertoires et copier
$folders = @('connectors', 'services', 'models', 'routes', 'middleware', 'utils')
foreach ($folder in $folders) {
    if (Test-Path "$sourceDir\$folder") {
        Copy-Item "$sourceDir\$folder" "$tempDir\$folder" -Recurse
        Write-Host "  OK $folder" -ForegroundColor Gray
    }
}
Write-Host "OK Source files copied" -ForegroundColor Green

# Installer node_modules
Write-Host "Installing production dependencies..." -ForegroundColor Cyan
Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

if (Test-Path "$tempDir\node_modules") {
    $moduleCount = (Get-ChildItem "$tempDir\node_modules" -Directory).Count
    Write-Host "OK Dependencies installed ($moduleCount packages)" -ForegroundColor Green
} else {
    Write-Host "ERROR Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Creer ZIP avec les fichiers a la racine
Write-Host "Creating ZIP package..." -ForegroundColor Cyan
Push-Location $tempDir
Compress-Archive -Path * -DestinationPath $zipPath -Force
Pop-Location
Write-Host "OK ZIP created" -ForegroundColor Green

# Nettoyer
Write-Host "Cleaning temp directory..." -ForegroundColor Gray
Remove-Item $tempDir -Recurse -Force
Write-Host "OK Cleaned" -ForegroundColor Green

# Verifier la structure du ZIP
Write-Host "Verifying ZIP structure..." -ForegroundColor Cyan
$zipCheck = &{
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    $rootFiles = $zip.Entries | Where-Object { -not $_.FullName.Contains('/') -and -not $_.FullName.Contains('\') } | Select-Object -ExpandProperty Name
    $zip.Dispose()
    return $rootFiles
}
if ($zipCheck -contains "index.js" -and $zipCheck -contains "package.json" -and $zipCheck -contains "Procfile") {
    Write-Host "OK ZIP structure valid (index.js, package.json, Procfile at root)" -ForegroundColor Green
} else {
    Write-Host "ERROR ZIP structure invalid! Missing files at root" -ForegroundColor Red
    Write-Host "Root files found: $($zipCheck -join ', ')" -ForegroundColor Yellow
    exit 1
}

# Afficher le resultat
$zipInfo = Get-Item $zipPath
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "Package ready for deployment!" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "  File: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round($zipInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host "  Path: $zipPath" -ForegroundColor Cyan

# Upload to S3
Write-Host "Uploading to S3..." -ForegroundColor Cyan
$s3Bucket = "elasticbeanstalk-eu-central-1-004843574253"
$s3Key = "tms-sync/tms-sync-eb-v$version-vehicle-fix.zip"
aws s3 cp $zipPath "s3://$s3Bucket/$s3Key"

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK Uploaded to S3" -ForegroundColor Green

    # Create application version
    Write-Host "Creating application version..." -ForegroundColor Cyan
    aws elasticbeanstalk create-application-version `
        --application-name "rt-api-tms-sync" `
        --version-label "v$version-vehicle-fix" `
        --description "Fix: Add assignedCarrier mapping for vehicle and driver data from Dashdoc" `
        --source-bundle "S3Bucket=$s3Bucket,S3Key=$s3Key"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK Application version created" -ForegroundColor Green

        # Deploy to environment
        Write-Host "Deploying to production..." -ForegroundColor Cyan
        aws elasticbeanstalk update-environment `
            --environment-name "rt-tms-sync-api-prod" `
            --version-label "v$version-vehicle-fix"

        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK Deployment started!" -ForegroundColor Green
            Write-Host "Monitoring deployment status..." -ForegroundColor Cyan
            Write-Host "Check status: aws elasticbeanstalk describe-environments --environment-names rt-tms-sync-api-prod" -ForegroundColor Gray
        } else {
            Write-Host "ERROR Failed to deploy" -ForegroundColor Red
        }
    } else {
        Write-Host "ERROR Failed to create application version" -ForegroundColor Red
    }
} else {
    Write-Host "ERROR Failed to upload to S3" -ForegroundColor Red
}

Write-Host "============================================================================" -ForegroundColor Green
