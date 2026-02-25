# Script d'Analyse Simplifié des Coûts AWS - Symphonia Platform
# Version: 1.0 - Simplifié
# Date: 2026-02-23

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse des Couts AWS - Symphonia" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier AWS CLI
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: AWS CLI n'est pas installe" -ForegroundColor Red
    Write-Host "Installation: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    exit 1
}

# Vérifier credentials
Write-Host "Verification des credentials AWS..." -ForegroundColor Yellow
try {
    $identity = aws sts get-caller-identity --output json 2>$null | ConvertFrom-Json
    if (!$identity) {
        Write-Host "Erreur: Credentials AWS non configures" -ForegroundColor Red
        Write-Host "Executez: aws configure" -ForegroundColor Yellow
        exit 1
    }
    $accountId = $identity.Account
    Write-Host "OK Compte AWS: $accountId" -ForegroundColor Green
} catch {
    Write-Host "Erreur: Credentials AWS non configures" -ForegroundColor Red
    Write-Host "Executez: aws configure" -ForegroundColor Yellow
    exit 1
}

# Région
try {
    $region = aws configure get region 2>$null
    if (!$region) { $region = "eu-central-1" }
    Write-Host "OK Region: $region" -ForegroundColor Green
} catch {
    $region = "eu-central-1"
}
Write-Host ""

# Dates
$today = Get-Date
$currentMonthStart = Get-Date -Day 1 -Hour 0 -Minute 0 -Second 0
$lastMonthStart = $currentMonthStart.AddMonths(-1)
$lastMonthEnd = $currentMonthStart

$startDate = $lastMonthStart.ToString("yyyy-MM-dd")
$endDate = $lastMonthEnd.ToString("yyyy-MM-dd")
$currentStart = $currentMonthStart.ToString("yyyy-MM-dd")
$todayStr = $today.ToString("yyyy-MM-dd")

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Couts du Mois Dernier" -ForegroundColor Cyan
Write-Host "Periode: $startDate a $endDate" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Coût total mois dernier
Write-Host "Cout Total:" -ForegroundColor Yellow
try {
    $lastMonthCost = aws ce get-cost-and-usage --time-period Start=$startDate,End=$endDate --granularity MONTHLY --metrics BlendedCost --output json 2>$null | ConvertFrom-Json
    $amount = [math]::Round([decimal]$lastMonthCost.ResultsByTime[0].Total.BlendedCost.Amount, 2)
    $unit = $lastMonthCost.ResultsByTime[0].Total.BlendedCost.Unit
    Write-Host "  Total: $amount $unit" -ForegroundColor White
} catch {
    Write-Host "  Erreur lors de la recuperation des couts" -ForegroundColor Red
}
Write-Host ""

# Top services mois dernier
Write-Host "Top 10 Services les Plus Couteux (Mois Dernier):" -ForegroundColor Yellow
try {
    $servicesCost = aws ce get-cost-and-usage --time-period Start=$startDate,End=$endDate --granularity MONTHLY --metrics BlendedCost --group-by Type=SERVICE --output json 2>$null | ConvertFrom-Json

    $services = $servicesCost.ResultsByTime[0].Groups | Sort-Object { [decimal]$_.Metrics.BlendedCost.Amount } -Descending | Select-Object -First 10

    foreach ($service in $services) {
        $serviceName = $service.Keys[0]
        $cost = [math]::Round([decimal]$service.Metrics.BlendedCost.Amount, 2)
        $serviceUnit = $service.Metrics.BlendedCost.Unit
        Write-Host "  $serviceName : $cost $serviceUnit" -ForegroundColor White
    }
} catch {
    Write-Host "  Erreur lors de la recuperation des services" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Couts du Mois en Cours" -ForegroundColor Cyan
Write-Host "Periode: $currentStart a $todayStr" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Coût total mois en cours
Write-Host "Cout Total (jusqu'a aujourd'hui):" -ForegroundColor Yellow
try {
    $currentMonthCost = aws ce get-cost-and-usage --time-period Start=$currentStart,End=$todayStr --granularity MONTHLY --metrics BlendedCost --output json 2>$null | ConvertFrom-Json
    $currentAmount = [math]::Round([decimal]$currentMonthCost.ResultsByTime[0].Total.BlendedCost.Amount, 2)
    $currentUnit = $currentMonthCost.ResultsByTime[0].Total.BlendedCost.Unit
    Write-Host "  Total: $currentAmount $currentUnit" -ForegroundColor White

    # Projection
    $daysElapsed = ($today - $currentMonthStart).Days + 1
    $daysInMonth = [DateTime]::DaysInMonth($today.Year, $today.Month)
    if ($daysElapsed -gt 0) {
        $projectedCost = [math]::Round($currentAmount * $daysInMonth / $daysElapsed, 2)
        Write-Host ""
        Write-Host "Projection Fin de Mois:" -ForegroundColor Yellow
        Write-Host "  Jours ecoules: $daysElapsed / $daysInMonth" -ForegroundColor White
        Write-Host "  Cout actuel: $currentAmount $currentUnit" -ForegroundColor White
        Write-Host "  Projection: $projectedCost $currentUnit" -ForegroundColor White
    }
} catch {
    Write-Host "  Erreur lors de la recuperation des couts" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Inventaire des Ressources Actives" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# EC2 Instances
Write-Host "Instances EC2 actives:" -ForegroundColor Yellow
try {
    $ec2Json = aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --output json 2>$null
    if ($ec2Json) {
        $ec2Data = $ec2Json | ConvertFrom-Json
        $instanceCount = 0
        foreach ($reservation in $ec2Data.Reservations) {
            foreach ($instance in $reservation.Instances) {
                $instanceCount++
                $instanceType = $instance.InstanceType
                $instanceId = $instance.InstanceId
                $name = "Sans nom"
                foreach ($tag in $instance.Tags) {
                    if ($tag.Key -eq "Name") {
                        $name = $tag.Value
                        break
                    }
                }
                Write-Host "  - $name ($instanceType) - ID: $instanceId" -ForegroundColor White
            }
        }
        if ($instanceCount -eq 0) {
            Write-Host "  Aucune instance EC2 active" -ForegroundColor Gray
        } else {
            Write-Host ""
            Write-Host "  Total: $instanceCount instance(s)" -ForegroundColor Green
        }
    } else {
        Write-Host "  Aucune instance EC2 active" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Erreur lors de la recuperation des instances EC2" -ForegroundColor Red
}

Write-Host ""

# ElastiCache
Write-Host "Clusters ElastiCache (Redis):" -ForegroundColor Yellow
try {
    $cacheJson = aws elasticache describe-cache-clusters --output json 2>$null
    if ($cacheJson) {
        $cacheData = $cacheJson | ConvertFrom-Json
        if ($cacheData.CacheClusters.Count -gt 0) {
            foreach ($cluster in $cacheData.CacheClusters) {
                $clusterId = $cluster.CacheClusterId
                $nodeType = $cluster.CacheNodeType
                $status = $cluster.CacheClusterStatus
                Write-Host "  - $clusterId ($nodeType) - $status" -ForegroundColor Red
            }
            Write-Host ""
            Write-Host "  ATTENTION: Cluster ElastiCache actif (~15 EUR/mois)" -ForegroundColor Yellow
            Write-Host "  Si non utilise, le desactiver economisera ~15 EUR/mois" -ForegroundColor Yellow
        } else {
            Write-Host "  OK Aucun cluster ElastiCache actif" -ForegroundColor Green
            Write-Host "  Economie deja realisee: ~15 EUR/mois" -ForegroundColor Green
        }
    } else {
        Write-Host "  OK Aucun cluster ElastiCache actif" -ForegroundColor Green
    }
} catch {
    Write-Host "  OK Aucun cluster ElastiCache actif" -ForegroundColor Green
}

Write-Host ""

# S3 Buckets
Write-Host "Buckets S3:" -ForegroundColor Yellow
try {
    $s3Output = aws s3 ls 2>$null
    if ($s3Output) {
        $buckets = $s3Output -split "`n" | Where-Object { $_ -match '\S' }
        foreach ($bucket in $buckets) {
            $bucketName = ($bucket -split '\s+')[-1]
            if ($bucketName) {
                Write-Host "  - $bucketName" -ForegroundColor White
            }
        }
    } else {
        Write-Host "  Aucun bucket S3" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Erreur lors de la recuperation des buckets S3" -ForegroundColor Red
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Recommandations d'Optimisation" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Verifier les tailles d'instances EC2" -ForegroundColor Yellow
Write-Host "   Economie potentielle: ~15-22 EUR/mois" -ForegroundColor Green
Write-Host "   Action: Downgrade des services legers vers t3.micro" -ForegroundColor Gray
Write-Host ""

Write-Host "2. Activer S3 Intelligent-Tiering" -ForegroundColor Yellow
Write-Host "   Economie potentielle: ~2-5 EUR/mois" -ForegroundColor Green
Write-Host "   Action: Optimisation automatique du stockage S3" -ForegroundColor Gray
Write-Host ""

Write-Host "3. Envisager Reserved Instances" -ForegroundColor Yellow
Write-Host "   Economie potentielle: ~30% (engagement 1 an)" -ForegroundColor Green
Write-Host "   Action: Si infrastructure stable > 1 an" -ForegroundColor Gray
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Rapport Genere" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Date: $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -ForegroundColor White
Write-Host ""
Write-Host "Prochaines etapes:" -ForegroundColor Yellow
Write-Host "  1. Examiner les recommandations ci-dessus" -ForegroundColor White
Write-Host "  2. Lire AWS_COST_OPTIMIZATION_PLAN.md" -ForegroundColor White
Write-Host "  3. Decider quelles optimisations implementer" -ForegroundColor White
Write-Host ""
Write-Host "OK Analyse terminee" -ForegroundColor Green
