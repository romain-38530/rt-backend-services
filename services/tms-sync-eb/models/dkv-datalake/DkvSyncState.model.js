/**
 * DKV Sync State Model
 *
 * Tracks synchronization state for DKV Data Lake
 */

const mongoose = require('mongoose');

const entityStateSchema = new mongoose.Schema({
  lastSyncAt: Date,
  lastSyncCount: Number,
  lastSyncDuration: Number,
  totalSynced: { type: Number, default: 0 },
  lastError: String,
  lastErrorAt: Date,
  consecutiveErrors: { type: Number, default: 0 },
}, { _id: false });

const dkvSyncStateSchema = new mongoose.Schema({
  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },
  connectionId: {
    type: String,
    index: true,
  },

  // Overall sync state
  status: {
    type: String,
    enum: ['idle', 'running', 'paused', 'error'],
    default: 'idle',
  },
  lastFullSyncAt: Date,
  lastIncrementalSyncAt: Date,
  lastPeriodicSyncAt: Date,

  // Entity-specific states
  entities: {
    cards: entityStateSchema,
    transactions: entityStateSchema,
    tollPassages: entityStateSchema,
    invoices: entityStateSchema,
    vehicles: entityStateSchema,
  },

  // Collection counts
  counts: {
    cards: { type: Number, default: 0 },
    transactions: { type: Number, default: 0 },
    tollPassages: { type: Number, default: 0 },
    invoices: { type: Number, default: 0 },
    vehicles: { type: Number, default: 0 },
  },

  // Sync metrics
  metrics: {
    avgIncrementalDuration: Number,
    avgPeriodicDuration: Number,
    avgFullSyncDuration: Number,
    totalApiCalls: { type: Number, default: 0 },
    totalErrors: { type: Number, default: 0 },
    lastDayApiCalls: { type: Number, default: 0 },
    lastDayErrors: { type: Number, default: 0 },
  },

  // Configuration overrides
  config: {
    incrementalIntervalMs: Number,
    periodicIntervalMs: Number,
    fullSyncIntervalMs: Number,
    transactionDaysBack: Number,
    enabled: { type: Boolean, default: true },
  },

  // Error history (last 10)
  errorHistory: [{
    timestamp: Date,
    syncType: String,
    entity: String,
    error: String,
    stack: String,
  }],

}, {
  timestamps: true,
  collection: 'dkv_sync_state',
});

// Compound unique index
dkvSyncStateSchema.index({ organizationId: 1, connectionId: 1 }, { unique: true });

// Methods
dkvSyncStateSchema.methods.recordError = function(syncType, entity, error) {
  this.errorHistory.unshift({
    timestamp: new Date(),
    syncType,
    entity,
    error: error.message || String(error),
    stack: error.stack,
  });
  // Keep only last 10 errors
  if (this.errorHistory.length > 10) {
    this.errorHistory = this.errorHistory.slice(0, 10);
  }
  this.metrics.totalErrors++;
  this.metrics.lastDayErrors++;
};

dkvSyncStateSchema.methods.updateEntityState = function(entityName, update) {
  if (!this.entities[entityName]) {
    this.entities[entityName] = {};
  }
  Object.assign(this.entities[entityName], update);
};

module.exports = mongoose.model('DkvSyncState', dkvSyncStateSchema);
