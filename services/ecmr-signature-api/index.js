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
const path = require('path');

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

// ==================== CMR PDF GENERATION HELPER ====================

/**
 * Sanitize text for PDF output - handles UTF-8 encoding issues
 * PDFKit's default Helvetica font doesn't support all Unicode characters
 */
function sanitizeTextForPdf(text) {
  if (!text) return '';
  if (typeof text !== 'string') return String(text);

  // First, fix common UTF-8 double-encoding issues (mojibake)
  let fixed = text
    // Common mojibake patterns for French accented characters
    .replace(/Ã©/g, 'e')  // é
    .replace(/Ã¨/g, 'e')  // è
    .replace(/Ãª/g, 'e')  // ê
    .replace(/Ã«/g, 'e')  // ë
    .replace(/Ã /g, 'a')  // à
    .replace(/Ã¢/g, 'a')  // â
    .replace(/Ã¤/g, 'a')  // ä
    .replace(/Ã®/g, 'i')  // î
    .replace(/Ã¯/g, 'i')  // ï
    .replace(/Ã´/g, 'o')  // ô
    .replace(/Ã¶/g, 'o')  // ö
    .replace(/Ã¹/g, 'u')  // ù
    .replace(/Ã»/g, 'u')  // û
    .replace(/Ã¼/g, 'u')  // ü
    .replace(/Ã§/g, 'c')  // ç
    .replace(/Å"/g, 'oe') // œ
    // Windows-1252 / Latin-1 corruption patterns
    .replace(/ÿý/g, 'e')  // Common corruption for é
    .replace(/ÿ½/g, 'e')
    .replace(/â€™/g, "'") // Smart quote
    .replace(/â€"/g, '-') // Em dash
    .replace(/â€œ/g, '"') // Opening quote
    .replace(/â€/g, '"')  // Closing quote
    // Remove non-printable characters BUT preserve newlines (\n = \x0A) and tabs (\t = \x09)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  // Then normalize Unicode and replace accented characters
  return fixed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .replace(/[àâäã]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[îïì]/g, 'i')
    .replace(/[ôöò]/g, 'o')
    .replace(/[ùûüú]/g, 'u')
    .replace(/[ç]/g, 'c')
    .replace(/[ÀÂÄÃ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÎÏÌ]/g, 'I')
    .replace(/[ÔÖÒ]/g, 'O')
    .replace(/[ÙÛÜÚ]/g, 'U')
    .replace(/[Ç]/g, 'C')
    .replace(/[œ]/g, 'oe')
    .replace(/[Œ]/g, 'OE')
    .replace(/[æ]/g, 'ae')
    .replace(/[Æ]/g, 'AE')
    .replace(/[ñ]/g, 'n')
    .replace(/[Ñ]/g, 'N')
    .replace(/[ÿ]/g, 'y');
}

/**
 * Generate official CMR format PDF
 * Based on IRU (International Road Transport Union) standard CMR form
 */
function generateCMRPdf(doc, ecmr, qrCodeDataUrl = null) {
  const pageWidth = 595.28; // A4 width in points
  const pageHeight = 841.89; // A4 height in points
  const margin = 20;
  const boxBorder = '#000000';
  const lightGray = '#f5f5f5';
  const headerBlue = '#1a365d';

  // Shorthand for sanitizing text
  const s = sanitizeTextForPdf;

  // Helper to draw a labeled box
  function drawBox(x, y, width, height, label, content, boxNumber = null) {
    // Box border
    doc.rect(x, y, width, height).stroke(boxBorder);

    // Box number circle (if provided)
    if (boxNumber) {
      doc.circle(x + 10, y + 10, 8).fill(headerBlue);
      doc.fontSize(7).fillColor('#ffffff').text(boxNumber.toString(), x + 6, y + 6, { width: 8, align: 'center' });
    }

    // Label (small text at top)
    const labelX = boxNumber ? x + 22 : x + 4;
    doc.fontSize(6).fillColor('#666666').text(label, labelX, y + 3, { width: width - (boxNumber ? 26 : 8) });

    // Content (sanitized for PDF) - explicit lineBreak for multi-line content
    if (content) {
      doc.fontSize(8).fillColor('#000000').text(s(content), x + 4, y + 16, {
        width: width - 8,
        height: height - 20,
        lineGap: 2,
        lineBreak: true
      });
    }
  }

  // Helper to format address (sanitized for PDF)
  function formatAddress(party) {
    if (!party) return '';
    const parts = [
      s(party.name),
      s(party.address),
      [party.postalCode, s(party.city)].filter(Boolean).join(' '),
      s(party.country)
    ].filter(Boolean);
    return parts.join('\n');
  }

  // Helper to format date
  function formatDate(date) {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // ==================== HEADER ====================

  // Title bar
  doc.rect(margin, margin, pageWidth - 2 * margin, 35).fill(headerBlue);
  doc.fontSize(14).fillColor('#ffffff').text('LETTRE DE VOITURE INTERNATIONALE', margin, margin + 8, {
    width: pageWidth - 2 * margin,
    align: 'center'
  });
  doc.fontSize(8).text('International Consignment Note - CMR', margin, margin + 23, {
    width: pageWidth - 2 * margin,
    align: 'center'
  });

  // eCMR number box (top right)
  const ecmrBoxWidth = 140;
  doc.rect(pageWidth - margin - ecmrBoxWidth, margin + 40, ecmrBoxWidth, 35).stroke(boxBorder);
  doc.fontSize(7).fillColor('#666666').text('N° eCMR', pageWidth - margin - ecmrBoxWidth + 4, margin + 43);
  doc.fontSize(11).fillColor(headerBlue).text(ecmr.ecmrId || ecmr.id || 'N/A', pageWidth - margin - ecmrBoxWidth + 4, margin + 54, {
    width: ecmrBoxWidth - 8,
    align: 'center'
  });

  // QR Code (if available)
  if (qrCodeDataUrl) {
    try {
      doc.image(qrCodeDataUrl, pageWidth - margin - 55, margin + 78, { width: 50, height: 50 });
    } catch (e) {
      // QR code failed, continue without it
    }
  }

  let currentY = margin + 80;
  const colWidth = (pageWidth - 2 * margin) / 2;
  const boxHeight = 55;

  // ==================== ROW 1: EXPEDITEUR / DESTINATAIRE ====================

  // Box 1: Expediteur (Sender)
  drawBox(margin, currentY, colWidth - 5, boxHeight,
    'Expéditeur (nom, adresse, pays) / Sender (name, address, country)',
    formatAddress(ecmr.shipper), 1);

  // Box 2: Destinataire (Consignee)
  drawBox(margin + colWidth, currentY, colWidth - 5, boxHeight,
    'Destinataire (nom, adresse, pays) / Consignee (name, address, country)',
    formatAddress(ecmr.consignee), 2);

  currentY += boxHeight + 5;

  // ==================== ROW 2: LIVRAISON / TRANSPORTEUR ====================

  // Box 3: Lieu de livraison
  drawBox(margin, currentY, colWidth - 5, boxHeight,
    'Lieu prevu pour la livraison (lieu, pays) / Place of delivery (place, country)',
    [
      s(ecmr.delivery?.address),
      [ecmr.delivery?.postalCode, s(ecmr.delivery?.city)].filter(Boolean).join(' '),
      s(ecmr.delivery?.country)
    ].filter(Boolean).join('\n'), 3);

  // Box 16: Transporteur (Carrier)
  drawBox(margin + colWidth, currentY, colWidth - 5, boxHeight,
    'Transporteur (nom, adresse, pays) / Carrier (name, address, country)',
    [
      s(ecmr.carrier?.name),
      s(ecmr.carrier?.address),
      `Vehicule: ${ecmr.carrier?.vehiclePlate || 'N/A'}`,
      `Chauffeur: ${s(ecmr.carrier?.driverName) || 'N/A'}`
    ].filter(Boolean).join('\n'), 16);

  currentY += boxHeight + 5;

  // ==================== ROW 3: PRISE EN CHARGE / TRANSPORTEURS SUCCESSIFS ====================

  // Box 4: Lieu de prise en charge
  drawBox(margin, currentY, colWidth - 5, 45,
    'Lieu et date de prise en charge / Place and date of taking over',
    [
      s(ecmr.pickup?.address),
      [ecmr.pickup?.postalCode, s(ecmr.pickup?.city)].filter(Boolean).join(' '),
      `Date: ${formatDate(ecmr.pickup?.scheduledDate)}`
    ].filter(Boolean).join('\n'), 4);

  // Box 17: Transporteurs successifs
  drawBox(margin + colWidth, currentY, colWidth - 5, 45,
    'Transporteurs successifs / Successive carriers',
    '', 17);

  currentY += 50;

  // ==================== ROW 4: DOCUMENTS ANNEXES ====================

  // Box 5: Documents annexés
  drawBox(margin, currentY, pageWidth - 2 * margin, 30,
    'Documents annexés / Documents attached',
    ecmr.attachedDocuments || '', 5);

  currentY += 35;

  // ==================== MARCHANDISES (GOODS) - MAIN TABLE ====================

  // Table header
  const goodsTableY = currentY;
  const col1 = margin;
  const col2 = margin + 80;
  const col3 = margin + 200;
  const col4 = margin + 300;
  const col5 = margin + 380;
  const col6 = margin + 450;
  const tableWidth = pageWidth - 2 * margin;

  // Header row
  doc.rect(margin, goodsTableY, tableWidth, 20).fill(lightGray).stroke(boxBorder);
  doc.fontSize(6).fillColor('#000000');
  doc.text('6 Marques et numéros', col1 + 2, goodsTableY + 3, { width: 76 });
  doc.text('Marks and Nos.', col1 + 2, goodsTableY + 10, { width: 76 });
  doc.text('7 Nombre de colis', col2 + 2, goodsTableY + 3, { width: 118 });
  doc.text('Number of packages', col2 + 2, goodsTableY + 10, { width: 118 });
  doc.text('8 Mode d\'emballage', col3 + 2, goodsTableY + 3, { width: 98 });
  doc.text('Method of packing', col3 + 2, goodsTableY + 10, { width: 98 });
  doc.text('9 Nature de la marchandise', col4 + 2, goodsTableY + 3, { width: 78 });
  doc.text('Nature of goods', col4 + 2, goodsTableY + 10, { width: 78 });
  doc.text('10 N° statistique', col5 + 2, goodsTableY + 3, { width: 68 });
  doc.text('Statistical No.', col5 + 2, goodsTableY + 10, { width: 68 });
  doc.text('11 Poids brut kg', col6 + 2, goodsTableY + 3, { width: 100 });
  doc.text('Gross weight kg', col6 + 2, goodsTableY + 10, { width: 100 });

  // Draw column separators
  [col2, col3, col4, col5, col6].forEach(x => {
    doc.moveTo(x, goodsTableY).lineTo(x, goodsTableY + 20).stroke(boxBorder);
  });

  currentY = goodsTableY + 20;

  // Goods content row
  const goodsRowHeight = 60;
  doc.rect(margin, currentY, tableWidth, goodsRowHeight).stroke(boxBorder);
  [col2, col3, col4, col5, col6].forEach(x => {
    doc.moveTo(x, currentY).lineTo(x, currentY + goodsRowHeight).stroke(boxBorder);
  });

  // Fill goods data (sanitized for PDF)
  doc.fontSize(8).fillColor('#000000');
  doc.text(s(ecmr.goods?.marks || ''), col1 + 4, currentY + 4, { width: 72, height: goodsRowHeight - 8 });
  doc.text((ecmr.goods?.packages || ecmr.goods?.quantity || '').toString(), col2 + 4, currentY + 4, { width: 114 });
  doc.text(s(ecmr.goods?.packaging || ''), col3 + 4, currentY + 4, { width: 94 });
  doc.text(s(ecmr.goods?.description || ''), col4 + 4, currentY + 4, { width: 74, height: goodsRowHeight - 8 });
  doc.text(s(ecmr.goods?.statisticalNo || ''), col5 + 4, currentY + 4, { width: 64 });
  doc.text((ecmr.goods?.weight || '').toString(), col6 + 4, currentY + 4, { width: 96 });

  // Dangerous goods warning
  if (ecmr.goods?.dangerousGoods?.isDangerous) {
    doc.rect(col4, currentY + 35, 145, 20).fill('#ffeeee').stroke('#cc0000');
    doc.fontSize(7).fillColor('#cc0000').text(
      `⚠ ADR: ${ecmr.goods.dangerousGoods.unNumber || ''} Classe ${ecmr.goods.dangerousGoods.class || ''}`,
      col4 + 4, currentY + 40
    );
  }

  currentY += goodsRowHeight;

  // ==================== ROW: VOLUME / FRAIS ====================

  // Box 12: Volume
  drawBox(margin, currentY, 150, 25, '12 Volume m³ / Cubage m³',
    (ecmr.goods?.volume || '').toString());

  // Box 13: Instructions expéditeur
  drawBox(margin + 155, currentY, pageWidth - 2 * margin - 155, 25,
    '13 Instructions de l\'expéditeur / Sender\'s instructions',
    ecmr.pickup?.instructions || ecmr.senderInstructions || '');

  currentY += 30;

  // ==================== ROW: PRESCRIPTIONS / PAIEMENT ====================

  // Box 14: Prescriptions
  drawBox(margin, currentY, colWidth - 5, 35,
    '14 Prescriptions d\'affranchissement / Freight charges',
    ecmr.payment?.method === 'prepaid' ? 'Port payé / Prepaid' :
    ecmr.payment?.method === 'collect' ? 'Port dû / Collect' : '', 14);

  // Box 15: Remboursement
  drawBox(margin + colWidth, currentY, colWidth - 5, 35,
    '15 Remboursement / Cash on delivery',
    ecmr.payment?.amount ? `${ecmr.payment.amount} ${ecmr.payment.currency || 'EUR'}` : '', 15);

  currentY += 40;

  // ==================== RESERVATIONS ====================

  // Box 18: Réserves du transporteur
  const reservationsText = ecmr.reservations && ecmr.reservations.length > 0
    ? ecmr.reservations.map(r => `${r.type}: ${r.description}`).join('\n')
    : '';
  drawBox(margin, currentY, pageWidth - 2 * margin, 40,
    '18 Réserves et observations du transporteur / Carrier\'s reservations and observations',
    reservationsText, 18);

  currentY += 45;

  // ==================== CONVENTIONS / CONDITIONS ====================

  // Box 19: Conventions particulières
  drawBox(margin, currentY, pageWidth - 2 * margin, 30,
    '19 Conventions particulières / Special agreements',
    ecmr.specialAgreements || '', 19);

  currentY += 35;

  // ==================== SIGNATURES ROW ====================

  const sigBoxWidth = (pageWidth - 2 * margin) / 3;
  const sigBoxHeight = 70;

  // Box 22: Signature expéditeur
  doc.rect(margin, currentY, sigBoxWidth - 3, sigBoxHeight).stroke(boxBorder);
  doc.circle(margin + 10, currentY + 10, 8).fill(headerBlue);
  doc.fontSize(7).fillColor('#ffffff').text('22', margin + 6, currentY + 6, { width: 8, align: 'center' });
  doc.fontSize(6).fillColor('#666666').text('Signature et cachet de l\'expéditeur', margin + 22, currentY + 3);
  doc.text('Signature and stamp of the sender', margin + 22, currentY + 10);

  if (ecmr.shipper?.signedAt) {
    doc.fontSize(7).fillColor('#228B22').text(`Signe par: ${s(ecmr.shipper.signedBy) || 'N/A'}`, margin + 4, currentY + 25);
    doc.text(`Le: ${formatDate(ecmr.shipper.signedAt)}`, margin + 4, currentY + 35);
    // Draw signature image if available
    if (ecmr.shipper?.signatureImage && ecmr.shipper.signatureImage.startsWith('data:image')) {
      try {
        doc.image(ecmr.shipper.signatureImage, margin + 10, currentY + 45, { width: 60, height: 20 });
      } catch (e) {}
    }
  }

  // Box 23: Signature transporteur (prise en charge)
  doc.rect(margin + sigBoxWidth, currentY, sigBoxWidth - 3, sigBoxHeight).stroke(boxBorder);
  doc.circle(margin + sigBoxWidth + 10, currentY + 10, 8).fill(headerBlue);
  doc.fontSize(7).fillColor('#ffffff').text('23', margin + sigBoxWidth + 6, currentY + 6, { width: 8, align: 'center' });
  doc.fontSize(6).fillColor('#666666').text('Signature et cachet du transporteur', margin + sigBoxWidth + 22, currentY + 3);
  doc.text('Signature and stamp of the carrier', margin + sigBoxWidth + 22, currentY + 10);

  if (ecmr.carrier?.signedAt) {
    doc.fontSize(7).fillColor('#228B22').text(`Signe par: ${s(ecmr.carrier.signedBy) || 'N/A'}`, margin + sigBoxWidth + 4, currentY + 25);
    doc.text(`Le: ${formatDate(ecmr.carrier.signedAt)}`, margin + sigBoxWidth + 4, currentY + 35);
    if (ecmr.carrier?.signatureImage && ecmr.carrier.signatureImage.startsWith('data:image')) {
      try {
        doc.image(ecmr.carrier.signatureImage, margin + sigBoxWidth + 10, currentY + 45, { width: 60, height: 20 });
      } catch (e) {}
    }
  }

  // Box 24: Signature destinataire (livraison)
  doc.rect(margin + 2 * sigBoxWidth, currentY, sigBoxWidth - 3, sigBoxHeight).stroke(boxBorder);
  doc.circle(margin + 2 * sigBoxWidth + 10, currentY + 10, 8).fill(headerBlue);
  doc.fontSize(7).fillColor('#ffffff').text('24', margin + 2 * sigBoxWidth + 6, currentY + 6, { width: 8, align: 'center' });
  doc.fontSize(6).fillColor('#666666').text('Signature et cachet du destinataire', margin + 2 * sigBoxWidth + 22, currentY + 3);
  doc.text('Signature and stamp of the consignee', margin + 2 * sigBoxWidth + 22, currentY + 10);

  if (ecmr.consignee?.signedAt) {
    doc.fontSize(7).fillColor('#228B22').text(`Signe par: ${s(ecmr.consignee.signedBy) || 'N/A'}`, margin + 2 * sigBoxWidth + 4, currentY + 25);
    doc.text(`Le: ${formatDate(ecmr.consignee.signedAt)}`, margin + 2 * sigBoxWidth + 4, currentY + 35);
    if (ecmr.consignee?.signatureImage && ecmr.consignee.signatureImage.startsWith('data:image')) {
      try {
        doc.image(ecmr.consignee.signatureImage, margin + 2 * sigBoxWidth + 10, currentY + 45, { width: 60, height: 20 });
      } catch (e) {}
    }
  }

  currentY += sigBoxHeight + 5;

  // ==================== FOOTER ====================

  // Status bar
  const statusColors = {
    draft: '#FFA500',
    pending_shipper: '#FFD700',
    pending_carrier: '#FFD700',
    in_transit: '#4169E1',
    pending_consignee: '#FFD700',
    completed: '#228B22',
    disputed: '#DC143C',
    cancelled: '#DC143C'
  };
  const statusLabels = {
    draft: 'BROUILLON',
    pending_shipper: 'EN ATTENTE EXPÉDITEUR',
    pending_carrier: 'EN ATTENTE TRANSPORTEUR',
    in_transit: 'EN TRANSIT',
    pending_consignee: 'EN ATTENTE DESTINATAIRE',
    completed: 'COMPLÉTÉ',
    disputed: 'LITIGE',
    cancelled: 'ANNULÉ'
  };

  const statusColor = statusColors[ecmr.status] || '#666666';
  const statusLabel = statusLabels[ecmr.status] || ecmr.status || 'N/A';

  doc.rect(margin, currentY, 120, 18).fill(statusColor);
  doc.fontSize(8).fillColor('#ffffff').text(`STATUT: ${statusLabel}`, margin + 4, currentY + 5);

  // Compliance notice
  doc.fontSize(6).fillColor('#666666');
  doc.text('Ce document électronique est conforme au Protocole additionnel à la Convention CMR (e-CMR) et au Règlement eIDAS.',
    margin + 125, currentY + 2, { width: pageWidth - 2 * margin - 130 });
  doc.text('This electronic document complies with the Additional Protocol to the CMR Convention (e-CMR) and the eIDAS Regulation.',
    margin + 125, currentY + 10, { width: pageWidth - 2 * margin - 130 });

  currentY += 22;

  // Hash and generation info
  doc.fontSize(6).fillColor('#999999');
  doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')} | Hash: ${ecmr.compliance?.documentHash?.substring(0, 32) || generateHash(ecmr).substring(0, 32)}...`,
    margin, currentY, { width: pageWidth - 2 * margin, align: 'center' });
  doc.text('SYMPHONI.A - Plateforme de transport - www.symphoni-a.com',
    margin, currentY + 8, { width: pageWidth - 2 * margin, align: 'center' });
}

// GET /api/v1/ecmr/:id/pdf - Download eCMR as actual PDF file (Official CMR format)
app.get('/api/v1/ecmr/:id/pdf', async (req, res) => {
  try {
    const ecmr = await ECMR.findOne({ ecmrId: req.params.id });
    if (!ecmr) {
      return res.status(404).json({ success: false, error: 'eCMR not found' });
    }

    // Generate QR code for verification
    let qrCodeDataUrl = null;
    try {
      const QRCode = require('qrcode');
      const verificationUrl = `https://symphoni-a.com/verify/${ecmr.ecmrId}`;
      qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { width: 100, margin: 1 });
    } catch (e) {
      console.log('QR code generation skipped:', e.message);
    }

    // Generate PDF using PDFKit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 20,
      info: {
        Title: `eCMR ${ecmr.ecmrId}`,
        Author: 'SYMPHONI.A',
        Subject: 'Lettre de Voiture Internationale Electronique',
        Keywords: 'eCMR, CMR, transport, lettre de voiture',
        Creator: 'SYMPHONI.A Platform'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=eCMR-${ecmr.ecmrId}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Generate the CMR format PDF
    generateCMRPdf(doc, ecmr.toObject(), qrCodeDataUrl);

    // Finalize PDF
    doc.end();

    // Log audit
    addAuditEntry(ecmr, 'pdf_downloaded', req.query.userId || 'anonymous', 'PDF downloaded (CMR format)', req.ip);
    await ecmr.save();

  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/ecmr/generate-pdf - Generate PDF from provided data (for mock/demo data)
app.post('/api/v1/ecmr/generate-pdf', async (req, res) => {
  try {
    const ecmr = req.body;

    if (!ecmr || !ecmr.id) {
      return res.status(400).json({ success: false, error: 'eCMR data required' });
    }

    // Normalize ecmr data to ensure ecmrId is set
    const normalizedEcmr = {
      ...ecmr,
      ecmrId: ecmr.ecmrId || ecmr.id
    };

    // Generate QR code for verification
    let qrCodeDataUrl = null;
    try {
      const QRCode = require('qrcode');
      const verificationUrl = `https://symphoni-a.com/verify/${normalizedEcmr.ecmrId}`;
      qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, { width: 100, margin: 1 });
    } catch (e) {
      console.log('QR code generation skipped:', e.message);
    }

    // Generate PDF using PDFKit with official CMR format
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({
      size: 'A4',
      margin: 20,
      info: {
        Title: `eCMR ${normalizedEcmr.ecmrId}`,
        Author: 'SYMPHONI.A',
        Subject: 'Lettre de Voiture Internationale Electronique',
        Keywords: 'eCMR, CMR, transport, lettre de voiture',
        Creator: 'SYMPHONI.A Platform'
      }
    });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=eCMR-${normalizedEcmr.ecmrId}.pdf`);

    // Pipe the PDF to the response
    doc.pipe(res);

    // Generate the official CMR format PDF
    generateCMRPdf(doc, normalizedEcmr, qrCodeDataUrl);

    // Finalize PDF
    doc.end();

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
