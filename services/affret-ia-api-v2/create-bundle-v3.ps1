$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Bundle name
$bundleName = "affret-ia-api-v2.5.2.zip"

# Remove old bundle if exists
if (Test-Path $bundleName) {
    Remove-Item $bundleName -Force
}

# Load compression library
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Create the archive manually with forward slashes
$zipStream = [System.IO.File]::Create((Join-Path $PSScriptRoot $bundleName))
$archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

# Define items to include
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
    "Procfile"
)

function Add-FileToZip($archive, $filePath, $entryName) {
    # Use forward slashes for Linux compatibility
    $entryName = $entryName -replace '\\', '/'
    $entry = $archive.CreateEntry($entryName)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($filePath)
    $fileStream.CopyTo($entryStream)
    $fileStream.Close()
    $entryStream.Close()
    Write-Host "Added: $entryName"
}

foreach ($item in $items) {
    if (Test-Path $item) {
        if (Test-Path $item -PathType Container) {
            # Add folder contents recursively
            Get-ChildItem -Path $item -Recurse -File | ForEach-Object {
                $relativePath = $_.FullName.Substring($PSScriptRoot.Length + 1)
                Add-FileToZip $archive $_.FullName $relativePath
            }
        } else {
            # Add file
            Add-FileToZip $archive (Join-Path $PSScriptRoot $item) $item
        }
    }
}

$archive.Dispose()
$zipStream.Close()

# Show result
$file = Get-Item $bundleName
Write-Host "`nCreated: $($file.Name) ($($file.Length) bytes)"
