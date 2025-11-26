#!/bin/bash

VERSION="v2.4.0-vat-duplicate-detection"
ZIP_NAME="authz-eb-${VERSION}.zip"

echo "📦 Création du package de déploiement: $ZIP_NAME"

# Créer un dossier temporaire
rm -rf deploy-temp
mkdir -p deploy-temp

# Copier les fichiers nécessaires
echo "📋 Copie des fichiers..."
cp index.js deploy-temp/
cp package.json deploy-temp/
cp -r scripts deploy-temp/
cp -r node_modules deploy-temp/ 2>/dev/null || echo "⚠️  node_modules non copié (normal)"
cp .npmrc.bak deploy-temp/.npmrc 2>/dev/null || true

# Créer le zip
echo "🗜️  Création du fichier zip..."
cd deploy-temp
zip -r "../${ZIP_NAME}" . -x "*.git*" "*.zip" "*.log" "test-*.ps1" "bundle-logs.zip" > /dev/null
cd ..

# Nettoyer
rm -rf deploy-temp

# Afficher la taille du fichier
SIZE=$(ls -lh "$ZIP_NAME" | awk '{print $5}')
echo "✅ Package créé: $ZIP_NAME ($SIZE)"

# Déployer sur Elastic Beanstalk
echo ""
echo "🚀 Déploiement sur Elastic Beanstalk..."
eb deploy --staged

echo ""
echo "✅ Déploiement terminé!"
