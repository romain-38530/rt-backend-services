#!/bin/bash

# Test direct de l'API Dashdoc pour comprendre les filtres

# Récupérer le token depuis MongoDB
echo "Getting Dashdoc API token from MongoDB..."
TOKEN=$(mongo "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia" --quiet --eval "db.tmsConnections.findOne({tmsType:'dashdoc',isActive:true}).credentials.apiToken" | tr -d '"')

echo "Testing Dashdoc API filters..."
echo "=========================================="

echo -e "\n1. GET /companies/ with is_carrier=true ONLY:"
curl -s "https://www.dashdoc.eu/api/v4/companies/?is_carrier=true&limit=10" \
  -H "Authorization: Token $TOKEN" | python -m json.tool | grep -E '"count"|"name"|"pk"|"is_carrier"|"is_shipper"|"account_type"' | head -30

echo -e "\n\n2. GET /companies/ with is_carrier=true&is_shipper=false:"
curl -s "https://www.dashdoc.eu/api/v4/companies/?is_carrier=true&is_shipper=false&limit=10" \
  -H "Authorization: Token $TOKEN" | python -m json.tool | grep -E '"count"|"name"|"pk"|"is_carrier"|"is_shipper"|"account_type"' | head -30

echo -e "\n\n3. Search for '1 UP' specifically:"
curl -s "https://www.dashdoc.eu/api/v4/companies/?name=1%20UP&limit=5" \
  -H "Authorization: Token $TOKEN" | python -m json.tool | grep -E '"count"|"name"|"pk"|"is_carrier"|"is_shipper"|"account_type"'

echo -e "\n=========================================="
echo "Test complete."
