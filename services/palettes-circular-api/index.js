/**
 * Module Economie Circulaire des Palettes Europe
 * RT Technologie - API REST Complete
 *
 * Fonctionnalites:
 * - Cheques-palette numeriques avec QR code et signatures Ed25519
 * - Ledger dettes/credits en temps reel
 * - Matching IA des sites de restitution
 * - Gestion des quotas sites
 * - Workflow litiges complet
 * - Geofencing et preuves legales
 *
 * Tarification: 199 EUR/mois par entreprise
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');
const { v4: uuidv4 } = require('uuid');
const geolib = require('geolib');
const cron = require('node-cron');
const axios = require('axios');
const sharp = require('sharp');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ===========================================
// CONFIGURATION
// ===========================================
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/palettes-circular';
const JWT_SECRET = process.env.JWT_SECRET || 'rt-palettes-secret-2024';
const DEFAULT_SEARCH_RADIUS_KM = 30;
const SUBSCRIPTION_PRICE = 199; // EUR/mois

// ===========================================
// MONGOOSE SCHEMAS
// ===========================================

// Schema Company (acteurs du reseau)
const companySchema = new mongoose.Schema({
  companyId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['transporteur', 'industriel', 'logisticien', 'admin'], required: true },
  siret: String,
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'FR' },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  contact: {
    email: String,
    phone: String,
    contactName: String
  },
  subscription: {
    active: { type: Boolean, default: false },
    plan: { type: String, enum: ['basic', 'premium', 'enterprise'], default: 'basic' },
    startDate: Date,
    endDate: Date,
    pricePerMonth: { type: Number, default: SUBSCRIPTION_PRICE }
  },
  publicKey: String, // Cle publique Ed25519 pour signatures
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Site (points de restitution)
const siteSchema = new mongoose.Schema({
  siteId: { type: String, required: true, unique: true },
  companyId: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['entrepot', 'usine', 'plateforme', 'quai'], required: true },
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'FR' },
    coordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    }
  },
  // Gestion des quotas
  quota: {
    dailyMax: { type: Number, default: 100 }, // Palettes max/jour
    currentDaily: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
  },
  // Horaires d'ouverture
  openingHours: {
    monday: { open: String, close: String, available: { type: Boolean, default: true } },
    tuesday: { open: String, close: String, available: { type: Boolean, default: true } },
    wednesday: { open: String, close: String, available: { type: Boolean, default: true } },
    thursday: { open: String, close: String, available: { type: Boolean, default: true } },
    friday: { open: String, close: String, available: { type: Boolean, default: true } },
    saturday: { open: String, close: String, available: { type: Boolean, default: false } },
    sunday: { open: String, close: String, available: { type: Boolean, default: false } }
  },
  // Priorite
  priority: { type: String, enum: ['internal', 'network', 'public'], default: 'network' },
  acceptsExternalPalettes: { type: Boolean, default: true },
  // Zones geographiques preferentielles
  preferredZones: [String], // Codes postaux ou departements
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema Pallet Ledger (registre dettes/credits)
const palletLedgerSchema = new mongoose.Schema({
  ledgerId: { type: String, required: true, unique: true },
  companyId: { type: String, required: true },
  // Soldes par type de palette
  balances: {
    EURO_EPAL: { type: Number, default: 0 }, // Positif = credit, Negatif = dette
    EURO_EPAL_2: { type: Number, default: 0 },
    DEMI_PALETTE: { type: Number, default: 0 },
    PALETTE_PERDUE: { type: Number, default: 0 }
  },
  // Historique des ajustements
  adjustments: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['credit', 'debit', 'correction', 'litige'] },
    palletType: String,
    quantity: Number,
    reason: String,
    chequeId: String,
    performedBy: String
  }],
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Schema Pallet Cheque (cheque-palette numerique)
const palletChequeSchema = new mongoose.Schema({
  chequeId: { type: String, required: true, unique: true },
  qrCode: String, // QR code en base64
  // Informations sur le mouvement
  orderId: String, // Reference commande transport
  palletType: { type: String, enum: ['EURO_EPAL', 'EURO_EPAL_2', 'DEMI_PALETTE', 'PALETTE_PERDUE'], default: 'EURO_EPAL' },
  quantity: { type: Number, required: true },
  // Acteurs
  transporterId: { type: String, required: true },
  transporterName: String,
  vehiclePlate: String,
  driverName: String,
  // Sites
  originSiteId: String,
  originSiteName: String,
  destinationSiteId: { type: String, required: true },
  destinationSiteName: String,
  // Coordonnees GPS
  originCoordinates: {
    latitude: Number,
    longitude: Number
  },
  destinationCoordinates: {
    latitude: Number,
    longitude: Number
  },
  // Statut du cheque
  status: {
    type: String,
    enum: ['EMIS', 'EN_TRANSIT', 'DEPOSE', 'RECU', 'LITIGE', 'ANNULE'],
    default: 'EMIS'
  },
  // Horodatages certifies
  timestamps: {
    emittedAt: { type: Date, default: Date.now },
    depositedAt: Date,
    receivedAt: Date,
    disputedAt: Date
  },
  // Signatures electroniques Ed25519
  signatures: {
    emitter: {
      signature: String,
      publicKey: String,
      timestamp: Date
    },
    depositor: {
      signature: String,
      publicKey: String,
      timestamp: Date,
      geolocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
      }
    },
    receiver: {
      signature: String,
      publicKey: String,
      timestamp: Date,
      geolocation: {
        latitude: Number,
        longitude: Number,
        accuracy: Number
      }
    }
  },
  // Preuves photographiques
  photos: [{
    type: { type: String, enum: ['deposit', 'reception', 'damage'] },
    url: String,
    base64: String,
    timestamp: Date,
    geolocation: {
      latitude: Number,
      longitude: Number
    }
  }],
  // Matching IA
  matchingInfo: {
    matchedBySuggestion: { type: Boolean, default: false },
    suggestionRank: Number, // 1, 2, ou 3
    distanceKm: Number,
    matchingScore: Number
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

// Schema Pallet Dispute (litiges)
const palletDisputeSchema = new mongoose.Schema({
  disputeId: { type: String, required: true, unique: true },
  chequeId: { type: String, required: true },
  // Parties impliquees
  initiatorId: { type: String, required: true },
  initiatorType: { type: String, enum: ['transporteur', 'industriel', 'logisticien'] },
  respondentId: { type: String, required: true },
  respondentType: String,
  // Details du litige
  type: {
    type: String,
    enum: ['quantite_incorrecte', 'palettes_abimees', 'non_conformite', 'non_reception', 'autre'],
    required: true
  },
  description: String,
  claimedQuantity: Number, // Quantite reclamee
  actualQuantity: Number, // Quantite reellement recue
  // Preuves
  evidence: [{
    type: { type: String, enum: ['photo', 'document', 'commentaire'] },
    url: String,
    base64: String,
    description: String,
    uploadedBy: String,
    timestamp: { type: Date, default: Date.now },
    geolocation: {
      latitude: Number,
      longitude: Number
    }
  }],
  // Resolution
  status: {
    type: String,
    enum: ['ouvert', 'en_cours', 'proposition_emise', 'valide_initiateur', 'valide_respondent', 'resolu', 'escalade', 'ferme'],
    default: 'ouvert'
  },
  resolution: {
    type: { type: String, enum: ['ajustement', 'refus_partiel', 'refus_total', 'mediation', 'aucun'] },
    adjustedQuantity: Number,
    description: String,
    validatedByInitiator: { type: Boolean, default: false },
    validatedByRespondent: { type: Boolean, default: false },
    validatedAt: Date,
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

// Schema Site Quota History
const siteQuotaHistorySchema = new mongoose.Schema({
  siteId: { type: String, required: true },
  date: { type: Date, required: true },
  quotaMax: Number,
  quotaUsed: Number,
  cheques: [String], // Liste des chequeIds
  createdAt: { type: Date, default: Date.now }
});

// Schema Webhook (notifications)
const webhookSchema = new mongoose.Schema({
  webhookId: { type: String, required: true, unique: true },
  companyId: { type: String, required: true },
  name: String,
  url: { type: String, required: true },
  events: [{
    type: String,
    enum: [
      'cheque.emis',
      'cheque.depose',
      'cheque.recu',
      'cheque.litige',
      'litige.ouvert',
      'litige.proposition',
      'litige.resolu',
      'litige.escalade',
      'quota.alerte',
      'quota.reset'
    ]
  }],
  secret: String, // Pour signature HMAC des payloads
  active: { type: Boolean, default: true },
  lastTriggeredAt: Date,
  failureCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Schema Notification Log
const notificationLogSchema = new mongoose.Schema({
  notificationId: { type: String, required: true, unique: true },
  webhookId: String,
  companyId: String,
  event: String,
  payload: mongoose.Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'sent', 'failed', 'retrying'], default: 'pending' },
  httpStatus: Number,
  response: String,
  attempts: { type: Number, default: 0 },
  sentAt: Date,
  createdAt: { type: Date, default: Date.now }
});

// Creation des modeles
const Company = mongoose.model('PalletCompany', companySchema);
const Site = mongoose.model('PalletSite', siteSchema);
const PalletLedger = mongoose.model('PalletLedger', palletLedgerSchema);
const PalletCheque = mongoose.model('PalletCheque', palletChequeSchema);
const PalletDispute = mongoose.model('PalletDispute', palletDisputeSchema);
const SiteQuotaHistory = mongoose.model('SiteQuotaHistory', siteQuotaHistorySchema);
const Webhook = mongoose.model('PalletWebhook', webhookSchema);
const NotificationLog = mongoose.model('PalletNotificationLog', notificationLogSchema);

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

// Middleware optionnel (pour routes publiques)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (!err) {
        req.user = user;
      }
    });
  }
  next();
};

// ===========================================
// UTILITAIRES CRYPTOGRAPHIQUES (Ed25519)
// ===========================================

// Generer une paire de cles Ed25519
const generateKeyPair = () => {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    secretKey: naclUtil.encodeBase64(keyPair.secretKey)
  };
};

// Signer un message
const signMessage = (message, secretKeyBase64) => {
  const secretKey = naclUtil.decodeBase64(secretKeyBase64);
  const messageUint8 = naclUtil.decodeUTF8(JSON.stringify(message));
  const signature = nacl.sign.detached(messageUint8, secretKey);
  return naclUtil.encodeBase64(signature);
};

// Verifier une signature
const verifySignature = (message, signatureBase64, publicKeyBase64) => {
  try {
    const publicKey = naclUtil.decodeBase64(publicKeyBase64);
    const signature = naclUtil.decodeBase64(signatureBase64);
    const messageUint8 = naclUtil.decodeUTF8(JSON.stringify(message));
    return nacl.sign.detached.verify(messageUint8, signature, publicKey);
  } catch (error) {
    return false;
  }
};

// ===========================================
// UTILITAIRES GEOLOCALISATION
// ===========================================

// Calculer la distance entre deux points GPS (en km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  return geolib.getDistance(
    { latitude: lat1, longitude: lon1 },
    { latitude: lat2, longitude: lon2 }
  ) / 1000; // Convertir en km
};

// Verifier si une position est dans le rayon d'un site (geofencing)
const isWithinGeofence = (userLat, userLon, siteLat, siteLon, radiusMeters = 500) => {
  const distance = geolib.getDistance(
    { latitude: userLat, longitude: userLon },
    { latitude: siteLat, longitude: siteLon }
  );
  return distance <= radiusMeters;
};

// ===========================================
// UTILITAIRES PHOTOS (validation & compression)
// ===========================================

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PHOTO_DIMENSION = 2048; // pixels

/**
 * Valider et compresser une photo base64
 * @param {string} base64Data - Image en base64 (avec ou sans préfixe data:)
 * @returns {Promise<{valid: boolean, compressed: string, error?: string}>}
 */
const validateAndCompressPhoto = async (base64Data) => {
  try {
    // Extraire le contenu base64 pur
    let pureBase64 = base64Data;
    let mimeType = 'image/jpeg';

    if (base64Data.startsWith('data:')) {
      const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        mimeType = matches[1];
        pureBase64 = matches[2];
      }
    }

    // Vérifier le type MIME
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      return { valid: false, compressed: null, error: 'Type image non supporté. Utilisez JPEG, PNG ou WebP.' };
    }

    // Décoder le base64
    const buffer = Buffer.from(pureBase64, 'base64');

    // Vérifier la taille
    if (buffer.length > MAX_PHOTO_SIZE) {
      return { valid: false, compressed: null, error: `Image trop volumineuse. Maximum ${MAX_PHOTO_SIZE / 1024 / 1024}MB.` };
    }

    // Compresser avec sharp
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let processedImage = image;

    // Redimensionner si nécessaire
    if (metadata.width > MAX_PHOTO_DIMENSION || metadata.height > MAX_PHOTO_DIMENSION) {
      processedImage = processedImage.resize(MAX_PHOTO_DIMENSION, MAX_PHOTO_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Compresser en JPEG qualité 80%
    const compressedBuffer = await processedImage
      .jpeg({ quality: 80, progressive: true })
      .toBuffer();

    const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

    return {
      valid: true,
      compressed: compressedBase64,
      originalSize: buffer.length,
      compressedSize: compressedBuffer.length,
      compressionRatio: Math.round((1 - compressedBuffer.length / buffer.length) * 100)
    };
  } catch (error) {
    return { valid: false, compressed: null, error: `Erreur traitement image: ${error.message}` };
  }
};

// ===========================================
// SYSTEME DE NOTIFICATIONS (Webhooks)
// ===========================================

/**
 * Envoyer une notification webhook
 * @param {string} event - Type d'événement
 * @param {object} payload - Données à envoyer
 * @param {string[]} companyIds - IDs des entreprises à notifier
 */
const sendNotification = async (event, payload, companyIds) => {
  try {
    // Trouver les webhooks actifs pour cet événement
    const webhooks = await Webhook.find({
      companyId: { $in: companyIds },
      events: event,
      active: true,
      failureCount: { $lt: 5 } // Désactiver après 5 échecs consécutifs
    });

    for (const webhook of webhooks) {
      const notificationId = `NOTIF-${uuidv4().slice(0, 12).toUpperCase()}`;

      // Créer le log
      const log = new NotificationLog({
        notificationId,
        webhookId: webhook.webhookId,
        companyId: webhook.companyId,
        event,
        payload,
        status: 'pending'
      });
      await log.save();

      // Préparer le payload
      const webhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data: payload
      };

      // Envoyer de manière asynchrone (fire and forget avec retry)
      sendWebhookRequest(webhook, webhookPayload, log).catch(err => {
        console.error(`Webhook ${webhook.webhookId} error:`, err.message);
      });
    }
  } catch (error) {
    console.error('Notification error:', error.message);
  }
};

/**
 * Envoyer la requête HTTP au webhook
 */
const sendWebhookRequest = async (webhook, payload, log, attempt = 1) => {
  const maxAttempts = 3;
  const retryDelays = [1000, 5000, 30000]; // 1s, 5s, 30s

  try {
    const response = await axios.post(webhook.url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Signature': webhook.secret ?
          require('crypto').createHmac('sha256', webhook.secret).update(JSON.stringify(payload)).digest('hex') : undefined
      },
      timeout: 10000 // 10 secondes timeout
    });

    // Succès
    log.status = 'sent';
    log.httpStatus = response.status;
    log.sentAt = new Date();
    log.attempts = attempt;
    await log.save();

    // Reset failure count
    webhook.lastTriggeredAt = new Date();
    webhook.failureCount = 0;
    await webhook.save();

  } catch (error) {
    log.attempts = attempt;
    log.httpStatus = error.response?.status;
    log.response = error.message;

    if (attempt < maxAttempts) {
      log.status = 'retrying';
      await log.save();

      // Retry après délai
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt - 1]));
      return sendWebhookRequest(webhook, payload, log, attempt + 1);
    } else {
      log.status = 'failed';
      await log.save();

      // Incrémenter failure count
      webhook.failureCount += 1;
      await webhook.save();
    }
  }
};

// ===========================================
// CRON JOBS - TACHES PLANIFIEES
// ===========================================

/**
 * Reset des quotas journaliers - tous les jours à minuit
 */
const setupCronJobs = () => {
  // Chaque jour à 00:00
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Reset des quotas journaliers...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Récupérer tous les sites actifs
      const sites = await Site.find({ active: true });

      for (const site of sites) {
        // Sauvegarder l'historique avant reset
        if (site.quota.currentDaily > 0) {
          const history = new SiteQuotaHistory({
            siteId: site.siteId,
            date: new Date(today.getTime() - 24 * 60 * 60 * 1000), // Hier
            quotaMax: site.quota.dailyMax,
            quotaUsed: site.quota.currentDaily
          });
          await history.save();
        }

        // Reset le quota
        site.quota.currentDaily = 0;
        site.quota.lastResetDate = today;
        await site.save();
      }

      console.log(`[CRON] ${sites.length} sites - quotas réinitialisés`);

      // Notifier les entreprises du reset
      const companyIds = [...new Set(sites.map(s => s.companyId))];
      await sendNotification('quota.reset', {
        message: 'Quotas journaliers réinitialisés',
        sitesCount: sites.length,
        resetDate: today.toISOString()
      }, companyIds);

    } catch (error) {
      console.error('[CRON] Erreur reset quotas:', error.message);
    }
  }, {
    timezone: 'Europe/Paris'
  });

  // Vérification des quotas alertes - toutes les heures
  cron.schedule('0 * * * *', async () => {
    try {
      // Trouver les sites à plus de 80% de quota
      const sites = await Site.find({
        active: true,
        $expr: { $gte: ['$quota.currentDaily', { $multiply: ['$quota.dailyMax', 0.8] }] }
      });

      for (const site of sites) {
        const percentUsed = Math.round((site.quota.currentDaily / site.quota.dailyMax) * 100);

        await sendNotification('quota.alerte', {
          siteId: site.siteId,
          siteName: site.name,
          quotaUsed: site.quota.currentDaily,
          quotaMax: site.quota.dailyMax,
          percentUsed,
          message: `Attention: quota à ${percentUsed}%`
        }, [site.companyId]);
      }
    } catch (error) {
      console.error('[CRON] Erreur vérification quotas:', error.message);
    }
  });

  console.log('[CRON] Tâches planifiées configurées');
};

// ===========================================
// MATCHING IA - AFFRET IA INTEGRATION
// ===========================================

/**
 * Algorithme de matching multicritere pour trouver le meilleur site de restitution
 * Criteres: distance, disponibilite, quotas, priorite, historique
 */
const findBestRestitutionSites = async (deliveryLocation, transporterId, quantity = 1, options = {}) => {
  const {
    radiusKm = DEFAULT_SEARCH_RADIUS_KM,
    maxResults = 3,
    palletType = 'EURO_EPAL'
  } = options;

  // 1. Trouver tous les sites actifs dans le rayon
  const allSites = await Site.find({
    active: true,
    acceptsExternalPalettes: true
  });

  // 2. Filtrer par distance et calculer scores
  const today = new Date();
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][today.getDay()];

  const sitesWithScores = [];

  for (const site of allSites) {
    // Calculer distance
    const distance = calculateDistance(
      deliveryLocation.latitude,
      deliveryLocation.longitude,
      site.address.coordinates.latitude,
      site.address.coordinates.longitude
    );

    // Filtrer par rayon
    if (distance > radiusKm) continue;

    // Verifier disponibilite jour
    const daySchedule = site.openingHours[dayOfWeek];
    if (!daySchedule || !daySchedule.available) continue;

    // Verifier quota disponible
    const quotaRemaining = site.quota.dailyMax - site.quota.currentDaily;
    if (quotaRemaining < quantity) continue;

    // Calculer score de matching (0-100)
    let score = 0;

    // Score distance (max 40 points) - plus proche = meilleur
    const distanceScore = Math.max(0, 40 - (distance / radiusKm) * 40);
    score += distanceScore;

    // Score quota (max 25 points) - plus de disponibilite = meilleur
    const quotaScore = Math.min(25, (quotaRemaining / site.quota.dailyMax) * 25);
    score += quotaScore;

    // Score priorite (max 20 points)
    const priorityScores = { internal: 20, network: 15, public: 10 };
    score += priorityScores[site.priority] || 10;

    // Score zone preferee (max 15 points)
    const deliveryPostalCode = options.deliveryPostalCode || '';
    if (site.preferredZones.some(zone => deliveryPostalCode.startsWith(zone))) {
      score += 15;
    }

    sitesWithScores.push({
      site,
      distance: Math.round(distance * 10) / 10,
      quotaRemaining,
      score: Math.round(score * 10) / 10,
      openingHours: daySchedule
    });
  }

  // 3. Trier par score decroissant
  sitesWithScores.sort((a, b) => b.score - a.score);

  // 4. Retourner top N resultats
  return sitesWithScores.slice(0, maxResults).map((item, index) => ({
    rank: index + 1,
    siteId: item.site.siteId,
    siteName: item.site.name,
    companyId: item.site.companyId,
    address: item.site.address,
    distance: item.distance,
    quotaRemaining: item.quotaRemaining,
    matchingScore: item.score,
    openingHours: item.openingHours,
    priority: item.site.priority
  }));
};

// ===========================================
// ROUTES API - HEALTH CHECK
// ===========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'palettes-circular-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/palettes/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Module Economie Circulaire des Palettes Europe',
    version: '1.0.0',
    features: [
      'cheques-palette-numeriques',
      'ledger-temps-reel',
      'matching-ia',
      'signatures-ed25519',
      'geofencing',
      'workflow-litiges'
    ]
  });
});

// ===========================================
// ROUTES API - COMPANIES
// ===========================================

// Enregistrer une entreprise
app.post('/api/palettes/companies', authenticateToken, async (req, res) => {
  try {
    const { name, type, siret, address, contact } = req.body;

    // Generer cles Ed25519 pour l'entreprise
    const keyPair = generateKeyPair();

    const company = new Company({
      companyId: `COMP-${uuidv4().slice(0, 8).toUpperCase()}`,
      name,
      type,
      siret,
      address,
      contact,
      publicKey: keyPair.publicKey,
      subscription: {
        active: false,
        plan: 'basic',
        pricePerMonth: SUBSCRIPTION_PRICE
      }
    });

    await company.save();

    // Creer le ledger associe
    const ledger = new PalletLedger({
      ledgerId: `LED-${uuidv4().slice(0, 8).toUpperCase()}`,
      companyId: company.companyId
    });
    await ledger.save();

    res.status(201).json({
      success: true,
      data: {
        company,
        secretKey: keyPair.secretKey, // A stocker securisement cote client
        ledgerId: ledger.ledgerId
      },
      message: 'Entreprise enregistree avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir une entreprise
app.get('/api/palettes/companies/:companyId', optionalAuth, async (req, res) => {
  try {
    const company = await Company.findOne({ companyId: req.params.companyId });
    if (!company) {
      return res.status(404).json({ success: false, error: 'Entreprise non trouvee' });
    }
    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Activer abonnement
app.post('/api/palettes/companies/:companyId/subscribe', authenticateToken, async (req, res) => {
  try {
    const { plan = 'basic' } = req.body;
    const company = await Company.findOne({ companyId: req.params.companyId });

    if (!company) {
      return res.status(404).json({ success: false, error: 'Entreprise non trouvee' });
    }

    company.subscription = {
      active: true,
      plan,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 jours
      pricePerMonth: SUBSCRIPTION_PRICE
    };
    company.updatedAt = new Date();
    await company.save();

    res.json({
      success: true,
      data: company,
      message: `Abonnement ${plan} active pour 30 jours`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - SITES
// ===========================================

// Creer un site de restitution
app.post('/api/palettes/sites', authenticateToken, async (req, res) => {
  try {
    const { companyId, name, type, address, quota, openingHours, priority, preferredZones } = req.body;

    const site = new Site({
      siteId: `SITE-${uuidv4().slice(0, 8).toUpperCase()}`,
      companyId,
      name,
      type,
      address,
      quota: quota || { dailyMax: 100, currentDaily: 0 },
      openingHours: openingHours || {},
      priority: priority || 'network',
      preferredZones: preferredZones || []
    });

    await site.save();

    res.status(201).json({
      success: true,
      data: site,
      message: 'Site de restitution cree'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les sites d'une entreprise
app.get('/api/palettes/sites', optionalAuth, async (req, res) => {
  try {
    const { companyId, active = 'true' } = req.query;
    const filter = {};

    if (companyId) filter.companyId = companyId;
    if (active === 'true') filter.active = true;

    const sites = await Site.find(filter);
    res.json({ success: true, data: sites, count: sites.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir un site
app.get('/api/palettes/sites/:siteId', optionalAuth, async (req, res) => {
  try {
    const site = await Site.findOne({ siteId: req.params.siteId });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site non trouve' });
    }
    res.json({ success: true, data: site });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mettre a jour les quotas d'un site
app.put('/api/palettes/sites/:siteId/quota', authenticateToken, async (req, res) => {
  try {
    const { dailyMax, openingHours, priority, preferredZones } = req.body;
    const site = await Site.findOne({ siteId: req.params.siteId });

    if (!site) {
      return res.status(404).json({ success: false, error: 'Site non trouve' });
    }

    if (dailyMax !== undefined) site.quota.dailyMax = dailyMax;
    if (openingHours) site.openingHours = { ...site.openingHours, ...openingHours };
    if (priority) site.priority = priority;
    if (preferredZones) site.preferredZones = preferredZones;

    site.updatedAt = new Date();
    await site.save();

    res.json({ success: true, data: site, message: 'Quotas mis a jour' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - MATCHING IA
// ===========================================

// Trouver les meilleurs sites de restitution (Affret IA)
app.post('/api/palettes/matching/find-sites', authenticateToken, async (req, res) => {
  try {
    const { deliveryLocation, transporterId, quantity, palletType, radiusKm, deliveryPostalCode } = req.body;

    if (!deliveryLocation || !deliveryLocation.latitude || !deliveryLocation.longitude) {
      return res.status(400).json({
        success: false,
        error: 'Coordonnees de livraison requises (latitude, longitude)'
      });
    }

    const suggestions = await findBestRestitutionSites(
      deliveryLocation,
      transporterId,
      quantity || 1,
      { radiusKm, palletType, deliveryPostalCode }
    );

    res.json({
      success: true,
      data: {
        suggestions,
        searchParams: {
          center: deliveryLocation,
          radiusKm: radiusKm || DEFAULT_SEARCH_RADIUS_KM,
          quantity,
          palletType
        },
        matchedAt: new Date().toISOString()
      },
      message: suggestions.length > 0
        ? `${suggestions.length} site(s) de restitution trouve(s)`
        : 'Aucun site disponible dans le rayon de recherche'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - CHEQUES-PALETTE
// ===========================================

// Emettre un cheque-palette
app.post('/api/palettes/cheques', authenticateToken, async (req, res) => {
  try {
    const {
      orderId,
      transporterId,
      transporterName,
      vehiclePlate,
      driverName,
      destinationSiteId,
      palletType,
      quantity,
      originCoordinates,
      secretKey // Cle secrete pour signer
    } = req.body;

    // Verifier le site de destination
    const site = await Site.findOne({ siteId: destinationSiteId });
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site de destination non trouve' });
    }

    // Verifier quota disponible
    const quotaRemaining = site.quota.dailyMax - site.quota.currentDaily;
    if (quotaRemaining < quantity) {
      return res.status(400).json({
        success: false,
        error: `Quota insuffisant. Disponible: ${quotaRemaining}, Demande: ${quantity}`
      });
    }

    // Creer le cheque
    const chequeId = `CHQ-${uuidv4().slice(0, 12).toUpperCase()}`;

    // Generer QR code
    const qrData = JSON.stringify({
      chequeId,
      quantity,
      palletType,
      destinationSiteId,
      transporterId
    });
    const qrCode = await QRCode.toDataURL(qrData);

    // Preparer les donnees a signer
    const dataToSign = {
      chequeId,
      orderId,
      transporterId,
      destinationSiteId,
      palletType,
      quantity,
      timestamp: new Date().toISOString()
    };

    // Signer si cle fournie
    let emitterSignature = null;
    if (secretKey) {
      emitterSignature = signMessage(dataToSign, secretKey);
    }

    const cheque = new PalletCheque({
      chequeId,
      qrCode,
      orderId,
      transporterId,
      transporterName,
      vehiclePlate,
      driverName,
      destinationSiteId,
      destinationSiteName: site.name,
      destinationCoordinates: site.address.coordinates,
      palletType: palletType || 'EURO_EPAL',
      quantity,
      originCoordinates,
      status: 'EMIS',
      signatures: {
        emitter: emitterSignature ? {
          signature: emitterSignature,
          publicKey: req.user?.publicKey,
          timestamp: new Date()
        } : null
      },
      matchingInfo: {
        matchedBySuggestion: req.body.suggestionRank ? true : false,
        suggestionRank: req.body.suggestionRank,
        distanceKm: req.body.distanceKm
      },
      auditTrail: [{
        action: 'CHEQUE_EMIS',
        performedBy: req.user?.userId || transporterId,
        timestamp: new Date(),
        details: { orderId, quantity, palletType }
      }]
    });

    await cheque.save();

    // Mettre a jour le ledger du transporteur (dette)
    await PalletLedger.findOneAndUpdate(
      { companyId: transporterId },
      {
        $inc: { [`balances.${palletType || 'EURO_EPAL'}`]: -quantity },
        $push: {
          adjustments: {
            type: 'debit',
            palletType: palletType || 'EURO_EPAL',
            quantity: -quantity,
            reason: 'Emission cheque-palette',
            chequeId,
            performedBy: req.user?.userId || 'system'
          }
        },
        lastUpdated: new Date()
      },
      { upsert: true }
    );

    // Notification webhook
    await sendNotification('cheque.emis', {
      chequeId,
      transporterId,
      destinationSiteId,
      quantity,
      palletType: palletType || 'EURO_EPAL'
    }, [transporterId, site.companyId]);

    res.status(201).json({
      success: true,
      data: cheque,
      message: 'Cheque-palette emis avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scanner/Deposer un cheque-palette (par le transporteur)
app.post('/api/palettes/cheques/:chequeId/deposit', authenticateToken, async (req, res) => {
  try {
    const { geolocation, photo, secretKey } = req.body;
    const cheque = await PalletCheque.findOne({ chequeId: req.params.chequeId });

    if (!cheque) {
      return res.status(404).json({ success: false, error: 'Cheque non trouve' });
    }

    if (cheque.status !== 'EMIS' && cheque.status !== 'EN_TRANSIT') {
      return res.status(400).json({
        success: false,
        error: `Cheque ne peut pas etre depose. Statut actuel: ${cheque.status}`
      });
    }

    // Verifier geofencing si coordonnees du site disponibles
    if (geolocation && cheque.destinationCoordinates) {
      const isNearSite = isWithinGeofence(
        geolocation.latitude,
        geolocation.longitude,
        cheque.destinationCoordinates.latitude,
        cheque.destinationCoordinates.longitude,
        1000 // 1km de tolerance
      );

      if (!isNearSite) {
        // Avertissement mais on continue
        cheque.auditTrail.push({
          action: 'GEOFENCE_WARNING',
          performedBy: req.user?.userId,
          timestamp: new Date(),
          details: {
            userLocation: geolocation,
            siteLocation: cheque.destinationCoordinates,
            message: 'Depot effectue hors de la zone du site'
          }
        });
      }
    }

    // Signer le depot
    const dataToSign = {
      chequeId: cheque.chequeId,
      action: 'DEPOSIT',
      timestamp: new Date().toISOString(),
      geolocation
    };

    let depositorSignature = null;
    if (secretKey) {
      depositorSignature = signMessage(dataToSign, secretKey);
    }

    // Mettre a jour le cheque
    cheque.status = 'DEPOSE';
    cheque.timestamps.depositedAt = new Date();
    cheque.signatures.depositor = {
      signature: depositorSignature,
      publicKey: req.user?.publicKey,
      timestamp: new Date(),
      geolocation
    };

    if (photo) {
      cheque.photos.push({
        type: 'deposit',
        base64: photo,
        timestamp: new Date(),
        geolocation
      });
    }

    cheque.auditTrail.push({
      action: 'CHEQUE_DEPOSE',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { geolocation }
    });

    cheque.updatedAt = new Date();
    await cheque.save();

    // Notification depot
    const site = await Site.findOne({ siteId: cheque.destinationSiteId });
    await sendNotification('cheque.depose', {
      chequeId: cheque.chequeId,
      transporterId: cheque.transporterId,
      siteId: cheque.destinationSiteId,
      quantity: cheque.quantity
    }, [cheque.transporterId, site?.companyId].filter(Boolean));

    res.json({
      success: true,
      data: cheque,
      message: 'Cheque-palette depose. En attente de validation par le receptionnaire.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Valider reception d'un cheque-palette (par le receptionnaire du site)
app.post('/api/palettes/cheques/:chequeId/receive', authenticateToken, async (req, res) => {
  try {
    const { geolocation, photo, secretKey, actualQuantity } = req.body;
    const cheque = await PalletCheque.findOne({ chequeId: req.params.chequeId });

    if (!cheque) {
      return res.status(404).json({ success: false, error: 'Cheque non trouve' });
    }

    if (cheque.status !== 'DEPOSE') {
      return res.status(400).json({
        success: false,
        error: `Cheque doit etre depose avant reception. Statut actuel: ${cheque.status}`
      });
    }

    // Verifier geofencing obligatoire
    if (!geolocation) {
      return res.status(400).json({
        success: false,
        error: 'Geolocalisation obligatoire pour la reception'
      });
    }

    const isNearSite = isWithinGeofence(
      geolocation.latitude,
      geolocation.longitude,
      cheque.destinationCoordinates.latitude,
      cheque.destinationCoordinates.longitude,
      500 // 500m de tolerance pour reception
    );

    if (!isNearSite) {
      return res.status(400).json({
        success: false,
        error: 'Vous devez etre sur le site pour valider la reception',
        details: {
          userLocation: geolocation,
          siteLocation: cheque.destinationCoordinates
        }
      });
    }

    // Verifier si quantite differente (potentiel litige)
    const receivedQuantity = actualQuantity !== undefined ? actualQuantity : cheque.quantity;
    const hasDiscrepancy = receivedQuantity !== cheque.quantity;

    // Signer la reception
    const dataToSign = {
      chequeId: cheque.chequeId,
      action: 'RECEIVE',
      quantity: receivedQuantity,
      timestamp: new Date().toISOString(),
      geolocation
    };

    let receiverSignature = null;
    if (secretKey) {
      receiverSignature = signMessage(dataToSign, secretKey);
    }

    // Mettre a jour le cheque
    cheque.status = hasDiscrepancy ? 'LITIGE' : 'RECU';
    cheque.timestamps.receivedAt = new Date();
    if (hasDiscrepancy) cheque.timestamps.disputedAt = new Date();

    cheque.signatures.receiver = {
      signature: receiverSignature,
      publicKey: req.user?.publicKey,
      timestamp: new Date(),
      geolocation
    };

    if (photo) {
      cheque.photos.push({
        type: 'reception',
        base64: photo,
        timestamp: new Date(),
        geolocation
      });
    }

    cheque.auditTrail.push({
      action: hasDiscrepancy ? 'CHEQUE_LITIGE' : 'CHEQUE_RECU',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: {
        geolocation,
        expectedQuantity: cheque.quantity,
        receivedQuantity,
        hasDiscrepancy
      }
    });

    cheque.updatedAt = new Date();
    await cheque.save();

    // Si pas de litige, mettre a jour le ledger du site (credit)
    if (!hasDiscrepancy) {
      const site = await Site.findOne({ siteId: cheque.destinationSiteId });
      if (site) {
        // Mettre a jour quota du site
        site.quota.currentDaily += receivedQuantity;
        await site.save();

        // Crediter le ledger du proprietaire du site
        await PalletLedger.findOneAndUpdate(
          { companyId: site.companyId },
          {
            $inc: { [`balances.${cheque.palletType}`]: receivedQuantity },
            $push: {
              adjustments: {
                type: 'credit',
                palletType: cheque.palletType,
                quantity: receivedQuantity,
                reason: 'Reception cheque-palette',
                chequeId: cheque.chequeId,
                performedBy: req.user?.userId || 'system'
              }
            },
            lastUpdated: new Date()
          },
          { upsert: true }
        );
      }
    }

    // Si litige, creer automatiquement un dispute
    let dispute = null;
    if (hasDiscrepancy) {
      dispute = new PalletDispute({
        disputeId: `DISP-${uuidv4().slice(0, 8).toUpperCase()}`,
        chequeId: cheque.chequeId,
        initiatorId: req.user?.companyId || cheque.destinationSiteId,
        initiatorType: 'logisticien',
        respondentId: cheque.transporterId,
        respondentType: 'transporteur',
        type: 'quantite_incorrecte',
        description: `Ecart de quantite detecte: attendu ${cheque.quantity}, recu ${receivedQuantity}`,
        claimedQuantity: cheque.quantity,
        actualQuantity: receivedQuantity,
        status: 'ouvert',
        priority: Math.abs(cheque.quantity - receivedQuantity) > 10 ? 'high' : 'medium',
        slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
        timeline: [{
          action: 'Litige cree automatiquement',
          performedBy: 'system',
          timestamp: new Date(),
          details: { chequeId: cheque.chequeId, discrepancy: cheque.quantity - receivedQuantity }
        }]
      });
      await dispute.save();

      // Notification litige
      await sendNotification('litige.ouvert', {
        disputeId: dispute.disputeId,
        chequeId: cheque.chequeId,
        type: 'quantite_incorrecte',
        expectedQuantity: cheque.quantity,
        actualQuantity: receivedQuantity
      }, [dispute.initiatorId, dispute.respondentId]);
    }

    // Notification reception
    const siteOwner = await Site.findOne({ siteId: cheque.destinationSiteId });
    await sendNotification(hasDiscrepancy ? 'cheque.litige' : 'cheque.recu', {
      chequeId: cheque.chequeId,
      transporterId: cheque.transporterId,
      siteId: cheque.destinationSiteId,
      quantity: receivedQuantity,
      hasDiscrepancy
    }, [cheque.transporterId, siteOwner?.companyId].filter(Boolean));

    res.json({
      success: true,
      data: {
        cheque,
        dispute: dispute || null
      },
      message: hasDiscrepancy
        ? 'Reception enregistree avec ecart. Litige cree automatiquement.'
        : 'Cheque-palette valide avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les cheques-palette
app.get('/api/palettes/cheques', authenticateToken, async (req, res) => {
  try {
    const { transporterId, siteId, status, orderId, startDate, endDate, limit = 50 } = req.query;
    const filter = {};

    if (transporterId) filter.transporterId = transporterId;
    if (siteId) filter.destinationSiteId = siteId;
    if (status) filter.status = status;
    if (orderId) filter.orderId = orderId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const cheques = await PalletCheque.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: cheques,
      count: cheques.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir un cheque-palette par ID
app.get('/api/palettes/cheques/:chequeId', optionalAuth, async (req, res) => {
  try {
    const cheque = await PalletCheque.findOne({ chequeId: req.params.chequeId });
    if (!cheque) {
      return res.status(404).json({ success: false, error: 'Cheque non trouve' });
    }
    res.json({ success: true, data: cheque });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Scanner un QR code (verification)
app.post('/api/palettes/cheques/scan', optionalAuth, async (req, res) => {
  try {
    const { qrData, geolocation } = req.body;

    let parsedData;
    try {
      parsedData = JSON.parse(qrData);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'QR code invalide' });
    }

    const cheque = await PalletCheque.findOne({ chequeId: parsedData.chequeId });
    if (!cheque) {
      return res.status(404).json({ success: false, error: 'Cheque non trouve' });
    }

    // Verifier la coherence des donnees
    const isValid = (
      cheque.quantity === parsedData.quantity &&
      cheque.palletType === parsedData.palletType &&
      cheque.destinationSiteId === parsedData.destinationSiteId
    );

    // Log du scan
    cheque.auditTrail.push({
      action: 'QR_SCANNED',
      performedBy: req.user?.userId || 'anonymous',
      timestamp: new Date(),
      details: { geolocation, isValid }
    });
    await cheque.save();

    res.json({
      success: true,
      data: {
        cheque,
        verification: {
          isValid,
          status: cheque.status,
          canDeposit: cheque.status === 'EMIS' || cheque.status === 'EN_TRANSIT',
          canReceive: cheque.status === 'DEPOSE'
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - LEDGER
// ===========================================

// Obtenir le solde d'une entreprise
app.get('/api/palettes/ledger/:companyId', authenticateToken, async (req, res) => {
  try {
    let ledger = await PalletLedger.findOne({ companyId: req.params.companyId });

    if (!ledger) {
      // Creer si n'existe pas
      ledger = new PalletLedger({
        ledgerId: `LED-${uuidv4().slice(0, 8).toUpperCase()}`,
        companyId: req.params.companyId
      });
      await ledger.save();
    }

    res.json({ success: true, data: ledger });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historique des mouvements
app.get('/api/palettes/ledger/:companyId/history', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, type, limit = 100 } = req.query;
    const ledger = await PalletLedger.findOne({ companyId: req.params.companyId });

    if (!ledger) {
      return res.status(404).json({ success: false, error: 'Ledger non trouve' });
    }

    let adjustments = ledger.adjustments;

    // Filtres
    if (startDate) {
      adjustments = adjustments.filter(a => new Date(a.date) >= new Date(startDate));
    }
    if (endDate) {
      adjustments = adjustments.filter(a => new Date(a.date) <= new Date(endDate));
    }
    if (type) {
      adjustments = adjustments.filter(a => a.type === type);
    }

    // Tri et limite
    adjustments = adjustments
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, parseInt(limit));

    res.json({
      success: true,
      data: {
        companyId: req.params.companyId,
        currentBalances: ledger.balances,
        adjustments,
        count: adjustments.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Correction manuelle (admin uniquement)
app.post('/api/palettes/ledger/:companyId/adjust', authenticateToken, async (req, res) => {
  try {
    const { palletType, quantity, reason } = req.body;

    // Verifier droits admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Droits administrateur requis' });
    }

    const ledger = await PalletLedger.findOneAndUpdate(
      { companyId: req.params.companyId },
      {
        $inc: { [`balances.${palletType}`]: quantity },
        $push: {
          adjustments: {
            type: 'correction',
            palletType,
            quantity,
            reason,
            performedBy: req.user.userId
          }
        },
        lastUpdated: new Date()
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      data: ledger,
      message: 'Ajustement enregistre'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - LITIGES
// ===========================================

// Creer un litige
app.post('/api/palettes/disputes', authenticateToken, async (req, res) => {
  try {
    const {
      chequeId,
      type,
      description,
      claimedQuantity,
      actualQuantity,
      evidence
    } = req.body;

    const cheque = await PalletCheque.findOne({ chequeId });
    if (!cheque) {
      return res.status(404).json({ success: false, error: 'Cheque non trouve' });
    }

    const dispute = new PalletDispute({
      disputeId: `DISP-${uuidv4().slice(0, 8).toUpperCase()}`,
      chequeId,
      initiatorId: req.user?.companyId,
      initiatorType: req.user?.companyType,
      respondentId: cheque.transporterId,
      respondentType: 'transporteur',
      type,
      description,
      claimedQuantity,
      actualQuantity,
      evidence: evidence || [],
      status: 'ouvert',
      priority: 'medium',
      slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      timeline: [{
        action: 'Litige cree',
        performedBy: req.user?.userId,
        timestamp: new Date(),
        details: { type, description }
      }]
    });

    await dispute.save();

    // Mettre a jour le cheque
    cheque.status = 'LITIGE';
    cheque.timestamps.disputedAt = new Date();
    cheque.auditTrail.push({
      action: 'LITIGE_OUVERT',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { disputeId: dispute.disputeId }
    });
    await cheque.save();

    res.status(201).json({
      success: true,
      data: dispute,
      message: 'Litige cree avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les litiges
app.get('/api/palettes/disputes', authenticateToken, async (req, res) => {
  try {
    const { status, companyId, priority, limit = 50 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (companyId) {
      filter.$or = [
        { initiatorId: companyId },
        { respondentId: companyId }
      ];
    }

    const disputes = await PalletDispute.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: disputes, count: disputes.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir un litige
app.get('/api/palettes/disputes/:disputeId', authenticateToken, async (req, res) => {
  try {
    const dispute = await PalletDispute.findOne({ disputeId: req.params.disputeId });
    if (!dispute) {
      return res.status(404).json({ success: false, error: 'Litige non trouve' });
    }
    res.json({ success: true, data: dispute });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Ajouter une preuve a un litige
app.post('/api/palettes/disputes/:disputeId/evidence', authenticateToken, async (req, res) => {
  try {
    const { type, description, base64, geolocation } = req.body;
    const dispute = await PalletDispute.findOne({ disputeId: req.params.disputeId });

    if (!dispute) {
      return res.status(404).json({ success: false, error: 'Litige non trouve' });
    }

    dispute.evidence.push({
      type,
      description,
      base64,
      uploadedBy: req.user?.userId,
      timestamp: new Date(),
      geolocation
    });

    dispute.timeline.push({
      action: 'Preuve ajoutee',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { type, description }
    });

    dispute.updatedAt = new Date();
    await dispute.save();

    res.json({
      success: true,
      data: dispute,
      message: 'Preuve ajoutee au litige'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Proposer une resolution
app.post('/api/palettes/disputes/:disputeId/propose', authenticateToken, async (req, res) => {
  try {
    const { resolutionType, adjustedQuantity, description } = req.body;
    const dispute = await PalletDispute.findOne({ disputeId: req.params.disputeId });

    if (!dispute) {
      return res.status(404).json({ success: false, error: 'Litige non trouve' });
    }

    dispute.resolution = {
      type: resolutionType,
      adjustedQuantity,
      description,
      validatedByInitiator: false,
      validatedByRespondent: false
    };

    dispute.status = 'proposition_emise';
    dispute.timeline.push({
      action: 'Resolution proposee',
      performedBy: req.user?.userId,
      timestamp: new Date(),
      details: { resolutionType, adjustedQuantity, description }
    });

    dispute.updatedAt = new Date();
    await dispute.save();

    res.json({
      success: true,
      data: dispute,
      message: 'Resolution proposee. En attente de validation des deux parties.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Valider une resolution
app.post('/api/palettes/disputes/:disputeId/validate', authenticateToken, async (req, res) => {
  try {
    const { accept } = req.body;
    const dispute = await PalletDispute.findOne({ disputeId: req.params.disputeId });

    if (!dispute) {
      return res.status(404).json({ success: false, error: 'Litige non trouve' });
    }

    if (dispute.status !== 'proposition_emise' &&
        dispute.status !== 'valide_initiateur' &&
        dispute.status !== 'valide_respondent') {
      return res.status(400).json({
        success: false,
        error: 'Aucune proposition a valider'
      });
    }

    const isInitiator = req.user?.companyId === dispute.initiatorId;
    const isRespondent = req.user?.companyId === dispute.respondentId;

    if (!accept) {
      // Refus - retour a l'etat ouvert ou escalade
      dispute.status = 'escalade';
      dispute.timeline.push({
        action: 'Resolution refusee - escalade',
        performedBy: req.user?.userId,
        timestamp: new Date()
      });
    } else {
      // Acceptation
      if (isInitiator) {
        dispute.resolution.validatedByInitiator = true;
        dispute.status = dispute.resolution.validatedByRespondent ? 'resolu' : 'valide_initiateur';
      } else if (isRespondent) {
        dispute.resolution.validatedByRespondent = true;
        dispute.status = dispute.resolution.validatedByInitiator ? 'resolu' : 'valide_respondent';
      }

      dispute.timeline.push({
        action: `Resolution acceptee par ${isInitiator ? 'initiateur' : 'respondent'}`,
        performedBy: req.user?.userId,
        timestamp: new Date()
      });

      // Si resolu, appliquer les ajustements au ledger
      if (dispute.status === 'resolu' && dispute.resolution.adjustedQuantity) {
        dispute.resolution.validatedAt = new Date();
        dispute.resolution.resolvedBy = 'bilateral';

        // Recuperer le cheque pour les infos
        const cheque = await PalletCheque.findOne({ chequeId: dispute.chequeId });
        if (cheque) {
          const adjustment = dispute.resolution.adjustedQuantity;

          // Ajuster le ledger du transporteur
          await PalletLedger.findOneAndUpdate(
            { companyId: cheque.transporterId },
            {
              $inc: { [`balances.${cheque.palletType}`]: adjustment },
              $push: {
                adjustments: {
                  type: 'litige',
                  palletType: cheque.palletType,
                  quantity: adjustment,
                  reason: `Resolution litige ${dispute.disputeId}`,
                  chequeId: cheque.chequeId,
                  performedBy: 'system'
                }
              },
              lastUpdated: new Date()
            }
          );

          // Mettre a jour le cheque
          cheque.status = 'RECU';
          cheque.auditTrail.push({
            action: 'LITIGE_RESOLU',
            performedBy: 'system',
            timestamp: new Date(),
            details: { disputeId: dispute.disputeId, adjustment }
          });
          await cheque.save();
        }
      }
    }

    dispute.updatedAt = new Date();
    await dispute.save();

    // Notifications litige
    if (dispute.status === 'resolu') {
      await sendNotification('litige.resolu', {
        disputeId: dispute.disputeId,
        chequeId: dispute.chequeId,
        resolution: dispute.resolution
      }, [dispute.initiatorId, dispute.respondentId]);
    } else if (dispute.status === 'escalade') {
      await sendNotification('litige.escalade', {
        disputeId: dispute.disputeId,
        chequeId: dispute.chequeId,
        reason: 'Resolution refusee par une partie'
      }, [dispute.initiatorId, dispute.respondentId]);
    }

    res.json({
      success: true,
      data: dispute,
      message: accept ? 'Validation enregistree' : 'Resolution refusee, litige escalade'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - STATISTIQUES & REPORTING
// ===========================================

// Statistiques globales
app.get('/api/palettes/stats', authenticateToken, async (req, res) => {
  try {
    const { companyId, startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const chequeFilter = companyId
      ? { $or: [{ transporterId: companyId }, { destinationSiteId: { $regex: companyId } }] }
      : {};

    if (Object.keys(dateFilter).length > 0) {
      chequeFilter.createdAt = dateFilter;
    }

    // Aggregations
    const totalCheques = await PalletCheque.countDocuments(chequeFilter);
    const chequesParStatut = await PalletCheque.aggregate([
      { $match: chequeFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const totalPalettes = await PalletCheque.aggregate([
      { $match: { ...chequeFilter, status: 'RECU' } },
      { $group: { _id: null, total: { $sum: '$quantity' } } }
    ]);

    const disputeFilter = companyId
      ? { $or: [{ initiatorId: companyId }, { respondentId: companyId }] }
      : {};

    const totalDisputes = await PalletDispute.countDocuments(disputeFilter);
    const disputesResolus = await PalletDispute.countDocuments({ ...disputeFilter, status: 'resolu' });

    const tauxAutomatisation = await PalletCheque.aggregate([
      { $match: chequeFilter },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        automated: { $sum: { $cond: ['$matchingInfo.matchedBySuggestion', 1, 0] } }
      }}
    ]);

    res.json({
      success: true,
      data: {
        cheques: {
          total: totalCheques,
          parStatut: chequesParStatut.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {})
        },
        palettes: {
          totalRestitues: totalPalettes[0]?.total || 0
        },
        litiges: {
          total: totalDisputes,
          resolus: disputesResolus,
          tauxResolution: totalDisputes > 0 ? Math.round((disputesResolus / totalDisputes) * 100) : 0
        },
        automatisation: {
          tauxMatchingIA: tauxAutomatisation[0]
            ? Math.round((tauxAutomatisation[0].automated / tauxAutomatisation[0].total) * 100)
            : 0
        },
        periode: { startDate, endDate }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export des donnees
app.get('/api/palettes/export/:type', authenticateToken, async (req, res) => {
  try {
    const { type } = req.params;
    const { companyId, startDate, endDate, format = 'json' } = req.query;

    let data = [];
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    switch (type) {
      case 'cheques':
        const chequeFilter = {};
        if (companyId) chequeFilter.transporterId = companyId;
        if (Object.keys(dateFilter).length > 0) chequeFilter.createdAt = dateFilter;
        data = await PalletCheque.find(chequeFilter).lean();
        break;

      case 'ledger':
        if (!companyId) {
          return res.status(400).json({ success: false, error: 'companyId requis pour export ledger' });
        }
        const ledger = await PalletLedger.findOne({ companyId }).lean();
        data = ledger ? [ledger] : [];
        break;

      case 'disputes':
        const disputeFilter = {};
        if (companyId) {
          disputeFilter.$or = [{ initiatorId: companyId }, { respondentId: companyId }];
        }
        if (Object.keys(dateFilter).length > 0) disputeFilter.createdAt = dateFilter;
        data = await PalletDispute.find(disputeFilter).lean();
        break;

      default:
        return res.status(400).json({ success: false, error: 'Type export invalide' });
    }

    if (format === 'csv') {
      // Conversion simple en CSV
      if (data.length === 0) {
        return res.type('text/csv').send('');
      }
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(item =>
        Object.values(item).map(v =>
          typeof v === 'object' ? JSON.stringify(v) : v
        ).join(',')
      );
      const csv = [headers, ...rows].join('\n');
      res.type('text/csv').send(csv);
    } else {
      res.json({ success: true, data, count: data.length });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTES API - WEBHOOKS & NOTIFICATIONS
// ===========================================

// Creer un webhook
app.post('/api/palettes/webhooks', authenticateToken, async (req, res) => {
  try {
    const { companyId, name, url, events, secret } = req.body;

    if (!url || !events || events.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'URL et events requis'
      });
    }

    const webhook = new Webhook({
      webhookId: `WH-${uuidv4().slice(0, 8).toUpperCase()}`,
      companyId: companyId || req.user?.companyId,
      name: name || 'Webhook',
      url,
      events,
      secret: secret || uuidv4()
    });

    await webhook.save();

    res.status(201).json({
      success: true,
      data: webhook,
      message: 'Webhook cree avec succes'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lister les webhooks d'une entreprise
app.get('/api/palettes/webhooks', authenticateToken, async (req, res) => {
  try {
    const { companyId } = req.query;
    const webhooks = await Webhook.find({
      companyId: companyId || req.user?.companyId
    });

    res.json({ success: true, data: webhooks, count: webhooks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtenir un webhook
app.get('/api/palettes/webhooks/:webhookId', authenticateToken, async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ webhookId: req.params.webhookId });
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook non trouve' });
    }
    res.json({ success: true, data: webhook });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mettre a jour un webhook
app.put('/api/palettes/webhooks/:webhookId', authenticateToken, async (req, res) => {
  try {
    const { name, url, events, active } = req.body;
    const webhook = await Webhook.findOne({ webhookId: req.params.webhookId });

    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook non trouve' });
    }

    if (name !== undefined) webhook.name = name;
    if (url !== undefined) webhook.url = url;
    if (events !== undefined) webhook.events = events;
    if (active !== undefined) webhook.active = active;

    await webhook.save();

    res.json({ success: true, data: webhook, message: 'Webhook mis a jour' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Supprimer un webhook
app.delete('/api/palettes/webhooks/:webhookId', authenticateToken, async (req, res) => {
  try {
    const result = await Webhook.deleteOne({ webhookId: req.params.webhookId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Webhook non trouve' });
    }
    res.json({ success: true, message: 'Webhook supprime' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Tester un webhook
app.post('/api/palettes/webhooks/:webhookId/test', authenticateToken, async (req, res) => {
  try {
    const webhook = await Webhook.findOne({ webhookId: req.params.webhookId });
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook non trouve' });
    }

    const testPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: { message: 'Test webhook notification', webhookId: webhook.webhookId }
    };

    try {
      const response = await axios.post(webhook.url, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'test'
        },
        timeout: 10000
      });

      res.json({
        success: true,
        data: {
          status: response.status,
          statusText: response.statusText
        },
        message: 'Test webhook envoye avec succes'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: `Echec du test: ${error.message}`,
        details: {
          status: error.response?.status,
          statusText: error.response?.statusText
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Historique des notifications
app.get('/api/palettes/notifications', authenticateToken, async (req, res) => {
  try {
    const { companyId, webhookId, status, event, limit = 50 } = req.query;
    const filter = {};

    if (companyId) filter.companyId = companyId;
    if (webhookId) filter.webhookId = webhookId;
    if (status) filter.status = status;
    if (event) filter.event = event;

    const notifications = await NotificationLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: notifications, count: notifications.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// ROUTE API - VALIDATION PHOTOS
// ===========================================

// Valider et compresser une photo
app.post('/api/palettes/photos/validate', authenticateToken, async (req, res) => {
  try {
    const { photo } = req.body;

    if (!photo) {
      return res.status(400).json({ success: false, error: 'Photo requise (base64)' });
    }

    const result = await validateAndCompressPhoto(photo);

    if (!result.valid) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      data: {
        compressed: result.compressed,
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        compressionRatio: `${result.compressionRatio}%`
      },
      message: 'Photo validee et compressee'
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
    console.log('MongoDB connecte - Palettes Circular API');

    // Demarrer les taches planifiees
    setupCronJobs();

    app.listen(PORT, () => {
      console.log(`
========================================
  Module Economie Circulaire Palettes
  RT Technologie - API v1.1.0
========================================
  Port: ${PORT}
  MongoDB: ${MONGODB_URI}

  Endpoints disponibles:
  - GET  /health
  - POST /api/palettes/companies
  - POST /api/palettes/sites
  - POST /api/palettes/matching/find-sites
  - POST /api/palettes/cheques
  - POST /api/palettes/cheques/:id/deposit
  - POST /api/palettes/cheques/:id/receive
  - GET  /api/palettes/ledger/:companyId
  - POST /api/palettes/disputes
  - GET  /api/palettes/stats
  - POST /api/palettes/webhooks
  - POST /api/palettes/photos/validate

  Cron Jobs:
  - 00:00 Reset quotas journaliers
  - *:00  Alerte quotas (>80%)
========================================
      `);
    });
  })
  .catch(err => {
    console.error('Erreur connexion MongoDB:', err);
    process.exit(1);
  });

module.exports = app;
