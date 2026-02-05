/**
 * Dashdoc Counter Model
 * Stocke les compteurs temps réel Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_counters';

const counterSchema = {
  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  // Données brutes des compteurs Dashdoc
  counters: { type: 'object' },

  syncedAt: { type: 'date', required: true }
};

const indexes = [
  { key: { organizationId: 1, connectionId: 1 }, unique: true },
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

module.exports = { COLLECTION_NAME, counterSchema, indexes, createIndexes };
