/**
 * DKV Data Lake Sync Service
 *
 * Orchestrates periodic synchronization of DKV data into MongoDB
 * Following the same pattern as Dashdoc Data Lake
 */

const crypto = require('crypto');
const {
  DkvCard,
  DkvTransaction,
  DkvTollPassage,
  DkvInvoice,
  DkvVehicle,
  DkvSyncState,
} = require('../../models/dkv-datalake');

class DkvDatalakeSyncService {
  constructor(db, connector, options = {}) {
    this.db = db;
    this.connector = connector;

    this.config = {
      organizationId: options.organizationId || 'default',
      connectionId: options.connectionId || 'dkv-default',

      // Sync intervals
      enableIncrementalSync: options.enableIncrementalSync !== false,
      incrementalIntervalMs: options.incrementalInterval || 5 * 60 * 1000, // 5 minutes
      periodicIntervalMs: options.periodicInterval || 60 * 60 * 1000, // 1 hour
      fullSyncIntervalMs: options.fullSyncInterval || 24 * 60 * 60 * 1000, // 24 hours

      // Data retrieval settings
      transactionDaysBack: options.transactionDaysBack || 30,
      tollDaysBack: options.tollDaysBack || 30,

      // Skip initial sync if data is fresh
      skipInitialSyncIfFresh: options.skipInitialSyncIfFresh !== false,
      freshnessThreshold: options.freshnessThreshold || 60 * 60 * 1000, // 1 hour
    };

    // Intervals
    this.incrementalInterval = null;
    this.periodicInterval = null;
    this.fullSyncInterval = null;

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.pauseReason = null;
    this.currentSync = null;

    // Stats
    this.stats = {
      incrementalSyncs: 0,
      periodicSyncs: 0,
      fullSyncs: 0,
      errors: 0,
      lastIncrementalAt: null,
      lastPeriodicAt: null,
      lastFullSyncAt: null,
    };
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  async start() {
    if (this.isRunning) {
      console.log('[DKV-SYNC] Already running');
      return;
    }

    console.log('[DKV-SYNC] Starting DKV Data Lake sync service...');
    console.log(`[DKV-SYNC] Organization: ${this.config.organizationId}, Connection: ${this.config.connectionId}`);

    this.isRunning = true;

    // Initialize sync state
    await this.initializeSyncState();

    // Check if we need initial sync
    const state = await this.getSyncState();
    const needsInitialSync = !state.lastFullSyncAt ||
      (Date.now() - new Date(state.lastFullSyncAt).getTime() > this.config.freshnessThreshold);

    if (needsInitialSync && !this.config.skipInitialSyncIfFresh) {
      console.log('[DKV-SYNC] Running initial full sync...');
      await this.runFullSync();
    } else if (needsInitialSync) {
      console.log('[DKV-SYNC] Running initial periodic sync...');
      await this.runPeriodicSync();
    } else {
      console.log('[DKV-SYNC] Data is fresh, skipping initial sync');
    }

    // Start periodic intervals
    this.startIntervals();

    console.log('[DKV-SYNC] Sync service started');
  }

  stop() {
    console.log('[DKV-SYNC] Stopping sync service...');

    this.isRunning = false;

    if (this.incrementalInterval) {
      clearInterval(this.incrementalInterval);
      this.incrementalInterval = null;
    }

    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }

    if (this.fullSyncInterval) {
      clearInterval(this.fullSyncInterval);
      this.fullSyncInterval = null;
    }

    console.log('[DKV-SYNC] Sync service stopped');
  }

  pause(reason = 'Manual pause') {
    console.log(`[DKV-SYNC] Pausing: ${reason}`);
    this.isPaused = true;
    this.pauseReason = reason;
  }

  resume() {
    console.log('[DKV-SYNC] Resuming...');
    this.isPaused = false;
    this.pauseReason = null;
  }

  startIntervals() {
    // Incremental sync (every 5 minutes)
    if (this.config.enableIncrementalSync) {
      this.incrementalInterval = setInterval(
        () => this.runIncrementalSync(),
        this.config.incrementalIntervalMs
      );
      console.log(`[DKV-SYNC] Incremental sync every ${this.config.incrementalIntervalMs / 1000}s`);
    }

    // Periodic sync (every hour)
    this.periodicInterval = setInterval(
      () => this.runPeriodicSync(),
      this.config.periodicIntervalMs
    );
    console.log(`[DKV-SYNC] Periodic sync every ${this.config.periodicIntervalMs / 60000}min`);

    // Full sync (every 24 hours)
    this.fullSyncInterval = setInterval(
      () => this.runFullSync(),
      this.config.fullSyncIntervalMs
    );
    console.log(`[DKV-SYNC] Full sync every ${this.config.fullSyncIntervalMs / 3600000}h`);
  }

  // ============================================================================
  // Sync Operations
  // ============================================================================

  async runIncrementalSync() {
    if (this.isPaused || this.currentSync) {
      console.log('[DKV-SYNC] Skipping incremental sync (paused or running)');
      return;
    }

    this.currentSync = 'incremental';
    const startTime = Date.now();
    console.log('[DKV-SYNC] Starting incremental sync...');

    try {
      // Sync recent transactions (last 2 days for incremental)
      const txResult = await this.syncTransactionsIncremental();

      const duration = Date.now() - startTime;
      this.stats.incrementalSyncs++;
      this.stats.lastIncrementalAt = new Date();

      await this.updateSyncState({
        lastIncrementalSyncAt: new Date(),
        status: 'idle',
      });

      console.log(`[DKV-SYNC] Incremental sync completed in ${duration}ms - ${txResult.count} transactions`);

    } catch (error) {
      console.error('[DKV-SYNC] Incremental sync failed:', error.message);
      this.stats.errors++;
      await this.recordSyncError('incremental', error);
    } finally {
      this.currentSync = null;
    }
  }

  async runPeriodicSync() {
    if (this.isPaused || this.currentSync) {
      console.log('[DKV-SYNC] Skipping periodic sync (paused or running)');
      return;
    }

    this.currentSync = 'periodic';
    const startTime = Date.now();
    console.log('[DKV-SYNC] Starting periodic sync...');

    try {
      // Sync cards
      const cardsResult = await this.syncCards();
      await this.sleep(500);

      // Sync transactions (full range)
      const txResult = await this.syncTransactionsFull();
      await this.sleep(500);

      // Sync toll passages
      const tollResult = await this.syncTollPassages();
      await this.sleep(500);

      // Sync invoices
      const invoicesResult = await this.syncInvoices();

      const duration = Date.now() - startTime;
      this.stats.periodicSyncs++;
      this.stats.lastPeriodicAt = new Date();

      await this.updateSyncState({
        lastPeriodicSyncAt: new Date(),
        status: 'idle',
      });

      console.log(`[DKV-SYNC] Periodic sync completed in ${duration}ms`);
      console.log(`[DKV-SYNC] Cards: ${cardsResult.count}, Transactions: ${txResult.count}, Toll: ${tollResult.count}, Invoices: ${invoicesResult.count}`);

    } catch (error) {
      console.error('[DKV-SYNC] Periodic sync failed:', error.message);
      this.stats.errors++;
      await this.recordSyncError('periodic', error);
    } finally {
      this.currentSync = null;
    }
  }

  async runFullSync() {
    if (this.isPaused) {
      console.log('[DKV-SYNC] Skipping full sync (paused)');
      return;
    }

    // Full sync can interrupt other syncs
    if (this.currentSync) {
      console.log(`[DKV-SYNC] Waiting for ${this.currentSync} sync to complete...`);
      await this.sleep(5000);
    }

    this.currentSync = 'full';
    const startTime = Date.now();
    console.log('[DKV-SYNC] Starting full sync...');

    try {
      await this.updateSyncState({ status: 'running' });

      // Full sync using connector
      const result = await this.connector.fullSync({
        transactionDaysBack: this.config.transactionDaysBack,
      });

      // Bulk upsert all data
      if (result.cards.length > 0) {
        await this.bulkUpsertCards(result.cards);
      }

      if (result.transactions.length > 0) {
        await this.bulkUpsertTransactions(result.transactions);
      }

      if (result.tollPassages.length > 0) {
        await this.bulkUpsertTollPassages(result.tollPassages);
      }

      if (result.invoices.length > 0) {
        await this.bulkUpsertInvoices(result.invoices);
      }

      if (result.vehicles.length > 0) {
        await this.bulkUpsertVehicles(result.vehicles);
      }

      // Update vehicle stats from transactions
      await this.updateVehicleStats();

      const duration = Date.now() - startTime;
      this.stats.fullSyncs++;
      this.stats.lastFullSyncAt = new Date();

      await this.updateSyncState({
        lastFullSyncAt: new Date(),
        status: 'idle',
      });

      // Update counts
      await this.updateCollectionCounts();

      console.log(`[DKV-SYNC] Full sync completed in ${duration}ms`);
      console.log(`[DKV-SYNC] Summary: ${result.cards.length} cards, ${result.transactions.length} transactions, ${result.tollPassages.length} toll, ${result.invoices.length} invoices`);

      if (result.errors.length > 0) {
        console.warn('[DKV-SYNC] Errors during sync:', result.errors);
      }

    } catch (error) {
      console.error('[DKV-SYNC] Full sync failed:', error.message);
      this.stats.errors++;
      await this.recordSyncError('full', error);
    } finally {
      this.currentSync = null;
    }
  }

  // ============================================================================
  // Entity Sync Methods
  // ============================================================================

  async syncCards() {
    console.log('[DKV-SYNC] Syncing cards...');
    const startTime = Date.now();

    try {
      const cards = await this.connector.getAllCardsWithPagination();
      await this.bulkUpsertCards(cards);

      const duration = Date.now() - startTime;
      await this.updateEntityState('cards', {
        lastSyncAt: new Date(),
        lastSyncCount: cards.length,
        lastSyncDuration: duration,
        consecutiveErrors: 0,
      });

      return { count: cards.length, duration };
    } catch (error) {
      await this.updateEntityState('cards', {
        lastError: error.message,
        lastErrorAt: new Date(),
        consecutiveErrors: (await this.getEntityState('cards')).consecutiveErrors + 1,
      });
      throw error;
    }
  }

  async syncTransactionsIncremental() {
    console.log('[DKV-SYNC] Syncing transactions (incremental)...');
    const startTime = Date.now();

    try {
      // Get last 2 days for incremental
      const result = await this.connector.getRecentTransactions(2);
      const transactions = (result.data || []).map(t => this.connector.mapTransaction(t));

      if (transactions.length > 0) {
        await this.bulkUpsertTransactions(transactions);
      }

      const duration = Date.now() - startTime;
      await this.updateEntityState('transactions', {
        lastSyncAt: new Date(),
        lastSyncCount: transactions.length,
        lastSyncDuration: duration,
        consecutiveErrors: 0,
      });

      return { count: transactions.length, duration };
    } catch (error) {
      await this.updateEntityState('transactions', {
        lastError: error.message,
        lastErrorAt: new Date(),
      });
      throw error;
    }
  }

  async syncTransactionsFull() {
    console.log('[DKV-SYNC] Syncing transactions (full)...');
    const startTime = Date.now();

    try {
      const transactions = await this.connector.getAllTransactionsWithPagination({
        daysBack: this.config.transactionDaysBack,
      });

      if (transactions.length > 0) {
        await this.bulkUpsertTransactions(transactions);
      }

      const duration = Date.now() - startTime;
      await this.updateEntityState('transactions', {
        lastSyncAt: new Date(),
        lastSyncCount: transactions.length,
        lastSyncDuration: duration,
        totalSynced: transactions.length,
        consecutiveErrors: 0,
      });

      return { count: transactions.length, duration };
    } catch (error) {
      await this.updateEntityState('transactions', {
        lastError: error.message,
        lastErrorAt: new Date(),
      });
      throw error;
    }
  }

  async syncTollPassages() {
    console.log('[DKV-SYNC] Syncing toll passages...');
    const startTime = Date.now();

    try {
      const result = await this.connector.getTollPassages();
      const passages = (result.data || []).map(p => this.connector.mapTollPassage(p));

      if (passages.length > 0) {
        await this.bulkUpsertTollPassages(passages);
      }

      const duration = Date.now() - startTime;
      await this.updateEntityState('tollPassages', {
        lastSyncAt: new Date(),
        lastSyncCount: passages.length,
        lastSyncDuration: duration,
        consecutiveErrors: 0,
      });

      return { count: passages.length, duration };
    } catch (error) {
      await this.updateEntityState('tollPassages', {
        lastError: error.message,
        lastErrorAt: new Date(),
      });
      throw error;
    }
  }

  async syncInvoices() {
    console.log('[DKV-SYNC] Syncing invoices...');
    const startTime = Date.now();

    try {
      const result = await this.connector.getInvoices();
      const invoices = (result.data || []).map(i => this.connector.mapInvoice(i));

      if (invoices.length > 0) {
        await this.bulkUpsertInvoices(invoices);
      }

      const duration = Date.now() - startTime;
      await this.updateEntityState('invoices', {
        lastSyncAt: new Date(),
        lastSyncCount: invoices.length,
        lastSyncDuration: duration,
        consecutiveErrors: 0,
      });

      return { count: invoices.length, duration };
    } catch (error) {
      await this.updateEntityState('invoices', {
        lastError: error.message,
        lastErrorAt: new Date(),
      });
      throw error;
    }
  }

  // ============================================================================
  // Bulk Upsert Operations
  // ============================================================================

  async bulkUpsertCards(cards) {
    if (!cards || cards.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = cards.map(card => ({
      updateOne: {
        filter: {
          cardNumber: card.cardNumber,
          organizationId: this.config.organizationId,
        },
        update: {
          $set: {
            ...card,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            syncedAt: new Date(),
            syncVersion: 1,
            checksum: this.generateChecksum(card, ['cardNumber', 'status', 'vehiclePlate']),
          },
        },
        upsert: true,
      },
    }));

    const result = await DkvCard.bulkWrite(bulkOps, { ordered: false });
    console.log(`[DKV-SYNC] Cards upserted: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
    return { inserted: result.upsertedCount, updated: result.modifiedCount };
  }

  async bulkUpsertTransactions(transactions) {
    if (!transactions || transactions.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = transactions.map(tx => ({
      updateOne: {
        filter: {
          transactionId: tx.transactionId,
          organizationId: this.config.organizationId,
        },
        update: {
          $set: {
            ...tx,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            syncedAt: new Date(),
            syncVersion: 1,
            checksum: this.generateChecksum(tx, ['transactionId', 'grossAmount', 'quantity']),
          },
        },
        upsert: true,
      },
    }));

    const result = await DkvTransaction.bulkWrite(bulkOps, { ordered: false });
    console.log(`[DKV-SYNC] Transactions upserted: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
    return { inserted: result.upsertedCount, updated: result.modifiedCount };
  }

  async bulkUpsertTollPassages(passages) {
    if (!passages || passages.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = passages.map(passage => ({
      updateOne: {
        filter: {
          passageId: passage.passageId,
          organizationId: this.config.organizationId,
        },
        update: {
          $set: {
            ...passage,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            syncedAt: new Date(),
            syncVersion: 1,
          },
        },
        upsert: true,
      },
    }));

    const result = await DkvTollPassage.bulkWrite(bulkOps, { ordered: false });
    console.log(`[DKV-SYNC] Toll passages upserted: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
    return { inserted: result.upsertedCount, updated: result.modifiedCount };
  }

  async bulkUpsertInvoices(invoices) {
    if (!invoices || invoices.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = invoices.map(invoice => ({
      updateOne: {
        filter: {
          invoiceNumber: invoice.invoiceNumber,
          organizationId: this.config.organizationId,
        },
        update: {
          $set: {
            ...invoice,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            syncedAt: new Date(),
            syncVersion: 1,
          },
        },
        upsert: true,
      },
    }));

    const result = await DkvInvoice.bulkWrite(bulkOps, { ordered: false });
    console.log(`[DKV-SYNC] Invoices upserted: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
    return { inserted: result.upsertedCount, updated: result.modifiedCount };
  }

  async bulkUpsertVehicles(vehicles) {
    if (!vehicles || vehicles.length === 0) return { inserted: 0, updated: 0 };

    const bulkOps = vehicles.map(vehicle => ({
      updateOne: {
        filter: {
          licensePlate: vehicle.licensePlate,
          organizationId: this.config.organizationId,
        },
        update: {
          $set: {
            ...vehicle,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            syncedAt: new Date(),
            syncVersion: 1,
          },
        },
        upsert: true,
      },
    }));

    const result = await DkvVehicle.bulkWrite(bulkOps, { ordered: false });
    console.log(`[DKV-SYNC] Vehicles upserted: ${result.upsertedCount} inserted, ${result.modifiedCount} updated`);
    return { inserted: result.upsertedCount, updated: result.modifiedCount };
  }

  // ============================================================================
  // Vehicle Stats Calculation
  // ============================================================================

  async updateVehicleStats() {
    console.log('[DKV-SYNC] Updating vehicle statistics...');

    try {
      const pipeline = [
        {
          $match: {
            organizationId: this.config.organizationId,
            vehiclePlate: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: '$vehiclePlate',
            totalFuelLiters: { $sum: '$quantity' },
            totalFuelCost: { $sum: '$grossAmount' },
            transactionCount: { $sum: 1 },
            lastRefuelDate: { $max: '$transactionDate' },
            lastRefuelLiters: { $last: '$quantity' },
            lastOdometer: { $max: '$odometer' },
          },
        },
      ];

      const stats = await DkvTransaction.aggregate(pipeline);

      for (const vehicleStats of stats) {
        await DkvVehicle.updateOne(
          {
            licensePlate: vehicleStats._id,
            organizationId: this.config.organizationId,
          },
          {
            $set: {
              'stats.totalFuelLiters': vehicleStats.totalFuelLiters,
              'stats.totalFuelCost': vehicleStats.totalFuelCost,
              'stats.transactionCount': vehicleStats.transactionCount,
              'stats.lastRefuelDate': vehicleStats.lastRefuelDate,
              'stats.lastRefuelLiters': vehicleStats.lastRefuelLiters,
              'stats.lastOdometer': vehicleStats.lastOdometer,
            },
          },
          { upsert: true }
        );
      }

      console.log(`[DKV-SYNC] Updated stats for ${stats.length} vehicles`);
    } catch (error) {
      console.error('[DKV-SYNC] Error updating vehicle stats:', error.message);
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  async initializeSyncState() {
    const existing = await DkvSyncState.findOne({
      organizationId: this.config.organizationId,
      connectionId: this.config.connectionId,
    });

    if (!existing) {
      await DkvSyncState.create({
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId,
        status: 'idle',
        entities: {},
        counts: {},
        metrics: {},
        config: {
          incrementalIntervalMs: this.config.incrementalIntervalMs,
          periodicIntervalMs: this.config.periodicIntervalMs,
          fullSyncIntervalMs: this.config.fullSyncIntervalMs,
          transactionDaysBack: this.config.transactionDaysBack,
          enabled: true,
        },
      });
      console.log('[DKV-SYNC] Initialized sync state');
    }
  }

  async getSyncState() {
    return DkvSyncState.findOne({
      organizationId: this.config.organizationId,
      connectionId: this.config.connectionId,
    }).lean() || {};
  }

  async updateSyncState(update) {
    await DkvSyncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId,
      },
      { $set: update },
      { upsert: true }
    );
  }

  async getEntityState(entityName) {
    const state = await this.getSyncState();
    return state.entities?.[entityName] || {};
  }

  async updateEntityState(entityName, update) {
    const updateObj = {};
    for (const [key, value] of Object.entries(update)) {
      updateObj[`entities.${entityName}.${key}`] = value;
    }

    await DkvSyncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId,
      },
      { $set: updateObj }
    );
  }

  async recordSyncError(syncType, error) {
    await DkvSyncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId,
      },
      {
        $set: { status: 'error' },
        $inc: { 'metrics.totalErrors': 1, 'metrics.lastDayErrors': 1 },
        $push: {
          errorHistory: {
            $each: [{
              timestamp: new Date(),
              syncType,
              error: error.message,
              stack: error.stack,
            }],
            $slice: -10,
          },
        },
      }
    );
  }

  async updateCollectionCounts() {
    const counts = {
      cards: await DkvCard.countDocuments({ organizationId: this.config.organizationId }),
      transactions: await DkvTransaction.countDocuments({ organizationId: this.config.organizationId }),
      tollPassages: await DkvTollPassage.countDocuments({ organizationId: this.config.organizationId }),
      invoices: await DkvInvoice.countDocuments({ organizationId: this.config.organizationId }),
      vehicles: await DkvVehicle.countDocuments({ organizationId: this.config.organizationId }),
    };

    await this.updateSyncState({ counts });
    return counts;
  }

  // ============================================================================
  // Manual Sync Trigger
  // ============================================================================

  async triggerManualSync(type = 'incremental') {
    console.log(`[DKV-SYNC] Manual sync triggered: ${type}`);

    switch (type) {
      case 'full':
        return this.runFullSync();
      case 'incremental':
        return this.runIncrementalSync();
      case 'periodic':
        return this.runPeriodicSync();
      case 'cards':
        return this.syncCards();
      case 'transactions':
        return this.syncTransactionsFull();
      case 'toll':
        return this.syncTollPassages();
      case 'invoices':
        return this.syncInvoices();
      default:
        throw new Error(`Unknown sync type: ${type}`);
    }
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats() {
    const state = await this.getSyncState();
    const counts = await this.updateCollectionCounts();

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      pauseReason: this.pauseReason,
      currentSync: this.currentSync,
      organizationId: this.config.organizationId,
      connectionId: this.config.connectionId,
      stats: this.stats,
      syncState: state,
      counts,
      connector: this.connector.getStats(),
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  generateChecksum(data, fields) {
    const values = fields.map(f => {
      const value = data[f];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    });
    return crypto.createHash('md5').update(values.join('|')).digest('hex');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { DkvDatalakeSyncService };
