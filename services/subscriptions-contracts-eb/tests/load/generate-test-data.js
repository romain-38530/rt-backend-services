// Generate Test Data Script
// Creates 10,000+ test transport orders for load testing

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'rt-subscriptions-contracts';
const TOTAL_ORDERS = 10000;
const BATCH_SIZE = 500;

// Sample data pools
const cities = [
  { name: 'Paris', lat: 48.8566, lng: 2.3522, postalCode: '75001' },
  { name: 'Lyon', lat: 45.7640, lng: 4.8357, postalCode: '69001' },
  { name: 'Marseille', lat: 43.2965, lng: 5.3698, postalCode: '13001' },
  { name: 'Toulouse', lat: 43.6047, lng: 1.4442, postalCode: '31000' },
  { name: 'Lille', lat: 50.6292, lng: 3.0573, postalCode: '59000' },
  { name: 'Bordeaux', lat: 44.8378, lng: -0.5792, postalCode: '33000' },
  { name: 'Nice', lat: 43.7102, lng: 7.2620, postalCode: '06000' },
  { name: 'Nantes', lat: 47.2184, lng: -1.5536, postalCode: '44000' },
  { name: 'Strasbourg', lat: 48.5734, lng: 7.7521, postalCode: '67000' },
  { name: 'Montpellier', lat: 43.6108, lng: 3.8767, postalCode: '34000' },
];

const statuses = ['CREATED', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
const transportTypes = ['standard', 'express', 'special', 'refrigerated', 'hazmat'];
const urgencyLevels = ['low', 'normal', 'high', 'urgent'];

const goodsDescriptions = [
  'Electronic Components',
  'Medical Supplies',
  'Automotive Parts',
  'Food Products',
  'Textile Products',
  'Building Materials',
  'Office Equipment',
  'Pharmaceutical Products',
  'Industrial Machinery',
  'Consumer Goods',
];

const companyNames = [
  'TechCorp', 'LogiSupply', 'FastTransport', 'EuroDistribution',
  'GreenLogistics', 'PrimeDelivery', 'AlphaFreight', 'BetaShipping',
  'GammaTransport', 'DeltaLogistics', 'OmegaExpress', 'SigmaFreight',
];

/**
 * Generate random transport order
 */
function generateOrder(index) {
  const pickupCity = cities[Math.floor(Math.random() * cities.length)];
  const deliveryCity = cities[Math.floor(Math.random() * cities.length)];

  const createdDate = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000);
  const pickupDate = new Date(createdDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);
  const deliveryDate = new Date(pickupDate.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000);

  const status = statuses[Math.floor(Math.random() * statuses.length)];
  const hasCarrier = status !== 'CREATED' && Math.random() > 0.2;

  return {
    reference: `TEST-${Date.now()}-${index.toString().padStart(6, '0')}`,
    clientId: `client-${companyNames[Math.floor(Math.random() * companyNames.length)]}-${Math.floor(Math.random() * 100)}`,
    carrierId: hasCarrier ? `carrier-${Math.floor(Math.random() * 50)}` : null,
    status,
    transportType: transportTypes[Math.floor(Math.random() * transportTypes.length)],
    urgency: urgencyLevels[Math.floor(Math.random() * urgencyLevels.length)],

    pickupLocation: {
      address: `${Math.floor(Math.random() * 500) + 1} Rue ${pickupCity.name}`,
      city: pickupCity.name,
      postalCode: pickupCity.postalCode,
      country: 'FR',
      coordinates: {
        lat: pickupCity.lat + (Math.random() - 0.5) * 0.1,
        lng: pickupCity.lng + (Math.random() - 0.5) * 0.1,
      },
    },

    deliveryLocation: {
      address: `${Math.floor(Math.random() * 500) + 1} Avenue ${deliveryCity.name}`,
      city: deliveryCity.name,
      postalCode: deliveryCity.postalCode,
      country: 'FR',
      coordinates: {
        lat: deliveryCity.lat + (Math.random() - 0.5) * 0.1,
        lng: deliveryCity.lng + (Math.random() - 0.5) * 0.1,
      },
    },

    goods: Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, i) => ({
      description: goodsDescriptions[Math.floor(Math.random() * goodsDescriptions.length)],
      weight: Math.floor(Math.random() * 1000) + 50,
      quantity: Math.floor(Math.random() * 20) + 1,
      dimensions: {
        length: Math.floor(Math.random() * 150) + 50,
        width: Math.floor(Math.random() * 150) + 50,
        height: Math.floor(Math.random() * 150) + 50,
      },
      value: Math.floor(Math.random() * 50000) + 1000,
    })),

    pickupDate,
    deliveryDate,
    estimatedDeliveryDate: deliveryDate,

    price: Math.floor(Math.random() * 5000) + 300,
    distance: Math.floor(Math.random() * 1000) + 50,

    tracking: hasCarrier && status !== 'CREATED' ? {
      isActive: ['IN_TRANSIT', 'ASSIGNED'].includes(status),
      trackingType: Math.random() > 0.5 ? 'GPS' : 'EMAIL',
      vehicleId: `VH-${Math.floor(Math.random() * 1000)}`,
      driverName: `Driver ${Math.floor(Math.random() * 100)}`,
      lastUpdate: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      currentLocation: {
        lat: (pickupCity.lat + deliveryCity.lat) / 2 + (Math.random() - 0.5) * 0.5,
        lng: (pickupCity.lng + deliveryCity.lng) / 2 + (Math.random() - 0.5) * 0.5,
      },
    } : null,

    documents: Math.random() > 0.5 ? [
      { type: 'BL', uploadedAt: createdDate, verified: Math.random() > 0.3 },
      { type: 'CMR', uploadedAt: createdDate, verified: Math.random() > 0.3 },
    ] : [],

    events: [
      {
        type: 'ORDER_CREATED',
        timestamp: createdDate,
        data: { createdBy: 'test-user' },
      },
    ],

    metadata: {
      source: 'LOAD_TEST',
      testBatch: Math.floor(index / BATCH_SIZE),
      priority: Math.floor(Math.random() * 10),
    },

    createdAt: createdDate,
    updatedAt: new Date(createdDate.getTime() + Math.random() * 60 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Main function to generate and insert test data
 */
async function generateTestData() {
  console.log('========================================');
  console.log('🚀 Test Data Generation');
  console.log('========================================');
  console.log(`📊 Total Orders: ${TOTAL_ORDERS}`);
  console.log(`📦 Batch Size: ${BATCH_SIZE}`);
  console.log(`🗄️  Database: ${DB_NAME}`);
  console.log('========================================\n');

  let client;

  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db(DB_NAME);
    const collection = db.collection('transport_orders');

    // Check existing test data
    const existingCount = await collection.countDocuments({
      'metadata.source': 'LOAD_TEST',
    });

    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing test orders`);
      console.log('   Options:');
      console.log('   - Set CLEANUP=true to delete existing test data');
      console.log('   - Set APPEND=true to add more test data\n');

      if (process.env.CLEANUP === 'true') {
        console.log('🗑️  Deleting existing test data...');
        const deleteResult = await collection.deleteMany({
          'metadata.source': 'LOAD_TEST',
        });
        console.log(`✅ Deleted ${deleteResult.deletedCount} test orders\n`);
      } else if (process.env.APPEND !== 'true') {
        console.log('❌ Exiting to prevent duplicate data');
        console.log('   Run with CLEANUP=true or APPEND=true to proceed\n');
        process.exit(0);
      }
    }

    // Generate and insert orders
    console.log(`📝 Generating ${TOTAL_ORDERS} test orders...\n`);

    const startTime = Date.now();
    let insertedCount = 0;

    for (let i = 0; i < TOTAL_ORDERS; i += BATCH_SIZE) {
      const batch = [];
      const remaining = Math.min(BATCH_SIZE, TOTAL_ORDERS - i);

      for (let j = 0; j < remaining; j++) {
        batch.push(generateOrder(i + j));
      }

      await collection.insertMany(batch);
      insertedCount += batch.length;

      const progress = (insertedCount / TOTAL_ORDERS * 100).toFixed(1);
      process.stdout.write(`\r   Progress: ${progress}% (${insertedCount}/${TOTAL_ORDERS})`);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n\n✅ Generation completed in ${duration.toFixed(2)}s`);
    console.log(`   Rate: ${(TOTAL_ORDERS / duration).toFixed(0)} orders/sec`);

    // Create indexes for performance
    console.log('\n🔖 Creating indexes...');

    await collection.createIndex({ status: 1 });
    await collection.createIndex({ clientId: 1 });
    await collection.createIndex({ carrierId: 1 });
    await collection.createIndex({ createdAt: -1 });
    await collection.createIndex({ 'pickupLocation.city': 1 });
    await collection.createIndex({ 'deliveryLocation.city': 1 });
    await collection.createIndex({ transportType: 1 });

    console.log('✅ Indexes created');

    // Statistics
    console.log('\n========================================');
    console.log('📊 DATA STATISTICS');
    console.log('========================================');

    const statusStats = await collection.aggregate([
      { $match: { 'metadata.source': 'LOAD_TEST' } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    console.log('\nOrders by Status:');
    statusStats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} (${(stat.count / TOTAL_ORDERS * 100).toFixed(1)}%)`);
    });

    const typeStats = await collection.aggregate([
      { $match: { 'metadata.source': 'LOAD_TEST' } },
      { $group: { _id: '$transportType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]).toArray();

    console.log('\nOrders by Transport Type:');
    typeStats.forEach(stat => {
      console.log(`   ${stat._id}: ${stat.count} (${(stat.count / TOTAL_ORDERS * 100).toFixed(1)}%)`);
    });

    console.log('\n========================================');
    console.log('✅ Test data generation completed!');
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

// Run if called directly
if (require.main === module) {
  generateTestData().catch(console.error);
}

module.exports = { generateTestData, generateOrder };
