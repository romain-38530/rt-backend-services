# Script de vérification du fix commandes 11/02
# Vérifie que MongoDB est connecté et lance la re-sync si nécessaire

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Vérification Fix Commandes 11/02" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier connexion MongoDB
Write-Host "[1/3] Vérification connexion MongoDB..." -ForegroundColor Yellow
$healthUrl = "http://awseb-e-z-AWSEBLoa-ZPJXYR9FE1NP-105816728.eu-central-1.elb.amazonaws.com/health"

try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 10

    if ($health.mongodb.connected) {
        Write-Host "      OK MongoDB connecté" -ForegroundColor Green
    } else {
        Write-Host "      ERREUR MongoDB non connecté" -ForegroundColor Red
        Write-Host ""
        Write-Host "Action requise:" -ForegroundColor Yellow
        Write-Host "  1. Aller sur https://cloud.mongodb.com" -ForegroundColor White
        Write-Host "  2. Network Access -> Add IP: 3.125.160.174/32" -ForegroundColor White
        Write-Host "  3. Attendre 2 minutes et relancer ce script" -ForegroundColor White
        Write-Host ""
        exit 1
    }
} catch {
    Write-Host "      ERREUR Impossible de contacter l'API" -ForegroundColor Red
    Write-Host "      $_" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# 2. Vérifier version déployée
Write-Host "[2/3] Vérification version déployée..." -ForegroundColor Yellow
$version = $health.version
Write-Host "      Version: $version" -ForegroundColor Gray

if ($version -eq "2.8.0") {
    Write-Host "      OK Version correcte avec fix assignedCarrier" -ForegroundColor Green
} else {
    Write-Host "      WARNING Version inattendue: $version" -ForegroundColor Yellow
}

Write-Host ""

# 3. Proposer re-sync
Write-Host "[3/3] Re-synchronisation des commandes..." -ForegroundColor Yellow
Write-Host ""
$response = Read-Host "Lancer la re-synchronisation du 11 au 15 février? (o/N)"

if ($response -eq "o" -or $response -eq "O" -or $response -eq "oui") {
    Write-Host ""
    Write-Host "Lancement de la re-synchronisation..." -ForegroundColor Cyan
    Write-Host ""

    $scriptPath = Join-Path $PSScriptRoot "force-resync-orders.js"

    if (Test-Path $scriptPath) {
        node $scriptPath 2026-02-11 2026-02-15

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Green
            Write-Host "Re-synchronisation terminée avec succès!" -ForegroundColor Green
            Write-Host "============================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "Les commandes du 11/02 devraient maintenant afficher:" -ForegroundColor White
            Write-Host "  - Nom du chauffeur" -ForegroundColor Gray
            Write-Host "  - Plaque du véhicule" -ForegroundColor Gray
            Write-Host "  - Nom du transporteur" -ForegroundColor Gray
            Write-Host ""
        } else {
            Write-Host ""
            Write-Host "ERREUR lors de la re-synchronisation" -ForegroundColor Red
            Write-Host "Vérifier les logs ci-dessus pour plus de détails" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "ERREUR Script force-resync-orders.js introuvable" -ForegroundColor Red
        Write-Host "Chemin attendu: $scriptPath" -ForegroundColor Gray
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "Re-synchronisation annulée" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour lancer manuellement plus tard:" -ForegroundColor White
    Write-Host "  cd '$PSScriptRoot'" -ForegroundColor Gray
    Write-Host "  node force-resync-orders.js 2026-02-11 2026-02-15" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Terminé!" -ForegroundColor Cyan
