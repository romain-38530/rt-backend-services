/**
 * Service de Facturation Abonnements SaaS
 * RT Technologie - SYMPHONI.A
 *
 * Fonctionnalites:
 * - Gestion des abonnements clients
 * - Generation automatique des factures mensuelles
 * - Generation PDF professionnelles
 * - Envoi par email
 * - Suivi des paiements
 * - Export comptable
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { MongoClient, ObjectId } = require('mongodb');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://music:music@music-data.t0qhq.mongodb.net/symphonia?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'RtProd2026KeyAuth0MainToken123456XY';
const TVA_RATE = 0.20;

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.eu.mailgun.org',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
};

// Company info for invoices
const COMPANY_INFO = {
  name: 'RT Technologie SAS',
  address: '123 Avenue de l\'Innovation',
  postalCode: '75001',
  city: 'Paris',
  country: 'France',
  siret: '123 456 789 00012',
  tvaNumber: 'FR12345678901',
  email: 'facturation@symphonia-app.com',
  phone: '+33 1 23 45 67 89',
  iban: 'FR76 1234 5678 9012 3456 7890 123',
  bic: 'BNPAFRPP'
};

// Pricing plans
const PRICING_PLANS = {
  starter: {
    name: 'Starter',
    monthlyPrice: 99,
    annualPrice: 990,
    features: ['5 utilisateurs', '100 commandes/mois', 'Support email']
  },
  professional: {
    name: 'Professional',
    monthlyPrice: 299,
    annualPrice: 2990,
    features: ['20 utilisateurs', '1000 commandes/mois', 'Support prioritaire', 'API access']
  },
  enterprise: {
    name: 'Enterprise',
    monthlyPrice: 799,
    annualPrice: 7990,
    features: ['Utilisateurs illimites', 'Commandes illimitees', 'Support 24/7', 'API + Webhooks', 'SLA garanti']
  },
  custom: {
    name: 'Sur Mesure',
    monthlyPrice: null,
    annualPrice: null,
    features: ['Configuration personnalisee']
  }
};

app.use(cors());
app.use(helmet());
app.use(express.json());

// MongoDB connection
let db;
let mongoConnected = false;

async function connectMongoDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    mongoConnected = true;
    console.log('MongoDB connected - Subscription Invoicing');

    // Create indexes
    await db.collection('subscriptions').createIndex({ clientId: 1 });
    await db.collection('subscriptions').createIndex({ status: 1 });
    await db.collection('invoices').createIndex({ clientId: 1 });
    await db.collection('invoices').createIndex({ invoiceNumber: 1 }, { unique: true });
    await db.collection('invoices').createIndex({ status: 1 });
    await db.collection('invoices').createIndex({ dueDate: 1 });

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    mongoConnected = false;
  }
}

// Email transporter
let emailTransporter;
function setupEmailTransporter() {
  if (EMAIL_CONFIG.auth.user && EMAIL_CONFIG.auth.pass) {
    emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
    console.log('Email transporter configured');
  } else {
    console.log('Email not configured - invoices will not be sent automatically');
  }
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Generate invoice number: FAC-YYYYMM-XXXX
 */
async function generateInvoiceNumber() {
  const now = new Date();
  const prefix = `FAC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const lastInvoice = await db.collection('invoices')
    .findOne({ invoiceNumber: { $regex: `^${prefix}` } }, { sort: { invoiceNumber: -1 } });

  let sequence = 1;
  if (lastInvoice) {
    const lastSeq = parseInt(lastInvoice.invoiceNumber.split('-')[2]);
    sequence = lastSeq + 1;
  }

  return `${prefix}-${String(sequence).padStart(4, '0')}`;
}

/**
 * Calculate invoice amounts
 */
function calculateInvoiceAmounts(baseAmount, discountPercent = 0) {
  const discount = baseAmount * (discountPercent / 100);
  const amountHT = baseAmount - discount;
  const tva = Math.round(amountHT * TVA_RATE * 100) / 100;
  const amountTTC = Math.round((amountHT + tva) * 100) / 100;

  return {
    baseAmount,
    discount,
    discountPercent,
    amountHT: Math.round(amountHT * 100) / 100,
    tva,
    amountTTC
  };
}

/**
 * Generate PDF Invoice
 */
async function generateInvoicePDF(invoice, subscription, client) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header - Company logo area
    doc.fontSize(24).fillColor('#2563eb').text('SYMPHONI.A', 50, 50);
    doc.fontSize(10).fillColor('#666').text('Control Tower Logistique', 50, 80);

    // Invoice title
    doc.fontSize(28).fillColor('#000').text('FACTURE', 400, 50, { align: 'right' });
    doc.fontSize(12).fillColor('#666').text(invoice.invoiceNumber, 400, 85, { align: 'right' });

    // Company info
    doc.fontSize(9).fillColor('#333');
    doc.text(COMPANY_INFO.name, 50, 120);
    doc.text(COMPANY_INFO.address, 50, 132);
    doc.text(`${COMPANY_INFO.postalCode} ${COMPANY_INFO.city}`, 50, 144);
    doc.text(`SIRET: ${COMPANY_INFO.siret}`, 50, 160);
    doc.text(`TVA: ${COMPANY_INFO.tvaNumber}`, 50, 172);

    // Client info
    doc.fontSize(10).fillColor('#000').text('FACTURE A:', 350, 120);
    doc.fontSize(10).fillColor('#333');
    doc.text(client.companyName || client.name || 'Client', 350, 135);
    if (client.address) {
      doc.text(client.address.street || '', 350, 150);
      doc.text(`${client.address.postalCode || ''} ${client.address.city || ''}`, 350, 165);
    }
    if (client.vatNumber) {
      doc.text(`TVA: ${client.vatNumber}`, 350, 185);
    }

    // Invoice details box
    doc.rect(50, 220, 500, 60).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.fillColor('#333').fontSize(9);
    doc.text('Date de facture:', 60, 235);
    doc.text(new Date(invoice.invoiceDate).toLocaleDateString('fr-FR'), 160, 235);
    doc.text('Date d\'echeance:', 60, 250);
    doc.text(new Date(invoice.dueDate).toLocaleDateString('fr-FR'), 160, 250);
    doc.text('Periode:', 300, 235);
    doc.text(invoice.periodLabel || `${invoice.periodStart?.toLocaleDateString('fr-FR')} - ${invoice.periodEnd?.toLocaleDateString('fr-FR')}`, 380, 235);
    doc.text('Mode de paiement:', 300, 250);
    doc.text(invoice.paymentMethod === 'sepa' ? 'Prelevement SEPA' : 'Carte bancaire', 380, 250);

    // Table header
    const tableTop = 310;
    doc.rect(50, tableTop, 500, 25).fillAndStroke('#2563eb', '#2563eb');
    doc.fillColor('#fff').fontSize(10);
    doc.text('Description', 60, tableTop + 8);
    doc.text('Periode', 280, tableTop + 8);
    doc.text('Montant HT', 420, tableTop + 8, { align: 'right', width: 120 });

    // Table content
    let y = tableTop + 35;
    doc.fillColor('#333').fontSize(10);

    // Subscription line
    const planInfo = PRICING_PLANS[subscription.plan] || { name: subscription.plan };
    doc.text(`Abonnement ${planInfo.name}`, 60, y, { width: 200 });
    doc.text(invoice.periodLabel || 'Mensuel', 280, y);
    doc.text(`${invoice.amounts.baseAmount.toFixed(2)} EUR`, 420, y, { align: 'right', width: 120 });
    y += 25;

    // Discount if any
    if (invoice.amounts.discount > 0) {
      doc.fillColor('#16a34a');
      doc.text(`Remise (${invoice.amounts.discountPercent}%)`, 60, y);
      doc.text(`-${invoice.amounts.discount.toFixed(2)} EUR`, 420, y, { align: 'right', width: 120 });
      y += 25;
    }

    // Separator line
    y += 10;
    doc.moveTo(50, y).lineTo(550, y).stroke('#e2e8f0');
    y += 20;

    // Totals
    doc.fillColor('#333').fontSize(10);
    doc.text('Total HT:', 350, y);
    doc.text(`${invoice.amounts.amountHT.toFixed(2)} EUR`, 420, y, { align: 'right', width: 120 });
    y += 20;
    doc.text(`TVA (${TVA_RATE * 100}%):`, 350, y);
    doc.text(`${invoice.amounts.tva.toFixed(2)} EUR`, 420, y, { align: 'right', width: 120 });
    y += 25;

    // Total TTC highlight
    doc.rect(340, y - 5, 210, 30).fillAndStroke('#2563eb', '#2563eb');
    doc.fillColor('#fff').fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL TTC:', 350, y + 3);
    doc.text(`${invoice.amounts.amountTTC.toFixed(2)} EUR`, 420, y + 3, { align: 'right', width: 120 });

    // Payment info
    y += 60;
    doc.fillColor('#333').fontSize(9).font('Helvetica');
    doc.text('Informations de paiement:', 50, y);
    y += 15;
    doc.text(`IBAN: ${COMPANY_INFO.iban}`, 50, y);
    y += 12;
    doc.text(`BIC: ${COMPANY_INFO.bic}`, 50, y);

    // Footer
    doc.fontSize(8).fillColor('#666');
    doc.text(
      'En cas de retard de paiement, une penalite de 3 fois le taux d\'interet legal sera appliquee, ainsi qu\'une indemnite forfaitaire de 40 EUR pour frais de recouvrement.',
      50, 720, { width: 500, align: 'center' }
    );
    doc.text(
      `${COMPANY_INFO.name} - ${COMPANY_INFO.address}, ${COMPANY_INFO.postalCode} ${COMPANY_INFO.city} - ${COMPANY_INFO.email}`,
      50, 760, { width: 500, align: 'center' }
    );

    doc.end();
  });
}

/**
 * Send invoice by email
 */
async function sendInvoiceEmail(invoice, client, pdfBuffer) {
  if (!emailTransporter) {
    console.log('Email not configured, skipping send');
    return { success: false, error: 'Email not configured' };
  }

  try {
    const mailOptions = {
      from: `"SYMPHONI.A Facturation" <${COMPANY_INFO.email}>`,
      to: client.email,
      subject: `Facture ${invoice.invoiceNumber} - SYMPHONI.A`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0;">SYMPHONI.A</h1>
            <p style="margin: 5px 0 0 0;">Control Tower Logistique</p>
          </div>

          <div style="padding: 30px; background: #f8fafc;">
            <p>Bonjour${client.contactName ? ` ${client.contactName}` : ''},</p>

            <p>Veuillez trouver ci-joint votre facture <strong>${invoice.invoiceNumber}</strong> pour la periode du ${new Date(invoice.periodStart).toLocaleDateString('fr-FR')} au ${new Date(invoice.periodEnd).toLocaleDateString('fr-FR')}.</p>

            <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666;">Numero de facture:</td>
                  <td style="padding: 8px 0; text-align: right; font-weight: bold;">${invoice.invoiceNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">Montant HT:</td>
                  <td style="padding: 8px 0; text-align: right;">${invoice.amounts.amountHT.toFixed(2)} EUR</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666;">TVA (20%):</td>
                  <td style="padding: 8px 0; text-align: right;">${invoice.amounts.tva.toFixed(2)} EUR</td>
                </tr>
                <tr style="border-top: 2px solid #2563eb;">
                  <td style="padding: 12px 0; font-weight: bold; font-size: 16px;">Total TTC:</td>
                  <td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 16px; color: #2563eb;">${invoice.amounts.amountTTC.toFixed(2)} EUR</td>
                </tr>
              </table>
            </div>

            <p>Date d'echeance: <strong>${new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</strong></p>

            ${invoice.paymentMethod === 'sepa' ?
              '<p style="color: #16a34a;">Le prelevement SEPA sera effectue automatiquement a la date d\'echeance.</p>' :
              '<p>Merci de proceder au reglement avant la date d\'echeance.</p>'
            }

            <p style="margin-top: 30px; color: #666; font-size: 12px;">
              Pour toute question concernant cette facture, contactez-nous a ${COMPANY_INFO.email}
            </p>
          </div>

          <div style="background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px;">
            <p style="margin: 0;">${COMPANY_INFO.name}</p>
            <p style="margin: 5px 0 0 0;">${COMPANY_INFO.address}, ${COMPANY_INFO.postalCode} ${COMPANY_INFO.city}</p>
          </div>
        </div>
      `,
      attachments: [{
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    await emailTransporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error.message);
    return { success: false, error: error.message };
  }
}

// ===========================================
// INVOICE GENERATION
// ===========================================

/**
 * Generate invoice for a single subscription
 */
async function generateInvoiceForSubscription(subscription, periodStart, periodEnd) {
  // Get client info
  const client = await db.collection('users').findOne({
    $or: [
      { _id: new ObjectId(subscription.clientId) },
      { email: subscription.clientEmail }
    ]
  }) || {
    email: subscription.clientEmail,
    companyName: subscription.companyName,
    name: subscription.clientName
  };

  // Calculate amounts
  const plan = PRICING_PLANS[subscription.plan];
  const baseAmount = subscription.customPrice || plan?.monthlyPrice || 0;
  const amounts = calculateInvoiceAmounts(baseAmount, subscription.discountPercent || 0);

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber();

  // Create invoice document
  const invoice = {
    invoiceId: uuidv4(),
    invoiceNumber,
    clientId: subscription.clientId,
    clientEmail: subscription.clientEmail || client.email,
    subscriptionId: subscription._id.toString(),

    // Dates
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    periodStart,
    periodEnd,
    periodLabel: `${periodStart.toLocaleDateString('fr-FR')} - ${periodEnd.toLocaleDateString('fr-FR')}`,

    // Amounts
    amounts,
    currency: 'EUR',

    // Details
    plan: subscription.plan,
    planName: plan?.name || subscription.plan,

    // Payment
    paymentMethod: subscription.paymentMethod || 'card',

    // Status
    status: 'pending', // pending, paid, overdue, cancelled

    // Metadata
    createdAt: new Date(),
    updatedAt: new Date(),
    sentAt: null,
    paidAt: null
  };

  // Insert invoice
  const result = await db.collection('invoices').insertOne(invoice);
  invoice._id = result.insertedId;

  // Generate PDF
  const pdfBuffer = await generateInvoicePDF(invoice, subscription, client);

  // Store PDF reference (in production, upload to S3)
  await db.collection('invoices').updateOne(
    { _id: result.insertedId },
    { $set: { pdfGenerated: true, pdfSize: pdfBuffer.length } }
  );

  // Send email
  const emailResult = await sendInvoiceEmail(invoice, client, pdfBuffer);
  if (emailResult.success) {
    await db.collection('invoices').updateOne(
      { _id: result.insertedId },
      { $set: { sentAt: new Date(), emailSent: true } }
    );
  }

  // Update subscription
  await db.collection('subscriptions').updateOne(
    { _id: subscription._id },
    {
      $set: {
        lastInvoiceDate: new Date(),
        lastInvoiceId: invoice.invoiceId
      },
      $push: {
        invoiceHistory: {
          invoiceId: invoice.invoiceId,
          invoiceNumber,
          date: new Date(),
          amount: amounts.amountTTC
        }
      }
    }
  );

  return { invoice, pdfBuffer, emailSent: emailResult.success };
}

/**
 * Generate all monthly invoices
 */
async function generateMonthlyInvoices() {
  console.log('[CRON] Starting monthly invoice generation...');

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Find active subscriptions due for invoicing
  const subscriptions = await db.collection('subscriptions').find({
    status: 'active',
    billingCycle: 'monthly',
    $or: [
      { lastInvoiceDate: { $lt: periodStart } },
      { lastInvoiceDate: null }
    ]
  }).toArray();

  console.log(`[CRON] Found ${subscriptions.length} subscriptions to invoice`);

  const results = {
    success: 0,
    failed: 0,
    total: subscriptions.length,
    invoices: []
  };

  for (const subscription of subscriptions) {
    try {
      const result = await generateInvoiceForSubscription(subscription, periodStart, periodEnd);
      results.success++;
      results.invoices.push({
        subscriptionId: subscription._id.toString(),
        invoiceNumber: result.invoice.invoiceNumber,
        amount: result.invoice.amounts.amountTTC,
        emailSent: result.emailSent
      });
      console.log(`[CRON] Invoice ${result.invoice.invoiceNumber} generated for ${subscription.clientEmail}`);
    } catch (error) {
      results.failed++;
      console.error(`[CRON] Failed to generate invoice for ${subscription._id}:`, error.message);
    }
  }

  console.log(`[CRON] Invoice generation complete: ${results.success} success, ${results.failed} failed`);
  return results;
}

/**
 * Check and mark overdue invoices
 */
async function checkOverdueInvoices() {
  const now = new Date();

  const result = await db.collection('invoices').updateMany(
    {
      status: 'pending',
      dueDate: { $lt: now }
    },
    {
      $set: { status: 'overdue', updatedAt: now }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`[CRON] Marked ${result.modifiedCount} invoices as overdue`);
  }

  return result.modifiedCount;
}

// ===========================================
// CRON JOBS
// ===========================================

function setupCronJobs() {
  // Generate monthly invoices - 1st of each month at 9:00 AM
  cron.schedule('0 9 1 * *', async () => {
    console.log('[CRON] Monthly invoice generation triggered');
    try {
      await generateMonthlyInvoices();
    } catch (error) {
      console.error('[CRON] Monthly invoice error:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  // Check overdue invoices - Every day at 10:00 AM
  cron.schedule('0 10 * * *', async () => {
    console.log('[CRON] Checking overdue invoices');
    try {
      await checkOverdueInvoices();
    } catch (error) {
      console.error('[CRON] Overdue check error:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  console.log('[CRON] Scheduled jobs configured');
}

// ===========================================
// API ROUTES - HEALTH
// ===========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'subscription-invoicing',
    version: '1.0.0',
    mongodb: mongoConnected ? 'connected' : 'disconnected',
    email: emailTransporter ? 'configured' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// ===========================================
// API ROUTES - SUBSCRIPTIONS
// ===========================================

// Create subscription
app.post('/api/v1/subscriptions', async (req, res) => {
  try {
    const {
      clientId,
      clientEmail,
      companyName,
      plan,
      billingCycle,
      paymentMethod,
      customPrice,
      discountPercent,
      startDate
    } = req.body;

    if (!clientEmail || !plan) {
      return res.status(400).json({ success: false, error: 'clientEmail and plan required' });
    }

    const subscription = {
      clientId: clientId || null,
      clientEmail,
      companyName,
      plan,
      planName: PRICING_PLANS[plan]?.name || plan,
      billingCycle: billingCycle || 'monthly',
      paymentMethod: paymentMethod || 'card',
      customPrice: customPrice || PRICING_PLANS[plan]?.monthlyPrice,
      discountPercent: discountPercent || 0,
      status: 'active',
      startDate: startDate ? new Date(startDate) : new Date(),
      lastInvoiceDate: null,
      invoiceHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('subscriptions').insertOne(subscription);

    res.status(201).json({
      success: true,
      data: { ...subscription, _id: result.insertedId },
      message: 'Subscription created'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List subscriptions
app.get('/api/v1/subscriptions', async (req, res) => {
  try {
    const { status, plan, clientId } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (clientId) filter.clientId = clientId;

    const subscriptions = await db.collection('subscriptions')
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ success: true, data: subscriptions, count: subscriptions.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get subscription
app.get('/api/v1/subscriptions/:id', async (req, res) => {
  try {
    const subscription = await db.collection('subscriptions').findOne({
      _id: new ObjectId(req.params.id)
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update subscription
app.put('/api/v1/subscriptions/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: new Date() };
    delete updates._id;

    const result = await db.collection('subscriptions').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    res.json({ success: true, data: result, message: 'Subscription updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cancel subscription
app.post('/api/v1/subscriptions/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await db.collection('subscriptions').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: reason,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    res.json({ success: true, data: result, message: 'Subscription cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// API ROUTES - INVOICES
// ===========================================

// Generate invoice manually
app.post('/api/v1/invoices/generate', async (req, res) => {
  try {
    const { subscriptionId, periodStart, periodEnd } = req.body;

    const subscription = await db.collection('subscriptions').findOne({
      _id: new ObjectId(subscriptionId)
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    const start = periodStart ? new Date(periodStart) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = periodEnd ? new Date(periodEnd) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

    const result = await generateInvoiceForSubscription(subscription, start, end);

    res.status(201).json({
      success: true,
      data: {
        invoiceNumber: result.invoice.invoiceNumber,
        amount: result.invoice.amounts.amountTTC,
        emailSent: result.emailSent
      },
      message: 'Invoice generated'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate all monthly invoices (manual trigger)
app.post('/api/v1/invoices/generate-monthly', async (req, res) => {
  try {
    const results = await generateMonthlyInvoices();
    res.json({
      success: true,
      data: results,
      message: `Generated ${results.success} invoices`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List invoices
app.get('/api/v1/invoices', async (req, res) => {
  try {
    const { clientId, status, startDate, endDate, limit = 50 } = req.query;
    const filter = {};

    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;
    if (startDate || endDate) {
      filter.invoiceDate = {};
      if (startDate) filter.invoiceDate.$gte = new Date(startDate);
      if (endDate) filter.invoiceDate.$lte = new Date(endDate);
    }

    const invoices = await db.collection('invoices')
      .find(filter)
      .sort({ invoiceDate: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ success: true, data: invoices, count: invoices.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get invoice
app.get('/api/v1/invoices/:id', async (req, res) => {
  try {
    const invoice = await db.collection('invoices').findOne({
      $or: [
        { invoiceNumber: req.params.id },
        { invoiceId: req.params.id }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download invoice PDF
app.get('/api/v1/invoices/:id/pdf', async (req, res) => {
  try {
    const invoice = await db.collection('invoices').findOne({
      $or: [
        { invoiceNumber: req.params.id },
        { invoiceId: req.params.id }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const subscription = await db.collection('subscriptions').findOne({
      _id: new ObjectId(invoice.subscriptionId)
    });

    const client = await db.collection('users').findOne({
      $or: [
        { _id: invoice.clientId ? new ObjectId(invoice.clientId) : null },
        { email: invoice.clientEmail }
      ]
    }) || { email: invoice.clientEmail, companyName: subscription?.companyName };

    const pdfBuffer = await generateInvoicePDF(invoice, subscription || {}, client);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark invoice as paid
app.post('/api/v1/invoices/:id/pay', async (req, res) => {
  try {
    const { paymentReference, paymentDate } = req.body;

    const result = await db.collection('invoices').findOneAndUpdate(
      {
        $or: [
          { invoiceNumber: req.params.id },
          { invoiceId: req.params.id }
        ]
      },
      {
        $set: {
          status: 'paid',
          paidAt: paymentDate ? new Date(paymentDate) : new Date(),
          paymentReference,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    res.json({ success: true, data: result, message: 'Invoice marked as paid' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resend invoice email
app.post('/api/v1/invoices/:id/resend', async (req, res) => {
  try {
    const invoice = await db.collection('invoices').findOne({
      $or: [
        { invoiceNumber: req.params.id },
        { invoiceId: req.params.id }
      ]
    });

    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }

    const subscription = await db.collection('subscriptions').findOne({
      _id: new ObjectId(invoice.subscriptionId)
    });

    const client = await db.collection('users').findOne({
      email: invoice.clientEmail
    }) || { email: invoice.clientEmail, companyName: subscription?.companyName };

    const pdfBuffer = await generateInvoicePDF(invoice, subscription || {}, client);
    const emailResult = await sendInvoiceEmail(invoice, client, pdfBuffer);

    if (emailResult.success) {
      await db.collection('invoices').updateOne(
        { _id: invoice._id },
        { $set: { sentAt: new Date() }, $inc: { resendCount: 1 } }
      );
    }

    res.json({
      success: emailResult.success,
      message: emailResult.success ? 'Invoice resent' : 'Failed to send email',
      error: emailResult.error
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// API ROUTES - STATS
// ===========================================

app.get('/api/v1/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    const [
      subscriptionStats,
      invoiceStats,
      revenueStats,
      overdueInvoices
    ] = await Promise.all([
      // Subscription stats
      db.collection('subscriptions').aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).toArray(),

      // Invoice stats
      db.collection('invoices').aggregate([
        { $match: dateFilter },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amounts.amountTTC' } } }
      ]).toArray(),

      // Monthly revenue
      db.collection('invoices').aggregate([
        { $match: { ...dateFilter, status: 'paid' } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$invoiceDate' } },
            revenue: { $sum: '$amounts.amountTTC' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } },
        { $limit: 12 }
      ]).toArray(),

      // Overdue count
      db.collection('invoices').countDocuments({ status: 'overdue' })
    ]);

    res.json({
      success: true,
      data: {
        subscriptions: subscriptionStats.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        invoices: invoiceStats.reduce((acc, s) => ({ ...acc, [s._id]: { count: s.count, total: s.total } }), {}),
        monthlyRevenue: revenueStats,
        overdueCount: overdueInvoices
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===========================================
// API ROUTES - PRICING
// ===========================================

app.get('/api/v1/pricing', (req, res) => {
  res.json({
    success: true,
    data: PRICING_PLANS,
    currency: 'EUR',
    tvaRate: TVA_RATE
  });
});

// ===========================================
// START SERVER
// ===========================================

async function startServer() {
  await connectMongoDB();
  setupEmailTransporter();
  setupCronJobs();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`
========================================
  Subscription Invoicing Service
  SYMPHONI.A - RT Technologie v1.0.0
========================================
  Port: ${PORT}
  MongoDB: ${mongoConnected ? 'Connected' : 'Not connected'}
  Email: ${emailTransporter ? 'Configured' : 'Not configured'}

  Features:
  - Subscription management
  - Automatic monthly invoicing
  - PDF invoice generation
  - Email delivery
  - Payment tracking
  - Revenue statistics

  Cron Jobs:
  - Monthly invoices: 1st of month at 9:00 AM
  - Overdue check: Daily at 10:00 AM

  Endpoints:
  - GET  /health
  - POST /api/v1/subscriptions
  - GET  /api/v1/subscriptions
  - POST /api/v1/invoices/generate
  - POST /api/v1/invoices/generate-monthly
  - GET  /api/v1/invoices
  - GET  /api/v1/invoices/:id/pdf
  - POST /api/v1/invoices/:id/pay
  - GET  /api/v1/stats
========================================
    `);
  });
}

startServer();

module.exports = app;
