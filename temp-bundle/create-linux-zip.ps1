# Create a Linux-compatible zip file
$sourceDir = "c:\Users\rtard\rt-backend-services\temp-bundle\extracted"
$zipPath = "c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\v1.9.0-planning-linux.zip"

# Remove existing zip if present
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Use .NET compression with proper settings
Add-Type -Assembly "System.IO.Compression.FileSystem"

# Create the archive
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $sourceDir,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false  # Don't include base directory
)

Write-Host "Created: $zipPath"
Write-Host "Size: $((Get-Item $zipPath).Length) bytes"
