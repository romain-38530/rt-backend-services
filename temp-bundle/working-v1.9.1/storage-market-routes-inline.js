/**
 * TEST: Inline constants - NO require() at all
 */

function configureStorageMarketRoutes(app, db, authenticateToken) {
  // Inline constants - no require
  const StorageTypes = {
    TEMPORARY: 'TEMPORARY',
    LONG_TERM: 'LONG_TERM'
  };

  console.log('[Storage Market] Test with INLINE constants (no require)');

  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Test with inline constants',
      storageTypes: StorageTypes
    });
  });
}

module.exports = { configureStorageMarketRoutes };
