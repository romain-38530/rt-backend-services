// Global Setup - Runs once before all tests
// Used to prepare test environment and create test data

const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

async function globalSetup() {
  console.log('\n========================================');
  console.log('🚀 Starting E2E Test Suite');
  console.log('========================================\n');

  // Load environment variables
  dotenv.config({ path: '.env.test' });
  dotenv.config(); // Fallback to .env

  // Check if API is accessible
  const apiUrl = process.env.API_URL || 'https://rt-subscriptions-api-prod.eba-pwrpmmxu.eu-central-1.elasticbeanstalk.com';

  console.log(`📡 API URL: ${apiUrl}`);
  console.log(`🗄️  MongoDB URI: ${process.env.MONGODB_URI ? '✓ Configured' : '✗ Not configured'}`);

  // Test API health
  try {
    const fetch = require('node-fetch').default || global.fetch;
    const response = await fetch(`${apiUrl}/health`);
    const health = await response.json();

    console.log(`\n✅ API Health Check: ${health.status}`);
    console.log(`   Version: ${health.version}`);
    console.log(`   MongoDB: ${health.mongodb?.status || 'unknown'}`);
  } catch (error) {
    console.error(`\n❌ API Health Check Failed: ${error.message}`);
    console.warn('⚠️  Tests may fail if API is not accessible\n');
  }

  // Set up test database collection (optional - for cleanup)
  if (process.env.MONGODB_URI && process.env.ENABLE_DB_CLEANUP === 'true') {
    try {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();

      const db = client.db('rt-subscriptions-contracts-test');

      // Create test collections if they don't exist
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);

      if (!collectionNames.includes('test_transport_orders')) {
        await db.createCollection('test_transport_orders');
        console.log('✅ Created test_transport_orders collection');
      }

      await client.close();
    } catch (error) {
      console.warn(`⚠️  MongoDB setup warning: ${error.message}`);
    }
  }

  console.log('\n========================================');
  console.log('✅ Global Setup Complete');
  console.log('========================================\n');

  // Store configuration in global state
  global.testConfig = {
    apiUrl,
    startTime: new Date(),
  };
}

module.exports = globalSetup;
