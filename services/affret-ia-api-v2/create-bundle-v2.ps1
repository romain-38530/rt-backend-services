$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Bundle name
$bundleName = "affret-ia-api-v2.5.1.zip"

# Remove old bundle if exists
if (Test-Path $bundleName) {
    Remove-Item $bundleName -Force
}

# Create temp folder
$tempDir = New-Item -ItemType Directory -Path "$env:TEMP\eb-bundle-$(Get-Random)" -Force

# Copy all required files preserving structure
$itemsToCopy = @(
    "controllers",
    "models",
    "modules",
    "routes",
    "services",
    "middleware",
    ".platform",
    "index.js",
    "package.json",
    "Procfile"
)

foreach ($item in $itemsToCopy) {
    if (Test-Path $item) {
        if (Test-Path $item -PathType Container) {
            Copy-Item -Path $item -Destination $tempDir -Recurse -Force
        } else {
            Copy-Item -Path $item -Destination $tempDir -Force
        }
        Write-Host "Copied: $item"
    }
}

# Create ZIP from temp folder contents
Compress-Archive -Path "$tempDir\*" -DestinationPath $bundleName -Force

# Cleanup
Remove-Item -Path $tempDir -Recurse -Force

# Show result
$file = Get-Item $bundleName
Write-Host "`nCreated: $($file.Name) ($($file.Length) bytes)"
