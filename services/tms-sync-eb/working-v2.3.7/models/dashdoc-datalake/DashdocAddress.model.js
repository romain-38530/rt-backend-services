/**
 * Dashdoc Address Model
 * Stocke les adresses Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_addresses';

const addressSchema = {
  dashdocPk: { type: 'number', required: true, unique: true },
  remoteId: { type: 'string' },

  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  _rawData: { type: 'object' },

  name: { type: 'string' },
  street: { type: 'string' },
  city: { type: 'string' },
  postalCode: { type: 'string' },
  country: { type: 'string' },

  location: {
    type: { type: 'string', default: 'Point' },
    coordinates: { type: 'array' }
  },

  radius: { type: 'number' },
  instructions: { type: 'string' },

  isCarrier: { type: 'boolean' },
  isShipper: { type: 'boolean' },
  isOrigin: { type: 'boolean' },
  isDestination: { type: 'boolean' },

  companyPk: { type: 'number' },
  companyName: { type: 'string' },

  createdAt: { type: 'date' },
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocPk: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { location: '2dsphere' } },
  { key: { city: 1 } },
  { key: { postalCode: 1 } },
  { key: { companyPk: 1 } },
  { key: { syncedAt: -1 } }
];

async function createIndexes(db) {
  const collection = db.collection(COLLECTION_NAME);
  for (const index of indexes) {
    try {
      await collection.createIndex(index.key, { unique: index.unique || false, background: true });
    } catch (error) {
      if (error.code !== 85 && error.code !== 86) {
        console.error(`[DATALAKE] Error creating index:`, error.message);
      }
    }
  }
}

module.exports = { COLLECTION_NAME, addressSchema, indexes, createIndexes };
