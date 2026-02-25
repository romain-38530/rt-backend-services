# Script pour Trouver les Coûts Cachés AWS
# Version: 1.0
# Date: 2026-02-23

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Recherche des Couts Caches AWS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier AWS CLI
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: AWS CLI non installe" -ForegroundColor Red
    exit 1
}

$currentMonthStart = (Get-Date -Day 1).ToString("yyyy-MM-dd")
$today = (Get-Date).ToString("yyyy-MM-dd")

Write-Host "Periode analysee: $currentMonthStart a $today" -ForegroundColor Gray
Write-Host ""

# Récupérer les coûts par service
Write-Host "Recuperation des couts par service AWS..." -ForegroundColor Yellow
Write-Host ""

try {
    $costData = aws ce get-cost-and-usage `
      --time-period Start=$currentMonthStart,End=$today `
      --granularity MONTHLY `
      --metrics BlendedCost `
      --group-by Type=SERVICE `
      --output json | ConvertFrom-Json

    $services = $costData.ResultsByTime[0].Groups |
        Sort-Object { [decimal]$_.Metrics.BlendedCost.Amount } -Descending

    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "TOUS les Services AWS (par cout)" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""

    $totalCost = 0
    $rank = 1

    foreach ($service in $services) {
        $cost = [math]::Round([decimal]$service.Metrics.BlendedCost.Amount, 2)
        $serviceName = $service.Keys[0]

        if ($cost -gt 0) {
            $totalCost += $cost

            # Colorier selon le coût
            $color = "White"
            if ($cost -gt 100) { $color = "Red" }
            elseif ($cost -gt 50) { $color = "Yellow" }
            elseif ($cost -gt 10) { $color = "Cyan" }

            Write-Host "$rank. $serviceName" -ForegroundColor $color
            Write-Host "   Cout: $cost USD" -ForegroundColor Gray

            # Ajouter des commentaires pour les services importants
            switch -Wildcard ($serviceName) {
                "*Elastic Compute Cloud*" {
                    Write-Host "   INFO: Instances EC2 (Elastic Beanstalk)" -ForegroundColor Gray
                }
                "*Relational Database Service*" {
                    Write-Host "   ATTENTION: Base de donnees RDS active!" -ForegroundColor Yellow
                    Write-Host "   Verifier: aws rds describe-db-instances" -ForegroundColor Gray
                }
                "*Elastic Load Balancing*" {
                    Write-Host "   INFO: Load Balancers (Application/Network)" -ForegroundColor Gray
                    Write-Host "   Verifier: aws elbv2 describe-load-balancers" -ForegroundColor Gray
                }
                "*CloudFront*" {
                    Write-Host "   INFO: CDN CloudFront" -ForegroundColor Gray
                }
                "*Data Transfer*" {
                    Write-Host "   INFO: Transfert de donnees sortant" -ForegroundColor Gray
                }
                "*ElastiCache*" {
                    Write-Host "   INFO: Redis/Memcached" -ForegroundColor Gray
                }
                "*Simple Storage Service*" {
                    Write-Host "   INFO: Stockage S3" -ForegroundColor Gray
                }
                "*DocumentDB*" {
                    Write-Host "   ATTENTION: DocumentDB (MongoDB-compatible)" -ForegroundColor Yellow
                }
                "*NAT Gateway*" {
                    Write-Host "   INFO: NAT Gateway pour VPC" -ForegroundColor Gray
                }
                "*VPC*" {
                    Write-Host "   INFO: Virtual Private Cloud" -ForegroundColor Gray
                }
            }
            Write-Host ""
            $rank++
        }
    }

    Write-Host "COUT TOTAL: $totalCost USD" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""

} catch {
    Write-Host "Erreur lors de la recuperation des couts" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Analyser spécifiquement les gros postes
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse Detaillee des Gros Postes" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# 1. Load Balancers
Write-Host "1. Application Load Balancers (ALB)" -ForegroundColor Yellow
try {
    $albs = aws elbv2 describe-load-balancers --output json 2>$null | ConvertFrom-Json
    if ($albs.LoadBalancers.Count -gt 0) {
        Write-Host "   TROUVE: $($albs.LoadBalancers.Count) ALB(s)" -ForegroundColor Red
        foreach ($alb in $albs.LoadBalancers) {
            Write-Host "     - $($alb.LoadBalancerName)" -ForegroundColor White
            Write-Host "       Type: $($alb.Type)" -ForegroundColor Gray
            Write-Host "       DNS: $($alb.DNSName)" -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "   Cout estime: ~25 EUR/mois par ALB" -ForegroundColor Red
        Write-Host "   TOTAL: ~$($albs.LoadBalancers.Count * 25) EUR/mois" -ForegroundColor Red
        Write-Host ""
        Write-Host "   ATTENTION: Elastic Beanstalk cree automatiquement 1 ALB par environnement!" -ForegroundColor Yellow
        Write-Host "   Avec 50 environnements EB, vous avez potentiellement 50 ALBs!" -ForegroundColor Yellow
        Write-Host "   Cout potentiel: ~1,250 EUR/mois juste pour les ALBs!" -ForegroundColor Red
        Write-Host ""
    } else {
        Write-Host "   OK: Aucun ALB actif" -ForegroundColor Green
    }
} catch {
    Write-Host "   Impossible de recuperer les ALBs" -ForegroundColor Yellow
}
Write-Host ""

# 2. NAT Gateways
Write-Host "2. NAT Gateways" -ForegroundColor Yellow
try {
    $natgws = aws ec2 describe-nat-gateways --filter "Name=state,Values=available" --output json 2>$null | ConvertFrom-Json
    if ($natgws.NatGateways.Count -gt 0) {
        Write-Host "   TROUVE: $($natgws.NatGateways.Count) NAT Gateway(s)" -ForegroundColor Red
        foreach ($natgw in $natgws.NatGateways) {
            Write-Host "     - $($natgw.NatGatewayId)" -ForegroundColor White
            Write-Host "       VPC: $($natgw.VpcId)" -ForegroundColor Gray
            Write-Host "       Subnet: $($natgw.SubnetId)" -ForegroundColor Gray
        }
        Write-Host ""
        Write-Host "   Cout: ~32 EUR/mois par NAT Gateway" -ForegroundColor Red
        Write-Host "   TOTAL: ~$($natgws.NatGateways.Count * 32) EUR/mois" -ForegroundColor Red
        Write-Host ""
    } else {
        Write-Host "   OK: Aucun NAT Gateway actif" -ForegroundColor Green
    }
} catch {
    Write-Host "   Impossible de recuperer les NAT Gateways" -ForegroundColor Yellow
}
Write-Host ""

# 3. RDS Databases
Write-Host "3. RDS Databases" -ForegroundColor Yellow
try {
    $rdsInstances = aws rds describe-db-instances --output json 2>$null | ConvertFrom-Json
    if ($rdsInstances.DBInstances.Count -gt 0) {
        Write-Host "   TROUVE: $($rdsInstances.DBInstances.Count) instance(s) RDS" -ForegroundColor Red
        foreach ($db in $rdsInstances.DBInstances) {
            Write-Host "     - $($db.DBInstanceIdentifier)" -ForegroundColor White
            Write-Host "       Type: $($db.DBInstanceClass)" -ForegroundColor Gray
            Write-Host "       Engine: $($db.Engine) $($db.EngineVersion)" -ForegroundColor Gray
            Write-Host "       Storage: $($db.AllocatedStorage) GB" -ForegroundColor Gray

            # Estimation du coût
            $cost = 0
            switch ($db.DBInstanceClass) {
                "db.t3.micro" { $cost = 15 }
                "db.t3.small" { $cost = 30 }
                "db.t3.medium" { $cost = 60 }
                "db.m5.large" { $cost = 150 }
                "db.m5.xlarge" { $cost = 300 }
                default { $cost = 50 }
            }
            Write-Host "       Cout estime: ~$cost EUR/mois" -ForegroundColor Red
        }
        Write-Host ""
    } else {
        Write-Host "   OK: Aucune instance RDS active" -ForegroundColor Green
    }
} catch {
    Write-Host "   Impossible de recuperer les instances RDS" -ForegroundColor Yellow
}
Write-Host ""

# 4. Volumes EBS
Write-Host "4. Volumes EBS (Stockage)" -ForegroundColor Yellow
try {
    $volumes = aws ec2 describe-volumes --filters "Name=status,Values=in-use,available" --output json 2>$null | ConvertFrom-Json
    if ($volumes.Volumes.Count -gt 0) {
        $totalSize = ($volumes.Volumes | Measure-Object -Property Size -Sum).Sum
        Write-Host "   TROUVE: $($volumes.Volumes.Count) volume(s) EBS" -ForegroundColor White
        Write-Host "   Taille totale: $totalSize GB" -ForegroundColor White

        $ebsCost = $totalSize * 0.10  # ~0.10 EUR/GB/mois
        Write-Host "   Cout estime: ~$([math]::Round($ebsCost, 2)) EUR/mois" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "   Aucun volume EBS" -ForegroundColor Green
    }
} catch {
    Write-Host "   Impossible de recuperer les volumes EBS" -ForegroundColor Yellow
}
Write-Host ""

# 5. Elastic IPs non utilisées
Write-Host "5. Elastic IPs (non utilisees)" -ForegroundColor Yellow
try {
    $eips = aws ec2 describe-addresses --output json 2>$null | ConvertFrom-Json
    if ($eips.Addresses.Count -gt 0) {
        $unattached = $eips.Addresses | Where-Object { !$_.InstanceId }
        if ($unattached.Count -gt 0) {
            Write-Host "   ATTENTION: $($unattached.Count) Elastic IP(s) non attachee(s)" -ForegroundColor Red
            foreach ($eip in $unattached) {
                Write-Host "     - $($eip.PublicIp) (AllocationId: $($eip.AllocationId))" -ForegroundColor White
            }
            Write-Host ""
            Write-Host "   Cout: ~3.60 EUR/mois par IP non utilisee" -ForegroundColor Red
            Write-Host "   TOTAL: ~$($unattached.Count * 3.6) EUR/mois" -ForegroundColor Red
            Write-Host "   ACTION: Liberer les IPs non utilisees!" -ForegroundColor Yellow
            Write-Host ""
        } else {
            Write-Host "   OK: Toutes les Elastic IPs sont attachees" -ForegroundColor Green
        }
    } else {
        Write-Host "   OK: Aucune Elastic IP" -ForegroundColor Green
    }
} catch {
    Write-Host "   Impossible de recuperer les Elastic IPs" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "CONCLUSIONS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "ATTENTION: Le probleme majeur est probablement:" -ForegroundColor Red
Write-Host ""
Write-Host "  1. Application Load Balancers (ALBs)" -ForegroundColor Yellow
Write-Host "     Elastic Beanstalk cree 1 ALB par environnement" -ForegroundColor Gray
Write-Host "     50 environnements = ~1,250 EUR/mois!" -ForegroundColor Red
Write-Host ""
Write-Host "  2. NAT Gateways" -ForegroundColor Yellow
Write-Host "     Cout fixe: ~32 EUR/mois par gateway" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Data Transfer" -ForegroundColor Yellow
Write-Host "     Transfert de donnees sortant" -ForegroundColor Gray
Write-Host ""

Write-Host "RECOMMANDATION URGENTE:" -ForegroundColor Red -BackgroundColor Black
Write-Host "  Consolider les environnements Elastic Beanstalk!" -ForegroundColor Yellow
Write-Host "  Au lieu de 50 environnements separés, utiliser:" -ForegroundColor Yellow
Write-Host "    - 1-3 environnements avec plusieurs apps" -ForegroundColor Yellow
Write-Host "    - OU migrer vers ECS/Fargate" -ForegroundColor Yellow
Write-Host "    - OU migrer vers Lambda" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Economie potentielle: ~1,000-1,200 EUR/mois!" -ForegroundColor Green -BackgroundColor Black
Write-Host ""

Write-Host "OK Analyse terminee" -ForegroundColor Green
