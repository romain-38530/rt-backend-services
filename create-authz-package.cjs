// Quick script to create deployment package for authz-eb
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const packageName = `authz-dashdoc-import-${timestamp}.zip`;
const serviceDir = path.join(__dirname, 'services', 'authz-eb');

console.log('Creating deployment package...');
console.log('Service directory:', serviceDir);

// Use PowerShell Compress-Archive on Windows
try {
  const command = `powershell -Command "Compress-Archive -Path '${serviceDir}\\*' -DestinationPath '${path.join(__dirname, packageName)}' -Force -CompressionLevel Optimal"`;

  execSync(command, { stdio: 'inherit' });

  const stats = fs.statSync(path.join(__dirname, packageName));
  console.log(`\n✓ Created: ${packageName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Full path: ${path.join(__dirname, packageName)}`);

} catch (error) {
  console.error('Error creating package:', error.message);
  process.exit(1);
}
