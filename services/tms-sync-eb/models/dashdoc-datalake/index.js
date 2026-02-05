/**
 * Dashdoc Data Lake Models
 * Export centralisé de tous les modèles MongoDB pour le Data Lake
 */

const DashdocTransport = require('./DashdocTransport.model');
const DashdocCompany = require('./DashdocCompany.model');
const DashdocVehicle = require('./DashdocVehicle.model');
const DashdocTrailer = require('./DashdocTrailer.model');
const DashdocTrucker = require('./DashdocTrucker.model');
const DashdocContact = require('./DashdocContact.model');
const DashdocInvoice = require('./DashdocInvoice.model');
const DashdocAddress = require('./DashdocAddress.model');
const DashdocCounter = require('./DashdocCounter.model');
const DashdocSyncState = require('./DashdocSyncState.model');

// Liste de tous les modèles
const models = {
  DashdocTransport,
  DashdocCompany,
  DashdocVehicle,
  DashdocTrailer,
  DashdocTrucker,
  DashdocContact,
  DashdocInvoice,
  DashdocAddress,
  DashdocCounter,
  DashdocSyncState
};

// Noms des collections
const COLLECTIONS = {
  TRANSPORTS: DashdocTransport.COLLECTION_NAME,
  COMPANIES: DashdocCompany.COLLECTION_NAME,
  VEHICLES: DashdocVehicle.COLLECTION_NAME,
  TRAILERS: DashdocTrailer.COLLECTION_NAME,
  TRUCKERS: DashdocTrucker.COLLECTION_NAME,
  CONTACTS: DashdocContact.COLLECTION_NAME,
  INVOICES: DashdocInvoice.COLLECTION_NAME,
  ADDRESSES: DashdocAddress.COLLECTION_NAME,
  COUNTERS: DashdocCounter.COLLECTION_NAME,
  SYNC_STATE: DashdocSyncState.COLLECTION_NAME
};

/**
 * Créer tous les index pour toutes les collections
 * @param {Db} db - Instance MongoDB
 */
async function createAllIndexes(db) {
  console.log('[DATALAKE] Creating indexes for all collections...');

  const startTime = Date.now();

  for (const [name, model] of Object.entries(models)) {
    try {
      console.log(`[DATALAKE] Creating indexes for ${model.COLLECTION_NAME}...`);
      await model.createIndexes(db);
    } catch (error) {
      console.error(`[DATALAKE] Error creating indexes for ${name}:`, error.message);
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[DATALAKE] All indexes created in ${duration}ms`);
}

/**
 * Obtenir les statistiques de toutes les collections
 * @param {Db} db - Instance MongoDB
 */
async function getCollectionStats(db) {
  const stats = {};

  for (const [key, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      const collection = db.collection(collectionName);
      const count = await collection.countDocuments();
      const indexes = await collection.indexes();

      stats[key] = {
        collection: collectionName,
        documentCount: count,
        indexCount: indexes.length
      };
    } catch (error) {
      stats[key] = {
        collection: collectionName,
        error: error.message
      };
    }
  }

  return stats;
}

module.exports = {
  ...models,
  COLLECTIONS,
  createAllIndexes,
  getCollectionStats
};
