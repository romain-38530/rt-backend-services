# Configuration Connexion Dashdoc - TMS Sync API v2.4.0

**Date:** 30 janvier 2026
**Objectif:** Configurer la connexion Dashdoc pour activer la synchronisation automatique des 1367 transporteurs

---

## 🔴 PROBLÈME ACTUEL

Le déploiement v2.4.0 est **réussi** mais aucun carrier n'est synchronisé car il n'y a **pas de connexion Dashdoc active** dans la base MongoDB.

**Vérification:**
```bash
curl http://rt-tms-sync-api-v2.../api/v1/tms/carriers
# Résultat: {"total": 0, "carriers": []}

curl http://rt-tms-sync-api-v2.../api/v1/jobs/status
# Résultat: {"lastSyncResults": {}}  ← Aucune connexion active
```

---

## ✅ SOLUTION: Créer la Connexion Dashdoc

### Option 1: Via MongoDB Compass (Recommandé)

**Credentials:**
- URI: `mongodb+srv://rt_admin:SXmnNXTiAN5KtAaPLdhGHqLiXB5KX7Vd@stagingrt.v2jnoh2.mongodb.net/rt-tms-sync`
- Database: `rt-tms-sync`
- Collection: `tmsConnections`

**Document à insérer:**
```json
{
  "tmsType": "dashdoc",
  "organizationName": "SYMPHONIA",
  "isActive": true,
  "connectionStatus": "connected",
  "credentials": {
    "apiToken": "VOTRE_TOKEN_DASHDOC_ICI",
    "apiUrl": "https://www.dashdoc.eu/api/v4"
  },
  "syncConfig": {
    "autoSync": true,
    "transportLimit": 0,
    "companyLimit": 0,
    "contactLimit": 0,
    "maxPages": 100
  },
  "createdAt": "2026-01-30T00:00:00.000Z",
  "updatedAt": "2026-01-30T00:00:00.000Z"
}
```

**⚠️ IMPORTANT:** Remplacer `VOTRE_TOKEN_DASHDOC_ICI` par le vrai token API Dashdoc.

---

### Option 2: Via API (Alternative)

**Endpoint:** `POST /api/v1/tms/connections`

```bash
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tms/connections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer VOTRE_JWT_TOKEN" \
  -d '{
    "tmsType": "dashdoc",
    "organizationName": "SYMPHONIA",
    "credentials": {
      "apiToken": "VOTRE_TOKEN_DASHDOC_ICI",
      "apiUrl": "https://www.dashdoc.eu/api/v4"
    },
    "syncConfig": {
      "autoSync": true,
      "transportLimit": 0,
      "maxPages": 100
    }
  }'
```

---

## 🔑 Obtenir le Token Dashdoc

### Méthode 1: Via Interface Dashdoc

1. Se connecter sur https://www.dashdoc.eu
2. Aller dans **Paramètres** → **Intégrations** → **API**
3. Générer un nouveau token ou utiliser un existant
4. Copier le token

### Méthode 2: Via Variables d'Environnement (si déjà configuré)

Vérifier si le token existe déjà dans les variables d'environnement:

```bash
aws elasticbeanstalk describe-configuration-settings \
  --environment-name rt-tms-sync-api-v2 \
  --region eu-central-1 \
  --query "ConfigurationSettings[0].OptionSettings[?Namespace=='aws:elasticbeanstalk:application:environment' && OptionName=='DASHDOC_API_TOKEN']"
```

---

## 📊 APRÈS CONFIGURATION

### Étape 1: Vérifier la Connexion

```bash
# Lancer le test de connexion
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/healthCheck/run

# Vérifier le statut
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/status | jq '.status.lastSyncResults'
```

### Étape 2: Lancer la Synchronisation des Carriers

```bash
# Déclencher manuellement le job (durée: ~15-20 minutes)
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/carriersSync/run
```

**Logs attendus:**
```
[CRON CARRIERS] Fetching ALL carriers with automatic pagination...
[DASHDOC CARRIERS] Starting full pagination...
[DASHDOC CARRIERS] Page 1: 500 carriers, Total: 500
[DASHDOC CARRIERS] Page 2: 500 carriers, Total: 1000
[DASHDOC CARRIERS] Page 3: 367 carriers, Total: 1367
[DASHDOC CARRIERS] Pagination complete: 1367 total carriers
[CRON CARRIERS] Enriching batch 1/137...
[CRON CARRIERS] Enriching batch 137/137...
[CRON CARRIERS] 1365 carriers synchronized
```

### Étape 3: Vérifier les Résultats

```bash
# Attendre ~20 minutes puis:
curl http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tms/carriers | jq '.total'
# Résultat attendu: ~1365

# Lister les 10 premiers
curl "http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tms/carriers?limit=10" | jq '.carriers[].companyName'
```

### Étape 4: Tester le Frontend

1. Aller sur: https://transporteur.symphonia-controltower.com/carriers
2. Vider le cache (Ctrl+Shift+Delete)
3. Hard refresh (Ctrl+F5)
4. Cliquer sur **"Importer depuis Dashdoc"**
5. Vérifier que la liste affiche **~1365 transporteurs**

---

## 🔧 ARCHITECTURE FINALE

```
MongoDB Atlas (rt-tms-sync)
    │
    ├─ Collection: tmsConnections
    │   └─ Document: { tmsType: "dashdoc", isActive: true }
    │
    └─ Collection: carriers (sera remplie automatiquement)
        └─ ~1365 documents (après sync)

TMS Sync API v2.4.0 (rt-tms-sync-api-v2)
    │
    ├─ Job: carriersSync (toutes les 5 min)
    │   ├─ Appelle: getAllCarriersWithPagination()
    │   ├─ Pagination: 3 pages (500 + 500 + 367)
    │   ├─ Filtre: Exclut pattern ^C\d+$ (clients)
    │   ├─ Enrichissement: Par batch de 10
    │   └─ Sauvegarde: MongoDB collection 'carriers'
    │
    └─ Endpoint: GET /api/v1/tms/carriers
        └─ Retourne: Liste complète des carriers

Frontend (transporteur.symphonia-controltower.com)
    │
    └─ Page: /carriers
        ├─ Appelle: TMS Sync API CloudFront
        └─ Affiche: Liste importable des transporteurs
```

---

## 📝 CHECKLIST DE CONFIGURATION

- [ ] 1. Obtenir le token API Dashdoc
- [ ] 2. Se connecter à MongoDB Compass
- [ ] 3. Ouvrir la database `rt-tms-sync`
- [ ] 4. Créer/vérifier la collection `tmsConnections`
- [ ] 5. Insérer le document de connexion avec le token
- [ ] 6. Vérifier `isActive: true` et `connectionStatus: "connected"`
- [ ] 7. Lancer le test de connexion (healthCheck)
- [ ] 8. Déclencher manuellement le job carriersSync
- [ ] 9. Attendre 15-20 minutes
- [ ] 10. Vérifier le nombre de carriers (attendu: ~1365)
- [ ] 11. Tester le frontend
- [ ] 12. Vérifier que le job auto s'exécute toutes les 5 minutes

---

## ⚠️ POINTS D'ATTENTION

### 1. Token API Dashdoc

Le token doit avoir les permissions suivantes:
- ✅ Lecture des companies (carriers)
- ✅ Lecture des transports
- ✅ Lecture des statistiques

### 2. Filtre Remote ID

Le filtre `^C\d+$` est actif et exclut automatiquement les clients (donneurs d'ordre).

**Exemple:**
- `C10006` → **Exclu** (client "1 UP")
- `S70392` → **Inclus** (carrier "2CS TRANSPORTS")
- `CF30078` → **Inclus** (carrier "2BMoved")

### 3. Performance

La première synchronisation prend **15-20 minutes** :
- Pagination: 3 pages × 500ms = 1.5s
- Enrichissement: 1365 carriers ÷ 10 (batch) × 200ms = 27s
- Stats API: 1365 × ~500ms = **~11 minutes**

Les syncs suivants sont plus rapides (mise à jour uniquement).

### 4. Intervalle du Job

Le job `carriersSync` s'exécute actuellement toutes les **5 minutes**.

**Recommandation:** Augmenter à **15 minutes** pour éviter les overlaps:

```javascript
// scheduled-jobs.js ligne 13
const INTERVALS = {
  CARRIERS_SYNC: 15 * 60 * 1000,  // 15 minutes (au lieu de 5)
};
```

---

## 🎯 RÉSULTAT ATTENDU

**Avant configuration:**
```json
{
  "success": true,
  "total": 0,
  "carriers": []
}
```

**Après configuration et sync:**
```json
{
  "success": true,
  "total": 1365,
  "carriers": [
    {
      "companyName": "2BMoved",
      "siret": "87766039900024",
      "totalOrders": 20,
      "vigilance": { "score": 56, "level": "N2 - Guest" }
    },
    {
      "companyName": "2CS TRANSPORTS",
      "siret": "44964403800068",
      "totalOrders": 20,
      "vigilance": { "score": 56, "level": "N2 - Guest" }
    },
    ...1363 autres transporteurs
  ]
}
```

---

*Document créé le 30 janvier 2026 - Claude Code*
