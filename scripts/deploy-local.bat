@echo off
REM Script de déploiement local simplifié pour Symphonia Platform
REM Version: 2.2.0
REM Date: 2026-02-01

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║    SYMPHONIA PLATFORM - DEPLOIEMENT LOCAL           ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo Version: 2.2.0
echo Date: %date% %time%
echo.

echo ====================================
echo Installation des dépendances
echo ====================================
echo.

cd /d "%~dp0.."
echo [INFO] Installation des dépendances racine...
call pnpm install
if errorlevel 1 (
    echo [ERROR] Échec de l'installation des dépendances
    exit /b 1
)

echo.
echo ====================================
echo Création des packages de déploiement
echo ====================================
echo.

echo [INFO] Création du répertoire deploy...
if not exist deploy mkdir deploy
if not exist deploy\packages mkdir deploy\packages

REM TMS Sync EB
echo.
echo [1/3] Package TMS Sync EB...
cd services\tms-sync-eb
if exist "deploy-package.zip" del "deploy-package.zip"
powershell -Command "Compress-Archive -Path *, .ebextensions, .platform -DestinationPath ..\..\deploy\packages\tms-sync-eb.zip -Force"
echo ✓ Package créé: deploy\packages\tms-sync-eb.zip
cd ..\..

REM Authz EB
echo.
echo [2/3] Package Authz EB...
cd services\authz-eb
if exist "deploy-package.zip" del "deploy-package.zip"
powershell -Command "Compress-Archive -Path *, routes, scripts, .ebextensions, .platform -DestinationPath ..\..\deploy\packages\authz-eb.zip -Force"
echo ✓ Package créé: deploy\packages\authz-eb.zip
cd ..\..

REM Affret IA API v2
echo.
echo [3/3] Package Affret IA API v2...
cd services\affret-ia-api-v2
if exist "deploy-package.zip" del "deploy-package.zip"
powershell -Command "Compress-Archive -Path *, routes, models, .ebextensions, .platform -DestinationPath ..\..\deploy\packages\affret-ia-api-v2.zip -Force"
echo ✓ Package créé: deploy\packages\affret-ia-api-v2.zip
cd ..\..

echo.
echo ====================================
echo Vérification des packages
echo ====================================
echo.

for %%f in (deploy\packages\*.zip) do (
    echo ✓ %%f - %~zf bytes
)

echo.
echo ====================================
echo Création du rapport de déploiement
echo ====================================
echo.

echo Générant le rapport...
(
    echo RAPPORT DE DÉPLOIEMENT SYMPHONIA PLATFORM
    echo ==========================================
    echo.
    echo Date: %date% %time%
    echo Version: 2.2.0
    echo.
    echo PACKAGES CRÉÉS:
    echo ---------------
    for %%f in (deploy\packages\*.zip^) do echo   - %%f
    echo.
    echo SERVICES INCLUS:
    echo ----------------
    echo   1. TMS Sync EB
    echo      - Cache Redis avec fallback mémoire
    echo      - Système de monitoring (5min)
    echo      - Alertes SMS/Email via SNS/SES
    echo      - CloudWatch metrics
    echo.
    echo   2. Authz EB
    echo      - Webhooks carriers (HMAC-SHA256)
    echo      - Email metrics et analytics
    echo      - Carrier scoring (leaderboard, benchmark)
    echo      - Alertes documents expirants (9h daily)
    echo      - CloudWatch metrics
    echo.
    echo   3. Affret IA API v2
    echo      - Analytics conversion (funnel tracking)
    echo      - Blockers analysis
    echo      - Timeline et journey tracking
    echo      - CloudWatch metrics
    echo.
    echo COLLECTIONS MONGODB REQUISES:
    echo -----------------------------
    echo   - monitoring_logs (tms-sync-eb)
    echo   - notification_logs (authz-eb)
    echo   - carrier_webhooks (authz-eb)
    echo   - webhook_deliveries (authz-eb)
    echo   - email_logs (authz-eb)
    echo   - affretia_trial_tracking (affret-ia-api-v2)
    echo.
    echo VARIABLES D'ENVIRONNEMENT:
    echo --------------------------
    echo   Voir DEPLOYMENT_GUIDE.md section "Environment Variables"
    echo.
    echo NEXT STEPS:
    echo -----------
    echo   1. Configurer AWS (SES, SNS, S3, CloudWatch, Redis)
    echo   2. Créer les applications Elastic Beanstalk
    echo   3. Uploader les packages via EB CLI ou console AWS
    echo   4. Configurer les variables d'environnement
    echo   5. Démarrer les applications
    echo   6. Exécuter les tests E2E
    echo.
) > deploy\deployment-report.txt

echo ✓ Rapport créé: deploy\deployment-report.txt

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║              DÉPLOIEMENT LOCAL TERMINÉ               ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo 📦 Packages prêts dans: deploy\packages\
echo 📋 Rapport: deploy\deployment-report.txt
echo 📖 Guide: DEPLOYMENT_GUIDE.md
echo.
echo Pour déployer sur AWS:
echo   1. Configurer AWS CLI: aws configure
echo   2. Créer applications EB via console AWS
echo   3. Uploader les packages ZIP
echo.

pause
