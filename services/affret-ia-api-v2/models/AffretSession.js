/**
 * Modele MongoDB pour les sessions AFFRET.IA
 * Une session represente un processus complet d'affretement intelligent
 */

const mongoose = require('mongoose');

const affretSessionSchema = new mongoose.Schema({
  // Identifiants
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  organizationId: {
    type: String,
    required: true,
    index: true
  },

  // Declenchement
  trigger: {
    type: {
      type: String,
      enum: ['auto_failure', 'technical_incapacity', 'manual'],
      required: true
    },
    reason: String,
    triggeredBy: String,
    triggeredAt: {
      type: Date,
      default: Date.now
    }
  },

  // Statut global
  status: {
    type: String,
    enum: [
      'analyzing',           // Analyse en cours
      'shortlist_created',   // Shortlist generee
      'broadcasting',        // Diffusion en cours
      'awaiting_responses',  // Attente reponses
      'negotiating',         // Negociation en cours
      'selecting',           // Selection en cours
      'assigned',            // Transporteur assigne
      'failed',              // Echec
      'cancelled'            // Annule
    ],
    default: 'analyzing',
    index: true
  },

  // Analyse IA
  analysis: {
    complexity: {
      type: Number,
      min: 0,
      max: 100
    },
    constraints: [String],
    estimatedPrice: Number,
    suggestedCarriers: Number,
    analyzedAt: Date,
    criteria: {
      distance: Number,
      weight: Number,
      volume: Number,
      vehicleType: String,
      specialRequirements: [String]
    }
  },

  // Shortlist
  shortlist: [{
    carrierId: String,
    carrierName: String,
    matchScore: Number,
    estimatedPrice: Number,
    capacity: Boolean,
    distance: Number,
    reason: String, // Pourquoi selectionne
    contactEmail: String,
    contactPhone: String
  }],

  // Diffusion
  broadcast: {
    channels: [{
      type: {
        type: String,
        enum: ['email', 'bourse', 'push']
      },
      sentAt: Date,
      recipients: Number,
      status: String,
      messageId: String
    }],
    totalRecipients: Number,
    startedAt: Date,
    completedAt: Date,
    campaignId: String
  },

  // Propositions recues
  proposalsReceived: {
    type: Number,
    default: 0
  },
  proposalsAccepted: {
    type: Number,
    default: 0
  },
  proposalsRejected: {
    type: Number,
    default: 0
  },
  proposalsNegotiated: {
    type: Number,
    default: 0
  },
  proposalsTimeout: {
    type: Number,
    default: 0
  },

  // Selection finale
  selection: {
    carrierId: String,
    carrierName: String,
    proposalId: String,
    finalPrice: Number,
    selectionReason: String,
    priceScore: Number,
    qualityScore: Number,
    overallScore: Number,
    selectedAt: Date,
    selectedBy: {
      type: String,
      enum: ['ai', 'manual']
    },
    userId: String
  },

  // Timeline
  timeline: [{
    event: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    data: mongoose.Schema.Types.Mixed,
    userId: String
  }],

  // Metriques
  metrics: {
    totalDuration: Number,      // ms
    analysisTime: Number,       // ms
    broadcastTime: Number,      // ms
    responseTime: Number,       // ms (temps premiere reponse)
    selectionTime: Number,      // ms
    avgResponseTime: Number     // ms (temps moyen reponses)
  },

  // Parametres de negociation
  negotiationSettings: {
    maxPriceIncrease: {
      type: Number,
      default: 15  // % max au-dessus du prix estime
    },
    autoAcceptThreshold: {
      type: Number,
      default: 0  // % - acceptation auto si <= prix estime
    },
    timeout: {
      type: Number,
      default: 24  // heures
    }
  },

  // Notes et raisons
  notes: String,
  cancelledReason: String,
  failureReason: String

}, {
  timestamps: true
});

// Index composites pour performance
affretSessionSchema.index({ status: 1, createdAt: -1 });
affretSessionSchema.index({ organizationId: 1, status: 1 });
affretSessionSchema.index({ orderId: 1 });
affretSessionSchema.index({ 'trigger.triggeredAt': -1 });

// Methodes d'instance

affretSessionSchema.methods.addTimelineEvent = function(event, data = {}, userId = null) {
  this.timeline.push({
    event,
    timestamp: new Date(),
    data,
    userId
  });
};

affretSessionSchema.methods.updateMetrics = function() {
  if (!this.trigger.triggeredAt) return;

  const now = new Date();
  this.metrics.totalDuration = now - this.trigger.triggeredAt;

  if (this.analysis.analyzedAt) {
    this.metrics.analysisTime = this.analysis.analyzedAt - this.trigger.triggeredAt;
  }

  if (this.broadcast.startedAt && this.broadcast.completedAt) {
    this.metrics.broadcastTime = this.broadcast.completedAt - this.broadcast.startedAt;
  }

  if (this.selection.selectedAt) {
    this.metrics.selectionTime = this.selection.selectedAt - this.trigger.triggeredAt;
  }
};

affretSessionSchema.methods.canNegotiate = function(proposedPrice) {
  if (!this.analysis.estimatedPrice) return false;

  const maxAllowedPrice = this.analysis.estimatedPrice * (1 + this.negotiationSettings.maxPriceIncrease / 100);
  return proposedPrice <= maxAllowedPrice;
};

// Methodes statiques

affretSessionSchema.statics.generateSessionId = async function() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  // Trouver le dernier numero de session du jour
  const prefix = `AFFRET-${year}${month}${day}`;
  const lastSession = await this.findOne({
    sessionId: new RegExp(`^${prefix}`)
  }).sort({ sessionId: -1 });

  let sequence = 1;
  if (lastSession) {
    const lastSequence = parseInt(lastSession.sessionId.split('-').pop());
    sequence = lastSequence + 1;
  }

  return `${prefix}-${sequence.toString().padStart(4, '0')}`;
};

affretSessionSchema.statics.getSessionStats = async function(organizationId, startDate, endDate) {
  const match = { organizationId };

  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        successfulSessions: {
          $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] }
        },
        failedSessions: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        avgDuration: { $avg: '$metrics.totalDuration' },
        avgProposalsReceived: { $avg: '$proposalsReceived' },
        avgFinalPrice: { $avg: '$selection.finalPrice' }
      }
    }
  ]);

  if (stats.length === 0) {
    return {
      totalSessions: 0,
      successRate: 0,
      avgDuration: 0,
      avgProposalsReceived: 0,
      avgFinalPrice: 0
    };
  }

  const result = stats[0];
  return {
    totalSessions: result.totalSessions,
    successRate: (result.successfulSessions / result.totalSessions) * 100,
    failedSessions: result.failedSessions,
    avgDuration: Math.round(result.avgDuration / 1000 / 60), // minutes
    avgProposalsReceived: Math.round(result.avgProposalsReceived * 10) / 10,
    avgFinalPrice: Math.round(result.avgFinalPrice * 100) / 100
  };
};

const AffretSession = mongoose.model('AffretSession', affretSessionSchema);

module.exports = AffretSession;
