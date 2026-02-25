# Script pour executer la correction MongoDB CLI
# Corrige les commandes du 11/02 directement via mongosh

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "  Fix Commandes 11/02 - MongoDB CLI" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host ""

# Verifier si mongosh est installe
$mongoshPath = Get-Command mongosh -ErrorAction SilentlyContinue

if (-not $mongoshPath) {
    Write-Host "ERROR: mongosh n'est pas installe" -ForegroundColor Red
    Write-Host ""
    Write-Host "Installation:" -ForegroundColor Yellow
    Write-Host "  1. Telecharger: https://www.mongodb.com/try/download/shell" -ForegroundColor Gray
    Write-Host "  2. Installer et relancer ce script" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "OK mongosh trouve: $($mongoshPath.Source)" -ForegroundColor Green
Write-Host ""

# URI MongoDB
$mongoUri = "mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync"

# Chemin du script
$scriptPath = Join-Path $PSScriptRoot "fix-orders-mongodb.js"

if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script introuvable: fix-orders-mongodb.js" -ForegroundColor Red
    Write-Host "   Chemin attendu: $scriptPath" -ForegroundColor Gray
    exit 1
}

Write-Host "Script MongoDB: fix-orders-mongodb.js" -ForegroundColor Gray
Write-Host ""

# Confirmation
Write-Host "Ce script va:" -ForegroundColor Yellow
Write-Host "   1. Creer un backup des commandes du 11/02" -ForegroundColor White
Write-Host "   2. Recuperer assignedCarrier depuis Data Lake" -ForegroundColor White
Write-Host "   3. Mettre a jour les commandes Symphonia" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continuer? (o/N)"

if ($confirm -ne "o" -and $confirm -ne "O" -and $confirm -ne "oui") {
    Write-Host ""
    Write-Host "Annule" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Execution du script MongoDB..." -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Gray
Write-Host ""

# Executer mongosh avec le script
& mongosh $mongoUri --file $scriptPath

$exitCode = $LASTEXITCODE

Write-Host ""
Write-Host "===============================================================" -ForegroundColor Gray
Write-Host ""

if ($exitCode -eq 0) {
    Write-Host "OK Script execute avec succes!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verifier dans Symphonia que les commandes du 11/02 affichent:" -ForegroundColor White
    Write-Host "  - Nom du chauffeur" -ForegroundColor Gray
    Write-Host "  - Plaque du vehicule" -ForegroundColor Gray
    Write-Host "  - Nom du transporteur" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "ERROR lors de l'execution (code: $exitCode)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifier:" -ForegroundColor Yellow
    Write-Host "  - Connexion MongoDB Atlas" -ForegroundColor Gray
    Write-Host "  - Credentials correctes" -ForegroundColor Gray
    Write-Host "  - Access IP Atlas" -ForegroundColor Gray
    Write-Host ""
}
