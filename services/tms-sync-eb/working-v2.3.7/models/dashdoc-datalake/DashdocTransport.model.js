/**
 * Dashdoc Transport Model
 * Stocke les transports Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_transports';

/**
 * Schema du document transport
 */
const transportSchema = {
  // Identifiants Dashdoc
  dashdocUid: { type: 'string', required: true, unique: true },
  sequentialId: { type: 'number' },
  remoteId: { type: 'string' },
  inviteCode: { type: 'string' },

  // Multi-tenant
  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  // Données brutes Dashdoc (conservées pour traçabilité)
  _rawData: { type: 'object' },

  // Statut
  status: { type: 'string' }, // DRAFT, PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED
  dashdocStatus: { type: 'string' }, // Statut original Dashdoc
  globalStatus: { type: 'string' },
  creationMethod: { type: 'string' },

  // Dates
  createdAt: { type: 'date' },
  updatedAt: { type: 'date' },

  // Pickup (chargement)
  pickup: {
    address: {
      name: { type: 'string' },
      street: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
      country: { type: 'string' },
      location: {
        type: { type: 'string', default: 'Point' },
        coordinates: { type: 'array' } // [longitude, latitude]
      }
    },
    contact: {
      name: { type: 'string' },
      phone: { type: 'string' }
    },
    scheduledAt: { type: 'date' },
    scheduledEnd: { type: 'date' },
    instructions: { type: 'string' },
    reference: { type: 'string' }
  },

  // Delivery (livraison)
  delivery: {
    address: {
      name: { type: 'string' },
      street: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
      country: { type: 'string' },
      location: {
        type: { type: 'string', default: 'Point' },
        coordinates: { type: 'array' }
      }
    },
    contact: {
      name: { type: 'string' },
      phone: { type: 'string' }
    },
    scheduledAt: { type: 'date' },
    scheduledEnd: { type: 'date' },
    instructions: { type: 'string' },
    reference: { type: 'string' }
  },

  // Marchandises
  cargo: [{
    description: { type: 'string' },
    category: { type: 'string' },
    quantity: { type: 'number' },
    weight: { type: 'number' },
    weightUnit: { type: 'string' },
    volume: { type: 'number' },
    volumeUnit: { type: 'string' },
    linearMeters: { type: 'number' },
    isDangerous: { type: 'boolean' },
    isRefrigerated: { type: 'boolean' },
    temperature: { type: 'number' },
    temperatureUnit: { type: 'string' },
    adrCode: { type: 'string' }
  }],

  // Transporteur assigné
  carrier: {
    externalId: { type: 'string' },
    name: { type: 'string' },
    siret: { type: 'string' },
    vatNumber: { type: 'string' },
    phone: { type: 'string' },
    address: {
      street: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
      country: { type: 'string' }
    }
  },

  // Moyen de transport
  transportMeans: {
    hasVehicle: { type: 'boolean' },
    hasTrucker: { type: 'boolean' },
    vehicle: {
      licensePlate: { type: 'string' },
      type: { type: 'string' },
      externalId: { type: 'string' }
    },
    trucker: {
      name: { type: 'string' },
      phone: { type: 'string' },
      externalId: { type: 'string' }
    }
  },

  // Pricing
  pricing: {
    totalPrice: { type: 'number' },
    agreedPrice: { type: 'number' },
    invoicedPrice: { type: 'number' },
    currency: { type: 'string', default: 'EUR' }
  },

  // Metrics
  metrics: {
    estimatedDistance: { type: 'number' },
    carbonFootprint: { type: 'number' }
  },

  // Documents
  documents: [{
    externalId: { type: 'string' },
    category: { type: 'string' },
    name: { type: 'string' },
    fileUrl: { type: 'string' },
    createdAt: { type: 'date' }
  }],

  // Tags (libellés Dashdoc)
  tags: [{
    pk: { type: 'number' },
    name: { type: 'string' },
    color: { type: 'string' }
  }],

  // Tracking
  trackingId: { type: 'string' },
  parentTransportId: { type: 'string' },

  // Metadata sync
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

/**
 * Index pour optimiser les requêtes
 */
const indexes = [
  // Index unique sur l'UID Dashdoc
  { key: { dashdocUid: 1 }, unique: true },

  // Index composé pour requêtes fréquentes
  { key: { organizationId: 1, status: 1, syncedAt: -1 } },
  { key: { organizationId: 1, connectionId: 1 } },

  // Index sur le carrier pour recherche
  { key: { 'carrier.externalId': 1 } },
  { key: { 'carrier.name': 1 } },

  // Index géospatial pour recherche par localisation
  { key: { 'pickup.address.location': '2dsphere' } },
  { key: { 'delivery.address.location': '2dsphere' } },

  // Index sur les tags
  { key: { 'tags.name': 1 } },

  // Index sur les dates
  { key: { createdAt: -1 } },
  { key: { updatedAt: -1 } },
  { key: { syncedAt: -1 } },

  // Index pour sync incrémentale
  { key: { checksum: 1 } }
];

/**
 * Créer les index dans la collection
 */
async function createIndexes(db) {
  const collection = db.collection(COLLECTION_NAME);

  for (const index of indexes) {
    try {
      await collection.createIndex(index.key, {
        unique: index.unique || false,
        background: true
      });
      console.log(`[DATALAKE] Index created: ${JSON.stringify(index.key)}`);
    } catch (error) {
      // Index existe déjà
      if (error.code !== 85 && error.code !== 86) {
        console.error(`[DATALAKE] Error creating index:`, error.message);
      }
    }
  }
}

module.exports = {
  COLLECTION_NAME,
  transportSchema,
  indexes,
  createIndexes
};
