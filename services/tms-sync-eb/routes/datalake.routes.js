/**
 * Data Lake API Routes
 * Routes pour accéder aux données du Data Lake MongoDB
 *
 * Ces routes permettent aux services externes de lire les données Dashdoc
 * depuis MongoDB au lieu de faire des appels API directs.
 */

const express = require('express');
const router = express.Router();
const { getDatalakeReaders, getDatalakeStatus, isDatalakeEnabled, getDatalakeSyncService } = require('../scheduled-jobs');

/**
 * Middleware pour vérifier que le Data Lake est activé
 */
function requireDatalake(req, res, next) {
  if (!isDatalakeEnabled()) {
    return res.status(503).json({
      success: false,
      error: 'Data Lake is disabled'
    });
  }

  const readers = getDatalakeReaders();
  if (!readers) {
    return res.status(503).json({
      success: false,
      error: 'Data Lake readers not initialized'
    });
  }

  req.readers = readers;
  next();
}

// ==================== STATUS ====================

/**
 * GET /api/v1/datalake/status
 * Obtenir le statut du Data Lake
 */
router.get('/status', async (req, res) => {
  try {
    const status = await getDatalakeStatus();
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== TRANSPORTS ====================

/**
 * GET /api/v1/datalake/transports
 * Récupérer les transports depuis le Data Lake
 */
router.get('/transports', requireDatalake, async (req, res) => {
  try {
    const { connectionId, status, carrierId, tag, limit = 50, skip = 0 } = req.query;

    const filters = {};
    if (status) filters.status = status.split(',');
    if (carrierId) filters.carrierId = carrierId;
    if (tag) filters.tag = tag;

    const result = await req.readers.transports.find(
      filters,
      { limit: parseInt(limit), skip: parseInt(skip) },
      connectionId
    );

    res.json({
      success: true,
      data: result.results,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/transports/:uid
 * Récupérer un transport par UID
 */
router.get('/transports/:uid', requireDatalake, async (req, res) => {
  try {
    const { uid } = req.params;
    const { connectionId } = req.query;

    const transport = await req.readers.transports.getByUid(uid, connectionId);

    if (!transport) {
      return res.status(404).json({
        success: false,
        error: 'Transport not found'
      });
    }

    res.json({
      success: true,
      data: transport
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/transports/stats/by-status
 * Statistiques des transports par statut
 */
router.get('/transports/stats/by-status', requireDatalake, async (req, res) => {
  try {
    const { connectionId } = req.query;
    const stats = await req.readers.transports.getStatsByStatus(connectionId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/transports/stats/by-carrier
 * Statistiques des transports par carrier
 */
router.get('/transports/stats/by-carrier', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 20 } = req.query;
    const stats = await req.readers.transports.getStatsByCarrier(connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/transports/stats/global
 * Statistiques globales des transports
 */
router.get('/transports/stats/global', requireDatalake, async (req, res) => {
  try {
    const { connectionId } = req.query;
    const stats = await req.readers.transports.getGlobalStats(connectionId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/transports/to-plan
 * Transports à planifier (sans carrier)
 */
router.get('/transports/to-plan', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 50, skip = 0 } = req.query;
    const result = await req.readers.transports.getToPlan(connectionId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      data: result.results,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CARRIERS ====================

/**
 * GET /api/v1/datalake/carriers
 * Récupérer les carriers depuis le Data Lake
 */
router.get('/carriers', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 500, skip = 0 } = req.query;

    const result = await req.readers.carriers.getAllCarriers(connectionId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      data: result.results,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/carriers/:pk
 * Récupérer un carrier par PK
 */
router.get('/carriers/:pk', requireDatalake, async (req, res) => {
  try {
    const { pk } = req.params;
    const { connectionId } = req.query;

    const carrier = await req.readers.carriers.getByPk(pk, connectionId);

    if (!carrier) {
      return res.status(404).json({
        success: false,
        error: 'Carrier not found'
      });
    }

    res.json({
      success: true,
      data: carrier
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/carriers/search
 * Rechercher des carriers
 */
router.get('/carriers/search', requireDatalake, async (req, res) => {
  try {
    const { q, connectionId, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const carriers = await req.readers.carriers.search(q, connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: carriers,
      count: carriers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/carriers/with-stats
 * Carriers avec statistiques de transports
 */
router.get('/carriers/with-stats', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 100, minOrders = 0 } = req.query;

    const carriers = await req.readers.carriers.getCarriersWithStats(connectionId, {
      limit: parseInt(limit),
      minOrders: parseInt(minOrders)
    });

    res.json({
      success: true,
      data: carriers,
      count: carriers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/carriers/top
 * Top carriers par nombre de commandes
 */
router.get('/carriers/top', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 10, period = 90 } = req.query;

    const carriers = await req.readers.carriers.getTopCarriers(connectionId, {
      limit: parseInt(limit),
      period: parseInt(period)
    });

    res.json({
      success: true,
      data: carriers,
      count: carriers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/carriers/stats
 * Statistiques globales des carriers
 */
router.get('/carriers/stats', requireDatalake, async (req, res) => {
  try {
    const { connectionId } = req.query;
    const stats = await req.readers.carriers.getGlobalStats(connectionId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== VEHICLES ====================

/**
 * GET /api/v1/datalake/vehicles
 * Récupérer les véhicules depuis le Data Lake
 */
router.get('/vehicles', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 500, skip = 0 } = req.query;

    const result = await req.readers.vehicles.getAll(connectionId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      data: result.results,
      total: result.total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/vehicles/by-carrier/:companyPk
 * Véhicules d'un carrier
 */
router.get('/vehicles/by-carrier/:companyPk', requireDatalake, async (req, res) => {
  try {
    const { companyPk } = req.params;
    const { connectionId, limit = 100 } = req.query;

    const vehicles = await req.readers.vehicles.getByCarrier(companyPk, connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: vehicles,
      count: vehicles.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/vehicles/by-plate/:licensePlate
 * Rechercher un véhicule par plaque
 */
router.get('/vehicles/by-plate/:licensePlate', requireDatalake, async (req, res) => {
  try {
    const { licensePlate } = req.params;
    const { connectionId } = req.query;

    const vehicle = await req.readers.vehicles.getByLicensePlate(licensePlate, connectionId);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      data: vehicle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== TRUCKERS ====================

/**
 * GET /api/v1/datalake/truckers
 * Récupérer les chauffeurs depuis le Data Lake
 */
router.get('/truckers', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 500, skip = 0 } = req.query;

    const result = await req.readers.truckers.getAll(connectionId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      data: result.results,
      total: result.total
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/truckers/by-carrier/:carrierPk
 * Chauffeurs d'un carrier
 */
router.get('/truckers/by-carrier/:carrierPk', requireDatalake, async (req, res) => {
  try {
    const { carrierPk } = req.params;
    const { connectionId, limit = 100 } = req.query;

    const truckers = await req.readers.truckers.getByCarrier(carrierPk, connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: truckers,
      count: truckers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/truckers/by-email/:email
 * Rechercher un chauffeur par email
 */
router.get('/truckers/by-email/:email', requireDatalake, async (req, res) => {
  try {
    const { email } = req.params;
    const { connectionId } = req.query;

    const trucker = await req.readers.truckers.getByEmail(email, connectionId);

    if (!trucker) {
      return res.status(404).json({
        success: false,
        error: 'Trucker not found'
      });
    }

    res.json({
      success: true,
      data: trucker
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CONTACTS (USERS) ====================

/**
 * GET /api/v1/datalake/contacts
 * Récupérer les contacts/utilisateurs depuis le Data Lake
 */
router.get('/contacts', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 500, skip = 0 } = req.query;

    const result = await req.readers.contacts.getAll(connectionId, {
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    res.json({
      success: true,
      data: result.results,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/search
 * Rechercher des contacts
 */
router.get('/contacts/search', requireDatalake, async (req, res) => {
  try {
    const { q, connectionId, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query (q) is required'
      });
    }

    const contacts = await req.readers.contacts.search(q, connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: contacts,
      count: contacts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/managers
 * Récupérer les managers
 */
router.get('/contacts/managers', requireDatalake, async (req, res) => {
  try {
    const { connectionId, limit = 100 } = req.query;

    const managers = await req.readers.contacts.getManagers(connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: managers,
      count: managers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/stats
 * Statistiques globales des contacts
 */
router.get('/contacts/stats', requireDatalake, async (req, res) => {
  try {
    const { connectionId } = req.query;
    const stats = await req.readers.contacts.getGlobalStats(connectionId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/by-company/:companyPk
 * Contacts d'une entreprise
 */
router.get('/contacts/by-company/:companyPk', requireDatalake, async (req, res) => {
  try {
    const { companyPk } = req.params;
    const { connectionId, limit = 100 } = req.query;

    const contacts = await req.readers.contacts.getByCompany(companyPk, connectionId, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: contacts,
      count: contacts.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/by-email/:email
 * Rechercher un contact par email
 */
router.get('/contacts/by-email/:email', requireDatalake, async (req, res) => {
  try {
    const { email } = req.params;
    const { connectionId } = req.query;

    const contact = await req.readers.contacts.getByEmail(email, connectionId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/datalake/contacts/:pk
 * Récupérer un contact par PK
 */
router.get('/contacts/:pk', requireDatalake, async (req, res) => {
  try {
    const { pk } = req.params;
    const { connectionId } = req.query;

    const contact = await req.readers.contacts.getByPk(pk, connectionId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    res.json({
      success: true,
      data: contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== SYNC CONTROL ====================

/**
 * POST /api/v1/datalake/sync
 * Déclencher une sync manuelle
 * Body: { type: 'full' | 'incremental' | 'periodic' | 'transports' }
 */
router.post('/sync', async (req, res) => {
  try {
    const { type = 'incremental' } = req.body;

    const syncService = getDatalakeSyncService();
    if (!syncService) {
      return res.status(503).json({
        success: false,
        error: 'Sync service not initialized'
      });
    }

    console.log(`[DATALAKE] Manual ${type} sync triggered via API`);

    // Lancer la sync en background
    syncService.triggerManualSync(type).catch(err => {
      console.error(`[DATALAKE] Manual ${type} sync failed:`, err.message);
    });

    res.json({
      success: true,
      message: `${type} sync started`,
      note: 'Sync is running in background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/datalake/sync/full
 * Déclencher une full sync manuelle
 */
router.post('/sync/full', async (req, res) => {
  try {
    const syncService = getDatalakeSyncService();
    if (!syncService) {
      return res.status(503).json({
        success: false,
        error: 'Sync service not initialized'
      });
    }

    console.log('[DATALAKE] Manual FULL sync triggered via API');

    // Lancer la sync en background
    syncService.triggerManualSync('full').catch(err => {
      console.error('[DATALAKE] Manual full sync failed:', err.message);
    });

    res.json({
      success: true,
      message: 'Full sync started',
      note: 'Sync is running in background'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DATA FRESHNESS ====================

/**
 * GET /api/v1/datalake/freshness
 * Vérifier la fraîcheur des données
 */
router.get('/freshness', requireDatalake, async (req, res) => {
  try {
    const { connectionId } = req.query;

    const [transportsFreshness, carriersFreshness, contactsFreshness] = await Promise.all([
      req.readers.transports.getDataFreshness(connectionId),
      req.readers.carriers.getDataFreshness(connectionId),
      req.readers.contacts.getDataFreshness(connectionId)
    ]);

    res.json({
      success: true,
      data: {
        transports: transportsFreshness,
        carriers: carriersFreshness,
        contacts: contactsFreshness,
        overallFresh: transportsFreshness.isFresh && carriersFreshness.isFresh && contactsFreshness.isFresh
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
