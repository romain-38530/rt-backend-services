#!/bin/bash

# Script de test de la clé API Dashdoc
# Ce script teste directement l'API Dashdoc pour diagnostiquer l'erreur 401

DASHDOC_API_KEY="8321c7a8f7fe8f75192fa15a6c883a11758e0084"
DASHDOC_API_URL="https://api.dashdoc.com/api/v4"

echo "=========================================="
echo "TEST DASHDOC API - Diagnostic erreur 401"
echo "=========================================="
echo ""
echo "Clé API : ${DASHDOC_API_KEY:0:20}..."
echo "URL API : $DASHDOC_API_URL"
echo ""

# Test 1: Récupérer 1 transport (méthode simplifiée)
echo "----------------------------------------"
echo "TEST 1: GET /transports/ (page_size=1)"
echo "----------------------------------------"
curl -X GET "${DASHDOC_API_URL}/transports/?page_size=1" \
  -H "Authorization: Bearer ${DASHDOC_API_KEY}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Erreur de parsing JSON"

echo ""
echo ""

# Test 2: Récupérer transports complétés
echo "----------------------------------------"
echo "TEST 2: GET /transports/ (status=done)"
echo "----------------------------------------"
curl -X GET "${DASHDOC_API_URL}/transports/?status=done&page_size=1" \
  -H "Authorization: Bearer ${DASHDOC_API_KEY}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Erreur de parsing JSON"

echo ""
echo ""

# Test 3: Récupérer transports sous-traités
echo "----------------------------------------"
echo "TEST 3: GET /transports/ (is_subcontracted=true)"
echo "----------------------------------------"
curl -X GET "${DASHDOC_API_URL}/transports/?status=done&is_subcontracted=true&page_size=1" \
  -H "Authorization: Bearer ${DASHDOC_API_KEY}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Erreur de parsing JSON"

echo ""
echo ""

# Test 4: Tester avec Token au lieu de Bearer
echo "----------------------------------------"
echo "TEST 4: GET /transports/ (Authorization: Token)"
echo "----------------------------------------"
curl -X GET "${DASHDOC_API_URL}/transports/?page_size=1" \
  -H "Authorization: Token ${DASHDOC_API_KEY}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Erreur de parsing JSON"

echo ""
echo ""

# Test 5: Tester sans préfixe Authorization
echo "----------------------------------------"
echo "TEST 5: GET /transports/ (X-API-Key header)"
echo "----------------------------------------"
curl -X GET "${DASHDOC_API_URL}/transports/?page_size=1" \
  -H "X-API-Key: ${DASHDOC_API_KEY}" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.' 2>/dev/null || echo "Erreur de parsing JSON"

echo ""
echo ""

echo "=========================================="
echo "FIN DES TESTS"
echo "=========================================="
echo ""
echo "INTERPRÉTATION DES RÉSULTATS :"
echo ""
echo "- HTTP 200 + données JSON → Clé API valide ✅"
echo "- HTTP 401 → Clé API invalide, expirée ou révoquée ❌"
echo "- HTTP 403 → Clé valide mais permissions insuffisantes ⚠️"
echo "- HTTP 404 → Endpoint incorrect ⚠️"
echo ""
echo "PROCHAINES ÉTAPES SI ERREUR 401 :"
echo "1. Vérifier que la clé est active dans Dashdoc"
echo "2. Régénérer une nouvelle clé API"
echo "3. Vérifier les permissions (lecture transports, pricing)"
echo "4. Contacter le support Dashdoc"
echo ""
