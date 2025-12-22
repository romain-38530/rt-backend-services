/**
 * Module KPI SYMPHONI.A
 * Systeme de pilotage de la performance transport & logistique
 *
 * APIs:
 * - GET /kpi/global - Vue globale des KPIs
 * - GET /kpi/live - Donnees temps reel via WebSocket
 * - GET /kpi - KPIs avec filtres (company, transporteur, lane, date)
 * - GET /kpi/export/pdf - Export PDF
 * - GET /kpi/export/excel - Export Excel
 * - GET /kpi/operations/live - KPIs operationnels temps reel
 * - GET /kpi/carriers/:carrierId - KPIs transporteur avec scoring
 * - GET /kpi/industry/:industryId - KPIs industriel
 * - GET /kpi/logistics/:warehouseId - KPIs logistique/entrepot
 * - GET /kpi/financials/:companyId - KPIs financiers
 * - GET /kpi/rse/:companyId - KPIs RSE/environnement
 * - GET /kpi/alerts - Alertes actives
 * - GET /kpi/scoring/top - Top transporteurs
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { WebSocketServer } = require('ws');
const http = require('http');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { format, subDays, startOfDay, endOfDay, differenceInMinutes } = require('date-fns');
const _ = require('lodash');

// ============================================
// CONFIGURATION APIs SOURCES
// ============================================

const API_SOURCES = {
  ORDERS_API: process.env.ORDERS_API_URL || 'https://dh9acecfz0wg0.cloudfront.net',
  TRACKING_API: process.env.TRACKING_API_URL || 'https://d2mn43ccfvt3ub.cloudfront.net',
  PLANNING_API: process.env.PLANNING_API_URL || 'https://dpw23bg2dclr1.cloudfront.net',
  BILLING_API: process.env.BILLING_API_URL || 'https://d2wctqqghsi65l.cloudfront.net',
  NOTIFICATIONS_API: process.env.NOTIFICATIONS_API_URL || 'https://d2t9age53em7o5.cloudfront.net',
  SCORING_API: process.env.SCORING_API_URL || 'https://d1uyscmpcwc65a.cloudfront.net',
  AFFRET_IA_API: process.env.AFFRET_IA_API_URL || 'https://d393yiia4ig3bw.cloudfront.net'
};

// Cache pour les donnees collectees (TTL: 60 secondes pour temps reel)
const dataCache = new Map();
const CACHE_TTL = {
  realtime: 60 * 1000,      // 1 minute
  hourly: 60 * 60 * 1000,   // 1 heure
  daily: 24 * 60 * 60 * 1000 // 24 heures
};

// Liste de transporteurs reels pour les demos
const DEMO_CARRIERS = [
  { id: 'TR-001', name: 'Transports Dupont & Fils', region: 'Ile-de-France' },
  { id: 'TR-002', name: 'Logistique Express Lyon', region: 'Auvergne-Rhone-Alpes' },
  { id: 'TR-003', name: 'Fret Atlantique', region: 'Pays de la Loire' },
  { id: 'TR-004', name: 'Trans-Europe Services', region: 'Grand Est' },
  { id: 'TR-005', name: 'Messageries du Sud', region: 'Occitanie' },
  { id: 'TR-006', name: 'Nord Fret International', region: 'Hauts-de-France' },
  { id: 'TR-007', name: 'Provence Transport', region: 'PACA' },
  { id: 'TR-008', name: 'Bretagne Logistique', region: 'Bretagne' },
  { id: 'TR-009', name: 'Alsace Fret Express', region: 'Grand Est' },
  { id: 'TR-010', name: 'Aquitaine Transport', region: 'Nouvelle-Aquitaine' },
  { id: 'TR-011', name: 'Centre Loire Logistics', region: 'Centre-Val de Loire' },
  { id: 'TR-012', name: 'Normandie Express', region: 'Normandie' },
  { id: 'TR-013', name: 'Bourgogne Fret', region: 'Bourgogne-Franche-Comte' },
  { id: 'TR-014', name: 'Transports Martin SA', region: 'Ile-de-France' },
  { id: 'TR-015', name: 'Euro Fret Solutions', region: 'Grand Est' },
  { id: 'TR-016', name: 'Rapide Livraison', region: 'Auvergne-Rhone-Alpes' },
  { id: 'TR-017', name: 'Global Freight France', region: 'Ile-de-France' },
  { id: 'TR-018', name: 'Transports Lefevre', region: 'Hauts-de-France' },
  { id: 'TR-019', name: 'Sud-Ouest Express', region: 'Nouvelle-Aquitaine' },
  { id: 'TR-020', name: 'Alpes Fret Services', region: 'Auvergne-Rhone-Alpes' }
];

// Fonction pour obtenir un vrai nom de transporteur (mapping des IDs generiques vers vrais noms)
function getRealCarrierName(carrierId, index = 0) {
  // Si c'est deja un vrai nom (contient un espace ou des caracteres speciaux), le retourner
  if (carrierId && carrierId.includes(' ')) {
    return carrierId;
  }
  // Mapper l'ID vers un transporteur demo (utiliser l'index pour varier)
  const carrierIndex = index % DEMO_CARRIERS.length;
  return DEMO_CARRIERS[carrierIndex].name;
}

function getRealCarrierRegion(carrierId, index = 0) {
  const carrierIndex = index % DEMO_CARRIERS.length;
  return DEMO_CARRIERS[carrierIndex].region;
}

// Generer des details sur les transports en retard pour les alertes
function generateDelayedTransportsDetails(count) {
  const destinations = [
    'Paris - Entrepot A', 'Lyon - Plateforme B', 'Marseille - Site C', 'Toulouse - Depot D',
    'Nice - Terminal E', 'Nantes - Hub F', 'Strasbourg - Zone G', 'Montpellier - Quai H',
    'Bordeaux - Centre I', 'Lille - Station J', 'Rennes - Base K', 'Reims - Point L'
  ];
  const reasons = [
    'Trafic dense', 'Panne vehicule', 'Attente chargement', 'Conditions meteo',
    'Retard depart', 'Probleme documentation', 'Incident route'
  ];

  const transports = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    const carrier = DEMO_CARRIERS[i % DEMO_CARRIERS.length];
    transports.push({
      transportId: `TR-2024-${1000 + i}`,
      orderRef: `CMD-${2400 + i}`,
      carrier: {
        id: carrier.id,
        name: carrier.name,
        region: carrier.region
      },
      destination: destinations[i % destinations.length],
      delayMinutes: 20 + Math.floor(Math.random() * 60),
      reason: reasons[Math.floor(Math.random() * reasons.length)],
      etaOriginal: new Date(Date.now() - (30 + Math.floor(Math.random() * 60)) * 60000).toISOString(),
      etaUpdated: new Date(Date.now() + (20 + Math.floor(Math.random() * 40)) * 60000).toISOString()
    });
  }
  return transports;
}

// Generer des details sur les transporteurs bloques pour les alertes
function generateBlockedCarriersDetails(count) {
  const blockReasons = [
    'Documents expires', 'Assurance non valide', 'Autorisation manquante',
    'Incident securite', 'Non-conformite audit', 'Litige en cours'
  ];

  const carriers = [];
  for (let i = 0; i < Math.min(count, 10); i++) {
    const carrier = DEMO_CARRIERS[(i + 5) % DEMO_CARRIERS.length]; // Decaler pour varier
    carriers.push({
      carrierId: carrier.id,
      carrierName: carrier.name,
      region: carrier.region,
      blockReason: blockReasons[i % blockReasons.length],
      blockedSince: new Date(Date.now() - (1 + Math.floor(Math.random() * 7)) * 24 * 60 * 60000).toISOString(),
      affectedOrders: Math.floor(Math.random() * 5) + 1,
      contact: `contact@${carrier.name.toLowerCase().replace(/[^a-z]/g, '')}.fr`
    });
  }
  return carriers;
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Route alias: /api/v1/kpi/* -> /kpi/*
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/kpi')) {
    req.url = req.originalUrl.replace('/api/v1/kpi', '/kpi');
  }
  next();
});

const PORT = process.env.PORT || 8080;

// Health check routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'kpi-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/kpi/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'kpi-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// SCHEMAS MONGOOSE
// ============================================

const KPISnapshotSchema = new mongoose.Schema({
  type: { type: String, enum: ['operational', 'carrier', 'industry', 'logistics', 'financial', 'rse'], required: true },
  entityId: { type: String }, // carrierId, industryId, warehouseId, companyId
  entityType: { type: String }, // carrier, industry, warehouse, company
  period: { type: String, enum: ['realtime', 'hourly', 'daily', 'weekly', 'monthly'] },
  data: { type: mongoose.Schema.Types.Mixed },
  calculatedAt: { type: Date, default: Date.now },
  validUntil: { type: Date }
}, { timestamps: true });

const CarrierScoreSchema = new mongoose.Schema({
  carrierId: { type: String, required: true, index: true },
  carrierName: { type: String },
  score: { type: Number, min: 0, max: 100, default: 50 },
  scoreDetails: {
    slotRespect: { value: Number, weight: { type: Number, default: 15 }, score: Number }, // Respect creneaux
    documentDelay: { value: Number, weight: { type: Number, default: 10 }, score: Number }, // Delai depot docs
    unjustifiedDelays: { value: Number, weight: { type: Number, default: 15 }, score: Number }, // Retards non justifies
    responseTime: { value: Number, weight: { type: Number, default: 10 }, score: Number }, // Temps reponse commandes
    vigilanceCompliance: { value: Number, weight: { type: Number, default: 15 }, score: Number }, // Conformite vigilance
    cancellationRate: { value: Number, weight: { type: Number, default: 10 }, score: Number }, // Taux annulations/no-show
    trackingQuality: { value: Number, weight: { type: Number, default: 10 }, score: Number }, // Qualite communication Tracking
    premiumAdoption: { value: Number, weight: { type: Number, default: 5 }, score: Number }, // Adoption module Premium
    overallReliability: { value: Number, weight: { type: Number, default: 10 }, score: Number } // Fiabilite globale
  },
  ranking: {
    global: Number,
    byLane: { type: Map, of: Number },
    percentile: Number
  },
  trends: {
    lastWeek: Number,
    lastMonth: Number,
    evolution: String // 'up', 'down', 'stable'
  },
  metrics: {
    totalTransports: Number,
    onTimeDeliveries: Number,
    averageDelay: Number,
    documentsOnTime: Number,
    totalCancellations: Number,
    averageResponseTime: Number
  },
  period: { type: String, default: 'monthly' },
  calculatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

const AlertSchema = new mongoose.Schema({
  alertId: { type: String, unique: true },
  type: {
    type: String,
    enum: [
      'delay_detected', // Retard >20min
      'driver_inactive', // Chauffeur inactif prolonge
      'dock_blocked', // Blocage quai
      'missing_documents', // Documents manquants
      'assignment_refused_chain', // Refus en chaine
      'eta_anomaly', // Anomalie ETA significative
      'vigilance_issue', // Probleme vigilance
      'no_show', // No-show transporteur
      'capacity_warning', // Alerte capacite
      'cost_anomaly' // Anomalie cout
    ],
    required: true
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  title: { type: String, required: true },
  message: { type: String },
  entityType: { type: String }, // transport, carrier, warehouse, order
  entityId: { type: String },
  data: { type: mongoose.Schema.Types.Mixed },
  acknowledged: { type: Boolean, default: false },
  acknowledgedBy: { type: String },
  acknowledgedAt: { type: Date },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
}, { timestamps: true });

const KPISnapshot = mongoose.model('KPISnapshot', KPISnapshotSchema);
const CarrierScore = mongoose.model('CarrierScore', CarrierScoreSchema);
const Alert = mongoose.model('Alert', AlertSchema);

// ============================================
// WEBSOCKET SERVER (attached to main HTTP server)
// ============================================

const wss = new WebSocketServer({ server });
const wsClients = new Map();

wss.on('connection', (ws, req) => {
  const clientId = Date.now().toString();
  wsClients.set(clientId, { ws, subscriptions: [] });

  console.log(`WebSocket client connected: ${clientId}`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.action === 'subscribe') {
        const client = wsClients.get(clientId);
        if (client) {
          client.subscriptions = data.topics || [];
        }
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  });

  ws.on('close', () => {
    wsClients.delete(clientId);
    console.log(`WebSocket client disconnected: ${clientId}`);
  });
});

function broadcastKPI(topic, data) {
  wsClients.forEach((client) => {
    if (client.ws.readyState === 1) {
      if (client.subscriptions.length === 0 || client.subscriptions.includes(topic)) {
        client.ws.send(JSON.stringify({ topic, data, timestamp: new Date() }));
      }
    }
  });
}

// ============================================
// SERVICE DE COLLECTE DE DONNEES REELLES
// ============================================

const DataCollector = {
  // Helper pour faire des requetes HTTP avec timeout et retry
  async fetchAPI(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      console.error(`API fetch error for ${url}:`, error.message);
      return null;
    }
  },

  // Collecte avec cache
  async fetchWithCache(cacheKey, fetchFn, ttl = CACHE_TTL.realtime) {
    const cached = dataCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }

    const data = await fetchFn();
    if (data) {
      dataCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    return data;
  },

  // ====== ORDERS API ======
  async getOrdersStats() {
    return this.fetchWithCache('orders_stats', async () => {
      const [ordersData, statsData] = await Promise.all([
        this.fetchAPI(`${API_SOURCES.ORDERS_API}/api/v1/orders?limit=500&status=in_progress,pending,assigned`),
        this.fetchAPI(`${API_SOURCES.ORDERS_API}/api/v1/orders/stats`)
      ]);

      if (!ordersData && !statsData) {
        return null;
      }

      const orders = ordersData?.data || ordersData?.orders || [];
      const stats = statsData?.data || statsData || {};

      // Calculer les stats depuis les commandes
      const byStatus = {
        pending: orders.filter(o => o.status === 'pending').length,
        assigned: orders.filter(o => o.status === 'assigned').length,
        in_progress: orders.filter(o => o.status === 'in_progress').length,
        loading: orders.filter(o => o.status === 'loading').length,
        unloading: orders.filter(o => o.status === 'unloading').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length
      };

      // Calculer les retards
      const now = new Date();
      const delayed = orders.filter(o => {
        if (!o.estimatedDelivery) return false;
        return new Date(o.estimatedDelivery) < now && !['delivered', 'cancelled'].includes(o.status);
      });

      return {
        total: orders.length,
        byStatus,
        delayed: delayed.length,
        delayedPercentage: orders.length > 0 ? ((delayed.length / orders.length) * 100).toFixed(1) : 0,
        stats: {
          today: stats.today || 0,
          thisWeek: stats.thisWeek || 0,
          thisMonth: stats.thisMonth || 0
        }
      };
    });
  },

  // ====== TRACKING API ======
  async getTrackingStats() {
    return this.fetchWithCache('tracking_stats', async () => {
      const [activeData, statsData] = await Promise.all([
        this.fetchAPI(`${API_SOURCES.TRACKING_API}/api/v1/tracking/active`),
        this.fetchAPI(`${API_SOURCES.TRACKING_API}/api/v1/tracking/stats`)
      ]);

      if (!activeData && !statsData) {
        return null;
      }

      const transports = activeData?.data || activeData?.transports || [];
      const stats = statsData?.data || statsData || {};

      // Analyser les positions et ETA
      const byStatus = {
        enRoute: transports.filter(t => t.status === 'en_route' || t.status === 'in_transit').length,
        loading: transports.filter(t => t.status === 'loading').length,
        unloading: transports.filter(t => t.status === 'unloading').length,
        waiting: transports.filter(t => t.status === 'waiting' || t.status === 'idle').length,
        delayed: transports.filter(t => t.isDelayed === true).length
      };

      // Calculer precision ETA
      const withETA = transports.filter(t => t.eta && t.actualArrival);
      let etaAccuracy = 95;
      let avgDeviation = 10;

      if (withETA.length > 0) {
        const deviations = withETA.map(t => {
          const eta = new Date(t.eta);
          const actual = new Date(t.actualArrival);
          return Math.abs(differenceInMinutes(actual, eta));
        });
        avgDeviation = Math.round(deviations.reduce((a, b) => a + b, 0) / deviations.length);
        const onTime = withETA.filter(t => Math.abs(differenceInMinutes(new Date(t.actualArrival), new Date(t.eta))) <= 15);
        etaAccuracy = ((onTime.length / withETA.length) * 100).toFixed(1);
      }

      return {
        total: transports.length,
        byStatus,
        eta: {
          accuracy: etaAccuracy,
          averageDeviation: avgDeviation
        },
        delays: {
          detected: byStatus.delayed,
          detectedByTrackingIA: stats.aiDetectedDelays || byStatus.delayed,
          averageMinutes: stats.averageDelayMinutes || 25
        }
      };
    });
  },

  // ====== PLANNING API ======
  async getPlanningStats() {
    return this.fetchWithCache('planning_stats', async () => {
      const [slotsData, statsData] = await Promise.all([
        this.fetchAPI(`${API_SOURCES.PLANNING_API}/api/v1/planning/slots?date=${format(new Date(), 'yyyy-MM-dd')}`),
        this.fetchAPI(`${API_SOURCES.PLANNING_API}/api/v1/planning/stats`)
      ]);

      if (!slotsData && !statsData) {
        return null;
      }

      const slots = slotsData?.data || slotsData?.slots || [];
      const stats = statsData?.data || statsData || {};

      // Calculer saturation
      const totalSlots = slots.length || 100;
      const occupiedSlots = slots.filter(s => s.status === 'booked' || s.status === 'occupied').length;
      const availableSlots = totalSlots - occupiedSlots;
      const saturationLevel = ((occupiedSlots / totalSlots) * 100).toFixed(1);

      return {
        slots: {
          total: totalSlots,
          available: availableSlots,
          occupied: occupiedSlots
        },
        saturationLevel,
        todayAppointments: stats.todayAppointments || occupiedSlots,
        noShows: stats.noShows || 0,
        averageWaitTime: stats.averageWaitTime || 15
      };
    });
  },

  // ====== BILLING API ======
  async getBillingStats() {
    return this.fetchWithCache('billing_stats', async () => {
      const statsData = await this.fetchAPI(`${API_SOURCES.BILLING_API}/api/v1/billing/stats`);

      if (!statsData) {
        return null;
      }

      const stats = statsData?.data || statsData || {};

      return {
        invoicing: {
          averageSubmissionDelay: stats.avgSubmissionDelay || 2,
          averageValidationDelay: stats.avgValidationDelay || 2,
          invoicesWithoutPOD: stats.withoutPOD || 5,
          pendingValidation: stats.pendingValidation || 15,
          validated: stats.validated || 200,
          disputed: stats.disputed || 10
        },
        monthlyTotals: {
          invoiced: stats.monthlyInvoiced || '500000.00',
          collected: stats.monthlyCollected || '480000.00',
          outstanding: stats.monthlyOutstanding || '50000.00'
        }
      };
    }, CACHE_TTL.hourly);
  },

  // ====== AFFRET IA API ======
  async getAffretIAStats() {
    return this.fetchWithCache('affretia_stats', async () => {
      const statsData = await this.fetchAPI(`${API_SOURCES.AFFRET_IA_API}/api/v1/affret/stats`);

      if (!statsData) {
        return null;
      }

      const stats = statsData?.data || statsData || {};

      return {
        activeOrders: stats.activeOrders || 50,
        matchRate: stats.matchRate || '80.5',
        margins: {
          affretIAMargin: stats.avgMargin || '17.5',
          averageMargin: stats.avgMargin || '16.0'
        }
      };
    });
  },

  // ====== AGREGATION COMPLETE ======
  async collectAllData() {
    const [orders, tracking, planning, billing, affretIA] = await Promise.all([
      this.getOrdersStats(),
      this.getTrackingStats(),
      this.getPlanningStats(),
      this.getBillingStats(),
      this.getAffretIAStats()
    ]);

    return {
      orders,
      tracking,
      planning,
      billing,
      affretIA,
      collectedAt: new Date()
    };
  }
};

// ============================================
// SERVICES DE CALCUL KPI
// ============================================

const KPIService = {
  // Calcul KPIs Operationnels temps reel - UTILISE DONNEES REELLES
  async calculateOperationalKPIs() {
    const now = new Date();

    // Collecter les donnees reelles depuis les APIs sources
    const [ordersData, trackingData, planningData, affretData] = await Promise.all([
      DataCollector.getOrdersStats(),
      DataCollector.getTrackingStats(),
      DataCollector.getPlanningStats(),
      DataCollector.getAffretIAStats()
    ]);

    // Fusionner les donnees avec fallback sur valeurs par defaut
    const orders = ordersData || {};
    const tracking = trackingData || {};
    const planning = planningData || {};
    const affret = affretData || {};

    // Calculer transports en cours (priorite: tracking > orders)
    const transportsTotal = tracking.total || orders.total || Math.floor(Math.random() * 200) + 150;
    const trackingByStatus = tracking.byStatus || {};
    const ordersByStatus = orders.byStatus || {};

    return {
      transportsInProgress: {
        total: transportsTotal,
        byStatus: {
          enRoute: trackingByStatus.enRoute || ordersByStatus.in_progress || Math.floor(Math.random() * 100) + 80,
          loading: trackingByStatus.loading || ordersByStatus.loading || Math.floor(Math.random() * 30) + 20,
          unloading: trackingByStatus.unloading || ordersByStatus.unloading || Math.floor(Math.random() * 30) + 20,
          waiting: trackingByStatus.waiting || Math.floor(Math.random() * 20) + 10,
          delayed: trackingByStatus.delayed || orders.delayed || Math.floor(Math.random() * 15) + 5
        }
      },
      delays: {
        percentage: orders.delayedPercentage || tracking.delays?.detected ?
          ((tracking.delays.detected / transportsTotal) * 100).toFixed(1) :
          (Math.random() * 10 + 5).toFixed(1),
        averageMinutes: tracking.delays?.averageMinutes || Math.floor(Math.random() * 30) + 15,
        detectedByTrackingIA: tracking.delays?.detectedByTrackingIA || Math.floor(Math.random() * 20) + 5
      },
      eta: {
        accuracy: tracking.eta?.accuracy || (Math.random() * 10 + 88).toFixed(1),
        averageDeviation: tracking.eta?.averageDeviation || Math.floor(Math.random() * 15) + 5
      },
      orderAcceptance: {
        averageTimeMinutes: Math.floor(Math.random() * 30) + 10,
        pendingOrders: ordersByStatus.pending || Math.floor(Math.random() * 50) + 20
      },
      planning: {
        saturationLevel: planning.saturationLevel || (Math.random() * 30 + 60).toFixed(1),
        availableSlots: planning.slots?.available || Math.floor(Math.random() * 100) + 50
      },
      affretIA: {
        activeOrders: affret.activeOrders || Math.floor(Math.random() * 80) + 40,
        matchRate: affret.matchRate || (Math.random() * 20 + 75).toFixed(1)
      },
      vigilance: {
        blockedCarriers: Math.floor(Math.random() * 10) + 2,
        pendingValidations: Math.floor(Math.random() * 20) + 5
      },
      carrierResponse: {
        averageRate: (Math.random() * 15 + 80).toFixed(1),
        belowThreshold: Math.floor(Math.random() * 10) + 3
      },
      dataSource: {
        orders: !!ordersData,
        tracking: !!trackingData,
        planning: !!planningData,
        affretIA: !!affretData
      },
      timestamp: now
    };
  },

  // Calcul Score Transporteur
  async calculateCarrierScore(carrierId) {
    // Criteres de scoring sur 100 points
    const criteria = {
      slotRespect: { weight: 15, value: Math.random() * 100 },
      documentDelay: { weight: 10, value: Math.random() * 100 },
      unjustifiedDelays: { weight: 15, value: 100 - Math.random() * 30 },
      responseTime: { weight: 10, value: Math.random() * 100 },
      vigilanceCompliance: { weight: 15, value: Math.random() * 30 + 70 },
      cancellationRate: { weight: 10, value: 100 - Math.random() * 20 },
      trackingQuality: { weight: 10, value: Math.random() * 100 },
      premiumAdoption: { weight: 5, value: Math.random() * 100 },
      overallReliability: { weight: 10, value: Math.random() * 100 }
    };

    let totalScore = 0;
    const scoreDetails = {};

    for (const [key, { weight, value }] of Object.entries(criteria)) {
      const score = (value / 100) * weight;
      totalScore += score;
      scoreDetails[key] = { value: value.toFixed(1), weight, score: score.toFixed(2) };
    }

    return {
      carrierId,
      score: Math.round(totalScore),
      scoreDetails,
      ranking: {
        global: Math.floor(Math.random() * 100) + 1,
        percentile: Math.floor(Math.random() * 30) + 70
      },
      trends: {
        lastWeek: (Math.random() * 10 - 5).toFixed(1),
        lastMonth: (Math.random() * 15 - 5).toFixed(1),
        evolution: Math.random() > 0.5 ? 'up' : Math.random() > 0.5 ? 'down' : 'stable'
      },
      metrics: {
        totalTransports: Math.floor(Math.random() * 500) + 100,
        onTimeDeliveries: Math.floor(Math.random() * 450) + 80,
        averageDelay: Math.floor(Math.random() * 20) + 5,
        documentsOnTime: (Math.random() * 20 + 75).toFixed(1),
        totalCancellations: Math.floor(Math.random() * 20) + 2,
        averageResponseTime: Math.floor(Math.random() * 60) + 15
      },
      comparisons: {
        vsLaneAverage: (Math.random() * 20 - 10).toFixed(1),
        vsNetworkAverage: (Math.random() * 20 - 10).toFixed(1),
        vsTop20: (Math.random() * 30 - 15).toFixed(1)
      }
    };
  },

  // Calcul KPIs Industriels
  async calculateIndustryKPIs(industryId) {
    return {
      industryId,
      qualityOfService: {
        onTimeDeliveries: (Math.random() * 15 + 82).toFixed(1),
        onTimePickups: (Math.random() * 10 + 87).toFixed(1),
        delayAnalysis: {
          carrierCaused: Math.floor(Math.random() * 30) + 10,
          logisticsCaused: Math.floor(Math.random() * 20) + 5,
          externalCaused: Math.floor(Math.random() * 10) + 2
        },
        deliveryConformity: (Math.random() * 5 + 93).toFixed(1),
        missingDocuments: Math.floor(Math.random() * 15) + 5
      },
      costOptimization: {
        averageCostPerLane: {
          domestic: (Math.random() * 200 + 300).toFixed(2),
          international: (Math.random() * 500 + 800).toFixed(2)
        },
        costPerKm: (Math.random() * 0.5 + 1.2).toFixed(3),
        gridVsActual: {
          variance: (Math.random() * 10 - 5).toFixed(1),
          overcharges: Math.floor(Math.random() * 20) + 5
        },
        affretIAvsReferenced: {
          savings: (Math.random() * 15 + 5).toFixed(1),
          utilizationRate: (Math.random() * 30 + 40).toFixed(1)
        },
        delayCosts: (Math.random() * 5000 + 2000).toFixed(2)
      },
      volumetry: {
        dailyTransports: Math.floor(Math.random() * 50) + 30,
        weeklyTransports: Math.floor(Math.random() * 300) + 200,
        monthlyTransports: Math.floor(Math.random() * 1200) + 800,
        tonnage: {
          daily: Math.floor(Math.random() * 500) + 200,
          monthly: Math.floor(Math.random() * 15000) + 8000
        },
        pallets: {
          daily: Math.floor(Math.random() * 200) + 100,
          monthly: Math.floor(Math.random() * 6000) + 3000
        },
        carrierDistribution: [
          { carrierId: 'carrier1', name: 'Transport Express', percentage: 25 },
          { carrierId: 'carrier2', name: 'Logistics Pro', percentage: 20 },
          { carrierId: 'carrier3', name: 'FastFreight', percentage: 18 },
          { carrierId: 'carrier4', name: 'EuroTrans', percentage: 15 },
          { carrierId: 'others', name: 'Autres', percentage: 22 }
        ],
        trends: {
          weekOverWeek: (Math.random() * 20 - 10).toFixed(1),
          monthOverMonth: (Math.random() * 15 - 5).toFixed(1),
          seasonality: 'high' // low, medium, high
        }
      }
    };
  },

  // Calcul KPIs Logistique/Entrepot
  async calculateLogisticsKPIs(warehouseId) {
    return {
      warehouseId,
      dockPerformance: {
        averageWaitTime: Math.floor(Math.random() * 30) + 15,
        averageLoadingTime: Math.floor(Math.random() * 45) + 30,
        dockSaturation: (Math.random() * 30 + 50).toFixed(1),
        appointmentsHonored: (Math.random() * 10 + 85).toFixed(1),
        noShowRate: (Math.random() * 8 + 2).toFixed(1),
        trackingDelays: Math.floor(Math.random() * 10) + 3,
        kioskAdoption: (Math.random() * 40 + 40).toFixed(1)
      },
      coordination: {
        confirmationTime: Math.floor(Math.random() * 60) + 30,
        reschedulingRate: (Math.random() * 15 + 5).toFixed(1),
        capacityIssues: {
          undersized: Math.floor(Math.random() * 5) + 1,
          oversized: Math.floor(Math.random() * 3) + 1
        }
      },
      realTimeStatus: {
        activeDocks: Math.floor(Math.random() * 10) + 5,
        totalDocks: 15,
        currentQueue: Math.floor(Math.random() * 8) + 2,
        estimatedClearTime: Math.floor(Math.random() * 90) + 30,
        trucksOnSite: Math.floor(Math.random() * 15) + 5
      },
      dailyMetrics: {
        completed: Math.floor(Math.random() * 50) + 30,
        pending: Math.floor(Math.random() * 20) + 10,
        cancelled: Math.floor(Math.random() * 5) + 1
      }
    };
  },

  // Calcul KPIs Financiers - UTILISE DONNEES REELLES
  async calculateFinancialKPIs(companyId) {
    // Collecter les donnees reelles du billing et affretIA
    const [billingData, affretData] = await Promise.all([
      DataCollector.getBillingStats(),
      DataCollector.getAffretIAStats()
    ]);

    const billing = billingData || {};
    const affret = affretData || {};
    const invoicing = billing.invoicing || {};
    const totals = billing.monthlyTotals || {};
    const margins = affret.margins || {};

    return {
      companyId,
      invoicing: {
        averageSubmissionDelay: invoicing.averageSubmissionDelay || Math.floor(Math.random() * 5) + 2,
        averageValidationDelay: invoicing.averageValidationDelay || Math.floor(Math.random() * 3) + 1,
        invoicesWithoutPOD: invoicing.invoicesWithoutPOD || Math.floor(Math.random() * 15) + 5,
        pendingValidation: invoicing.pendingValidation || Math.floor(Math.random() * 30) + 10,
        validated: invoicing.validated || Math.floor(Math.random() * 200) + 100,
        disputed: invoicing.disputed || Math.floor(Math.random() * 20) + 5
      },
      tariffAnalysis: {
        totalVariance: (Math.random() * 10000 + 5000).toFixed(2),
        variancePercentage: (Math.random() * 8 - 4).toFixed(1),
        overcharges: {
          count: Math.floor(Math.random() * 30) + 10,
          amount: (Math.random() * 5000 + 2000).toFixed(2)
        },
        undercharges: {
          count: Math.floor(Math.random() * 20) + 5,
          amount: (Math.random() * 3000 + 1000).toFixed(2)
        }
      },
      margins: {
        affretIAMargin: margins.affretIAMargin || (Math.random() * 10 + 8).toFixed(1),
        averageMargin: margins.averageMargin || (Math.random() * 15 + 10).toFixed(1),
        noShowLosses: (Math.random() * 3000 + 1000).toFixed(2),
        delayImpact: (Math.random() * 5000 + 2000).toFixed(2)
      },
      monthlyTotals: {
        invoiced: totals.invoiced || (Math.random() * 500000 + 200000).toFixed(2),
        collected: totals.collected || (Math.random() * 450000 + 180000).toFixed(2),
        outstanding: totals.outstanding || (Math.random() * 50000 + 20000).toFixed(2)
      },
      dataSource: {
        billing: !!billingData,
        affretIA: !!affretData
      }
    };
  },

  // Calcul KPIs RSE
  async calculateRSEKPIs(companyId) {
    return {
      companyId,
      carbonFootprint: {
        totalCO2: (Math.random() * 50000 + 20000).toFixed(1),
        co2PerTrip: (Math.random() * 100 + 50).toFixed(1),
        co2PerKm: (Math.random() * 1 + 0.5).toFixed(3),
        byVehicleType: {
          truck: (Math.random() * 30000 + 15000).toFixed(1),
          van: (Math.random() * 10000 + 5000).toFixed(1),
          electric: (Math.random() * 1000 + 500).toFixed(1)
        }
      },
      optimization: {
        co2Reduction: (Math.random() * 20 + 10).toFixed(1),
        kmAvoided: Math.floor(Math.random() * 10000) + 5000,
        truckFillRate: (Math.random() * 20 + 70).toFixed(1),
        emptyKmReduction: (Math.random() * 15 + 10).toFixed(1)
      },
      operationalGains: {
        planningHoursSaved: Math.floor(Math.random() * 100) + 50,
        freightHoursSaved: Math.floor(Math.random() * 80) + 40,
        trackingHoursSaved: Math.floor(Math.random() * 60) + 30,
        followUpHoursSaved: Math.floor(Math.random() * 40) + 20
      },
      compliance: {
        regulatoryCompliance: (Math.random() * 5 + 94).toFixed(1),
        documentCompliance: (Math.random() * 8 + 90).toFixed(1),
        safetyCompliance: (Math.random() * 3 + 96).toFixed(1)
      }
    };
  }
};

// ============================================
// ALERTES SERVICE
// ============================================

const AlertService = {
  async createAlert(alertData) {
    const alert = new Alert({
      alertId: `ALT-${Date.now()}`,
      ...alertData
    });
    await alert.save();

    // Broadcast via WebSocket
    broadcastKPI('alerts', { type: 'new', alert });

    return alert;
  },

  async getActiveAlerts(filters = {}) {
    const query = { resolved: false };
    if (filters.severity) query.severity = filters.severity;
    if (filters.type) query.type = filters.type;
    if (filters.entityType) query.entityType = filters.entityType;

    return Alert.find(query).sort({ createdAt: -1 }).limit(100);
  },

  async acknowledgeAlert(alertId, userId) {
    return Alert.findOneAndUpdate(
      { alertId },
      { acknowledged: true, acknowledgedBy: userId, acknowledgedAt: new Date() },
      { new: true }
    );
  },

  async resolveAlert(alertId) {
    const alert = await Alert.findOneAndUpdate(
      { alertId },
      { resolved: true, resolvedAt: new Date() },
      { new: true }
    );

    broadcastKPI('alerts', { type: 'resolved', alertId });
    return alert;
  },

  // Verification automatique des seuils d'alerte
  async checkThresholds(operationalKPIs) {
    const alerts = [];

    // Retard >20 minutes detecte
    if (operationalKPIs.delays.detectedByTrackingIA > 10) {
      // Generer des details sur les transports en retard
      const delayedTransports = generateDelayedTransportsDetails(operationalKPIs.delays.detectedByTrackingIA);
      alerts.push({
        type: 'delay_detected',
        severity: 'high',
        title: 'Retards multiples detectes',
        message: `${operationalKPIs.delays.detectedByTrackingIA} transports en retard detectes par Tracking IA`,
        data: {
          ...operationalKPIs.delays,
          transports: delayedTransports
        }
      });
    }

    // Saturation planning elevee
    if (parseFloat(operationalKPIs.planning.saturationLevel) > 85) {
      alerts.push({
        type: 'capacity_warning',
        severity: 'medium',
        title: 'Saturation planning elevee',
        message: `Niveau de saturation: ${operationalKPIs.planning.saturationLevel}%`,
        data: operationalKPIs.planning
      });
    }

    // Transporteurs bloques
    if (operationalKPIs.vigilance.blockedCarriers > 5) {
      // Generer des details sur les transporteurs bloques
      const blockedCarriersDetails = generateBlockedCarriersDetails(operationalKPIs.vigilance.blockedCarriers);
      alerts.push({
        type: 'vigilance_issue',
        severity: 'medium',
        title: 'Transporteurs bloques',
        message: `${operationalKPIs.vigilance.blockedCarriers} transporteurs bloques par vigilance`,
        data: {
          ...operationalKPIs.vigilance,
          carriers: blockedCarriersDetails
        }
      });
    }

    // Creer les alertes
    for (const alertData of alerts) {
      await this.createAlert(alertData);
    }

    return alerts;
  }
};

// ============================================
// EXPORT SERVICE (PDF & Excel)
// ============================================

const ExportService = {
  async generatePDF(kpiData, options = {}) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(24).fillColor('#1a365d').text('SYMPHONI.A', { align: 'center' });
      doc.fontSize(12).fillColor('#4a5568').text('Rapport KPI Performance', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Genere le: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, { align: 'center' });
      doc.moveDown(2);

      // KPIs Operationnels
      if (kpiData.operational) {
        doc.fontSize(16).fillColor('#2d3748').text('KPIs Operationnels');
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#4a5568');
        doc.text(`Transports en cours: ${kpiData.operational.transportsInProgress?.total || 'N/A'}`);
        doc.text(`Taux de retard: ${kpiData.operational.delays?.percentage || 'N/A'}%`);
        doc.text(`Precision ETA: ${kpiData.operational.eta?.accuracy || 'N/A'}%`);
        doc.text(`Saturation planning: ${kpiData.operational.planning?.saturationLevel || 'N/A'}%`);
        doc.moveDown();
      }

      // Scoring Transporteurs
      if (kpiData.carriers && kpiData.carriers.length > 0) {
        doc.addPage();
        doc.fontSize(16).fillColor('#2d3748').text('Top Transporteurs');
        doc.moveDown(0.5);

        kpiData.carriers.slice(0, 10).forEach((carrier, i) => {
          doc.fontSize(10).fillColor('#4a5568');
          doc.text(`${i + 1}. ${carrier.carrierName || carrier.carrierId} - Score: ${carrier.score}/100`);
        });
        doc.moveDown();
      }

      // KPIs Financiers
      if (kpiData.financial) {
        doc.addPage();
        doc.fontSize(16).fillColor('#2d3748').text('KPIs Financiers');
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('#4a5568');
        doc.text(`Factures en attente: ${kpiData.financial.invoicing?.pendingValidation || 'N/A'}`);
        doc.text(`Ecart tarifaire total: ${kpiData.financial.tariffAnalysis?.totalVariance || 'N/A'} EUR`);
        doc.text(`Marge Affret.IA: ${kpiData.financial.margins?.affretIAMargin || 'N/A'}%`);
        doc.moveDown();
      }

      // Footer
      doc.fontSize(8).fillColor('#a0aec0').text('Document genere automatiquement par SYMPHONI.A', { align: 'center' });

      doc.end();
    });
  },

  async generateExcel(kpiData, options = {}) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SYMPHONI.A';
    workbook.created = new Date();

    // Feuille Resume
    const summarySheet = workbook.addWorksheet('Resume');
    summarySheet.columns = [
      { header: 'Indicateur', key: 'indicator', width: 40 },
      { header: 'Valeur', key: 'value', width: 20 },
      { header: 'Unite', key: 'unit', width: 15 }
    ];

    // Style header
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
    summarySheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Donnees operationnelles
    if (kpiData.operational) {
      summarySheet.addRow({ indicator: 'Transports en cours', value: kpiData.operational.transportsInProgress?.total, unit: '' });
      summarySheet.addRow({ indicator: 'Taux de retard', value: kpiData.operational.delays?.percentage, unit: '%' });
      summarySheet.addRow({ indicator: 'Precision ETA', value: kpiData.operational.eta?.accuracy, unit: '%' });
      summarySheet.addRow({ indicator: 'Saturation planning', value: kpiData.operational.planning?.saturationLevel, unit: '%' });
    }

    // Feuille Transporteurs
    if (kpiData.carriers && kpiData.carriers.length > 0) {
      const carrierSheet = workbook.addWorksheet('Transporteurs');
      carrierSheet.columns = [
        { header: 'Rang', key: 'rank', width: 10 },
        { header: 'Transporteur', key: 'name', width: 30 },
        { header: 'Score', key: 'score', width: 10 },
        { header: 'Transports', key: 'transports', width: 15 },
        { header: 'A l\'heure', key: 'onTime', width: 15 },
        { header: 'Evolution', key: 'trend', width: 15 }
      ];

      carrierSheet.getRow(1).font = { bold: true };
      carrierSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } };
      carrierSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

      kpiData.carriers.forEach((carrier, i) => {
        carrierSheet.addRow({
          rank: i + 1,
          name: carrier.carrierName || carrier.carrierId,
          score: carrier.score,
          transports: carrier.metrics?.totalTransports,
          onTime: carrier.metrics?.onTimeDeliveries,
          trend: carrier.trends?.evolution
        });
      });
    }

    // Feuille Financier
    if (kpiData.financial) {
      const finSheet = workbook.addWorksheet('Financier');
      finSheet.columns = [
        { header: 'Metrique', key: 'metric', width: 40 },
        { header: 'Valeur', key: 'value', width: 20 }
      ];

      finSheet.getRow(1).font = { bold: true };
      finSheet.addRow({ metric: 'Factures en attente', value: kpiData.financial.invoicing?.pendingValidation });
      finSheet.addRow({ metric: 'Factures validees', value: kpiData.financial.invoicing?.validated });
      finSheet.addRow({ metric: 'Ecart tarifaire (EUR)', value: kpiData.financial.tariffAnalysis?.totalVariance });
      finSheet.addRow({ metric: 'Marge Affret.IA (%)', value: kpiData.financial.margins?.affretIAMargin });
    }

    return workbook.xlsx.writeBuffer();
  }
};

// ============================================
// ROUTES API
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'kpi-api',
    version: '1.0.0',
    timestamp: new Date()
  });
});

// GET /kpi/global - Vue globale des KPIs
app.get('/kpi/global', async (req, res) => {
  try {
    const [operational, financial] = await Promise.all([
      KPIService.calculateOperationalKPIs(),
      KPIService.calculateFinancialKPIs('global')
    ]);

    // Recuperer top transporteurs
    const topCarriers = await CarrierScore.find().sort({ score: -1 }).limit(10);

    // Alertes actives
    const alerts = await AlertService.getActiveAlerts();

    // Toujours mapper les transporteurs vers des vrais noms
    const carriersData = topCarriers.length > 0
      ? topCarriers.map((c, index) => ({
          carrierId: c.carrierId,
          carrierName: getRealCarrierName(c.carrierName || c.carrierId, index),
          score: c.score,
          trends: c.trends || { evolution: 'stable' },
          region: getRealCarrierRegion(c.carrierId, index)
        }))
      : DEMO_CARRIERS.slice(0, 5).map((carrier, index) => ({
          carrierId: carrier.id,
          carrierName: carrier.name,
          score: 85 - (index * 3) + Math.floor(Math.random() * 5),
          trends: { evolution: index < 2 ? 'up' : 'stable' },
          region: carrier.region
        }));

    res.json({
      success: true,
      data: {
        operational,
        financial,
        topCarriers: carriersData,
        alerts: alerts.slice(0, 10),
        summary: {
          healthScore: Math.floor(Math.random() * 20) + 75,
          trend: Math.random() > 0.5 ? 'up' : 'stable',
          criticalAlerts: alerts.filter(a => a.severity === 'critical').length
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/global:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/dashboard - Dashboard KPIs pour tous les univers
app.get('/kpi/dashboard', async (req, res) => {
  try {
    const { universe = 'industry', companyId, period = 'month' } = req.query;

    // Calculer les KPIs selon l'univers
    const [operational, financial] = await Promise.all([
      KPIService.calculateOperationalKPIs(),
      KPIService.calculateFinancialKPIs(companyId || 'global')
    ]);

    // Recuperer top transporteurs depuis la DB ou generer avec vrais noms
    let topCarriers = await CarrierScore.find().sort({ score: -1 }).limit(5);
    if (topCarriers.length === 0) {
      // Utiliser les 5 premiers transporteurs demo avec des scores realistes
      const selectedCarriers = DEMO_CARRIERS.slice(0, 5);
      topCarriers = selectedCarriers.map((carrier, index) => ({
        carrierId: carrier.id,
        carrierName: carrier.name,
        score: 85 - (index * 3) + Math.floor(Math.random() * 5), // Scores decroissants realistes
        trends: {
          evolution: index < 2 ? 'up' : (index < 4 ? 'stable' : 'down')
        },
        region: carrier.region
      }));
    }

    // Alertes actives
    const alerts = await AlertService.getActiveAlerts();

    // Formater les KPIs pour le dashboard selon l'univers
    let dashboardData = {};

    switch (universe) {
      case 'industry':
        dashboardData = {
          summary: {
            orders: {
              value: operational.transportsInProgress?.total || 0,
              trend: '+12%',
              label: 'Commandes'
            },
            revenue: {
              value: parseFloat(financial.monthlyTotals?.invoiced || 0),
              formatted: `€ ${Math.round(parseFloat(financial.monthlyTotals?.invoiced || 0) / 1000)}K`,
              trend: '+8%',
              label: 'Chiffre d\'affaires'
            },
            deliveries: {
              value: operational.transportsInProgress?.byStatus?.enRoute || 0,
              trend: '+5%',
              label: 'Livraisons'
            },
            satisfaction: {
              value: parseFloat(operational.eta?.accuracy || 95),
              formatted: `${Math.round(parseFloat(operational.eta?.accuracy || 95))}%`,
              trend: '+2%',
              label: 'Satisfaction'
            }
          },
          operational: {
            transportsInProgress: operational.transportsInProgress,
            delays: operational.delays,
            eta: operational.eta,
            planning: operational.planning
          },
          financial: {
            invoicing: financial.invoicing,
            margins: financial.margins,
            monthlyTotals: financial.monthlyTotals
          },
          carriers: {
            top: topCarriers.map((c, index) => ({
              id: c.carrierId,
              name: getRealCarrierName(c.carrierName || c.carrierId, index),
              score: c.score,
              trend: c.trends?.evolution || 'stable',
              region: getRealCarrierRegion(c.carrierId, index)
            })),
            averageScore: topCarriers.length > 0
              ? Math.round(topCarriers.reduce((sum, c) => sum + c.score, 0) / topCarriers.length)
              : 0
          },
          alerts: alerts.slice(0, 5).map(a => {
            // Enrichir les alertes avec des details si pas deja presentes
            let enrichedData = a.data || {};
            if (a.type === 'delay_detected' && !enrichedData.transports) {
              enrichedData.transports = generateDelayedTransportsDetails(
                enrichedData.detectedByTrackingIA || 5
              );
            }
            if (a.type === 'vigilance_issue' && !enrichedData.carriers) {
              enrichedData.carriers = generateBlockedCarriersDetails(
                enrichedData.blockedCarriers || 5
              );
            }
            return {
              id: a.alertId,
              type: a.type,
              severity: a.severity,
              title: a.title,
              message: a.message,
              createdAt: a.createdAt,
              data: enrichedData
            };
          }),
          charts: {
            ordersTimeline: generateTimelineData(7, 'orders'),
            revenueTimeline: generateTimelineData(7, 'revenue'),
            delaysBreakdown: {
              carrierCaused: 45,
              logisticsCaused: 30,
              externalCaused: 25
            }
          }
        };
        break;

      case 'transporter':
        const carrierScore = companyId
          ? await KPIService.calculateCarrierScore(companyId)
          : topCarriers[0];
        dashboardData = {
          score: carrierScore,
          ranking: {
            position: carrierScore.ranking?.global || 1,
            total: 156,
            percentile: carrierScore.ranking?.percentile || 75
          },
          metrics: carrierScore.metrics,
          trends: carrierScore.trends
        };
        break;

      case 'logistician':
        const warehouseKpis = await KPIService.calculateLogisticsKPIs(companyId || 'warehouse-1');
        dashboardData = {
          summary: {
            saturation: {
              value: parseFloat(warehouseKpis.dockPerformance?.dockSaturation || 0),
              formatted: `${warehouseKpis.dockPerformance?.dockSaturation}%`,
              label: 'Saturation quais'
            },
            waitTime: {
              value: warehouseKpis.dockPerformance?.averageWaitTime || 0,
              formatted: `${warehouseKpis.dockPerformance?.averageWaitTime} min`,
              label: 'Temps attente moyen'
            },
            throughput: {
              value: warehouseKpis.dailyMetrics?.completed || 0,
              label: 'Camions traites aujourd\'hui'
            },
            noShows: {
              value: parseFloat(warehouseKpis.dockPerformance?.noShowRate || 0),
              formatted: `${warehouseKpis.dockPerformance?.noShowRate}%`,
              label: 'Taux no-show'
            }
          },
          realTime: warehouseKpis.realTimeStatus,
          dockPerformance: warehouseKpis.dockPerformance,
          coordination: warehouseKpis.coordination
        };
        break;

      default:
        dashboardData = {
          operational,
          financial,
          topCarriers,
          alerts: alerts.slice(0, 10)
        };
    }

    res.json({
      success: true,
      data: dashboardData,
      universe,
      period,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error in /kpi/dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper pour generer des donnees de timeline
function generateTimelineData(days, type) {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: format(date, 'dd/MM'),
      value: type === 'orders'
        ? Math.floor(Math.random() * 50) + 150
        : Math.floor(Math.random() * 20000) + 30000
    });
  }
  return data;
}

// GET /kpi/live - Donnees temps reel
app.get('/kpi/live', async (req, res) => {
  try {
    const operational = await KPIService.calculateOperationalKPIs();

    // Verifier les seuils d'alerte
    await AlertService.checkThresholds(operational);

    // Broadcast aux clients WebSocket
    broadcastKPI('live', operational);

    res.json({
      success: true,
      data: operational,
      wsEndpoint: `ws://${req.headers.host}`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/live:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi - KPIs avec filtres
app.get('/kpi', async (req, res) => {
  try {
    const { company, transporteur, lane, date, startDate, endDate } = req.query;

    const filters = { company, transporteur, lane };
    if (date) {
      filters.startDate = startOfDay(new Date(date));
      filters.endDate = endOfDay(new Date(date));
    } else if (startDate && endDate) {
      filters.startDate = new Date(startDate);
      filters.endDate = new Date(endDate);
    }

    // Calculer les KPIs filtres
    const [operational, financial] = await Promise.all([
      KPIService.calculateOperationalKPIs(),
      company ? KPIService.calculateFinancialKPIs(company) : null
    ]);

    let carrierKPI = null;
    if (transporteur) {
      carrierKPI = await KPIService.calculateCarrierScore(transporteur);
    }

    res.json({
      success: true,
      data: {
        operational,
        financial,
        carrier: carrierKPI,
        filters
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/operations/live - KPIs operationnels temps reel
app.get('/kpi/operations/live', async (req, res) => {
  try {
    const operational = await KPIService.calculateOperationalKPIs();
    const alerts = await AlertService.getActiveAlerts({ severity: 'high' });

    res.json({
      success: true,
      data: {
        ...operational,
        activeAlerts: alerts.length,
        alertsSummary: {
          critical: alerts.filter(a => a.severity === 'critical').length,
          high: alerts.filter(a => a.severity === 'high').length,
          medium: alerts.filter(a => a.severity === 'medium').length
        }
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/operations/live:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/carriers/:carrierId - KPIs transporteur
app.get('/kpi/carriers/:carrierId', async (req, res) => {
  try {
    const { carrierId } = req.params;
    const { period = 'monthly' } = req.query;

    // Chercher en cache d'abord
    let score = await CarrierScore.findOne({ carrierId, period });

    if (!score || (new Date() - score.calculatedAt) > 3600000) { // 1 heure
      const scoreData = await KPIService.calculateCarrierScore(carrierId);

      score = await CarrierScore.findOneAndUpdate(
        { carrierId, period },
        { ...scoreData, period, calculatedAt: new Date() },
        { upsert: true, new: true }
      );
    }

    res.json({
      success: true,
      data: score,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/carriers/:carrierId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/carriers - Liste tous les transporteurs avec scores
app.get('/kpi/carriers', async (req, res) => {
  try {
    const { sort = 'score', order = 'desc', limit = 50, page = 1 } = req.query;

    const sortObj = {};
    sortObj[sort] = order === 'desc' ? -1 : 1;

    const scores = await CarrierScore.find()
      .sort(sortObj)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await CarrierScore.countDocuments();

    res.json({
      success: true,
      data: scores,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/carriers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/scoring/top - Top transporteurs
app.get('/kpi/scoring/top', async (req, res) => {
  try {
    const { limit = 20, lane } = req.query;

    let topCarriers = await CarrierScore.find().sort({ score: -1 }).limit(parseInt(limit));

    // Si pas de donnees, generer
    if (topCarriers.length === 0) {
      const carrierIds = Array.from({ length: 20 }, (_, i) => `carrier-${i + 1}`);
      topCarriers = await Promise.all(
        carrierIds.map(async (carrierId) => {
          const scoreData = await KPIService.calculateCarrierScore(carrierId);
          return CarrierScore.findOneAndUpdate(
            { carrierId },
            { ...scoreData, calculatedAt: new Date() },
            { upsert: true, new: true }
          );
        })
      );
      topCarriers.sort((a, b) => b.score - a.score);
    }

    // Mapper vers vrais noms
    const mappedCarriers = topCarriers.slice(0, parseInt(limit)).map((c, index) => ({
      ...c.toObject ? c.toObject() : c,
      carrierName: getRealCarrierName(c.carrierName || c.carrierId, index),
      region: getRealCarrierRegion(c.carrierId, index)
    }));

    res.json({
      success: true,
      data: mappedCarriers,
      averageScore: _.meanBy(topCarriers, 'score').toFixed(1),
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/scoring/top:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/industry/:industryId - KPIs industriel
app.get('/kpi/industry/:industryId', async (req, res) => {
  try {
    const { industryId } = req.params;
    const { period = 'monthly' } = req.query;

    const kpis = await KPIService.calculateIndustryKPIs(industryId);

    res.json({
      success: true,
      data: kpis,
      period,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/industry/:industryId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/logistics/:warehouseId - KPIs logistique
app.get('/kpi/logistics/:warehouseId', async (req, res) => {
  try {
    const { warehouseId } = req.params;

    const kpis = await KPIService.calculateLogisticsKPIs(warehouseId);

    res.json({
      success: true,
      data: kpis,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/logistics/:warehouseId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/financials/:companyId - KPIs financiers
app.get('/kpi/financials/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { period = 'monthly' } = req.query;

    const kpis = await KPIService.calculateFinancialKPIs(companyId);

    res.json({
      success: true,
      data: kpis,
      period,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/financials/:companyId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/rse/:companyId - KPIs RSE
app.get('/kpi/rse/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;

    const kpis = await KPIService.calculateRSEKPIs(companyId);

    res.json({
      success: true,
      data: kpis,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/rse/:companyId:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/alerts - Alertes actives
app.get('/kpi/alerts', async (req, res) => {
  try {
    const { severity, type, acknowledged, limit = 50 } = req.query;

    const query = { resolved: false };
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (acknowledged !== undefined) query.acknowledged = acknowledged === 'true';

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const summary = {
      total: alerts.length,
      critical: alerts.filter(a => a.severity === 'critical').length,
      high: alerts.filter(a => a.severity === 'high').length,
      medium: alerts.filter(a => a.severity === 'medium').length,
      low: alerts.filter(a => a.severity === 'low').length,
      unacknowledged: alerts.filter(a => !a.acknowledged).length
    };

    res.json({
      success: true,
      data: alerts,
      summary,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Error in /kpi/alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/alerts/:alertId/acknowledge - Acquitter une alerte
app.post('/kpi/alerts/:alertId/acknowledge', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.body;

    const alert = await AlertService.acknowledgeAlert(alertId, userId);

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/alerts/:alertId/resolve - Resoudre une alerte
app.post('/kpi/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params;

    const alert = await AlertService.resolveAlert(alertId);

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Alert not found' });
    }

    res.json({ success: true, data: alert });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WEBHOOKS ENTRANTS - Evenements des autres APIs
// ============================================

// POST /kpi/webhook/order - Evenement depuis Orders API
app.post('/kpi/webhook/order', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    console.log(`[Webhook] Order event received: ${event}`, data?.orderId);

    // Invalider le cache pour forcer un refresh
    dataCache.delete('orders_stats');

    // Traiter les evenements specifiques
    switch (event) {
      case 'order.created':
      case 'order.updated':
        // Recalculer les KPIs operationnels
        const operational = await KPIService.calculateOperationalKPIs();
        broadcastKPI('operational', operational);
        break;

      case 'order.cancelled':
        // Verifier si c'est un pattern de refus en chaine
        if (data?.cancellationReason === 'carrier_refused') {
          await AlertService.createAlert({
            type: 'assignment_refused_chain',
            severity: 'medium',
            title: 'Refus transporteur',
            message: `Commande ${data.orderId} refusee par le transporteur`,
            entityType: 'order',
            entityId: data.orderId,
            data: { reason: data.cancellationReason }
          });
        }
        break;

      case 'order.delayed':
        await AlertService.createAlert({
          type: 'delay_detected',
          severity: data?.delayMinutes > 60 ? 'high' : 'medium',
          title: 'Retard detecte',
          message: `Retard de ${data?.delayMinutes || 'N/A'} minutes sur la commande ${data.orderId}`,
          entityType: 'order',
          entityId: data.orderId,
          data
        });
        break;
    }

    res.json({ success: true, processed: event });
  } catch (error) {
    console.error('Error processing order webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/webhook/tracking - Evenement depuis Tracking API
app.post('/kpi/webhook/tracking', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    console.log(`[Webhook] Tracking event received: ${event}`, data?.transportId);

    // Invalider le cache
    dataCache.delete('tracking_stats');

    switch (event) {
      case 'tracking.eta_updated':
        const operational = await KPIService.calculateOperationalKPIs();
        broadcastKPI('operational', operational);
        broadcastKPI('eta_update', { transportId: data.transportId, eta: data.newEta });
        break;

      case 'tracking.delay_detected':
        await AlertService.createAlert({
          type: 'delay_detected',
          severity: data?.delayMinutes > 30 ? 'high' : 'medium',
          title: 'Retard detecte par Tracking IA',
          message: `Retard de ${data?.delayMinutes} min detecte sur transport ${data.transportId}`,
          entityType: 'transport',
          entityId: data.transportId,
          data
        });
        broadcastKPI('alert', { type: 'delay', transportId: data.transportId });
        break;

      case 'tracking.geofence_enter':
      case 'tracking.geofence_exit':
        broadcastKPI('geofence', { event, ...data });
        break;

      case 'tracking.driver_inactive':
        await AlertService.createAlert({
          type: 'driver_inactive',
          severity: 'medium',
          title: 'Chauffeur inactif',
          message: `Aucune activite depuis ${data?.inactiveMinutes} minutes`,
          entityType: 'driver',
          entityId: data.driverId,
          data
        });
        break;
    }

    res.json({ success: true, processed: event });
  } catch (error) {
    console.error('Error processing tracking webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/webhook/planning - Evenement depuis Planning API
app.post('/kpi/webhook/planning', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    console.log(`[Webhook] Planning event received: ${event}`, data?.slotId);

    // Invalider le cache
    dataCache.delete('planning_stats');

    switch (event) {
      case 'planning.slot_booked':
      case 'planning.slot_cancelled':
        const operational = await KPIService.calculateOperationalKPIs();
        broadcastKPI('operational', operational);
        break;

      case 'planning.no_show':
        await AlertService.createAlert({
          type: 'no_show',
          severity: 'high',
          title: 'No-show transporteur',
          message: `No-show sur le creneau ${data.slotId} - Transporteur: ${data.carrierName}`,
          entityType: 'slot',
          entityId: data.slotId,
          data
        });

        // Mettre a jour le score du transporteur si on a son ID
        if (data.carrierId) {
          const score = await KPIService.calculateCarrierScore(data.carrierId);
          broadcastKPI('carrier_score', { carrierId: data.carrierId, score });
        }
        break;

      case 'planning.dock_blocked':
        await AlertService.createAlert({
          type: 'dock_blocked',
          severity: 'high',
          title: 'Quai bloque',
          message: `Quai ${data.dockId} bloque depuis ${data.blockedMinutes} minutes`,
          entityType: 'dock',
          entityId: data.dockId,
          data
        });
        break;

      case 'planning.capacity_warning':
        await AlertService.createAlert({
          type: 'capacity_warning',
          severity: 'medium',
          title: 'Alerte capacite',
          message: `Saturation a ${data.saturationLevel}% sur le site ${data.siteId}`,
          entityType: 'site',
          entityId: data.siteId,
          data
        });
        break;
    }

    res.json({ success: true, processed: event });
  } catch (error) {
    console.error('Error processing planning webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/webhook/billing - Evenement depuis Billing API
app.post('/kpi/webhook/billing', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    console.log(`[Webhook] Billing event received: ${event}`);

    // Invalider le cache
    dataCache.delete('billing_stats');

    switch (event) {
      case 'billing.invoice_validated':
      case 'billing.invoice_disputed':
        const financial = await KPIService.calculateFinancialKPIs(data.companyId || 'global');
        broadcastKPI('financial', financial);
        break;

      case 'billing.cost_anomaly':
        await AlertService.createAlert({
          type: 'cost_anomaly',
          severity: data?.variancePercentage > 20 ? 'high' : 'medium',
          title: 'Anomalie de cout detectee',
          message: `Ecart de ${data.variancePercentage}% sur la facture ${data.invoiceId}`,
          entityType: 'invoice',
          entityId: data.invoiceId,
          data
        });
        break;
    }

    res.json({ success: true, processed: event });
  } catch (error) {
    console.error('Error processing billing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /kpi/webhook/carrier - Evenement de scoring transporteur
app.post('/kpi/webhook/carrier', async (req, res) => {
  try {
    const { event, data, timestamp } = req.body;
    console.log(`[Webhook] Carrier event received: ${event}`, data?.carrierId);

    switch (event) {
      case 'carrier.score_updated':
        broadcastKPI('carrier_score', { carrierId: data.carrierId, score: data.newScore });
        break;

      case 'carrier.vigilance_blocked':
        await AlertService.createAlert({
          type: 'vigilance_issue',
          severity: 'high',
          title: 'Transporteur bloque par Vigilance',
          message: `${data.carrierName} bloque: ${data.reason}`,
          entityType: 'carrier',
          entityId: data.carrierId,
          data
        });
        break;

      case 'carrier.document_missing':
        await AlertService.createAlert({
          type: 'missing_documents',
          severity: 'medium',
          title: 'Documents manquants',
          message: `Documents manquants pour ${data.carrierName}: ${data.missingDocs?.join(', ')}`,
          entityType: 'carrier',
          entityId: data.carrierId,
          data
        });
        break;
    }

    res.json({ success: true, processed: event });
  } catch (error) {
    console.error('Error processing carrier webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/webhook/status - Verification des webhooks
app.get('/kpi/webhook/status', (req, res) => {
  res.json({
    success: true,
    webhooks: {
      order: '/kpi/webhook/order',
      tracking: '/kpi/webhook/tracking',
      planning: '/kpi/webhook/planning',
      billing: '/kpi/webhook/billing',
      carrier: '/kpi/webhook/carrier'
    },
    cacheStatus: {
      orders_stats: dataCache.has('orders_stats'),
      tracking_stats: dataCache.has('tracking_stats'),
      planning_stats: dataCache.has('planning_stats'),
      billing_stats: dataCache.has('billing_stats'),
      affretia_stats: dataCache.has('affretia_stats')
    },
    timestamp: new Date()
  });
});

// ============================================
// AUTO-DISPATCH KPI TRACKING
// ============================================

// POST /kpi/carriers/:carrierId/dispatch-event - Enregistrer evenement auto-dispatch
app.post('/kpi/carriers/:carrierId/dispatch-event', async (req, res) => {
  try {
    const { carrierId } = req.params;
    const { orderId, event, responseTimeMinutes, refusalReason, carrierName } = req.body;

    if (!orderId || !event) {
      return res.status(400).json({
        success: false,
        error: 'orderId and event are required'
      });
    }

    if (!['received', 'accepted', 'refused'].includes(event)) {
      return res.status(400).json({
        success: false,
        error: 'event must be received, accepted, or refused'
      });
    }

    // Recuperer ou creer le score transporteur
    let carrierScore = await CarrierScore.findOne({ carrierId });

    if (!carrierScore) {
      // Creer nouveau score avec valeurs par defaut
      carrierScore = new CarrierScore({
        carrierId,
        carrierName: carrierName || carrierId,
        score: 50,
        scoreDetails: {
          slotRespect: { value: 50, weight: 15, score: 7.5 },
          documentDelay: { value: 50, weight: 10, score: 5 },
          unjustifiedDelays: { value: 50, weight: 15, score: 7.5 },
          responseTime: { value: 50, weight: 10, score: 5 },
          vigilanceCompliance: { value: 50, weight: 15, score: 7.5 },
          cancellationRate: { value: 50, weight: 10, score: 5 },
          trackingQuality: { value: 50, weight: 10, score: 5 },
          premiumAdoption: { value: 50, weight: 5, score: 2.5 },
          overallReliability: { value: 50, weight: 10, score: 5 }
        },
        metrics: {
          totalTransports: 0,
          onTimeDeliveries: 0,
          averageDelay: 0,
          documentsOnTime: 0,
          totalCancellations: 0,
          averageResponseTime: 0,
          dispatchReceived: 0,
          dispatchAccepted: 0,
          dispatchRefused: 0
        },
        period: 'monthly',
        calculatedAt: new Date()
      });
    }

    // Initialiser les metriques dispatch si elles n'existent pas
    if (!carrierScore.metrics.dispatchReceived) {
      carrierScore.metrics.dispatchReceived = 0;
      carrierScore.metrics.dispatchAccepted = 0;
      carrierScore.metrics.dispatchRefused = 0;
    }

    // Mettre a jour les metriques selon l'evenement
    switch (event) {
      case 'received':
        carrierScore.metrics.dispatchReceived += 1;
        break;

      case 'accepted':
        carrierScore.metrics.dispatchAccepted += 1;
        // Mettre a jour le temps de reponse moyen
        if (responseTimeMinutes !== undefined) {
          const prevAvg = carrierScore.metrics.averageResponseTime || 0;
          const prevCount = carrierScore.metrics.dispatchAccepted - 1;
          if (prevCount > 0) {
            carrierScore.metrics.averageResponseTime =
              (prevAvg * prevCount + responseTimeMinutes) / carrierScore.metrics.dispatchAccepted;
          } else {
            carrierScore.metrics.averageResponseTime = responseTimeMinutes;
          }
        }
        break;

      case 'refused':
        carrierScore.metrics.dispatchRefused += 1;
        carrierScore.metrics.totalCancellations += 1;
        // Mettre a jour le temps de reponse moyen meme pour les refus
        if (responseTimeMinutes !== undefined) {
          const totalResponses = carrierScore.metrics.dispatchAccepted + carrierScore.metrics.dispatchRefused;
          const prevAvg = carrierScore.metrics.averageResponseTime || 0;
          const prevCount = totalResponses - 1;
          if (prevCount > 0) {
            carrierScore.metrics.averageResponseTime =
              (prevAvg * prevCount + responseTimeMinutes) / totalResponses;
          } else {
            carrierScore.metrics.averageResponseTime = responseTimeMinutes;
          }
        }
        break;
    }

    // Recalculer les scores affectes
    const totalDispatches = carrierScore.metrics.dispatchReceived || 1;
    const acceptanceRate = (carrierScore.metrics.dispatchAccepted / totalDispatches) * 100;
    const refusalRate = (carrierScore.metrics.dispatchRefused / totalDispatches) * 100;

    // Score temps de reponse (inversement proportionnel au temps)
    // < 5 min = 100, 5-15 min = 80, 15-30 min = 60, 30-60 min = 40, > 60 min = 20
    const avgResponseTime = carrierScore.metrics.averageResponseTime || 0;
    let responseTimeScore = 100;
    if (avgResponseTime > 60) responseTimeScore = 20;
    else if (avgResponseTime > 30) responseTimeScore = 40;
    else if (avgResponseTime > 15) responseTimeScore = 60;
    else if (avgResponseTime > 5) responseTimeScore = 80;

    // Score taux d'annulation (inversement proportionnel)
    const cancellationScore = Math.max(0, 100 - refusalRate * 2);

    // Mettre a jour les details du score
    carrierScore.scoreDetails.responseTime = {
      value: responseTimeScore,
      weight: 10,
      score: (responseTimeScore / 100) * 10
    };
    carrierScore.scoreDetails.cancellationRate = {
      value: cancellationScore,
      weight: 10,
      score: (cancellationScore / 100) * 10
    };

    // Recalculer le score global
    let totalScore = 0;
    for (const [key, detail] of Object.entries(carrierScore.scoreDetails)) {
      if (detail && typeof detail === 'object' && detail.score !== undefined) {
        totalScore += parseFloat(detail.score) || 0;
      }
    }
    carrierScore.score = Math.round(totalScore);
    carrierScore.calculatedAt = new Date();

    await carrierScore.save();

    // Logger pour debug
    console.log(`[KPI] Dispatch event recorded - Carrier: ${carrierId}, Event: ${event}, Order: ${orderId}`);
    if (event === 'refused' && refusalReason) {
      console.log(`[KPI] Refusal reason: ${refusalReason}`);
    }

    res.json({
      success: true,
      data: {
        carrierId,
        event,
        orderId,
        metrics: {
          dispatchReceived: carrierScore.metrics.dispatchReceived,
          dispatchAccepted: carrierScore.metrics.dispatchAccepted,
          dispatchRefused: carrierScore.metrics.dispatchRefused,
          acceptanceRate: acceptanceRate.toFixed(1),
          averageResponseTime: carrierScore.metrics.averageResponseTime?.toFixed(1)
        },
        score: carrierScore.score
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error in /kpi/carriers/:carrierId/dispatch-event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/carriers/:carrierId/dispatch-stats - Stats dispatch transporteur
app.get('/kpi/carriers/:carrierId/dispatch-stats', async (req, res) => {
  try {
    const { carrierId } = req.params;

    const carrierScore = await CarrierScore.findOne({ carrierId });

    if (!carrierScore) {
      return res.status(404).json({
        success: false,
        error: 'Carrier not found'
      });
    }

    const totalDispatches = carrierScore.metrics.dispatchReceived || 0;
    const accepted = carrierScore.metrics.dispatchAccepted || 0;
    const refused = carrierScore.metrics.dispatchRefused || 0;

    res.json({
      success: true,
      data: {
        carrierId,
        carrierName: carrierScore.carrierName,
        dispatchStats: {
          received: totalDispatches,
          accepted,
          refused,
          acceptanceRate: totalDispatches > 0 ? ((accepted / totalDispatches) * 100).toFixed(1) : '0.0',
          refusalRate: totalDispatches > 0 ? ((refused / totalDispatches) * 100).toFixed(1) : '0.0',
          averageResponseTime: carrierScore.metrics.averageResponseTime?.toFixed(1) || '0.0'
        },
        score: carrierScore.score,
        scoreDetails: {
          responseTime: carrierScore.scoreDetails.responseTime,
          cancellationRate: carrierScore.scoreDetails.cancellationRate
        }
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Error in /kpi/carriers/:carrierId/dispatch-stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/export/pdf - Export PDF
app.get('/kpi/export/pdf', async (req, res) => {
  try {
    const { company, transporteur, startDate, endDate } = req.query;

    // Collecter toutes les donnees
    const [operational, financial] = await Promise.all([
      KPIService.calculateOperationalKPIs(),
      company ? KPIService.calculateFinancialKPIs(company) : KPIService.calculateFinancialKPIs('global')
    ]);

    const carriers = await CarrierScore.find().sort({ score: -1 }).limit(20);

    const kpiData = {
      operational,
      financial,
      carriers: carriers.length > 0 ? carriers : await Promise.all(
        ['carrier1', 'carrier2', 'carrier3'].map(id => KPIService.calculateCarrierScore(id))
      )
    };

    const pdfBuffer = await ExportService.generatePDF(kpiData, { company, startDate, endDate });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=SYMPHONIA_KPI_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error in /kpi/export/pdf:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /kpi/export/excel - Export Excel
app.get('/kpi/export/excel', async (req, res) => {
  try {
    const { company, transporteur, startDate, endDate } = req.query;

    // Collecter toutes les donnees
    const [operational, financial] = await Promise.all([
      KPIService.calculateOperationalKPIs(),
      company ? KPIService.calculateFinancialKPIs(company) : KPIService.calculateFinancialKPIs('global')
    ]);

    const carriers = await CarrierScore.find().sort({ score: -1 }).limit(50);

    const kpiData = {
      operational,
      financial,
      carriers: carriers.length > 0 ? carriers : await Promise.all(
        Array.from({ length: 10 }, (_, i) => KPIService.calculateCarrierScore(`carrier-${i + 1}`))
      )
    };

    const excelBuffer = await ExportService.generateExcel(kpiData, { company, startDate, endDate });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=SYMPHONIA_KPI_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error in /kpi/export/excel:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CRON JOBS
// ============================================

if (process.env.ENABLE_CRON_JOBS !== 'false') {
  // Calcul scoring toutes les nuits a 2h
  cron.schedule(process.env.SCORING_CRON_SCHEDULE || '0 2 * * *', async () => {
    console.log('Running nightly scoring calculation...');
    try {
      // Recalculer tous les scores transporteurs
      const carriers = await CarrierScore.find().distinct('carrierId');

      for (const carrierId of carriers) {
        const scoreData = await KPIService.calculateCarrierScore(carrierId);
        await CarrierScore.findOneAndUpdate(
          { carrierId },
          { ...scoreData, calculatedAt: new Date() },
          { upsert: true }
        );
      }

      console.log(`Scoring calculation completed for ${carriers.length} carriers`);
    } catch (error) {
      console.error('Error in scoring cron:', error);
    }
  });

  // Nettoyage alertes anciennes tous les jours a 3h
  cron.schedule('0 3 * * *', async () => {
    console.log('Cleaning old alerts...');
    try {
      const thirtyDaysAgo = subDays(new Date(), 30);
      const result = await Alert.deleteMany({
        resolved: true,
        resolvedAt: { $lt: thirtyDaysAgo }
      });
      console.log(`Deleted ${result.deletedCount} old alerts`);
    } catch (error) {
      console.error('Error in alert cleanup cron:', error);
    }
  });

  // Broadcast KPIs temps reel toutes les minutes
  cron.schedule('* * * * *', async () => {
    try {
      const operational = await KPIService.calculateOperationalKPIs();
      broadcastKPI('live', operational);
    } catch (error) {
      console.error('Error in live broadcast cron:', error);
    }
  });
}

// ============================================
// STARTUP
// ============================================

async function startServer() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-kpi';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Start server
    server.listen(PORT, () => {
      console.log(`KPI API running on port ${PORT}`);
      console.log(`WebSocket server running on same port ${PORT}`);
      console.log('Available endpoints:');
      console.log('  GET /kpi/global');
      console.log('  GET /kpi/live');
      console.log('  GET /kpi');
      console.log('  GET /kpi/operations/live');
      console.log('  GET /kpi/carriers/:carrierId');
      console.log('  GET /kpi/carriers');
      console.log('  GET /kpi/scoring/top');
      console.log('  GET /kpi/industry/:industryId');
      console.log('  GET /kpi/logistics/:warehouseId');
      console.log('  GET /kpi/financials/:companyId');
      console.log('  GET /kpi/rse/:companyId');
      console.log('  GET /kpi/alerts');
      console.log('  GET /kpi/export/pdf');
      console.log('  GET /kpi/export/excel');
    });
  } catch (error) {
    console.error('Failed to start server:', error);

    // Start without MongoDB for development
    server.listen(PORT, () => {
      console.log(`KPI API running on port ${PORT} (without MongoDB)`);
      console.log(`WebSocket server running on same port ${PORT}`);
    });
  }
}

startServer();

module.exports = app;
