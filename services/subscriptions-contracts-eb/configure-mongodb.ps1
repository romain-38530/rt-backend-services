# Script de configuration MongoDB Atlas pour subscriptions-contracts-eb
# Version: 1.0.0

Write-Host "`n=== Configuration MongoDB Atlas ===" -ForegroundColor Cyan
Write-Host ""

# Option 1: Utiliser un cluster existant
Write-Host "Option 1: Si tu as déjà un cluster MongoDB Atlas" -ForegroundColor Yellow
Write-Host "Format de l'URI: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>" -ForegroundColor White
Write-Host ""

# Option 2: Créer un nouveau cluster gratuit
Write-Host "Option 2: Créer un nouveau cluster gratuit (M0)" -ForegroundColor Yellow
Write-Host "1. Aller sur https://cloud.mongodb.com/" -ForegroundColor White
Write-Host "2. Créer un compte ou se connecter" -ForegroundColor White
Write-Host "3. Créer un cluster gratuit (M0) dans eu-central-1" -ForegroundColor White
Write-Host "4. Créer un utilisateur de base de données" -ForegroundColor White
Write-Host "5. Ajouter '0.0.0.0/0' dans Network Access (ou IP de ton EB)" -ForegroundColor White
Write-Host "6. Obtenir l'URI de connexion" -ForegroundColor White
Write-Host ""

# Demander l'URI
$mongoUri = Read-Host "Entre ton URI MongoDB Atlas (ou appuie sur Entrée pour utiliser un template)"

if ([string]::IsNullOrWhiteSpace($mongoUri)) {
    Write-Host "`nUtilisation d'un URI template..." -ForegroundColor Yellow
    $mongoUri = "mongodb+srv://rt-admin:<PASSWORD>@rt-cluster.xxxxx.mongodb.net/rt-subscriptions-contracts?retryWrites=true&w=majority"
    Write-Host "URI Template: $mongoUri" -ForegroundColor White
    Write-Host "`n⚠️  IMPORTANT: Remplace <PASSWORD> et le cluster name par tes vraies valeurs!" -ForegroundColor Red
    Write-Host ""

    $continue = Read-Host "Veux-tu continuer avec cet URI template? (o/n)"
    if ($continue -ne "o") {
        Write-Host "Configuration annulée." -ForegroundColor Yellow
        exit
    }
}

Write-Host "`n=== Configuration de l'environnement Elastic Beanstalk ===" -ForegroundColor Cyan

# Configurer via AWS CLI
try {
    Write-Host "Configuration de MONGODB_URI sur rt-subscriptions-api-prod..." -ForegroundColor Yellow

    aws elasticbeanstalk update-environment `
        --application-name subscriptions-contracts-eb `
        --environment-name rt-subscriptions-api-prod `
        --option-settings Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="$mongoUri"

    Write-Host "`n✅ MongoDB URI configuré avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ L'environnement va redémarrer (1-2 minutes)..." -ForegroundColor Yellow
    Write-Host ""

    # Attendre le redémarrage
    Write-Host "Attente du redémarrage..." -ForegroundColor Yellow
    Start-Sleep -Seconds 60

    # Tester la connexion
    Write-Host "`n=== Test de la connexion MongoDB ===" -ForegroundColor Cyan
    Write-Host "Test de l'endpoint health..." -ForegroundColor Yellow

    Start-Sleep -Seconds 30

    $maxRetries = 5
    $retryCount = 0
    $success = $false

    while ($retryCount -lt $maxRetries -and -not $success) {
        try {
            $response = Invoke-RestMethod -Uri "https://dgze8l03lwl5h.cloudfront.net/health" -Method Get -TimeoutSec 10

            Write-Host "`nRésultat:" -ForegroundColor Green
            Write-Host "Status: $($response.status)" -ForegroundColor White
            Write-Host "MongoDB Status: $($response.mongodb.status)" -ForegroundColor White
            Write-Host "MongoDB Connected: $($response.mongodb.connected)" -ForegroundColor White

            if ($response.mongodb.connected) {
                Write-Host "`n✅ MongoDB Atlas connecté avec succès!" -ForegroundColor Green
                $success = $true
            } else {
                Write-Host "`n⚠️  MongoDB pas encore connecté, nouvelle tentative..." -ForegroundColor Yellow
                $retryCount++
                Start-Sleep -Seconds 15
            }
        } catch {
            Write-Host "⚠️  Erreur lors du test, nouvelle tentative ($retryCount/$maxRetries)..." -ForegroundColor Yellow
            $retryCount++
            Start-Sleep -Seconds 15
        }
    }

    if (-not $success) {
        Write-Host "`n⚠️  MongoDB ne se connecte pas encore. Vérifications à faire:" -ForegroundColor Yellow
        Write-Host "1. Vérifie que l'URI est correct" -ForegroundColor White
        Write-Host "2. Vérifie que le mot de passe ne contient pas de caractères spéciaux non-encodés" -ForegroundColor White
        Write-Host "3. Vérifie que 0.0.0.0/0 est autorisé dans Network Access (MongoDB Atlas)" -ForegroundColor White
        Write-Host "4. Vérifie que l'utilisateur existe dans Database Access" -ForegroundColor White
        Write-Host ""
        Write-Host "Pour réessayer:" -ForegroundColor Cyan
        Write-Host "  .\configure-mongodb.ps1" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "=== Configuration terminée ===" -ForegroundColor Cyan

} catch {
    Write-Host "`n❌ Erreur lors de la configuration: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Vérifications:" -ForegroundColor Yellow
    Write-Host "1. AWS CLI est configuré avec les bonnes credentials" -ForegroundColor White
    Write-Host "2. Tu as les permissions pour modifier l'environnement EB" -ForegroundColor White
    Write-Host "3. L'environnement rt-subscriptions-api-prod existe" -ForegroundColor White
}

Write-Host ""
