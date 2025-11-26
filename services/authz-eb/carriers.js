// RT Carrier Management System
// Système de référencement des transporteurs selon spécifications SYMPHONI.A

const { ObjectId } = require('mongodb');
const {
  sendCarrierInvitationEmail,
  sendOnboardingSuccessEmail,
  sendVigilanceAlertEmail,
  sendCarrierBlockedEmail,
  sendCarrierUnblockedEmail
} = require('./email');

// Statuts des transporteurs (3 niveaux)
const CARRIER_STATUS = {
  GUEST: 'guest',              // Niveau 2 - Transporteur invité
  REFERENCED: 'referenced',     // Niveau 1 - Transporteur référencé
  PREMIUM: 'premium'            // Niveau 1+ - Transporteur prioritaire
};

// Modes de référencement
const REFERENCE_MODE = {
  DIRECT: 'direct',            // Invitation directe par un industriel
  AUTOMATIC: 'automatic',      // Référencement automatique via Affret.IA
  PREMIUM: 'premium'           // Réseau premium
};

// Types de documents requis
const DOCUMENT_TYPES = {
  KBIS: 'kbis',
  URSSAF: 'urssaf',
  INSURANCE: 'insurance',
  LICENSE: 'license',
  RIB: 'rib',
  ID_CARD: 'id_card'
};

// Statuts des documents
const DOCUMENT_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

// Statuts de vigilance
const VIGILANCE_STATUS = {
  COMPLIANT: 'compliant',      // Tous les documents valides
  WARNING: 'warning',          // Documents expirant bientôt
  BLOCKED: 'blocked'           // Documents expirés
};

// Types d'événements du cycle de vie
const CARRIER_EVENTS = {
  INVITED: 'carrier.invited',
  ONBOARDED: 'carrier.onboarded',
  VIGILANCE_VERIFIED: 'carrier.vigilance.verified',
  GRID_UPLOADED: 'carrier.grid.uploaded',
  SET_IN_DISPATCH_CHAIN: 'carrier.set.in.dispatchchain',
  BLOCKED: 'carrier.blocked',
  UNBLOCKED: 'carrier.unblocked',
  SCORED: 'carrier.scored',
  UPGRADED_PREMIUM: 'carrier.upgraded.premium'
};

/**
 * Enregistrer un événement dans l'historique
 */
async function logCarrierEvent(db, carrierId, eventType, eventData, triggeredBy = 'SYSTEM') {
  const eventsCollection = db.collection('carrier_events');

  const event = {
    carrierId: new ObjectId(carrierId),
    eventType,
    eventData,
    triggeredBy,
    timestamp: new Date()
  };

  await eventsCollection.insertOne(event);
  return event;
}

/**
 * Calculer le score dynamique d'un transporteur
 */
async function calculateCarrierScore(db, carrierId) {
  const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
  if (!carrier) return 0;

  let score = 0;

  // 1. Documents en règle (+20 points par document)
  const documents = await db.collection('carrier_documents')
    .find({
      carrierId: new ObjectId(carrierId),
      status: DOCUMENT_STATUS.VERIFIED
    })
    .toArray();

  score += documents.length * 20;

  // 2. Présence dans la chaîne d'affectation (+50 points)
  if (carrier.isInDispatchChain) {
    score += 50;
  }

  // 3. Grille tarifaire uploadée (+30 points)
  const grids = await db.collection('pricing_grids')
    .countDocuments({
      carrierId: new ObjectId(carrierId),
      status: 'active'
    });

  if (grids > 0) {
    score += 30;
  }

  // 4. Ancienneté (1 point par jour depuis onboarding)
  if (carrier.onboardedAt) {
    const daysSinceOnboarding = Math.floor((Date.now() - carrier.onboardedAt.getTime()) / (1000 * 60 * 60 * 24));
    score += daysSinceOnboarding;
  }

  // 5. Pénalité si bloqué (-100 points)
  if (carrier.isBlocked) {
    score = Math.max(0, score - 100);
  }

  return score;
}

/**
 * Vérifier le statut de vigilance d'un transporteur
 */
async function checkVigilanceStatus(db, carrierId) {
  const documents = await db.collection('carrier_documents')
    .find({ carrierId: new ObjectId(carrierId) })
    .toArray();

  if (documents.length === 0) {
    return VIGILANCE_STATUS.BLOCKED;
  }

  const now = new Date();
  let hasExpired = false;
  let hasWarning = false;

  for (const doc of documents) {
    if (doc.status === DOCUMENT_STATUS.EXPIRED) {
      hasExpired = true;
    } else if (doc.expiryDate) {
      const daysUntilExpiry = Math.floor((doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 0) {
        hasExpired = true;
      } else if (daysUntilExpiry <= 30) {
        hasWarning = true;
      }
    }
  }

  if (hasExpired) return VIGILANCE_STATUS.BLOCKED;
  if (hasWarning) return VIGILANCE_STATUS.WARNING;
  return VIGILANCE_STATUS.COMPLIANT;
}

/**
 * Bloquer automatiquement un transporteur
 */
async function blockCarrier(db, carrierId, reason) {
  const result = await db.collection('carriers').updateOne(
    { _id: new ObjectId(carrierId) },
    {
      $set: {
        isBlocked: true,
        blockedReason: reason,
        blockedAt: new Date(),
        updatedAt: new Date()
      }
    }
  );

  await logCarrierEvent(db, carrierId, CARRIER_EVENTS.BLOCKED, { reason });

  // Récupérer les infos du transporteur
  const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });

  if (carrier) {
    // Envoyer l'email de blocage
    await sendCarrierBlockedEmail(carrier.email, carrier.companyName, reason);
  }

  return result;
}

/**
 * Débloquer un transporteur
 */
async function unblockCarrier(db, carrierId) {
  const result = await db.collection('carriers').updateOne(
    { _id: new ObjectId(carrierId) },
    {
      $set: {
        isBlocked: false,
        blockedReason: null,
        blockedAt: null,
        updatedAt: new Date()
      }
    }
  );

  await logCarrierEvent(db, carrierId, CARRIER_EVENTS.UNBLOCKED, {});

  // Récupérer les infos du transporteur
  const carrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });

  if (carrier) {
    // Envoyer l'email de déblocage
    await sendCarrierUnblockedEmail(carrier.email, carrier.companyName);
  }

  return result;
}

/**
 * Vérifier et bloquer automatiquement les transporteurs avec documents expirés
 */
async function checkAndBlockExpiredCarriers(db) {
  const now = new Date();

  // Trouver tous les documents expirés
  const expiredDocs = await db.collection('carrier_documents')
    .find({
      expiryDate: { $lte: now },
      status: { $ne: DOCUMENT_STATUS.EXPIRED }
    })
    .toArray();

  const results = [];

  for (const doc of expiredDocs) {
    // Marquer le document comme expiré
    await db.collection('carrier_documents').updateOne(
      { _id: doc._id },
      { $set: { status: DOCUMENT_STATUS.EXPIRED } }
    );

    // Bloquer le transporteur
    await blockCarrier(db, doc.carrierId, `Document ${doc.documentType} expiré`);

    results.push({
      carrierId: doc.carrierId,
      documentType: doc.documentType
    });
  }

  return results;
}

/**
 * Envoyer les alertes de vigilance (J-30, J-15, J-7)
 */
async function sendVigilanceAlerts(db) {
  const now = new Date();
  const alerts = [];

  // Documents expirant dans 30, 15 ou 7 jours
  const documents = await db.collection('carrier_documents')
    .find({
      expiryDate: { $exists: true },
      status: DOCUMENT_STATUS.VERIFIED
    })
    .toArray();

  for (const doc of documents) {
    const daysUntilExpiry = Math.floor((doc.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry === 30 || daysUntilExpiry === 15 || daysUntilExpiry === 7) {
      alerts.push({
        carrierId: doc.carrierId,
        documentType: doc.documentType,
        daysUntilExpiry,
        alertType: daysUntilExpiry === 30 ? 'email' : (daysUntilExpiry === 15 ? 'email+push' : 'push+sms')
      });

      // Récupérer les infos du transporteur
      const carrier = await db.collection('carriers').findOne({ _id: doc.carrierId });

      if (carrier) {
        // Envoyer l'email d'alerte
        await sendVigilanceAlertEmail(
          carrier.email,
          carrier.companyName,
          doc.documentType,
          daysUntilExpiry,
          doc.expiryDate
        );
      }

      // Log l'alerte
      await logCarrierEvent(db, doc.carrierId, 'carrier.vigilance.alert', {
        documentType: doc.documentType,
        daysUntilExpiry
      });
    }
  }

  return alerts;
}

/**
 * Routes Express pour la gestion des transporteurs
 */
function setupCarrierRoutes(app, db) {

  // ===== INVITATION DE TRANSPORTEURS =====

  /**
   * POST /api/carriers/invite
   * Inviter un nouveau transporteur (Mode Direct)
   */
  app.post('/api/carriers/invite', async (req, res) => {
    try {
      const {
        email,
        companyName,
        siret,
        vatNumber,
        phone,
        address,
        invitedBy,
        referenceMode = REFERENCE_MODE.DIRECT
      } = req.body;

      // Validation
      if (!email || !companyName || !invitedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'email, companyName et invitedBy sont requis'
          }
        });
      }

      // Vérifier si le transporteur existe déjà
      const existing = await db.collection('carriers').findOne({
        $or: [{ email }, { siret }, { vatNumber }]
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'CARRIER_EXISTS',
            message: 'Ce transporteur est déjà enregistré'
          }
        });
      }

      // Créer le transporteur avec statut "guest" (Niveau 2)
      const carrier = {
        email: email.toLowerCase().trim(),
        companyName: companyName.trim(),
        siret: siret ? siret.trim() : null,
        vatNumber: vatNumber ? vatNumber.trim() : null,
        phone: phone ? phone.trim() : null,
        address: address || null,
        status: CARRIER_STATUS.GUEST,
        referenceMode,
        invitedBy,
        invitedAt: new Date(),
        onboardedAt: null,
        vigilanceStatus: VIGILANCE_STATUS.BLOCKED,
        score: 0,
        isInDispatchChain: false,
        isBlocked: true, // Bloqué tant que pas de documents
        blockedReason: 'Aucun document fourni',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('carriers').insertOne(carrier);

      // Log l'événement
      await logCarrierEvent(db, result.insertedId, CARRIER_EVENTS.INVITED, {
        invitedBy,
        referenceMode
      });

      // Envoyer l'email d'invitation
      await sendCarrierInvitationEmail(email, companyName, invitedBy);

      res.status(201).json({
        success: true,
        message: 'Transporteur invité avec succès',
        carrierId: result.insertedId.toString(),
        status: CARRIER_STATUS.GUEST
      });

    } catch (error) {
      console.error('Erreur invitation transporteur:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== ONBOARDING DE TRANSPORTEURS =====

  /**
   * POST /api/carriers/onboard
   * Finaliser l'onboarding d'un transporteur (passage Niveau 2 → Niveau 1)
   */
  app.post('/api/carriers/onboard', async (req, res) => {
    try {
      const { carrierId } = req.body;

      if (!carrierId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'carrierId est requis'
          }
        });
      }

      // Vérifier que le transporteur existe
      const carrier = await db.collection('carriers').findOne({
        _id: new ObjectId(carrierId)
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: 'Transporteur non trouvé'
          }
        });
      }

      // Vérifier que tous les documents obligatoires sont fournis et vérifiés
      const requiredDocs = [
        DOCUMENT_TYPES.KBIS,
        DOCUMENT_TYPES.URSSAF,
        DOCUMENT_TYPES.INSURANCE,
        DOCUMENT_TYPES.LICENSE
      ];

      const verifiedDocs = await db.collection('carrier_documents')
        .find({
          carrierId: new ObjectId(carrierId),
          status: DOCUMENT_STATUS.VERIFIED
        })
        .toArray();

      const verifiedTypes = verifiedDocs.map(d => d.documentType);
      const missingDocs = requiredDocs.filter(type => !verifiedTypes.includes(type));

      if (missingDocs.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DOCUMENTS',
            message: `Documents manquants: ${missingDocs.join(', ')}`
          }
        });
      }

      // Passer le transporteur au statut "referenced" (Niveau 1)
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        {
          $set: {
            status: CARRIER_STATUS.REFERENCED,
            onboardedAt: new Date(),
            isBlocked: false,
            blockedReason: null,
            vigilanceStatus: VIGILANCE_STATUS.COMPLIANT,
            updatedAt: new Date()
          }
        }
      );

      // Calculer le score initial
      const score = await calculateCarrierScore(db, carrierId);
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { score } }
      );

      // Log l'événement
      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.ONBOARDED, {
        status: CARRIER_STATUS.REFERENCED,
        score
      });

      // Envoyer l'email de félicitations
      const updatedCarrier = await db.collection('carriers').findOne({ _id: new ObjectId(carrierId) });
      await sendOnboardingSuccessEmail(updatedCarrier.email, updatedCarrier.companyName, score);

      res.json({
        success: true,
        message: 'Transporteur onboardé avec succès',
        status: CARRIER_STATUS.REFERENCED,
        score
      });

    } catch (error) {
      console.error('Erreur onboarding transporteur:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== GESTION DES DOCUMENTS =====

  /**
   * POST /api/carriers/:carrierId/documents
   * Uploader un document de vigilance
   */
  app.post('/api/carriers/:carrierId/documents', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { documentType, fileName, fileUrl, expiryDate } = req.body;

      if (!documentType || !fileName || !fileUrl) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'documentType, fileName et fileUrl sont requis'
          }
        });
      }

      // Vérifier que le transporteur existe
      const carrier = await db.collection('carriers').findOne({
        _id: new ObjectId(carrierId)
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: 'Transporteur non trouvé'
          }
        });
      }

      // Créer le document
      const document = {
        carrierId: new ObjectId(carrierId),
        documentType,
        fileName,
        fileUrl,
        uploadedAt: new Date(),
        verifiedAt: null,
        verifiedBy: null,
        status: DOCUMENT_STATUS.PENDING,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        ocrData: null
      };

      const result = await db.collection('carrier_documents').insertOne(document);

      res.status(201).json({
        success: true,
        message: 'Document uploadé avec succès',
        documentId: result.insertedId.toString(),
        status: DOCUMENT_STATUS.PENDING
      });

    } catch (error) {
      console.error('Erreur upload document:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * PUT /api/carriers/:carrierId/documents/:documentId/verify
   * Vérifier un document
   */
  app.put('/api/carriers/:carrierId/documents/:documentId/verify', async (req, res) => {
    try {
      const { carrierId, documentId } = req.params;
      const { status, verifiedBy, ocrData } = req.body;

      if (!status || ![DOCUMENT_STATUS.VERIFIED, DOCUMENT_STATUS.REJECTED].includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'status doit être "verified" ou "rejected"'
          }
        });
      }

      // Mettre à jour le document
      await db.collection('carrier_documents').updateOne(
        { _id: new ObjectId(documentId) },
        {
          $set: {
            status,
            verifiedAt: new Date(),
            verifiedBy: verifiedBy || 'SYSTEM',
            ocrData: ocrData || null
          }
        }
      );

      // Mettre à jour le statut de vigilance du transporteur
      const vigilanceStatus = await checkVigilanceStatus(db, carrierId);
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { vigilanceStatus, updatedAt: new Date() } }
      );

      // Log l'événement
      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.VIGILANCE_VERIFIED, {
        documentId,
        status,
        vigilanceStatus
      });

      res.json({
        success: true,
        message: 'Document vérifié',
        vigilanceStatus
      });

    } catch (error) {
      console.error('Erreur vérification document:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== GRILLES TARIFAIRES =====

  /**
   * POST /api/carriers/:carrierId/pricing-grids
   * Uploader une grille tarifaire
   */
  app.post('/api/carriers/:carrierId/pricing-grids', async (req, res) => {
    try {
      const { carrierId } = req.params;
      const { fileName, fileUrl, routes } = req.body;

      if (!fileName || !fileUrl) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'fileName et fileUrl sont requis'
          }
        });
      }

      const grid = {
        carrierId: new ObjectId(carrierId),
        fileName,
        fileUrl,
        uploadedAt: new Date(),
        verifiedAt: null,
        status: 'pending',
        routes: routes || []
      };

      const result = await db.collection('pricing_grids').insertOne(grid);

      // Log l'événement
      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.GRID_UPLOADED, {
        gridId: result.insertedId.toString()
      });

      // Recalculer le score
      const score = await calculateCarrierScore(db, carrierId);
      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { score } }
      );

      res.status(201).json({
        success: true,
        message: 'Grille tarifaire uploadée',
        gridId: result.insertedId.toString()
      });

    } catch (error) {
      console.error('Erreur upload grille tarifaire:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== CHAÎNE D'AFFECTATION =====

  /**
   * POST /api/dispatch-chains
   * Créer/Mettre à jour une chaîne d'affectation
   */
  app.post('/api/dispatch-chains', async (req, res) => {
    try {
      const { industrialId, carrierIds } = req.body;

      if (!industrialId || !Array.isArray(carrierIds)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'industrialId et carrierIds (array) sont requis'
          }
        });
      }

      // Vérifier si une chaîne existe déjà
      const existing = await db.collection('dispatch_chains').findOne({ industrialId });

      if (existing) {
        // Mettre à jour
        await db.collection('dispatch_chains').updateOne(
          { industrialId },
          {
            $set: {
              carriers: carrierIds.map(id => new ObjectId(id)),
              updatedAt: new Date()
            }
          }
        );
      } else {
        // Créer
        await db.collection('dispatch_chains').insertOne({
          industrialId,
          carriers: carrierIds.map(id => new ObjectId(id)),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Mettre à jour les transporteurs
      await db.collection('carriers').updateMany(
        { _id: { $in: carrierIds.map(id => new ObjectId(id)) } },
        { $set: { isInDispatchChain: true } }
      );

      // Log les événements
      for (const carrierId of carrierIds) {
        await logCarrierEvent(db, carrierId, CARRIER_EVENTS.SET_IN_DISPATCH_CHAIN, {
          industrialId
        });
      }

      res.json({
        success: true,
        message: 'Chaîne d\'affectation mise à jour'
      });

    } catch (error) {
      console.error('Erreur chaîne d\'affectation:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== CONSULTATION =====

  /**
   * GET /api/carriers/:carrierId
   * Obtenir les détails d'un transporteur
   */
  app.get('/api/carriers/:carrierId', async (req, res) => {
    try {
      const { carrierId } = req.params;

      const carrier = await db.collection('carriers').findOne({
        _id: new ObjectId(carrierId)
      });

      if (!carrier) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: 'Transporteur non trouvé'
          }
        });
      }

      // Récupérer les documents
      const documents = await db.collection('carrier_documents')
        .find({ carrierId: new ObjectId(carrierId) })
        .toArray();

      // Récupérer les grilles tarifaires
      const grids = await db.collection('pricing_grids')
        .find({ carrierId: new ObjectId(carrierId) })
        .toArray();

      res.json({
        success: true,
        carrier: {
          ...carrier,
          documents,
          pricingGrids: grids
        }
      });

    } catch (error) {
      console.error('Erreur récupération transporteur:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/carriers
   * Lister tous les transporteurs
   */
  app.get('/api/carriers', async (req, res) => {
    try {
      const { status, vigilanceStatus } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (vigilanceStatus) filter.vigilanceStatus = vigilanceStatus;

      const carriers = await db.collection('carriers')
        .find(filter)
        .sort({ score: -1 })
        .toArray();

      res.json({
        success: true,
        carriers,
        count: carriers.length
      });

    } catch (error) {
      console.error('Erreur liste transporteurs:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  // ===== SCORING =====

  /**
   * POST /api/carriers/:carrierId/calculate-score
   * Recalculer le score d'un transporteur
   */
  app.post('/api/carriers/:carrierId/calculate-score', async (req, res) => {
    try {
      const { carrierId } = req.params;

      const score = await calculateCarrierScore(db, carrierId);

      await db.collection('carriers').updateOne(
        { _id: new ObjectId(carrierId) },
        { $set: { score, updatedAt: new Date() } }
      );

      await logCarrierEvent(db, carrierId, CARRIER_EVENTS.SCORED, { score });

      res.json({
        success: true,
        score
      });

    } catch (error) {
      console.error('Erreur calcul score:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });
}

module.exports = {
  setupCarrierRoutes,
  CARRIER_STATUS,
  REFERENCE_MODE,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS,
  VIGILANCE_STATUS,
  CARRIER_EVENTS,
  calculateCarrierScore,
  checkVigilanceStatus,
  blockCarrier,
  unblockCarrier,
  checkAndBlockExpiredCarriers,
  sendVigilanceAlerts,
  logCarrierEvent
};
