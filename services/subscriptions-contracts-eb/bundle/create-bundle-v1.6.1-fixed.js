// Script de création du bundle v1.6.1-fixed
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Création du bundle v1.6.1-fixed...');

const bundleName = 'subscriptions-contracts-eb-v1.6.1-fixed.zip';

// Supprimer l'ancien bundle s'il existe
if (fs.existsSync(bundleName)) {
  fs.unlinkSync(bundleName);
  console.log('🗑️ Ancien bundle supprimé');
}

// Lister tous les fichiers .js (sauf scripts de création de bundle)
const jsFiles = fs.readdirSync('.')
  .filter(f => f.endsWith('.js') && !f.startsWith('create-bundle'))
  .join(' ');

console.log(`📋 Fichiers à inclure: ${jsFiles.split(' ').length} fichiers .js`);

// Utiliser PowerShell Compress-Archive (disponible sur Windows)
try {
  const files = jsFiles.split(' ').map(f => `'${f}'`).join(',');
  const psCommand = `Compress-Archive -Path ${files},'package.json' -DestinationPath '${bundleName}' -Force`;

  execSync(`powershell -Command "${psCommand}"`, {
    cwd: __dirname,
    stdio: 'inherit'
  });

  console.log('✅ Bundle créé avec PowerShell Compress-Archive');

  // Vérifier la taille du bundle
  const stats = fs.statSync(bundleName);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`📊 Taille du bundle: ${sizeKB} KB`);

  if (sizeKB < 50) {
    console.error('⚠️ ATTENTION: Le bundle semble trop petit !');
    process.exit(1);
  }

  console.log('✅ Bundle v1.6.1-fixed créé avec succès');
  console.log(`📦 Fichier: ${bundleName}`);
  process.exit(0);
} catch (error) {
  console.error('❌ Erreur lors de la création du bundle:', error.message);
  process.exit(1);
}
