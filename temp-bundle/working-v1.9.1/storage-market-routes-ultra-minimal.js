/**
 * Storage Market Routes - ULTRA MINIMAL TEST
 * Just ONE constant from models
 */

const { StorageTypes } = require('./storage-market-models-ultra-minimal');

function configureStorageMarketRoutes(app, db, authenticateToken) {
  console.log('[Storage Market] ULTRA MINIMAL route with 1 constant');

  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Ultra minimal test',
      storageTypes: StorageTypes
    });
  });
}

module.exports = { configureStorageMarketRoutes };
