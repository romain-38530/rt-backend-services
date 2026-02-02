#!/bin/bash
# Script de test rapide de l'API des transporteurs

API_URL="${API_URL:-http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com}"

echo "=========================================="
echo "Test API Transporteurs SYMPHONI.A"
echo "=========================================="
echo ""

# Test 1: Health Check
echo "1. Health Check..."
curl -s "$API_URL/health" | python -m json.tool | head -20
echo ""

# Test 2: Liste des transporteurs
echo ""
echo "2. Liste des transporteurs..."
curl -s "$API_URL/api/carriers" | python -m json.tool | grep -E "success|count"
echo ""

# Test 3: Root endpoint
echo ""
echo "3. Version API..."
curl -s "$API_URL/" | python -m json.tool | grep -E "version|message"
echo ""

echo "=========================================="
echo "Tests terminés"
echo "=========================================="
