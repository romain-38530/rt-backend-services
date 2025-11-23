# Script to build standalone version of a service for Elastic Beanstalk deployment
param(
    [Parameter(Mandatory=$true)]
    [string]$ServiceName,

    [Parameter(Mandatory=$true)]
    [int]$Port
)

$ErrorActionPreference = "Stop"

Write-Host "Building standalone version of $ServiceName service..." -ForegroundColor Green

# Paths
$rootDir = Split-Path -Parent $PSScriptRoot
$serviceDir = Join-Path $PSScriptRoot $ServiceName
$outputDir = Join-Path $PSScriptRoot "$ServiceName-eb"

# Check if source service exists
if (-not (Test-Path $serviceDir)) {
    Write-Error "Service directory not found: $serviceDir"
    exit 1
}

# Create output directory
if (Test-Path $outputDir) {
    Write-Host "Removing existing output directory..." -ForegroundColor Yellow
    Remove-Item -Path $outputDir -Recurse -Force
}

New-Item -ItemType Directory -Path $outputDir | Out-Null
Write-Host "Created output directory: $outputDir" -ForegroundColor Green

# Copy source files
Write-Host "Copying source files..." -ForegroundColor Cyan
$srcSource = Join-Path $serviceDir "src"
$srcDest = Join-Path $outputDir "src"
Copy-Item -Path $srcSource -Destination $srcDest -Recurse

# Create package.json
Write-Host "Creating package.json..." -ForegroundColor Cyan
$packageJson = @{
    name = "@rt/api-$ServiceName"
    version = "1.0.0"
    description = "RT Technologie $ServiceName API Service"
    main = "dist/index.js"
    scripts = @{
        dev = "tsx watch src/index.ts"
        build = "tsc"
        start = "node dist/index.js"
        postinstall = "npm run build"
        lint = "eslint src"
    }
    dependencies = @{
        express = "^4.18.2"
        mongoose = "^8.0.0"
        mongodb = "^6.3.0"
        cors = "^2.8.5"
        helmet = "^7.1.0"
        dotenv = "^16.3.1"
        bcryptjs = "^2.4.3"
        jsonwebtoken = "^9.0.2"
        zod = "^3.22.4"
        winston = "^3.11.0"
        "winston-daily-rotate-file" = "^4.7.1"
        "@types/express" = "^4.17.21"
        "@types/node" = "^20.10.0"
        "@types/cors" = "^2.8.17"
        "@types/bcryptjs" = "^2.4.6"
        "@types/jsonwebtoken" = "^9.0.5"
        typescript = "^5.3.3"
    }
    devDependencies = @{
        tsx = "^4.7.0"
        "@types/node" = "^20.10.0"
    }
}

# Add AWS SDK for notifications service
if ($ServiceName -eq "notifications") {
    $packageJson.dependencies."@aws-sdk/client-ses" = "^3.478.0"
    $packageJson.dependencies."@aws-sdk/client-s3" = "^3.478.0"
}

$packageJson | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $outputDir "package.json")

# Create tsconfig.json
Write-Host "Creating tsconfig.json..." -ForegroundColor Cyan
$tsConfig = @{
    compilerOptions = @{
        target = "ES2022"
        module = "ESNext"
        moduleResolution = "node"
        outDir = "dist"
        rootDir = "src"
        strict = true
        esModuleInterop = true
        skipLibCheck = true
        forceConsistentCasingInFileNames = true
        resolveJsonModule = true
        declaration = true
        declarationMap = true
        sourceMap = true
    }
    include = @("src/**/*")
    exclude = @("node_modules", "dist")
}

$tsConfig | ConvertTo-Json -Depth 10 | Set-Content -Path (Join-Path $outputDir "tsconfig.json")

# Create Procfile
Write-Host "Creating Procfile..." -ForegroundColor Cyan
"web: npm start" | Set-Content -Path (Join-Path $outputDir "Procfile")

# Create .npmrc to avoid optional dependencies issues
Write-Host "Creating .npmrc..." -ForegroundColor Cyan
@"
optional=false
engine-strict=false
"@ | Set-Content -Path (Join-Path $outputDir ".npmrc")

# Create .ebignore
Write-Host "Creating .ebignore..." -ForegroundColor Cyan
@"
node_modules/
.git/
.gitignore
*.log
.env.local
.env.development
src/
tsconfig.json
"@ | Set-Content -Path (Join-Path $outputDir ".ebignore")

# Copy shared packages code inline
Write-Host "Inlining shared packages..." -ForegroundColor Cyan

# Create utils directory
$utilsDir = Join-Path $outputDir "src\utils"
New-Item -ItemType Directory -Path $utilsDir -Force | Out-Null

# Copy logger
$loggerSource = Join-Path $rootDir "packages\utils\src\logger.ts"
if (Test-Path $loggerSource) {
    Copy-Item -Path $loggerSource -Destination (Join-Path $utilsDir "logger.ts")
}

# Copy validators
$validatorSource = Join-Path $rootDir "packages\utils\src\validators.ts"
if (Test-Path $validatorSource) {
    Copy-Item -Path $validatorSource -Destination (Join-Path $utilsDir "validators.ts")
}

# Create contracts directory
$contractsDir = Join-Path $outputDir "src\contracts"
New-Item -ItemType Directory -Path $contractsDir -Force | Out-Null

# Copy relevant contract files
$contractsSource = Join-Path $rootDir "packages\contracts\src"
Copy-Item -Path (Join-Path $contractsSource "enums") -Destination (Join-Path $contractsDir "enums") -Recurse -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $contractsSource "types") -Destination (Join-Path $contractsDir "types") -Recurse -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $contractsSource "schemas") -Destination (Join-Path $contractsDir "schemas") -Recurse -ErrorAction SilentlyContinue

# Copy MongoDB utilities
$mongoDir = Join-Path $outputDir "src\db"
New-Item -ItemType Directory -Path $mongoDir -Force | Out-Null
$mongoSource = Join-Path $rootDir "packages\data-mongo\src"
Copy-Item -Path (Join-Path $mongoSource "*") -Destination $mongoDir -Recurse -ErrorAction SilentlyContinue

# Create README
Write-Host "Creating README..." -ForegroundColor Cyan
@"
# $ServiceName Service - Elastic Beanstalk Deployment

This is a standalone version of the $ServiceName service for AWS Elastic Beanstalk deployment.

## Deployment

\`\`\`bash
# Initialize EB (first time only)
eb init -p "Node.js 20" -r eu-central-1

# Create environment
eb create rt-$ServiceName-api-prod --region eu-central-1 --platform "Node.js 20" --instance-type t3.micro --single

# Set environment variables
eb setenv MONGODB_URI="..." PORT="3000" JWT_SECRET="..."

# Deploy
eb deploy

# Check status
eb status
eb open
\`\`\`

## Local Testing

\`\`\`bash
npm install
npm run dev
\`\`\`

## Environment Variables

See DEPLOY_NEW_SERVICES.md in the root directory for full list of required environment variables.
"@ | Set-Content -Path (Join-Path $outputDir "README.md")

# Create deployment script
Write-Host "Creating deployment script..." -ForegroundColor Cyan
@"
# Deployment script for $ServiceName service
# Run this from the $ServiceName-eb directory

Write-Host "Deploying $ServiceName service to Elastic Beanstalk..." -ForegroundColor Green

# Check if EB CLI is installed
if (-not (Get-Command eb -ErrorAction SilentlyContinue)) {
    Write-Error "EB CLI is not installed. Install with: pip install awsebcli"
    exit 1
}

# Deploy
Write-Host "Running eb deploy..." -ForegroundColor Cyan
eb deploy

if (`$LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "Checking status..." -ForegroundColor Cyan
    eb status
} else {
    Write-Error "Deployment failed. Check logs with: eb logs"
    exit 1
}
"@ | Set-Content -Path (Join-Path $outputDir "deploy-to-eb.ps1")

Write-Host ""
Write-Host "✓ Standalone service built successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. cd $outputDir" -ForegroundColor White
Write-Host "2. Test locally: npm install && npm run dev" -ForegroundColor White
Write-Host "3. Deploy: eb init (first time) then eb deploy" -ForegroundColor White
Write-Host ""
Write-Host "See DEPLOY_NEW_SERVICES.md for detailed deployment instructions" -ForegroundColor Cyan
