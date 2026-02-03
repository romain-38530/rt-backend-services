# Intégration du Système de Synchronisation Affret.IA → Dashdoc

## Vue d'ensemble

Ce système permet de mettre à jour automatiquement les transports dans Dashdoc lorsqu'une commande est affectée par Affret.IA, incluant:
- Transporteur assigné
- Prix de vente et prix d'achat
- Moyens de transport (véhicule, chauffeur, remorque)
- Statut (passage à 'assigned')

---

## Fichiers Créés

```
services/tms-sync-eb/
├── connectors/
│   └── dashdoc-update.connector.js          ← Connecteur PATCH/PUT Dashdoc
├── services/
│   └── affretia-dashdoc-sync.service.js    ← Service de synchronisation
├── event-listeners/
│   └── affretia-events.js                   ← Listeners d'événements
├── routes/
│   └── affretia-sync.routes.js              ← Routes API
└── INTEGRATION-AFFRETIA-SYNC.md             ← Ce fichier
```

---

## Étape 1: Intégration dans index.js

### 1.1 Ajouter les imports

**Fichier**: `index.js` (ligne ~25, après les imports existants)

```javascript
const AffretIAEventListeners = require('./event-listeners/affretia-events');
const affretIASyncRoutes = require('./routes/affretia-sync.routes');
```

---

### 1.2 Initialiser le service au démarrage

**Fichier**: `index.js` (dans la fonction `connectMongoDB`, après ligne ~66)

```javascript
async function connectMongoDB() {
  // ... code existant ...

  console.log('Connected to MongoDB');

  // NOUVEAU: Initialiser le service de sync Affret.IA → Dashdoc
  try {
    const affretIAListeners = new AffretIAEventListeners(null); // null car pas de WebSocket ici
    await affretIAListeners.initialize();
    console.log('[Affret.IA Sync] Service initialized');
  } catch (error) {
    console.error('[Affret.IA Sync] Failed to initialize:', error);
  }

  return true;
}
```

---

### 1.3 Ajouter les routes API

**Fichier**: `index.js` (après les routes existantes, ligne ~600)

```javascript
// Routes Affret.IA synchronization
app.use('/api/v1/tms/affretia-sync', requireAuth, affretIASyncRoutes);
```

---

## Étape 2: Intégration dans Affret.IA API

### 2.1 Ajouter l'appel webhook après l'événement carrier.assigned

**Fichier**: `services/affret-ia-api-v2/controllers/affretia.controller.js`
**Ligne**: ~1091-1096 (après l'émission de l'événement)

```javascript
// Émettre événement carrier.assigned
global.emitEvent?.('carrier.assigned', {
  orderId: session.orderId,
  carrierId: session.selection.carrierId,
  price: session.selection.finalPrice,
  sessionId
});

// NOUVEAU: Appeler le webhook de synchronisation Dashdoc
try {
  const axios = require('axios');

  await axios.post(
    `${process.env.TMS_SYNC_API_URL || 'http://localhost:3008'}/api/v1/tms/affretia-sync/webhook`,
    {
      eventName: 'carrier.assigned',
      data: {
        orderId: session.orderId,
        carrierId: session.selection.carrierId,
        price: session.selection.finalPrice,
        sessionId
      }
    },
    {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TMS_SYNC_API_TOKEN}`
      }
    }
  );

  console.log(`[Affret.IA] Webhook synchronisation Dashdoc envoyé`);
} catch (error) {
  console.error(`[Affret.IA] Erreur envoi webhook synchronisation:`, error.message);
  // Ne pas bloquer l'affectation si le webhook échoue
}
```

---

### 2.2 Configurer les variables d'environnement

**Fichier**: `services/affret-ia-api-v2/.env`

```bash
# TMS Sync API URL
TMS_SYNC_API_URL=http://localhost:3008
TMS_SYNC_API_TOKEN=votre_token_jwt_ici

# (Ou en production)
TMS_SYNC_API_URL=https://symphonia-tms-sync-prod.eba-siqpd4ua.eu-west-3.elasticbeanstalk.com
```

**Fichier**: `services/tms-sync-eb/.env`

```bash
# Affret.IA API URL
AFFRET_IA_API_URL=http://localhost:3006/api/v1

# (Ou en production)
AFFRET_IA_API_URL=http://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1
```

---

## Étape 3: Tester la Synchronisation

### 3.1 Test Manuel via API

```bash
# 1. Vérifier le statut du service
curl -X GET http://localhost:3008/api/v1/tms/affretia-sync/status \
  -H "Authorization: Bearer <token>"

# 2. Synchroniser manuellement une commande
curl -X POST http://localhost:3008/api/v1/tms/affretia-sync/manual \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "orderId": "64abc123...",
    "price": 450.00,
    "sellingPrice": 600.00,
    "vehiclePlate": "AB-123-CD",
    "driverEmail": "driver@example.com"
  }'

# 3. Tester avec des données fictives
curl -X POST http://localhost:3008/api/v1/tms/affretia-sync/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "orderId": "64abc123...",
    "carrierId": "64def456...",
    "price": 450.00
  }'
```

---

### 3.2 Test End-to-End

**Scénario complet**:

1. **Créer une commande dans Affret.IA**
   ```bash
   POST /api/v1/affretia/trigger
   ```

2. **Lancer une session d'affretement**
   ```bash
   POST /api/v1/affretia/broadcast
   ```

3. **Soumettre une proposition** (transporteur)
   ```bash
   POST /api/v1/affretia/response
   ```

4. **Assigner le transporteur**
   ```bash
   POST /api/v1/affretia/assign
   ```

5. **Vérifier la synchronisation Dashdoc**
   - Le webhook est automatiquement appelé
   - Logs dans la console TMS Sync
   - Vérifier dans Dashdoc que le transport est mis à jour

---

### 3.3 Vérifier les Logs

**TMS Sync**:
```bash
tail -f logs/tms-sync.log | grep "Affret.IA"
```

**Affret.IA**:
```bash
tail -f logs/affret-ia.log | grep "Webhook"
```

**Filtres de logs**:
```bash
# Voir uniquement les succès
grep "✅" logs/tms-sync.log | grep "Affret.IA"

# Voir uniquement les erreurs
grep "❌" logs/tms-sync.log | grep "Affret.IA"

# Voir les retry
grep "⏳ Retry" logs/tms-sync.log
```

---

## Étape 4: Monitoring et Alertes

### 4.1 Métriques à Surveiller

- **Taux de succès**: % de synchronisations réussies
- **Temps de réponse**: Durée moyenne de synchronisation
- **Taux de retry**: % de syncs nécessitant des retries
- **Erreurs courantes**: Types d'erreurs les plus fréquentes

### 4.2 Créer un Job de Monitoring

**Fichier**: `services/tms-sync-eb/scheduled-jobs.js`

Ajouter un job de monitoring (toutes les 10 minutes):

```javascript
// Monitoring des synchronisations Affret.IA
schedule.scheduleJob('*/10 * * * *', async () => {
  try {
    console.log('[JOB] Monitoring Affret.IA sync...');

    const TMSSyncLog = mongoose.model('TMSSyncLog');

    const last10min = new Date(Date.now() - 10 * 60 * 1000);

    const stats = await TMSSyncLog.aggregate([
      {
        $match: {
          syncType: 'affretia_assignment',
          createdAt: { $gte: last10min }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgDuration: { $avg: '$duration' }
        }
      }
    ]);

    const success = stats.find(s => s._id === 'success')?.count || 0;
    const failed = stats.find(s => s._id === 'failed')?.count || 0;
    const total = success + failed;
    const successRate = total > 0 ? ((success / total) * 100).toFixed(2) : 0;

    console.log(`[JOB] Affret.IA Sync Stats (10 min):`);
    console.log(`  Total: ${total}`);
    console.log(`  Success: ${success}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Success Rate: ${successRate}%`);

    // Alerter si taux d'échec > 20%
    if (total > 0 && (failed / total) > 0.2) {
      console.warn(`[JOB] ⚠️ High failure rate: ${((failed / total) * 100).toFixed(2)}%`);
      // TODO: Envoyer alerte (email, Slack, etc.)
    }

  } catch (error) {
    console.error('[JOB] Error monitoring Affret.IA sync:', error);
  }
});
```

---

## Étape 5: Gestion des Erreurs Courantes

### 5.1 Erreur: "Order not found"

**Cause**: L'order ID n'existe pas dans MongoDB

**Solution**:
- Vérifier que la commande est bien synchronisée depuis Dashdoc
- Attendre que la sync Dashdoc → SYMPHONI.A se termine avant l'affectation

---

### 5.2 Erreur: "Not a Dashdoc order"

**Cause**: La commande ne provient pas de Dashdoc (externalSource ≠ 'dashdoc')

**Solution**:
- Ce n'est pas une erreur critique
- Les commandes non-Dashdoc sont ignorées automatiquement

---

### 5.3 Erreur: "Carrier not from Dashdoc"

**Cause**: Le transporteur n'a pas d'externalId Dashdoc

**Solution**:
- Synchroniser le transporteur depuis Dashdoc d'abord
- Ou créer manuellement le mapping externalId

---

### 5.4 Erreur: "No Dashdoc connector for organization"

**Cause**: Aucune connexion Dashdoc active pour cette organisation

**Solution**:
- Créer une connexion Dashdoc via `/api/v1/tms/connections`
- Vérifier que `status: 'active'`

---

### 5.5 Erreur: "Échec définitif après 3 tentatives"

**Cause**: Dashdoc API injoignable ou erreur persistante

**Solution**:
- Vérifier que Dashdoc API est accessible
- Vérifier le token API Dashdoc
- Vérifier les données (transporteur existe dans Dashdoc?)
- Consulter les logs détaillés

---

## Étape 6: Scalabilité et Performance

### 6.1 Queue Redis pour les Syncs

Pour gérer un volume élevé, utiliser une queue Redis:

**Fichier**: `services/tms-sync-eb/services/sync-queue.service.js`

```javascript
const Bull = require('bull');

const syncQueue = new Bull('affretia-dashdoc-sync', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Worker
syncQueue.process(async (job) => {
  const { orderId, carrierId, price, sessionId } = job.data;

  return await affretIADashdocSyncService.handleCarrierAssigned({
    orderId,
    carrierId,
    price,
    sessionId
  });
});

// Ajouter à la queue
async function queueSync(eventData) {
  await syncQueue.add(eventData, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  });
}
```

---

### 6.2 Batch Processing

Pour synchroniser plusieurs commandes en masse:

```javascript
async function batchSync(orderIds) {
  const results = [];

  for (const orderId of orderIds) {
    const result = await affretIADashdocSyncService.manualSync(orderId);
    results.push({ orderId, ...result });

    // Rate limiting: pause 100ms entre chaque
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}
```

---

## Étape 7: Rollback et Désactivation

### 7.1 Désactiver temporairement la sync

Commentez l'appel webhook dans `affretia.controller.js`:

```javascript
// DÉSACTIVÉ: Appeler le webhook de synchronisation Dashdoc
/*
try {
  await axios.post(...);
} catch (error) {
  ...
}
*/
```

---

### 7.2 Désactiver complètement le service

Dans `index.js`, commentez l'initialisation:

```javascript
/*
// DÉSACTIVÉ: Initialiser le service de sync Affret.IA → Dashdoc
try {
  const affretIAListeners = new AffretIAEventListeners(null);
  await affretIAListeners.initialize();
} catch (error) {
  console.error('[Affret.IA Sync] Failed to initialize:', error);
}
*/
```

---

## Résumé

### Workflow Complet

```
1. Affret.IA assigne un transporteur
   ↓
2. Événement carrier.assigned émis
   ↓
3. Webhook POST /affretia-sync/webhook appelé
   ↓
4. Service récupère order + carrier depuis MongoDB
   ↓
5. Vérification: order.externalSource = 'dashdoc' ?
   ↓
6. Connecteur Dashdoc récupère carrier_address
   ↓
7. PATCH /transports/{uid}/ avec:
   - carrier_address (transporteur)
   - purchase_cost_total (prix d'achat)
   - pricing_total_price (prix de vente)
   - requested_vehicle, assigned_trucker (moyens)
   - status: 'assigned'
   ↓
8. Retry automatique (3x) si échec
   ↓
9. Log du résultat dans TMSSyncLog
   ↓
10. ✅ Transport mis à jour dans Dashdoc
```

### Fichiers à Modifier

1. **`services/tms-sync-eb/index.js`** - Ajouter imports et initialisation
2. **`services/affret-ia-api-v2/controllers/affretia.controller.js`** - Ajouter appel webhook
3. **`services/tms-sync-eb/.env`** - Ajouter AFFRET_IA_API_URL
4. **`services/affret-ia-api-v2/.env`** - Ajouter TMS_SYNC_API_URL

### Endpoints Disponibles

- `POST /api/v1/tms/affretia-sync/manual` - Sync manuelle
- `POST /api/v1/tms/affretia-sync/test` - Test sync
- `POST /api/v1/tms/affretia-sync/webhook` - Webhook événements
- `GET /api/v1/tms/affretia-sync/status` - Statut service

---

**Créé par**: Claude Sonnet 4.5
**Date**: 2026-02-03
**Version**: 1.0
