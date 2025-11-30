# Script de deploiement - Sales Agents API
# Module Agents Commerciaux & Commissions
$ErrorActionPreference = "Continue"

$dir = "sales-agents-api"
$appName = "rt-sales-agents-api"
$port = "3015"
$dbName = "rt-sales-agents"

$MONGODB_BASE = "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
$CORS = "http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com"
$JWT = "rt-super-secret-jwt-key-2024"

Write-Host "================================================" -ForegroundColor Blue
Write-Host "Deploiement: $dir" -ForegroundColor Green
Write-Host "App: $appName | Port: $port | DB: $dbName" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Blue

Set-Location "services\$dir"

# Verifier Procfile
if (-not (Test-Path "Procfile")) {
    "web: node index.js" | Out-File -FilePath "Procfile" -Encoding ASCII -NoNewline
    Write-Host "Procfile cree" -ForegroundColor Green
}

# Init EB
Write-Host "Initialisation EB..." -ForegroundColor Yellow
eb init -p "Node.js 20" -r "eu-central-1" $appName

# Creer environnement
$envName = "$appName-prod"
Write-Host "Creation environnement: $envName" -ForegroundColor Yellow

eb create $envName --instance-type t3.micro --single --timeout 20

# Config variables
Write-Host "Configuration variables..." -ForegroundColor Yellow
$mongoUri = "$MONGODB_BASE/$dbName`?retryWrites=true&w=majority"

eb setenv `
    NODE_ENV="production" `
    PORT="$port" `
    MONGODB_URI="$mongoUri" `
    CORS_ALLOWED_ORIGINS="$CORS" `
    JWT_SECRET="$JWT" `
    LOG_LEVEL="info" `
    COMMISSION_RATE_PER_CLIENT="70" `
    ECMR_API_URL="http://rt-ecmr-api-prod.eu-central-1.elasticbeanstalk.com" `
    SUBSCRIPTIONS_API_URL="http://rt-subscriptions-api-prod.eu-central-1.elasticbeanstalk.com" `
    FRONTEND_URL="https://main.dbg6okncuyyiw.amplifyapp.com"

# Recuperer URL
Write-Host "Attente du deploiement..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

$status = eb status 2>&1
$url = ($status | Select-String "CNAME:" | ForEach-Object { $_.Line.Split(":")[1].Trim() })

if ($url) {
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "URL: http://$url" -ForegroundColor Cyan
    Write-Host "Health: http://$url/health" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Green

    # Sauvegarder URL
    "$dir|$appName|http://$url|$port" | Add-Content -Path "..\..\DEPLOYED_URLS.txt"
} else {
    Write-Host "Attente supplementaire..." -ForegroundColor Yellow
    eb status
}

Set-Location ..\..
