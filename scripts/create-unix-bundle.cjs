#!/usr/bin/env node
/**
 * Script pour créer des bundles AWS EB compatibles Unix
 * Utilise archiver pour créer des .zip avec forward slashes
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function createBundle(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✓ Created ${outputPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Warning:', err);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);

    // Ajouter tous les fichiers SAUF node_modules, .git, .env
    archive.glob('**/*', {
      cwd: sourceDir,
      ignore: ['node_modules/**', '.git/**', '.env', '*.log']
    });

    archive.finalize();
  });
}

async function createBundleWithInfra(serviceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✓ Created ${outputPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => reject(err));
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        console.warn('Warning:', err);
      } else {
        reject(err);
      }
    });

    archive.pipe(output);

    // Ajouter tous les fichiers du service
    archive.glob('**/*', {
      cwd: serviceDir,
      ignore: ['node_modules/**', '.git/**', '.env', '*.log']
    });

    // Ajouter le répertoire infra depuis la racine
    const infraDir = path.join(serviceDir, '..', '..', 'infra');
    if (fs.existsSync(infraDir)) {
      archive.directory(infraDir, 'infra');
    }

    archive.finalize();
  });
}

async function main() {
  const baseDir = path.join(__dirname, '..');

  console.log('\n🔧 Creating AWS Elastic Beanstalk bundles with Unix paths...\n');

  try {
    // TMS Sync
    await createBundleWithInfra(
      path.join(baseDir, 'services', 'tms-sync-eb'),
      path.join(baseDir, 'deploy', 'tms-sync-eb-fixed.zip')
    );

    // Authz
    await createBundleWithInfra(
      path.join(baseDir, 'services', 'authz-eb'),
      path.join(baseDir, 'deploy', 'authz-eb-fixed.zip')
    );

    // Affret IA
    await createBundleWithInfra(
      path.join(baseDir, 'services', 'affret-ia-api-v2'),
      path.join(baseDir, 'deploy', 'affret-ia-api-v2-fixed.zip')
    );

    console.log('\n✓ All bundles created successfully!\n');
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

main();
