/**
 * Vehicle Mileage Model
 *
 * Historique du kilométrage des véhicules
 */

const mongoose = require('mongoose');

const vehicleMileageSchema = new mongoose.Schema({
  // Références
  vehicleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true,
    index: true,
  },
  licensePlate: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },

  // Kilométrage
  mileage: {
    type: Number,
    required: true,
  },
  previousMileage: Number,
  delta: Number, // Différence avec relevé précédent

  // Source
  source: {
    type: String,
    enum: ['vehizen', 'dashdoc', 'dkv', 'manual', 'ct', 'maintenance', 'breakdown', 'other'],
    required: true,
    index: true,
  },
  sourceReference: String, // ID dans le système source

  // Date du relevé
  recordedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },

  // Position GPS (si disponible)
  location: {
    address: String,
    city: String,
    coordinates: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number],
    },
  },

  // Contexte
  context: {
    type: String,
    enum: ['automatic', 'refuel', 'start_trip', 'end_trip', 'inspection', 'maintenance', 'other'],
  },
  tripId: String,
  driverId: String,
  driverName: String,

  // Validation
  isValidated: { type: Boolean, default: true },
  isAnomaly: { type: Boolean, default: false },
  anomalyReason: String,

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },

  // Métadonnées
  recordedBy: String,
  notes: String,

}, {
  timestamps: true,
  collection: 'vehicle_mileage',
});

// Index composés
vehicleMileageSchema.index({ vehicleId: 1, recordedAt: -1 });
vehicleMileageSchema.index({ licensePlate: 1, recordedAt: -1 });
vehicleMileageSchema.index({ organizationId: 1, recordedAt: -1 });
vehicleMileageSchema.index({ 'location.coordinates': '2dsphere' });

// Calculer le delta avant sauvegarde
vehicleMileageSchema.pre('save', async function(next) {
  if (this.isNew && !this.delta && this.previousMileage) {
    this.delta = this.mileage - this.previousMileage;

    // Détecter anomalie (kilométrage négatif ou > 2000km/jour)
    if (this.delta < 0 || this.delta > 2000) {
      this.isAnomaly = true;
      this.anomalyReason = this.delta < 0
        ? 'Kilométrage inférieur au précédent'
        : 'Variation supérieure à 2000 km';
    }
  }
  next();
});

// Statics
vehicleMileageSchema.statics.getHistory = function(vehicleId, options = {}) {
  const { from, to, limit = 100 } = options;

  const query = { vehicleId };
  if (from || to) {
    query.recordedAt = {};
    if (from) query.recordedAt.$gte = new Date(from);
    if (to) query.recordedAt.$lte = new Date(to);
  }

  return this.find(query)
    .sort({ recordedAt: -1 })
    .limit(limit);
};

vehicleMileageSchema.statics.getLatest = function(vehicleId) {
  return this.findOne({ vehicleId })
    .sort({ recordedAt: -1 });
};

vehicleMileageSchema.statics.getMonthlyStats = function(vehicleId, year) {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  return this.aggregate([
    {
      $match: {
        vehicleId: new mongoose.Types.ObjectId(vehicleId),
        recordedAt: { $gte: startDate, $lt: endDate },
        isValidated: true,
      },
    },
    {
      $group: {
        _id: { $month: '$recordedAt' },
        minMileage: { $min: '$mileage' },
        maxMileage: { $max: '$mileage' },
        records: { $sum: 1 },
      },
    },
    {
      $project: {
        month: '$_id',
        kmTraveled: { $subtract: ['$maxMileage', '$minMileage'] },
        records: 1,
      },
    },
    { $sort: { month: 1 } },
  ]);
};

module.exports = mongoose.model('VehicleMileage', vehicleMileageSchema);
