// ============================================================================
// OVHcloud Routes - API pour gérer DNS et Emails
// ============================================================================

const express = require('express');
const ovhcloudService = require('../integrations/ovhcloud-service');

const router = express.Router();

// ============================================================================
// MIDDLEWARES
// ============================================================================

// Middleware pour vérifier que le service est initialisé
const ensureInitialized = (req, res, next) => {
  if (!ovhcloudService.initialized) {
    const initialized = ovhcloudService.initialize();
    if (!initialized) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_NOT_CONFIGURED',
          message: 'OVHcloud API is not configured. Please set OVH_APP_KEY, OVH_APP_SECRET, and OVH_CONSUMER_KEY environment variables.'
        }
      });
    }
  }
  next();
};

// ============================================================================
// STATUS & CONFIGURATION
// ============================================================================

/**
 * GET /api/ovhcloud/status
 * Vérifier le statut de l'intégration OVHcloud
 */
router.get('/status', ensureInitialized, async (req, res) => {
  try {
    const config = await ovhcloudService.checkConfiguration();
    res.json({
      success: true,
      data: {
        configured: true,
        ...config
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_CHECK_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/ovhcloud/domains
 * Lister tous les domaines disponibles
 */
router.get('/domains', ensureInitialized, async (req, res) => {
  try {
    const domains = await ovhcloudService.listDomains();
    res.json({
      success: true,
      data: domains
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_DOMAINS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/ovhcloud/domain
 * Obtenir les informations du domaine principal
 */
router.get('/domain', ensureInitialized, async (req, res) => {
  try {
    const domainInfo = await ovhcloudService.getDomainInfo();
    res.json({
      success: true,
      data: domainInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DOMAIN_INFO_FAILED',
        message: error.message
      }
    });
  }
});

// ============================================================================
// DNS MANAGEMENT
// ============================================================================

/**
 * GET /api/ovhcloud/dns/records
 * Lister les enregistrements DNS
 * Query params: fieldType, subDomain
 */
router.get('/dns/records', ensureInitialized, async (req, res) => {
  try {
    const { fieldType, subDomain } = req.query;
    const records = await ovhcloudService.listDNSRecords({ fieldType, subDomain });

    res.json({
      success: true,
      data: records,
      count: records.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_DNS_RECORDS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * POST /api/ovhcloud/dns/records
 * Créer un enregistrement DNS
 * Body: { subDomain, fieldType, target, ttl }
 */
router.post('/dns/records', ensureInitialized, async (req, res) => {
  try {
    const { subDomain, fieldType, target, ttl } = req.body;

    // Validation
    if (!fieldType || !target) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'fieldType and target are required'
        }
      });
    }

    const record = await ovhcloudService.createDNSRecord({
      subDomain: subDomain || '',
      fieldType,
      target,
      ttl: ttl || 3600
    });

    res.status(201).json({
      success: true,
      data: record
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_DNS_RECORD_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * PUT /api/ovhcloud/dns/records/:recordId
 * Mettre à jour un enregistrement DNS
 * Body: { target, ttl, subDomain }
 */
router.put('/dns/records/:recordId', ensureInitialized, async (req, res) => {
  try {
    const { recordId } = req.params;
    const updates = req.body;

    const record = await ovhcloudService.updateDNSRecord(parseInt(recordId), updates);

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_DNS_RECORD_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * DELETE /api/ovhcloud/dns/records/:recordId
 * Supprimer un enregistrement DNS
 */
router.delete('/dns/records/:recordId', ensureInitialized, async (req, res) => {
  try {
    const { recordId } = req.params;
    await ovhcloudService.deleteDNSRecord(parseInt(recordId));

    res.json({
      success: true,
      message: 'DNS record deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_DNS_RECORD_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * POST /api/ovhcloud/dns/refresh
 * Rafraîchir la zone DNS (appliquer les changements)
 */
router.post('/dns/refresh', ensureInitialized, async (req, res) => {
  try {
    await ovhcloudService.refreshDNSZone();

    res.json({
      success: true,
      message: 'DNS zone refreshed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_DNS_ZONE_FAILED',
        message: error.message
      }
    });
  }
});

// ============================================================================
// EMAIL MANAGEMENT
// ============================================================================

/**
 * GET /api/ovhcloud/email/accounts
 * Lister les comptes email
 */
router.get('/email/accounts', ensureInitialized, async (req, res) => {
  try {
    const accounts = await ovhcloudService.listEmailAccounts();

    res.json({
      success: true,
      data: accounts,
      count: accounts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_EMAIL_ACCOUNTS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * POST /api/ovhcloud/email/accounts
 * Créer un compte email
 * Body: { accountName, password, size }
 */
router.post('/email/accounts', ensureInitialized, async (req, res) => {
  try {
    const { accountName, password, size } = req.body;

    // Validation
    if (!accountName || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'accountName and password are required'
        }
      });
    }

    const account = await ovhcloudService.createEmailAccount({
      accountName,
      password,
      size: size || 5000
    });

    res.status(201).json({
      success: true,
      data: account
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_EMAIL_ACCOUNT_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * POST /api/ovhcloud/email/accounts/:accountName/password
 * Modifier le mot de passe d'un compte email
 * Body: { password }
 */
router.post('/email/accounts/:accountName/password', ensureInitialized, async (req, res) => {
  try {
    const { accountName } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'password is required'
        }
      });
    }

    await ovhcloudService.changeEmailPassword(accountName, password);

    res.json({
      success: true,
      message: 'Email password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CHANGE_EMAIL_PASSWORD_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * DELETE /api/ovhcloud/email/accounts/:accountName
 * Supprimer un compte email
 */
router.delete('/email/accounts/:accountName', ensureInitialized, async (req, res) => {
  try {
    const { accountName } = req.params;
    await ovhcloudService.deleteEmailAccount(accountName);

    res.json({
      success: true,
      message: 'Email account deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_EMAIL_ACCOUNT_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * GET /api/ovhcloud/email/redirections
 * Lister les redirections email
 */
router.get('/email/redirections', ensureInitialized, async (req, res) => {
  try {
    const redirections = await ovhcloudService.listEmailRedirections();

    res.json({
      success: true,
      data: redirections,
      count: redirections.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'LIST_EMAIL_REDIRECTIONS_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * POST /api/ovhcloud/email/redirections
 * Créer une redirection email
 * Body: { from, to, localCopy }
 */
router.post('/email/redirections', ensureInitialized, async (req, res) => {
  try {
    const { from, to, localCopy } = req.body;

    // Validation
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'from and to are required'
        }
      });
    }

    const redirection = await ovhcloudService.createEmailRedirection({
      from,
      to,
      localCopy: localCopy || false
    });

    res.status(201).json({
      success: true,
      data: redirection
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_EMAIL_REDIRECTION_FAILED',
        message: error.message
      }
    });
  }
});

/**
 * DELETE /api/ovhcloud/email/redirections/:redirectionId
 * Supprimer une redirection email
 */
router.delete('/email/redirections/:redirectionId', ensureInitialized, async (req, res) => {
  try {
    const { redirectionId } = req.params;
    await ovhcloudService.deleteEmailRedirection(redirectionId);

    res.json({
      success: true,
      message: 'Email redirection deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_EMAIL_REDIRECTION_FAILED',
        message: error.message
      }
    });
  }
});

module.exports = router;
