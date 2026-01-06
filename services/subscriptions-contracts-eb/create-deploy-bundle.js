// Créer un ZIP avec chemins Unix pour AWS Linux
// Version 2.5.3 - AWS SES Email Migration + Anti-Spam Headers
const fs = require('fs');
const path = require('path');
// Utiliser le chemin absolu pour pnpm
const archiver = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/archiver@7.0.1/node_modules/archiver');

const VERSION = 'v4.2.4-carrier-routes-fix';
const outputPath = path.join(__dirname, 'bundle', `deploy-${VERSION}.zip`);

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
  console.log('📊 Taille:', (archive.pointer() / 1024 / 1024).toFixed(2), 'MB');
  console.log('');
  console.log('Prochaine étape:');
  console.log(`  aws s3 cp "${outputPath}" s3://elasticbeanstalk-eu-central-1-004843574253/rt-subscriptions-api/${VERSION}.zip`);
  console.log('');
  console.log(`  aws elasticbeanstalk create-application-version --region eu-central-1 --application-name rt-subscriptions-api --version-label "${VERSION}" --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=rt-subscriptions-api/${VERSION}.zip`);
  console.log('');
  console.log(`  aws elasticbeanstalk update-environment --region eu-central-1 --environment-name rt-subscriptions-api-prod --version-label "${VERSION}"`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Liste des fichiers principaux
const files = [
  'index.js',
  'package.json',
  'package-lock.json',
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
  'storage-market-routes.js',
  // Models
  'account-types-models.js',
  'carrier-referencing-models.js',
  'ecmr-models.js',
  'pricing-grids-models.js',
  'transport-orders-models.js',
  'affretia-models.js',
  'planning-models.js',
  'chatbot-models.js',
  'storage-market-models.js',
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
  'planning-ai-optimizer.js',
  'chatbot-service.js',
  'ticketing-service.js',
  'specialized-assistants.js',
  'driver-checkin-service.js',
  'claude-integration.js',
  'storage-market-ai-enhancement.js',
  // Middleware & Utils
  'auth-middleware.js',
  'security-middleware.js',
  'ecmr-pdf.js',
  'ecmr-yousign.js',
  'ecmr-archive.js',
  // Subscription Management System
  'subscription-features.js',
  'subscription-guard.middleware.js',
  'subscription-management-routes.js',
  // Logisticien Delegation System
  'logisticien-models.js',
  'logisticien-routes.js',
  'logisticien-portal-routes.js',
  'logisticien-email.js',
  // Security Enhancements v2.5.0
  'email-verification-service.js',
  'rate-limiter-middleware.js',
  'invitation-token-service.js',
  'webhook-service.js',
  // Security v3.0.0 - 2FA & AWS SES
  'two-factor-auth-service.js',
  'aws-ses-email-service.js',
  'security-utils.js',
  // Validation v3.1.0 - Joi
  'validation-schemas.js',
  'validation-middleware.js',
  // v4.0.0 - Compliance & Security
  'gdpr-service.js',
  'gdpr-routes.js',
  'consent-service.js',
  'secure-logger.js',
  'token-rotation-service.js',
  'websocket-auth-service.js',
  'redis-cache-service.js',
  'driving-time-service.js',
  'carbon-footprint-service.js',
  'error-handler.js',
  // v4.2.1 - ICPE & Logistics Delegation
  'icpe-routes.js',
  'logistics-delegation-routes.js',
  // v4.2.2 - B2P Prospects Integration
  'prospect-carrier-model.js',
  'prospection-service.js',
  // v4.2.3 - B2P Dashboard & A/B Testing
  'b2p-dashboard-service.js',
  'b2p-dashboard-routes.js',
  'email-ab-testing-service.js',
  'email-ab-testing-routes.js',
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

// Ajouter les dossiers nécessaires
const directories = ['middleware', 'routes', 'integrations'];
directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (fs.existsSync(dirPath)) {
    archive.directory(dirPath, dir + '/');
    console.log('  ✅', dir + '/');
  }
});

// NOTE: Ne pas inclure node_modules - EB installera les dépendances via npm install
// Cela évite les problèmes de symlinks pnpm et de chemins Windows
console.log('  ℹ️ node_modules EXCLU - EB fera npm install au déploiement');

console.log('');
console.log(`📊 Résumé: ${included} fichiers inclus, ${missing} manquants`);
console.log('⏳ Finalisation du ZIP...');

archive.finalize();
