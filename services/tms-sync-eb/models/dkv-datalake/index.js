/**
 * DKV Data Lake Models Index
 *
 * Exports all MongoDB models for DKV data
 */

const DkvCard = require('./DkvCard.model');
const DkvTransaction = require('./DkvTransaction.model');
const DkvTollPassage = require('./DkvTollPassage.model');
const DkvInvoice = require('./DkvInvoice.model');
const DkvVehicle = require('./DkvVehicle.model');
const DkvSyncState = require('./DkvSyncState.model');

module.exports = {
  DkvCard,
  DkvTransaction,
  DkvTollPassage,
  DkvInvoice,
  DkvVehicle,
  DkvSyncState,

  // Collection names
  collections: {
    cards: 'dkv_cards',
    transactions: 'dkv_transactions',
    tollPassages: 'dkv_toll_passages',
    invoices: 'dkv_invoices',
    vehicles: 'dkv_vehicles',
    syncState: 'dkv_sync_state',
  },

  // Initialize indexes
  async ensureIndexes() {
    console.log('[DKV-DATALAKE] Ensuring indexes...');
    try {
      await Promise.all([
        DkvCard.ensureIndexes(),
        DkvTransaction.ensureIndexes(),
        DkvTollPassage.ensureIndexes(),
        DkvInvoice.ensureIndexes(),
        DkvVehicle.ensureIndexes(),
        DkvSyncState.ensureIndexes(),
      ]);
      console.log('[DKV-DATALAKE] Indexes created successfully');
    } catch (error) {
      console.error('[DKV-DATALAKE] Error creating indexes:', error.message);
    }
  },
};
