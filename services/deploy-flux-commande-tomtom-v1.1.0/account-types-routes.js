// Account Types Routes - API REST pour gestion des types de compte
// RT Backend Services - Version 1.0.0

const express = require('express');
const { ObjectId } = require('mongodb');
const {
  AccountTypes,
  AccountStatus,
  accountTypesConfig,
  validateInitialTypeSelection,
  validateUpgrade,
  getUpgradeOptions
} = require('./account-types-models');

function createAccountTypesRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

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

  // ==================== ENDPOINTS ACCOUNT TYPES ====================

  /**
   * GET /api/account/types
   * Récupère tous les types de compte avec leur configuration
   */
  router.get('/types', checkMongoDB, async (req, res) => {
    try {
      const { creatableOnly } = req.query;

      let types = Object.values(accountTypesConfig);

      // Filtrer uniquement les types créables si demandé
      if (creatableOnly === 'true') {
        types = types.filter(type => type.isCreatable);
      }

      res.json({
        success: true,
        data: types,
        count: types.length
      });
    } catch (error) {
      console.error('Error fetching account types:', error);
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
   * POST /api/account/select-type
   * Permet à un utilisateur de sélectionner son type de compte initial
   *
   * Body: {
   *   userId: string,
   *   email: string,
   *   companyName: string,
   *   accountType: string (TRANSPORTEUR | EXPEDITEUR | PLATEFORME_LOGISTIQUE | COMMISSIONNAIRE)
   * }
   */
  router.post('/select-type', checkMongoDB, async (req, res) => {
    try {
      const { userId, email, companyName, accountType } = req.body;

      // Validation des champs requis
      if (!userId || !email || !companyName || !accountType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: userId, email, companyName, accountType'
          }
        });
      }

      // Valider que le type peut être sélectionné
      const validation = validateInitialTypeSelection(accountType);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ACCOUNT_TYPE',
            message: validation.errors.join(', ')
          }
        });
      }

      const db = mongoClient.db();
      const now = new Date();

      // Vérifier si l'utilisateur a déjà un compte
      const existingAccount = await db.collection('users').findOne({ userId });

      if (existingAccount) {
        // Si le compte existe déjà et a un type, ne pas permettre de resélectionner
        if (existingAccount.accountType && existingAccount.selectedTypeAt) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'TYPE_ALREADY_SELECTED',
              message: 'Account type has already been selected. Use upgrade endpoint to change type.'
            }
          });
        }

        // Mettre à jour le compte existant
        const result = await db.collection('users').findOneAndUpdate(
          { userId },
          {
            $set: {
              accountType,
              accountStatus: AccountStatus.PENDING,
              selectedTypeAt: now,
              updatedAt: now,
              email,
              companyName
            },
            $push: {
              accountHistory: {
                type: accountType,
                changedAt: now,
                changedBy: userId,
                reason: 'Initial type selection'
              }
            }
          },
          { returnDocument: 'after' }
        );

        return res.json({
          success: true,
          data: result.value,
          message: `Account type ${accountType} selected successfully`
        });
      }

      // Créer un nouveau compte
      const newAccount = {
        userId,
        email,
        companyName,
        accountType,
        accountStatus: AccountStatus.PENDING,
        accountHistory: [{
          type: accountType,
          changedAt: now,
          changedBy: userId,
          reason: 'Initial type selection'
        }],
        documents: {},
        upgradeRequest: null,
        createdAt: now,
        updatedAt: now,
        selectedTypeAt: now,
        activatedAt: null
      };

      const result = await db.collection('users').insertOne(newAccount);

      res.status(201).json({
        success: true,
        data: {
          ...newAccount,
          _id: result.insertedId
        },
        message: `Account type ${accountType} selected successfully`,
        nextSteps: accountTypesConfig[accountType].requiredDocuments
      });
    } catch (error) {
      console.error('Error selecting account type:', error);
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
   * GET /api/account/current/:userId
   * Récupère les informations du compte actuel de l'utilisateur
   */
  router.get('/current/:userId', checkMongoDB, async (req, res) => {
    try {
      const { userId } = req.params;

      const db = mongoClient.db();
      const account = await db.collection('users').findOne({ userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found'
          }
        });
      }

      // Enrichir avec la configuration du type
      const typeConfig = accountTypesConfig[account.accountType];

      res.json({
        success: true,
        data: {
          ...account,
          typeConfig
        }
      });
    } catch (error) {
      console.error('Error fetching current account:', error);
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
   * GET /api/account/upgrade-options/:userId
   * Récupère les options d'évolution disponibles pour l'utilisateur
   */
  router.get('/upgrade-options/:userId', checkMongoDB, async (req, res) => {
    try {
      const { userId } = req.params;

      const db = mongoClient.db();
      const account = await db.collection('users').findOne({ userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found'
          }
        });
      }

      if (!account.accountType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_TYPE_SELECTED',
            message: 'User must select an initial account type first'
          }
        });
      }

      const options = getUpgradeOptions(account.accountType, account);

      res.json({
        success: true,
        data: {
          currentType: account.accountType,
          currentTypeConfig: accountTypesConfig[account.accountType],
          upgradeOptions: options,
          hasActiveUpgradeRequest: account.upgradeRequest?.status === 'PENDING'
        }
      });
    } catch (error) {
      console.error('Error fetching upgrade options:', error);
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
   * POST /api/account/upgrade
   * Soumettre une demande d'évolution de type de compte
   *
   * Body: {
   *   userId: string,
   *   requestedType: string,
   *   documents: {
   *     [documentType]: {
   *       url: string,
   *       name: string
   *     }
   *   }
   * }
   */
  router.post('/upgrade', checkMongoDB, async (req, res) => {
    try {
      const { userId, requestedType, documents } = req.body;

      if (!userId || !requestedType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: userId, requestedType'
          }
        });
      }

      const db = mongoClient.db();
      const account = await db.collection('users').findOne({ userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found'
          }
        });
      }

      if (!account.accountType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_TYPE_SELECTED',
            message: 'User must select an initial account type first'
          }
        });
      }

      // Vérifier s'il y a déjà une demande en cours
      if (account.upgradeRequest?.status === 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPGRADE_REQUEST_PENDING',
            message: 'An upgrade request is already pending. Please wait for approval or cancellation.'
          }
        });
      }

      // Valider l'évolution
      const validation = validateUpgrade(account.accountType, requestedType, account);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPGRADE_NOT_ALLOWED',
            message: validation.errors.join(', '),
            details: validation.errors
          }
        });
      }

      const now = new Date();

      // Créer la demande d'évolution
      const upgradeRequest = {
        requestedType,
        requestedAt: now,
        status: 'PENDING',
        documents: documents || {},
        rejectionReason: null,
        approvedAt: null,
        approvedBy: null
      };

      const result = await db.collection('users').findOneAndUpdate(
        { userId },
        {
          $set: {
            upgradeRequest,
            accountStatus: AccountStatus.UPGRADING,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: `Upgrade request to ${requestedType} submitted successfully`,
        estimatedApprovalDays: validation.upgradeRule.approval.estimatedDays,
        requiresExternalApproval: validation.upgradeRule.approval.requiresExternalApproval
      });
    } catch (error) {
      console.error('Error submitting upgrade request:', error);
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
   * POST /api/account/upgrade/approve
   * Approuver une demande d'évolution (admin seulement)
   *
   * Body: {
   *   userId: string,
   *   approvedBy: string
   * }
   */
  router.post('/upgrade/approve', checkMongoDB, async (req, res) => {
    try {
      const { userId, approvedBy } = req.body;

      if (!userId || !approvedBy) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: userId, approvedBy'
          }
        });
      }

      const db = mongoClient.db();
      const account = await db.collection('users').findOne({ userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found'
          }
        });
      }

      if (!account.upgradeRequest || account.upgradeRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_PENDING_REQUEST',
            message: 'No pending upgrade request found'
          }
        });
      }

      const now = new Date();
      const newType = account.upgradeRequest.requestedType;

      const result = await db.collection('users').findOneAndUpdate(
        { userId },
        {
          $set: {
            accountType: newType,
            accountStatus: AccountStatus.ACTIVE,
            'upgradeRequest.status': 'APPROVED',
            'upgradeRequest.approvedAt': now,
            'upgradeRequest.approvedBy': approvedBy,
            activatedAt: now,
            updatedAt: now
          },
          $push: {
            accountHistory: {
              type: newType,
              changedAt: now,
              changedBy: approvedBy,
              reason: `Upgrade from ${account.accountType} approved`
            }
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: `Upgrade to ${newType} approved successfully`
      });
    } catch (error) {
      console.error('Error approving upgrade:', error);
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
   * POST /api/account/upgrade/reject
   * Rejeter une demande d'évolution (admin seulement)
   *
   * Body: {
   *   userId: string,
   *   rejectedBy: string,
   *   reason: string
   * }
   */
  router.post('/upgrade/reject', checkMongoDB, async (req, res) => {
    try {
      const { userId, rejectedBy, reason } = req.body;

      if (!userId || !rejectedBy || !reason) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Missing required fields: userId, rejectedBy, reason'
          }
        });
      }

      const db = mongoClient.db();
      const account = await db.collection('users').findOne({ userId });

      if (!account) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found'
          }
        });
      }

      if (!account.upgradeRequest || account.upgradeRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_PENDING_REQUEST',
            message: 'No pending upgrade request found'
          }
        });
      }

      const now = new Date();

      const result = await db.collection('users').findOneAndUpdate(
        { userId },
        {
          $set: {
            accountStatus: AccountStatus.ACTIVE,
            'upgradeRequest.status': 'REJECTED',
            'upgradeRequest.rejectionReason': reason,
            'upgradeRequest.rejectedAt': now,
            'upgradeRequest.rejectedBy': rejectedBy,
            updatedAt: now
          }
        },
        { returnDocument: 'after' }
      );

      res.json({
        success: true,
        data: result.value,
        message: 'Upgrade request rejected'
      });
    } catch (error) {
      console.error('Error rejecting upgrade:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      });
    }
  });

  return router;
}

module.exports = createAccountTypesRoutes;
