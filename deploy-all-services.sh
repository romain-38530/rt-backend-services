#!/bin/bash
# Script maître pour déployer tous les services séquentiellement

echo "========================================================"
echo "🚀 DÉPLOIEMENT DE TOUS LES SERVICES MANQUANTS"
echo "========================================================"
echo ""
echo "Services à déployer:"
echo "  1. tracking-api"
echo "  2. appointments-api"
echo "  3. documents-api"
echo "  4. scoring-api"
echo "  5. affret-ia-api-v2"
echo "  6. websocket-api"
echo ""
echo "Temps estimé: 5-10 minutes par service (~30-60 min total)"
echo ""

# Initialiser le fichier DEPLOYED_URLS.txt
> DEPLOYED_URLS.txt

# Déployer chaque service
echo ""
echo "========================================================"
echo "Service 1/6: tracking-api"
echo "========================================================"
chmod +x deploy-tracking-api.sh
./deploy-tracking-api.sh

echo ""
echo "========================================================"
echo "Service 2/6: appointments-api"
echo "========================================================"
chmod +x deploy-appointments-api.sh
./deploy-appointments-api.sh

echo ""
echo "========================================================"
echo "Service 3/6: documents-api"
echo "========================================================"
chmod +x deploy-documents-api.sh
./deploy-documents-api.sh

echo ""
echo "========================================================"
echo "Service 4/6: scoring-api"
echo "========================================================"
chmod +x deploy-scoring-api.sh
./deploy-scoring-api.sh

echo ""
echo "========================================================"
echo "Service 5/6: affret-ia-api-v2"
echo "========================================================"
chmod +x deploy-affret-ia-api.sh
./deploy-affret-ia-api.sh

echo ""
echo "========================================================"
echo "Service 6/6: websocket-api"
echo "========================================================"
chmod +x deploy-websocket-api.sh
./deploy-websocket-api.sh

# Afficher le résumé
echo ""
echo "========================================================"
echo "🎉 DÉPLOIEMENT TERMINÉ"
echo "========================================================"
echo ""

if [ -f "DEPLOYED_URLS.txt" ] && [ -s "DEPLOYED_URLS.txt" ]; then
  echo "📝 URLs des services déployés:"
  echo ""
  cat DEPLOYED_URLS.txt
  echo ""
fi
