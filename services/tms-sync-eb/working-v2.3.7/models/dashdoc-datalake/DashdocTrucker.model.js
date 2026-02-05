/**
 * Dashdoc Trucker Model
 * Stocke les chauffeurs Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_truckers';

const truckerSchema = {
  dashdocPk: { type: 'number', required: true, unique: true },
  remoteId: { type: 'string' },

  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  _rawData: { type: 'object' },

  firstName: { type: 'string' },
  lastName: { type: 'string' },
  email: { type: 'string' },
  phone: { type: 'string' },

  // Permis de conduire
  drivingLicense: { type: 'string' },
  drivingLicenseDeadline: { type: 'date' },

  // ADR
  adrLicense: { type: 'string' },
  adrLicenseDeadline: { type: 'date' },

  // Carte conducteur
  driverCard: { type: 'string' },
  driverCardDeadline: { type: 'date' },

  isActive: { type: 'boolean', default: true },
  carrierPk: { type: 'number' },

  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocPk: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { email: 1 } },
  { key: { carrierPk: 1 } },
  { key: { isActive: 1 } },
  { key: { syncedAt: -1 } }
];

async function createIndexes(db) {
  const collection = db.collection(COLLECTION_NAME);
  for (const index of indexes) {
    try {
      await collection.createIndex(index.key, { unique: index.unique || false, background: true });
    } catch (error) {
      if (error.code !== 85 && error.code !== 86) {
        console.error(`[DATALAKE] Error creating index:`, error.message);
      }
    }
  }
}

module.exports = { COLLECTION_NAME, truckerSchema, indexes, createIndexes };
