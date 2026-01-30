# Index - Monitoring SYMPHONI.A

Bienvenue dans le système de monitoring SYMPHONI.A! Ce document vous guide vers les bonnes ressources.

---

## 🚀 Pour Commencer Rapidement

### Installation Express (5 minutes)

```bash
# Windows
.\install-all.ps1

# Linux/Mac
chmod +x install-all.sh
./install-all.sh
```

**Documentation**: [QUICK-START.md](./QUICK-START.md)

---

## 📖 Documentation

### Pour les Débutants

1. **[QUICK-START.md](./QUICK-START.md)** - Démarrage en 5 minutes
   - Installation automatique
   - Vérification
   - Commandes de base

### Pour les Utilisateurs

2. **[README.md](./README.md)** - Documentation complète
   - Vue d'ensemble du système
   - Installation détaillée
   - Commandes de vérification
   - **Guide de troubleshooting complet** (8 scénarios)
   - Bonnes pratiques

### Pour les Managers

3. **[RAPPORT-MONITORING-SYMPHONIA.md](./RAPPORT-MONITORING-SYMPHONIA.md)** - Rapport exécutif
   - Executive summary
   - Services monitorés
   - Alarmes créées (détail complet)
   - Coûts et ROI
   - Prochaines étapes
   - Checklist de déploiement

### Pour les Développeurs

4. **[cloudwatch-metrics.js](./cloudwatch-metrics.js)** - Module de métriques
   - API JavaScript complète
   - Buffer automatique
   - Middleware Express

5. **[examples/tms-sync-integration.js](./examples/tms-sync-integration.js)** - Exemple TMS Sync
   - Intégration complète
   - Bonnes pratiques

6. **[examples/affret-ia-integration.js](./examples/affret-ia-integration.js)** - Exemple Affret.IA
   - Intégration complète
   - Métriques métier

### Inventaire

7. **[FILES-CREATED.md](./FILES-CREATED.md)** - Liste de tous les fichiers
   - Structure complète
   - Description de chaque fichier
   - Usage et maintenance

---

## 🛠️ Scripts Disponibles

### Installation Complète

| Script | Plateforme | Durée | Description |
|--------|------------|-------|-------------|
| [install-all.sh](./install-all.sh) | Linux/Mac | 5-10 min | Installe tout automatiquement |
| [install-all.ps1](./install-all.ps1) | Windows | 5-10 min | Installe tout automatiquement |

### Scripts Individuels

| Script | Plateforme | Durée | Action |
|--------|------------|-------|--------|
| [create-alarms.sh](./create-alarms.sh) | Linux/Mac | 2-3 min | Crée 42 alarmes CloudWatch |
| [create-alarms.ps1](./create-alarms.ps1) | Windows | 2-3 min | Crée 42 alarmes CloudWatch |
| [create-dashboard.sh](./create-dashboard.sh) | Linux/Mac | 10 sec | Crée le dashboard |
| [create-dashboard.ps1](./create-dashboard.ps1) | Windows | 10 sec | Crée le dashboard |
| [configure-logs.sh](./configure-logs.sh) | Linux/Mac | 3-5 min | Configure les logs |
| [configure-logs.ps1](./configure-logs.ps1) | Windows | 3-5 min | Configure les logs |

---

## 📊 Ce qui est Monitoré

### Services Backend

- **TMS Sync API** (rt-tms-sync-api-v2)
- **Affret.IA API** (rt-affret-ia-api-prod)
- **Orders API** (rt-orders-api-prod-v2)
- **Subscriptions API** (rt-subscriptions-api-prod-v5)
- **Auth API** (rt-authz-api-prod)
- **Billing API** (rt-billing-api-prod)

### Services Additionnels

- **Frontend Amplify** (d1tb834u144p4r)
- **AWS SES** (emails)

### Alarmes par Service

Chaque service backend a **6 alarmes**:
1. CPU > 80%
2. Memory > 85%
3. HTTP 5xx > 10/min
4. HTTP 4xx > 50/min
5. Health Degraded
6. Latence > 2s

**Total**: **42 alarmes**

---

## 🔧 Configuration

### Fichier de Configuration

- **[dashboard-config.json](./dashboard-config.json)** - Configuration complète du dashboard
  - 15+ widgets
  - Métriques standard AWS
  - Métriques personnalisées
  - Logs

### Module de Métriques

- **[cloudwatch-metrics.js](./cloudwatch-metrics.js)** - Module Node.js
- **[cloudwatch-metrics.d.ts](./cloudwatch-metrics.d.ts)** - Types TypeScript
- **[package.json](./package.json)** - Dépendances

---

## 🎯 Accès Rapide

### Dashboard CloudWatch

```
https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=SYMPHONIA-Production
```

### Commandes Utiles

```bash
# Voir les alarmes actives
aws cloudwatch describe-alarms --state-value ALARM --region eu-central-1

# Voir les logs en temps réel (TMS Sync)
aws logs tail /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log --follow --region eu-central-1

# Rechercher des erreurs
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region eu-central-1
```

---

## 🆘 En Cas de Problème

### 1. Alarme Déclenchée?

Consultez le **guide de troubleshooting** dans [README.md](./README.md) section 7.

### 2. Script qui ne Fonctionne Pas?

Vérifiez:
```bash
# AWS CLI installé?
aws --version

# Configuré?
aws sts get-caller-identity

# Bonne région?
echo $AWS_REGION  # Doit être eu-central-1
```

### 3. Métriques Personnalisées ne s'Affichent Pas?

Vérifiez:
1. Module copié dans le bon dossier?
2. `@aws-sdk/client-cloudwatch` installé?
3. Code intégré selon les exemples?
4. Service en production? (métriques désactivées en dev)

### 4. Dashboard Vide?

Patientez 5-10 minutes après l'installation. CloudWatch a besoin de temps pour collecter les premières métriques.

---

## 💰 Coûts

**~$13.75/mois** pour:
- 42 alarmes CloudWatch
- 20 métriques personnalisées
- ~5 GB logs/mois (7 jours de rétention)
- 1 dashboard

**Voir**: [README.md](./README.md) section 8 pour l'optimisation des coûts

---

## 📋 Checklist

### Installation

- [ ] Exécuter `install-all.sh` ou `install-all.ps1`
- [ ] Vérifier 42 alarmes créées
- [ ] Ouvrir le dashboard
- [ ] Vérifier que tous les widgets s'affichent

### Intégration

- [ ] Copier le module dans TMS Sync
- [ ] Installer les dépendances
- [ ] Intégrer dans le code
- [ ] Tester en production

- [ ] Copier le module dans Affret.IA
- [ ] Installer les dépendances
- [ ] Intégrer dans le code
- [ ] Tester en production

### Notifications (Optionnel)

- [ ] Créer le topic SNS
- [ ] Ajouter les abonnements
- [ ] Connecter aux alarmes
- [ ] Tester

---

## 📁 Structure des Fichiers

```
monitoring/
├── 📜 INDEX.md (ce fichier)
├── 📘 QUICK-START.md
├── 📗 README.md
├── 📕 RAPPORT-MONITORING-SYMPHONIA.md
├── 📄 FILES-CREATED.md
│
├── 🔧 install-all.sh
├── 🔧 install-all.ps1
│
├── ⚙️ create-alarms.sh
├── ⚙️ create-alarms.ps1
├── ⚙️ create-dashboard.sh
├── ⚙️ create-dashboard.ps1
├── ⚙️ configure-logs.sh
├── ⚙️ configure-logs.ps1
│
├── 📋 dashboard-config.json
│
├── 💻 cloudwatch-metrics.js
├── 📝 cloudwatch-metrics.d.ts
├── 📦 package.json
│
└── examples/
    ├── tms-sync-integration.js
    └── affret-ia-integration.js
```

---

## 🎓 Parcours d'Apprentissage

### Débutant

1. Lire [QUICK-START.md](./QUICK-START.md)
2. Exécuter `install-all.sh`
3. Ouvrir le dashboard
4. Consulter les alarmes

### Intermédiaire

1. Lire [README.md](./README.md)
2. Comprendre chaque type d'alarme
3. Pratiquer les commandes de vérification
4. Étudier le guide de troubleshooting

### Avancé

1. Lire [RAPPORT-MONITORING-SYMPHONIA.md](./RAPPORT-MONITORING-SYMPHONIA.md)
2. Étudier [cloudwatch-metrics.js](./cloudwatch-metrics.js)
3. Intégrer les métriques personnalisées
4. Optimiser les coûts

---

## 🔗 Liens Externes

### Documentation AWS

- [CloudWatch Alarms](https://docs.aws.amazon.com/cloudwatch/latest/monitoring/AlarmThatSendsEmail.html)
- [CloudWatch Dashboards](https://docs.aws.amazon.com/cloudwatch/latest/monitoring/CloudWatch_Dashboards.html)
- [CloudWatch Logs](https://docs.aws.amazon.com/cloudwatch/latest/logs/)
- [CloudWatch Metrics](https://docs.aws.amazon.com/cloudwatch/latest/monitoring/working_with_metrics.html)

### Elastic Beanstalk

- [Enhanced Health Reporting](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/health-enhanced.html)
- [Using CloudWatch](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/health-enhanced-cloudwatch.html)

---

## 📞 Support

### Équipe DevOps

- **Email**: devops@symphonia.fr
- **Slack**: #devops-alerts

### Documentation

- **Quick Start**: [QUICK-START.md](./QUICK-START.md)
- **Guide Complet**: [README.md](./README.md)
- **Rapport**: [RAPPORT-MONITORING-SYMPHONIA.md](./RAPPORT-MONITORING-SYMPHONIA.md)

---

## ✅ Prochaines Étapes

1. **Installer** → `./install-all.sh`
2. **Vérifier** → Ouvrir le dashboard
3. **Intégrer** → Copier le module de métriques
4. **Former** → Partager avec l'équipe
5. **Optimiser** → Ajuster selon l'expérience

---

**Version**: 1.0.0
**Date**: 29 janvier 2026
**Statut**: ✅ Prêt pour Production

**Pour commencer**: `./install-all.sh` ou `.\install-all.ps1`
