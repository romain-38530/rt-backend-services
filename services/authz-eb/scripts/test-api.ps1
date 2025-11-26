# Script de test rapide de l'API des transporteurs (Windows PowerShell)

$API_URL = if ($env:API_URL) { $env:API_URL } else { "http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com" }

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "Test API Transporteurs SYMPHONI.A" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "API URL: $API_URL`n" -ForegroundColor Gray

# Test 1: Health Check
Write-Host "1. Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -Method Get
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   MongoDB: $($health.mongodb.status)" -ForegroundColor Green
    Write-Host "   Version: $($health.version)" -ForegroundColor Green
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Version API
Write-Host "`n2. Version API..." -ForegroundColor Yellow
try {
    $root = Invoke-RestMethod -Uri "$API_URL/" -Method Get
    Write-Host "   Version: $($root.version)" -ForegroundColor Green
    Write-Host "   Message: $($root.message)" -ForegroundColor Green
    Write-Host "   Endpoints: $($root.endpoints.Count) disponibles" -ForegroundColor Green
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Liste des transporteurs
Write-Host "`n3. Liste des transporteurs..." -ForegroundColor Yellow
try {
    $carriers = Invoke-RestMethod -Uri "$API_URL/api/carriers" -Method Get
    if ($carriers.success) {
        Write-Host "   Total: $($carriers.count) transporteur(s)" -ForegroundColor Green

        $guest = ($carriers.carriers | Where-Object { $_.status -eq "guest" }).Count
        $referenced = ($carriers.carriers | Where-Object { $_.status -eq "referenced" }).Count
        $premium = ($carriers.carriers | Where-Object { $_.status -eq "premium" }).Count

        Write-Host "   - Niveau 2 (Guest): $guest" -ForegroundColor Gray
        Write-Host "   - Niveau 1 (Referenced): $referenced" -ForegroundColor Gray
        Write-Host "   - Niveau 1+ (Premium): $premium" -ForegroundColor Gray
    } else {
        Write-Host "   ERREUR: $($carriers.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Statistiques MongoDB
Write-Host "`n4. Statistiques MongoDB..." -ForegroundColor Yellow
Write-Host "   Collections: carriers, carrier_documents, pricing_grids, dispatch_chains, carrier_events" -ForegroundColor Gray

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "Tests terminés" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
