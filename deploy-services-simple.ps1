# Script de deploiement simplifie
$ErrorActionPreference = "Continue"

Write-Host "================================================" -ForegroundColor Blue
Write-Host "Deploiement des services manquants" -ForegroundColor Blue
Write-Host "================================================" -ForegroundColor Blue
Write-Host ""

# Configuration
$SERVICES = @{
    "tracking-api" = @{App="rt-tracking-api"; Port=3012; DB="rt-tracking"}
    "appointments-api" = @{App="rt-appointments-api"; Port=3013; DB="rt-appointments"}
    "documents-api" = @{App="rt-documents-api"; Port=3014; DB="rt-documents"}
    "scoring-api" = @{App="rt-scoring-api"; Port=3016; DB="rt-scoring"}
    "affret-ia-api-v2" = @{App="rt-affret-ia-api"; Port=3017; DB="rt-affret-ia"}
    "websocket-api" = @{App="rt-websocket-api"; Port=3010; DB="rt-websocket"}
}

$MONGODB_BASE = "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
$CORS = "http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
$JWT = "rt-super-secret-jwt-key-2024"

Set-Location "services"
$URLS_FILE = "..\DEPLOYED_URLS.txt"
"" | Out-File -FilePath $URLS_FILE -Force

foreach ($dir in $SERVICES.Keys) {
    $service = $SERVICES[$dir]
    $appName = $service.App
    $port = $service.Port
    $dbName = $service.DB

    Write-Host "================================================" -ForegroundColor Blue
    Write-Host "Deploiement: $dir" -ForegroundColor Green
    Write-Host "App: $appName | Port: $port | DB: $dbName" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Blue

    if (-not (Test-Path $dir)) {
        Write-Host "ERREUR: Dossier $dir introuvable" -ForegroundColor Red
        continue
    }

    Set-Location $dir

    # Creer Procfile
    if (-not (Test-Path "Procfile")) {
        "web: node index.js" | Out-File -FilePath "Procfile" -Encoding ASCII -NoNewline
        Write-Host "Procfile cree" -ForegroundColor Green
    }

    # Init EB
    Write-Host "Initialisation EB..." -ForegroundColor Yellow
    eb init -p "Node.js 20" -r "eu-central-1" $appName 2>&1 | Out-Null

    # Creer environnement
    $envName = "$appName-prod"
    Write-Host "Creation environnement: $envName" -ForegroundColor Yellow

    eb create $envName --instance-type t3.micro --single --timeout 20

    # Config variables
    Write-Host "Configuration variables..." -ForegroundColor Yellow
    $mongoUri = "$MONGODB_BASE/$dbName`?retryWrites=true&w=majority"

    eb setenv NODE_ENV="production" PORT="$port" MONGODB_URI="$mongoUri" CORS_ALLOWED_ORIGINS="$CORS" JWT_SECRET="$JWT" LOG_LEVEL="info"

    # Recuperer URL
    Start-Sleep -Seconds 10
    $status = eb status 2>&1
    $url = ($status | Select-String "CNAME:" | ForEach-Object { $_.Line.Split(":")[1].Trim() })

    if ($url) {
        Write-Host "SUCCESS: http://$url" -ForegroundColor Green
        "$dir|$appName|http://$url|$port" | Add-Content -Path $URLS_FILE
    }

    Set-Location ..
    Write-Host ""
}

Write-Host "================================================" -ForegroundColor Blue
Write-Host "DEPLOIEMENT TERMINE" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Blue
Write-Host ""
Write-Host "URLs sauvegardees dans: $URLS_FILE" -ForegroundColor Yellow

if (Test-Path $URLS_FILE) {
    Write-Host ""
    Write-Host "URLs deployees:" -ForegroundColor Green
    Get-Content $URLS_FILE
}
