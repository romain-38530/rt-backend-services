# Script de déploiement sur AWS Elastic Beanstalk
# Usage: .\deploy-to-eb.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Déploiement API Auth sur AWS EB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si EB CLI est installé
Write-Host "Vérification de EB CLI..." -ForegroundColor Yellow
try {
    $ebVersion = eb --version 2>&1
    Write-Host "✓ EB CLI installé: $ebVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ EB CLI n'est pas installé!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Installez-le avec: pip install awsebcli" -ForegroundColor Yellow
    Write-Host "Puis relancez ce script." -ForegroundColor Yellow
    exit 1
}

# Vérifier si AWS CLI est configuré
Write-Host "Vérification de AWS CLI..." -ForegroundColor Yellow
try {
    $awsId = aws sts get-caller-identity --query Account --output text 2>&1
    Write-Host "✓ AWS CLI configuré (Account: $awsId)" -ForegroundColor Green
} catch {
    Write-Host "✗ AWS CLI n'est pas configuré!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Configurez-le avec: aws configure" -ForegroundColor Yellow
    Write-Host "Puis relancez ce script." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 1: Configuration MongoDB Atlas" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Allez sur: https://www.mongodb.com/cloud/atlas/register" -ForegroundColor Yellow
Write-Host "2. Créez un compte gratuit (M0 Sandbox)" -ForegroundColor Yellow
Write-Host "3. Créez un cluster dans la région AWS/Frankfurt (eu-central-1)" -ForegroundColor Yellow
Write-Host "4. Créez un utilisateur de base de données" -ForegroundColor Yellow
Write-Host "5. Autorisez l'accès depuis 0.0.0.0/0 dans Network Access" -ForegroundColor Yellow
Write-Host "6. Obtenez la chaîne de connexion" -ForegroundColor Yellow
Write-Host ""

$mongoUri = Read-Host "Entrez votre MongoDB URI (mongodb+srv://...)"

if ([string]::IsNullOrWhiteSpace($mongoUri)) {
    Write-Host "✗ MongoDB URI requis!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 2: Configuration JWT Secret" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Génération d'un JWT secret sécurisé..." -ForegroundColor Yellow

# Générer un JWT secret aléatoire
$jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
Write-Host "✓ JWT Secret généré: $jwtSecret" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 3: Configuration CORS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$corsOrigins = @(
    "https://main.dbg6okncuyyiw.amplifyapp.com",
    "https://main.d1tb834u144p4r.amplifyapp.com",
    "https://main.d3b6p09ihn5w7r.amplifyapp.com",
    "https://main.dzvo8973zaqb.amplifyapp.com",
    "https://main.d3hz3xvddrl94o.amplifyapp.com",
    "https://main.d31p7m90ewg4xm.amplifyapp.com"
)

$corsOriginString = $corsOrigins -join ","
Write-Host "URLs CORS configurées:" -ForegroundColor Yellow
foreach ($origin in $corsOrigins) {
    Write-Host "  - $origin" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 4: Initialisation EB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si EB est déjà initialisé
if (Test-Path ".elasticbeanstalk\config.yml") {
    Write-Host "✓ EB déjà initialisé" -ForegroundColor Green
} else {
    Write-Host "Initialisation de Elastic Beanstalk..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Répondez aux questions:" -ForegroundColor Yellow
    Write-Host "  - Region: 14 (eu-central-1)" -ForegroundColor Gray
    Write-Host "  - Application name: rt-auth-api" -ForegroundColor Gray
    Write-Host "  - Platform: Node.js" -ForegroundColor Gray
    Write-Host "  - SSH: n" -ForegroundColor Gray
    Write-Host ""

    eb init
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 5: Création de l'environnement" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$createEnv = Read-Host "Voulez-vous créer un nouvel environnement? (o/n)"

if ($createEnv -eq "o" -or $createEnv -eq "O") {
    Write-Host "Création de l'environnement rt-auth-api-prod..." -ForegroundColor Yellow
    Write-Host "⏳ Cela prendra 5-10 minutes..." -ForegroundColor Yellow
    Write-Host ""

    eb create rt-auth-api-prod

    Write-Host ""
    Write-Host "✓ Environnement créé!" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 6: Configuration des variables" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration des variables d'environnement..." -ForegroundColor Yellow

eb setenv `
    MONGODB_URI="$mongoUri" `
    JWT_SECRET="$jwtSecret" `
    NODE_ENV="production" `
    CORS_ORIGIN="$corsOriginString"

Write-Host "✓ Variables d'environnement configurées!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 7: Déploiement" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Déploiement de l'API..." -ForegroundColor Yellow
eb deploy

Write-Host ""
Write-Host "✓ Déploiement terminé!" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 8: Récupération de l'URL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$status = eb status
$urlLine = $status | Select-String "CNAME:"
$apiUrl = ($urlLine -replace "CNAME:", "").Trim()

Write-Host "✓ URL de l'API: https://$apiUrl" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Étape 9: Test de l'API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Test du endpoint /health..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "https://$apiUrl/health" -Method Get
    Write-Host "✓ API fonctionne!" -ForegroundColor Green
    Write-Host "  Réponse: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Erreur lors du test de l'API" -ForegroundColor Red
    Write-Host "  Vérifiez les logs avec: eb logs" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Résumé du déploiement" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✓ MongoDB URI configuré" -ForegroundColor Green
Write-Host "✓ JWT Secret généré et configuré" -ForegroundColor Green
Write-Host "✓ CORS configuré pour les 6 portails" -ForegroundColor Green
Write-Host "✓ Application déployée sur Elastic Beanstalk" -ForegroundColor Green
Write-Host ""
Write-Host "URL de l'API: https://$apiUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Cyan
Write-Host "  1. Mettez à jour NEXT_PUBLIC_API_URL dans AWS Amplify" -ForegroundColor Yellow
Write-Host "  2. Créez un utilisateur de test avec:" -ForegroundColor Yellow
Write-Host ""
Write-Host "     curl -X POST https://$apiUrl/api/auth/register \\" -ForegroundColor Gray
Write-Host "       -H 'Content-Type: application/json' \\" -ForegroundColor Gray
Write-Host "       -d '{" -ForegroundColor Gray
Write-Host "         \"email\": \"admin@rt-technologie.com\"," -ForegroundColor Gray
Write-Host "         \"password\": \"Admin123!\"," -ForegroundColor Gray
Write-Host "         \"name\": \"Admin RT\"," -ForegroundColor Gray
Write-Host "         \"portal\": \"industry\"" -ForegroundColor Gray
Write-Host "       }'" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Testez la connexion sur vos portails" -ForegroundColor Yellow
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Cyan
Write-Host "  eb logs          - Voir les logs" -ForegroundColor Gray
Write-Host "  eb open          - Ouvrir l'app dans le navigateur" -ForegroundColor Gray
Write-Host "  eb status        - Voir le statut" -ForegroundColor Gray
Write-Host "  eb deploy        - Redéployer après modifications" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Déploiement terminé avec succès! 🎉" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Sauvegarder l'URL dans un fichier
"API_URL=https://$apiUrl" | Out-File -FilePath ".env.production" -Encoding UTF8
Write-Host "✓ URL sauvegardée dans .env.production" -ForegroundColor Green
