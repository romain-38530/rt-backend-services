/**
 * Vehicle Breakdown Model
 *
 * Gestion des pannes et réparations
 */

const mongoose = require('mongoose');

const partReplacedSchema = new mongoose.Schema({
  partName: String,
  partNumber: String,
  quantity: { type: Number, default: 1 },
  unitCost: Number,
  totalCost: Number,
  isWarrantyPart: { type: Boolean, default: false },
  supplier: String,
}, { _id: false });

const vehicleBreakdownSchema = new mongoose.Schema({
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

  // Identifiant unique de la panne
  breakdownNumber: {
    type: String,
    unique: true,
  },

  // Type de panne
  breakdownType: {
    type: String,
    enum: [
      'moteur',
      'transmission',
      'freins',
      'direction',
      'suspension',
      'electricite',
      'pneumatiques',
      'hydraulique',
      'carrosserie',
      'climatisation',
      'systeme_injection',
      'turbo',
      'embrayage',
      'demarrage',
      'refroidissement',
      'echappement',
      'electronique',
      'accident',
      'vandalisme',
      'other'
    ],
    required: true,
    index: true,
  },
  breakdownCategory: {
    type: String,
    enum: ['mechanical', 'electrical', 'hydraulic', 'pneumatic', 'body', 'accident', 'other'],
  },
  description: {
    type: String,
    required: true,
  },
  detailedDescription: String,

  // Sévérité
  severity: {
    type: String,
    enum: ['minor', 'moderate', 'major', 'critical'],
    default: 'moderate',
    index: true,
  },

  // Localisation
  location: {
    address: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' },
    coordinates: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number], // [longitude, latitude]
    },
  },
  isOnRoad: { type: Boolean, default: false }, // Panne en route vs au dépôt

  // Chauffeur
  reportedByDriverId: String,
  reportedByDriverName: String,

  // Dates et temps
  reportedAt: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  diagnosedAt: Date,
  repairStartedAt: Date,
  repairedAt: Date,
  closedAt: Date,

  // Kilométrage au moment de la panne
  mileageAtBreakdown: Number,

  // Statut
  status: {
    type: String,
    enum: ['reported', 'diagnosed', 'waiting_parts', 'repairing', 'repaired', 'closed', 'cancelled'],
    default: 'reported',
    index: true,
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: String,
    notes: String,
  }],

  // Diagnostic
  diagnosis: String,
  rootCause: String,
  diagnosedBy: String,

  // Réparation
  repairDescription: String,
  repairMethod: String,
  partsReplaced: [partReplacedSchema],

  // Coûts
  laborCost: { type: Number, default: 0 },
  partsCost: { type: Number, default: 0 },
  towingCost: { type: Number, default: 0 },
  rentalCost: { type: Number, default: 0 }, // Location véhicule remplacement
  otherCosts: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  currency: { type: String, default: 'EUR' },

  // Détail des coûts additionnels
  additionalCosts: [{
    description: String,
    amount: Number,
    category: String,
  }],

  // Temps
  downtime: Number, // Heures totales d'immobilisation
  repairHours: Number, // Heures de réparation
  waitingTime: Number, // Heures d'attente pièces

  // Fournisseur/Garage
  supplierId: String,
  supplierName: String,
  supplierAddress: String,
  supplierContact: String,
  isInternal: { type: Boolean, default: false },

  // Facture associée
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleInvoice',
  },
  invoiceNumber: String,

  // Dépannage/Remorquage
  towing: {
    required: { type: Boolean, default: false },
    company: String,
    contact: String,
    cost: Number,
    arrivedAt: Date,
    destination: String,
  },

  // Impact opérationnel
  impact: {
    tripsCancelled: { type: Number, default: 0 },
    tripsDelayed: { type: Number, default: 0 },
    customersAffected: { type: Number, default: 0 },
    revenueImpact: Number, // Perte de CA estimée
    penaltiesPaid: Number, // Pénalités clients
  },

  // Véhicule de remplacement
  replacementVehicle: {
    used: { type: Boolean, default: false },
    vehicleId: mongoose.Schema.Types.ObjectId,
    licensePlate: String,
    from: Date,
    to: Date,
    cost: Number,
    source: String, // internal, rental, other
  },

  // Récurrence
  isRecurring: { type: Boolean, default: false },
  relatedBreakdowns: [mongoose.Schema.Types.ObjectId],

  // Garantie
  warranty: {
    isCovered: { type: Boolean, default: false },
    warrantyProvider: String,
    claimNumber: String,
    amountCovered: Number,
  },

  // Assurance
  insurance: {
    isClaimed: { type: Boolean, default: false },
    claimNumber: String,
    amountClaimed: Number,
    amountReceived: Number,
  },

  // Documents et photos
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    category: { type: String, enum: ['photo_damage', 'diagnostic_report', 'repair_report', 'invoice', 'other'] },
    uploadedAt: { type: Date, default: Date.now },
    description: String,
  }],

  // Notes
  notes: String,
  internalNotes: String,

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },

  // Métadonnées
  createdBy: String,
  lastModifiedBy: String,

}, {
  timestamps: true,
  collection: 'vehicle_breakdowns',
});

// Index composés
vehicleBreakdownSchema.index({ vehicleId: 1, status: 1 });
vehicleBreakdownSchema.index({ organizationId: 1, status: 1, reportedAt: -1 });
vehicleBreakdownSchema.index({ 'location.coordinates': '2dsphere' });
vehicleBreakdownSchema.index({ reportedAt: -1 });

// Générer le numéro de panne
vehicleBreakdownSchema.pre('save', async function(next) {
  if (!this.breakdownNumber) {
    const count = await this.constructor.countDocuments({ organizationId: this.organizationId });
    const year = new Date().getFullYear();
    this.breakdownNumber = `PAN-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // Calculer le coût total
  this.totalCost = (this.laborCost || 0) +
                   (this.partsCost || 0) +
                   (this.towingCost || 0) +
                   (this.rentalCost || 0) +
                   (this.otherCosts || 0);

  next();
});

// Methods
vehicleBreakdownSchema.methods.diagnose = function(diagnosis, rootCause, diagnosedBy) {
  this.status = 'diagnosed';
  this.diagnosis = diagnosis;
  this.rootCause = rootCause;
  this.diagnosedBy = diagnosedBy;
  this.diagnosedAt = new Date();
  this.statusHistory.push({
    status: 'diagnosed',
    changedBy: diagnosedBy,
    notes: diagnosis,
  });
};

vehicleBreakdownSchema.methods.startRepair = function(userId) {
  this.status = 'repairing';
  this.repairStartedAt = new Date();
  this.statusHistory.push({
    status: 'repairing',
    changedBy: userId,
    notes: 'Réparation démarrée',
  });
};

vehicleBreakdownSchema.methods.completeRepair = function(repairDescription, userId) {
  this.status = 'repaired';
  this.repairDescription = repairDescription;
  this.repairedAt = new Date();

  // Calculer le temps d'immobilisation
  if (this.reportedAt) {
    this.downtime = Math.round((this.repairedAt - this.reportedAt) / (1000 * 60 * 60));
  }

  // Calculer le temps de réparation
  if (this.repairStartedAt) {
    this.repairHours = Math.round((this.repairedAt - this.repairStartedAt) / (1000 * 60 * 60));
  }

  this.statusHistory.push({
    status: 'repaired',
    changedBy: userId,
    notes: repairDescription,
  });
};

vehicleBreakdownSchema.methods.close = function(userId, notes) {
  this.status = 'closed';
  this.closedAt = new Date();
  this.statusHistory.push({
    status: 'closed',
    changedBy: userId,
    notes: notes || 'Dossier clôturé',
  });
};

// Statics
vehicleBreakdownSchema.statics.findActive = function(organizationId) {
  const query = {
    status: { $nin: ['closed', 'cancelled'] },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query).sort({ severity: -1, reportedAt: -1 });
};

vehicleBreakdownSchema.statics.getStatsByVehicle = function(vehicleId) {
  return this.aggregate([
    { $match: { vehicleId: new mongoose.Types.ObjectId(vehicleId) } },
    {
      $group: {
        _id: null,
        totalBreakdowns: { $sum: 1 },
        totalCost: { $sum: '$totalCost' },
        totalDowntime: { $sum: '$downtime' },
        avgRepairTime: { $avg: '$repairHours' },
        byType: { $push: '$breakdownType' },
      },
    },
  ]);
};

module.exports = mongoose.model('VehicleBreakdown', vehicleBreakdownSchema);
