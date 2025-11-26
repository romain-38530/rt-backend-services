$sourceDir = 'c:\Users\rtard\rt-backend-services\temp-bundle\extracted'
$destZip = 'c:\Users\rtard\rt-backend-services\services\subscriptions-contracts-eb\v1.9.0-planning-proper.zip'

# Remove existing
if (Test-Path $destZip) { Remove-Item $destZip -Force }

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
Write-Host "Created: $destZip"
Write-Host "Size: $((Get-Item $destZip).Length) bytes"
