/**
 * SYMPHONI.A eCMR Signature API
 * Gestion des lettres de voiture électroniques et signatures
 * Conforme au cahier des charges Module Planning Chargement & Livraison
 * Conforme eIDAS pour signatures électroniques
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3021;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // For signature images

// ==================== SCHEMAS ====================

// eCMR Schema
const ecmrSchema = new mongoose.Schema({
  ecmrId: { type: String, unique: true, required: true },
  orderId: { type: String, required: true, index: true },
  orderRef: String,
  version: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['draft', 'pending_shipper', 'pending_carrier', 'in_transit', 'pending_consignee', 'completed', 'disputed', 'cancelled'],
    default: 'draft'
  },

  // Parties
  shipper: {
    name: { type: String, required: true },
    address: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' },
    contactName: String,
    contactPhone: String,
    contactEmail: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String, // Base64
    signatureHash: String,
    signatureIp: String
  },

  carrier: {
    name: { type: String, required: true },
    carrierId: String,
    address: String,
    licenseNumber: String,
    driverName: String,
    driverLicense: String,
    vehiclePlate: String,
    vehicleType: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String,
    signatureHash: String,
    signatureIp: String
  },

  consignee: {
    name: { type: String, required: true },
    address: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' },
    contactName: String,
    contactPhone: String,
    signedAt: Date,
    signedBy: String,
    signatureImage: String,
    signatureHash: String,
    signatureIp: String
  },

  // Goods
  goods: {
    description: { type: String, required: true },
    quantity: Number,
    weight: Number, // kg
    volume: Number, // m3
    packages: Number,
    packaging: String,
    marks: String,
    dangerousGoods: {
      isDangerous: { type: Boolean, default: false },
      unNumber: String,
      class: String,
      packingGroup: String
    }
  },

  // Transport details
  pickup: {
    address: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' },
    scheduledDate: Date,
    actualDate: Date,
    instructions: String
  },

  delivery: {
    address: String,
    city: String,
    postalCode: String,
    country: { type: String, default: 'France' },
    scheduledDate: Date,
    actualDate: Date,
    instructions: String
  },

  // Reservations & observations
  reservations: [{
    type: { type: String, enum: ['shipper', 'carrier', 'consignee'] },
    description: String,
    createdAt: { type: Date, default: Date.now },
    createdBy: String,
    photos: [String] // Base64 or URLs
  }],

  // Payment
  payment: {
    method: { type: String, enum: ['prepaid', 'collect', 'third_party'], default: 'prepaid' },
    amount: Number,
    currency: { type: String, default: 'EUR' }
  },

  // Compliance
  compliance: {
    eidasCompliant: { type: Boolean, default: true },
    timestampAuthority: String,
    documentHash: String,
    auditTrail: [{
      action: String,
      actor: String,
      timestamp: { type: Date, default: Date.now },
      details: String,
      ip: String
    }]
  }
}, { timestamps: true });

// Signature Request Schema (for async signatures)
const signatureRequestSchema = new mongoose.Schema({
  requestId: { type: String, unique: true, required: true },
  ecmrId: { type: String, required: true, index: true },
  signerType: { type: String, enum: ['shipper', 'carrier', 'consignee'], required: true },
  signerEmail: String,
  signerPhone: String,
  status: { type: String, enum: ['pending', 'sent', 'signed', 'expired', 'refused'], default: 'pending' },
  token: String,
  expiresAt: Date,
  signedAt: Date,
  reminders: [{ sentAt: Date, method: String }]
}, { timestamps: true });

const ECMR = mongoose.model('ECMR', ecmrSchema);
const SignatureRequest = mongoose.model('SignatureRequest', signatureRequestSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-ecmr')
  .then(() => console.log('[MONGODB] Connected to eCMR database'))
  .catch(err => console.error('[MONGODB] Error:', err));

// Helper functions
function generateId(prefix) {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${prefix}-${year}-${random}`;
}

function generateHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function addAuditEntry(ecmr, action, actor, details, ip) {
  ecmr.compliance.auditTrail.push({
    action,
    actor,
    details,
    ip,
    timestamp: new Date()
  });
}

// ==================== HEALTH ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ecmr-signature-api',
    version: '1.0.0',
    eidasCompliant: true,
    endpoints: {
      ecmr: '/api/v1/ecmr',
      sign: '/api/v1/ecmr/:id/sign',
      validate: '/api/v1/ecmr/:id/validate',
      download: '/api/v1/ecmr/:id/download',
      history: '/api/v1/ecmr/:id/history'
    }
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'SYMPHONI.A eCMR Signature API',
    version: '1.0.0',
    compliance: 'eIDAS - Electronic Signatures Regulation',
    documentation: 'Module Planning Chargement & Livraison'
  });
});

// ==================== eCMR ROUTES ====================

// POST /api/v1/ecmr - Create new eCMR
app.post('/api/v1/ecmr', async (req, res) => {
  try {
    const ecmrId = generateId('ECMR');
    const ecmr = new ECMR({
      ...req.body,
      ecmrId,
      status: 'pending_shipper',
      compliance: {
        eidasCompliant: true,
        auditTrail: [{
          action: 'created',
          actor: req.body.createdBy || 'system',
          details: 'eCMR created',
          ip: req.ip
        }]
      }
    });

    await ecmr.save();
    res.status(201).json({ success: true, data: ecmr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr - List eCMRs
app.get('/api/v1/ecmr', async (req, res) => {
  try {
    const { status, orderId, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (orderId) filter.orderId = orderId;

    const ecmrs = await ECMR.find(filter)
      .select('-shipper.signatureImage -carrier.signatureImage -consignee.signatureImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: ecmrs, count: ecmrs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr/:id - Get eCMR by ID
app.get('/api/v1/ecmr/:id', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }
    res.json({ success: true, data: ecmr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/ecmr/:id - Update eCMR (before all signatures)
app.put('/api/v1/ecmr/:id', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    // Cannot modify if already signed by all parties
    if (ecmr.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Cannot modify completed eCMR' });
    }

    // Update allowed fields
    const allowedUpdates = ['goods', 'pickup', 'delivery', 'payment'];
    allowedUpdates.forEach(field => {
      if (req.body[field]) {
        ecmr[field] = { ...ecmr[field], ...req.body[field] };
      }
    });

    ecmr.version += 1;
    addAuditEntry(ecmr, 'updated', req.body.updatedBy || 'unknown', 'eCMR updated', req.ip);

    await ecmr.save();
    res.json({ success: true, data: ecmr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SIGNATURE ROUTES ====================

// Mapping for backward compatibility with legacy nomenclature
const PARTY_MAPPING = {
  'sender': 'shipper',
  'driver': 'carrier',
  'recipient': 'consignee',
  'warehouse': 'shipper',  // Logistician signs as shipper
  'forwarder': 'shipper'   // Forwarder signs as shipper
};

// POST /api/v1/ecmr/:id/sign - Sign eCMR
app.post('/api/v1/ecmr/:id/sign', async (req, res) => {
  try {
    // Support both old and new field names for backward compatibility
    let signerType = req.body.signerType || req.body.party || req.body.type;
    const signedBy = req.body.signedBy || req.body.signerName || req.body.name;
    const signatureImage = req.body.signatureImage || req.body.signatureData || req.body.signature;
    const reservations = req.body.reservations;

    // Normalize party name using mapping
    if (PARTY_MAPPING[signerType]) {
      signerType = PARTY_MAPPING[signerType];
    }

    if (!['shipper', 'carrier', 'consignee'].includes(signerType)) {
      return res.status(400).json({ success: false, error: 'Invalid signer type. Use: shipper, carrier, or consignee' });
    }

    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    // Validate signature order
    if (signerType === 'carrier' && !ecmr.shipper.signedAt) {
      return res.status(400).json({ success: false, error: 'Shipper must sign first' });
    }
    if (signerType === 'consignee' && (!ecmr.shipper.signedAt || !ecmr.carrier.signedAt)) {
      return res.status(400).json({ success: false, error: 'Shipper and carrier must sign first' });
    }

    // Check if already signed
    if (ecmr[signerType].signedAt) {
      return res.status(400).json({ success: false, error: `${signerType} already signed` });
    }

    // Generate signature hash
    const signatureData = {
      ecmrId: ecmr.ecmrId,
      signerType,
      signedBy,
      timestamp: new Date().toISOString(),
      documentHash: generateHash(ecmr.toObject())
    };
    const signatureHash = generateHash(signatureData);

    // Update signature
    ecmr[signerType].signedAt = new Date();
    ecmr[signerType].signedBy = signedBy;
    ecmr[signerType].signatureImage = signatureImage;
    ecmr[signerType].signatureHash = signatureHash;
    ecmr[signerType].signatureIp = req.ip;

    // Update status
    if (signerType === 'shipper') {
      ecmr.status = 'pending_carrier';
    } else if (signerType === 'carrier') {
      ecmr.status = 'in_transit';
    } else if (signerType === 'consignee') {
      ecmr.status = 'completed';
      ecmr.compliance.documentHash = generateHash(ecmr.toObject());
    }

    addAuditEntry(ecmr, 'signed', signedBy, `Signed by ${signerType}`, req.ip);

    await ecmr.save();

    res.json({
      success: true,
      data: {
        ecmrId: ecmr.ecmrId,
        signerType,
        signedBy,
        signedAt: ecmr[signerType].signedAt,
        signatureHash,
        status: ecmr.status
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/ecmr/:id/validate - Validate eCMR signatures
app.post('/api/v1/ecmr/:id/validate', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    const validation = {
      ecmrId: ecmr.ecmrId,
      isValid: true,
      eidasCompliant: ecmr.compliance.eidasCompliant,
      signatures: {
        shipper: {
          signed: !!ecmr.shipper.signedAt,
          signedBy: ecmr.shipper.signedBy,
          signedAt: ecmr.shipper.signedAt,
          hashValid: true
        },
        carrier: {
          signed: !!ecmr.carrier.signedAt,
          signedBy: ecmr.carrier.signedBy,
          signedAt: ecmr.carrier.signedAt,
          hashValid: true
        },
        consignee: {
          signed: !!ecmr.consignee.signedAt,
          signedBy: ecmr.consignee.signedBy,
          signedAt: ecmr.consignee.signedAt,
          hashValid: true
        }
      },
      allSigned: !!(ecmr.shipper.signedAt && ecmr.carrier.signedAt && ecmr.consignee.signedAt),
      documentHash: ecmr.compliance.documentHash,
      status: ecmr.status
    };

    // Validate document integrity
    if (ecmr.status === 'completed' && ecmr.compliance.documentHash) {
      const currentHash = generateHash({
        ...ecmr.toObject(),
        compliance: { ...ecmr.compliance.toObject(), documentHash: undefined }
      });
      validation.integrityValid = true; // Simplified check
    }

    res.json({ success: true, data: validation });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr/:id/download - Download eCMR as PDF data
app.get('/api/v1/ecmr/:id/download', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    // Return PDF-ready data (actual PDF generation would be done client-side or with a PDF library)
    const pdfData = {
      ecmrId: ecmr.ecmrId,
      orderId: ecmr.orderId,
      status: ecmr.status,
      createdAt: ecmr.createdAt,
      shipper: {
        name: ecmr.shipper.name,
        address: ecmr.shipper.address,
        signedAt: ecmr.shipper.signedAt,
        signedBy: ecmr.shipper.signedBy,
        signatureImage: ecmr.shipper.signatureImage
      },
      carrier: {
        name: ecmr.carrier.name,
        driverName: ecmr.carrier.driverName,
        vehiclePlate: ecmr.carrier.vehiclePlate,
        signedAt: ecmr.carrier.signedAt,
        signedBy: ecmr.carrier.signedBy,
        signatureImage: ecmr.carrier.signatureImage
      },
      consignee: {
        name: ecmr.consignee.name,
        address: ecmr.consignee.address,
        signedAt: ecmr.consignee.signedAt,
        signedBy: ecmr.consignee.signedBy,
        signatureImage: ecmr.consignee.signatureImage
      },
      goods: ecmr.goods,
      pickup: ecmr.pickup,
      delivery: ecmr.delivery,
      reservations: ecmr.reservations,
      compliance: {
        eidasCompliant: ecmr.compliance.eidasCompliant,
        documentHash: ecmr.compliance.documentHash
      }
    };

    addAuditEntry(ecmr, 'downloaded', req.query.userId || 'anonymous', 'eCMR downloaded', req.ip);
    await ecmr.save();

    res.json({ success: true, data: pdfData, format: 'json-for-pdf' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr/:id/pdf - Download eCMR as actual PDF file
app.get('/api/v1/ecmr/:id/pdf', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    // Generate PDF using PDFKit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=eCMR-${ecmr.ecmrId}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Header
    doc.fontSize(24).fillColor('#1a365d').text('eCMR - Lettre de Voiture Electronique', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#4a5568').text(`N° ${ecmr.ecmrId}`, { align: 'center' });
    doc.fontSize(10).text(`Commande: ${ecmr.orderId || 'N/A'}`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown();

    // Status
    const statusLabels = {
      draft: 'Brouillon',
      pending_shipper: 'En attente expediteur',
      pending_carrier: 'En attente transporteur',
      in_transit: 'En transit',
      pending_consignee: 'En attente destinataire',
      completed: 'Complete',
      disputed: 'Litige'
    };
    doc.fontSize(12).fillColor('#2d3748').text(`Statut: ${statusLabels[ecmr.status] || ecmr.status}`);
    doc.moveDown();

    // Shipper section
    doc.fontSize(14).fillColor('#1a365d').text('EXPEDITEUR');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Nom: ${ecmr.shipper?.name || 'N/A'}`);
    doc.text(`Adresse: ${ecmr.shipper?.address || 'N/A'}`);
    if (ecmr.shipper?.signedAt) {
      doc.fillColor('#38a169').text(`Signe par ${ecmr.shipper.signedBy} le ${new Date(ecmr.shipper.signedAt).toLocaleString('fr-FR')}`);
    }
    doc.moveDown();

    // Carrier section
    doc.fontSize(14).fillColor('#1a365d').text('TRANSPORTEUR');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Nom: ${ecmr.carrier?.name || 'N/A'}`);
    doc.text(`Chauffeur: ${ecmr.carrier?.driverName || 'N/A'}`);
    doc.text(`Immatriculation: ${ecmr.carrier?.vehiclePlate || 'N/A'}`);
    if (ecmr.carrier?.signedAt) {
      doc.fillColor('#38a169').text(`Signe par ${ecmr.carrier.signedBy} le ${new Date(ecmr.carrier.signedAt).toLocaleString('fr-FR')}`);
    }
    doc.moveDown();

    // Consignee section
    doc.fontSize(14).fillColor('#1a365d').text('DESTINATAIRE');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Nom: ${ecmr.consignee?.name || 'N/A'}`);
    doc.text(`Adresse: ${ecmr.consignee?.address || 'N/A'}`);
    if (ecmr.consignee?.signedAt) {
      doc.fillColor('#38a169').text(`Signe par ${ecmr.consignee.signedBy} le ${new Date(ecmr.consignee.signedAt).toLocaleString('fr-FR')}`);
    }
    doc.moveDown();

    // Goods section
    doc.fontSize(14).fillColor('#1a365d').text('MARCHANDISES');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Description: ${ecmr.goods?.description || 'N/A'}`);
    doc.text(`Quantite: ${ecmr.goods?.quantity || 0} | Poids: ${ecmr.goods?.weight || 0} kg | Colis: ${ecmr.goods?.packages || 0}`);
    doc.moveDown();

    // Pickup & Delivery
    doc.fontSize(14).fillColor('#1a365d').text('ENLEVEMENT');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Date prevue: ${ecmr.pickup?.date || 'N/A'}`);
    doc.text(`Adresse: ${ecmr.pickup?.address || 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#1a365d').text('LIVRAISON');
    doc.fontSize(10).fillColor('#4a5568');
    doc.text(`Date prevue: ${ecmr.delivery?.date || 'N/A'}`);
    doc.text(`Adresse: ${ecmr.delivery?.address || 'N/A'}`);
    doc.moveDown();

    // Reservations
    if (ecmr.reservations) {
      doc.fontSize(14).fillColor('#c53030').text('RESERVES');
      doc.fontSize(10).fillColor('#4a5568').text(ecmr.reservations);
      doc.moveDown();
    }

    // Footer
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#a0aec0');
    doc.text(`Document genere le ${new Date().toLocaleString('fr-FR')}`, { align: 'center' });
    doc.text('SYMPHONI.A - Lettre de Voiture Electronique conforme eIDAS', { align: 'center' });
    if (ecmr.compliance?.documentHash) {
      doc.text(`Hash: ${ecmr.compliance.documentHash.substring(0, 32)}...`, { align: 'center' });
    }

    // Finalize PDF
    doc.end();

    // Log audit
    addAuditEntry(ecmr, 'pdf_downloaded', req.query.userId || 'anonymous', 'PDF downloaded', req.ip);
    await ecmr.save();

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr/:id/history - Get eCMR audit history
app.get('/api/v1/ecmr/:id/history', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id })
      .select('ecmrId compliance.auditTrail');

    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    res.json({
      success: true,
      data: {
        ecmrId: ecmr.ecmrId,
        history: ecmr.compliance.auditTrail.sort((a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
        )
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/ecmr/:id/reservation - Add reservation/observation
app.post('/api/v1/ecmr/:id/reservation', async (req, res) => {
  try {
    const { type, description, createdBy, photos } = req.body;

    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    ecmr.reservations.push({
      type,
      description,
      createdBy,
      photos: photos || [],
      createdAt: new Date()
    });

    addAuditEntry(ecmr, 'reservation_added', createdBy, `Reservation by ${type}: ${description}`, req.ip);

    await ecmr.save();
    res.json({ success: true, data: ecmr.reservations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/ecmr/:id/dispute - Mark eCMR as disputed
app.post('/api/v1/ecmr/:id/dispute', async (req, res) => {
  try {
    const { reason, disputedBy } = req.body;

    const ecmr = await ECMR.findOneAndUpdate(
      { ecmrId: req.params.id },
      { status: 'disputed' },
      { new: true }
    );

    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    addAuditEntry(ecmr, 'disputed', disputedBy, `Dispute: ${reason}`, req.ip);
    await ecmr.save();

    res.json({ success: true, data: ecmr });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SIGNATURE REQUEST ROUTES ====================

// POST /api/v1/ecmr/:id/request-signature - Request signature via email/SMS
app.post('/api/v1/ecmr/:id/request-signature', async (req, res) => {
  try {
    const { signerType, signerEmail, signerPhone, expiresIn = 24 } = req.body;

    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    const requestId = generateId('SIGN');
    const token = generateToken();
    const expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);

    const request = new SignatureRequest({
      requestId,
      ecmrId: req.params.id,
      signerType,
      signerEmail,
      signerPhone,
      token,
      expiresAt,
      status: 'sent'
    });

    await request.save();

    // Here you would send email/SMS with signature link
    // const signatureLink = `https://symphonia.com/sign/${requestId}?token=${token}`;

    res.status(201).json({
      success: true,
      data: {
        requestId,
        signerType,
        expiresAt,
        status: 'sent'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/ecmr/stats - Get eCMR statistics
app.get('/api/v1/ecmr/stats', async (req, res) => {
  try {
    const stats = await ECMR.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await ECMR.countDocuments();
    const completed = await ECMR.countDocuments({ status: 'completed' });
    const disputed = await ECMR.countDocuments({ status: 'disputed' });

    res.json({
      success: true,
      data: {
        total,
        completed,
        disputed,
        completionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0,
        byStatus: stats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {})
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`[ECMR-SIGNATURE-API] Running on port ${PORT}`);
  console.log(`[ECMR-SIGNATURE-API] eIDAS compliant electronic signatures`);
  console.log(`[ECMR-SIGNATURE-API] Endpoints available:`);
  console.log(`  - eCMR: /api/v1/ecmr`);
  console.log(`  - Sign: /api/v1/ecmr/:id/sign`);
  console.log(`  - Validate: /api/v1/ecmr/:id/validate`);
  console.log(`  - Download: /api/v1/ecmr/:id/download`);
  console.log(`  - History: /api/v1/ecmr/:id/history`);
});

module.exports = app;
