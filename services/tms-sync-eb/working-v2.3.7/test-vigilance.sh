#!/bin/bash
# Script de test pour le système de vigilance des carriers

echo "======================================"
echo "TEST SYSTÈME DE VIGILANCE - TMS SYNC"
echo "======================================"
echo ""

API_URL="http://localhost:3000"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}1. Synchronisation des carriers depuis Dashdoc${NC}"
echo "POST $API_URL/api/v1/jobs/carriersSync/run"
curl -X POST "$API_URL/api/v1/jobs/carriersSync/run" | jq '.'
echo ""
sleep 2

echo -e "${BLUE}2. Mise à jour des scores de vigilance${NC}"
echo "POST $API_URL/api/v1/tms/carriers/vigilance/update-all"
curl -X POST "$API_URL/api/v1/tms/carriers/vigilance/update-all" | jq '.'
echo ""
sleep 2

echo -e "${BLUE}3. Récupération de tous les carriers${NC}"
echo "GET $API_URL/api/v1/tms/carriers?limit=10"
curl -s "$API_URL/api/v1/tms/carriers?limit=10" | jq '.carriers[] | {name: .companyName, score: .vigilanceScore, level: .vigilanceLevel}'
echo ""

echo -e "${BLUE}4. Statistiques de vigilance${NC}"
echo "GET $API_URL/api/v1/tms/carriers/vigilance/stats"
curl -s "$API_URL/api/v1/tms/carriers/vigilance/stats" | jq '.'
echo ""

echo -e "${BLUE}5. Filtrer les carriers N1-Premium${NC}"
echo "GET $API_URL/api/v1/tms/carriers?level=N1_premium&limit=5"
curl -s "$API_URL/api/v1/tms/carriers?level=N1_premium&limit=5" | jq '.carriers[] | {name: .companyName, score: .vigilanceScore, level: .vigilanceLevel}'
echo ""

echo -e "${BLUE}6. Filtrer les carriers N1-Référence${NC}"
echo "GET $API_URL/api/v1/tms/carriers?level=N1_referenced&limit=5"
curl -s "$API_URL/api/v1/tms/carriers?level=N1_referenced&limit=5" | jq '.carriers[] | {name: .companyName, score: .vigilanceScore, level: .vigilanceLevel}'
echo ""

echo -e "${BLUE}7. Recherche de carriers${NC}"
echo "GET $API_URL/api/v1/tms/carriers?search=ACME"
curl -s "$API_URL/api/v1/tms/carriers?search=ACME" | jq '.carriers[] | {name: .companyName, score: .vigilanceScore}'
echo ""

echo -e "${BLUE}8. Détail de vigilance d'un carrier (premier de la liste)${NC}"
CARRIER_ID=$(curl -s "$API_URL/api/v1/tms/carriers?limit=1" | jq -r '.carriers[0]._id')
if [ "$CARRIER_ID" != "null" ] && [ -n "$CARRIER_ID" ]; then
  echo "GET $API_URL/api/v1/tms/carriers/$CARRIER_ID/vigilance"
  curl -s "$API_URL/api/v1/tms/carriers/$CARRIER_ID/vigilance" | jq '.'
else
  echo -e "${RED}Aucun carrier trouvé${NC}"
fi
echo ""

echo -e "${BLUE}9. Statut des jobs${NC}"
echo "GET $API_URL/api/v1/jobs/status"
curl -s "$API_URL/api/v1/jobs/status" | jq '.status.jobs | {carriersSync, vigilanceUpdate}'
echo ""

echo -e "${GREEN}======================================"
echo "TESTS TERMINÉS"
echo "======================================${NC}"
