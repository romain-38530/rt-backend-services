#!/bin/bash
# Script pour créer un package déployable Affret.IA v2.4.0 avec chemins Unix

echo "Creating Affret.IA deployment package v2.4.0..."

SOURCE_DIR="/c/Users/rtard/dossier symphonia/rt-backend-services/services/affret-ia-api-v2"
ZIP_FILE="deploy-v2.4.0-unix.zip"

cd "$SOURCE_DIR"

# Supprimer l'ancien ZIP
rm -f "$ZIP_FILE"

# Créer le ZIP avec les bons fichiers (SANS node_modules)
zip -r "$ZIP_FILE" \
  index.js \
  package.json \
  Procfile \
  controllers/ \
  routes/ \
  services/ \
  models/ \
  -x "*.git*" "node_modules/*" ".env*" "*.log"

echo "Package created: $ZIP_FILE"
ls -lh "$ZIP_FILE"
unzip -l "$ZIP_FILE" | head -20
