# Deploiement Affret.IA v2.7.0 - Pricing & Dashdoc
Write-Host "Creating Affret.IA v2.7.0 package..." -ForegroundColor Cyan

$version = "2.7.0"
$sourceDir = "c:\Users\rtard\dossier symphonia\rt-backend-services\services\affret-ia-api-v2"
$tempDir = "C:\temp\affret-ia-v$version"
$zipPath = "$sourceDir\deploy-v$version.zip"

# Nettoyage
Write-Host "[1/6] Cleaning..." -ForegroundColor Yellow
if (Test-Path $tempDir) {
    Remove-Item $tempDir -Recurse -Force
}
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

# Creation dossier temp
Write-Host "[2/6] Creating temp directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# Copie fichiers principaux
Write-Host "[3/6] Copying source files..." -ForegroundColor Yellow
Copy-Item "$sourceDir\index.js" $tempDir
Copy-Item "$sourceDir\package.json" $tempDir
Copy-Item "$sourceDir\cloudwatch-stub.js" $tempDir
Set-Content "$tempDir\Procfile" "web: npm start"

# Copie dossiers
$folders = @("controllers", "routes", "services", "models", "middleware", "modules", "docs", "scripts", ".ebextensions")
foreach ($folder in $folders) {
    if (Test-Path "$sourceDir\$folder") {
        Copy-Item "$sourceDir\$folder" "$tempDir\$folder" -Recurse
        Write-Host "  Copied $folder/" -ForegroundColor Gray
    }
}

# Verification nouveaux fichiers
Write-Host "[4/6] Verifying new files..." -ForegroundColor Yellow
$newFiles = @(
    "models\PriceHistory.js",
    "services\pricing.service.js",
    "scripts\import-dashdoc-history.js",
    "docs\PRICING-API.md"
)

$allPresent = $true
foreach ($file in $newFiles) {
    $filePath = Join-Path $tempDir $file
    if (Test-Path $filePath) {
        Write-Host "  OK: $file" -ForegroundColor Green
    } else {
        Write-Host "  MISSING: $file" -ForegroundColor Red
        $allPresent = $false
    }
}

if (-not $allPresent) {
    Write-Host "Missing files detected! Aborting." -ForegroundColor Red
    Remove-Item $tempDir -Recurse -Force
    exit 1
}

# Statistiques
Write-Host "[5/6] Package statistics..." -ForegroundColor Yellow
$totalFiles = (Get-ChildItem $tempDir -Recurse -File).Count
$totalSize = [math]::Round((Get-ChildItem $tempDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1KB, 2)
Write-Host "  Total files: $totalFiles" -ForegroundColor Cyan
Write-Host "  Total size: $totalSize KB" -ForegroundColor Cyan

# Creation ZIP
Write-Host "[6/6] Creating ZIP package..." -ForegroundColor Yellow
$pythonZipScript = "$sourceDir\create_unix_zip.py"

if (Test-Path $pythonZipScript) {
    Write-Host "  Using Python script..." -ForegroundColor Gray
    python $pythonZipScript $tempDir $zipPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Python failed, using PowerShell..." -ForegroundColor Yellow
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
    }
} else {
    Write-Host "  Using PowerShell..." -ForegroundColor Gray
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
}

# Nettoyage
Remove-Item $tempDir -Recurse -Force

# Resume
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "Package created successfully!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
$zipInfo = Get-Item $zipPath
Write-Host "File: $($zipInfo.Name)" -ForegroundColor Cyan
Write-Host "Size: $([math]::Round($zipInfo.Length / 1KB, 2)) KB" -ForegroundColor Cyan
Write-Host "Path: $zipPath" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Configure DASHDOC_API_KEY in EB" -ForegroundColor White
Write-Host "2. Deploy: eb deploy rt-affret-ia-api-prod-v2" -ForegroundColor White
Write-Host "3. Check health: eb health" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Green
