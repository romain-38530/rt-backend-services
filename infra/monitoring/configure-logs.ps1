# Script PowerShell de configuration des logs CloudWatch pour SYMPHONI.A
$REGION = "eu-central-1"

Write-Host "`n=== Configuration des logs CloudWatch pour SYMPHONI.A ===`n" -ForegroundColor Green

# Liste des environnements Elastic Beanstalk
$ENVIRONMENTS = @(
    "rt-tms-sync-api-v2",
    "rt-affret-ia-api-prod",
    "rt-orders-api-prod-v2",
    "rt-subscriptions-api-prod-v5",
    "rt-authz-api-prod",
    "rt-billing-api-prod"
)

# Fonction pour activer les logs sur un environnement
function Enable-Logs {
    param([string]$EnvName)

    Write-Host "Configuration des logs pour: $EnvName" -ForegroundColor Yellow

    try {
        aws elasticbeanstalk update-environment `
            --environment-name $EnvName `
            --region $REGION `
            --option-settings `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=StreamLogs,Value=true `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=DeleteOnTerminate,Value=false `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs,OptionName=RetentionInDays,Value=7 `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=HealthStreamingEnabled,Value=true `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=DeleteOnTerminate,Value=false `
                Namespace=aws:elasticbeanstalk:cloudwatch:logs:health,OptionName=RetentionInDays,Value=7

        Write-Host "✓ Logs activés pour: $EnvName`n" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ Échec activation logs pour: $EnvName`n" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
    }
}

# Activer les logs pour tous les environnements
foreach ($envName in $ENVIRONMENTS) {
    Enable-Logs -EnvName $envName

    # Attendre un peu entre chaque configuration pour éviter les limites d'API
    Start-Sleep -Seconds 5
}

Write-Host "`n=== Configuration des logs terminée ===`n" -ForegroundColor Green

Write-Host "Pour vérifier les logs d'un environnement:" -ForegroundColor Yellow
Write-Host "aws logs describe-log-groups --region $REGION | findstr elasticbeanstalk"
Write-Host ""
Write-Host "Pour consulter les logs en temps réel:" -ForegroundColor Yellow
Write-Host "aws logs tail /aws/elasticbeanstalk/<env-name>/var/log/nodejs/nodejs.log --follow --region $REGION"
Write-Host ""
Write-Host "Groupes de logs créés:" -ForegroundColor Yellow
foreach ($envName in $ENVIRONMENTS) {
    Write-Host "  - /aws/elasticbeanstalk/$envName/var/log/nodejs/nodejs.log"
    Write-Host "  - /aws/elasticbeanstalk/$envName/var/log/eb-engine.log"
    Write-Host "  - /aws/elasticbeanstalk/$envName/var/log/eb-health.log"
}
