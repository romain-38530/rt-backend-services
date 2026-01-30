# SYMPHONI.A - Système de Monitoring CloudWatch

## Vue d'ensemble

Ce répertoire contient tous les outils et scripts nécessaires pour mettre en place un système de monitoring complet pour SYMPHONI.A basé sur AWS CloudWatch.

## Architecture du Monitoring

Le système de monitoring comprend:

1. **Alarmes CloudWatch** - Alertes automatiques sur les métriques critiques
2. **Dashboard CloudWatch** - Visualisation en temps réel de tous les services
3. **Logs CloudWatch** - Agrégation et recherche centralisée des logs
4. **Métriques Personnalisées** - Métriques métier pour TMS Sync et Affret.IA

## Structure des Fichiers

```
monitoring/
├── create-alarms.sh              # Script bash pour créer les alarmes
├── create-alarms.ps1             # Script PowerShell pour créer les alarmes
├── create-dashboard.sh           # Script bash pour créer le dashboard
├── create-dashboard.ps1          # Script PowerShell pour créer le dashboard
├── configure-logs.sh             # Script bash pour configurer les logs
├── configure-logs.ps1            # Script PowerShell pour configurer les logs
├── dashboard-config.json         # Configuration JSON du dashboard
├── cloudwatch-metrics.js         # Module Node.js de métriques personnalisées
├── cloudwatch-metrics.d.ts       # Types TypeScript
├── package.json                  # Dépendances du module de métriques
├── examples/
│   ├── tms-sync-integration.js   # Exemple d'intégration TMS Sync
│   └── affret-ia-integration.js  # Exemple d'intégration Affret.IA
└── README.md                     # Ce fichier
```

## Services Monitorés

### Services Elastic Beanstalk

1. **TMS Sync API** (`rt-tms-sync-api-v2`)
   - Synchronisation avec Symphonia TMS
   - Job périodique toutes les minutes

2. **Affret.IA API** (`rt-affret-ia-api-prod`)
   - Intelligence artificielle pour le matching
   - Traitement des requêtes de fret

3. **Orders API** (`rt-orders-api-prod-v2`)
   - Gestion des commandes
   - CRUD complet

4. **Subscriptions API** (`rt-subscriptions-api-prod-v5`)
   - Gestion des abonnements
   - Facturation Stripe

5. **Auth API** (`rt-authz-api-prod`)
   - Authentification et autorisation
   - JWT tokens

6. **Billing API** (`rt-billing-api-prod`)
   - Facturation et paiements
   - Webhooks Stripe

### Services Additionnels

7. **Frontend Amplify** (`d1tb834u144p4r`)
   - Application web
   - CDN CloudFront

8. **AWS SES**
   - Envoi d'emails
   - Réputation de domaine

## Installation et Configuration

### Prérequis

1. AWS CLI configuré avec les bonnes permissions
2. Région AWS: `eu-central-1`
3. Variables d'environnement AWS configurées

### Étape 1: Créer les Alarmes

Les alarmes suivantes seront créées pour chaque service:

- **CPU > 80%** - Alerte si l'utilisation CPU dépasse 80% pendant 10 minutes
- **Memory > 85%** - Alerte si l'utilisation mémoire dépasse 85% pendant 10 minutes
- **HTTP 5xx > 10/minute** - Alerte si plus de 10 erreurs serveur par minute
- **HTTP 4xx > 50/minute** - Alerte si plus de 50 erreurs client par minute
- **Health Degraded** - Alerte si l'environnement est dégradé
- **Latence > 2s** - Alerte si la latence P99 dépasse 2 secondes

#### Sous Windows (PowerShell):

```powershell
cd infra/monitoring
.\create-alarms.ps1
```

#### Sous Linux/Mac (Bash):

```bash
cd infra/monitoring
chmod +x create-alarms.sh
./create-alarms.sh
```

### Étape 2: Créer le Dashboard

Le dashboard affiche:
- Santé des environnements
- Utilisation CPU et mémoire
- Taux d'erreurs HTTP (4xx, 5xx)
- Latence des requêtes
- Nombre de requêtes par minute
- Métriques SES (emails)
- Métriques Amplify (frontend)
- Métriques personnalisées (TMS Sync, Affret.IA)
- Dernières erreurs de chaque service

#### Sous Windows (PowerShell):

```powershell
cd infra/monitoring
.\create-dashboard.ps1
```

#### Sous Linux/Mac (Bash):

```bash
cd infra/monitoring
chmod +x create-dashboard.sh
./create-dashboard.sh
```

URL du dashboard après création:
```
https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#dashboards:name=SYMPHONIA-Production
```

### Étape 3: Configurer les Logs

Active le streaming des logs vers CloudWatch pour tous les services avec:
- Rétention de 7 jours
- Logs applicatifs (nodejs.log)
- Logs système (eb-engine.log)
- Logs de santé (eb-health.log)

#### Sous Windows (PowerShell):

```powershell
cd infra/monitoring
.\configure-logs.ps1
```

#### Sous Linux/Mac (Bash):

```bash
cd infra/monitoring
chmod +x configure-logs.sh
./configure-logs.sh
```

### Étape 4: Intégrer les Métriques Personnalisées

#### Pour TMS Sync

1. Installer le module de métriques:

```bash
cd services/tms-sync
npm install @aws-sdk/client-cloudwatch
```

2. Copier le module de métriques:

```bash
cp ../../infra/monitoring/cloudwatch-metrics.js ./utils/
cp ../../infra/monitoring/cloudwatch-metrics.d.ts ./utils/
```

3. Intégrer dans votre code (voir `examples/tms-sync-integration.js`):

```javascript
const { TMSSyncMetrics } = require('./utils/cloudwatch-metrics');

const metrics = new TMSSyncMetrics({
  enabled: process.env.NODE_ENV === 'production'
});

// Dans votre job de synchronisation
async function syncJob() {
  const startTime = Date.now();

  try {
    const result = await performSync();
    const duration = Date.now() - startTime;

    await metrics.recordSyncSuccess(duration, result.itemCount);
  } catch (error) {
    const duration = Date.now() - startTime;
    await metrics.recordSyncFailure(duration, error.code);
  }
}
```

#### Pour Affret.IA

1. Installer le module de métriques:

```bash
cd services/affret-ia-api-v2
npm install @aws-sdk/client-cloudwatch
```

2. Copier le module de métriques:

```bash
cp ../../infra/monitoring/cloudwatch-metrics.js ./utils/
cp ../../infra/monitoring/cloudwatch-metrics.d.ts ./utils/
```

3. Intégrer dans votre code (voir `examples/affret-ia-integration.js`):

```javascript
const { AffretIAMetrics } = require('./utils/cloudwatch-metrics');

const metrics = new AffretIAMetrics({
  enabled: process.env.NODE_ENV === 'production'
});

// Dans votre endpoint de traitement
app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await processAIRequest(req.body);
    const processingTime = Date.now() - startTime;

    await metrics.recordAIRequest(processingTime, true);
    res.json(result);
  } catch (error) {
    const processingTime = Date.now() - startTime;
    await metrics.recordAIRequest(processingTime, false);
    res.status(500).json({ error: error.message });
  }
});
```

## Commandes de Vérification

### Voir toutes les alarmes

```bash
aws cloudwatch describe-alarms --region eu-central-1
```

### Voir les alarmes actives (en état ALARM)

```bash
aws cloudwatch describe-alarms --state-value ALARM --region eu-central-1
```

### Voir un dashboard spécifique

```bash
aws cloudwatch get-dashboard --dashboard-name SYMPHONIA-Production --region eu-central-1
```

### Voir les logs en temps réel

```bash
# TMS Sync
aws logs tail /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log --follow --region eu-central-1

# Affret.IA
aws logs tail /aws/elasticbeanstalk/rt-affret-ia-api-prod/var/log/nodejs/nodejs.log --follow --region eu-central-1

# Orders API
aws logs tail /aws/elasticbeanstalk/rt-orders-api-prod-v2/var/log/nodejs/nodejs.log --follow --region eu-central-1
```

### Rechercher des erreurs dans les logs

```bash
# Rechercher les erreurs dans TMS Sync (dernière heure)
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log \
  --filter-pattern "ERROR" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region eu-central-1
```

### Voir les métriques d'un service

```bash
# CPU d'un environnement
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

### Voir les métriques personnalisées

```bash
# Métriques TMS Sync
aws cloudwatch get-metric-statistics \
  --namespace SYMPHONIA \
  --metric-name TMS-Sync-Success \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region eu-central-1
```

## Guide de Troubleshooting

### 1. Alarme CPU élevé

**Symptôme**: Alarme "High-CPU" déclenchée

**Causes possibles**:
- Charge de travail élevée
- Boucle infinie dans le code
- Job de synchronisation trop fréquent
- Requêtes inefficaces à la base de données

**Actions**:
1. Vérifier les logs pour identifier les processus gourmands
2. Vérifier les métriques de requêtes (ApplicationRequestsTotal)
3. Scaler l'environnement verticalement (instance plus puissante)
4. Optimiser le code identifié

```bash
# Voir l'utilisation CPU actuelle
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name CPUUtilization \
  --dimensions Name=EnvironmentName,Value=rt-tms-sync-api-v2 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Maximum,Average \
  --region eu-central-1
```

### 2. Alarme Memory élevée

**Symptôme**: Alarme "High-Memory" déclenchée

**Causes possibles**:
- Fuite mémoire (memory leak)
- Données trop volumineuses en mémoire
- Cache non vidé
- Connexions MongoDB non fermées

**Actions**:
1. Redémarrer l'environnement en urgence
2. Analyser les logs pour identifier les fuites
3. Vérifier les connexions à la base de données
4. Augmenter la taille de l'instance si nécessaire

```bash
# Redémarrer l'environnement
aws elasticbeanstalk restart-app-server \
  --environment-name rt-tms-sync-api-v2 \
  --region eu-central-1
```

### 3. Alarme Erreurs 5xx élevées

**Symptôme**: Alarme "High-5xx-Errors" déclenchée

**Causes possibles**:
- Service externe indisponible (MongoDB, Symphonia API)
- Code qui crash
- Variables d'environnement manquantes
- Timeout de requêtes

**Actions**:
1. Consulter les logs d'erreurs immédiatement
2. Vérifier la connexion MongoDB
3. Vérifier la disponibilité des API externes
4. Rollback vers la version précédente si nécessaire

```bash
# Voir les dernières erreurs 5xx
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log \
  --filter-pattern "\"status\":5" \
  --start-time $(date -d '30 minutes ago' +%s)000 \
  --region eu-central-1 \
  --max-items 20
```

### 4. Alarme Erreurs 4xx élevées

**Symptôme**: Alarme "High-4xx-Errors" déclenchée

**Causes possibles**:
- Requêtes malformées des clients
- Authentification échouée
- Validation de données échouée
- Endpoints non trouvés (404)

**Actions**:
1. Analyser les patterns d'erreurs 4xx
2. Vérifier si c'est une attaque
3. Identifier les endpoints problématiques
4. Améliorer la validation côté client

```bash
# Compter les erreurs 4xx par endpoint
aws logs filter-log-events \
  --log-group-name /aws/elasticbeanstalk/rt-orders-api-prod-v2/var/log/nodejs/nodejs.log \
  --filter-pattern "\"status\":4" \
  --start-time $(date -d '1 hour ago' +%s)000 \
  --region eu-central-1
```

### 5. Alarme Health Degraded

**Symptôme**: Alarme "Environment-Health-Degraded" déclenchée

**Causes possibles**:
- Instances qui échouent les health checks
- Latence élevée
- Erreurs 5xx fréquentes
- Problème de déploiement

**Actions**:
1. Vérifier le statut de l'environnement
2. Consulter les événements récents
3. Vérifier les instances individuelles
4. Rollback si déploiement récent

```bash
# Voir le statut de l'environnement
aws elasticbeanstalk describe-environment-health \
  --environment-name rt-tms-sync-api-v2 \
  --attribute-names All \
  --region eu-central-1

# Voir les événements récents
aws elasticbeanstalk describe-events \
  --environment-name rt-tms-sync-api-v2 \
  --max-records 20 \
  --region eu-central-1
```

### 6. Alarme Latence élevée

**Symptôme**: Alarme "High-Latency" déclenchée

**Causes possibles**:
- Requêtes base de données lentes
- API externes lentes
- Manque de ressources (CPU/Memory)
- Code non optimisé

**Actions**:
1. Identifier les endpoints lents
2. Optimiser les requêtes MongoDB (indexes)
3. Implémenter du caching
4. Augmenter les ressources si nécessaire

```bash
# Voir la latence P99
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElasticBeanstalk \
  --metric-name ApplicationLatencyP99 \
  --dimensions Name=EnvironmentName,Value=rt-orders-api-prod-v2 \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Maximum,Average \
  --region eu-central-1
```

### 7. SES Bounce Rate élevé

**Symptôme**: Alarme "SES-High-Bounce-Rate" déclenchée

**Causes possibles**:
- Emails invalides dans la base de données
- Domaines de destinataires bloqués
- SPF/DKIM mal configuré

**Actions**:
1. Arrêter les envois d'emails temporairement
2. Nettoyer la liste d'emails
3. Vérifier la configuration DNS (SPF, DKIM, DMARC)
4. Contacter AWS Support si nécessaire

```bash
# Voir les métriques SES
aws cloudwatch get-metric-statistics \
  --namespace AWS/SES \
  --metric-name Reputation.BounceRate \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Average \
  --region eu-central-1
```

### 8. TMS Sync échoue

**Symptôme**: Métrique "TMS-Sync-Failure" élevée

**Causes possibles**:
- API Symphonia indisponible
- Timeout de connexion
- Erreur d'authentification
- Format de données changé

**Actions**:
1. Vérifier la disponibilité de l'API Symphonia
2. Vérifier les credentials
3. Consulter les logs détaillés
4. Contacter Symphonia si nécessaire

```bash
# Voir les échecs de sync
aws cloudwatch get-metric-statistics \
  --namespace SYMPHONIA \
  --metric-name TMS-Sync-Failure \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum \
  --region eu-central-1
```

## Bonnes Pratiques

### 1. Monitoring Proactif

- Consultez le dashboard quotidiennement
- Configurez des notifications SNS pour les alarmes critiques
- Analysez les tendances hebdomadaires

### 2. Gestion des Logs

- Conservez 7 jours de logs par défaut
- Augmentez à 30 jours pour les services critiques
- Archivez les logs importants dans S3

### 3. Métriques Personnalisées

- Envoyez uniquement les métriques nécessaires
- Utilisez le buffer pour minimiser les appels API
- Nettoyez les ressources à l'arrêt (flush)

### 4. Optimisation des Coûts

- Désactivez les métriques en développement
- Utilisez des périodes appropriées (300s pour la plupart)
- Supprimez les alarmes inutilisées

### 5. Documentation

- Documentez chaque alarme créée
- Maintenez un runbook pour chaque type d'incident
- Partagez les connaissances avec l'équipe

## Alertes et Notifications

### Configuration SNS (optionnel)

Pour recevoir des notifications par email/SMS lors des alarmes:

1. Créer un topic SNS:

```bash
aws sns create-topic --name symphonia-alerts --region eu-central-1
```

2. S'abonner au topic:

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:eu-central-1:YOUR_ACCOUNT_ID:symphonia-alerts \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region eu-central-1
```

3. Modifier les alarmes pour ajouter les actions SNS:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "TMS-Sync-High-CPU" \
  --alarm-actions arn:aws:sns:eu-central-1:YOUR_ACCOUNT_ID:symphonia-alerts \
  ... (autres paramètres)
```

## Support et Contact

Pour toute question ou problème:

1. Consultez d'abord ce README
2. Vérifiez les logs CloudWatch
3. Consultez le dashboard
4. Contactez l'équipe DevOps

## Changelog

### Version 1.0.0 (2026-01-29)

- Création initiale du système de monitoring
- Alarmes pour 6 services EB + Amplify + SES
- Dashboard complet avec 15+ widgets
- Module de métriques personnalisées
- Exemples d'intégration TMS Sync et Affret.IA
- Documentation complète
- Guide de troubleshooting

## Licence

Propriétaire - SYMPHONI.A © 2026
