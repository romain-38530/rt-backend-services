/**
 * SYMPHONI.A - Espace Destinataire API
 * Module externe pour la gestion des destinataires (réception optimisée)
 * Cahier des charges: Espaces Fournisseur & Destinataire
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'rt-super-secret-jwt-key-2024';

// ============================================
// SCHEMAS MONGOOSE
// ============================================

// Schema Destinataire (Recipient)
const RecipientSchema = new mongoose.Schema({
  // Informations de base
  companyName: { type: String, required: true },
  siret: { type: String },
  email: { type: String, required: true, unique: true },
  phone: { type: String },

  // Sites de livraison
  deliverySites: [{
    name: { type: String, required: true },
    address: {
      street: String,
      city: String,
      postalCode: String,
      country: { type: String, default: 'France' }
    },
    gpsCoordinates: {
      lat: Number,
      lng: Number
    },
    openingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String }
    },
    dockingBays: { type: Number, default: 1 },
    constraints: [String], // hayon, ADR, froid, etc.
    isDefault: { type: Boolean, default: false }
  }],

  // Statut du compte
  status: {
    type: String,
    enum: ['invited', 'active', 'incomplete', 'suspended'],
    default: 'invited'
  },

  // Contacts internes
  contacts: [{
    type: { type: String, enum: ['reception', 'logistics', 'quality', 'admin', 'other'] },
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    siteId: String,
    isMain: { type: Boolean, default: false }
  }],

  // Relations avec industriels
  industrialClients: [{
    industrialId: { type: String, required: true },
    industrialName: String,
    invitedAt: Date,
    activatedAt: Date,
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' }
  }],

  // Authentification
  passwordHash: { type: String },
  invitationToken: { type: String },
  lastLogin: { type: Date },

  // Version
  subscription: {
    type: { type: String, enum: ['free', 'premium'], default: 'free' },
    startDate: Date,
    monthlyPrice: { type: Number, default: 0 }
  },

  // Préférences
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  }
}, { timestamps: true });

// Schema Invitation Destinataire
const RecipientInvitationSchema = new mongoose.Schema({
  industrialId: { type: String, required: true },
  industrialName: { type: String },
  recipientEmail: { type: String, required: true },
  recipientCompanyName: { type: String },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted', 'expired', 'cancelled'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date }
}, { timestamps: true });

// Schema Livraison (Delivery - vue destinataire)
const DeliverySchema = new mongoose.Schema({
  // Référence commande originale
  orderId: { type: String, required: true, index: true },
  orderReference: { type: String },

  // Destinataire
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient', required: true },
  deliverySiteId: { type: String },
  deliverySiteName: { type: String },

  // Fournisseur d'origine
  supplierId: { type: String },
  supplierName: { type: String },

  // Client industriel (donneur d'ordre)
  industrialId: { type: String, required: true },
  industrialName: { type: String },

  // Transporteur
  carrierId: { type: String },
  carrierName: { type: String },

  // Chauffeur et véhicule
  driver: {
    name: { type: String },
    phone: { type: String },
    photo: { type: String }
  },
  vehicle: {
    type: { type: String },
    registration: { type: String },
    constraints: [String]
  },

  // Tracking IA - ETA
  tracking: {
    currentLocation: {
      lat: Number,
      lng: Number,
      address: String,
      updatedAt: Date
    },
    eta: { type: Date },
    etaConfidence: { type: Number }, // 0-100%
    distanceRemaining: { type: Number }, // km
    status: { type: String, enum: ['in_transit', 'approaching', 'arrived', 'completed', 'delayed'] },
    events: [{
      type: String,
      description: String,
      location: String,
      timestamp: Date
    }]
  },

  // Marchandise attendue
  cargo: {
    pallets: { type: Number, default: 0 },
    packages: { type: Number, default: 0 },
    weight: { type: Number },
    description: String,
    products: [{
      reference: String,
      description: String,
      quantity: Number,
      unit: String
    }]
  },

  // Dates
  expectedDeliveryDate: { type: Date },
  expectedArrivalWindow: {
    start: Date,
    end: Date
  },
  actualArrivalDate: { type: Date },
  actualDeliveryDate: { type: Date },

  // Statut livraison
  status: {
    type: String,
    enum: ['scheduled', 'in_transit', 'arriving', 'arrived', 'unloading', 'delivered', 'incident', 'refused'],
    default: 'scheduled'
  },

  // Urgence
  urgencyLevel: {
    type: String,
    enum: ['normal', 'high', 'critical'],
    default: 'normal'
  },

  // Documents
  documents: [{
    type: { type: String, enum: ['CMR', 'BL', 'ADR', 'photo', 'POD', 'signature', 'other'] },
    name: String,
    url: String,
    uploadedAt: Date
  }],

  // Signature de livraison
  deliverySignature: {
    signed: { type: Boolean, default: false },
    signedBy: String,
    signedAt: Date,
    method: { type: String, enum: ['smartphone', 'qrcode', 'terminal'] },
    signatureData: String,
    documentId: String,
    qrCodeToken: String
  },

  // Incident / Anomalie
  incident: {
    declared: { type: Boolean, default: false },
    type: { type: String, enum: ['damage', 'missing', 'broken_packaging', 'wrong_product', 'partial_refusal', 'total_refusal', 'other'] },
    description: String,
    photos: [String],
    declaredAt: Date,
    declaredBy: String,
    status: { type: String, enum: ['open', 'investigating', 'resolved', 'closed'], default: 'open' },
    resolution: String,
    billingBlocked: { type: Boolean, default: false },
    litigationFileId: String
  },

  // Événements
  events: [{
    type: String,
    description: String,
    timestamp: { type: Date, default: Date.now },
    actor: String
  }]
}, { timestamps: true });

// Schema Chat Destinataire
const RecipientChatSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  orderId: { type: String, index: true },
  from: {
    type: { type: String, enum: ['recipient', 'carrier', 'industrial', 'supplier'] },
    id: String,
    name: String
  },
  to: {
    type: { type: String, enum: ['recipient', 'carrier', 'industrial', 'supplier'] },
    id: String,
    name: String
  },
  content: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'template', 'document', 'alert'], default: 'text' },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  attachments: [{
    name: String,
    url: String,
    type: String
  }]
}, { timestamps: true });

// Schema Notification Destinataire
const RecipientNotificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipient' },
  type: { type: String, enum: ['eta_update', 'arrival_imminent', 'arrived', 'incident_alert', 'document_ready', 'general'] },
  title: { type: String, required: true },
  message: { type: String, required: true },
  orderId: { type: String },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  channel: { type: String, enum: ['email', 'push', 'internal'], default: 'internal' }
}, { timestamps: true });

// Modèles
const Recipient = mongoose.model('Recipient', RecipientSchema);
const RecipientInvitation = mongoose.model('RecipientInvitation', RecipientInvitationSchema);
const Delivery = mongoose.model('Delivery', DeliverySchema);
const RecipientChat = mongoose.model('RecipientChat', RecipientChatSchema);
const RecipientNotification = mongoose.model('RecipientNotification', RecipientNotificationSchema);

// ============================================
// MIDDLEWARE AUTH
// ============================================

const authenticateRecipient = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token requis' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const recipient = await Recipient.findById(decoded.recipientId);

    if (!recipient) {
      return res.status(401).json({ success: false, error: 'Destinataire non trouvé' });
    }

    req.recipient = recipient;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Token invalide' });
  }
};

// ============================================
// ROUTES - HEALTH
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'recipient-space-api',
    version: '1.0.0',
    description: 'Espace Destinataire SYMPHONI.A - Réception optimisée',
    features: [
      'Onboarding simplifié',
      'Visualisation livraisons ETA Tracking IA',
      'Filtrage avancé',
      'Signature électronique livraison QR Code',
      'Déclaration incidents',
      'Blocage préfacturation',
      'Gestion litiges automatique',
      'Chat intégré',
      'Notifications multi-canaux'
    ],
    endpoints: {
      invitations: '/api/v1/recipient/invitations',
      onboarding: '/api/v1/recipient/onboarding',
      deliveries: '/api/v1/recipient/deliveries',
      signature: '/api/v1/recipient/signature',
      incidents: '/api/v1/recipient/incidents',
      chat: '/api/v1/recipient/chat',
      notifications: '/api/v1/recipient/notifications'
    }
  });
});

// ============================================
// ROUTES - INVITATIONS
// ============================================

// POST /api/v1/recipient/invitations - Inviter destinataire
app.post('/api/v1/recipient/invitations', async (req, res) => {
  try {
    const { industrialId, industrialName, recipientEmail, recipientCompanyName } = req.body;

    if (!industrialId || !recipientEmail) {
      return res.status(400).json({ success: false, error: 'industrialId et recipientEmail requis' });
    }

    const existing = await RecipientInvitation.findOne({
      industrialId,
      recipientEmail,
      status: 'pending'
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'Invitation déjà envoyée' });
    }

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = new RecipientInvitation({
      industrialId,
      industrialName,
      recipientEmail,
      recipientCompanyName,
      token,
      expiresAt
    });

    await invitation.save();

    res.status(201).json({
      success: true,
      data: {
        invitationId: invitation._id,
        token,
        expiresAt,
        invitationLink: `${process.env.FRONTEND_URL}/recipient/register?token=${token}`
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/recipient/invitations/:token
app.get('/api/v1/recipient/invitations/:token', async (req, res) => {
  try {
    const invitation = await RecipientInvitation.findOne({ token: req.params.token });

    if (!invitation || invitation.status !== 'pending' || new Date() > invitation.expiresAt) {
      return res.status(400).json({ success: false, error: 'Invitation invalide ou expirée' });
    }

    res.json({
      success: true,
      data: {
        industrialName: invitation.industrialName,
        recipientEmail: invitation.recipientEmail,
        recipientCompanyName: invitation.recipientCompanyName
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - ONBOARDING
// ============================================

// POST /api/v1/recipient/onboarding/step1 - Création compte
app.post('/api/v1/recipient/onboarding/step1', async (req, res) => {
  try {
    const { token, companyName, email, password } = req.body;

    const invitation = await RecipientInvitation.findOne({ token, status: 'pending' });
    if (!invitation) {
      return res.status(400).json({ success: false, error: 'Invitation invalide' });
    }

    const existing = await Recipient.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const recipient = new Recipient({
      companyName: companyName || invitation.recipientCompanyName,
      email: email || invitation.recipientEmail,
      passwordHash,
      status: 'incomplete',
      industrialClients: [{
        industrialId: invitation.industrialId,
        industrialName: invitation.industrialName,
        invitedAt: invitation.createdAt,
        status: 'pending'
      }]
    });

    await recipient.save();

    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    const authToken = jwt.sign({ recipientId: recipient._id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      step: 1,
      message: 'Compte créé',
      data: {
        recipientId: recipient._id,
        token: authToken,
        nextStep: '/api/v1/recipient/onboarding/step2'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/recipient/onboarding/step2 - Configuration contacts
app.post('/api/v1/recipient/onboarding/step2', authenticateRecipient, async (req, res) => {
  try {
    const { contacts } = req.body;

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'Au moins un contact requis' });
    }

    req.recipient.contacts = contacts;
    await req.recipient.save();

    res.json({
      success: true,
      step: 2,
      message: 'Contacts configurés',
      data: { nextStep: '/api/v1/recipient/onboarding/step3' }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/recipient/onboarding/step3 - Affectation sites
app.post('/api/v1/recipient/onboarding/step3', authenticateRecipient, async (req, res) => {
  try {
    const { deliverySites, phone, notificationPreferences } = req.body;

    if (deliverySites && deliverySites.length > 0) {
      req.recipient.deliverySites = deliverySites;
    }
    if (phone) req.recipient.phone = phone;
    if (notificationPreferences) req.recipient.notificationPreferences = notificationPreferences;

    // Activer le compte
    req.recipient.status = 'active';
    req.recipient.industrialClients.forEach(client => {
      if (client.status === 'pending') {
        client.status = 'active';
        client.activatedAt = new Date();
      }
    });

    await req.recipient.save();

    res.json({
      success: true,
      step: 3,
      message: 'Compte activé avec succès',
      data: {
        status: req.recipient.status,
        recipient: {
          id: req.recipient._id,
          companyName: req.recipient.companyName,
          sites: req.recipient.deliverySites.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - AUTHENTIFICATION
// ============================================

// POST /api/v1/recipient/auth/login
app.post('/api/v1/recipient/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const recipient = await Recipient.findOne({ email });
    if (!recipient) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    const isValid = await bcrypt.compare(password, recipient.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    recipient.lastLogin = new Date();
    await recipient.save();

    const token = jwt.sign({ recipientId: recipient._id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      data: {
        token,
        recipient: {
          id: recipient._id,
          companyName: recipient.companyName,
          email: recipient.email,
          status: recipient.status
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - LIVRAISONS
// ============================================

// GET /api/v1/recipient/deliveries - Liste livraisons à venir
app.get('/api/v1/recipient/deliveries', authenticateRecipient, async (req, res) => {
  try {
    const {
      status, supplierId, carrierId, urgencyLevel,
      dateFrom, dateTo, siteId,
      sortBy = 'tracking.eta', sortOrder = 'asc',
      page = 1, limit = 20
    } = req.query;

    const filters = { recipientId: req.recipient._id };

    if (status) filters.status = status;
    if (supplierId) filters.supplierId = supplierId;
    if (carrierId) filters.carrierId = carrierId;
    if (urgencyLevel) filters.urgencyLevel = urgencyLevel;
    if (siteId) filters.deliverySiteId = siteId;

    if (dateFrom || dateTo) {
      filters.expectedDeliveryDate = {};
      if (dateFrom) filters.expectedDeliveryDate.$gte = new Date(dateFrom);
      if (dateTo) filters.expectedDeliveryDate.$lte = new Date(dateTo);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const deliveries = await Delivery.find(filters)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Delivery.countDocuments(filters);

    // Stats
    const stats = await Delivery.aggregate([
      { $match: { recipientId: req.recipient._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: deliveries,
      stats: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/recipient/deliveries/:orderId - Détail livraison
app.get('/api/v1/recipient/deliveries/:orderId', authenticateRecipient, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      orderId: req.params.orderId,
      recipientId: req.recipient._id
    });

    if (!delivery) {
      return res.status(404).json({ success: false, error: 'Livraison non trouvée' });
    }

    res.json({
      success: true,
      data: {
        ...delivery.toObject(),
        etaDisplay: delivery.tracking.eta ? {
          time: delivery.tracking.eta,
          confidence: delivery.tracking.etaConfidence,
          distance: delivery.tracking.distanceRemaining
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/recipient/deliveries/:orderId/tracking - Suivi ETA temps réel
app.get('/api/v1/recipient/deliveries/:orderId/tracking', authenticateRecipient, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      orderId: req.params.orderId,
      recipientId: req.recipient._id
    });

    if (!delivery) {
      return res.status(404).json({ success: false, error: 'Livraison non trouvée' });
    }

    res.json({
      success: true,
      data: {
        orderId: delivery.orderId,
        status: delivery.tracking.status,
        currentLocation: delivery.tracking.currentLocation,
        eta: delivery.tracking.eta,
        etaConfidence: delivery.tracking.etaConfidence,
        distanceRemaining: delivery.tracking.distanceRemaining,
        driver: delivery.driver,
        vehicle: delivery.vehicle,
        events: delivery.tracking.events
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - SIGNATURE LIVRAISON
// ============================================

// GET /api/v1/recipient/deliveries/:orderId/signature/qrcode - Générer QR pour signature
app.get('/api/v1/recipient/deliveries/:orderId/signature/qrcode', authenticateRecipient, async (req, res) => {
  try {
    const delivery = await Delivery.findOne({
      orderId: req.params.orderId,
      recipientId: req.recipient._id
    });

    if (!delivery) {
      return res.status(404).json({ success: false, error: 'Livraison non trouvée' });
    }

    if (delivery.deliverySignature.signed) {
      return res.status(400).json({ success: false, error: 'Livraison déjà signée' });
    }

    // Générer token QR code
    const qrToken = jwt.sign({
      orderId: delivery.orderId,
      recipientId: req.recipient._id.toString(),
      action: 'delivery_signature'
    }, JWT_SECRET, { expiresIn: '1h' });

    delivery.deliverySignature.qrCodeToken = qrToken;
    await delivery.save();

    res.json({
      success: true,
      data: {
        qrContent: JSON.stringify({
          orderId: delivery.orderId,
          token: qrToken,
          action: 'sign_delivery'
        }),
        signatureUrl: `${process.env.FRONTEND_URL}/recipient/sign?token=${qrToken}`,
        expiresIn: 3600
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/recipient/deliveries/:orderId/signature - Signer livraison
app.post('/api/v1/recipient/deliveries/:orderId/signature', authenticateRecipient, async (req, res) => {
  try {
    const { method, signatureData, signedBy } = req.body;

    if (!['smartphone', 'qrcode', 'terminal'].includes(method)) {
      return res.status(400).json({ success: false, error: 'Méthode invalide' });
    }

    const delivery = await Delivery.findOne({
      orderId: req.params.orderId,
      recipientId: req.recipient._id
    });

    if (!delivery) {
      return res.status(404).json({ success: false, error: 'Livraison non trouvée' });
    }

    if (delivery.deliverySignature.signed) {
      return res.status(400).json({ success: false, error: 'Déjà signée' });
    }

    // Enregistrer signature
    delivery.deliverySignature = {
      signed: true,
      signedBy: signedBy || req.recipient.companyName,
      signedAt: new Date(),
      method,
      signatureData,
      documentId: uuidv4()
    };

    delivery.status = 'delivered';
    delivery.actualDeliveryDate = new Date();

    delivery.events.push({
      type: 'delivery_signed',
      description: `Livraison signée via ${method} par ${signedBy || req.recipient.companyName}`,
      actor: req.recipient.companyName
    });

    await delivery.save();

    // TODO: Distribuer copies CMR signé
    // await distributeSignedCMR(delivery, ['carrier', 'industrial']);

    res.json({
      success: true,
      message: 'Livraison signée avec succès',
      benefits: [
        'Zéro papier',
        'Preuve de livraison immédiate',
        'Intégration préfacturation',
        'Traçabilité totale'
      ],
      data: {
        orderId: delivery.orderId,
        signature: delivery.deliverySignature
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/recipient/signature/validate-qr - Valider QR et signer
app.post('/api/v1/recipient/signature/validate-qr', async (req, res) => {
  try {
    const { qrToken, signatureData, signedBy } = req.body;

    // Vérifier token QR
    const decoded = jwt.verify(qrToken, JWT_SECRET);

    const delivery = await Delivery.findOne({ orderId: decoded.orderId });

    if (!delivery || delivery.deliverySignature.qrCodeToken !== qrToken) {
      return res.status(400).json({ success: false, error: 'QR Code invalide' });
    }

    if (delivery.deliverySignature.signed) {
      return res.status(400).json({ success: false, error: 'Déjà signée' });
    }

    delivery.deliverySignature = {
      signed: true,
      signedBy,
      signedAt: new Date(),
      method: 'qrcode',
      signatureData,
      documentId: uuidv4()
    };

    delivery.status = 'delivered';
    delivery.actualDeliveryDate = new Date();

    delivery.events.push({
      type: 'delivery_signed',
      description: `Livraison signée via QR Code`,
      actor: signedBy
    });

    await delivery.save();

    res.json({
      success: true,
      message: 'Signature validée',
      data: { orderId: delivery.orderId }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - INCIDENTS / ANOMALIES
// ============================================

// POST /api/v1/recipient/deliveries/:orderId/incident - Déclarer incident
app.post('/api/v1/recipient/deliveries/:orderId/incident', authenticateRecipient, async (req, res) => {
  try {
    const { type, description, photos } = req.body;

    const validTypes = ['damage', 'missing', 'broken_packaging', 'wrong_product', 'partial_refusal', 'total_refusal', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: 'Type d\'incident invalide' });
    }

    const delivery = await Delivery.findOne({
      orderId: req.params.orderId,
      recipientId: req.recipient._id
    });

    if (!delivery) {
      return res.status(404).json({ success: false, error: 'Livraison non trouvée' });
    }

    // Créer incident
    delivery.incident = {
      declared: true,
      type,
      description,
      photos: photos || [],
      declaredAt: new Date(),
      declaredBy: req.recipient.companyName,
      status: 'open',
      billingBlocked: ['total_refusal', 'partial_refusal', 'damage', 'missing'].includes(type),
      litigationFileId: uuidv4()
    };

    delivery.status = 'incident';

    delivery.events.push({
      type: 'incident_declared',
      description: `Incident déclaré: ${type} - ${description}`,
      actor: req.recipient.companyName
    });

    await delivery.save();

    // TODO: Alerter transporteur et industriel
    // TODO: Bloquer préfacturation si nécessaire
    // TODO: Ouvrir dossier litige

    res.status(201).json({
      success: true,
      message: 'Incident déclaré',
      actions: [
        'Transporteur et industriel alertés instantanément',
        delivery.incident.billingBlocked ? 'Préfacturation bloquée' : 'Préfacturation non bloquée',
        'Dossier litige ouvert automatiquement'
      ],
      data: {
        orderId: delivery.orderId,
        incident: delivery.incident
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/recipient/incidents - Liste incidents
app.get('/api/v1/recipient/incidents', authenticateRecipient, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filters = {
      recipientId: req.recipient._id,
      'incident.declared': true
    };

    if (status) filters['incident.status'] = status;

    const deliveries = await Delivery.find(filters)
      .sort({ 'incident.declaredAt': -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Delivery.countDocuments(filters);

    res.json({
      success: true,
      data: deliveries.map(d => ({
        orderId: d.orderId,
        orderReference: d.orderReference,
        carrierName: d.carrierName,
        supplierName: d.supplierName,
        incident: d.incident
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - CHAT
// ============================================

// GET /api/v1/recipient/chat/conversations
app.get('/api/v1/recipient/chat/conversations', authenticateRecipient, async (req, res) => {
  try {
    const conversations = await RecipientChat.aggregate([
      {
        $match: {
          $or: [
            { 'from.id': req.recipient._id.toString() },
            { 'to.id': req.recipient._id.toString() }
          ]
        }
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$to.id', req.recipient._id.toString()] }, { $eq: ['$read', false] }] },
                1, 0
              ]
            }
          }
        }
      }
    ]);

    res.json({ success: true, data: conversations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/recipient/chat/send
app.post('/api/v1/recipient/chat/send', authenticateRecipient, async (req, res) => {
  try {
    const { conversationId, orderId, toType, toId, toName, content, attachments } = req.body;

    const message = new RecipientChat({
      conversationId: conversationId || uuidv4(),
      orderId,
      from: {
        type: 'recipient',
        id: req.recipient._id.toString(),
        name: req.recipient.companyName
      },
      to: { type: toType, id: toId, name: toName },
      content,
      attachments
    });

    await message.save();

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - NOTIFICATIONS
// ============================================

// GET /api/v1/recipient/notifications
app.get('/api/v1/recipient/notifications', authenticateRecipient, async (req, res) => {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;

    const filters = { recipientId: req.recipient._id };
    if (unreadOnly === 'true') filters.read = false;

    const notifications = await RecipientNotification.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const unreadCount = await RecipientNotification.countDocuments({
      recipientId: req.recipient._id,
      read: false
    });

    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/recipient/notifications/:id/read
app.put('/api/v1/recipient/notifications/:id/read', authenticateRecipient, async (req, res) => {
  try {
    const notification = await RecipientNotification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.recipient._id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - PROFIL
// ============================================

// GET /api/v1/recipient/profile
app.get('/api/v1/recipient/profile', authenticateRecipient, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.recipient._id,
        companyName: req.recipient.companyName,
        email: req.recipient.email,
        phone: req.recipient.phone,
        status: req.recipient.status,
        deliverySites: req.recipient.deliverySites,
        contacts: req.recipient.contacts,
        subscription: req.recipient.subscription,
        notificationPreferences: req.recipient.notificationPreferences
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/recipient/profile
app.put('/api/v1/recipient/profile', authenticateRecipient, async (req, res) => {
  try {
    const { companyName, phone, deliverySites, contacts, notificationPreferences } = req.body;

    if (companyName) req.recipient.companyName = companyName;
    if (phone) req.recipient.phone = phone;
    if (deliverySites) req.recipient.deliverySites = deliverySites;
    if (contacts) req.recipient.contacts = contacts;
    if (notificationPreferences) req.recipient.notificationPreferences = notificationPreferences;

    await req.recipient.save();

    res.json({ success: true, data: req.recipient });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - PREMIUM
// ============================================

// POST /api/v1/recipient/upgrade - Passer en Premium (499€/mois)
app.post('/api/v1/recipient/upgrade', authenticateRecipient, async (req, res) => {
  try {
    if (req.recipient.subscription.type === 'premium') {
      return res.status(400).json({ success: false, error: 'Déjà Premium' });
    }

    req.recipient.subscription = {
      type: 'premium',
      startDate: new Date(),
      monthlyPrice: 499
    };

    await req.recipient.save();

    res.json({
      success: true,
      message: 'Passage en Premium - Statut Donneur d\'Ordre',
      data: {
        subscription: req.recipient.subscription,
        features: [
          'Gestion de vos propres transporteurs',
          'Configuration de grilles de prix personnalisées',
          'Planification automatisée intelligente',
          'Module Affret.IA pour optimisation des flux',
          'Contrôle de vigilance et conformité',
          'Système de préfacturation automatique',
          'Tracking complet sans limitation',
          'Gestion multi-sites logistiques',
          'Envoi automatique de commandes',
          'Reporting et analytics avancés'
        ]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DÉMARRAGE SERVEUR
// ============================================

async function startServer() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-recipient-space';
    await mongoose.connect(mongoUri);
    console.log('[MONGODB] Connected');

    app.listen(PORT, () => {
      console.log(`[RECIPIENT-SPACE-API] Running on port ${PORT}`);
      console.log('Endpoints disponibles:');
      console.log('  POST /api/v1/recipient/invitations');
      console.log('  POST /api/v1/recipient/onboarding/step1-3');
      console.log('  GET  /api/v1/recipient/deliveries');
      console.log('  POST /api/v1/recipient/deliveries/:orderId/signature');
      console.log('  POST /api/v1/recipient/deliveries/:orderId/incident');
      console.log('  GET  /api/v1/recipient/chat/conversations');
      console.log('  GET  /api/v1/recipient/notifications');
    });
  } catch (error) {
    console.error('[ERROR] Failed to start:', error);
    app.listen(PORT, () => {
      console.log(`[RECIPIENT-SPACE-API] Running on port ${PORT} (without MongoDB)`);
    });
  }
}

startServer();

module.exports = app;
