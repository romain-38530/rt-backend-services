# 📊 STATUS PRODUCTION AWS - SYMPHONIA v2.2.0

**Date:** 2026-02-02 09:53
**Region:** eu-west-3 (Paris)

---

## ✅ INFRASTRUCTURE DÉPLOYÉE

### Elastic Beanstalk Environments

| Service | Environment | Status | Health | URL |
|---------|-------------|--------|--------|-----|
| **TMS Sync** | symphonia-tms-sync-prod | ✅ Ready | 🔴 Red | symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com |
| **Authz** | symphonia-authz-prod | ✅ Ready | 🔴 Red | symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com |
| **Affret IA** | symphonia-affretia-prod | ✅ Ready | 🔴 Red | symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com |

**Configuration:**
- Platform: Node.js 20 on Amazon Linux 2023 (v6.7.3)
- Instances: t3.small avec auto-scaling (1-4 instances)
- Load Balancer: Application Load Balancer
- MONGODB_URI: ✅ Configuré

---

## 🔴 PROBLÈME ACTUEL

### Symptômes
- Les 3 environments sont en état "Red" (health check échoue)
- Status: "None of the instances are sending data"
- ELB health failing pour toutes les instances
- Curl aux endpoints /health retourne 000 (pas de réponse)

### Diagnostic
**Cause probable:** Les IPs des serveurs AWS EB ne sont pas whitelistées dans MongoDB Atlas

MongoDB Atlas URI configuré:
```
mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT
```

---

## 🔧 ACTIONS À FAIRE IMMÉDIATEMENT

### 1. Whitlister les IPs AWS dans MongoDB Atlas (CRITIQUE)

**Option A: Accès depuis partout (pour tests)**
1. Ouvrir MongoDB Atlas: https://cloud.mongodb.com
2. Aller dans "Network Access" (menu gauche)
3. Cliquer "Add IP Address"
4. Sélectionner "ALLOW ACCESS FROM ANYWHERE" (0.0.0.0/0)
5. Cliquer "Confirm"
6. ⏳ Attendre 1-2 minutes que la configuration s'applique

**Option B: IPs AWS spécifiques (pour production)**
1. Récupérer les IPs des instances EB:
   ```bash
   aws ec2 describe-instances --region eu-west-3 \
     --filters "Name=tag:elasticbeanstalk:environment-name,Values=symphonia-tms-sync-prod" \
     --query "Reservations[*].Instances[*].PublicIpAddress" \
     --output text
   ```
2. Ajouter ces IPs dans MongoDB Atlas Network Access

### 2. Vérifier le cluster MongoDB Atlas

1. S'assurer que le cluster **stagingrt** est **actif** (pas en pause)
2. Console: https://cloud.mongodb.com/v2/clusters
3. Si en pause: Cliquer "Resume"

### 3. Vérifier les credentials MongoDB

Tester la connexion depuis votre machine locale (après avoir whitelisté votre IP):
```bash
node scripts/init-mongodb.cjs "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT"
```

Si ça échoue:
- Vérifier que le user rt_admin existe dans MongoDB Atlas
- Vérifier que le mot de passe est correct
- Console: Database Access → rt_admin

---

## 📋 APRÈS AVOIR WHITELISTÉ LES IPS

### 1. Attendre que les environments redémarrent automatiquement (2-3 min)

Vérifier le statut:
```bash
aws elasticbeanstalk describe-environments --region eu-west-3 \
  --environment-names symphonia-tms-sync-prod symphonia-authz-prod symphonia-affretia-prod \
  --query 'Environments[*].[EnvironmentName,Status,Health]' \
  --output table
```

**Résultat attendu:**
```
+---------------------------+--------+-------+
|  symphonia-tms-sync-prod  | Ready  | Green |
|  symphonia-authz-prod     | Ready  | Green |
|  symphonia-affretia-prod  | Ready  | Green |
+---------------------------+--------+-------+
```

### 2. Tester les health checks

```bash
# TMS Sync
curl https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/health

# Expected: {"status":"ok","timestamp":"2026-02-02T...","uptime":123}

# Authz
curl https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/health

# Affret IA
curl https://symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com/health
```

### 3. Initialiser les collections MongoDB

Une fois que les services sont en "Green":

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"

# Initialiser collections
node scripts/init-mongodb.cjs "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT"
```

**Résultat attendu:**
```
✓ Connected to MongoDB
✓ Databases initialisées: 3
✓ Collections créées: 6
✓ Indexes créés: 28
```

### 4. Vérifier les logs CloudWatch

```bash
# Via console AWS (recommandé)
# https://eu-west-3.console.aws.amazon.com/cloudwatch/home?region=eu-west-3#logsV2:log-groups

# Ou via CLI (dans PowerShell, pas Git Bash):
aws logs tail /aws/elasticbeanstalk/symphonia-tms-sync-prod/var/log/nodejs/nodejs.log --follow --region eu-west-3
```

### 5. Tester les endpoints principaux

```bash
# TMS Sync - Monitoring
curl https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com/api/v1/monitoring/status

# Authz - Email Metrics
curl https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/api/email-metrics/stats

# Authz - Carrier Leaderboard
curl https://symphonia-authz-prod.eba-nwzuqemk.eu-west-3.elasticbeanstalk.com/api/v1/carriers/leaderboard

# Affret IA - Analytics
curl https://symphonia-affretia-prod.eba-jpc3cbes.eu-west-3.elasticbeanstalk.com/api/v1/affretia/analytics/conversion
```

---

## 🚀 TEST GRANDEUR NATURE CONTRE PRODUCTION

Une fois que tous les services sont en "Green", exécuter le test end-to-end:

```bash
cd "c:\Users\rtard\dossier symphonia\rt-backend-services"

# Avec MongoDB Atlas
set MONGODB_URI=mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/?retryWrites=true&w=majority&appName=StagingRT

# Exécuter test
node tests/test-grandeur-nature-complete.cjs
```

**Ce test va:**
- Créer 3 commandes sur les APIs production
- Inviter 5 transporteurs
- Uploader 30 documents
- Soumettre 6 devis
- Scanner 6 e-CMR
- Générer 3 factures
- Envoyer 27 emails simulés
- Tester 33 liens

**Rapport sauvegardé dans:** `deploy/test-grandeur-nature-{timestamp}.json`

---

## 🎯 RÉSUMÉ ACTIONS

### Étape 1: MongoDB Atlas (BLOQUANT - 2 min) ⏱️
- [ ] Whitlister IPs AWS EB (0.0.0.0/0 pour tests)
- [ ] Vérifier cluster actif (pas en pause)
- [ ] Vérifier credentials MongoDB

### Étape 2: Vérification Services (5 min)
- [ ] Attendre redémarrage automatique environments
- [ ] Vérifier Health = Green pour les 3 services
- [ ] Tester health checks (curl)

### Étape 3: Initialisation MongoDB (2 min)
- [ ] Exécuter scripts/init-mongodb.cjs
- [ ] Vérifier 6 collections créées
- [ ] Vérifier 28 indexes créés

### Étape 4: Tests Production (5 min)
- [ ] Tester endpoints principaux
- [ ] Vérifier logs CloudWatch
- [ ] Exécuter test grandeur nature

### Étape 5: Monitoring (optionnel)
- [ ] Créer dashboards CloudWatch
- [ ] Configurer alarmes
- [ ] Vérifier métriques custom

---

## 📞 SUPPORT

### Console AWS
- **Elastic Beanstalk:** https://eu-west-3.console.aws.amazon.com/elasticbeanstalk/home?region=eu-west-3
- **CloudWatch Logs:** https://eu-west-3.console.aws.amazon.com/cloudwatch/home?region=eu-west-3#logsV2:log-groups
- **EC2 Instances:** https://eu-west-3.console.aws.amazon.com/ec2/home?region=eu-west-3#Instances

### MongoDB Atlas
- **Dashboard:** https://cloud.mongodb.com
- **Network Access:** https://cloud.mongodb.com/v2#/security/network/accessList
- **Database Access:** https://cloud.mongodb.com/v2#/security/database/users

### Documentation
- **Guide MongoDB:** deploy/CONFIGURATION_MONGODB_ET_TESTS.md
- **Guide déploiement:** deploy/DEPLOYMENT_AWS_SUCCESS.md
- **Test emails:** deploy/TEST_GRANDEUR_NATURE_AVEC_EMAILS_REPORT.md

---

**Status actuel:** ⏸️ En attente whitelist IPs MongoDB Atlas
**Action suivante:** Whitlister 0.0.0.0/0 dans MongoDB Atlas Network Access
**Temps estimé:** 15 minutes total pour système production fonctionnel
