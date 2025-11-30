/**
 * TEST: Using completely different filename
 */

const { TestTypes } = require('./test-constants-xyz');

function configureStorageMarketRoutes(app, db, authenticateToken) {
  console.log('[Storage Market] Test with renamed file');

  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Test with different filename',
      testTypes: TestTypes
    });
  });
}

module.exports = { configureStorageMarketRoutes };
