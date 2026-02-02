@echo off
REM Script de déploiement et vérification du test E2E (Windows)
REM Usage: deploy-e2e-test.bat [environment]
REM Environments: dev, staging, prod (default: prod)

setlocal enabledelayedexpansion

set ENV=%1
if "%ENV%"=="" set ENV=prod

echo ===============================================================
echo   DEPLOIEMENT TEST E2E SYMPHONI.A
echo   Environment: %ENV%
echo ===============================================================
echo.

REM Vérification Node.js
echo [INFO] Verification Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js n'est pas installe
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [SUCCESS] Node.js installe: %NODE_VERSION%

REM Vérification des dépendances
echo.
echo [INFO] Verification des dependances npm...
if not exist "node_modules" (
    echo [WARNING] node_modules manquant, installation...
    call npm install axios @faker-js/faker form-data
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Erreur installation dependances
        exit /b 1
    )
    echo [SUCCESS] Dependances installees
) else (
    echo [SUCCESS] Dependances presentes
)

REM Vérification des fichiers
echo.
echo [INFO] Verification des fichiers...

set FILES=test-e2e-grandeur-nature.cjs classes\AgentIndustriel.js classes\AgentTransporteur.js classes\AgentDestinataire.js utils\test-helpers.js utils\data-generators.js
set MISSING_FILES=0

for %%f in (%FILES%) do (
    if exist "%%f" (
        echo [SUCCESS] Fichier present: %%f
    ) else (
        echo [ERROR] Fichier manquant: %%f
        set /a MISSING_FILES+=1
    )
)

if %MISSING_FILES% gtr 0 (
    echo [ERROR] %MISSING_FILES% fichier(s) manquant(s)
    exit /b 1
)

REM Création du répertoire reports
echo.
echo [INFO] Verification repertoire reports...
if not exist "reports" (
    mkdir reports
    echo [SUCCESS] Repertoire reports cree
) else (
    echo [SUCCESS] Repertoire reports existant
)

REM Test de syntaxe JavaScript
echo.
echo [INFO] Verification syntaxe JavaScript...
node -c test-e2e-grandeur-nature.cjs >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Erreur de syntaxe dans test-e2e-grandeur-nature.cjs
    exit /b 1
)
echo [SUCCESS] Syntaxe JavaScript valide

REM Résumé
echo.
echo ===============================================================
echo   RESUME DE VERIFICATION
echo ===============================================================
echo.
echo   Node.js: %NODE_VERSION%
echo   Fichiers: OK
echo   Repertoire reports: OK
echo.

REM Option pour lancer le test
set /p LAUNCH="Lancer le test E2E maintenant? (Y/N) "
if /i "%LAUNCH%"=="Y" (
    echo.
    echo [INFO] Lancement du test E2E...
    echo.
    node test-e2e-grandeur-nature.cjs

    if %ERRORLEVEL% equ 0 (
        echo.
        echo [SUCCESS] Test E2E termine avec succes!

        REM Afficher le dernier rapport
        for /f "delims=" %%i in ('dir /b /o-d reports\e2e-report-*.json 2^>nul') do (
            set LATEST_REPORT=reports\%%i
            goto :found_report
        )
        :found_report
        if defined LATEST_REPORT (
            echo [INFO] Rapport genere: !LATEST_REPORT!
        )
    ) else (
        echo.
        echo [ERROR] Test E2E echoue (code: %ERRORLEVEL%^)
        exit /b %ERRORLEVEL%
    )
) else (
    echo.
    echo [INFO] Test non lance. Pour lancer manuellement:
    echo   cd %CD%
    echo   node test-e2e-grandeur-nature.cjs
)

echo.
echo [SUCCESS] Deploiement termine!

endlocal
