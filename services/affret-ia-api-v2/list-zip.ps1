Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("C:\Users\rtard\rt-backend-services\services\affret-ia-api-v2\affret-ia-api-v2.5.1.zip")
$zip.Entries | ForEach-Object { Write-Host $_.FullName }
$zip.Dispose()
