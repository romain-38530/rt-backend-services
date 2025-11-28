/**
 * Modele MongoDB pour les verifications de conformite (Devoir de Vigilance)
 * Gere KBIS, assurances, licences, blacklist
 */

const mongoose = require('mongoose');

const vigilanceCheckSchema = new mongoose.Schema({
  carrierId: {
    type: String,
    required: true,
    index: true
  },
  carrierName: String,
  companyName: String,

  // Verifications KBIS
  checks: {
    kbis: {
      valid: Boolean,
      companyName: String,
      legalForm: String,
      siret: String,
      siren: String,
      registrationDate: Date,
      registrationNumber: String,
      address: String,
      lastChecked: Date,
      expiryDate: Date,
      documentUrl: String,
      error: String
    },

    // Assurance RCP
    insurance: {
      valid: Boolean,
      insuranceType: String,
      provider: String,
      policyNumber: String,
      coverage: Number, // Montant couverture en euros
      startDate: Date,
      expiryDate: Date,
      lastChecked: Date,
      documentUrl: String,
      error: String
    },

    // Licence de transport
    license: {
      valid: Boolean,
      licenseNumber: String,
      licenseType: {
        type: String,
        enum: ['light', 'heavy', 'international']
      },
      issueDate: Date,
      expiryDate: Date,
      authority: String,
      lastChecked: Date,
      documentUrl: String,
      error: String
    },

    // Verification blacklist
    blacklist: {
      clean: Boolean,
      listed: Boolean,
      reason: String,
      severity: {
        type: String,
        enum: ['none', 'warning', 'blacklist']
      },
      addedAt: Date,
      addedBy: String,
      expiresAt: Date,
      lastChecked: Date
    },

    // Attestation fiscale
    fiscalCertificate: {
      valid: Boolean,
      year: Number,
      issueDate: Date,
      expiryDate: Date,
      lastChecked: Date,
      documentUrl: String
    },

    // Attestation sociale (URSSAF)
    socialCertificate: {
      valid: Boolean,
      quarter: String,
      issueDate: Date,
      expiryDate: Date,
      lastChecked: Date,
      documentUrl: String
    }
  },

  // Statut global de conformite
  overallStatus: {
    type: String,
    enum: ['compliant', 'warning', 'non_compliant', 'blacklisted', 'pending'],
    default: 'pending',
    index: true
  },

  // Score de conformite (0-100)
  complianceScore: {
    type: Number,
    min: 0,
    max: 100
  },

  // Alertes
  alerts: [{
    type: {
      type: String,
      enum: ['expiry_soon', 'expired', 'missing_document', 'blacklist', 'invalid_document']
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical']
    },
    message: String,
    relatedCheck: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    resolvedAt: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  }],

  // Historique des verifications
  checkHistory: [{
    checkType: String,
    performedAt: Date,
    performedBy: String,
    result: String,
    notes: String
  }],

  // Planning des prochaines verifications
  lastFullCheck: Date,
  nextCheckDue: Date,
  checkFrequency: {
    type: Number,
    default: 90 // jours
  },

  // Actions requises
  requiredActions: [{
    action: String,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    dueDate: Date,
    completed: Boolean,
    completedAt: Date
  }],

  // Notes
  notes: String,
  internalNotes: String,
  checkedBy: String,
  approvedBy: String,
  approvedAt: Date

}, {
  timestamps: true
});

// Index
vigilanceCheckSchema.index({ overallStatus: 1 });
vigilanceCheckSchema.index({ complianceScore: -1 });
vigilanceCheckSchema.index({ 'checks.insurance.expiryDate': 1 });
vigilanceCheckSchema.index({ 'checks.kbis.expiryDate': 1 });
vigilanceCheckSchema.index({ nextCheckDue: 1 });

// Methodes d'instance

vigilanceCheckSchema.methods.calculateComplianceScore = function() {
  let score = 0;
  let totalChecks = 0;
  let validChecks = 0;

  const checks = [
    'kbis',
    'insurance',
    'license',
    'blacklist',
    'fiscalCertificate',
    'socialCertificate'
  ];

  checks.forEach(checkType => {
    if (this.checks[checkType]) {
      totalChecks++;
      if (checkType === 'blacklist') {
        if (this.checks[checkType].clean) validChecks++;
      } else {
        if (this.checks[checkType].valid) validChecks++;
      }
    }
  });

  if (totalChecks > 0) {
    score = (validChecks / totalChecks) * 100;
  }

  // Penalite si blackliste
  if (this.checks.blacklist?.listed && this.checks.blacklist.severity === 'blacklist') {
    score = 0;
  } else if (this.checks.blacklist?.listed && this.checks.blacklist.severity === 'warning') {
    score *= 0.7; // -30%
  }

  this.complianceScore = Math.round(score);
  return this.complianceScore;
};

vigilanceCheckSchema.methods.updateOverallStatus = function() {
  // Blackliste = statut le plus grave
  if (this.checks.blacklist?.listed && this.checks.blacklist.severity === 'blacklist') {
    this.overallStatus = 'blacklisted';
    return;
  }

  // Verifier documents critiques (KBIS, assurance, licence)
  const criticalDocs = ['kbis', 'insurance', 'license'];
  const invalidCritical = criticalDocs.some(doc =>
    this.checks[doc] && !this.checks[doc].valid
  );

  if (invalidCritical) {
    this.overallStatus = 'non_compliant';
    return;
  }

  // Verifier expirations proches
  const warningThreshold = 30; // jours
  const now = new Date();
  const hasWarnings = criticalDocs.some(doc => {
    if (!this.checks[doc]?.expiryDate) return false;
    const daysUntilExpiry = (this.checks[doc].expiryDate - now) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= warningThreshold;
  });

  if (hasWarnings || (this.checks.blacklist?.listed && this.checks.blacklist.severity === 'warning')) {
    this.overallStatus = 'warning';
    return;
  }

  this.overallStatus = 'compliant';
};

vigilanceCheckSchema.methods.addAlert = function(type, severity, message, relatedCheck = null) {
  this.alerts.push({
    type,
    severity,
    message,
    relatedCheck,
    createdAt: new Date(),
    resolved: false
  });
};

vigilanceCheckSchema.methods.resolveAlert = function(alertId) {
  const alert = this.alerts.id(alertId);
  if (alert) {
    alert.resolved = true;
    alert.resolvedAt = new Date();
  }
};

vigilanceCheckSchema.methods.addCheckToHistory = function(checkType, result, performedBy, notes = '') {
  this.checkHistory.push({
    checkType,
    performedAt: new Date(),
    performedBy,
    result,
    notes
  });
};

vigilanceCheckSchema.methods.isCompliant = function() {
  return this.overallStatus === 'compliant';
};

vigilanceCheckSchema.methods.canOperate = function() {
  return ['compliant', 'warning'].includes(this.overallStatus);
};

vigilanceCheckSchema.methods.scheduleNextCheck = function() {
  const now = new Date();
  this.lastFullCheck = now;
  this.nextCheckDue = new Date(now.getTime() + (this.checkFrequency * 24 * 60 * 60 * 1000));
};

// Methodes statiques

vigilanceCheckSchema.statics.findExpiringSoon = async function(days = 30) {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);

  return this.find({
    $or: [
      { 'checks.kbis.expiryDate': { $lte: threshold, $gte: new Date() } },
      { 'checks.insurance.expiryDate': { $lte: threshold, $gte: new Date() } },
      { 'checks.license.expiryDate': { $lte: threshold, $gte: new Date() } }
    ]
  });
};

vigilanceCheckSchema.statics.findDueForCheck = async function() {
  const now = new Date();
  return this.find({
    nextCheckDue: { $lte: now }
  });
};

vigilanceCheckSchema.statics.getBlacklisted = async function() {
  return this.find({
    'checks.blacklist.listed': true,
    'checks.blacklist.severity': 'blacklist'
  });
};

vigilanceCheckSchema.statics.getComplianceStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$overallStatus',
        count: { $sum: 1 },
        avgScore: { $avg: '$complianceScore' }
      }
    }
  ]);

  const total = await this.countDocuments();

  return {
    total,
    breakdown: stats.reduce((acc, stat) => {
      acc[stat._id] = {
        count: stat.count,
        percentage: (stat.count / total) * 100,
        avgScore: Math.round(stat.avgScore)
      };
      return acc;
    }, {})
  };
};

const VigilanceCheck = mongoose.model('VigilanceCheck', vigilanceCheckSchema);

module.exports = VigilanceCheck;
