# Script de test pour les endpoints HTTPS via CloudFront
# Version: 2.2.0

$baseUrl = "https://d2i50a1vlg138w.cloudfront.net"

Write-Host "`n=== Test 1: Health Check ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✅ Health: $($response.status)" -ForegroundColor Green
    Write-Host "MongoDB: $($response.mongodb.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 2: API Info ===" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "✅ Version: $($response.version)" -ForegroundColor Green
    Write-Host "Features:" -ForegroundColor Green
    $response.features | ForEach-Object { Write-Host "  - $_" }
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 3: Validation TVA (format) ===" -ForegroundColor Cyan
try {
    $body = @{ vatNumber = "FR12345678901" } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/vat/validate-format" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Valid format: $($response.valid)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 4: Validation TVA (VIES + Fallback) ===" -ForegroundColor Cyan
try {
    $body = @{ vatNumber = "DE123456789" } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/vat/validate" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Valid: $($response.valid)" -ForegroundColor Green
    Write-Host "Source: $($response.source)" -ForegroundColor Yellow
    Write-Host "Country: $($response.countryCode)" -ForegroundColor Green
    Write-Host "Company: $($response.companyName)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 5: Calcul de prix avec TVA ===" -ForegroundColor Cyan
try {
    $body = @{ amount = 100; countryCode = "FR" } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/vat/calculate-price" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Prix HT: $($response.priceExclVat) EUR" -ForegroundColor Green
    Write-Host "Prix TTC: $($response.priceInclVat) EUR" -ForegroundColor Green
    Write-Host "Taux TVA: $($response.vatRate)%" -ForegroundColor Green
    Write-Host "Pays: $($response.countryName)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Test 6: Calcul de prix avec TVA (GB) ===" -ForegroundColor Cyan
try {
    $body = @{ amount = 250; countryCode = "GB" } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$baseUrl/api/vat/calculate-price" -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Prix HT: $($response.priceExclVat) GBP" -ForegroundColor Green
    Write-Host "Prix TTC: $($response.priceInclVat) GBP" -ForegroundColor Green
    Write-Host "Taux TVA: $($response.vatRate)%" -ForegroundColor Green
    Write-Host "Pays: $($response.countryName)" -ForegroundColor Green
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}

Write-Host "`n=== Tous les tests terminés! ===" -ForegroundColor Cyan
