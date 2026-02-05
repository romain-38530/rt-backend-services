const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node create-zip.js <source-dir> <output-zip>');
  process.exit(1);
}

const sourceDir = args[0];
const outputZip = args[1];
const excludeDirs = ['node_modules', '.git', 'bundle-logs', 'bundle-logs-deploy-fail', 'bundle-logs-fixed', 'working-v2.0.6'];

const output = fs.createWriteStream(outputZip);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Created ${outputZip} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add files from source directory, excluding node_modules
archive.glob('**/*', {
  cwd: sourceDir,
  ignore: excludeDirs.map(d => `${d}/**`).concat(['*.zip', '*.log', '.env*']),
  dot: true
});

archive.finalize();
