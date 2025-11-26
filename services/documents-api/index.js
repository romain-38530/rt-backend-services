/**
 * SYMPHONI.A Documents API
 * Gestion documentaire avec OCR (AWS Textract / Google Cloud Vision)
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3014;

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

// AWS S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// AWS Textract Configuration
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'eu-west-3',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Multer configuration
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

// Document Schema
const documentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, index: true },
  type: {
    type: String,
    enum: ['CMR', 'BL', 'POD', 'invoice', 'photo', 'signature', 'other'],
    required: true
  },
  fileName: String,
  originalName: String,
  s3Key: String,
  s3Bucket: String,
  s3Url: String,
  fileSize: Number,
  mimeType: String,
  uploadedBy: String,
  uploadedAt: { type: Date, default: Date.now },

  // OCR Data
  ocrStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'not_applicable'],
    default: 'pending'
  },
  ocrData: {
    rawText: String,
    confidence: Number,
    fields: {
      documentNumber: String,
      date: String,
      sender: String,
      receiver: String,
      quantity: String,
      weight: String,
      signatures: [String],
      customFields: mongoose.Schema.Types.Mixed
    }
  },
  ocrProcessedAt: Date,

  // Validation
  validated: { type: Boolean, default: false },
  validatedBy: String,
  validatedAt: Date,
  validationNotes: String,

  // Sharing
  shareLink: String,
  shareLinkExpiry: Date,

  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const Document = mongoose.model('Document', documentSchema);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected'))
  .catch(err => console.error('[MONGODB] Error:', err));

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'documents-api',
    version: '1.0.0',
    s3: !!process.env.AWS_S3_BUCKET,
    textract: !!process.env.AWS_ACCESS_KEY_ID
  });
});

// POST /api/v1/documents/upload - Upload document to S3
app.post('/api/v1/documents/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const { orderId, type, uploadedBy } = req.body;

    if (!orderId || !type) {
      return res.status(400).json({ success: false, error: 'orderId and type are required' });
    }

    // Generate unique S3 key
    const s3Key = `documents/${orderId}/${uuidv4()}-${req.file.originalname}`;

    // Read file
    const fileContent = fs.readFileSync(req.file.path);

    // Upload to S3
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fileContent,
      ContentType: req.file.mimetype
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Save to database
    const document = new Document({
      orderId,
      type,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      s3Key,
      s3Bucket: process.env.AWS_S3_BUCKET,
      s3Url,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy,
      ocrStatus: ['pdf', 'jpg', 'jpeg', 'png'].includes(path.extname(req.file.originalname).toLowerCase().slice(1))
        ? 'pending'
        : 'not_applicable'
    });

    await document.save();

    // Clean up local file
    fs.unlinkSync(req.file.path);

    // Emit event
    emitEvent('documents.uploaded', {
      orderId,
      documentId: document._id,
      type,
      fileName: req.file.originalname
    });

    res.status(201).json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('[ERROR] Upload:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/documents/:orderId - Get all documents for an order
app.get('/api/v1/documents/:orderId', async (req, res) => {
  try {
    const documents = await Document.find({ orderId: req.params.orderId })
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/documents/:id/download - Download document
app.get('/api/v1/documents/:id/download', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Get from S3
    const getParams = {
      Bucket: document.s3Bucket,
      Key: document.s3Key
    };

    const data = await s3Client.send(new GetObjectCommand(getParams));

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${document.originalName}"`);
    data.Body.pipe(res);
  } catch (error) {
    console.error('[ERROR] Download:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/documents/:id - Delete document
app.delete('/api/v1/documents/:id', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Delete from S3
    const deleteParams = {
      Bucket: document.s3Bucket,
      Key: document.s3Key
    };

    await s3Client.send(new DeleteObjectCommand(deleteParams));

    // Delete from database
    await Document.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    console.error('[ERROR] Delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/documents/:id/ocr - Process document with OCR
app.post('/api/v1/documents/:id/ocr', async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Update status
    document.ocrStatus = 'processing';
    await document.save();

    emitEvent('document.ocr.started', {
      documentId: document._id,
      orderId: document.orderId
    });

    // Call AWS Textract
    const analyzeParams = {
      Document: {
        S3Object: {
          Bucket: document.s3Bucket,
          Name: document.s3Key
        }
      },
      FeatureTypes: ['TABLES', 'FORMS']
    };

    const textractResponse = await textractClient.send(
      new AnalyzeDocumentCommand(analyzeParams)
    );

    // Extract text and fields
    const rawText = textractResponse.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');

    // Simple field extraction (can be enhanced)
    const ocrData = {
      rawText,
      confidence: textractResponse.Blocks[0]?.Confidence || 0,
      fields: extractFields(rawText)
    };

    document.ocrData = ocrData;
    document.ocrStatus = 'completed';
    document.ocrProcessedAt = new Date();
    await document.save();

    emitEvent('document.ocr.complete', {
      documentId: document._id,
      orderId: document.orderId,
      ocrData
    });

    res.json({
      success: true,
      data: document
    });
  } catch (error) {
    console.error('[ERROR] OCR:', error);

    // Update document status to failed
    await Document.findByIdAndUpdate(req.params.id, {
      ocrStatus: 'failed'
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to extract fields from text
function extractFields(text) {
  const fields = {};

  // Extract document number (various patterns)
  const numberMatch = text.match(/(?:N°|No|Number|CMR|BL)\s*:?\s*(\w+[-/]?\d+)/i);
  if (numberMatch) fields.documentNumber = numberMatch[1];

  // Extract date
  const dateMatch = text.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
  if (dateMatch) fields.date = dateMatch[1];

  // Extract weight
  const weightMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|KG|Kg)/);
  if (weightMatch) fields.weight = weightMatch[1];

  // Extract quantity
  const qtyMatch = text.match(/(?:Quantité|Quantity|Qté)\s*:?\s*(\d+)/i);
  if (qtyMatch) fields.quantity = qtyMatch[1];

  return fields;
}

// PUT /api/v1/documents/:id/validate-ocr - Validate OCR results
app.put('/api/v1/documents/:id/validate-ocr', async (req, res) => {
  try {
    const { validatedBy, notes } = req.body;

    const document = await Document.findByIdAndUpdate(
      req.params.id,
      {
        validated: true,
        validatedBy,
        validatedAt: new Date(),
        validationNotes: notes
      },
      { new: true }
    );

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    emitEvent('document.validated', {
      documentId: document._id,
      orderId: document.orderId
    });

    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/documents/:id/correct-ocr - Correct OCR data
app.put('/api/v1/documents/:id/correct-ocr', async (req, res) => {
  try {
    const { correctedFields } = req.body;

    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    document.ocrData.fields = {
      ...document.ocrData.fields,
      ...correctedFields
    };

    await document.save();

    res.json({ success: true, data: document });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/documents/pending-ocr - Get documents pending OCR
app.get('/api/v1/documents/pending-ocr', async (req, res) => {
  try {
    const documents = await Document.find({ ocrStatus: 'pending' })
      .sort({ uploadedAt: 1 })
      .limit(50);

    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/documents/search - Search documents
app.get('/api/v1/documents/search', async (req, res) => {
  try {
    const { query, type, orderId } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (orderId) filters.orderId = orderId;

    if (query) {
      filters.$or = [
        { originalName: new RegExp(query, 'i') },
        { 'ocrData.rawText': new RegExp(query, 'i') },
        { 'ocrData.fields.documentNumber': new RegExp(query, 'i') }
      ];
    }

    const documents = await Document.find(filters)
      .sort({ uploadedAt: -1 })
      .limit(100);

    res.json({
      success: true,
      data: documents,
      count: documents.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/documents/share-link - Generate shareable link
app.post('/api/v1/documents/share-link', async (req, res) => {
  try {
    const { documentId, expiryHours = 24 } = req.body;

    const document = await Document.findById(documentId);

    if (!document) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const shareToken = uuidv4();
    const expiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    document.shareLink = shareToken;
    document.shareLinkExpiry = expiry;
    await document.save();

    const shareUrl = `${process.env.APP_URL}/shared/documents/${shareToken}`;

    res.json({
      success: true,
      shareUrl,
      expiresAt: expiry
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[DOCUMENTS API] Running on port ${PORT}`);
});

module.exports = app;
