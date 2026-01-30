# Quick Start - Monitoring SYMPHONI.A

Guide d'installation rapide en 5 minutes.

## Installation Express (Option 1)

### Windows (PowerShell)

```powershell
cd infra/monitoring
.\install-all.ps1
```

### Linux/Mac (Bash)

```bash
cd infra/monitoring
chmod +x install-all.sh
./install-all.sh
```

Le script automatique va:
1. Créer 42 alarmes CloudWatch
2. Créer le dashboard SYMPHONIA-Production
3. Configurer les logs pour 6 services

**Durée**: ~5-10 minutes

---

## Installation Manuelle (Option 2)

Si vous préférez contrôler chaque étape:

### Étape 1: Créer les alarmes

```powershell
# Windows
.\create-alarms.ps1

# Linux/Mac
chmod +x create-alarms.sh
./create-alarms.sh
```

### Étape 2: Créer le dashboard

```powershell
# Windows
.\create-dashboard.ps1

# Linux/Mac
chmod +x create-dashboard.sh
./create-dashboard.sh
```

### Étape 3: Configurer les logs

```powershell
# Windows
.\configure-logs.ps1

# Linux/Mac
chmod +x configure-logs.sh
./configure-logs.sh
```

---

## Vérification

### Voir le dashboard

URL: https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=SYMPHONIA-Production

### Vérifier les alarmes

```bash
aws cloudwatch describe-alarms --region eu-central-1
```

### Voir les logs en temps réel

```bash
# TMS Sync
aws logs tail /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log --follow --region eu-central-1

# Affret.IA
aws logs tail /aws/elasticbeanstalk/rt-affret-ia-api-prod/var/log/nodejs/nodejs.log --follow --region eu-central-1
```

---

## Intégration des Métriques Personnalisées

### TMS Sync

1. Copier le module:
   ```bash
   cp cloudwatch-metrics.js ../../services/tms-sync/utils/
   cp cloudwatch-metrics.d.ts ../../services/tms-sync/utils/
   ```

2. Installer les dépendances:
   ```bash
   cd ../../services/tms-sync
   npm install @aws-sdk/client-cloudwatch
   ```

3. Utiliser dans le code (voir `examples/tms-sync-integration.js`)

### Affret.IA

1. Copier le module:
   ```bash
   cp cloudwatch-metrics.js ../../services/affret-ia-api-v2/utils/
   cp cloudwatch-metrics.d.ts ../../services/affret-ia-api-v2/utils/
   ```

2. Installer les dépendances:
   ```bash
   cd ../../services/affret-ia-api-v2
   npm install @aws-sdk/client-cloudwatch
   ```

3. Utiliser dans le code (voir `examples/affret-ia-integration.js`)

---

## Notifications (Optionnel)

### Créer un topic SNS

```bash
aws sns create-topic --name symphonia-alerts --region eu-central-1
```

### S'abonner au topic

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-central-1:YOUR_ACCOUNT_ID:symphonia-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region eu-central-1
```

### Connecter une alarme au topic

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "TMS-Sync-High-CPU" \
  --alarm-actions arn:aws:sns:eu-central-1:YOUR_ACCOUNT_ID:symphonia-alerts \
  # ... (autres paramètres)
```

---

## Commandes Utiles

### Voir les alarmes actives

```bash
aws cloudwatch describe-alarms --state-value ALARM --region eu-central-1
```

### Rechercher des erreurs

```bash
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region eu-central-1
```

### Voir les métriques CPU

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name CPUUtilization \
  --dimensions Name=EnvironmentName,Value=rt-tms-sync-api-v2 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region eu-central-1
```

---

## En Cas de Problème

### Alarme déclenchée?

Consultez le guide de troubleshooting dans `README.md` section 7.

### Scripts ne fonctionnent pas?

1. Vérifiez AWS CLI: `aws --version`
2. Vérifiez les credentials: `aws sts get-caller-identity`
3. Vérifiez la région: `eu-central-1`

### Besoin d'aide?

Consultez la documentation complète:
- `README.md` - Guide complet
- `RAPPORT-MONITORING-SYMPHONIA.md` - Rapport détaillé

---

## Coût Estimé

**~$14/mois** pour:
- 42 alarmes
- 20 métriques personnalisées
- ~5 GB logs/mois
- 1 dashboard

---

**C'est tout!** Votre monitoring est maintenant opérationnel. 🎉
