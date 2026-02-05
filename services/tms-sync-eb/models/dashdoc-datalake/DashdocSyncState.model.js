/**
 * Dashdoc Sync State Model
 * Stocke l'état de synchronisation du Data Lake
 */

const COLLECTION_NAME = 'dashdoc_sync_state';

const syncStateSchema = {
  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  // Dernières syncs
  lastFullSyncAt: { type: 'date' },
  lastIncrementalSyncAt: { type: 'date' },

  // État par entité
  entities: {
    transports: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      lastPage: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' } // idle, syncing, error
    },
    companies: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      lastPage: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    vehicles: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    trailers: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    truckers: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    contacts: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    invoices: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    addresses: {
      lastSyncAt: { type: 'date' },
      totalCount: { type: 'number', default: 0 },
      syncedCount: { type: 'number', default: 0 },
      status: { type: 'string', default: 'idle' }
    },
    counters: {
      lastSyncAt: { type: 'date' },
      status: { type: 'string', default: 'idle' }
    }
  },

  // Erreurs récentes
  errors: [{
    entity: { type: 'string' },
    error: { type: 'string' },
    occurredAt: { type: 'date' },
    retryCount: { type: 'number', default: 0 }
  }],

  // Métriques
  metrics: {
    avgSyncDuration: { type: 'number', default: 0 },
    lastSyncDuration: { type: 'number', default: 0 },
    apiCallsTotal: { type: 'number', default: 0 },
    apiCallsLastHour: { type: 'number', default: 0 },
    errorsLastHour: { type: 'number', default: 0 },
    lastSuccessfulSync: { type: 'date' }
  },

  // Statut global
  status: { type: 'string', default: 'idle' }, // idle, syncing, error, paused
  isPaused: { type: 'boolean', default: false },
  pausedReason: { type: 'string' },

  createdAt: { type: 'date' },
  updatedAt: { type: 'date' }
};

const indexes = [
  { key: { organizationId: 1, connectionId: 1 }, unique: true },
  { key: { status: 1 } },
  { key: { updatedAt: -1 } }
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

module.exports = { COLLECTION_NAME, syncStateSchema, indexes, createIndexes };
