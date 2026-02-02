# 🎯 CONFIGURATION MONGODB & TESTS SYSTÈME

**Date:** 2026-02-02
**Status:** ✅ Environnements EB créés - Configuration MongoDB requise

---

## ✅ INFRASTRUCTURE CRÉÉE

### Elastic Beanstalk Environments (READY)

| Service | Environment | Status | URL |
|---------|-------------|--------|-----|
| **TMS Sync** | symphonia-tms-sync-prod | ✅ Ready | symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com |
| **Authz** | symphonia-authz-prod | ✅ Ready | symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com |
| **Affret IA** | symphonia-affretia-prod | ✅ Ready | symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com |

**⚠️ Health Status: Grey** - Normal car MONGODB_URI n'est pas encore configuré

---

## 🗄️ ÉTAPE 1: CONFIGURER MONGODB

### Option A: MongoDB Atlas (Recommandé - Gratuit jusqu'à 512MB)

1. **Créer compte MongoDB Atlas:**
   ```
   https://www.mongodb.com/cloud/atlas/register
   ```

2. **Créer un cluster gratuit (M0):**
   - Région: AWS / Paris (eu-west-3) pour minimiser latence
   - Cluster Name: symphonia-prod

3. **Créer utilisateur database:**
   - Username: `symphonia`
   - Password: (générer mot de passe sécurisé)
   - Built-in Role: `Read and write to any database`

4. **Configurer Network Access:**
   - Aller dans "Network Access"
   - Cliquer "Add IP Address"
   - **Pour tests initiaux:** Ajouter `0.0.0.0/0` (accès depuis partout)
   - **Pour production:** Ajouter IP des serveurs EB (obtenir via AWS EB console)

5. **Obtenir Connection String:**
   - Cliquer "Connect" sur votre cluster
   - Choisir "Connect your application"
   - Driver: Node.js, Version: 5.5 or later
   - Copier la connection string:
   ```
   mongodb+srv://symphonia:<password>@symphonia-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. **Remplacer `<password>`** par le mot de passe créé à l'étape 3

### Option B: MongoDB Auto-hébergé

Si vous avez déjà un MongoDB:
```
mongodb://username:password@host:27017/database?authSource=admin
```

---

## 🔧 ÉTAPE 2: INITIALISER LES COLLECTIONS MONGODB

Une fois l'URI MongoDB obtenue, initialiser les collections:

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"

# Exporter l'URI (remplacer par votre URI réelle)
export MONGODB_URI="mongodb+srv://symphonia:YOUR_PASSWORD@symphonia-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority"

# Ou sur Windows PowerShell:
$env:MONGODB_URI="mongodb+srv://symphonia:YOUR_PASSWORD@symphonia-prod.xxxxx.mongodb.net/?retryWrites=true&w=majority"

# Initialiser MongoDB
node scripts/init-mongodb.cjs
```

**Résultat attendu:**
```
╔══════════════════════════════════════════════════════╗
║  SYMPHONIA PLATFORM - MongoDB Setup v2.2.0          ║
╚══════════════════════════════════════════════════════╝

✓ Connected to MongoDB

Database: rt-technologie
[Creating] Collection: monitoring_logs
  ✓ Collection created
  Creating 3 indexes...
  ✓ 3 indexes created

Database: rt-authz
[Creating] Collection: notification_logs
  ✓ Collection created
  ...

✓ Databases initialisées: 3
✓ Collections créées: 6
✓ Indexes créés: 28

✓ MongoDB initialisé avec succès !
```

---

## ⚙️ ÉTAPE 3: CONFIGURER MONGODB_URI DANS ELASTIC BEANSTALK

Ajouter la variable d'environnement MONGODB_URI à chaque environnement:

### Via AWS CLI (Rapide)

```bash
# TMS Sync
aws elasticbeanstalk update-environment \
  --environment-name symphonia-tms-sync-prod \
  --region eu-west-3 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="mongodb+srv://symphonia:YOUR_PASSWORD@cluster.mongodb.net/?retryWrites=true"

# Authz
aws elasticbeanstalk update-environment \
  --environment-name symphonia-authz-prod \
  --region eu-west-3 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="mongodb+srv://symphonia:YOUR_PASSWORD@cluster.mongodb.net/?retryWrites=true"

# Affret IA
aws elasticbeanstalk update-environment \
  --environment-name symphonia-affretia-prod \
  --region eu-west-3 \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=MONGODB_URI,Value="mongodb+srv://symphonia:YOUR_PASSWORD@cluster.mongodb.net/?retryWrites=true"
```

### Via Console AWS (Interface graphique)

1. **Ouvrir console Elastic Beanstalk:**
   ```
   https://eu-west-3.console.aws.amazon.com/elasticbeanstalk/home?region=eu-west-3
   ```

2. **Pour chaque environnement:**
   - Cliquer sur l'environnement (ex: symphonia-tms-sync-prod)
   - Aller dans "Configuration"
   - Section "Software" → Cliquer "Edit"
   - Sous "Environment properties", ajouter:
     - **Name:** `MONGODB_URI`
     - **Value:** `mongodb+srv://symphonia:PASSWORD@cluster.mongodb.net/?retryWrites=true`
   - Cliquer "Apply"

3. **Attendre mise à jour (~2-3 minutes par environnement)**

---

## ✅ ÉTAPE 4: VÉRIFIER HEALTH CHECKS

Après configuration MONGODB_URI, vérifier que les services démarrent correctement:

```bash
# Vérifier statut environnements
aws elasticbeanstalk describe-environments \
  --region eu-west-3 \
  --environment-names symphonia-tms-sync-prod symphonia-authz-prod symphonia-affretia-prod \
  --query 'Environments[*].[EnvironmentName,Status,Health]' \
  --output table
```

**Résultat attendu:**
```
---------------------------------------------------------
|              DescribeEnvironments                     |
+---------------------------+--------+------------------+
|  symphonia-tms-sync-prod  | Ready  | Ok/Green         |
|  symphonia-authz-prod     | Ready  | Ok/Green         |
|  symphonia-affretia-prod  | Ready  | Ok/Green         |
+---------------------------+--------+------------------+
```

### Tester les endpoints manuellement

```bash
# TMS Sync - Health Check
curl https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/health

# Expected: {"status":"ok","timestamp":"2026-02-02T...","uptime":123}

# Authz - Health Check
curl https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/health

# Affret IA - Health Check
curl https://symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com/health
```

---

## 🚀 ÉTAPE 5: CONNECTER TEST GRANDEUR NATURE AUX APIS RÉELLES

Modifier le fichier de test pour utiliser les vraies URLs AWS:

```bash
# Ouvrir le fichier
code tests/test-grandeur-nature-complete.cjs
```

**Modifier CONFIG (lignes 23-39):**

```javascript
const CONFIG = {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb+srv://symphonia:PASSWORD@cluster.mongodb.net/?retryWrites=true'
  },
  apis: {
    orders: 'https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com',
    carriers: 'https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com',
    tms: 'https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com',
    affretia: 'https://symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com',
    tracking: 'https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com',
    billing: 'https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com'
  },
  simulation: {
    ordersCount: 3,
    carriersCount: 5,
    driversPerCarrier: 2,
    duration: '2h'
  }
};
```

### Exécuter test contre production

```bash
# Avec MongoDB URI
export MONGODB_URI="mongodb+srv://symphonia:PASSWORD@cluster.mongodb.net/?retryWrites=true"

# Exécuter test
node tests/test-grandeur-nature-complete.cjs

# Rapport sauvegardé dans: deploy/test-grandeur-nature-{timestamp}.json
```

---

## 📊 ÉTAPE 6: MONITORING & DASHBOARDS

### CloudWatch Logs

Consulter les logs en temps réel:

```bash
# TMS Sync logs
aws logs tail /aws/elasticbeanstalk/symphonia-tms-sync-prod/var/log/nodejs/nodejs.log --follow --region eu-west-3

# Authz logs
aws logs tail /aws/elasticbeanstalk/symphonia-authz-prod/var/log/nodejs/nodejs.log --follow --region eu-west-3

# Affret IA logs
aws logs tail /aws/elasticbeanstalk/symphonia-affretia-prod/var/log/nodejs/nodejs.log --follow --region eu-west-3
```

### CloudWatch Metrics

Vérifier que les métriques custom sont envoyées:

```bash
# Lister namespaces métriques
aws cloudwatch list-metrics --region eu-west-3 --query 'Metrics[?Namespace==`TMS` || Namespace==`Documents` || Namespace==`Emails` || Namespace==`AffretIA`].Namespace' --output table
```

**Namespaces attendus:**
- `TMS` - Métriques synchronisation
- `Documents` - Métriques documents transporteurs
- `Emails` - Métriques emails AWS SES
- `AffretIA` - Métriques conversions Affret.IA

---

## 🎯 CHECKLIST FINALE

### Infrastructure
- [✅] 3 environnements EB créés et READY
- [ ] MONGODB_URI configuré dans les 3 environnements
- [ ] Collections MongoDB créées (6 collections)
- [ ] Health checks OK (Status: Green)

### Tests
- [ ] Health checks API manuels réussis
- [ ] Test grandeur nature exécuté contre production
- [ ] 3 commandes traitées end-to-end
- [ ] 27 emails simulés avec liens testés
- [ ] Rapport JSON généré

### Monitoring
- [ ] CloudWatch logs accessibles
- [ ] Métriques custom visibles (4 namespaces)
- [ ] Dashboards CloudWatch créés (optionnel)
- [ ] Alarmes configurées (optionnel)

---

## 🔗 URLS IMPORTANTES

### Console AWS
- **Elastic Beanstalk:** https://eu-west-3.console.aws.amazon.com/elasticbeanstalk/home?region=eu-west-3
- **CloudWatch Logs:** https://eu-west-3.console.aws.amazon.com/cloudwatch/home?region=eu-west-3#logsV2:log-groups
- **CloudWatch Metrics:** https://eu-west-3.console.aws.amazon.com/cloudwatch/home?region=eu-west-3#metricsV2

### Services Déployés
- **TMS Sync API:** https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com
- **Authz API:** https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com
- **Affret IA API:** https://symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com

### MongoDB
- **MongoDB Atlas:** https://cloud.mongodb.com

---

## 💡 PROCHAINES ÉTAPES (OPTIONNEL)

### Court Terme
- [ ] Configurer DNS custom (ex: api.symphonia.com)
- [ ] Ajouter certificat SSL/TLS custom
- [ ] Créer environnements staging/dev séparés
- [ ] Configurer backup automatique MongoDB

### Moyen Terme
- [ ] Implémenter CI/CD avec GitHub Actions
- [ ] Ajouter tests de charge (100+ commandes)
- [ ] Créer dashboard analytics temps réel
- [ ] Configurer alarmes CloudWatch avancées

### Long Terme
- [ ] Migration vers ECS Fargate (containerisation)
- [ ] Implémentation API Gateway + Lambda
- [ ] Multi-région (disaster recovery)
- [ ] Monitoring APM (Datadog, New Relic)

---

**Status:** ⏳ Attente configuration MongoDB URI
**Prochaine action:** Obtenir MongoDB Atlas URI et configurer les environnements EB
**Temps estimé:** 10-15 minutes

