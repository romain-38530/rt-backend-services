/**
 * DKV Invoice Model
 *
 * Stores invoice data from DKV API
 */

const mongoose = require('mongoose');

const dkvInvoiceSchema = new mongoose.Schema({
  // Unique identifiers
  invoiceNumber: {
    type: String,
    required: true,
    index: true,
  },
  remoteId: String,

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },
  connectionId: {
    type: String,
    index: true,
  },

  // Invoice details
  invoiceDate: {
    type: Date,
    required: true,
    index: true,
  },
  dueDate: Date,
  periodFrom: Date,
  periodTo: Date,

  // Amounts
  totalAmount: {
    type: Number,
    required: true,
  },
  netAmount: Number,
  vatAmount: Number,
  currency: {
    type: String,
    default: 'EUR',
  },

  // Breakdown by category
  fuelAmount: Number,
  tollAmount: Number,
  serviceAmount: Number,
  otherAmount: Number,

  // Status
  status: {
    type: String,
    enum: ['draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'issued',
  },
  paidAt: Date,
  paidAmount: Number,

  // Documents
  pdfUrl: String,
  xmlUrl: String,

  // Transaction counts
  transactionCount: Number,
  tollPassageCount: Number,

  // Raw data preservation
  _rawData: {
    type: mongoose.Schema.Types.Mixed,
  },

  // Sync metadata
  syncedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  syncVersion: {
    type: Number,
    default: 1,
  },
  checksum: String,

}, {
  timestamps: true,
  collection: 'dkv_invoices',
});

// Compound unique index
dkvInvoiceSchema.index({ invoiceNumber: 1, organizationId: 1 }, { unique: true });
dkvInvoiceSchema.index({ organizationId: 1, connectionId: 1 });
dkvInvoiceSchema.index({ invoiceDate: -1, organizationId: 1 });
dkvInvoiceSchema.index({ status: 1, organizationId: 1 });

module.exports = mongoose.model('DkvInvoice', dkvInvoiceSchema);
