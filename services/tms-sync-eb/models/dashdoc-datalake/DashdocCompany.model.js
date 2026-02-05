/**
 * Dashdoc Company Model
 * Stocke les entreprises/carriers Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_companies';

/**
 * Schema du document company
 */
const companySchema = {
  // Identifiants Dashdoc
  dashdocPk: { type: 'number', required: true, unique: true },
  remoteId: { type: 'string' },

  // Multi-tenant
  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  // Données brutes
  _rawData: { type: 'object' },

  // Infos entreprise
  name: { type: 'string', required: true },
  legalName: { type: 'string' },

  // Identifiants légaux
  siret: { type: 'string' },
  siren: { type: 'string' },
  vatNumber: { type: 'string' },
  legalForm: { type: 'string' },

  // Contact
  email: { type: 'string' },
  phone: { type: 'string' },
  website: { type: 'string' },

  // Adresse principale
  address: {
    street: { type: 'string' },
    city: { type: 'string' },
    postalCode: { type: 'string' },
    country: { type: 'string' },
    location: {
      type: { type: 'string', default: 'Point' },
      coordinates: { type: 'array' }
    }
  },

  // Type d'entreprise
  isCarrier: { type: 'boolean', default: false },
  isShipper: { type: 'boolean', default: false },
  isVerified: { type: 'boolean', default: false },
  accountType: { type: 'string' },

  // Logo
  logo: { type: 'string' },

  // Tags
  tags: [{ type: 'string' }],
  country: { type: 'string' },

  // Metadata sync
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

/**
 * Index pour optimiser les requêtes
 */
const indexes = [
  // Index unique sur le PK Dashdoc
  { key: { dashdocPk: 1 }, unique: true },

  // Index composé pour requêtes fréquentes
  { key: { organizationId: 1, isCarrier: 1 } },
  { key: { organizationId: 1, connectionId: 1 } },

  // Index sur SIRET pour recherche rapide
  { key: { siret: 1 } },
  { key: { vatNumber: 1 } },

  // Index texte pour recherche par nom
  { key: { name: 'text', legalName: 'text' } },

  // Index géospatial
  { key: { 'address.location': '2dsphere' } },

  // Index sur le remoteId
  { key: { remoteId: 1 } },

  // Index pour sync
  { key: { syncedAt: -1 } },
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
      if (error.code !== 85 && error.code !== 86) {
        console.error(`[DATALAKE] Error creating index:`, error.message);
      }
    }
  }
}

module.exports = {
  COLLECTION_NAME,
  companySchema,
  indexes,
  createIndexes
};
