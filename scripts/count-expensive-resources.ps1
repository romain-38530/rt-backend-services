# Script Simple pour Compter les Ressources Coûteuses
Write-Host "=== RESSOURCES AWS COUTEUSES ===" -ForegroundColor Cyan
Write-Host ""

# Application Load Balancers
Write-Host "1. Application Load Balancers (ALBs)" -ForegroundColor Yellow
try {
    $albs = aws elbv2 describe-load-balancers --output json 2>$null | ConvertFrom-Json
    Write-Host "   Nombre: $($albs.LoadBalancers.Count)" -ForegroundColor White
    Write-Host "   Cout: ~25 EUR/mois par ALB" -ForegroundColor Gray
    Write-Host "   TOTAL: ~$($albs.LoadBalancers.Count * 25) EUR/mois" -ForegroundColor Red
} catch {
    Write-Host "   Erreur" -ForegroundColor Red
}
Write-Host ""

# NAT Gateways
Write-Host "2. NAT Gateways" -ForegroundColor Yellow
try {
    $natgws = aws ec2 describe-nat-gateways --filter "Name=state,Values=available" --output json 2>$null | ConvertFrom-Json
    Write-Host "   Nombre: $($natgws.NatGateways.Count)" -ForegroundColor White
    Write-Host "   Cout: ~32 EUR/mois par NAT Gateway" -ForegroundColor Gray
    Write-Host "   TOTAL: ~$($natgws.NatGateways.Count * 32) EUR/mois" -ForegroundColor Red
} catch {
    Write-Host "   Erreur" -ForegroundColor Red
}
Write-Host ""

# RDS
Write-Host "3. RDS Databases" -ForegroundColor Yellow
try {
    $rds = aws rds describe-db-instances --output json 2>$null | ConvertFrom-Json
    Write-Host "   Nombre: $($rds.DBInstances.Count)" -ForegroundColor White
    if ($rds.DBInstances.Count -gt 0) {
        $totalRdsCost = 0
        foreach ($db in $rds.DBInstances) {
            $cost = 50  # Défaut
            if ($db.DBInstanceClass -like "*micro*") { $cost = 15 }
            elseif ($db.DBInstanceClass -like "*small*") { $cost = 30 }
            elseif ($db.DBInstanceClass -like "*medium*") { $cost = 60 }
            elseif ($db.DBInstanceClass -like "*large*") { $cost = 150 }
            $totalRdsCost += $cost
            Write-Host "     - $($db.DBInstanceIdentifier) ($($db.DBInstanceClass)) - ~$cost EUR/mois" -ForegroundColor Gray
        }
        Write-Host "   TOTAL: ~$totalRdsCost EUR/mois" -ForegroundColor Red
    }
} catch {
    Write-Host "   Aucune instance RDS" -ForegroundColor Green
}
Write-Host ""

# Elastic IPs non utilisées
Write-Host "4. Elastic IPs (non utilisees)" -ForegroundColor Yellow
try {
    $eips = aws ec2 describe-addresses --output json 2>$null | ConvertFrom-Json
    $unattached = $eips.Addresses | Where-Object { !$_.InstanceId }
    Write-Host "   Nombre total: $($eips.Addresses.Count)" -ForegroundColor White
    Write-Host "   Non attachees: $($unattached.Count)" -ForegroundColor Red
    if ($unattached.Count -gt 0) {
        Write-Host "   Cout: ~3.60 EUR/mois par IP non utilisee" -ForegroundColor Gray
        Write-Host "   TOTAL: ~$($unattached.Count * 3.6) EUR/mois" -ForegroundColor Red
    }
} catch {
    Write-Host "   Erreur" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== RESUME ===" -ForegroundColor Cyan
$estimatedTotal = ($albs.LoadBalancers.Count * 25) + ($natgws.NatGateways.Count * 32)
Write-Host "Cout estime (ALBs + NAT): ~$estimatedTotal EUR/mois" -ForegroundColor Red
Write-Host ""
Write-Host "NOTE: Ceci ne represente qu'une partie des couts!" -ForegroundColor Yellow
Write-Host "Autres sources de couts:" -ForegroundColor Yellow
Write-Host "  - Data Transfer" -ForegroundColor Gray
Write-Host "  - EBS Volumes" -ForegroundColor Gray
Write-Host "  - CloudFront" -ForegroundColor Gray
Write-Host "  - S3" -ForegroundColor Gray
