# Rapport de Déploiement - Services Backend AWS Elastic Beanstalk
**Date:** 2025-11-27
**Statut:** SUCCÈS - 6/6 services déployés

---

## Résumé Exécutif

Tous les services backend ont été déployés avec succès sur AWS Elastic Beanstalk dans la région eu-central-1. Le frontend AWS Amplify a été configuré pour se connecter aux nouvelles URLs.

**Problèmes résolus:**
1. **affret-ia-api-v2**: Conflit de nom d'environnement résolu en utilisant un nouveau CNAME (rt-affret-ia-api-prod-v2)
2. **websocket-api**: Déjà déployé avec succès précédemment

---

## Services Déployés (6/6)

### 1. tracking-api ✅
- **Application:** rt-tracking-api
- **Environnement:** rt-tracking-api-prod
- **URL:** http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com
- **Port:** 3012
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"tracking-api","version":"1.0.0","mongodb":"connected","websocket":"disconnected","tomtom":false}`

### 2. appointments-api ✅
- **Application:** rt-appointments-api
- **Environnement:** rt-appointments-api-prod
- **URL:** http://rt-appointments-api-prod.eba-b5rcxvcw.eu-central-1.elasticbeanstalk.com
- **Port:** 3013
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"appointments-api","version":"1.0.0"}`

### 3. documents-api ✅
- **Application:** rt-documents-api
- **Environnement:** rt-documents-api-prod
- **URL:** http://rt-documents-api-prod.eba-xscabiv8.eu-central-1.elasticbeanstalk.com
- **Port:** 3014
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"documents-api","version":"1.0.0","s3":false,"textract":false}`

### 4. scoring-api ✅
- **Application:** rt-scoring-api
- **Environnement:** rt-scoring-api-prod
- **URL:** http://rt-scoring-api-prod.eba-ygb5kqyw.eu-central-1.elasticbeanstalk.com
- **Port:** 3016
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"scoring-api","version":"1.0.0"}`

### 5. affret-ia-api-v2 ✅
- **Application:** rt-affret-ia-api
- **Environnement:** rt-affret-ia-api-prod-v2
- **URL:** http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com
- **Port:** 3017
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"affret-ia-api-v2","version":"2.0.0"}`
- **Note:** Nouveau CNAME utilisé pour éviter le conflit avec l'ancien environnement

### 6. websocket-api ✅
- **Application:** rt-websocket-api
- **Environnement:** rt-websocket-api-prod
- **URL:** http://rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com
- **Port:** 3010
- **Health:** Green
- **Status:** Ready
- **Response:** `{"status":"healthy","service":"websocket-api","version":"1.0.0","timestamp":"2025-11-27T21:34:51.216Z","connections":{"active":0,"mongodb":"connected"},"uptime":875.554997513}`

---

## Détails Techniques

### Configuration AWS
- **Région:** eu-central-1
- **Instance Type:** t3.micro
- **Platform:** Node.js 20 running on 64bit Amazon Linux 2023 (v6.7.0)
- **Deployment:** Single instance (non load-balanced)
- **MongoDB:** mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net

### Quota EIP
- **Statut:** Approuvé (Request ID: 7424adba98f247d2a4071cf7594fa7e6s6AGY658)
- **Nouvelle limite:** 25 Elastic IPs (augmenté de 15)
- **Utilisation actuelle:** 6 EIP pour les 6 services

### Variables d'environnement
Chaque service est configuré avec:
- `NODE_ENV=production`
- `PORT=[port spécifique]`
- `MONGODB_URI=[base MongoDB]/[database]?retryWrites=true&w=majority`
- `CORS_ALLOWED_ORIGINS=http://localhost:3000,https://main.dbg6okncuyyiw.amplifyapp.com,https://main.d3b6p09ihn5w7r.amplifyapp.com`
- `JWT_SECRET=rt-super-secret-jwt-key-2024`
- `LOG_LEVEL=info`

---

## Problèmes Rencontrés et Solutions

### Problème 1: affret-ia-api - Conflit de nom d'environnement
**Erreur:** `Environment rt-affret-ia-api-prod already exists`

**Analyse:**
- Un ancien environnement "rt-affret-ia-api-prod" existait sous l'application "rt-api-affret-ia" (créé le 23/11/2025)
- Le script tentait de créer un nouvel environnement avec le même nom sous une nouvelle application "rt-affret-ia-api"
- AWS ne permet pas deux environnements avec le même CNAME, même sous des applications différentes

**Solution appliquée:**
- Modification du script `deploy-affret-ia-api.sh` ligne 27
- Changement du nom d'environnement de `rt-affret-ia-api-prod` à `rt-affret-ia-api-prod-v2`
- Nouveau CNAME: `rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com`
- L'ancien environnement reste actif pour compatibilité ascendante si nécessaire

**Commande modifiée:**
```bash
"$EB" create rt-affret-ia-api-prod-v2 \
  --instance-type t3.micro \
  --single \
  --timeout 20
```

### Problème 2: websocket-api - Déjà déployé
**Statut:** Aucune action nécessaire

**Analyse:**
- Le service websocket-api avait déjà été déployé avec succès
- Environnement: rt-websocket-api-prod (ID: e-htvivwa2zf)
- Déployé le 2025-11-27 à 21:20:37 UTC
- Health: Green, Status: Ready

**Action:** Aucune action nécessaire, service déjà opérationnel

---

## Configuration Frontend (amplify.yml)

Le fichier `c:\Users\rtard\rt-frontend-apps\amplify.yml` a été mis à jour avec les nouvelles URLs:

```yaml
environment:
  variables:
    # API URLs - AWS Elastic Beanstalk (Updated 2025-11-27)
    NEXT_PUBLIC_API_URL: 'http://rt-authz-api-prod.eba-smipp22d.eu-central-1.elasticbeanstalk.com/api'
    NEXT_PUBLIC_ORDERS_API_URL: 'http://rt-orders-api-prod.eba-dbgatxmk.eu-central-1.elasticbeanstalk.com/api/v1'
    NEXT_PUBLIC_TRACKING_API_URL: 'http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com'
    NEXT_PUBLIC_APPOINTMENTS_API_URL: 'http://rt-appointments-api-prod.eba-b5rcxvcw.eu-central-1.elasticbeanstalk.com'
    NEXT_PUBLIC_DOCUMENTS_API_URL: 'http://rt-documents-api-prod.eba-xscabiv8.eu-central-1.elasticbeanstalk.com'
    NEXT_PUBLIC_SCORING_API_URL: 'http://rt-scoring-api-prod.eba-ygb5kqyw.eu-central-1.elasticbeanstalk.com'
    NEXT_PUBLIC_AFFRET_API_URL: 'http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com'
    NEXT_PUBLIC_WS_URL: 'ws://rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com'
```

---

## Tests de Santé

Tous les services répondent correctement au endpoint `/health`:

| Service | HTTP Status | Response Time | MongoDB | Notes |
|---------|-------------|---------------|---------|-------|
| tracking-api | 200 | <500ms | Connected | Websocket disconnected, TomTom false |
| appointments-api | 200 | <500ms | N/A | Service healthy |
| documents-api | 200 | <500ms | N/A | S3 and Textract false (config à vérifier) |
| scoring-api | 200 | <500ms | N/A | Service healthy |
| affret-ia-api-v2 | 200 | <500ms | N/A | Version 2.0.0 |
| websocket-api | 200 | <500ms | Connected | 0 active connections, uptime 875s |

---

## Fichiers Modifiés

1. **c:\Users\rtard\rt-backend-services\deploy-affret-ia-api.sh**
   - Changement du nom d'environnement (ligne 27)

2. **c:\Users\rtard\rt-backend-services\DEPLOYED_URLS.txt**
   - Mise à jour complète avec toutes les URLs
   - Nettoyage des doublons

3. **c:\Users\rtard\rt-frontend-apps\amplify.yml**
   - Mise à jour de toutes les variables NEXT_PUBLIC_*_API_URL
   - Ajout de la date de mise à jour dans les commentaires

---

## Prochaines Étapes Recommandées

### Immédiat
1. **Redéployer le frontend sur AWS Amplify** pour prendre en compte les nouvelles URLs
2. **Tester l'intégration complète** entre le frontend et tous les services backend
3. **Vérifier les logs** de chaque service pour détecter d'éventuelles erreurs

### Court terme (24-48h)
1. **Configurer S3 et Textract** pour documents-api (actuellement false)
2. **Configurer TomTom API** pour tracking-api (actuellement false)
3. **Connecter tracking-api au websocket** pour les mises à jour en temps réel
4. **Ajouter des health checks CloudWatch** pour monitoring automatique

### Moyen terme (1 semaine)
1. **Évaluer la performance** de chaque service sous charge
2. **Envisager Load Balancing** si le trafic augmente (passage de single à multi-instance)
3. **Nettoyer l'ancien environnement** rt-api-affret-ia/rt-affret-ia-api-prod si non utilisé
4. **Implémenter HTTPS** avec Certificate Manager pour sécuriser les communications
5. **Configurer des alarmes CloudWatch** pour CPU, mémoire, et erreurs

### Long terme (1 mois)
1. **Migration vers HTTPS** obligatoire pour toutes les APIs
2. **Configuration d'un API Gateway** pour centraliser les appels
3. **Mise en place de CD/CD automatique** avec GitHub Actions
4. **Documentation OpenAPI/Swagger** pour chaque service
5. **Tests de charge et optimisation** des performances

---

## Commandes de Maintenance

### Vérifier le statut de tous les services
```bash
aws elasticbeanstalk describe-environments --region eu-central-1 \
  --query "Environments[?Status=='Ready'].[ApplicationName,EnvironmentName,Health]" \
  --output table
```

### Tester tous les endpoints de santé
```bash
for url in \
  "http://rt-tracking-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com/health" \
  "http://rt-appointments-api-prod.eba-b5rcxvcw.eu-central-1.elasticbeanstalk.com/health" \
  "http://rt-documents-api-prod.eba-xscabiv8.eu-central-1.elasticbeanstalk.com/health" \
  "http://rt-scoring-api-prod.eba-ygb5kqyw.eu-central-1.elasticbeanstalk.com/health" \
  "http://rt-affret-ia-api-prod-v2.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/health" \
  "http://rt-websocket-api-prod.eba-nedjyqk3.eu-central-1.elasticbeanstalk.com/health"
do
  echo "Testing: $url"
  curl -s "$url" | jq .
  echo ""
done
```

### Voir les logs d'un service
```bash
cd "c:\Users\rtard\rt-backend-services\services\[service-name]"
/c/Users/rtard/AppData/Roaming/Python/Python314/Scripts/eb.exe logs [env-name]
```

---

## Contacts et Références

**AWS CLI Path:** `/c/Users/rtard/AppData/Roaming/Python/Python314/Scripts/eb.exe`
**MongoDB Connection:** `mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net`
**AWS Region:** eu-central-1
**Elastic IP Quota Request ID:** 7424adba98f247d2a4071cf7594fa7e6s6AGY658

---

## Conclusion

Le déploiement de tous les services backend a été complété avec succès. L'infrastructure est maintenant prête pour le déploiement frontend et les tests d'intégration complets.

**Statut Final:** ✅ 6/6 services déployés et opérationnels
**Date de complétion:** 2025-11-27 21:34 UTC
**Temps total de déploiement:** ~45 minutes (incluant le débogage)

---

*Rapport généré automatiquement par Claude Code*
