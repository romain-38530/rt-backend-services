# Script pour créer le package de déploiement
$files = @('index.js', 'carriers.js', 'package.json', 'Procfile')
$folders = @('scripts')

Write-Host "`n📦 Création du package de déploiement authz-eb" -ForegroundColor Cyan
Write-Host "================================================`n" -ForegroundColor Cyan

# Créer un dossier temporaire
Remove-Item -Path 'deploy-temp' -Recurse -Force -ErrorAction SilentlyContinue
New-Item -Path 'deploy-temp' -ItemType Directory | Out-Null

# Copier les fichiers
Write-Host "📋 Copie des fichiers..." -ForegroundColor Yellow
foreach ($file in $files) {
  if (Test-Path $file) {
    Copy-Item $file -Destination 'deploy-temp/' -Force
    Write-Host "   ✓ $file" -ForegroundColor Green
  } else {
    Write-Host "   ⚠ $file (non trouvé)" -ForegroundColor Yellow
  }
}

# Copier les dossiers
foreach ($folder in $folders) {
  if (Test-Path $folder) {
    Copy-Item $folder -Destination 'deploy-temp/' -Recurse -Force
    $fileCount = (Get-ChildItem -Path "$folder" -Recurse -File).Count
    Write-Host "   ✓ $folder ($fileCount fichiers)" -ForegroundColor Green
  }
}

# Créer le zip
Write-Host "`n🗜️  Création du fichier zip..." -ForegroundColor Yellow
$zipName = 'authz-eb-v3.0.0-carrier-system.zip'
Compress-Archive -Path 'deploy-temp/*' -DestinationPath $zipName -Force

# Afficher la taille
$sizeKB = [math]::Round((Get-Item $zipName).Length / 1KB, 2)
Write-Host "   ✅ Package créé: $zipName" -ForegroundColor Green
Write-Host "   📊 Taille: $sizeKB KB`n" -ForegroundColor Cyan

# Nettoyer
Remove-Item -Path 'deploy-temp' -Recurse -Force

Write-Host "✅ Package prêt pour le déploiement!`n" -ForegroundColor Green

# Instructions pour déployer
Write-Host "📝 Pour déployer sur AWS Elastic Beanstalk:" -ForegroundColor Yellow
Write-Host "   1. Aller sur: https://eu-central-1.console.aws.amazon.com/elasticbeanstalk" -ForegroundColor Gray
Write-Host "   2. Sélectionner: rt-authz-api-prod" -ForegroundColor Gray
Write-Host "   3. Upload and Deploy: $zipName`n" -ForegroundColor Gray
