/**
 * SYMPHONI.A - Espace Fournisseur API
 * Module externe pour la gestion des fournisseurs
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
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'rt-super-secret-jwt-key-2024';

// ============================================
// SCHEMAS MONGOOSE
// ============================================

// Schema Fournisseur (Supplier)
const SupplierSchema = new mongoose.Schema({
  // Informations de base
  companyName: { type: String, required: true },
  siret: { type: String },
  vatNumber: { type: String },
  email: { type: String, required: true, unique: true },
  phone: { type: String },

  // Adresse
  address: {
    street: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' }
  },

  // Statut du compte (Invité, Actif, Incomplet)
  status: {
    type: String,
    enum: ['invited', 'active', 'incomplete', 'suspended'],
    default: 'invited'
  },

  // Contacts (logistique, production, planning)
  contacts: [{
    type: { type: String, enum: ['logistics', 'production', 'planning', 'admin', 'other'] },
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
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
  invitationExpiry: { type: Date },
  lastLogin: { type: Date },

  // Version (gratuit ou premium)
  subscription: {
    type: { type: String, enum: ['free', 'premium'], default: 'free' },
    startDate: Date,
    endDate: Date,
    monthlyPrice: { type: Number, default: 0 }
  },

  // Préférences de notification
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    sms: { type: Boolean, default: false }
  },

  // Documents manquants (pour statut incomplet)
  missingDocuments: [String],

  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Schema Invitation
const InvitationSchema = new mongoose.Schema({
  industrialId: { type: String, required: true },
  industrialName: { type: String },
  supplierEmail: { type: String, required: true },
  supplierCompanyName: { type: String },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['pending', 'accepted', 'expired', 'cancelled'], default: 'pending' },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date },
  sentAt: { type: Date, default: Date.now },
  remindersSent: { type: Number, default: 0 }
}, { timestamps: true });

// Schema Commande Fournisseur (vue fournisseur)
const SupplierOrderSchema = new mongoose.Schema({
  // Référence commande originale
  orderId: { type: String, required: true, index: true },
  orderReference: { type: String },

  // Fournisseur
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },

  // Client industriel
  industrialId: { type: String, required: true },
  industrialName: { type: String },

  // Transporteur
  carrierId: { type: String },
  carrierName: { type: String },

  // Détails commande
  products: [{
    reference: String,
    description: String,
    quantity: Number,
    unit: String,
    weight: Number
  }],

  totalWeight: { type: Number },
  totalPallets: { type: Number },
  totalPackages: { type: Number },

  // État de la commande (À préparer, Prêtes, En cours, Chargées, Litiges)
  status: {
    type: String,
    enum: ['to_prepare', 'ready', 'in_progress', 'loaded', 'dispute'],
    default: 'to_prepare'
  },

  // Créneau de chargement
  loadingSlot: {
    proposedStart: Date,
    proposedEnd: Date,
    validatedStart: Date,
    validatedEnd: Date,
    status: { type: String, enum: ['pending', 'accepted', 'modified', 'rejected'], default: 'pending' },
    supplierResponse: {
      action: { type: String, enum: ['accept', 'modify', 'reject'] },
      alternativeStart: Date,
      alternativeEnd: Date,
      reason: String,
      respondedAt: Date
    }
  },

  // Informations transport
  transport: {
    vehicleType: String,
    vehicleRegistration: String,
    driverName: String,
    driverPhone: String,
    constraints: [String], // ADR, température, etc.
    eta: Date
  },

  // Dates
  expectedDeliveryDate: { type: Date },
  actualLoadingDate: { type: Date },

  // Documents associés
  documents: [{
    type: { type: String, enum: ['BL', 'CMR', 'loading_instructions', 'certificate', 'photo', 'signature', 'other'] },
    name: String,
    url: String,
    uploadedBy: String,
    uploadedAt: Date
  }],

  // Signature de chargement
  loadingSignature: {
    signed: { type: Boolean, default: false },
    signedBy: String,
    signedAt: Date,
    method: { type: String, enum: ['smartphone', 'qrcode', 'terminal'] },
    signatureData: String,
    documentId: String
  },

  // Événements
  events: [{
    type: String,
    description: String,
    timestamp: { type: Date, default: Date.now },
    actor: String
  }]
}, { timestamps: true });

// Schema Chat/Messages
const ChatMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  orderId: { type: String, index: true },

  // Participants
  from: {
    type: { type: String, enum: ['supplier', 'carrier', 'industrial', 'logistician'] },
    id: String,
    name: String
  },
  to: {
    type: { type: String, enum: ['supplier', 'carrier', 'industrial', 'logistician'] },
    id: String,
    name: String
  },

  // Message
  content: { type: String, required: true },
  messageType: { type: String, enum: ['text', 'template', 'document', 'alert'], default: 'text' },
  templateId: { type: String }, // "loading_ready", "production_delay", "missing_documents"

  // Statut
  read: { type: Boolean, default: false },
  readAt: { type: Date },

  // Pièces jointes
  attachments: [{
    name: String,
    url: String,
    type: String
  }]
}, { timestamps: true });

// Schema Notification
const NotificationSchema = new mongoose.Schema({
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  type: { type: String, enum: ['delay_alert', 'loading_confirmation', 'problem_report', 'document_request', 'slot_proposal', 'general'] },
  title: { type: String, required: true },
  message: { type: String, required: true },
  orderId: { type: String },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  channel: { type: String, enum: ['email', 'push', 'internal'], default: 'internal' },
  sentVia: [String] // ['email', 'push']
}, { timestamps: true });

// Modèles
const Supplier = mongoose.model('Supplier', SupplierSchema);
const Invitation = mongoose.model('Invitation', InvitationSchema);
const SupplierOrder = mongoose.model('SupplierOrder', SupplierOrderSchema);
const ChatMessage = mongoose.model('ChatMessage', ChatMessageSchema);
const Notification = mongoose.model('Notification', NotificationSchema);

// ============================================
// MIDDLEWARE AUTH
// ============================================

const authenticateSupplier = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token requis' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const supplier = await Supplier.findById(decoded.supplierId);

    if (!supplier) {
      return res.status(401).json({ success: false, error: 'Fournisseur non trouvé' });
    }

    req.supplier = supplier;
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
    service: 'supplier-space-api',
    version: '1.0.0',
    description: 'Espace Fournisseur SYMPHONI.A',
    features: [
      'Onboarding 3 étapes',
      'Gestion commandes',
      'Validation créneaux',
      'Communication transporteur',
      'Signature électronique chargement',
      'Gestion documents',
      'Chat intégré',
      'Notifications multi-canaux'
    ],
    endpoints: {
      invitations: '/api/v1/supplier/invitations',
      onboarding: '/api/v1/supplier/onboarding',
      orders: '/api/v1/supplier/orders',
      slots: '/api/v1/supplier/slots',
      documents: '/api/v1/supplier/documents',
      signature: '/api/v1/supplier/signature',
      chat: '/api/v1/supplier/chat',
      notifications: '/api/v1/supplier/notifications'
    }
  });
});

// ============================================
// ROUTES - INVITATIONS (Industriel invite Fournisseur)
// ============================================

// POST /api/v1/supplier/invitations - Envoyer invitation
app.post('/api/v1/supplier/invitations', async (req, res) => {
  try {
    const { industrialId, industrialName, supplierEmail, supplierCompanyName } = req.body;

    if (!industrialId || !supplierEmail) {
      return res.status(400).json({ success: false, error: 'industrialId et supplierEmail requis' });
    }

    // Vérifier si invitation existe déjà
    const existingInvitation = await Invitation.findOne({
      industrialId,
      supplierEmail,
      status: 'pending'
    });

    if (existingInvitation) {
      return res.status(400).json({ success: false, error: 'Invitation déjà envoyée' });
    }

    // Créer token unique
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    const invitation = new Invitation({
      industrialId,
      industrialName,
      supplierEmail,
      supplierCompanyName,
      token,
      expiresAt
    });

    await invitation.save();

    // TODO: Envoyer email d'invitation
    // await sendInvitationEmail(supplierEmail, token, industrialName);

    res.status(201).json({
      success: true,
      data: {
        invitationId: invitation._id,
        token,
        expiresAt,
        invitationLink: `${process.env.FRONTEND_URL}/supplier/register?token=${token}`
      }
    });
  } catch (error) {
    console.error('[ERROR] Create invitation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/supplier/invitations/:token - Vérifier invitation
app.get('/api/v1/supplier/invitations/:token', async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ token: req.params.token });

    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation non trouvée' });
    }

    if (invitation.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Invitation déjà utilisée ou expirée' });
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await invitation.save();
      return res.status(400).json({ success: false, error: 'Invitation expirée' });
    }

    res.json({
      success: true,
      data: {
        industrialName: invitation.industrialName,
        supplierEmail: invitation.supplierEmail,
        supplierCompanyName: invitation.supplierCompanyName,
        expiresAt: invitation.expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - ONBOARDING (3 étapes)
// ============================================

// POST /api/v1/supplier/onboarding/step1 - Création compte
app.post('/api/v1/supplier/onboarding/step1', async (req, res) => {
  try {
    const { token, companyName, siret, vatNumber, email, password, address } = req.body;

    // Vérifier invitation
    const invitation = await Invitation.findOne({ token, status: 'pending' });
    if (!invitation) {
      return res.status(400).json({ success: false, error: 'Invitation invalide' });
    }

    // Vérifier si email déjà utilisé
    const existingSupplier = await Supplier.findOne({ email });
    if (existingSupplier) {
      return res.status(400).json({ success: false, error: 'Email déjà utilisé' });
    }

    // Hasher mot de passe
    const passwordHash = await bcrypt.hash(password, 10);

    // Créer fournisseur
    const supplier = new Supplier({
      companyName: companyName || invitation.supplierCompanyName,
      siret,
      vatNumber,
      email: email || invitation.supplierEmail,
      address,
      passwordHash,
      status: 'incomplete', // Passe à incomplete car contacts non configurés
      industrialClients: [{
        industrialId: invitation.industrialId,
        industrialName: invitation.industrialName,
        invitedAt: invitation.sentAt,
        status: 'pending'
      }]
    });

    await supplier.save();

    // Mettre à jour invitation
    invitation.status = 'accepted';
    invitation.acceptedAt = new Date();
    await invitation.save();

    // Générer token JWT
    const authToken = jwt.sign({ supplierId: supplier._id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      step: 1,
      message: 'Compte créé avec succès',
      data: {
        supplierId: supplier._id,
        status: supplier.status,
        token: authToken,
        nextStep: '/api/v1/supplier/onboarding/step2'
      }
    });
  } catch (error) {
    console.error('[ERROR] Onboarding step 1:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/supplier/onboarding/step2 - Configuration contacts
app.post('/api/v1/supplier/onboarding/step2', authenticateSupplier, async (req, res) => {
  try {
    const { contacts } = req.body;

    if (!contacts || contacts.length === 0) {
      return res.status(400).json({ success: false, error: 'Au moins un contact requis' });
    }

    // Valider qu'il y a un contact principal
    const hasMainContact = contacts.some(c => c.isMain);
    if (!hasMainContact) {
      contacts[0].isMain = true;
    }

    req.supplier.contacts = contacts;
    await req.supplier.save();

    res.json({
      success: true,
      step: 2,
      message: 'Contacts configurés avec succès',
      data: {
        contacts: req.supplier.contacts,
        nextStep: '/api/v1/supplier/onboarding/step3'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/supplier/onboarding/step3 - Activation finale
app.post('/api/v1/supplier/onboarding/step3', authenticateSupplier, async (req, res) => {
  try {
    const { phone, notificationPreferences } = req.body;

    if (phone) req.supplier.phone = phone;
    if (notificationPreferences) req.supplier.notificationPreferences = notificationPreferences;

    // Vérifier si tout est complet
    const missingDocuments = [];
    if (!req.supplier.companyName) missingDocuments.push('companyName');
    if (!req.supplier.contacts || req.supplier.contacts.length === 0) missingDocuments.push('contacts');

    if (missingDocuments.length > 0) {
      req.supplier.status = 'incomplete';
      req.supplier.missingDocuments = missingDocuments;
    } else {
      req.supplier.status = 'active';
      req.supplier.missingDocuments = [];

      // Activer relation avec industriel
      req.supplier.industrialClients.forEach(client => {
        if (client.status === 'pending') {
          client.status = 'active';
          client.activatedAt = new Date();
        }
      });
    }

    await req.supplier.save();

    res.json({
      success: true,
      step: 3,
      message: req.supplier.status === 'active' ? 'Compte activé avec succès' : 'Compte incomplet - documents manquants',
      data: {
        status: req.supplier.status,
        missingDocuments: req.supplier.missingDocuments,
        supplier: {
          id: req.supplier._id,
          companyName: req.supplier.companyName,
          email: req.supplier.email,
          status: req.supplier.status
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

// POST /api/v1/supplier/auth/login
app.post('/api/v1/supplier/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const supplier = await Supplier.findOne({ email });
    if (!supplier) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    const isValidPassword = await bcrypt.compare(password, supplier.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect' });
    }

    if (supplier.status === 'suspended') {
      return res.status(403).json({ success: false, error: 'Compte suspendu' });
    }

    supplier.lastLogin = new Date();
    await supplier.save();

    const token = jwt.sign({ supplierId: supplier._id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      success: true,
      data: {
        token,
        supplier: {
          id: supplier._id,
          companyName: supplier.companyName,
          email: supplier.email,
          status: supplier.status,
          subscription: supplier.subscription
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - COMMANDES
// ============================================

// GET /api/v1/supplier/orders - Liste des commandes
app.get('/api/v1/supplier/orders', authenticateSupplier, async (req, res) => {
  try {
    const { status, industrialId, carrierId, sortBy, sortOrder, page = 1, limit = 20 } = req.query;

    const filters = { supplierId: req.supplier._id };
    if (status) filters.status = status;
    if (industrialId) filters.industrialId = industrialId;
    if (carrierId) filters.carrierId = carrierId;

    const sort = {};
    sort[sortBy || 'expectedDeliveryDate'] = sortOrder === 'desc' ? -1 : 1;

    const orders = await SupplierOrder.find(filters)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await SupplierOrder.countDocuments(filters);

    // Stats par statut
    const stats = await SupplierOrder.aggregate([
      { $match: { supplierId: req.supplier._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: orders,
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

// GET /api/v1/supplier/orders/:orderId - Détail commande
app.get('/api/v1/supplier/orders/:orderId', authenticateSupplier, async (req, res) => {
  try {
    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/supplier/orders/:orderId/status - Mettre à jour statut
app.put('/api/v1/supplier/orders/:orderId/status', authenticateSupplier, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    order.status = status;
    order.events.push({
      type: 'status_change',
      description: `Statut changé en: ${status}${notes ? ` - ${notes}` : ''}`,
      actor: req.supplier.companyName
    });

    await order.save();

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - CRÉNEAUX DE CHARGEMENT
// ============================================

// GET /api/v1/supplier/slots/pending - Créneaux à valider
app.get('/api/v1/supplier/slots/pending', authenticateSupplier, async (req, res) => {
  try {
    const orders = await SupplierOrder.find({
      supplierId: req.supplier._id,
      'loadingSlot.status': 'pending'
    }).sort({ 'loadingSlot.proposedStart': 1 });

    res.json({
      success: true,
      data: orders.map(o => ({
        orderId: o.orderId,
        orderReference: o.orderReference,
        industrialName: o.industrialName,
        carrierName: o.carrierName,
        slot: o.loadingSlot,
        transport: o.transport
      })),
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/supplier/slots/:orderId/validate - Valider/Modifier créneau
app.post('/api/v1/supplier/slots/:orderId/validate', authenticateSupplier, async (req, res) => {
  try {
    const { action, alternativeStart, alternativeEnd, reason } = req.body;

    if (!['accept', 'modify', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Action invalide (accept, modify, reject)' });
    }

    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    order.loadingSlot.supplierResponse = {
      action,
      alternativeStart: alternativeStart ? new Date(alternativeStart) : undefined,
      alternativeEnd: alternativeEnd ? new Date(alternativeEnd) : undefined,
      reason,
      respondedAt: new Date()
    };

    if (action === 'accept') {
      order.loadingSlot.status = 'accepted';
      order.loadingSlot.validatedStart = order.loadingSlot.proposedStart;
      order.loadingSlot.validatedEnd = order.loadingSlot.proposedEnd;
    } else if (action === 'modify') {
      order.loadingSlot.status = 'modified';
      order.loadingSlot.validatedStart = new Date(alternativeStart);
      order.loadingSlot.validatedEnd = new Date(alternativeEnd);
    } else {
      order.loadingSlot.status = 'rejected';
    }

    // Ajouter événement
    const eventType = action === 'accept' ? 'fournisseur.rdv.validated' : 'fournisseur.rdv.updated';
    order.events.push({
      type: eventType,
      description: `Créneau ${action === 'accept' ? 'accepté' : action === 'modify' ? 'modifié' : 'refusé'}${reason ? `: ${reason}` : ''}`,
      actor: req.supplier.companyName
    });

    await order.save();

    // TODO: Notifier transporteur et industriel
    // await emitEvent(eventType, { orderId: order.orderId, supplierId: req.supplier._id, action });

    res.json({
      success: true,
      event: eventType,
      data: {
        orderId: order.orderId,
        slot: order.loadingSlot
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - DOCUMENTS
// ============================================

// GET /api/v1/supplier/orders/:orderId/documents - Documents de la commande
app.get('/api/v1/supplier/orders/:orderId/documents', authenticateSupplier, async (req, res) => {
  try {
    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    // Catégoriser documents
    const deposited = order.documents.filter(d => d.uploadedBy === 'supplier');
    const received = order.documents.filter(d => d.uploadedBy !== 'supplier');

    res.json({
      success: true,
      data: {
        deposited, // BL, instructions chargement, certificats
        received,  // CMR, ADR, photos, signatures
        total: order.documents.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/supplier/orders/:orderId/documents - Déposer document
app.post('/api/v1/supplier/orders/:orderId/documents', authenticateSupplier, async (req, res) => {
  try {
    const { type, name, url } = req.body;

    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    order.documents.push({
      type,
      name,
      url,
      uploadedBy: 'supplier',
      uploadedAt: new Date()
    });

    order.events.push({
      type: 'document_uploaded',
      description: `Document déposé: ${name} (${type})`,
      actor: req.supplier.companyName
    });

    await order.save();

    res.status(201).json({
      success: true,
      data: order.documents[order.documents.length - 1]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - SIGNATURE ÉLECTRONIQUE
// ============================================

// POST /api/v1/supplier/orders/:orderId/signature - Signer chargement
app.post('/api/v1/supplier/orders/:orderId/signature', authenticateSupplier, async (req, res) => {
  try {
    const { method, signatureData, signedBy } = req.body;

    if (!['smartphone', 'qrcode', 'terminal'].includes(method)) {
      return res.status(400).json({ success: false, error: 'Méthode de signature invalide' });
    }

    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    if (order.loadingSignature.signed) {
      return res.status(400).json({ success: false, error: 'Chargement déjà signé' });
    }

    order.loadingSignature = {
      signed: true,
      signedBy: signedBy || req.supplier.companyName,
      signedAt: new Date(),
      method,
      signatureData,
      documentId: uuidv4()
    };

    order.status = 'loaded';
    order.actualLoadingDate = new Date();

    order.events.push({
      type: 'loading_signed',
      description: `Chargement signé via ${method}`,
      actor: signedBy || req.supplier.companyName
    });

    await order.save();

    // TODO: Générer document signé et distribuer
    // await generateSignedDocument(order);
    // await distributeDocument(order, ['carrier', 'industrial']);

    res.json({
      success: true,
      message: 'Chargement signé avec succès',
      data: {
        orderId: order.orderId,
        signature: order.loadingSignature
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/supplier/orders/:orderId/signature/qrcode - Générer QR Code
app.get('/api/v1/supplier/orders/:orderId/signature/qrcode', authenticateSupplier, async (req, res) => {
  try {
    const order = await SupplierOrder.findOne({
      orderId: req.params.orderId,
      supplierId: req.supplier._id
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Commande non trouvée' });
    }

    // Générer données pour QR code
    const qrData = {
      orderId: order.orderId,
      supplierId: req.supplier._id.toString(),
      action: 'loading_signature',
      timestamp: Date.now(),
      token: jwt.sign({ orderId: order.orderId, action: 'sign' }, JWT_SECRET, { expiresIn: '1h' })
    };

    res.json({
      success: true,
      data: {
        qrContent: JSON.stringify(qrData),
        signatureUrl: `${process.env.FRONTEND_URL}/supplier/sign?token=${qrData.token}`,
        expiresIn: 3600
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - CHAT
// ============================================

// GET /api/v1/supplier/chat/conversations - Liste conversations
app.get('/api/v1/supplier/chat/conversations', authenticateSupplier, async (req, res) => {
  try {
    // Récupérer les conversations uniques
    const conversations = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { 'from.id': req.supplier._id.toString() },
            { 'to.id': req.supplier._id.toString() }
          ]
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$to.id', req.supplier._id.toString()] }, { $eq: ['$read', false] }] },
                1,
                0
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

// GET /api/v1/supplier/chat/:conversationId - Messages d'une conversation
app.get('/api/v1/supplier/chat/:conversationId', authenticateSupplier, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const messages = await ChatMessage.find({ conversationId: req.params.conversationId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Marquer comme lus
    await ChatMessage.updateMany(
      {
        conversationId: req.params.conversationId,
        'to.id': req.supplier._id.toString(),
        read: false
      },
      { read: true, readAt: new Date() }
    );

    res.json({ success: true, data: messages.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/supplier/chat/send - Envoyer message
app.post('/api/v1/supplier/chat/send', authenticateSupplier, async (req, res) => {
  try {
    const { conversationId, orderId, toType, toId, toName, content, messageType, templateId, attachments } = req.body;

    // Templates prédéfinis
    const templates = {
      loading_ready: 'Chargement prêt - La marchandise est disponible pour enlèvement.',
      production_delay: 'Retard production - Un délai supplémentaire est nécessaire.',
      missing_documents: 'Documents manquants - Merci de fournir les documents suivants.'
    };

    const finalContent = templateId ? templates[templateId] || content : content;

    const message = new ChatMessage({
      conversationId: conversationId || uuidv4(),
      orderId,
      from: {
        type: 'supplier',
        id: req.supplier._id.toString(),
        name: req.supplier.companyName
      },
      to: {
        type: toType,
        id: toId,
        name: toName
      },
      content: finalContent,
      messageType: messageType || 'text',
      templateId,
      attachments
    });

    await message.save();

    // TODO: Notifier destinataire
    // await notifyRecipient(message);

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - NOTIFICATIONS
// ============================================

// GET /api/v1/supplier/notifications - Liste notifications
app.get('/api/v1/supplier/notifications', authenticateSupplier, async (req, res) => {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;

    const filters = { supplierId: req.supplier._id };
    if (unreadOnly === 'true') filters.read = false;

    const notifications = await Notification.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const unreadCount = await Notification.countDocuments({ supplierId: req.supplier._id, read: false });

    res.json({
      success: true,
      data: notifications,
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/supplier/notifications/:id/read - Marquer comme lu
app.put('/api/v1/supplier/notifications/:id/read', authenticateSupplier, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, supplierId: req.supplier._id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification non trouvée' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - PROFIL & PARAMÈTRES
// ============================================

// GET /api/v1/supplier/profile - Profil fournisseur
app.get('/api/v1/supplier/profile', authenticateSupplier, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.supplier._id,
        companyName: req.supplier.companyName,
        siret: req.supplier.siret,
        vatNumber: req.supplier.vatNumber,
        email: req.supplier.email,
        phone: req.supplier.phone,
        address: req.supplier.address,
        status: req.supplier.status,
        contacts: req.supplier.contacts,
        industrialClients: req.supplier.industrialClients,
        subscription: req.supplier.subscription,
        notificationPreferences: req.supplier.notificationPreferences
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/supplier/profile - Mettre à jour profil
app.put('/api/v1/supplier/profile', authenticateSupplier, async (req, res) => {
  try {
    const { companyName, phone, address, contacts, notificationPreferences } = req.body;

    if (companyName) req.supplier.companyName = companyName;
    if (phone) req.supplier.phone = phone;
    if (address) req.supplier.address = address;
    if (contacts) req.supplier.contacts = contacts;
    if (notificationPreferences) req.supplier.notificationPreferences = notificationPreferences;

    await req.supplier.save();

    res.json({ success: true, data: req.supplier });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROUTES - PREMIUM UPGRADE
// ============================================

// POST /api/v1/supplier/upgrade - Passer en Premium
app.post('/api/v1/supplier/upgrade', authenticateSupplier, async (req, res) => {
  try {
    if (req.supplier.subscription.type === 'premium') {
      return res.status(400).json({ success: false, error: 'Déjà en version Premium' });
    }

    req.supplier.subscription = {
      type: 'premium',
      startDate: new Date(),
      monthlyPrice: 499
    };

    await req.supplier.save();

    res.json({
      success: true,
      message: 'Passage en Premium effectué',
      data: {
        subscription: req.supplier.subscription,
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
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-supplier-space';
    await mongoose.connect(mongoUri);
    console.log('[MONGODB] Connected');

    app.listen(PORT, () => {
      console.log(`[SUPPLIER-SPACE-API] Running on port ${PORT}`);
      console.log('Endpoints disponibles:');
      console.log('  POST /api/v1/supplier/invitations');
      console.log('  POST /api/v1/supplier/onboarding/step1-3');
      console.log('  GET  /api/v1/supplier/orders');
      console.log('  POST /api/v1/supplier/slots/:orderId/validate');
      console.log('  POST /api/v1/supplier/orders/:orderId/signature');
      console.log('  GET  /api/v1/supplier/chat/conversations');
      console.log('  GET  /api/v1/supplier/notifications');
    });
  } catch (error) {
    console.error('[ERROR] Failed to start:', error);
    app.listen(PORT, () => {
      console.log(`[SUPPLIER-SPACE-API] Running on port ${PORT} (without MongoDB)`);
    });
  }
}

startServer();

module.exports = app;
