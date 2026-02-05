/**
 * DKV Fuel Transaction Model
 *
 * Stores fuel purchase transactions from DKV API
 */

const mongoose = require('mongoose');

const dkvTransactionSchema = new mongoose.Schema({
  // Unique identifiers
  transactionId: {
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

  // Card reference
  cardNumber: {
    type: String,
    required: true,
    index: true,
  },

  // Transaction timing
  transactionDate: {
    type: Date,
    required: true,
    index: true,
  },
  transactionTime: String,
  timestamp: {
    type: Date,
    index: true,
  },

  // Station/Location
  stationId: String,
  stationName: String,
  stationAddress: String,
  stationCity: String,
  stationPostalCode: String,
  stationCountry: {
    type: String,
    index: true,
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
    },
    coordinates: [Number], // [longitude, latitude]
  },

  // Product details
  productCode: String,
  productName: {
    type: String,
    index: true,
  },
  productCategory: {
    type: String,
    enum: ['fuel', 'adblue', 'lubricant', 'wash', 'service', 'toll', 'parking', 'other'],
    default: 'fuel',
  },
  quantity: {
    type: Number,
    required: true,
  },
  unitOfMeasure: {
    type: String,
    default: 'L',
  },

  // Pricing
  unitPrice: Number,
  grossAmount: {
    type: Number,
    required: true,
  },
  netAmount: Number,
  vatAmount: Number,
  vatRate: Number,
  currency: {
    type: String,
    default: 'EUR',
  },

  // Vehicle/Driver
  vehiclePlate: {
    type: String,
    index: true,
  },
  driverName: String,
  odometer: Number,

  // Billing
  invoiceNumber: {
    type: String,
    index: true,
  },
  billed: {
    type: Boolean,
    default: false,
    index: true,
  },
  billedAt: Date,

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
  collection: 'dkv_transactions',
});

// Compound unique index
dkvTransactionSchema.index({ transactionId: 1, organizationId: 1 }, { unique: true });
dkvTransactionSchema.index({ organizationId: 1, connectionId: 1 });
dkvTransactionSchema.index({ cardNumber: 1, transactionDate: -1 });
dkvTransactionSchema.index({ vehiclePlate: 1, transactionDate: -1 });
dkvTransactionSchema.index({ transactionDate: -1, organizationId: 1 });
dkvTransactionSchema.index({ billed: 1, organizationId: 1 });

// Geospatial index for station location
dkvTransactionSchema.index({ location: '2dsphere' });

// Text search index
dkvTransactionSchema.index({
  stationName: 'text',
  stationCity: 'text',
  productName: 'text',
  vehiclePlate: 'text',
});

module.exports = mongoose.model('DkvTransaction', dkvTransactionSchema);
