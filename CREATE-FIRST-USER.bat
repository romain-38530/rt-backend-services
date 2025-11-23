@echo off
echo ========================================
echo Create First Admin User
echo ========================================
echo.

REM Check if authz service is running
curl -s http://localhost:3002/health >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Auth service is not running!
    echo Please start the backend services first:
    echo   pnpm dev
    echo.
    pause
    exit /b 1
)

echo Creating admin user...
echo.

curl -X POST http://localhost:3002/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@rt-technologie.com\",\"password\":\"Admin123\",\"firstName\":\"Admin\",\"lastName\":\"RT\",\"type\":\"ADMIN\"}"

echo.
echo.
echo ========================================
echo Admin user created!
echo ========================================
echo.
echo Email: admin@rt-technologie.com
echo Password: Admin123
echo.
echo You can now login from your frontend:
echo   POST http://localhost:3001/api/v1/auth/login
echo.
pause
