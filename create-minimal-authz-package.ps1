# Create minimal deployment package for authz-eb
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "authz-dashdoc-import-minimal-$timestamp.zip"
$serviceDir = "services\authz-eb"
$tempDir = "temp-authz-package"

# Create temp directory
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy only essential files
$essentialFiles = @(
    "$serviceDir\index.js",
    "$serviceDir\import-dashdoc-users.js",
    "$serviceDir\carriers.js",
    "$serviceDir\email.js",
    "$serviceDir\cloudwatch-stub.js",
    "$serviceDir\package.json",
    "$serviceDir\Procfile",
    "sett-users.json"
)

foreach ($file in $essentialFiles) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $tempDir
        Write-Host "✓ Copied: $file"
    } else {
        Write-Host "⚠ Skipped (not found): $file"
    }
}

# Create the zip
Compress-Archive -Path "$tempDir\*" -DestinationPath $packageName -Force

# Clean up
Remove-Item $tempDir -Recurse -Force

# Show results
$size = (Get-Item $packageName).Length / 1KB
Write-Host ""
Write-Host "✓ Created: $packageName ($([Math]::Round($size, 2)) KB)"