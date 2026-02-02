#!/bin/bash

###############################################################################
# Script de Déploiement Automatisé - Symphonia Platform
#
# Ce script déploie tous les services sur AWS Elastic Beanstalk
#
# Usage:
#   ./scripts/deploy-all.sh [OPTIONS]
#
# Options:
#   --env production|staging   Environnement cible (défaut: production)
#   --services service1,service2  Services à déployer (défaut: tous)
#   --skip-tests              Ne pas exécuter les tests avant déploiement
#   --skip-build              Ne pas rebuilder (utiliser les packages existants)
#   --dry-run                 Simuler le déploiement sans l'effectuer
#   --rollback                Rollback vers la version précédente en cas d'échec
#   --help                    Afficher l'aide
#
# Exemples:
#   ./scripts/deploy-all.sh
#   ./scripts/deploy-all.sh --env staging
#   ./scripts/deploy-all.sh --services tms-sync-eb,authz-eb
#   ./scripts/deploy-all.sh --dry-run
#
###############################################################################

set -e  # Exit on error

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
VERSION="2.2.0"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEPLOY_DIR="deploy"
BACKUP_DIR="deploy/backups"
LOG_FILE="deploy/deploy_${TIMESTAMP}.log"

# Paramètres par défaut
ENVIRONMENT="production"
SKIP_TESTS=false
SKIP_BUILD=false
DRY_RUN=false
AUTO_ROLLBACK=false
SELECTED_SERVICES=""

# Services disponibles
ALL_SERVICES=(
  "tms-sync-eb"
  "authz-eb"
  "affret-ia-api-v2"
)

# Mapping service -> environment name EB
declare -A EB_ENVIRONMENTS=(
  ["tms-sync-eb"]="tms-sync-eb-prod"
  ["authz-eb"]="authz-eb-prod"
  ["affret-ia-api-v2"]="affret-ia-api-v2-prod"
)

# Mapping service -> chemin
declare -A SERVICE_PATHS=(
  ["tms-sync-eb"]="services/tms-sync-eb"
  ["authz-eb"]="services/authz-eb"
  ["affret-ia-api-v2"]="services/affret-ia-api-v2"
)

###############################################################################
# Fonctions utilitaires
###############################################################################

log() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
  echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}✗ [ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
  echo -e "${YELLOW}⚠ [WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

section() {
  echo -e "\n${BOLD}${CYAN}=====================================${NC}" | tee -a "$LOG_FILE"
  echo -e "${BOLD}${CYAN}$1${NC}" | tee -a "$LOG_FILE"
  echo -e "${BOLD}${CYAN}=====================================${NC}\n" | tee -a "$LOG_FILE"
}

banner() {
  echo -e "${BOLD}${CYAN}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║    SYMPHONIA PLATFORM - DEPLOIEMENT AUTOMATISE      ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo -e "Version: ${BOLD}${VERSION}${NC}"
  echo -e "Date: ${BOLD}$(date '+%Y-%m-%d %H:%M:%S')${NC}"
  echo -e "Environnement: ${BOLD}${ENVIRONMENT}${NC}"
  echo ""
}

show_help() {
  cat << EOF
Usage: ./scripts/deploy-all.sh [OPTIONS]

Options:
  --env production|staging   Environnement cible (défaut: production)
  --services service1,service2  Services à déployer (défaut: tous)
  --skip-tests              Ne pas exécuter les tests
  --skip-build              Ne pas rebuilder
  --dry-run                 Simuler le déploiement
  --rollback                Rollback automatique en cas d'échec
  --help                    Afficher cette aide

Services disponibles:
  - tms-sync-eb          : TMS Sync Service
  - authz-eb             : Authorization Service
  - affret-ia-api-v2     : Affret.IA API v2

Exemples:
  ./scripts/deploy-all.sh
  ./scripts/deploy-all.sh --env staging
  ./scripts/deploy-all.sh --services tms-sync-eb,authz-eb
  ./scripts/deploy-all.sh --skip-tests --rollback

EOF
  exit 0
}

###############################################################################
# Parse arguments
###############################################################################

while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --services)
      SELECTED_SERVICES="$2"
      shift 2
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --rollback)
      AUTO_ROLLBACK=true
      shift
      ;;
    --help)
      show_help
      ;;
    *)
      error "Option inconnue: $1"
      show_help
      ;;
  esac
done

###############################################################################
# Initialisation
###############################################################################

init() {
  section "Initialisation"

  # Créer les dossiers nécessaires
  mkdir -p "$DEPLOY_DIR"
  mkdir -p "$BACKUP_DIR"
  mkdir -p "$(dirname "$LOG_FILE")"

  log "Vérification des prérequis..."

  # Vérifier Node.js
  if ! command -v node &> /dev/null; then
    error "Node.js n'est pas installé"
    exit 1
  fi
  success "Node.js: $(node --version)"

  # Vérifier npm
  if ! command -v npm &> /dev/null; then
    error "npm n'est pas installé"
    exit 1
  fi
  success "npm: $(npm --version)"

  # Vérifier AWS CLI
  if ! command -v aws &> /dev/null; then
    error "AWS CLI n'est pas installé"
    exit 1
  fi
  success "AWS CLI: $(aws --version | cut -d' ' -f1)"

  # Vérifier EB CLI
  if ! command -v eb &> /dev/null; then
    error "EB CLI n'est pas installé. Installez avec: pip install awsebcli"
    exit 1
  fi
  success "EB CLI: $(eb --version)"

  # Vérifier les credentials AWS
  if ! aws sts get-caller-identity &> /dev/null; then
    error "AWS credentials non configurées. Exécutez: aws configure"
    exit 1
  fi
  success "AWS credentials configurées"

  # Déterminer les services à déployer
  if [ -z "$SELECTED_SERVICES" ]; then
    SERVICES_TO_DEPLOY=("${ALL_SERVICES[@]}")
    log "Tous les services seront déployés"
  else
    IFS=',' read -ra SERVICES_TO_DEPLOY <<< "$SELECTED_SERVICES"
    log "Services sélectionnés: ${SERVICES_TO_DEPLOY[*]}"
  fi

  success "Initialisation terminée"
}

###############################################################################
# Tests
###############################################################################

run_tests() {
  if [ "$SKIP_TESTS" = true ]; then
    warning "Tests ignorés (--skip-tests)"
    return 0
  fi

  section "Exécution des Tests"

  log "Lancement des tests end-to-end..."

  local test_failed=false

  # Test 1: Monitoring
  log "Test: Monitoring TMS Sync..."
  if node tests/test-e2e-monitoring.cjs >> "$LOG_FILE" 2>&1; then
    success "Test Monitoring: PASS"
  else
    error "Test Monitoring: FAIL"
    test_failed=true
  fi

  # Test 2: Cache Redis
  log "Test: Cache Redis..."
  if node tests/test-e2e-cache-redis.cjs >> "$LOG_FILE" 2>&1; then
    success "Test Cache: PASS"
  else
    warning "Test Cache: FAIL (non bloquant)"
  fi

  # Test 3: Dashboards
  log "Test: Dashboards..."
  if node tests/test-e2e-dashboards.cjs >> "$LOG_FILE" 2>&1; then
    success "Test Dashboards: PASS"
  else
    warning "Test Dashboards: FAIL (non bloquant)"
  fi

  if [ "$test_failed" = true ]; then
    error "Tests critiques échoués. Déploiement annulé."
    exit 1
  fi

  success "Tous les tests critiques sont passés"
}

###############################################################################
# Build
###############################################################################

build_service() {
  local service=$1
  local service_path="${SERVICE_PATHS[$service]}"

  section "Build: $service"

  if [ ! -d "$service_path" ]; then
    error "Service introuvable: $service_path"
    return 1
  fi

  cd "$service_path" || return 1

  log "Installation des dépendances..."
  if npm install --production --silent >> "$LOG_FILE" 2>&1; then
    success "Dépendances installées"
  else
    error "Erreur lors de l'installation des dépendances"
    cd - > /dev/null
    return 1
  fi

  log "Création du package de déploiement..."
  local package_name="${service}-v${VERSION}-${TIMESTAMP}.zip"
  local package_path="../../${DEPLOY_DIR}/${package_name}"

  # Exclure les fichiers inutiles
  if zip -r "$package_path" . \
    -x "*.git*" \
    -x "*.env*" \
    -x "node_modules/@types/*" \
    -x "test/*" \
    -x "*.log" \
    -x "*.md" \
    >> "$LOG_FILE" 2>&1; then
    success "Package créé: ${package_name}"
    echo "$package_name" > "../../${DEPLOY_DIR}/${service}_latest.txt"
  else
    error "Erreur lors de la création du package"
    cd - > /dev/null
    return 1
  fi

  cd - > /dev/null
  return 0
}

build_all() {
  if [ "$SKIP_BUILD" = true ]; then
    warning "Build ignoré (--skip-build)"
    return 0
  fi

  section "Build de Tous les Services"

  local build_failed=false

  for service in "${SERVICES_TO_DEPLOY[@]}"; do
    if ! build_service "$service"; then
      error "Build échoué pour: $service"
      build_failed=true
    fi
  done

  if [ "$build_failed" = true ]; then
    error "Certains builds ont échoué. Déploiement annulé."
    exit 1
  fi

  success "Tous les builds sont réussis"
}

###############################################################################
# Backup
###############################################################################

backup_current_version() {
  local service=$1
  local eb_env="${EB_ENVIRONMENTS[$service]}"

  log "Sauvegarde de la version actuelle de $service..."

  # Récupérer la version actuellement déployée
  local current_version=$(eb status "$eb_env" 2>/dev/null | grep "Deployed Version" | awk '{print $3}')

  if [ -n "$current_version" ]; then
    echo "$current_version" > "${BACKUP_DIR}/${service}_previous_version.txt"
    success "Version sauvegardée: $current_version"
  else
    warning "Impossible de récupérer la version actuelle"
  fi
}

###############################################################################
# Deploy
###############################################################################

deploy_service() {
  local service=$1
  local service_path="${SERVICE_PATHS[$service]}"
  local eb_env="${EB_ENVIRONMENTS[$service]}"

  section "Déploiement: $service"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Simulation du déploiement de $service vers $eb_env"
    sleep 2
    success "[DRY RUN] Déploiement simulé avec succès"
    return 0
  fi

  # Backup de la version actuelle
  backup_current_version "$service"

  cd "$service_path" || return 1

  log "Déploiement vers $eb_env..."

  # Vérifier que l'environnement existe
  if ! eb list 2>/dev/null | grep -q "$eb_env"; then
    error "Environnement EB introuvable: $eb_env"
    cd - > /dev/null
    return 1
  fi

  # Déployer
  if eb deploy "$eb_env" >> "$LOG_FILE" 2>&1; then
    success "Déployé sur $eb_env"
  else
    error "Erreur lors du déploiement"
    cd - > /dev/null
    return 1
  fi

  cd - > /dev/null

  # Attendre que le health check passe
  log "Vérification du health check..."
  if wait_for_health "$eb_env"; then
    success "Health check: OK"
  else
    error "Health check: FAIL"
    return 1
  fi

  return 0
}

###############################################################################
# Health Check
###############################################################################

wait_for_health() {
  local eb_env=$1
  local max_attempts=30
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    local health=$(eb health "$eb_env" 2>/dev/null | grep -oP '(?<=Status: )\w+' || echo "Unknown")

    if [ "$health" = "Ok" ] || [ "$health" = "Green" ]; then
      return 0
    fi

    attempt=$((attempt + 1))
    log "Health: $health - Tentative $attempt/$max_attempts"
    sleep 10
  done

  return 1
}

###############################################################################
# Rollback
###############################################################################

rollback_service() {
  local service=$1
  local eb_env="${EB_ENVIRONMENTS[$service]}"
  local previous_version_file="${BACKUP_DIR}/${service}_previous_version.txt"

  section "Rollback: $service"

  if [ ! -f "$previous_version_file" ]; then
    error "Impossible de rollback: version précédente inconnue"
    return 1
  fi

  local previous_version=$(cat "$previous_version_file")
  log "Rollback vers la version: $previous_version"

  cd "${SERVICE_PATHS[$service]}" || return 1

  if eb deploy "$eb_env" --version "$previous_version" >> "$LOG_FILE" 2>&1; then
    success "Rollback réussi vers $previous_version"
    cd - > /dev/null
    return 0
  else
    error "Échec du rollback"
    cd - > /dev/null
    return 1
  fi
}

###############################################################################
# Deploy All
###############################################################################

deploy_all() {
  section "Déploiement de Tous les Services"

  local deploy_failed=false
  local failed_services=()

  for service in "${SERVICES_TO_DEPLOY[@]}"; do
    if ! deploy_service "$service"; then
      error "Déploiement échoué pour: $service"
      deploy_failed=true
      failed_services+=("$service")

      if [ "$AUTO_ROLLBACK" = true ]; then
        warning "Rollback automatique activé..."
        rollback_service "$service"
      fi
    fi
  done

  if [ "$deploy_failed" = true ]; then
    error "Déploiement échoué pour: ${failed_services[*]}"
    return 1
  fi

  success "Tous les services ont été déployés avec succès"
  return 0
}

###############################################################################
# Post-Deployment Tests
###############################################################################

post_deployment_tests() {
  section "Tests Post-Déploiement"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY RUN] Tests post-déploiement ignorés"
    return 0
  fi

  log "Exécution des smoke tests..."

  # Test des health endpoints
  local all_healthy=true

  for service in "${SERVICES_TO_DEPLOY[@]}"; do
    local eb_env="${EB_ENVIRONMENTS[$service]}"

    # Récupérer l'URL de l'environnement
    local url=$(eb status "$eb_env" 2>/dev/null | grep "CNAME" | awk '{print $2}')

    if [ -n "$url" ]; then
      log "Test health de $service ($url)..."

      if curl -f -s "https://${url}/health" > /dev/null 2>&1; then
        success "$service: Health OK"
      else
        error "$service: Health FAIL"
        all_healthy=false
      fi
    else
      warning "Impossible de récupérer l'URL pour $service"
    fi
  done

  if [ "$all_healthy" = true ]; then
    success "Tous les services sont healthy"
  else
    warning "Certains services ne sont pas healthy"
  fi
}

###############################################################################
# Summary
###############################################################################

show_summary() {
  section "Résumé du Déploiement"

  echo -e "${BOLD}Informations:${NC}"
  echo -e "  Version: ${GREEN}${VERSION}${NC}"
  echo -e "  Environnement: ${GREEN}${ENVIRONMENT}${NC}"
  echo -e "  Services déployés: ${GREEN}${#SERVICES_TO_DEPLOY[@]}${NC}"
  echo ""

  echo -e "${BOLD}Services:${NC}"
  for service in "${SERVICES_TO_DEPLOY[@]}"; do
    echo -e "  ${GREEN}✓${NC} $service → ${EB_ENVIRONMENTS[$service]}"
  done
  echo ""

  echo -e "${BOLD}Log:${NC} $LOG_FILE"
  echo ""

  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}${BOLD}MODE DRY RUN - Aucun changement effectué${NC}"
  else
    echo -e "${GREEN}${BOLD}DEPLOIEMENT TERMINE AVEC SUCCES !${NC}"
  fi

  echo ""
}

###############################################################################
# Main
###############################################################################

main() {
  banner

  # Initialisation
  init

  # Tests pré-déploiement
  run_tests

  # Build
  build_all

  # Déploiement
  if deploy_all; then
    # Tests post-déploiement
    post_deployment_tests

    # Résumé
    show_summary

    exit 0
  else
    error "Le déploiement a échoué"
    exit 1
  fi
}

# Exécuter le script
main
