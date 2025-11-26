# Playbook des Alertes - RT SYMPHONI.A

## Version: 1.0.0
## Module: subscriptions-contracts-eb

---

## Table des matières

1. [Introduction](#introduction)
2. [Alertes Infrastructure](#alertes-infrastructure)
3. [Alertes Application](#alertes-application)
4. [Alertes Business](#alertes-business)
5. [Procédures d'escalade](#procédures-descalade)
6. [Contacts d'urgence](#contacts-durgence)

---

## Introduction

Ce document décrit les actions à entreprendre pour chaque alerte CloudWatch. Chaque section contient:

- **Description**: Ce que signifie l'alerte
- **Impact**: Conséquences potentielles
- **Diagnostic**: Comment investiguer
- **Actions**: Que faire pour résoudre
- **Prévention**: Comment éviter à l'avenir

---

## Alertes Infrastructure

### 🔴 CRITICAL: High CPU Utilization (>95%)

**Description**: L'utilisation CPU dépasse 95%

**Impact**:
- Ralentissement général de l'application
- Timeout des requêtes API
- Risque de crash du processus Node.js

**Diagnostic**:

1. Vérifier les métriques CPU:
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/ElasticBeanstalk \
     --metric-name CPUUtilization \
     --start-time $(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%S) \
     --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
     --period 300 \
     --statistics Average,Maximum \
     --region eu-west-3
   ```

2. Identifier le processus consommateur:
   ```bash
   # Se connecter à l'instance EB
   eb ssh subscriptions-contracts-eb-prod

   # Top processus CPU
   top -b -n 1 | head -20
   ```

3. Vérifier les logs pour une charge anormale:
   ```
   CloudWatch Logs Insights:
   fields @timestamp, method, url, duration
   | filter duration > 1000
   | stats count() by url
   | sort count desc
   ```

**Actions**:

1. **Immédiat** (si critique):
   - Redémarrer l'application: `eb restart`
   - Vérifier que le CPU redescend

2. **Court terme**:
   - Identifier la cause (endpoint lent, boucle infinie, etc.)
   - Appliquer un hotfix si nécessaire

3. **Moyen terme**:
   - Optimiser le code identifié
   - Augmenter la capacité (scale up/out)

**Prévention**:
- Profiling régulier du code
- Load testing avant déploiement
- Auto-scaling configuré

---

### 🟡 WARNING: High CPU Utilization (>80%)

**Description**: L'utilisation CPU dépasse 80%

**Impact**:
- Performances dégradées
- Risque d'atteindre le seuil critique

**Diagnostic**:
Même procédure que CPU >95% mais moins urgent

**Actions**:
1. Surveiller l'évolution
2. Planifier une investigation
3. Vérifier les patterns de charge

**Prévention**:
- Monitoring proactif des tendances
- Optimisations préventives

---

### 🔴 CRITICAL: High Memory Utilization (>90%)

**Description**: L'utilisation mémoire dépasse 90%

**Impact**:
- Risque de crash Node.js (Out of Memory)
- Swapping excessif
- Performances très dégradées

**Diagnostic**:

1. Vérifier la mémoire utilisée:
   ```bash
   eb ssh subscriptions-contracts-eb-prod
   free -m
   ps aux | grep node | awk '{print $6}'
   ```

2. Identifier les fuites mémoire:
   ```bash
   # Heap snapshot (si node-heapdump installé)
   kill -USR2 $(pgrep node)
   ```

3. Vérifier les logs pour des patterns:
   ```
   fields @timestamp, @message
   | filter @message like /memory/
   | sort @timestamp desc
   ```

**Actions**:

1. **Immédiat**:
   - Redémarrer l'application: `eb restart`
   - Libérer la mémoire

2. **Court terme**:
   - Analyser le heap dump
   - Identifier les fuites mémoire
   - Limiter les objets en cache

3. **Moyen terme**:
   - Corriger les fuites identifiées
   - Augmenter la mémoire disponible
   - Implémenter un garbage collection manuel si nécessaire

**Prévention**:
- Monitoring heap size
- Limites sur les caches
- Tests de charge mémoire
- Code review pour détecter les fuites

---

### 🟡 WARNING: High Disk Space (>85%)

**Description**: L'espace disque dépasse 85%

**Impact**:
- Risque de saturation du disque
- Impossibilité d'écrire des logs
- Crash de l'application

**Diagnostic**:

1. Vérifier l'espace disque:
   ```bash
   eb ssh subscriptions-contracts-eb-prod
   df -h
   ```

2. Identifier les gros fichiers:
   ```bash
   du -sh /var/log/* | sort -rh | head -10
   du -sh /var/app/current/* | sort -rh | head -10
   ```

**Actions**:

1. **Immédiat**:
   - Nettoyer les vieux logs:
     ```bash
     sudo find /var/log -name "*.log.*" -mtime +7 -delete
     ```
   - Vider les logs de rotation:
     ```bash
     sudo truncate -s 0 /var/log/nodejs/nodejs.log
     ```

2. **Court terme**:
   - Configurer logrotate correctement
   - Vérifier que CloudWatch Logs fonctionne
   - Augmenter la taille du volume si nécessaire

**Prévention**:
- Logrotate configuré (7 jours de rétention)
- Monitoring quotidien de l'espace disque
- CloudWatch Logs pour logs centralisés

---

## Alertes Application

### 🔴 CRITICAL: High Error Rate (>5%)

**Description**: Le taux d'erreur API dépasse 5%

**Impact**:
- Expérience utilisateur dégradée
- Perte potentielle de revenus
- Réputation de l'API

**Diagnostic**:

1. Identifier les endpoints en erreur:
   ```
   CloudWatch Logs Insights:
   fields @timestamp, method, url, statusCode
   | filter statusCode >= 400
   | stats count() as error_count by url, statusCode
   | sort error_count desc
   ```

2. Analyser les messages d'erreur:
   ```
   fields @timestamp, level, @message, requestId
   | filter level = "ERROR"
   | sort @timestamp desc
   | limit 100
   ```

3. Vérifier les dépendances:
   - MongoDB: `/health/detailed`
   - Services externes (Stripe, Mailgun)

**Actions**:

1. **Immédiat**:
   - Identifier la cause racine
   - Si MongoDB down: vérifier la connexion
   - Si service externe down: activer le mode dégradé

2. **Court terme**:
   - Déployer un hotfix si bug identifié
   - Activer le circuit breaker si service externe défaillant
   - Informer les utilisateurs si nécessaire

3. **Moyen terme**:
   - Implémenter des retry mechanisms
   - Améliorer la gestion d'erreurs
   - Tests d'intégration renforcés

**Prévention**:
- Tests automatisés complets
- Circuit breakers sur services externes
- Monitoring proactif des dépendances
- Graceful degradation

---

### 🔴 CRITICAL: High 5xx Errors (>10/min)

**Description**: Plus de 10 erreurs serveur par minute

**Impact**:
- Problème serveur sérieux
- Service potentiellement indisponible
- Perte de données possible

**Diagnostic**:

1. Analyser les 5xx récentes:
   ```
   fields @timestamp, method, url, statusCode, @message, requestId
   | filter statusCode >= 500
   | sort @timestamp desc
   | limit 50
   ```

2. Vérifier les exceptions:
   ```
   fields @timestamp, @message, stack
   | filter level = "ERROR"
   | sort @timestamp desc
   ```

3. Vérifier l'état du système:
   ```bash
   curl https://api.rt-symphonia.com/health/detailed
   ```

**Actions**:

1. **Immédiat**:
   - Vérifier MongoDB: `mongosh` ou `/health`
   - Vérifier les logs d'exceptions
   - Rollback si nécessaire: `eb deploy --version <previous>`

2. **Court terme**:
   - Corriger le bug identifié
   - Déployer un hotfix
   - Communiquer avec les utilisateurs

3. **Post-mortem**:
   - Documenter l'incident
   - Ajouter des tests pour éviter la régression
   - Améliorer les health checks

**Prévention**:
- Staging environment avec données réelles
- Canary deployments
- Feature flags pour rollback rapide
- Tests end-to-end automatisés

---

### 🟡 WARNING: High Latency (>1000ms p95)

**Description**: 95% des requêtes dépassent 1 seconde

**Impact**:
- Expérience utilisateur dégradée
- Timeouts clients possibles
- SLA non respecté

**Diagnostic**:

1. Identifier les endpoints lents:
   ```
   fields @timestamp, method, url, duration
   | filter duration > 1000
   | stats avg(duration) as avg_duration, max(duration) as max_duration, count() as slow_count by url
   | sort slow_count desc
   ```

2. Vérifier MongoDB:
   ```
   fields @timestamp, operation, duration
   | filter operation like /MongoDB/
   | stats avg(duration) as avg_db_duration
   ```

3. Vérifier les appels externes:
   ```
   fields @timestamp, service, duration
   | filter service in ["stripe", "mailgun", "aws"]
   ```

**Actions**:

1. **Court terme**:
   - Identifier les requêtes N+1
   - Ajouter des index MongoDB si nécessaire
   - Optimiser les requêtes lentes

2. **Moyen terme**:
   - Implémenter du caching (Redis)
   - Pagination sur les listes
   - Lazy loading

3. **Long terme**:
   - Architecture microservices si nécessaire
   - CDN pour assets statiques
   - Database sharding si volume important

**Prévention**:
- Query profiling régulier
- Load testing avec production-like data
- APM (Application Performance Monitoring)
- SLA monitoring

---

### 🔴 CRITICAL: MongoDB Connection Failures (>5/min)

**Description**: Plus de 5 échecs de connexion MongoDB par minute

**Impact**:
- Service indisponible
- Impossibilité de lire/écrire des données
- Erreurs 503 aux clients

**Diagnostic**:

1. Vérifier la connexion MongoDB:
   ```bash
   curl https://api.rt-symphonia.com/health/detailed | jq '.checks.mongodb'
   ```

2. Vérifier les logs MongoDB:
   ```
   fields @timestamp, @message
   | filter @message like /MongoDB/
   | sort @timestamp desc
   ```

3. Vérifier MongoDB Atlas (si utilisé):
   - Dashboard Atlas
   - Connexions actives
   - CPU/Memory du cluster

**Actions**:

1. **Immédiat**:
   - Vérifier les credentials MongoDB
   - Vérifier le network (Security Groups, IP Whitelist)
   - Redémarrer la connexion: `eb restart`

2. **Court terme**:
   - Vérifier la capacité du cluster MongoDB
   - Augmenter le pool de connexions si nécessaire
   - Vérifier les index manquants (slow queries)

3. **Moyen terme**:
   - Upgrade du cluster MongoDB si sous-dimensionné
   - Implémenter un connection retry avec backoff
   - Monitoring proactif MongoDB

**Prévention**:
- Connection pooling configuré
- Retry logic avec exponential backoff
- Monitoring MongoDB Atlas
- Backup et disaster recovery plan

---

## Alertes Business

### 🟡 WARNING: Low Order Volume (<5/hour)

**Description**: Moins de 5 commandes par heure

**Impact**:
- Revenus en baisse
- Possible problème technique ou commercial
- Besoin d'investigation

**Diagnostic**:

1. Vérifier les commandes récentes:
   ```
   CloudWatch Logs Insights (business-metrics):
   fields @timestamp, metric, value, metadata.orderId
   | filter metric = "transport_order_created"
   | stats count() by bin(1h)
   ```

2. Vérifier les erreurs de paiement:
   ```
   fields @timestamp, @message
   | filter @message like /stripe/ or @message like /payment/
   | filter level = "ERROR"
   ```

3. Vérifier les parcours utilisateurs:
   - Taux de conversion
   - Abandons de panier
   - Erreurs sur formulaire

**Actions**:

1. **Analyse**:
   - Comparer avec les semaines précédentes
   - Vérifier si jour férié / week-end
   - Vérifier la saisonnalité

2. **Investigation**:
   - Tester le parcours de commande
   - Vérifier les emails de confirmation
   - Vérifier les intégrations Stripe

3. **Communication**:
   - Informer l'équipe commerciale
   - Vérifier les campagnes marketing
   - Analyser le trafic web

**Prévention**:
- Monitoring des KPIs business
- A/B testing
- Analytics détaillées
- Alertes sur baisse de trafic

---

### 🟡 WARNING: High Delivery Delay Rate (>20%)

**Description**: Plus de 20% des livraisons sont en retard

**Impact**:
- Satisfaction client dégradée
- Risque de pénalités contractuelles
- Réputation de la plateforme

**Diagnostic**:

1. Identifier les livraisons en retard:
   ```
   fields @timestamp, metadata.orderId, metadata.delay, metadata.carrierId
   | filter metric = "delivery_completed" and metadata.onTime = false
   | sort metadata.delay desc
   | limit 50
   ```

2. Analyser par transporteur:
   ```
   fields metadata.carrierId
   | filter metric = "delivery_completed"
   | stats sum(metadata.onTime = false) as delayed, count() as total by metadata.carrierId
   | eval delay_rate = delayed / total * 100
   | sort delay_rate desc
   ```

3. Vérifier les causes:
   - Problèmes de trafic
   - Météo
   - Problème spécifique transporteur
   - Estimation ETA incorrecte

**Actions**:

1. **Court terme**:
   - Identifier les transporteurs problématiques
   - Contacter les transporteurs en retard
   - Informer les clients affectés

2. **Moyen terme**:
   - Ajuster les scores des transporteurs
   - Revoir les estimations ETA
   - Implémenter des alertes proactives

3. **Long terme**:
   - Machine Learning pour prédiction ETA
   - Diversification des transporteurs
   - Pénalités contractuelles pour retards

**Prévention**:
- Monitoring temps réel des livraisons
- Alertes préventives sur retards potentiels
- Buffer dans les estimations ETA
- Qualité des transporteurs référencés

---

### 🟡 WARNING: Low Carrier Score (<70)

**Description**: Score moyen des transporteurs en dessous de 70

**Impact**:
- Qualité de service dégradée
- Risque de problèmes opérationnels
- Insatisfaction clients

**Diagnostic**:

1. Identifier les transporteurs problématiques:
   ```
   fields @timestamp, metadata.carrierId, metadata.newScore
   | filter metric = "carrier_score_updated"
   | stats avg(metadata.newScore) as avg_score by metadata.carrierId
   | filter avg_score < 70
   | sort avg_score asc
   ```

2. Analyser les facteurs de score:
   - Ponctualité
   - Qualité du service
   - Satisfaction client
   - Incidents

**Actions**:

1. **Immédiat**:
   - Contacter les transporteurs concernés
   - Vérifier les réclamations clients
   - Analyser les incidents récents

2. **Court terme**:
   - Plan d'amélioration avec le transporteur
   - Suspension temporaire si nécessaire
   - Recherche de transporteurs alternatifs

3. **Long terme**:
   - Critères de sélection plus stricts
   - Programme de formation transporteurs
   - Système de bonus/malus

**Prévention**:
- Évaluation régulière des transporteurs
- Feedback clients systématique
- Audits qualité périodiques
- Seuils de performance contractuels

---

## Procédures d'escalade

### Niveau 1: Astreinte DevOps

**Déclencheurs**:
- Alertes WARNING
- Alertes hors heures ouvrées
- Incidents mineurs

**Actions**:
- Investigation initiale (30 min max)
- Application de solutions standards
- Escalade si non résolu

**Délai de réponse**: 30 minutes

---

### Niveau 2: Lead Technique

**Déclencheurs**:
- Alertes CRITICAL
- Non résolution niveau 1
- Impact utilisateurs important

**Actions**:
- Investigation approfondie
- Coordination équipe technique
- Communication parties prenantes
- Escalade si nécessaire

**Délai de réponse**: 15 minutes

---

### Niveau 3: CTO / Management

**Déclencheurs**:
- Incident majeur (>1h)
- Impact business significatif
- Données sensibles compromises
- Communication externe nécessaire

**Actions**:
- Décisions stratégiques
- Communication clients/presse
- Activation plan de continuité
- Post-mortem

**Délai de réponse**: 5 minutes

---

## Contacts d'urgence

### Équipe Technique

| Rôle | Nom | Email | Téléphone | Disponibilité |
|------|-----|-------|-----------|---------------|
| DevOps L1 | Astreinte DevOps | devops-oncall@rt-symphonia.com | +33 6 XX XX XX XX | 24/7 |
| Lead Tech | [Nom] | lead-tech@rt-symphonia.com | +33 6 XX XX XX XX | 24/7 |
| CTO | [Nom] | cto@rt-symphonia.com | +33 6 XX XX XX XX | 24/7 |

### Support AWS

- **AWS Support Premium**: https://console.aws.amazon.com/support/
- **Téléphone**: 0800 XXX XXX (France)
- **Disponibilité**: 24/7

### Partenaires Externes

| Service | Contact | Support |
|---------|---------|---------|
| MongoDB Atlas | support@mongodb.com | 24/7 |
| Stripe | https://support.stripe.com | 24/7 |
| Mailgun | support@mailgun.com | Email |

---

## Outils de diagnostic

### Commandes essentielles

```bash
# État de l'application
eb status
eb health --refresh

# Logs en temps réel
eb logs --stream

# SSH instance
eb ssh

# Métriques CloudWatch
aws cloudwatch get-metric-statistics ...

# Restart
eb restart
```

### Dashboards

- **CloudWatch**: https://console.aws.amazon.com/cloudwatch/
- **Elastic Beanstalk**: https://console.aws.amazon.com/elasticbeanstalk/
- **MongoDB Atlas**: https://cloud.mongodb.com/

---

**Version**: 1.0.0
**Dernière mise à jour**: 26 novembre 2025
**Auteur**: RT SYMPHONI.A DevOps Team
