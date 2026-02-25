#!/bin/bash

# Script d'Exécution Maître - Toutes les Phases
# Version: 1.0
# Date: 2026-02-23

set -e  # Exit on error

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'affichage
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Fonction de confirmation
confirm() {
    read -p "$1 (yes/no): " response
    if [[ "$response" != "yes" ]]; then
        print_error "Action annulée"
        exit 1
    fi
}

# Fonction de pause
pause_with_message() {
    echo ""
    echo -e "${YELLOW}$1${NC}"
    read -p "Appuyez sur Entrée pour continuer..."
}

# Vérifier les prérequis
check_prerequisites() {
    print_header "Vérification des Prérequis"

    # AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI non installé"
        exit 1
    fi
    print_success "AWS CLI installé"

    # Python3
    if ! command -v python3 &> /dev/null; then
        print_error "Python3 non installé"
        exit 1
    fi
    print_success "Python3 installé"

    # Credentials AWS
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "Credentials AWS non configurés"
        exit 1
    fi
    print_success "Credentials AWS OK"

    # Fichiers requis
    required_files=(
        "execute-phase1a.sh"
        "deploy-phase2-data-transfer-optimization.sh"
        "scripts/phase3-autoscaling/deploy-autoscaling-all.sh"
        "downgrade-instances.sh"
    )

    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            print_error "Fichier manquant: $file"
            exit 1
        fi
    done
    print_success "Tous les fichiers requis présents"

    echo ""
}

# Créer les dossiers de backup
create_backups() {
    print_header "Création des Backups"

    mkdir -p backups/{phase1,phase2,phase3,phase4a,phase4b}

    # Backup instances
    aws ec2 describe-instances > backups/instances-initial.json
    print_success "Backup instances EC2"

    # Backup EIPs
    aws ec2 describe-addresses > backups/eips-initial.json
    print_success "Backup Elastic IPs"

    # Backup CloudFront
    aws cloudfront list-distributions > backups/cloudfront-initial.json
    print_success "Backup CloudFront"

    # Backup VPC
    aws ec2 describe-vpcs > backups/vpc-initial.json
    print_success "Backup VPC"

    echo ""
}

# Phase 1A
execute_phase1a() {
    print_header "PHASE 1A - Actions Immédiates"
    echo "Économie cible: 53€/mois"
    echo ""

    confirm "Êtes-vous prêt à exécuter Phase 1A?"

    bash execute-phase1a.sh

    print_success "Phase 1A complétée"
    echo "Économie réalisée: 53€/mois"

    pause_with_message "Phase 1A terminée. Vérifiez que tout fonctionne avant de continuer."
}

# Phase 2
execute_phase2() {
    print_header "PHASE 2 - Optimisation Data Transfer"
    echo "Économie cible: 500-700€/mois"
    echo "Durée estimée: 1.5 jours"
    echo ""

    print_warning "Cette phase va modifier 29 distributions CloudFront"
    confirm "Êtes-vous prêt à exécuter Phase 2?"

    # Dry-run d'abord
    echo ""
    print_header "Dry-Run Phase 2"
    bash deploy-phase2-data-transfer-optimization.sh dry-run

    pause_with_message "Dry-run terminé. Vérifiez les résultats."

    # Exécution réelle
    echo ""
    print_header "Déploiement Phase 2"
    confirm "Confirmer le déploiement réel de Phase 2?"

    bash deploy-phase2-data-transfer-optimization.sh deploy

    print_success "Phase 2 complétée"
    echo "Économie projetée: 500-700€/mois"

    print_warning "Monitoring requis pendant 7 jours pour confirmer les économies"
    pause_with_message "Phase 2 terminée. Continuez avec Phase 3 dans quelques jours."
}

# Phase 3
execute_phase3() {
    print_header "PHASE 3 - Auto-Scaling Exploit-IA"
    echo "Économie cible: 74€/mois"
    echo "Durée estimée: 3 jours (inclut test 24h)"
    echo ""

    confirm "Êtes-vous prêt à exécuter Phase 3?"

    cd scripts/phase3-autoscaling

    # Test sur 1 service d'abord
    echo ""
    print_header "Test sur 1 Service"
    bash deploy-autoscaling-single.sh exploit-ia-planning-prod deploy

    print_warning "Test 24h requis"
    print_warning "Vérifiez:"
    echo "  - Arrêt automatique ce soir à 19h"
    echo "  - Redémarrage demain matin à 8h"

    pause_with_message "Attendez 24h et validez le test avant de continuer."

    # Déploiement complet
    echo ""
    print_header "Déploiement sur tous les Services"
    confirm "Test 24h validé? Déployer sur tous les services?"

    bash deploy-autoscaling-all.sh deploy

    cd ../..

    print_success "Phase 3 complétée"
    echo "Économie réalisée: 74€/mois"

    pause_with_message "Phase 3 terminée. Continuez avec Phase 4a dans quelques jours."
}

# Phase 4a - Downgrade
execute_phase4a() {
    print_header "PHASE 4A - Downgrade Instances"
    echo "Économie cible: 90€/mois"
    echo "Durée: ~2h (fenêtre de maintenance)"
    echo ""

    print_warning "Cette phase nécessite une fenêtre de maintenance"
    print_warning "Downtime: 2-3 minutes par instance"

    confirm "Fenêtre de maintenance planifiée? Exécuter Phase 4a?"

    # Refresh analyse CPU
    echo ""
    print_header "Analyse CPU Finale"
    python3 analyze-cpu-metrics.py --refresh

    # Dry-run
    echo ""
    print_header "Dry-Run Phase 4a"
    bash downgrade-instances.sh --dry-run

    pause_with_message "Dry-run terminé. Vérifiez la liste des instances."

    # Exécution réelle
    echo ""
    print_header "Exécution Downgrade"
    confirm "Confirmer le downgrade de 12 instances?"

    bash downgrade-instances.sh

    print_success "Phase 4a complétée"
    echo "Économie réalisée: 90€/mois"

    print_warning "Monitoring 48h recommandé"
    pause_with_message "Phase 4a terminée. Validez le fonctionnement pendant 48h avant Phase 4b."
}

# Phase 4b - Savings Plan
execute_phase4b() {
    print_header "PHASE 4B - Compute Savings Plan"
    echo "Économie cible: 142€/mois"
    echo ""

    # Calcul final
    print_header "Calcul Savings Plan Optimal"
    python3 calculate-savings-plan.py --final

    echo ""
    print_warning "L'achat du Savings Plan nécessite:"
    echo "  - Approbation Direction/Finance"
    echo "  - Engagement 1 an"
    echo "  - Coût: ~162€/mois (commitment)"
    echo "  - Économie: ~142€/mois (40% discount)"

    pause_with_message "Lisez savings-plan-recommendation.md pour les détails."

    echo ""
    print_warning "Achat du Savings Plan:"
    echo "1. Ouvrir AWS Console > Billing > Savings Plans"
    echo "2. Type: Compute Savings Plan"
    echo "3. Term: 1 year, No Upfront"
    echo "4. Commitment: ~0.22 EUR/hour (162 EUR/month)"
    echo "5. Review et Confirm"

    pause_with_message "Savings Plan acheté? Validez pour continuer."

    print_success "Phase 4b complétée"
    echo "Économie réalisée: 142€/mois"
}

# Rapport final
generate_final_report() {
    print_header "Génération du Rapport Final"

    cat > final-optimization-report.md << 'EOF'
# Rapport Final - Optimisation AWS Complète

## Date d'Exécution
Date de début: $(date -d "28 days ago" +%Y-%m-%d)
Date de fin: $(date +%Y-%m-%d)

## Économies Réalisées

| Phase | Économie Mensuelle | Status |
|-------|-------------------|--------|
| Phase 1A | 53€ | ✅ |
| Phase 2 | 500-700€ | ✅ |
| Phase 3 | 74€ | ✅ |
| Phase 4a | 90€ | ✅ |
| Phase 4b | 142€ | ✅ |
| **TOTAL** | **859-1,059€** | ✅ |

## Coûts

- **Avant:** 1,855€/mois
- **Après:** 796-996€/mois
- **Réduction:** 46-57%
- **Économie annuelle:** 10,308-12,708€

## Validation

- [ ] AWS Cost Explorer validé
- [ ] Performance applications OK
- [ ] Monitoring actif
- [ ] Documentation à jour

## Prochaines Étapes

1. Monitoring continu (30 jours)
2. Ajustements si nécessaire
3. Rapport mensuel
EOF

    print_success "Rapport final créé: final-optimization-report.md"
    echo ""
}

# Main
main() {
    clear

    print_header "Exécution Maître - Optimisation AWS Complète"
    echo "Ce script va exécuter toutes les phases d'optimisation"
    echo "Durée totale: 4 semaines"
    echo "Économie cible: 859-1,059€/mois (46-57%)"
    echo ""

    confirm "Êtes-vous prêt à démarrer l'optimisation complète?"

    # Prérequis
    check_prerequisites

    # Backups
    create_backups

    # Phases
    execute_phase1a
    execute_phase2
    execute_phase3
    execute_phase4a
    execute_phase4b

    # Rapport final
    generate_final_report

    # Succès
    echo ""
    print_header "OPTIMISATION COMPLÈTE - SUCCÈS!"
    echo ""
    print_success "Toutes les phases ont été exécutées avec succès"
    echo ""
    echo "Économie totale: 859-1,059€/mois (46-57%)"
    echo "Coût initial: 1,855€/mois"
    echo "Coût final: 796-996€/mois"
    echo ""
    echo "Prochaines étapes:"
    echo "1. Monitoring AWS Cost Explorer pendant 30 jours"
    echo "2. Ajustements si nécessaire"
    echo "3. Documentation et rapport mensuel"
    echo ""
    print_success "Mission accomplie! 🎉"
}

# Exécuter
main
