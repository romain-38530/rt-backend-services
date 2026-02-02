# Script de test de la clé API Dashdoc
# Ce script teste directement l'API Dashdoc pour diagnostiquer l'erreur 401

$DASHDOC_API_KEY = "8321c7a8f7fe8f75192fa15a6c883a11758e0084"
$DASHDOC_API_URL = "https://api.dashdoc.com/api/v4"

Write-Host "=========================================="
Write-Host "TEST DASHDOC API - Diagnostic erreur 401"
Write-Host "=========================================="
Write-Host ""
Write-Host "Clé API : $($DASHDOC_API_KEY.Substring(0, 20))..."
Write-Host "URL API : $DASHDOC_API_URL"
Write-Host ""

# Test 1: Récupérer 1 transport (méthode Bearer)
Write-Host "----------------------------------------"
Write-Host "TEST 1: GET /transports/ (Authorization: Bearer)"
Write-Host "----------------------------------------"
try {
    $headers = @{
        "Authorization" = "Bearer $DASHDOC_API_KEY"
        "Content-Type" = "application/json"
    }
    $response = Invoke-WebRequest -Uri "$DASHDOC_API_URL/transports/?page_size=1" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 2: Récupérer transports complétés
Write-Host "----------------------------------------"
Write-Host "TEST 2: GET /transports/ (status=done)"
Write-Host "----------------------------------------"
try {
    $headers = @{
        "Authorization" = "Bearer $DASHDOC_API_KEY"
        "Content-Type" = "application/json"
    }
    $response = Invoke-WebRequest -Uri "$DASHDOC_API_URL/transports/?status=done&page_size=1" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 3: Récupérer transports sous-traités
Write-Host "----------------------------------------"
Write-Host "TEST 3: GET /transports/ (is_subcontracted=true)"
Write-Host "----------------------------------------"
try {
    $headers = @{
        "Authorization" = "Bearer $DASHDOC_API_KEY"
        "Content-Type" = "application/json"
    }
    $response = Invoke-WebRequest -Uri "$DASHDOC_API_URL/transports/?status=done&is_subcontracted=true&page_size=1" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 4: Tester avec Token au lieu de Bearer
Write-Host "----------------------------------------"
Write-Host "TEST 4: GET /transports/ (Authorization: Token)"
Write-Host "----------------------------------------"
try {
    $headers = @{
        "Authorization" = "Token $DASHDOC_API_KEY"
        "Content-Type" = "application/json"
    }
    $response = Invoke-WebRequest -Uri "$DASHDOC_API_URL/transports/?page_size=1" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

# Test 5: Tester sans préfixe Authorization
Write-Host "----------------------------------------"
Write-Host "TEST 5: GET /transports/ (X-API-Key header)"
Write-Host "----------------------------------------"
try {
    $headers = @{
        "X-API-Key" = "$DASHDOC_API_KEY"
        "Content-Type" = "application/json"
    }
    $response = Invoke-WebRequest -Uri "$DASHDOC_API_URL/transports/?page_size=1" -Headers $headers -Method Get -ErrorAction Stop
    Write-Host "HTTP Status: $($response.StatusCode)" -ForegroundColor Green
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5
} catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ""

Write-Host "=========================================="
Write-Host "FIN DES TESTS"
Write-Host "=========================================="
Write-Host ""
Write-Host "INTERPRÉTATION DES RÉSULTATS :"
Write-Host ""
Write-Host "- HTTP 200 + données JSON → Clé API valide ✅" -ForegroundColor Green
Write-Host "- HTTP 401 → Clé API invalide, expirée ou révoquée ❌" -ForegroundColor Red
Write-Host "- HTTP 403 → Clé valide mais permissions insuffisantes ⚠️" -ForegroundColor Yellow
Write-Host "- HTTP 404 → Endpoint incorrect ⚠️" -ForegroundColor Yellow
Write-Host ""
Write-Host "PROCHAINES ÉTAPES SI ERREUR 401 :"
Write-Host "1. Vérifier que la clé est active dans Dashdoc (app.dashdoc.com)"
Write-Host "2. Régénérer une nouvelle clé API avec permissions complètes"
Write-Host "3. Vérifier les permissions requises :"
Write-Host "   - Lecture des transports (transports:read)"
Write-Host "   - Accès aux informations de pricing"
Write-Host "   - Accès aux informations carrier"
Write-Host "4. Contacter le support Dashdoc : support@dashdoc.com"
Write-Host ""
Write-Host "Documentation Dashdoc : https://api.dashdoc.com/docs/" -ForegroundColor Cyan
Write-Host ""
