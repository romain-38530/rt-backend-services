#!/bin/bash

# ==============================================
# Script de Déploiement Automatique - Services Manquants
# ==============================================

set -e  # Arrêter en cas d'erreur

# Configuration
REGION="eu-central-1"
PLATFORM="Node.js 20 running on 64bit Amazon Linux 2023"
INSTANCE_TYPE="t3.micro"
MONGODB_BASE_URI="mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
CORS_ORIGINS="http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
JWT_SECRET="rt-super-secret-jwt-key-2024"

# Couleurs pour les logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Services à déployer (nom_dossier:nom_app:port:db_name)
declare -A SERVICES=(
  ["tracking-api"]="rt-tracking-api:3012:rt-tracking"
  ["appointments-api"]="rt-appointments-api:3013:rt-appointments"
  ["documents-api"]="rt-documents-api:3014:rt-documents"
  ["scoring-api"]="rt-scoring-api:3016:rt-scoring"
  ["affret-ia-api-v2"]="rt-affret-ia-api:3017:rt-affret-ia"
  ["websocket-api"]="rt-websocket-api:3010:rt-websocket"
)

echo -e "${BLUE}=================================================="
echo "🚀 DÉPLOIEMENT AUTOMATIQUE DES SERVICES MANQUANTS"
echo -e "==================================================${NC}"
echo ""

# Vérifier prérequis
echo -e "${YELLOW}📋 Vérification des prérequis...${NC}"
if ! command -v aws &> /dev/null; then
  echo -e "${RED}❌ AWS CLI non installé. Installez-le depuis https://aws.amazon.com/cli/${NC}"
  exit 1
fi

if ! command -v eb &> /dev/null; then
  echo -e "${RED}❌ EB CLI non installé. Installez avec: pip install awsebcli${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Prérequis OK${NC}"
echo ""

# Aller dans le dossier services
cd "$(dirname "$0")/services"
SERVICES_DIR=$(pwd)

# Fichier pour stocker les URLs
URLS_FILE="$SERVICES_DIR/../DEPLOYED_URLS.txt"
> "$URLS_FILE"  # Vider le fichier

echo -e "${BLUE}📦 Services à déployer: ${#SERVICES[@]}${NC}"
echo ""

# Déployer chaque service
for SERVICE_DIR in "${!SERVICES[@]}"; do
  IFS=':' read -r APP_NAME PORT DB_NAME <<< "${SERVICES[$SERVICE_DIR]}"

  echo -e "${BLUE}=================================================="
  echo "🚀 Déploiement: $SERVICE_DIR"
  echo "   App: $APP_NAME"
  echo "   Port: $PORT"
  echo "   DB: $DB_NAME"
  echo -e "==================================================${NC}"

  # Vérifier que le dossier existe
  if [ ! -d "$SERVICES_DIR/$SERVICE_DIR" ]; then
    echo -e "${RED}❌ Dossier $SERVICE_DIR introuvable${NC}"
    continue
  fi

  cd "$SERVICES_DIR/$SERVICE_DIR"

  # Vérifier fichiers requis
  if [ ! -f "index.js" ] && [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Pas de index.js ou server.js trouvé${NC}"
    continue
  fi

  if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Pas de package.json trouvé${NC}"
    continue
  fi

  # Créer Procfile si nécessaire
  if [ ! -f "Procfile" ]; then
    echo -e "${YELLOW}📝 Création du Procfile...${NC}"
    if [ -f "index.js" ]; then
      echo "web: node index.js" > Procfile
    else
      echo "web: node server.js" > Procfile
    fi
  fi

  # Initialiser EB
  echo -e "${YELLOW}📦 Initialisation EB...${NC}"
  eb init -p "$PLATFORM" -r "$REGION" "$APP_NAME" || true

  # Vérifier si l'environnement existe déjà
  ENV_NAME="${APP_NAME}-prod"
  if eb list | grep -q "$ENV_NAME"; then
    echo -e "${YELLOW}⚠️  Environnement $ENV_NAME existe déjà${NC}"
    echo -e "${YELLOW}🔄 Redéploiement...${NC}"
    eb deploy "$ENV_NAME" || echo -e "${RED}❌ Échec du redéploiement${NC}"
  else
    # Créer nouvel environnement
    echo -e "${YELLOW}🏗️  Création de l'environnement...${NC}"
    eb create "$ENV_NAME" \
      --instance-type "$INSTANCE_TYPE" \
      --single \
      --timeout 20 || {
        echo -e "${RED}❌ Échec de la création de l'environnement${NC}"
        continue
      }
  fi

  # Configurer variables d'environnement
  echo -e "${YELLOW}⚙️  Configuration des variables d'environnement...${NC}"
  MONGODB_URI="${MONGODB_BASE_URI}/${DB_NAME}?retryWrites=true&w=majority"

  eb setenv \
    NODE_ENV="production" \
    PORT="$PORT" \
    MONGODB_URI="$MONGODB_URI" \
    CORS_ALLOWED_ORIGINS="$CORS_ORIGINS" \
    JWT_SECRET="$JWT_SECRET" \
    LOG_LEVEL="info" || echo -e "${YELLOW}⚠️  Avertissement lors de la config${NC}"

  # Récupérer l'URL
  echo -e "${YELLOW}🔍 Récupération de l'URL...${NC}"
  sleep 5  # Attendre que l'env soit prêt

  URL=$(eb status | grep "CNAME:" | awk '{print $2}')

  if [ -n "$URL" ]; then
    echo -e "${GREEN}✅ $SERVICE_DIR déployé avec succès!${NC}"
    echo -e "${GREEN}   URL: http://$URL${NC}"
    echo -e "${GREEN}   Health: http://$URL/health${NC}"
    echo ""

    # Sauvegarder l'URL
    echo "$SERVICE_DIR|$APP_NAME|http://$URL|$PORT" >> "$URLS_FILE"

    # Tester le health check
    echo -e "${YELLOW}🏥 Test du health check...${NC}"
    sleep 10  # Attendre que le service démarre
    if curl -f -s "http://$URL/health" > /dev/null 2>&1; then
      echo -e "${GREEN}✅ Health check OK${NC}"
    else
      echo -e "${RED}⚠️  Health check échoué (le service peut encore démarrer)${NC}"
    fi
  else
    echo -e "${RED}❌ Impossible de récupérer l'URL${NC}"
  fi

  echo ""
  cd "$SERVICES_DIR"
done

# Résumé final
echo -e "${BLUE}=================================================="
echo "🎉 DÉPLOIEMENT TERMINÉ"
echo -e "==================================================${NC}"
echo ""

if [ -f "$URLS_FILE" ] && [ -s "$URLS_FILE" ]; then
  echo -e "${GREEN}📝 URLs des services déployés:${NC}"
  echo ""

  while IFS='|' read -r service app url port; do
    echo -e "${GREEN}  ✅ $service${NC}"
    echo "     App: $app"
    echo "     URL: $url"
    echo "     Port: $port"
    echo "     Health: $url/health"
    echo ""
  done < "$URLS_FILE"

  echo -e "${BLUE}=================================================="
  echo "📋 PROCHAINES ÉTAPES"
  echo -e "==================================================${NC}"
  echo ""
  echo "1. Copier les URLs ci-dessus"
  echo "2. Mettre à jour rt-frontend-apps/amplify.yml avec ces URLs"
  echo "3. Committer et pusher les changements"
  echo "4. AWS Amplify redéploiera automatiquement le frontend"
  echo ""
  echo -e "${YELLOW}💡 Les URLs ont été sauvegardées dans: $URLS_FILE${NC}"
else
  echo -e "${RED}❌ Aucun service déployé avec succès${NC}"
fi

echo ""
echo -e "${GREEN}✨ Script terminé!${NC}"
