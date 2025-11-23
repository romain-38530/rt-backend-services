# Automated deployment script for the 3 new services
# notifications, planning, geo-tracking

param(
    [switch]$SkipBuild,
    [switch]$OnlyBuild,
    [string]$Service = "all" # all, notifications, planning, geo-tracking
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RT Backend Services - Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Service configurations
$services = @(
    @{
        Name = "notifications"
        Port = 3004
        Database = "rt-notifications"
        ExtraEnvVars = @{
            "AWS_REGION" = "eu-central-1"
            "EMAIL_FROM" = "noreply@rt-technologie.com"
        }
    },
    @{
        Name = "planning"
        Port = 3005
        Database = "rt-planning"
        ExtraEnvVars = @{}
    },
    @{
        Name = "geo-tracking"
        Port = 3016
        Database = "rt-geotracking"
        ExtraEnvVars = @{
            "TOMTOM_API_KEY" = "your-tomtom-api-key-here"
        }
    }
)

# Filter services if specific service requested
if ($Service -ne "all") {
    $services = $services | Where-Object { $_.Name -eq $Service }
    if ($services.Count -eq 0) {
        Write-Error "Invalid service name: $Service. Valid options: notifications, planning, geo-tracking, all"
        exit 1
    }
}

Write-Host "Services to deploy: $($services.Name -join ', ')" -ForegroundColor Green
Write-Host ""

# Step 1: Build standalone versions
if (-not $SkipBuild) {
    Write-Host "STEP 1: Building standalone versions..." -ForegroundColor Yellow
    Write-Host ""

    foreach ($service in $services) {
        Write-Host "Building $($service.Name)..." -ForegroundColor Cyan

        $buildScript = Join-Path $PSScriptRoot "services\build-standalone-service.ps1"

        & $buildScript -ServiceName $service.Name -Port $service.Port

        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to build $($service.Name)"
            exit 1
        }

        Write-Host "✓ $($service.Name) built successfully" -ForegroundColor Green
        Write-Host ""
    }
} else {
    Write-Host "Skipping build (using existing builds)..." -ForegroundColor Yellow
    Write-Host ""
}

if ($OnlyBuild) {
    Write-Host "Build complete. Skipping deployment." -ForegroundColor Yellow
    exit 0
}

# Step 2: Check EB CLI
Write-Host "STEP 2: Checking prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command eb -ErrorAction SilentlyContinue)) {
    Write-Error "EB CLI is not installed. Install with: pip install awsebcli"
    exit 1
}
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI is not installed. Install from: https://aws.amazon.com/cli/"
    exit 1
}
Write-Host "✓ Prerequisites OK" -ForegroundColor Green
Write-Host ""

# Step 3: Deployment
Write-Host "STEP 3: Deploying services to AWS Elastic Beanstalk..." -ForegroundColor Yellow
Write-Host ""

# Load common environment variables
$jwtSecret = Read-Host "Enter JWT_SECRET (or press Enter to use existing)"
$mongodbPassword = Read-Host "Enter MongoDB password (or press Enter to use RtAdmin2024)"
if ([string]::IsNullOrEmpty($mongodbPassword)) {
    $mongodbPassword = "RtAdmin2024"
}

$corsOrigins = "https://main.dntbizetlc7bm.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com"

foreach ($service in $services) {
    Write-Host "Deploying $($service.Name)..." -ForegroundColor Cyan

    $ebDir = Join-Path $PSScriptRoot "services\$($service.Name)-eb"

    if (-not (Test-Path $ebDir)) {
        Write-Error "Deployment directory not found: $ebDir. Run with -OnlyBuild first."
        exit 1
    }

    Push-Location $ebDir

    try {
        # Check if .elasticbeanstalk exists (already initialized)
        $ebConfigDir = Join-Path $ebDir ".elasticbeanstalk"

        if (-not (Test-Path $ebConfigDir)) {
            Write-Host "Initializing Elastic Beanstalk..." -ForegroundColor Yellow

            # Initialize EB
            eb init "rt-$($service.Name)-api" `
                --platform "Node.js 20" `
                --region eu-central-1

            Write-Host "Creating environment..." -ForegroundColor Yellow

            # Create environment
            eb create "rt-$($service.Name)-api-prod" `
                --region eu-central-1 `
                --platform "Node.js 20" `
                --instance-type t3.micro `
                --single

            Write-Host "✓ Environment created" -ForegroundColor Green
        } else {
            Write-Host "Using existing EB configuration" -ForegroundColor Yellow
        }

        # Set environment variables
        Write-Host "Configuring environment variables..." -ForegroundColor Yellow

        $mongoUri = "mongodb+srv://rt_admin:$mongodbPassword@stagingrt.v2jnoh2.mongodb.net/$($service.Database)?retryWrites=true&w=majority"

        $envVars = @(
            "MONGODB_URI=`"$mongoUri`"",
            "PORT=3000",
            "CORS_ALLOWED_ORIGINS=`"$corsOrigins`""
        )

        if (-not [string]::IsNullOrEmpty($jwtSecret)) {
            $envVars += "JWT_SECRET=`"$jwtSecret`""
        }

        # Add service-specific env vars
        foreach ($key in $service.ExtraEnvVars.Keys) {
            $envVars += "$key=`"$($service.ExtraEnvVars[$key])`""
        }

        $envString = $envVars -join " "
        Invoke-Expression "eb setenv $envString"

        Write-Host "✓ Environment variables configured" -ForegroundColor Green

        # Deploy
        Write-Host "Deploying application..." -ForegroundColor Yellow
        eb deploy

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ $($service.Name) deployed successfully!" -ForegroundColor Green

            # Get URL
            $status = eb status
            Write-Host ""
            Write-Host "Service URL:" -ForegroundColor Cyan
            $status | Select-String "CNAME:" | ForEach-Object { Write-Host $_ -ForegroundColor White }
            Write-Host ""
        } else {
            Write-Error "Deployment failed for $($service.Name)"
        }

    } finally {
        Pop-Location
    }

    Write-Host ""
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test each service with: curl [service-url]/health" -ForegroundColor White
Write-Host "2. Check logs with: cd services/[service]-eb && eb logs" -ForegroundColor White
Write-Host "3. Update admin-gateway to route to new services" -ForegroundColor White
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor Cyan
foreach ($service in $services) {
    $ebDir = Join-Path $PSScriptRoot "services\$($service.Name)-eb"
    if (Test-Path $ebDir) {
        Write-Host "  $($service.Name): Check with 'cd $ebDir && eb status'" -ForegroundColor White
    }
}
