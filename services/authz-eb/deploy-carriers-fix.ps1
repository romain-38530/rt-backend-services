$tempDir = "C:\temp\authz-carriers-fix"
$zipPath = "authz-eb-v3.11.0-tms-sync-fetch.zip"

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Write-Host "Creating deployment package..." -ForegroundColor Cyan

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Copy-Item index.js,carriers.js,package.json,Procfile $tempDir
Copy-Item scripts $tempDir -Recurse -ErrorAction SilentlyContinue

Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

python create_unix_zip.py $tempDir $zipPath
Remove-Item $tempDir -Recurse -Force

Write-Host "Package created: $zipPath" -ForegroundColor Green
