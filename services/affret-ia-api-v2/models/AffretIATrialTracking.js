/**
 * Affret.IA Trial Tracking Model
 * Schema pour le tracking du funnel de conversion
 */

const mongoose = require('mongoose');

const affretIATrialTrackingSchema = new mongoose.Schema({
  // Identifiant du transporteur
  carrierId: {
    type: String,
    required: true,
    index: true
  },

  // Email du transporteur
  carrierEmail: {
    type: String,
    required: true,
    index: true
  },

  // Nom de l'entreprise
  companyName: String,

  // Etape du funnel
  step: {
    type: String,
    required: true,
    enum: [
      'trial_start',          // Debut du trial
      'document_upload',      // Upload de document
      'info_complete',        // Informations completes
      'tms_connect',          // Connexion TMS
      'first_affret',         // Premier affret
      'conversion'            // Conversion finale
    ],
    index: true
  },

  // Metadata de l'etape
  metadata: {
    // Pour document_upload
    documentType: String,
    documentStatus: String,

    // Pour info_complete
    fieldsCompleted: [String],
    completionRate: Number,

    // Pour tms_connect
    tmsProvider: String,
    tmsConnectionId: String,

    // Pour first_affret
    affretId: String,
    affretValue: Number,

    // Pour conversion
    subscriptionPlan: String,
    subscriptionAmount: Number
  },

  // Source de l'action
  source: {
    type: String,
    enum: ['web', 'email', 'sms', 'api', 'webhook', 'admin'],
    default: 'web'
  },

  // IP et user agent
  ipAddress: String,
  userAgent: String,

  // Session ID (pour grouper les actions)
  sessionId: String,

  // Blocker (si l'utilisateur est bloque)
  blocker: {
    blocked: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: [
        'missing_documents',
        'invalid_documents',
        'incomplete_profile',
        'tms_connection_failed',
        'payment_failed',
        'vigilance_alert',
        'manual_review',
        'other'
      ]
    },
    reason: String,
    details: mongoose.Schema.Types.Mixed,
    resolvedAt: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  },

  // Campagne source (si applicable)
  campaign: {
    id: String,
    name: String,
    type: String,
    source: String
  },

  // Referrer
  referrer: String,

  // UTM parameters
  utm: {
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
  },

  // Temps passe sur l'etape (en secondes)
  timeSpent: Number,

  // Timestamp de l'action
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }

}, {
  timestamps: true,
  collection: 'affretia_trial_tracking'
});

// Index composites pour les requetes d'analytics
affretIATrialTrackingSchema.index({ carrierId: 1, createdAt: -1 });
affretIATrialTrackingSchema.index({ step: 1, createdAt: -1 });
affretIATrialTrackingSchema.index({ 'blocker.blocked': 1, step: 1 });
affretIATrialTrackingSchema.index({ carrierEmail: 1, step: 1 });
affretIATrialTrackingSchema.index({ sessionId: 1, createdAt: 1 });

// Methodes statiques

/**
 * Tracker une etape du funnel
 */
affretIATrialTrackingSchema.statics.trackStep = async function(data) {
  const tracking = new this({
    carrierId: data.carrierId,
    carrierEmail: data.carrierEmail,
    companyName: data.companyName,
    step: data.step,
    metadata: data.metadata || {},
    source: data.source || 'web',
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    sessionId: data.sessionId,
    blocker: data.blocker || { blocked: false },
    campaign: data.campaign,
    referrer: data.referrer,
    utm: data.utm,
    timeSpent: data.timeSpent
  });

  await tracking.save();
  return tracking;
};

/**
 * Obtenir le journey d'un carrier
 */
affretIATrialTrackingSchema.statics.getCarrierJourney = async function(carrierId) {
  return this.find({ carrierId }).sort({ createdAt: 1 });
};

/**
 * Obtenir les blockers actifs
 */
affretIATrialTrackingSchema.statics.getActiveBlockers = async function() {
  return this.find({
    'blocker.blocked': true,
    'blocker.resolved': false
  }).sort({ createdAt: -1 });
};

/**
 * Resoudre un blocker
 */
affretIATrialTrackingSchema.methods.resolveBlocker = async function() {
  this.blocker.resolved = true;
  this.blocker.resolvedAt = new Date();
  await this.save();
  return this;
};

const AffretIATrialTracking = mongoose.model('AffretIATrialTracking', affretIATrialTrackingSchema);

module.exports = AffretIATrialTracking;
