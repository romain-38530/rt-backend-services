# Implémentation Pricing & Market Intelligence ✅

## 📦 Fichiers créés

### Modèles
- ✅ `models/PriceHistory.js` - Modèle MongoDB historique des prix (327 lignes)
  - Collections avec index optimisés
  - Méthodes statiques pour récupération historique
  - Calcul prix moyens et sous-traitants

### Services
- ✅ `services/pricing.service.js` - Service de pricing avec Dashdoc (410 lignes)
  - Récupération historique prix
  - Sous-traitants préférés
  - Import Dashdoc API v4
  - Calcul prix cible négociation
  - Recherche transporteurs

### Contrôleurs & Routes
- ✅ `controllers/affretia.controller.js` - 6 nouveaux endpoints ajoutés
- ✅ `routes/affretia.routes.js` - Routes pricing configurées

### Scripts
- ✅ `scripts/import-dashdoc-history.js` - Script CLI import Dashdoc (130 lignes)

### Documentation
- ✅ `docs/PRICING-API.md` - Documentation complète API (450 lignes)
- ✅ `.env.example` - Variables d'environnement mises à jour

---

## 🎯 Endpoints implémentés

### 1. **POST** `/api/v1/affretia/price-history`
Récupère l'historique des prix pour une ligne.

**Usage:**
```javascript
const history = await axios.post('/api/v1/affretia/price-history', {
  route: { from: '75000', to: '69000' },
  period: 'last_6_months'
});
// Retourne: averagePrice, priceRange, transactionCount, history[]
```

### 2. **GET** `/api/v1/affretia/preferred-subcontractors`
Liste des sous-traitants référencés avec prix moyens.

**Usage:**
```javascript
const subs = await axios.get('/api/v1/affretia/preferred-subcontractors', {
  params: { industrielId: 'abc123', fromPostalCode: '75000', toPostalCode: '69000' }
});
// Retourne: subcontractors[], avgPrice, totalTransports
```

### 3. **POST** `/api/v1/affretia/search-carriers`
Recherche transporteurs avec priorisation sous-traitants.

**Usage:**
```javascript
const carriers = await axios.post('/api/v1/affretia/search-carriers', {
  route: { from: '75000', to: '69000' },
  requirements: {
    prioritizeSubcontractors: true,
    priceReference: 420
  }
});
// Retourne: carriers[] avec isPreferred, historicalAvgPrice
```

### 4. **POST** `/api/v1/affretia/record-price`
Enregistre un prix négocié dans l'historique MongoDB.

**Usage:**
```javascript
await axios.post('/api/v1/affretia/record-price', {
  orderId: 'ORD-123',
  carrierId: 'carrier-001',
  route: { from: '75000', to: '69000' },
  price: 415,
  proposedPrice: 450,
  marketAverage: 420,
  negotiationRounds: 2
});
// Retourne: priceId, deviation%
```

### 5. **POST** `/api/v1/affretia/import/dashdoc`
Importe l'historique depuis Dashdoc API v4.

**Usage:**
```javascript
await axios.post('/api/v1/affretia/import/dashdoc', {
  startDate: '2025-08-01',
  endDate: '2026-02-01',
  organizationId: 'industriel-001'
});
// Retourne: imported, skipped, errors[]
```

### 6. **POST** `/api/v1/affretia/calculate-target-price`
Calcule le prix cible (±10% du marché).

**Usage:**
```javascript
const target = await axios.post('/api/v1/affretia/calculate-target-price', {
  route: { from: '75000', to: '69000' },
  vehicleType: 'SEMI'
});
// Retourne: targetPrice, priceRange{min, max}, confidence
```

---

## 🔧 Intégration Dashdoc

### Configuration

**1. Obtenir clé API Dashdoc**
- Aller sur: https://app.dashdoc.com/app/settings/api
- Créer un token API avec permissions `transports:read`
- Copier la clé dans `.env`

**2. Variables d'environnement**
```bash
DASHDOC_API_KEY=dashdoc_sk_...
DASHDOC_API_URL=https://api.dashdoc.com/api/v4
```

### Import CLI

```bash
# Import 6 derniers mois
node scripts/import-dashdoc-history.js

# Options avancées
node scripts/import-dashdoc-history.js --months 12 --org-id industriel-001

# Mode test (sans écriture)
node scripts/import-dashdoc-history.js --dry-run
```

### Mapping Dashdoc → MongoDB

| Champ Dashdoc | Champ Symphonia |
|---------------|-----------------|
| `origin.address.postcode` | `route.from.postalCode` |
| `destination.address.postcode` | `route.to.postalCode` |
| `carrier.pk` | `carrierId` |
| `carrier.name` | `carrierName` |
| `pricing.invoicing_amount` | `price.final` |
| `vehicle_type` | `transport.vehicleType` |
| `weight_kg` | `transport.weight` |
| `pallets_count` | `transport.palettes` |

---

## 📊 Modèle de données MongoDB

### Collection: `pricehistories`

```javascript
{
  _id: ObjectId,
  orderId: String,
  carrierId: String,
  carrierName: String,

  route: {
    from: { city: String, postalCode: String },
    to: { city: String, postalCode: String }
  },

  price: {
    proposed: Number,      // Prix proposé initial
    final: Number,         // Prix final négocié
    marketAverage: Number, // Prix moyen marché
    currency: String       // EUR
  },

  transport: {
    vehicleType: String,   // VUL | 12T | 19T | SEMI
    weight: Number,
    volume: Number,
    palettes: Number,
    distance: Number
  },

  negotiation: {
    rounds: Number,
    method: String,        // auto | manual | direct
    deviation: Number      // % écart vs prix moyen
  },

  dashdocImport: {
    imported: Boolean,
    transportId: String,
    importedAt: Date,
    source: String         // dashdoc | manual | api
  },

  organizationId: String,
  status: String,          // completed | cancelled | pending
  completedAt: Date,
  createdAt: Date
}
```

### Index MongoDB

```javascript
// Pour recherches rapides
{ 'route.from.postalCode': 1, 'route.to.postalCode': 1, completedAt: -1 }
{ organizationId: 1, completedAt: -1 }
{ carrierId: 1, completedAt: -1 }
```

---

## 🚀 Workflow de négociation

### Algorithme implémenté

```
1. Récupérer prix moyen marché pour la ligne
   → avgMarketPrice = 420€

2. Calculer fourchette acceptable (±10%)
   → minAcceptable = 378€ (420 - 10%)
   → maxAcceptable = 462€ (420 + 10%)

3. Négociation automatique
   Si proposedPrice > maxAcceptable:
     → Réduire de 50% de l'écart
     → counterOffer = proposedPrice - ((proposedPrice - avgMarketPrice) * 0.5)

   Si proposedPrice < minAcceptable:
     → Augmenter de 30% de l'écart
     → counterOffer = proposedPrice + ((avgMarketPrice - proposedPrice) * 0.3)

4. Acceptation si dans la fourchette
   → minAcceptable ≤ finalPrice ≤ maxAcceptable

5. Enregistrer dans MongoDB
   → Record avec deviation%
```

### Exemple concret

```
Prix moyen marché: 420€
Fourchette: 378€ - 462€

Transporteur propose: 480€ (trop élevé)
→ Écart: 60€ (480 - 420)
→ Contre-offre: 450€ (480 - 30€)
→ Round 2: 435€
→ Accepté! (dans la fourchette)

Enregistrement:
  - proposedPrice: 480€
  - finalPrice: 435€
  - marketAverage: 420€
  - deviation: +3.6%
  - negotiationRounds: 2
```

---

## ✅ Tests de validation

### 1. Test endpoints

```bash
# Démarrer le serveur
cd services/affret-ia-api-v2
npm run dev

# Terminal 2: Tester
curl -X POST http://localhost:3017/api/v1/affretia/price-history \
  -H "Content-Type: application/json" \
  -d '{"route":{"from":"75000","to":"69000"},"period":"last_6_months"}'
```

### 2. Test import Dashdoc

```bash
# Mode dry-run
node scripts/import-dashdoc-history.js --dry-run

# Import réel (après validation dry-run)
node scripts/import-dashdoc-history.js --months 6
```

### 3. Test E2E complet

```bash
cd scripts
node test-e2e-grandeur-nature.cjs
```

**Vérifier Phase 7:**
- ✅ Historique prix récupéré
- ✅ Sous-traitants prioritaires identifiés
- ✅ Scraping avec référence prix
- ✅ Prix négociés enregistrés

---

## 📈 Métriques & Monitoring

### Requêtes MongoDB à surveiller

```javascript
// Performance des recherches
db.pricehistories.find({
  'route.from.postalCode': '75000',
  'route.to.postalCode': '69000',
  completedAt: { $gte: ISODate('2025-08-01') }
}).explain('executionStats')

// Sous-traitants par organisation
db.pricehistories.aggregate([
  { $match: { organizationId: 'abc123' } },
  { $group: {
      _id: '$carrierId',
      count: { $sum: 1 },
      avgPrice: { $avg: '$price.final' }
    }
  },
  { $sort: { count: -1 } }
])
```

### Logs à surveiller

```bash
# Négociations
[PRICING SERVICE] Prix enregistré: 435€ pour carrier-001

# Import Dashdoc
[PRICING SERVICE] 156 transports récupérés depuis Dashdoc
[PRICING SERVICE] Import terminé: 156 importés, 12 ignorés
```

---

## 🔄 Maintenance

### Import périodique Dashdoc

**Cron mensuel** (1er de chaque mois à 3h):
```cron
0 3 1 * * cd /path/to/affret-ia-api-v2 && node scripts/import-dashdoc-history.js --months 1 >> logs/dashdoc-import.log 2>&1
```

### Nettoyage historique ancien

```javascript
// Supprimer prix > 2 ans
db.pricehistories.deleteMany({
  completedAt: { $lt: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000) }
})
```

---

## 📚 Documentation complète

- **API complète**: `docs/PRICING-API.md` (450 lignes)
- **Configuration**: `.env.example`
- **Script import**: `scripts/import-dashdoc-history.js`

---

## 🎉 Résumé

✅ **6 nouveaux endpoints** opérationnels
✅ **Intégration Dashdoc** API v4 complète
✅ **Modèle MongoDB** optimisé avec index
✅ **Service de pricing** avec 8 méthodes
✅ **Négociation automatique** vers prix marché (±10%)
✅ **Priorisation sous-traitants** référencés
✅ **Script CLI** pour import historique
✅ **Documentation** exhaustive (450+ lignes)
✅ **Test E2E** compatible Phase 7

---

## 🚀 Prochaines étapes

1. **Déployer** sur environnement staging
2. **Configurer** DASHDOC_API_KEY
3. **Lancer** import initial (6 mois)
4. **Tester** endpoints avec test E2E
5. **Monitorer** performances MongoDB
6. **Configurer** cron mensuel
7. **Déployer** en production

---

*Implémentation terminée le 02/02/2026*
*Documentation: Claude Sonnet 4.5*
