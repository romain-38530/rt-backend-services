/**
 * Dashdoc Trailer Model
 * Stocke les remorques Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_trailers';

const trailerSchema = {
  dashdocPk: { type: 'number', required: true, unique: true },
  dashdocUid: { type: 'string' },
  remoteId: { type: 'string' },

  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  _rawData: { type: 'object' },

  licensePlate: { type: 'string', required: true },
  type: { type: 'string' },

  payload: { type: 'number' },
  volume: { type: 'number' },

  hasLiftgate: { type: 'boolean', default: false },
  isRefrigerated: { type: 'boolean', default: false },

  tags: [{ type: 'string' }],
  fleetNumber: { type: 'string' },
  companyPk: { type: 'number' },

  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocPk: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { licensePlate: 1 } },
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

module.exports = { COLLECTION_NAME, trailerSchema, indexes, createIndexes };
