// ============================================================================
// Script de Création Bundle v1.6.2-security
// ============================================================================
// Crée un bundle ZIP avec toutes les modifications de sécurité
// ============================================================================

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('============================================================================');
console.log('📦 Création Bundle v1.6.2-security - RT SYMPHONI.A');
console.log('============================================================================');

const BUNDLE_NAME = 'subscriptions-contracts-v1.6.2-security.zip';
const BUNDLE_DIR = path.join(__dirname, 'bundle');

// Créer le répertoire bundle s'il n'existe pas
if (!fs.existsSync(BUNDLE_DIR)) {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
}

const BUNDLE_PATH = path.join(BUNDLE_DIR, BUNDLE_NAME);

// Supprimer l'ancien bundle s'il existe
if (fs.existsSync(BUNDLE_PATH)) {
  console.log('🗑️  Suppression ancien bundle...');
  fs.unlinkSync(BUNDLE_PATH);
}

console.log('\n📋 Fichiers inclus dans le bundle:');
console.log('');

// Liste des fichiers à inclure
const files = [
  // Core
  'index.js',
  'package.json',

  // Routes
  'ecmr-routes.js',
  'account-types-routes.js',
  'carrier-referencing-routes.js',
  'pricing-grids-routes.js',
  'industrial-transport-config-routes.js',
  'auth-routes.js',
  'stripe-routes.js',
  'transport-orders-routes.js',

  // Services (14 modules)
  'transport-orders-models.js',
  'tracking-basic-service.js',
  'tomtom-integration.js',
  'geofencing-service.js',
  'lane-matching-service.js',
  'dispatch-service.js',
  'document-management-service.js',
  'carrier-scoring-service.js',
  'order-closure-service.js',
  'rdv-management-service.js',
  'eta-monitoring-service.js',
  'ocr-integration-service.js',

  // Models
  'ecmr-models.js',
  'account-types-models.js',
  'carrier-referencing-models.js',
  'pricing-grids-models.js',

  // Middleware (NOUVEAU - v1.6.2-security)
  'middleware/security.js',

  // Auth
  'auth-middleware.js',

  // Utils
  'ecmr-pdf.js',
  'ecmr-yousign.js',
  'ecmr-archive.js',
];

// Vérifier que tous les fichiers existent
let allFilesExist = true;
files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`  ✅ ${file.padEnd(50)} (${sizeKB} KB)`);
  } else {
    console.log(`  ❌ ${file.padEnd(50)} (MANQUANT)`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.error('\n❌ Certains fichiers sont manquants. Arrêt du bundling.');
  process.exit(1);
}

console.log('\n📦 Création du bundle ZIP avec PowerShell Compress-Archive...');
console.log('');

try {
  // Créer la liste des fichiers pour PowerShell
  const fileList = files.map(f => `"${f}"`).join(',');

  // Utiliser PowerShell Compress-Archive (fiable sur Windows)
  const psCommand = `
    $files = @(${fileList})
    $destination = "${BUNDLE_PATH.replace(/\\/g, '\\\\')}"

    # Supprimer le ZIP existant si présent
    if (Test-Path $destination) {
      Remove-Item $destination -Force
    }

    # Créer le ZIP
    Compress-Archive -Path $files -DestinationPath $destination -CompressionLevel Optimal

    # Vérifier que le ZIP a été créé
    if (Test-Path $destination) {
      $size = (Get-Item $destination).Length
      Write-Host "✅ Bundle créé: $destination ($([math]::Round($size/1KB, 2)) KB)"
    } else {
      Write-Host "❌ Erreur: Bundle non créé"
      exit 1
    }
  `;

  execSync(`powershell -Command "${psCommand.replace(/"/g, '\\"')}"`, {
    cwd: __dirname,
    stdio: 'inherit'
  });

  // Vérifier le bundle
  if (fs.existsSync(BUNDLE_PATH)) {
    const stats = fs.statSync(BUNDLE_PATH);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('');
    console.log('============================================================================');
    console.log('✅ Bundle créé avec succès !');
    console.log('============================================================================');
    console.log(`📦 Fichier: ${BUNDLE_NAME}`);
    console.log(`📂 Chemin: ${BUNDLE_PATH}`);
    console.log(`📊 Taille: ${sizeMB} MB`);
    console.log(`📝 Fichiers: ${files.length}`);
    console.log(`🔐 Version: v1.6.2-security`);
    console.log('');
    console.log('🚀 Fonctionnalités de sécurité incluses:');
    console.log('  ✅ Rate Limiting (4 niveaux)');
    console.log('  ✅ CORS avec Whitelist');
    console.log('  ✅ Helmet Security Headers (9 headers)');
    console.log('  ✅ Input Sanitization (XSS Prevention)');
    console.log('  ✅ Request Logging');
    console.log('  ✅ IP Whitelisting (optionnel)');
    console.log('  ✅ API Key Validation (optionnel)');
    console.log('');
    console.log('📋 Prochaine étape:');
    console.log(`   aws elasticbeanstalk create-application-version \\`);
    console.log(`     --application-name rt-subscriptions-contracts \\`);
    console.log(`     --version-label v1.6.2-security \\`);
    console.log(`     --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-xxx,S3Key=${BUNDLE_NAME}`);
    console.log('============================================================================');

  } else {
    throw new Error('Bundle non créé');
  }

} catch (error) {
  console.error('\n❌ Erreur lors de la création du bundle:', error.message);
  console.error('');
  console.error('💡 Solutions:');
  console.error('  1. Vérifier que PowerShell est disponible');
  console.error('  2. Vérifier les permissions du répertoire');
  console.error('  3. Essayer avec 7-Zip: 7z a bundle.zip @files.txt');
  process.exit(1);
}
