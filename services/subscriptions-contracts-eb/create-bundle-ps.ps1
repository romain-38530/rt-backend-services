# Script PowerShell pour creer le bundle de deploiement
# Version 2.5.3 - AWS SES Email Migration

$VERSION = 'v2.5.3-aws-ses-email'

# Creer le dossier bundle s'il n'existe pas
if (!(Test-Path 'bundle')) {
    New-Item -ItemType Directory -Path 'bundle' | Out-Null
}

# Liste des fichiers a inclure
$files = @(
    'index.js',
    'package.json',
    'package-lock.json',
    'Procfile',
    'account-types-routes.js',
    'auth-routes.js',
    'carrier-referencing-routes.js',
    'ecmr-routes.js',
    'industrial-transport-config-routes.js',
    'pricing-grids-routes.js',
    'stripe-routes.js',
    'transport-orders-routes.js',
    'affretia-routes.js',
    'planning-routes.js',
    'chatbot-routes.js',
    'storage-market-routes.js',
    'account-types-models.js',
    'carrier-referencing-models.js',
    'ecmr-models.js',
    'pricing-grids-models.js',
    'transport-orders-models.js',
    'affretia-models.js',
    'planning-models.js',
    'chatbot-models.js',
    'storage-market-models.js',
    'carrier-scoring-service.js',
    'dispatch-service.js',
    'document-management-service.js',
    'eta-monitoring-service.js',
    'geofencing-service.js',
    'lane-matching-service.js',
    'ocr-integration-service.js',
    'order-closure-service.js',
    'rdv-management-service.js',
    'tracking-basic-service.js',
    'tomtom-integration.js',
    'notification-service.js',
    'scheduled-jobs.js',
    'helpbot-service.js',
    'affretia-ai-enhancement.js',
    'affretia-service.js',
    'planning-service.js',
    'planning-notification-service.js',
    'planning-websocket.js',
    'planning-ai-optimizer.js',
    'chatbot-service.js',
    'ticketing-service.js',
    'specialized-assistants.js',
    'driver-checkin-service.js',
    'claude-integration.js',
    'storage-market-ai-enhancement.js',
    'auth-middleware.js',
    'security-middleware.js',
    'ecmr-pdf.js',
    'ecmr-yousign.js',
    'ecmr-archive.js',
    'subscription-features.js',
    'subscription-guard.middleware.js',
    'subscription-management-routes.js',
    'logisticien-models.js',
    'logisticien-routes.js',
    'logisticien-portal-routes.js',
    'logisticien-email.js',
    'email-verification-service.js',
    'rate-limiter-middleware.js',
    'invitation-token-service.js',
    'webhook-service.js',
    'aws-ses-email-service.js'
)

Write-Host ''
Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host "Creating bundle $VERSION" -ForegroundColor Cyan
Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host ''

# Compter les fichiers existants
$existing = @()
$missing = @()
foreach ($file in $files) {
    if (Test-Path $file) {
        $existing += $file
    } else {
        $missing += $file
    }
}

Write-Host "Found $($existing.Count) of $($files.Count) files" -ForegroundColor White

# Creer un dossier temp pour la structure
$tempDir = "bundle\temp-$VERSION"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copier les fichiers
Write-Host ''
Write-Host 'Copying files...' -ForegroundColor Yellow
foreach ($file in $existing) {
    Copy-Item $file -Destination $tempDir
    Write-Host "  + $file" -ForegroundColor Green
}

foreach ($file in $missing) {
    Write-Host "  - $file (missing)" -ForegroundColor DarkGray
}

# Copier les dossiers
$dirs = @('middleware', 'routes', 'integrations')
foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Copy-Item $dir -Destination $tempDir -Recurse
        Write-Host "  + $dir/" -ForegroundColor Green
    }
}

# Copier node_modules (version resolue - pas les symlinks pnpm)
Write-Host ''
Write-Host 'Copying node_modules (resolving pnpm symlinks)...' -ForegroundColor Yellow

# Pour pnpm, on doit resoudre les symlinks
$nodeModulesSrc = 'node_modules'
$nodeModulesDest = "$tempDir\node_modules"
New-Item -ItemType Directory -Path $nodeModulesDest | Out-Null

# Copier avec resolution des symlinks
Copy-Item "$nodeModulesSrc\*" -Destination $nodeModulesDest -Recurse -Force
Write-Host '  + node_modules/' -ForegroundColor Green

# Creer le ZIP
$zipPath = "bundle\deploy-$VERSION.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath
}

Write-Host ''
Write-Host 'Creating ZIP archive...' -ForegroundColor Yellow
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force

# Nettoyer
Remove-Item $tempDir -Recurse -Force

# Afficher le resultat
$zipInfo = Get-Item $zipPath
$sizeMB = [math]::Round($zipInfo.Length / 1MB, 2)

Write-Host ''
Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host 'Bundle created successfully!' -ForegroundColor Green
Write-Host ('=' * 60) -ForegroundColor Cyan
Write-Host "File: $zipPath" -ForegroundColor White
Write-Host "Size: $sizeMB MB" -ForegroundColor White
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host "  aws s3 cp `"$zipPath`" s3://elasticbeanstalk-eu-central-1-004843574253/rt-subscriptions-api/$VERSION.zip" -ForegroundColor Gray
Write-Host ''
Write-Host "  aws elasticbeanstalk create-application-version --region eu-central-1 --application-name rt-subscriptions-api --version-label `"$VERSION`" --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=rt-subscriptions-api/$VERSION.zip" -ForegroundColor Gray
Write-Host ''
Write-Host "  aws elasticbeanstalk update-environment --region eu-central-1 --environment-name rt-subscriptions-api-prod --version-label `"$VERSION`"" -ForegroundColor Gray
Write-Host ''
