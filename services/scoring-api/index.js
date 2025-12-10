/**
 * SYMPHONI.A Scoring API
 * Système de notation des transporteurs basé sur leurs performances
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const io = require('socket.io-client');

const app = express();
const PORT = process.env.PORT || 3016;

app.use(cors());
app.use(express.json());

// WebSocket
let websocket = null;
if (process.env.WEBSOCKET_URL) {
  websocket = io(process.env.WEBSOCKET_URL);
}

function emitEvent(eventName, data) {
  if (websocket?.connected) {
    websocket.emit('emit-event', { eventName, data });
  }
}

// Transport Score Schema
const transportScoreSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  carrierId: { type: String, required: true, index: true },
  carrierName: String,

  // Critères de notation (0-100)
  punctualityPickup: { type: Number, min: 0, max: 100 }, // Ponctualité enlèvement
  punctualityDelivery: { type: Number, min: 0, max: 100 }, // Ponctualité livraison
  appointmentRespect: { type: Number, min: 0, max: 100 }, // Respect des RDV
  trackingReactivity: { type: Number, min: 0, max: 100 }, // Réactivité tracking
  podDelay: { type: Number, min: 0, max: 100 }, // Délai POD
  incidentsManaged: { type: Number, min: 0, max: 100 }, // Gestion incidents
  delaysJustified: { type: Number, min: 0, max: 100 }, // Retards justifiés

  // Score final calculé
  finalScore: { type: Number, min: 0, max: 100 },

  // Pondérations utilisées
  weights: {
    punctualityPickup: { type: Number, default: 0.20 },
    punctualityDelivery: { type: Number, default: 0.25 },
    appointmentRespect: { type: Number, default: 0.15 },
    trackingReactivity: { type: Number, default: 0.10 },
    podDelay: { type: Number, default: 0.10 },
    incidentsManaged: { type: Number, default: 0.10 },
    delaysJustified: { type: Number, default: 0.10 }
  },

  // Détails
  pickupScheduled: Date,
  pickupActual: Date,
  pickupDelayMinutes: Number,

  deliveryScheduled: Date,
  deliveryActual: Date,
  deliveryDelayMinutes: Number,

  podUploadedAt: Date,
  podDelayHours: Number,

  incidents: [{
    type: String,
    reportedAt: Date,
    resolvedAt: Date,
    resolutionTime: Number
  }],

  delays: [{
    type: { type: String, enum: ['pickup', 'delivery'] },
    minutes: Number,
    justified: Boolean,
    reason: String
  }],

  notes: String,
  scoredBy: String,
  scoredAt: { type: Date, default: Date.now }
}, { timestamps: true });

transportScoreSchema.index({ carrierId: 1, scoredAt: -1 });
transportScoreSchema.index({ finalScore: -1 });

// Carrier Aggregate Score Schema
const carrierAggregateScoreSchema = new mongoose.Schema({
  carrierId: { type: String, required: true, unique: true, index: true },
  carrierName: String,

  // Scores moyens
  averageScores: {
    punctualityPickup: Number,
    punctualityDelivery: Number,
    appointmentRespect: Number,
    trackingReactivity: Number,
    podDelay: Number,
    incidentsManaged: Number,
    delaysJustified: Number,
    overall: Number
  },

  // Statistiques
  stats: {
    totalTransports: { type: Number, default: 0 },
    totalScored: { type: Number, default: 0 },
    lastTransportDate: Date,
    lastScoreDate: Date
  },

  // Évolution (30 derniers jours)
  trend: {
    direction: { type: String, enum: ['up', 'down', 'stable'] },
    change: Number // Variation en points
  },

  // Classement
  rank: Number,
  percentile: Number,

  // Badges/Récompenses
  badges: [{
    type: { type: String },
    name: String,
    earnedAt: Date
  }]
}, { timestamps: true });

const TransportScore = mongoose.model('TransportScore', transportScoreSchema);
const CarrierAggregateScore = mongoose.model('CarrierAggregateScore', carrierAggregateScoreSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected'))
  .catch(err => console.error('[MONGODB] Error:', err));

// ==================== SCORING ALGORITHM ====================

function calculateScore(criteria, weights = null) {
  const defaultWeights = {
    punctualityPickup: 0.20,
    punctualityDelivery: 0.25,
    appointmentRespect: 0.15,
    trackingReactivity: 0.10,
    podDelay: 0.10,
    incidentsManaged: 0.10,
    delaysJustified: 0.10
  };

  const w = weights || defaultWeights;

  const score = (
    (criteria.punctualityPickup || 0) * w.punctualityPickup +
    (criteria.punctualityDelivery || 0) * w.punctualityDelivery +
    (criteria.appointmentRespect || 0) * w.appointmentRespect +
    (criteria.trackingReactivity || 0) * w.trackingReactivity +
    (criteria.podDelay || 0) * w.podDelay +
    (criteria.incidentsManaged || 0) * w.incidentsManaged +
    (criteria.delaysJustified || 0) * w.delaysJustified
  );

  return Math.round(score * 100) / 100;
}

function calculatePunctualityScore(scheduledTime, actualTime, thresholdMinutes = 30) {
  if (!scheduledTime || !actualTime) return null;

  const scheduled = new Date(scheduledTime);
  const actual = new Date(actualTime);
  const delayMinutes = (actual - scheduled) / (1000 * 60);

  if (delayMinutes <= 0) return 100; // À l'heure ou en avance
  if (delayMinutes <= thresholdMinutes / 2) return 90; // Légèrement en retard
  if (delayMinutes <= thresholdMinutes) return 70; // Retard modéré
  if (delayMinutes <= thresholdMinutes * 2) return 50; // Retard important
  return 30; // Retard très important
}

async function updateCarrierAggregateScore(carrierId) {
  // Récupérer tous les scores des 6 derniers mois
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const scores = await TransportScore.find({
    carrierId,
    scoredAt: { $gte: sixMonthsAgo }
  });

  if (scores.length === 0) return;

  // Calculer moyennes
  const sumScores = scores.reduce((acc, score) => ({
    punctualityPickup: acc.punctualityPickup + (score.punctualityPickup || 0),
    punctualityDelivery: acc.punctualityDelivery + (score.punctualityDelivery || 0),
    appointmentRespect: acc.appointmentRespect + (score.appointmentRespect || 0),
    trackingReactivity: acc.trackingReactivity + (score.trackingReactivity || 0),
    podDelay: acc.podDelay + (score.podDelay || 0),
    incidentsManaged: acc.incidentsManaged + (score.incidentsManaged || 0),
    delaysJustified: acc.delaysJustified + (score.delaysJustified || 0),
    overall: acc.overall + score.finalScore
  }), {
    punctualityPickup: 0,
    punctualityDelivery: 0,
    appointmentRespect: 0,
    trackingReactivity: 0,
    podDelay: 0,
    incidentsManaged: 0,
    delaysJustified: 0,
    overall: 0
  });

  const count = scores.length;
  const averageScores = {
    punctualityPickup: Math.round(sumScores.punctualityPickup / count),
    punctualityDelivery: Math.round(sumScores.punctualityDelivery / count),
    appointmentRespect: Math.round(sumScores.appointmentRespect / count),
    trackingReactivity: Math.round(sumScores.trackingReactivity / count),
    podDelay: Math.round(sumScores.podDelay / count),
    incidentsManaged: Math.round(sumScores.incidentsManaged / count),
    delaysJustified: Math.round(sumScores.delaysJustified / count),
    overall: Math.round(sumScores.overall / count)
  };

  // Calculer tendance (30 derniers jours vs 30 jours précédents)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentScores = scores.filter(s => s.scoredAt >= thirtyDaysAgo);
  const previousScores = scores.filter(s => s.scoredAt >= sixtyDaysAgo && s.scoredAt < thirtyDaysAgo);

  let trend = { direction: 'stable', change: 0 };

  if (recentScores.length > 0 && previousScores.length > 0) {
    const recentAvg = recentScores.reduce((sum, s) => sum + s.finalScore, 0) / recentScores.length;
    const previousAvg = previousScores.reduce((sum, s) => sum + s.finalScore, 0) / previousScores.length;
    const change = recentAvg - previousAvg;

    trend = {
      direction: change > 2 ? 'up' : change < -2 ? 'down' : 'stable',
      change: Math.round(change * 100) / 100
    };
  }

  // Mettre à jour ou créer
  await CarrierAggregateScore.findOneAndUpdate(
    { carrierId },
    {
      carrierId,
      carrierName: scores[0].carrierName,
      averageScores,
      stats: {
        totalScored: count,
        lastScoreDate: scores[0].scoredAt
      },
      trend
    },
    { upsert: true, new: true }
  );
}

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'scoring-api', version: '1.0.0' });
});

// API v1 Health check
app.get('/api/v1/scoring/health', (req, res) => {
  res.json({ status: 'healthy', service: 'scoring-api', version: '1.0.0' });
});

// POST /api/v1/scoring/calculate - Calculer et enregistrer un score
app.post('/api/v1/scoring/calculate', async (req, res) => {
  try {
    const {
      orderId,
      carrierId,
      carrierName,
      criteria,
      pickupScheduled,
      pickupActual,
      deliveryScheduled,
      deliveryActual,
      podUploadedAt,
      incidents,
      delays
    } = req.body;

    if (!orderId || !carrierId || !criteria) {
      return res.status(400).json({
        success: false,
        error: 'orderId, carrierId, and criteria are required'
      });
    }

    // Calculer scores de ponctualité automatiquement si données disponibles
    if (!criteria.punctualityPickup && pickupScheduled && pickupActual) {
      criteria.punctualityPickup = calculatePunctualityScore(pickupScheduled, pickupActual);
    }

    if (!criteria.punctualityDelivery && deliveryScheduled && deliveryActual) {
      criteria.punctualityDelivery = calculatePunctualityScore(deliveryScheduled, deliveryActual);
    }

    // Calculer score final
    const finalScore = calculateScore(criteria);

    // Créer le transport score
    const transportScore = new TransportScore({
      orderId,
      carrierId,
      carrierName,
      ...criteria,
      finalScore,
      pickupScheduled,
      pickupActual,
      pickupDelayMinutes: pickupScheduled && pickupActual
        ? (new Date(pickupActual) - new Date(pickupScheduled)) / (1000 * 60)
        : null,
      deliveryScheduled,
      deliveryActual,
      deliveryDelayMinutes: deliveryScheduled && deliveryActual
        ? (new Date(deliveryActual) - new Date(deliveryScheduled)) / (1000 * 60)
        : null,
      podUploadedAt,
      incidents: incidents || [],
      delays: delays || []
    });

    await transportScore.save();

    // Mettre à jour le score agrégé du transporteur
    await updateCarrierAggregateScore(carrierId);

    // Émettre événement
    emitEvent('carrier.scored', {
      orderId,
      carrierId,
      score: finalScore
    });

    res.status(201).json({
      success: true,
      data: transportScore
    });
  } catch (error) {
    console.error('[ERROR] Calculate score:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/carriers/:id/score - Obtenir le score d'un transporteur
app.get('/api/v1/carriers/:id/score', async (req, res) => {
  try {
    const carrierScore = await CarrierAggregateScore.findOne({
      carrierId: req.params.id
    });

    if (!carrierScore) {
      return res.status(404).json({
        success: false,
        error: 'Carrier score not found'
      });
    }

    res.json({
      success: true,
      data: carrierScore
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/carriers/:id/score-history - Historique des scores
app.get('/api/v1/carriers/:id/score-history', async (req, res) => {
  try {
    const { limit = 50, startDate, endDate } = req.query;

    const query = { carrierId: req.params.id };

    if (startDate || endDate) {
      query.scoredAt = {};
      if (startDate) query.scoredAt.$gte = new Date(startDate);
      if (endDate) query.scoredAt.$lte = new Date(endDate);
    }

    const scores = await TransportScore.find(query)
      .sort({ scoredAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: scores,
      count: scores.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/scoring/leaderboard - Classement des transporteurs
app.get('/api/v1/scoring/leaderboard', async (req, res) => {
  try {
    const { limit = 20, minTransports = 5 } = req.query;

    const carriers = await CarrierAggregateScore.find({
      'stats.totalScored': { $gte: parseInt(minTransports) }
    })
      .sort({ 'averageScores.overall': -1 })
      .limit(parseInt(limit));

    // Ajouter le rang
    carriers.forEach((carrier, index) => {
      carrier.rank = index + 1;
    });

    res.json({
      success: true,
      data: carriers,
      count: carriers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/scoring/order/:orderId - Score d'une commande spécifique
app.get('/api/v1/scoring/order/:orderId', async (req, res) => {
  try {
    const score = await TransportScore.findOne({ orderId: req.params.orderId });

    if (!score) {
      return res.status(404).json({
        success: false,
        error: 'Score not found for this order'
      });
    }

    res.json({
      success: true,
      data: score
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[SCORING API] Running on port ${PORT}`);
});

module.exports = app;
