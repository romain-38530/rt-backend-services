/**
 * Vehicle Invoice Model
 *
 * Factures fournisseurs avec OCR pour extraction automatique
 */

const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({
  description: String,
  reference: String,
  quantity: Number,
  unitPrice: Number,
  discount: Number,
  vatRate: Number,
  totalHT: Number,
  totalTTC: Number,
}, { _id: false });

const ocrFieldSchema = new mongoose.Schema({
  fieldName: String,
  rawValue: String,
  parsedValue: mongoose.Schema.Types.Mixed,
  confidence: Number,
  source: String, // textract, regex, manual
}, { _id: false });

const vehicleInvoiceSchema = new mongoose.Schema({
  // Identifiant facture
  invoiceNumber: {
    type: String,
    index: true,
  },
  internalReference: {
    type: String,
    unique: true,
  },

  // Fichier source
  fileUrl: {
    type: String,
    required: true,
  },
  fileName: String,
  fileSize: Number,
  mimeType: String,
  s3Key: String,
  s3Bucket: String,

  // OCR Processing
  ocrStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'manual'],
    default: 'pending',
    index: true,
  },
  ocrProcessedAt: Date,
  ocrJobId: String, // AWS Textract Job ID
  ocrError: String,
  ocrConfidence: Number, // Score global de confiance

  // Données extraites par OCR
  ocrExtractedData: {
    // Facture
    invoiceNumber: ocrFieldSchema,
    invoiceDate: ocrFieldSchema,
    dueDate: ocrFieldSchema,

    // Fournisseur
    supplierName: ocrFieldSchema,
    supplierAddress: ocrFieldSchema,
    supplierSiret: ocrFieldSchema,
    supplierTva: ocrFieldSchema,
    supplierPhone: ocrFieldSchema,
    supplierEmail: ocrFieldSchema,

    // Client (nous)
    customerName: ocrFieldSchema,
    customerAddress: ocrFieldSchema,

    // IMPORTANT: Immatriculation du véhicule
    licensePlate: ocrFieldSchema,
    vin: ocrFieldSchema,

    // Montants
    totalHT: ocrFieldSchema,
    totalTVA: ocrFieldSchema,
    totalTTC: ocrFieldSchema,

    // Lignes de détail (si détectées)
    lineItems: [{
      description: ocrFieldSchema,
      quantity: ocrFieldSchema,
      unitPrice: ocrFieldSchema,
      total: ocrFieldSchema,
    }],

    // Texte brut complet
    rawText: String,
  },

  // Données validées (après vérification manuelle ou auto)
  validatedData: {
    // Véhicule associé
    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle',
      index: true,
    },
    licensePlate: {
      type: String,
      uppercase: true,
      index: true,
    },

    // Fournisseur
    supplierId: String,
    supplierName: String,
    supplierSiret: String,

    // Facture
    invoiceNumber: String,
    invoiceDate: Date,
    dueDate: Date,

    // Montants
    totalHT: Number,
    totalTVA: Number,
    totalTTC: Number,

    // Lignes validées
    lineItems: [lineItemSchema],
  },

  // Association
  invoiceType: {
    type: String,
    enum: ['maintenance', 'breakdown', 'fuel', 'toll', 'parts', 'tires', 'insurance', 'other'],
    index: true,
  },
  linkedMaintenanceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleMaintenance',
  },
  linkedBreakdownId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VehicleBreakdown',
  },

  // Validation
  validationStatus: {
    type: String,
    enum: ['pending', 'auto_validated', 'manually_validated', 'rejected', 'needs_review'],
    default: 'pending',
    index: true,
  },
  validationNotes: String,
  validatedBy: String,
  validatedAt: Date,

  // Raison du rejet
  rejectionReason: String,

  // Paiement
  paymentStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'paid', 'cancelled'],
    default: 'pending',
  },
  paymentDate: Date,
  paymentMethod: String,
  paymentReference: String,

  // Comptabilité
  accountingCode: String,
  costCenter: String,
  exportedToAccounting: { type: Boolean, default: false },
  exportedAt: Date,

  // Matching véhicule
  vehicleMatchMethod: {
    type: String,
    enum: ['ocr_plate', 'ocr_vin', 'manual', 'supplier_ref', 'none'],
  },
  vehicleMatchConfidence: Number,
  vehicleMatchCandidates: [{
    vehicleId: mongoose.Schema.Types.ObjectId,
    licensePlate: String,
    confidence: Number,
    matchSource: String,
  }],

  // Multi-tenant
  organizationId: {
    type: String,
    required: true,
    index: true,
  },

  // Métadonnées
  uploadedBy: String,
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  lastModifiedBy: String,
  notes: String,
  tags: [String],

}, {
  timestamps: true,
  collection: 'vehicle_invoices',
});

// Index composés
vehicleInvoiceSchema.index({ organizationId: 1, ocrStatus: 1 });
vehicleInvoiceSchema.index({ organizationId: 1, validationStatus: 1 });
vehicleInvoiceSchema.index({ 'validatedData.licensePlate': 1 });
vehicleInvoiceSchema.index({ 'validatedData.vehicleId': 1 });
vehicleInvoiceSchema.index({ invoiceType: 1, organizationId: 1 });
vehicleInvoiceSchema.index({ uploadedAt: -1 });

// Générer référence interne
vehicleInvoiceSchema.pre('save', async function(next) {
  if (!this.internalReference) {
    const count = await this.constructor.countDocuments({ organizationId: this.organizationId });
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.internalReference = `FAC-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

// Methods
vehicleInvoiceSchema.methods.validateWithVehicle = function(vehicleId, licensePlate, userId) {
  this.validatedData.vehicleId = vehicleId;
  this.validatedData.licensePlate = licensePlate;
  this.validationStatus = 'manually_validated';
  this.validatedBy = userId;
  this.validatedAt = new Date();
};

vehicleInvoiceSchema.methods.reject = function(reason, userId) {
  this.validationStatus = 'rejected';
  this.rejectionReason = reason;
  this.validatedBy = userId;
  this.validatedAt = new Date();
};

vehicleInvoiceSchema.methods.linkToMaintenance = function(maintenanceId) {
  this.invoiceType = 'maintenance';
  this.linkedMaintenanceId = maintenanceId;
};

vehicleInvoiceSchema.methods.linkToBreakdown = function(breakdownId) {
  this.invoiceType = 'breakdown';
  this.linkedBreakdownId = breakdownId;
};

// Statics
vehicleInvoiceSchema.statics.findPendingOcr = function(organizationId) {
  const query = { ocrStatus: 'pending' };
  if (organizationId) query.organizationId = organizationId;
  return this.find(query).sort({ uploadedAt: 1 });
};

vehicleInvoiceSchema.statics.findPendingValidation = function(organizationId) {
  const query = {
    ocrStatus: 'completed',
    validationStatus: { $in: ['pending', 'needs_review'] },
  };
  if (organizationId) query.organizationId = organizationId;
  return this.find(query).sort({ uploadedAt: 1 });
};

vehicleInvoiceSchema.statics.findByVehicle = function(vehicleId, options = {}) {
  const query = { 'validatedData.vehicleId': vehicleId };
  const { limit = 50, skip = 0 } = options;

  return this.find(query)
    .sort({ 'validatedData.invoiceDate': -1 })
    .skip(skip)
    .limit(limit);
};

module.exports = mongoose.model('VehicleInvoice', vehicleInvoiceSchema);
