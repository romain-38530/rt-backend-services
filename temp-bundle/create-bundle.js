const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = 'c:\\Users\\rtard\\rt-backend-services\\temp-bundle\\extracted';
const outputZip = 'c:\\Users\\rtard\\rt-backend-services\\services\\subscriptions-contracts-eb\\v1.9.0-planning-node.zip';

// Remove existing zip
if (fs.existsSync(outputZip)) {
  fs.unlinkSync(outputZip);
  console.log('Removed existing zip');
}

// Get all files
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = getAllFiles(sourceDir);
console.log(`Found ${files.length} files`);

// Create a file list for PowerShell Compress-Archive
// But we need to ensure forward slashes in the archive

// Alternative: Use archiver npm package if available
// For now, let's try using tar + gzip approach

// Create tar.gz first (which handles paths correctly), then convert
try {
  // Change to source directory and use tar
  const tarCmd = `cd "${sourceDir}" && tar -cvf "../bundle.tar" *`;
  console.log('Creating tar archive...');
  execSync(tarCmd, { shell: 'cmd.exe', stdio: 'inherit' });

  console.log('Converting to zip...');
  // Now we need to convert tar to zip - this is tricky on Windows
  // Let's try a different approach - use PowerShell with explicit path handling

} catch (err) {
  console.log('tar not available, trying alternative...');
}

// Alternative: Create a Procfile and package.json based deployment
// Just copy files with correct structure

const archiver = require('archiver') || null;
if (!archiver) {
  console.log('archiver not available');

  // Manual zip creation using PowerShell with path transformation
  const ps = `
$sourceDir = '${sourceDir.replace(/\\/g, '\\\\')}'
$destZip = '${outputZip.replace(/\\/g, '\\\\')}'

Add-Type -Assembly "System.IO.Compression"
Add-Type -Assembly "System.IO.Compression.FileSystem"

$zip = [System.IO.Compression.ZipFile]::Open($destZip, 'Create')

Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceDir.Length + 1)
    # Convert backslashes to forward slashes for Linux compatibility
    $relativePath = $relativePath -replace '\\\\', '/'
    Write-Host "Adding: $relativePath"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath, 'Optimal') | Out-Null
}

$zip.Dispose()
Write-Host "Created: $destZip"
`;

  fs.writeFileSync('c:\\Users\\rtard\\rt-backend-services\\temp-bundle\\create-zip.ps1', ps);
  console.log('Created PowerShell script');
}

console.log('Run: powershell -ExecutionPolicy Bypass -File create-zip.ps1');
