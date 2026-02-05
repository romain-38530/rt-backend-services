/**
 * Setup DKV Connection
 *
 * Creates the DKV connection configuration in MongoDB
 * for the DKV Data Lake to start syncing
 */

const { MongoClient } = require('mongodb');

// DKV API Credentials
const DKV_CONFIG = {
  customerNumber: '0000511955',
  clientId: 'd18366e9-8535-47b0-9917-1b7dbf71dba4',
  clientSecret: '-CwhX3cjmsiG_p8MQAOj_LFLEZJytuII804kKcBZhdcbAEdVBUYMOdM6',
  subscriptionKey: '5a9276cbc8824df5ac4152da228f708f',
  authUrl: 'https://my.dkv-mobility.com/auth/realms/enterprise-api/protocol/openid-connect/token',
  apiBaseUrl: 'https://api.dkv-mobility.com/enterprise',
};

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:Symphonia2024!@stagingrt.v2jnoh2.mongodb.net/rt-technologie';

async function setupDkvConnection() {
  const client = new MongoClient(MONGODB_URI);

  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();

    // Check if DKV connection already exists
    const existing = await db.collection('dkvConnections').findOne({
      customerNumber: DKV_CONFIG.customerNumber,
    });

    if (existing) {
      console.log('DKV connection already exists, updating...');

      await db.collection('dkvConnections').updateOne(
        { customerNumber: DKV_CONFIG.customerNumber },
        {
          $set: {
            ...DKV_CONFIG,
            isActive: true,
            updatedAt: new Date(),
          },
        }
      );

      console.log('DKV connection updated');
    } else {
      // Create new DKV connection
      const result = await db.collection('dkvConnections').insertOne({
        ...DKV_CONFIG,
        organizationId: 'default',
        organizationName: 'SETT Transports',
        connectionName: 'DKV Fuel Cards',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSyncAt: null,
        syncEnabled: true,
        config: {
          transactionDaysBack: 30,
          incrementalIntervalMs: 5 * 60 * 1000, // 5 minutes
          periodicIntervalMs: 60 * 60 * 1000, // 1 hour
          fullSyncIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
        },
      });

      console.log('DKV connection created:', result.insertedId);
    }

    // Create indexes for DKV collections
    console.log('Creating indexes...');

    // dkv_cards indexes
    await db.collection('dkv_cards').createIndexes([
      { key: { cardNumber: 1, organizationId: 1 }, unique: true },
      { key: { vehiclePlate: 1 } },
      { key: { status: 1 } },
      { key: { syncedAt: -1 } },
    ]);

    // dkv_transactions indexes
    await db.collection('dkv_transactions').createIndexes([
      { key: { transactionId: 1, organizationId: 1 }, unique: true },
      { key: { cardNumber: 1, transactionDate: -1 } },
      { key: { vehiclePlate: 1, transactionDate: -1 } },
      { key: { transactionDate: -1 } },
      { key: { billed: 1 } },
      { key: { stationCountry: 1 } },
      { key: { syncedAt: -1 } },
    ]);

    // dkv_toll_passages indexes
    await db.collection('dkv_toll_passages').createIndexes([
      { key: { passageId: 1, organizationId: 1 }, unique: true },
      { key: { vehiclePlate: 1, passageDate: -1 } },
      { key: { passageDate: -1 } },
      { key: { country: 1 } },
    ]);

    // dkv_invoices indexes
    await db.collection('dkv_invoices').createIndexes([
      { key: { invoiceNumber: 1, organizationId: 1 }, unique: true },
      { key: { invoiceDate: -1 } },
      { key: { status: 1 } },
    ]);

    // dkv_vehicles indexes
    await db.collection('dkv_vehicles').createIndexes([
      { key: { licensePlate: 1, organizationId: 1 }, unique: true },
      { key: { tollBoxId: 1 } },
    ]);

    // dkv_sync_state indexes
    await db.collection('dkv_sync_state').createIndexes([
      { key: { organizationId: 1, connectionId: 1 }, unique: true },
    ]);

    console.log('Indexes created successfully');

    // Verify connection
    const connection = await db.collection('dkvConnections').findOne({
      customerNumber: DKV_CONFIG.customerNumber,
    });

    console.log('\n=== DKV Connection Setup Complete ===');
    console.log('Connection ID:', connection._id);
    console.log('Customer Number:', connection.customerNumber);
    console.log('Organization:', connection.organizationName);
    console.log('Active:', connection.isActive);
    console.log('=====================================\n');

  } catch (error) {
    console.error('Error setting up DKV connection:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run if called directly
if (require.main === module) {
  setupDkvConnection()
    .then(() => {
      console.log('Setup completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupDkvConnection, DKV_CONFIG };
