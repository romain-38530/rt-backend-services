$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Define files and folders to include
$items = @(
    "controllers",
    "models",
    "modules",
    "routes",
    "services",
    "middleware",
    ".platform",
    "index.js",
    "package.json",
    "Procfile",
    ".gitignore"
)

# Filter existing items
$existingItems = $items | Where-Object { Test-Path $_ }
Write-Host "Including: $($existingItems -join ', ')"

# Remove old bundle if exists
$bundleName = "affret-ia-api-v2.5.0.zip"
if (Test-Path $bundleName) {
    Remove-Item $bundleName -Force
}

# Create the archive
Compress-Archive -Path $existingItems -DestinationPath $bundleName -Force

# Show result
$file = Get-Item $bundleName
Write-Host "Created: $($file.Name) ($($file.Length) bytes)"
