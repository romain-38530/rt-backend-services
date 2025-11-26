#!/bin/bash
# ============================================================================
# RT SYMPHONI.A - Script d'Automatisation AWS Textract IAM User
# ============================================================================
# Version: 1.0.0
# Date: 2025-11-26
# Description: Crée automatiquement un IAM User pour AWS Textract
#              avec les permissions minimales requises
# ============================================================================

set -e  # Exit on error

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
IAM_USER_NAME="rt-symphonia-textract-user"
POLICY_NAME="RTSymphoniaTextractPolicy"
POLICY_FILE="/tmp/textract-policy.json"

# ============================================================================
# Fonctions Utilitaires
# ============================================================================

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

log_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

separator() {
    echo -e "${BLUE}────────────────────────────────────────────────────${NC}"
}

# ============================================================================
# Vérifications Préalables
# ============================================================================

check_prerequisites() {
    log_header "Vérification des Prérequis"

    # Vérifier AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI n'est pas installé"
        log_info "Installation: https://aws.amazon.com/cli/"
        exit 1
    fi
    log_success "AWS CLI installé"

    # Vérifier la configuration AWS
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS CLI n'est pas configuré ou credentials invalides"
        log_info "Exécutez: aws configure"
        exit 1
    fi
    log_success "AWS CLI configuré"

    # Afficher les informations du compte
    CALLER_IDENTITY=$(aws sts get-caller-identity)
    ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | grep -oP '"Account":\s*"\K[^"]+')
    USER_ARN=$(echo "$CALLER_IDENTITY" | grep -oP '"Arn":\s*"\K[^"]+')

    log_info "Compte AWS: $ACCOUNT_ID"
    log_info "User ARN: $USER_ARN"

    # Vérifier les permissions (doit être admin ou avoir IAM permissions)
    if ! aws iam list-users --max-items 1 &> /dev/null; then
        log_error "Permissions IAM insuffisantes"
        log_info "Vous devez avoir des permissions admin ou IAM complètes"
        exit 1
    fi
    log_success "Permissions IAM suffisantes"

    separator
}

# ============================================================================
# Création de la Politique IAM
# ============================================================================

create_iam_policy() {
    log_header "Création de la Politique IAM"

    # Créer le fichier de politique
    cat > "$POLICY_FILE" << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TextractBasicPermissions",
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText",
        "textract:AnalyzeDocument"
      ],
      "Resource": "*"
    },
    {
      "Sid": "TextractAsyncPermissions",
      "Effect": "Allow",
      "Action": [
        "textract:StartDocumentTextDetection",
        "textract:StartDocumentAnalysis",
        "textract:GetDocumentTextDetection",
        "textract:GetDocumentAnalysis"
      ],
      "Resource": "*"
    },
    {
      "Sid": "S3BucketPermissions",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::rt-ecmr-documents/*"
    }
  ]
}
EOF

    log_info "Fichier de politique créé: $POLICY_FILE"

    # Vérifier si la politique existe déjà
    POLICY_ARN=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='$POLICY_NAME'].Arn" --output text)

    if [ -n "$POLICY_ARN" ]; then
        log_warning "La politique '$POLICY_NAME' existe déjà"
        log_info "ARN: $POLICY_ARN"

        read -p "Voulez-vous créer une nouvelle version ? (o/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[OoYy]$ ]]; then
            # Créer une nouvelle version de la politique
            POLICY_VERSION=$(aws iam create-policy-version \
                --policy-arn "$POLICY_ARN" \
                --policy-document file://"$POLICY_FILE" \
                --set-as-default \
                --query 'PolicyVersion.VersionId' \
                --output text)

            log_success "Nouvelle version créée: $POLICY_VERSION"
        else
            log_info "Utilisation de la politique existante"
        fi
    else
        # Créer la politique
        POLICY_ARN=$(aws iam create-policy \
            --policy-name "$POLICY_NAME" \
            --description "Permissions Textract pour RT SYMPHONI.A" \
            --policy-document file://"$POLICY_FILE" \
            --query 'Policy.Arn' \
            --output text)

        log_success "Politique IAM créée: $POLICY_NAME"
        log_info "ARN: $POLICY_ARN"
    fi

    # Nettoyer le fichier temporaire
    rm -f "$POLICY_FILE"

    separator
}

# ============================================================================
# Création de l'Utilisateur IAM
# ============================================================================

create_iam_user() {
    log_header "Création de l'Utilisateur IAM"

    # Vérifier si l'utilisateur existe déjà
    if aws iam get-user --user-name "$IAM_USER_NAME" &> /dev/null; then
        log_warning "L'utilisateur '$IAM_USER_NAME' existe déjà"

        read -p "Voulez-vous le supprimer et le recréer ? (o/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[OoYy]$ ]]; then
            log_info "Suppression de l'utilisateur existant..."

            # Détacher toutes les politiques
            ATTACHED_POLICIES=$(aws iam list-attached-user-policies \
                --user-name "$IAM_USER_NAME" \
                --query 'AttachedPolicies[].PolicyArn' \
                --output text)

            for policy_arn in $ATTACHED_POLICIES; do
                aws iam detach-user-policy \
                    --user-name "$IAM_USER_NAME" \
                    --policy-arn "$policy_arn"
                log_info "Politique détachée: $policy_arn"
            done

            # Supprimer toutes les Access Keys
            ACCESS_KEYS=$(aws iam list-access-keys \
                --user-name "$IAM_USER_NAME" \
                --query 'AccessKeyMetadata[].AccessKeyId' \
                --output text)

            for key_id in $ACCESS_KEYS; do
                aws iam delete-access-key \
                    --user-name "$IAM_USER_NAME" \
                    --access-key-id "$key_id"
                log_info "Access Key supprimée: $key_id"
            done

            # Supprimer l'utilisateur
            aws iam delete-user --user-name "$IAM_USER_NAME"
            log_success "Utilisateur supprimé"
        else
            log_info "Utilisation de l'utilisateur existant"
            separator
            return
        fi
    fi

    # Créer l'utilisateur
    USER_ARN=$(aws iam create-user \
        --user-name "$IAM_USER_NAME" \
        --tags Key=Project,Value=RT-SYMPHONIA Key=Service,Value=Textract-OCR \
        --query 'User.Arn' \
        --output text)

    log_success "Utilisateur IAM créé: $IAM_USER_NAME"
    log_info "ARN: $USER_ARN"

    separator
}

# ============================================================================
# Attachement de la Politique à l'Utilisateur
# ============================================================================

attach_policy_to_user() {
    log_header "Attachement de la Politique"

    aws iam attach-user-policy \
        --user-name "$IAM_USER_NAME" \
        --policy-arn "$POLICY_ARN"

    log_success "Politique attachée à l'utilisateur"

    # Vérification
    ATTACHED=$(aws iam list-attached-user-policies \
        --user-name "$IAM_USER_NAME" \
        --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyName" \
        --output text)

    if [ -n "$ATTACHED" ]; then
        log_success "Vérification OK: $ATTACHED"
    else
        log_error "Échec de l'attachement de la politique"
        exit 1
    fi

    separator
}

# ============================================================================
# Création des Access Keys
# ============================================================================

create_access_keys() {
    log_header "Création des Access Keys"

    # Créer les Access Keys
    ACCESS_KEY_INFO=$(aws iam create-access-key \
        --user-name "$IAM_USER_NAME" \
        --output json)

    ACCESS_KEY_ID=$(echo "$ACCESS_KEY_INFO" | grep -oP '"AccessKeyId":\s*"\K[^"]+')
    SECRET_ACCESS_KEY=$(echo "$ACCESS_KEY_INFO" | grep -oP '"SecretAccessKey":\s*"\K[^"]+')

    log_success "Access Keys créées"

    separator
}

# ============================================================================
# Affichage des Résultats
# ============================================================================

display_results() {
    log_header "Configuration Terminée avec Succès !"

    echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  AWS Textract IAM User - Credentials                        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"

    echo -e "${YELLOW}IAM User Name:${NC}"
    echo -e "  ${IAM_USER_NAME}\n"

    echo -e "${YELLOW}Access Key ID:${NC}"
    echo -e "  ${GREEN}${ACCESS_KEY_ID}${NC}\n"

    echo -e "${YELLOW}Secret Access Key:${NC}"
    echo -e "  ${GREEN}${SECRET_ACCESS_KEY}${NC}\n"

    echo -e "${YELLOW}AWS Region (recommandé):${NC}"
    echo -e "  ${GREEN}eu-central-1${NC} (Frankfurt - RGPD compliant)\n"

    echo -e "${RED}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  IMPORTANT - Sécurité                                        ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════╝${NC}\n"

    echo -e "${RED}⚠️  COPIEZ CES CREDENTIALS MAINTENANT !${NC}"
    echo -e "${RED}⚠️  Vous ne pourrez PLUS JAMAIS voir le Secret Access Key${NC}\n"

    echo -e "${YELLOW}À faire maintenant:${NC}"
    echo -e "  1. Copiez les credentials dans un endroit sûr"
    echo -e "  2. Ajoutez-les à votre .env.external-services"
    echo -e "  3. Ne les partagez JAMAIS publiquement"
    echo -e "  4. Activez la rotation tous les 90 jours\n"

    separator
}

# ============================================================================
# Génération du Fichier .env
# ============================================================================

generate_env_snippet() {
    log_header "Génération du Snippet .env"

    ENV_SNIPPET=$(cat <<EOF

# ============================================================================
# AWS Textract Configuration (Auto-généré le $(date))
# ============================================================================

AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY}
AWS_REGION=eu-central-1

OCR_PROVIDER=AWS_TEXTRACT
OCR_ENABLE_FALLBACK=true
OCR_TIMEOUT_MS=10000
OCR_MIN_CONFIDENCE=90

# ============================================================================
EOF
)

    echo "$ENV_SNIPPET" > /tmp/aws-textract-env.txt

    log_success "Snippet .env généré: /tmp/aws-textract-env.txt"
    log_info "Copiez ce contenu dans votre fichier .env.external-services"

    echo -e "\n${CYAN}Contenu à ajouter:${NC}"
    echo "$ENV_SNIPPET"

    separator
}

# ============================================================================
# Instructions de Test
# ============================================================================

display_test_instructions() {
    log_header "Prochaines Étapes"

    echo -e "${YELLOW}1. Configurer l'application:${NC}"
    echo -e "   cd services/subscriptions-contracts-eb"
    echo -e "   nano .env.external-services"
    echo -e "   # Collez les credentials ci-dessus\n"

    echo -e "${YELLOW}2. Tester la configuration:${NC}"
    echo -e "   node scripts/test-textract-ocr.js\n"

    echo -e "${YELLOW}3. Tester tous les services:${NC}"
    echo -e "   node scripts/validate-all-external-services.js\n"

    echo -e "${YELLOW}4. Déployer sur AWS EB:${NC}"
    echo -e "   eb setenv AWS_ACCESS_KEY_ID=${ACCESS_KEY_ID} \\"
    echo -e "            AWS_SECRET_ACCESS_KEY=${SECRET_ACCESS_KEY} \\"
    echo -e "            AWS_REGION=eu-central-1\n"

    echo -e "${YELLOW}5. Planifier la rotation des clés (90 jours):${NC}"
    echo -e "   node scripts/rotate-api-keys.js\n"

    separator
}

# ============================================================================
# Sauvegarde des Informations
# ============================================================================

save_to_file() {
    log_header "Sauvegarde des Informations"

    OUTPUT_FILE="aws-textract-credentials-$(date +%Y%m%d-%H%M%S).txt"

    cat > "$OUTPUT_FILE" << EOF
========================================================================
RT SYMPHONI.A - AWS Textract IAM User Credentials
========================================================================
Date de création: $(date)
Créé par: $(whoami)
Compte AWS: $ACCOUNT_ID
========================================================================

IAM User Name:
  ${IAM_USER_NAME}

Access Key ID:
  ${ACCESS_KEY_ID}

Secret Access Key:
  ${SECRET_ACCESS_KEY}

AWS Region (recommandé):
  eu-central-1

Policy ARN:
  ${POLICY_ARN}

User ARN:
  ${USER_ARN}

========================================================================
SÉCURITÉ
========================================================================

⚠️  Ce fichier contient des informations sensibles !

À faire:
  1. Conservez ce fichier en lieu sûr
  2. Chiffrez-le si nécessaire
  3. Supprimez-le après avoir copié les credentials
  4. Ne le committez JAMAIS dans Git
  5. Ne le partagez JAMAIS par email/Slack

Rotation des clés:
  - Tous les 90 jours minimum
  - Utilisez: node scripts/rotate-api-keys.js

Révocation:
  aws iam delete-access-key --user-name ${IAM_USER_NAME} --access-key-id ${ACCESS_KEY_ID}

========================================================================
EOF

    log_success "Informations sauvegardées: $OUTPUT_FILE"
    log_warning "Supprimez ce fichier après utilisation !"

    separator
}

# ============================================================================
# Fonction Principale
# ============================================================================

main() {
    echo -e "\n${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  RT SYMPHONI.A - Automatisation AWS Textract IAM User       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"

    log_info "Ce script va créer automatiquement:"
    log_info "  - Un IAM User dédié pour Textract"
    log_info "  - Une politique IAM avec permissions minimales"
    log_info "  - Des Access Keys pour l'authentification"

    echo
    read -p "Continuer ? (o/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[OoYy]$ ]]; then
        log_warning "Annulé par l'utilisateur"
        exit 0
    fi

    # Exécution des étapes
    check_prerequisites
    create_iam_policy
    create_iam_user
    attach_policy_to_user
    create_access_keys
    display_results
    generate_env_snippet
    save_to_file
    display_test_instructions

    echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Configuration Terminée avec Succès !                       ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"

    log_success "AWS Textract IAM User créé et configuré"
    log_info "Consultez: $OUTPUT_FILE"
}

# ============================================================================
# Point d'Entrée
# ============================================================================

main "$@"
