/**
 * TMS Connection Service
 * Gere les connexions aux differents TMS clients (Dashdoc, etc.)
 * Stocke les configurations et execute les synchronisations
 */

const DashdocConnector = require('../connectors/dashdoc.connector');

class TMSConnectionService {
  constructor(db) {
    this.db = db;
    this.connectionsCollection = null;
    this.syncLogsCollection = null;
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

    console.log('[TMS CONNECTION SERVICE] Initialized');
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
          syncResult = await dashdoc.fullSync({
            transportLimit: options.transportLimit || connection.syncConfig.transportLimit,
            companyLimit: options.companyLimit || 500,
            contactLimit: options.contactLimit || 500,
            invoiceLimit: options.invoiceLimit || 100
          });
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
   */
  async getRealtimeCounters(connectionId) {
    const { ObjectId } = require('mongodb');
    const connection = await this.connectionsCollection.findOne({ _id: new ObjectId(connectionId) });

    if (!connection || connection.connectionStatus !== 'connected') {
      throw new Error('Connection not available');
    }

    switch (connection.tmsType) {
      case 'dashdoc':
        const dashdoc = new DashdocConnector(connection.credentials.apiToken, {
          baseUrl: connection.credentials.apiUrl
        });
        return dashdoc.getCounters();

      default:
        throw new Error(`TMS type ${connection.tmsType} not supported`);
    }
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
