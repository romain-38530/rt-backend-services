# Script pour démarrer MongoDB et Redis via Docker
Write-Host "Starting MongoDB and Redis infrastructure..." -ForegroundColor Cyan

$dockerPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
$dockerComposePath = "C:\Program Files\Docker\Docker\resources\bin\docker-compose.exe"

# Vérifier si Docker est installé
if (-not (Test-Path $dockerPath)) {
    Write-Host "ERROR: Docker not found at $dockerPath" -ForegroundColor Red
    exit 1
}

# Essayer d'exécuter docker ps pour vérifier si Docker est prêt
Write-Host "Checking Docker status..." -ForegroundColor Yellow
$attempts = 0
$maxAttempts = 30

while ($attempts -lt $maxAttempts) {
    try {
        $result = & $dockerPath ps 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker is ready!" -ForegroundColor Green
            break
        }
    }
    catch {
        # Ignore errors during wait
    }

    $attempts++
    Write-Host "Waiting for Docker to be ready... ($attempts/$maxAttempts)" -ForegroundColor Yellow
    Start-Sleep -Seconds 2
}

if ($attempts -ge $maxAttempts) {
    Write-Host "ERROR: Docker failed to start after $maxAttempts attempts" -ForegroundColor Red
    Write-Host "Please check Docker Desktop manually" -ForegroundColor Red
    exit 1
}

# Démarrer MongoDB et Redis uniquement
Write-Host "`nStarting MongoDB and Redis containers..." -ForegroundColor Cyan
Set-Location "c:\Users\rtard\dossier symphonia\rt-backend-services"

& $dockerComposePath up -d mongodb redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nInfrastructure started successfully!" -ForegroundColor Green
    Write-Host "`nRunning containers:" -ForegroundColor Cyan
    & $dockerPath ps --filter "name=rt-mongodb" --filter "name=rt-redis"

    Write-Host "`nMongoDB: mongodb://admin:admin123@localhost:27017/rt-technologie" -ForegroundColor Green
    Write-Host "Redis: redis://localhost:6379" -ForegroundColor Green
} else {
    Write-Host "`nERROR: Failed to start containers" -ForegroundColor Red
    exit 1
}
