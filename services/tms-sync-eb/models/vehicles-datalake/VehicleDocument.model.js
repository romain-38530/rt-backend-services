/**
 * Vehicle Document Model
 *
 * Documents véhicule: carte grise, assurance, CT, etc.
 */

const mongoose = require('mongoose');

const ocrFieldSchema = new mongoose.Schema({
  fieldName: String,
  value: String,
  confidence: Number,
  boundingBox: mongoose.Schema.Types.Mixed,
}, { _id: false });

const vehicleDocumentSchema = new mongoose.Schema({
  // Références
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

  // Type de document
  documentType: {
    type: String,
    enum: [
      'carte_grise',
      'assurance',
      'ct', // Contrôle technique
      'mines',
      'speed_limiter_certificate',
      'tachograph_calibration',
      'conformity_certificate',
      'adr_certificate', // Transport matières dangereuses
      'other'
    ],
    required: true,
    index: true,
  },
  documentName: String,
  description: String,

  // Fichier
  fileUrl: {
    type: String,
    required: true,
  },
  fileName: String,
  fileSize: Number,
  mimeType: String,
  s3Key: String,
  s3Bucket: String,

  // Dates
  issueDate: Date,
  expiryDate: {
    type: Date,
    index: true,
  },
  effectiveDate: Date,

  // Données extraites (OCR)
  ocrProcessed: {
    type: Boolean,
    default: false,
  },
  ocrProcessedAt: Date,
  ocrConfidence: Number,
  ocrError: String,
  ocrFields: [ocrFieldSchema],

  // Données spécifiques par type de document
  extractedData: {
    // Carte grise
    carteGrise: {
      titulaire: String,
      adresse: String,
      immatriculation: String,
      datePremiereImmat: Date,
      marque: String,
      typeVariante: String,
      denomination: String,
      typeVehicule: String,
      categorie: String,
      vin: String,
      ptac: Number,
      ptra: Number,
      pv: Number,
      puissanceFiscale: Number,
      puissanceMoteur: Number,
      energie: String,
      nbPlaces: Number,
      nbPlacesDebout: Number,
      niveauSonore: Number,
      co2: Number,
      classeEnvironnementale: String,
    },

    // Assurance
    assurance: {
      compagnie: String,
      numeroPolice: String,
      dateEffet: Date,
      dateEcheance: Date,
      conducteurPrincipal: String,
      typeContrat: String, // tous risques, tiers, etc.
      franchise: Number,
    },

    // Contrôle technique
    ct: {
      centre: String,
      adresseCentre: String,
      dateControle: Date,
      dateValidite: Date,
      resultat: String, // favorable, defavorable, contrevisite
      kilometrage: Number,
      observations: [String],
      defauts: [{
        code: String,
        description: String,
        gravite: String,
      }],
    },

    // Mines
    mines: {
      centre: String,
      dateControle: Date,
      dateValidite: Date,
      resultat: String,
      observations: [String],
    },

    // Certificat limiteur de vitesse
    speedLimiter: {
      centre: String,
      dateVerification: Date,
      dateValidite: Date,
      vitesseLimitee: Number,
      conforme: Boolean,
    },

    // Calibration tachygraphe
    tachograph: {
      centre: String,
      dateCalibration: Date,
      dateValidite: Date,
      numeroAppareil: String,
      marqueAppareil: String,
      constanteW: Number,
      coefficientK: Number,
      circonferenceL: Number,
    },
  },

  // Validation
  isValidated: {
    type: Boolean,
    default: false,
  },
  validatedBy: String,
  validatedAt: Date,
  validationNotes: String,

  // Rappel d'expiration
  reminderSent: {
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
  collection: 'vehicle_documents',
});

// Index composés
vehicleDocumentSchema.index({ vehicleId: 1, documentType: 1 });
vehicleDocumentSchema.index({ licensePlate: 1, documentType: 1 });
vehicleDocumentSchema.index({ organizationId: 1, documentType: 1, expiryDate: 1 });
vehicleDocumentSchema.index({ expiryDate: 1, documentType: 1 });

// Virtuals
vehicleDocumentSchema.virtual('isExpired').get(function() {
  if (!this.expiryDate) return false;
  return new Date() > this.expiryDate;
});

vehicleDocumentSchema.virtual('daysUntilExpiry').get(function() {
  if (!this.expiryDate) return null;
  const now = new Date();
  const diff = this.expiryDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Statics
vehicleDocumentSchema.statics.findExpiring = function(daysAhead, organizationId) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + daysAhead);

  const query = {
    expiryDate: { $lte: futureDate, $gte: new Date() },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query).sort({ expiryDate: 1 });
};

vehicleDocumentSchema.statics.findExpired = function(organizationId) {
  const query = {
    expiryDate: { $lt: new Date() },
  };
  if (organizationId) query.organizationId = organizationId;

  return this.find(query).sort({ expiryDate: -1 });
};

module.exports = mongoose.model('VehicleDocument', vehicleDocumentSchema);
