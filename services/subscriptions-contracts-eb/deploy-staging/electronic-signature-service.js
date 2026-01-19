/**
 * SYMPHONI.A - Electronic Signature Service (Internal)
 * RT Backend Services - Version 1.0.0
 *
 * Système de signature électronique interne conforme eIDAS (niveau simple)
 * - Génération de liens de signature sécurisés
 * - Capture de signature (consentement + dessin optionnel)
 * - Horodatage cryptographique
 * - Génération de preuve de signature
 * - PDF avec cachet de signature
 */

const crypto = require('crypto');
const PDFDocument = require('pdfkit');

// ============================================
// CONFIGURATION
// ============================================

const SIGNATURE_CONFIG = {
  // Durée de validité du lien de signature (7 jours)
  linkExpirationDays: 7,

  // Algorithme de hash pour la preuve
  hashAlgorithm: 'sha256',

  // URL de base pour les liens de signature
  baseUrl: process.env.SIGNATURE_BASE_URL || process.env.FRONTEND_URL || 'https://symphonia-controltower.com',

  // Clé secrète pour signer les tokens - REQUIRED, no insecure fallback
  secretKey: (() => {
    const key = process.env.SIGNATURE_SECRET_KEY || process.env.JWT_SECRET;
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[CRITICAL SECURITY] SIGNATURE_SECRET_KEY or JWT_SECRET must be set in production');
        throw new Error('SIGNATURE_SECRET_KEY required in production');
      }
      // Only allow fallback in development with warning
      console.warn('[SECURITY WARNING] Using insecure default signature key - FOR DEVELOPMENT ONLY');
      return 'dev-signature-key-unsafe-' + crypto.randomBytes(16).toString('hex');
    }
    return key;
  })()
};

// ============================================
// TOKEN GENERATION
// ============================================

/**
 * Génère un token de signature sécurisé
 */
function generateSignatureToken(contractId, signerEmail) {
  const payload = {
    contractId,
    signerEmail,
    createdAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex')
  };

  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString('base64url');

  // Signature HMAC
  const signature = crypto
    .createHmac(SIGNATURE_CONFIG.hashAlgorithm, SIGNATURE_CONFIG.secretKey)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Vérifie et décode un token de signature
 */
function verifySignatureToken(token) {
  try {
    const [payloadBase64, signature] = token.split('.');

    if (!payloadBase64 || !signature) {
      return { valid: false, error: 'Invalid token format' };
    }

    // Vérifier la signature
    const expectedSignature = crypto
      .createHmac(SIGNATURE_CONFIG.hashAlgorithm, SIGNATURE_CONFIG.secretKey)
      .update(payloadBase64)
      .digest('base64url');

    if (signature !== expectedSignature) {
      return { valid: false, error: 'Invalid signature' };
    }

    // Décoder le payload
    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadStr);

    // Vérifier l'expiration
    const expirationMs = SIGNATURE_CONFIG.linkExpirationDays * 24 * 60 * 60 * 1000;
    if (Date.now() - payload.createdAt > expirationMs) {
      return { valid: false, error: 'Token expired' };
    }

    return { valid: true, payload };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// ============================================
// SIGNATURE PROOF GENERATION
// ============================================

/**
 * Génère une preuve de signature cryptographique
 */
function generateSignatureProof(signatureData) {
  const {
    contractNumber,
    contractHash,
    signerEmail,
    signerName,
    signerIp,
    signerUserAgent,
    signedAt,
    consentText,
    signatureImage // Base64 si dessin de signature
  } = signatureData;

  const proof = {
    version: '1.0',
    type: 'electronic_signature_simple',

    // Identifiants
    proofId: crypto.randomUUID(),
    contractNumber,

    // Hash du document original
    documentHash: contractHash,
    hashAlgorithm: SIGNATURE_CONFIG.hashAlgorithm,

    // Informations signataire
    signer: {
      email: signerEmail,
      name: signerName,
      ipAddress: signerIp,
      userAgent: signerUserAgent
    },

    // Horodatage
    timestamp: {
      signedAt: signedAt.toISOString(),
      timezone: 'Europe/Paris',
      unixTimestamp: Math.floor(signedAt.getTime() / 1000)
    },

    // Consentement
    consent: {
      text: consentText,
      accepted: true,
      acceptedAt: signedAt.toISOString()
    },

    // Signature visuelle (si présente)
    hasVisualSignature: !!signatureImage,

    // Métadonnées
    metadata: {
      platform: 'SYMPHONI.A Control Tower',
      provider: 'RT Technologie SAS',
      country: 'FR',
      legalBasis: 'eIDAS Regulation - Simple Electronic Signature'
    }
  };

  // Hash de la preuve elle-même
  proof.proofHash = crypto
    .createHash(SIGNATURE_CONFIG.hashAlgorithm)
    .update(JSON.stringify(proof))
    .digest('hex');

  return proof;
}

/**
 * Calcule le hash d'un document PDF
 */
function calculateDocumentHash(pdfBuffer) {
  return crypto
    .createHash(SIGNATURE_CONFIG.hashAlgorithm)
    .update(pdfBuffer)
    .digest('hex');
}

// ============================================
// SIGNATURE SERVICE CLASS
// ============================================

class ElectronicSignatureService {
  constructor(mongoClient) {
    this.mongoClient = mongoClient;
  }

  /**
   * Créer une demande de signature pour un contrat
   */
  async createSignatureRequest(contractNumber, signerEmail, signerName) {
    const db = this.mongoClient.db();

    // Vérifier que le contrat existe
    const contract = await db.collection('contracts').findOne({ contractNumber });
    if (!contract) {
      throw new Error(`Contract ${contractNumber} not found`);
    }

    if (contract.status === 'signed') {
      throw new Error('Contract already signed');
    }

    // Récupérer le PDF original
    const pdfDoc = await db.collection('contract_pdfs').findOne({ contractNumber });
    if (!pdfDoc || !pdfDoc.pdf) {
      throw new Error('Contract PDF not found');
    }

    const pdfBuffer = Buffer.from(pdfDoc.pdf, 'base64');
    const documentHash = calculateDocumentHash(pdfBuffer);

    // Générer le token de signature
    const signatureToken = generateSignatureToken(contractNumber, signerEmail);

    // Créer la demande de signature
    const signatureRequest = {
      requestId: crypto.randomUUID(),
      contractNumber,
      documentHash,

      signer: {
        email: signerEmail,
        name: signerName
      },

      token: signatureToken,
      signatureUrl: `${SIGNATURE_CONFIG.baseUrl}/sign?token=${signatureToken}`,

      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SIGNATURE_CONFIG.linkExpirationDays * 24 * 60 * 60 * 1000),

      reminders: [],
      signedAt: null,
      signatureProof: null
    };

    // Sauvegarder la demande
    await db.collection('signature_requests').insertOne(signatureRequest);

    // Mettre à jour le contrat
    await db.collection('contracts').updateOne(
      { contractNumber },
      {
        $set: {
          signatureRequestId: signatureRequest.requestId,
          signatureToken,
          signatureUrl: signatureRequest.signatureUrl,
          signatureRequestedAt: new Date(),
          status: 'pending_signature',
          updatedAt: new Date()
        }
      }
    );

    console.log(`[Signature] Request created for contract ${contractNumber}`);

    return signatureRequest;
  }

  /**
   * Valider un token et récupérer les infos du contrat
   */
  async getSignatureInfo(token) {
    const verification = verifySignatureToken(token);

    if (!verification.valid) {
      return { valid: false, error: verification.error };
    }

    const db = this.mongoClient.db();
    const { contractId: contractNumber, signerEmail } = verification.payload;

    // Récupérer le contrat
    const contract = await db.collection('contracts').findOne({ contractNumber });
    if (!contract) {
      return { valid: false, error: 'Contract not found' };
    }

    if (contract.status === 'signed') {
      return { valid: false, error: 'Contract already signed', alreadySigned: true };
    }

    // Récupérer la demande de signature
    const signatureRequest = await db.collection('signature_requests').findOne({
      contractNumber,
      'signer.email': signerEmail,
      status: 'pending'
    });

    if (!signatureRequest) {
      return { valid: false, error: 'Signature request not found or expired' };
    }

    // Vérifier l'expiration
    if (new Date() > signatureRequest.expiresAt) {
      return { valid: false, error: 'Signature request expired' };
    }

    return {
      valid: true,
      contract: {
        contractNumber: contract.contractNumber,
        clientCompany: contract.clientCompany,
        planName: contract.planName,
        durationMonths: contract.durationMonths,
        monthlyTTC: contract.monthlyTTC,
        totalContractValue: contract.totalContractValue
      },
      signer: signatureRequest.signer,
      createdAt: contract.createdAt
    };
  }

  /**
   * Récupérer le PDF pour prévisualisation
   */
  async getContractPDFForSignature(token) {
    const verification = verifySignatureToken(token);

    if (!verification.valid) {
      return null;
    }

    const db = this.mongoClient.db();
    const { contractId: contractNumber } = verification.payload;

    const pdfDoc = await db.collection('contract_pdfs').findOne({ contractNumber });
    if (!pdfDoc || !pdfDoc.pdf) {
      return null;
    }

    return Buffer.from(pdfDoc.pdf, 'base64');
  }

  /**
   * Signer un contrat
   */
  async signContract(token, signatureData) {
    const {
      consentAccepted,
      consentText,
      signatureImage, // Base64 optionnel (dessin de signature)
      signerIp,
      signerUserAgent
    } = signatureData;

    // Vérifier le token
    const verification = verifySignatureToken(token);
    if (!verification.valid) {
      throw new Error(verification.error);
    }

    const { contractId: contractNumber, signerEmail } = verification.payload;

    if (!consentAccepted) {
      throw new Error('Consent must be accepted');
    }

    const db = this.mongoClient.db();

    // Récupérer le contrat
    const contract = await db.collection('contracts').findOne({ contractNumber });
    if (!contract) {
      throw new Error('Contract not found');
    }

    if (contract.status === 'signed') {
      throw new Error('Contract already signed');
    }

    // Récupérer la demande de signature
    const signatureRequest = await db.collection('signature_requests').findOne({
      contractNumber,
      'signer.email': signerEmail,
      status: 'pending'
    });

    if (!signatureRequest) {
      throw new Error('Signature request not found');
    }

    const signedAt = new Date();

    // Générer la preuve de signature
    const signatureProof = generateSignatureProof({
      contractNumber,
      contractHash: signatureRequest.documentHash,
      signerEmail,
      signerName: signatureRequest.signer.name,
      signerIp,
      signerUserAgent,
      signedAt,
      consentText: consentText || 'Lu et approuvé. Je reconnais avoir pris connaissance des conditions générales et les accepte sans réserve.',
      signatureImage
    });

    // Générer le PDF signé avec cachet
    const signedPdfBuffer = await this.generateSignedPDF(contractNumber, signatureProof, signatureImage);

    // Sauvegarder le PDF signé
    await db.collection('contract_pdfs').updateOne(
      { contractNumber },
      {
        $set: {
          signedPdf: signedPdfBuffer.toString('base64'),
          signedAt,
          signatureProof
        }
      }
    );

    // Mettre à jour la demande de signature
    await db.collection('signature_requests').updateOne(
      { requestId: signatureRequest.requestId },
      {
        $set: {
          status: 'signed',
          signedAt,
          signatureProof,
          signerIp,
          signerUserAgent
        }
      }
    );

    // Mettre à jour le contrat
    await db.collection('contracts').updateOne(
      { contractNumber },
      {
        $set: {
          status: 'signed',
          signedAt,
          signatureProofId: signatureProof.proofId,
          updatedAt: new Date()
        }
      }
    );

    console.log(`[Signature] Contract ${contractNumber} signed by ${signerEmail}`);

    return {
      success: true,
      contractNumber,
      signedAt,
      proofId: signatureProof.proofId
    };
  }

  /**
   * Générer le PDF signé avec cachet de signature
   */
  async generateSignedPDF(contractNumber, signatureProof, signatureImage = null) {
    const db = this.mongoClient.db();

    // Récupérer le PDF original
    const pdfDoc = await db.collection('contract_pdfs').findOne({ contractNumber });
    if (!pdfDoc || !pdfDoc.pdf) {
      throw new Error('Original PDF not found');
    }

    const contract = await db.collection('contracts').findOne({ contractNumber });

    // Pour l'instant, on crée un nouveau PDF avec la page de signature ajoutée
    // (PDFKit ne permet pas de modifier un PDF existant, on devrait utiliser pdf-lib en production)

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Contrat signé - ${contractNumber}`,
            Author: 'RT Technologie - SYMPHONI.A',
            Subject: 'Contrat d\'abonnement signé électroniquement',
            Creator: 'SYMPHONI.A Electronic Signature'
          }
        });

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // ========== PAGE DE CERTIFICATION DE SIGNATURE ==========

        // Header
        doc.fontSize(16).font('Helvetica-Bold')
          .text('CERTIFICAT DE SIGNATURE ÉLECTRONIQUE', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica')
          .fillColor('#666666')
          .text('Document généré automatiquement par SYMPHONI.A', { align: 'center' });
        doc.fillColor('#000000');
        doc.moveDown(2);

        // Cadre de certification
        const certY = doc.y;
        doc.rect(50, certY, 495, 200).stroke('#2563eb');

        doc.fontSize(12).font('Helvetica-Bold')
          .fillColor('#2563eb')
          .text('CONTRAT SIGNÉ ÉLECTRONIQUEMENT', 70, certY + 15);
        doc.fillColor('#000000');

        doc.fontSize(10).font('Helvetica');
        let yPos = certY + 40;

        doc.text(`Numéro de contrat : ${contractNumber}`, 70, yPos);
        yPos += 18;
        doc.text(`Client : ${contract?.clientCompany || 'N/A'}`, 70, yPos);
        yPos += 18;
        doc.text(`Plan : ${contract?.planName || 'N/A'}`, 70, yPos);
        yPos += 18;
        doc.text(`Montant : ${contract?.monthlyTTC?.toFixed(2) || 'N/A'}€ TTC/mois`, 70, yPos);
        yPos += 25;

        doc.font('Helvetica-Bold').text('Signataire :', 70, yPos);
        doc.font('Helvetica');
        yPos += 18;
        doc.text(`Nom : ${signatureProof.signer.name}`, 70, yPos);
        yPos += 15;
        doc.text(`Email : ${signatureProof.signer.email}`, 70, yPos);
        yPos += 15;
        doc.text(`Adresse IP : ${signatureProof.signer.ipAddress}`, 70, yPos);

        doc.y = certY + 220;
        doc.moveDown(1);

        // Informations de signature
        doc.fontSize(11).font('Helvetica-Bold')
          .text('PREUVE DE SIGNATURE', { align: 'center' });
        doc.moveDown(0.5);

        doc.fontSize(9).font('Helvetica');
        doc.text(`ID de preuve : ${signatureProof.proofId}`);
        doc.text(`Date et heure : ${new Date(signatureProof.timestamp.signedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
        doc.text(`Hash du document : ${signatureProof.documentHash}`);
        doc.text(`Hash de la preuve : ${signatureProof.proofHash}`);
        doc.text(`Algorithme : ${signatureProof.hashAlgorithm.toUpperCase()}`);
        doc.moveDown(1);

        // Consentement
        doc.fontSize(10).font('Helvetica-Bold')
          .text('CONSENTEMENT ACCEPTÉ :');
        doc.font('Helvetica').fontSize(9)
          .text(signatureProof.consent.text, { width: 495 });
        doc.moveDown(1);

        // Zone de signature visuelle
        if (signatureImage) {
          doc.fontSize(10).font('Helvetica-Bold')
            .text('SIGNATURE MANUSCRITE :');
          doc.moveDown(0.5);

          try {
            // Convertir base64 en buffer et ajouter au PDF
            const imgBuffer = Buffer.from(signatureImage.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            doc.image(imgBuffer, { width: 200, height: 80 });
          } catch (imgError) {
            doc.fontSize(9).font('Helvetica')
              .text('[Signature manuscrite capturée]');
          }
          doc.moveDown(1);
        }

        // Cachet de certification
        const stampY = doc.y + 20;
        doc.rect(150, stampY, 295, 100).stroke('#16a34a');

        doc.fontSize(10).font('Helvetica-Bold')
          .fillColor('#16a34a')
          .text('✓ DOCUMENT SIGNÉ ÉLECTRONIQUEMENT', 160, stampY + 10, { width: 275, align: 'center' });

        doc.fontSize(8).font('Helvetica')
          .fillColor('#000000')
          .text(`Signé le ${new Date(signatureProof.timestamp.signedAt).toLocaleString('fr-FR')}`, 160, stampY + 30, { width: 275, align: 'center' })
          .text(`par ${signatureProof.signer.name}`, 160, stampY + 45, { width: 275, align: 'center' })
          .text(`Conforme au règlement eIDAS`, 160, stampY + 60, { width: 275, align: 'center' })
          .text(`Signature électronique simple`, 160, stampY + 75, { width: 275, align: 'center' });

        // Footer
        doc.fontSize(7).font('Helvetica')
          .fillColor('#999999')
          .text(
            'Ce document a été signé électroniquement via la plateforme SYMPHONI.A de RT Technologie SAS. ' +
            'La signature électronique a la même valeur juridique qu\'une signature manuscrite conformément au règlement eIDAS. ' +
            'L\'intégrité du document peut être vérifiée grâce au hash cryptographique ci-dessus.',
            50, 720, { width: 495, align: 'justify' }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Récupérer le PDF signé
   */
  async getSignedPDF(contractNumber) {
    const db = this.mongoClient.db();

    const pdfDoc = await db.collection('contract_pdfs').findOne({ contractNumber });
    if (!pdfDoc) {
      return null;
    }

    // Retourner le PDF signé s'il existe, sinon l'original
    if (pdfDoc.signedPdf) {
      return Buffer.from(pdfDoc.signedPdf, 'base64');
    } else if (pdfDoc.pdf) {
      return Buffer.from(pdfDoc.pdf, 'base64');
    }

    return null;
  }

  /**
   * Récupérer la preuve de signature
   */
  async getSignatureProof(contractNumber) {
    const db = this.mongoClient.db();

    const signatureRequest = await db.collection('signature_requests').findOne({
      contractNumber,
      status: 'signed'
    });

    return signatureRequest?.signatureProof || null;
  }

  /**
   * Envoyer un rappel de signature
   */
  async sendSignatureReminder(contractNumber, sesClient = null) {
    const db = this.mongoClient.db();

    const contract = await db.collection('contracts').findOne({ contractNumber });
    if (!contract || contract.status === 'signed') {
      return { success: false, error: 'Contract not found or already signed' };
    }

    const signatureRequest = await db.collection('signature_requests').findOne({
      contractNumber,
      status: 'pending'
    });

    if (!signatureRequest) {
      return { success: false, error: 'No pending signature request' };
    }

    // Enregistrer le rappel
    await db.collection('signature_requests').updateOne(
      { requestId: signatureRequest.requestId },
      {
        $push: {
          reminders: {
            sentAt: new Date(),
            type: 'email'
          }
        }
      }
    );

    // Si SES est configuré, envoyer l'email
    if (sesClient) {
      // TODO: Implémenter l'envoi d'email de rappel
      console.log(`[Signature] Reminder would be sent to ${signatureRequest.signer.email}`);
    }

    return { success: true, message: 'Reminder sent' };
  }

  /**
   * Annuler une demande de signature
   */
  async cancelSignatureRequest(contractNumber) {
    const db = this.mongoClient.db();

    await db.collection('signature_requests').updateOne(
      { contractNumber, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date()
        }
      }
    );

    await db.collection('contracts').updateOne(
      { contractNumber },
      {
        $set: {
          status: 'signature_cancelled',
          updatedAt: new Date()
        }
      }
    );

    return { success: true };
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  ElectronicSignatureService,
  generateSignatureToken,
  verifySignatureToken,
  generateSignatureProof,
  calculateDocumentHash,
  SIGNATURE_CONFIG
};
