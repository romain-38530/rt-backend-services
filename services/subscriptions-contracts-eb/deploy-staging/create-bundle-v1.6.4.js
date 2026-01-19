// Script de création du bundle v1.6.4 avec TomTom et OVHcloud
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Création du bundle v1.6.4-external-services...');

const bundleName = 'subscriptions-contracts-eb-v1.6.4-external-services.zip';

// Supprimer l'ancien bundle s'il existe
if (fs.existsSync(bundleName)) {
  fs.unlinkSync(bundleName);
  console.log('🗑️ Ancien bundle supprimé');
}

// Liste des fichiers/dossiers à inclure
const includes = [
  'index.js',
  'package.json',
  '.ebextensions',
  'integrations',
  'routes',
  'middleware',
  'utils'
];

// Vérifier les fichiers existants
const existingIncludes = includes.filter(item => {
  const exists = fs.existsSync(item);
  if (!exists) {
    console.log(`⚠️ ${item} non trouvé, ignoré`);
  }
  return exists;
});

// Créer la liste des fichiers pour tar
const fileList = existingIncludes.join(' ');

console.log('📋 Fichiers à inclure:', fileList);

try {
  // Utiliser tar (disponible sur Windows 10+) pour créer un ZIP compatible
  const cmd = `tar -a -cf ${bundleName} ${fileList}`;
  console.log('🔧 Commande:', cmd);

  execSync(cmd, {
    cwd: __dirname,
    stdio: 'inherit'
  });

  // Vérifier la taille du bundle
  const stats = fs.statSync(bundleName);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`📊 Taille du bundle: ${sizeKB} KB`);

  if (sizeKB < 10) {
    console.error('⚠️ ATTENTION: Le bundle semble trop petit !');
    process.exit(1);
  }

  console.log('✅ Bundle v1.6.4-external-services créé avec succès');
  console.log(`📁 Fichier: ${bundleName}`);
  process.exit(0);
} catch (error) {
  console.error('❌ Erreur lors de la création du bundle:', error.message);
  process.exit(1);
}
