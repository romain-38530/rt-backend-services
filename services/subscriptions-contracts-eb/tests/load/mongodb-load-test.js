// MongoDB Load Test - Database Performance Testing
// Tests MongoDB performance with 10,000+ records

const { MongoClient, ObjectId } = require('mongodb');
const { performance } = require('perf_hooks');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'rt-subscriptions-contracts-test';
const COLLECTION_NAME = 'load_test_transport_orders';
const TOTAL_RECORDS = 10000;
const BATCH_SIZE = 1000;

// Performance metrics
const metrics = {
  insertTime: 0,
  queryTime: 0,
  updateTime: 0,
  aggregationTime: 0,
  indexCreationTime: 0,
  totalTime: 0,
};

/**
 * Generate random transport order data
 */
function generateTransportOrder(index) {
  const cities = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Lille', 'Bordeaux', 'Nice', 'Nantes'];
  const statuses = ['CREATED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
  const transportTypes = ['standard', 'express', 'special'];

  const pickupCity = cities[Math.floor(Math.random() * cities.length)];
  const deliveryCity = cities[Math.floor(Math.random() * cities.length)];

  return {
    reference: `LOAD-${Date.now()}-${index}`,
    clientId: `client-${Math.floor(Math.random() * 100)}`,
    carrierId: Math.random() > 0.3 ? `carrier-${Math.floor(Math.random() * 50)}` : null,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    transportType: transportTypes[Math.floor(Math.random() * transportTypes.length)],
    pickupLocation: {
      address: `${index} Test Street`,
      city: pickupCity,
      postalCode: `${75000 + Math.floor(Math.random() * 10000)}`,
      country: 'FR',
      coordinates: {
        lat: 48.8566 + (Math.random() - 0.5) * 10,
        lng: 2.3522 + (Math.random() - 0.5) * 10,
      },
    },
    deliveryLocation: {
      address: `${index * 2} Delivery Avenue`,
      city: deliveryCity,
      postalCode: `${75000 + Math.floor(Math.random() * 10000)}`,
      country: 'FR',
      coordinates: {
        lat: 48.8566 + (Math.random() - 0.5) * 10,
        lng: 2.3522 + (Math.random() - 0.5) * 10,
      },
    },
    goods: [
      {
        description: `Test Package ${index}`,
        weight: Math.floor(Math.random() * 1000) + 50,
        quantity: Math.floor(Math.random() * 10) + 1,
        dimensions: {
          length: Math.floor(Math.random() * 100) + 50,
          width: Math.floor(Math.random() * 100) + 50,
          height: Math.floor(Math.random() * 100) + 50,
        },
      },
    ],
    pickupDate: new Date(Date.now() + Math.random() * 86400000 * 30),
    deliveryDate: new Date(Date.now() + Math.random() * 86400000 * 60),
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 90),
    updatedAt: new Date(Date.now() - Math.random() * 86400000 * 30),
    price: Math.floor(Math.random() * 5000) + 500,
    distance: Math.floor(Math.random() * 1000) + 50,
  };
}

/**
 * Insert records in batches
 */
async function insertRecords(collection) {
  console.log(`\n📝 Inserting ${TOTAL_RECORDS} records...`);

  const startTime = performance.now();

  for (let i = 0; i < TOTAL_RECORDS; i += BATCH_SIZE) {
    const batch = [];
    const remaining = Math.min(BATCH_SIZE, TOTAL_RECORDS - i);

    for (let j = 0; j < remaining; j++) {
      batch.push(generateTransportOrder(i + j));
    }

    await collection.insertMany(batch);

    const progress = ((i + remaining) / TOTAL_RECORDS * 100).toFixed(1);
    process.stdout.write(`\r   Progress: ${progress}% (${i + remaining}/${TOTAL_RECORDS})`);
  }

  const endTime = performance.now();
  metrics.insertTime = endTime - startTime;

  console.log(`\n✅ Insert completed in ${(metrics.insertTime / 1000).toFixed(2)}s`);
  console.log(`   Rate: ${(TOTAL_RECORDS / (metrics.insertTime / 1000)).toFixed(0)} records/sec`);
}

/**
 * Test query performance
 */
async function testQueries(collection) {
  console.log(`\n🔍 Testing query performance...`);

  const tests = [
    {
      name: 'Find by status',
      query: { status: 'IN_TRANSIT' },
    },
    {
      name: 'Find by client',
      query: { clientId: 'client-50' },
    },
    {
      name: 'Find by city',
      query: { 'pickupLocation.city': 'Paris' },
    },
    {
      name: 'Find by date range',
      query: {
        createdAt: {
          $gte: new Date(Date.now() - 30 * 86400000),
          $lte: new Date(),
        },
      },
    },
    {
      name: 'Complex query (status + city + date)',
      query: {
        status: { $in: ['ASSIGNED', 'IN_TRANSIT'] },
        'deliveryLocation.city': 'Lyon',
        createdAt: { $gte: new Date(Date.now() - 60 * 86400000) },
      },
    },
  ];

  const startTime = performance.now();

  for (const test of tests) {
    const queryStart = performance.now();
    const count = await collection.countDocuments(test.query);
    const queryEnd = performance.now();
    const duration = queryEnd - queryStart;

    console.log(`   ✓ ${test.name}: ${duration.toFixed(2)}ms (${count} results)`);
  }

  const endTime = performance.now();
  metrics.queryTime = endTime - startTime;

  console.log(`✅ Query tests completed in ${(metrics.queryTime / 1000).toFixed(2)}s`);
}

/**
 * Test update performance
 */
async function testUpdates(collection) {
  console.log(`\n✏️  Testing update performance...`);

  const startTime = performance.now();

  // Update single record
  const singleStart = performance.now();
  await collection.updateOne(
    { status: 'CREATED' },
    { $set: { status: 'ASSIGNED', assignedAt: new Date() } }
  );
  const singleEnd = performance.now();
  console.log(`   ✓ Single update: ${(singleEnd - singleStart).toFixed(2)}ms`);

  // Update multiple records
  const multiStart = performance.now();
  const multiResult = await collection.updateMany(
    { status: 'ASSIGNED', carrierId: null },
    { $set: { status: 'PENDING_ASSIGNMENT' } }
  );
  const multiEnd = performance.now();
  console.log(`   ✓ Bulk update: ${(multiEnd - multiStart).toFixed(2)}ms (${multiResult.modifiedCount} records)`);

  const endTime = performance.now();
  metrics.updateTime = endTime - startTime;

  console.log(`✅ Update tests completed in ${(metrics.updateTime / 1000).toFixed(2)}s`);
}

/**
 * Test aggregation performance
 */
async function testAggregations(collection) {
  console.log(`\n📊 Testing aggregation performance...`);

  const startTime = performance.now();

  // Test 1: Count by status
  const aggStart1 = performance.now();
  const statusCounts = await collection.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();
  const aggEnd1 = performance.now();
  console.log(`   ✓ Count by status: ${(aggEnd1 - aggStart1).toFixed(2)}ms (${statusCounts.length} groups)`);

  // Test 2: Average price by transport type
  const aggStart2 = performance.now();
  const avgPrices = await collection.aggregate([
    { $group: { _id: '$transportType', avgPrice: { $avg: '$price' }, count: { $sum: 1 } } },
    { $sort: { avgPrice: -1 } },
  ]).toArray();
  const aggEnd2 = performance.now();
  console.log(`   ✓ Average price by type: ${(aggEnd2 - aggStart2).toFixed(2)}ms (${avgPrices.length} groups)`);

  // Test 3: Orders by city (top 5)
  const aggStart3 = performance.now();
  const topCities = await collection.aggregate([
    { $group: { _id: '$pickupLocation.city', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]).toArray();
  const aggEnd3 = performance.now();
  console.log(`   ✓ Top 5 cities: ${(aggEnd3 - aggStart3).toFixed(2)}ms`);

  const endTime = performance.now();
  metrics.aggregationTime = endTime - startTime;

  console.log(`✅ Aggregation tests completed in ${(metrics.aggregationTime / 1000).toFixed(2)}s`);
}

/**
 * Test index performance
 */
async function testIndexes(collection) {
  console.log(`\n🔖 Testing index performance...`);

  const startTime = performance.now();

  // Create indexes
  const indexes = [
    { key: { status: 1 }, name: 'idx_status' },
    { key: { clientId: 1 }, name: 'idx_clientId' },
    { key: { carrierId: 1 }, name: 'idx_carrierId' },
    { key: { createdAt: -1 }, name: 'idx_createdAt' },
    { key: { 'pickupLocation.city': 1 }, name: 'idx_pickup_city' },
    { key: { status: 1, createdAt: -1 }, name: 'idx_status_createdAt' },
  ];

  for (const index of indexes) {
    const indexStart = performance.now();
    await collection.createIndex(index.key, { name: index.name });
    const indexEnd = performance.now();
    console.log(`   ✓ Created ${index.name}: ${(indexEnd - indexStart).toFixed(2)}ms`);
  }

  const endTime = performance.now();
  metrics.indexCreationTime = endTime - startTime;

  console.log(`✅ Index creation completed in ${(metrics.indexCreationTime / 1000).toFixed(2)}s`);

  // Re-test queries with indexes
  console.log(`\n🔍 Re-testing queries with indexes...`);
  await testQueries(collection);
}

/**
 * Main test runner
 */
async function runLoadTest() {
  console.log('========================================');
  console.log('🚀 MongoDB Load Test');
  console.log('========================================');
  console.log(`📡 MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}`);
  console.log(`🗄️  Database: ${DB_NAME}`);
  console.log(`📦 Collection: ${COLLECTION_NAME}`);
  console.log(`📊 Total Records: ${TOTAL_RECORDS}`);
  console.log('========================================\n');

  const globalStart = performance.now();

  let client;

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Drop existing collection
    try {
      await collection.drop();
      console.log('🗑️  Dropped existing collection\n');
    } catch (error) {
      // Collection doesn't exist, ignore
    }

    // Run tests
    await insertRecords(collection);
    await testQueries(collection);
    await testUpdates(collection);
    await testAggregations(collection);
    await testIndexes(collection);

    const globalEnd = performance.now();
    metrics.totalTime = globalEnd - globalStart;

    // Print summary
    console.log('\n========================================');
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('========================================');
    console.log(`Total Time: ${(metrics.totalTime / 1000).toFixed(2)}s`);
    console.log(`Insert Time: ${(metrics.insertTime / 1000).toFixed(2)}s`);
    console.log(`Query Time: ${(metrics.queryTime / 1000).toFixed(2)}s`);
    console.log(`Update Time: ${(metrics.updateTime / 1000).toFixed(2)}s`);
    console.log(`Aggregation Time: ${(metrics.aggregationTime / 1000).toFixed(2)}s`);
    console.log(`Index Creation Time: ${(metrics.indexCreationTime / 1000).toFixed(2)}s`);
    console.log('========================================');
    console.log(`✅ Load test completed successfully`);
    console.log('========================================\n');

    // Recommendations
    console.log('💡 RECOMMENDATIONS:');
    console.log('1. Ensure indexes are created for frequently queried fields');
    console.log('2. Use compound indexes for complex queries');
    console.log('3. Monitor query performance in production');
    console.log('4. Consider sharding if dataset exceeds 100GB');
    console.log('5. Enable MongoDB Atlas auto-scaling for peak loads');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Run the test
if (require.main === module) {
  runLoadTest().catch(console.error);
}

module.exports = { runLoadTest, generateTransportOrder };
