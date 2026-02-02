/**
 * SYMPHONI.A Affret.IA API v2
 * Plateforme de recherche et affectation automatique de transporteurs
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3017;
const JWT_SECRET = process.env.JWT_SECRET || 'RtProd2026KeyAuth0MainToken123456XY';

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

// Make emitEvent globally available
global.emitEvent = emitEvent;

// Assignment Schema
const assignmentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['searching', 'found', 'assigned', 'failed'],
    default: 'searching'
  },

  // Critères de recherche
  searchCriteria: {
    pickupPostalCode: String,
    deliveryPostalCode: String,
    pickupDate: Date,
    vehicleType: String,
    cargoType: String,
    services: mongoose.Schema.Types.Mixed
  },

  // Transporteurs trouvés
  availableCarriers: [{
    carrierId: String,
    carrierName: String,
    score: Number,
    price: Number,
    capacity: Boolean,
    distance: Number,
    estimatedTime: Number,
    matchScore: Number // Score de correspondance (0-100)
  }],

  // Transporteur assigné
  assignedCarrier: {
    carrierId: String,
    carrierName: String,
    price: Number,
    assignedAt: Date,
    reason: String
  },

  // Algorithme utilisé
  algorithm: {
    type: { type: String, enum: ['manual', 'best_score', 'best_price', 'balanced'], default: 'balanced' },
    factors: mongoose.Schema.Types.Mixed
  },

  searchStartedAt: Date,
  searchCompletedAt: Date,
  searchDuration: Number
}, { timestamps: true });

const Assignment = mongoose.model('Assignment', assignmentSchema);

// Analytics Routes
const { setupAnalyticsRoutes } = require('./routes/analytics-routes');

// CloudWatch Metrics
const { AffretIAMetrics } = require('./cloudwatch-stub');
let metrics = null;

// Initialize metrics
try {
  metrics = new AffretIAMetrics({ enabled: true });
  console.log('[METRICS] CloudWatch metrics initialized for Affret.IA');
} catch (error) {
  console.warn('[METRICS] Failed to initialize CloudWatch:', error.message);
}

// MongoDB connection
let db = null;
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[MONGODB] Connected');
    db = mongoose.connection.db;
  })
  .catch(err => console.error('[MONGODB] Error:', err));

// ==================== JWT AUTHENTICATION ====================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'UNAUTHORIZED'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }
      return res.status(403).json({
        success: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    req.user = user;
    next();
  });
}

// ==================== HELPER FUNCTIONS ====================

async function getCarrierScore(carrierId) {
  try {
    const response = await axios.get(`${process.env.SCORING_API_URL}/api/v1/carriers/${carrierId}/score`);
    return response.data.data?.averageScores?.overall || 50;
  } catch (error) {
    console.warn(`[SCORING] Could not fetch score for ${carrierId}:`, error.message);
    return 50; // Score par défaut
  }
}

async function searchAvailableCarriers(criteria) {
  try {
    // Appel à l'API carriers pour obtenir les transporteurs disponibles
    const response = await axios.post(`${process.env.CARRIERS_API_URL}/api/v1/carriers/search`, {
      pickupPostalCode: criteria.pickupPostalCode,
      deliveryPostalCode: criteria.deliveryPostalCode,
      pickupDate: criteria.pickupDate,
      vehicleType: criteria.vehicleType,
      cargoType: criteria.cargoType
    });

    return response.data.data || [];
  } catch (error) {
    console.error('[CARRIERS] Search error:', error.message);
    return [];
  }
}

async function calculatePricing(orderId, carrierId) {
  try {
    const response = await axios.post(`${process.env.PRICING_API_URL}/api/v1/pricing/calculate`, {
      orderId,
      carrierId
    });

    return response.data.data?.price || 0;
  } catch (error) {
    console.warn(`[PRICING] Could not calculate price:`, error.message);
    return 0;
  }
}

function calculateMatchScore(carrier, criteria, carrierScore) {
  let score = 0;

  // Score du transporteur (40% du total)
  score += (carrierScore / 100) * 40;

  // Distance (20% du total)
  if (carrier.distance) {
    const distanceScore = Math.max(0, 100 - (carrier.distance / 10)); // Pénalité par km
    score += (distanceScore / 100) * 20;
  } else {
    score += 20; // Score par défaut si pas de distance
  }

  // Capacité disponible (15% du total)
  score += carrier.capacity ? 15 : 5;

  // Type de véhicule correspondant (10% du total)
  if (carrier.vehicleType === criteria.vehicleType) {
    score += 10;
  }

  // Prix compétitif (15% du total)
  if (carrier.price && carrier.price > 0) {
    // Supposons un prix moyen de 500€
    const priceRatio = Math.min(carrier.price / 500, 2);
    const priceScore = Math.max(0, 100 - (priceRatio - 1) * 100);
    score += (priceScore / 100) * 15;
  } else {
    score += 10; // Score par défaut
  }

  return Math.round(score * 100) / 100;
}

async function selectBestCarrier(carriers, algorithm = 'balanced') {
  if (!carriers || carriers.length === 0) return null;

  switch (algorithm) {
    case 'best_score':
      // Choisir le transporteur avec le meilleur score
      return carriers.reduce((best, current) =>
        current.matchScore > best.matchScore ? current : best
      );

    case 'best_price':
      // Choisir le moins cher
      return carriers.reduce((best, current) =>
        current.price < best.price ? current : best
      );

    case 'balanced':
    default:
      // Équilibre entre score et prix
      const withBalanceScore = carriers.map(c => ({
        ...c,
        balanceScore: (c.matchScore * 0.6) + ((100 - (c.price / 10)) * 0.4)
      }));

      return withBalanceScore.reduce((best, current) =>
        current.balanceScore > best.balanceScore ? current : best
      );

    case 'manual':
      // Retourner null, l'utilisateur choisira
      return null;
  }
}

// ==================== ROUTES ====================

// ==================== TEST SES ====================
// Endpoint de test pour verifier la configuration AWS SES
app.post('/api/v1/test-ses', async (req, res) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Email "to" is required'
      });
    }

    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    const sesClient = new SESClient({
      region: process.env.AWS_REGION || 'eu-central-1'
    });

    const fromEmail = process.env.SES_FROM_EMAIL || 'noreply@rt-technologie.com';
    const fromName = process.env.SES_FROM_NAME || 'AFFRET.IA SYMPHONI.A';

    const params = {
      Source: `${fromName} <${fromEmail}>`,
      Destination: {
        ToAddresses: [to]
      },
      Message: {
        Subject: {
          Data: 'Test Email AFFRET.IA - Configuration SES',
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `
              <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                  <h1 style="color: #2563eb;">Test Email AFFRET.IA</h1>
                  <p>Si vous recevez cet email, la configuration AWS SES fonctionne correctement.</p>
                  <p><strong>From:</strong> ${fromEmail}</p>
                  <p><strong>Region:</strong> ${process.env.AWS_REGION || 'eu-central-1'}</p>
                  <p><strong>Date:</strong> ${new Date().toISOString()}</p>
                  <hr>
                  <p style="color: #666; font-size: 12px;">SYMPHONI.A - AFFRET.IA Email Broadcast System</p>
                </body>
              </html>
            `,
            Charset: 'UTF-8'
          },
          Text: {
            Data: `Test Email AFFRET.IA\n\nSi vous recevez cet email, la configuration AWS SES fonctionne correctement.\n\nFrom: ${fromEmail}\nRegion: ${process.env.AWS_REGION || 'eu-central-1'}\nDate: ${new Date().toISOString()}`,
            Charset: 'UTF-8'
          }
        }
      },
      Tags: [
        { Name: 'Application', Value: 'AFFRET-IA' },
        { Name: 'Type', Value: 'TEST' }
      ]
    };

    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);

    res.json({
      success: true,
      data: {
        messageId: response.MessageId,
        from: fromEmail,
        to: to,
        region: process.env.AWS_REGION || 'eu-central-1'
      }
    });

  } catch (error) {
    console.error('[TEST SES] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.Code || error.code
    });
  }
});

// ==================== HEALTH CHECK & ROOT ====================
// Health check endpoint for load balancer
app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'AFFRET.IA API v2',
    version: '2.7.0',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  const health = {
    success: true,
    service: 'AFFRET.IA API v2',
    version: '2.7.0',
    status: 'healthy',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  };

  const statusCode = mongoose.connection.readyState === 1 ? 200 : 503;
  res.status(statusCode).json(health);
});

// ==================== AFFRET.IA ROUTES ====================
const affretiaRoutes = require('./routes/affretia.routes');
app.use('/api/v1/affretia', affretiaRoutes);

// POST /api/v1/affret-ia/search - Rechercher des transporteurs disponibles
app.post('/api/v1/affret-ia/search', authenticateToken, async (req, res) => {
  try {
    const { orderId, pickupPostalCode, deliveryPostalCode, pickupDate, vehicleType, cargoType, services } = req.body;

    if (!orderId || !pickupPostalCode || !deliveryPostalCode) {
      return res.status(400).json({
        success: false,
        error: 'orderId, pickupPostalCode, and deliveryPostalCode are required'
      });
    }

    const searchStartedAt = new Date();

    // Créer l'assignment
    const assignment = new Assignment({
      orderId,
      status: 'searching',
      searchCriteria: {
        pickupPostalCode,
        deliveryPostalCode,
        pickupDate,
        vehicleType,
        cargoType,
        services
      },
      searchStartedAt
    });

    await assignment.save();

    // Rechercher les transporteurs disponibles
    const carriers = await searchAvailableCarriers({
      pickupPostalCode,
      deliveryPostalCode,
      pickupDate,
      vehicleType,
      cargoType
    });

    // Enrichir avec scores et pricing
    const enrichedCarriers = await Promise.all(carriers.map(async (carrier) => {
      const score = await getCarrierScore(carrier.carrierId);
      const price = await calculatePricing(orderId, carrier.carrierId);

      const matchScore = calculateMatchScore(carrier, {
        pickupPostalCode,
        deliveryPostalCode,
        vehicleType,
        cargoType
      }, score);

      return {
        ...carrier,
        score,
        price,
        matchScore
      };
    }));

    // Trier par matchScore
    enrichedCarriers.sort((a, b) => b.matchScore - a.matchScore);

    const searchCompletedAt = new Date();
    const searchDuration = searchCompletedAt - searchStartedAt;

    // Mettre à jour l'assignment
    assignment.status = enrichedCarriers.length > 0 ? 'found' : 'failed';
    assignment.availableCarriers = enrichedCarriers;
    assignment.searchCompletedAt = searchCompletedAt;
    assignment.searchDuration = searchDuration;
    await assignment.save();

    emitEvent('affret.search.completed', {
      orderId,
      carriersFound: enrichedCarriers.length,
      duration: searchDuration
    });

    // Send CloudWatch metrics
    if (metrics) {
      metrics.recordAIRequest(searchDuration, enrichedCarriers.length > 0).catch(err => {
        console.error('Failed to send AI metrics:', err);
      });
      metrics.recordMatchingResult(enrichedCarriers.length, searchDuration).catch(err => {
        console.error('Failed to send matching metrics:', err);
      });
    }

    res.json({
      success: true,
      data: {
        assignmentId: assignment._id,
        carriers: enrichedCarriers,
        count: enrichedCarriers.length,
        searchDuration
      }
    });
  } catch (error) {
    console.error('[ERROR] Search:', error);

    // Send error metrics
    if (metrics) {
      metrics.recordAIRequest(0, false).catch(err => {
        console.error('Failed to send error metrics:', err);
      });
    }

    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/affret-ia/carriers-available - Liste des transporteurs disponibles (simplifié)
app.get('/api/v1/affret-ia/carriers-available', authenticateToken, async (req, res) => {
  try {
    const { postalCode, date, vehicleType } = req.query;

    // Simulation de transporteurs disponibles
    const mockCarriers = [
      { carrierId: 'carrier1', carrierName: 'Transport Express', capacity: true, distance: 50 },
      { carrierId: 'carrier2', carrierName: 'Logistique Pro', capacity: true, distance: 30 },
      { carrierId: 'carrier3', carrierName: 'Fret Rapide', capacity: false, distance: 80 }
    ];

    res.json({
      success: true,
      data: mockCarriers,
      count: mockCarriers.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/affret-ia/assign - Assigner automatiquement un transporteur
app.post('/api/v1/affret-ia/assign', authenticateToken, async (req, res) => {
  try {
    const { assignmentId, carrierId, algorithm = 'balanced' } = req.body;

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        error: 'assignmentId is required'
      });
    }

    const assignment = await Assignment.findById(assignmentId);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    let selectedCarrier;

    if (carrierId) {
      // Affectation manuelle
      selectedCarrier = assignment.availableCarriers.find(c => c.carrierId === carrierId);
      if (!selectedCarrier) {
        return res.status(404).json({
          success: false,
          error: 'Carrier not found in available carriers'
        });
      }
    } else {
      // Affectation automatique
      selectedCarrier = await selectBestCarrier(assignment.availableCarriers, algorithm);
      if (!selectedCarrier) {
        return res.status(400).json({
          success: false,
          error: 'No suitable carrier found'
        });
      }
    }

    // Mettre à jour l'assignment
    assignment.status = 'assigned';
    assignment.assignedCarrier = {
      carrierId: selectedCarrier.carrierId,
      carrierName: selectedCarrier.carrierName,
      price: selectedCarrier.price,
      assignedAt: new Date(),
      reason: carrierId ? 'manual' : `auto_${algorithm}`
    };
    assignment.algorithm = {
      type: carrierId ? 'manual' : algorithm,
      factors: {
        score: selectedCarrier.score,
        matchScore: selectedCarrier.matchScore,
        price: selectedCarrier.price
      }
    };

    await assignment.save();

    // Émettre événement
    emitEvent('carrier.assigned', {
      orderId: assignment.orderId,
      carrierId: selectedCarrier.carrierId,
      carrierName: selectedCarrier.carrierName,
      price: selectedCarrier.price,
      automatic: !carrierId
    });

    res.json({
      success: true,
      data: assignment
    });
  } catch (error) {
    console.error('[ERROR] Assign:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/affret-ia/pricing - Obtenir un tarif estimatif
app.get('/api/v1/affret-ia/pricing', authenticateToken, async (req, res) => {
  try {
    const { orderId, carrierId } = req.query;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    const price = carrierId
      ? await calculatePricing(orderId, carrierId)
      : 450; // Prix moyen par défaut

    res.json({
      success: true,
      data: {
        orderId,
        carrierId,
        price,
        currency: 'EUR'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/affret-ia/assignments - Historique des affectations
app.get('/api/v1/affret-ia/assignments', authenticateToken, async (req, res) => {
  try {
    const { orderId, status, limit = 50 } = req.query;

    const filters = {};
    if (orderId) filters.orderId = orderId;
    if (status) filters.status = status;

    const assignments = await Assignment.find(filters)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: assignments,
      count: assignments.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/affret-ia/assignments/:id - Détails d'une affectation
app.get('/api/v1/affret-ia/assignments/:id', authenticateToken, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }

    res.json({
      success: true,
      data: assignment
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Setup Analytics Routes
mongoose.connection.once('open', () => {
  app.use('/api/v1/affretia/analytics', setupAnalyticsRoutes(db));
  console.log('[ROUTES] Analytics routes initialized');
});

app.listen(PORT, () => {
  console.log(`[AFFRET.IA API v2] Running on port ${PORT}`);
});

module.exports = app;
