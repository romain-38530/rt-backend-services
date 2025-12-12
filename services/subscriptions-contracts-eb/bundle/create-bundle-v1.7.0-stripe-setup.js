// Créer un ZIP avec chemins Unix pour AWS Linux
// Version 1.7.0 - Ajout endpoint Stripe Setup pour onboarding
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const VERSION = 'v1.8.2-stripe-options';
const outputPath = path.join(__dirname, 'bundle', `subscriptions-contracts-${VERSION}.zip`);

// Créer le dossier bundle s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'bundle'))) {
  fs.mkdirSync(path.join(__dirname, 'bundle'));
}

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Bundle créé avec succès!');
  console.log('='.repeat(60));
  console.log('📦 Fichier:', outputPath);
  console.log('📊 Taille:', (archive.pointer() / 1024).toFixed(2), 'KB');
  console.log('');
  console.log('Prochaine étape:');
  console.log('  aws elasticbeanstalk create-application-version \\');
  console.log('    --application-name rt-subscriptions-contracts-api \\');
  console.log(`    --version-label ${VERSION} \\`);
  console.log(`    --source-bundle S3Bucket=YOUR_BUCKET,S3Key=subscriptions-contracts-${VERSION}.zip`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Liste des fichiers principaux (tous les fichiers requis par index.js)
const files = [
  'index.js',
  'package.json',
  'Procfile',
  // Routes
  'account-types-routes.js',
  'auth-routes.js',
  'carrier-referencing-routes.js',
  'ecmr-routes.js',
  'industrial-transport-config-routes.js',
  'pricing-grids-routes.js',
  'stripe-routes.js',
  'transport-orders-routes.js',
  'affretia-routes.js',
  'planning-routes.js',
  'chatbot-routes.js',
  // Models
  'account-types-models.js',
  'carrier-referencing-models.js',
  'ecmr-models.js',
  'pricing-grids-models.js',
  'transport-orders-models.js',
  'affretia-models.js',
  'planning-models.js',
  'chatbot-models.js',
  // Services
  'carrier-scoring-service.js',
  'dispatch-service.js',
  'document-management-service.js',
  'eta-monitoring-service.js',
  'geofencing-service.js',
  'lane-matching-service.js',
  'ocr-integration-service.js',
  'order-closure-service.js',
  'rdv-management-service.js',
  'tracking-basic-service.js',
  'tomtom-integration.js',
  'notification-service.js',
  'scheduled-jobs.js',
  'helpbot-service.js',
  'affretia-ai-enhancement.js',
  'affretia-service.js',
  'planning-service.js',
  'planning-notification-service.js',
  'planning-websocket.js',
  'chatbot-service.js',
  'ticketing-service.js',
  'specialized-assistants.js',
  'driver-checkin-service.js',
  'claude-integration.js',
  // Middleware & Utils
  'auth-middleware.js',
  'security-middleware.js',
  'ecmr-pdf.js',
  'ecmr-yousign.js',
  'ecmr-archive.js',
];

console.log('');
console.log('='.repeat(60));
console.log(`📦 Création du bundle ${VERSION}`);
console.log('='.repeat(60));
console.log('');

let included = 0;
let missing = 0;

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    archive.file(filePath, { name: file });
    console.log('  ✅', file);
    included++;
  } else {
    console.log('  ⚠️', file, '(manquant - ignoré)');
    missing++;
  }
});

// Ajouter le dossier middleware s'il existe
const middlewarePath = path.join(__dirname, 'middleware');
if (fs.existsSync(middlewarePath)) {
  archive.directory(middlewarePath, 'middleware/');
  console.log('  ✅ middleware/');
}

// Ajouter le dossier routes s'il existe
const routesPath = path.join(__dirname, 'routes');
if (fs.existsSync(routesPath)) {
  archive.directory(routesPath, 'routes/');
  console.log('  ✅ routes/');
}

// Ajouter le dossier integrations s'il existe
const integrationsPath = path.join(__dirname, 'integrations');
if (fs.existsSync(integrationsPath)) {
  archive.directory(integrationsPath, 'integrations/');
  console.log('  ✅ integrations/');
}

console.log('');
console.log(`📊 Résumé: ${included} fichiers inclus, ${missing} manquants`);

archive.finalize();
