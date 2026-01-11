# Create deployment bundle for Elastic Beanstalk
# Version 4.2.5 - Stripe Admin Setup

$VERSION = "v4.2.6-stripe-admin-setup"
$SOURCE_DIR = $PSScriptRoot
$BUNDLE_DIR = Join-Path $SOURCE_DIR "bundle"
$OUTPUT_FILE = Join-Path $BUNDLE_DIR "deploy-$VERSION.zip"

Write-Host ""
Write-Host ("=" * 60)
Write-Host "Creating bundle $VERSION"
Write-Host ("=" * 60)
Write-Host ""

if (-not (Test-Path $BUNDLE_DIR)) {
    New-Item -ItemType Directory -Path $BUNDLE_DIR | Out-Null
}

if (Test-Path $OUTPUT_FILE) {
    Remove-Item $OUTPUT_FILE -Force
}

$files = @(
    "index.js",
    "package.json",
    "Procfile",
    "account-types-routes.js",
    "auth-routes.js",
    "carrier-referencing-routes.js",
    "ecmr-routes.js",
    "industrial-transport-config-routes.js",
    "pricing-grids-routes.js",
    "stripe-routes.js",
    "transport-orders-routes.js",
    "affretia-routes.js",
    "planning-routes.js",
    "chatbot-routes.js",
    "storage-market-routes.js",
    "account-types-models.js",
    "carrier-referencing-models.js",
    "ecmr-models.js",
    "pricing-grids-models.js",
    "transport-orders-models.js",
    "affretia-models.js",
    "planning-models.js",
    "chatbot-models.js",
    "storage-market-models.js",
    "carrier-scoring-service.js",
    "dispatch-service.js",
    "document-management-service.js",
    "eta-monitoring-service.js",
    "geofencing-service.js",
    "lane-matching-service.js",
    "ocr-integration-service.js",
    "order-closure-service.js",
    "rdv-management-service.js",
    "tracking-basic-service.js",
    "tomtom-integration.js",
    "notification-service.js",
    "scheduled-jobs.js",
    "helpbot-service.js",
    "affretia-ai-enhancement.js",
    "affretia-service.js",
    "planning-service.js",
    "planning-notification-service.js",
    "planning-websocket.js",
    "planning-ai-optimizer.js",
    "chatbot-service.js",
    "ticketing-service.js",
    "specialized-assistants.js",
    "driver-checkin-service.js",
    "claude-integration.js",
    "storage-market-ai-enhancement.js",
    "auth-middleware.js",
    "security-middleware.js",
    "ecmr-pdf.js",
    "ecmr-yousign.js",
    "ecmr-archive.js",
    "subscription-features.js",
    "subscription-guard.middleware.js",
    "subscription-management-routes.js",
    "logisticien-models.js",
    "logisticien-routes.js",
    "logisticien-portal-routes.js",
    "logisticien-email.js",
    "email-verification-service.js",
    "rate-limiter-middleware.js",
    "invitation-token-service.js",
    "webhook-service.js",
    "two-factor-auth-service.js",
    "aws-ses-email-service.js",
    "security-utils.js",
    "validation-schemas.js",
    "validation-middleware.js",
    "gdpr-service.js",
    "gdpr-routes.js",
    "consent-service.js",
    "secure-logger.js",
    "token-rotation-service.js",
    "websocket-auth-service.js",
    "redis-cache-service.js",
    "driving-time-service.js",
    "carbon-footprint-service.js",
    "error-handler.js",
    "icpe-routes.js",
    "logistics-delegation-routes.js",
    "prospect-carrier-model.js",
    "prospection-service.js",
    "b2p-dashboard-service.js",
    "b2p-dashboard-routes.js",
    "email-ab-testing-service.js",
    "email-ab-testing-routes.js"
)

$tempDir = Join-Path $env:TEMP "eb-bundle-$VERSION"
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

$included = 0
$missing = 0

foreach ($file in $files) {
    $sourcePath = Join-Path $SOURCE_DIR $file
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination $tempDir
        Write-Host "  [OK] $file" -ForegroundColor Green
        $included++
    } else {
        Write-Host "  [SKIP] $file" -ForegroundColor Yellow
        $missing++
    }
}

$directories = @("middleware", "routes", "integrations")
foreach ($dir in $directories) {
    $dirPath = Join-Path $SOURCE_DIR $dir
    if (Test-Path $dirPath) {
        Copy-Item $dirPath -Destination $tempDir -Recurse
        Write-Host "  [OK] $dir/" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Summary: $included files included, $missing missing" -ForegroundColor Cyan
Write-Host "Creating ZIP..." -ForegroundColor Cyan

Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $OUTPUT_FILE -Force

Remove-Item $tempDir -Recurse -Force

$fileSize = [math]::Round((Get-Item $OUTPUT_FILE).Length / 1MB, 2)

Write-Host ""
Write-Host ("=" * 60)
Write-Host "Bundle created successfully!" -ForegroundColor Green
Write-Host ("=" * 60)
Write-Host "File: $OUTPUT_FILE"
Write-Host "Size: $fileSize MB"
Write-Host ""
Write-Host "AWS deployment commands:" -ForegroundColor Yellow
Write-Host ""
$s3cmd = "aws s3 cp " + $OUTPUT_FILE + " s3://elasticbeanstalk-eu-central-1-004843574253/rt-subscriptions-api/" + $VERSION + ".zip"
Write-Host $s3cmd
Write-Host ""
$createcmd = "aws elasticbeanstalk create-application-version --region eu-central-1 --application-name rt-subscriptions-api --version-label " + $VERSION + " --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=rt-subscriptions-api/" + $VERSION + ".zip"
Write-Host $createcmd
Write-Host ""
$updatecmd = "aws elasticbeanstalk update-environment --region eu-central-1 --environment-name rt-subscriptions-api-prod --version-label " + $VERSION
Write-Host $updatecmd
