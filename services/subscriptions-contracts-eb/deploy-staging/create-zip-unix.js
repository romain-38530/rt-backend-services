// Créer un ZIP avec chemins Unix pour AWS Linux
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const output = fs.createWriteStream(path.join(__dirname, 'bundle', 'subscriptions-contracts-v1.6.2-security-final.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('✅ Bundle créé:', archive.pointer(), 'bytes');
  console.log('📦 Fichier:', 'bundle/subscriptions-contracts-v1.6.2-security-final.zip');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Ajouter les fichiers avec chemins Unix
const files = [
  'index.js',
  'package.json',
  'package-lock.json',
  'Procfile',
  'account-types-routes.js',
  'auth-routes.js',
  'carrier-referencing-routes.js',
  'ecmr-routes.js',
  'industrial-transport-config-routes.js',
  'pricing-grids-routes.js',
  'stripe-routes.js',
  'transport-orders-routes.js',
  'account-types-models.js',
  'carrier-referencing-models.js',
  'ecmr-models.js',
  'pricing-grids-models.js',
  'transport-orders-models.js',
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
  'auth-middleware.js',
  'ecmr-pdf.js',
  'ecmr-yousign.js',
  'ecmr-archive.js',
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    archive.file(file, { name: file });
    console.log('✅', file);
  } else {
    console.log('❌', file, '(manquant)');
  }
});

// Ajouter le dossier middleware avec le bon chemin Unix
archive.directory('middleware/', 'middleware/');
console.log('✅ middleware/');

archive.finalize();
