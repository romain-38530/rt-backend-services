# Configuration du CRON de Vigilance - Système Transporteurs

## 🎯 Objectif

Configurer un CRON quotidien sur AWS Elastic Beanstalk pour exécuter automatiquement le système de vigilance des transporteurs :
- Vérification des documents expirés (J-0)
- Envoi des alertes (J-30, J-15, J-7)
- Blocage automatique des transporteurs
- Mise à jour des statuts de vigilance
- Recalcul des scores

---

## 📋 Méthode 1 : Configuration via .ebextensions (Recommandé)

### Étape 1 : Créer le fichier de configuration

Créez le fichier `.ebextensions/01-cron-vigilance.config` dans votre projet :

```yaml
# .ebextensions/01-cron-vigilance.config
files:
  "/etc/cron.d/vigilance-cron":
    mode: "000644"
    owner: root
    group: root
    content: |
      # Exécution quotidienne du CRON de vigilance à 6h00 UTC
      0 6 * * * root /usr/bin/node /var/app/current/scripts/vigilance-cron.js >> /var/log/vigilance-cron.log 2>&1

commands:
  remove_old_cron:
    command: "rm -f /etc/cron.d/vigilance-cron.bak"
```

### Étape 2 : Ajouter au package de déploiement

Modifiez le script de déploiement pour inclure `.ebextensions` :

**Python (create-deployment-package-v3.py) :**
```python
# Dossiers à inclure
folders_to_include = [
    'scripts',
    '.ebextensions'  # AJOUT
]
```

**PowerShell (create-deploy-package.ps1) :**
```powershell
$folders = @('scripts', '.ebextensions')  # AJOUT
```

### Étape 3 : Créer le répertoire .ebextensions

```bash
mkdir -p .ebextensions
```

### Étape 4 : Créer le fichier de configuration

```bash
cat > .ebextensions/01-cron-vigilance.config << 'EOF'
files:
  "/etc/cron.d/vigilance-cron":
    mode: "000644"
    owner: root
    group: root
    content: |
      # Exécution quotidienne du CRON de vigilance à 6h00 UTC
      0 6 * * * root /usr/bin/node /var/app/current/scripts/vigilance-cron.js >> /var/log/vigilance-cron.log 2>&1

commands:
  remove_old_cron:
    command: "rm -f /etc/cron.d/vigilance-cron.bak"
EOF
```

### Étape 5 : Redéployer

```bash
# Créer le package
python create-deployment-package-v3.py

# Uploader sur S3
aws s3 cp authz-eb-v3.0.0-carrier-system.zip \
  s3://elasticbeanstalk-eu-central-1-004843574253/ \
  --region eu-central-1

# Créer la version
aws elasticbeanstalk create-application-version \
  --application-name rt-authz-api \
  --version-label v3.0.1-with-cron \
  --source-bundle S3Bucket=elasticbeanstalk-eu-central-1-004843574253,S3Key=authz-eb-v3.0.0-carrier-system.zip \
  --region eu-central-1

# Déployer
aws elasticbeanstalk update-environment \
  --application-name rt-authz-api \
  --environment-name rt-authz-api-prod \
  --version-label v3.0.1-with-cron \
  --region eu-central-1
```

---

## 📋 Méthode 2 : Configuration Manuelle via SSH

### Étape 1 : Se connecter à l'instance EC2

```bash
# Obtenir l'ID de l'instance
aws elasticbeanstalk describe-environment-resources \
  --environment-name rt-authz-api-prod \
  --region eu-central-1 \
  --query "EnvironmentResources.Instances[0].Id" \
  --output text

# Se connecter via SSH (ou AWS Systems Manager)
ssh -i your-key.pem ec2-user@instance-public-ip
```

### Étape 2 : Créer le fichier CRON

```bash
sudo bash -c 'cat > /etc/cron.d/vigilance-cron << EOF
# Exécution quotidienne du CRON de vigilance à 6h00 UTC
0 6 * * * root /usr/bin/node /var/app/current/scripts/vigilance-cron.js >> /var/log/vigilance-cron.log 2>&1
EOF'

# Définir les permissions
sudo chmod 644 /etc/cron.d/vigilance-cron

# Redémarrer cron
sudo systemctl restart crond
```

### Étape 3 : Vérifier

```bash
# Vérifier que le CRON est installé
sudo crontab -l
cat /etc/cron.d/vigilance-cron

# Vérifier les logs
sudo tail -f /var/log/vigilance-cron.log
```

---

## 📋 Méthode 3 : Utilisation d'AWS EventBridge (Lambda)

### Avantages
- Serverless (pas besoin de gérer les serveurs)
- Haute disponibilité
- Logs CloudWatch intégrés

### Étape 1 : Créer une fonction Lambda

**vigilance-cron-lambda.js :**
```javascript
const { MongoClient } = require('mongodb');
const { checkAndBlockExpiredCarriers, sendVigilanceAlerts } = require('./carriers');

const MONGODB_URI = process.env.MONGODB_URI;

exports.handler = async (event) => {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db('rt-auth');

    // Bloquer les transporteurs avec documents expirés
    const blocked = await checkAndBlockExpiredCarriers(db);

    // Envoyer les alertes
    const alerts = await sendVigilanceAlerts(db);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        blocked: blocked.length,
        alerts: alerts.length
      })
    };
  } catch (error) {
    console.error('Erreur:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await client.close();
  }
};
```

### Étape 2 : Créer la règle EventBridge

```bash
# Créer la règle (tous les jours à 6h00 UTC)
aws events put-rule \
  --name vigilance-daily-cron \
  --schedule-expression "cron(0 6 * * ? *)" \
  --region eu-central-1

# Ajouter la permission Lambda
aws lambda add-permission \
  --function-name vigilance-cron \
  --statement-id vigilance-daily \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn arn:aws:events:eu-central-1:ACCOUNT_ID:rule/vigilance-daily-cron \
  --region eu-central-1

# Associer la Lambda à la règle
aws events put-targets \
  --rule vigilance-daily-cron \
  --targets "Id"="1","Arn"="arn:aws:lambda:eu-central-1:ACCOUNT_ID:function:vigilance-cron" \
  --region eu-central-1
```

---

## 🧪 Tests

### Test 1 : Exécution manuelle

```bash
# Se connecter à l'instance EC2
ssh -i your-key.pem ec2-user@instance-ip

# Exécuter manuellement
cd /var/app/current
node scripts/vigilance-cron.js
```

### Test 2 : Vérifier les logs

```bash
# Logs du CRON
sudo tail -f /var/log/vigilance-cron.log

# Logs système
sudo tail -f /var/log/cron
```

### Test 3 : Simuler une alerte J-30

Dans MongoDB, créez un document qui expire dans 30 jours :

```javascript
db.carrier_documents.updateOne(
  { _id: ObjectId("...") },
  {
    $set: {
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  }
)
```

Puis exécutez le CRON et vérifiez les alertes :

```bash
node scripts/vigilance-cron.js
```

---

## 📊 Monitoring

### CloudWatch Logs

Si vous utilisez Lambda, les logs sont automatiquement dans CloudWatch :

```bash
aws logs tail /aws/lambda/vigilance-cron --follow
```

### CloudWatch Metrics personnalisés

Ajoutez des métriques dans le script :

```javascript
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({ region: 'eu-central-1' });

// Envoyer une métrique
await cloudwatch.putMetricData({
  Namespace: 'CarrierVigilance',
  MetricData: [
    {
      MetricName: 'CarriersBlocked',
      Value: blocked.length,
      Unit: 'Count',
      Timestamp: new Date()
    },
    {
      MetricName: 'AlertsSent',
      Value: alerts.length,
      Unit: 'Count',
      Timestamp: new Date()
    }
  ]
}).promise();
```

### Alarmes CloudWatch

Créez une alarme pour être notifié si le CRON échoue :

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name vigilance-cron-errors \
  --alarm-description "Alerte si le CRON de vigilance échoue" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 3600 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:eu-central-1:ACCOUNT_ID:alerts \
  --dimensions Name=FunctionName,Value=vigilance-cron
```

---

## 🔔 Notifications

### Configuration SNS pour alertes email

```bash
# Créer un topic SNS
aws sns create-topic --name vigilance-alerts --region eu-central-1

# S'abonner par email
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-central-1:ACCOUNT_ID:vigilance-alerts \
  --protocol email \
  --notification-endpoint admin@symphonia.com
```

### Ajouter les notifications dans le script

```javascript
const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: 'eu-central-1' });

// Envoyer une notification
if (blocked.length > 0) {
  await sns.publish({
    TopicArn: 'arn:aws:sns:eu-central-1:ACCOUNT_ID:vigilance-alerts',
    Subject: `🚫 ${blocked.length} transporteur(s) bloqué(s)`,
    Message: `Le CRON de vigilance a bloqué ${blocked.length} transporteur(s) pour documents expirés.`
  }).promise();
}
```

---

## 📝 Horaires Recommandés

| Heure (UTC) | Heure (Paris) | Raison |
|-------------|---------------|--------|
| 06:00 | 07:00 (hiver) / 08:00 (été) | Avant le début de la journée de travail |
| 22:00 | 23:00 (hiver) / 00:00 (été) | Après la fin de la journée |

**Recommandation :** 06:00 UTC (7h du matin heure de Paris en hiver)

---

## 🛠️ Dépannage

### Le CRON ne s'exécute pas

```bash
# Vérifier que le service cron tourne
sudo systemctl status crond

# Redémarrer le service
sudo systemctl restart crond

# Vérifier les permissions du fichier
ls -la /etc/cron.d/vigilance-cron

# Vérifier la syntaxe
sudo cat /etc/cron.d/vigilance-cron
```

### Erreurs MongoDB

```bash
# Vérifier la connexion MongoDB
node -e "const { MongoClient } = require('mongodb'); const client = new MongoClient(process.env.MONGODB_URI); client.connect().then(() => console.log('OK')).catch(e => console.error(e));"
```

### Logs vides

```bash
# Vérifier que le fichier de log existe
sudo touch /var/log/vigilance-cron.log
sudo chmod 666 /var/log/vigilance-cron.log

# Exécuter manuellement et voir la sortie
cd /var/app/current
node scripts/vigilance-cron.js
```

---

## ✅ Checklist de Configuration

- [ ] Fichier `.ebextensions/01-cron-vigilance.config` créé
- [ ] Script `scripts/vigilance-cron.js` déployé
- [ ] Variable d'environnement `MONGODB_URI` configurée
- [ ] Package de déploiement inclut `.ebextensions`
- [ ] Déploiement réussi sur Elastic Beanstalk
- [ ] Test manuel du script réussi
- [ ] Vérification des logs cron
- [ ] Notifications SNS configurées (optionnel)
- [ ] Alarmes CloudWatch configurées (optionnel)
- [ ] Documentation créée

---

## 📞 Support

En cas de problème :
1. Vérifier les logs : `/var/log/vigilance-cron.log`
2. Vérifier les logs système : `/var/log/cron`
3. Exécuter manuellement : `node scripts/vigilance-cron.js`
4. Vérifier la connexion MongoDB
5. Vérifier les permissions du fichier CRON

---

**Configuration recommandée :** Méthode 1 (.ebextensions)
**Horaire recommandé :** 06:00 UTC (7h Paris hiver)
**Monitoring :** CloudWatch Logs + Alarmes
**Notifications :** SNS pour alertes critiques
