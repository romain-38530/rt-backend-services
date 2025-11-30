/**
 * TEST: Lazy require INSIDE function, not at top-level
 */

function configureStorageMarketRoutes(app, db, authenticateToken) {
  // Lazy require - load only when function is called
  const { TestTypes } = require('./test-constants-xyz');

  console.log('[Storage Market] Test with LAZY require inside function');

  app.get('/api/storage-market/test', (req, res) => {
    res.json({
      success: true,
      message: 'Test with lazy require',
      testTypes: TestTypes
    });
  });
}

module.exports = { configureStorageMarketRoutes };
