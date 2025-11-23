import { MongoClient, Db } from 'mongodb';
import { logger } from '@rt/utils';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB
 */
export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const dbName = process.env.MONGODB_DB_NAME || 'rt-technologie';

  try {
    logger.info('Connecting to MongoDB...', { uri: uri.replace(/\/\/.*@/, '//*****@') });

    client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(dbName);

    logger.info('Successfully connected to MongoDB', { database: dbName });

    // Setup indexes on connection
    await setupIndexes(db);

    return db;
  } catch (error) {
    logger.error('Failed to connect to MongoDB', { error });
    throw error;
  }
}

/**
 * Get database instance
 */
export function getDatabase(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectToDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('MongoDB connection closed');
  }
}

/**
 * Setup database indexes
 */
async function setupIndexes(db: Db): Promise<void> {
  try {
    // Users collection indexes
    await db.collection('users').createIndexes([
      { key: { email: 1 }, unique: true },
      { key: { type: 1 } },
      { key: { status: 1 } },
      { key: { companyId: 1 } },
      { key: { createdAt: -1 } },
    ]);

    // Orders collection indexes
    await db.collection('orders').createIndexes([
      { key: { orderNumber: 1 }, unique: true },
      { key: { clientId: 1 } },
      { key: { status: 1 } },
      { key: { type: 1 } },
      { key: { assignedDriverId: 1 } },
      { key: { trackingNumber: 1 } },
      { key: { createdAt: -1 } },
      { key: { scheduledPickupAt: 1 } },
      { key: { scheduledDeliveryAt: 1 } },
      { key: { 'pickup.address.location': '2dsphere' } },
      { key: { 'delivery.address.location': '2dsphere' } },
    ]);

    // Notifications collection indexes
    await db.collection('notifications').createIndexes([
      { key: { userId: 1 } },
      { key: { status: 1 } },
      { key: { type: 1 } },
      { key: { createdAt: -1 } },
    ]);

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.error('Failed to create indexes', { error });
    // Don't throw - indexes might already exist
  }
}

/**
 * Health check
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!db) {
      return false;
    }
    await db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
