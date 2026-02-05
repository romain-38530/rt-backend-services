/**
 * Vehicle Inspection Model
 *
 * Contrôles techniques, mines, limiteur de vitesse, etc.
 */

const mongoose = require('mongoose');

const defectSchema = new mongoose.Schema({
  code: String,
  description: String,
  severity: {
    type: String,
    enum: ['minor', 'major', 'critical', 'dangerous'],
  },
  category: String,
  mustRepair: { type: Boolean, default: false },
  repaired: { type: Boolean, default: false },
  repairedAt: Date,
}, { _id: false });

const vehicleInspectionSchema = new mongoose.Schema({
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

  // Type d'inspection
  inspectionType: {
    type: String,
    enum: [
      'ct', // Contrôle technique
      'ct_complementaire', // Contre-visite
      'mines', // Visite des mines (véhicules > 3.5T)
      'speed_limiter', // Vérification limiteur de vitesse
      'tachograph_calibration', // Étalonnage chronotachygraphe
      'tachograph_inspection', // Inspection chronotachygraphe
      'adr', // Contrôle ADR (matières dangereuses)
      'vhu', // Véhicule hors d'usage
      'other'
    ],
    required: true,
    index: true,
  },

  // Numéro d'identification
  inspectionNumber: String,
  certificateNumber: String,

  // Dates
  inspectionDate: {
    type: Date,
    required: true,
    index: true,
  },
  expiryDate: {
    type: Date,
    index: true,
  },
  nextDueDate: Date,

  // Kilométrage
  mileageAtInspection: Number,

  // Résultat
  result: {
    type: String,
    enum: ['pass', 'fail', 'pending', 'conditional'],
    required: true,
    index: true,
  },
  resultDetails: String,

  // Défauts constatés
  defects: [defectSchema],
  defectCount: {
    minor: { type: Number, default: 0 },
    major: { type: Number, default: 0 },
    critical: { type: Number, default: 0 },
  },

  // Observations
  observations: [String],
  recommendations: [String],

  // Centre de contrôle
  center: {
    name: String,
    address: String,
    city: String,
    postalCode: String,
    agreementNumber: String, // Numéro agrément
    inspector: String,
  },

  // Documents
  certificateUrl: String,
  reportUrl: String,
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: Date,
  }],

  // Coût
  cost: Number,
  currency: { type: String, default: 'EUR' },

  // Facture associée
  invoiceId: mongoose.Schema.Types.ObjectId,
  invoiceNumber: String,

  // Contre-visite (si applicable)
  requiresReinspection: { type: Boolean, default: false },
  reinspectionDeadline: Date,
  reinspectionId: mongoose.Schema.Types.ObjectId, // Lien vers la contre-visite
  originalInspectionId: mongoose.Schema.Types.ObjectId, // Si c'est une contre-visite

  // Spécifique limiteur de vitesse
  speedLimiter: {
    limitedSpeed: Number, // Vitesse limitée (90 km/h généralement)
    isConform: Boolean,
    sealNumber: String,
    deviceBrand: String,
    deviceModel: String,
  },

  // Spécifique chronotachygraphe
  tachograph: {
    deviceType: { type: String, enum: ['analog', 'digital', 'smart'] },
    deviceBrand: String,
    deviceModel: String,
    serialNumber: String,
    softwareVersion: String,
    constantW: Number,
    coefficientK: Number,
    circumferenceL: Number,
    sealNumbers: [String],
  },

  // Rappels
  reminderSent: {
    days60: { type: Boolean, default: false },
    days30: { type: Boolean, default: false },
    days15: { type: Boolean, default: false },
    days7: { type: Boolean, default: false },
    expired: { type: Boolean, default: false },
  },

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },

  // Métadonnées
  createdBy: String,
  notes: String,

}, {
  timestamps: true,
  collection: 'vehicle_inspections',
});

// Index composés
vehicleInspectionSchema.index({ vehicleId: 1, inspectionType: 1, inspectionDate: -1 });
vehicleInspectionSchema.index({ organizationId: 1, inspectionType: 1, expiryDate: 1 });
vehicleInspectionSchema.index({ expiryDate: 1, inspectionType: 1 });
vehicleInspectionSchema.index({ result: 1, organizationId: 1 });

// Calculer les compteurs de défauts avant sauvegarde
vehicleInspectionSchema.pre('save', function(next) {
  if (this.defects && this.defects.length > 0) {
    this.defectCount = {
      minor: this.defects.filter(d => d.severity === 'minor').length,
      major: this.defects.filter(d => d.severity === 'major').length,
      critical: this.defects.filter(d => d.severity === 'critical' || d.severity === 'dangerous').length,
    };
  }
  next();
});

// Virtuals
vehicleInspectionSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

vehicleInspectionSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiryDate) return null;
  const diff = this.expiryDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Statics
vehicleInspectionSchema.statics.getLatestByType = function(vehicleId, inspectionType) {
  return this.findOne({ vehicleId, inspectionType })
    .sort({ inspectionDate: -1 });
};

vehicleInspectionSchema.statics.findExpiring = function(inspectionType, daysAhead, organizationId) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const query = {
    expiryDate: { $lte: futureDate, $gte: new Date() },
    result: 'pass',
  };
  if (inspectionType) query.inspectionType = inspectionType;
  if (organizationId) query.organizationId = organizationId;

  return this.find(query)
    .populate('vehicleId', 'licensePlate brand model')
    .sort({ expiryDate: 1 });
};

vehicleInspectionSchema.statics.findExpired = function(inspectionType, organizationId) {
  const query = {
    expiryDate: { $lt: new Date() },
    result: 'pass',
  };
  if (inspectionType) query.inspectionType = inspectionType;
  if (organizationId) query.organizationId = organizationId;

  return this.find(query)
    .populate('vehicleId', 'licensePlate brand model')
    .sort({ expiryDate: -1 });
};

vehicleInspectionSchema.statics.findPendingReinspection = function(organizationId) {
  const query = {
    requiresReinspection: true,
    reinspectionId: { $exists: false },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query)
    .populate('vehicleId', 'licensePlate brand model')
    .sort({ reinspectionDeadline: 1 });
};

module.exports = mongoose.model('VehicleInspection', vehicleInspectionSchema);
