/**
 * Dashdoc Invoice Model
 * Stocke les factures Dashdoc dans le Data Lake MongoDB
 */

const COLLECTION_NAME = 'dashdoc_invoices';

const invoiceSchema = {
  dashdocUid: { type: 'string', required: true, unique: true },

  organizationId: { type: 'string', required: true },
  connectionId: { type: 'string', required: true },

  _rawData: { type: 'object' },

  invoiceNumber: { type: 'string' },
  status: { type: 'string' },

  totalTaxFree: { type: 'number' },
  totalWithTax: { type: 'number' },
  currency: { type: 'string', default: 'EUR' },

  issueDate: { type: 'date' },
  dueDate: { type: 'date' },
  paidAt: { type: 'date' },

  debtor: {
    companyPk: { type: 'number' },
    name: { type: 'string' }
  },
  creditor: {
    companyPk: { type: 'number' },
    name: { type: 'string' }
  },

  lines: [{
    description: { type: 'string' },
    quantity: { type: 'number' },
    unitPrice: { type: 'number' },
    totalPrice: { type: 'number' },
    vatRate: { type: 'number' }
  }],

  fileUrl: { type: 'string' },

  createdAt: { type: 'date' },
  syncedAt: { type: 'date', required: true },
  syncVersion: { type: 'number', default: 1 },
  checksum: { type: 'string' }
};

const indexes = [
  { key: { dashdocUid: 1 }, unique: true },
  { key: { organizationId: 1, connectionId: 1 } },
  { key: { invoiceNumber: 1 } },
  { key: { status: 1 } },
  { key: { 'debtor.companyPk': 1 } },
  { key: { 'creditor.companyPk': 1 } },
  { key: { issueDate: -1 } },
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

module.exports = { COLLECTION_NAME, invoiceSchema, indexes, createIndexes };
