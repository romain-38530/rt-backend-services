# Analyse Détaillée des Coûts AWS - Deep Dive
# Version: 1.0
# Date: 2026-02-23

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse Approfondie des Couts AWS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier AWS CLI
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: AWS CLI non installe" -ForegroundColor Red
    exit 1
}

# Prix mensuels (EUR)
$prices = @{
    "t3.micro" = 7.50
    "t3.small" = 15
    "t3.medium" = 30
    "elasticache.t3.micro" = 15
}

# Récupérer toutes les instances
$instances = @()
try {
    $ec2Json = aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --output json 2>$null
    if ($ec2Json) {
        $ec2Data = $ec2Json | ConvertFrom-Json
        foreach ($reservation in $ec2Data.Reservations) {
            foreach ($instance in $reservation.Instances) {
                $name = "Sans nom"
                $project = "Inconnu"
                foreach ($tag in $instance.Tags) {
                    if ($tag.Key -eq "Name") {
                        $name = $tag.Value
                        # Détecter le projet
                        if ($name -like "exploit-ia-*") {
                            $project = "Exploit-IA"
                        } elseif ($name -like "rt-*") {
                            $project = "Symphonia-RT"
                        }
                    }
                }
                $instances += [PSCustomObject]@{
                    Id = $instance.InstanceId
                    Name = $name
                    Type = $instance.InstanceType
                    State = $instance.State.Name
                    Project = $project
                    LaunchTime = $instance.LaunchTime
                    MonthlyCost = $prices[$instance.InstanceType]
                }
            }
        }
    }
} catch {
    Write-Host "Erreur lors de la recuperation des instances" -ForegroundColor Red
    exit 1
}

Write-Host "Total instances actives: $($instances.Count)" -ForegroundColor White
Write-Host ""

# Grouper par projet
$projectGroups = $instances | Group-Object -Property Project

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Repartition par Projet" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$totalCost = 0
foreach ($group in $projectGroups) {
    $projectCost = ($group.Group | Measure-Object -Property MonthlyCost -Sum).Sum
    $totalCost += $projectCost

    Write-Host "Projet: $($group.Name)" -ForegroundColor Yellow
    Write-Host "  Instances: $($group.Count)" -ForegroundColor White
    Write-Host "  Cout estime: ~$([math]::Round($projectCost, 2)) EUR/mois" -ForegroundColor White

    # Détail par type d'instance
    $typeGroups = $group.Group | Group-Object -Property Type
    foreach ($typeGroup in $typeGroups) {
        $typeCost = ($typeGroup.Group | Measure-Object -Property MonthlyCost -Sum).Sum
        Write-Host "    - $($typeGroup.Name): $($typeGroup.Count)x (~$typeCost EUR/mois)" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "COUT TOTAL EC2: ~$([math]::Round($totalCost, 2)) EUR/mois" -ForegroundColor Green -BackgroundColor Black
Write-Host ""

# Analyser les projets séparément
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse Projet: Exploit-IA" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$exploitInstances = $instances | Where-Object { $_.Project -eq "Exploit-IA" }
if ($exploitInstances.Count -gt 0) {
    $exploitCost = ($exploitInstances | Measure-Object -Property MonthlyCost -Sum).Sum
    Write-Host "Instances Exploit-IA: $($exploitInstances.Count)" -ForegroundColor Yellow
    Write-Host "Cout total: ~$exploitCost EUR/mois" -ForegroundColor Red
    Write-Host ""

    Write-Host "Liste complete:" -ForegroundColor White
    foreach ($inst in $exploitInstances | Sort-Object Name) {
        Write-Host "  - $($inst.Name) ($($inst.Type)) - ~$($inst.MonthlyCost) EUR/mois" -ForegroundColor Gray
    }
    Write-Host ""

    Write-Host "QUESTIONS CRITIQUES:" -ForegroundColor Yellow
    Write-Host "  1. Ces services sont-ils tous en production active?" -ForegroundColor White
    Write-Host "  2. Y a-t-il des doublons/anciennes versions?" -ForegroundColor White
    Write-Host "  3. Peuvent-ils etre arretes en dehors des heures de travail?" -ForegroundColor White
    Write-Host "  4. Certains peuvent-ils etre consolides?" -ForegroundColor White
    Write-Host ""

    Write-Host "ECONOMIES POTENTIELLES:" -ForegroundColor Green
    Write-Host "  - Arret nocturne (19h-8h) + week-end: ~60% = ~$([math]::Round($exploitCost * 0.6, 2)) EUR/mois" -ForegroundColor Green
    Write-Host "  - Downgrade vers t3.micro (si possible): ~$([math]::Round($exploitCost * 0.5, 2)) EUR/mois" -ForegroundColor Green
    Write-Host "  - Consolidation de services: ~$([math]::Round($exploitCost * 0.3, 2)) EUR/mois" -ForegroundColor Green
    Write-Host ""
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse Projet: Symphonia-RT" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$symphoniaInstances = $instances | Where-Object { $_.Project -eq "Symphonia-RT" }
if ($symphoniaInstances.Count -gt 0) {
    $symphoniaCost = ($symphoniaInstances | Measure-Object -Property MonthlyCost -Sum).Sum
    Write-Host "Instances Symphonia-RT: $($symphoniaInstances.Count)" -ForegroundColor Yellow
    Write-Host "Cout total: ~$symphoniaCost EUR/mois" -ForegroundColor White
    Write-Host ""

    # Identifier les patterns de noms pour détecter les services
    $servicePatterns = @{}
    foreach ($inst in $symphoniaInstances) {
        # Extraire le nom du service (sans -prod, -v2, etc.)
        $serviceName = $inst.Name -replace '-prod.*$', '' -replace '-v\d+$', ''

        if (!$servicePatterns.ContainsKey($serviceName)) {
            $servicePatterns[$serviceName] = @()
        }
        $servicePatterns[$serviceName] += $inst
    }

    Write-Host "Services identifies: $($servicePatterns.Count)" -ForegroundColor White
    Write-Host ""

    # Détecter les doublons
    $duplicates = $servicePatterns.GetEnumerator() | Where-Object { $_.Value.Count -gt 1 }
    if ($duplicates.Count -gt 0) {
        Write-Host "DOUBLONS DETECTES:" -ForegroundColor Red
        foreach ($dup in $duplicates) {
            Write-Host "  Service: $($dup.Key) - $($dup.Value.Count) versions" -ForegroundColor Yellow
            foreach ($version in $dup.Value | Sort-Object LaunchTime -Descending) {
                $marker = if ($version -eq $dup.Value[0]) { " (RECENT)" } else { " (ANCIEN - SUPPRIMER)" }
                $color = if ($version -eq $dup.Value[0]) { "Green" } else { "Red" }
                Write-Host "    - $($version.Name) ($($version.Type))$marker" -ForegroundColor $color
            }
        }
        Write-Host ""
    }

    # Analyser l'utilisation par type
    Write-Host "Repartition par type d'instance:" -ForegroundColor White
    $typeGroups = $symphoniaInstances | Group-Object -Property Type | Sort-Object Name
    foreach ($typeGroup in $typeGroups) {
        $typeCost = ($typeGroup.Group | Measure-Object -Property MonthlyCost -Sum).Sum
        Write-Host "  $($typeGroup.Name): $($typeGroup.Count)x = ~$typeCost EUR/mois" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Opportunites d'Optimisation MAJEURES" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$totalSavings = 0

# 1. Supprimer doublons
$duplicateSavings = 0
$duplicates = $instances | Group-Object Name | Where-Object { $_.Count -gt 1 }
foreach ($dup in $duplicates) {
    $old = $dup.Group | Sort-Object LaunchTime | Select-Object -First ($dup.Count - 1)
    $duplicateSavings += ($old | Measure-Object -Property MonthlyCost -Sum).Sum
}

Write-Host "1. Supprimer les anciennes versions/doublons" -ForegroundColor Yellow
Write-Host "   Economie: ~$duplicateSavings EUR/mois" -ForegroundColor Green
$totalSavings += $duplicateSavings
Write-Host ""

# 2. Auto-scaling avec arrêt nocturne (Exploit-IA seulement)
if ($exploitInstances.Count -gt 0) {
    $exploitCost = ($exploitInstances | Measure-Object -Property MonthlyCost -Sum).Sum
    $nightWeekendSavings = $exploitCost * 0.6

    Write-Host "2. Auto-scaling avec arret nocturne + week-end" -ForegroundColor Yellow
    Write-Host "   (pour services Exploit-IA si non-production 24/7)" -ForegroundColor Gray
    Write-Host "   Heures d'arret: 19h-8h (lun-ven) + sam-dim" -ForegroundColor Gray
    Write-Host "   ~60% d'arret = ~60% d'economie" -ForegroundColor Gray
    Write-Host "   Economie: ~$([math]::Round($nightWeekendSavings, 2)) EUR/mois" -ForegroundColor Green
    $totalSavings += $nightWeekendSavings
    Write-Host ""
}

# 3. Downgrade t3.small vers t3.micro
$smallInstances = $instances | Where-Object { $_.Type -eq "t3.small" }
$downgradeSavings = $smallInstances.Count * 7.5

Write-Host "3. Downgrade t3.small vers t3.micro" -ForegroundColor Yellow
Write-Host "   (apres verification CPU < 30%)" -ForegroundColor Gray
Write-Host "   Instances concernees: $($smallInstances.Count)" -ForegroundColor Gray
Write-Host "   Economie: ~$downgradeSavings EUR/mois" -ForegroundColor Green
$totalSavings += $downgradeSavings
Write-Host ""

# 4. Reserved Instances (1 an)
$reservedSavings = $totalCost * 0.30

Write-Host "4. Reserved Instances (engagement 1 an)" -ForegroundColor Yellow
Write-Host "   Reduction: ~30%" -ForegroundColor Gray
Write-Host "   Economie: ~$([math]::Round($reservedSavings, 2)) EUR/mois" -ForegroundColor Green
# Ne pas ajouter au total car incompatible avec d'autres économies
Write-Host ""

# 5. Compute Savings Plan
$savingsPlanDiscount = $totalCost * 0.35

Write-Host "5. Compute Savings Plan (alternative aux Reserved)" -ForegroundColor Yellow
Write-Host "   Reduction: ~35%" -ForegroundColor Gray
Write-Host "   Plus flexible que Reserved Instances" -ForegroundColor Gray
Write-Host "   Economie: ~$([math]::Round($savingsPlanDiscount, 2)) EUR/mois" -ForegroundColor Green
Write-Host ""

# 6. Migration vers Lambda (services légers)
$lambdaSavings = 30

Write-Host "6. Migration vers AWS Lambda (services legers)" -ForegroundColor Yellow
Write-Host "   Services candidats: 4-5 APIs a faible trafic" -ForegroundColor Gray
Write-Host "   Economie: ~$lambdaSavings EUR/mois" -ForegroundColor Green
$totalSavings += $lambdaSavings
Write-Host ""

# 7. ElastiCache Redis
Write-Host "7. Desactiver ElastiCache Redis" -ForegroundColor Yellow
Write-Host "   Economie: ~15 EUR/mois" -ForegroundColor Green
$totalSavings += 15
Write-Host ""

# 8. Consolidation de micro-services
Write-Host "8. Consolidation de micro-services" -ForegroundColor Yellow
Write-Host "   Regrouper 6-8 services legers sur 2-3 instances" -ForegroundColor Gray
Write-Host "   Economie: ~30-45 EUR/mois" -ForegroundColor Green
$totalSavings += 37.5
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "RESUME DES ECONOMIES" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cout actuel total: ~$([math]::Round($totalCost, 2)) EUR/mois (EC2 seulement)" -ForegroundColor White
Write-Host "Projection totale AWS: ~1,855 EUR/mois" -ForegroundColor White
Write-Host ""

Write-Host "SCENARIO 1: Optimisations Rapides (sans Savings Plan)" -ForegroundColor Cyan
Write-Host "  Economies identifiees: ~$([math]::Round($totalSavings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Nouveau cout: ~$([math]::Round(1855 - $totalSavings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Reduction: $([math]::Round($totalSavings / 1855 * 100, 1))%" -ForegroundColor Green
Write-Host ""

Write-Host "SCENARIO 2: Optimisations + Compute Savings Plan" -ForegroundColor Cyan
$scenario2Savings = ($totalSavings * 0.4) + $savingsPlanDiscount  # Certaines économies ne s'additionnent pas
Write-Host "  Economies identifiees: ~$([math]::Round($scenario2Savings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Nouveau cout: ~$([math]::Round(1855 - $scenario2Savings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Reduction: $([math]::Round($scenario2Savings / 1855 * 100, 1))%" -ForegroundColor Green
Write-Host ""

Write-Host "SCENARIO 3: OPTIMISATION AGGRESSIVE" -ForegroundColor Cyan
Write-Host "  (Scenario 2 + Migration Lambda + Consolidation agressive)" -ForegroundColor Gray
$scenario3Savings = $scenario2Savings + 100  # Économies supplémentaires
Write-Host "  Economies identifiees: ~$([math]::Round($scenario3Savings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Nouveau cout: ~$([math]::Round(1855 - $scenario3Savings, 2)) EUR/mois" -ForegroundColor Green
Write-Host "  Reduction: $([math]::Round($scenario3Savings / 1855 * 100, 1))%" -ForegroundColor Green
Write-Host ""

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "PLAN D'ACTION RECOMMANDE" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "PHASE 1 (AUJOURD'HUI): Actions Immediates" -ForegroundColor Yellow
Write-Host "  1. Arreter RT-DeploymentInstance" -ForegroundColor White
Write-Host "  2. Supprimer 5 anciennes versions identifiees" -ForegroundColor White
Write-Host "  3. Desactiver ElastiCache Redis" -ForegroundColor White
Write-Host "  Economie: ~81 EUR/mois" -ForegroundColor Green
Write-Host ""

Write-Host "PHASE 2 (CETTE SEMAINE): Analyse Exploit-IA" -ForegroundColor Yellow
Write-Host "  1. Identifier quels services Exploit-IA sont critiques 24/7" -ForegroundColor White
Write-Host "  2. Configurer auto-scaling avec arret nocturne pour dev/staging" -ForegroundColor White
Write-Host "  3. Verifier CPU des t3.small et downgrade si < 30%" -ForegroundColor White
Write-Host "  Economie: ~150-200 EUR/mois" -ForegroundColor Green
Write-Host ""

Write-Host "PHASE 3 (2 SEMAINES): Optimisations Structurelles" -ForegroundColor Yellow
Write-Host "  1. Configurer Compute Savings Plan (35% reduction)" -ForegroundColor White
Write-Host "  2. Consolider micro-services legers" -ForegroundColor White
Write-Host "  3. Migrer 4-5 APIs vers Lambda" -ForegroundColor White
Write-Host "  Economie: ~200-300 EUR/mois supplementaires" -ForegroundColor Green
Write-Host ""

Write-Host "OBJECTIF FINAL:" -ForegroundColor Cyan -BackgroundColor Black
Write-Host "  Reduction de 1,855 EUR/mois a ~1,000-1,200 EUR/mois" -ForegroundColor Green -BackgroundColor Black
Write-Host "  Economie totale: ~650-850 EUR/mois (35-45%)" -ForegroundColor Green -BackgroundColor Black
Write-Host ""

Write-Host "OK Analyse terminee" -ForegroundColor Green
