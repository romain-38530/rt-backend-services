/**
 * Service Dashboard B2P - Suivi conversions prospects transporteurs
 * v4.2.3 - Dashboard + Alertes temps reel
 */

let ProspectCarrier = null;
try {
  ProspectCarrier = require('./prospect-carrier-model');
} catch (err) {
  console.warn('[B2P DASHBOARD] ProspectCarrier model not available');
}

// ============================================================================
// STATISTIQUES GLOBALES
// ============================================================================

/**
 * Obtenir les statistiques globales de prospection B2P
 */
async function getGlobalStats() {
  if (!ProspectCarrier) {
    return { error: 'ProspectCarrier model not available' };
  }

  try {
    const [
      totalProspects,
      byStatus,
      recentActivity,
      conversionFunnel,
      topZones
    ] = await Promise.all([
      // Total prospects
      ProspectCarrier.countDocuments(),

      // Par statut
      ProspectCarrier.aggregate([
        {
          $group: {
            _id: '$prospectionStatus',
            count: { $sum: 1 },
            avgEngagement: { $avg: '$engagementScore.value' }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Activite recente (7 derniers jours)
      ProspectCarrier.aggregate([
        {
          $match: {
            'communications.0': { $exists: true }
          }
        },
        { $unwind: '$communications' },
        {
          $match: {
            'communications.sentAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$communications.sentAt' } },
            emailsSent: { $sum: 1 },
            opened: { $sum: { $cond: [{ $ne: ['$communications.openedAt', null] }, 1, 0] } },
            clicked: { $sum: { $cond: [{ $ne: ['$communications.clickedAt', null] }, 1, 0] } }
          }
        },
        { $sort: { _id: -1 } }
      ]),

      // Funnel de conversion
      getConversionFunnel(),

      // Top zones d'activite
      ProspectCarrier.aggregate([
        { $unwind: '$activityZones' },
        {
          $group: {
            _id: {
              from: '$activityZones.fromCity',
              to: '$activityZones.toCity'
            },
            count: { $sum: '$activityZones.frequency' },
            prospects: { $addToSet: '$_id' }
          }
        },
        {
          $project: {
            route: { $concat: ['$_id.from', ' → ', '$_id.to'] },
            count: 1,
            uniqueProspects: { $size: '$prospects' }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ])
    ]);

    // Calculer les metriques cles
    const statusMap = {};
    byStatus.forEach(s => {
      statusMap[s._id] = { count: s.count, avgEngagement: Math.round(s.avgEngagement || 0) };
    });

    const trialsActive = statusMap['trial_active']?.count || 0;
    const converted = statusMap['converted']?.count || 0;
    const contacted = statusMap['contacted']?.count || 0;
    const newProspects = statusMap['new']?.count || 0;

    // Taux de conversion
    const totalContacted = contacted + trialsActive + converted + (statusMap['interested']?.count || 0);
    const conversionRate = totalContacted > 0 ? ((converted / totalContacted) * 100).toFixed(2) : 0;
    const trialToConversionRate = trialsActive + converted > 0
      ? ((converted / (trialsActive + converted)) * 100).toFixed(2)
      : 0;

    return {
      summary: {
        totalProspects,
        newProspects,
        contacted,
        trialsActive,
        converted,
        conversionRate: parseFloat(conversionRate),
        trialToConversionRate: parseFloat(trialToConversionRate)
      },
      byStatus: statusMap,
      recentActivity,
      conversionFunnel,
      topZones,
      generatedAt: new Date()
    };

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting global stats:', error);
    throw error;
  }
}

/**
 * Obtenir le funnel de conversion detaille
 */
async function getConversionFunnel() {
  if (!ProspectCarrier) return [];

  try {
    const funnel = await ProspectCarrier.aggregate([
      {
        $facet: {
          // Etape 1: Total prospects
          total: [{ $count: 'count' }],

          // Etape 2: Contactes
          contacted: [
            { $match: { prospectionStatus: { $in: ['contacted', 'interested', 'trial_active', 'converted'] } } },
            { $count: 'count' }
          ],

          // Etape 3: Interesses (ouvert email ou clique)
          engaged: [
            {
              $match: {
                $or: [
                  { 'engagementScore.factors.emailOpens': { $gt: 0 } },
                  { 'engagementScore.factors.emailClicks': { $gt: 0 } }
                ]
              }
            },
            { $count: 'count' }
          ],

          // Etape 4: Trial active
          trial: [
            { $match: { prospectionStatus: { $in: ['trial_active', 'converted'] } } },
            { $count: 'count' }
          ],

          // Etape 5: Convertis
          converted: [
            { $match: { prospectionStatus: 'converted' } },
            { $count: 'count' }
          ]
        }
      }
    ]);

    const data = funnel[0];
    const total = data.total[0]?.count || 0;

    return [
      { stage: 'Prospects identifies', count: total, rate: 100 },
      { stage: 'Contactes par email', count: data.contacted[0]?.count || 0, rate: total > 0 ? Math.round((data.contacted[0]?.count || 0) / total * 100) : 0 },
      { stage: 'Engages (ouverture/clic)', count: data.engaged[0]?.count || 0, rate: total > 0 ? Math.round((data.engaged[0]?.count || 0) / total * 100) : 0 },
      { stage: 'Essai 10 transports', count: data.trial[0]?.count || 0, rate: total > 0 ? Math.round((data.trial[0]?.count || 0) / total * 100) : 0 },
      { stage: 'Convertis Premium', count: data.converted[0]?.count || 0, rate: total > 0 ? Math.round((data.converted[0]?.count || 0) / total * 100) : 0 }
    ];

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting conversion funnel:', error);
    return [];
  }
}

// ============================================================================
// PROSPECTS HAUTE CONVERSION
// ============================================================================

/**
 * Identifier les prospects a haute probabilite de conversion
 * Criteres: engagement eleve, trial actif avec utilisation, activite recente
 */
async function getHighConversionProspects(limit = 20) {
  if (!ProspectCarrier) return [];

  try {
    const prospects = await ProspectCarrier.aggregate([
      {
        $match: {
          prospectionStatus: { $in: ['interested', 'trial_active'] },
          blocked: { $ne: true }
        }
      },
      {
        $addFields: {
          // Score de probabilite de conversion
          conversionProbability: {
            $add: [
              // Engagement score (max 40 points)
              { $multiply: [{ $ifNull: ['$engagementScore.value', 0] }, 0.4] },

              // Trial actif avec utilisation (max 30 points)
              {
                $cond: [
                  { $eq: ['$prospectionStatus', 'trial_active'] },
                  {
                    $multiply: [
                      { $divide: [{ $ifNull: ['$trialOffer.transportsUsed', 0] }, 10] },
                      30
                    ]
                  },
                  0
                ]
              },

              // Activite recente - emails ouverts (max 15 points)
              { $min: [{ $multiply: [{ $ifNull: ['$engagementScore.factors.emailOpens', 0] }, 3] }, 15] },

              // Propositions faites (max 15 points)
              { $min: [{ $multiply: [{ $ifNull: ['$engagementScore.factors.proposalsMade', 0] }, 5] }, 15] }
            ]
          },

          // Jours restants trial
          trialDaysRemaining: {
            $cond: [
              { $and: [
                { $eq: ['$prospectionStatus', 'trial_active'] },
                { $ne: ['$trialOffer.expiresAt', null] }
              ]},
              {
                $divide: [
                  { $subtract: ['$trialOffer.expiresAt', new Date()] },
                  1000 * 60 * 60 * 24
                ]
              },
              null
            ]
          }
        }
      },
      { $sort: { conversionProbability: -1 } },
      { $limit: limit },
      {
        $project: {
          carrierName: 1,
          carrierEmail: 1,
          carrierPhone: 1,
          prospectionStatus: 1,
          engagementScore: '$engagementScore.value',
          conversionProbability: { $round: ['$conversionProbability', 1] },
          trialTransportsUsed: '$trialOffer.transportsUsed',
          trialTransportsLimit: '$trialOffer.transportsLimit',
          trialDaysRemaining: { $round: ['$trialDaysRemaining', 0] },
          activityZones: { $slice: ['$activityZones', 3] },
          lastCommunication: { $arrayElemAt: ['$communications', -1] }
        }
      }
    ]);

    // Ajouter des alertes
    return prospects.map(p => ({
      ...p,
      alerts: generateProspectAlerts(p)
    }));

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting high conversion prospects:', error);
    return [];
  }
}

/**
 * Generer des alertes pour un prospect
 */
function generateProspectAlerts(prospect) {
  const alerts = [];

  // Alert: Trial expire bientot
  if (prospect.trialDaysRemaining !== null && prospect.trialDaysRemaining <= 5 && prospect.trialDaysRemaining > 0) {
    alerts.push({
      type: 'warning',
      code: 'TRIAL_EXPIRING',
      message: `Essai expire dans ${prospect.trialDaysRemaining} jours`,
      priority: 'high'
    });
  }

  // Alert: Trial expire
  if (prospect.trialDaysRemaining !== null && prospect.trialDaysRemaining <= 0) {
    alerts.push({
      type: 'critical',
      code: 'TRIAL_EXPIRED',
      message: 'Essai expire - Relance urgente',
      priority: 'critical'
    });
  }

  // Alert: Haute probabilite de conversion
  if (prospect.conversionProbability >= 70) {
    alerts.push({
      type: 'opportunity',
      code: 'HIGH_CONVERSION',
      message: 'Probabilite de conversion elevee - Action recommandee',
      priority: 'high'
    });
  }

  // Alert: Beaucoup de transports utilises
  if (prospect.trialTransportsUsed >= 7) {
    alerts.push({
      type: 'opportunity',
      code: 'HIGH_USAGE',
      message: `${prospect.trialTransportsUsed}/10 transports utilises - Pret pour conversion`,
      priority: 'high'
    });
  }

  // Alert: Engagement eleve mais pas en trial
  if (prospect.engagementScore >= 50 && prospect.prospectionStatus === 'interested') {
    alerts.push({
      type: 'action',
      code: 'ENGAGE_NOT_TRIAL',
      message: 'Engage mais pas en essai - Proposer trial',
      priority: 'medium'
    });
  }

  return alerts;
}

// ============================================================================
// ALERTES TEMPS REEL
// ============================================================================

/**
 * Obtenir toutes les alertes actives pour le dashboard
 */
async function getActiveAlerts() {
  if (!ProspectCarrier) return [];

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    const [
      expiringTrials,
      expiredTrials,
      highEngagementNotTrial,
      bouncedEmails,
      noResponseLong
    ] = await Promise.all([
      // Trials qui expirent dans 5 jours
      ProspectCarrier.find({
        prospectionStatus: 'trial_active',
        'trialOffer.expiresAt': { $lte: fiveDaysFromNow, $gt: now }
      }).select('carrierName carrierEmail trialOffer.expiresAt trialOffer.transportsUsed').lean(),

      // Trials expires non convertis
      ProspectCarrier.find({
        prospectionStatus: 'trial_expired',
        'trialOffer.expiresAt': { $gte: sevenDaysAgo }
      }).select('carrierName carrierEmail trialOffer.transportsUsed').lean(),

      // Haute engagement mais pas en trial
      ProspectCarrier.find({
        prospectionStatus: { $in: ['contacted', 'interested'] },
        'engagementScore.value': { $gte: 50 }
      }).select('carrierName carrierEmail engagementScore.value').lean(),

      // Emails bounces recents
      ProspectCarrier.find({
        prospectionStatus: 'bounced',
        updatedAt: { $gte: sevenDaysAgo }
      }).select('carrierName carrierEmail').lean(),

      // Contactes sans reponse depuis longtemps
      ProspectCarrier.find({
        prospectionStatus: 'contacted',
        'communications.sentAt': { $lte: new Date(now - 14 * 24 * 60 * 60 * 1000) },
        'engagementScore.value': { $lt: 10 }
      }).select('carrierName carrierEmail communications').lean()
    ]);

    const alerts = [];

    // Alertes trials expirant
    expiringTrials.forEach(p => {
      const daysLeft = Math.ceil((new Date(p.trialOffer.expiresAt) - now) / (1000 * 60 * 60 * 24));
      alerts.push({
        id: `trial_expiring_${p._id}`,
        type: 'warning',
        category: 'conversion',
        priority: daysLeft <= 2 ? 'critical' : 'high',
        title: 'Essai expire bientot',
        message: `${p.carrierName} - Essai expire dans ${daysLeft} jour(s) (${p.trialOffer?.transportsUsed || 0} transports utilises)`,
        prospectId: p._id,
        carrierEmail: p.carrierEmail,
        action: 'SEND_CONVERSION_EMAIL',
        createdAt: now
      });
    });

    // Alertes trials expires
    expiredTrials.forEach(p => {
      alerts.push({
        id: `trial_expired_${p._id}`,
        type: 'critical',
        category: 'conversion',
        priority: 'high',
        title: 'Essai expire - Relance urgente',
        message: `${p.carrierName} - Essai termine avec ${p.trialOffer?.transportsUsed || 0} transports utilises`,
        prospectId: p._id,
        carrierEmail: p.carrierEmail,
        action: 'SEND_REACTIVATION_EMAIL',
        createdAt: now
      });
    });

    // Alertes haute engagement
    highEngagementNotTrial.forEach(p => {
      alerts.push({
        id: `high_engagement_${p._id}`,
        type: 'opportunity',
        category: 'conversion',
        priority: 'medium',
        title: 'Prospect engage sans essai',
        message: `${p.carrierName} - Score engagement ${p.engagementScore?.value || 0}% mais pas en essai`,
        prospectId: p._id,
        carrierEmail: p.carrierEmail,
        action: 'PROPOSE_TRIAL',
        createdAt: now
      });
    });

    // Alertes bounces
    bouncedEmails.forEach(p => {
      alerts.push({
        id: `bounced_${p._id}`,
        type: 'error',
        category: 'data_quality',
        priority: 'low',
        title: 'Email invalide',
        message: `${p.carrierName} - Email bounce: ${p.carrierEmail}`,
        prospectId: p._id,
        carrierEmail: p.carrierEmail,
        action: 'UPDATE_EMAIL',
        createdAt: now
      });
    });

    // Trier par priorite
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      total: alerts.length,
      byCritical: alerts.filter(a => a.priority === 'critical').length,
      byHigh: alerts.filter(a => a.priority === 'high').length,
      byMedium: alerts.filter(a => a.priority === 'medium').length,
      byLow: alerts.filter(a => a.priority === 'low').length,
      alerts: alerts.slice(0, 50) // Limiter a 50 alertes
    };

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting active alerts:', error);
    return { total: 0, alerts: [] };
  }
}

// ============================================================================
// HISTORIQUE ET TENDANCES
// ============================================================================

/**
 * Obtenir les tendances de conversion sur une periode
 */
async function getConversionTrends(days = 30) {
  if (!ProspectCarrier) return [];

  try {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const trends = await ProspectCarrier.aggregate([
      {
        $match: {
          $or: [
            { 'conversionTracking.firstContactAt': { $gte: startDate } },
            { 'conversionTracking.trialStartedAt': { $gte: startDate } },
            { 'conversionTracking.conversionAt': { $gte: startDate } }
          ]
        }
      },
      {
        $facet: {
          // Nouveaux contacts par jour
          contacts: [
            { $match: { 'conversionTracking.firstContactAt': { $gte: startDate } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$conversionTracking.firstContactAt' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          // Nouveaux trials par jour
          trials: [
            { $match: { 'conversionTracking.trialStartedAt': { $gte: startDate } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$conversionTracking.trialStartedAt' } },
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],
          // Conversions par jour
          conversions: [
            { $match: { 'conversionTracking.conversionAt': { $gte: startDate } } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$conversionTracking.conversionAt' } },
                count: { $sum: 1 },
                revenue: { $sum: '$conversionTracking.monthlyValue' }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    return {
      period: { start: startDate, end: new Date(), days },
      contacts: trends[0]?.contacts || [],
      trials: trends[0]?.trials || [],
      conversions: trends[0]?.conversions || []
    };

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting conversion trends:', error);
    return { contacts: [], trials: [], conversions: [] };
  }
}

/**
 * Obtenir le revenue genere par les conversions B2P
 */
async function getRevenueStats() {
  if (!ProspectCarrier) return { total: 0, monthly: 0, byPlan: {} };

  try {
    const stats = await ProspectCarrier.aggregate([
      { $match: { prospectionStatus: 'converted' } },
      {
        $group: {
          _id: '$conversionTracking.subscriptionPlan',
          count: { $sum: 1 },
          totalMonthly: { $sum: '$conversionTracking.monthlyValue' }
        }
      }
    ]);

    const byPlan = {};
    let totalMonthly = 0;
    let totalConverted = 0;

    stats.forEach(s => {
      byPlan[s._id || 'unknown'] = {
        count: s.count,
        monthlyRevenue: s.totalMonthly
      };
      totalMonthly += s.totalMonthly || 0;
      totalConverted += s.count;
    });

    return {
      totalConverted,
      monthlyRecurring: totalMonthly,
      annualProjected: totalMonthly * 12,
      byPlan,
      averageValue: totalConverted > 0 ? Math.round(totalMonthly / totalConverted) : 0
    };

  } catch (error) {
    console.error('[B2P DASHBOARD] Error getting revenue stats:', error);
    return { total: 0, monthly: 0, byPlan: {} };
  }
}

// ============================================================================
// ACTIONS COMMERCIALES
// ============================================================================

/**
 * Obtenir la liste des actions commerciales recommandees
 */
async function getRecommendedActions() {
  const [highConversion, alerts] = await Promise.all([
    getHighConversionProspects(10),
    getActiveAlerts()
  ]);

  const actions = [];

  // Actions basees sur les alertes critiques
  alerts.alerts
    .filter(a => a.priority === 'critical' || a.priority === 'high')
    .slice(0, 10)
    .forEach(alert => {
      actions.push({
        priority: alert.priority,
        type: alert.action,
        prospectId: alert.prospectId,
        carrierName: alert.message.split(' - ')[0],
        carrierEmail: alert.carrierEmail,
        reason: alert.title,
        suggestedAction: getActionDescription(alert.action)
      });
    });

  // Actions basees sur les prospects haute conversion
  highConversion
    .filter(p => p.conversionProbability >= 60 && !actions.some(a => a.prospectId?.toString() === p._id?.toString()))
    .slice(0, 5)
    .forEach(prospect => {
      actions.push({
        priority: 'medium',
        type: 'FOLLOW_UP',
        prospectId: prospect._id,
        carrierName: prospect.carrierName,
        carrierEmail: prospect.carrierEmail,
        reason: `Probabilite conversion ${prospect.conversionProbability}%`,
        suggestedAction: 'Appel commercial ou email personnalise'
      });
    });

  return actions;
}

function getActionDescription(actionCode) {
  const descriptions = {
    'SEND_CONVERSION_EMAIL': 'Envoyer email de conversion avec offre speciale',
    'SEND_REACTIVATION_EMAIL': 'Envoyer email de reactivation avec incentive',
    'PROPOSE_TRIAL': 'Proposer l\'essai 10 transports gratuits',
    'UPDATE_EMAIL': 'Mettre a jour l\'adresse email',
    'FOLLOW_UP': 'Effectuer un suivi commercial'
  };
  return descriptions[actionCode] || actionCode;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Stats globales
  getGlobalStats,
  getConversionFunnel,

  // Prospects haute conversion
  getHighConversionProspects,

  // Alertes
  getActiveAlerts,

  // Tendances
  getConversionTrends,
  getRevenueStats,

  // Actions
  getRecommendedActions
};
