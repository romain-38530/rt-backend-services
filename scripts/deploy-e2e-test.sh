#!/bin/bash

# Script de déploiement et vérification du test E2E
# Usage: ./deploy-e2e-test.sh [environment]
# Environments: dev, staging, prod (default: prod)

set -e

ENV=${1:-prod}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "  DÉPLOIEMENT TEST E2E SYMPHONI.A"
echo "  Environment: $ENV"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonction de log
log_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Vérification de l'environnement Node.js
log_info "Vérification Node.js..."
if ! command -v node &> /dev/null; then
    log_error "Node.js n'est pas installé"
    exit 1
fi

NODE_VERSION=$(node -v)
log_success "Node.js installé: $NODE_VERSION"

# Vérification des dépendances
log_info "Vérification des dépendances npm..."
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    log_warning "node_modules manquant, installation..."
    npm install axios @faker-js/faker form-data
    log_success "Dépendances installées"
else
    log_success "Dépendances présentes"
fi

# Vérification des fichiers requis
log_info "Vérification des fichiers..."

FILES=(
    "test-e2e-grandeur-nature.cjs"
    "classes/AgentIndustriel.js"
    "classes/AgentTransporteur.js"
    "classes/AgentDestinataire.js"
    "utils/test-helpers.js"
    "utils/data-generators.js"
)

MISSING_FILES=0
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Fichier présent: $file"
    else
        log_error "Fichier manquant: $file"
        MISSING_FILES=$((MISSING_FILES + 1))
    fi
done

if [ $MISSING_FILES -gt 0 ]; then
    log_error "$MISSING_FILES fichier(s) manquant(s)"
    exit 1
fi

# Création du répertoire reports
log_info "Vérification répertoire reports..."
if [ ! -d "reports" ]; then
    mkdir -p reports
    log_success "Répertoire reports créé"
else
    log_success "Répertoire reports existant"
fi

# Vérification de la connectivité aux services
log_info "Vérification connectivité services AWS..."

SERVICES=(
    "rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com"
    "rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com"
    "rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com"
)

UNREACHABLE=0
for service in "${SERVICES[@]}"; do
    if timeout 5 bash -c "cat < /dev/null > /dev/tcp/${service}/80" 2>/dev/null; then
        log_success "Service accessible: $service"
    else
        log_warning "Service non accessible: $service (test continuera avec simulation)"
        UNREACHABLE=$((UNREACHABLE + 1))
    fi
done

if [ $UNREACHABLE -eq ${#SERVICES[@]} ]; then
    log_warning "Aucun service accessible - test en mode simulation complète"
fi

# Test de syntaxe JavaScript
log_info "Vérification syntaxe JavaScript..."
if node -c test-e2e-grandeur-nature.cjs 2>/dev/null; then
    log_success "Syntaxe JavaScript valide"
else
    log_error "Erreur de syntaxe dans test-e2e-grandeur-nature.cjs"
    exit 1
fi

# Résumé
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  RÉSUMÉ DE VÉRIFICATION"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  Node.js: $NODE_VERSION"
echo "  Fichiers: ${#FILES[@]}/${#FILES[@]} ✅"
echo "  Services accessibles: $((${#SERVICES[@]} - UNREACHABLE))/${#SERVICES[@]}"
echo "  Répertoire reports: ✅"
echo ""

# Option pour lancer le test
read -p "Lancer le test E2E maintenant? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Lancement du test E2E..."
    echo ""
    node test-e2e-grandeur-nature.cjs

    EXIT_CODE=$?
    echo ""
    if [ $EXIT_CODE -eq 0 ]; then
        log_success "Test E2E terminé avec succès!"

        # Afficher le dernier rapport
        LATEST_REPORT=$(ls -t reports/e2e-report-*.json 2>/dev/null | head -n1)
        if [ -n "$LATEST_REPORT" ]; then
            log_info "Rapport généré: $LATEST_REPORT"

            # Extraire statistiques du rapport
            if command -v jq &> /dev/null; then
                echo ""
                log_info "Statistiques du test:"
                jq -r '.phases[] | "  - \(.name): \(if .success then "✅ PASS" else "❌ FAIL" end) (\(.duration/1000)s)"' "$LATEST_REPORT"
                echo ""
                SUCCESS_RATE=$(jq -r '.stats.successRate' "$LATEST_REPORT" 2>/dev/null || echo "N/A")
                log_success "Taux de succès: $SUCCESS_RATE"
            fi
        fi
    else
        log_error "Test E2E échoué (code: $EXIT_CODE)"
        exit $EXIT_CODE
    fi
else
    log_info "Test non lancé. Pour lancer manuellement:"
    echo "  cd $SCRIPT_DIR"
    echo "  node test-e2e-grandeur-nature.cjs"
fi

echo ""
log_success "Déploiement terminé!"
