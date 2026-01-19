/**
 * SYMPHONI.A - Electronic Signature Routes
 * RT Backend Services - Version 1.0.0
 *
 * Routes API pour la signature électronique interne
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ElectronicSignatureService } = require('./electronic-signature-service');
const { authenticateToken } = require('./auth-middleware');

function createSignatureRoutes(mongoClient, mongoConnected, sesClient = null) {
  const router = express.Router();
  const signatureService = new ElectronicSignatureService(mongoClient);

  // Rate limiting for public signature endpoints (prevent brute force)
  const signatureRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 requests per window
    message: {
      success: false,
      error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later' }
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  // Stricter rate limiting for signature submission
  const signRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 signature attempts per hour
    message: {
      success: false,
      error: { code: 'RATE_LIMIT', message: 'Too many signature attempts, please try again later' }
    },
    standardHeaders: true,
    legacyHeaders: false
  });

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

  // Helper pour récupérer l'IP client
  const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           'unknown';
  };

  // ==================== PUBLIC ENDPOINTS (avec token) ====================

  /**
   * GET /api/signature/verify/:token
   * Vérifier un token de signature et récupérer les infos du contrat
   * Utilisé par la page de signature frontend
   */
  router.get('/verify/:token', signatureRateLimiter, checkMongoDB, async (req, res) => {
    try {
      const { token } = req.params;

      const info = await signatureService.getSignatureInfo(token);

      if (!info.valid) {
        return res.status(info.alreadySigned ? 200 : 400).json({
          success: false,
          alreadySigned: info.alreadySigned || false,
          error: {
            code: info.alreadySigned ? 'ALREADY_SIGNED' : 'INVALID_TOKEN',
            message: info.error
          }
        });
      }

      res.json({
        success: true,
        data: {
          contract: info.contract,
          signer: info.signer,
          createdAt: info.createdAt,
          consentText: 'Lu et approuvé. Je reconnais avoir pris connaissance des conditions générales du contrat d\'abonnement SYMPHONI.A et les accepte sans réserve. Je confirme être habilité(e) à engager la société mentionnée ci-dessus.'
        }
      });
    } catch (error) {
      console.error('[Signature] Verify error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'VERIFY_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/signature/pdf/:token
   * Récupérer le PDF du contrat pour prévisualisation
   */
  router.get('/pdf/:token', signatureRateLimiter, checkMongoDB, async (req, res) => {
    try {
      const { token } = req.params;

      const pdfBuffer = await signatureService.getContractPDFForSignature(token);

      if (!pdfBuffer) {
        return res.status(404).json({
          success: false,
          error: { code: 'PDF_NOT_FOUND', message: 'PDF not found or token invalid' }
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="contrat-preview.pdf"');
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Signature] PDF error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PDF_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/signature/sign/:token
   * Signer le contrat
   */
  router.post('/sign/:token', signRateLimiter, checkMongoDB, async (req, res) => {
    try {
      const { token } = req.params;
      const {
        consentAccepted,
        consentText,
        signatureImage // Base64 du dessin de signature (optionnel)
      } = req.body;

      if (!consentAccepted) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CONSENT_REQUIRED',
            message: 'Vous devez accepter les conditions pour signer le contrat'
          }
        });
      }

      const result = await signatureService.signContract(token, {
        consentAccepted,
        consentText,
        signatureImage,
        signerIp: getClientIp(req),
        signerUserAgent: req.headers['user-agent'] || 'unknown'
      });

      // Si SES est configuré, envoyer le contrat signé par email
      if (sesClient) {
        try {
          // Importer le ContractService pour l'envoi d'email
          const { ContractService } = require('./contract-service');
          const contractService = new ContractService(mongoClient, sesClient);
          await contractService.sendSignedContractEmail(result.contractNumber);
        } catch (emailError) {
          console.error('[Signature] Error sending signed contract email:', emailError.message);
        }
      }

      res.json({
        success: true,
        data: {
          message: 'Contrat signé avec succès',
          contractNumber: result.contractNumber,
          signedAt: result.signedAt,
          proofId: result.proofId
        }
      });
    } catch (error) {
      console.error('[Signature] Sign error:', error);

      // Gérer les erreurs spécifiques
      if (error.message === 'Contract already signed') {
        return res.status(400).json({
          success: false,
          error: { code: 'ALREADY_SIGNED', message: 'Ce contrat a déjà été signé' }
        });
      }

      if (error.message.includes('expired')) {
        return res.status(400).json({
          success: false,
          error: { code: 'TOKEN_EXPIRED', message: 'Le lien de signature a expiré' }
        });
      }

      res.status(500).json({
        success: false,
        error: { code: 'SIGN_ERROR', message: error.message }
      });
    }
  });

  // ==================== AUTHENTICATED ENDPOINTS ====================

  /**
   * POST /api/signature/request
   * Créer une demande de signature pour un contrat
   */
  router.post('/request', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.body;

      if (!contractNumber) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_CONTRACT', message: 'Contract number required' }
        });
      }

      // Vérifier que l'utilisateur a accès au contrat
      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Vérifier ownership (sauf admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      const signatureRequest = await signatureService.createSignatureRequest(
        contractNumber,
        contract.clientEmail,
        contract.clientContact || contract.clientCompany
      );

      // Envoyer l'email avec le lien de signature si SES configuré
      if (sesClient) {
        try {
          await sendSignatureRequestEmail(
            sesClient,
            contract.clientEmail,
            contract.clientContact || contract.clientCompany,
            contractNumber,
            signatureRequest.signatureUrl,
            contract
          );
        } catch (emailError) {
          console.error('[Signature] Error sending signature request email:', emailError.message);
        }
      }

      res.json({
        success: true,
        data: {
          requestId: signatureRequest.requestId,
          signatureUrl: signatureRequest.signatureUrl,
          expiresAt: signatureRequest.expiresAt
        }
      });
    } catch (error) {
      console.error('[Signature] Request error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'REQUEST_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/signature/status/:contractNumber
   * Récupérer le statut de signature d'un contrat
   */
  router.get('/status/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;

      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Vérifier ownership (sauf admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      const signatureRequest = await db.collection('signature_requests').findOne({
        contractNumber
      });

      res.json({
        success: true,
        data: {
          contractNumber,
          status: contract.status,
          signatureStatus: signatureRequest?.status || 'not_requested',
          signatureUrl: signatureRequest?.signatureUrl,
          signedAt: contract.signedAt,
          requestedAt: contract.signatureRequestedAt,
          expiresAt: signatureRequest?.expiresAt
        }
      });
    } catch (error) {
      console.error('[Signature] Status error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'STATUS_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/signature/proof/:contractNumber
   * Récupérer la preuve de signature
   */
  router.get('/proof/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;

      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Vérifier ownership (sauf admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      if (contract.status !== 'signed') {
        return res.status(400).json({
          success: false,
          error: { code: 'NOT_SIGNED', message: 'Contract not signed yet' }
        });
      }

      const proof = await signatureService.getSignatureProof(contractNumber);

      if (!proof) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROOF_NOT_FOUND', message: 'Signature proof not found' }
        });
      }

      res.json({
        success: true,
        data: { proof }
      });
    } catch (error) {
      console.error('[Signature] Proof error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PROOF_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/signature/signed-pdf/:contractNumber
   * Télécharger le PDF signé
   */
  router.get('/signed-pdf/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;

      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Vérifier ownership (sauf admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      const pdfBuffer = await signatureService.getSignedPDF(contractNumber);

      if (!pdfBuffer) {
        return res.status(404).json({
          success: false,
          error: { code: 'PDF_NOT_FOUND', message: 'PDF not found' }
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Contrat-Signe-${contractNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[Signature] Signed PDF error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'PDF_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/signature/remind/:contractNumber
   * Envoyer un rappel de signature
   */
  router.post('/remind/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;

      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Vérifier ownership (sauf admin)
      if (req.user.role !== 'admin' && contract.clientEmail !== req.user.email) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Access denied' }
        });
      }

      const result = await signatureService.sendSignatureReminder(contractNumber, sesClient);

      res.json({
        success: result.success,
        data: { message: result.message || result.error }
      });
    } catch (error) {
      console.error('[Signature] Remind error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'REMIND_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/signature/cancel/:contractNumber
   * Annuler une demande de signature
   */
  router.post('/cancel/:contractNumber', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { contractNumber } = req.params;

      const db = mongoClient.db();
      const contract = await db.collection('contracts').findOne({ contractNumber });

      if (!contract) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Contract not found' }
        });
      }

      // Seul admin peut annuler
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only admin can cancel signature requests' }
        });
      }

      await signatureService.cancelSignatureRequest(contractNumber);

      res.json({
        success: true,
        data: { message: 'Signature request cancelled' }
      });
    } catch (error) {
      console.error('[Signature] Cancel error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'CANCEL_ERROR', message: error.message }
      });
    }
  });

  return router;
}

// ============================================
// EMAIL HELPER
// ============================================

async function sendSignatureRequestEmail(sesClient, email, name, contractNumber, signatureUrl, contract) {
  const { SendRawEmailCommand } = require('@aws-sdk/client-ses');
  const nodemailer = require('nodemailer');

  const transporter = nodemailer.createTransport({
    SES: { ses: sesClient, aws: { SendRawEmailCommand } }
  });

  const mailOptions = {
    from: '"SYMPHONI.A Contrats" <contrats@symphonia-controltower.com>',
    to: email,
    subject: `[SYMPHONI.A] Contrat à signer - ${contractNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">SYMPHONI.A</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">Control Tower</p>
        </div>

        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937; margin-top: 0;">Bonjour ${name},</h2>

          <p>Votre contrat d'abonnement SYMPHONI.A est prêt à être signé.</p>

          <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #374151;">Récapitulatif du contrat</h3>
            <p><strong>Numéro :</strong> ${contractNumber}</p>
            <p><strong>Plan :</strong> ${contract.planName}</p>
            <p><strong>Durée :</strong> ${contract.durationMonths} mois</p>
            <p><strong>Montant :</strong> ${contract.monthlyTTC?.toFixed(2) || 'N/A'}€ TTC/mois</p>
          </div>

          <p>Pour finaliser votre abonnement, veuillez signer électroniquement votre contrat en cliquant sur le bouton ci-dessous :</p>

          <p style="text-align: center; margin: 30px 0;">
            <a href="${signatureUrl}"
               style="display: inline-block; background: #2563eb; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Signer mon contrat
            </a>
          </p>

          <p style="color: #6b7280; font-size: 14px;">
            Ce lien est valable 7 jours. Vous pourrez prévisualiser le contrat avant de le signer.
          </p>

          <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>

          <p>Cordialement,<br>L'équipe SYMPHONI.A</p>
        </div>

        <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">RT Technologie SAS - 1088 avenue de Champollion, 38530 Pontcharra</p>
          <p style="margin: 5px 0 0 0;">SIRET: 948816988 - TVA: FR41948816988</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log(`[Signature] Request email sent to ${email}`);
}

module.exports = createSignatureRoutes;
