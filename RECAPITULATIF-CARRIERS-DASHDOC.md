# Récapitulatif: Intégration Carriers Dashdoc

**Date:** 30 janvier 2026
**Status:** ✅ Partiellement complété

---

## ✅ Ce qui a été réalisé

### 1. TMS Sync API - Filtre "1 UP" (Donneur d'Ordre)

**Status:** ✅ **COMPLÉTÉ ET DÉPLOYÉ**

**Version:** v2.3.4-debug-cleanup

**Changements:**
- ✅ Filtre basé sur pattern Remote ID: `^C\d+$` exclut les clients
- ✅ "1 UP" (remoteId: C10006) exclu automatiquement des syncs
- ✅ "1 UP" supprimé manuellement de MongoDB
- ✅ Endpoint de debug ajouté: `POST /api/v1/debug/cleanup-obsolete-carriers`

**Données actuelles dans TMS Sync API:**
```bash
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tms/carriers
```

**Résultat:**
- Total: **2 carriers** (au lieu de 3)
- ✅ **2BMoved** (remoteId: CF30078 + S70614)
- ✅ **2CS TRANSPORTS** (remoteId: S70392)
- ❌ ~~1 UP~~ (supprimé)

**URL CloudFront TMS Sync:**
- `https://d3l245gwcnguty.cloudfront.net/api/v1/tms/carriers`

---

### 2. Fichiers Modifiés dans TMS Sync

| Fichier | Modification | Status |
|---------|--------------|--------|
| `connectors/dashdoc.connector.js` | Filtre remoteId pattern `^C\d+$` | ✅ Déployé |
| `scheduled-jobs.js` | Auto cleanup carriers obsolètes | ⚠️ Implémenté mais non testé |
| `index.js` | + Version dynamique<br>+ Endpoint debug cleanup | ✅ Déployé |
| `package.json` | Version 2.3.3 → 2.3.4 | ✅ Déployé |

---

## ⚠️ Problème Restant

### Frontend Affiche Toujours des Données Fictives

**Raison:** Le frontend appelle `GET /api/carriers` sur Auth API qui retourne des données fictives locales MongoDB au lieu des vraies données Dashdoc depuis TMS Sync API.

**URL actuelle du frontend:**
```
https://transporteur.symphonia-controltower.com/carriers
→ Appelle: https://ddaywxps9n701.cloudfront.net/api/carriers
→ Retourne: Données fictives (Transport Durand & Fils, Express Logistique Sud, etc.)
```

**URL qui devrait être appelée:**
```
https://d3l245gwcnguty.cloudfront.net/api/v1/tms/carriers
→ Retourne: Vraies données Dashdoc (2BMoved, 2CS TRANSPORTS)
```

---

## ❌ Tentative Échouée: Proxy Auth API → TMS Sync

**Fichier:** `services/authz-eb/carriers.js`
**Version tentée:** v3.11.0-tms-sync-fetch

**Code ajouté:**
```javascript
// Ligne 708-747
app.get('/api/carriers', async (req, res) => {
  // PAR DÉFAUT: Récupérer depuis TMS Sync API
  if (req.query.localOnly !== 'true') {
    const fetch = require('node-fetch');
    const tmsResponse = await fetch(`${TMS_SYNC_URL}/api/v1/tms/carriers?...`);
    const tmsData = await tmsResponse.json();
    return res.json({ carriers: tmsData.carriers, ... });
  }
  // Fallback: carriers locaux MongoDB
});
```

**Résultat:** ❌ **ÉCHEC - Health: Red**
- Déploiement réussi mais application ne démarre pas
- ELB health check échoue
- Rollback vers v3.10.0-dashdoc-carriers-20260130-121941 effectué

**Erreur probable:**
- node-fetch v2 syntax issue
- Ou erreur de runtime non catchée

---

## 🔧 Solutions Possibles

### Option 1: Corriger Auth API Proxy (Recommandé)

**Avantage:** Transparence pour le frontend

**Actions:**
1. Debug de l'erreur node-fetch dans carriers.js
2. Possiblement utiliser axios au lieu de node-fetch (ajouter aux dépendances)
3. Tester localement avant déploiement

**Code à tester:**
```javascript
// Utiliser axios (plus simple)
const axios = require('axios');
const tmsResponse = await axios.get(`${TMS_SYNC_URL}/api/v1/tms/carriers`, {
  params: { limit, skip, search, level },
  timeout: 10000
});
return res.json({
  carriers: tmsResponse.data.carriers,
  pagination: { ... }
});
```

**Dépendance à ajouter à authz-eb/package.json:**
```json
"dependencies": {
  "axios": "^1.6.2",
  // ... autres deps existantes
}
```

---

### Option 2: Modifier le Frontend (Alternative)

**Avantage:** Pas de modification backend

**Actions:**
1. Modifier le frontend pour appeler TMS Sync API directement
2. Mettre à jour l'env var: `NEXT_PUBLIC_CARRIERS_API_URL`
3. Redéployer le frontend

**Fichier à modifier:**
```
rt-frontend-apps/apps/web-transporter/...
```

**Nouvelle env var Amplify:**
```
NEXT_PUBLIC_CARRIERS_API_URL=https://d3l245gwcnguty.cloudfront.net
```

**Code frontend à modifier (exemple):**
```javascript
// Avant:
const response = await fetch(`${process.env.NEXT_PUBLIC_AUTH_API_URL}/api/carriers`);

// Après:
const response = await fetch(`${process.env.NEXT_PUBLIC_TMS_SYNC_API_URL}/api/v1/tms/carriers`);
```

---

### Option 3: Créer Endpoint de Redirection Simple

**Avantage:** Minimal, juste une redirection

**Code minimal dans Auth API:**
```javascript
app.get('/api/carriers', (req, res) => {
  // Redirection 307 (Temporary) vers TMS Sync API
  const queryString = new URLSearchParams(req.query).toString();
  res.redirect(307, `https://d3l245gwcnguty.cloudfront.net/api/v1/tms/carriers?${queryString}`);
});
```

**Problème:** CORS et redirection cross-origin

---

## 📊 Données Actuelles

### TMS Sync API (Vraies données Dashdoc)
```json
{
  "success": true,
  "total": 2,
  "carriers": [
    {
      "companyName": "2BMoved",
      "remoteId": "CF30078 + S70614",
      "siret": "87766039900024",
      "totalOrders": 20,
      "score": 0,
      "vigilance": { "score": 56, "level": "N2 - Guest" }
    },
    {
      "companyName": "2CS TRANSPORTS",
      "remoteId": "S70392",
      "siret": "44964403800068",
      "totalOrders": 20,
      "score": 0,
      "vigilance": { "score": 56, "level": "N2 - Guest" }
    }
  ]
}
```

### Auth API (Données fictives MongoDB)
```json
{
  "carriers": [
    {
      "companyName": "Transport Durand & Fils",
      "siret": "12345678901234",
      "score": 92,
      "level": "N1_premium"
    },
    {
      "companyName": "Express Logistique Sud",
      "siret": "98765432109876",
      "score": 85,
      "level": "N1_reference"
    },
    {
      "companyName": "Transports Petit",
      "score": 0,
      "level": "N2_invited"
    }
  ]
}
```

---

## 🎯 Prochaines Étapes Recommandées

### Étape 1: Corriger Auth API (Priorité 1)

1. **Ajouter axios aux dépendances de authz-eb**
   ```bash
   cd services/authz-eb
   # Modifier package.json: ajouter "axios": "^1.6.2"
   ```

2. **Modifier carriers.js pour utiliser axios** (au lieu de node-fetch)
   - Ligne 708-747: Remplacer node-fetch par axios
   - Tester la syntaxe localement si possible

3. **Déployer et tester**
   ```bash
   # Deploy authz-eb v3.11.1-axios
   # Test: curl https://ddaywxps9n701.cloudfront.net/api/carriers
   ```

4. **Invalider cache CloudFront**
   ```bash
   aws cloudfront create-invalidation --distribution-id E3A9IWVF4GHMBV --paths "/*"
   ```

---

### Étape 2: Vérifier Frontend

1. **Vider cache navigateur** (Ctrl+Shift+Delete)
2. **Hard refresh** (Ctrl+F5)
3. **Tester la page carriers:**
   ```
   https://transporteur.symphonia-controltower.com/carriers
   ```

4. **Vérifier DevTools Console** pour erreurs CORS ou fetch

---

### Étape 3: Synchronisation Continue

Le job `carriersSync` s'exécute toutes les **5 minutes** automatiquement:
- ✅ Sync nouveaux carriers depuis Dashdoc
- ✅ Exclut automatiquement les clients (pattern `C\d+`)
- ⚠️ Cleanup obsolètes (à vérifier)

**Vérifier status jobs:**
```bash
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/status
```

---

## 📚 Documentation Technique

### URLs et Endpoints

| Service | URL CloudFront | Endpoint Carriers | Status |
|---------|----------------|-------------------|--------|
| TMS Sync API | d3l245gwcnguty.cloudfront.net | /api/v1/tms/carriers | ✅ Vraies données |
| Auth API | ddaywxps9n701.cloudfront.net | /api/carriers | ⚠️ Données fictives |
| Frontend | transporteur.symphonia-controltower.com | /carriers (page) | ⚠️ Affiche fictives |

### Versions Déployées

| Service | Environment | Version | Health | Updated |
|---------|-------------|---------|--------|---------|
| TMS Sync API | rt-tms-sync-api-v2 | **v2.3.4-debug-cleanup** | 🟢 Green | 2026-01-30 14:19 |
| Auth API | rt-authz-api-prod | v3.10.0-dashdoc-carriers | 🟢 Green | 2026-01-30 14:30 |
| Frontend | Amplify #676 | Build 676 | 🟢 | 2026-01-30 10:38 |

---

## 🔍 Debug Commands

```bash
# Vérifier carriers TMS Sync
curl https://d3l245gwcnguty.cloudfront.net/api/v1/tms/carriers | jq

# Vérifier carriers Auth API
curl https://ddaywxps9n701.cloudfront.net/api/carriers | jq

# Health check TMS Sync
curl https://d3l245gwcnguty.cloudfront.net/health

# Cleanup manual obsolete carriers
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/debug/cleanup-obsolete-carriers

# Run carriersSync job manually
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/carriersSync/run

# Jobs status
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/status | jq
```

---

## ✅ Succès Obtenus

1. ✅ Exclusion automatique de "1 UP" (donneur d'ordre) via filtre pattern Remote ID
2. ✅ Suppression de "1 UP" de la base MongoDB
3. ✅ TMS Sync API retourne 2 vrais carriers Dashdoc
4. ✅ Synchronisation automatique toutes les 5 minutes
5. ✅ Version dynamique depuis package.json
6. ✅ Endpoint de debug pour cleanup

## ⚠️ Reste à Faire

1. ⚠️ Corriger Auth API pour qu'il proxy vers TMS Sync API
2. ⚠️ Invalider cache CloudFront après correction
3. ⚠️ Vérifier que le frontend affiche les vraies données
4. ⚠️ Tester le système de vigilance avec vraies données
5. ⚠️ Débugger le cleanup automatique (ne s'exécute pas)

---

*Généré le 30 janvier 2026 - Claude Code*
