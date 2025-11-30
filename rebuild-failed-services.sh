#!/bin/bash
# Script pour reconstruire les services en échec après augmentation du quota EIP

EB="/c/Users/rtard/AppData/Roaming/Python/Python314/Scripts/eb.exe"
REQUEST_ID="7424adba98f247d2a4071cf7594fa7e6s6AGY658"

echo "========================================================"
echo "RECONSTRUCTION DES 5 SERVICES EN ÉCHEC"
echo "========================================================"
echo ""

# Étape 1: Vérifier et attendre l'approbation du quota
echo "Étape 1/3: Vérification du quota EIP..."
echo ""

while true; do
  STATUS=$(aws service-quotas get-requested-service-quota-change \
    --request-id "$REQUEST_ID" \
    --region eu-central-1 \
    --query 'RequestedQuota.Status' \
    --output text 2>/dev/null)

  echo "$(date +%H:%M:%S) - Quota Status: $STATUS"

  if [ "$STATUS" = "CASE_OPENED" ] || [ "$STATUS" = "APPROVED" ]; then
    echo "✓ Quota approuvé!"
    break
  elif [ "$STATUS" = "DENIED" ] || [ "$STATUS" = "INVALID_REQUEST" ]; then
    echo "✗ La demande de quota a été refusée. Impossible de continuer."
    exit 1
  fi

  sleep 30
done

echo ""
echo "Étape 2/3: Nettoyage des environnements en échec..."
echo ""

# Liste des environnements à reconstruire
SERVICES=(
  "appointments-api:rt-appointments-api:3013"
  "documents-api:rt-documents-api:3014"
  "scoring-api:rt-scoring-api:3016"
  "affret-ia-api-v2:rt-affret-ia-api:3017"
  "websocket-api:rt-websocket-api:3010"
)

# Terminer les environnements en échec
for SERVICE_INFO in "${SERVICES[@]}"; do
  IFS=':' read -r SERVICE_DIR APP_NAME PORT <<< "$SERVICE_INFO"
  echo "Nettoyage de $APP_NAME..."

  cd "services/$SERVICE_DIR" || continue

  # Vérifier si l'environnement existe
  ENV_EXISTS=$("$EB" list 2>/dev/null | grep -c "${APP_NAME}-prod" || true)

  if [ "$ENV_EXISTS" -gt 0 ]; then
    echo "  Terminaison de ${APP_NAME}-prod..."
    "$EB" terminate "${APP_NAME}-prod" --force --timeout 10 2>/dev/null || true
    sleep 5
  fi

  cd ../..
  echo "  ✓ ${APP_NAME} nettoyé"
done

echo ""
echo "Attente de 30s pour la terminaison complète..."
sleep 30

echo ""
echo "Étape 3/3: Déploiement des 5 services..."
echo ""

# Redéployer chaque service
chmod +x deploy-appointments-api.sh
chmod +x deploy-documents-api.sh
chmod +x deploy-scoring-api.sh
chmod +x deploy-affret-ia-api.sh
chmod +x deploy-websocket-api.sh

echo ""
echo "========================================================" echo "Service 1/5: appointments-api"
echo "========================================================"
./deploy-appointments-api.sh

echo ""
echo "========================================================"
echo "Service 2/5: documents-api"
echo "========================================================"
./deploy-documents-api.sh

echo ""
echo "========================================================"
echo "Service 3/5: scoring-api"
echo "========================================================"
./deploy-scoring-api.sh

echo ""
echo "========================================================"
echo "Service 4/5: affret-ia-api-v2"
echo "========================================================"
./deploy-affret-ia-api.sh

echo ""
echo "========================================================"
echo "Service 5/5: websocket-api"
echo "========================================================"
./deploy-websocket-api.sh

echo ""
echo "========================================================"
echo "🎉 RECONSTRUCTION TERMINÉE"
echo "========================================================"
echo ""

if [ -f "DEPLOYED_URLS.txt" ] && [ -s "DEPLOYED_URLS.txt" ]; then
  echo "📝 URLs des services déployés:"
  echo ""
  cat DEPLOYED_URLS.txt
  echo ""
fi
