/**
 * Module Prefacturation & Facturation Transport
 * RT Technologie - SYMPHONI.A API v1.0.0
 *
 * 5 Blocs:
 * 1. Prefacturation Automatique
 * 2. Detection d'Ecarts Tarifaires
 * 3. Validation Transporteur (OCR)
 * 4. Blocages Automatiques
 * 5. Facture Finale & Export ERP
 *
 * Archivage legal 10 ans
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const moment = require('moment');
const xml2js = require('xml2js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Route alias: /api/v1/billing/* -> /api/billing/*
app.use('/api/v1/billing', (req, res, next) => {
  req.url = '/api/billing' + req.url;
  next('route');
});
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/v1/billing')) {
    req.url = req.originalUrl.replace('/api/v1/billing', '/api/billing');
  }
  next();
});

// Multer pour upload fichiers
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// ===========================================
// CONFIGURATION
// ===========================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/billing';
const JWT_SECRET = process.env.JWT_SECRET || 'rt-billing-secret-2024';
const VALIDATION_TIMEOUT_DAYS = 7;
const ARCHIVE_RETENTION_YEARS = 10;

// TVA France
const TVA_RATE = 0.20;

// ===========================================
// MONGOOSE SCHEMAS
// ===========================================

// Schema Grille Tarifaire
const tariffGridSchema = new mongoose.Schema({
  gridId: { type: String, required: true, unique: true },
  transporterId: { type: String, required: true },
  clientId: { type: String, required: true },
  name: String,
  validFrom: { type: Date, required: true },
  validTo: Date,
  // Tarifs par zone/distance
  baseRates: [{
    zoneFrom: String,
    zoneTo: String,
    minKm: Number,
    maxKm: Number,
    pricePerKm: Number,
    fixedPrice: Number,
    currency: { type: String, default: 'EUR' }
  }],
  // Options et majorations
  options: {
    adr: { type: Number, default: 0 }, // % majoration ADR
    hayon: { type: Number, default: 0 },
    express: { type: Number, default: 0 },
    frigo: { type: Number, default: 0 },
    palettesEchange: { type: Number, default: 0 }, // prix/palette
    redescendeMateriel: { type: Number, default: 0 },
    weekend: { type: Number, default: 0 }, // % majoration weekend
    nuit: { type: Number, default: 0 }, // % majoration nuit
    horairesSpeciaux: { type: Number, default: 0 }
  },
  // Temps d'attente
  waitingTime: {
    freeMinutes: { type: Number, default: 30 },
    pricePerHour: { type: Number, default: 45 }
  },
  // Penalites
  penalties: {
    lateDeliveryPerHour: { type: Number, default: 25 },
    missingDocument: { type: Number, default: 50 },
    damagedGoods: { type: Number, default: 100 }
  },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Prefacturation
const prefacturationSchema = new mongoose.Schema({
  prefacturationId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  transporterId: { type: String, required: true },
  transporterName: String,
  clientId: { type: String, required: true },
  clientName: String,
  // Statut workflow
  status: {
    type: String,
    enum: [
      'draft',
      'generated',
      'discrepancy_detected',
      'pending_validation',
      'validated',
      'contested',
      'conflict_closed',
      'blocked',
      'finalized',
      'exported',
      'archived'
    ],
    default: 'draft'
  },
  // Donnees de la course
  orderData: {
    pickupDate: Date,
    deliveryDate: Date,
    pickupAddress: String,
    deliveryAddress: String,
    pickupPostalCode: String,
    deliveryPostalCode: String,
    distance: Number, // km reels (Tracking IA)
    duration: Number, // minutes
    vehicleType: String,
    vehiclePlate: String,
    driverName: String
  },
  // Marchandise
  cargo: {
    description: String,
    weight: Number, // kg
    volume: Number, // m3
    pallets: Number,
    packages: Number,
    isADR: { type: Boolean, default: false },
    adrClass: String,
    temperature: Number // si frigo
  },
  // Options activees
  options: {
    adr: { type: Boolean, default: false },
    hayon: { type: Boolean, default: false },
    express: { type: Boolean, default: false },
    frigo: { type: Boolean, default: false },
    palettesEchange: { type: Number, default: 0 },
    redescendeMateriel: { type: Boolean, default: false },
    weekend: { type: Boolean, default: false },
    nuit: { type: Boolean, default: false }
  },
  // Temps d'attente (mesure Tracking IA)
  waitingTime: {
    pickup: { type: Number, default: 0 }, // minutes
    delivery: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    billable: { type: Number, default: 0 }
  },
  // Incidents
  incidents: [{
    type: { type: String },
    description: String,
    date: Date,
    penaltyApplied: Number
  }],
  // Calcul prefacturation
  calculation: {
    gridId: String,
    basePrice: { type: Number, default: 0 },
    distancePrice: { type: Number, default: 0 },
    optionsPrice: { type: Number, default: 0 },
    waitingTimePrice: { type: Number, default: 0 },
    palettesPrice: { type: Number, default: 0 },
    penalties: { type: Number, default: 0 },
    surcharges: { type: Number, default: 0 },
    discounts: { type: Number, default: 0 },
    totalHT: { type: Number, default: 0 },
    tva: { type: Number, default: 0 },
    totalTTC: { type: Number, default: 0 }
  },
  // Detail du calcul
  calculationDetails: [{
    item: String,
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number
  }],
  // Prix transporteur (facture recue)
  carrierInvoice: {
    invoiceNumber: String,
    invoiceDate: Date,
    totalHT: Number,
    tva: Number,
    totalTTC: Number,
    pdfUrl: String,
    pdfBase64: String,
    ocrData: mongoose.Schema.Types.Mixed,
    uploadedAt: Date
  },
  // Ecarts detectes
  discrepancies: [{
    type: {
      type: String,
      enum: ['price_global', 'distance', 'options', 'palettes', 'waiting_time', 'volume', 'other']
    },
    description: String,
    expectedValue: mongoose.Schema.Types.Mixed,
    actualValue: mongoose.Schema.Types.Mixed,
    difference: Number,
    differencePercent: Number,
    status: { type: String, enum: ['detected', 'justified', 'contested', 'resolved'], default: 'detected' },
    resolution: String,
    resolvedAt: Date,
    resolvedBy: String
  }],
  // Blocages
  blocks: [{
    type: {
      type: String,
      enum: ['missing_documents', 'vigilance', 'pallets', 'late', 'manual']
    },
    reason: String,
    details: mongoose.Schema.Types.Mixed,
    blockedAt: { type: Date, default: Date.now },
    blockedBy: String,
    unlockedAt: Date,
    unlockedBy: String,
    active: { type: Boolean, default: true }
  }],
  // Documents requis
  documents: {
    pod: { present: Boolean, url: String, validatedAt: Date },
    cmr: { present: Boolean, url: String, signaturePresent: Boolean },
    ecmr: { present: Boolean, url: String },
    bl: { present: Boolean, url: String },
    photos: [{ url: String, type: String, uploadedAt: Date }]
  },
  // Validation transporteur
  carrierValidation: {
    status: { type: String, enum: ['pending', 'accepted', 'contested', 'timeout'], default: 'pending' },
    sentAt: Date,
    respondedAt: Date,
    timeoutAt: Date,
    contestReason: String,
    proposedAmount: Number,
    comments: String
  },
  // Facture finale
  finalInvoice: {
    invoiceId: String,
    invoiceNumber: String,
    generatedAt: Date,
    pdfUrl: String,
    pdfBase64: String,
    sentToERP: { type: Boolean, default: false },
    erpExportDate: Date,
    erpReference: String,
    erpSystem: String
  },
  // Archivage
  archive: {
    archivedAt: Date,
    retentionUntil: Date,
    archiveReference: String
  },
  // Audit trail
  auditTrail: [{
    action: String,
    performedBy: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Litige Facturation
const billingDisputeSchema = new mongoose.Schema({
  disputeId: { type: String, required: true, unique: true },
  prefacturationId: { type: String, required: true },
  orderId: String,
  transporterId: String,
  clientId: String,
  // Type et details
  type: {
    type: String,
    enum: ['price', 'distance', 'options', 'waiting_time', 'palettes', 'penalties', 'documents', 'other']
  },
  description: String,
  // Montants
  symphoniaAmount: Number, // Montant calcule SYMPHONI.A
  carrierAmount: Number, // Montant facture transporteur
  difference: Number,
  // Lignes contestees
  contestedItems: [{
    item: String,
    symphoniaValue: mongoose.Schema.Types.Mixed,
    carrierValue: mongoose.Schema.Types.Mixed,
    difference: Number,
    justification: String
  }],
  // Propositions
  proposals: [{
    proposedBy: String, // 'symphonia', 'carrier', 'client'
    amount: Number,
    justification: String,
    documents: [String],
    proposedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
  }],
  // Resolution
  status: {
    type: String,
    enum: ['open', 'pending_carrier', 'pending_client', 'negotiation', 'resolved', 'escalated', 'closed'],
    default: 'open'
  },
  resolution: {
    type: { type: String, enum: ['accepted_symphonia', 'accepted_carrier', 'compromise', 'timeout', 'escalated'] },
    finalAmount: Number,
    description: String,
    resolvedAt: Date,
    resolvedBy: String
  },
  // Timeline
  timeline: [{
    action: String,
    performedBy: String,
    timestamp: { type: Date, default: Date.now },
    details: mongoose.Schema.Types.Mixed
  }],
  // SLA
  slaDeadline: Date,
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Blocage
const billingBlockSchema = new mongoose.Schema({
  blockId: { type: String, required: true, unique: true },
  prefacturationId: String,
  orderId: String,
  transporterId: String,
  clientId: String,
  // Type de blocage
  type: {
    type: String,
    enum: ['missing_documents', 'vigilance', 'pallets', 'late', 'manual'],
    required: true
  },
  // Details selon le type
  reason: { type: String, required: true },
  details: {
    // missing_documents
    missingDocs: [String], // ['BL', 'CMR', 'signature', 'eCMR']
    // vigilance
    expiredDocs: [{
      type: { type: String }, // 'urssaf', 'assurance', 'licence'
      expirationDate: Date
    }],
    // pallets
    palletDebt: Number,
    unrestitutedPallets: Number,
    palletDisputeId: String,
    // late
    delayMinutes: Number,
    expectedETA: Date,
    actualArrival: Date,
    justificationProvided: Boolean
  },
  // Statut
  active: { type: Boolean, default: true },
  blockedAt: { type: Date, default: Date.now },
  blockedBy: String,
  // Deblocage
  unlockedAt: Date,
  unlockedBy: String,
  unlockReason: String,
  // Event declenche
  eventTriggered: String,
  createdAt: { type: Date, default: Date.now }
});

// Schema Export ERP
const erpExportSchema = new mongoose.Schema({
  exportId: { type: String, required: true, unique: true },
  prefacturationId: String,
  invoiceId: String,
  // Configuration ERP
  erpSystem: {
    type: String,
    enum: ['sap', 'oracle', 'sage_x3', 'divalto', 'dynamics_365', 'odoo', 'generic_api'],
    required: true
  },
  erpConfig: {
    endpoint: String,
    apiKey: String,
    companyCode: String,
    costCenter: String
  },
  // Donnees exportees
  exportData: mongoose.Schema.Types.Mixed,
  exportFormat: { type: String, enum: ['json', 'xml', 'csv', 'idoc'], default: 'json' },
  // Statut
  status: {
    type: String,
    enum: ['pending', 'sent', 'acknowledged', 'failed', 'retry'],
    default: 'pending'
  },
  // Reponse ERP
  erpResponse: {
    status: Number,
    reference: String,
    message: String,
    receivedAt: Date
  },
  // Retry
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  nextRetry: Date,
  lastError: String,
  // Timestamps
  exportedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Schema Vigilance Transporteur (devoir de vigilance)
const carrierVigilanceSchema = new mongoose.Schema({
  vigilanceId: { type: String, required: true, unique: true },
  transporterId: { type: String, required: true },
  transporterName: String,
  // Documents obligatoires
  documents: {
    urssaf: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      verifiedAt: Date
    },
    assurance: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      coverageAmount: Number,
      verifiedAt: Date
    },
    licenceTransport: {
      present: Boolean,
      documentUrl: String,
      validUntil: Date,
      licenceNumber: String,
      verifiedAt: Date
    },
    kbis: {
      present: Boolean,
      documentUrl: String,
      issuedAt: Date,
      verifiedAt: Date
    }
  },
  // Statut global
  status: {
    type: String,
    enum: ['valid', 'expiring_soon', 'expired', 'incomplete'],
    default: 'incomplete'
  },
  // Alertes
  alerts: [{
    type: { type: String },
    message: String,
    expirationDate: Date,
    createdAt: { type: Date, default: Date.now }
  }],
  lastChecked: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Webhook/Events
const billingWebhookSchema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  name: String,
  url: { type: String, required: true },
  events: [{
    type: String,
    enum: [
      'prefacturation.generated',
      'prefacturation.discrepancy.detected',
      'prefacturation.carrier.validation.update',
      'billing.blocked.missing.documents',
      'billing.blocked.vigilance',
      'billing.blocked.pallets',
      'billing.blocked.late',
      'billing.unblocked',
      'billing.finalized',
      'billing.exported',
      'dispute.opened',
      'dispute.resolved'
    ]
  }],
  secret: String,
  active: { type: Boolean, default: true },
  failureCount: { type: Number, default: 0 },
  lastTriggeredAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Creation des modeles
const TariffGrid = mongoose.model('BillingTariffGrid', tariffGridSchema);
const Prefacturation = mongoose.model('Prefacturation', prefacturationSchema);
const BillingDispute = mongoose.model('BillingDispute', billingDisputeSchema);
const BillingBlock = mongoose.model('BillingBlock', billingBlockSchema);
const ERPExport = mongoose.model('ERPExport', erpExportSchema);
const CarrierVigilance = mongoose.model('CarrierVigilance', carrierVigilanceSchema);
const BillingWebhook = mongoose.model('BillingWebhook', billingWebhookSchema);

// ===========================================
// MIDDLEWARE AUTHENTIFICATION
// ===========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// ===========================================
// SYSTEME DE NOTIFICATIONS (Webhooks)
// ===========================================
const sendBillingNotification = async (event, payload, clientIds) => {
  try {
    const webhooks = await BillingWebhook.find({
      clientId: { $in: clientIds },
      events: event,
      active: true,
      failureCount: { $lt: 5 }
    });

    for (const webhook of webhooks) {
      try {
        await axios.post(webhook.url, {
          event,
          timestamp: new Date().toISOString(),
          data: payload
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Event': event,
            'X-Webhook-Signature': webhook.secret ?
              require('crypto').createHmac('sha256', webhook.secret).update(JSON.stringify(payload)).digest('hex') : undefined
          },
          timeout: 10000
        });

        webhook.lastTriggeredAt = new Date();
        webhook.failureCount = 0;
        await webhook.save();
      } catch (error) {
        webhook.failureCount += 1;
        await webhook.save();
        console.error(`Webhook ${webhook.webhookId} failed:`, error.message);
      }
    }
  } catch (error) {
    console.error('Notification error:', error.message);
  }
};

// ===========================================
// BLOC 1: PREFACTURATION AUTOMATIQUE
// ===========================================

/**
 * Calculer le prix base sur la grille tarifaire
 */
const calculateBasePrice = async (orderData, options, tariffGrid) => {
  let details = [];
  let totalHT = 0;

  // 1. Prix de base / distance
  const distance = orderData.distance || 0;
  let basePrice = 0;
  let distancePrice = 0;

  for (const rate of tariffGrid.baseRates) {
    if (distance >= (rate.minKm || 0) && distance <= (rate.maxKm || 99999)) {
      if (rate.fixedPrice) {
        basePrice = rate.fixedPrice;
        details.push({
          item: 'Prix forfaitaire',
          description: `Zone ${rate.zoneFrom} - ${rate.zoneTo}`,
          quantity: 1,
          unitPrice: rate.fixedPrice,
          total: rate.fixedPrice
        });
      } else if (rate.pricePerKm) {
        distancePrice = distance * rate.pricePerKm;
        details.push({
          item: 'Prix kilometrique',
          description: `${distance} km x ${rate.pricePerKm} EUR/km`,
          quantity: distance,
          unitPrice: rate.pricePerKm,
          total: distancePrice
        });
      }
      break;
    }
  }

  totalHT += basePrice + distancePrice;

  // 2. Options et majorations
  let optionsPrice = 0;
  const baseForOptions = basePrice + distancePrice;

  if (options.adr && tariffGrid.options.adr) {
    const adrSurcharge = baseForOptions * (tariffGrid.options.adr / 100);
    optionsPrice += adrSurcharge;
    details.push({
      item: 'Majoration ADR',
      description: `${tariffGrid.options.adr}% sur prix de base`,
      quantity: 1,
      unitPrice: adrSurcharge,
      total: adrSurcharge
    });
  }

  if (options.hayon && tariffGrid.options.hayon) {
    optionsPrice += tariffGrid.options.hayon;
    details.push({
      item: 'Option Hayon',
      description: 'Hayon elevateur',
      quantity: 1,
      unitPrice: tariffGrid.options.hayon,
      total: tariffGrid.options.hayon
    });
  }

  if (options.express && tariffGrid.options.express) {
    const expressSurcharge = baseForOptions * (tariffGrid.options.express / 100);
    optionsPrice += expressSurcharge;
    details.push({
      item: 'Livraison Express',
      description: `${tariffGrid.options.express}% sur prix de base`,
      quantity: 1,
      unitPrice: expressSurcharge,
      total: expressSurcharge
    });
  }

  if (options.frigo && tariffGrid.options.frigo) {
    const frigoSurcharge = baseForOptions * (tariffGrid.options.frigo / 100);
    optionsPrice += frigoSurcharge;
    details.push({
      item: 'Transport Frigorifique',
      description: `${tariffGrid.options.frigo}% sur prix de base`,
      quantity: 1,
      unitPrice: frigoSurcharge,
      total: frigoSurcharge
    });
  }

  if (options.palettesEchange > 0 && tariffGrid.options.palettesEchange) {
    const palettesPrice = options.palettesEchange * tariffGrid.options.palettesEchange;
    optionsPrice += palettesPrice;
    details.push({
      item: 'Echange Palettes',
      description: `${options.palettesEchange} palettes x ${tariffGrid.options.palettesEchange} EUR`,
      quantity: options.palettesEchange,
      unitPrice: tariffGrid.options.palettesEchange,
      total: palettesPrice
    });
  }

  if (options.weekend && tariffGrid.options.weekend) {
    const weekendSurcharge = baseForOptions * (tariffGrid.options.weekend / 100);
    optionsPrice += weekendSurcharge;
    details.push({
      item: 'Majoration Week-end',
      description: `${tariffGrid.options.weekend}% sur prix de base`,
      quantity: 1,
      unitPrice: weekendSurcharge,
      total: weekendSurcharge
    });
  }

  if (options.nuit && tariffGrid.options.nuit) {
    const nightSurcharge = baseForOptions * (tariffGrid.options.nuit / 100);
    optionsPrice += nightSurcharge;
    details.push({
      item: 'Majoration Nuit',
      description: `${tariffGrid.options.nuit}% sur prix de base`,
      quantity: 1,
      unitPrice: nightSurcharge,
      total: nightSurcharge
    });
  }

  totalHT += optionsPrice;

  return {
    basePrice,
    distancePrice,
    optionsPrice,
    totalHT,
    details
  };
};

/**
 * Calculer le temps d'attente facturable
 */
const calculateWaitingTimePrice = (waitingTime, tariffGrid) => {
  const freeMinutes = tariffGrid.waitingTime?.freeMinutes || 30;
  const pricePerHour = tariffGrid.waitingTime?.pricePerHour || 45;

  const totalWaiting = waitingTime.total || 0;
  const billableMinutes = Math.max(0, totalWaiting - freeMinutes);
  const billableHours = billableMinutes / 60;
  const price = Math.ceil(billableHours * pricePerHour);

  return {
    totalMinutes: totalWaiting,
    freeMinutes,
    billableMinutes,
    pricePerHour,
    total: price,
    detail: billableMinutes > 0 ? {
      item: 'Temps d\'attente',
      description: `${billableMinutes} min au-dela des ${freeMinutes} min gratuites`,
      quantity: Math.ceil(billableHours * 10) / 10,
      unitPrice: pricePerHour,
      total: price
    } : null
  };
};

/**
 * Generer une prefacturation automatiquement
 */
const generatePrefacturation = async (orderId, orderData, transporterId, clientId, options = {}) => {
  // Trouver la grille tarifaire applicable
  const tariffGrid = await TariffGrid.findOne({
    transporterId,
    clientId,
    active: true,
    validFrom: { $lte: new Date() },
    $or: [
      { validTo: { $gte: new Date() } },
      { validTo: null }
    ]
  });

  if (!tariffGrid) {
    throw new Error('Aucune grille tarifaire active trouvee pour ce transporteur/client');
  }

  // Calculer le prix de base
  const baseCalc = await calculateBasePrice(orderData, options, tariffGrid);

  // Calculer le temps d'attente
  const waitingCalc = calculateWaitingTimePrice(options.waitingTime || {}, tariffGrid);

  // Calculer les penalites
  let penalties = 0;
  let penaltyDetails = [];
  if (options.incidents) {
    for (const incident of options.incidents) {
      let penalty = 0;
      if (incident.type === 'late' && tariffGrid.penalties.lateDeliveryPerHour) {
        penalty = (incident.delayHours || 1) * tariffGrid.penalties.lateDeliveryPerHour;
      } else if (incident.type === 'missing_document' && tariffGrid.penalties.missingDocument) {
        penalty = tariffGrid.penalties.missingDocument;
      } else if (incident.type === 'damaged' && tariffGrid.penalties.damagedGoods) {
        penalty = tariffGrid.penalties.damagedGoods;
      }
      if (penalty > 0) {
        penalties += penalty;
        penaltyDetails.push({
          item: `Penalite: ${incident.type}`,
          description: incident.description || incident.type,
          quantity: 1,
          unitPrice: penalty,
          total: penalty
        });
      }
    }
  }

  // Calculer totaux
  const totalHT = baseCalc.totalHT + (waitingCalc.total || 0) - penalties;
  const tva = Math.round(totalHT * TVA_RATE * 100) / 100;
  const totalTTC = Math.round((totalHT + tva) * 100) / 100;

  // Assembler les details
  let allDetails = [...baseCalc.details];
  if (waitingCalc.detail) allDetails.push(waitingCalc.detail);
  allDetails = [...allDetails, ...penaltyDetails];

  // Creer la prefacturation
  const prefacturation = new Prefacturation({
    prefacturationId: `PREF-${uuidv4().slice(0, 12).toUpperCase()}`,
    orderId,
    transporterId,
    transporterName: options.transporterName,
    clientId,
    clientName: options.clientName,
    status: 'generated',
    orderData,
    cargo: options.cargo || {},
    options,
    waitingTime: {
      ...options.waitingTime,
      billable: waitingCalc.billableMinutes
    },
    incidents: options.incidents || [],
    calculation: {
      gridId: tariffGrid.gridId,
      basePrice: baseCalc.basePrice,
      distancePrice: baseCalc.distancePrice,
      optionsPrice: baseCalc.optionsPrice,
      waitingTimePrice: waitingCalc.total || 0,
      palettesPrice: options.palettesEchange ? options.palettesEchange * (tariffGrid.options.palettesEchange || 0) : 0,
      penalties,
      totalHT: Math.round(totalHT * 100) / 100,
      tva,
      totalTTC
    },
    calculationDetails: allDetails,
    carrierValidation: {
      status: 'pending',
      timeoutAt: new Date(Date.now() + VALIDATION_TIMEOUT_DAYS * 24 * 60 * 60 * 1000)
    },
    auditTrail: [{
      action: 'PREFACTURATION_GENERATED',
      performedBy: 'system',
      timestamp: new Date(),
      details: { orderId, totalHT, totalTTC }
    }]
  });

  await prefacturation.save();

  // Envoyer notification
  await sendBillingNotification('prefacturation.generated', {
    prefacturationId: prefacturation.prefacturationId,
    orderId,
    transporterId,
    clientId,
    totalHT,
    totalTTC
  }, [clientId, transporterId]);

  return prefacturation;
};

// ===========================================
// BLOC 2: DETECTION D'ECARTS
// ===========================================

/**
 * Detecter les ecarts entre prefacturation et facture transporteur
 */
const detectDiscrepancies = async (prefacturation, carrierInvoiceData) => {
  const discrepancies = [];
  const tolerance = 0.02; // 2% de tolerance

  // 1. Ecart de prix global
  const expectedTotal = prefacturation.calculation.totalHT;
  const carrierTotal = carrierInvoiceData.totalHT;
  const priceDiff = carrierTotal - expectedTotal;
  const priceDiffPercent = Math.abs(priceDiff / expectedTotal);

  if (priceDiffPercent > tolerance) {
    discrepancies.push({
      type: 'price_global',
      description: `Ecart de prix global: ${carrierTotal.toFixed(2)} EUR facture vs ${expectedTotal.toFixed(2)} EUR calcule`,
      expectedValue: expectedTotal,
      actualValue: carrierTotal,
      difference: priceDiff,
      differencePercent: Math.round(priceDiffPercent * 100 * 100) / 100,
      status: 'detected'
    });
  }

  // 2. Ecart kilometrique (si disponible dans OCR)
  if (carrierInvoiceData.distance && prefacturation.orderData.distance) {
    const kmDiff = carrierInvoiceData.distance - prefacturation.orderData.distance;
    const kmDiffPercent = Math.abs(kmDiff / prefacturation.orderData.distance);

    if (kmDiffPercent > tolerance) {
      discrepancies.push({
        type: 'distance',
        description: `Ecart kilometrique: ${carrierInvoiceData.distance} km factures vs ${prefacturation.orderData.distance} km reels`,
        expectedValue: prefacturation.orderData.distance,
        actualValue: carrierInvoiceData.distance,
        difference: kmDiff,
        differencePercent: Math.round(kmDiffPercent * 100 * 100) / 100,
        status: 'detected'
      });
    }
  }

  // 3. Ecart options (ADR facture sans marchandise ADR, etc.)
  if (carrierInvoiceData.options) {
    for (const [option, billed] of Object.entries(carrierInvoiceData.options)) {
      const expected = prefacturation.options[option];
      if (billed && !expected) {
        discrepancies.push({
          type: 'options',
          description: `Option ${option} facturee mais non declaree`,
          expectedValue: false,
          actualValue: true,
          difference: null,
          status: 'detected'
        });
      }
    }
  }

  // 4. Ecart palettes
  if (carrierInvoiceData.palettes !== undefined && prefacturation.options.palettesEchange !== undefined) {
    const paletteDiff = carrierInvoiceData.palettes - prefacturation.options.palettesEchange;
    if (paletteDiff !== 0) {
      discrepancies.push({
        type: 'palettes',
        description: `Ecart palettes: ${carrierInvoiceData.palettes} facturees vs ${prefacturation.options.palettesEchange} enregistrees`,
        expectedValue: prefacturation.options.palettesEchange,
        actualValue: carrierInvoiceData.palettes,
        difference: paletteDiff,
        status: 'detected'
      });
    }
  }

  // 5. Ecart temps d'attente
  if (carrierInvoiceData.waitingTimeMinutes !== undefined && prefacturation.waitingTime.billable !== undefined) {
    const waitDiff = carrierInvoiceData.waitingTimeMinutes - prefacturation.waitingTime.billable;
    if (Math.abs(waitDiff) > 15) { // 15 min de tolerance
      discrepancies.push({
        type: 'waiting_time',
        description: `Ecart temps d'attente: ${carrierInvoiceData.waitingTimeMinutes} min facturees vs ${prefacturation.waitingTime.billable} min mesurees`,
        expectedValue: prefacturation.waitingTime.billable,
        actualValue: carrierInvoiceData.waitingTimeMinutes,
        difference: waitDiff,
        status: 'detected'
      });
    }
  }

  return discrepancies;
};

// ===========================================
// BLOC 3: VALIDATION TRANSPORTEUR
// ===========================================

/**
 * Simuler OCR sur facture PDF (en prod: Tesseract.js ou API externe)
 */
const performOCR = async (pdfBuffer) => {
  // En production, utiliser Tesseract.js ou une API OCR
  // Pour la demo, on retourne des donnees simulees
  return {
    invoiceNumber: `INV-${Date.now()}`,
    invoiceDate: new Date(),
    totalHT: 0,
    tva: 0,
    totalTTC: 0,
    distance: null,
    palettes: null,
    waitingTimeMinutes: null,
    options: {},
    rawText: '',
    confidence: 0.85
  };
};

/**
 * Traiter la facture transporteur uploadee
 */
const processCarrierInvoice = async (prefacturationId, invoiceData, pdfBuffer = null) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  // OCR si PDF fourni
  let ocrData = null;
  if (pdfBuffer) {
    ocrData = await performOCR(pdfBuffer);
    // Merger avec les donnees manuelles
    invoiceData = {
      ...ocrData,
      ...invoiceData // Les donnees manuelles priment
    };
  }

  // Enregistrer la facture transporteur
  prefacturation.carrierInvoice = {
    invoiceNumber: invoiceData.invoiceNumber,
    invoiceDate: invoiceData.invoiceDate || new Date(),
    totalHT: invoiceData.totalHT,
    tva: invoiceData.tva || invoiceData.totalHT * TVA_RATE,
    totalTTC: invoiceData.totalTTC || invoiceData.totalHT * (1 + TVA_RATE),
    pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
    ocrData,
    uploadedAt: new Date()
  };

  // Detecter les ecarts
  const discrepancies = await detectDiscrepancies(prefacturation, invoiceData);
  prefacturation.discrepancies = discrepancies;

  // Mettre a jour le statut
  if (discrepancies.length > 0) {
    prefacturation.status = 'discrepancy_detected';

    // Envoyer notification ecart
    await sendBillingNotification('prefacturation.discrepancy.detected', {
      prefacturationId,
      discrepanciesCount: discrepancies.length,
      discrepancies: discrepancies.map(d => ({
        type: d.type,
        difference: d.difference,
        differencePercent: d.differencePercent
      }))
    }, [prefacturation.clientId, prefacturation.transporterId]);
  } else {
    prefacturation.status = 'validated';
  }

  prefacturation.auditTrail.push({
    action: 'CARRIER_INVOICE_PROCESSED',
    performedBy: 'system',
    timestamp: new Date(),
    details: {
      invoiceNumber: invoiceData.invoiceNumber,
      totalHT: invoiceData.totalHT,
      discrepanciesFound: discrepancies.length
    }
  });

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  return prefacturation;
};

// ===========================================
// BLOC 4: BLOCAGES AUTOMATIQUES
// ===========================================

/**
 * Verifier les blocages potentiels
 */
const checkBlocks = async (prefacturation) => {
  const blocks = [];

  // 1. Blocage documents manquants
  const docs = prefacturation.documents || {};
  const missingDocs = [];
  if (!docs.pod?.present) missingDocs.push('POD');
  if (!docs.cmr?.present) missingDocs.push('CMR');
  if (!docs.cmr?.signaturePresent) missingDocs.push('Signature CMR');
  if (!docs.ecmr?.present) missingDocs.push('eCMR');

  if (missingDocs.length > 0) {
    blocks.push({
      type: 'missing_documents',
      reason: `Documents manquants: ${missingDocs.join(', ')}`,
      details: { missingDocs },
      eventTriggered: 'billing.blocked.missing.documents'
    });
  }

  // 2. Blocage devoir de vigilance
  const vigilance = await CarrierVigilance.findOne({
    transporterId: prefacturation.transporterId
  });

  if (vigilance) {
    const expiredDocs = [];
    const now = new Date();

    if (vigilance.documents.urssaf?.validUntil && vigilance.documents.urssaf.validUntil < now) {
      expiredDocs.push({ type: 'urssaf', expirationDate: vigilance.documents.urssaf.validUntil });
    }
    if (vigilance.documents.assurance?.validUntil && vigilance.documents.assurance.validUntil < now) {
      expiredDocs.push({ type: 'assurance', expirationDate: vigilance.documents.assurance.validUntil });
    }
    if (vigilance.documents.licenceTransport?.validUntil && vigilance.documents.licenceTransport.validUntil < now) {
      expiredDocs.push({ type: 'licence', expirationDate: vigilance.documents.licenceTransport.validUntil });
    }

    if (expiredDocs.length > 0) {
      blocks.push({
        type: 'vigilance',
        reason: `Documents transporteur expires: ${expiredDocs.map(d => d.type).join(', ')}`,
        details: { expiredDocs },
        eventTriggered: 'billing.blocked.vigilance'
      });
    }
  }

  // 3. Blocage palettes (integration module palettes)
  // En prod, appeler l'API palettes-circular-api
  // Pour la demo, on simule
  if (prefacturation.options.palettesEchange > 0) {
    // Simuler verification dette palettes
    const palletDebt = 0; // En prod: await checkPalletDebt(prefacturation.transporterId)
    if (palletDebt > 0) {
      blocks.push({
        type: 'pallets',
        reason: `Dette palette non regularisee: ${palletDebt} palettes`,
        details: { palletDebt },
        eventTriggered: 'billing.blocked.pallets'
      });
    }
  }

  return blocks;
};

/**
 * Appliquer les blocages sur une prefacturation
 */
const applyBlocks = async (prefacturationId) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  const detectedBlocks = await checkBlocks(prefacturation);

  for (const blockData of detectedBlocks) {
    // Creer le blocage
    const block = new BillingBlock({
      blockId: `BLK-${uuidv4().slice(0, 8).toUpperCase()}`,
      prefacturationId,
      orderId: prefacturation.orderId,
      transporterId: prefacturation.transporterId,
      clientId: prefacturation.clientId,
      ...blockData,
      blockedBy: 'system'
    });
    await block.save();

    // Ajouter au registre de la prefacturation
    prefacturation.blocks.push({
      type: blockData.type,
      reason: blockData.reason,
      details: blockData.details,
      blockedAt: new Date(),
      blockedBy: 'system',
      active: true
    });

    // Envoyer notification
    await sendBillingNotification(blockData.eventTriggered, {
      prefacturationId,
      blockId: block.blockId,
      type: blockData.type,
      reason: blockData.reason
    }, [prefacturation.clientId, prefacturation.transporterId]);
  }

  if (detectedBlocks.length > 0) {
    prefacturation.status = 'blocked';
    prefacturation.auditTrail.push({
      action: 'PREFACTURATION_BLOCKED',
      performedBy: 'system',
      timestamp: new Date(),
      details: { blocksCount: detectedBlocks.length, types: detectedBlocks.map(b => b.type) }
    });
  }

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  return { prefacturation, blocks: detectedBlocks };
};

// ===========================================
// BLOC 5: FACTURE FINALE & EXPORT ERP
// ===========================================

/**
 * Generer la facture PDF finale
 */
const generateFinalInvoicePDF = async (prefacturation) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // En-tete
    doc.fontSize(20).text('FACTURE TRANSPORT', { align: 'center' });
    doc.moveDown();

    // Infos facture
    const invoiceNumber = `FAC-${Date.now()}-${prefacturation.prefacturationId.slice(-6)}`;
    doc.fontSize(12);
    doc.text(`Facture N°: ${invoiceNumber}`);
    doc.text(`Date: ${moment().format('DD/MM/YYYY')}`);
    doc.text(`Commande: ${prefacturation.orderId}`);
    doc.moveDown();

    // Client et transporteur
    doc.text(`Client: ${prefacturation.clientName || prefacturation.clientId}`);
    doc.text(`Transporteur: ${prefacturation.transporterName || prefacturation.transporterId}`);
    doc.moveDown();

    // Details de la course
    doc.fontSize(14).text('Details de la course', { underline: true });
    doc.fontSize(10);
    doc.text(`Date livraison: ${moment(prefacturation.orderData.deliveryDate).format('DD/MM/YYYY')}`);
    doc.text(`Distance: ${prefacturation.orderData.distance} km`);
    doc.text(`Vehicule: ${prefacturation.orderData.vehiclePlate || 'N/A'}`);
    doc.moveDown();

    // Lignes de facturation
    doc.fontSize(14).text('Detail facturation', { underline: true });
    doc.fontSize(10);

    let y = doc.y + 10;
    doc.text('Description', 50, y);
    doc.text('Qte', 300, y);
    doc.text('P.U.', 350, y);
    doc.text('Total', 450, y);

    y += 15;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;

    for (const detail of prefacturation.calculationDetails) {
      doc.text(detail.item, 50, y, { width: 240 });
      doc.text(String(detail.quantity || 1), 300, y);
      doc.text(`${detail.unitPrice?.toFixed(2) || '0.00'} EUR`, 350, y);
      doc.text(`${detail.total?.toFixed(2) || '0.00'} EUR`, 450, y);
      y += 20;
    }

    y += 10;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 15;

    // Totaux
    doc.fontSize(12);
    doc.text(`Total HT:`, 350, y);
    doc.text(`${prefacturation.calculation.totalHT.toFixed(2)} EUR`, 450, y);
    y += 20;
    doc.text(`TVA (20%):`, 350, y);
    doc.text(`${prefacturation.calculation.tva.toFixed(2)} EUR`, 450, y);
    y += 20;
    doc.fontSize(14).fillColor('blue');
    doc.text(`Total TTC:`, 350, y);
    doc.text(`${prefacturation.calculation.totalTTC.toFixed(2)} EUR`, 450, y);

    // Footer
    doc.fillColor('black').fontSize(8);
    doc.text('Document genere par SYMPHONI.A - RT Technologie', 50, 750, { align: 'center' });

    doc.end();
  });
};

/**
 * Finaliser et generer la facture
 */
const finalizeBilling = async (prefacturationId) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation) {
    throw new Error('Prefacturation non trouvee');
  }

  // Verifier qu'il n'y a pas de blocages actifs
  const activeBlocks = prefacturation.blocks.filter(b => b.active);
  if (activeBlocks.length > 0) {
    throw new Error(`Facturation bloquee: ${activeBlocks.map(b => b.reason).join(', ')}`);
  }

  // Generer le PDF
  const pdfBuffer = await generateFinalInvoicePDF(prefacturation);
  const invoiceNumber = `FAC-${Date.now()}-${prefacturation.prefacturationId.slice(-6)}`;

  // Mettre a jour la prefacturation
  prefacturation.finalInvoice = {
    invoiceId: `INV-${uuidv4().slice(0, 8).toUpperCase()}`,
    invoiceNumber,
    generatedAt: new Date(),
    pdfBase64: pdfBuffer.toString('base64'),
    sentToERP: false
  };

  prefacturation.status = 'finalized';
  prefacturation.auditTrail.push({
    action: 'INVOICE_FINALIZED',
    performedBy: 'system',
    timestamp: new Date(),
    details: { invoiceNumber }
  });

  prefacturation.updatedAt = new Date();
  await prefacturation.save();

  // Notification
  await sendBillingNotification('billing.finalized', {
    prefacturationId,
    invoiceNumber,
    totalTTC: prefacturation.calculation.totalTTC
  }, [prefacturation.clientId]);

  return prefacturation;
};

/**
 * Exporter vers ERP
 */
const exportToERP = async (prefacturationId, erpConfig) => {
  const prefacturation = await Prefacturation.findOne({ prefacturationId });
  if (!prefacturation || !prefacturation.finalInvoice) {
    throw new Error('Facture non trouvee ou non finalisee');
  }

  // Preparer les donnees d'export selon le format ERP
  let exportData;
  const erpSystem = erpConfig.system || 'generic_api';

  switch (erpSystem) {
    case 'sap':
      exportData = {
        BUKRS: erpConfig.companyCode || '1000',
        BELNR: prefacturation.finalInvoice.invoiceNumber,
        BLDAT: moment(prefacturation.finalInvoice.generatedAt).format('YYYYMMDD'),
        LIFNR: prefacturation.transporterId,
        WRBTR: prefacturation.calculation.totalTTC,
        WAERS: 'EUR',
        KOSTL: erpConfig.costCenter || '',
        SGTXT: `Transport ${prefacturation.orderId}`,
        lines: prefacturation.calculationDetails.map(d => ({
          MATNR: d.item,
          MENGE: d.quantity,
          NETPR: d.unitPrice,
          NETWR: d.total
        }))
      };
      break;

    case 'odoo':
      exportData = {
        model: 'account.move',
        method: 'create',
        args: [{
          move_type: 'in_invoice',
          partner_id: prefacturation.transporterId,
          invoice_date: moment(prefacturation.finalInvoice.generatedAt).format('YYYY-MM-DD'),
          ref: prefacturation.orderId,
          invoice_line_ids: prefacturation.calculationDetails.map(d => [0, 0, {
            name: d.item,
            quantity: d.quantity,
            price_unit: d.unitPrice
          }])
        }]
      };
      break;

    default: // generic_api / JSON
      exportData = {
        invoice: {
          number: prefacturation.finalInvoice.invoiceNumber,
          date: prefacturation.finalInvoice.generatedAt,
          supplierId: prefacturation.transporterId,
          supplierName: prefacturation.transporterName,
          customerId: prefacturation.clientId,
          customerName: prefacturation.clientName,
          orderReference: prefacturation.orderId,
          currency: 'EUR',
          totalHT: prefacturation.calculation.totalHT,
          tva: prefacturation.calculation.tva,
          totalTTC: prefacturation.calculation.totalTTC,
          lines: prefacturation.calculationDetails
        },
        metadata: {
          source: 'SYMPHONIA',
          version: '1.0.0',
          exportedAt: new Date().toISOString()
        }
      };
  }

  // Creer l'enregistrement d'export
  const erpExport = new ERPExport({
    exportId: `EXP-${uuidv4().slice(0, 8).toUpperCase()}`,
    prefacturationId,
    invoiceId: prefacturation.finalInvoice.invoiceId,
    erpSystem,
    erpConfig: {
      endpoint: erpConfig.endpoint,
      companyCode: erpConfig.companyCode,
      costCenter: erpConfig.costCenter
    },
    exportData,
    exportFormat: erpSystem === 'sap' ? 'idoc' : 'json',
    status: 'pending'
  });

  // Tenter l'envoi si endpoint configure
  if (erpConfig.endpoint) {
    try {
      const response = await axios.post(erpConfig.endpoint, exportData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': erpConfig.apiKey ? `Bearer ${erpConfig.apiKey}` : undefined
        },
        timeout: 30000
      });

      erpExport.status = 'acknowledged';
      erpExport.erpResponse = {
        status: response.status,
        reference: response.data?.reference || response.data?.id,
        message: response.data?.message || 'OK',
        receivedAt: new Date()
      };
      erpExport.exportedAt = new Date();

      // Mettre a jour prefacturation
      prefacturation.finalInvoice.sentToERP = true;
      prefacturation.finalInvoice.erpExportDate = new Date();
      prefacturation.finalInvoice.erpReference = response.data?.reference;
      prefacturation.finalInvoice.erpSystem = erpSystem;
      prefacturation.status = 'exported';

    } catch (error) {
      erpExport.status = 'failed';
      erpExport.lastError = error.message;
      erpExport.attempts = 1;
      erpExport.nextRetry = new Date(Date.now() + 60 * 60 * 1000); // Retry dans 1h
    }
  } else {
    // Pas d'endpoint, juste generer les donnees
    erpExport.status = 'sent';
    erpExport.exportedAt = new Date();
  }

  await erpExport.save();

  prefacturation.auditTrail.push({
    action: 'ERP_EXPORT',
    performedBy: 'system',
    timestamp: new Date(),
    details: { exportId: erpExport.exportId, erpSystem, status: erpExport.status }
  });
  await prefacturation.save();

  // Notification
  await sendBillingNotification('billing.exported', {
    prefacturationId,
    exportId: erpExport.exportId,
    erpSystem,
    status: erpExport.status
  }, [prefacturation.clientId]);

  return { erpExport, exportData };
};

// ===========================================
// CRON JOBS
// ===========================================

const setupCronJobs = () => {
  // Timeout validation transporteur (tous les jours a 8h)
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Verification timeouts validation transporteur...');

    try {
      const timedOut = await Prefacturation.find({
        'carrierValidation.status': 'pending',
        'carrierValidation.timeoutAt': { $lt: new Date() }
      });

      for (const pref of timedOut) {
        pref.carrierValidation.status = 'timeout';
        pref.status = 'conflict_closed';
        pref.auditTrail.push({
          action: 'CARRIER_VALIDATION_TIMEOUT',
          performedBy: 'system',
          timestamp: new Date(),
          details: { message: 'Application automatique de la prefacturation SYMPHONI.A' }
        });
        await pref.save();

        console.log(`[CRON] Timeout: ${pref.prefacturationId}`);
      }

      console.log(`[CRON] ${timedOut.length} prefacturations en timeout traitees`);
    } catch (error) {
      console.error('[CRON] Erreur timeout:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  // Archivage (le 1er de chaque mois)
  cron.schedule('0 2 1 * *', async () => {
    console.log('[CRON] Archivage des factures anciennes...');

    try {
      const archiveDate = new Date();
      archiveDate.setFullYear(archiveDate.getFullYear() - ARCHIVE_RETENTION_YEARS);

      const toArchive = await Prefacturation.find({
        status: 'exported',
        'archive.archivedAt': null,
        'finalInvoice.generatedAt': { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // > 30 jours
      });

      for (const pref of toArchive) {
        pref.archive = {
          archivedAt: new Date(),
          retentionUntil: new Date(Date.now() + ARCHIVE_RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000),
          archiveReference: `ARCH-${pref.prefacturationId}-${Date.now()}`
        };
        pref.status = 'archived';
        await pref.save();
      }

      console.log(`[CRON] ${toArchive.length} factures archivees`);
    } catch (error) {
      console.error('[CRON] Erreur archivage:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  console.log('[CRON] Taches planifiees configurees');
};

// ===========================================
// ROUTES API - HEALTH CHECK
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'billing-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/billing/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Module Prefacturation & Facturation Transport',
    version: '1.0.0',
    features: [
      'prefacturation-automatique',
      'detection-ecarts',
      'validation-transporteur',
      'blocages-automatiques',
      'export-erp',
      'archivage-10-ans'
    ]
  });
});

// ===========================================
// ROUTES API - GRILLES TARIFAIRES
// ===========================================

app.post('/api/billing/tariffs', authenticateToken, async (req, res) => {
  try {
    const tariff = new TariffGrid({
      gridId: `GRID-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body
    });
    await tariff.save();
    res.status(201).json({ success: true, data: tariff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/tariffs', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, active } = req.query;
    const filter = {};
    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (active !== undefined) filter.active = active === 'true';

    const tariffs = await TariffGrid.find(filter);
    res.json({ success: true, data: tariffs, count: tariffs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/tariffs/:gridId', authenticateToken, async (req, res) => {
  try {
    const tariff = await TariffGrid.findOne({ gridId: req.params.gridId });
    if (!tariff) {
      return res.status(404).json({ success: false, error: 'Grille tarifaire non trouvee' });
    }
    res.json({ success: true, data: tariff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - PREFACTURATION
// ===========================================

// Generer une prefacturation
app.post('/api/billing/prefacturation/generate', authenticateToken, async (req, res) => {
  try {
    const { orderId, orderData, transporterId, clientId, options } = req.body;

    if (!orderId || !transporterId || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'orderId, transporterId et clientId requis'
      });
    }

    const prefacturation = await generatePrefacturation(
      orderId,
      orderData || {},
      transporterId,
      clientId,
      options || {}
    );

    res.status(201).json({
      success: true,
      data: prefacturation,
      message: 'Prefacturation generee avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir une prefacturation
app.get('/api/billing/prefacturation/:id', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({
      $or: [
        { prefacturationId: req.params.id },
        { orderId: req.params.id }
      ]
    });

    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    res.json({ success: true, data: prefacturation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les prefacturations
app.get('/api/billing/prefacturations', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, status, startDate, endDate, limit = 50 } = req.query;
    const filter = {};

    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const prefacturations = await Prefacturation.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: prefacturations, count: prefacturations.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - FACTURES TRANSPORTEUR
// ===========================================

// Upload facture transporteur
app.post('/api/billing/invoice/upload', authenticateToken, upload.single('invoice'), async (req, res) => {
  try {
    const { prefacturationId, invoiceNumber, totalHT, tva, totalTTC, distance, palettes, waitingTimeMinutes } = req.body;

    if (!prefacturationId) {
      return res.status(400).json({ success: false, error: 'prefacturationId requis' });
    }

    const invoiceData = {
      invoiceNumber,
      totalHT: parseFloat(totalHT) || 0,
      tva: parseFloat(tva),
      totalTTC: parseFloat(totalTTC),
      distance: distance ? parseFloat(distance) : null,
      palettes: palettes ? parseInt(palettes) : null,
      waitingTimeMinutes: waitingTimeMinutes ? parseInt(waitingTimeMinutes) : null
    };

    const prefacturation = await processCarrierInvoice(
      prefacturationId,
      invoiceData,
      req.file?.buffer
    );

    res.json({
      success: true,
      data: prefacturation,
      message: prefacturation.discrepancies.length > 0
        ? `Facture traitee avec ${prefacturation.discrepancies.length} ecart(s) detecte(s)`
        : 'Facture traitee et validee'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Statut validation
app.get('/api/billing/invoice/status', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, transporterId } = req.query;
    const filter = {};

    if (prefacturationId) filter.prefacturationId = prefacturationId;
    if (transporterId) filter.transporterId = transporterId;

    const prefacturations = await Prefacturation.find(filter)
      .select('prefacturationId orderId status carrierValidation carrierInvoice discrepancies')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: prefacturations, count: prefacturations.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - ECARTS
// ===========================================

// Details d'un ecart
app.get('/api/billing/discrepancy/:id', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({ prefacturationId: req.params.id });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    res.json({
      success: true,
      data: {
        prefacturationId: prefacturation.prefacturationId,
        orderId: prefacturation.orderId,
        symphoniaAmount: prefacturation.calculation.totalHT,
        carrierAmount: prefacturation.carrierInvoice?.totalHT,
        discrepancies: prefacturation.discrepancies
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resoudre un ecart
app.post('/api/billing/discrepancy/resolve', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, discrepancyIndex, resolution, resolvedAmount } = req.body;

    const prefacturation = await Prefacturation.findOne({ prefacturationId });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    if (discrepancyIndex !== undefined && prefacturation.discrepancies[discrepancyIndex]) {
      prefacturation.discrepancies[discrepancyIndex].status = 'resolved';
      prefacturation.discrepancies[discrepancyIndex].resolution = resolution;
      prefacturation.discrepancies[discrepancyIndex].resolvedAt = new Date();
      prefacturation.discrepancies[discrepancyIndex].resolvedBy = req.user?.userId;
    }

    // Verifier si tous les ecarts sont resolus
    const unresolvedCount = prefacturation.discrepancies.filter(d => d.status !== 'resolved').length;
    if (unresolvedCount === 0) {
      prefacturation.status = 'validated';
    }

    if (resolvedAmount !== undefined) {
      prefacturation.calculation.totalHT = resolvedAmount;
      prefacturation.calculation.tva = Math.round(resolvedAmount * TVA_RATE * 100) / 100;
      prefacturation.calculation.totalTTC = Math.round(resolvedAmount * (1 + TVA_RATE) * 100) / 100;
    }

    prefacturation.auditTrail.push({
      action: 'DISCREPANCY_RESOLVED',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { discrepancyIndex, resolution, resolvedAmount }
    });

    prefacturation.updatedAt = new Date();
    await prefacturation.save();

    res.json({
      success: true,
      data: prefacturation,
      message: 'Ecart resolu'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - BLOCAGES
// ===========================================

// Verifier et appliquer blocages
app.post('/api/billing/check-blocks', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId } = req.body;
    const result = await applyBlocks(prefacturationId);

    res.json({
      success: true,
      data: result,
      message: result.blocks.length > 0
        ? `${result.blocks.length} blocage(s) applique(s)`
        : 'Aucun blocage detecte'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Blocage manuel
app.post('/api/billing/block', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, type, reason, details } = req.body;

    const prefacturation = await Prefacturation.findOne({ prefacturationId });
    if (!prefacturation) {
      return res.status(404).json({ success: false, error: 'Prefacturation non trouvee' });
    }

    const block = new BillingBlock({
      blockId: `BLK-${uuidv4().slice(0, 8).toUpperCase()}`,
      prefacturationId,
      orderId: prefacturation.orderId,
      transporterId: prefacturation.transporterId,
      clientId: prefacturation.clientId,
      type: type || 'manual',
      reason,
      details,
      blockedBy: req.user?.userId || 'manual'
    });
    await block.save();

    prefacturation.blocks.push({
      type: type || 'manual',
      reason,
      details,
      blockedAt: new Date(),
      blockedBy: req.user?.userId,
      active: true
    });
    prefacturation.status = 'blocked';
    prefacturation.updatedAt = new Date();
    await prefacturation.save();

    res.json({
      success: true,
      data: block,
      message: 'Blocage applique'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lever un blocage
app.post('/api/billing/unblock', authenticateToken, async (req, res) => {
  try {
    const { blockId, prefacturationId, reason } = req.body;

    // Trouver le blocage
    let block;
    if (blockId) {
      block = await BillingBlock.findOne({ blockId });
    }

    if (!block && prefacturationId) {
      block = await BillingBlock.findOne({ prefacturationId, active: true });
    }

    if (!block) {
      return res.status(404).json({ success: false, error: 'Blocage non trouve' });
    }

    block.active = false;
    block.unlockedAt = new Date();
    block.unlockedBy = req.user?.userId;
    block.unlockReason = reason;
    await block.save();

    // Mettre a jour la prefacturation
    const prefacturation = await Prefacturation.findOne({ prefacturationId: block.prefacturationId });
    if (prefacturation) {
      const blockIndex = prefacturation.blocks.findIndex(b => b.blockedAt.getTime() === block.blockedAt.getTime());
      if (blockIndex >= 0) {
        prefacturation.blocks[blockIndex].active = false;
        prefacturation.blocks[blockIndex].unlockedAt = new Date();
        prefacturation.blocks[blockIndex].unlockedBy = req.user?.userId;
      }

      // Verifier s'il reste des blocages actifs
      const activeBlocks = prefacturation.blocks.filter(b => b.active);
      if (activeBlocks.length === 0) {
        prefacturation.status = 'pending_validation';
      }

      prefacturation.updatedAt = new Date();
      await prefacturation.save();

      // Notification
      await sendBillingNotification('billing.unblocked', {
        prefacturationId: prefacturation.prefacturationId,
        blockId: block.blockId,
        reason
      }, [prefacturation.clientId, prefacturation.transporterId]);
    }

    res.json({
      success: true,
      data: block,
      message: 'Blocage leve'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les blocages
app.get('/api/billing/blocks', authenticateToken, async (req, res) => {
  try {
    const { transporterId, clientId, type, active } = req.query;
    const filter = {};

    if (transporterId) filter.transporterId = transporterId;
    if (clientId) filter.clientId = clientId;
    if (type) filter.type = type;
    if (active !== undefined) filter.active = active === 'true';

    const blocks = await BillingBlock.find(filter).sort({ blockedAt: -1 });
    res.json({ success: true, data: blocks, count: blocks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - FACTURE FINALE & EXPORT
// ===========================================

// Finaliser la facturation
app.post('/api/billing/finalize', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId } = req.body;
    const prefacturation = await finalizeBilling(prefacturationId);

    res.json({
      success: true,
      data: {
        prefacturationId: prefacturation.prefacturationId,
        invoiceNumber: prefacturation.finalInvoice.invoiceNumber,
        totalTTC: prefacturation.calculation.totalTTC,
        pdfAvailable: !!prefacturation.finalInvoice.pdfBase64
      },
      message: 'Facture finalisee avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Telecharger facture PDF
app.get('/api/billing/invoice/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const prefacturation = await Prefacturation.findOne({ prefacturationId: req.params.id });
    if (!prefacturation || !prefacturation.finalInvoice?.pdfBase64) {
      return res.status(404).json({ success: false, error: 'Facture PDF non trouvee' });
    }

    const pdfBuffer = Buffer.from(prefacturation.finalInvoice.pdfBase64, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${prefacturation.finalInvoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export vers ERP
app.post('/api/billing/export', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, erpConfig } = req.body;

    if (!prefacturationId || !erpConfig) {
      return res.status(400).json({
        success: false,
        error: 'prefacturationId et erpConfig requis'
      });
    }

    const result = await exportToERP(prefacturationId, erpConfig);

    res.json({
      success: true,
      data: {
        exportId: result.erpExport.exportId,
        status: result.erpExport.status,
        erpSystem: result.erpExport.erpSystem,
        erpReference: result.erpExport.erpResponse?.reference
      },
      exportData: result.exportData,
      message: `Export ${result.erpExport.status} vers ${result.erpExport.erpSystem}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historique exports
app.get('/api/billing/exports', authenticateToken, async (req, res) => {
  try {
    const { prefacturationId, erpSystem, status, limit = 50 } = req.query;
    const filter = {};

    if (prefacturationId) filter.prefacturationId = prefacturationId;
    if (erpSystem) filter.erpSystem = erpSystem;
    if (status) filter.status = status;

    const exports = await ERPExport.find(filter).sort({ createdAt: -1 }).limit(parseInt(limit));
    res.json({ success: true, data: exports, count: exports.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - VIGILANCE TRANSPORTEUR
// ===========================================

app.post('/api/billing/vigilance', authenticateToken, async (req, res) => {
  try {
    const vigilance = new CarrierVigilance({
      vigilanceId: `VIG-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body,
      lastChecked: new Date()
    });
    await vigilance.save();
    res.status(201).json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/vigilance/:transporterId', authenticateToken, async (req, res) => {
  try {
    const vigilance = await CarrierVigilance.findOne({ transporterId: req.params.transporterId });
    if (!vigilance) {
      return res.status(404).json({ success: false, error: 'Vigilance non trouvee' });
    }
    res.json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/billing/vigilance/:transporterId', authenticateToken, async (req, res) => {
  try {
    const vigilance = await CarrierVigilance.findOneAndUpdate(
      { transporterId: req.params.transporterId },
      { ...req.body, lastChecked: new Date(), updatedAt: new Date() },
      { new: true }
    );
    if (!vigilance) {
      return res.status(404).json({ success: false, error: 'Vigilance non trouvee' });
    }
    res.json({ success: true, data: vigilance });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - WEBHOOKS
// ===========================================

app.post('/api/billing/webhooks', authenticateToken, async (req, res) => {
  try {
    const webhook = new BillingWebhook({
      webhookId: `WH-${uuidv4().slice(0, 8).toUpperCase()}`,
      ...req.body,
      secret: req.body.secret || uuidv4()
    });
    await webhook.save();
    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/billing/webhooks', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.query;
    const webhooks = await BillingWebhook.find(clientId ? { clientId } : {});
    res.json({ success: true, data: webhooks, count: webhooks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - STATISTIQUES
// ===========================================

app.get('/api/billing/stats', authenticateToken, async (req, res) => {
  try {
    const { clientId, transporterId, startDate, endDate } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;
    if (transporterId) filter.transporterId = transporterId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const total = await Prefacturation.countDocuments(filter);
    const byStatus = await Prefacturation.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const totalAmount = await Prefacturation.aggregate([
      { $match: { ...filter, status: { $in: ['finalized', 'exported', 'archived'] } } },
      { $group: { _id: null, totalHT: { $sum: '$calculation.totalHT' }, totalTTC: { $sum: '$calculation.totalTTC' } } }
    ]);

    const discrepancyRate = await Prefacturation.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withDiscrepancy: { $sum: { $cond: [{ $gt: [{ $size: '$discrepancies' }, 0] }, 1, 0] } }
        }
      }
    ]);

    const blocksCount = await BillingBlock.countDocuments({ ...filter, active: true });

    res.json({
      success: true,
      data: {
        prefacturations: {
          total,
          byStatus: byStatus.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        },
        amounts: totalAmount[0] || { totalHT: 0, totalTTC: 0 },
        discrepancyRate: discrepancyRate[0]
          ? Math.round((discrepancyRate[0].withDiscrepancy / discrepancyRate[0].total) * 100)
          : 0,
        activeBlocks: blocksCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// CONNEXION MONGODB & DEMARRAGE SERVEUR
// ===========================================

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('MongoDB connecte - Billing API');

    setupCronJobs();

    app.listen(PORT, () => {
      console.log(`
========================================
  Module Prefacturation & Facturation
  RT Technologie - SYMPHONI.A v1.0.0
========================================
  Port: ${PORT}
  MongoDB: ${MONGODB_URI}

  5 Blocs implementes:
  1. Prefacturation Automatique
  2. Detection Ecarts Tarifaires
  3. Validation Transporteur (OCR)
  4. Blocages Automatiques
  5. Facture Finale & Export ERP

  Endpoints principaux:
  - POST /api/billing/prefacturation/generate
  - POST /api/billing/invoice/upload
  - GET  /api/billing/discrepancy/:id
  - POST /api/billing/discrepancy/resolve
  - POST /api/billing/block
  - POST /api/billing/unblock
  - POST /api/billing/finalize
  - POST /api/billing/export

  Connecteurs ERP:
  - SAP, Oracle, Sage X3, Divalto
  - Microsoft Dynamics 365, Odoo
  - API generique JSON/XML

  Archivage: ${ARCHIVE_RETENTION_YEARS} ans
========================================
      `);
    });
  })
  .catch(err => {
    console.error('Erreur connexion MongoDB:', err);
    process.exit(1);
  });

module.exports = app;
