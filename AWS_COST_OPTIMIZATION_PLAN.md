# Plan d'Optimisation des Coûts AWS - Symphonia Platform

**Date:** 23 février 2026
**Version:** 1.0
**Coûts actuels:** ~102€/mois AWS + ~93€/mois SaaS = **~195€/mois**

---

## 📊 État des Lieux

### Services AWS Actuels

| Service | Usage | Coût Estimé/mois | Opportunité |
|---------|-------|------------------|-------------|
| Elastic Beanstalk (t3.small x3+) | Backend services | ~60-80€ | 🟡 Optimisable |
| CloudFront | CDN pour APIs | ~10-15€ | 🟢 Optimisé |
| Amplify | Frontend hosting | ~5-10€ | 🟢 OK |
| S3 | Documents/Logs | ~5€ | 🟡 Optimisable |
| SES/SNS | Emails/SMS | ~2€ | 🟢 OK |
| ElastiCache Redis (t3.micro) | Cache | ~15€ | 🔴 À revoir |
| Data Transfer | Sortie de données | ~5-10€ | 🟡 Optimisable |

**Total AWS:** ~102€/mois

---

## 🎯 Optimisations Prioritaires (Économies: 30-50€/mois)

### 1. **Optimisation Elastic Beanstalk - Économie: 20-30€/mois** ⭐⭐⭐

#### Problème Identifié
Vous utilisez des instances **t3.small** (2 vCPU, 2GB RAM) pour plusieurs services qui pourraient fonctionner sur des instances plus petites.

#### Solutions

**A. Downgrade vers t3.micro pour services légers (Économie: ~15€/mois)**

Services candidats pour t3.micro (1 vCPU, 1GB RAM):
- `authz-eb` - Service d'authentification (faible charge)
- `documents-api` - Upload documents
- `notifications-api-v2` - Envoi de notifications
- `tracking-api` - GPS tracking

```bash
# Changer la taille d'instance via EB CLI
cd services/authz-eb
eb config

# OU via AWS Console:
# EB > Environments > authz-eb-prod > Configuration > Capacity
# Instance type: t3.micro

# Coût t3.small: ~0.0208 USD/h = ~15€/mois
# Coût t3.micro: ~0.0104 USD/h = ~7.5€/mois
# Économie par service: ~7.5€/mois x 2-3 services = 15-22€/mois
```

**B. Consolidation de Services (Économie: ~15€/mois)**

Fusionner les services à faible trafic sur une seule instance:

```javascript
// Créer un service "api-gateway" qui regroupe:
// - notifications-api
// - documents-api
// - tracking-api

// Structure proposée:
services/
  unified-api-gateway/
    routes/
      notifications.js
      documents.js
      tracking.js
    index.js  // Point d'entrée unique
```

**C. Instances Réservées (1 an) - Économie: ~30%**

Si vous êtes sûr de garder l'infrastructure pendant 1 an:

```bash
# Via AWS Console: EC2 > Reserved Instances > Purchase

# t3.small On-Demand: ~15€/mois
# t3.small Reserved (1 an, no upfront): ~10€/mois
# Économie: ~5€/mois par instance x 3 = 15€/mois
```

**D. Auto-scaling Intelligent**

Configurer l'auto-scaling pour réduire les instances hors heures de pointe:

```yaml
# .ebextensions/03-autoscaling.config
option_settings:
  aws:autoscaling:asg:
    MinSize: 1
    MaxSize: 3
  aws:autoscaling:trigger:
    MeasureName: CPUUtilization
    Unit: Percent
    UpperThreshold: 70
    UpperBreachScaleIncrement: 1
    LowerThreshold: 30
    LowerBreachScaleIncrement: -1

  # Scale down la nuit (00h-6h)
  aws:autoscaling:scheduledaction:
    ScheduledAction_ScaleDown:
      MinSize: 1
      MaxSize: 1
      Recurrence: "0 0 * * *"  # Tous les jours à 00h

  # Scale up le matin (6h)
  aws:autoscaling:scheduledaction:
    ScheduledAction_ScaleUp:
      MinSize: 2
      MaxSize: 3
      Recurrence: "0 6 * * *"  # Tous les jours à 6h
```

---

### 2. **Optimisation Redis ElastiCache - Économie: 10-15€/mois** ⭐⭐⭐

#### Problème
ElastiCache Redis (t3.micro) coûte ~15€/mois mais votre code a déjà un fallback sur cache mémoire.

#### Solutions

**Option A: Supprimer Redis (Économie: 15€/mois)**

Votre code est déjà prêt pour fonctionner sans Redis:

```javascript
// Déjà implémenté dans votre code
let cache;
try {
  cache = await createRedisClient();
} catch (error) {
  console.warn('Redis unavailable, using memory cache');
  cache = new MemoryCache();
}
```

Actions:
1. Mettre `REDIS_ENABLED=false` dans les variables d'environnement EB
2. Supprimer le cluster ElastiCache via Console
3. Le cache mémoire prendra automatiquement le relais

⚠️ **Inconvénient:** Cache non partagé entre instances (OK si peu de trafic)

**Option B: Passer à Redis sur Fargate Spot (Économie: 10€/mois)**

Alternative moins chère que ElastiCache:
- Utiliser un conteneur Redis sur AWS Fargate Spot
- Coût: ~5€/mois vs 15€/mois ElastiCache

**Option C: Utiliser Upstash Redis (Gratuit/Payant selon usage)**

Service Redis serverless avec free tier généreux:
- 10,000 commandes/jour gratuites
- Latence acceptable (<50ms)
- https://upstash.com/pricing

```javascript
// Remplacer par Upstash
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
})
```

---

### 3. **Optimisation S3 - Économie: 2-5€/mois** ⭐⭐

#### A. Lifecycle Policies (Déjà en place ✅)

Vérifier que les policies sont appliquées:

```bash
aws s3api get-bucket-lifecycle-configuration \
  --bucket symphonia-documents-prod
```

#### B. Intelligent-Tiering (Automatique)

Activer S3 Intelligent-Tiering pour optimiser automatiquement:

```json
{
  "Rules": [
    {
      "Id": "intelligent-tiering-all",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 0,
          "StorageClass": "INTELLIGENT_TIERING"
        }
      ]
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket symphonia-documents-prod \
  --lifecycle-configuration file://s3-intelligent-tiering.json
```

Économie: 40-50% sur les fichiers rarement accédés

#### C. Nettoyer les Logs Anciens

```bash
# Supprimer les logs de plus de 90 jours
aws s3 ls s3://symphonia-logs-prod/ --recursive | \
  awk '{if ($1 < "2025-11-23") print $4}' | \
  xargs -I {} aws s3 rm s3://symphonia-logs-prod/{}

# Ou lifecycle policy automatique (déjà en place dans votre config)
```

---

### 4. **Optimisation Data Transfer - Économie: 3-5€/mois** ⭐

#### A. Utiliser CloudFront pour TOUT

Mettre TOUTES les APIs derrière CloudFront (vous l'avez déjà partiellement):

Avantages:
- Cache des réponses API = moins d'appels à EB
- Réduction du data transfer depuis EB
- Amélioration des performances

```yaml
# amplify.yml - Déjà bien configuré ✅
NEXT_PUBLIC_ORDERS_API_URL: 'https://d2dbvsga281o6l.cloudfront.net'
NEXT_PUBLIC_AUTHZ_URL: 'https://d2jgmccc3o2t9k.cloudfront.net'
```

#### B. Compression GZIP/Brotli

Activer la compression sur CloudFront:

```bash
# Via Console: CloudFront > Distributions > [ID] > Behaviors
# Compress Objects Automatically: Yes
```

Économie: ~60-70% de bande passante

---

### 5. **Optimisation MongoDB Atlas** 🔴 **IMPORTANT**

⚠️ MongoDB Atlas n'est PAS dans AWS, donc non compris dans les 102€/mois AWS.

#### Vérifier votre tier actuel

```bash
# Via MongoDB Atlas Console
# Cluster > Configuration > Cluster Tier
```

**Recommandations:**

**Si vous êtes sur M10 (10€/mois):**
- ✅ OK pour production
- Envisager M0 (gratuit) si < 512MB de données

**Si vous êtes sur M20+ (50€+/mois):**
- 🔴 Downgrade vers M10 (10€/mois)
- Ou migrer vers AWS DocumentDB

#### Option: Migrer vers AWS DocumentDB

Avantages:
- Intégré dans votre VPC AWS
- Pas de data transfer charges
- Peut être moins cher à grande échelle

Inconvénient:
- Migration nécessaire
- Compatibilité MongoDB partielle

---

## 🚀 Plan d'Action Rapide (Gains Immédiats)

### Phase 1: Actions Immédiates (Cette semaine) - Économie: 25-30€/mois

```bash
# 1. Désactiver Redis ElastiCache (Économie: 15€/mois)
cd services/tms-sync-eb
eb setenv REDIS_ENABLED=false

# 2. Downgrade instances légères vers t3.micro (Économie: 15€/mois)
cd services/authz-eb
# Modifier .ebextensions/01-environment.config
# InstanceType: t3.micro
eb deploy

cd services/notifications-api-v2
# Idem
eb deploy

# 3. Activer S3 Intelligent-Tiering
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket symphonia-documents-prod \
  --id intelligent-tiering-all \
  --intelligent-tiering-configuration file://intelligent-tiering.json
```

### Phase 2: Optimisations à Moyen Terme (2-4 semaines) - Économie: 15-20€/mois

1. **Consolidation de services** - Fusionner 3-4 services légers
2. **Auto-scaling** - Configurer scale down nocturne
3. **CloudFront caching** - Optimiser les règles de cache

### Phase 3: Optimisations Structurelles (1-2 mois) - Économie: 10-15€/mois

1. **Reserved Instances** - Engagement 1 an
2. **Compute Savings Plans** - Engagement flexible
3. **Évaluer AWS Fargate** - Alternative à EB pour services stateless

---

## 💰 Résumé des Économies Potentielles

| Action | Difficulté | Temps | Économie/mois | Priorité |
|--------|------------|-------|---------------|----------|
| Désactiver Redis | ⭐ Facile | 10 min | 15€ | 🔥 Urgent |
| Downgrade t3.micro | ⭐⭐ Moyen | 1h | 15-22€ | 🔥 Urgent |
| S3 Intelligent-Tiering | ⭐ Facile | 15 min | 2-5€ | ⭐⭐ Important |
| Auto-scaling nocturne | ⭐⭐ Moyen | 2h | 5-10€ | ⭐⭐ Important |
| Consolidation services | ⭐⭐⭐ Complexe | 1 semaine | 15€ | ⭐ À considérer |
| Reserved Instances | ⭐ Facile | 30 min | 15€ | ⭐ À considérer |
| CloudFront caching | ⭐⭐ Moyen | 3h | 3-5€ | ⭐ À considérer |

**Total Économies Potentielles: 40-60€/mois (40-60% de réduction)**

**Nouveaux coûts AWS: 50-70€/mois** (vs 102€ actuellement)

---

## 🔧 Scripts d'Automatisation

### Script 1: Désactiver Redis sur tous les services

```bash
#!/bin/bash
# disable-redis.sh

SERVICES=(
  "tms-sync-eb"
  "authz-eb"
  "affret-ia-api-v2"
)

for service in "${SERVICES[@]}"; do
  echo "Disabling Redis for $service..."
  cd services/$service
  eb setenv REDIS_ENABLED=false
  cd ../..
done

echo "✓ Redis disabled on all services"
echo "Économie estimée: 15€/mois"
```

### Script 2: Downgrade instances vers t3.micro

```bash
#!/bin/bash
# downgrade-instances.sh

LIGHT_SERVICES=(
  "authz-eb"
  "notifications-api-v2"
  "documents-api"
)

for service in "${LIGHT_SERVICES[@]}"; do
  echo "Downgrading $service to t3.micro..."
  cd services/$service

  # Modifier le fichier de config
  sed -i 's/InstanceType: t3.small/InstanceType: t3.micro/g' .ebextensions/01-environment.config

  # Déployer
  eb deploy

  cd ../..
done

echo "✓ Instances downgraded"
echo "Économie estimée: 15-22€/mois"
```

### Script 3: Analyse des coûts AWS (via AWS Cost Explorer API)

```bash
#!/bin/bash
# analyze-costs.sh

aws ce get-cost-and-usage \
  --time-period Start=2026-01-01,End=2026-02-23 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --output table

echo ""
echo "Services les plus coûteux ce mois:"
aws ce get-cost-and-usage \
  --time-period Start=2026-02-01,End=2026-02-23 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=SERVICE \
  --output json | jq -r '.ResultsByTime[0].Groups | sort_by(.Metrics.BlendedCost.Amount | tonumber) | reverse | .[0:5] | .[] | "\(.Keys[0]): \(.Metrics.BlendedCost.Amount) \(.Metrics.BlendedCost.Unit)"'
```

---

## 📊 Monitoring des Économies

### Créer un Budget AWS

```bash
# Via AWS Console: Billing > Budgets > Create budget
# Type: Cost budget
# Budget amount: 70€ (cible post-optimisation)
# Alert threshold: 80% (56€)
```

### Dashboard CloudWatch pour surveiller l'utilisation

```bash
# Créer un dashboard avec:
# - EC2 CPU Utilization par instance
# - S3 Storage bytes
# - Data Transfer Out
# - ElastiCache (à supprimer)
```

---

## ⚠️ Avertissements et Précautions

### Avant de Désactiver Redis
- ✅ Vérifier que le fallback mémoire fonctionne
- ✅ Tester en staging d'abord
- ✅ Monitorer les performances après

### Avant de Downgrade les Instances
- ✅ Vérifier l'utilisation CPU/RAM actuelle
- ✅ Faire un load test
- ✅ Garder auto-scaling activé

### Monitoring Post-Optimisation
- 📊 Surveiller les performances pendant 1 semaine
- 📊 Vérifier les temps de réponse API
- 📊 Monitorer les erreurs

---

## 🎯 Optimisations Futures (Hors scope immédiat)

### 1. Migration vers AWS Lambda (Serverless)

Pour les APIs à trafic variable:
- Coût: Pay-per-request
- Économie potentielle: 50-70% pour faible trafic
- Complexité: Élevée (refactoring nécessaire)

### 2. AWS Fargate vs Elastic Beanstalk

- Fargate: Containers sans gérer les instances
- Potentiellement moins cher à faible échelle
- Meilleur contrôle de la ressource

### 3. Multi-Region Standby (Économie: 100%)

- Désactiver les environnements de standby non utilisés
- Recréer à la demande si besoin

---

## 📞 Support et Ressources

### Outils AWS de Cost Optimization
- **AWS Cost Explorer:** Analyse détaillée des coûts
- **AWS Trusted Advisor:** Recommandations automatiques
- **AWS Compute Optimizer:** Suggestions de taille d'instance
- **AWS Budgets:** Alertes de dépassement

### Documentation
- [AWS Cost Optimization Best Practices](https://aws.amazon.com/pricing/cost-optimization/)
- [Elastic Beanstalk Pricing](https://aws.amazon.com/elasticbeanstalk/pricing/)
- [EC2 Instance Types](https://aws.amazon.com/ec2/instance-types/)

---

## 🚦 Checklist d'Implémentation

### Semaine 1: Quick Wins
- [ ] Désactiver Redis ElastiCache (15€/mois)
- [ ] Analyser utilisation CPU/RAM de chaque service
- [ ] Downgrade 2-3 services vers t3.micro (15€/mois)
- [ ] Activer S3 Intelligent-Tiering (2-5€/mois)

### Semaine 2-3: Optimisations Moyennes
- [ ] Configurer auto-scaling nocturne (5-10€/mois)
- [ ] Optimiser règles de cache CloudFront
- [ ] Nettoyer anciens logs S3
- [ ] Évaluer consolidation de services

### Mois 2: Optimisations Long Terme
- [ ] Envisager Reserved Instances (si engagement OK)
- [ ] Évaluer migration partielle vers Lambda
- [ ] Optimiser MongoDB Atlas tier

---

**Version:** 1.0
**Date:** 23 février 2026
**Économies Totales Visées:** 40-60€/mois (40-60% de réduction)
**Nouveau Budget Cible:** 50-70€/mois

🤖 Généré avec Claude Code
