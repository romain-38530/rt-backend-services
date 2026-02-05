/**
 * Dashdoc Contact Model
 * Stocke les contacts Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_contacts';

const contactSchema = {
  dashdocUid: { type: 'string', required: true, unique: true },
  remoteId: { type: 'string' },

  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  _rawData: { type: 'object' },

  firstName: { type: 'string' },
  lastName: { type: 'string' },
  email: { type: 'string' },
  phone: { type: 'string' },
  fax: { type: 'string' },
  language: { type: 'string' },

  companyPk: { type: 'number' },
  companyName: { type: 'string' },

  jobs: [{ type: 'string' }],

  preferences: {
    receiveShareEmails: { type: 'boolean' },
    receiveReminderEmails: { type: 'boolean' }
  },

  createdAt: { type: 'date' },
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocUid: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { email: 1 } },
  { key: { companyPk: 1 } },
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

module.exports = { COLLECTION_NAME, contactSchema, indexes, createIndexes };
