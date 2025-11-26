// Global Teardown - Runs once after all tests
// Used to clean up test data and resources

const { MongoClient } = require('mongodb');

async function globalTeardown() {
  console.log('\n========================================');
  console.log('🧹 Starting Test Cleanup');
  console.log('========================================\n');

  // Calculate test duration
  if (global.testConfig?.startTime) {
    const duration = Date.now() - global.testConfig.startTime.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);

    console.log(`⏱️  Total test duration: ${minutes}m ${seconds % 60}s`);
  }

  // Clean up test data from MongoDB (optional)
  if (process.env.MONGODB_URI && process.env.ENABLE_DB_CLEANUP === 'true') {
    try {
      console.log('🗄️  Cleaning up test database...');

      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();

      const db = client.db('rt-subscriptions-contracts-test');

      // Delete test data created during tests
      const collections = ['test_transport_orders', 'test_carriers', 'test_users'];

      for (const collectionName of collections) {
        try {
          const result = await db.collection(collectionName).deleteMany({
            createdAt: { $gte: global.testConfig?.startTime || new Date(Date.now() - 86400000) }
          });
          console.log(`   ✓ Deleted ${result.deletedCount} test records from ${collectionName}`);
        } catch (error) {
          console.warn(`   ⚠️  Could not clean ${collectionName}: ${error.message}`);
        }
      }

      await client.close();
      console.log('✅ Database cleanup complete');
    } catch (error) {
      console.warn(`⚠️  MongoDB cleanup warning: ${error.message}`);
    }
  } else {
    console.log('ℹ️  Database cleanup skipped (ENABLE_DB_CLEANUP not set to true)');
  }

  console.log('\n========================================');
  console.log('✅ Global Teardown Complete');
  console.log('========================================\n');
}

module.exports = globalTeardown;
