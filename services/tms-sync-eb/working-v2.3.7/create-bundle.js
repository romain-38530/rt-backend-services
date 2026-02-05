const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function createBundle() {
  const sourceDir = __dirname;
  const outputPath = path.join(sourceDir, 'bundle.zip');

  // Remove old bundle if exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
  }

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', {
    zlib: { level: 9 }
  });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Bundle created: ${archive.pointer()} bytes`);
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add all files except node_modules, .git, and bundle.zip
    const filesToInclude = [
      'index.js',
      'package.json',
      'package-lock.json',
      'Procfile',
      'connectors',
      'services',
      'node_modules'
    ];

    for (const item of filesToInclude) {
      const itemPath = path.join(sourceDir, item);
      if (fs.existsSync(itemPath)) {
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
          archive.directory(itemPath, item);
        } else {
          archive.file(itemPath, { name: item });
        }
      }
    }

    archive.finalize();
  });
}

createBundle()
  .then(p => console.log('Done:', p))
  .catch(e => console.error('Error:', e));
