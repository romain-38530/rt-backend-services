# Deployment script for geo-tracking service
# Run this from the geo-tracking-eb directory

Write-Host "Deploying geo-tracking service to Elastic Beanstalk..." -ForegroundColor Green

# Check if EB CLI is installed
if (-not (Get-Command eb -ErrorAction SilentlyContinue)) {
    Write-Error "EB CLI is not installed. Install with: pip install awsebcli"
    exit 1
}

# Deploy
Write-Host "Running eb deploy..." -ForegroundColor Cyan
eb deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "Checking status..." -ForegroundColor Cyan
    eb status
} else {
    Write-Error "Deployment failed. Check logs with: eb logs"
    exit 1
}
