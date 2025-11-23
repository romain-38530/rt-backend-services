@echo off
echo ========================================
echo Starting RT Technologie Infrastructure
echo ========================================
echo.

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running!
    echo Please start Docker Desktop first.
    echo.
    pause
    exit /b 1
)

echo [OK] Docker is running
echo.

echo Starting MongoDB and Redis...
docker compose up -d mongodb redis

if errorlevel 1 (
    echo [ERROR] Failed to start containers
    pause
    exit /b 1
)

echo.
echo ========================================
echo Infrastructure Started Successfully!
echo ========================================
echo.
echo MongoDB: localhost:27017
echo   - Username: admin
echo   - Password: admin123
echo   - Database: rt-technologie
echo.
echo Redis: localhost:6379
echo.
echo Waiting for services to be ready...
timeout /t 5 /nobreak >nul

echo.
echo Checking MongoDB connection...
docker exec rt-mongodb mongosh --eval "db.adminCommand('ping')" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] MongoDB is still starting...
) else (
    echo [OK] MongoDB is ready!
)

echo.
echo Checking Redis connection...
docker exec rt-redis redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Redis is still starting...
) else (
    echo [OK] Redis is ready!
)

echo.
echo ========================================
echo You can now start the backend services:
echo   pnpm dev
echo ========================================
echo.
pause
