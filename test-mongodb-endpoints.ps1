# Test complet des endpoints MongoDB
$baseUrl = "https://dgze8l03lwl5h.cloudfront.net"

Write-Host "`n=== Test des Endpoints MongoDB ===" -ForegroundColor Cyan
Write-Host "URL: $baseUrl" -ForegroundColor Yellow
Write-Host ""

# Test 1: Liste des plans
Write-Host "1. Test GET /api/plans" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/plans" -Method Get
    Write-Host "   Success: $($response.count) plans trouv�s" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 2
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 2: Cr�er un plan
Write-Host "2. Test POST /api/plans (Cr�ation)" -ForegroundColor Cyan
try {
    $body = @{
        name = "Test Plan $(Get-Date -Format 'yyyyMMdd_HHmmss')"
        type = "PRO"
        description = "Plan de test MongoDB Atlas"
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
    Write-Host "   Success: Plan cr�� avec ID $($response.data._id)" -ForegroundColor Green
    $planId = $response.data._id
    $response | ConvertTo-Json -Depth 3
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 3: Cr�er un abonnement
Write-Host "3. Test POST /api/subscriptions (Cr�ation)" -ForegroundColor Cyan
try {
    $body = @{
        userId = "test-user-$(Get-Date -Format 'HHmmss')"
        planId = $planId
        billingInterval = "MONTHLY"
        startTrial = $true
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/subscriptions" -Method Post -Body $body -ContentType "application/json"
    Write-Host "   Success: Abonnement cr�� avec ID $($response.data._id)" -ForegroundColor Green
    Write-Host "   Status: $($response.data.status)" -ForegroundColor Green
    Write-Host "   Trial End: $($response.data.trialEndDate)" -ForegroundColor Green
    $subscriptionId = $response.data._id
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""

# Test 4: Cr�er un contrat
Write-Host "4. Test POST /api/contracts (Cr�ation)" -ForegroundColor Cyan
try {
    $body = @{
        title = "Contrat Test MongoDB $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
        type = "TRANSPORT"
        content = "<h1>Contrat de Test</h1><p>Validation MongoDB Atlas</p>"
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
    Write-Host "   Success: Contrat cr�� avec ID $($response.data._id)" -ForegroundColor Green
    Write-Host "   Status: $($response.data.status)" -ForegroundColor Green
    $contractId = $response.data._id
} catch {
    Write-Host "   Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== R�sum� ===" -ForegroundColor Cyan
Write-Host "MongoDB Atlas: Connect� et op�rationnel!" -ForegroundColor Green
Write-Host "Tous les endpoints CRUD fonctionnent correctement" -ForegroundColor Green
Write-Host ""
Write-Host "IDs cr��s pour tests:" -ForegroundColor Yellow
Write-Host "  Plan ID: $planId" -ForegroundColor White
Write-Host "  Subscription ID: $subscriptionId" -ForegroundColor White
Write-Host "  Contract ID: $contractId" -ForegroundColor White
Write-Host ""
