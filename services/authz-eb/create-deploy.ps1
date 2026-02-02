$srcDir = 'c:\Users\rtard\dossier symphonia\rt-backend-services\services\authz-eb'
$tempDir = "$srcDir\deploy-temp"
$zipFile = "$srcDir\authz-eb-v3.12.3-complete.zip"

# Clean and create temp dir
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy required files
Copy-Item "$srcDir\index.js" $tempDir
Copy-Item "$srcDir\package.json" $tempDir
Copy-Item "$srcDir\Procfile" $tempDir
Copy-Item "$srcDir\carriers.js" $tempDir
Copy-Item "$srcDir\email.js" $tempDir
Copy-Item "$srcDir\subusers.js" $tempDir

# Copy routes directory
New-Item -ItemType Directory -Path "$tempDir\routes" | Out-Null
Copy-Item "$srcDir\routes\*" "$tempDir\routes" -Recurse

# Copy helpers if exists
if (Test-Path "$srcDir\helpers") {
    New-Item -ItemType Directory -Path "$tempDir\helpers" | Out-Null
    Copy-Item "$srcDir\helpers\*" "$tempDir\helpers" -Recurse
}

# List contents
Write-Host "Contents of deploy-temp:"
Get-ChildItem $tempDir -Recurse | Select-Object FullName

# Create zip
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipFile -Force

Write-Host "Created: $zipFile"
Write-Host "Size: $((Get-Item $zipFile).Length / 1MB) MB"
