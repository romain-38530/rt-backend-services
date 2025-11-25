# Configuration rapide MongoDB Atlas
# Ce script configure un URI MongoDB Atlas par défaut

$mongoUri = "mongodb+srv://rt-admin:RtBackend2025!@rt-cluster.mongodb.net/rt-subscriptions-contracts?retryWrites=true&w=majority"

Write-Host "`n=== Configuration Rapide MongoDB Atlas ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "URI à configurer: $mongoUri" -ForegroundColor Yellow
Write-Host ""

# Configurer
Write-Host "Configuration sur Elastic Beanstalk..." -ForegroundColor Yellow

aws elasticbeanstalk update-environment `
    --application-name subscriptions-contracts-eb `
    --environment-name rt-subscriptions-api-prod `
    --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="$mongoUri"

Write-Host "`n✅ Configuré! Redémarrage en cours..." -ForegroundColor Green
Write-Host ""

# Attendre et tester
Write-Host "Attente de 90 secondes pour le redémarrage..." -ForegroundColor Yellow
Start-Sleep -Seconds 90

Write-Host "`nTest de connexion..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Uri "https://dgze8l03lwl5h.cloudfront.net/health" -Method Get

Write-Host "`nRésultat:" -ForegroundColor Green
$response | ConvertTo-Json -Depth 3

if ($response.mongodb.connected) {
    Write-Host "`n✅ MongoDB Atlas connecté!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  MongoDB pas connecté - vérifie l'URI Atlas" -ForegroundColor Yellow
}
