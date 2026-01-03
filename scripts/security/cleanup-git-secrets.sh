#!/bin/bash
# ============================================================================
# Git Secrets Cleanup Script
# SYMPHONI.A - RT Technologie
#
# Ce script nettoie les secrets exposés de l'historique Git.
# ATTENTION: Cette opération est irréversible et nécessite un force push.
#
# Prérequis:
# - BFG Repo-Cleaner (https://rtyley.github.io/bfg-repo-cleaner/)
# - Backup complet du repository
#
# Usage: ./cleanup-git-secrets.sh
# ============================================================================

set -e

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════════╗"
echo "║              NETTOYAGE DES SECRETS DE L'HISTORIQUE GIT                       ║"
echo "║                    SYMPHONI.A - RT Technologie                               ║"
echo "╚══════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Vérifier si on est dans un repo Git
if [ ! -d ".git" ]; then
    echo -e "${RED}ERREUR: Ce script doit être exécuté à la racine du repository Git${NC}"
    exit 1
fi

# Avertissement
echo -e "${YELLOW}⚠️  ATTENTION: Cette opération est IRRÉVERSIBLE !${NC}"
echo ""
echo "Ce script va:"
echo "  1. Créer un backup du repository"
echo "  2. Supprimer les secrets de TOUT l'historique Git"
echo "  3. Nécessiter un force push vers le remote"
echo "  4. Invalider tous les clones existants"
echo ""
echo "Tous les développeurs devront re-cloner le repository après cette opération."
echo ""
read -p "Voulez-vous continuer? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Opération annulée."
    exit 0
fi

# Créer le fichier de secrets à supprimer
echo ""
echo "Création de la liste des secrets à supprimer..."
echo ""

SECRETS_FILE=$(mktemp)
cat > "$SECRETS_FILE" << 'EOF'
# MongoDB passwords
RtAdmin2024
RtAdmin2025
rt_admin

# JWT secrets par défaut
your-secret-key-change-in-production
your-refresh-secret-change-in-production
dev-secret-jwt-key-change-in-production
votre-secret-jwt-a-changer-en-production

# OVH credentials (format: clé=valeur sera aussi détecté)
7467b1935c28b05e
5dd42ebb267e3e2b97bbaa57fc8329e5
67ee183f23f404a43d4fc8504f8648b6

# SMTP passwords
Demo2025Secure
Demo2024Secure

# TomTom API Key
Wq6Dz2OTIP7NOsEPYgQDnYLRTurEkkiu

# Patterns génériques (commentés - décommenter si nécessaire)
# password=
# secret=
# apikey=
# api_key=
EOF

echo "Secrets à supprimer:"
cat "$SECRETS_FILE"
echo ""

# Vérifier si BFG est installé
if ! command -v bfg &> /dev/null; then
    echo -e "${YELLOW}BFG Repo-Cleaner n'est pas installé.${NC}"
    echo ""
    echo "Installation:"
    echo "  macOS:   brew install bfg"
    echo "  Linux:   Télécharger depuis https://rtyley.github.io/bfg-repo-cleaner/"
    echo "  Windows: Télécharger le .jar et utiliser: java -jar bfg.jar"
    echo ""
    echo "Alternative avec git filter-branch (plus lent):"
    echo ""

    # Générer les commandes git filter-branch
    echo "# Exécuter ces commandes manuellement:"
    while IFS= read -r secret; do
        # Ignorer les lignes vides et les commentaires
        [[ -z "$secret" || "$secret" =~ ^# ]] && continue
        echo "git filter-branch --force --tree-filter \\"
        echo "  \"find . -type f -exec sed -i 's/$secret/REDACTED/g' {} +\" \\"
        echo "  --prune-empty --tag-name-filter cat -- --all"
        echo ""
    done < "$SECRETS_FILE"

    rm "$SECRETS_FILE"
    exit 1
fi

# Créer un backup
echo ""
echo "Création d'un backup..."
BACKUP_DIR="../rt-backend-services-backup-$(date +%Y%m%d-%H%M%S)"
cp -r . "$BACKUP_DIR"
echo -e "${GREEN}Backup créé: $BACKUP_DIR${NC}"

# Exécuter BFG
echo ""
echo "Exécution de BFG Repo-Cleaner..."
echo ""

bfg --replace-text "$SECRETS_FILE" --no-blob-protection

# Nettoyer
echo ""
echo "Nettoyage des références..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Nettoyer le fichier temporaire
rm "$SECRETS_FILE"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                         NETTOYAGE TERMINÉ                                     ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "PROCHAINES ÉTAPES:"
echo ""
echo "1. Vérifiez que les secrets ont été supprimés:"
echo "   git log -p | grep -i 'password\\|secret\\|apikey' | head -50"
echo ""
echo "2. Force push vers le remote (ATTENTION: irréversible):"
echo "   git push --force --all"
echo "   git push --force --tags"
echo ""
echo "3. Notifiez TOUS les développeurs de:"
echo "   - Supprimer leur clone local"
echo "   - Re-cloner le repository"
echo "   - NE PAS faire de push depuis un ancien clone"
echo ""
echo "4. Régénérez TOUS les secrets avec:"
echo "   node scripts/security/generate-secrets.js"
echo ""
echo "5. Mettez à jour les secrets dans AWS Secrets Manager"
echo ""
echo -e "${YELLOW}⚠️  Les anciens clones sont maintenant INVALIDES${NC}"
echo ""
