/**
 * GDPR Routes - API Endpoints RGPD
 * SYMPHONI.A - RT Technologie
 *
 * Endpoints pour la conformité RGPD:
 * - Suppression de données (Article 17)
 * - Export de données (Article 20)
 * - Gestion du consentement (Article 7)
 *
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();

// ============================================
// INITIALISATION DES SERVICES
// ============================================

let gdprService = null;
let consentService = null;

/**
 * Initialiser les routes GDPR avec les services
 * @param {Object} services - Services injectés
 */
function initializeGdprRoutes(services) {
  gdprService = services.gdprService;
  consentService = services.consentService;
  return router;
}

// ============================================
// MIDDLEWARE DE VALIDATION
// ============================================

/**
 * Vérifier que l'utilisateur a le droit d'accéder aux données
 */
function validateUserAccess(req, res, next) {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.id || req.user?._id?.toString();
  const isAdmin = req.user?.role === 'admin' || req.user?.role === 'superadmin';

  // L'utilisateur peut accéder à ses propres données ou être admin
  if (requestedUserId === authenticatedUserId || isAdmin) {
    next();
  } else {
    res.status(403).json({
      success: false,
      error: {
        code: 'ACCESS_DENIED',
        message: 'Vous ne pouvez accéder qu\'à vos propres données'
      }
    });
  }
}

/**
 * Validation du format userId
 */
function validateUserId(req, res, next) {
  const { userId } = req.params;
  if (!userId || !/^[a-f\d]{24}$/i.test(userId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_USER_ID',
        message: 'ID utilisateur invalide'
      }
    });
  }
  next();
}

// ============================================
// ROUTES - SUPPRESSION DE DONNÉES (Article 17)
// ============================================

/**
 * @route POST /api/gdpr/users/:userId/delete-request
 * @desc Créer une demande de suppression de données
 * @access Private (user own data or admin)
 */
router.post('/users/:userId/delete-request',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { reason, immediateConfirmation } = req.body;
      const requestedBy = req.user?.id || req.user?._id?.toString();

      const result = await gdprService.createDeletionRequest(userId, {
        reason: reason || 'user_request',
        requestedBy,
        userEmail: req.user?.email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        immediateConfirmation
      });

      res.status(201).json({
        success: true,
        message: 'Demande de suppression créée. Vous recevrez un email de confirmation.',
        data: {
          requestId: result.requestId,
          status: result.status,
          scheduledAt: result.scheduledAt,
          gracePeriodDays: 7,
          canCancel: true,
          cancelBefore: result.scheduledAt
        }
      });

    } catch (error) {
      console.error('[GDPR] Erreur création demande suppression:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DELETION_REQUEST_ERROR',
          message: 'Erreur lors de la création de la demande de suppression'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/delete-request/status
 * @desc Obtenir le statut d'une demande de suppression
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/delete-request/status',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const status = await gdprService.getDeletionRequestStatus(userId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NO_PENDING_REQUEST',
            message: 'Aucune demande de suppression en cours'
          }
        });
      }

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('[GDPR] Erreur récupération statut:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: 'Erreur lors de la récupération du statut'
        }
      });
    }
  }
);

/**
 * @route DELETE /api/gdpr/users/:userId/delete-request
 * @desc Annuler une demande de suppression (pendant la période de grâce)
 * @access Private (user own data or admin)
 */
router.delete('/users/:userId/delete-request',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const cancelledBy = req.user?.id || req.user?._id?.toString();

      const result = await gdprService.cancelDeletionRequest(userId, cancelledBy);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: result.code || 'CANCEL_ERROR',
            message: result.message
          }
        });
      }

      res.json({
        success: true,
        message: 'Demande de suppression annulée avec succès'
      });

    } catch (error) {
      console.error('[GDPR] Erreur annulation suppression:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CANCEL_ERROR',
          message: 'Erreur lors de l\'annulation'
        }
      });
    }
  }
);

/**
 * @route POST /api/gdpr/users/:userId/delete-request/confirm
 * @desc Confirmer la suppression immédiate (skip grace period)
 * @access Private (user own data)
 */
router.post('/users/:userId/delete-request/confirm',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { confirmationCode } = req.body;

      // Vérifier le code de confirmation envoyé par email
      const result = await gdprService.confirmImmediateDeletion(userId, confirmationCode);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: result.code || 'CONFIRMATION_ERROR',
            message: result.message
          }
        });
      }

      res.json({
        success: true,
        message: 'Suppression confirmée et exécutée',
        data: {
          deletedAt: result.deletedAt,
          anonymizedRecords: result.anonymizedRecords
        }
      });

    } catch (error) {
      console.error('[GDPR] Erreur confirmation suppression:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONFIRMATION_ERROR',
          message: 'Erreur lors de la confirmation'
        }
      });
    }
  }
);

// ============================================
// ROUTES - EXPORT DE DONNÉES (Article 20)
// ============================================

/**
 * @route POST /api/gdpr/users/:userId/export
 * @desc Demander un export de toutes les données personnelles
 * @access Private (user own data or admin)
 */
router.post('/users/:userId/export',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { format, collections } = req.body;

      const result = await gdprService.createExportRequest(userId, {
        format: format || 'json',
        collections: collections || 'all',
        requestedBy: req.user?.id || req.user?._id?.toString(),
        ipAddress: req.ip
      });

      res.status(202).json({
        success: true,
        message: 'Demande d\'export créée. Vous recevrez un email quand l\'export sera prêt.',
        data: {
          requestId: result.requestId,
          status: 'processing',
          estimatedTime: '5-10 minutes',
          format: result.format
        }
      });

    } catch (error) {
      console.error('[GDPR] Erreur création export:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_REQUEST_ERROR',
          message: 'Erreur lors de la création de la demande d\'export'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/export/status/:requestId
 * @desc Obtenir le statut d'un export
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/export/status/:requestId',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId, requestId } = req.params;
      const status = await gdprService.getExportStatus(requestId, userId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EXPORT_NOT_FOUND',
            message: 'Export non trouvé'
          }
        });
      }

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      console.error('[GDPR] Erreur récupération statut export:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: 'Erreur lors de la récupération du statut'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/export/download/:requestId
 * @desc Télécharger un export de données
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/export/download/:requestId',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId, requestId } = req.params;
      const download = await gdprService.downloadExport(requestId, userId);

      if (!download.success) {
        return res.status(download.code === 'EXPORT_EXPIRED' ? 410 : 404).json({
          success: false,
          error: {
            code: download.code,
            message: download.message
          }
        });
      }

      // Définir les headers pour le téléchargement
      res.setHeader('Content-Type', download.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
      res.setHeader('Content-Length', download.size);

      // Envoyer le fichier
      res.send(download.data);

    } catch (error) {
      console.error('[GDPR] Erreur téléchargement export:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DOWNLOAD_ERROR',
          message: 'Erreur lors du téléchargement'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/exports
 * @desc Lister tous les exports de l'utilisateur
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/exports',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const exports = await gdprService.listExports(userId);

      res.json({
        success: true,
        data: exports
      });

    } catch (error) {
      console.error('[GDPR] Erreur liste exports:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'LIST_ERROR',
          message: 'Erreur lors de la récupération des exports'
        }
      });
    }
  }
);

// ============================================
// ROUTES - CONSENTEMENT (Article 7)
// ============================================

/**
 * @route GET /api/gdpr/users/:userId/consents
 * @desc Obtenir tous les consentements de l'utilisateur
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/consents',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const consents = await consentService.getUserConsents(userId);

      res.json({
        success: true,
        data: consents
      });

    } catch (error) {
      console.error('[GDPR] Erreur récupération consentements:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONSENTS_ERROR',
          message: 'Erreur lors de la récupération des consentements'
        }
      });
    }
  }
);

/**
 * @route POST /api/gdpr/users/:userId/consents
 * @desc Accorder un ou plusieurs consentements
 * @access Private (user own data)
 */
router.post('/users/:userId/consents',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { consents } = req.body;

      if (!consents || !Array.isArray(consents) || consents.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CONSENTS',
            message: 'Liste de consentements requise'
          }
        });
      }

      const results = [];
      for (const consent of consents) {
        const result = await consentService.grantConsent(userId, consent.type, {
          version: consent.version,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          source: consent.source || 'api'
        });
        results.push({ type: consent.type, success: result.success });
      }

      res.json({
        success: true,
        message: 'Consentements enregistrés',
        data: results
      });

    } catch (error) {
      console.error('[GDPR] Erreur enregistrement consentements:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CONSENT_ERROR',
          message: 'Erreur lors de l\'enregistrement des consentements'
        }
      });
    }
  }
);

/**
 * @route DELETE /api/gdpr/users/:userId/consents/:consentType
 * @desc Révoquer un consentement
 * @access Private (user own data)
 */
router.delete('/users/:userId/consents/:consentType',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId, consentType } = req.params;
      const { reason } = req.body;

      const result = await consentService.revokeConsent(userId, consentType, {
        reason,
        ipAddress: req.ip,
        revokedBy: req.user?.id || req.user?._id?.toString()
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: result.code || 'REVOKE_ERROR',
            message: result.message
          }
        });
      }

      res.json({
        success: true,
        message: 'Consentement révoqué',
        data: {
          type: consentType,
          revokedAt: result.revokedAt
        }
      });

    } catch (error) {
      console.error('[GDPR] Erreur révocation consentement:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'REVOKE_ERROR',
          message: 'Erreur lors de la révocation'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/consents/history
 * @desc Obtenir l'historique des consentements
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/consents/history',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 50 } = req.query;

      const history = await consentService.getConsentHistory(userId, parseInt(limit));

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      console.error('[GDPR] Erreur historique consentements:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'HISTORY_ERROR',
          message: 'Erreur lors de la récupération de l\'historique'
        }
      });
    }
  }
);

/**
 * @route GET /api/gdpr/users/:userId/consents/export
 * @desc Exporter les preuves de consentement (audit)
 * @access Private (user own data or admin)
 */
router.get('/users/:userId/consents/export',
  validateUserId,
  validateUserAccess,
  async (req, res) => {
    try {
      const { userId } = req.params;
      const proof = await consentService.exportConsentProof(userId);

      res.json({
        success: true,
        data: proof
      });

    } catch (error) {
      console.error('[GDPR] Erreur export preuves:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_ERROR',
          message: 'Erreur lors de l\'export des preuves'
        }
      });
    }
  }
);

// ============================================
// ROUTES - INFORMATIONS RGPD
// ============================================

/**
 * @route GET /api/gdpr/consent-types
 * @desc Obtenir la liste des types de consentement disponibles
 * @access Public
 */
router.get('/consent-types', (req, res) => {
  const consentTypes = consentService?.getConsentTypes() || {
    TERMS_OF_SERVICE: { required: true, version: '1.0', description: 'Conditions générales d\'utilisation' },
    PRIVACY_POLICY: { required: true, version: '1.0', description: 'Politique de confidentialité' },
    DATA_PROCESSING: { required: true, version: '1.0', description: 'Traitement des données personnelles' },
    MARKETING_EMAIL: { required: false, version: '1.0', description: 'Communications marketing par email' },
    MARKETING_SMS: { required: false, version: '1.0', description: 'Communications marketing par SMS' },
    GPS_TRACKING: { required: false, version: '1.0', description: 'Suivi GPS des véhicules' },
    ANALYTICS: { required: false, version: '1.0', description: 'Analyse d\'utilisation' },
    THIRD_PARTY_SHARING: { required: false, version: '1.0', description: 'Partage avec partenaires' }
  };

  res.json({
    success: true,
    data: consentTypes
  });
});

/**
 * @route GET /api/gdpr/privacy-policy
 * @desc Obtenir la politique de confidentialité
 * @access Public
 */
router.get('/privacy-policy', (req, res) => {
  res.json({
    success: true,
    data: {
      version: '1.0.0',
      lastUpdated: '2025-01-02',
      sections: [
        {
          title: 'Collecte des données',
          content: 'Nous collectons uniquement les données nécessaires au fonctionnement du service...'
        },
        {
          title: 'Utilisation des données',
          content: 'Vos données sont utilisées pour fournir les services de gestion transport...'
        },
        {
          title: 'Vos droits',
          content: 'Conformément au RGPD, vous disposez des droits d\'accès, rectification, suppression, portabilité...'
        },
        {
          title: 'Conservation',
          content: 'Les données sont conservées pendant la durée de votre abonnement plus 3 ans...'
        },
        {
          title: 'Contact DPO',
          content: 'Pour toute question: dpo@rt-technologie.fr'
        }
      ],
      downloadUrl: '/api/gdpr/privacy-policy/pdf'
    }
  });
});

/**
 * @route GET /api/gdpr/data-categories
 * @desc Obtenir les catégories de données collectées
 * @access Public
 */
router.get('/data-categories', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        category: 'identity',
        name: 'Données d\'identité',
        examples: ['Nom', 'Prénom', 'Email', 'Téléphone'],
        purpose: 'Création et gestion du compte',
        retention: '3 ans après fin de contrat',
        legal_basis: 'Contrat'
      },
      {
        category: 'company',
        name: 'Données d\'entreprise',
        examples: ['SIRET', 'Raison sociale', 'Adresse siège'],
        purpose: 'Facturation et conformité légale',
        retention: '10 ans (obligations comptables)',
        legal_basis: 'Obligation légale'
      },
      {
        category: 'transport',
        name: 'Données de transport',
        examples: ['Ordres de transport', 'e-CMR', 'Positions GPS'],
        purpose: 'Exécution du service',
        retention: '10 ans (e-CMR)',
        legal_basis: 'Contrat'
      },
      {
        category: 'financial',
        name: 'Données financières',
        examples: ['IBAN', 'Factures', 'Paiements'],
        purpose: 'Facturation',
        retention: '10 ans (obligations comptables)',
        legal_basis: 'Obligation légale'
      },
      {
        category: 'technical',
        name: 'Données techniques',
        examples: ['Logs de connexion', 'Adresse IP'],
        purpose: 'Sécurité et audit',
        retention: '1 an',
        legal_basis: 'Intérêt légitime'
      }
    ]
  });
});

// ============================================
// ROUTES ADMIN - GESTION RGPD
// ============================================

/**
 * @route GET /api/gdpr/admin/deletion-requests
 * @desc Lister toutes les demandes de suppression (admin)
 * @access Admin only
 */
router.get('/admin/deletion-requests', async (req, res) => {
  // Vérifier les droits admin
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: { code: 'ADMIN_REQUIRED', message: 'Accès administrateur requis' }
    });
  }

  try {
    const { status, limit = 50 } = req.query;
    const requests = await gdprService.listDeletionRequests({ status }, parseInt(limit));

    res.json({
      success: true,
      data: requests
    });

  } catch (error) {
    console.error('[GDPR Admin] Erreur liste suppressions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: 'Erreur lors de la récupération' }
    });
  }
});

/**
 * @route POST /api/gdpr/admin/process-deletions
 * @desc Exécuter les suppressions programmées (cron)
 * @access Admin only
 */
router.post('/admin/process-deletions', async (req, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: { code: 'ADMIN_REQUIRED', message: 'Accès administrateur requis' }
    });
  }

  try {
    const result = await gdprService.processScheduledDeletions();

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[GDPR Admin] Erreur traitement suppressions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_ERROR', message: 'Erreur lors du traitement' }
    });
  }
});

/**
 * @route POST /api/gdpr/admin/apply-retention
 * @desc Appliquer la politique de rétention (cron)
 * @access Admin only
 */
router.post('/admin/apply-retention', async (req, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: { code: 'ADMIN_REQUIRED', message: 'Accès administrateur requis' }
    });
  }

  try {
    const result = await gdprService.applyRetentionPolicy();

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[GDPR Admin] Erreur application rétention:', error);
    res.status(500).json({
      success: false,
      error: { code: 'RETENTION_ERROR', message: 'Erreur lors de l\'application' }
    });
  }
});

/**
 * @route GET /api/gdpr/admin/stats
 * @desc Statistiques RGPD (admin)
 * @access Admin only
 */
router.get('/admin/stats', async (req, res) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      error: { code: 'ADMIN_REQUIRED', message: 'Accès administrateur requis' }
    });
  }

  try {
    const stats = await gdprService.getStats();

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('[GDPR Admin] Erreur stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: 'Erreur lors de la récupération' }
    });
  }
});

// ============================================
// EXPORTS
// ============================================

module.exports = {
  router,
  initializeGdprRoutes
};
