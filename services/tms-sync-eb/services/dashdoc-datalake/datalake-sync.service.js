/**
 * Dashdoc Data Lake Sync Service
 * Orchestrateur principal pour la synchronisation centralisée des données Dashdoc
 *
 * Architecture:
 * - ✅ Sync incrémentale toutes les 25s (transports récents, counters)
 * - ✅ Webhooks Dashdoc (POST /api/v1/webhooks/dashdoc) pour temps réel additionnel
 * - Full sync toutes les 1h (réconciliation)
 * - Sync périodique toutes les 30min (companies, vehicles, truckers)
 *
 * ⚠️ RATE LIMITING STRICT: Maximum 2 req/s vers Dashdoc
 * - Le rate limiter est géré dans dashdoc.connector.js (500ms entre requêtes)
 * - Délais additionnels entre entités pour éviter les pics
 * - Skip Full Sync initial si données récentes (< 1h)
 *
 * Les services consommateurs lisent depuis MongoDB, pas depuis l'API Dashdoc.
 * Seules les écritures (assignation carrier) restent directes vers Dashdoc.
 */

const crypto = require('crypto');
const { COLLECTIONS } = require('../../models/dashdoc-datalake');

class DatalakeSyncService {
  constructor(db, dashdocConnector, options = {}) {
    this.db = db;
    this.connector = dashdocConnector;

    // Configuration
    this.config = {
      // ✅ Sync incrémentale RÉACTIVÉE (25s) - en complément des webhooks
      // Les webhooks peuvent être configurés en plus pour temps réel
      enableIncrementalSync: options.enableIncrementalSync !== false, // Activé par défaut
      incrementalIntervalMs: options.incrementalInterval || 25 * 1000, // 25s

      // Intervalle de sync périodique pour données de référence (30min)
      periodicIntervalMs: options.periodicInterval || 30 * 60 * 1000,

      // Intervalle de full sync (1h) - réconciliation
      fullSyncIntervalMs: options.fullSyncInterval || 60 * 60 * 1000,

      // ⚠️ RATE LIMITING STRICT: 2 req/s max (demande Dashdoc)
      // Le rate limiter principal est dans dashdoc.connector.js (500ms entre requêtes)
      // Ces délais sont EN PLUS pour espacer les syncs d'entités différentes
      rateLimitDelayMs: options.rateLimitDelay || 2000,  // 2s entre entités
      entityDelayMs: options.entityDelay || 3000,        // 3s entre types d'entités
      maxConcurrentRequests: options.maxConcurrent || 1, // 1 seule requête à la fois

      // Retry
      maxRetries: options.maxRetries || 3,
      retryDelayMs: options.retryDelay || 2000,

      // Pagination - TOUS les transports sans limite pratique
      transportPageSize: options.transportPageSize || 100,
      companyPageSize: options.companyPageSize || 500,
      maxPages: options.maxPages || 1000,  // 1000 pages = 100 000 transports max (illimité en pratique)

      // Organization/Connection context
      organizationId: options.organizationId,
      connectionId: options.connectionId,

      // Skip initial full sync si données récentes
      skipInitialSyncIfFresh: options.skipInitialSyncIfFresh !== false,
      freshnessThresholdMs: options.freshnessThreshold || 60 * 60 * 1000  // 1 heure
    };

    // Collections
    this.collections = {
      transports: db.collection(COLLECTIONS.TRANSPORTS),
      companies: db.collection(COLLECTIONS.COMPANIES),
      vehicles: db.collection(COLLECTIONS.VEHICLES),
      trailers: db.collection(COLLECTIONS.TRAILERS),
      truckers: db.collection(COLLECTIONS.TRUCKERS),
      contacts: db.collection(COLLECTIONS.CONTACTS),
      invoices: db.collection(COLLECTIONS.INVOICES),
      addresses: db.collection(COLLECTIONS.ADDRESSES),
      counters: db.collection(COLLECTIONS.COUNTERS),
      syncState: db.collection(COLLECTIONS.SYNC_STATE)
    };

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.intervals = {};
    this.lastSyncTimes = {};
    this.syncInProgress = {};
  }

  /**
   * Démarrer la synchronisation périodique
   */
  async start() {
    if (this.isRunning) {
      console.log('[DATALAKE] Sync already running');
      return;
    }

    this.isRunning = true;
    console.log('[DATALAKE] Starting Data Lake sync service...');
    console.log(`[DATALAKE] Config: incremental=${this.config.incrementalIntervalMs}ms, periodic=${this.config.periodicIntervalMs}ms, full=${this.config.fullSyncIntervalMs}ms`);
    console.log(`[DATALAKE] Rate limiting: entityDelay=${this.config.entityDelayMs}ms, maxPages=${this.config.maxPages}`);

    // Initialiser l'état de sync
    await this.initializeSyncState();

    // ⚠️ RATE LIMITING: Skip full sync initial si données récentes
    const shouldRunInitialSync = await this._shouldRunInitialFullSync();

    if (shouldRunInitialSync) {
      console.log('[DATALAKE] Running initial full sync...');
      await this.runFullSync();
    } else {
      console.log('[DATALAKE] ⏭️ Skipping initial full sync (data is fresh < 1h)');
    }

    // Démarrer les syncs périodiques
    this.startIncrementalSync();
    this.startPeriodicSync();
    this.startFullSync();

    console.log('[DATALAKE] Sync service started successfully');
  }

  /**
   * Vérifier si on doit exécuter le full sync initial
   * Skip si les données sont récentes (< 1h par défaut)
   */
  async _shouldRunInitialFullSync() {
    if (!this.config.skipInitialSyncIfFresh) {
      return true; // Toujours exécuter si option désactivée
    }

    try {
      const syncState = await this.getSyncState();
      if (!syncState || !syncState.lastFullSyncAt) {
        console.log('[DATALAKE] No previous full sync found, will run initial sync');
        return true;
      }

      const lastFullSync = new Date(syncState.lastFullSyncAt);
      const timeSinceLastSync = Date.now() - lastFullSync.getTime();

      if (timeSinceLastSync < this.config.freshnessThresholdMs) {
        console.log(`[DATALAKE] Last full sync was ${Math.round(timeSinceLastSync / 60000)} minutes ago`);
        return false;
      }

      console.log(`[DATALAKE] Last full sync was ${Math.round(timeSinceLastSync / 60000)} minutes ago (> threshold)`);
      return true;

    } catch (error) {
      console.warn('[DATALAKE] Error checking sync freshness, will run initial sync:', error.message);
      return true;
    }
  }

  /**
   * Arrêter la synchronisation
   */
  stop() {
    console.log('[DATALAKE] Stopping Data Lake sync service...');

    this.isRunning = false;

    // Arrêter tous les intervals
    Object.values(this.intervals).forEach(interval => {
      if (interval) clearInterval(interval);
    });
    this.intervals = {};

    console.log('[DATALAKE] Sync service stopped');
  }

  /**
   * Mettre en pause la synchronisation
   */
  pause(reason = 'Manual pause') {
    this.isPaused = true;
    this.updateSyncState({ isPaused: true, pausedReason: reason });
    console.log(`[DATALAKE] Sync paused: ${reason}`);
  }

  /**
   * Reprendre la synchronisation
   */
  resume() {
    this.isPaused = false;
    this.updateSyncState({ isPaused: false, pausedReason: null });
    console.log('[DATALAKE] Sync resumed');
  }

  /**
   * Initialiser l'état de synchronisation
   */
  async initializeSyncState() {
    const now = new Date();

    await this.collections.syncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId
      },
      {
        $setOnInsert: {
          organizationId: this.config.organizationId,
          connectionId: this.config.connectionId,
          entities: {
            transports: { status: 'idle', totalCount: 0, syncedCount: 0 },
            companies: { status: 'idle', totalCount: 0, syncedCount: 0 },
            vehicles: { status: 'idle', totalCount: 0, syncedCount: 0 },
            trailers: { status: 'idle', totalCount: 0, syncedCount: 0 },
            truckers: { status: 'idle', totalCount: 0, syncedCount: 0 },
            contacts: { status: 'idle', totalCount: 0, syncedCount: 0 },
            invoices: { status: 'idle', totalCount: 0, syncedCount: 0 },
            addresses: { status: 'idle', totalCount: 0, syncedCount: 0 },
            counters: { status: 'idle' }
          },
          errors: [],
          metrics: {
            avgSyncDuration: 0,
            lastSyncDuration: 0,
            apiCallsTotal: 0,
            apiCallsLastHour: 0,
            errorsLastHour: 0
          },
          status: 'idle',
          isPaused: false,
          createdAt: now
        },
        $set: { updatedAt: now }
      },
      { upsert: true }
    );
  }

  /**
   * Démarrer la sync incrémentale (25s)
   * Focus: transports modifiés, counters
   */
  startIncrementalSync() {
    if (!this.config.enableIncrementalSync) {
      console.log('[DATALAKE] Incremental sync DISABLED - using webhooks only');
      return;
    }

    console.log(`[DATALAKE] Starting incremental sync every ${this.config.incrementalIntervalMs / 1000}s`);
    this.intervals.incremental = setInterval(async () => {
      if (this.isPaused) return;
      await this.runIncrementalSync();
    }, this.config.incrementalIntervalMs);
  }

  /**
   * Démarrer la sync périodique (5min)
   * Focus: companies, vehicles, truckers
   */
  startPeriodicSync() {
    this.intervals.periodic = setInterval(async () => {
      if (this.isPaused) return;
      await this.runPeriodicSync();
    }, this.config.periodicIntervalMs);
  }

  /**
   * Démarrer la full sync (1h)
   */
  startFullSync() {
    this.intervals.full = setInterval(async () => {
      if (this.isPaused) return;
      await this.runFullSync();
    }, this.config.fullSyncIntervalMs);
  }

  /**
   * Sync incrémentale - données critiques temps réel
   */
  async runIncrementalSync() {
    if (this.syncInProgress.incremental) {
      console.log('[DATALAKE] Incremental sync already in progress, skipping...');
      return;
    }

    this.syncInProgress.incremental = true;
    const startTime = Date.now();

    try {
      console.log('[DATALAKE] Running incremental sync...');

      // 1. Counters (temps réel, rapide)
      await this.syncCounters();

      // 2. Transports modifiés récemment
      await this.syncTransportsIncremental();

      const duration = Date.now() - startTime;
      await this.recordSyncMetrics('incremental', duration, true);

      console.log(`[DATALAKE] Incremental sync completed in ${duration}ms`);

    } catch (error) {
      console.error('[DATALAKE] Incremental sync error:', error.message);
      await this.recordSyncError('incremental', error);
    } finally {
      this.syncInProgress.incremental = false;
    }
  }

  /**
   * Sync périodique - données de référence
   * 🚀 OPTIMISÉ: vehicles/truckers extraits des transports, pas d'appels API séparés
   */
  async runPeriodicSync() {
    if (this.syncInProgress.periodic) {
      console.log('[DATALAKE] Periodic sync already in progress, skipping...');
      return;
    }

    this.syncInProgress.periodic = true;
    const startTime = Date.now();

    try {
      console.log('[DATALAKE] Running periodic sync (OPTIMIZED - no vehicles/truckers API calls)...');

      // Companies/Carriers uniquement - véhicules/chauffeurs extraits des transports
      await this.syncCompanies();

      // Recalculer les stats carriers depuis MongoDB (pas d'appel API)
      await this.computeCarrierStatsFromTransports();

      const duration = Date.now() - startTime;
      await this.recordSyncMetrics('periodic', duration, true);

      console.log(`[DATALAKE] Periodic sync completed in ${duration}ms (1 API call instead of 3)`);

    } catch (error) {
      console.error('[DATALAKE] Periodic sync error:', error.message);
      await this.recordSyncError('periodic', error);
    } finally {
      this.syncInProgress.periodic = false;
    }
  }

  /**
   * Full sync - toutes les entités
   */
  async runFullSync() {
    if (this.syncInProgress.full) {
      console.log('[DATALAKE] Full sync already in progress, skipping...');
      return;
    }

    this.syncInProgress.full = true;
    const startTime = Date.now();

    try {
      console.log('[DATALAKE] Running FULL sync...');
      await this.updateSyncState({ status: 'syncing' });

      // Ordre de sync OPTIMISÉ - véhicules/chauffeurs/adresses extraits des transports
      // ⚠️ RATE LIMITING: Délais importants entre chaque entité
      // 🚀 OPTIMISATION: On sync transports EN PREMIER puis on extrait vehicles/truckers/addresses
      const syncOrder = [
        { name: 'counters', fn: () => this.syncCounters() },
        { name: 'companies', fn: () => this.syncCompanies() },
        { name: 'transports', fn: () => this.syncTransportsFullWithExtraction() },
        { name: 'trailers', fn: () => this.syncTrailers() },
        { name: 'invoices', fn: () => this.syncInvoices() }
        // ❌ SUPPRIMÉ: vehicles, truckers, contacts, addresses - extraits des transports
      ];

      for (let i = 0; i < syncOrder.length; i++) {
        const { name, fn } = syncOrder[i];
        try {
          console.log(`[DATALAKE] Syncing ${name} (${i + 1}/${syncOrder.length})...`);
          await fn();

          // ⚠️ RATE LIMITING: Délai entre entités (2s par défaut)
          if (i < syncOrder.length - 1) {
            console.log(`[DATALAKE] Waiting ${this.config.entityDelayMs}ms before next entity...`);
            await this.delay(this.config.entityDelayMs);
          }
        } catch (error) {
          console.error(`[DATALAKE] Error syncing ${name}:`, error.message);
          await this.recordEntityError(name, error);
        }
      }

      const duration = Date.now() - startTime;
      await this.recordSyncMetrics('full', duration, true);
      await this.updateSyncState({
        status: 'idle',
        lastFullSyncAt: new Date(),
        'metrics.lastSuccessfulSync': new Date()
      });

      console.log(`[DATALAKE] FULL sync completed in ${duration}ms`);

    } catch (error) {
      console.error('[DATALAKE] Full sync error:', error.message);
      await this.recordSyncError('full', error);
      await this.updateSyncState({ status: 'error' });
    } finally {
      this.syncInProgress.full = false;
    }
  }

  // ==================== ENTITY SYNCERS ====================

  /**
   * Sync des compteurs (temps réel)
   */
  async syncCounters() {
    try {
      const counters = await this.connector.getCounters();

      await this.collections.counters.updateOne(
        {
          organizationId: this.config.organizationId,
          connectionId: this.config.connectionId
        },
        {
          $set: {
            counters,
            syncedAt: new Date()
          }
        },
        { upsert: true }
      );

      this.lastSyncTimes.counters = new Date();
      await this.updateEntityState('counters', { status: 'idle', lastSyncAt: new Date() });

    } catch (error) {
      console.error('[DATALAKE] Error syncing counters:', error.message);
      throw error;
    }
  }

  /**
   * Sync incrémentale des transports
   */
  async syncTransportsIncremental() {
    const lastSync = this.lastSyncTimes.transports || new Date(Date.now() - 5 * 60 * 1000);

    try {
      await this.updateEntityState('transports', { status: 'syncing' });

      // Récupérer les transports récents (dernières 5 min de marge)
      const result = await this.connector.getTransports({
        ordering: '-updated',
        limit: this.config.transportPageSize
      });

      // Filtrer ceux qui ont changé via checksum
      const changed = await this.filterChangedTransports(result.results);

      if (changed.length > 0) {
        await this.bulkUpsertTransports(changed);
        console.log(`[DATALAKE] Incremental: ${changed.length} transports updated`);
      }

      this.lastSyncTimes.transports = new Date();
      await this.updateEntityState('transports', {
        status: 'idle',
        lastSyncAt: new Date(),
        syncedCount: changed.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing transports (incremental):', error.message);
      await this.updateEntityState('transports', { status: 'error' });
      throw error;
    }
  }

  /**
   * Full sync des transports avec pagination
   */
  async syncTransportsFull() {
    try {
      await this.updateEntityState('transports', { status: 'syncing' });

      // Utiliser la pagination automatique du connecteur
      const allTransports = await this.connector.getAllTransportsWithPagination({
        ordering: '-created'
      }, this.config.maxPages);

      // Bulk upsert
      await this.bulkUpsertTransports(allTransports);

      this.lastSyncTimes.transports = new Date();
      await this.updateEntityState('transports', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: allTransports.length,
        syncedCount: allTransports.length
      });

      console.log(`[DATALAKE] Full: ${allTransports.length} transports synced`);

    } catch (error) {
      console.error('[DATALAKE] Error syncing transports (full):', error.message);
      await this.updateEntityState('transports', { status: 'error' });
      throw error;
    }
  }

  /**
   * 🚀 OPTIMISÉ: Full sync transports + extraction véhicules/chauffeurs/adresses
   * Économise 4 appels API séparés en extrayant les données depuis les transports
   */
  async syncTransportsFullWithExtraction() {
    try {
      await this.updateEntityState('transports', { status: 'syncing' });

      // Utiliser la pagination automatique du connecteur
      const allTransports = await this.connector.getAllTransportsWithPagination({
        ordering: '-created'
      }, this.config.maxPages);

      // Bulk upsert des transports
      await this.bulkUpsertTransports(allTransports);

      // 🚀 EXTRACTION: Véhicules, chauffeurs, adresses depuis les transports
      console.log('[DATALAKE] 🚀 Extracting vehicles/truckers/addresses from transports...');
      const extracted = this.extractEntitiesFromTransports(allTransports);

      // Sauvegarder les entités extraites
      if (extracted.vehicles.length > 0) {
        await this.bulkUpsertVehiclesFromTransports(extracted.vehicles);
        console.log(`[DATALAKE] Extracted ${extracted.vehicles.length} vehicles from transports`);
      }

      if (extracted.truckers.length > 0) {
        await this.bulkUpsertTruckersFromTransports(extracted.truckers);
        console.log(`[DATALAKE] Extracted ${extracted.truckers.length} truckers from transports`);
      }

      if (extracted.addresses.length > 0) {
        await this.bulkUpsertAddressesFromTransports(extracted.addresses);
        console.log(`[DATALAKE] Extracted ${extracted.addresses.length} addresses from transports`);
      }

      // Calculer et sauvegarder les stats des carriers depuis MongoDB
      await this.computeCarrierStatsFromTransports();

      this.lastSyncTimes.transports = new Date();
      await this.updateEntityState('transports', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: allTransports.length,
        syncedCount: allTransports.length
      });

      console.log(`[DATALAKE] Full+Extraction: ${allTransports.length} transports, ${extracted.vehicles.length} vehicles, ${extracted.truckers.length} truckers`);

    } catch (error) {
      console.error('[DATALAKE] Error syncing transports (full+extraction):', error.message);
      await this.updateEntityState('transports', { status: 'error' });
      throw error;
    }
  }

  /**
   * 🚀 Extraire véhicules, chauffeurs et adresses depuis les transports
   * Évite 4 appels API séparés à /vehicles/, /manager-truckers/, /contacts/, /addresses/
   */
  extractEntitiesFromTransports(transports) {
    const vehiclesMap = new Map();
    const truckersMap = new Map();
    const addressesMap = new Map();

    for (const t of transports) {
      // Extraire véhicule depuis transportMeans
      if (t.transportMeans?.vehicle?.externalId) {
        const v = t.transportMeans.vehicle;
        if (!vehiclesMap.has(v.externalId)) {
          vehiclesMap.set(v.externalId, {
            externalId: v.externalId,
            licensePlate: v.licensePlate,
            type: v.type,
            source: 'transport_extraction',
            lastSeenInTransport: t.externalId,
            lastSeenAt: t.updatedAt || t.createdAt
          });
        }
      }

      // Extraire chauffeur depuis transportMeans
      if (t.transportMeans?.trucker?.externalId) {
        const tr = t.transportMeans.trucker;
        if (!truckersMap.has(tr.externalId)) {
          truckersMap.set(tr.externalId, {
            externalId: tr.externalId,
            name: tr.name,
            phone: tr.phone,
            source: 'transport_extraction',
            carrierPk: t.carrier?.externalId ? parseInt(t.carrier.externalId) : null,
            lastSeenInTransport: t.externalId,
            lastSeenAt: t.updatedAt || t.createdAt
          });
        }
      }

      // Extraire adresses pickup et delivery
      if (t.pickup?.address?.city) {
        const addr = t.pickup.address;
        const key = `${addr.city}-${addr.postalCode}-${addr.street || ''}`.toLowerCase();
        if (!addressesMap.has(key)) {
          addressesMap.set(key, {
            key,
            name: addr.name,
            street: addr.street,
            city: addr.city,
            postalCode: addr.postalCode,
            country: addr.country,
            location: addr.location,
            isOrigin: true,
            source: 'transport_extraction'
          });
        }
      }

      if (t.delivery?.address?.city) {
        const addr = t.delivery.address;
        const key = `${addr.city}-${addr.postalCode}-${addr.street || ''}`.toLowerCase();
        if (!addressesMap.has(key)) {
          addressesMap.set(key, {
            key,
            name: addr.name,
            street: addr.street,
            city: addr.city,
            postalCode: addr.postalCode,
            country: addr.country,
            location: addr.location,
            isDestination: true,
            source: 'transport_extraction'
          });
        }
      }
    }

    return {
      vehicles: Array.from(vehiclesMap.values()),
      truckers: Array.from(truckersMap.values()),
      addresses: Array.from(addressesMap.values())
    };
  }

  /**
   * 🚀 Calculer les stats des carriers depuis les transports en MongoDB
   * Évite N appels API à /transports/?carrier=X
   */
  async computeCarrierStatsFromTransports() {
    try {
      console.log('[DATALAKE] Computing carrier stats from MongoDB...');

      // Agrégation MongoDB pour calculer les stats par carrier
      const stats = await this.collections.transports.aggregate([
        {
          $match: {
            organizationId: this.config.organizationId,
            'carrier.externalId': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: '$carrier.externalId',
            carrierName: { $first: '$carrier.name' },
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
            },
            lastOrderAt: { $max: '$createdAt' },
            totalRevenue: { $sum: { $ifNull: ['$pricing.totalPrice', 0] } }
          }
        }
      ]).toArray();

      // Mettre à jour les companies avec leurs stats
      for (const stat of stats) {
        if (stat._id) {
          const onTimeRate = stat.totalOrders > 0
            ? Math.round((stat.completedOrders / stat.totalOrders) * 100)
            : 0;

          await this.collections.companies.updateOne(
            { dashdocPk: parseInt(stat._id) },
            {
              $set: {
                'stats.totalOrders': stat.totalOrders,
                'stats.completedOrders': stat.completedOrders,
                'stats.lastOrderAt': stat.lastOrderAt,
                'stats.totalRevenue': stat.totalRevenue,
                'stats.onTimeRate': onTimeRate,
                'stats.computedAt': new Date()
              }
            }
          );
        }
      }

      console.log(`[DATALAKE] Computed stats for ${stats.length} carriers`);

    } catch (error) {
      console.error('[DATALAKE] Error computing carrier stats:', error.message);
      // Non-blocking - on continue même si ça échoue
    }
  }

  /**
   * Bulk upsert véhicules extraits des transports
   */
  async bulkUpsertVehiclesFromTransports(vehicles) {
    if (!vehicles.length) return;

    const operations = vehicles.map(v => ({
      updateOne: {
        filter: { dashdocPk: parseInt(v.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(v.externalId),
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            licensePlate: v.licensePlate,
            type: v.type,
            extractedFrom: 'transports',
            lastSeenInTransport: v.lastSeenInTransport,
            lastSeenAt: v.lastSeenAt ? new Date(v.lastSeenAt) : new Date(),
            syncedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.vehicles.bulkWrite(operations, { ordered: false });
  }

  /**
   * Bulk upsert chauffeurs extraits des transports
   */
  async bulkUpsertTruckersFromTransports(truckers) {
    if (!truckers.length) return;

    const operations = truckers.map(t => ({
      updateOne: {
        filter: { dashdocPk: parseInt(t.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(t.externalId),
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            name: t.name,
            phone: t.phone,
            carrierPk: t.carrierPk,
            extractedFrom: 'transports',
            lastSeenInTransport: t.lastSeenInTransport,
            lastSeenAt: t.lastSeenAt ? new Date(t.lastSeenAt) : new Date(),
            syncedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.truckers.bulkWrite(operations, { ordered: false });
  }

  /**
   * Bulk upsert adresses extraites des transports
   */
  async bulkUpsertAddressesFromTransports(addresses) {
    if (!addresses.length) return;

    const operations = addresses.map(a => ({
      updateOne: {
        filter: {
          organizationId: this.config.organizationId,
          city: a.city,
          postalCode: a.postalCode
        },
        update: {
          $set: {
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            name: a.name,
            street: a.street,
            city: a.city,
            postalCode: a.postalCode,
            country: a.country,
            location: a.location,
            isOrigin: a.isOrigin || false,
            isDestination: a.isDestination || false,
            extractedFrom: 'transports',
            syncedAt: new Date()
          },
          $setOnInsert: {
            createdAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.addresses.bulkWrite(operations, { ordered: false });
  }

  /**
   * Sync des companies/carriers
   */
  async syncCompanies() {
    try {
      await this.updateEntityState('companies', { status: 'syncing' });

      const allCompanies = await this.connector.getAllCarriersWithPagination({}, 50);

      await this.bulkUpsertCompanies(allCompanies);

      this.lastSyncTimes.companies = new Date();
      await this.updateEntityState('companies', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: allCompanies.length,
        syncedCount: allCompanies.length
      });

      console.log(`[DATALAKE] ${allCompanies.length} companies synced`);

    } catch (error) {
      console.error('[DATALAKE] Error syncing companies:', error.message);
      await this.updateEntityState('companies', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des véhicules
   */
  async syncVehicles() {
    try {
      await this.updateEntityState('vehicles', { status: 'syncing' });

      const result = await this.connector.getVehicles({ limit: 1000 });
      await this.bulkUpsertVehicles(result.results);

      this.lastSyncTimes.vehicles = new Date();
      await this.updateEntityState('vehicles', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing vehicles:', error.message);
      await this.updateEntityState('vehicles', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des remorques
   */
  async syncTrailers() {
    try {
      await this.updateEntityState('trailers', { status: 'syncing' });

      const result = await this.connector.getTrailers({ limit: 1000 });
      await this.bulkUpsertTrailers(result.results);

      this.lastSyncTimes.trailers = new Date();
      await this.updateEntityState('trailers', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing trailers:', error.message);
      await this.updateEntityState('trailers', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des chauffeurs
   */
  async syncTruckers() {
    try {
      await this.updateEntityState('truckers', { status: 'syncing' });

      const result = await this.connector.getTruckers({ limit: 1000 });
      await this.bulkUpsertTruckers(result.results);

      this.lastSyncTimes.truckers = new Date();
      await this.updateEntityState('truckers', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing truckers:', error.message);
      await this.updateEntityState('truckers', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des contacts
   */
  async syncContacts() {
    try {
      await this.updateEntityState('contacts', { status: 'syncing' });

      const result = await this.connector.getContacts({ limit: 1000 });
      await this.bulkUpsertContacts(result.results);

      this.lastSyncTimes.contacts = new Date();
      await this.updateEntityState('contacts', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing contacts:', error.message);
      await this.updateEntityState('contacts', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des factures
   */
  async syncInvoices() {
    try {
      await this.updateEntityState('invoices', { status: 'syncing' });

      const result = await this.connector.getInvoices({ limit: 500 });
      await this.bulkUpsertInvoices(result.results);

      this.lastSyncTimes.invoices = new Date();
      await this.updateEntityState('invoices', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing invoices:', error.message);
      await this.updateEntityState('invoices', { status: 'error' });
      throw error;
    }
  }

  /**
   * Sync des adresses
   */
  async syncAddresses() {
    try {
      await this.updateEntityState('addresses', { status: 'syncing' });

      const result = await this.connector.getAddresses({ limit: 1000 });
      await this.bulkUpsertAddresses(result.results);

      this.lastSyncTimes.addresses = new Date();
      await this.updateEntityState('addresses', {
        status: 'idle',
        lastSyncAt: new Date(),
        totalCount: result.count,
        syncedCount: result.results.length
      });

    } catch (error) {
      console.error('[DATALAKE] Error syncing addresses:', error.message);
      await this.updateEntityState('addresses', { status: 'error' });
      throw error;
    }
  }

  // ==================== BULK UPSERT METHODS ====================

  async bulkUpsertTransports(transports) {
    if (!transports.length) return;

    const operations = transports.map(t => {
      const checksum = this.generateChecksum(t, ['status', 'updatedAt', 'pricing']);

      return {
        updateOne: {
          filter: { dashdocUid: t.externalId },
          update: {
            $set: {
              dashdocUid: t.externalId,
              sequentialId: t.sequentialId,
              remoteId: t.remoteId,
              organizationId: this.config.organizationId,
              connectionId: this.config.connectionId,
              _rawData: t._raw,
              status: t.status,
              dashdocStatus: t._raw?.status,
              globalStatus: t.globalStatus,
              creationMethod: t.creationMethod,
              createdAt: t.createdAt ? new Date(t.createdAt) : null,
              updatedAt: t.updatedAt ? new Date(t.updatedAt) : null,
              pickup: t.pickup,
              delivery: t.delivery,
              cargo: t.cargo,
              carrier: t.carrier,
              transportMeans: t.transportMeans,
              pricing: t.pricing,
              metrics: t.metrics,
              documents: t.documents,
              tags: t.tags,
              trackingId: t.trackingId,
              parentTransportId: t.parentTransportId,
              syncedAt: new Date(),
              checksum
            },
            $inc: { syncVersion: 1 }
          },
          upsert: true
        }
      };
    });

    await this.collections.transports.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertCompanies(companies) {
    if (!companies.length) return;

    const operations = companies.map(c => {
      const checksum = this.generateChecksum(c, ['name', 'email', 'phone', 'address']);

      return {
        updateOne: {
          filter: { dashdocPk: parseInt(c.externalId) },
          update: {
            $set: {
              dashdocPk: parseInt(c.externalId),
              remoteId: c.remoteId,
              organizationId: this.config.organizationId,
              connectionId: this.config.connectionId,
              _rawData: c,
              name: c.companyName,
              legalName: c.legalName,
              siret: c.siret,
              siren: c.siren,
              vatNumber: c.vatNumber,
              email: c.email,
              phone: c.phone,
              website: c.website,
              address: c.address,
              isCarrier: true,
              isShipper: false,
              isVerified: c.isVerified,
              accountType: c.accountType,
              logo: c.logo,
              tags: c.tags,
              country: c.country,
              syncedAt: new Date(),
              checksum
            },
            $inc: { syncVersion: 1 }
          },
          upsert: true
        }
      };
    });

    await this.collections.companies.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertVehicles(vehicles) {
    if (!vehicles.length) return;

    const operations = vehicles.map(v => ({
      updateOne: {
        filter: { dashdocPk: parseInt(v.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(v.externalId),
            dashdocUid: v.externalId,
            remoteId: v.remoteId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: v,
            licensePlate: v.licensePlate,
            type: v.type,
            brand: v.brand,
            model: v.model,
            payload: v.payload,
            volume: v.volume,
            hasLiftgate: v.hasLiftgate,
            isRefrigerated: v.isRefrigerated,
            isAdr: v.isAdr,
            tags: v.tags,
            fleetNumber: v.fleetNumber,
            companyPk: v.companyId ? parseInt(v.companyId) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.vehicles.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertTrailers(trailers) {
    if (!trailers.length) return;

    const operations = trailers.map(t => ({
      updateOne: {
        filter: { dashdocPk: parseInt(t.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(t.externalId),
            remoteId: t.remoteId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: t,
            licensePlate: t.licensePlate,
            type: t.type,
            payload: t.payload,
            volume: t.volume,
            hasLiftgate: t.hasLiftgate,
            isRefrigerated: t.isRefrigerated,
            tags: t.tags,
            fleetNumber: t.fleetNumber,
            companyPk: t.companyId ? parseInt(t.companyId) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.trailers.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertTruckers(truckers) {
    if (!truckers.length) return;

    const operations = truckers.map(t => ({
      updateOne: {
        filter: { dashdocPk: parseInt(t.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(t.externalId),
            remoteId: t.remoteId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: t,
            firstName: t.firstName,
            lastName: t.lastName,
            email: t.email,
            phone: t.phone,
            drivingLicense: t.drivingLicense,
            drivingLicenseDeadline: t.drivingLicenseDeadline ? new Date(t.drivingLicenseDeadline) : null,
            adrLicense: t.adrLicense,
            adrLicenseDeadline: t.adrLicenseDeadline ? new Date(t.adrLicenseDeadline) : null,
            driverCard: t.driverCard,
            driverCardDeadline: t.driverCardDeadline ? new Date(t.driverCardDeadline) : null,
            isActive: t.isActive,
            carrierPk: t.companyId ? parseInt(t.companyId) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.truckers.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertContacts(contacts) {
    if (!contacts.length) return;

    const operations = contacts.map(c => ({
      updateOne: {
        filter: { dashdocUid: c.externalId },
        update: {
          $set: {
            dashdocUid: c.externalId,
            remoteId: c.remoteId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: c,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email,
            phone: c.phone,
            fax: c.fax,
            language: c.language,
            companyPk: c.companyId ? parseInt(c.companyId) : null,
            companyName: c.companyName,
            jobs: c.jobs,
            preferences: c.preferences,
            createdAt: c.createdAt ? new Date(c.createdAt) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.contacts.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertInvoices(invoices) {
    if (!invoices.length) return;

    const operations = invoices.map(i => ({
      updateOne: {
        filter: { dashdocUid: i.externalId },
        update: {
          $set: {
            dashdocUid: i.externalId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: i,
            invoiceNumber: i.invoiceNumber,
            status: i.status,
            totalTaxFree: i.totalTaxFree,
            totalWithTax: i.totalWithTax,
            currency: i.currency,
            issueDate: i.issueDate ? new Date(i.issueDate) : null,
            dueDate: i.dueDate ? new Date(i.dueDate) : null,
            paidAt: i.paidAt ? new Date(i.paidAt) : null,
            debtor: i.debtor,
            creditor: i.creditor,
            lines: i.lines,
            fileUrl: i.fileUrl,
            createdAt: i.createdAt ? new Date(i.createdAt) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.invoices.bulkWrite(operations, { ordered: false });
  }

  async bulkUpsertAddresses(addresses) {
    if (!addresses.length) return;

    const operations = addresses.map(a => ({
      updateOne: {
        filter: { dashdocPk: parseInt(a.externalId) },
        update: {
          $set: {
            dashdocPk: parseInt(a.externalId),
            remoteId: a.remoteId,
            organizationId: this.config.organizationId,
            connectionId: this.config.connectionId,
            _rawData: a,
            name: a.name,
            street: a.street,
            city: a.city,
            postalCode: a.postalCode,
            country: a.country,
            location: a.location,
            radius: a.radius,
            instructions: a.instructions,
            isCarrier: a.isCarrier,
            isShipper: a.isShipper,
            isOrigin: a.isOrigin,
            isDestination: a.isDestination,
            companyPk: a.companyId ? parseInt(a.companyId) : null,
            companyName: a.companyName,
            createdAt: a.createdAt ? new Date(a.createdAt) : null,
            syncedAt: new Date()
          },
          $inc: { syncVersion: 1 }
        },
        upsert: true
      }
    }));

    await this.collections.addresses.bulkWrite(operations, { ordered: false });
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Filtrer les transports qui ont réellement changé
   */
  async filterChangedTransports(transports) {
    const uids = transports.map(t => t.externalId);

    const existing = await this.collections.transports
      .find({ dashdocUid: { $in: uids } })
      .project({ dashdocUid: 1, checksum: 1 })
      .toArray();

    const existingMap = new Map(existing.map(e => [e.dashdocUid, e.checksum]));

    return transports.filter(t => {
      const newChecksum = this.generateChecksum(t, ['status', 'updatedAt', 'pricing']);
      const oldChecksum = existingMap.get(t.externalId);
      return newChecksum !== oldChecksum;
    });
  }

  /**
   * Générer un checksum pour détecter les changements
   */
  generateChecksum(entity, fields) {
    const data = {};
    for (const field of fields) {
      data[field] = this.getNestedValue(entity, field);
    }
    return crypto
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Obtenir une valeur imbriquée
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((o, p) => (o ? o[p] : undefined), obj);
  }

  /**
   * Mettre à jour l'état de sync global
   */
  async updateSyncState(update) {
    await this.collections.syncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId
      },
      { $set: { ...update, updatedAt: new Date() } }
    );
  }

  /**
   * Mettre à jour l'état d'une entité
   */
  async updateEntityState(entity, update) {
    const setUpdate = {};
    for (const [key, value] of Object.entries(update)) {
      setUpdate[`entities.${entity}.${key}`] = value;
    }

    await this.collections.syncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId
      },
      { $set: { ...setUpdate, updatedAt: new Date() } }
    );
  }

  /**
   * Enregistrer une erreur
   */
  async recordSyncError(syncType, error) {
    await this.collections.syncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId
      },
      {
        $push: {
          errors: {
            $each: [{
              entity: syncType,
              error: error.message,
              occurredAt: new Date(),
              retryCount: 0
            }],
            $slice: -50 // Garder les 50 dernières erreurs
          }
        },
        $inc: { 'metrics.errorsLastHour': 1 }
      }
    );
  }

  /**
   * Enregistrer une erreur par entité
   */
  async recordEntityError(entity, error) {
    await this.recordSyncError(entity, error);
    await this.updateEntityState(entity, { status: 'error' });
  }

  /**
   * Enregistrer les métriques de sync
   */
  async recordSyncMetrics(syncType, duration, success) {
    const update = {
      'metrics.lastSyncDuration': duration,
      [`last${syncType.charAt(0).toUpperCase() + syncType.slice(1)}SyncAt`]: new Date()
    };

    if (success) {
      update['metrics.lastSuccessfulSync'] = new Date();
    }

    await this.collections.syncState.updateOne(
      {
        organizationId: this.config.organizationId,
        connectionId: this.config.connectionId
      },
      {
        $set: update,
        $inc: { 'metrics.apiCallsTotal': 1 }
      }
    );
  }

  /**
   * Obtenir l'état de sync
   */
  async getSyncState() {
    return this.collections.syncState.findOne({
      organizationId: this.config.organizationId,
      connectionId: this.config.connectionId
    });
  }

  /**
   * Déclencher une sync manuelle
   * @param {string} type - 'full', 'incremental', 'periodic' ou 'transports'
   */
  async triggerManualSync(type = 'incremental') {
    console.log(`[DATALAKE] Manual ${type} sync triggered`);

    switch (type) {
      case 'full':
        return this.runFullSync();
      case 'incremental':
        return this.runIncrementalSync();
      case 'periodic':
        return this.runPeriodicSync();
      case 'transports':
        return this.syncTransportsFull();
      default:
        throw new Error(`Unknown sync type: ${type}`);
    }
  }

  /**
   * Obtenir les statistiques du Data Lake
   */
  async getStats() {
    const [transports, companies, vehicles, trailers, truckers, contacts, invoices, addresses] = await Promise.all([
      this.collections.transports.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.companies.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.vehicles.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.trailers.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.truckers.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.contacts.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.invoices.countDocuments({ organizationId: this.config.organizationId }),
      this.collections.addresses.countDocuments({ organizationId: this.config.organizationId })
    ]);

    const syncState = await this.getSyncState();

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      collections: {
        transports,
        companies,
        vehicles,
        trailers,
        truckers,
        contacts,
        invoices,
        addresses
      },
      lastSync: {
        full: syncState?.lastFullSyncAt,
        incremental: syncState?.lastIncrementalSyncAt
      },
      metrics: syncState?.metrics || {}
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = DatalakeSyncService;
