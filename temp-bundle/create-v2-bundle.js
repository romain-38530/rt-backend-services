const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.join(__dirname, 'extracted');
const outputZip = path.join(__dirname, 'rt-symphonia-v2.0.0-final.zip');

// Delete existing zip if present
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
}

// Use 7-zip if available, otherwise PowerShell with proper options
try {
  // Try 7z first (better cross-platform compatibility)
  execSync(`7z a -tzip "${outputZip}" "${sourceDir}\\*"`, { stdio: 'inherit' });
} catch (e) {
  // Fallback: Use tar to create zip (bash/git-bash)
  try {
    process.chdir(sourceDir);
    execSync(`tar -cf - * | gzip > "${path.join(__dirname, 'v2.0.0-bundle.tar.gz')}"`, { stdio: 'inherit', shell: 'bash' });
    console.log('Created tar.gz bundle');
  } catch (e2) {
    // Ultimate fallback: manual file collection
    console.log('Creating bundle manually...');
    const archiver = require('archiver');
    const output = fs.createWriteStream(outputZip);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  }
}

console.log('Bundle created successfully!');
