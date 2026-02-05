/**
 * DKV Fuel Card Model
 *
 * Stores fuel card master data from DKV API
 */

const mongoose = require('mongoose');

const dkvCardSchema = new mongoose.Schema({
  // Unique identifiers
  cardNumber: {
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

  // Card details
  cardType: String,
  status: {
    type: String,
    enum: ['active', 'blocked', 'expired', 'lost', 'stolen', 'cancelled', 'pending'],
    default: 'active',
  },
  embossedName: String,

  // Linked vehicle/driver
  vehiclePlate: {
    type: String,
    index: true,
  },
  driverName: String,

  // Validity
  issueDate: Date,
  expiryDate: Date,

  // Limits
  dailyLimit: Number,
  monthlyLimit: Number,
  currentDailyUsage: Number,
  currentMonthlyUsage: Number,

  // Product restrictions
  productRestrictions: [String],
  allowedProducts: [String],

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
  collection: 'dkv_cards',
});

// Compound unique index
dkvCardSchema.index({ cardNumber: 1, organizationId: 1 }, { unique: true });
dkvCardSchema.index({ organizationId: 1, connectionId: 1 });
dkvCardSchema.index({ vehiclePlate: 1, organizationId: 1 });
dkvCardSchema.index({ status: 1, organizationId: 1 });

// Text search index
dkvCardSchema.index({
  cardNumber: 'text',
  embossedName: 'text',
  vehiclePlate: 'text',
  driverName: 'text',
});

module.exports = mongoose.model('DkvCard', dkvCardSchema);
