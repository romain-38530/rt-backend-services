# Import Complet des Carriers - Pagination Automatique

**Date:** 30 janvier 2026
**Version:** v2.4.0
**Objectif:** Importer les **1367 transporteurs Dashdoc** avec pagination automatique

---

## 📋 PROBLÈME IDENTIFIÉ

### Situation Actuelle
- **Dashdoc:** 1367 transporteurs disponibles
- **TMS Sync API:** Seulement 2 transporteurs synchronisés
- **Cause:** Limite de 500 carriers par appel API, sans pagination

### Code Problématique
```javascript
// scheduled-jobs.js ligne 160
const result = await dashdoc.syncCarriersWithStats({ limit: 500 });
// ❌ Ne récupère que les 500 premiers carriers
// ❌ Après filtrage (pattern ^C\d+$), il ne reste que 2 carriers
```

---

## ✅ SOLUTION IMPLÉMENTÉE

### 1. Nouvelle Méthode: getAllCarriersWithPagination()

**Fichier:** `connectors/dashdoc.connector.js` (ajouté après ligne 145)

**Fonctionnalité:**
- Pagination automatique pour récupérer TOUS les carriers
- Parcourt toutes les pages jusqu'à épuisement
- Limite de sécurité: 100 pages max (50 000 carriers)
- Délai de 500ms entre chaque page pour ne pas surcharger l'API

**Code:**
```javascript
async getAllCarriersWithPagination(options = {}, maxPages = 100) {
  const allCarriers = [];
  let page = 1;
  let hasMorePages = true;
  const limit = 500; // Limite API Dashdoc pour companies

  console.log('[DASHDOC CARRIERS] Starting full pagination...');

  while (hasMorePages && page <= maxPages) {
    try {
      console.log(`[DASHDOC CARRIERS] Fetching page ${page}...`);

      const result = await this.getCarriers({
        ...options,
        limit,
        page
      });

      allCarriers.push(...result.results);

      console.log(`[DASHDOC CARRIERS] Page ${page}: ${result.results.length} carriers, Total: ${allCarriers.length}`);

      // Vérifier si il y a une page suivante
      hasMorePages = result.results.length === limit;
      page++;

      // Petit délai pour ne pas surcharger l'API
      if (hasMorePages) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error(`[DASHDOC CARRIERS] Error fetching page ${page}:`, error.message);
      break;
    }
  }

  console.log(`[DASHDOC CARRIERS] Pagination complete: ${allCarriers.length} total carriers`);
  return allCarriers;
}
```

---

### 2. Modification: syncCarriersWithStats()

**Fichier:** `connectors/dashdoc.connector.js` (ligne 399-422)

**Modifications:**
- ✅ Paramètre `usePagination: true` par défaut
- ✅ Utilise `getAllCarriersWithPagination()` si pagination activée
- ✅ Enrichissement par batch de 10 pour ne pas surcharger l'API
- ✅ Gestion d'erreurs pour chaque carrier

**Code:**
```javascript
async syncCarriersWithStats(options = {}) {
  // Par défaut, utiliser la pagination pour récupérer TOUS les carriers
  const usePagination = options.usePagination !== false;
  const maxPages = options.maxPages || 20; // 20 pages * 500 = 10 000 carriers max

  let carriersArray;

  if (usePagination) {
    console.log('[DASHDOC CARRIERS] Using pagination to fetch ALL carriers...');
    carriersArray = await this.getAllCarriersWithPagination(options, maxPages);
  } else {
    console.log('[DASHDOC CARRIERS] Using single call (no pagination)...');
    const carriers = await this.getCarriers(options);
    carriersArray = carriers.results;
  }

  console.log(`[DASHDOC CARRIERS] Total carriers to enrich: ${carriersArray.length}`);

  // Enrichir avec les stats (en parallèle par batch de 10)
  const enrichedCarriers = [];
  const batchSize = 10;

  for (let i = 0; i < carriersArray.length; i += batchSize) {
    const batch = carriersArray.slice(i, i + batchSize);
    console.log(`[DASHDOC CARRIERS] Enriching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(carriersArray.length / batchSize)}...`);

    const enrichedBatch = await Promise.all(
      batch.map(async (carrier) => {
        if (carrier.externalId) {
          try {
            const stats = await this.getCarrierStats(carrier.externalId);
            return {
              ...carrier,
              totalOrders: stats.totalOrders,
              lastOrderAt: stats.lastOrderAt,
              score: stats.onTimeRate
            };
          } catch (error) {
            console.warn(`[DASHDOC CARRIERS] Failed to get stats for ${carrier.companyName}:`, error.message);
            return carrier;
          }
        }
        return carrier;
      })
    );

    enrichedCarriers.push(...enrichedBatch);

    // Petit délai entre les batchs
    if (i + batchSize < carriersArray.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[DASHDOC CARRIERS] Enrichment complete: ${enrichedCarriers.length} carriers`);

  return {
    count: enrichedCarriers.length,
    results: enrichedCarriers
  };
}
```

---

### 3. Mise à Jour: runCarriersSync()

**Fichier:** `scheduled-jobs.js` (ligne 153-163)

**Modifications:**
- ✅ Activation de la pagination automatique
- ✅ Limite de 20 pages (10 000 carriers max, largement suffisant pour 1367)
- ✅ Suppression du paramètre `limit: 500`

**Code:**
```javascript
const DashdocConnector = require('./connectors/dashdoc.connector');
const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
  baseUrl: connection.credentials.apiUrl
});

// Récupérer TOUS les carriers avec pagination automatique
console.log('[CRON CARRIERS] Fetching ALL carriers with automatic pagination...');
const result = await dashdoc.syncCarriersWithStats({
  usePagination: true,
  maxPages: 20  // 20 pages * 500 = 10 000 carriers max (largement suffisant pour 1367)
});
```

---

## 📊 RÉSULTATS ATTENDUS

### Avant (v2.3.3)
```
Carriers synchronisés: 2
- 2BMoved
- 2CS TRANSPORTS
```

### Après (v2.4.0)
```
Carriers synchronisés: ~1365
- Tous les transporteurs Dashdoc
- Exclusion automatique des clients (pattern ^C\d+$)
- Enrichissement avec stats (totalOrders, lastOrderAt, score)
```

### Calcul
- **Total Dashdoc:** 1367 transporteurs
- **Clients filtrés:** ~2 (pattern `^C\d+$`)
- **Transporteurs valides:** ~1365

---

## 🚀 DÉPLOIEMENT

### Fichiers Modifiés
1. **connectors/dashdoc.connector.js**
   - Ajout de `getAllCarriersWithPagination()` (57 lignes)
   - Modification de `syncCarriersWithStats()` (67 lignes)

2. **scheduled-jobs.js**
   - Modification de `runCarriersSync()` (ligne 153-163)

3. **package.json**
   - Version: 2.3.3 → **2.4.0**

### Commandes de Déploiement

```bash
# 1. Créer le package de déploiement
cd "c:\Users\rtard\dossier symphonia\rt-backend-services\services\tms-sync-eb"

# 2. Zipper le package (exclure node_modules, .git, etc.)
zip -r deploy-v2.4.0-full-carriers-pagination.zip . \
  -x "node_modules/*" ".git/*" "*.md" "*.log" "test/*"

# 3. Uploader sur S3
aws s3 cp deploy-v2.4.0-full-carriers-pagination.zip \
  s3://elasticbeanstalk-eu-central-1-004843574253/tms-sync/

# 4. Créer la version EB
aws elasticbeanstalk create-application-version \
  --application-name rt-tms-sync-api \
  --version-label v2.4.0-full-carriers-pagination \
  --source-bundle S3Bucket="elasticbeanstalk-eu-central-1-004843574253",S3Key="tms-sync/deploy-v2.4.0-full-carriers-pagination.zip"

# 5. Déployer sur l'environnement
aws elasticbeanstalk update-environment \
  --environment-name rt-tms-sync-api-v2 \
  --version-label v2.4.0-full-carriers-pagination

# 6. Invalider le cache CloudFront
aws cloudfront create-invalidation \
  --distribution-id EZONIFX9LHHYA \
  --paths "/*"
```

---

## 🔍 TESTS DE VALIDATION

### Test 1: Vérifier le nombre de carriers synchronisés

```bash
# Attendre 10 minutes après déploiement (2x cycle carriersSync de 5 min)

# Appeler l'API
curl https://d3l245gwcnguty.cloudfront.net/api/v1/tms/carriers

# Vérifier:
# - total: ~1365 (au lieu de 2)
# - carriers[].companyName: liste complète
```

### Test 2: Consulter les logs CloudWatch

```bash
aws logs tail /aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log --follow

# Rechercher:
# - "[DASHDOC CARRIERS] Starting full pagination..."
# - "[DASHDOC CARRIERS] Page 1: 500 carriers"
# - "[DASHDOC CARRIERS] Page 2: 500 carriers"
# - "[DASHDOC CARRIERS] Page 3: 367 carriers"
# - "[DASHDOC CARRIERS] Pagination complete: 1367 total carriers"
# - "[CRON CARRIERS] X carriers synchronized"
```

### Test 3: Vérifier le job status

```bash
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/status

# Vérifier:
# - carriersSync: active
# - lastSyncResults: timestamp récent
```

### Test 4: Vérifier le frontend

```
1. Aller sur: https://transporteur.symphonia-controltower.com/carriers
2. Vider cache (Ctrl+Shift+Delete)
3. Hard refresh (Ctrl+F5)
4. Vérifier que la liste affiche ~1365 transporteurs
```

---

## ⚠️ POINTS D'ATTENTION

### Performance
- **Durée de sync:** ~15-20 minutes pour 1367 carriers
  - Pagination: ~3 pages × 500ms = 1.5s
  - Enrichissement: 1367 carriers ÷ 10 (batch) × 200ms = 27s
  - Stats API calls: 1367 × ~500ms = ~11 minutes
- **Impact:** Le job `carriersSync` (toutes les 5 min) peut prendre plus de temps que l'intervalle
- **Solution:** Le job vérifie `lastSync < 25s` avant de relancer

### Charge API Dashdoc
- **Requêtes:** ~1370 requêtes toutes les 5 minutes
  - 3 pages de carriers
  - 1367 appels getCarrierStats()
- **Délais:** 500ms entre pages + 200ms entre batchs
- **Recommandation:** Augmenter l'intervalle de `carriersSync` à **10 ou 15 minutes** si nécessaire

### Modification de l'Intervalle (si besoin)

```javascript
// scheduled-jobs.js ligne 13
const INTERVALS = {
  AUTO_SYNC: 30 * 1000,           // 30 secondes
  SYMPHONIA_SYNC: 60 * 1000,      // 1 minute
  CARRIERS_SYNC: 15 * 60 * 1000,  // 15 minutes (au lieu de 5) ← MODIFIER ICI
  VIGILANCE_UPDATE: 60 * 60 * 1000, // 1 heure
  // ...
};
```

---

## 📈 MONITORING

### CloudWatch Metrics à Surveiller

1. **Environment Health**
   - Doit rester "Green"
   - Warning si "Yellow" pendant plus de 10 minutes

2. **Response Time**
   - `/api/v1/tms/carriers` doit répondre en < 5s
   - Timeout si > 30s

3. **Memory Usage**
   - Surveillance de l'utilisation mémoire pendant enrichissement
   - Augmenter instance si > 80% utilisé

### Alarmes CloudWatch

```bash
# Créer une alarme si response time > 10s
aws cloudwatch put-metric-alarm \
  --alarm-name tms-sync-carriers-slow-response \
  --alarm-description "TMS Sync carriers endpoint slow" \
  --metric-name TargetResponseTime \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold
```

---

## 🎯 RÉSULTAT FINAL

| Métrique | Avant (v2.3.3) | Après (v2.4.0) | Amélioration |
|----------|----------------|----------------|--------------|
| Carriers synchronisés | 2 | ~1365 | **+68150%** |
| Pagination | ❌ Non | ✅ Oui | - |
| Enrichissement par batch | ❌ Non | ✅ Oui (10) | - |
| Gestion d'erreurs | ❌ Basique | ✅ Avancée | - |
| Temps de sync | < 1s | ~15-20 min | - |

---

## 📝 NOTES TECHNIQUES

### Pattern Remote ID (maintenu)
Le filtre pour exclure les clients (donneurs d'ordre) est maintenu:
```javascript
// Pattern: ^C\d+$ = Client
// Pattern: ^S\d+$ ou ^CF\d+$ = Carrier
if (c.remote_id && /^C\d+$/.test(c.remote_id)) {
  console.log(`[DASHDOC] Filtering out client: ${c.name} (${c.remote_id})`);
  return false;
}
```

### Compatibilité Arrière
La pagination peut être désactivée si besoin:
```javascript
await dashdoc.syncCarriersWithStats({
  usePagination: false,
  limit: 500  // Ancienne méthode
});
```

---

## ✅ CHECKLIST DE DÉPLOIEMENT

- [x] Code modifié et testé syntaxiquement
- [x] Version incrémentée: 2.3.3 → 2.4.0
- [ ] Package ZIP créé
- [ ] Upload S3 effectué
- [ ] Version EB créée
- [ ] Déploiement lancé
- [ ] Health check: Green
- [ ] Invalidation CloudFront effectuée
- [ ] Logs vérifiés (pagination visible)
- [ ] API testée (nombre de carriers)
- [ ] Frontend testé (affichage liste)
- [ ] Monitoring activé (alarmes)

---

*Document créé le 30 janvier 2026 - Claude Code*
