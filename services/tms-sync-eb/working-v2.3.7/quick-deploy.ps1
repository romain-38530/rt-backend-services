$tempDir = "C:\temp\tms-sync-quick"
$zipPath = "deploy-v2.3.4-debug-cleanup.zip"

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
Copy-Item index.js,package.json,Procfile,scheduled-jobs.js $tempDir
Copy-Item connectors,services $tempDir -Recurse

Push-Location $tempDir
npm install --production --no-package-lock 2>&1 | Out-Null
Pop-Location

python create_unix_zip.py $tempDir $zipPath
Remove-Item $tempDir -Recurse -Force

Write-Host "Package created: $zipPath"
