/**
 * Modele MongoDB pour les propositions de transporteurs
 * Gere les offres, negociations et reponses des transporteurs
 */

const mongoose = require('mongoose');

const carrierProposalSchema = new mongoose.Schema({
  // Identifiants
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  carrierId: {
    type: String,
    required: true,
    index: true
  },
  carrierName: String,

  // Proposition
  proposedPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  priceBreakdown: {
    base: Number,
    fuel: Number,
    services: Number,
    taxes: Number,
    discount: Number
  },

  // Details transport
  vehicleType: String,
  vehiclePlate: String,
  vehicleCapacity: {
    pallets: Number,
    weight: Number,
    volume: Number
  },
  driverName: String,
  driverPhone: String,
  driverEmail: String,

  estimatedPickupDate: Date,
  estimatedPickupTime: String,
  estimatedDeliveryDate: Date,
  estimatedDeliveryTime: String,

  // Services proposes
  services: {
    tailgate: Boolean,
    palletJack: Boolean,
    insurance: Boolean,
    insuranceValue: Number,
    adr: Boolean,
    temperatureControlled: Boolean,
    tracking: {
      type: String,
      enum: ['basic', 'intermediate', 'premium']
    }
  },

  // Statut
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'negotiating', 'timeout', 'withdrawn'],
    default: 'pending',
    index: true
  },

  // Scoring
  scores: {
    price: {
      type: Number,
      min: 0,
      max: 100
    },
    quality: {
      type: Number,
      min: 0,
      max: 100
    },
    overall: {
      type: Number,
      min: 0,
      max: 100
    },
    details: {
      historicalPerformance: Number,
      punctuality: Number,
      acceptanceRate: Number,
      reactivity: Number,
      capacity: Number
    }
  },

  // Historique
  submittedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  respondedAt: Date,
  response: {
    status: String,
    reason: String,
    respondedBy: String,
    respondedByName: String
  },

  // Negociation
  negotiationHistory: [{
    proposedPrice: Number,
    counterPrice: Number,
    proposedBy: {
      type: String,
      enum: ['carrier', 'ai', 'user']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    message: String,
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'countered']
    }
  }],
  currentNegotiationRound: {
    type: Number,
    default: 0
  },
  maxNegotiationRounds: {
    type: Number,
    default: 3
  },

  // Conformite / Vigilance
  vigilanceCheck: {
    kbis: {
      valid: Boolean,
      checkedAt: Date,
      expiryDate: Date,
      details: String
    },
    insurance: {
      valid: Boolean,
      checkedAt: Date,
      expiryDate: Date,
      provider: String,
      policyNumber: String
    },
    license: {
      valid: Boolean,
      checkedAt: Date,
      licenseNumber: String,
      expiryDate: Date
    },
    blacklist: {
      clean: Boolean,
      checkedAt: Date,
      reason: String
    },
    overall: Boolean
  },

  // Source de la proposition
  source: {
    type: String,
    enum: ['email', 'bourse', 'push', 'manual', 'api'],
    default: 'api'
  },

  // Conditions particulieres
  conditions: String,
  validUntil: Date,

  // Notes
  notes: String,
  internalNotes: String

}, {
  timestamps: true
});

// Index composites
carrierProposalSchema.index({ sessionId: 1, status: 1 });
carrierProposalSchema.index({ carrierId: 1, createdAt: -1 });
carrierProposalSchema.index({ status: 1, submittedAt: -1 });
carrierProposalSchema.index({ 'scores.overall': -1 });

// Methodes d'instance

carrierProposalSchema.methods.calculateScores = async function(estimatedPrice, carrierScore) {
  // Score Prix (0-100)
  // 100 si prix <= estime, decroit lineairement jusqu'a 0 a +50%
  const priceRatio = this.proposedPrice / estimatedPrice;
  let priceScore = 100;

  if (priceRatio > 1) {
    // Prix superieur a l'estimation
    const excess = (priceRatio - 1) * 100; // % au-dessus
    if (excess <= 15) {
      // Penalite douce jusqu'a +15%
      priceScore = 100 - (excess * 2); // -2 points par %
    } else if (excess <= 30) {
      // Penalite moyenne +15% a +30%
      priceScore = 70 - ((excess - 15) * 3);
    } else {
      // Penalite forte au-dela +30%
      priceScore = Math.max(0, 25 - ((excess - 30) * 1.25));
    }
  } else {
    // Prix inferieur ou egal: bonus
    const discount = (1 - priceRatio) * 100;
    priceScore = Math.min(100, 100 + (discount * 0.5));
  }

  // Score Qualite (0-100) - base sur le score global du transporteur
  const qualityScore = carrierScore || 50;

  // Score Global (40% prix + 60% qualite)
  const overallScore = (priceScore * 0.4) + (qualityScore * 0.6);

  this.scores = {
    price: Math.round(priceScore * 100) / 100,
    quality: Math.round(qualityScore * 100) / 100,
    overall: Math.round(overallScore * 100) / 100
  };

  return this.scores;
};

carrierProposalSchema.methods.addNegotiation = function(data) {
  this.negotiationHistory.push({
    proposedPrice: data.proposedPrice,
    counterPrice: data.counterPrice,
    proposedBy: data.proposedBy,
    timestamp: new Date(),
    message: data.message,
    status: data.status || 'pending'
  });

  this.currentNegotiationRound = this.negotiationHistory.length;

  if (this.status === 'pending') {
    this.status = 'negotiating';
  }
};

carrierProposalSchema.methods.canNegotiate = function() {
  return this.currentNegotiationRound < this.maxNegotiationRounds &&
         ['pending', 'negotiating'].includes(this.status);
};

carrierProposalSchema.methods.accept = function(respondedBy, reason = '') {
  this.status = 'accepted';
  this.respondedAt = new Date();
  this.response = {
    status: 'accepted',
    reason,
    respondedBy
  };
};

carrierProposalSchema.methods.reject = function(respondedBy, reason = '') {
  this.status = 'rejected';
  this.respondedAt = new Date();
  this.response = {
    status: 'rejected',
    reason,
    respondedBy
  };
};

carrierProposalSchema.methods.timeout = function() {
  this.status = 'timeout';
  this.respondedAt = new Date();
  this.response = {
    status: 'timeout',
    reason: 'No response within deadline'
  };
};

// Methodes statiques

carrierProposalSchema.statics.findBySession = function(sessionId, filters = {}) {
  return this.find({ sessionId, ...filters }).sort({ 'scores.overall': -1 });
};

carrierProposalSchema.statics.getRanking = async function(sessionId) {
  const proposals = await this.find({ sessionId })
    .sort({ 'scores.overall': -1 });

  return proposals.map((proposal, index) => ({
    rank: index + 1,
    carrierId: proposal.carrierId,
    carrierName: proposal.carrierName,
    proposedPrice: proposal.proposedPrice,
    scores: proposal.scores,
    status: proposal.status
  }));
};

carrierProposalSchema.statics.getBestProposal = async function(sessionId, algorithm = 'overall') {
  const proposals = await this.find({
    sessionId,
    status: { $in: ['pending', 'negotiating', 'accepted'] }
  });

  if (proposals.length === 0) return null;

  switch (algorithm) {
    case 'best_price':
      return proposals.reduce((best, current) =>
        current.proposedPrice < best.proposedPrice ? current : best
      );

    case 'best_quality':
      return proposals.reduce((best, current) =>
        current.scores.quality > best.scores.quality ? current : best
      );

    case 'overall':
    default:
      return proposals.reduce((best, current) =>
        current.scores.overall > best.scores.overall ? current : best
      );
  }
};

const CarrierProposal = mongoose.model('CarrierProposal', carrierProposalSchema);

module.exports = CarrierProposal;
