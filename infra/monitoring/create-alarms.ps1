# Script PowerShell de création des alarmes CloudWatch pour SYMPHONI.A
# Région AWS
$REGION = "eu-central-1"

Write-Host "`n=== Création des alarmes CloudWatch pour SYMPHONI.A ===`n" -ForegroundColor Green

# Liste des environnements Elastic Beanstalk à monitorer
$ENVIRONMENTS = @{
    "TMS-Sync" = "rt-tms-sync-api-v2"
    "Affret-IA" = "rt-affret-ia-api-prod"
    "Orders" = "rt-orders-api-prod-v2"
    "Subscriptions" = "rt-subscriptions-api-prod-v5"
    "Auth" = "rt-authz-api-prod"
    "Billing" = "rt-billing-api-prod"
}

# Fonction pour créer une alarme
function Create-Alarm {
    param(
        [string]$ServiceName,
        [string]$EnvName,
        [string]$AlarmName,
        [string]$MetricName,
        [string]$Threshold,
        [string]$Comparison,
        [string]$Description,
        [string]$Namespace,
        [string]$Statistic = "Average",
        [string]$Period = "300",
        [string]$EvaluationPeriods = "2",
        [string]$Unit = ""
    )

    Write-Host "Création de l'alarme: $AlarmName" -ForegroundColor Yellow

    $cmd = "aws cloudwatch put-metric-alarm " +
           "--alarm-name `"$AlarmName`" " +
           "--alarm-description `"$Description`" " +
           "--metric-name `"$MetricName`" " +
           "--namespace `"$Namespace`" " +
           "--statistic `"$Statistic`" " +
           "--period $Period " +
           "--evaluation-periods $EvaluationPeriods " +
           "--threshold $Threshold " +
           "--comparison-operator $Comparison " +
           "--dimensions Name=EnvironmentName,Value=$EnvName " +
           "--region $REGION"

    if ($Unit -ne "") {
        $cmd += " --unit `"$Unit`""
    }

    try {
        Invoke-Expression $cmd
        Write-Host "✓ Alarme créée: $AlarmName`n" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Échec de création: $AlarmName`n" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

# Créer les alarmes pour chaque service
foreach ($service in $ENVIRONMENTS.Keys) {
    $envName = $ENVIRONMENTS[$service]

    Write-Host "`n=== Configuration des alarmes pour $service ($envName) ===`n" -ForegroundColor Green

    # Alarme CPU > 80%
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-High-CPU" `
        -MetricName "CPUUtilization" `
        -Threshold "80" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service CPU utilization > 80%" `
        -Namespace "AWS/ElasticBeanstalk" `
        -Statistic "Average" `
        -Period "300" `
        -EvaluationPeriods "2" `
        -Unit "Percent"

    # Alarme Memory > 85%
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-High-Memory" `
        -MetricName "MemoryUtilization" `
        -Threshold "85" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service Memory utilization > 85%" `
        -Namespace "CWAgent" `
        -Statistic "Average" `
        -Period "300" `
        -EvaluationPeriods "2" `
        -Unit "Percent"

    # Alarme HTTP 5xx > 10/minute
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-High-5xx-Errors" `
        -MetricName "ApplicationRequests5xx" `
        -Threshold "10" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service HTTP 5xx errors > 10/minute" `
        -Namespace "AWS/ElasticBeanstalk" `
        -Statistic "Sum" `
        -Period "60" `
        -EvaluationPeriods "2" `
        -Unit "Count"

    # Alarme HTTP 4xx > 50/minute
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-High-4xx-Errors" `
        -MetricName "ApplicationRequests4xx" `
        -Threshold "50" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service HTTP 4xx errors > 50/minute" `
        -Namespace "AWS/ElasticBeanstalk" `
        -Statistic "Sum" `
        -Period "60" `
        -EvaluationPeriods "2" `
        -Unit "Count"

    # Alarme Health Status Degraded
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-Environment-Health-Degraded" `
        -MetricName "EnvironmentHealth" `
        -Threshold "15" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service Environment health is degraded" `
        -Namespace "AWS/ElasticBeanstalk" `
        -Statistic "Average" `
        -Period "60" `
        -EvaluationPeriods "1"

    # Alarme Latence > 2 secondes
    Create-Alarm `
        -ServiceName $service `
        -EnvName $envName `
        -AlarmName "$service-High-Latency" `
        -MetricName "ApplicationLatencyP99" `
        -Threshold "2" `
        -Comparison "GreaterThanThreshold" `
        -Description "$service P99 Latency > 2 seconds" `
        -Namespace "AWS/ElasticBeanstalk" `
        -Statistic "Average" `
        -Period "300" `
        -EvaluationPeriods "2" `
        -Unit "Seconds"
}

# Alarmes SES (Simple Email Service)
Write-Host "`n=== Configuration des alarmes pour SES ===`n" -ForegroundColor Green

# Alarme Bounce Rate > 5%
try {
    aws cloudwatch put-metric-alarm `
        --alarm-name "SES-High-Bounce-Rate" `
        --alarm-description "SES bounce rate > 5%" `
        --metric-name "Reputation.BounceRate" `
        --namespace "AWS/SES" `
        --statistic "Average" `
        --period 86400 `
        --evaluation-periods 1 `
        --threshold 0.05 `
        --comparison-operator GreaterThanThreshold `
        --region $REGION

    Write-Host "✓ Alarme SES Bounce Rate créée`n" -ForegroundColor Green
}
catch {
    Write-Host "✗ Échec création alarme SES Bounce Rate" -ForegroundColor Red
}

# Alarme Complaint Rate > 0.1%
try {
    aws cloudwatch put-metric-alarm `
        --alarm-name "SES-High-Complaint-Rate" `
        --alarm-description "SES complaint rate > 0.1%" `
        --metric-name "Reputation.ComplaintRate" `
        --namespace "AWS/SES" `
        --statistic "Average" `
        --period 86400 `
        --evaluation-periods 1 `
        --threshold 0.001 `
        --comparison-operator GreaterThanThreshold `
        --region $REGION

    Write-Host "✓ Alarme SES Complaint Rate créée`n" -ForegroundColor Green
}
catch {
    Write-Host "✗ Échec création alarme SES Complaint Rate" -ForegroundColor Red
}

Write-Host "`n=== Toutes les alarmes ont été créées avec succès ===`n" -ForegroundColor Green
Write-Host "Pour vérifier les alarmes créées:" -ForegroundColor Yellow
Write-Host "aws cloudwatch describe-alarms --region $REGION"
Write-Host ""
Write-Host "Pour voir les alarmes en état d'alarme:" -ForegroundColor Yellow
Write-Host "aws cloudwatch describe-alarms --state-value ALARM --region $REGION"
