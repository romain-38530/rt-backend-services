/**
 * DKV Toll Passage Model
 *
 * Stores toll passage data from DKV API
 */

const mongoose = require('mongoose');

const dkvTollPassageSchema = new mongoose.Schema({
  // Unique identifiers
  passageId: {
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

  // Box/Vehicle reference
  boxId: String,
  vehiclePlate: {
    type: String,
    index: true,
  },

  // Passage timing
  passageDate: {
    type: Date,
    required: true,
    index: true,
  },
  passageTime: String,
  timestamp: {
    type: Date,
    index: true,
  },

  // Location
  tollStation: String,
  entryPoint: String,
  exitPoint: String,
  country: {
    type: String,
    index: true,
  },
  roadName: String,
  tollOperator: String,

  // Distance
  distanceKm: Number,

  // Pricing
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'EUR',
  },

  // Vehicle class
  vehicleClass: String,
  emissionClass: String,
  axleCount: Number,

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
  collection: 'dkv_toll_passages',
});

// Compound unique index
dkvTollPassageSchema.index({ passageId: 1, organizationId: 1 }, { unique: true });
dkvTollPassageSchema.index({ organizationId: 1, connectionId: 1 });
dkvTollPassageSchema.index({ vehiclePlate: 1, passageDate: -1 });
dkvTollPassageSchema.index({ passageDate: -1, organizationId: 1 });
dkvTollPassageSchema.index({ country: 1, passageDate: -1 });

module.exports = mongoose.model('DkvTollPassage', dkvTollPassageSchema);
