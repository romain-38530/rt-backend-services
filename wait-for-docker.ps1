# Script pour attendre que Docker soit prêt et démarrer MongoDB/Redis
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Attente du démarrage de Docker Desktop" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$maxAttempts = 30
$attempt = 0
$dockerReady = $false

while (-not $dockerReady -and $attempt -lt $maxAttempts) {
    $attempt++
    Write-Host "[$attempt/$maxAttempts] Vérification de Docker..." -NoNewline

    try {
        $result = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            $dockerReady = $true
            Write-Host " OK!" -ForegroundColor Green
            break
        }
        Write-Host " Pas encore prêt..." -ForegroundColor Yellow
    }
    catch {
        Write-Host " Pas encore prêt..." -ForegroundColor Yellow
    }

    Start-Sleep -Seconds 10
}

if (-not $dockerReady) {
    Write-Host "`n❌ Docker n'est toujours pas prêt après $($maxAttempts * 10) secondes." -ForegroundColor Red
    Write-Host "Vérifiez que Docker Desktop est bien lancé." -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ Docker est prêt!" -ForegroundColor Green
Write-Host "`nDémarrage de MongoDB et Redis...`n" -ForegroundColor Cyan

# Démarrer les conteneurs
docker compose up -d mongodb redis

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "✅ Infrastructure démarrée avec succès!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green

    Write-Host "MongoDB: localhost:27017"
    Write-Host "  - Username: admin"
    Write-Host "  - Password: admin123"
    Write-Host "  - Database: rt-technologie`n"

    Write-Host "Redis: localhost:6379`n"

    Write-Host "Attente que MongoDB soit complètement prêt..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5

    Write-Host "`n✅ Vous pouvez maintenant démarrer le service TMS Sync:" -ForegroundColor Green
    Write-Host "   cd services/tms-sync-eb"
    Write-Host "   node index.js`n"
} else {
    Write-Host "`n❌ Erreur lors du démarrage des conteneurs" -ForegroundColor Red
    Write-Host "Vérifiez les logs Docker Desktop`n" -ForegroundColor Red
    exit 1
}
