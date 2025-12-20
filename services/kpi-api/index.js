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
// SERVICES DE CALCUL KPI
// ============================================

const KPIService = {
  // Calcul KPIs Operationnels temps reel
  async calculateOperationalKPIs() {
    // Simulation - En production, aggreger depuis les autres services
    const now = new Date();

    return {
      transportsInProgress: {
        total: Math.floor(Math.random() * 200) + 150,
        byStatus: {
          enRoute: Math.floor(Math.random() * 100) + 80,
          loading: Math.floor(Math.random() * 30) + 20,
          unloading: Math.floor(Math.random() * 30) + 20,
          waiting: Math.floor(Math.random() * 20) + 10,
          delayed: Math.floor(Math.random() * 15) + 5
        }
      },
      delays: {
        percentage: (Math.random() * 10 + 5).toFixed(1),
        averageMinutes: Math.floor(Math.random() * 30) + 15,
        detectedByTrackingIA: Math.floor(Math.random() * 20) + 5
      },
      eta: {
        accuracy: (Math.random() * 10 + 88).toFixed(1),
        averageDeviation: Math.floor(Math.random() * 15) + 5
      },
      orderAcceptance: {
        averageTimeMinutes: Math.floor(Math.random() * 30) + 10,
        pendingOrders: Math.floor(Math.random() * 50) + 20
      },
      planning: {
        saturationLevel: (Math.random() * 30 + 60).toFixed(1),
        availableSlots: Math.floor(Math.random() * 100) + 50
      },
      affretIA: {
        activeOrders: Math.floor(Math.random() * 80) + 40,
        matchRate: (Math.random() * 20 + 75).toFixed(1)
      },
      vigilance: {
        blockedCarriers: Math.floor(Math.random() * 10) + 2,
        pendingValidations: Math.floor(Math.random() * 20) + 5
      },
      carrierResponse: {
        averageRate: (Math.random() * 15 + 80).toFixed(1),
        belowThreshold: Math.floor(Math.random() * 10) + 3
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

  // Calcul KPIs Financiers
  async calculateFinancialKPIs(companyId) {
    return {
      companyId,
      invoicing: {
        averageSubmissionDelay: Math.floor(Math.random() * 5) + 2,
        averageValidationDelay: Math.floor(Math.random() * 3) + 1,
        invoicesWithoutPOD: Math.floor(Math.random() * 15) + 5,
        pendingValidation: Math.floor(Math.random() * 30) + 10,
        validated: Math.floor(Math.random() * 200) + 100,
        disputed: Math.floor(Math.random() * 20) + 5
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
        affretIAMargin: (Math.random() * 10 + 8).toFixed(1),
        averageMargin: (Math.random() * 15 + 10).toFixed(1),
        noShowLosses: (Math.random() * 3000 + 1000).toFixed(2),
        delayImpact: (Math.random() * 5000 + 2000).toFixed(2)
      },
      monthlyTotals: {
        invoiced: (Math.random() * 500000 + 200000).toFixed(2),
        collected: (Math.random() * 450000 + 180000).toFixed(2),
        outstanding: (Math.random() * 50000 + 20000).toFixed(2)
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
      alerts.push({
        type: 'delay_detected',
        severity: 'high',
        title: 'Retards multiples detectes',
        message: `${operationalKPIs.delays.detectedByTrackingIA} transports en retard detectes par Tracking IA`,
        data: operationalKPIs.delays
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
      alerts.push({
        type: 'vigilance_issue',
        severity: 'medium',
        title: 'Transporteurs bloques',
        message: `${operationalKPIs.vigilance.blockedCarriers} transporteurs bloques par vigilance`,
        data: operationalKPIs.vigilance
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

    res.json({
      success: true,
      data: {
        operational,
        financial,
        topCarriers: topCarriers.length > 0 ? topCarriers : await Promise.all(
          ['carrier1', 'carrier2', 'carrier3', 'carrier4', 'carrier5'].map(id =>
            KPIService.calculateCarrierScore(id)
          )
        ),
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

    res.json({
      success: true,
      data: topCarriers.slice(0, parseInt(limit)),
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
