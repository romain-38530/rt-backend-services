# ==============================================
# Script de Déploiement Automatique - Services Manquants
# PowerShell Version pour Windows
# ==============================================

$ErrorActionPreference = "Stop"

# Configuration
$REGION = "eu-central-1"
$PLATFORM = "Node.js 20 running on 64bit Amazon Linux 2023"
$INSTANCE_TYPE = "t3.micro"
$MONGODB_BASE_URI = "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net"
$CORS_ORIGINS = "http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"
$JWT_SECRET = "rt-super-secret-jwt-key-2024"

# Services à déployer
$SERVICES = @{
    "tracking-api" = @{App="rt-tracking-api"; Port=3012; DB="rt-tracking"}
    "appointments-api" = @{App="rt-appointments-api"; Port=3013; DB="rt-appointments"}
    "documents-api" = @{App="rt-documents-api"; Port=3014; DB="rt-documents"}
    "scoring-api" = @{App="rt-scoring-api"; Port=3016; DB="rt-scoring"}
    "affret-ia-api-v2" = @{App="rt-affret-ia-api"; Port=3017; DB="rt-affret-ia"}
    "websocket-api" = @{App="rt-websocket-api"; Port=3010; DB="rt-websocket"}
}

Write-Host "==================================================" -ForegroundColor Blue
Write-Host "🚀 DÉPLOIEMENT AUTOMATIQUE DES SERVICES MANQUANTS" -ForegroundColor Blue
Write-Host "==================================================" -ForegroundColor Blue
Write-Host ""

# Vérifier prérequis
Write-Host "📋 Vérification des prérequis..." -ForegroundColor Yellow

$awsInstalled = Get-Command aws -ErrorAction SilentlyContinue
if (-not $awsInstalled) {
    Write-Host "❌ AWS CLI non installé" -ForegroundColor Red
    Write-Host "   Téléchargez depuis: https://awscli.amazonaws.com/AWSCLIV2.msi" -ForegroundColor Yellow
    exit 1
}

$ebInstalled = Get-Command eb -ErrorAction SilentlyContinue
if (-not $ebInstalled) {
    Write-Host "❌ EB CLI non installé" -ForegroundColor Red
    Write-Host "   Installez avec: pip install awsebcli" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Prérequis OK" -ForegroundColor Green
Write-Host ""

# Aller dans le dossier services
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location "$SCRIPT_DIR\services"
$SERVICES_DIR = Get-Location

# Fichier pour stocker les URLs
$URLS_FILE = "$SCRIPT_DIR\DEPLOYED_URLS.txt"
Clear-Content -Path $URLS_FILE -ErrorAction SilentlyContinue
New-Item -Path $URLS_FILE -ItemType File -Force | Out-Null

Write-Host "📦 Services à déployer: $($SERVICES.Count)" -ForegroundColor Blue
Write-Host ""

# Déployer chaque service
foreach ($SERVICE_DIR in $SERVICES.Keys) {
    $service = $SERVICES[$SERVICE_DIR]
    $APP_NAME = $service.App
    $PORT = $service.Port
    $DB_NAME = $service.DB

    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host "🚀 Déploiement: $SERVICE_DIR" -ForegroundColor Blue
    Write-Host "   App: $APP_NAME" -ForegroundColor Blue
    Write-Host "   Port: $PORT" -ForegroundColor Blue
    Write-Host "   DB: $DB_NAME" -ForegroundColor Blue
    Write-Host "==================================================" -ForegroundColor Blue

    # Vérifier que le dossier existe
    if (-not (Test-Path "$SERVICES_DIR\$SERVICE_DIR")) {
        Write-Host "❌ Dossier $SERVICE_DIR introuvable" -ForegroundColor Red
        continue
    }

    Set-Location "$SERVICES_DIR\$SERVICE_DIR"

    # Vérifier fichiers requis
    $hasIndexJs = Test-Path "index.js"
    $hasServerJs = Test-Path "server.js"

    if (-not $hasIndexJs -and -not $hasServerJs) {
        Write-Host "❌ Pas de index.js ou server.js trouvé" -ForegroundColor Red
        continue
    }

    if (-not (Test-Path "package.json")) {
        Write-Host "❌ Pas de package.json trouvé" -ForegroundColor Red
        continue
    }

    # Créer Procfile si nécessaire
    if (-not (Test-Path "Procfile")) {
        Write-Host "📝 Création du Procfile..." -ForegroundColor Yellow
        if ($hasIndexJs) {
            "web: node index.js" | Out-File -FilePath "Procfile" -Encoding ASCII
        } else {
            "web: node server.js" | Out-File -FilePath "Procfile" -Encoding ASCII
        }
    }

    # Initialiser EB
    Write-Host "📦 Initialisation EB..." -ForegroundColor Yellow
    try {
        eb init -p $PLATFORM -r $REGION $APP_NAME
    } catch {
        Write-Host "⚠️  Avertissement lors de l'init EB" -ForegroundColor Yellow
    }

    # Vérifier si l'environnement existe déjà
    $ENV_NAME = "$APP_NAME-prod"
    $envExists = $false

    try {
        $ebList = eb list 2>&1
        if ($ebList -match $ENV_NAME) {
            $envExists = $true
        }
    } catch {
        $envExists = $false
    }

    if ($envExists) {
        Write-Host "⚠️  Environnement $ENV_NAME existe déjà" -ForegroundColor Yellow
        Write-Host "🔄 Redéploiement..." -ForegroundColor Yellow
        try {
            eb deploy $ENV_NAME
        } catch {
            Write-Host "❌ Échec du redéploiement" -ForegroundColor Red
        }
    } else {
        # Créer nouvel environnement
        Write-Host "🏗️  Création de l'environnement..." -ForegroundColor Yellow
        try {
            eb create $ENV_NAME --instance-type $INSTANCE_TYPE --single --timeout 20
        } catch {
            Write-Host "❌ Échec de la création de l'environnement" -ForegroundColor Red
            continue
        }
    }

    # Configurer variables d'environnement
    Write-Host "⚙️  Configuration des variables d'environnement..." -ForegroundColor Yellow
    $MONGODB_URI = "$MONGODB_BASE_URI/$DB_NAME`?retryWrites=true&w=majority"

    try {
        eb setenv `
            NODE_ENV="production" `
            PORT="$PORT" `
            MONGODB_URI="$MONGODB_URI" `
            CORS_ALLOWED_ORIGINS="$CORS_ORIGINS" `
            JWT_SECRET="$JWT_SECRET" `
            LOG_LEVEL="info"
    } catch {
        Write-Host "⚠️  Avertissement lors de la config" -ForegroundColor Yellow
    }

    # Récupérer l'URL
    Write-Host "🔍 Récupération de l'URL..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    try {
        $status = eb status
        $URL = ($status | Select-String "CNAME:" | ForEach-Object { $_.Line.Split(":")[1].Trim() })

        if ($URL) {
            Write-Host "✅ $SERVICE_DIR déployé avec succès!" -ForegroundColor Green
            Write-Host "   URL: http://$URL" -ForegroundColor Green
            Write-Host "   Health: http://$URL/health" -ForegroundColor Green
            Write-Host ""

            # Sauvegarder l'URL
            "$SERVICE_DIR|$APP_NAME|http://$URL|$PORT" | Add-Content -Path $URLS_FILE

            # Tester le health check
            Write-Host "🏥 Test du health check..." -ForegroundColor Yellow
            Start-Sleep -Seconds 10

            try {
                $response = Invoke-WebRequest -Uri "http://$URL/health" -UseBasicParsing -TimeoutSec 10
                if ($response.StatusCode -eq 200) {
                    Write-Host "✅ Health check OK" -ForegroundColor Green
                }
            } catch {
                Write-Host "⚠️  Health check échoué (le service peut encore démarrer)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "❌ Impossible de récupérer l'URL" -ForegroundColor Red
        }
    } catch {
        Write-Host "❌ Erreur lors de la récupération de l'URL" -ForegroundColor Red
    }

    Write-Host ""
    Set-Location $SERVICES_DIR
}

# Résumé final
Write-Host "==================================================" -ForegroundColor Blue
Write-Host "🎉 DÉPLOIEMENT TERMINÉ" -ForegroundColor Blue
Write-Host "==================================================" -ForegroundColor Blue
Write-Host ""

if ((Test-Path $URLS_FILE) -and ((Get-Content $URLS_FILE).Length -gt 0)) {
    Write-Host "📝 URLs des services déployés:" -ForegroundColor Green
    Write-Host ""

    Get-Content $URLS_FILE | ForEach-Object {
        $parts = $_ -split '\|'
        $service = $parts[0]
        $app = $parts[1]
        $url = $parts[2]
        $port = $parts[3]

        Write-Host "  ✅ $service" -ForegroundColor Green
        Write-Host "     App: $app"
        Write-Host "     URL: $url"
        Write-Host "     Port: $port"
        Write-Host "     Health: $url/health"
        Write-Host ""
    }

    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host "📋 PROCHAINES ÉTAPES" -ForegroundColor Blue
    Write-Host "==================================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "1. Copier les URLs ci-dessus"
    Write-Host "2. Mettre à jour rt-frontend-apps\amplify.yml avec ces URLs"
    Write-Host "3. Committer et pusher les changements"
    Write-Host "4. AWS Amplify redéploiera automatiquement le frontend"
    Write-Host ""
    Write-Host "💡 Les URLs ont été sauvegardées dans: $URLS_FILE" -ForegroundColor Yellow
} else {
    Write-Host "❌ Aucun service déployé avec succès" -ForegroundColor Red
}

Write-Host ""
Write-Host "✨ Script terminé!" -ForegroundColor Green
