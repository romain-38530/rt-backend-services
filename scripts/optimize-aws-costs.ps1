# Script d'Optimisation Automatique des Coûts AWS - Symphonia Platform
# Version: 1.0
# Date: 2026-02-23
#
# ATTENTION: Ce script peut arrêter/terminer des instances EC2
# Par défaut, il fonctionne en mode DRY-RUN (simulation)
# Utilisez -Execute pour appliquer les changements réellement

param(
    [switch]$Execute = $false,
    [switch]$SkipConfirmation = $false
)

$ErrorActionPreference = "Continue"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Optimisation des Couts AWS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if ($Execute) {
    Write-Host "MODE: EXECUTION REELLE" -ForegroundColor Red
    Write-Host "Les actions seront appliquees sur vos ressources AWS" -ForegroundColor Yellow
} else {
    Write-Host "MODE: DRY-RUN (Simulation)" -ForegroundColor Green
    Write-Host "Aucune modification ne sera apportee" -ForegroundColor Gray
    Write-Host "Utilisez -Execute pour appliquer les changements" -ForegroundColor Gray
}
Write-Host ""

# Vérifier AWS CLI
if (!(Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: AWS CLI n'est pas installe" -ForegroundColor Red
    exit 1
}

# Vérifier credentials
try {
    $identity = aws sts get-caller-identity --output json 2>$null | ConvertFrom-Json
    if (!$identity) { throw }
    Write-Host "OK Compte AWS: $($identity.Account)" -ForegroundColor Green
} catch {
    Write-Host "Erreur: Credentials AWS non configures" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Analyse des Ressources" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Récupérer toutes les instances EC2
$instances = @()
try {
    $ec2Json = aws ec2 describe-instances --filters "Name=instance-state-name,Values=running" --output json 2>$null
    if ($ec2Json) {
        $ec2Data = $ec2Json | ConvertFrom-Json
        foreach ($reservation in $ec2Data.Reservations) {
            foreach ($instance in $reservation.Instances) {
                $name = "Sans nom"
                foreach ($tag in $instance.Tags) {
                    if ($tag.Key -eq "Name") {
                        $name = $tag.Value
                        break
                    }
                }
                $instances += [PSCustomObject]@{
                    Id = $instance.InstanceId
                    Name = $name
                    Type = $instance.InstanceType
                    State = $instance.State.Name
                    LaunchTime = $instance.LaunchTime
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

# Variables pour tracking
$totalSavings = 0
$actionsTaken = 0
$actionsPlanned = @()

# Prix mensuels approximatifs (EUR)
$prices = @{
    "t3.micro" = 7.50
    "t3.small" = 15
    "t3.medium" = 30
}

# ============================================
# OPTIMISATION 1: RT-DeploymentInstance
# ============================================
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "1. Instance de Deploiement" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$deployInstance = $instances | Where-Object { $_.Name -eq "RT-DeploymentInstance" }
if ($deployInstance) {
    Write-Host "TROUVE: RT-DeploymentInstance ($($deployInstance.Type))" -ForegroundColor Yellow
    Write-Host "  Type: $($deployInstance.Type)" -ForegroundColor Gray
    Write-Host "  Cout: ~30 EUR/mois (24/7)" -ForegroundColor Gray
    Write-Host "  Recommandation: Arreter quand non utilisee" -ForegroundColor Gray
    Write-Host ""

    $saving = $prices[$deployInstance.Type]
    if ($saving) {
        $monthlySaving = $saving * 0.7  # Économie si arrêté 70% du temps
        Write-Host "  Economie potentielle: ~$([math]::Round($monthlySaving, 2)) EUR/mois" -ForegroundColor Green
        $totalSavings += $monthlySaving

        $action = [PSCustomObject]@{
            Type = "Stop Instance"
            Resource = "RT-DeploymentInstance"
            InstanceId = $deployInstance.Id
            Savings = $monthlySaving
            Command = "aws ec2 stop-instances --instance-ids $($deployInstance.Id)"
        }
        $actionsPlanned += $action

        if ($Execute) {
            Write-Host ""
            Write-Host "  ACTION: Arret de l'instance..." -ForegroundColor Yellow
            if (!$SkipConfirmation) {
                $confirm = Read-Host "  Confirmer l'arret de RT-DeploymentInstance? (oui/non)"
                if ($confirm -ne "oui") {
                    Write-Host "  ACTION ANNULEE" -ForegroundColor Red
                } else {
                    try {
                        aws ec2 stop-instances --instance-ids $deployInstance.Id --output json | Out-Null
                        Write-Host "  OK Instance arretee" -ForegroundColor Green
                        $actionsTaken++
                    } catch {
                        Write-Host "  ERREUR lors de l'arret" -ForegroundColor Red
                    }
                }
            }
        }
    }
} else {
    Write-Host "OK RT-DeploymentInstance non trouvee ou deja arretee" -ForegroundColor Green
}

Write-Host ""

# ============================================
# OPTIMISATION 2: Anciennes Versions de Services
# ============================================
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "2. Anciennes Versions de Services" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Définir les services avec versions multiples
$serviceVersions = @{
    "tms-sync-api" = @("rt-tms-sync-api-prod", "rt-tms-sync-api-v2", "rt-tms-sync-api-production")
    "subscriptions-api" = @("rt-subscriptions-api-prod-v2", "rt-subscriptions-api-prod-v5")
    "affret-ia-api" = @("rt-affret-ia-api-prod", "rt-affret-ia-api-prod-v4")
    "orders-api" = @("rt-orders-api-prod", "rt-orders-api-prod-v2")
}

$duplicates = @()

foreach ($service in $serviceVersions.Keys) {
    $serviceInstances = @()
    foreach ($versionName in $serviceVersions[$service]) {
        $found = $instances | Where-Object { $_.Name -eq $versionName }
        if ($found) {
            $serviceInstances += $found
        }
    }

    if ($serviceInstances.Count -gt 1) {
        Write-Host "SERVICE: $service - $($serviceInstances.Count) versions actives" -ForegroundColor Yellow

        # Trier par date de lancement (plus récent = garder)
        $sorted = $serviceInstances | Sort-Object LaunchTime -Descending

        Write-Host "  Version la plus recente (A GARDER):" -ForegroundColor Green
        Write-Host "    - $($sorted[0].Name) ($($sorted[0].Type)) - Lancee: $($sorted[0].LaunchTime)" -ForegroundColor White

        Write-Host "  Anciennes versions (A SUPPRIMER):" -ForegroundColor Red
        for ($i = 1; $i -lt $sorted.Count; $i++) {
            $old = $sorted[$i]
            Write-Host "    - $($old.Name) ($($old.Type)) - Lancee: $($old.LaunchTime)" -ForegroundColor Gray

            $saving = $prices[$old.Type]
            if ($saving) {
                Write-Host "      Economie: ~$saving EUR/mois" -ForegroundColor Green
                $totalSavings += $saving

                $action = [PSCustomObject]@{
                    Type = "Terminate Instance"
                    Resource = $old.Name
                    InstanceId = $old.Id
                    Savings = $saving
                    Command = "aws ec2 terminate-instances --instance-ids $($old.Id)"
                }
                $actionsPlanned += $action
                $duplicates += $old
            }
        }
        Write-Host ""
    }
}

if ($duplicates.Count -gt 0) {
    Write-Host "Total anciennes versions trouvees: $($duplicates.Count)" -ForegroundColor Yellow
    $dupSavings = ($duplicates | ForEach-Object { $prices[$_.Type] } | Measure-Object -Sum).Sum
    Write-Host "Economie totale: ~$dupSavings EUR/mois" -ForegroundColor Green

    if ($Execute) {
        Write-Host ""
        Write-Host "ACTION: Suppression des anciennes versions..." -ForegroundColor Yellow
        if (!$SkipConfirmation) {
            Write-Host "Instances a supprimer:" -ForegroundColor Red
            foreach ($dup in $duplicates) {
                Write-Host "  - $($dup.Name) ($($dup.Id))" -ForegroundColor Gray
            }
            $confirm = Read-Host "Confirmer la suppression de $($duplicates.Count) instance(s)? (oui/non)"
            if ($confirm -ne "oui") {
                Write-Host "ACTION ANNULEE" -ForegroundColor Red
            } else {
                foreach ($dup in $duplicates) {
                    try {
                        Write-Host "  Suppression: $($dup.Name)..." -ForegroundColor Yellow
                        aws ec2 terminate-instances --instance-ids $dup.Id --output json | Out-Null
                        Write-Host "  OK Instance supprimee" -ForegroundColor Green
                        $actionsTaken++
                    } catch {
                        Write-Host "  ERREUR lors de la suppression" -ForegroundColor Red
                    }
                }
            }
        }
    }
} else {
    Write-Host "OK Aucune ancienne version trouvee" -ForegroundColor Green
}

Write-Host ""

# ============================================
# OPTIMISATION 3: Instances Surdimensionnées
# ============================================
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "3. Instances Surdimensionnees" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Identifier les t3.small qui pourraient être des t3.micro
$smallInstances = $instances | Where-Object { $_.Type -eq "t3.small" }

if ($smallInstances.Count -gt 0) {
    Write-Host "TROUVE: $($smallInstances.Count) instances t3.small" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Candidats pour downgrade vers t3.micro:" -ForegroundColor White
    Write-Host "(Necessite verification de l'utilisation CPU)" -ForegroundColor Gray
    Write-Host ""

    foreach ($small in $smallInstances) {
        Write-Host "  - $($small.Name) ($($small.Type))" -ForegroundColor White
        Write-Host "    ID: $($small.Id)" -ForegroundColor Gray
        Write-Host "    Economie potentielle: ~7.50 EUR/mois" -ForegroundColor Green

        # Note: On ne peut pas vérifier CPU facilement sans CloudWatch API complexe
        Write-Host "    NOTE: Verifier utilisation CPU avant downgrade" -ForegroundColor Yellow
        Write-Host "    Commande:" -ForegroundColor Gray
        Write-Host "      aws cloudwatch get-metric-statistics \" -ForegroundColor Gray
        Write-Host "        --namespace AWS/EC2 \" -ForegroundColor Gray
        Write-Host "        --metric-name CPUUtilization \" -ForegroundColor Gray
        Write-Host "        --dimensions Name=InstanceId,Value=$($small.Id) \" -ForegroundColor Gray
        Write-Host "        --start-time 2026-02-16T00:00:00Z \" -ForegroundColor Gray
        Write-Host "        --end-time 2026-02-23T23:59:59Z \" -ForegroundColor Gray
        Write-Host "        --period 3600 --statistics Average" -ForegroundColor Gray
        Write-Host ""
    }

    Write-Host "Si CPU < 30% en moyenne, downgrade recommande" -ForegroundColor Yellow
    Write-Host "Economie totale potentielle: ~$($smallInstances.Count * 7.5) EUR/mois" -ForegroundColor Green
} else {
    Write-Host "OK Aucune instance t3.small trouvee" -ForegroundColor Green
}

Write-Host ""

# ============================================
# OPTIMISATION 4: ElastiCache Redis
# ============================================
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "4. Cluster ElastiCache Redis" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

try {
    $cacheJson = aws elasticache describe-cache-clusters --output json 2>$null
    if ($cacheJson) {
        $cacheData = $cacheJson | ConvertFrom-Json
        if ($cacheData.CacheClusters.Count -gt 0) {
            foreach ($cluster in $cacheData.CacheClusters) {
                Write-Host "TROUVE: Cluster ElastiCache" -ForegroundColor Yellow
                Write-Host "  ID: $($cluster.CacheClusterId)" -ForegroundColor White
                Write-Host "  Type: $($cluster.CacheNodeType)" -ForegroundColor White
                Write-Host "  Status: $($cluster.CacheClusterStatus)" -ForegroundColor White
                Write-Host "  Cout: ~15 EUR/mois" -ForegroundColor Gray
                Write-Host ""
                Write-Host "  RECOMMANDATION: Evaluer si reellement utilise" -ForegroundColor Yellow
                Write-Host "  Votre code a un fallback sur cache memoire" -ForegroundColor Gray
                Write-Host "  Economie potentielle: ~15 EUR/mois" -ForegroundColor Green
                Write-Host ""
                $totalSavings += 15

                $action = [PSCustomObject]@{
                    Type = "Delete ElastiCache (Manual)"
                    Resource = $cluster.CacheClusterId
                    InstanceId = $cluster.CacheClusterId
                    Savings = 15
                    Command = "1. Mettre REDIS_ENABLED=false sur tous services`n      2. Attendre 24h`n      3. aws elasticache delete-cache-cluster --cache-cluster-id $($cluster.CacheClusterId)"
                }
                $actionsPlanned += $action

                if ($Execute) {
                    Write-Host "  INFO: Suppression Redis necessite validation manuelle" -ForegroundColor Yellow
                    Write-Host "  Etapes:" -ForegroundColor White
                    Write-Host "    1. Mettre REDIS_ENABLED=false sur tous les services" -ForegroundColor Gray
                    Write-Host "    2. Attendre 24h et verifier que tout fonctionne" -ForegroundColor Gray
                    Write-Host "    3. Executer: aws elasticache delete-cache-cluster --cache-cluster-id $($cluster.CacheClusterId)" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "OK Aucun cluster ElastiCache actif" -ForegroundColor Green
        }
    } else {
        Write-Host "OK Aucun cluster ElastiCache actif" -ForegroundColor Green
    }
} catch {
    Write-Host "OK Aucun cluster ElastiCache actif" -ForegroundColor Green
}

Write-Host ""

# ============================================
# RÉSUMÉ
# ============================================
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Resumé des Optimisations" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

if ($actionsPlanned.Count -gt 0) {
    Write-Host "Actions identifiees: $($actionsPlanned.Count)" -ForegroundColor White
    Write-Host ""

    $i = 1
    foreach ($action in $actionsPlanned) {
        Write-Host "$i. $($action.Type): $($action.Resource)" -ForegroundColor Yellow
        Write-Host "   Economie: ~$($action.Savings) EUR/mois" -ForegroundColor Green
        Write-Host "   Commande:" -ForegroundColor Gray
        Write-Host "     $($action.Command)" -ForegroundColor Gray
        Write-Host ""
        $i++
    }

    Write-Host "ECONOMIE TOTALE ESTIMEE: ~$([math]::Round($totalSavings, 2)) EUR/mois" -ForegroundColor Green -BackgroundColor Black
} else {
    Write-Host "Aucune action d'optimisation necessaire" -ForegroundColor Green
}

Write-Host ""

if ($Execute) {
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Actions Executees" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Nombre d'actions executees: $actionsTaken" -ForegroundColor White
    Write-Host ""
    Write-Host "Verifier l'etat des instances:" -ForegroundColor Yellow
    Write-Host "  aws ec2 describe-instances --output table" -ForegroundColor Gray
} else {
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host "Prochaines Etapes" -ForegroundColor Cyan
    Write-Host "======================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Ce script a fonctionne en mode DRY-RUN (simulation)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour appliquer les changements:" -ForegroundColor White
    Write-Host "  .\scripts\optimize-aws-costs.ps1 -Execute" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Pour executer sans confirmation:" -ForegroundColor White
    Write-Host "  .\scripts\optimize-aws-costs.ps1 -Execute -SkipConfirmation" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "ATTENTION: Verifiez bien les actions proposees avant execution!" -ForegroundColor Red
}

Write-Host ""
Write-Host "OK Script termine" -ForegroundColor Green

# Exporter le rapport
$reportPath = "aws-optimization-report-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
$report = @{
    Date = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    TotalInstances = $instances.Count
    ActionsPlanned = $actionsPlanned
    TotalSavings = $totalSavings
    ActionsExecuted = $actionsTaken
} | ConvertTo-Json -Depth 10

$report | Out-File -FilePath $reportPath -Encoding UTF8
Write-Host ""
Write-Host "Rapport exporte: $reportPath" -ForegroundColor Cyan
