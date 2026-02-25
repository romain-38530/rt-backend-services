# 📅 Configuration Planificateur de Tâches Windows

**Pour exécution automatique quotidienne de la routine autonome**

---

## 🎯 Objectif

Configurer l'exécution automatique quotidienne du script `run-daily-optimizer.sh` à 2h00 du matin.

---

## 📋 Méthode 1: Interface Graphique (Recommandé)

### Étape 1: Ouvrir le Planificateur de Tâches

1. Appuyer sur `Windows + R`
2. Taper: `taskschd.msc`
3. Appuyer sur `Entrée`

### Étape 2: Créer une Nouvelle Tâche

1. Clic droit sur "Bibliothèque du Planificateur de tâches"
2. Sélectionner "Créer une tâche..."

### Étape 3: Onglet Général

**Nom:** `AWS Optimizer - Routine Autonome`

**Description:**
```
Exécution quotidienne de la routine d'optimisation AWS.
Détecte automatiquement les opportunités d'économies.
```

**Options de sécurité:**
- ☑️ Exécuter même si l'utilisateur n'est pas connecté
- ☐ Exécuter avec les privilèges maximaux (PAS NÉCESSAIRE)

### Étape 4: Onglet Déclencheurs

1. Cliquer sur "Nouveau..."
2. **Lancer la tâche:** Sur un calendrier
3. **Paramètres:**
   - ☑️ Quotidienne
   - **Démarrer le:** (Date du jour)
   - **Démarrer à:** `02:00:00`
   - **Répéter tous les:** 1 jours
4. **Options avancées:**
   - ☐ Arrêter la tâche si elle s'exécute plus de: (laisser décoché)
   - ☑️ Activé
5. Cliquer "OK"

### Étape 5: Onglet Actions

1. Cliquer sur "Nouveau..."
2. **Action:** Démarrer un programme
3. **Programme/script:**
   ```
   C:\Program Files\Git\bin\bash.exe
   ```
4. **Ajouter des arguments:**
   ```
   run-daily-optimizer.sh
   ```
5. **Commencer dans:**
   ```
   C:\Users\rtard\dossier symphonia\rt-backend-services
   ```
6. Cliquer "OK"

### Étape 6: Onglet Conditions

**Alimentation:**
- ☐ Démarrer la tâche uniquement si l'ordinateur est relié au secteur
- ☐ Arrêter si l'ordinateur bascule sur l'alimentation par batterie

**Réseau:**
- ☐ Démarrer uniquement si la connexion réseau suivante est disponible

### Étape 7: Onglet Paramètres

- ☑️ Autoriser l'exécution de la tâche à la demande
- ☑️ Exécuter la tâche dès que possible si un démarrage programmé est manqué
- ☐ Si la tâche échoue, la redémarrer toutes les: (laisser décoché)
- **Si la tâche est déjà en cours d'exécution:**
  - Sélectionner: "Ne pas démarrer une nouvelle instance"

### Étape 8: Finaliser

1. Cliquer "OK"
2. Si demandé, entrer votre mot de passe Windows
3. La tâche apparaît maintenant dans la liste

---

## 📋 Méthode 2: Ligne de Commande PowerShell

Ouvrir PowerShell en tant qu'Administrateur et exécuter:

```powershell
$Action = New-ScheduledTaskAction -Execute "C:\Program Files\Git\bin\bash.exe" `
    -Argument "run-daily-optimizer.sh" `
    -WorkingDirectory "C:\Users\rtard\dossier symphonia\rt-backend-services"

$Trigger = New-ScheduledTaskTrigger -Daily -At 2am

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERNAME" -LogonType S4U

Register-ScheduledTask `
    -TaskName "AWS Optimizer - Routine Autonome" `
    -Description "Exécution quotidienne de la routine d'optimisation AWS" `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal
```

---

## ✅ Vérification de la Configuration

### Tester Immédiatement

1. Dans le Planificateur de tâches, trouver votre tâche
2. Clic droit → "Exécuter"
3. Vérifier que le fichier `logs/daily-optimizer-YYYYMMDD.log` est créé

### Commande PowerShell

```powershell
Get-ScheduledTask -TaskName "AWS Optimizer - Routine Autonome" | Get-ScheduledTaskInfo
```

### Vérifier les Logs

```bash
# Dernier log
cat logs/daily-optimizer-$(date +%Y%m%d).log

# Tous les logs récents
ls -lht logs/daily-optimizer-*.log | head -5
```

---

## 📊 Emplacement des Résultats

Après chaque exécution, vérifier:

### 1. Log Quotidien

```
logs/daily-optimizer-YYYYMMDD.log
```

**Contient:**
- Heure d'exécution
- Résumé des opportunités détectées
- Statut de l'exécution

### 2. Log Détaillé

```
reports/autonomous-optimization/autonomous-optimizer-YYYYMMDD-HHMMSS.log
```

**Contient:**
- Détails complets de chaque module
- Toutes les ressources analysées
- Actions recommandées

### 3. Extraction Rapide

```bash
# Voir les opportunités du jour
grep "OPPORTUNITÉ" logs/daily-optimizer-*.log

# Compter les opportunités ce mois
grep -c "OPPORTUNITÉ" logs/daily-optimizer-$(date +%Y%m)*.log
```

---

## 🔔 Notifications (Optionnel)

### Recevoir Email Quotidien

Créer un script `send-report-email.ps1`:

```powershell
$LogFile = "logs\daily-optimizer-$(Get-Date -Format 'yyyyMMdd').log"
$Body = Get-Content $LogFile -Raw

Send-MailMessage `
    -From "aws-optimizer@symphonia.com" `
    -To "admin@symphonia.com" `
    -Subject "AWS Optimizer - Rapport Quotidien $(Get-Date -Format 'dd/MM/yyyy')" `
    -Body $Body `
    -SmtpServer "smtp.gmail.com" `
    -Port 587 `
    -UseSsl `
    -Credential (Get-Credential)
```

Ajouter une action dans la tâche planifiée pour exécuter ce script après `run-daily-optimizer.sh`.

---

## 🛠️ Dépannage

### La Tâche Ne S'Exécute Pas

**Vérifier:**
1. Le chemin vers `bash.exe` est correct
2. Le chemin du répertoire de travail n'a pas de faute de frappe
3. Le script `run-daily-optimizer.sh` est exécutable
4. Les credentials AWS sont configurés

**Tester manuellement:**
```bash
cd "C:\Users\rtard\dossier symphonia\rt-backend-services"
bash run-daily-optimizer.sh
```

### La Tâche S'Exécute Mais Aucun Log

**Vérifier:**
1. Les permissions d'écriture dans le dossier `logs/`
2. Le script se termine correctement (pas d'erreur bash)

**Créer manuellement le dossier:**
```bash
mkdir -p logs
chmod 755 logs
```

### Erreurs AWS CLI

**Vérifier:**
```bash
aws sts get-caller-identity
```

Si erreur, reconfigurer:
```bash
aws configure
```

---

## 📈 Suivi Long Terme

### Hebdomadaire

Tous les lundis, vérifier:
```bash
# Opportunités de la semaine
grep "OPPORTUNITÉ" logs/daily-optimizer-$(date +%Y%m%d --date="7 days ago" +%Y%m)*log
```

### Mensuel

Premier jour du mois:
```bash
# Résumé du mois précédent
grep "OPPORTUNITÉ" logs/daily-optimizer-$(date --date="last month" +%Y%m)*.log | wc -l
echo "opportunités détectées le mois dernier"
```

### Tableau de Bord (Optionnel)

Créer un simple fichier Excel/Google Sheets avec:
- Date
- Nombre d'opportunités
- Économies potentielles détectées
- Actions prises

---

## 🎯 Objectifs de Monitoring

**Semaine 1-2:**
- ✅ Valider que la tâche s'exécute quotidiennement
- ✅ Vérifier cohérence des détections

**Semaine 3-4:**
- ✅ Analyser patterns (jours avec plus d'opportunités)
- ✅ Prendre actions sur opportunités récurrentes

**Mois 2+:**
- ✅ Mesurer économies réelles vs détectées
- ✅ Ajuster seuils si nécessaire

---

## ✅ Checklist de Déploiement

- [ ] Tâche planifiée créée et active
- [ ] Test manuel réussi
- [ ] Premier log quotidien généré
- [ ] Opportunités détectées visibles
- [ ] Notification configurée (optionnel)
- [ ] Calendrier de revue hebdomadaire défini

---

**Créé le:** 24 février 2026
**Tâche:** AWS Optimizer - Routine Autonome
**Fréquence:** Quotidienne à 2h00
**Status:** ✅ Prêt pour production
