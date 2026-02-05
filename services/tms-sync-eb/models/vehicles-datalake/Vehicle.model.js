/**
 * Vehicle Model
 *
 * Modèle principal pour les véhicules avec données fusionnées Dashdoc + Vehizen
 */

const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['ct_expiry', 'insurance_expiry', 'maintenance_due', 'mines_expiry', 'tachograph_calibration', 'speed_limiter', 'document_missing'],
    required: true,
  },
  message: String,
  dueDate: Date,
  dueMileage: Number,
  severity: {
    type: String,
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  },
  acknowledged: { type: Boolean, default: false },
  acknowledgedAt: Date,
  acknowledgedBy: String,
}, { _id: false });

const vehicleSchema = new mongoose.Schema({
  // Identifiants
  licensePlate: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },
  vin: {
    type: String,
    uppercase: true,
    sparse: true,
  },

  // Sources de données
  dashdocPk: {
    type: Number,
    sparse: true,
    index: true,
  },
  vehizenId: {
    type: String,
    sparse: true,
    index: true,
  },

  // Infos véhicule
  brand: String,
  model: String,
  type: {
    type: String,
    enum: ['truck', 'van', 'trailer', 'semi_trailer', 'car', 'other'],
    default: 'truck',
  },
  category: String, // Catégorie (porteur, tracteur, etc.)
  year: Number,
  firstRegistrationDate: Date,
  color: String,

  // Technique
  fuelType: {
    type: String,
    enum: ['diesel', 'petrol', 'lpg', 'electric', 'hybrid', 'cng', 'hydrogen', 'other'],
  },
  tankCapacity: Number,
  ptac: Number, // Poids Total Autorisé en Charge (kg)
  ptra: Number, // Poids Total Roulant Autorisé (kg)
  pv: Number, // Poids à Vide (kg)
  payload: Number, // Charge utile (kg)
  length: Number, // Longueur (m)
  width: Number, // Largeur (m)
  height: Number, // Hauteur (m)
  axleCount: Number,
  euroNorm: {
    type: String,
    enum: ['euro1', 'euro2', 'euro3', 'euro4', 'euro5', 'euro5b', 'euro6', 'euro6c', 'euro6d', 'euro7'],
  },
  emissionClass: String,
  co2Emissions: Number, // g/km

  // Moteur
  enginePower: Number, // CV
  engineDisplacement: Number, // cm3

  // Kilométrage
  currentMileage: {
    type: Number,
    default: 0,
  },
  lastMileageUpdate: Date,
  mileageSource: {
    type: String,
    enum: ['vehizen', 'manual', 'dashdoc', 'dkv', 'other'],
    default: 'manual',
  },
  averageMonthlyMileage: Number,
  averageDailyMileage: Number,

  // Statut
  status: {
    type: String,
    enum: ['active', 'maintenance', 'breakdown', 'parked', 'sold', 'scrapped'],
    default: 'active',
    index: true,
  },
  statusUpdatedAt: Date,
  statusReason: String,

  // Affectation
  assignedDriverId: String,
  assignedDriverName: String,
  assignedSince: Date,
  homeBase: String, // Site d'attache

  // Documents - Dates clés
  documents: {
    carteGrise: {
      hasDocument: { type: Boolean, default: false },
      documentId: mongoose.Schema.Types.ObjectId,
      uploadedAt: Date,
    },
    assurance: {
      hasDocument: { type: Boolean, default: false },
      documentId: mongoose.Schema.Types.ObjectId,
      expiryDate: Date,
      companyName: String,
      policyNumber: String,
    },
    controleTechnique: {
      lastDate: Date,
      expiryDate: Date,
      result: String,
      documentId: mongoose.Schema.Types.ObjectId,
    },
    mines: {
      lastDate: Date,
      expiryDate: Date,
      documentId: mongoose.Schema.Types.ObjectId,
    },
  },

  // Équipements spéciaux
  equipment: {
    hasTachograph: { type: Boolean, default: true },
    tachographType: { type: String, enum: ['analog', 'digital', 'smart'] },
    tachographBrand: String,
    hasSpeedLimiter: { type: Boolean, default: true },
    speedLimiterLastCheck: Date,
    speedLimiterNextCheck: Date,
    hasGPS: Boolean,
    gpsProvider: String,
    hasFridgeUnit: Boolean,
    fridgeUnitType: String,
    hasLiftgate: Boolean,
    hasCrane: Boolean,
  },

  // Chronotachygraphe
  tachograph: {
    serialNumber: String,
    lastCalibrationDate: Date,
    nextCalibrationDate: Date,
    calibrationCenter: String,
    lastDownloadDate: Date,
  },

  // Alertes actives
  alerts: [alertSchema],

  // Coûts cumulés
  costs: {
    totalMaintenance: { type: Number, default: 0 },
    totalBreakdowns: { type: Number, default: 0 },
    totalFuel: { type: Number, default: 0 },
    totalToll: { type: Number, default: 0 },
    totalInsurance: { type: Number, default: 0 },
    yearToDate: { type: Number, default: 0 },
    lastYearTotal: { type: Number, default: 0 },
    costPerKm: Number,
  },

  // Statistiques
  stats: {
    totalTrips: { type: Number, default: 0 },
    totalKm: { type: Number, default: 0 },
    avgFuelConsumption: Number,
    utilizationRate: Number, // % d'utilisation
    breakdownCount: { type: Number, default: 0 },
    maintenanceCount: { type: Number, default: 0 },
  },

  // Prochain entretien
  nextMaintenance: {
    type: String,
    scheduledDate: Date,
    scheduledMileage: Number,
    maintenanceId: mongoose.Schema.Types.ObjectId,
  },

  // Données brutes sources
  _rawDashdoc: mongoose.Schema.Types.Mixed,
  _rawVehizen: mongoose.Schema.Types.Mixed,

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },
  connectionId: String,

  // Métadonnées
  syncedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  syncVersion: { type: Number, default: 1 },
  lastModifiedBy: String,
  notes: String,

}, {
  timestamps: true,
  collection: 'vehicles',
});

// Index composés
vehicleSchema.index({ licensePlate: 1, organizationId: 1 }, { unique: true });
vehicleSchema.index({ status: 1, organizationId: 1 });
vehicleSchema.index({ type: 1, organizationId: 1 });
vehicleSchema.index({ 'documents.controleTechnique.expiryDate': 1 });
vehicleSchema.index({ 'documents.assurance.expiryDate': 1 });
vehicleSchema.index({ 'tachograph.nextCalibrationDate': 1 });

// Index texte pour recherche
vehicleSchema.index({
  licensePlate: 'text',
  brand: 'text',
  model: 'text',
  vin: 'text',
  assignedDriverName: 'text',
});

// Virtuals
vehicleSchema.virtual('isOverdue').get(function() {
  return this.alerts.some(a => a.severity === 'critical' && !a.acknowledged);
});

// Methods
vehicleSchema.methods.addAlert = function(alertData) {
  // Éviter les doublons
  const existing = this.alerts.find(a =>
    a.type === alertData.type &&
    a.dueDate?.getTime() === alertData.dueDate?.getTime()
  );
  if (!existing) {
    this.alerts.push(alertData);
  }
};

vehicleSchema.methods.acknowledgeAlert = function(alertType, userId) {
  const alert = this.alerts.find(a => a.type === alertType && !a.acknowledged);
  if (alert) {
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = userId;
  }
};

vehicleSchema.methods.updateMileage = function(mileage, source = 'manual') {
  if (mileage > this.currentMileage) {
    this.currentMileage = mileage;
    this.lastMileageUpdate = new Date();
    this.mileageSource = source;
  }
};

module.exports = mongoose.model('Vehicle', vehicleSchema);
