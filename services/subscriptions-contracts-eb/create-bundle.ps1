$ErrorActionPreference = 'Stop'
$stagingDir = 'deploy-staging'

# Clean and recreate
if (Test-Path $stagingDir) { Remove-Item -Path $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

# Copy JS files
Get-ChildItem -Filter '*.js' | Copy-Item -Destination $stagingDir -Force
Copy-Item 'package.json' -Destination $stagingDir -Force
Copy-Item 'package-lock.json' -Destination $stagingDir -Force

# Copy .ebextensions
if (Test-Path '.ebextensions') {
    Copy-Item '.ebextensions' -Destination $stagingDir -Recurse -Force
}

# Copy node_modules
if (Test-Path 'node_modules') {
    Copy-Item 'node_modules' -Destination $stagingDir -Recurse -Force
}

# Create zip
if (Test-Path 'deploy-bundle.zip') { Remove-Item 'deploy-bundle.zip' -Force }
Compress-Archive -Path "$stagingDir\*" -DestinationPath 'deploy-bundle.zip' -Force

# List what was copied
Write-Host "Staging contents:"
Get-ChildItem $stagingDir -Name

Write-Host "`nBundle created: deploy-bundle.zip"
$size = (Get-Item 'deploy-bundle.zip').Length / 1KB
Write-Host "Size: $size KB"
