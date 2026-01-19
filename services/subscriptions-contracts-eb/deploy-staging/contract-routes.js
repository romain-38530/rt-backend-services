/**
 * SYMPHONI.A - Contract Routes
 * RT Backend Services - Version 1.0.0
 *
 * API routes for contract generation, signature, and management
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticateToken } = require('./auth-middleware');
const {
  ContractService,
  generateContractPDF,
  SUBSCRIPTION_PLANS,
  ADDITIONAL_OPTIONS,
  getDiscountRate
} = require('./contract-service');

function createContractRoutes(mongoClient, mongoConnected, sesClient = null) {
  const router = express.Router();
  const contractService = new ContractService(mongoClient, sesClient);

  // Middleware to check MongoDB connection
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' }
      });
    }
    next();
  };

  // SECURITY: Admin key validation
  function validateAdminKey(providedKey) {
    const expectedKey = process.env.ADMIN_SETUP_KEY;
    if (process.env.NODE_ENV === 'production' && !expectedKey) {
      console.error('[SECURITY] ADMIN_SETUP_KEY not configured in production');
      return false;
    }
    const keyToCheck = expectedKey || 'dev-admin-key-not-for-production';
    return providedKey === keyToCheck;
  }

  // ==================== PUBLIC ENDPOINTS ====================

  /**
   * GET /api/contracts/plans
   * List available subscription plans (public)
   */
  router.get('/plans', (req, res) => {
    const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
      id,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.monthlyPrice,
      features: plan.features,
      launchPrice: plan.launchPrice || false,
      normalPrice: plan.normalPrice || null
    }));

    res.json({
      success: true,
      data: { plans }
    });
  });

  /**
   * GET /api/contracts/options
   * List available options (public)
   */
  router.get('/options', (req, res) => {
    const options = Object.entries(ADDITIONAL_OPTIONS).map(([id, opt]) => ({
      id,
      name: opt.name,
      description: opt.description,
      monthlyPrice: opt.monthlyPrice || null,
      unitPrice: opt.unitPrice || null,
      unit: opt.unit || null,
      type: opt.type
    }));

    res.json({
      success: true,
      data: { options }
    });
  });

  /**
   * GET /api/contracts/discount-rates
   * Get discount rates by duration (public)
   */
  router.get('/discount-rates', (req, res) => {
    res.json({
      success: true,
      data: {
        rates: [
          { durationMonths: 12, label: '1 an', discountPercent: 0 },
          { durationMonths: 24, label: '2 ans', discountPercent: 0 },
          { durationMonths: 36, label: '3 ans', discountPercent: 3 },
          { durationMonths: 48, label: '4 ans', discountPercent: 5 },
          { durationMonths: 60, label: '5 ans', discountPercent: 7 }
        ]
      }
    });
  });

  /**
   * POST /api/contracts/calculate-price
   * Calculate subscription price (public)
   */
  router.post('/calculate-price', (req, res) => {
    try {
      const { planId, options = {}, optionQuantities = {}, durationMonths = 12 } = req.body;

      if (!planId || !SUBSCRIPTION_PLANS[planId]) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLAN', message: 'Plan not found' }
        });
      }

      const plan = SUBSCRIPTION_PLANS[planId];
      const discountPercent = getDiscountRate(durationMonths);

      let baseMonthly = plan.monthlyPrice;
      let optionsMonthly = 0;
      const selectedOptions = [];

      for (const [optionId, isSelected] of Object.entries(options)) {
        if (isSelected && ADDITIONAL_OPTIONS[optionId]) {
          const opt = ADDITIONAL_OPTIONS[optionId];
          const quantity = optionQuantities[optionId] || 1;

          if (opt.type === 'monthly') {
            const optTotal = opt.monthlyPrice * quantity;
            optionsMonthly += optTotal;
            selectedOptions.push({
              id: optionId,
              name: opt.name,
              monthlyPrice: opt.monthlyPrice,
              quantity,
              total: optTotal
            });
          } else if (opt.type === 'per_unit') {
            const optTotal = opt.unitPrice * quantity;
            optionsMonthly += optTotal;
            selectedOptions.push({
              id: optionId,
              name: opt.name,
              unitPrice: opt.unitPrice,
              unit: opt.unit,
              quantity,
              total: optTotal
            });
          }
        }
      }

      const totalBrutHT = baseMonthly + optionsMonthly;
      const discountAmount = totalBrutHT * (discountPercent / 100);
      const totalHT = totalBrutHT - discountAmount;
      const tva = totalHT * 0.20;
      const totalTTC = totalHT + tva;

      res.json({
        success: true,
        data: {
          plan: {
            id: planId,
            name: plan.name,
            monthlyPrice: baseMonthly
          },
          options: selectedOptions,
          durationMonths,
          discountPercent,
          pricing: {
            baseMonthlyHT: baseMonthly,
            optionsMonthlyHT: optionsMonthly,
            totalBrutHT,
            discountAmount,
            totalHT,
            tva,
            totalTTC,
            totalContractValue: totalTTC * durationMonths
          }
        }
      });
    } catch (error) {
      console.error('[Contracts] Error calculating price:', error);
      res.status(500).json({
        success: false,
        error: { code: 'CALCULATION_ERROR', message: error.message }
      });
    }
  });

  // ==================== AUTHENTICATED ENDPOINTS ====================

  /**
   * POST /api/contracts/generate
   * Generate a contract for current user's onboarding
   */
  router.post('/generate', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id || req.user.sub;
      const db = mongoClient.db();
      const authDb = mongoClient.db('rt-auth');

      // Find user's pending onboarding request
      const onboardingRequest = await authDb.collection('onboarding_requests').findOne({
        $or: [
          { userId: new ObjectId(userId) },
          { email: req.user.email }
        ],
        status: { $in: ['pending', 'payment_setup_complete', 'awaiting_contract'] }
      });

      if (!onboardingRequest) {
        return res.status(404).json({
          success: false,
          error: { code: 'NO_ONBOARDING', message: 'No pending subscription request found' }
        });
      }

      // Generate contract
      const result = await contractService.createContract(
        onboardingRequest,
        onboardingRequest.stripeCustomerId
      );

      // Update onboarding status
      await authDb.collection('onboarding_requests').updateOne(
        { _id: onboardingRequest._id },
        {
          $set: {
            status: 'awaiting_signature',
            contractNumber: result.contractNumber,
            updatedAt: new Date()
          }
        }
      );

      res.json({
        success: true,
        data: {
          contractNumber: result.contractNumber,
          status: result.contract.status,
          planName: result.contract.planName,
          monthlyTTC: result.contract.monthlyTTC
        }
      });
    } catch (error) {
      console.error('[Contracts] Error generating contract:', error);
      res.status(500).json({
        success: false,
        error: { code: 'GENERATION_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/contracts/my-contracts
   * List current user's contracts
   */
  router.get('/my-contracts', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const contracts = await contractService.listClientContracts(req.user.email);

      res.json({
        success: true,
        data: {
          contracts: contracts.map(c => ({
            contractNumber: c.contractNumber,
            status: c.status,
            planName: c.planName,
            durationMonths: c.durationMonths,
            monthlyTTC: c.monthlyTTC,
            createdAt: c.createdAt,
            signedAt: c.signedAt
          }))
        }
      });
    } catch (error) {
      console.error('[Contracts] Error listing contracts:', error);
      res.status(500).json({
        success: false,
        error: { code: 'LIST_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/contracts/:contractNumber
   * Get contract details
   */
  router.get('/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;
      const contract = await contractService.getContract(contractNumber);

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Check ownership (unless admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      res.json({
        success: true,
        data: {
          contract: {
            contractNumber: contract.contractNumber,
            status: contract.status,
            clientCompany: contract.clientCompany,
            planName: contract.planName,
            durationMonths: contract.durationMonths,
            selectedOptions: contract.selectedOptions,
            monthlyHT: contract.monthlyHT,
            monthlyTVA: contract.monthlyTVA,
            monthlyTTC: contract.monthlyTTC,
            discountPercent: contract.discountPercent,
            totalContractValue: contract.totalContractValue,
            signatureUrl: contract.signatureUrl,
            createdAt: contract.createdAt,
            signedAt: contract.signedAt
          }
        }
      });
    } catch (error) {
      console.error('[Contracts] Error getting contract:', error);
      res.status(500).json({
        success: false,
        error: { code: 'FETCH_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/contracts/:contractNumber/pdf
   * Download contract PDF
   */
  router.get('/:contractNumber/pdf', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;
      const contract = await contractService.getContract(contractNumber);

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Check ownership (unless admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      const pdfBuffer = await contractService.getPDF(contractNumber);

      if (!pdfBuffer) {
        return res.status(404).json({
          success: false,
          error: { code: 'PDF_NOT_FOUND', message: 'PDF not found' }
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Contrat-${contractNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Contracts] Error downloading PDF:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DOWNLOAD_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/contracts/:contractNumber/send-for-signature
   * Send contract for electronic signature
   */
  router.post('/:contractNumber/send-for-signature', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;
      const contract = await contractService.getContract(contractNumber);

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Check ownership (unless admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      if (contract.status !== 'pending_signature') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Contract already sent or signed' }
        });
      }

      const result = await contractService.sendForSignature(contractNumber);

      res.json({
        success: result.success,
        data: result.success ? {
          signatureUrl: result.signatureUrl,
          message: 'Signature request sent. Check your email for the signature link.'
        } : {
          message: result.message || 'Signature service not configured'
        }
      });
    } catch (error) {
      console.error('[Contracts] Error sending for signature:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SIGNATURE_ERROR', message: error.message }
      });
    }
  });

  // ==================== ADMIN ENDPOINTS ====================

  /**
   * GET /api/contracts/admin/list
   * List all contracts (admin only)
   */
  router.get('/admin/list', async (req, res) => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (!validateAdminKey(adminKey)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid admin key' }
        });
      }

      const db = mongoClient.db();
      const { status, limit = 50, offset = 0 } = req.query;

      const filter = {};
      if (status) filter.status = status;

      const contracts = await db.collection('contracts')
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(parseInt(offset))
        .limit(parseInt(limit))
        .toArray();

      const total = await db.collection('contracts').countDocuments(filter);

      res.json({
        success: true,
        data: {
          contracts,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        }
      });
    } catch (error) {
      console.error('[Contracts] Admin list error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'LIST_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/contracts/admin/generate
   * Generate contract for any onboarding request (admin)
   */
  router.post('/admin/generate', async (req, res) => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (!validateAdminKey(adminKey)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid admin key' }
        });
      }

      const { onboardingRequestId, clientData } = req.body;

      let onboardingRequest;

      if (onboardingRequestId) {
        const authDb = mongoClient.db('rt-auth');
        onboardingRequest = await authDb.collection('onboarding_requests').findOne({
          _id: new ObjectId(onboardingRequestId)
        });

        if (!onboardingRequest) {
          return res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Onboarding request not found' }
          });
        }
      } else if (clientData) {
        // Create contract from direct client data
        onboardingRequest = clientData;
      } else {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_DATA', message: 'Provide onboardingRequestId or clientData' }
        });
      }

      const result = await contractService.createContract(onboardingRequest);

      res.json({
        success: true,
        data: {
          contractNumber: result.contractNumber,
          contract: result.contract
        }
      });
    } catch (error) {
      console.error('[Contracts] Admin generate error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'GENERATION_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/contracts/admin/:contractNumber/resend-signature
   * Resend signature request (admin)
   */
  router.post('/admin/:contractNumber/resend-signature', async (req, res) => {
    try {
      const adminKey = req.headers['x-admin-key'];
      if (!validateAdminKey(adminKey)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Invalid admin key' }
        });
      }

      const { contractNumber } = req.params;
      const result = await contractService.sendForSignature(contractNumber);

      res.json({
        success: result.success,
        data: result
      });
    } catch (error) {
      console.error('[Contracts] Admin resend signature error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SIGNATURE_ERROR', message: error.message }
      });
    }
  });

  // ==================== WEBHOOK ENDPOINT ====================

  /**
   * POST /api/contracts/webhooks/yousign
   * Handle Yousign webhook events
   */
  router.post('/webhooks/yousign', express.json(), async (req, res) => {
    try {
      // Verify webhook signature if configured
      const signature = req.headers['x-yousign-signature'];
      const webhookSecret = process.env.YOUSIGN_WEBHOOK_SECRET;

      if (webhookSecret && signature) {
        const crypto = require('crypto');
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (signature !== expectedSignature) {
          console.warn('[Contracts] Invalid Yousign webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const event = req.body;
      console.log(`[Contracts] Yousign webhook: ${event.event_name}`);

      const result = await contractService.handleYousignWebhook(event);

      res.json({ received: true, ...result });
    } catch (error) {
      console.error('[Contracts] Webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
}

module.exports = createContractRoutes;
