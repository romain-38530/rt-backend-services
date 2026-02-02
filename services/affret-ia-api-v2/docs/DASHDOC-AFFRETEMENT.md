# Dashdoc - Extraction des prix d'affretement (sous-traitants)

## ⚠️ IMPORTANT: Différence Client vs Sous-traitant

Dans Dashdoc, il y a **DEUX types de prix** :

| Type | Champ Dashdoc | Description | À utiliser ? |
|------|---------------|-------------|--------------|
| **Prix CLIENT** | `pricing.invoicing_amount` | Montant facturé au client final | ❌ **NON** |
| **Prix SOUS-TRAITANT** | `charter.price` ou `subcontracting.price` | Montant payé au transporteur | ✅ **OUI** |

**Pour Affret.IA, nous devons utiliser le prix SOUS-TRAITANT** car c'est le coût réel du transport.

---

## Structure des données Dashdoc

### Transport avec sous-traitance

```json
{
  "uid": "transport-123",
  "status": "done",
  "origin": {
    "address": {
      "city": "Paris",
      "postcode": "75000"
    }
  },
  "destination": {
    "address": {
      "city": "Lyon",
      "postcode": "69000"
    }
  },

  // PRIX CLIENT (NE PAS UTILISER)
  "pricing": {
    "invoicing_amount": 600.00,  // ❌ Prix facturé au CLIENT
    "currency": "EUR"
  },

  // SOUS-TRAITANCE (UTILISER CE PRIX)
  "charter": {
    "carrier": {
      "pk": 456,
      "name": "Transport Express"
    },
    "price": 450.00,  // ✅ Prix payé au SOUS-TRAITANT
    "currency": "EUR"
  },

  // OU alternative
  "subcontracting": {
    "carrier": {
      "pk": 456,
      "name": "Transport Express"
    },
    "purchase_price": 450.00,  // ✅ Prix payé au SOUS-TRAITANT
    "currency": "EUR"
  },

  "vehicle_type": "semi",
  "weight_kg": 5000,
  "distance_km": 450
}
```

### Champs possibles pour le prix sous-traitant

À chercher dans l'ordre de priorité :

1. `charter.price` - Prix de l'affretement
2. `charter.purchase_price` - Prix d'achat
3. `subcontracting.price` - Prix sous-traitance
4. `subcontracting.purchase_price` - Prix d'achat sous-traitance
5. `charter.agreed_price` - Prix convenu
6. `carrier_price` - Prix transporteur (si au niveau racine)

---

## Code d'extraction corrigé

### Fonction pour extraire le prix sous-traitant

```javascript
/**
 * Extrait le prix payé au sous-traitant depuis un transport Dashdoc
 * @param {Object} transport - Transport Dashdoc
 * @returns {Object} { price: Number, currency: String, found: Boolean }
 */
function extractCarrierPrice(transport) {
  // Priorité 1: charter.price
  if (transport.charter?.price) {
    return {
      price: transport.charter.price,
      currency: transport.charter.currency || 'EUR',
      source: 'charter.price',
      found: true
    };
  }

  // Priorité 2: charter.purchase_price
  if (transport.charter?.purchase_price) {
    return {
      price: transport.charter.purchase_price,
      currency: transport.charter.currency || 'EUR',
      source: 'charter.purchase_price',
      found: true
    };
  }

  // Priorité 3: subcontracting.price
  if (transport.subcontracting?.price) {
    return {
      price: transport.subcontracting.price,
      currency: transport.subcontracting.currency || 'EUR',
      source: 'subcontracting.price',
      found: true
    };
  }

  // Priorité 4: subcontracting.purchase_price
  if (transport.subcontracting?.purchase_price) {
    return {
      price: transport.subcontracting.purchase_price,
      currency: transport.subcontracting.currency || 'EUR',
      source: 'subcontracting.purchase_price',
      found: true
    };
  }

  // Priorité 5: pricing.carrier_price (au cas où)
  if (transport.pricing?.carrier_price) {
    return {
      price: transport.pricing.carrier_price,
      currency: transport.pricing.currency || 'EUR',
      source: 'pricing.carrier_price',
      found: true
    };
  }

  // Fallback: pricing.invoicing_amount (avec warning)
  if (transport.pricing?.invoicing_amount) {
    console.warn(`⚠️ [DASHDOC] Transport ${transport.uid}: Utilisation de invoicing_amount car pas de prix sous-traitant trouvé`);
    return {
      price: transport.pricing.invoicing_amount,
      currency: transport.pricing.currency || 'EUR',
      source: 'pricing.invoicing_amount (FALLBACK)',
      found: false
    };
  }

  // Aucun prix trouvé
  return {
    price: null,
    currency: 'EUR',
    source: 'none',
    found: false
  };
}

/**
 * Extrait les informations du transporteur sous-traitant
 */
function extractCarrierInfo(transport) {
  // Priorité: charter > subcontracting > carrier
  if (transport.charter?.carrier) {
    return {
      pk: transport.charter.carrier.pk,
      name: transport.charter.carrier.name || 'Transporteur',
      source: 'charter'
    };
  }

  if (transport.subcontracting?.carrier) {
    return {
      pk: transport.subcontracting.carrier.pk,
      name: transport.subcontracting.carrier.name || 'Transporteur',
      source: 'subcontracting'
    };
  }

  if (transport.carrier) {
    return {
      pk: transport.carrier.pk,
      name: transport.carrier.name || 'Transporteur',
      source: 'carrier'
    };
  }

  return null;
}
```

---

## Filtrage des transports sous-traités

### Option 1: Filtrer lors de l'appel API

```javascript
const response = await axios.get(`${DASHDOC_API_URL}/transports/`, {
  headers: {
    'Authorization': `Bearer ${DASHDOC_API_KEY}`,
    'Content-Type': 'application/json'
  },
  params: {
    status: 'done',
    is_subcontracted: true,  // ✅ Filtre uniquement les sous-traitances
    created_after: startDate.toISOString(),
    page_size: 100
  }
});
```

### Option 2: Filtrer après récupération

```javascript
const transports = response.data.results || [];

// Garder seulement les transports avec charter ou subcontracting
const subcontractedTransports = transports.filter(t =>
  (t.charter?.price || t.subcontracting?.price) !== undefined
);

console.log(`${subcontractedTransports.length}/${transports.length} transports sous-traités`);
```

---

## Import corrigé dans pricing.service.js

```javascript
async importFromDashdoc(options = {}) {
  try {
    if (!this.dashdocApiKey) {
      throw new Error('DASHDOC_API_KEY non configuré');
    }

    const {
      startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
      endDate = new Date(),
      organizationId = null,
      dryRun = false
    } = options;

    console.log(`[PRICING SERVICE] Import Dashdoc depuis ${startDate.toISOString()}...`);

    // Récupérer les transports SOUS-TRAITÉS uniquement
    const response = await axios.get(`${this.dashdocApiUrl}/transports/`, {
      headers: {
        'Authorization': `Bearer ${this.dashdocApiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'done',
        is_subcontracted: true,  // ✅ Filtre sous-traitances
        created_after: startDate.toISOString(),
        created_before: endDate.toISOString(),
        page_size: 100
      }
    });

    const transports = response.data.results || [];
    console.log(`[PRICING SERVICE] ${transports.length} transports sous-traités récupérés`);

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const transport of transports) {
      try {
        // Extraire adresses
        const pickupAddress = transport.origin?.address;
        const deliveryAddress = transport.destination?.address;

        // Extraire prix SOUS-TRAITANT (pas client)
        const carrierPricing = this.extractCarrierPrice(transport);

        // Extraire infos transporteur
        const carrierInfo = this.extractCarrierInfo(transport);

        // Valider données minimales
        if (!pickupAddress?.postcode ||
            !deliveryAddress?.postcode ||
            !carrierInfo ||
            !carrierPricing.found ||
            !carrierPricing.price) {
          skipped++;
          console.log(`⚠️ Transport ${transport.uid} ignoré: données incomplètes`);
          continue;
        }

        // Si dry-run, juste logger
        if (dryRun) {
          console.log(`[DRY RUN] ${transport.uid}: ${pickupAddress.postcode}→${deliveryAddress.postcode}, ${carrierPricing.price}€ (${carrierPricing.source})`);
          imported++;
          continue;
        }

        // Vérifier si déjà importé
        const existing = await PriceHistory.findOne({
          'dashdocImport.transportId': transport.uid
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Créer l'enregistrement
        await PriceHistory.create({
          orderId: `DASHDOC-${transport.uid}`,
          carrierId: `dashdoc-${carrierInfo.pk}`,
          carrierName: carrierInfo.name,
          route: {
            from: {
              city: pickupAddress.city,
              postalCode: pickupAddress.postcode
            },
            to: {
              city: deliveryAddress.city,
              postalCode: deliveryAddress.postcode
            }
          },
          price: {
            proposed: carrierPricing.price,
            final: carrierPricing.price,
            marketAverage: 0,
            currency: carrierPricing.currency
          },
          transport: {
            vehicleType: this.mapDashdocVehicleType(transport.vehicle_type),
            weight: transport.weight_kg || 0,
            volume: transport.volume_m3 || 0,
            palettes: transport.pallets_count || 0,
            distance: transport.distance_km || 0
          },
          negotiation: {
            rounds: 0,
            method: 'manual',
            deviation: 0
          },
          dashdocImport: {
            imported: true,
            transportId: transport.uid,
            importedAt: new Date(),
            source: 'dashdoc',
            priceSource: carrierPricing.source  // ✅ Tracer d'où vient le prix
          },
          organizationId: organizationId || 'dashdoc-import',
          status: 'completed',
          completedAt: new Date(transport.delivery_date || transport.created)
        });

        imported++;

      } catch (itemError) {
        console.error(`[PRICING SERVICE] Erreur import ${transport.uid}:`, itemError.message);
        errors.push({
          transportId: transport.uid,
          error: itemError.message
        });
      }
    }

    const result = {
      success: true,
      message: dryRun ?
        `DRY RUN - ${imported} transports seraient importés` :
        `${imported} prix importés depuis Dashdoc`,
      imported,
      skipped,
      errors: errors.length,
      errorDetails: errors
    };

    console.log(`[PRICING SERVICE] Import terminé: ${imported} importés, ${skipped} ignorés`);

    return result;

  } catch (error) {
    console.error('[PRICING SERVICE] Erreur import Dashdoc:', error);
    throw error;
  }
}

// Ajouter les méthodes helper
extractCarrierPrice(transport) {
  // ... (voir code ci-dessus)
}

extractCarrierInfo(transport) {
  // ... (voir code ci-dessus)
}
```

---

## Points de vigilance

### 1. Ne PAS mélanger prix client et sous-traitant

❌ **MAUVAIS** :
```javascript
price: {
  proposed: transport.pricing.invoicing_amount,  // Prix CLIENT
  final: transport.charter.price                 // Prix SOUS-TRAITANT
}
```

✅ **BON** :
```javascript
price: {
  proposed: transport.charter.price,  // Prix SOUS-TRAITANT
  final: transport.charter.price      // Prix SOUS-TRAITANT
}
```

### 2. Filtrer les transports non sous-traités

Si un transport n'a pas de `charter` ou `subcontracting`, **l'ignorer** car :
- C'est un transport direct (réalisé en interne)
- Le `pricing.invoicing_amount` est le prix client, pas pertinent pour l'analyse

### 3. Tracer la source du prix

Toujours enregistrer dans `dashdocImport.priceSource` d'où vient le prix :
- `charter.price`
- `charter.purchase_price`
- `subcontracting.price`
- etc.

Cela permet de détecter les anomalies et de corriger si nécessaire.

---

## Test de validation

### 1. Vérifier qu'on récupère bien les prix sous-traitants

```bash
node scripts/test-dashdoc-structure.js
```

Doit afficher :
- ✅ Prix trouvés dans `charter.price` ou `subcontracting.price`
- ❌ PAS dans `pricing.invoicing_amount`

### 2. Import dry-run

```bash
curl -X POST "http://localhost:8080/api/v1/affretia/import/dashdoc" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "test-org",
    "months": 6,
    "dryRun": true
  }'
```

Vérifier dans les logs que les prix affichés sont cohérents (pas trop élevés).

### 3. Comparaison prix client vs sous-traitant

Pour un transport Dashdoc donné :
- Prix client (`pricing.invoicing_amount`) : 600€
- Prix sous-traitant (`charter.price`) : 450€
- **Marge** : 150€ (25%)

Si on utilise le prix client (600€) dans Affret.IA, les calculs de marché seront faussés.

---

## Documentation Dashdoc API

Pour plus d'infos sur la structure des données :
- API Docs : https://api.dashdoc.com/docs/
- Support : support@dashdoc.com

**Question à poser au support si besoin** :
> "Comment accéder aux prix payés aux sous-traitants via l'API v4 ? Nous avons besoin de `charter.price` ou équivalent, pas `pricing.invoicing_amount` qui est le prix client."

---

**Conclusion** : ✅ Toujours utiliser `charter.price` ou `subcontracting.price`, jamais `pricing.invoicing_amount`
