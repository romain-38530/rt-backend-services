// Stripe Payment Routes - Checkout & Subscription Management
// RT Backend Services - Version 2.5.2 - Migrated to AWS SES

const express = require('express');
const { ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_key');
const { SESClient, SendRawEmailCommand } = require('@aws-sdk/client-ses');
const PDFDocument = require('pdfkit');
const { authenticateToken } = require('./auth-middleware');

// Configuration Stripe
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Configuration AWS SES
const SES_CONFIG = {
  region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'eu-west-1'
};

const SES_BILLING_FROM = process.env.SES_BILLING_EMAIL || 'facturation@symphonia-controltower.com';
const SES_BILLING_FROM_NAME = 'SYMPHONI.A Facturation';

// Company info for invoices
const COMPANY_INFO = {
  name: 'RT Technologie SAS',
  address: '12 rue du Commerce',
  postalCode: '69001',
  city: 'Lyon',
  country: 'France',
  siret: '123 456 789 00012',
  tvaNumber: 'FR12345678901',
  email: 'facturation@symphonia-controltower.com',
  phone: '+33 4 78 12 34 56',
  iban: 'FR76 1234 5678 9012 3456 7890 123',
  bic: 'BNPAFRPP'
};

// Pricing plans with Stripe price IDs (create these in Stripe Dashboard)
const PRICING_PLANS = {
  industriel: {
    name: 'Espace Industriel',
    monthlyPrice: 499,
    annualPrice: 5988,
    stripePriceId: process.env.STRIPE_PRICE_INDUSTRIEL || 'price_industriel_monthly'
  },
  transporteur_premium: {
    name: 'Transporteur Premium',
    monthlyPrice: 299,
    annualPrice: 3588,
    stripePriceId: process.env.STRIPE_PRICE_TRANSPORTEUR_PREMIUM || 'price_transporteur_premium_monthly'
  },
  transporteur_pro: {
    name: 'Transporteur Pro',
    monthlyPrice: 499,
    annualPrice: 5988,
    stripePriceId: process.env.STRIPE_PRICE_TRANSPORTEUR_PRO || 'price_transporteur_pro_monthly'
  },
  logisticien_premium: {
    name: 'Logisticien Premium',
    monthlyPrice: 499,
    annualPrice: 5988,
    stripePriceId: process.env.STRIPE_PRICE_LOGISTICIEN_PREMIUM || 'price_logisticien_premium_monthly'
  }
};

const TVA_RATE = 0.20;

// Options pricing with Stripe price IDs
const OPTION_PRICES = {
  // Options mensuelles fixes
  afretIA: {
    name: 'AFFRET.IA Premium',
    monthlyPrice: 200,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_AFFRET_IA || 'price_1Sa0Q9RzJcFnHbQGo9MPpKLL',
    type: 'monthly'
  },
  thirdPartyConnection: {
    name: 'Connexion outil tiers',
    monthlyPrice: 89,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_THIRD_PARTY_CONNECTION || 'price_1Sa0Q9RzJcFnHbQGkRbuRWZw',
    type: 'monthly'
  },
  eCmr: {
    name: 'e-CMR',
    monthlyPrice: 49,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_ECMR || 'price_1Sa0QARzJcFnHbQG5sKai3lV',
    type: 'monthly'
  },
  geofencing: {
    name: 'Geofencing',
    monthlyPrice: 29,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_GEOFENCING || 'price_1Sa0QARzJcFnHbQG4sCCR76F',
    type: 'monthly'
  },
  ocrDocuments: {
    name: 'OCR Documents',
    monthlyPrice: 39,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_OCR_DOCUMENTS || 'price_1Sa0QBRzJcFnHbQG1wucZp7t',
    type: 'monthly'
  },
  boursePrivee: {
    name: 'Bourse privée transporteurs',
    monthlyPrice: 149,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_BOURSE_PRIVEE || 'price_1Sa0QBRzJcFnHbQGj4oDShX6',
    type: 'monthly'
  },
  webhooks: {
    name: 'Webhooks temps réel',
    monthlyPrice: 59,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_WEBHOOKS || 'price_1Sa0QCRzJcFnHbQGUbeuvkxL',
    type: 'monthly'
  },
  archivageLegal: {
    name: 'Archivage légal 10 ans',
    monthlyPrice: 19,
    stripePriceId: process.env.STRIPE_PRICE_OPTION_ARCHIVAGE_LEGAL || 'price_1Sa0QCRzJcFnHbQGBWVtBqwC',
    type: 'monthly'
  },
  // Options par unité
  telematics: {
    name: 'Connexion télématique',
    unitPrice: 19,
    unit: 'camion',
    stripePriceId: process.env.STRIPE_PRICE_OPTION_TELEMATICS || 'price_1Sa0QDRzJcFnHbQGoYJAtJHT',
    type: 'per_unit'
  },
  trackingPremium: {
    name: 'Tracking Premium GPS',
    unitPrice: 4,
    unit: 'véhicule',
    stripePriceId: process.env.STRIPE_PRICE_OPTION_TRACKING_PREMIUM || 'price_1Sa0QERzJcFnHbQGmx9ZJODi',
    type: 'per_unit'
  },
  // Options à l'usage (metered)
  sms: {
    name: 'Notifications SMS',
    unitPrice: 0.07,
    unit: 'SMS',
    stripePriceId: process.env.STRIPE_PRICE_OPTION_SMS || 'price_1Sa0QERzJcFnHbQGcqYGnCCf',
    type: 'metered'
  },
  signatureQualifiee: {
    name: 'Signature électronique qualifiée',
    unitPrice: 2,
    unit: 'signature',
    stripePriceId: process.env.STRIPE_PRICE_OPTION_SIGNATURE_QUALIFIEE || 'price_1Sa0QFRzJcFnHbQGqqLYiMvV',
    type: 'metered'
  }
};

function createStripeRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // AWS SES Client for billing emails
  let sesClient = null;
  try {
    sesClient = new SESClient(SES_CONFIG);
    console.log(`[Stripe] AWS SES initialized for billing (region: ${SES_CONFIG.region})`);
  } catch (error) {
    console.error('[Stripe] AWS SES initialization failed:', error.message);
  }

  // Middleware pour vérifier la connexion MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available'
        }
      });
    }
    next();
  };

  // ==================== INVOICE HELPER FUNCTIONS ====================

  /**
   * Generate invoice number: FAC-YYYYMM-XXXX
   */
  async function generateInvoiceNumber(db) {
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
  async function generateInvoicePDF(invoice, client) {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header - Company logo area
      doc.fontSize(24).fillColor('#f97316').text('SYMPHONI.A', 50, 50);
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
        doc.text(client.address, 350, 150, { width: 180 });
      }
      if (client.vatNumber) {
        doc.text(`TVA: ${client.vatNumber}`, 350, 185);
      }

      // Invoice details box
      doc.rect(50, 220, 500, 60).fillAndStroke('#fff7ed', '#fdba74');
      doc.fillColor('#333').fontSize(9);
      doc.text('Date de facture:', 60, 235);
      doc.text(new Date(invoice.invoiceDate).toLocaleDateString('fr-FR'), 160, 235);
      doc.text('Date d\'echeance:', 60, 250);
      doc.text(new Date(invoice.dueDate).toLocaleDateString('fr-FR'), 160, 250);
      doc.text('Periode:', 300, 235);
      doc.text(invoice.periodLabel || 'Mensuel', 380, 235);
      doc.text('Mode de paiement:', 300, 250);
      doc.text('Carte bancaire', 380, 250);

      // Table header
      const tableTop = 310;
      doc.rect(50, tableTop, 500, 25).fillAndStroke('#f97316', '#f97316');
      doc.fillColor('#fff').fontSize(10);
      doc.text('Description', 60, tableTop + 8);
      doc.text('Periode', 280, tableTop + 8);
      doc.text('Montant HT', 420, tableTop + 8, { align: 'right', width: 120 });

      // Table content
      let y = tableTop + 35;
      doc.fillColor('#333').fontSize(10);

      // Subscription line
      doc.text(`Abonnement ${invoice.planName}`, 60, y, { width: 200 });
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
      doc.moveTo(50, y).lineTo(550, y).stroke('#fdba74');
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
      doc.rect(340, y - 5, 210, 30).fillAndStroke('#f97316', '#f97316');
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
        'En cas de retard de paiement, une penalite de 3 fois le taux d\'interet legal sera appliquee.',
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
   * Send invoice by email via AWS SES with PDF attachment
   */
  async function sendInvoiceEmail(invoice, client, pdfBuffer) {
    if (!sesClient) {
      console.log('[Invoice] AWS SES not configured, skipping send');
      return { success: false, error: 'AWS SES not configured' };
    }

    try {
      const sender = `${SES_BILLING_FROM_NAME} <${SES_BILLING_FROM}>`;
      const subject = `Facture ${invoice.invoiceNumber} - SYMPHONI.A`;

      const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #f97316 0%, #dc2626 100%); color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">SYMPHONI.A</h1>
              <p style="margin: 5px 0 0 0;">Control Tower Logistique</p>
            </div>

            <div style="padding: 30px; background: #fff7ed;">
              <p>Bonjour${client.contactName ? ` ${client.contactName}` : ''},</p>

              <p>Veuillez trouver ci-joint votre facture <strong>${invoice.invoiceNumber}</strong>.</p>

              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #fdba74;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Numero de facture:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold;">${invoice.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Abonnement:</td>
                    <td style="padding: 8px 0; text-align: right;">${invoice.planName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">Montant HT:</td>
                    <td style="padding: 8px 0; text-align: right;">${invoice.amounts.amountHT.toFixed(2)} EUR</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;">TVA (20%):</td>
                    <td style="padding: 8px 0; text-align: right;">${invoice.amounts.tva.toFixed(2)} EUR</td>
                  </tr>
                  <tr style="border-top: 2px solid #f97316;">
                    <td style="padding: 12px 0; font-weight: bold; font-size: 16px;">Total TTC:</td>
                    <td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 16px; color: #f97316;">${invoice.amounts.amountTTC.toFixed(2)} EUR</td>
                  </tr>
                </table>
              </div>

              <p style="color: #16a34a; font-weight: bold;">
                Ce montant a ete preleve automatiquement sur votre carte bancaire.
              </p>

              <p style="margin-top: 30px; color: #666; font-size: 12px;">
                Pour toute question concernant cette facture, contactez-nous a ${COMPANY_INFO.email}
              </p>
            </div>

            <div style="background: #1e293b; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">${COMPANY_INFO.name}</p>
              <p style="margin: 5px 0 0 0;">${COMPANY_INFO.address}, ${COMPANY_INFO.postalCode} ${COMPANY_INFO.city}</p>
            </div>
          </div>
        `;

      // Build MIME message with PDF attachment and anti-spam headers
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const pdfBase64 = pdfBuffer.toString('base64');
      const domain = SES_BILLING_FROM.split('@')[1] || 'symphonia-controltower.com';
      const messageId = `<${Date.now()}.${Math.random().toString(36).substring(2, 11)}@${domain}>`;
      const replyTo = 'support@symphonia-controltower.com';

      // Version texte brut pour anti-spam
      const plainText = htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

      const rawMessage = [
        `From: ${sender}`,
        `To: ${client.email}`,
        `Reply-To: ${replyTo}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
        `Message-ID: ${messageId}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        // Headers anti-spam
        'X-Priority: 3',
        'X-Mailer: SYMPHONIA-ControlTower/2.5',
        `List-Unsubscribe: <mailto:unsubscribe@${domain}?subject=unsubscribe>`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        plainText,
        '',
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: quoted-printable',
        '',
        htmlBody,
        '',
        `--${boundary}`,
        'Content-Type: application/pdf',
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${invoice.invoiceNumber}.pdf"`,
        '',
        pdfBase64,
        '',
        `--${boundary}--`
      ].join('\r\n');

      const command = new SendRawEmailCommand({
        RawMessage: {
          Data: Buffer.from(rawMessage)
        }
      });

      const result = await sesClient.send(command);
      console.log(`[AWS-SES] Invoice email sent to ${client.email} for ${invoice.invoiceNumber}`);
      return { success: true, messageId: result.MessageId, provider: 'aws-ses' };
    } catch (error) {
      console.error('[Invoice] AWS SES send error:', error.message);
      return { success: false, error: error.message, provider: 'aws-ses' };
    }
  }

  /**
   * Create subscription after card setup
   */
  async function createSubscriptionForOnboarding(onboardingRequest, stripeCustomerId, db) {
    try {
      const subscriptionType = onboardingRequest.subscriptionType || 'industriel';
      const duration = parseInt(onboardingRequest.duration) || 12;
      const plan = PRICING_PLANS[subscriptionType] || PRICING_PLANS.industriel;
      const selectedOptions = onboardingRequest.options || {};

      // Calculate discount based on duration
      let discountPercent = 0;
      if (duration >= 60) discountPercent = 7;
      else if (duration >= 48) discountPercent = 5;
      else if (duration >= 36) discountPercent = 3;

      // Get the default payment method for the customer
      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card'
      });

      if (paymentMethods.data.length === 0) {
        throw new Error('No payment method found for customer');
      }

      const defaultPaymentMethod = paymentMethods.data[0].id;

      // Set the default payment method on the customer
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: {
          default_payment_method: defaultPaymentMethod
        }
      });

      // Build subscription items: main plan + selected options
      const subscriptionItems = [{ price: plan.stripePriceId }];
      const selectedOptionNames = [];

      // Add selected options to subscription
      for (const [optionKey, isSelected] of Object.entries(selectedOptions)) {
        if (isSelected && OPTION_PRICES[optionKey]) {
          const option = OPTION_PRICES[optionKey];
          const item = { price: option.stripePriceId };

          // For per_unit options, get quantity from onboardingRequest if available
          if (option.type === 'per_unit') {
            const quantity = onboardingRequest.optionQuantities?.[optionKey] || 1;
            item.quantity = quantity;
          }

          subscriptionItems.push(item);
          selectedOptionNames.push(option.name);
          console.log(`[Stripe] Adding option: ${option.name} (${option.stripePriceId})`);
        }
      }

      // Create the subscription with all items
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: subscriptionItems,
        default_payment_method: defaultPaymentMethod,
        metadata: {
          onboardingRequestId: onboardingRequest._id.toString(),
          subscriptionType,
          duration: duration.toString(),
          discountPercent: discountPercent.toString(),
          companyName: onboardingRequest.companyName || '',
          selectedOptions: selectedOptionNames.join(', ')
        },
        // Calculate the end date based on contract duration
        cancel_at: Math.floor(Date.now() / 1000) + (duration * 30 * 24 * 60 * 60)
      });

      // Update onboarding request with subscription info
      await db.collection('onboarding_requests').updateOne(
        { _id: onboardingRequest._id },
        {
          $set: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            subscriptionCreatedAt: new Date(),
            selectedOptions: selectedOptionNames,
            updatedAt: new Date()
          }
        }
      );

      console.log(`[Stripe] Subscription ${subscription.id} created for ${onboardingRequest.email} with ${subscriptionItems.length} items`);
      return subscription;
    } catch (error) {
      console.error('[Stripe] Error creating subscription:', error.message);
      throw error;
    }
  }

  /**
   * Generate and send invoice for a Stripe payment
   */
  async function processInvoicePayment(stripeInvoice, db) {
    try {
      // Get customer info
      const customer = await stripe.customers.retrieve(stripeInvoice.customer);

      // Get subscription metadata
      let subscriptionType = 'industriel';
      let discountPercent = 0;
      let companyName = customer.metadata?.companyName || customer.name || '';

      if (stripeInvoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
        subscriptionType = subscription.metadata?.subscriptionType || 'industriel';
        discountPercent = parseInt(subscription.metadata?.discountPercent) || 0;
        companyName = subscription.metadata?.companyName || companyName;
      }

      const plan = PRICING_PLANS[subscriptionType] || PRICING_PLANS.industriel;
      const amounts = calculateInvoiceAmounts(plan.monthlyPrice, discountPercent);

      // Generate invoice number
      const invoiceNumber = await generateInvoiceNumber(db);

      // Determine period
      const periodStart = new Date(stripeInvoice.period_start * 1000);
      const periodEnd = new Date(stripeInvoice.period_end * 1000);
      const periodLabel = `${periodStart.toLocaleDateString('fr-FR')} - ${periodEnd.toLocaleDateString('fr-FR')}`;

      // Create invoice document
      const invoice = {
        invoiceNumber,
        stripeInvoiceId: stripeInvoice.id,
        stripeCustomerId: stripeInvoice.customer,
        stripeSubscriptionId: stripeInvoice.subscription,
        clientEmail: customer.email,
        companyName,

        // Dates
        invoiceDate: new Date(),
        dueDate: new Date(stripeInvoice.due_date ? stripeInvoice.due_date * 1000 : Date.now()),
        periodStart,
        periodEnd,
        periodLabel,

        // Plan info
        planType: subscriptionType,
        planName: plan.name,

        // Amounts
        amounts,
        currency: 'EUR',

        // Status
        status: 'paid',
        paidAt: new Date(),

        // Metadata
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Insert invoice
      const result = await db.collection('invoices').insertOne(invoice);
      invoice._id = result.insertedId;

      // Generate PDF
      const client = {
        email: customer.email,
        companyName,
        contactName: customer.name,
        address: customer.address ?
          `${customer.address.line1 || ''}\n${customer.address.postal_code || ''} ${customer.address.city || ''}` : '',
        vatNumber: customer.metadata?.vatNumber || ''
      };

      const pdfBuffer = await generateInvoicePDF(invoice, client);

      // Update invoice with PDF info
      await db.collection('invoices').updateOne(
        { _id: result.insertedId },
        { $set: { pdfGenerated: true, pdfSize: pdfBuffer.length } }
      );

      // Send email
      const emailResult = await sendInvoiceEmail(invoice, client, pdfBuffer);
      if (emailResult.success) {
        await db.collection('invoices').updateOne(
          { _id: result.insertedId },
          { $set: { emailSent: true, emailSentAt: new Date() } }
        );
      }

      console.log(`[Invoice] Invoice ${invoiceNumber} created and sent for ${customer.email}`);
      return { invoice, pdfBuffer, emailSent: emailResult.success };
    } catch (error) {
      console.error('[Invoice] Error processing invoice:', error.message);
      throw error;
    }
  }

  // ==================== ENDPOINTS STRIPE ====================

  /**
   * POST /api/stripe/create-checkout-session
   * Créer une session de paiement Stripe
   * Nécessite authentication
   *
   * Body: {
   *   priceId: "price_1234567890",        // Stripe Price ID
   *   successUrl: "/success",              // URL de redirection après succès
   *   cancelUrl: "/cancel",                // URL de redirection après annulation
   *   metadata: { ... }                    // Métadonnées optionnelles
   * }
   */
  router.post('/create-checkout-session', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { priceId, successUrl = '/success', cancelUrl = '/cancel', metadata = {} } = req.body;

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PRICE_ID',
            message: 'Stripe price ID is required'
          }
        });
      }

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: req.user.userId,
            companyName: user.companyName || '',
            role: user.role
          }
        });
        stripeCustomerId = customer.id;

        // Sauvegarder le Stripe Customer ID
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer la session de checkout
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription', // ou 'payment' pour un paiement unique
        success_url: `${FRONTEND_URL}${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}${cancelUrl}`,
        metadata: {
          userId: req.user.userId,
          ...metadata
        }
      });

      // Enregistrer la session dans la DB
      await db.collection('checkout_sessions').insertOne({
        sessionId: session.id,
        userId: req.user.userId,
        priceId,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(session.expires_at * 1000),
        metadata
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/create-payment-intent
   * Créer un Payment Intent pour paiement direct
   * Nécessite authentication
   *
   * Body: {
   *   amount: 5000,                        // Montant en centimes (50.00 EUR)
   *   currency: "eur",
   *   metadata: { ... }
   * }
   */
  router.post('/create-payment-intent', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { amount, currency = 'eur', metadata = {} } = req.body;

      if (!amount || amount < 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be at least 0.50 EUR (50 cents)'
          }
        });
      }

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: req.user.userId,
            companyName: user.companyName || '',
            role: user.role
          }
        });
        stripeCustomerId = customer.id;

        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer le Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: stripeCustomerId,
        metadata: {
          userId: req.user.userId,
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true
        }
      });

      // Enregistrer dans la DB
      await db.collection('payment_intents').insertOne({
        paymentIntentId: paymentIntent.id,
        userId: req.user.userId,
        amount,
        currency,
        status: paymentIntent.status,
        createdAt: new Date(),
        metadata
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        }
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/stripe/subscriptions
   * Récupérer les abonnements de l'utilisateur connecté
   */
  router.get('/subscriptions', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || !user.stripeCustomerId) {
        return res.json({
          success: true,
          data: {
            subscriptions: []
          }
        });
      }

      // Récupérer les abonnements depuis Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 100
      });

      res.json({
        success: true,
        data: {
          subscriptions: subscriptions.data
        }
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/cancel-subscription
   * Annuler un abonnement
   *
   * Body: {
   *   subscriptionId: "sub_1234567890"
   * }
   */
  router.post('/cancel-subscription', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { subscriptionId } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SUBSCRIPTION_ID',
            message: 'Subscription ID is required'
          }
        });
      }

      // Récupérer l'abonnement pour vérifier qu'il appartient à l'utilisateur
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || subscription.customer !== user.stripeCustomerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to cancel this subscription'
          }
        });
      }

      // Annuler l'abonnement
      const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);

      // Enregistrer l'annulation dans la DB
      await db.collection('subscription_events').insertOne({
        userId: req.user.userId,
        subscriptionId,
        event: 'subscription_canceled',
        timestamp: new Date(),
        data: canceledSubscription
      });

      res.json({
        success: true,
        message: 'Subscription canceled successfully',
        data: canceledSubscription
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/stripe/payment-history
   * Récupérer l'historique des paiements de l'utilisateur
   */
  router.get('/payment-history', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || !user.stripeCustomerId) {
        return res.json({
          success: true,
          data: {
            payments: []
          }
        });
      }

      // Récupérer les paiements depuis Stripe
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 100
      });

      res.json({
        success: true,
        data: {
          payments: charges.data
        }
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/webhook
   * Webhook pour recevoir les événements Stripe
   * IMPORTANT: Ce endpoint ne doit PAS avoir d'authentication JWT
   */
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      // Vérifier la signature du webhook
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (!mongoConnected) {
      console.error('MongoDB not connected, webhook event not processed');
      return res.status(503).json({ error: 'Database not available' });
    }

    const db = mongoClient.db();

    // Traiter l'événement
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          // Session de paiement complétée
          const session = event.data.object;

          // Si c'est une session de setup (enregistrement carte), créer l'abonnement
          if (session.mode === 'setup') {
            console.log('[Webhook] Setup session completed, creating subscription...');

            // Récupérer l'onboarding request depuis rt-auth
            const authDb = mongoClient.db('rt-auth');
            const onboardingRequestId = session.metadata?.onboardingRequestId;

            if (onboardingRequestId) {
              const onboardingRequest = await authDb.collection('onboarding_requests').findOne({
                _id: new ObjectId(onboardingRequestId)
              });

              if (onboardingRequest && !onboardingRequest.stripeSubscriptionId) {
                try {
                  // Créer l'abonnement Stripe
                  const subscription = await createSubscriptionForOnboarding(
                    onboardingRequest,
                    session.customer,
                    authDb
                  );
                  console.log(`✅ Subscription ${subscription.id} created for onboarding ${onboardingRequestId}`);
                } catch (subError) {
                  console.error('[Webhook] Error creating subscription:', subError.message);
                }
              }
            }
          } else {
            // Session de paiement normale
            await db.collection('checkout_sessions').updateOne(
              { sessionId: session.id },
              {
                $set: {
                  status: 'completed',
                  completedAt: new Date(),
                  subscriptionId: session.subscription || null
                }
              }
            );

            // Mettre à jour l'utilisateur avec l'abonnement
            if (session.subscription && session.metadata?.userId) {
              await db.collection('users').updateOne(
                { _id: new ObjectId(session.metadata.userId) },
                {
                  $set: {
                    subscriptionId: session.subscription,
                    subscriptionStatus: 'active',
                    updatedAt: new Date()
                  }
                }
              );
            }
          }

          console.log('✅ Checkout session completed:', session.id, 'mode:', session.mode);
          break;

        case 'customer.subscription.created':
          // Abonnement créé
          const subCreated = event.data.object;
          await db.collection('subscription_events').insertOne({
            subscriptionId: subCreated.id,
            customerId: subCreated.customer,
            event: 'subscription_created',
            status: subCreated.status,
            timestamp: new Date(),
            data: subCreated
          });
          console.log('✅ Subscription created:', subCreated.id);
          break;

        case 'customer.subscription.updated':
          // Abonnement mis à jour
          const subUpdated = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: subUpdated.customer },
            {
              $set: {
                subscriptionStatus: subUpdated.status,
                updatedAt: new Date()
              }
            }
          );

          await db.collection('subscription_events').insertOne({
            subscriptionId: subUpdated.id,
            customerId: subUpdated.customer,
            event: 'subscription_updated',
            status: subUpdated.status,
            timestamp: new Date(),
            data: subUpdated
          });
          console.log('✅ Subscription updated:', subUpdated.id);
          break;

        case 'customer.subscription.deleted':
          // Abonnement supprimé
          const subDeleted = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: subDeleted.customer },
            {
              $set: {
                subscriptionStatus: 'canceled',
                updatedAt: new Date()
              }
            }
          );

          await db.collection('subscription_events').insertOne({
            subscriptionId: subDeleted.id,
            customerId: subDeleted.customer,
            event: 'subscription_deleted',
            status: 'canceled',
            timestamp: new Date(),
            data: subDeleted
          });
          console.log('✅ Subscription deleted:', subDeleted.id);
          break;

        case 'invoice.payment_succeeded':
          // Paiement de facture réussi - Générer et envoyer la facture PDF
          const stripeInvoice = event.data.object;

          // Vérifier si c'est une vraie facture d'abonnement (pas un setup)
          if (stripeInvoice.subscription && stripeInvoice.amount_paid > 0) {
            try {
              console.log(`[Webhook] Processing invoice payment for ${stripeInvoice.id}...`);

              // Générer et envoyer notre facture
              const invoiceResult = await processInvoicePayment(stripeInvoice, db);

              console.log(`✅ Invoice ${invoiceResult.invoice.invoiceNumber} created and ${invoiceResult.emailSent ? 'sent' : 'not sent (email not configured)'}`);
            } catch (invoiceError) {
              console.error('[Webhook] Error processing invoice:', invoiceError.message);

              // Enregistrer l'échec pour retry manuel
              await db.collection('invoice_errors').insertOne({
                stripeInvoiceId: stripeInvoice.id,
                stripeCustomerId: stripeInvoice.customer,
                error: invoiceError.message,
                createdAt: new Date()
              });
            }
          } else {
            // Simple log pour les factures de setup (0€)
            console.log(`[Webhook] Skipping invoice ${stripeInvoice.id} (amount: ${stripeInvoice.amount_paid}, no subscription)`);
          }
          break;

        case 'invoice.payment_failed':
          // Paiement de facture échoué
          const failedInvoice = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: failedInvoice.customer },
            {
              $set: {
                subscriptionStatus: 'past_due',
                updatedAt: new Date()
              }
            }
          );
          console.log('❌ Invoice payment failed:', failedInvoice.id);
          break;

        case 'payment_intent.succeeded':
          // Payment Intent réussi
          const paymentIntent = event.data.object;
          await db.collection('payment_intents').updateOne(
            { paymentIntentId: paymentIntent.id },
            {
              $set: {
                status: 'succeeded',
                succeededAt: new Date()
              }
            }
          );
          console.log('✅ Payment succeeded:', paymentIntent.id);
          break;

        case 'payment_intent.payment_failed':
          // Payment Intent échoué
          const failedPayment = event.data.object;
          await db.collection('payment_intents').updateOne(
            { paymentIntentId: failedPayment.id },
            {
              $set: {
                status: 'failed',
                failedAt: new Date(),
                failureReason: failedPayment.last_payment_error?.message || 'Unknown error'
              }
            }
          );
          console.log('❌ Payment failed:', failedPayment.id);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Enregistrer tous les événements
      await db.collection('stripe_webhooks').insertOne({
        eventId: event.id,
        type: event.type,
        createdAt: new Date(),
        data: event.data.object
      });

      res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  /**
   * GET /api/stripe/products
   * Liste des produits et prix disponibles (public)
   */
  router.get('/products', async (req, res) => {
    try {
      // Récupérer les produits actifs
      const products = await stripe.products.list({
        active: true,
        limit: 100
      });

      // Récupérer les prix pour chaque produit
      const productsWithPrices = await Promise.all(
        products.data.map(async (product) => {
          const prices = await stripe.prices.list({
            product: product.id,
            active: true
          });

          return {
            ...product,
            prices: prices.data
          };
        })
      );

      res.json({
        success: true,
        data: {
          products: productsWithPrices
        }
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== SETUP SESSION FOR ONBOARDING ====================

  /**
   * POST /api/stripe/create-session
   * Créer une session Stripe Setup pour enregistrer une carte bancaire (onboarding)
   * PAS D'AUTHENTIFICATION REQUISE - utilisé depuis l'email d'onboarding
   *
   * Body: {
   *   requestId: "ObjectId",         // ID de la demande d'onboarding
   *   email: "email@example.com",    // Email du client
   *   successUrl: "...",             // URL de redirection après succès
   *   cancelUrl: "..."               // URL de redirection après annulation
   * }
   */
  router.post('/create-session', checkMongoDB, async (req, res) => {
    try {
      const { requestId, email, successUrl, cancelUrl } = req.body;

      if (!requestId || !email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMS',
            message: 'requestId and email are required'
          }
        });
      }

      // Use rt-auth database for onboarding_requests (they are stored there by authz service)
      const db = mongoClient.db('rt-auth');

      // Vérifier que la demande d'onboarding existe
      let onboardingRequest;
      try {
        onboardingRequest = await db.collection('onboarding_requests').findOne({
          _id: new ObjectId(requestId),
          email: email.toLowerCase()
        });
      } catch (err) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST_ID',
            message: 'Invalid request ID format'
          }
        });
      }

      if (!onboardingRequest) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Onboarding request not found or email mismatch'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = onboardingRequest.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: email.toLowerCase(),
          metadata: {
            onboardingRequestId: requestId,
            companyName: onboardingRequest.companyName || '',
            siret: onboardingRequest.siret || ''
          }
        });
        stripeCustomerId = customer.id;

        // Sauvegarder le Stripe Customer ID
        await db.collection('onboarding_requests').updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer la session de checkout en mode "setup" (enregistrement de carte sans paiement)
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        mode: 'setup',
        success_url: successUrl || `${FRONTEND_URL}/finalize-payment/success?requestId=${requestId}`,
        cancel_url: cancelUrl || `${FRONTEND_URL}/finalize-payment?requestId=${requestId}&email=${encodeURIComponent(email)}&cancelled=true`,
        metadata: {
          onboardingRequestId: requestId,
          email: email.toLowerCase()
        }
      });

      console.log(`[Stripe] Setup session created for ${email}, requestId: ${requestId}`);

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id
      });

    } catch (error) {
      console.error('[Stripe] Create session error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  // ==================== INVOICE PORTAL ENDPOINTS ====================

  /**
   * GET /api/stripe/invoices
   * Récupérer les factures d'un client par email ou stripeCustomerId
   * Public (utilisé depuis le portail client)
   */
  router.get('/invoices', checkMongoDB, async (req, res) => {
    try {
      const { email, customerId, limit = 50 } = req.query;

      if (!email && !customerId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PARAMS', message: 'email or customerId required' }
        });
      }

      const db = mongoClient.db();
      const filter = {};

      if (email) {
        filter.clientEmail = email.toLowerCase();
      }
      if (customerId) {
        filter.stripeCustomerId = customerId;
      }

      const invoices = await db.collection('invoices')
        .find(filter)
        .sort({ invoiceDate: -1 })
        .limit(parseInt(limit))
        .project({
          invoiceNumber: 1,
          invoiceDate: 1,
          dueDate: 1,
          planName: 1,
          periodLabel: 1,
          amounts: 1,
          status: 1,
          paidAt: 1,
          emailSent: 1
        })
        .toArray();

      res.json({
        success: true,
        data: invoices,
        count: invoices.length
      });
    } catch (error) {
      console.error('[Invoices] Error fetching invoices:', error.message);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/stripe/invoices/:invoiceNumber
   * Récupérer une facture spécifique
   */
  router.get('/invoices/:invoiceNumber', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const invoice = await db.collection('invoices').findOne({
        invoiceNumber: req.params.invoiceNumber
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' }
        });
      }

      res.json({
        success: true,
        data: invoice
      });
    } catch (error) {
      console.error('[Invoices] Error fetching invoice:', error.message);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/stripe/invoices/:invoiceNumber/pdf
   * Télécharger le PDF d'une facture
   */
  router.get('/invoices/:invoiceNumber/pdf', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const invoice = await db.collection('invoices').findOne({
        invoiceNumber: req.params.invoiceNumber
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' }
        });
      }

      // Récupérer les infos client
      const client = {
        email: invoice.clientEmail,
        companyName: invoice.companyName,
        contactName: '',
        address: '',
        vatNumber: ''
      };

      // Générer le PDF
      const pdfBuffer = await generateInvoicePDF(invoice, client);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${invoice.invoiceNumber}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Invoices] Error generating PDF:', error.message);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/stripe/subscription-status
   * Récupérer le statut d'abonnement d'un client
   */
  router.get('/subscription-status', checkMongoDB, async (req, res) => {
    try {
      const { email, requestId } = req.query;

      if (!email && !requestId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PARAMS', message: 'email or requestId required' }
        });
      }

      // Chercher dans rt-auth
      const authDb = mongoClient.db('rt-auth');
      const filter = {};
      if (requestId) {
        filter._id = new ObjectId(requestId);
      }
      if (email) {
        filter.email = email.toLowerCase();
      }

      const onboardingRequest = await authDb.collection('onboarding_requests').findOne(filter);

      if (!onboardingRequest) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Onboarding request not found' }
        });
      }

      // Récupérer le statut Stripe si subscription existe
      let stripeSubscription = null;
      if (onboardingRequest.stripeSubscriptionId) {
        try {
          stripeSubscription = await stripe.subscriptions.retrieve(onboardingRequest.stripeSubscriptionId);
        } catch (e) {
          console.error('[Stripe] Error fetching subscription:', e.message);
        }
      }

      res.json({
        success: true,
        data: {
          requestId: onboardingRequest._id,
          email: onboardingRequest.email,
          companyName: onboardingRequest.companyName,
          subscriptionType: onboardingRequest.subscriptionType,
          duration: onboardingRequest.duration,
          paymentMethod: onboardingRequest.paymentMethod,
          stripeCustomerId: onboardingRequest.stripeCustomerId || null,
          stripeSubscriptionId: onboardingRequest.stripeSubscriptionId || null,
          subscriptionStatus: stripeSubscription?.status || onboardingRequest.subscriptionStatus || 'pending',
          currentPeriodEnd: stripeSubscription?.current_period_end ?
            new Date(stripeSubscription.current_period_end * 1000) : null,
          cancelAt: stripeSubscription?.cancel_at ?
            new Date(stripeSubscription.cancel_at * 1000) : null,
          createdAt: onboardingRequest.createdAt
        }
      });
    } catch (error) {
      console.error('[Stripe] Error fetching subscription status:', error.message);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/stripe/invoices/:invoiceNumber/resend
   * Renvoyer une facture par email
   */
  router.post('/invoices/:invoiceNumber/resend', checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const invoice = await db.collection('invoices').findOne({
        invoiceNumber: req.params.invoiceNumber
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Invoice not found' }
        });
      }

      const client = {
        email: invoice.clientEmail,
        companyName: invoice.companyName,
        contactName: '',
        address: '',
        vatNumber: ''
      };

      const pdfBuffer = await generateInvoicePDF(invoice, client);
      const emailResult = await sendInvoiceEmail(invoice, client, pdfBuffer);

      if (emailResult.success) {
        await db.collection('invoices').updateOne(
          { _id: invoice._id },
          {
            $set: { lastResentAt: new Date() },
            $inc: { resendCount: 1 }
          }
        );
      }

      res.json({
        success: emailResult.success,
        message: emailResult.success ? 'Invoice resent successfully' : 'Failed to send email',
        error: emailResult.error || null
      });
    } catch (error) {
      console.error('[Invoices] Error resending invoice:', error.message);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  return router;
}

module.exports = createStripeRoutes;
