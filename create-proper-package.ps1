# Create properly structured deployment package
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageName = "authz-proper-$timestamp.zip"
$tempDir = "temp-deploy"

# Clean and create temp directory
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy files to temp directory (flat structure)
Copy-Item "services\authz-eb\index.js" -Destination $tempDir
Copy-Item "services\authz-eb\import-dashdoc-users.js" -Destination $tempDir
Copy-Item "services\authz-eb\carriers.js" -Destination $tempDir
Copy-Item "services\authz-eb\email.js" -Destination $tempDir
Copy-Item "services\authz-eb\package.json" -Destination $tempDir
Copy-Item "services\authz-eb\Procfile" -Destination $tempDir
Copy-Item "sett-users.json" -Destination $tempDir

Write-Host "Files copied to temp directory:"
Get-ChildItem $tempDir | ForEach-Object { Write-Host "  - $($_.Name)" }

# Create ZIP from temp directory contents
Compress-Archive -Path "$tempDir\*" -DestinationPath $packageName -Force -CompressionLevel Optimal

# Clean up
Remove-Item $tempDir -Recurse -Force

# Show result
$size = (Get-Item $packageName).Length / 1KB
Write-Host ""
Write-Host "✓ Package created: $packageName"
Write-Host "  Size: $([Math]::Round($size, 2)) KB"