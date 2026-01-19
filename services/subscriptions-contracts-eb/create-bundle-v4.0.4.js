// Créer un ZIP avec chemins Unix pour AWS Linux
// Version 4.0.4 - Validation fix for subscription/modules onboarding
const fs = require('fs');
const path = require('path');
const archiver = require('c:/Users/rtard/rt-backend-services/node_modules/.pnpm/archiver@5.3.2/node_modules/archiver');

const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const VERSION = `v4.0.4-validation-fix-${timestamp}`;

// Output directly to service folder
const outputPath = path.join(__dirname, 'deploy-bundle.zip');

// Remove existing bundle
if (fs.existsSync(outputPath)) {
  fs.unlinkSync(outputPath);
}

const output = fs.createWriteStream(outputPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Bundle created successfully!');
  console.log('='.repeat(60));
  console.log('📦 File:', outputPath);
  console.log('📊 Size:', (archive.pointer() / 1024 / 1024).toFixed(2), 'MB');
  console.log('🏷️  Version:', VERSION);
  console.log('');
  console.log('Deploy commands:');
  console.log(`aws s3 cp "${outputPath}" s3://elasticbeanstalk-eu-central-1-004843574253/${VERSION}.zip`);
  console.log(`aws elasticbeanstalk create-application-version --application-name rt-subscription-invoicing --version-label ${VERSION} --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=${VERSION}.zip`);
  console.log(`aws elasticbeanstalk update-environment --environment-name rt-subscription-invoicing-prod --version-label ${VERSION}`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);

console.log('');
console.log('='.repeat(60));
console.log(`📦 Creating bundle ${VERSION}`);
console.log('='.repeat(60));
console.log('');

// Include all JS files from the directory
const jsFiles = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.js') && !f.startsWith('create-bundle') && !f.startsWith('seed-') && !f.startsWith('check-'));

jsFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  archive.file(filePath, { name: file });
  console.log('  ✅', file);
});

// Include package files
['package.json', 'package-lock.json'].forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    archive.file(filePath, { name: file });
    console.log('  ✅', file);
  }
});

// Include .ebextensions folder
const ebextPath = path.join(__dirname, '.ebextensions');
if (fs.existsSync(ebextPath)) {
  archive.directory(ebextPath, '.ebextensions');
  console.log('  ✅', '.ebextensions/');
}

// Skip node_modules - EB will run npm install to get dependencies
// This avoids pnpm symlink issues and Windows path problems
console.log('  ℹ️ Skipping node_modules - EB will run npm install');

console.log('');
console.log('⏳ Finalizing ZIP...');

archive.finalize();
