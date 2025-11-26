# Create Linux-compatible zip for v1.9.1 deployment
$sourceDir = "c:\Users\rtard\rt-backend-services\temp-bundle\extracted"
$destZip = "c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\v1.9.1-planning-realtime.zip"

# Remove existing zip if present
if (Test-Path $destZip) {
    Remove-Item $destZip -Force
    Write-Host "Removed existing zip"
}

# Use .NET compression with explicit forward slash conversion
Add-Type -Assembly "System.IO.Compression"
Add-Type -Assembly "System.IO.Compression.FileSystem"

$zip = [System.IO.Compression.ZipFile]::Open($destZip, 'Create')

Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($sourceDir.Length + 1)
    # Convert backslashes to forward slashes for Linux compatibility
    $relativePath = $relativePath -replace '\\', '/'
    Write-Host "Adding: $relativePath"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relativePath, 'Optimal') | Out-Null
}

$zip.Dispose()

Write-Host ""
Write-Host "============================================"
Write-Host "Bundle created: $destZip"
Write-Host "Size: $((Get-Item $destZip).Length) bytes"
Write-Host "============================================"
