/**
 * Dashdoc Vehicle Model
 * Stocke les véhicules Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_vehicles';

const vehicleSchema = {
  // Identifiants Dashdoc
  dashdocPk: { type: 'number', required: true, unique: true },
  dashdocUid: { type: 'string' },
  remoteId: { type: 'string' },

  // Multi-tenant
  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  // Données brutes
  _rawData: { type: 'object' },

  // Infos véhicule
  licensePlate: { type: 'string', required: true },
  type: { type: 'string' },
  brand: { type: 'string' },
  model: { type: 'string' },

  // Capacités
  payload: { type: 'number' },
  volume: { type: 'number' },

  // Caractéristiques
  hasLiftgate: { type: 'boolean', default: false },
  isRefrigerated: { type: 'boolean', default: false },
  isAdr: { type: 'boolean', default: false },

  // Tags
  tags: [{ type: 'string' }],
  fleetNumber: { type: 'string' },

  // Entreprise propriétaire
  companyPk: { type: 'number' },

  // Metadata sync
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocPk: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { licensePlate: 1 } },
  { key: { companyPk: 1 } },
  { key: { type: 1 } },
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

module.exports = { COLLECTION_NAME, vehicleSchema, indexes, createIndexes };
