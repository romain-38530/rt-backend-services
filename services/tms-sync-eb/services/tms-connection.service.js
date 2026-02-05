/**
 * TMS Connection Service
 * Gere les connexions aux differents TMS clients (Dashdoc, etc.)
 * Stocke les configurations et execute les synchronisations
 *
 * ⚠️ ARCHITECTURE DATA LAKE:
 * Ce service supporte la lecture depuis le Data Lake MongoDB
 * - Compteurs temps réel depuis dashdoc_counters
 * - Données synchronisées depuis dashdoc_* collections
 */

const DashdocConnector = require('../connectors/dashdoc.connector');

class TMSConnectionService {
  constructor(db) {
    this.db = db;
    this.connectionsCollection = null;
    this.syncLogsCollection = null;
    this.datalakeReaders = null;
  }

  /**
   * Configurer les Data Lake readers
   * @param {Object} readers - Readers Data Lake
   */
  setDatalakeReaders(readers) {
    this.datalakeReaders = readers;
    console.log('[TMS Connection] Data Lake readers configured');
  }

  async init() {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    this.connectionsCollection = this.db.collection('tmsConnections');
    this.syncLogsCollection = this.db.collection('tmsSyncLogs');

    // Creer les index
    await this.connectionsCollection.createIndex({ organizationId: 1 });
    await this.connectionsCollection.createIndex({ tmsType: 1 });
    await this.connectionsCollection.createIndex({ isActive: 1 });
    await this.syncLogsCollection.createIndex({ connectionId: 1, startedAt: -1 });

    // Creer les index pour la collection orders (filtrage avance)
    const ordersCollection = this.db.collection('orders');

    // Index composite pour filtrage business
    await ordersCollection.createIndex({
      externalSource: 1,
      status: 1,
      createdAt: -1
    });

    // Index pour filtrage geolocalise (ville)
    await ordersCollection.createIndex({
      'pickup.address.city': 1,
      'delivery.address.city': 1
    });

    // Index pour filtrage geolocalise (code postal)
    await ordersCollection.createIndex({
      'pickup.address.postalCode': 1,
      'delivery.address.postalCode': 1
    });

    // Index geospatial 2dsphere pour recherche par coordonnees GPS
    await ordersCollection.createIndex({
      'pickup.address.location': '2dsphere'
    });

    await ordersCollection.createIndex({
      'delivery.address.location': '2dsphere'
    });

    // Index pour filtrage marchandises
    await ordersCollection.createIndex({
      'cargo.category': 1,
      'cargo.isDangerous': 1,
      'cargo.isRefrigerated': 1
    });

    // Index pour poids
    await ordersCollection.createIndex({ 'cargo.weight': 1 });

    // Index pour transporteur
    await ordersCollection.createIndex({ 'carrier.externalId': 1 });
    await ordersCollection.createIndex({ 'carrier.name': 1 });

    // Index pour dates
    await ordersCollection.createIndex({ createdAt: -1 });
    await ordersCollection.createIndex({ updatedAt: -1 });
    await ordersCollection.createIndex({ syncedAt: -1 });

    console.log('[TMS CONNECTION SERVICE] Initialized with advanced indexes');
  }

  /**
   * Creer une nouvelle connexion TMS
   */
  async createConnection(data) {
    const connection = {
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      tmsType: data.tmsType, // 'dashdoc', 'transporeon', 'sixfold', etc.
      tmsName: data.tmsName || this.getTMSDisplayName(data.tmsType),

      // Credentials (encrypted in production)
      credentials: {
        apiToken: data.apiToken,
        apiUrl: data.apiUrl || this.getDefaultApiUrl(data.tmsType),
        webhookSecret: data.webhookSecret
      },

      // Configuration sync
      syncConfig: {
        autoSync: data.autoSync !== false,
        syncInterval: data.syncInterval || 30, // minutes
        syncTransports: data.syncTransports !== false,
        syncCompanies: data.syncCompanies !== false,
        syncContacts: data.syncContacts !== false,
        syncVehicles: data.syncVehicles !== false,
        syncInvoices: data.syncInvoices !== false,
        transportLimit: data.transportLimit || 100,
        daysToSync: data.daysToSync || 30
      },

      // Status
      isActive: true,
      connectionStatus: 'pending', // pending, connected, error, disconnected
      lastConnectionTest: null,
      lastSyncAt: null,
      lastSyncStatus: null,
      errorMessage: null,

      // Stats
      stats: {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        lastTransportsCount: 0,
        lastCompaniesCount: 0,
        lastContactsCount: 0
      },

      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await this.connectionsCollection.insertOne(connection);
    connection._id = result.insertedId;

    // Test la connexion immediatement
    await this.testConnection(connection._id.toString());

    return connection;
  }

  /**
   * Obtenir une connexion par ID
   */
  async getConnection(connectionId) {
    const { ObjectId } = require('mongodb');
    return this.connectionsCollection.findOne({ _id: new ObjectId(connectionId) });
  }

  /**
   * Obtenir les connexions d'une organisation
   */
  async getConnectionsByOrganization(organizationId) {
    return this.connectionsCollection.find({ organizationId }).toArray();
  }

  /**
   * Obtenir toutes les connexions actives
   */
  async getActiveConnections() {
    return this.connectionsCollection.find({
      isActive: true,
      connectionStatus: 'connected'
    }).toArray();
  }

  /**
   * Mettre a jour une connexion
   */
  async updateConnection(connectionId, updates) {
    const { ObjectId } = require('mongodb');
    const result = await this.connectionsCollection.findOneAndUpdate(
      { _id: new ObjectId(connectionId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
    return result;
  }

  /**
   * Supprimer une connexion
   */
  async deleteConnection(connectionId) {
    const { ObjectId } = require('mongodb');
    return this.connectionsCollection.deleteOne({ _id: new ObjectId(connectionId) });
  }

  /**
   * Tester une connexion TMS
   */
  async testConnection(connectionId) {
    const { ObjectId } = require('mongodb');
    const connection = await this.connectionsCollection.findOne({ _id: new ObjectId(connectionId) });

    if (!connection) {
      throw new Error('Connection not found');
    }

    let testResult;

    try {
      switch (connection.tmsType) {
        case 'dashdoc':
          const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
            baseUrl: connection.credentials.apiUrl
          });
          testResult = await dashdoc.testConnection();
          break;

        default:
          throw new Error(`TMS type ${connection.tmsType} not supported`);
      }

      // Mettre a jour le statut
      await this.connectionsCollection.updateOne(
        { _id: new ObjectId(connectionId) },
        {
          $set: {
            connectionStatus: testResult.success ? 'connected' : 'error',
            lastConnectionTest: new Date(),
            errorMessage: testResult.success ? null : testResult.error,
            'stats.counters': testResult.counters,
            updatedAt: new Date()
          }
        }
      );

      return testResult;

    } catch (error) {
      await this.connectionsCollection.updateOne(
        { _id: new ObjectId(connectionId) },
        {
          $set: {
            connectionStatus: 'error',
            lastConnectionTest: new Date(),
            errorMessage: error.message,
            updatedAt: new Date()
          }
        }
      );

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Executer une synchronisation
   */
  async executeSync(connectionId, options = {}) {
    const { ObjectId } = require('mongodb');
    const connection = await this.connectionsCollection.findOne({ _id: new ObjectId(connectionId) });

    if (!connection) {
      throw new Error('Connection not found');
    }

    if (connection.connectionStatus !== 'connected') {
      throw new Error('Connection is not active');
    }

    // Creer un log de sync
    const syncLog = {
      connectionId: new ObjectId(connectionId),
      organizationId: connection.organizationId,
      tmsType: connection.tmsType,
      startedAt: new Date(),
      status: 'running',
      options: options,
      results: null,
      error: null
    };

    const logResult = await this.syncLogsCollection.insertOne(syncLog);
    const syncLogId = logResult.insertedId;

    try {
      let syncResult;

      switch (connection.tmsType) {
        case 'dashdoc':
          const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
            baseUrl: connection.credentials.apiUrl
          });

          // Préparer les options de synchronisation
          const syncOptions = {
            transportLimit: options.transportLimit || connection.syncConfig.transportLimit,
            companyLimit: options.companyLimit || 500,
            contactLimit: options.contactLimit || 500,
            invoiceLimit: options.invoiceLimit || 100,
            maxPages: options.maxPages || 100,
            tags__in: options.tags__in || connection.syncConfig.tags
          };

          // Support du filtre "À planifier" (to plan)
          if (options.toPlan === true || options.toPlan === 'true') {
            syncOptions.status__in = 'created,unassigned';
            console.log('[SYNC] Filtering for "À planifier" orders only (created, unassigned)');
          } else if (options.status__in) {
            syncOptions.status__in = options.status__in;
          }

          syncResult = await dashdoc.fullSync(syncOptions);
          break;

        default:
          throw new Error(`TMS type ${connection.tmsType} not supported`);
      }

      // Sauvegarder les donnees synchronisees
      const savedData = await this.saveSyncedData(connection, syncResult);

      // Mettre a jour le log
      await this.syncLogsCollection.updateOne(
        { _id: syncLogId },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            results: {
              counters: syncResult.counters,
              transports: { count: syncResult.transports.count, synced: syncResult.transports.synced },
              companies: { count: syncResult.companies.count, synced: syncResult.companies.synced },
              contacts: { count: syncResult.contacts.count, synced: syncResult.contacts.synced },
              vehicles: { count: syncResult.vehicles.count, synced: syncResult.vehicles.synced },
              trailers: { count: syncResult.trailers.count, synced: syncResult.trailers.synced },
              truckers: { count: syncResult.truckers.count, synced: syncResult.truckers.synced },
              invoices: { count: syncResult.invoices.count, synced: syncResult.invoices.synced },
              saved: savedData
            }
          }
        }
      );

      // Mettre a jour la connexion
      await this.connectionsCollection.updateOne(
        { _id: new ObjectId(connectionId) },
        {
          $set: {
            lastSyncAt: new Date(),
            lastSyncStatus: 'success',
            errorMessage: null,
            'stats.lastTransportsCount': syncResult.transports.count,
            'stats.lastCompaniesCount': syncResult.companies.count,
            'stats.lastContactsCount': syncResult.contacts.count,
            updatedAt: new Date()
          },
          $inc: {
            'stats.totalSyncs': 1,
            'stats.successfulSyncs': 1
          }
        }
      );

      return {
        success: true,
        syncLogId: syncLogId.toString(),
        ...syncResult
      };

    } catch (error) {
      // Mettre a jour le log en erreur
      await this.syncLogsCollection.updateOne(
        { _id: syncLogId },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            error: error.message
          }
        }
      );

      // Mettre a jour la connexion
      await this.connectionsCollection.updateOne(
        { _id: new ObjectId(connectionId) },
        {
          $set: {
            lastSyncAt: new Date(),
            lastSyncStatus: 'error',
            errorMessage: error.message,
            updatedAt: new Date()
          },
          $inc: {
            'stats.totalSyncs': 1,
            'stats.failedSyncs': 1
          }
        }
      );

      throw error;
    }
  }

  /**
   * Sauvegarder les donnees synchronisees dans les collections existantes
   */
  async saveSyncedData(connection, syncResult) {
    const saved = {
      transports: 0,
      companies: 0,
      contacts: 0,
      vehicles: 0,
      truckers: 0
    };

    const organizationId = connection.organizationId;

    // Sauvegarder les transports dans orders
    if (syncResult.transports?.data?.length > 0) {
      const ordersCollection = this.db.collection('orders');
      for (const transport of syncResult.transports.data) {
        await ordersCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': transport.externalId
          },
          {
            $set: {
              ...transport,
              organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
        saved.transports++;
      }
    }

    // Sauvegarder les entreprises dans companies
    if (syncResult.companies?.data?.length > 0) {
      const companiesCollection = this.db.collection('companies');
      for (const company of syncResult.companies.data) {
        await companiesCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': company.externalId
          },
          {
            $set: {
              ...company,
              linkedOrganizationId: organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
        saved.companies++;
      }
    }

    // Sauvegarder les contacts
    if (syncResult.contacts?.data?.length > 0) {
      const contactsCollection = this.db.collection('contacts');
      for (const contact of syncResult.contacts.data) {
        await contactsCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': contact.externalId
          },
          {
            $set: {
              ...contact,
              organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
        saved.contacts++;
      }
    }

    // Sauvegarder les vehicules dans fleet
    if (syncResult.vehicles?.data?.length > 0) {
      const fleetCollection = this.db.collection('fleet');
      for (const vehicle of syncResult.vehicles.data) {
        await fleetCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': vehicle.externalId,
            'type': 'vehicle'
          },
          {
            $set: {
              ...vehicle,
              type: 'vehicle',
              organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
        saved.vehicles++;
      }
    }

    // Sauvegarder les remorques dans fleet
    if (syncResult.trailers?.data?.length > 0) {
      const fleetCollection = this.db.collection('fleet');
      for (const trailer of syncResult.trailers.data) {
        await fleetCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': trailer.externalId,
            'type': 'trailer'
          },
          {
            $set: {
              ...trailer,
              type: 'trailer',
              organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
      }
    }

    // Sauvegarder les chauffeurs dans drivers
    if (syncResult.truckers?.data?.length > 0) {
      const driversCollection = this.db.collection('drivers');
      for (const trucker of syncResult.truckers.data) {
        await driversCollection.updateOne(
          {
            'externalSource': 'dashdoc',
            'externalId': trucker.externalId
          },
          {
            $set: {
              ...trucker,
              organizationId,
              tmsConnectionId: connection._id.toString(),
              syncedAt: new Date()
            }
          },
          { upsert: true }
        );
        saved.truckers++;
      }
    }

    return saved;
  }

  /**
   * Obtenir les logs de sync d'une connexion
   */
  async getSyncLogs(connectionId, limit = 20) {
    const { ObjectId } = require('mongodb');
    return this.syncLogsCollection.find({ connectionId: new ObjectId(connectionId) })
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Obtenir les compteurs temps reel d'une connexion
   * ⚠️ DATA LAKE: Lit depuis MongoDB dashdoc_counters si disponible
   */
  async getRealtimeCounters(connectionId, options = {}) {
    const { ObjectId } = require('mongodb');
    const { forceApi = false } = options;

    const connection = await this.connectionsCollection.findOne({ _id: new ObjectId(connectionId) });

    if (!connection || connection.connectionStatus !== 'connected') {
      throw new Error('Connection not available');
    }

    // ✅ NOUVEAU: Lire depuis Data Lake si disponible (sauf si forceApi)
    if (!forceApi && connection.tmsType === 'dashdoc') {
      try {
        const counters = await this._getCountersFromDatalake(connectionId);
        if (counters) {
          return {
            ...counters,
            source: 'datalake',
            freshness: counters.syncedAt ? new Date() - new Date(counters.syncedAt) : null
          };
        }
      } catch (err) {
        console.warn('[TMS] Data Lake counters not available, falling back to API:', err.message);
      }
    }

    // Fallback: Appel API direct
    switch (connection.tmsType) {
      case 'dashdoc':
        const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
          baseUrl: connection.credentials.apiUrl
        });
        const counters = await dashdoc.getCounters();
        return {
          ...counters,
          source: 'api'
        };

      default:
        throw new Error(`TMS type ${connection.tmsType} not supported`);
    }
  }

  /**
   * Récupérer les compteurs depuis le Data Lake MongoDB
   * @private
   */
  async _getCountersFromDatalake(connectionId) {
    const countersCollection = this.db.collection('dashdoc_counters');

    // Récupérer les derniers compteurs synchronisés
    const counters = await countersCollection.findOne(
      { connectionId: connectionId },
      { sort: { syncedAt: -1 } }
    );

    if (!counters) {
      // Essayer sans filtre connectionId (compteurs globaux)
      const globalCounters = await countersCollection.findOne(
        {},
        { sort: { syncedAt: -1 } }
      );
      return globalCounters;
    }

    return counters;
  }

  /**
   * Récupérer les données synchronisées depuis le Data Lake
   * @param {string} type - Type de données (transports, companies, etc.)
   * @param {Object} options - Options de filtrage
   */
  async getDataFromDatalake(type, options = {}) {
    const { connectionId, limit = 50, skip = 0, filters = {} } = options;

    const collectionMap = {
      'transports': 'dashdoc_transports',
      'orders': 'dashdoc_transports',
      'companies': 'dashdoc_companies',
      'carriers': 'dashdoc_companies',
      'vehicles': 'dashdoc_vehicles',
      'trailers': 'dashdoc_trailers',
      'truckers': 'dashdoc_truckers',
      'drivers': 'dashdoc_truckers',
      'contacts': 'dashdoc_contacts',
      'invoices': 'dashdoc_invoices'
    };

    const collectionName = collectionMap[type];
    if (!collectionName) {
      throw new Error(`Unknown data type: ${type}`);
    }

    const query = { ...filters };
    if (connectionId) query.connectionId = connectionId;

    // Pour carriers, filtrer isCarrier: true
    if (type === 'carriers') {
      query.isCarrier = true;
    }

    const collection = this.db.collection(collectionName);
    const [data, total] = await Promise.all([
      collection.find(query).skip(skip).limit(limit).sort({ syncedAt: -1 }).toArray(),
      collection.countDocuments(query)
    ]);

    return {
      success: true,
      type,
      source: 'datalake',
      collection: collectionName,
      total,
      limit,
      skip,
      data
    };
  }

  /**
   * Statistiques du Data Lake pour une connexion
   */
  async getDatalakeStats(connectionId = null) {
    const query = connectionId ? { connectionId } : {};

    const [
      transportsCount,
      companiesCount,
      carriersCount,
      vehiclesCount,
      trailersCount,
      truckersCount,
      contactsCount,
      invoicesCount
    ] = await Promise.all([
      this.db.collection('dashdoc_transports').countDocuments(query),
      this.db.collection('dashdoc_companies').countDocuments(query),
      this.db.collection('dashdoc_companies').countDocuments({ ...query, isCarrier: true }),
      this.db.collection('dashdoc_vehicles').countDocuments(query),
      this.db.collection('dashdoc_trailers').countDocuments(query),
      this.db.collection('dashdoc_truckers').countDocuments(query),
      this.db.collection('dashdoc_contacts').countDocuments(query),
      this.db.collection('dashdoc_invoices').countDocuments(query)
    ]);

    // Dernière sync
    const lastSync = await this.db.collection('dashdoc_sync_state').findOne(
      connectionId ? { connectionId } : {},
      { sort: { lastIncrementalSyncAt: -1 } }
    );

    return {
      source: 'datalake',
      connectionId: connectionId || 'all',
      counts: {
        transports: transportsCount,
        companies: companiesCount,
        carriers: carriersCount,
        vehicles: vehiclesCount,
        trailers: trailersCount,
        truckers: truckersCount,
        contacts: contactsCount,
        invoices: invoicesCount,
        total: transportsCount + companiesCount + vehiclesCount + trailersCount + truckersCount + contactsCount + invoicesCount
      },
      lastSync: lastSync ? {
        incrementalAt: lastSync.lastIncrementalSyncAt,
        fullSyncAt: lastSync.lastFullSyncAt,
        metrics: lastSync.metrics
      } : null
    };
  }

  /**
   * Helpers
   */
  getTMSDisplayName(tmsType) {
    const names = {
      'dashdoc': 'Dashdoc',
      'transporeon': 'Transporeon',
      'sixfold': 'Sixfold',
      'shippeo': 'Shippeo',
      'project44': 'Project44',
      'fourkites': 'FourKites'
    };
    return names[tmsType] || tmsType;
  }

  getDefaultApiUrl(tmsType) {
    const urls = {
      'dashdoc': 'https://www.dashdoc.eu/api/v4'
    };
    return urls[tmsType];
  }
}

module.exports = TMSConnectionService;
