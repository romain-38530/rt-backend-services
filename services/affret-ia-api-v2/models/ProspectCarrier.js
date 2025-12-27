/**
 * Model ProspectCarrier - Gestion des transporteurs prospects
 * Transporteurs identifies via B2PWeb scraping pour prospection commerciale
 */

const mongoose = require('mongoose');

const prospectCarrierSchema = new mongoose.Schema({
  // Identite du transporteur
  carrierName: { type: String, required: true },
  carrierEmail: { type: String, required: true, index: true },
  carrierPhone: { type: String },

  // Source des donnees
  source: {
    type: { type: String, enum: ['b2pweb', 'manual', 'referral', 'website'], default: 'b2pweb' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    interactionCount: { type: Number, default: 0 }
  },

  // Zones d'activite detectees
  activityZones: [{
    fromPostalCode: String,
    fromCity: String,
    toPostalCode: String,
    toCity: String,
    frequency: { type: Number, default: 1 }
  }],

  // Types de transports detectes
  transportTypes: [{
    type: { type: String }, // FTL, LTL, ADR, FRIGO, etc.
    weight: Number,
    length: Number
  }],

  // Statut de prospection
  prospectionStatus: {
    type: String,
    enum: [
      'new',              // Nouveau prospect
      'contacted',        // Premier email envoye
      'interested',       // A montre de l'interet
      'trial_active',     // 10 transports gratuits en cours
      'trial_expired',    // Essai termine
      'converted',        // Converti en Premium
      'refused',          // A refuse
      'unsubscribed',     // Desinscrit
      'bounced'           // Email invalide
    ],
    default: 'new'
  },

  // Offre d'essai gratuit
  trialOffer: {
    activated: { type: Boolean, default: false },
    activatedAt: Date,
    expiresAt: Date,
    transportsUsed: { type: Number, default: 0 },
    transportsLimit: { type: Number, default: 10 },
    transportsHistory: [{
      orderId: String,
      reference: String,
      route: String,
      usedAt: Date,
      price: Number
    }]
  },

  // Historique des communications
  communications: [{
    type: { type: String, enum: ['email', 'sms', 'phone', 'push'] },
    template: String,
    subject: String,
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    respondedAt: Date,
    bounced: { type: Boolean, default: false },
    messageId: String
  }],

  // Engagement score
  engagementScore: {
    value: { type: Number, default: 0, min: 0, max: 100 },
    lastCalculated: Date,
    factors: {
      emailOpens: { type: Number, default: 0 },
      emailClicks: { type: Number, default: 0 },
      offersViewed: { type: Number, default: 0 },
      proposalsMade: { type: Number, default: 0 },
      responsiveness: { type: Number, default: 0 }
    }
  },

  // Matching pour transports non pris
  matchingCriteria: {
    preferredRoutes: [String],
    maxDistance: Number,
    vehicleTypes: [String],
    minWeight: Number,
    maxWeight: Number,
    adCapability: { type: Boolean, default: false },
    frigoCapability: { type: Boolean, default: false }
  },

  // Conversion Premium
  conversionTracking: {
    firstContactAt: Date,
    trialStartedAt: Date,
    conversionAt: Date,
    subscriptionPlan: String,
    monthlyValue: Number,
    conversionSource: String
  },

  // Notes commerciales
  notes: [{
    content: String,
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
  }],

  // Blacklist/blocage
  blocked: { type: Boolean, default: false },
  blockedReason: String,
  blockedAt: Date

}, { timestamps: true });

// Index pour recherche rapide
prospectCarrierSchema.index({ 'prospectionStatus': 1, 'engagementScore.value': -1 });
prospectCarrierSchema.index({ 'source.lastSeenAt': -1 });
prospectCarrierSchema.index({ 'activityZones.fromPostalCode': 1, 'activityZones.toPostalCode': 1 });

// Methode pour calculer le score d'engagement
prospectCarrierSchema.methods.calculateEngagementScore = function() {
  const factors = this.engagementScore.factors;

  // Ponderation des facteurs
  let score = 0;
  score += Math.min(factors.emailOpens * 5, 25);       // Max 25 points
  score += Math.min(factors.emailClicks * 10, 30);     // Max 30 points
  score += Math.min(factors.offersViewed * 3, 15);     // Max 15 points
  score += Math.min(factors.proposalsMade * 15, 30);   // Max 30 points

  this.engagementScore.value = Math.min(score, 100);
  this.engagementScore.lastCalculated = new Date();

  return this.engagementScore.value;
};

// Methode pour verifier si essai gratuit disponible
prospectCarrierSchema.methods.canUseTrial = function() {
  if (!this.trialOffer.activated) return false;
  if (this.trialOffer.expiresAt && new Date() > this.trialOffer.expiresAt) return false;
  return this.trialOffer.transportsUsed < this.trialOffer.transportsLimit;
};

// Methode pour activer l'essai gratuit
prospectCarrierSchema.methods.activateTrial = function(daysValid = 30) {
  this.trialOffer.activated = true;
  this.trialOffer.activatedAt = new Date();
  this.trialOffer.expiresAt = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);
  this.trialOffer.transportsLimit = 10;
  this.prospectionStatus = 'trial_active';
  this.conversionTracking.trialStartedAt = new Date();
};

// Methode pour utiliser un transport gratuit
prospectCarrierSchema.methods.useTrialTransport = function(orderId, reference, route, price) {
  if (!this.canUseTrial()) {
    throw new Error('Trial not available or expired');
  }

  this.trialOffer.transportsUsed += 1;
  this.trialOffer.transportsHistory.push({
    orderId,
    reference,
    route,
    usedAt: new Date(),
    price
  });

  // Si tous les transports utilises, marquer comme expire
  if (this.trialOffer.transportsUsed >= this.trialOffer.transportsLimit) {
    this.prospectionStatus = 'trial_expired';
  }
};

// Methode pour enregistrer une communication
prospectCarrierSchema.methods.addCommunication = function(type, template, subject, messageId) {
  this.communications.push({
    type,
    template,
    subject,
    sentAt: new Date(),
    messageId
  });

  if (this.prospectionStatus === 'new') {
    this.prospectionStatus = 'contacted';
    this.conversionTracking.firstContactAt = new Date();
  }
};

// Methode pour convertir en Premium
prospectCarrierSchema.methods.convertToPremium = function(plan, monthlyValue, source) {
  this.prospectionStatus = 'converted';
  this.conversionTracking.conversionAt = new Date();
  this.conversionTracking.subscriptionPlan = plan;
  this.conversionTracking.monthlyValue = monthlyValue;
  this.conversionTracking.conversionSource = source;
};

// Statique pour trouver des prospects matching un transport
prospectCarrierSchema.statics.findMatchingProspects = async function(transport, limit = 20) {
  const { fromPostalCode, toPostalCode, weight, vehicleType } = transport;

  // Extraire les 2 premiers chiffres du code postal pour zone
  const fromZone = fromPostalCode?.substring(0, 2);
  const toZone = toPostalCode?.substring(0, 2);

  return this.find({
    prospectionStatus: { $in: ['new', 'contacted', 'interested', 'trial_active'] },
    blocked: { $ne: true },
    $or: [
      { 'activityZones.fromPostalCode': { $regex: `^${fromZone}` } },
      { 'activityZones.toPostalCode': { $regex: `^${toZone}` } }
    ]
  })
  .sort({ 'engagementScore.value': -1, 'source.interactionCount': -1 })
  .limit(limit);
};

// Statique pour obtenir des stats de prospection
prospectCarrierSchema.statics.getProspectionStats = async function() {
  return this.aggregate([
    {
      $group: {
        _id: '$prospectionStatus',
        count: { $sum: 1 },
        avgEngagement: { $avg: '$engagementScore.value' }
      }
    }
  ]);
};

module.exports = mongoose.model('ProspectCarrier', prospectCarrierSchema);
