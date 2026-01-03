/**
 * Modele MongoDB pour les campagnes de diffusion AFFRET.IA
 * Gere l'envoi multi-canal (Email, Bourse, Push)
 */

const mongoose = require('mongoose');

const broadcastCampaignSchema = new mongoose.Schema({
  // Identifiants
  campaignId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  orderId: {
    type: String,
    required: true
  },
  organizationId: {
    type: String,
    required: true
  },

  // Configuration canaux
  channels: [{
    type: {
      type: String,
      enum: ['email', 'bourse', 'push'],
      required: true
    },
    enabled: Boolean,
    config: {
      template: String,
      subject: String,
      priority: {
        type: String,
        enum: ['low', 'normal', 'high']
      }
    },
    sentAt: Date,
    status: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed']
    }
  }],

  // Destinataires
  recipients: [{
    carrierId: String,
    carrierName: String,
    contactEmail: String,
    contactPhone: String,
    channel: {
      type: String,
      enum: ['email', 'bourse', 'push']
    },

    // Statuts d'envoi
    queued: Boolean,
    queuedAt: Date,
    sent: Boolean,
    sentAt: Date,
    delivered: Boolean,
    deliveredAt: Date,
    opened: Boolean,
    openedAt: Date,
    clicked: Boolean,
    clickedAt: Date,
    responded: Boolean,
    respondedAt: Date,

    // Erreurs
    failed: Boolean,
    failureReason: String,
    bounced: Boolean,
    bounceReason: String,

    // Identifiants externes
    messageId: String,
    trackingId: String
  }],

  // Statistiques globales
  stats: {
    total: {
      type: Number,
      default: 0
    },
    queued: {
      type: Number,
      default: 0
    },
    sent: {
      type: Number,
      default: 0
    },
    delivered: {
      type: Number,
      default: 0
    },
    opened: {
      type: Number,
      default: 0
    },
    clicked: {
      type: Number,
      default: 0
    },
    responded: {
      type: Number,
      default: 0
    },
    failed: {
      type: Number,
      default: 0
    },
    bounced: {
      type: Number,
      default: 0
    }
  },

  // Relances
  reminders: [{
    sentAt: Date,
    recipients: Number,
    channel: String,
    messageId: String,
    stats: {
      sent: Number,
      delivered: Number,
      responded: Number
    }
  }],
  reminderSchedule: {
    enabled: Boolean,
    delays: [Number], // heures apres envoi initial
    maxReminders: {
      type: Number,
      default: 2
    }
  },

  // Templates et contenu
  emailTemplate: {
    subject: String,
    bodyHTML: String,
    bodyText: String,
    variables: mongoose.Schema.Types.Mixed
  },
  pushTemplate: {
    title: String,
    body: String,
    data: mongoose.Schema.Types.Mixed
  },

  // Bourse publique
  boursePublication: {
    published: Boolean,
    publishedAt: Date,
    expiresAt: Date,
    views: {
      type: Number,
      default: 0
    },
    url: String
  },

  // Statut global
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'completed', 'failed', 'cancelled'],
    default: 'draft',
    index: true
  },

  // Timing
  scheduledFor: Date,
  startedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  duration: Number, // ms

  // Parametres
  settings: {
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal'
    },
    responseDeadline: Date,
    autoReminders: Boolean,
    maxRecipients: Number
  },

  // Notes
  notes: String,
  cancelReason: String

}, {
  timestamps: true
});

// Index
broadcastCampaignSchema.index({ sessionId: 1 });
broadcastCampaignSchema.index({ status: 1, createdAt: -1 });
broadcastCampaignSchema.index({ 'boursePublication.expiresAt': 1 });

// Methodes d'instance

broadcastCampaignSchema.methods.updateStats = function() {
  this.stats.total = this.recipients.length;
  this.stats.queued = this.recipients.filter(r => r.queued).length;
  this.stats.sent = this.recipients.filter(r => r.sent).length;
  this.stats.delivered = this.recipients.filter(r => r.delivered).length;
  this.stats.opened = this.recipients.filter(r => r.opened).length;
  this.stats.clicked = this.recipients.filter(r => r.clicked).length;
  this.stats.responded = this.recipients.filter(r => r.responded).length;
  this.stats.failed = this.recipients.filter(r => r.failed).length;
  this.stats.bounced = this.recipients.filter(r => r.bounced).length;
};

broadcastCampaignSchema.methods.markRecipientSent = function(carrierId, messageId = null) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.sent = true;
    recipient.sentAt = new Date();
    if (messageId) recipient.messageId = messageId;
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.markRecipientDelivered = function(carrierId) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.delivered = true;
    recipient.deliveredAt = new Date();
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.markRecipientOpened = function(carrierId) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.opened = true;
    recipient.openedAt = new Date();
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.markRecipientClicked = function(carrierId) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.clicked = true;
    recipient.clickedAt = new Date();
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.markRecipientResponded = function(carrierId) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.responded = true;
    recipient.respondedAt = new Date();
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.markRecipientFailed = function(carrierId, reason) {
  const recipient = this.recipients.find(r => r.carrierId === carrierId);
  if (recipient) {
    recipient.failed = true;
    recipient.failureReason = reason;
    this.updateStats();
  }
};

broadcastCampaignSchema.methods.addReminder = function(recipientsCount, channel) {
  this.reminders.push({
    sentAt: new Date(),
    recipients: recipientsCount,
    channel
  });
};

broadcastCampaignSchema.methods.getEngagementRate = function() {
  if (this.stats.sent === 0) return 0;
  return (this.stats.responded / this.stats.sent) * 100;
};

broadcastCampaignSchema.methods.getOpenRate = function() {
  if (this.stats.delivered === 0) return 0;
  return (this.stats.opened / this.stats.delivered) * 100;
};

broadcastCampaignSchema.methods.getClickRate = function() {
  if (this.stats.opened === 0) return 0;
  return (this.stats.clicked / this.stats.opened) * 100;
};

// Methodes statiques

broadcastCampaignSchema.statics.generateCampaignId = async function() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  const prefix = `BC${year}${month}${day}`;
  const lastCampaign = await this.findOne({
    campaignId: new RegExp(`^${prefix}`)
  }).sort({ campaignId: -1 });

  let sequence = 1;
  if (lastCampaign) {
    const lastSequence = parseInt(lastCampaign.campaignId.slice(-4));
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
};

broadcastCampaignSchema.statics.getCampaignPerformance = async function(campaignId) {
  const campaign = await this.findOne({ campaignId });

  if (!campaign) return null;

  return {
    campaignId: campaign.campaignId,
    sessionId: campaign.sessionId,
    status: campaign.status,
    stats: campaign.stats,
    engagementRate: campaign.getEngagementRate(),
    openRate: campaign.getOpenRate(),
    clickRate: campaign.getClickRate(),
    duration: campaign.duration,
    reminders: campaign.reminders.length
  };
};

const BroadcastCampaign = mongoose.model('BroadcastCampaign', broadcastCampaignSchema);

module.exports = BroadcastCampaign;
