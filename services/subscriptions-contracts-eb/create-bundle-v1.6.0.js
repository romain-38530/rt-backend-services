// Script de création du bundle v1.6.0
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📦 Création du bundle v1.6.0-complete...');

const bundleName = 'subscriptions-contracts-eb-v1.6.0-complete.zip';

// Supprimer l'ancien bundle s'il existe
if (fs.existsSync(bundleName)) {
  fs.unlinkSync(bundleName);
}

// Lister tous les fichiers .js (sauf node_modules et bundles)
const jsFiles = fs.readdirSync('.')
  .filter(f => f.endsWith('.js') && f !== 'create-bundle-v1.6.0.js')
  .join(' ');

// Utiliser 7z ou PowerShell selon disponibilité
try {
  // Essayer avec 7z d'abord
  try {
    execSync(`7z a -tzip ${bundleName} ${jsFiles} package.json .ebextensions .platform 2>NUL`, {
      cwd: __dirname,
      stdio: 'pipe'
    });
    console.log('✅ Bundle créé avec 7z');
  } catch (e) {
    // Si 7z n'est pas disponible, utiliser tar (disponible sur Windows 10+)
    console.log('7z non disponible, utilisation de tar...');
    execSync(`tar -a -cf ${bundleName} ${jsFiles} package.json`, {
      cwd: __dirname,
      stdio: 'inherit'
    });
    console.log('✅ Bundle créé avec tar');
  }

  // Vérifier la taille du bundle
  const stats = fs.statSync(bundleName);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`📊 Taille du bundle: ${sizeKB} KB`);

  if (sizeKB < 10) {
    console.error('⚠️ ATTENTION: Le bundle semble trop petit !');
    process.exit(1);
  }

  console.log('✅ Bundle créé avec succès');
  process.exit(0);
} catch (error) {
  console.error('❌ Erreur lors de la création du bundle:', error.message);
  process.exit(1);
}
