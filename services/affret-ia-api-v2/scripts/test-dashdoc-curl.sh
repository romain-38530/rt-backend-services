#!/bin/bash

# Test avec cURL pur (sans Node.js)
# Format EXACT fourni par le support Dashdoc

API_KEY="8321c7a8f7fe8f75192fa15a6c883a11758e0084"
BASE_URL="https://api.dashdoc.com/api/v4"

echo "================================================================================"
echo "  TEST DASHDOC API - cURL PUR"
echo "================================================================================"
echo ""
echo "Clé API: ${API_KEY:0:20}..."
echo "Format: Authorization: Token <key>"
echo "Base URL: $BASE_URL"
echo ""
echo "================================================================================"
echo ""

# Test 1: Simple (page_size=1)
echo "TEST 1: GET /transports/?page_size=1"
echo "--------------------------------------------------------------------------------"
echo ""
echo "Commande:"
echo "curl -X GET \"${BASE_URL}/transports/?page_size=1\" \\"
echo "  -H \"Authorization: Token ${API_KEY}\" \\"
echo "  -H \"Accept: application/json\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -v"
echo ""
echo "Résultat:"
echo ""

curl -X GET "${BASE_URL}/transports/?page_size=1" \
  -H "Authorization: Token ${API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v

RESULT1=$?

echo ""
echo "================================================================================"
echo ""

# Test 2: Avec filtres
echo "TEST 2: GET /transports/?status=done&is_subcontracted=true&page_size=10"
echo "--------------------------------------------------------------------------------"
echo ""
echo "Commande:"
echo "curl -X GET \"${BASE_URL}/transports/?status=done&is_subcontracted=true&page_size=10\" \\"
echo "  -H \"Authorization: Token ${API_KEY}\" \\"
echo "  -H \"Accept: application/json\" \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -v"
echo ""
echo "Résultat:"
echo ""

curl -X GET "${BASE_URL}/transports/?status=done&is_subcontracted=true&page_size=10" \
  -H "Authorization: Token ${API_KEY}" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -v

RESULT2=$?

echo ""
echo "================================================================================"
echo ""

# Résumé
echo "RÉSUMÉ DES TESTS"
echo "================================================================================"
echo ""

if [ $RESULT1 -eq 0 ]; then
  echo "✅ Test 1: Succès (exit code 0)"
else
  echo "❌ Test 1: Échec (exit code $RESULT1)"
fi

if [ $RESULT2 -eq 0 ]; then
  echo "✅ Test 2: Succès (exit code 0)"
else
  echo "❌ Test 2: Échec (exit code $RESULT2)"
fi

echo ""
echo "================================================================================"
echo ""
echo "NOTE: Un exit code 0 signifie que curl s'est exécuté sans erreur,"
echo "      mais cela ne signifie pas forcément que l'API a retourné 200 OK."
echo "      Vérifiez le HTTP Status Code dans la sortie verbose ci-dessus."
echo ""
echo "Si vous voyez '< HTTP/2 401' dans la sortie, l'authentification a échoué."
echo "Si vous voyez '< HTTP/2 200' dans la sortie, l'authentification a réussi."
echo ""
