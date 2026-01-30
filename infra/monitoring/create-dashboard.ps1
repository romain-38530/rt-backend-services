# Script PowerShell de création du dashboard CloudWatch pour SYMPHONI.A
$REGION = "eu-central-1"
$DASHBOARD_NAME = "SYMPHONIA-Production"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== Création du Dashboard CloudWatch SYMPHONI.A ===`n" -ForegroundColor Green

# Vérifier que le fichier de configuration existe
$configFile = Join-Path $SCRIPT_DIR "dashboard-config.json"
if (-not (Test-Path $configFile)) {
    Write-Host "Erreur: Le fichier dashboard-config.json n'existe pas!" -ForegroundColor Red
    exit 1
}

Write-Host "Création du dashboard: $DASHBOARD_NAME"

# Créer le dashboard
try {
    aws cloudwatch put-dashboard `
        --dashboard-name $DASHBOARD_NAME `
        --dashboard-body file://$configFile `
        --region $REGION

    Write-Host "`n✓ Dashboard créé avec succès!`n" -ForegroundColor Green
    Write-Host "URL du dashboard:"
    Write-Host "https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=$DASHBOARD_NAME"
    Write-Host ""
    Write-Host "Pour voir le dashboard:" -ForegroundColor Yellow
    Write-Host "aws cloudwatch get-dashboard --dashboard-name $DASHBOARD_NAME --region $REGION"
}
catch {
    Write-Host "`n✗ Échec de création du dashboard`n" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
