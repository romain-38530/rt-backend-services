/**
 * DKV Vehicle Model
 *
 * Stores vehicle master data linked to DKV cards
 */

const mongoose = require('mongoose');

const dkvVehicleSchema = new mongoose.Schema({
  // Unique identifiers
  vehicleId: {
    type: String,
    index: true,
  },
  licensePlate: {
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

  // Vehicle details
  vin: String,
  brand: String,
  model: String,
  type: {
    type: String,
    enum: ['truck', 'van', 'car', 'trailer', 'bus', 'other'],
  },
  year: Number,

  // Fuel
  fuelType: {
    type: String,
    enum: ['diesel', 'petrol', 'lpg', 'electric', 'hybrid', 'cng', 'other'],
  },
  tankCapacity: Number,
  averageConsumption: Number,

  // Linked cards
  linkedCards: [String],

  // Toll box
  tollBoxId: String,
  emissionClass: String,
  axleCount: Number,

  // Statistics (computed from transactions)
  stats: {
    totalFuelLiters: { type: Number, default: 0 },
    totalFuelCost: { type: Number, default: 0 },
    totalTollCost: { type: Number, default: 0 },
    totalKm: { type: Number, default: 0 },
    lastRefuelDate: Date,
    lastRefuelLiters: Number,
    lastOdometer: Number,
    avgConsumption: Number,
    transactionCount: { type: Number, default: 0 },
  },

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
  collection: 'dkv_vehicles',
});

// Compound unique index
dkvVehicleSchema.index({ licensePlate: 1, organizationId: 1 }, { unique: true });
dkvVehicleSchema.index({ organizationId: 1, connectionId: 1 });
dkvVehicleSchema.index({ tollBoxId: 1, organizationId: 1 });

// Text search index
dkvVehicleSchema.index({
  licensePlate: 'text',
  brand: 'text',
  model: 'text',
  vin: 'text',
});

module.exports = mongoose.model('DkvVehicle', dkvVehicleSchema);
