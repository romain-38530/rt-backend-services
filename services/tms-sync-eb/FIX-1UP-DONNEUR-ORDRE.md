# Fix: Exclusion de "1 UP" (Donneur d'Ordre) des Carriers

**Date:** 30 janvier 2026
**Version déployée:** v2.3.3-FINAL
**Service:** TMS Sync API v2

---

## Problème Identifié

"1 UP" (donneur d'ordre/client) apparaissait dans la liste des carriers/transporteurs alors qu'il s'agit d'un client, pas d'un transporteur.

**Données "1 UP":**
- External ID: 3867700
- Remote ID: **C10006** (pattern client: "C" + chiffres)
- Account Type: invited
- SIRET: 853 926 905 00029
- Dernière sync: 2026-01-30T12:49:03

---

## Analyse du Problème

### 1. Pattern Remote ID Découvert

Après analyse des carriers, le pattern suivant a été identifié:
- **Clients/Donneurs d'ordre**: remoteId = `C\d+` (ex: "C10006")
- **Transporteurs**: remoteId = `S\d+` ou `CF\d+` (ex: "S70392", "CF30078")

### 2. Filtres API Dashdoc Testés

- `is_carrier=true` → **Insuffisant** (retourne aussi des donneurs d'ordre)
- `is_shipper=false` → **Paramètre non supporté** par l'API Dashdoc
- `account_type != 'invited'` → **Trop strict** (exclut TOUS les carriers)

---

## Solutions Implémentées

### ✅ 1. Filtre basé sur Pattern Remote ID

**Fichier:** `connectors/dashdoc.connector.js` (ligne 267-288)

```javascript
async getCarriers(options = {}) {
  const params = new URLSearchParams();
  params.append('is_carrier', 'true');
  params.append('is_shipper', 'false'); // Tenté mais non supporté

  const response = await this.client.get(`/companies/?${params.toString()}`);

  // Filtrer manuellement les donneurs d'ordre par pattern remoteId
  const filteredResults = response.data.results.filter(c => {
    if (c.remote_id && /^C\d+$/.test(c.remote_id)) {
      console.log(`[DASHDOC] Filtering out client: ${c.name} (${c.remote_id})`);
      return false; // Exclure les clients
    }
    return true;
  });

  console.log(`[DASHDOC] Carriers: ${response.data.results.length} from API, ${filteredResults.length} after filtering`);

  return {
    count: filteredResults.length,
    results: filteredResults.map(c => this.mapCarrier(c))
  };
}
```

**Résultat:**
✅ "1 UP" (remoteId: C10006) **N'EST PLUS synchronisé** lors des nouveaux syncs
✅ Les transporteurs (S70392, CF30078) continuent d'être synchronisés

---

### ⚠️ 2. Auto-Cleanup des Carriers Obsolètes

**Fichier:** `scheduled-jobs.js` (ligne 180-190)

```javascript
// Nettoyer les carriers obsolètes (non synchronisés dans les 10 dernières minutes)
const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
const deleteResult = await db.collection('carriers').deleteMany({
  externalSource: 'dashdoc',
  lastSyncAt: { $lt: tenMinutesAgo }
});

if (deleteResult.deletedCount > 0) {
  console.log(`🗑️  [CRON CARRIERS] Removed ${deleteResult.deletedCount} obsolete carriers`);
}
```

**Statut:** ⚠️ **Implémenté mais non testé** - Le cleanup automatique ne semble pas s'exécuter correctement
**Action requise:** Debug du job scheduled pour vérifier pourquoi le cleanup ne supprime pas "1 UP"

---

### ✅ 3. Version Dynamique depuis package.json

**Fichier:** `index.js` (ligne 26-28)

```javascript
const packageJson = require('./package.json');
const VERSION = packageJson.version;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: VERSION, // Au lieu de '2.3.0' hardcodé
    // ...
  });
});
```

**Résultat:**
✅ Version affichée correctement: **2.3.3**

---

## Vérification du Fix

### Test 1: Sync Manual
```bash
curl -X POST http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/jobs/carriersSync/run
# {"success":true,"job":"carriersSync","executedAt":"2026-01-30T13:53:06.089Z"}
```

### Test 2: Vérifier les lastSyncAt
```bash
curl -s "http://rt-tms-sync-api-v2.eba-gpxm3qif.eu-central-1.elasticbeanstalk.com/api/v1/tms/carriers" | grep lastSyncAt

# Résultat:
# "1 UP":           lastSyncAt: "2026-01-30T12:49:03.154Z" ❌ (NON mis à jour = exclu)
# "2BMoved":        lastSyncAt: "2026-01-30T13:53:06.xxx" ✅ (mis à jour)
# "2CS TRANSPORTS": lastSyncAt: "2026-01-30T13:53:06.xxx" ✅ (mis à jour)
```

**Conclusion:**
✅ Le filtre fonctionne! "1 UP" n'est plus synchronisé lors des nouveaux syncs.
⚠️ Mais il reste en base car le cleanup automatique ne s'exécute pas.

---

## Suppression Manuelle de "1 UP"

En attendant que le cleanup automatique soit debuggé, suppression manuelle:

### Option 1: Via MongoDB Compass
```
Collection: carriers
Filter: { externalId: "3867700", companyName: "1 UP" }
Action: Delete Document
```

### Option 2: Via mongosh
```bash
mongosh "mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/symphonia" \
  --eval "db.carriers.deleteOne({ externalId: '3867700' })"
```

### Option 3: Via Script Node.js
```bash
cd services/tms-sync-eb
node cleanup-obsolete-carriers.js
```

---

## Déploiements Effectués

| Version | Description | Status |
|---------|-------------|--------|
| v2.3.1-carrier-filter-fix | is_shipper=false + account_type filter | ❌ Trop strict |
| v2.3.2-remote-id-filter | Pattern remoteId ^C\d+$ | ✅ Filtre OK |
| v2.3.3-auto-cleanup | + Auto cleanup obsolètes | ⚠️ Cleanup non testé |
| v2.3.3-final | + account_type filter removed | ⚠️ Cleanup KO |
| **v2.3.3-FINAL** | + Version dynamique | ✅ **DEPLOYED** |

---

## Actions Suivantes

### Priorité 1: Cleanup Automatique
- [ ] Debug du job `runCarriersSync()` pour vérifier l'exécution du cleanup
- [ ] Vérifier les logs CloudWatch: `/aws/elasticbeanstalk/rt-tms-sync-api-v2/var/log/nodejs/nodejs.log`
- [ ] Ajouter un endpoint de test: `POST /api/v1/debug/cleanup-obsolete-carriers`

### Priorité 2: Validation Pattern Remote ID
- [ ] Valider avec plus de données que le pattern `^C\d+$` = clients
- [ ] Documenter tous les patterns observés dans Dashdoc
- [ ] Contacter support Dashdoc pour confirmer le pattern

### Priorité 3: Monitoring
- [ ] Ajouter une métrique CloudWatch pour les carriers exclus
- [ ] Alerter si nombre de carriers diminue brutalement
- [ ] Dashboard pour visualiser les syncs/cleanups

---

## Fichiers Modifiés

1. **connectors/dashdoc.connector.js** (lignes 267-288)
   - Ajout filtre pattern remoteId

2. **scheduled-jobs.js** (lignes 180-190)
   - Ajout cleanup automatique carriers obsolètes

3. **index.js** (lignes 26-28, 111, 139)
   - Version dynamique depuis package.json

4. **package.json** (ligne 3)
   - Version: 2.2.0 → 2.3.3

---

## Résumé

✅ **Fix déployé et fonctionnel:**
- "1 UP" et autres clients (pattern `C\d+`) ne sont plus synchronisés

⚠️ **Problème résiduel:**
- Le cleanup automatique ne supprime pas les carriers obsolètes déjà en base
- "1 UP" reste visible jusqu'à suppression manuelle

💡 **Recommandation:**
Suppression manuelle de "1 UP" via MongoDB en attendant le debug du cleanup automatique.

---

*Généré le 30 janvier 2026 - Claude Code*
