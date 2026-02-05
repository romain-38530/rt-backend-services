/**
 * Vehicle Maintenance Model
 *
 * Gestion des entretiens planifiés et réalisés
 */

const mongoose = require('mongoose');

const partUsedSchema = new mongoose.Schema({
  partName: String,
  partNumber: String,
  quantity: { type: Number, default: 1 },
  unitCost: Number,
  totalCost: Number,
  supplier: String,
}, { _id: false });

const laborDetailSchema = new mongoose.Schema({
  description: String,
  hours: Number,
  hourlyRate: Number,
  totalCost: Number,
  technicianName: String,
}, { _id: false });

const vehicleMaintenanceSchema = new mongoose.Schema({
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

  // Type d'entretien
  maintenanceType: {
    type: String,
    enum: [
      'vidange',
      'revision',
      'freins',
      'pneus',
      'distribution',
      'embrayage',
      'suspension',
      'direction',
      'climatisation',
      'batterie',
      'echappement',
      'filtres',
      'courroies',
      'liquides',
      'graissage',
      'controle_general',
      'preparation_ct',
      'other'
    ],
    required: true,
    index: true,
  },
  maintenanceCategory: {
    type: String,
    enum: ['preventive', 'corrective', 'regulatory'],
    default: 'preventive',
  },
  description: String,
  detailedDescription: String,

  // Statut
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled', 'overdue'],
    default: 'scheduled',
    index: true,
  },
  statusHistory: [{
    status: String,
    changedAt: { type: Date, default: Date.now },
    changedBy: String,
    notes: String,
  }],

  // Planification
  scheduledDate: {
    type: Date,
    index: true,
  },
  scheduledMileage: Number,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },

  // Réalisation
  startedAt: Date,
  completedDate: Date,
  completedMileage: Number,

  // Temps de travail
  estimatedHours: Number,
  actualHours: Number,
  laborDetails: [laborDetailSchema],

  // Pièces utilisées
  partsUsed: [partUsedSchema],

  // Coûts
  laborCost: { type: Number, default: 0 },
  partsCost: { type: Number, default: 0 },
  externalServiceCost: { type: Number, default: 0 },
  otherCosts: { type: Number, default: 0 },
  totalCost: { type: Number, default: 0 },
  currency: { type: String, default: 'EUR' },

  // Fournisseur/Garage
  supplierId: String,
  supplierName: String,
  supplierAddress: String,
  supplierContact: String,
  isInternal: { type: Boolean, default: false }, // Entretien interne vs externe

  // Facture associée
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleInvoice',
  },
  invoiceNumber: String,

  // Récurrence
  isRecurring: { type: Boolean, default: false },
  recurringInterval: {
    type: { type: String, enum: ['months', 'km', 'both'] },
    months: Number,
    km: Number,
  },
  nextDueDate: Date,
  nextDueMileage: Number,
  parentMaintenanceId: mongoose.Schema.Types.ObjectId, // Lien vers l'entretien parent si récurrent

  // Checklist
  checklist: [{
    item: String,
    checked: { type: Boolean, default: false },
    notes: String,
    checkedBy: String,
    checkedAt: Date,
  }],

  // Documents et photos
  attachments: [{
    fileName: String,
    fileUrl: String,
    fileType: String,
    uploadedAt: { type: Date, default: Date.now },
    description: String,
  }],

  // Garantie
  warranty: {
    hasWarranty: { type: Boolean, default: false },
    warrantyEndDate: Date,
    warrantyDescription: String,
    warrantyProvider: String,
  },

  // Notes et observations
  notes: String,
  technicianNotes: String,
  customerFeedback: String,

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
  collection: 'vehicle_maintenance',
});

// Index composés
vehicleMaintenanceSchema.index({ vehicleId: 1, status: 1 });
vehicleMaintenanceSchema.index({ organizationId: 1, status: 1, scheduledDate: 1 });
vehicleMaintenanceSchema.index({ scheduledDate: 1, status: 1 });
vehicleMaintenanceSchema.index({ nextDueDate: 1 });

// Middleware pre-save pour calculer le coût total
vehicleMaintenanceSchema.pre('save', function(next) {
  this.totalCost = (this.laborCost || 0) +
                   (this.partsCost || 0) +
                   (this.externalServiceCost || 0) +
                   (this.otherCosts || 0);
  next();
});

// Methods
vehicleMaintenanceSchema.methods.start = function(userId) {
  this.status = 'in_progress';
  this.startedAt = new Date();
  this.statusHistory.push({
    status: 'in_progress',
    changedBy: userId,
    notes: 'Entretien démarré',
  });
};

vehicleMaintenanceSchema.methods.complete = function(mileage, userId) {
  this.status = 'completed';
  this.completedDate = new Date();
  this.completedMileage = mileage;
  this.statusHistory.push({
    status: 'completed',
    changedBy: userId,
    notes: 'Entretien terminé',
  });

  // Calculer prochaine échéance si récurrent
  if (this.isRecurring && this.recurringInterval) {
    if (this.recurringInterval.type === 'months' || this.recurringInterval.type === 'both') {
      const nextDate = new Date(this.completedDate);
      nextDate.setMonth(nextDate.getMonth() + (this.recurringInterval.months || 6));
      this.nextDueDate = nextDate;
    }
    if (this.recurringInterval.type === 'km' || this.recurringInterval.type === 'both') {
      this.nextDueMileage = mileage + (this.recurringInterval.km || 20000);
    }
  }
};

vehicleMaintenanceSchema.methods.cancel = function(reason, userId) {
  this.status = 'cancelled';
  this.statusHistory.push({
    status: 'cancelled',
    changedBy: userId,
    notes: reason || 'Annulé',
  });
};

// Statics
vehicleMaintenanceSchema.statics.findOverdue = function(organizationId) {
  const now = new Date();
  const query = {
    status: 'scheduled',
    scheduledDate: { $lt: now },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query).sort({ scheduledDate: 1 });
};

vehicleMaintenanceSchema.statics.findUpcoming = function(daysAhead, organizationId) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const query = {
    status: 'scheduled',
    scheduledDate: { $gte: now, $lte: futureDate },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query).sort({ scheduledDate: 1 });
};

module.exports = mongoose.model('VehicleMaintenance', vehicleMaintenanceSchema);
