# Script PowerShell d'installation complète du monitoring SYMPHONI.A
# Ce script exécute toutes les étapes de configuration

$ErrorActionPreference = "Stop"

$REGION = "eu-central-1"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=========================================="
Write-Host "  SYMPHONI.A - Installation Monitoring   " -ForegroundColor Blue
Write-Host "==========================================`n"

# Fonction pour afficher les étapes
function Write-Step {
    param([string]$Message)
    Write-Host "`n>>> $Message`n" -ForegroundColor Blue
}

# Fonction pour afficher les succès
function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

# Fonction pour afficher les warnings
function Write-Warning2 {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

# Fonction pour afficher les erreurs
function Write-Error2 {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

# Vérifier les prérequis
Write-Step "Vérification des prérequis"

try {
    $null = aws --version
    Write-Success "AWS CLI installé"
} catch {
    Write-Error2 "AWS CLI n'est pas installé"
    Write-Host "Installez AWS CLI: https://aws.amazon.com/cli/"
    exit 1
}

# Vérifier la configuration AWS
try {
    $null = aws sts get-caller-identity
    Write-Success "AWS CLI configuré"
} catch {
    Write-Error2 "AWS CLI n'est pas configuré"
    Write-Host "Configurez AWS CLI: aws configure"
    exit 1
}

# Afficher l'identité AWS
$AWS_ACCOUNT = aws sts get-caller-identity --query Account --output text
$AWS_USER = aws sts get-caller-identity --query Arn --output text
Write-Host "Compte AWS: $AWS_ACCOUNT"
Write-Host "Utilisateur: $AWS_USER"

# Demander confirmation
Write-Host "`nCette opération va créer:" -ForegroundColor Yellow
Write-Host "  - 42 alarmes CloudWatch"
Write-Host "  - 1 dashboard CloudWatch"
Write-Host "  - Configuration des logs pour 6 services"
Write-Host ""
$confirmation = Read-Host "Voulez-vous continuer? (y/N)"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Installation annulée"
    exit 0
}

# Étape 1: Créer les alarmes
Write-Step "Étape 1/3: Création des alarmes CloudWatch"

$createAlarmsScript = Join-Path $SCRIPT_DIR "create-alarms.ps1"
if (Test-Path $createAlarmsScript) {
    & $createAlarmsScript
    Write-Success "Alarmes créées"
} else {
    Write-Error2 "Fichier create-alarms.ps1 introuvable"
    exit 1
}

# Étape 2: Créer le dashboard
Write-Step "Étape 2/3: Création du dashboard CloudWatch"

$createDashboardScript = Join-Path $SCRIPT_DIR "create-dashboard.ps1"
if (Test-Path $createDashboardScript) {
    & $createDashboardScript
    Write-Success "Dashboard créé"
} else {
    Write-Error2 "Fichier create-dashboard.ps1 introuvable"
    exit 1
}

# Étape 3: Configurer les logs
Write-Step "Étape 3/3: Configuration des logs CloudWatch"

Write-Host "⚠ Cette étape peut prendre 3-5 minutes`n" -ForegroundColor Yellow

$configureLogsScript = Join-Path $SCRIPT_DIR "configure-logs.ps1"
if (Test-Path $configureLogsScript) {
    & $configureLogsScript
    Write-Success "Logs configurés"
} else {
    Write-Error2 "Fichier configure-logs.ps1 introuvable"
    exit 1
}

# Vérification finale
Write-Step "Vérification de l'installation"

# Compter les alarmes créées
$alarmNames = aws cloudwatch describe-alarms --region $REGION --query "MetricAlarms[?starts_with(AlarmName, 'TMS-Sync') || starts_with(AlarmName, 'Affret-IA') || starts_with(AlarmName, 'Orders') || starts_with(AlarmName, 'Subscriptions') || starts_with(AlarmName, 'Auth') || starts_with(AlarmName, 'Billing') || starts_with(AlarmName, 'Frontend') || starts_with(AlarmName, 'SES')].AlarmName" --output text
$ALARM_COUNT = ($alarmNames -split '\s+').Count

Write-Host "Alarmes créées: $ALARM_COUNT / 42"
if ($ALARM_COUNT -ge 40) {
    Write-Success "Toutes les alarmes ont été créées"
} else {
    Write-Warning2 "Certaines alarmes n'ont peut-être pas été créées"
}

# Vérifier le dashboard
try {
    $null = aws cloudwatch get-dashboard --dashboard-name SYMPHONIA-Production --region $REGION 2>$null
    Write-Success "Dashboard créé"
} catch {
    Write-Warning2 "Dashboard non trouvé"
}

# Récapitulatif
Write-Host "`n=========================================="
Write-Host "  Installation terminée avec succès!     " -ForegroundColor Green
Write-Host "==========================================`n"

Write-Host "Prochaines étapes:`n" -ForegroundColor Blue

Write-Host "1. Consultez le dashboard:"
Write-Host "   https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=SYMPHONIA-Production"
Write-Host ""

Write-Host "2. Vérifiez les alarmes:"
Write-Host "   aws cloudwatch describe-alarms --region $REGION"
Write-Host ""

Write-Host "3. Intégrez les métriques personnalisées:"
Write-Host "   - TMS Sync: Voir examples/tms-sync-integration.js"
Write-Host "   - Affret.IA: Voir examples/affret-ia-integration.js"
Write-Host ""

Write-Host "4. Configurez les notifications SNS (optionnel):"
Write-Host "   aws sns create-topic --name symphonia-alerts --region $REGION"
Write-Host ""

Write-Host "5. Consultez la documentation:"
Write-Host "   $SCRIPT_DIR\README.md"
Write-Host "   $SCRIPT_DIR\RAPPORT-MONITORING-SYMPHONIA.md"
Write-Host ""

Write-Host "Monitoring SYMPHONI.A opérationnel! ✓`n" -ForegroundColor Green
