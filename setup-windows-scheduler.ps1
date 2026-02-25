# ========================================
# Configuration Automatique du Planificateur Windows
# Routine Autonome AWS Optimizer
# ========================================

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Configuration Planificateur de Tâches Windows" -ForegroundColor Cyan
Write-Host "Routine Autonome AWS Optimizer" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si exécuté en tant qu'administrateur
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  AVERTISSEMENT: Ce script n'est pas exécuté en tant qu'administrateur" -ForegroundColor Yellow
    Write-Host "   La tâche sera créée pour l'utilisateur actuel uniquement." -ForegroundColor Yellow
    Write-Host ""
}

# Paramètres
$TaskName = "AWS Optimizer - Routine Autonome"
$ScriptPath = Join-Path $PSScriptRoot "run-daily-optimizer.sh"
$WorkingDir = $PSScriptRoot
$BashPath = "C:\Program Files\Git\bin\bash.exe"

# Vérifier que bash.exe existe
if (-not (Test-Path $BashPath)) {
    Write-Host "❌ Erreur: Git Bash non trouvé à $BashPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Solutions possibles:" -ForegroundColor Yellow
    Write-Host "  1. Installer Git pour Windows: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  2. Modifier `$BashPath dans ce script si installé ailleurs" -ForegroundColor Yellow
    exit 1
}

# Vérifier que le script existe
if (-not (Test-Path $ScriptPath)) {
    Write-Host "❌ Erreur: Script non trouvé: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Git Bash trouvé: $BashPath" -ForegroundColor Green
Write-Host "✓ Script trouvé: $ScriptPath" -ForegroundColor Green
Write-Host "✓ Répertoire de travail: $WorkingDir" -ForegroundColor Green
Write-Host ""

# Vérifier si la tâche existe déjà
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "⚠️  La tâche '$TaskName' existe déjà" -ForegroundColor Yellow
    $replace = Read-Host "Voulez-vous la remplacer? (O/N)"

    if ($replace -ne 'O' -and $replace -ne 'o') {
        Write-Host "❌ Configuration annulée" -ForegroundColor Red
        exit 0
    }

    Write-Host "🗑️  Suppression de l'ancienne tâche..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "✓ Ancienne tâche supprimée" -ForegroundColor Green
    Write-Host ""
}

# Créer l'action
Write-Host "📝 Création de la tâche planifiée..." -ForegroundColor Cyan

$Action = New-ScheduledTaskAction `
    -Execute $BashPath `
    -Argument "run-daily-optimizer.sh" `
    -WorkingDirectory $WorkingDir

# Créer le déclencheur (quotidien à 2h00)
$Trigger = New-ScheduledTaskTrigger -Daily -At 2am

# Paramètres
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Principal (utilisateur actuel)
$Principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType S4U `
    -RunLevel Limited

# Description
$Description = @"
Routine autonome d'optimisation AWS
- Analyse quotidienne de l'infrastructure AWS
- Détection automatique des opportunités d'économies
- Génération de rapports dans logs/

Créée automatiquement le $(Get-Date -Format 'dd/MM/yyyy à HH:mm')
"@

# Créer la tâche
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Description $Description `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -ErrorAction Stop | Out-Null

    Write-Host "✅ Tâche créée avec succès!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de la création de la tâche:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Afficher les détails
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "CONFIGURATION RÉUSSIE" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Nom de la tâche: $TaskName" -ForegroundColor White
Write-Host "⏰ Planification: Quotidien à 2h00" -ForegroundColor White
Write-Host "📁 Script: run-daily-optimizer.sh" -ForegroundColor White
Write-Host "📂 Répertoire: $WorkingDir" -ForegroundColor White
Write-Host ""

# Proposer un test immédiat
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "TEST IMMÉDIAT" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
$test = Read-Host "Voulez-vous tester la tâche maintenant? (O/N)"

if ($test -eq 'O' -or $test -eq 'o') {
    Write-Host ""
    Write-Host "🚀 Lancement du test..." -ForegroundColor Cyan

    Start-ScheduledTask -TaskName $TaskName

    Write-Host "✓ Tâche lancée!" -ForegroundColor Green
    Write-Host ""
    Write-Host "⏳ Attente de 10 secondes..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    # Vérifier le dernier log
    $logPattern = Join-Path $WorkingDir "logs\daily-optimizer-*.log"
    $latestLog = Get-ChildItem $logPattern -ErrorAction SilentlyContinue |
                 Sort-Object LastWriteTime -Descending |
                 Select-Object -First 1

    if ($latestLog) {
        Write-Host "✓ Log créé: $($latestLog.Name)" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Aperçu du rapport:" -ForegroundColor Cyan
        Write-Host "---" -ForegroundColor DarkGray
        Get-Content $latestLog.FullName | Select-Object -Last 15
        Write-Host "---" -ForegroundColor DarkGray
    } else {
        Write-Host "⚠️  Aucun log trouvé (la tâche est peut-être encore en cours)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "PROCHAINES ÉTAPES" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣  La routine s'exécutera automatiquement chaque nuit à 2h00" -ForegroundColor White
Write-Host "2️⃣  Vérifiez les logs quotidiens dans: logs/" -ForegroundColor White
Write-Host "3️⃣  Consultez les opportunités: " -ForegroundColor White
Write-Host "    Get-Content logs\*.log | Select-String 'OPPORTUNITÉ'" -ForegroundColor DarkGray
Write-Host ""
Write-Host "📝 Pour gérer la tâche:" -ForegroundColor White
Write-Host "    - Ouvrir Planificateur: taskschd.msc" -ForegroundColor DarkGray
Write-Host "    - Tester manuellement: Start-ScheduledTask '$TaskName'" -ForegroundColor DarkGray
Write-Host "    - Voir info: Get-ScheduledTask '$TaskName' | Get-ScheduledTaskInfo" -ForegroundColor DarkGray
Write-Host ""
Write-Host "✅ Configuration terminée!" -ForegroundColor Green
Write-Host ""
