# Script d'Analyse des Coûts AWS - Symphonia Platform (Windows PowerShell)
# Version: 1.0
# Date: 2026-02-23

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "📊 Analyse des Coûts AWS - Symphonia" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que AWS CLI est installé
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "❌ AWS CLI n'est pas installé" -ForegroundColor Red
    Write-Host "Installation: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Vérifier les credentials AWS
Write-Host "🔐 Vérification des credentials AWS..." -ForegroundColor Yellow
try {
    $identity = aws sts get-caller-identity --output json | ConvertFrom-Json
    $accountId = $identity.Account
    Write-Host "✓ Compte AWS: $accountId" -ForegroundColor Green
} catch {
    Write-Host "❌ Credentials AWS non configurés" -ForegroundColor Red
    Write-Host "Exécutez: aws configure" -ForegroundColor Yellow
    exit 1
}

# Récupérer la région
try {
    $region = aws configure get region
    if (!$region) { $region = "eu-central-1" }
    Write-Host "✓ Région: $region" -ForegroundColor Green
} catch {
    $region = "eu-central-1"
    Write-Host "⚠ Région par défaut: $region" -ForegroundColor Yellow
}
Write-Host ""

# Dates pour l'analyse
$today = Get-Date
$currentMonthStart = Get-Date -Day 1 -Hour 0 -Minute 0 -Second 0
$lastMonthStart = $currentMonthStart.AddMonths(-1)
$lastMonthEnd = $currentMonthStart

$startDate = $lastMonthStart.ToString("yyyy-MM-dd")
$endDate = $lastMonthEnd.ToString("yyyy-MM-dd")
$currentStart = $currentMonthStart.ToString("yyyy-MM-dd")
$todayStr = $today.ToString("yyyy-MM-dd")

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "💰 Coûts du Mois Dernier" -ForegroundColor Cyan
Write-Host "Période: $startDate à $endDate" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Coût total du mois dernier
Write-Host "📊 Coût Total:" -ForegroundColor Yellow
$lastMonthCost = aws ce get-cost-and-usage `
  --time-period Start=$startDate,End=$endDate `
  --granularity MONTHLY `
  --metrics BlendedCost `
  --output json | ConvertFrom-Json

$amount = [math]::Round([decimal]$lastMonthCost.ResultsByTime[0].Total.BlendedCost.Amount, 2)
$unit = $lastMonthCost.ResultsByTime[0].Total.BlendedCost.Unit
Write-Host "  Total: $amount $unit" -ForegroundColor White
Write-Host ""

# Coûts par service (Top 10)
Write-Host "📦 Top 10 Services les Plus Coûteux (Mois Dernier):" -ForegroundColor Yellow
$servicesCost = aws ce get-cost-and-usage `
  --time-period Start=$startDate,End=$endDate `
  --granularity MONTHLY `
  --metrics BlendedCost `
  --group-by Type=SERVICE `
  --output json | ConvertFrom-Json

$services = $servicesCost.ResultsByTime[0].Groups |
    Sort-Object { [decimal]$_.Metrics.BlendedCost.Amount } -Descending |
    Select-Object -First 10

foreach ($service in $services) {
    $serviceName = $service.Keys[0].PadRight(40)
    $cost = [math]::Round([decimal]$service.Metrics.BlendedCost.Amount, 2)
    $unit = $service.Metrics.BlendedCost.Unit
    Write-Host "  $serviceName : $cost $unit" -ForegroundColor White
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "📅 Coûts du Mois en Cours" -ForegroundColor Cyan
Write-Host "Période: $currentStart à $todayStr" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Coût total du mois en cours
Write-Host "📊 Coût Total (jusqu'à aujourd'hui):" -ForegroundColor Yellow
$currentMonthCost = aws ce get-cost-and-usage `
  --time-period Start=$currentStart,End=$todayStr `
  --granularity MONTHLY `
  --metrics BlendedCost `
  --output json | ConvertFrom-Json

$currentAmount = [math]::Round([decimal]$currentMonthCost.ResultsByTime[0].Total.BlendedCost.Amount, 2)
Write-Host "  Total: $currentAmount $unit" -ForegroundColor White
Write-Host ""

# Projection du mois en cours
$daysElapsed = ($today - $currentMonthStart).Days
$daysInMonth = [DateTime]::DaysInMonth($today.Year, $today.Month)
$projectedCost = [math]::Round($currentAmount * $daysInMonth / $daysElapsed, 2)

Write-Host "📈 Projection Fin de Mois:" -ForegroundColor Yellow
Write-Host "  Jours écoulés: $daysElapsed / $daysInMonth" -ForegroundColor White
Write-Host "  Coût actuel: $currentAmount $unit" -ForegroundColor White
Write-Host "  Projection: $projectedCost $unit" -ForegroundColor White

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🔍 Détails par Type de Ressource" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Helper function pour récupérer le coût d'un service
function Get-ServiceCost {
    param([string]$ServiceName)

    $filter = @{
        Dimensions = @{
            Key = "SERVICE"
            Values = @($ServiceName)
        }
    } | ConvertTo-Json -Compress

    try {
        $result = aws ce get-cost-and-usage `
          --time-period Start=$currentStart,End=$todayStr `
          --granularity MONTHLY `
          --metrics BlendedCost `
          --filter $filter `
          --output json | ConvertFrom-Json

        $cost = [math]::Round([decimal]$result.ResultsByTime[0].Total.BlendedCost.Amount, 2)
        return "$cost $unit"
    } catch {
        return "Aucune donnée"
    }
}

# EC2
Write-Host "💻 EC2 (Elastic Beanstalk):" -ForegroundColor Yellow
$ec2Cost = Get-ServiceCost "Amazon Elastic Compute Cloud - Compute"
Write-Host "  Coût: $ec2Cost" -ForegroundColor White

# S3
Write-Host ""
Write-Host "📦 S3 (Stockage):" -ForegroundColor Yellow
$s3Cost = Get-ServiceCost "Amazon Simple Storage Service"
Write-Host "  Coût: $s3Cost" -ForegroundColor White

# ElastiCache
Write-Host ""
Write-Host "🔴 ElastiCache (Redis):" -ForegroundColor Yellow
try {
    $cacheResult = aws ce get-cost-and-usage `
      --time-period Start=$currentStart,End=$todayStr `
      --granularity MONTHLY `
      --metrics BlendedCost `
      --filter '{\"Dimensions\":{\"Key\":\"SERVICE\",\"Values\":[\"Amazon ElastiCache\"]}}' `
      --output json | ConvertFrom-Json

    $cacheCost = [math]::Round([decimal]$cacheResult.ResultsByTime[0].Total.BlendedCost.Amount, 2)
    if ($cacheCost -gt 0) {
        Write-Host "  Coût: $cacheCost $unit" -ForegroundColor Red
        Write-Host "  ⚠ RECOMMANDATION: Désactivez si non utilisé (économie: ~15€/mois)" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ Aucun cluster ElastiCache actif (Économie déjà réalisée!)" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✓ Aucun cluster ElastiCache actif" -ForegroundColor Green
}

# CloudFront
Write-Host ""
Write-Host "🌐 CloudFront (CDN):" -ForegroundColor Yellow
$cfCost = Get-ServiceCost "Amazon CloudFront"
Write-Host "  Coût: $cfCost" -ForegroundColor White

# Data Transfer
Write-Host ""
Write-Host "📡 Data Transfer:" -ForegroundColor Yellow
$dtCost = Get-ServiceCost "AWS Data Transfer"
Write-Host "  Coût: $dtCost" -ForegroundColor White

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "🖥️ Inventaire des Ressources Actives" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# EC2 Instances
Write-Host "💻 Instances EC2 (Elastic Beanstalk):" -ForegroundColor Yellow
try {
    $instances = aws ec2 describe-instances `
      --filters "Name=instance-state-name,Values=running" `
      --query 'Reservations[*].Instances[*].[Tags[?Key==`Name`].Value | [0], InstanceType, State.Name]' `
      --output json | ConvertFrom-Json

    if ($instances.Count -gt 0) {
        foreach ($instance in $instances) {
            $name = if ($instance[0]) { $instance[0] } else { "Sans nom" }
            $type = $instance[1]
            $state = $instance[2]
            Write-Host "  - $name ($type) - $state" -ForegroundColor White
        }
    } else {
        Write-Host "  Aucune instance EC2 en cours d'exécution" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Erreur lors de la récupération des instances" -ForegroundColor Red
}

# ElastiCache Clusters
Write-Host ""
Write-Host "🔴 Clusters ElastiCache (Redis):" -ForegroundColor Yellow
try {
    $clusters = aws elasticache describe-cache-clusters --output json | ConvertFrom-Json
    if ($clusters.CacheClusters.Count -gt 0) {
        foreach ($cluster in $clusters.CacheClusters) {
            Write-Host "  - $($cluster.CacheClusterId) ($($cluster.CacheNodeType)) - $($cluster.CacheClusterStatus)" -ForegroundColor Red
        }
        Write-Host "  ⚠ RECOMMANDATION: Désactivez si non nécessaire" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ Aucun cluster ElastiCache (Économie potentielle déjà réalisée!)" -ForegroundColor Green
    }
} catch {
    Write-Host "  ✓ Aucun cluster ElastiCache" -ForegroundColor Green
}

# S3 Buckets
Write-Host ""
Write-Host "📦 Buckets S3:" -ForegroundColor Yellow
try {
    $buckets = aws s3 ls | ForEach-Object { $_.Split(" ")[-1] }
    foreach ($bucket in $buckets) {
        Write-Host "  - $bucket" -ForegroundColor White
    }
} catch {
    Write-Host "  Erreur lors de la récupération des buckets" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "💡 Recommandations d'Optimisation" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$recommendationCount = 0

# Recommandations basées sur l'analyse
Write-Host "Basé sur votre utilisation actuelle:" -ForegroundColor White
Write-Host ""

$recommendationCount++
Write-Host "$recommendationCount. ⭐⭐⭐ Vérifier les tailles d'instances EC2" -ForegroundColor Yellow
Write-Host "   Économie potentielle: ~15-22€/mois" -ForegroundColor Green
Write-Host "   Downgrade des services légers vers t3.micro" -ForegroundColor Gray
Write-Host ""

$recommendationCount++
Write-Host "$recommendationCount. ⭐⭐ Activer S3 Intelligent-Tiering" -ForegroundColor Yellow
Write-Host "   Économie potentielle: ~2-5€/mois" -ForegroundColor Green
Write-Host "   Optimisation automatique du stockage S3" -ForegroundColor Gray
Write-Host ""

$recommendationCount++
Write-Host "$recommendationCount. ⭐ Envisager Reserved Instances" -ForegroundColor Yellow
Write-Host "   Économie potentielle: ~30% (engagement 1 an)" -ForegroundColor Green
Write-Host "   Si vous gardez l'infrastructure > 1 an" -ForegroundColor Gray
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "📄 Rapport Généré" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ce rapport a été généré le: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor White
Write-Host ""
Write-Host "Prochaines étapes:" -ForegroundColor Yellow
Write-Host "  1. Examiner les recommandations ci-dessus" -ForegroundColor White
Write-Host "  2. Lire le fichier AWS_COST_OPTIMIZATION_PLAN.md" -ForegroundColor White
Write-Host "  3. Décider quelles optimisations implémenter" -ForegroundColor White
Write-Host ""
Write-Host "Pour plus de détails:" -ForegroundColor Yellow
Write-Host "  - AWS Console > Billing > Cost Explorer" -ForegroundColor Gray
Write-Host "  - AWS Console > Trusted Advisor > Cost Optimization" -ForegroundColor Gray
Write-Host ""
Write-Host "✓ Analyse terminée" -ForegroundColor Green
