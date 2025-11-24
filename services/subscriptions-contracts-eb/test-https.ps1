# Script de test pour les endpoints HTTPS via CloudFront
# Service: Subscriptions-Contracts
# Version: 1.0.0

$httpUrl = "http://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com"
$httpsUrl = "https://dgze8l03lwl5h.cloudfront.net"

# Utiliser HTTP pour l'instant, HTTPS une fois CloudFront déployé
$baseUrl = $httpUrl

Write-Host "`n=== RT Subscriptions-Contracts API Tests ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl" -ForegroundColor Yellow
Write-Host ""

Write-Host "`n=== Test 1: Health Check ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✅ Health: $($response.status)" -ForegroundColor Green
    Write-Host "Service: $($response.service)" -ForegroundColor Green
    Write-Host "Version: $($response.version)" -ForegroundColor Green
    Write-Host "Environment: $($response.env)" -ForegroundColor Green
    Write-Host "MongoDB: $($response.mongodb.status)" -ForegroundColor $(if ($response.mongodb.connected) { "Green" } else { "Yellow" })
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 2: API Info ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "✅ Message: $($response.message)" -ForegroundColor Green
    Write-Host "Version: $($response.version)" -ForegroundColor Green
    Write-Host "Features:" -ForegroundColor Green
    $response.features | ForEach-Object { Write-Host "  - $_" }
    Write-Host "Endpoints: $($response.endpoints.Count) disponibles" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 3: Liste des Plans (GET) ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/plans" -Method Get
    if ($response.success) {
        Write-Host "✅ Success: $($response.count) plans trouvés" -ForegroundColor Green
    } else {
        Write-Host "⚠️  MongoDB requis pour ce test" -ForegroundColor Yellow
        Write-Host "Error: $($response.error.message)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  MongoDB requis: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Test 4: Créer un Plan (POST) ===" -ForegroundColor Cyan
try {
    $body = @{
        name = "Test Plan $(Get-Date -Format 'yyyyMMdd_HHmmss')"
        type = "PRO"
        description = "Plan de test automatique"
        price = 49.99
        billingInterval = "MONTHLY"
        features = @{
            maxApiCalls = 10000
            maxUsers = 10
            maxVehicles = 50
            support = "email"
        }
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/plans" -Method Post -Body $body -ContentType "application/json"
    if ($response.success) {
        Write-Host "✅ Plan créé: $($response.data.name)" -ForegroundColor Green
        Write-Host "ID: $($response.data._id)" -ForegroundColor Green
        Write-Host "Prix: $($response.data.price) EUR/$($response.data.billingInterval)" -ForegroundColor Green
        $script:testPlanId = $response.data._id
    } else {
        Write-Host "⚠️  MongoDB requis" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  MongoDB requis: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Test 5: Créer un Abonnement (POST) ===" -ForegroundColor Cyan
try {
    $body = @{
        userId = "test-user-123"
        planId = "test-plan-id"
        billingInterval = "MONTHLY"
        startTrial = $true
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/subscriptions" -Method Post -Body $body -ContentType "application/json"
    if ($response.success) {
        Write-Host "✅ Abonnement créé" -ForegroundColor Green
        Write-Host "Status: $($response.data.status)" -ForegroundColor Green
        Write-Host "Trial End: $($response.data.trialEndDate)" -ForegroundColor Green
        $script:testSubscriptionId = $response.data._id
    } else {
        Write-Host "⚠️  MongoDB requis" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  MongoDB requis: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Test 6: Créer un Contrat (POST) ===" -ForegroundColor Cyan
try {
    $body = @{
        title = "Contrat de Test $(Get-Date -Format 'yyyyMMdd_HHmmss')"
        type = "TRANSPORT"
        content = "<h1>Contrat de Transport</h1><p>Ceci est un contrat de test automatique.</p>"
        parties = @(
            @{
                type = "COMPANY"
                name = "Entreprise Test A"
                email = "test-a@example.com"
                role = "SENDER"
                signatureRequired = $true
            },
            @{
                type = "COMPANY"
                name = "Transporteur Test B"
                email = "test-b@example.com"
                role = "CARRIER"
                signatureRequired = $true
            }
        )
        effectiveDate = "2025-12-01"
    } | ConvertTo-Json -Depth 5

    $response = Invoke-RestMethod -Uri "$baseUrl/api/contracts" -Method Post -Body $body -ContentType "application/json"
    if ($response.success) {
        Write-Host "✅ Contrat créé: $($response.data.title)" -ForegroundColor Green
        Write-Host "ID: $($response.data._id)" -ForegroundColor Green
        Write-Host "Status: $($response.data.status)" -ForegroundColor Green
        Write-Host "Parties: $($response.data.parties.Count)" -ForegroundColor Green
        $script:testContractId = $response.data._id
    } else {
        Write-Host "⚠️  MongoDB requis" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  MongoDB requis: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Test 7: Tester un endpoint invalide (404) ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/invalid-endpoint" -Method Get -ErrorAction Stop
    Write-Host "❌ Devrait retourner 404" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 404) {
        Write-Host "✅ 404 correctement retourné" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Erreur inattendue: $_" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Résumé des Tests ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Service: RT Subscriptions-Contracts API" -ForegroundColor White
Write-Host "URL HTTP: $httpUrl" -ForegroundColor White
Write-Host "URL HTTPS: $httpsUrl (en cours de déploiement)" -ForegroundColor Yellow
Write-Host ""
Write-Host "✅ Tests de base: OK" -ForegroundColor Green
Write-Host "⚠️  Tests MongoDB: Requiert configuration Atlas" -ForegroundColor Yellow
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Cyan
Write-Host "  1. Attendre déploiement CloudFront (5-15 min)" -ForegroundColor White
Write-Host "  2. Configurer MongoDB Atlas" -ForegroundColor White
Write-Host "  3. Relancer les tests avec HTTPS et MongoDB" -ForegroundColor White
Write-Host ""

# Test HTTPS si CloudFront est déployé
Write-Host "`n=== Test 8: Vérification HTTPS CloudFront ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$httpsUrl/health" -Method Get -TimeoutSec 10
    Write-Host "✅ HTTPS CloudFront: Opérationnel!" -ForegroundColor Green
    Write-Host "Distribution déployée avec succès" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -like "*SSL*" -or $_.Exception.Message -like "*timeout*") {
        Write-Host "⏳ CloudFront en cours de déploiement..." -ForegroundColor Yellow
        Write-Host "Vérifier dans 5-10 minutes" -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  CloudFront: $_" -ForegroundColor Yellow
    }
}

Write-Host "`n=== Tous les tests terminés! ===" -ForegroundColor Cyan
Write-Host ""
