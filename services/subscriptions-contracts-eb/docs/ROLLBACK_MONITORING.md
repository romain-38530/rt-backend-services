# RT SYMPHONI.A - Guide de Rollback Monitoring

## Vue d'Ensemble

Ce guide decrit les procedures pour annuler le deploiement de l'infrastructure de monitoring en cas de probleme.

**IMPORTANT:** Avant de proceder au rollback, assurez-vous de:
1. Documenter la raison du rollback
2. Sauvegarder les logs CloudWatch actuels
3. Notifier l'equipe DevOps
4. Creer un rapport d'incident

---

## Niveau 1: Rollback Partiel (Alarmes uniquement)

### Scenario
Les alarmes generent trop de fausses alertes ou causent des problemes.

### Procedure

#### Desactiver temporairement les alarmes
```bash
# Desactiver toutes les alarmes
aws cloudwatch disable-alarm-actions \
  --alarm-names \
    "production-subscriptions-contracts-high-cpu" \
    "production-subscriptions-contracts-critical-cpu" \
    "production-subscriptions-contracts-high-memory" \
    "production-subscriptions-contracts-high-disk" \
    "production-subscriptions-contracts-high-error-rate" \
    "production-subscriptions-contracts-high-5xx-errors" \
    "production-subscriptions-contracts-high-latency" \
    "production-subscriptions-contracts-mongodb-failure" \
    "production-subscriptions-contracts-low-order-volume" \
    "production-subscriptions-contracts-high-delay-rate" \
    "production-subscriptions-contracts-low-carrier-score" \
  --region eu-central-1
```

#### Reactiver les alarmes (si necessaire)
```bash
# Reactiver toutes les alarmes
aws cloudwatch enable-alarm-actions \
  --alarm-names \
    "production-subscriptions-contracts-high-cpu" \
    "production-subscriptions-contracts-critical-cpu" \
    "production-subscriptions-contracts-high-memory" \
    "production-subscriptions-contracts-high-disk" \
    "production-subscriptions-contracts-high-error-rate" \
    "production-subscriptions-contracts-high-5xx-errors" \
    "production-subscriptions-contracts-high-latency" \
    "production-subscriptions-contracts-mongodb-failure" \
    "production-subscriptions-contracts-low-order-volume" \
    "production-subscriptions-contracts-high-delay-rate" \
    "production-subscriptions-contracts-low-carrier-score" \
  --region eu-central-1
```

**Duree estimee:** 2-3 minutes
**Impact:** Aucun impact sur l'application, les alarmes ne declencheront plus d'alertes

---

## Niveau 2: Suppression des Dashboards

### Scenario
Les dashboards sont incorrects ou causent des problemes de performance.

### Procedure

```bash
# Supprimer les 3 dashboards
aws cloudwatch delete-dashboards \
  --dashboard-names \
    "RT-SYMPHONIA-production-infrastructure" \
    "RT-SYMPHONIA-production-application" \
    "RT-SYMPHONIA-production-business" \
  --region eu-central-1
```

### Verification
```bash
# Verifier que les dashboards ont ete supprimes
aws cloudwatch list-dashboards --region eu-central-1
```

**Duree estimee:** 1-2 minutes
**Impact:** Aucun impact sur l'application, perte de visualisation uniquement

---

## Niveau 3: Desinscription SNS

### Scenario
Les notifications email sont trop nombreuses ou incorrectes.

### Procedure

#### 1. Lister les souscriptions
```bash
# Lister toutes les souscriptions
aws sns list-subscriptions --region eu-central-1
```

#### 2. Desinscrire les emails
```bash
# Remplacer SUBSCRIPTION_ARN par l'ARN reel de la souscription
aws sns unsubscribe \
  --subscription-arn "SUBSCRIPTION_ARN" \
  --region eu-central-1
```

**Exemple:**
```bash
aws sns unsubscribe \
  --subscription-arn "arn:aws:sns:eu-central-1:004843574253:rt-symphonia-production-critical-alerts:abc123" \
  --region eu-central-1
```

**Duree estimee:** 2-3 minutes
**Impact:** Plus de notifications email, les alarmes continueront a fonctionner

---

## Niveau 4: Rollback Complet (Stack CloudFormation)

### Scenario
Probleme majeur necessitant la suppression complete de l'infrastructure de monitoring.

### ATTENTION
Cette operation supprimera:
- Tous les topics SNS
- Toutes les alarmes CloudWatch
- Tous les log groups (et leurs donnees)
- Tous les metric filters
- TOUTES les donnees de logs seront perdues

### Procedure Complete

#### Etape 1: Sauvegarder les donnees importantes

```bash
# Exporter les logs critiques avant suppression
aws logs create-export-task \
  --log-group-name "/aws/elasticbeanstalk/rt-subscriptions-api-prod/application" \
  --from 0 \
  --to $(date +%s)000 \
  --destination "rt-monitoring-backup-$(date +%Y%m%d)" \
  --region eu-central-1

aws logs create-export-task \
  --log-group-name "/aws/elasticbeanstalk/rt-subscriptions-api-prod/errors" \
  --from 0 \
  --to $(date +%s)000 \
  --destination "rt-monitoring-backup-$(date +%Y%m%d)" \
  --region eu-central-1
```

#### Etape 2: Supprimer les dashboards
```bash
aws cloudwatch delete-dashboards \
  --dashboard-names \
    "RT-SYMPHONIA-production-infrastructure" \
    "RT-SYMPHONIA-production-application" \
    "RT-SYMPHONIA-production-business" \
  --region eu-central-1
```

#### Etape 3: Supprimer la stack CloudFormation
```bash
# Supprimer la stack (ceci supprimera automatiquement toutes les ressources)
aws cloudformation delete-stack \
  --stack-name rt-symphonia-monitoring-stack \
  --region eu-central-1
```

#### Etape 4: Attendre la suppression complete
```bash
# Attendre que la stack soit completement supprimee
aws cloudformation wait stack-delete-complete \
  --stack-name rt-symphonia-monitoring-stack \
  --region eu-central-1
```

#### Etape 5: Verification
```bash
# Verifier que la stack a ete supprimee
aws cloudformation describe-stacks \
  --stack-name rt-symphonia-monitoring-stack \
  --region eu-central-1 2>&1 || echo "Stack successfully deleted"
```

**Duree estimee:** 5-10 minutes
**Impact:** Perte complete du monitoring, l'application continue de fonctionner normalement

---

## Niveau 5: Nettoyage Complet

### Scenario
Suppression de tous les fichiers et ressources lies au monitoring.

### Procedure

#### 1. Supprimer les ressources AWS (voir Niveau 4)

#### 2. Supprimer les fichiers locaux (OPTIONNEL)
```bash
# ATTENTION: Cette commande supprime tous les fichiers de monitoring
cd /path/to/subscriptions-contracts-eb

# Sauvegarder avant suppression
tar -czf monitoring-backup-$(date +%Y%m%d).tar.gz \
  cloudformation/ \
  dashboards/ \
  middleware/ \
  routes/ \
  utils/ \
  scripts/ \
  docs/

# Supprimer les repertoires
rm -rf cloudformation/
rm -rf dashboards/
rm -rf middleware/monitoring-middleware.js
rm -rf routes/health-routes.js
rm -rf utils/cloudwatch-metrics.js
rm -rf scripts/deploy-monitoring.sh
rm -rf scripts/create-dashboards.sh
rm -rf scripts/test-alerting.sh
rm -rf docs/DEPLOIEMENT_MONITORING_RAPPORT.md
rm -rf docs/ROLLBACK_MONITORING.md
```

**Duree estimee:** 2-3 minutes
**Impact:** Suppression de tous les fichiers de monitoring, impossible de redployer sans recrer les fichiers

---

## Redploiement Apres Rollback

### Si vous devez redployer le monitoring

#### Option 1: Redploiement depuis les fichiers existants
```bash
cd /path/to/subscriptions-contracts-eb

# Redployer la stack CloudFormation
aws cloudformation create-stack \
  --stack-name rt-symphonia-monitoring-stack \
  --template-body file://cloudformation/monitoring-stack.yml \
  --parameters file://cloudformation/monitoring-parameters.json \
  --capabilities CAPABILITY_IAM \
  --region eu-central-1

# Attendre la creation
aws cloudformation wait stack-create-complete \
  --stack-name rt-symphonia-monitoring-stack \
  --region eu-central-1

# Recreer les dashboards
bash scripts/create-dashboards.sh
```

#### Option 2: Restaurer depuis la sauvegarde
```bash
# Si vous avez cree une sauvegarde
tar -xzf monitoring-backup-YYYYMMDD.tar.gz

# Puis suivre Option 1
```

---

## Scripts de Rollback Automatise

### Script Bash pour Rollback Complet

Creer un fichier `scripts/rollback-monitoring.sh`:

```bash
#!/bin/bash
################################################################################
# RT SYMPHONI.A - Rollback Monitoring
################################################################################

set -e

STACK_NAME="rt-symphonia-monitoring-stack"
REGION="eu-central-1"

echo "============================================================================"
echo "RT SYMPHONI.A - Rollback Monitoring"
echo "============================================================================"
echo ""
echo "ATTENTION: Cette operation va supprimer:"
echo "  - Stack CloudFormation: $STACK_NAME"
echo "  - Tous les dashboards CloudWatch"
echo "  - Tous les topics SNS"
echo "  - Tous les alarmes CloudWatch"
echo "  - Tous les log groups (PERTE DE DONNEES)"
echo ""
read -p "Etes-vous sur de vouloir continuer? (tapez 'ROLLBACK' pour confirmer): " CONFIRM

if [ "$CONFIRM" != "ROLLBACK" ]; then
  echo "Rollback annule."
  exit 0
fi

echo ""
echo "[1/3] Suppression des dashboards CloudWatch..."
aws cloudwatch delete-dashboards \
  --dashboard-names \
    "RT-SYMPHONIA-production-infrastructure" \
    "RT-SYMPHONIA-production-application" \
    "RT-SYMPHONIA-production-business" \
  --region $REGION 2>/dev/null || echo "Dashboards deja supprimes ou inexistants"

echo ""
echo "[2/3] Suppression de la stack CloudFormation..."
aws cloudformation delete-stack \
  --stack-name $STACK_NAME \
  --region $REGION

echo ""
echo "[3/3] Attente de la suppression complete..."
aws cloudformation wait stack-delete-complete \
  --stack-name $STACK_NAME \
  --region $REGION

echo ""
echo "============================================================================"
echo "Rollback termine avec succes!"
echo "============================================================================"
echo ""
echo "Verification:"
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION 2>&1 || echo "Stack successfully deleted"
```

### Utilisation
```bash
chmod +x scripts/rollback-monitoring.sh
./scripts/rollback-monitoring.sh
```

---

## Verification Post-Rollback

### Checklist de Verification

- [ ] Stack CloudFormation supprimee
- [ ] Dashboards CloudWatch supprimes
- [ ] Topics SNS supprimes ou desinscriptions effectuees
- [ ] Alarmes CloudWatch supprimees
- [ ] Log groups supprimes (si necessaire)
- [ ] Application fonctionne normalement
- [ ] Aucune erreur dans les logs de l'application
- [ ] Documentation mise a jour

### Commandes de Verification

```bash
# Verifier la stack CloudFormation
aws cloudformation describe-stacks --stack-name rt-symphonia-monitoring-stack --region eu-central-1

# Verifier les dashboards
aws cloudwatch list-dashboards --region eu-central-1 | grep RT-SYMPHONIA

# Verifier les alarmes
aws cloudwatch describe-alarms --region eu-central-1 | grep production-subscriptions-contracts

# Verifier les topics SNS
aws sns list-topics --region eu-central-1 | grep rt-symphonia

# Verifier les log groups
aws logs describe-log-groups --region eu-central-1 | grep rt-subscriptions-api-prod
```

---

## Couts Apres Rollback

### Arret immediat des couts:
- Alarmes CloudWatch: $0/mois
- Dashboards: $0/mois
- Notifications SNS: $0/mois

### Couts residuels possibles:
- Logs CloudWatch deja stockes (jusqu'a expiration ou suppression manuelle)
- Metriques custom deja envoyees (facturees pour le mois en cours)

### Pour eliminer tous les couts:
```bash
# Supprimer manuellement tous les log groups
aws logs delete-log-group --log-group-name "/aws/elasticbeanstalk/rt-subscriptions-api-prod/application" --region eu-central-1
aws logs delete-log-group --log-group-name "/aws/elasticbeanstalk/rt-subscriptions-api-prod/access" --region eu-central-1
aws logs delete-log-group --log-group-name "/aws/elasticbeanstalk/rt-subscriptions-api-prod/errors" --region eu-central-1
```

---

## Support et Contact

**En cas de probleme pendant le rollback:**
- Consulter les logs CloudFormation pour plus de details
- Contacter AWS Support si necessaire
- Documenter tous les problemes rencontres

**Contact:**
- Email: tech@rt-symphonia.com
- Equipe DevOps: support-devops@rt-symphonia.com

**Documentation AWS:**
- [CloudFormation Rollback](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-rollback-triggers.html)
- [CloudWatch Troubleshooting](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/troubleshooting.html)

---

**Version du guide:** 1.0.0
**Derniere mise a jour:** 2025-11-26
