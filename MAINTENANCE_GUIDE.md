# Guide de Maintenance - RT Backend Services

**Version:** 1.0.0
**Date:** 24 novembre 2025
**Services:** authz-eb, subscriptions-contracts-eb

---

## 📋 Vue d'Ensemble

Ce guide décrit les tâches de maintenance régulières, le monitoring, le troubleshooting et les bonnes pratiques pour maintenir les services backend RT en production.

---

## 🔍 Monitoring Quotidien

### 1. Health Checks Automatisés

```bash
#!/bin/bash
# check-health.sh - À exécuter quotidiennement via cron

echo "=== RT Backend Services Health Check ==="
echo "Date: $(date)"
echo ""

# Authz-EB
echo "1. Authz-EB (VAT + Prix)"
AUTHZ_HEALTH=$(curl -s https://d2i50a1vlg138w.cloudfront.net/health)
AUTHZ_STATUS=$(echo $AUTHZ_HEALTH | jq -r '.status')

if [ "$AUTHZ_STATUS" == "healthy" ]; then
  echo "   ✅ Status: $AUTHZ_STATUS"
else
  echo "   ❌ Status: $AUTHZ_STATUS"
  # Envoyer alerte
fi

# Subscriptions-Contracts-EB
echo "2. Subscriptions-Contracts-EB"
SUBS_HEALTH=$(curl -s https://dgze8l03lwl5h.cloudfront.net/health)
SUBS_STATUS=$(echo $SUBS_HEALTH | jq -r '.status')
MONGO_STATUS=$(echo $SUBS_HEALTH | jq -r '.mongodb.status')

if [ "$SUBS_STATUS" == "healthy" ]; then
  echo "   ✅ Status: $SUBS_STATUS"
  echo "   ✅ MongoDB: $MONGO_STATUS"
else
  echo "   ❌ Status: $SUBS_STATUS"
  echo "   ⚠️  MongoDB: $MONGO_STATUS"
  # Envoyer alerte
fi

echo ""
echo "=== Health Check Complete ==="
```

### 2. Vérifier les Logs CloudWatch

```bash
# Logs authz-eb (dernières 30 minutes)
aws logs tail /aws/elasticbeanstalk/authz-eb-prod/var/log/eb-engine.log \
  --since 30m \
  --follow

# Logs subscriptions-contracts-eb
aws logs tail /aws/elasticbeanstalk/rt-subscriptions-api-prod/var/log/eb-engine.log \
  --since 30m \
  --follow

# Filtrer les erreurs
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/authz-eb-prod/var/log/eb-engine.log \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000
```

### 3. Métriques CloudWatch

```bash
# CPU Utilization (authz-eb)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name CPUUtilization \
  --dimensions Name=EnvironmentName,Value=authz-eb-prod \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Network In/Out
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name NetworkIn \
  --dimensions Name=EnvironmentName,Value=authz-eb-prod \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum
```

---

## 📊 Dashboard de Monitoring

### Créer un Dashboard CloudWatch

```bash
# Créer dashboard.json
cat > dashboard.json << 'EOF'
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ElasticBeanstalk", "EnvironmentHealth", {"stat": "Average"}],
          [".", "InstancesOk", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-central-1",
        "title": "Environment Health",
        "yAxis": {
          "left": {
            "min": 0,
            "max": 100
          }
        }
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ElasticBeanstalk", "CPUUtilization", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "eu-central-1",
        "title": "CPU Utilization",
        "yAxis": {
          "left": {
            "min": 0,
            "max": 100
          }
        }
      }
    }
  ]
}
EOF

# Créer le dashboard
aws cloudwatch put-dashboard \
  --dashboard-name RT-Backend-Services \
  --dashboard-body file://dashboard.json
```

---

## 🔧 Tâches de Maintenance Régulières

### Quotidiennes

- [ ] Vérifier les health endpoints (automatisé)
- [ ] Surveiller les logs pour erreurs critiques
- [ ] Vérifier l'utilisation CPU/mémoire
- [ ] Vérifier les métriques CloudFront (cache hit ratio)

### Hebdomadaires

- [ ] Analyser les logs d'erreur accumulés
- [ ] Vérifier les coûts AWS (CloudWatch, EB, CloudFront)
- [ ] Vérifier l'espace disque sur les instances EB
- [ ] Vérifier les versions Node.js et dépendances obsolètes
- [ ] Backup MongoDB Atlas (si pas automatique)
- [ ] Tester les fallback APIs (AbstractAPI, APILayer)

### Mensuelles

- [ ] Mettre à jour les dépendances npm (`npm audit fix`)
- [ ] Revoir les logs CloudWatch et archiver si nécessaire
- [ ] Analyser les performances et optimiser si besoin
- [ ] Vérifier les certificats SSL CloudFront
- [ ] Nettoyer les anciennes versions EB
- [ ] Revoir les règles de sécurité (Security Groups, IAM)
- [ ] Effectuer un load test

### Trimestrielles

- [ ] Audit de sécurité complet
- [ ] Revoir l'architecture et planifier améliorations
- [ ] Mettre à jour la documentation
- [ ] Tester les procédures de disaster recovery
- [ ] Revoir les coûts et optimiser si nécessaire

---

## 🚨 Alertes et Notifications

### Configurer CloudWatch Alarms

```bash
# Alerte CPU > 80%
aws cloudwatch put-metric-alarm \
  --alarm-name authz-eb-high-cpu \
  --alarm-description "Alerte si CPU > 80%" \
  --metric-name CPUUtilization \
  --namespace AWS/ElasticBeanstalk \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=EnvironmentName,Value=authz-eb-prod \
  --alarm-actions arn:aws:sns:eu-central-1:ACCOUNT_ID:rt-backend-alerts

# Alerte Health Status dégradé
aws cloudwatch put-metric-alarm \
  --alarm-name authz-eb-degraded-health \
  --alarm-description "Alerte si santé dégradée" \
  --metric-name EnvironmentHealth \
  --namespace AWS/ElasticBeanstalk \
  --statistic Average \
  --period 300 \
  --threshold 15 \
  --comparison-operator LessThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=EnvironmentName,Value=authz-eb-prod \
  --alarm-actions arn:aws:sns:eu-central-1:ACCOUNT_ID:rt-backend-alerts

# Alerte erreurs 5xx CloudFront
aws cloudwatch put-metric-alarm \
  --alarm-name authz-cloudfront-5xx-errors \
  --alarm-description "Alerte si > 10 erreurs 5xx" \
  --metric-name 5xxErrorRate \
  --namespace AWS/CloudFront \
  --statistic Average \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=DistributionId,Value=E8GKHGYOIP84 \
  --alarm-actions arn:aws:sns:eu-central-1:ACCOUNT_ID:rt-backend-alerts
```

### Configuration SNS pour les alertes

```bash
# Créer un topic SNS
aws sns create-topic --name rt-backend-alerts

# S'abonner par email
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-central-1:ACCOUNT_ID:rt-backend-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com

# S'abonner par Slack (via Lambda)
# Voir: https://aws.amazon.com/blogs/mt/how-to-integrate-aws-chatbot-with-slack/
```

---

## 🔒 Sécurité et Mises à Jour

### Audit de Sécurité npm

```bash
# Pour authz-eb
cd services/authz-eb
npm audit

# Corriger automatiquement (non-breaking)
npm audit fix

# Corriger avec breaking changes (tester après!)
npm audit fix --force

# Vérifier les dépendances obsolètes
npm outdated
```

### Rotation des API Keys

```bash
# 1. Générer nouvelles clés sur AbstractAPI et APILayer

# 2. Mettre à jour sur Elastic Beanstalk
cd services/authz-eb
eb setenv \
  ABSTRACT_API_KEY="nouvelle_key_abstract" \
  APILAYER_API_KEY="nouvelle_key_apilayer"

# 3. Vérifier que tout fonctionne
curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'

# 4. Révoquer les anciennes clés sur les dashboards API
```

### Mise à Jour Node.js

```bash
# Vérifier la version actuelle
eb ssh authz-eb-prod -c "node --version"

# Mettre à jour dans package.json
{
  "engines": {
    "node": ">=20.10.0"
  }
}

# Déployer
eb deploy

# Vérifier
curl https://d2i50a1vlg138w.cloudfront.net/health | jq '.version'
```

---

## 💾 Backup et Recovery

### Backup MongoDB Atlas (Subscriptions-Contracts)

MongoDB Atlas fait des backups automatiques, mais pour un backup manuel :

```bash
# Via mongodump (installer MongoDB Tools)
mongodump --uri="mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts" \
  --out=./backup-$(date +%Y%m%d)

# Compresser
tar -czf backup-$(date +%Y%m%d).tar.gz backup-$(date +%Y%m%d)/

# Upload vers S3 pour stockage sécurisé
aws s3 cp backup-$(date +%Y%m%d).tar.gz \
  s3://rt-backend-backups/mongodb/backup-$(date +%Y%m%d).tar.gz
```

### Restore MongoDB

```bash
# Télécharger depuis S3
aws s3 cp s3://rt-backend-backups/mongodb/backup-20251124.tar.gz .

# Décompresser
tar -xzf backup-20251124.tar.gz

# Restore
mongorestore --uri="mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts" \
  --drop \
  backup-20251124/
```

### Backup des Configurations EB

```bash
# Sauvegarder la configuration authz-eb
eb config save authz-eb-prod --cfg authz-eb-config-$(date +%Y%m%d)

# Sauvegarder subscriptions-contracts-eb
eb config save rt-subscriptions-api-prod --cfg subscriptions-eb-config-$(date +%Y%m%d)

# Lister les configs sauvegardées
eb config list

# Restaurer une config
eb config put authz-eb-config-20251124
```

---

## ⚡ Optimisation des Performances

### 1. Analyser les Temps de Réponse

```bash
# Test de performance authz-eb
echo "Testing authz-eb endpoints..."

# VAT validation
time curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/validate \
  -H "Content-Type: application/json" \
  -d '{"vatNumber":"FR12345678901"}'

# Price calculation
time curl -X POST https://d2i50a1vlg138w.cloudfront.net/api/vat/calculate-price \
  -H "Content-Type: application/json" \
  -d '{"amount":100,"countryCode":"FR"}'
```

### 2. Optimiser le Cache CloudFront

```bash
# Vérifier le cache hit ratio
aws cloudwatch get-metric-statistics \
  --namespace AWS/CloudFront \
  --metric-name CacheHitRate \
  --dimensions Name=DistributionId,Value=E8GKHGYOIP84 \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average

# Si cache hit ratio < 80%, ajuster les TTL
aws cloudfront get-distribution-config --id E8GKHGYOIP84 > dist-config.json

# Éditer dist-config.json pour augmenter MinTTL, MaxTTL, DefaultTTL
# Puis mettre à jour:
aws cloudfront update-distribution --id E8GKHGYOIP84 --if-match ETAG \
  --distribution-config file://dist-config-updated.json
```

### 3. Scaling Elastic Beanstalk

```bash
# Vérifier la configuration actuelle
eb config authz-eb-prod

# Ajuster l'auto-scaling
eb scale 2 authz-eb-prod  # Min 2 instances

# Ou via configuration
eb config authz-eb-prod
# Éditer:
# aws:autoscaling:asg:
#   MinSize: 2
#   MaxSize: 4
# aws:autoscaling:trigger:
#   UpperThreshold: 70
#   LowerThreshold: 20
```

### 4. Optimiser MongoDB

```javascript
// Créer des index pour améliorer les performances
// Exécuter dans MongoDB Atlas UI ou via mongosh

// Index pour subscriptions (recherche par userId)
db.subscriptions.createIndex({ userId: 1 });
db.subscriptions.createIndex({ status: 1 });
db.subscriptions.createIndex({ planId: 1 });

// Index pour contracts (recherche par parties)
db.contracts.createIndex({ "parties.email": 1 });
db.contracts.createIndex({ status: 1 });
db.contracts.createIndex({ type: 1 });

// Index pour plans
db.plans.createIndex({ type: 1, isActive: 1 });

// Vérifier les index
db.subscriptions.getIndexes();
```

---

## 🐛 Troubleshooting Courant

### Problème 1: Service ne répond pas (502/504)

```bash
# 1. Vérifier le statut EB
eb status authz-eb-prod

# 2. Vérifier les logs
eb logs authz-eb-prod

# 3. Redémarrer l'application
aws elasticbeanstalk restart-app-server \
  --environment-name authz-eb-prod

# 4. Si problème persiste, rebuild
eb rebuild authz-eb-prod
```

### Problème 2: MongoDB connection timeout

```bash
# 1. Vérifier l'URI MongoDB
eb printenv | grep MONGODB

# 2. Tester la connexion depuis local
mongosh "mongodb+srv://user:password@cluster.mongodb.net/rt-subscriptions-contracts"

# 3. Vérifier Network Access dans Atlas
# Ajouter l'IP de l'instance EB si nécessaire

# 4. Vérifier les logs
eb logs rt-subscriptions-api-prod | grep "MongoDB"
```

### Problème 3: Rate limiting trop strict

```javascript
// Ajuster dans index.js et redéployer
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Augmenté de 100 à 200
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later' }
  }
});
```

### Problème 4: Erreurs API VAT (AbstractAPI/APILayer)

```bash
# 1. Vérifier les quotas
# - AbstractAPI: https://app.abstractapi.com/
# - APILayer: https://apilayer.com/

# 2. Tester manuellement
curl "https://vat.abstractapi.com/v1/validate?api_key=YOUR_KEY&vat_number=FR12345678901"

# 3. Si quotas dépassés, rotation des clés ou upgrade plan
eb setenv ABSTRACT_API_KEY="nouvelle_key"
```

### Problème 5: CloudFront ne sert pas la nouvelle version

```bash
# 1. Créer une invalidation
aws cloudfront create-invalidation \
  --distribution-id E8GKHGYOIP84 \
  --paths "/*"

# 2. Vérifier le statut de l'invalidation
aws cloudfront list-invalidations --distribution-id E8GKHGYOIP84

# 3. Tester avec cache-busting
curl "https://d2i50a1vlg138w.cloudfront.net/health?v=$(date +%s)"
```

---

## 📈 Rapports de Performance

### Générer un rapport mensuel

```bash
#!/bin/bash
# monthly-report.sh

MONTH=$(date +%Y-%m)
OUTPUT="report-$MONTH.txt"

echo "=== RT Backend Services - Rapport Mensuel $MONTH ===" > $OUTPUT
echo "" >> $OUTPUT

# 1. Disponibilité
echo "1. DISPONIBILITÉ" >> $OUTPUT
echo "   - authz-eb: 99.9%" >> $OUTPUT  # Calculer avec CloudWatch
echo "   - subscriptions-contracts-eb: 99.8%" >> $OUTPUT
echo "" >> $OUTPUT

# 2. Performance moyenne
echo "2. PERFORMANCE" >> $OUTPUT
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name Latency \
  --dimensions Name=EnvironmentName,Value=authz-eb-prod \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 2592000 \
  --statistics Average >> $OUTPUT

# 3. Coûts AWS
echo "3. COÛTS" >> $OUTPUT
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '1 month ago' +%Y-%m-01),End=$(date +%Y-%m-01) \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE >> $OUTPUT

echo "" >> $OUTPUT
echo "Rapport généré le $(date)" >> $OUTPUT

cat $OUTPUT
```

---

## 🔄 Procédure de Disaster Recovery

### Scénario 1: Perte complète de l'environnement EB

```bash
# 1. Créer un nouvel environnement
eb create authz-eb-prod-recovery \
  --cfg authz-eb-config-latest \
  --cname authz-eb-recovery

# 2. Restaurer les variables d'environnement
eb setenv --env authz-eb-prod-recovery \
  ABSTRACT_API_KEY="..." \
  APILAYER_API_KEY="..."

# 3. Déployer la dernière version
eb deploy authz-eb-prod-recovery

# 4. Mettre à jour CloudFront pour pointer vers le nouveau endpoint
aws cloudfront update-distribution --id E8GKHGYOIP84 \
  --distribution-config file://new-origin-config.json

# 5. Tester
curl https://d2i50a1vlg138w.cloudfront.net/health
```

### Scénario 2: Perte de la base MongoDB

```bash
# 1. Créer un nouveau cluster Atlas (si nécessaire)

# 2. Restaurer depuis le dernier backup
aws s3 cp s3://rt-backend-backups/mongodb/latest.tar.gz .
tar -xzf latest.tar.gz
mongorestore --uri="NEW_MONGODB_URI" --drop backup/

# 3. Mettre à jour l'URI dans EB
eb setenv MONGODB_URI="NEW_MONGODB_URI"

# 4. Vérifier
curl https://dgze8l03lwl5h.cloudfront.net/health | jq '.mongodb'
```

---

## 📞 Contacts et Escalade

### Niveaux d'Escalade

1. **Niveau 1**: Équipe DevOps RT
   - Email: devops@rt-technologie.com
   - Slack: #rt-backend-alerts

2. **Niveau 2**: Lead Backend Engineer
   - Email: backend-lead@rt-technologie.com
   - Téléphone: +33 X XX XX XX XX

3. **Niveau 3**: CTO
   - Email: cto@rt-technologie.com
   - Téléphone: +33 X XX XX XX XX

### Support AWS

- **AWS Support**: https://console.aws.amazon.com/support/
- **Téléphone**: +33 1 XX XX XX XX
- **Niveau de support**: Business (réponse < 1h pour production down)

---

## 📚 Ressources Utiles

- [AWS Elastic Beanstalk Best Practices](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/best-practices.html)
- [CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/best-practices.html)
- [MongoDB Atlas Monitoring](https://docs.atlas.mongodb.com/monitoring-alerts/)
- [Node.js Performance Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)

---

## 🎯 Checklist de Maintenance Mensuelle

```markdown
# Maintenance RT Backend - [MOIS ANNÉE]

## Santé des Services
- [ ] authz-eb: Health check OK
- [ ] subscriptions-contracts-eb: Health check OK
- [ ] MongoDB Atlas: Connecté et performant
- [ ] CloudFront: Cache hit ratio > 80%

## Sécurité
- [ ] npm audit exécuté et vulnérabilités corrigées
- [ ] Logs CloudWatch analysés (pas d'erreurs critiques)
- [ ] API keys fonctionnelles (AbstractAPI, APILayer)
- [ ] Certificats SSL CloudFront valides (> 30 jours)

## Performance
- [ ] CPU utilization moyenne < 70%
- [ ] Latence moyenne < 500ms
- [ ] Aucun 5xx error significatif
- [ ] MongoDB index optimisés

## Coûts
- [ ] Coûts AWS dans le budget
- [ ] Pas de pics inhabituels
- [ ] Quotas API respectés

## Backups
- [ ] Backup MongoDB réalisé
- [ ] Config EB sauvegardée
- [ ] Backups testés (restore simulation)

## Documentation
- [ ] Documentation à jour
- [ ] Changelog mis à jour
- [ ] Incidents documentés

**Date:** ___________
**Par:** ___________
**Prochaine maintenance:** ___________
```

---

## 🎯 Résumé

| Tâche | Fréquence | Responsable | Critique |
|-------|-----------|-------------|----------|
| Health checks automatisés | Quotidien | DevOps | 🔴 Haute |
| Analyse logs erreurs | Quotidien | DevOps | 🟡 Moyenne |
| Backup MongoDB | Hebdomadaire | DevOps | 🔴 Haute |
| Mise à jour dépendances | Mensuel | Dev | 🟡 Moyenne |
| Audit sécurité | Mensuel | DevOps/Security | 🔴 Haute |
| Load testing | Trimestriel | DevOps | 🟡 Moyenne |
| DR test | Trimestriel | DevOps/Lead | 🔴 Haute |

---

**Créé le:** 24 novembre 2025
**Mainteneur:** RT Technologies
**Version:** 1.0.0
**Prochain audit:** Janvier 2026
