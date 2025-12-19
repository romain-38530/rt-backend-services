/**
 * SYMPHONI.A - Pricing Grids API
 * Gestion des grilles tarifaires personnalisées et demandes de tarifs
 *
 * Ce service permet aux industriels de:
 * - Créer des configurations de grilles tarifaires
 * - Joindre des fichiers (Excel, PDF) à envoyer aux transporteurs
 * - Envoyer des demandes de tarifs aux transporteurs
 * - Recevoir et gérer les propositions tarifaires
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const nodemailer = require('nodemailer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3020;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));

// =============================================================================
// AWS S3 CONFIGURATION
// =============================================================================

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-west-3'
});

const S3_BUCKET = process.env.S3_BUCKET || 'symphonia-pricing-grids';

// =============================================================================
// EMAIL CONFIGURATION (NODEMAILER)
// =============================================================================

const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'noreply@symphonia-logistics.com',
    pass: process.env.SMTP_PASS
  }
});

const EMAIL_FROM = process.env.EMAIL_FROM || 'SYMPHONI.A <noreply@symphonia-logistics.com>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://symphonia-industry.amplifyapp.com';
const TRANSPORTER_FRONTEND_URL = process.env.TRANSPORTER_FRONTEND_URL || 'https://symphonia-transporter.amplifyapp.com';

// =============================================================================
// EXTERNAL API CONFIGURATION (INTERCONNEXIONS)
// =============================================================================

const EXTERNAL_APIS = {
  CARRIERS_API: process.env.CARRIERS_API_URL || 'https://d9bkwrcuwvlbr.cloudfront.net',
  ORDERS_API: process.env.ORDERS_API_URL || 'https://dh9acecfz0wg0.cloudfront.net',
  AFFRET_IA_API: process.env.AFFRET_IA_API_URL || 'https://d393yiia4ig3bw.cloudfront.net',
  CRM_API: process.env.CRM_API_URL || 'https://d1htavhf6kj3c8.cloudfront.net',
  BILLING_API: process.env.BILLING_API_URL || 'https://rt-billing-api-prod.eu-central-1.elasticbeanstalk.com'
};

// Helper pour appels API internes
const callExternalAPI = async (baseUrl, endpoint, method = 'GET', data = null, token = null) => {
  try {
    const config = {
      method,
      url: `${baseUrl}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      },
      ...(data && { data })
    };
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`API call failed: ${baseUrl}${endpoint}`, error.message);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

const emailTemplates = {
  // Template pour nouvelle demande de tarif (envoyé au transporteur)
  newPricingRequest: (data) => ({
    subject: `📋 Nouvelle demande de tarifs de ${data.senderCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .button { display: inline-block; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #3B82F6; }
          .badge { display: inline-block; background: #3B82F6; color: white; padding: 5px 12px; border-radius: 20px; font-size: 12px; margin: 5px 5px 5px 0; }
          ul { padding-left: 20px; }
          li { margin: 8px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">🚛 SYMPHONI.A</h1>
            <p style="margin:10px 0 0 0; opacity:0.9;">Nouvelle Demande de Tarifs</p>
          </div>
          <div class="content">
            <h2>Bonjour ${data.carrierCompanyName},</h2>
            <p>Vous avez reçu une nouvelle demande de tarifs de la part de <strong>${data.senderCompanyName}</strong>.</p>

            <div class="info-box">
              <h3 style="margin-top:0;">📋 Détails de la demande</h3>
              <ul>
                <li><strong>Expéditeur:</strong> ${data.senderCompanyName}</li>
                <li><strong>Contact:</strong> ${data.senderContactName || 'Non spécifié'}</li>
                <li><strong>Email:</strong> ${data.senderEmail || 'Non spécifié'}</li>
                <li><strong>Date limite de réponse:</strong> ${data.responseDeadline ? new Date(data.responseDeadline).toLocaleDateString('fr-FR') : 'Non spécifiée'}</li>
              </ul>
            </div>

            ${data.zones && data.zones.length > 0 ? `
            <div class="info-box">
              <h3 style="margin-top:0;">🗺️ Zones concernées</h3>
              <p>${data.zones.slice(0, 10).map(z => `<span class="badge">${z.name}</span>`).join(' ')}${data.zones.length > 10 ? `<span class="badge">+${data.zones.length - 10} autres</span>` : ''}</p>
            </div>
            ` : ''}

            ${data.vehicles && data.vehicles.length > 0 ? `
            <div class="info-box">
              <h3 style="margin-top:0;">🚚 Types de véhicules</h3>
              <p>${data.vehicles.map(v => `<span class="badge">${v.name}</span>`).join(' ')}</p>
            </div>
            ` : ''}

            ${data.message ? `
            <div class="info-box">
              <h3 style="margin-top:0;">💬 Message</h3>
              <p>${data.message}</p>
            </div>
            ` : ''}

            ${data.attachedFiles && data.attachedFiles.length > 0 ? `
            <div class="info-box">
              <h3 style="margin-top:0;">📎 Fichiers joints</h3>
              <ul>
                ${data.attachedFiles.map(f => `<li>${f.originalName || f.name} (${(f.size / 1024).toFixed(1)} KB)</li>`).join('')}
              </ul>
            </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px;">
              <a href="${TRANSPORTER_FRONTEND_URL}/pricing-requests/${data.requestId}" class="button">
                📝 Voir la demande et répondre
              </a>
            </div>
          </div>
          <div class="footer">
            <p>Cet email a été envoyé automatiquement par SYMPHONI.A</p>
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Template pour nouvelle proposition reçue (envoyé à l'industriel)
  newProposalReceived: (data) => ({
    subject: `💰 Nouvelle proposition tarifaire de ${data.carrierCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .button { display: inline-block; background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10B981; }
          .price-highlight { font-size: 24px; color: #10B981; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">💰 Proposition Reçue</h1>
            <p style="margin:10px 0 0 0; opacity:0.9;">SYMPHONI.A</p>
          </div>
          <div class="content">
            <h2>Bonne nouvelle !</h2>
            <p><strong>${data.carrierCompanyName}</strong> a répondu à votre demande de tarifs.</p>

            <div class="info-box">
              <h3 style="margin-top:0;">📊 Résumé de la proposition</h3>
              <ul>
                <li><strong>Transporteur:</strong> ${data.carrierCompanyName}</li>
                <li><strong>Validité:</strong> ${data.validityDays || 30} jours</li>
                <li><strong>Conditions de paiement:</strong> ${data.paymentTerms || 'À définir'}</li>
                ${data.proposedPrices && data.proposedPrices.length > 0 ? `<li><strong>Nombre de tarifs proposés:</strong> ${data.proposedPrices.length}</li>` : ''}
              </ul>
            </div>

            ${data.notes ? `
            <div class="info-box">
              <h3 style="margin-top:0;">📝 Notes du transporteur</h3>
              <p>${data.notes}</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin-top: 30px;">
              <a href="${FRONTEND_URL}/pricing-grids?tab=proposals&id=${data.proposalId}" class="button">
                📋 Consulter la proposition
              </a>
            </div>

            <p style="text-align: center; color: #64748b; margin-top: 20px;">
              Vous pouvez accepter, refuser ou négocier cette proposition directement depuis votre espace.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Template pour proposition acceptée (envoyé au transporteur)
  proposalAccepted: (data) => ({
    subject: `✅ Votre proposition a été acceptée par ${data.industrialCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .button { display: inline-block; background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .success-icon { font-size: 48px; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">🎉</div>
            <h1 style="margin:0;">Proposition Acceptée !</h1>
          </div>
          <div class="content">
            <h2>Félicitations !</h2>
            <p><strong>${data.industrialCompanyName}</strong> a accepté votre proposition tarifaire.</p>

            <p>Vous pouvez maintenant recevoir des commandes de transport basées sur ces tarifs.</p>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${TRANSPORTER_FRONTEND_URL}/proposals/${data.proposalId}" class="button">
                📋 Voir les détails
              </a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Template pour proposition refusée (envoyé au transporteur)
  proposalRejected: (data) => ({
    subject: `❌ Votre proposition n'a pas été retenue par ${data.industrialCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #EF4444, #DC2626); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #EF4444; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Proposition Non Retenue</h1>
          </div>
          <div class="content">
            <p>Bonjour,</p>
            <p>Nous vous informons que <strong>${data.industrialCompanyName}</strong> n'a pas retenu votre proposition tarifaire.</p>

            ${data.reason ? `
            <div class="info-box">
              <h3 style="margin-top:0;">📝 Motif</h3>
              <p>${data.reason}</p>
            </div>
            ` : ''}

            <p>N'hésitez pas à soumettre de nouvelles propositions pour d'autres demandes de tarifs.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Template pour message de négociation
  negotiationMessage: (data) => ({
    subject: `💬 Nouveau message de négociation - ${data.fromCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #F59E0B, #D97706); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .button { display: inline-block; background: linear-gradient(135deg, #3B82F6, #8B5CF6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .message-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F59E0B; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">💬 Négociation en cours</h1>
          </div>
          <div class="content">
            <p><strong>${data.fromCompanyName}</strong> vous a envoyé un message concernant la proposition tarifaire.</p>

            <div class="message-box">
              <p style="font-style: italic;">"${data.message}"</p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${data.isIndustrial ? FRONTEND_URL : TRANSPORTER_FRONTEND_URL}/proposals/${data.proposalId}" class="button">
                💬 Répondre
              </a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Template pour rappel de deadline
  deadlineReminder: (data) => ({
    subject: `⏰ Rappel: Demande de tarifs en attente de réponse`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #F59E0B, #D97706); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
          .footer { background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
          .button { display: inline-block; background: linear-gradient(135deg, #10B981, #059669); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .alert-box { background: #FEF3C7; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #F59E0B; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">⏰ Rappel</h1>
          </div>
          <div class="content">
            <div class="alert-box">
              <p><strong>Attention !</strong> La demande de tarifs de <strong>${data.senderCompanyName}</strong> expire bientôt.</p>
              <p>Date limite: <strong>${new Date(data.responseDeadline).toLocaleDateString('fr-FR')}</strong></p>
            </div>

            <div style="text-align: center; margin-top: 30px;">
              <a href="${TRANSPORTER_FRONTEND_URL}/pricing-requests/${data.requestId}" class="button">
                📝 Répondre maintenant
              </a>
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SYMPHONI.A - Plateforme de Transport Intelligent</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Fonction helper pour envoyer un email
const sendEmail = async (to, template, data) => {
  try {
    const emailContent = emailTemplates[template](data);

    await smtpTransporter.sendMail({
      from: EMAIL_FROM,
      to,
      subject: emailContent.subject,
      html: emailContent.html
    });

    console.log(`Email sent: ${template} to ${to}`);
    return { success: true };
  } catch (error) {
    console.error(`Email error: ${template} to ${to}`, error.message);
    return { success: false, error: error.message };
  }
};

// Multer configuration for S3 uploads
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: S3_BUCKET,
    acl: 'private',
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: function (req, file, cb) {
      const companyId = req.user?.companyId || 'unknown';
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const filename = `${companyId}/attachments/${timestamp}-${uuidv4()}${ext}`;
      cb(null, filename);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Formats acceptés: PDF, Excel, CSV'), false);
    }
  }
});

// =============================================================================
// MONGOOSE SCHEMAS
// =============================================================================

// Schema pour les fichiers attachés
const attachedFileSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  type: {
    type: String,
    enum: ['excel', 'pdf', 'csv', 'other'],
    required: true
  },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },

  // S3 storage
  s3Key: { type: String, required: true },
  s3Bucket: { type: String, default: S3_BUCKET },

  // Optional signed URL (generated on demand)
  url: String,
  urlExpiry: Date,

  // Metadata
  description: String,
  category: {
    type: String,
    enum: ['template', 'specifications', 'conditions', 'other'],
    default: 'other'
  },

  // Relations
  companyId: { type: String, required: true, index: true },
  uploadedBy: String,
  uploadedAt: { type: Date, default: Date.now }
});

// Schema pour les zones (départements/régions)
const zoneConfigSchema = new mongoose.Schema({
  code: { type: String, required: true },
  name: { type: String, required: true },
  country: String,
  type: {
    type: String,
    enum: ['department', 'region', 'province', 'land', 'canton', 'county'],
    default: 'department'
  }
}, { _id: false });

// Schema pour les frais additionnels
const feeConfigSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['fixed', 'percentage'], required: true },
  value: { type: Number, required: true },
  description: String,
  mandatory: { type: Boolean, default: false },
  conditions: String
}, { _id: false });

// Schema pour les véhicules
const vehicleConfigSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  category: String,
  capacityMin: Number,
  capacityMax: Number,
  weightMin: Number,
  weightMax: Number,
  description: String
}, { _id: false });

// Schema principal pour la configuration de grille tarifaire
const pricingGridConfigSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Identification
  name: { type: String, required: true },
  description: String,
  version: { type: Number, default: 1 },

  // Relations
  companyId: { type: String, required: true, index: true },
  companyName: String,
  createdBy: String,

  // Statut
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },

  // Configuration des zones
  zonesConfig: {
    type: {
      type: String,
      enum: ['department', 'region', 'custom'],
      default: 'department'
    },
    selectedZonesFrance: [zoneConfigSchema],
    selectedZonesEurope: [zoneConfigSchema]
  },

  // Configuration des frais
  feesConfig: {
    standardFees: [feeConfigSchema],
    customFees: [feeConfigSchema]
  },

  // Configuration des véhicules
  vehiclesConfig: {
    selectedVehicles: [vehicleConfigSchema],
    customVehicles: [vehicleConfigSchema]
  },

  // Fichiers attachés
  attachedFiles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttachedFile'
  }],
  attachedFilesData: [attachedFileSchema],

  // Paramètres additionnels
  settings: {
    currency: { type: String, default: 'EUR' },
    taxRate: { type: Number, default: 20 },
    validityDays: { type: Number, default: 30 },
    minimumOrderValue: Number,
    paymentTermsDays: Number,
    notes: String
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  publishedAt: Date
});

// Schema pour les demandes de tarifs envoyées aux transporteurs
const pricingRequestSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Configuration source
  configId: { type: String, required: true, index: true },
  configName: String,

  // Expéditeur (Industriel)
  senderId: { type: String, required: true, index: true },
  senderCompanyName: String,
  senderContactName: String,
  senderEmail: String,

  // Destinataire (Transporteur)
  carrierId: { type: String, required: true, index: true },
  carrierCompanyName: String,
  carrierContactEmail: String,

  // Contenu de la demande
  message: String,
  zones: [zoneConfigSchema],
  vehicles: [vehicleConfigSchema],
  fees: [feeConfigSchema],

  // Fichiers joints
  attachedFiles: [attachedFileSchema],

  // Dates
  validUntil: Date,
  responseDeadline: Date,

  // Statut
  status: {
    type: String,
    enum: ['pending', 'viewed', 'responded', 'expired', 'cancelled'],
    default: 'pending'
  },
  viewedAt: Date,
  respondedAt: Date,

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Schema pour les réponses/propositions des transporteurs
const pricingProposalSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },

  // Relations
  requestId: { type: String, required: true, index: true },
  configId: { type: String, required: true, index: true },

  // Transporteur
  carrierId: { type: String, required: true, index: true },
  carrierCompanyName: String,
  carrierContactName: String,
  carrierEmail: String,

  // Industriel
  industrialId: { type: String, required: true, index: true },
  industrialCompanyName: String,

  // Contenu de la proposition
  proposedPrices: [{
    zoneOrigin: zoneConfigSchema,
    zoneDestination: zoneConfigSchema,
    vehicleType: String,
    pricePerKm: Number,
    priceFixed: Number,
    minPrice: Number,
    currency: { type: String, default: 'EUR' },
    notes: String
  }],

  // Frais proposés
  proposedFees: [feeConfigSchema],

  // Conditions
  validityDays: Number,
  validFrom: Date,
  validUntil: Date,
  paymentTerms: String,
  conditions: String,
  notes: String,

  // Fichiers joints par le transporteur
  attachedFiles: [attachedFileSchema],

  // Statut
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'accepted', 'rejected', 'negotiating', 'expired'],
    default: 'draft'
  },

  // Historique des négociations
  negotiations: [{
    date: { type: Date, default: Date.now },
    from: String, // 'industrial' ou 'carrier'
    message: String,
    proposedChanges: mongoose.Schema.Types.Mixed
  }],

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  submittedAt: Date,
  reviewedAt: Date
});

// Créer les modèles
const AttachedFile = mongoose.model('AttachedFile', attachedFileSchema);
const PricingGridConfig = mongoose.model('PricingGridConfig', pricingGridConfigSchema);
const PricingRequest = mongoose.model('PricingRequest', pricingRequestSchema);
const PricingProposal = mongoose.model('PricingProposal', pricingProposalSchema);

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'symphonia-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

const requireIndustrial = (req, res, next) => {
  if (req.user?.portal !== 'industry' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux industriels' });
  }
  next();
};

const requireCarrier = (req, res, next) => {
  if (req.user?.portal !== 'transporter' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux transporteurs' });
  }
  next();
};

// =============================================================================
// ROUTES - FICHIERS ATTACHÉS
// =============================================================================

/**
 * POST /files/upload
 * Upload un fichier vers S3
 */
app.post('/files/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const { category, description } = req.body;

    // Déterminer le type de fichier
    let fileType = 'other';
    if (req.file.mimetype === 'application/pdf') {
      fileType = 'pdf';
    } else if (req.file.mimetype.includes('excel') || req.file.mimetype.includes('spreadsheet')) {
      fileType = 'excel';
    } else if (req.file.mimetype.includes('csv')) {
      fileType = 'csv';
    }

    const attachedFile = new AttachedFile({
      name: req.file.originalname.replace(/\.[^/.]+$/, ''),
      originalName: req.file.originalname,
      type: fileType,
      mimeType: req.file.mimetype,
      size: req.file.size,
      s3Key: req.file.key,
      s3Bucket: S3_BUCKET,
      category: category || 'other',
      description: description || '',
      companyId: req.user.companyId,
      uploadedBy: req.user.id
    });

    await attachedFile.save();

    // Générer une URL signée temporaire
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: S3_BUCKET,
      Key: req.file.key,
      Expires: 3600 // 1 heure
    });

    res.status(201).json({
      file: {
        ...attachedFile.toObject(),
        url: signedUrl
      }
    });
  } catch (error) {
    console.error('Erreur upload fichier:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload du fichier' });
  }
});

/**
 * POST /files/upload-multiple
 * Upload plusieurs fichiers
 */
app.post('/files/upload-multiple', authenticateToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const categories = req.body.categories ? JSON.parse(req.body.categories) : {};
    const descriptions = req.body.descriptions ? JSON.parse(req.body.descriptions) : {};

    const savedFiles = [];

    for (const file of req.files) {
      let fileType = 'other';
      if (file.mimetype === 'application/pdf') {
        fileType = 'pdf';
      } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
        fileType = 'excel';
      } else if (file.mimetype.includes('csv')) {
        fileType = 'csv';
      }

      const attachedFile = new AttachedFile({
        name: file.originalname.replace(/\.[^/.]+$/, ''),
        originalName: file.originalname,
        type: fileType,
        mimeType: file.mimetype,
        size: file.size,
        s3Key: file.key,
        s3Bucket: S3_BUCKET,
        category: categories[file.originalname] || 'other',
        description: descriptions[file.originalname] || '',
        companyId: req.user.companyId,
        uploadedBy: req.user.id
      });

      await attachedFile.save();

      const signedUrl = s3.getSignedUrl('getObject', {
        Bucket: S3_BUCKET,
        Key: file.key,
        Expires: 3600
      });

      savedFiles.push({
        ...attachedFile.toObject(),
        url: signedUrl
      });
    }

    res.status(201).json({ files: savedFiles });
  } catch (error) {
    console.error('Erreur upload fichiers:', error);
    res.status(500).json({ error: 'Erreur lors de l\'upload des fichiers' });
  }
});

/**
 * GET /files/:id
 * Récupérer les infos d'un fichier
 */
app.get('/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Vérifier les droits d'accès
    if (file.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Générer une nouvelle URL signée
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: file.s3Bucket,
      Key: file.s3Key,
      Expires: 3600
    });

    res.json({
      ...file.toObject(),
      url: signedUrl
    });
  } catch (error) {
    console.error('Erreur récupération fichier:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du fichier' });
  }
});

/**
 * GET /files/:id/download
 * Télécharger un fichier
 */
app.get('/files/:id/download', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Générer une URL de téléchargement
    const signedUrl = s3.getSignedUrl('getObject', {
      Bucket: file.s3Bucket,
      Key: file.s3Key,
      Expires: 60,
      ResponseContentDisposition: `attachment; filename="${file.originalName}"`
    });

    res.redirect(signedUrl);
  } catch (error) {
    console.error('Erreur téléchargement fichier:', error);
    res.status(500).json({ error: 'Erreur lors du téléchargement' });
  }
});

/**
 * DELETE /files/:id
 * Supprimer un fichier
 */
app.delete('/files/:id', authenticateToken, async (req, res) => {
  try {
    const file = await AttachedFile.findOne({ id: req.params.id });

    if (!file) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    if (file.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Supprimer de S3
    await s3.deleteObject({
      Bucket: file.s3Bucket,
      Key: file.s3Key
    }).promise();

    // Supprimer de la base
    await AttachedFile.deleteOne({ id: req.params.id });

    res.json({ message: 'Fichier supprimé' });
  } catch (error) {
    console.error('Erreur suppression fichier:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * GET /files
 * Liste des fichiers de l'entreprise
 */
app.get('/files', authenticateToken, async (req, res) => {
  try {
    const { category, type, page = 1, limit = 20 } = req.query;

    const filter = { companyId: req.user.companyId };
    if (category) filter.category = category;
    if (type) filter.type = type;

    const files = await AttachedFile.find(filter)
      .sort({ uploadedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await AttachedFile.countDocuments(filter);

    // Ajouter les URLs signées
    const filesWithUrls = files.map(file => ({
      ...file.toObject(),
      url: s3.getSignedUrl('getObject', {
        Bucket: file.s3Bucket,
        Key: file.s3Key,
        Expires: 3600
      })
    }));

    res.json({
      files: filesWithUrls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste fichiers:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des fichiers' });
  }
});

// =============================================================================
// ROUTES - CONFIGURATIONS DE GRILLES TARIFAIRES
// =============================================================================

/**
 * POST /configs
 * Créer une nouvelle configuration de grille tarifaire
 */
app.post('/configs', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const {
      name,
      description,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFiles,
      settings
    } = req.body;

    const config = new PricingGridConfig({
      name,
      description,
      companyId: req.user.companyId,
      companyName: req.user.companyName,
      createdBy: req.user.id,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFilesData: attachedFiles || [],
      settings,
      status: 'draft'
    });

    await config.save();

    res.status(201).json({ config });
  } catch (error) {
    console.error('Erreur création config:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la configuration' });
  }
});

/**
 * GET /configs
 * Liste des configurations de l'entreprise
 */
app.get('/configs', authenticateToken, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { companyId: req.user.companyId };
    if (status) filter.status = status;

    const configs = await PricingGridConfig.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingGridConfig.countDocuments(filter);

    res.json({
      configs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste configs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des configurations' });
  }
});

/**
 * GET /configs/:id
 * Détail d'une configuration
 */
app.get('/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    // Vérifier les droits d'accès
    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Ajouter les URLs signées pour les fichiers attachés
    if (config.attachedFilesData && config.attachedFilesData.length > 0) {
      config.attachedFilesData = config.attachedFilesData.map(file => ({
        ...file.toObject ? file.toObject() : file,
        url: file.s3Key ? s3.getSignedUrl('getObject', {
          Bucket: file.s3Bucket || S3_BUCKET,
          Key: file.s3Key,
          Expires: 3600
        }) : null
      }));
    }

    res.json({ config });
  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la configuration' });
  }
});

/**
 * PUT /configs/:id
 * Modifier une configuration
 */
app.put('/configs/:id', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const {
      name,
      description,
      zonesConfig,
      feesConfig,
      vehiclesConfig,
      attachedFiles,
      settings,
      status
    } = req.body;

    // Mettre à jour les champs
    if (name !== undefined) config.name = name;
    if (description !== undefined) config.description = description;
    if (zonesConfig !== undefined) config.zonesConfig = zonesConfig;
    if (feesConfig !== undefined) config.feesConfig = feesConfig;
    if (vehiclesConfig !== undefined) config.vehiclesConfig = vehiclesConfig;
    if (attachedFiles !== undefined) config.attachedFilesData = attachedFiles;
    if (settings !== undefined) config.settings = settings;
    if (status !== undefined) config.status = status;

    config.updatedAt = new Date();
    config.version += 1;

    if (status === 'active' && !config.publishedAt) {
      config.publishedAt = new Date();
    }

    await config.save();

    res.json({ config });
  } catch (error) {
    console.error('Erreur modification config:', error);
    res.status(500).json({ error: 'Erreur lors de la modification de la configuration' });
  }
});

/**
 * DELETE /configs/:id
 * Supprimer une configuration
 */
app.delete('/configs/:id', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const config = await PricingGridConfig.findOne({ id: req.params.id });

    if (!config) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (config.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Supprimer les fichiers S3 associés
    if (config.attachedFilesData && config.attachedFilesData.length > 0) {
      for (const file of config.attachedFilesData) {
        if (file.s3Key) {
          try {
            await s3.deleteObject({
              Bucket: file.s3Bucket || S3_BUCKET,
              Key: file.s3Key
            }).promise();
          } catch (err) {
            console.error('Erreur suppression fichier S3:', err);
          }
        }
      }
    }

    await PricingGridConfig.deleteOne({ id: req.params.id });

    res.json({ message: 'Configuration supprimée' });
  } catch (error) {
    console.error('Erreur suppression config:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
});

/**
 * POST /configs/:id/duplicate
 * Dupliquer une configuration
 */
app.post('/configs/:id/duplicate', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const original = await PricingGridConfig.findOne({ id: req.params.id });

    if (!original) {
      return res.status(404).json({ error: 'Configuration non trouvée' });
    }

    if (original.companyId !== req.user.companyId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    const duplicate = new PricingGridConfig({
      name: `${original.name} (copie)`,
      description: original.description,
      companyId: req.user.companyId,
      companyName: req.user.companyName,
      createdBy: req.user.id,
      zonesConfig: original.zonesConfig,
      feesConfig: original.feesConfig,
      vehiclesConfig: original.vehiclesConfig,
      attachedFilesData: original.attachedFilesData,
      settings: original.settings,
      status: 'draft',
      version: 1
    });

    await duplicate.save();

    res.status(201).json({ config: duplicate });
  } catch (error) {
    console.error('Erreur duplication config:', error);
    res.status(500).json({ error: 'Erreur lors de la duplication' });
  }
});

// =============================================================================
// ROUTES - DEMANDES DE TARIFS
// =============================================================================

/**
 * POST /requests
 * Envoyer une demande de tarif à un transporteur
 */
app.post('/requests', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const {
      configId,
      carrierId,
      carrierCompanyName,
      carrierContactEmail,
      message,
      zones,
      vehicles,
      fees,
      attachedFiles,
      validUntil,
      responseDeadline
    } = req.body;

    // Charger la config si fournie
    let config = null;
    if (configId) {
      config = await PricingGridConfig.findOne({ id: configId });
    }

    const request = new PricingRequest({
      configId: configId || null,
      configName: config?.name || 'Demande personnalisée',
      senderId: req.user.companyId,
      senderCompanyName: req.user.companyName,
      senderContactName: req.user.name,
      senderEmail: req.user.email,
      carrierId,
      carrierCompanyName,
      carrierContactEmail,
      message,
      zones: zones || config?.zonesConfig?.selectedZonesFrance || [],
      vehicles: vehicles || config?.vehiclesConfig?.selectedVehicles || [],
      fees: fees || config?.feesConfig?.standardFees || [],
      attachedFiles: attachedFiles || config?.attachedFilesData || [],
      validUntil: validUntil ? new Date(validUntil) : null,
      responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
      status: 'pending'
    });

    await request.save();

    // Envoyer notification email au transporteur
    if (carrierContactEmail) {
      await sendEmail(carrierContactEmail, 'newPricingRequest', {
        requestId: request.id,
        senderCompanyName: request.senderCompanyName,
        senderContactName: request.senderContactName,
        senderEmail: request.senderEmail,
        carrierCompanyName: request.carrierCompanyName,
        zones: request.zones,
        vehicles: request.vehicles,
        message: request.message,
        attachedFiles: request.attachedFiles,
        responseDeadline: request.responseDeadline
      });
    }

    // Synchroniser avec le CRM (créer une activité)
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      await callExternalAPI(EXTERNAL_APIS.CRM_API, '/api/v1/activities', 'POST', {
        type: 'pricing_request_sent',
        companyId: req.user.companyId,
        targetCompanyId: carrierId,
        description: `Demande de tarifs envoyée à ${carrierCompanyName}`,
        metadata: { requestId: request.id, configId }
      }, token);
    } catch (e) {
      console.log('CRM sync skipped:', e.message);
    }

    res.status(201).json({ request });
  } catch (error) {
    console.error('Erreur création demande:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la demande' });
  }
});

/**
 * GET /requests/sent
 * Liste des demandes envoyées (industriel)
 */
app.get('/requests/sent', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { senderId: req.user.companyId };
    if (status) filter.status = status;

    const requests = await PricingRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingRequest.countDocuments(filter);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste demandes envoyées:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
});

/**
 * GET /requests/received
 * Liste des demandes reçues (transporteur)
 */
app.get('/requests/received', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { carrierId: req.user.companyId };
    if (status) filter.status = status;

    const requests = await PricingRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingRequest.countDocuments(filter);

    res.json({
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste demandes reçues:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des demandes' });
  }
});

/**
 * GET /requests/:id
 * Détail d'une demande
 */
app.get('/requests/:id', authenticateToken, async (req, res) => {
  try {
    const request = await PricingRequest.findOne({ id: req.params.id });

    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    // Vérifier les droits d'accès
    const isAllowed =
      request.senderId === req.user.companyId ||
      request.carrierId === req.user.companyId ||
      req.user.role === 'admin';

    if (!isAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Marquer comme vue si c'est le transporteur
    if (request.carrierId === req.user.companyId && request.status === 'pending') {
      request.status = 'viewed';
      request.viewedAt = new Date();
      await request.save();
    }

    // Ajouter les URLs signées pour les fichiers
    if (request.attachedFiles && request.attachedFiles.length > 0) {
      request.attachedFiles = request.attachedFiles.map(file => ({
        ...file.toObject ? file.toObject() : file,
        url: file.s3Key ? s3.getSignedUrl('getObject', {
          Bucket: file.s3Bucket || S3_BUCKET,
          Key: file.s3Key,
          Expires: 3600
        }) : null
      }));
    }

    res.json({ request });
  } catch (error) {
    console.error('Erreur récupération demande:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la demande' });
  }
});

/**
 * POST /requests/:id/cancel
 * Annuler une demande
 */
app.post('/requests/:id/cancel', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const request = await PricingRequest.findOne({ id: req.params.id });

    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (request.senderId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    request.status = 'cancelled';
    request.updatedAt = new Date();
    await request.save();

    res.json({ message: 'Demande annulée', request });
  } catch (error) {
    console.error('Erreur annulation demande:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

// =============================================================================
// ROUTES - PROPOSITIONS / RÉPONSES
// =============================================================================

/**
 * POST /proposals
 * Créer une proposition tarifaire (transporteur)
 */
app.post('/proposals', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const {
      requestId,
      proposedPrices,
      proposedFees,
      validityDays,
      validFrom,
      validUntil,
      paymentTerms,
      conditions,
      notes,
      attachedFiles
    } = req.body;

    // Charger la demande
    const request = await PricingRequest.findOne({ id: requestId });
    if (!request) {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }

    if (request.carrierId !== req.user.companyId) {
      return res.status(403).json({ error: 'Vous ne pouvez pas répondre à cette demande' });
    }

    const proposal = new PricingProposal({
      requestId,
      configId: request.configId,
      carrierId: req.user.companyId,
      carrierCompanyName: req.user.companyName,
      carrierContactName: req.user.name,
      carrierEmail: req.user.email,
      industrialId: request.senderId,
      industrialCompanyName: request.senderCompanyName,
      proposedPrices,
      proposedFees,
      validityDays,
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : null,
      paymentTerms,
      conditions,
      notes,
      attachedFiles: attachedFiles || [],
      status: 'draft'
    });

    await proposal.save();

    res.status(201).json({ proposal });
  } catch (error) {
    console.error('Erreur création proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la proposition' });
  }
});

/**
 * POST /proposals/:id/submit
 * Soumettre une proposition
 */
app.post('/proposals/:id/submit', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.carrierId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'submitted';
    proposal.submittedAt = new Date();
    proposal.updatedAt = new Date();
    await proposal.save();

    // Mettre à jour le statut de la demande
    const request = await PricingRequest.findOneAndUpdate(
      { id: proposal.requestId },
      { status: 'responded', respondedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    // Envoyer notification à l'industriel
    if (request?.senderEmail) {
      await sendEmail(request.senderEmail, 'newProposalReceived', {
        proposalId: proposal.id,
        carrierCompanyName: proposal.carrierCompanyName,
        validityDays: proposal.validityDays,
        paymentTerms: proposal.paymentTerms,
        proposedPrices: proposal.proposedPrices,
        notes: proposal.notes
      });
    }

    // Synchroniser avec le CRM
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      await callExternalAPI(EXTERNAL_APIS.CRM_API, '/api/v1/activities', 'POST', {
        type: 'pricing_proposal_submitted',
        companyId: req.user.companyId,
        targetCompanyId: proposal.industrialId,
        description: `Proposition tarifaire soumise à ${proposal.industrialCompanyName}`,
        metadata: { proposalId: proposal.id, requestId: proposal.requestId }
      }, token);
    } catch (e) {
      console.log('CRM sync skipped:', e.message);
    }

    res.json({ message: 'Proposition soumise', proposal });
  } catch (error) {
    console.error('Erreur soumission proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la soumission' });
  }
});

/**
 * GET /proposals/sent
 * Propositions envoyées (transporteur)
 */
app.get('/proposals/sent', authenticateToken, requireCarrier, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = { carrierId: req.user.companyId };
    if (status) filter.status = status;

    const proposals = await PricingProposal.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingProposal.countDocuments(filter);

    res.json({
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste propositions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des propositions' });
  }
});

/**
 * GET /proposals/received
 * Propositions reçues (industriel)
 */
app.get('/proposals/received', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { status, requestId, page = 1, limit = 20 } = req.query;

    const filter = { industrialId: req.user.companyId };
    if (status) filter.status = status;
    if (requestId) filter.requestId = requestId;

    const proposals = await PricingProposal.find(filter)
      .sort({ submittedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await PricingProposal.countDocuments(filter);

    res.json({
      proposals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste propositions:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des propositions' });
  }
});

/**
 * GET /proposals/:id
 * Détail d'une proposition
 */
app.get('/proposals/:id', authenticateToken, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    const isAllowed =
      proposal.carrierId === req.user.companyId ||
      proposal.industrialId === req.user.companyId ||
      req.user.role === 'admin';

    if (!isAllowed) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    // Marquer comme en cours de revue si c'est l'industriel
    if (proposal.industrialId === req.user.companyId && proposal.status === 'submitted') {
      proposal.status = 'under_review';
      proposal.reviewedAt = new Date();
      await proposal.save();
    }

    res.json({ proposal });
  } catch (error) {
    console.error('Erreur récupération proposition:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la proposition' });
  }
});

/**
 * POST /proposals/:id/accept
 * Accepter une proposition (industriel)
 */
app.post('/proposals/:id/accept', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.industrialId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'accepted';
    proposal.updatedAt = new Date();
    await proposal.save();

    // Envoyer notification au transporteur
    if (proposal.carrierEmail) {
      await sendEmail(proposal.carrierEmail, 'proposalAccepted', {
        proposalId: proposal.id,
        industrialCompanyName: proposal.industrialCompanyName
      });
    }

    // Créer un accord tarifaire dans les Orders API
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      await callExternalAPI(EXTERNAL_APIS.ORDERS_API, '/api/v1/pricing-agreements', 'POST', {
        proposalId: proposal.id,
        industrialId: proposal.industrialId,
        carrierId: proposal.carrierId,
        carrierCompanyName: proposal.carrierCompanyName,
        proposedPrices: proposal.proposedPrices,
        proposedFees: proposal.proposedFees,
        validFrom: proposal.validFrom,
        validUntil: proposal.validUntil,
        status: 'active'
      }, token);
    } catch (e) {
      console.log('Orders API sync skipped:', e.message);
    }

    // Synchroniser avec AFFRET.IA pour mettre à jour les scores transporteur
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      await callExternalAPI(EXTERNAL_APIS.AFFRET_IA_API, '/api/v1/carriers/update-pricing', 'POST', {
        carrierId: proposal.carrierId,
        proposalId: proposal.id,
        pricesCount: proposal.proposedPrices?.length || 0,
        accepted: true
      }, token);
    } catch (e) {
      console.log('AFFRET.IA sync skipped:', e.message);
    }

    // Synchroniser avec le CRM
    try {
      const token = req.headers['authorization']?.split(' ')[1];
      await callExternalAPI(EXTERNAL_APIS.CRM_API, '/api/v1/activities', 'POST', {
        type: 'pricing_proposal_accepted',
        companyId: req.user.companyId,
        targetCompanyId: proposal.carrierId,
        description: `Proposition tarifaire acceptée de ${proposal.carrierCompanyName}`,
        metadata: { proposalId: proposal.id }
      }, token);
    } catch (e) {
      console.log('CRM sync skipped:', e.message);
    }

    res.json({ message: 'Proposition acceptée', proposal });
  } catch (error) {
    console.error('Erreur acceptation proposition:', error);
    res.status(500).json({ error: 'Erreur lors de l\'acceptation' });
  }
});

/**
 * POST /proposals/:id/reject
 * Rejeter une proposition (industriel)
 */
app.post('/proposals/:id/reject', authenticateToken, requireIndustrial, async (req, res) => {
  try {
    const { reason } = req.body;

    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    if (proposal.industrialId !== req.user.companyId) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'rejected';
    proposal.updatedAt = new Date();

    if (reason) {
      proposal.negotiations.push({
        date: new Date(),
        from: 'industrial',
        message: `Proposition refusée: ${reason}`
      });
    }

    await proposal.save();

    // Envoyer notification au transporteur
    if (proposal.carrierEmail) {
      await sendEmail(proposal.carrierEmail, 'proposalRejected', {
        proposalId: proposal.id,
        industrialCompanyName: proposal.industrialCompanyName,
        reason
      });
    }

    res.json({ message: 'Proposition refusée', proposal });
  } catch (error) {
    console.error('Erreur refus proposition:', error);
    res.status(500).json({ error: 'Erreur lors du refus' });
  }
});

/**
 * POST /proposals/:id/negotiate
 * Ajouter un message de négociation
 */
app.post('/proposals/:id/negotiate', authenticateToken, async (req, res) => {
  try {
    const { message, proposedChanges } = req.body;

    const proposal = await PricingProposal.findOne({ id: req.params.id });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    const isCarrier = proposal.carrierId === req.user.companyId;
    const isIndustrial = proposal.industrialId === req.user.companyId;

    if (!isCarrier && !isIndustrial) {
      return res.status(403).json({ error: 'Accès non autorisé' });
    }

    proposal.status = 'negotiating';
    proposal.negotiations.push({
      date: new Date(),
      from: isIndustrial ? 'industrial' : 'carrier',
      message,
      proposedChanges
    });
    proposal.updatedAt = new Date();

    await proposal.save();

    // Envoyer notification à l'autre partie
    const recipientEmail = isIndustrial ? proposal.carrierEmail : (await PricingRequest.findOne({ id: proposal.requestId }))?.senderEmail;
    const fromCompanyName = isIndustrial ? proposal.industrialCompanyName : proposal.carrierCompanyName;

    if (recipientEmail) {
      await sendEmail(recipientEmail, 'negotiationMessage', {
        proposalId: proposal.id,
        fromCompanyName,
        message,
        isIndustrial: !isIndustrial // Pour le destinataire
      });
    }

    res.json({ message: 'Message envoyé', proposal });
  } catch (error) {
    console.error('Erreur négociation:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi du message' });
  }
});

// =============================================================================
// ROUTES - STATISTIQUES
// =============================================================================

/**
 * GET /stats/configs
 * Statistiques des configurations
 */
app.get('/stats/configs', authenticateToken, async (req, res) => {
  try {
    const stats = await PricingGridConfig.aggregate([
      { $match: { companyId: req.user.companyId } },
      { $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        totalZones: [
          { $project: {
            franceCount: { $size: { $ifNull: ['$zonesConfig.selectedZonesFrance', []] } },
            europeCount: { $size: { $ifNull: ['$zonesConfig.selectedZonesEurope', []] } }
          }},
          { $group: {
            _id: null,
            avgFrance: { $avg: '$franceCount' },
            avgEurope: { $avg: '$europeCount' }
          }}
        ],
        totalFiles: [
          { $project: {
            filesCount: { $size: { $ifNull: ['$attachedFilesData', []] } }
          }},
          { $group: {
            _id: null,
            total: { $sum: '$filesCount' },
            avg: { $avg: '$filesCount' }
          }}
        ]
      }}
    ]);

    res.json(stats[0]);
  } catch (error) {
    console.error('Erreur stats configs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

/**
 * GET /stats/requests
 * Statistiques des demandes
 */
app.get('/stats/requests', authenticateToken, async (req, res) => {
  try {
    const isIndustrial = req.user.portal === 'industry';
    const filterField = isIndustrial ? 'senderId' : 'carrierId';

    const stats = await PricingRequest.aggregate([
      { $match: { [filterField]: req.user.companyId } },
      { $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        byMonth: [
          { $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 }
          }},
          { $sort: { _id: -1 } },
          { $limit: 12 }
        ],
        responseTime: [
          { $match: { respondedAt: { $exists: true } } },
          { $project: {
            responseTime: { $subtract: ['$respondedAt', '$createdAt'] }
          }},
          { $group: {
            _id: null,
            avgResponseTime: { $avg: '$responseTime' }
          }}
        ]
      }}
    ]);

    res.json(stats[0]);
  } catch (error) {
    console.error('Erreur stats requests:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

// =============================================================================
// INTERCONNEXIONS - ROUTES CRM / CARRIERS
// =============================================================================

/**
 * GET /interconnect/carriers
 * Récupérer la liste des transporteurs depuis le CRM pour l'envoi de demandes
 */
app.get('/interconnect/carriers', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const { search, page = 1, limit = 50 } = req.query;

    // Appeler l'API CRM pour récupérer les transporteurs
    const result = await callExternalAPI(
      EXTERNAL_APIS.CRM_API,
      `/api/v1/carriers?search=${search || ''}&page=${page}&limit=${limit}`,
      'GET',
      null,
      token
    );

    if (result.success) {
      res.json(result.data);
    } else {
      // Fallback: récupérer les transporteurs ayant déjà reçu des demandes
      const carriers = await PricingRequest.aggregate([
        { $match: { senderId: req.user.companyId } },
        { $group: {
          _id: '$carrierId',
          companyName: { $first: '$carrierCompanyName' },
          email: { $first: '$carrierContactEmail' },
          requestsCount: { $sum: 1 },
          lastRequest: { $max: '$createdAt' }
        }},
        { $sort: { lastRequest: -1 } },
        { $limit: parseInt(limit) }
      ]);

      res.json({ carriers, source: 'local' });
    }
  } catch (error) {
    console.error('Erreur récupération transporteurs:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des transporteurs' });
  }
});

/**
 * GET /interconnect/carrier/:id
 * Récupérer les détails d'un transporteur avec son historique tarifaire
 */
app.get('/interconnect/carrier/:id', authenticateToken, async (req, res) => {
  try {
    const carrierId = req.params.id;
    const token = req.headers['authorization']?.split(' ')[1];

    // Récupérer les infos du transporteur depuis le CRM
    const carrierInfo = await callExternalAPI(
      EXTERNAL_APIS.CRM_API,
      `/api/v1/carriers/${carrierId}`,
      'GET',
      null,
      token
    );

    // Récupérer l'historique des demandes/propositions
    const requests = await PricingRequest.find({
      senderId: req.user.companyId,
      carrierId
    }).sort({ createdAt: -1 }).limit(10);

    const proposals = await PricingProposal.find({
      industrialId: req.user.companyId,
      carrierId
    }).sort({ createdAt: -1 }).limit(10);

    // Calculer des statistiques
    const stats = {
      totalRequests: await PricingRequest.countDocuments({ senderId: req.user.companyId, carrierId }),
      totalProposals: await PricingProposal.countDocuments({ industrialId: req.user.companyId, carrierId }),
      acceptedProposals: await PricingProposal.countDocuments({ industrialId: req.user.companyId, carrierId, status: 'accepted' }),
      avgResponseTime: null
    };

    // Calculer le temps de réponse moyen
    const responseTimes = await PricingRequest.aggregate([
      { $match: { senderId: req.user.companyId, carrierId, respondedAt: { $exists: true } } },
      { $project: { responseTime: { $subtract: ['$respondedAt', '$createdAt'] } } },
      { $group: { _id: null, avgTime: { $avg: '$responseTime' } } }
    ]);

    if (responseTimes.length > 0) {
      stats.avgResponseTime = Math.round(responseTimes[0].avgTime / (1000 * 60 * 60)); // En heures
    }

    res.json({
      carrier: carrierInfo.success ? carrierInfo.data : { id: carrierId },
      requests,
      proposals,
      stats
    });
  } catch (error) {
    console.error('Erreur récupération transporteur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération du transporteur' });
  }
});

// =============================================================================
// INTERCONNEXIONS - ORDERS / CALCUL DE PRIX
// =============================================================================

/**
 * POST /interconnect/calculate-price
 * Calculer le prix d'un transport basé sur les grilles tarifaires acceptées
 */
app.post('/interconnect/calculate-price', authenticateToken, async (req, res) => {
  try {
    const {
      origin, // { department, region, country }
      destination, // { department, region, country }
      weight,
      volume,
      pallets,
      vehicleType,
      carrierId // Optionnel - si spécifié, chercher uniquement pour ce transporteur
    } = req.body;

    // Récupérer les propositions acceptées pour cet industriel
    const filter = {
      industrialId: req.user.companyId,
      status: 'accepted',
      $or: [
        { validUntil: { $gte: new Date() } },
        { validUntil: null }
      ]
    };

    if (carrierId) {
      filter.carrierId = carrierId;
    }

    const proposals = await PricingProposal.find(filter);

    const priceResults = [];

    for (const proposal of proposals) {
      if (!proposal.proposedPrices || proposal.proposedPrices.length === 0) continue;

      for (const price of proposal.proposedPrices) {
        // Vérifier si la zone correspond
        const originMatch = !price.zoneOrigin ||
          price.zoneOrigin.code === origin?.department ||
          price.zoneOrigin.code === origin?.region;

        const destMatch = !price.zoneDestination ||
          price.zoneDestination.code === destination?.department ||
          price.zoneDestination.code === destination?.region;

        const vehicleMatch = !price.vehicleType || price.vehicleType === vehicleType;

        if (originMatch && destMatch && vehicleMatch) {
          let calculatedPrice = price.minPrice || 0;

          // Calcul basé sur le type de tarification
          if (price.priceFixed) {
            calculatedPrice = price.priceFixed;
          } else if (price.pricePerKm && req.body.distance) {
            calculatedPrice = Math.max(price.pricePerKm * req.body.distance, price.minPrice || 0);
          }

          // Ajouter les frais supplémentaires
          let totalFees = 0;
          if (proposal.proposedFees) {
            for (const fee of proposal.proposedFees) {
              if (fee.type === 'fixed') {
                totalFees += fee.value;
              } else if (fee.type === 'percentage') {
                totalFees += calculatedPrice * (fee.value / 100);
              }
            }
          }

          priceResults.push({
            carrierId: proposal.carrierId,
            carrierName: proposal.carrierCompanyName,
            proposalId: proposal.id,
            basePrice: calculatedPrice,
            fees: totalFees,
            totalPrice: calculatedPrice + totalFees,
            currency: price.currency || 'EUR',
            vehicleType: price.vehicleType,
            validUntil: proposal.validUntil
          });
        }
      }
    }

    // Trier par prix
    priceResults.sort((a, b) => a.totalPrice - b.totalPrice);

    res.json({
      prices: priceResults,
      bestPrice: priceResults[0] || null,
      count: priceResults.length
    });
  } catch (error) {
    console.error('Erreur calcul prix:', error);
    res.status(500).json({ error: 'Erreur lors du calcul du prix' });
  }
});

/**
 * GET /interconnect/pricing-agreements
 * Récupérer les accords tarifaires actifs pour un industriel
 */
app.get('/interconnect/pricing-agreements', authenticateToken, async (req, res) => {
  try {
    const { carrierId, status = 'accepted' } = req.query;

    const filter = {
      industrialId: req.user.companyId,
      status
    };

    if (carrierId) {
      filter.carrierId = carrierId;
    }

    const agreements = await PricingProposal.find(filter)
      .select('id carrierId carrierCompanyName proposedPrices proposedFees validFrom validUntil status createdAt')
      .sort({ createdAt: -1 });

    // Enrichir avec le nombre de zones couvertes
    const enrichedAgreements = agreements.map(a => ({
      ...a.toObject(),
      zonesCount: a.proposedPrices?.length || 0,
      isExpired: a.validUntil && new Date(a.validUntil) < new Date()
    }));

    res.json({ agreements: enrichedAgreements });
  } catch (error) {
    console.error('Erreur récupération accords:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des accords' });
  }
});

// =============================================================================
// INTERCONNEXIONS - AFFRET.IA
// =============================================================================

/**
 * GET /interconnect/carrier-scores
 * Récupérer les scores des transporteurs basés sur les données tarifaires
 */
app.get('/interconnect/carrier-scores', authenticateToken, async (req, res) => {
  try {
    // Calculer les scores basés sur les données locales
    const carrierStats = await PricingProposal.aggregate([
      { $match: { industrialId: req.user.companyId } },
      { $group: {
        _id: '$carrierId',
        carrierName: { $first: '$carrierCompanyName' },
        totalProposals: { $sum: 1 },
        acceptedProposals: { $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] } },
        avgPricesCount: { $avg: { $size: { $ifNull: ['$proposedPrices', []] } } }
      }},
      { $project: {
        carrierId: '$_id',
        carrierName: 1,
        totalProposals: 1,
        acceptedProposals: 1,
        avgPricesCount: 1,
        acceptanceRate: {
          $cond: [
            { $eq: ['$totalProposals', 0] },
            0,
            { $multiply: [{ $divide: ['$acceptedProposals', '$totalProposals'] }, 100] }
          ]
        }
      }},
      { $sort: { acceptanceRate: -1 } }
    ]);

    // Récupérer les scores depuis AFFRET.IA si disponible
    const token = req.headers['authorization']?.split(' ')[1];
    const affretResult = await callExternalAPI(
      EXTERNAL_APIS.AFFRET_IA_API,
      '/api/v1/carrier-scores',
      'GET',
      null,
      token
    );

    // Fusionner les données
    const mergedScores = carrierStats.map(local => {
      const affretScore = affretResult.success ?
        affretResult.data?.scores?.find(s => s.carrierId === local.carrierId) : null;

      return {
        ...local,
        affretScore: affretScore?.globalScore || null,
        affretReliability: affretScore?.reliability || null,
        affretOnTimeRate: affretScore?.onTimeRate || null
      };
    });

    res.json({ scores: mergedScores });
  } catch (error) {
    console.error('Erreur récupération scores:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des scores' });
  }
});

/**
 * POST /interconnect/recommend-carriers
 * Recommander des transporteurs pour une demande de tarif basé sur AFFRET.IA
 */
app.post('/interconnect/recommend-carriers', authenticateToken, async (req, res) => {
  try {
    const { zones, vehicleTypes, criteria } = req.body;
    const token = req.headers['authorization']?.split(' ')[1];

    // Appeler AFFRET.IA pour les recommandations
    const affretResult = await callExternalAPI(
      EXTERNAL_APIS.AFFRET_IA_API,
      '/api/v1/recommend-carriers',
      'POST',
      { zones, vehicleTypes, criteria, industrialId: req.user.companyId },
      token
    );

    if (affretResult.success) {
      res.json(affretResult.data);
    } else {
      // Fallback: recommander basé sur l'historique local
      const recommendations = await PricingProposal.aggregate([
        { $match: { industrialId: req.user.companyId, status: 'accepted' } },
        { $group: {
          _id: '$carrierId',
          carrierName: { $first: '$carrierCompanyName' },
          carrierEmail: { $first: '$carrierEmail' },
          acceptedCount: { $sum: 1 },
          lastAccepted: { $max: '$createdAt' }
        }},
        { $sort: { acceptedCount: -1 } },
        { $limit: 10 }
      ]);

      res.json({
        recommendations,
        source: 'local_history',
        message: 'Basé sur vos accords précédents'
      });
    }
  } catch (error) {
    console.error('Erreur recommandations:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des recommandations' });
  }
});

// =============================================================================
// INTERCONNEXIONS - BILLING / FACTURATION
// =============================================================================

/**
 * POST /interconnect/create-invoice-line
 * Créer une ligne de facturation basée sur un accord tarifaire
 */
app.post('/interconnect/create-invoice-line', authenticateToken, async (req, res) => {
  try {
    const { orderId, proposalId, priceUsed } = req.body;
    const token = req.headers['authorization']?.split(' ')[1];

    // Vérifier que la proposition existe et appartient à l'utilisateur
    const proposal = await PricingProposal.findOne({
      id: proposalId,
      $or: [
        { industrialId: req.user.companyId },
        { carrierId: req.user.companyId }
      ]
    });

    if (!proposal) {
      return res.status(404).json({ error: 'Proposition non trouvée' });
    }

    // Appeler l'API de facturation
    const billingResult = await callExternalAPI(
      EXTERNAL_APIS.BILLING_API,
      '/api/v1/invoice-lines',
      'POST',
      {
        orderId,
        proposalId: proposal.id,
        carrierId: proposal.carrierId,
        carrierName: proposal.carrierCompanyName,
        industrialId: proposal.industrialId,
        priceUsed,
        fees: proposal.proposedFees,
        reference: `PRICING-${proposal.id.substring(0, 8)}`
      },
      token
    );

    if (billingResult.success) {
      res.json(billingResult.data);
    } else {
      res.status(500).json({ error: 'Erreur lors de la création de la ligne de facturation' });
    }
  } catch (error) {
    console.error('Erreur création ligne facturation:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la ligne de facturation' });
  }
});

// =============================================================================
// EMAILS - RAPPELS AUTOMATIQUES
// =============================================================================

/**
 * POST /admin/send-reminders
 * Envoyer des rappels pour les demandes en attente (appelé par cron)
 */
app.post('/admin/send-reminders', async (req, res) => {
  try {
    const { adminKey } = req.body;

    // Vérification simple de la clé admin
    if (adminKey !== process.env.ADMIN_API_KEY && adminKey !== 'symphonia-admin-2024') {
      return res.status(403).json({ error: 'Clé admin invalide' });
    }

    // Trouver les demandes en attente avec deadline proche (dans les 2 prochains jours)
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const pendingRequests = await PricingRequest.find({
      status: { $in: ['pending', 'viewed'] },
      responseDeadline: { $lte: twoDaysFromNow, $gte: new Date() }
    });

    let sentCount = 0;

    for (const request of pendingRequests) {
      if (request.carrierContactEmail) {
        await sendEmail(request.carrierContactEmail, 'deadlineReminder', {
          requestId: request.id,
          senderCompanyName: request.senderCompanyName,
          responseDeadline: request.responseDeadline
        });
        sentCount++;
      }
    }

    res.json({
      message: `${sentCount} rappels envoyés`,
      pendingCount: pendingRequests.length
    });
  } catch (error) {
    console.error('Erreur envoi rappels:', error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi des rappels' });
  }
});

/**
 * GET /admin/email-stats
 * Statistiques des emails envoyés
 */
app.get('/admin/email-stats', async (req, res) => {
  try {
    // Stats basiques basées sur les activités
    const stats = {
      requestsSent: await PricingRequest.countDocuments({ status: { $ne: 'draft' } }),
      proposalsSubmitted: await PricingProposal.countDocuments({ status: { $nin: ['draft'] } }),
      proposalsAccepted: await PricingProposal.countDocuments({ status: 'accepted' }),
      proposalsRejected: await PricingProposal.countDocuments({ status: 'rejected' }),
      pendingRequests: await PricingRequest.countDocuments({ status: 'pending' })
    };

    res.json(stats);
  } catch (error) {
    console.error('Erreur stats emails:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'pricing-grids-api',
    version: '2.0.0',
    features: ['emails', 'interconnections', 'crm', 'orders', 'affret-ia', 'billing'],
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// MONGODB CONNECTION & SERVER START
// =============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-pricing-grids';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Pricing Grids API running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Pricing Grids API running on port ${PORT} (no DB)`);
    });
  });

module.exports = app;
