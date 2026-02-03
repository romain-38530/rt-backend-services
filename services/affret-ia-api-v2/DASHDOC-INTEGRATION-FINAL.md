# Intégration Dashdoc API - Documentation Finale

## Résumé

L'intégration Dashdoc API pour Affret.IA permet d'importer **8371 affrètements** avec les informations suivantes :
- Routes réalisées (origine → destination)
- Nombre de palettes et poids
- Prix sous-traitants
- Informations complètes des transporteurs + contacts pour sollicitation Affret.IA

## Configuration Correcte

### URL et Authentification

```javascript
// ✅ CORRECT
const BASE_URL = 'https://api.dashdoc.eu/api/v4';  // .EU, pas .com !
const headers = {
  'Authorization': `Token ${API_KEY}`,  // Token, pas Bearer
  'Content-Type': 'application/json'
};
```

### Filtre pour récupérer les 8371 affrètements

```javascript
const params = {
  business_status: 'orders',  // Affrètements uniquement
  archived: false,            // Non archivés
  status: 'done',             // Terminés (optionnel)
  page_size: 100              // Pagination
};
```

## Structure de Données Dashdoc

### Données au niveau racine

```json
{
  "uid": "019c18b4-fcfc-775a-b63a-a228046b25b8",
  "status": "done",
  "agreed_price_total": "12.00",
  "effective_price_total": "12.00",
  "pricing_total_price": "12.00",
  "purchase_cost_total": null,
  "currency": "EUR",
  "estimated_distance": 10.28,
  "requested_vehicle": "truck_19t",
  "carrier_address": {
    "company": {
      "pk": 3991213,
      "name": "MENIER TRANSPORTS",
      "trade_number": "89823001600021",
      "phone_number": "+33678378662"
    },
    "city": "Saint-Priest",
    "postcode": "69800"
  },
  "deliveries": [...]
}
```

### Données dans deliveries[0]

```json
{
  "deliveries": [
    {
      "origin": {
        "address": {
          "city": "Saint-Georges-d'Espéranche",
          "postcode": "38790"
        }
      },
      "destination": {
        "address": {
          "city": "Saint-Quentin-Fallavier",
          "postcode": "38070"
        }
      },
      "loads": [
        {
          "quantity": 29,      // Palettes
          "weight": 19040,     // Poids en kg
          "volume": null,      // Volume en m³
          "category": "pallets"
        }
      ],
      "tracking_contacts": [
        {
          "role": "carrier",
          "contact": {
            "company": {
              "pk": 3991213,
              "name": "MENIER TRANSPORTS",
              "trade_number": "89823001600021"
            },
            "first_name": "Mohamed",
            "last_name": "SOLTANI",
            "email": "elbad69@hotmail.fr",
            "phone_number": "+33678378662"
          }
        }
      ]
    }
  ]
}
```

## Méthodes d'Extraction Refactorisées

### 1. extractCarrierPrice()

**Ancienne version** (❌ Ne fonctionnait pas) :
```javascript
// Cherchait dans transport.charter.price, transport.subcontracting.price
// Ces champs n'existent PAS dans la structure Dashdoc
```

**Nouvelle version** (✅ Fonctionne) :
```javascript
extractCarrierPrice(transport) {
  // Priorité 1: purchase_cost_total (coût d'achat)
  if (transport.purchase_cost_total) {
    return {
      price: parseFloat(transport.purchase_cost_total),
      currency: transport.currency || 'EUR',
      source: 'purchase_cost_total',
      found: true
    };
  }

  // Priorité 2: agreed_price_total (prix convenu)
  if (transport.agreed_price_total) {
    return {
      price: parseFloat(transport.agreed_price_total),
      currency: transport.currency || 'EUR',
      source: 'agreed_price_total',
      found: true
    };
  }

  // Priorité 3: effective_price_total
  // Priorité 4: pricing_total_price
  // Priorité 5: quotation_total_price
  // Fallback: invoiced_price_total
}
```

### 2. extractCarrierInfo()

**Ancienne version** (❌ Ne fonctionnait pas) :
```javascript
// Cherchait dans transport.charter.carrier, transport.carrier
// Ces champs sont null ou incomplets
```

**Nouvelle version** (✅ Fonctionne) :
```javascript
extractCarrierInfo(transport) {
  let carrierData = null;
  let contactData = null;

  // Priorité 1: carrier_address (infos entreprise)
  if (transport.carrier_address?.company) {
    carrierData = {
      pk: transport.carrier_address.company.pk,
      name: transport.carrier_address.company.name,
      siren: transport.carrier_address.company.trade_number,
      phone: transport.carrier_address.company.phone_number,
      address: {
        city: transport.carrier_address.city,
        postalCode: transport.carrier_address.postcode
      }
    };
  }

  // Priorité 2: tracking_contacts (contact du transporteur)
  const delivery = transport.deliveries?.[0];
  const trackingContact = delivery?.tracking_contacts?.find(tc => tc.role === 'carrier');

  if (trackingContact?.contact) {
    contactData = {
      email: trackingContact.contact.email,
      phone: trackingContact.contact.phone_number,
      firstName: trackingContact.contact.first_name,
      lastName: trackingContact.contact.last_name
    };
  }

  // Fusionner données carrier + contact
  return {
    ...carrierData,
    email: contactData?.email || carrierData.email,
    phone: contactData?.phone || carrierData.phone,
    contact: contactData
  };
}
```

### 3. Extraction Route et Cargo (dans importFromDashdoc())

**Ancienne version** (❌ Ne fonctionnait pas) :
```javascript
const pickupAddress = transport.origin?.address;       // null
const deliveryAddress = transport.destination?.address; // null
const palettes = transport.pallets_count;              // undefined
const weight = transport.weight_kg;                    // undefined
```

**Nouvelle version** (✅ Fonctionne) :
```javascript
// Extraire delivery
const delivery = transport.deliveries?.[0];

// Extraire adresses
const pickupAddress = delivery.origin?.address;
const deliveryAddress = delivery.destination?.address;

// Extraire cargo
const loads = delivery.loads?.[0];
const palettes = loads?.quantity || 0;
const weight = loads?.weight || 0;
const volume = loads?.volume || 0;
```

## Résultats des Tests

### Test avec 10 affrètements terminés (status=done)

**Avant refactorisation** : ❌ 0/10 valides
**Après refactorisation** : ✅ 10/10 valides

Exemple de données extraites :

| Transport | Route | Palettes | Poids | Prix | Transporteur | Contact |
|-----------|-------|----------|-------|------|--------------|---------|
| 019c18b4 | 38790 → 38070 | 29 | 19040 kg | 12€ | MENIER TRANSPORTS | Mohamed SOLTANI, elbad69@hotmail.fr |
| 019c0f09 | 30800 → 01380 | 53 | 13200 kg | 420€ | ESCAFFIT | CHRISTOPHE ESCAFFIT, escaffittransport@gmail.com |
| 019c0b07 | 01470 → 74800 | 33 | 25040 kg | 1600€ | CARERAS SRL | MARIUS BLAJ, traficocareras@yahoo.com |

## Modèle de Données MongoDB (PriceHistory)

```javascript
{
  orderId: 'DASHDOC-019c18b4-fcfc-775a-b63a-a228046b25b8',
  carrierId: 'dashdoc-3991213',
  carrierName: 'MENIER TRANSPORTS',
  carrierEmail: 'elbad69@hotmail.fr',         // ✅ Pour sollicitation Affret.IA
  carrierPhone: '+33678378662',               // ✅ Pour sollicitation Affret.IA
  carrierSiren: '89823001600021',             // ✅ Identifiant entreprise
  carrierContact: {
    firstName: 'Mohamed',
    lastName: 'SOLTANI',
    email: 'elbad69@hotmail.fr',
    phone: '+33678378662'
  },
  route: {
    from: {
      city: 'Saint-Georges-d\'Espéranche',
      postalCode: '38790'
    },
    to: {
      city: 'Saint-Quentin-Fallavier',
      postalCode: '38070'
    }
  },
  price: {
    proposed: 12,
    final: 12,
    currency: 'EUR'
  },
  transport: {
    vehicleType: '19T',
    weight: 19040,
    volume: 0,
    palettes: 29,
    distance: 10.28
  },
  dashdocImport: {
    imported: true,
    transportId: '019c18b4-fcfc-775a-b63a-a228046b25b8',
    importedAt: '2026-02-03T...',
    source: 'dashdoc',
    priceSource: 'agreed_price_total',
    carrierSource: 'carrier_address'
  },
  status: 'completed',
  completedAt: '2026-02-02T...'
}
```

## Intelligence de Négociation Affret.IA

### Fonctionnalité : getBestCarrierPrice()

Quand un transporteur a réalisé plusieurs fois la même route avec des prix différents :

✅ **Retenir TOUS les prix** (historique complet)
✅ **Proposer le PRIX LE PLUS BAS** dans Affret.IA
✅ **Inclure la DATE** du meilleur prix

```javascript
async getBestCarrierPrice(carrierId, fromPostalCode, toPostalCode) {
  const history = await PriceHistory.find({
    carrierId,
    'route.from.postalCode': fromPostalCode,
    'route.to.postalCode': toPostalCode,
    status: 'completed'
  })
  .sort({ 'price.final': 1 })  // Trier par prix croissant
  .limit(10);

  const bestPrice = history[0];

  return {
    found: true,
    bestPrice: bestPrice.price.final,
    bestPriceDate: bestPrice.completedAt,
    totalTransports: history.length,
    negotiationArgument: `Vous avez réalisé ${history.length} fois cette route, dont une à ${bestPrice.price.final}€ le ${new Date(bestPrice.completedAt).toLocaleDateString('fr-FR')}`
  };
}
```

**Exemple de négociation** :
> "Bonjour M. Soltani, vous avez déjà réalisé 5 fois la route Saint-Georges → Saint-Quentin-Fallavier, dont une à **12€ le 02/02/2026**. Pouvez-vous me proposer un tarif similaire pour cette nouvelle commande ?"

## Déploiement

### 1. Variables d'Environnement AWS Elastic Beanstalk

```bash
DASHDOC_API_URL=https://api.dashdoc.eu/api/v4
DASHDOC_API_KEY=8321c7a8f7fe8f75192fa15a6c883a11758e0084
```

### 2. Fichiers Modifiés

| Fichier | Lignes Modifiées | Changements |
|---------|------------------|-------------|
| `services/pricing.service.js` | 16-89 | Refactorisation `extractCarrierPrice()` |
| `services/pricing.service.js` | 91-168 | Refactorisation `extractCarrierInfo()` |
| `services/pricing.service.js` | 381-452 | Extraction route/cargo depuis `deliveries[0]` |

### 3. Scripts de Test

| Script | Objectif | Résultat |
|--------|----------|----------|
| `scripts/test-dashdoc-BONNE-URL.js` | Valider URL et authentification | ✅ 3/3 tests réussis |
| `scripts/test-dashdoc-affretements.js` | Valider filtre `business_status=orders` | ✅ 8371 affrètements trouvés |
| `scripts/test-import-dashdoc-new-structure.js` | Valider nouvelle extraction | ✅ 10/10 affrètements valides |

### 4. Commandes de Déploiement

```bash
# Test local
cd services/affret-ia-api-v2
node scripts/test-import-dashdoc-new-structure.js

# Déploiement AWS EB
eb setenv DASHDOC_API_URL=https://api.dashdoc.eu/api/v4
eb setenv DASHDOC_API_KEY=8321c7a8f7fe8f75192fa15a6c883a11758e0084
eb deploy

# Test import production (dry-run)
curl -X POST https://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/pricing/import-dashdoc \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Import réel (8371 affrètements)
curl -X POST https://rt-affret-ia-api-prod-v4.eba-quc9udpr.eu-central-1.elasticbeanstalk.com/api/v1/pricing/import-dashdoc \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

## Résumé Final

✅ **URL correcte** : `https://api.dashdoc.eu` (pas .com)
✅ **Authentification correcte** : `Token` (pas Bearer)
✅ **Filtre optimal** : `business_status=orders&archived=false` (8371 affrètements)
✅ **Extraction fonctionnelle** : Routes, cargo, prix, contacts depuis `deliveries[]`
✅ **Tests validés** : 10/10 affrètements importables
✅ **Intelligence négociation** : Historique complet + argument de négociation avec date

**Prêt pour déploiement en production** 🚀

---

**Auteur** : Claude Sonnet 4.5
**Date** : 2026-02-03
**Version** : 1.0 - Finale
