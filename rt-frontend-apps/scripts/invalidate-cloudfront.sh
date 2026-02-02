#!/bin/bash

# ============================================================================
# Script d'Invalidation CloudFront Cache (Bash)
# ============================================================================
# Objectif: Forcer l'invalidation du cache CloudFront pour résoudre le problème
#           du bundle JavaScript obsolète (787220852185cf1e.js)
#
# Domaine cible: transporteur.symphonia-controltower.com
# CloudFront: d3fy85w9zy25oo.cloudfront.net
#
# Usage:
#   ./invalidate-cloudfront.sh
#   ./invalidate-cloudfront.sh E1234567890ABC
#   ./invalidate-cloudfront.sh E1234567890ABC --wait
#
# Prérequis:
#   - AWS CLI configuré avec les bonnes credentials
#   - jq installé (pour le parsing JSON)
# ============================================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Fonctions d'affichage
info() { echo -e "${CYAN}$1${NC}"; }
success() { echo -e "${GREEN}$1${NC}"; }
warning() { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}"; }

# Paramètres
DISTRIBUTION_ID="${1:-}"
WAIT_FOR_COMPLETION="${2:-}"

echo ""
info "============================================================================"
info "  Script d'Invalidation CloudFront Cache"
info "============================================================================"
echo ""

# Vérifier AWS CLI
info "[1/6] Vérification de AWS CLI..."
if ! command -v aws &> /dev/null; then
    error "✗ AWS CLI n'est pas installé"
    warning ""
    warning "Installez AWS CLI:"
    warning "  https://aws.amazon.com/cli/"
    echo ""
    exit 1
fi
AWS_VERSION=$(aws --version 2>&1)
success "✓ AWS CLI détecté: $AWS_VERSION"

# Vérifier jq
if ! command -v jq &> /dev/null; then
    warning "⚠ jq n'est pas installé (optionnel mais recommandé)"
    warning "  Installation: sudo apt-get install jq (Ubuntu/Debian)"
    warning "               brew install jq (macOS)"
fi

# Vérifier les credentials
info ""
info "[2/6] Vérification des credentials AWS..."
if ! IDENTITY=$(aws sts get-caller-identity 2>&1); then
    error "✗ Credentials AWS invalides ou non configurées"
    warning ""
    warning "Configurez vos credentials avec:"
    warning "  aws configure"
    echo ""
    exit 1
fi

if command -v jq &> /dev/null; then
    ARN=$(echo "$IDENTITY" | jq -r '.Arn')
    ACCOUNT=$(echo "$IDENTITY" | jq -r '.Account')
    USER_ID=$(echo "$IDENTITY" | jq -r '.UserId')
    success "✓ Connecté en tant que: $ARN"
    info "  Account: $ACCOUNT"
    info "  UserId: $USER_ID"
else
    success "✓ Credentials AWS valides"
fi

# Trouver la distribution CloudFront
if [ -z "$DISTRIBUTION_ID" ]; then
    info ""
    info "[3/6] Recherche de la distribution CloudFront..."
    info "  Recherche du domaine: d3fy85w9zy25oo.cloudfront.net"

    DISTRIBUTIONS=$(aws cloudfront list-distributions --output json 2>&1)

    if command -v jq &> /dev/null; then
        # Utiliser jq si disponible
        COUNT=$(echo "$DISTRIBUTIONS" | jq -r '.DistributionList.Items | length')
        info "  Nombre de distributions trouvées: $COUNT"

        # Rechercher la distribution
        DISTRIBUTION_ID=$(echo "$DISTRIBUTIONS" | jq -r '.DistributionList.Items[] | select(.DomainName == "d3fy85w9zy25oo.cloudfront.net") | .Id')

        if [ -n "$DISTRIBUTION_ID" ]; then
            DIST_STATUS=$(echo "$DISTRIBUTIONS" | jq -r ".DistributionList.Items[] | select(.Id == \"$DISTRIBUTION_ID\") | .Status")
            DIST_ENABLED=$(echo "$DISTRIBUTIONS" | jq -r ".DistributionList.Items[] | select(.Id == \"$DISTRIBUTION_ID\") | .Enabled")

            success ""
            success "✓ Distribution trouvée!"
            info "  ID: $DISTRIBUTION_ID"
            info "  Domain: d3fy85w9zy25oo.cloudfront.net"
            info "  Status: $DIST_STATUS"
            info "  Enabled: $DIST_ENABLED"
        else
            error ""
            error "✗ Distribution pour d3fy85w9zy25oo.cloudfront.net non trouvée"
            warning ""
            warning "Distributions disponibles:"
            echo "$DISTRIBUTIONS" | jq -r '.DistributionList.Items[] | "  - \(.Id): \(.DomainName)"'
            echo ""
            exit 1
        fi
    else
        # Fallback sans jq
        warning "  jq non disponible, recherche manuelle requise"
        warning "  Listez vos distributions avec:"
        warning "    aws cloudfront list-distributions --output json | less"
        echo ""
        exit 1
    fi
else
    info ""
    info "[3/6] Utilisation de la distribution spécifiée: $DISTRIBUTION_ID"
fi

# Créer l'invalidation
info ""
info "[4/6] Création de l'invalidation CloudFront..."

PATHS=(
    "/*"
    "/_next/static/*"
    "/_next/static/chunks/*"
)

info "  Chemins à invalider:"
for PATH_ITEM in "${PATHS[@]}"; do
    info "    - $PATH_ITEM"
done

# Générer un CallerReference unique
CALLER_REFERENCE="invalidation-$(date +%Y%m%d-%H%M%S)"

# Créer le fichier JSON pour l'invalidation
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" <<EOF
{
  "Paths": {
    "Quantity": ${#PATHS[@]},
    "Items": $(printf '%s\n' "${PATHS[@]}" | jq -R . | jq -s .)
  },
  "CallerReference": "$CALLER_REFERENCE"
}
EOF

info ""
info "  Envoi de la requête d'invalidation..."

if INVALIDATION=$(aws cloudfront create-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --invalidation-batch "file://$TEMP_FILE" \
    --output json 2>&1); then

    if command -v jq &> /dev/null; then
        INVALIDATION_ID=$(echo "$INVALIDATION" | jq -r '.Invalidation.Id')
        STATUS=$(echo "$INVALIDATION" | jq -r '.Invalidation.Status')
        CREATE_TIME=$(echo "$INVALIDATION" | jq -r '.Invalidation.CreateTime')

        success ""
        success "✓ Invalidation créée avec succès!"
        info "  Invalidation ID: $INVALIDATION_ID"
        info "  Status: $STATUS"
        info "  Create Time: $CREATE_TIME"
        info "  Paths invalidés: ${#PATHS[@]}"
    else
        success ""
        success "✓ Invalidation créée avec succès!"
        echo "$INVALIDATION"
    fi
else
    error "✗ Erreur lors de la création de l'invalidation"
    error "$INVALIDATION"
    rm -f "$TEMP_FILE"
    exit 1
fi

rm -f "$TEMP_FILE"

# Vérifier le statut
info ""
info "[5/6] Vérification du statut de l'invalidation..."

if STATUS_CHECK=$(aws cloudfront get-invalidation \
    --distribution-id "$DISTRIBUTION_ID" \
    --id "$INVALIDATION_ID" \
    --output json 2>&1); then

    if command -v jq &> /dev/null; then
        CURRENT_STATUS=$(echo "$STATUS_CHECK" | jq -r '.Invalidation.Status')
        info "  Status actuel: $CURRENT_STATUS"

        if [ "$CURRENT_STATUS" = "Completed" ]; then
            success "✓ L'invalidation est déjà complète!"
        else
            warning "⏳ L'invalidation est en cours de traitement..."
            info "  Cela peut prendre 5-15 minutes."
        fi
    fi
else
    warning "⚠ Impossible de vérifier le statut de l'invalidation"
fi

# Attendre la complétion si demandé
if [ "$WAIT_FOR_COMPLETION" = "--wait" ]; then
    info ""
    info "[6/6] Attente de la complétion de l'invalidation..."
    info "  Vérification toutes les 30 secondes..."

    MAX_ATTEMPTS=40  # 20 minutes max
    ATTEMPT=0
    COMPLETED=false

    while [ "$COMPLETED" = false ] && [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        sleep 30
        ATTEMPT=$((ATTEMPT + 1))

        if STATUS_CHECK=$(aws cloudfront get-invalidation \
            --distribution-id "$DISTRIBUTION_ID" \
            --id "$INVALIDATION_ID" \
            --output json 2>&1); then

            if command -v jq &> /dev/null; then
                CURRENT_STATUS=$(echo "$STATUS_CHECK" | jq -r '.Invalidation.Status')
                info "  [$ATTEMPT/$MAX_ATTEMPTS] Status: $CURRENT_STATUS"

                if [ "$CURRENT_STATUS" = "Completed" ]; then
                    COMPLETED=true
                    success ""
                    success "✓ Invalidation complète!"
                    break
                fi
            fi
        else
            warning "  Erreur lors de la vérification du statut (tentative $ATTEMPT)"
        fi
    done

    if [ "$COMPLETED" = false ]; then
        warning ""
        warning "⚠ Timeout atteint. L'invalidation est toujours en cours."
        info "  Vérifiez manuellement le statut avec:"
        info "  aws cloudfront get-invalidation --distribution-id $DISTRIBUTION_ID --id $INVALIDATION_ID"
    fi
else
    info ""
    info "[6/6] Suivi de l'invalidation..."
    info "  Pour suivre le statut en temps réel, exécutez:"
    info "  aws cloudfront get-invalidation --distribution-id $DISTRIBUTION_ID --id $INVALIDATION_ID"
    info ""
    info "  Ou relancez ce script avec l'option --wait:"
    info "  ./invalidate-cloudfront.sh $DISTRIBUTION_ID --wait"
fi

# Résumé final
info ""
info "============================================================================"
success "  Invalidation CloudFront - Terminé"
info "============================================================================"
echo ""

info "Distribution ID: $DISTRIBUTION_ID"
info "Invalidation ID: $INVALIDATION_ID"
info "Status: $CURRENT_STATUS"
info ""
info "Prochaines étapes:"
info "  1. Attendez 5-15 minutes que l'invalidation se propage"
info "  2. Testez le site: https://transporteur.symphonia-controltower.com"
info "  3. Vérifiez que le nouveau bundle JavaScript est chargé"
info "  4. Si nécessaire, videz le cache du navigateur (Ctrl+Shift+R)"

info ""
info "Commandes utiles:"
info "  # Vérifier le statut"
info "  aws cloudfront get-invalidation --distribution-id $DISTRIBUTION_ID --id $INVALIDATION_ID"
info ""
info "  # Lister toutes les invalidations"
info "  aws cloudfront list-invalidations --distribution-id $DISTRIBUTION_ID"
info ""
info "  # Via la console AWS"
info "  https://console.aws.amazon.com/cloudfront/v3/home#/distributions/$DISTRIBUTION_ID"

info ""
info "============================================================================"
echo ""
