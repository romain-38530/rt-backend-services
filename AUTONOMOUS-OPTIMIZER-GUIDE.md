# 🤖 Guide d'Utilisation - Optimiseur Autonome AWS

**Date de création :** 23 février 2026
**Version :** 1.0
**Script :** `autonomous-optimizer.sh`

---

## 📋 Vue d'Ensemble

L'optimiseur autonome est un système complet d'optimisation AWS qui détecte et applique automatiquement des optimisations de coûts de manière sécurisée.

### Fonctionnalités Principales

✅ **8 Modules d'Optimisation**
1. **Elastic IPs** - Détecte et libère les IPs non attachées
2. **Instances Arrêtées** - Identifie instances arrêtées >30 jours
3. **Volumes EBS** - Snapshot et suppression des volumes détachés >90 jours
4. **Snapshots** - Nettoyage des snapshots >180 jours
5. **Load Balancers** - Détecte ALBs sans targets actifs
6. **CloudFront** - Optimise compression et HTTP/3 automatiquement
7. **Instances Sous-Utilisées** - CPU <5% sur 7 jours
8. **Auto-Scaling** - Suggère opportunités d'auto-scaling

✅ **Modes d'Exécution**
- `--dry-run` : Simulation sans modifications
- `--report-only` : Génère rapport sans optimiser
- `--auto` : Applique optimisations automatiquement

✅ **Sécurité**
- Vérification des prérequis AWS CLI
- Backups automatiques avant modifications
- Validation région AWS
- Rollback possible sur toutes opérations

---

## 🚀 Installation

### Étape 1: Vérifier les Prérequis

```bash
# Vérifier AWS CLI
aws --version
# Requis: AWS CLI 2.x

# Vérifier jq
jq --version
# Requis: jq 1.6+

# Vérifier les credentials AWS
aws sts get-caller-identity
```

### Étape 2: Copier le Script

```bash
# Le script est déjà créé
ls -lh autonomous-optimizer.sh

# Rendre exécutable
chmod +x autonomous-optimizer.sh
```

### Étape 3: Configurer les Alertes (Optionnel)

Éditer le script pour ajouter votre SNS topic ou email :

```bash
# Ligne 30-32 dans le script
ALERT_EMAIL="votre-email@example.com"
ALERT_SNS_TOPIC="arn:aws:sns:eu-central-1:123456789:optimizations"
```

---

## 🧪 Test Initial (OBLIGATOIRE)

### Test 1: Dry-Run Complet

```bash
# Exécuter en mode simulation
./autonomous-optimizer.sh --dry-run

# Vérifier le rapport généré
cat autonomous-optimizer-report-*.txt
```

**À vérifier :**
- ✅ Aucune erreur AWS CLI
- ✅ Détection correcte des ressources
- ✅ Calculs d'économies cohérents
- ✅ Aucune action destructive proposée par erreur

### Test 2: Report-Only

```bash
# Générer rapport détaillé sans modifications
./autonomous-optimizer.sh --report-only

# Analyser le rapport
cat autonomous-optimizer-report-*.txt
```

**À analyser :**
- Liste des ressources détectées
- Économies potentielles
- Priorités des actions

### Test 3: Exécution Manuelle d'un Module

```bash
# Tester un seul module (CloudFront par exemple)
# Éditer temporairement le script pour ne garder qu'un module
./autonomous-optimizer.sh --auto
```

---

## ⚙️ Configuration Production

### Option 1: Cron Job Quotidien (Recommandé)

```bash
# Éditer crontab
crontab -e

# Ajouter ligne pour exécution quotidienne à 2h du matin
0 2 * * * /home/user/rt-backend-services/autonomous-optimizer.sh --auto >> /var/log/aws-optimizer.log 2>&1

# Ou avec rapport seulement en semaine
0 2 * * 1-5 /home/user/rt-backend-services/autonomous-optimizer.sh --auto >> /var/log/aws-optimizer.log 2>&1
```

### Option 2: Systemd Timer (Avancé)

Créer `/etc/systemd/system/aws-optimizer.service` :

```ini
[Unit]
Description=AWS Autonomous Optimizer
After=network.target

[Service]
Type=oneshot
ExecStart=/home/user/rt-backend-services/autonomous-optimizer.sh --auto
StandardOutput=append:/var/log/aws-optimizer.log
StandardError=append:/var/log/aws-optimizer.log
User=ubuntu
```

Créer `/etc/systemd/system/aws-optimizer.timer` :

```ini
[Unit]
Description=Run AWS Optimizer Daily

[Timer]
OnCalendar=daily
OnCalendar=02:00
Persistent=true

[Install]
WantedBy=timers.target
```

Activer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable aws-optimizer.timer
sudo systemctl start aws-optimizer.timer
```

### Option 3: AWS Lambda (Cloud-Native)

Pour exécuter dans le cloud AWS :

1. Créer un Lambda avec runtime Amazon Linux 2
2. Installer AWS CLI dans le package
3. Configurer EventBridge pour déclenchement quotidien
4. Donner permissions IAM appropriées

---

## 📊 Utilisation Quotidienne

### Commandes Principales

```bash
# Dry-run quotidien pour voir les opportunités
./autonomous-optimizer.sh --dry-run

# Exécution automatique avec optimisations
./autonomous-optimizer.sh --auto

# Rapport détaillé uniquement
./autonomous-optimizer.sh --report-only
```

### Lire les Rapports

```bash
# Dernier rapport
cat autonomous-optimizer-report-$(date +%Y%m%d).txt

# Tous les rapports du mois
ls -lh autonomous-optimizer-report-202602*.txt

# Chercher économies potentielles
grep "ÉCONOMIE" autonomous-optimizer-report-*.txt
```

### Vérifier les Backups

```bash
# Lister backups créés
ls -lh backups/autonomous-optimizer/

# Voir contenu d'un backup
cat backups/autonomous-optimizer/backup-20260223-150000.json | jq .
```

---

## 🔧 Personnalisation

### Modifier les Seuils

Éditer le script, section "Configuration" :

```bash
# Ligne ~35-50
STOPPED_INSTANCE_DAYS=30        # Instances arrêtées
UNATTACHED_VOLUME_DAYS=90       # Volumes détachés
OLD_SNAPSHOT_DAYS=180           # Snapshots anciens
LOW_CPU_THRESHOLD=5             # CPU sous-utilisation
CLOUDWATCH_LOOKBACK_DAYS=7      # Période d'analyse
```

### Activer/Désactiver des Modules

Éditer la fonction `main()` ligne ~480 :

```bash
# Commenter les modules non désirés
optimize_elastic_ips
# optimize_stopped_instances  # DÉSACTIVÉ
optimize_unattached_volumes
# optimize_old_snapshots      # DÉSACTIVÉ
```

### Ajouter des Exclusions

```bash
# Ajouter tags d'exclusion
# Ressources avec tag "KeepForever=true" seront ignorées

# Dans chaque fonction optimize_*, ajouter filtre :
--filters "Name=tag:KeepForever,Values=true"
```

---

## 🎯 Scénarios d'Utilisation

### Scénario 1: Nouvelle Infrastructure

Quand vous lancez de nouvelles ressources AWS :

```bash
# Jour 1: Dry-run pour établir baseline
./autonomous-optimizer.sh --dry-run > baseline-report.txt

# Jour 30: Comparer avec nouvelle analyse
./autonomous-optimizer.sh --dry-run > day30-report.txt
diff baseline-report.txt day30-report.txt
```

### Scénario 2: Après Déploiement

Après chaque déploiement majeur :

```bash
# Attendre 48h pour stabilisation
sleep $((48*3600))

# Analyser nouvelles opportunités
./autonomous-optimizer.sh --report-only
```

### Scénario 3: Audit Mensuel

Premier lundi du mois :

```bash
# Rapport détaillé
./autonomous-optimizer.sh --report-only > monthly-audit-$(date +%Y%m).txt

# Envoyer par email
mail -s "AWS Optimization Report $(date +%B)" admin@example.com < monthly-audit-*.txt
```

---

## ⚠️ Sécurité et Bonnes Pratiques

### ✅ À FAIRE

1. **Tester en dry-run d'abord** - Toujours valider avant --auto
2. **Vérifier les backups** - Backups automatiques créés avant modifications
3. **Monitorer les logs** - Vérifier /var/log/aws-optimizer.log régulièrement
4. **Tags d'exclusion** - Utiliser tags pour protéger ressources critiques
5. **Alertes configurées** - SNS/Email pour actions importantes

### ❌ À ÉVITER

1. **Ne jamais exécuter en production sans test dry-run**
2. **Ne pas modifier les backups manuellement**
3. **Ne pas désactiver les vérifications de sécurité**
4. **Ne pas exécuter plusieurs instances simultanément**
5. **Ne pas supprimer les rapports (archivage recommandé)**

---

## 🔄 Rollback et Récupération

### Annuler une Optimisation CloudFront

```bash
# Récupérer backup
BACKUP_FILE="backups/autonomous-optimizer/backup-20260223-150000.json"

# Lire distribution ID
DIST_ID=$(jq -r '.cloudfront_distributions[0].Id' $BACKUP_FILE)

# Restaurer config
aws cloudfront get-distribution-config --id $DIST_ID > current-config.json
# Éditer current-config.json avec anciennes valeurs
aws cloudfront update-distribution --id $DIST_ID --if-match ... --distribution-config file://current-config.json
```

### Recréer un Volume EBS Supprimé

```bash
# Lister snapshots de backup
aws ec2 describe-snapshots \
  --owner-ids self \
  --filters "Name=tag:CreatedBy,Values=autonomous-optimizer"

# Restaurer volume depuis snapshot
aws ec2 create-volume \
  --snapshot-id snap-xxxxx \
  --availability-zone eu-central-1a \
  --volume-type gp3
```

### Ré-attacher une Elastic IP

```bash
# Si EIP libérée par erreur, allouer nouvelle
aws ec2 allocate-address --domain vpc

# Attacher à instance
aws ec2 associate-address \
  --instance-id i-xxxxx \
  --allocation-id eipalloc-xxxxx
```

---

## 📈 Monitoring et Métriques

### Métriques à Suivre

1. **Économies Mensuelles** - Extraire des rapports
   ```bash
   grep "ÉCONOMIE TOTALE" autonomous-optimizer-report-*.txt | \
     awk '{sum+=$4} END {print "Total: " sum "€/mois"}'
   ```

2. **Ressources Optimisées** - Compter actions
   ```bash
   grep "✅" autonomous-optimizer-report-*.txt | wc -l
   ```

3. **Temps d'Exécution** - Vérifier performance
   ```bash
   grep "Durée" autonomous-optimizer-report-*.txt
   ```

### Dashboard CloudWatch (Optionnel)

Créer métriques personnalisées :

```bash
# Publier métrique d'économie
SAVINGS=$(grep "ÉCONOMIE" report.txt | awk '{print $4}')
aws cloudwatch put-metric-data \
  --namespace "AWS/Optimizer" \
  --metric-name MonthlySavings \
  --value $SAVINGS \
  --unit None
```

---

## 🎓 Exemples de Rapports

### Rapport Dry-Run

```
================================================
OPTIMISEUR AUTONOME AWS - DRY RUN
================================================
Région: eu-central-1
Mode: dry-run
Date: 2026-02-23 15:30:00

MODULE 1: Elastic IPs Non Attachées
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Trouvé 2 Elastic IPs non attachées
  - 18.184.86.227 (eipalloc-0a614002ef7d9ea87) - Non attachée depuis: 45 jours
  - 18.194.185.112 (eipalloc-093c0153cd6dcfcca) - Non attachée depuis: 30 jours
💰 ÉCONOMIE POTENTIELLE: 7€/mois

[DRY RUN] aws ec2 release-address --allocation-id eipalloc-0a614002ef7d9ea87
[DRY RUN] aws ec2 release-address --allocation-id eipalloc-093c0153cd6dcfcca

...

================================================
RÉSUMÉ GLOBAL
================================================
💰 ÉCONOMIE TOTALE MENSUELLE: 156€
📊 ÉCONOMIE ANNUELLE: 1,872€
⚡ ACTIONS PROPOSÉES: 15
```

### Rapport Auto Mode

```
================================================
OPTIMISEUR AUTONOME AWS - AUTO
================================================

MODULE 6: CloudFront Distributions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Analysé 44 distributions
✅ Optimisé E2ABCD1234567 - Compression activée
✅ Optimisé E3XYZW7891011 - HTTP/3 activé
💰 ÉCONOMIE: 85€/mois

BACKUP CRÉÉ: backups/autonomous-optimizer/backup-20260223-153000.json

================================================
RÉSUMÉ
================================================
✅ Actions exécutées: 12/15
❌ Actions échouées: 0
⏭️  Actions sautées: 3 (permissions manquantes)
💰 ÉCONOMIE RÉALISÉE: 130€/mois
```

---

## 🆘 Dépannage

### Erreur: "AWS CLI not found"

```bash
# Installer AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Erreur: "jq: command not found"

```bash
# Ubuntu/Debian
sudo apt-get install jq

# Amazon Linux
sudo yum install jq

# Windows (Git Bash)
curl -L --insecure https://github.com/jqlang/jq/releases/download/jq-1.7.1/jq-windows-amd64.exe -o jq.exe
```

### Erreur: "Access Denied"

```bash
# Vérifier permissions IAM
aws iam get-user

# Permissions requises:
# - ec2:Describe*, ec2:ReleaseAddress, ec2:TerminateInstances
# - cloudfront:GetDistribution*, cloudfront:UpdateDistribution
# - elasticloadbalancing:Describe*
# - cloudwatch:GetMetricStatistics
```

### Script se Bloque

```bash
# Vérifier processus en cours
ps aux | grep autonomous-optimizer

# Tuer si nécessaire
pkill -f autonomous-optimizer

# Vérifier logs
tail -f /var/log/aws-optimizer.log
```

---

## 📞 Support et Maintenance

### Fichiers Importants

- **Script principal:** `autonomous-optimizer.sh`
- **Rapports:** `autonomous-optimizer-report-*.txt`
- **Backups:** `backups/autonomous-optimizer/`
- **Logs:** `/var/log/aws-optimizer.log`

### Mise à Jour du Script

```bash
# Sauvegarder version actuelle
cp autonomous-optimizer.sh autonomous-optimizer.sh.bak

# Appliquer modifications
# ... éditer le script ...

# Tester nouvelle version
./autonomous-optimizer.sh --dry-run
```

### Archivage

```bash
# Archiver rapports mensuels
tar -czf reports-$(date +%Y%m).tar.gz autonomous-optimizer-report-$(date +%Y%m)*.txt
mv reports-*.tar.gz archives/

# Nettoyer anciens rapports (>90 jours)
find . -name "autonomous-optimizer-report-*.txt" -mtime +90 -delete
```

---

## 🎯 Prochaines Étapes

1. ✅ **Test Dry-Run** - Exécuter aujourd'hui
2. ✅ **Analyser Rapport** - Valider détections
3. ✅ **Configuration Cron** - Automatiser demain
4. ⏳ **Monitoring 7 jours** - Vérifier économies réelles
5. ⏳ **Ajustements** - Optimiser seuils si nécessaire

---

**Créé le:** 23 février 2026
**Dernière mise à jour:** 23 février 2026
**Version:** 1.0
