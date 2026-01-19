Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("C:\Users\rtard\AppData\Local\Temp\v2.4.0-osm.zip")
$zip.Entries | ForEach-Object { Write-Host $_.FullName }
$zip.Dispose()
