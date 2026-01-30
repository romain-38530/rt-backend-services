@echo off
REM Script de test pour le système de vigilance des carriers (Windows)

echo ======================================
echo TEST SYSTEME DE VIGILANCE - TMS SYNC
echo ======================================
echo.

set API_URL=http://localhost:3000

echo [1] Synchronisation des carriers depuis Dashdoc
echo POST %API_URL%/api/v1/jobs/carriersSync/run
curl -X POST "%API_URL%/api/v1/jobs/carriersSync/run"
echo.
timeout /t 2 /nobreak >nul

echo [2] Mise a jour des scores de vigilance
echo POST %API_URL%/api/v1/tms/carriers/vigilance/update-all
curl -X POST "%API_URL%/api/v1/tms/carriers/vigilance/update-all"
echo.
timeout /t 2 /nobreak >nul

echo [3] Recuperation de tous les carriers
echo GET %API_URL%/api/v1/tms/carriers?limit=10
curl -s "%API_URL%/api/v1/tms/carriers?limit=10"
echo.

echo [4] Statistiques de vigilance
echo GET %API_URL%/api/v1/tms/carriers/vigilance/stats
curl -s "%API_URL%/api/v1/tms/carriers/vigilance/stats"
echo.

echo [5] Filtrer les carriers N1-Premium
echo GET %API_URL%/api/v1/tms/carriers?level=N1_premium^&limit=5
curl -s "%API_URL%/api/v1/tms/carriers?level=N1_premium&limit=5"
echo.

echo [6] Filtrer les carriers N1-Reference
echo GET %API_URL%/api/v1/tms/carriers?level=N1_referenced^&limit=5
curl -s "%API_URL%/api/v1/tms/carriers?level=N1_referenced&limit=5"
echo.

echo [7] Recherche de carriers
echo GET %API_URL%/api/v1/tms/carriers?search=ACME
curl -s "%API_URL%/api/v1/tms/carriers?search=ACME"
echo.

echo [8] Statut des jobs
echo GET %API_URL%/api/v1/jobs/status
curl -s "%API_URL%/api/v1/jobs/status"
echo.

echo ======================================
echo TESTS TERMINES
echo ======================================
pause
