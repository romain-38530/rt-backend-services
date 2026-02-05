/**
 * DKV Data Lake API Routes
 *
 * REST API endpoints for accessing DKV fuel card data
 */

const express = require('express');
const router = express.Router();

// Will be initialized when service starts
let dkvReaders = null;
let dkvSyncService = null;
let isDkvEnabled = false;

/**
 * Initialize DKV Data Lake routes
 */
function initializeDkvDatalake(readers, syncService) {
  dkvReaders = readers;
  dkvSyncService = syncService;
  isDkvEnabled = true;
  console.log('[DKV-ROUTES] DKV Data Lake routes initialized');
}

/**
 * Check if DKV is available
 */
function getDkvReaders() {
  return dkvReaders;
}

function getDkvSyncService() {
  return dkvSyncService;
}

function isDkvDatalakeEnabled() {
  return isDkvEnabled;
}

/**
 * Middleware to check DKV availability
 */
function requireDkvDatalake(req, res, next) {
  if (!isDkvEnabled || !dkvReaders) {
    return res.status(503).json({
      success: false,
      error: 'DKV Data Lake not available',
      message: 'DKV integration is not configured or not ready',
    });
  }
  next();
}

// ============================================================================
// Status Routes
// ============================================================================

router.get('/status', async (req, res) => {
  try {
    if (!isDkvEnabled || !dkvSyncService) {
      return res.json({
        success: true,
        enabled: false,
        message: 'DKV Data Lake not configured',
      });
    }

    const stats = await dkvSyncService.getStats();

    res.json({
      success: true,
      enabled: true,
      status: stats.syncState?.status || 'unknown',
      isRunning: stats.isRunning,
      isPaused: stats.isPaused,
      lastFullSync: stats.syncState?.lastFullSyncAt,
      lastIncrementalSync: stats.syncState?.lastIncrementalSyncAt,
      collections: stats.counts,
      entities: stats.syncState?.entities,
      connector: stats.connector,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Sync Control Routes
// ============================================================================

router.post('/sync', requireDkvDatalake, async (req, res) => {
  try {
    const { type = 'incremental' } = req.body;

    if (!['full', 'incremental', 'periodic', 'cards', 'transactions', 'toll', 'invoices'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid sync type: ${type}`,
      });
    }

    // Trigger async (don't wait)
    dkvSyncService.triggerManualSync(type).catch(err => {
      console.error(`[DKV-ROUTES] Manual ${type} sync failed:`, err.message);
    });

    res.json({
      success: true,
      message: `${type} sync started`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/sync/pause', requireDkvDatalake, (req, res) => {
  const { reason } = req.body;
  dkvSyncService.pause(reason || 'API request');
  res.json({ success: true, message: 'Sync paused' });
});

router.post('/sync/resume', requireDkvDatalake, (req, res) => {
  dkvSyncService.resume();
  res.json({ success: true, message: 'Sync resumed' });
});

// ============================================================================
// Transactions Routes
// ============================================================================

router.get('/transactions', requireDkvDatalake, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      cardNumber,
      vehiclePlate,
      fromDate,
      toDate,
      country,
      product,
      billed,
      sortBy = 'transactionDate',
      sortOrder = -1,
    } = req.query;

    const filters = {};
    if (cardNumber) filters.cardNumber = cardNumber;
    if (vehiclePlate) filters.vehiclePlate = vehiclePlate;
    if (country) filters.stationCountry = country;
    if (product) filters.productName = new RegExp(product, 'i');
    if (billed !== undefined) filters.billed = billed === 'true';

    if (fromDate || toDate) {
      filters.transactionDate = {};
      if (fromDate) filters.transactionDate.$gte = new Date(fromDate);
      if (toDate) filters.transactionDate.$lte = new Date(toDate);
    }

    const result = await dkvReaders.transactions.find(filters, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/recent', requireDkvDatalake, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const result = await dkvReaders.transactions.getRecent(parseInt(days));

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.transactions.getGlobalStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats/by-card', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.transactions.getStatsByCard();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats/by-vehicle', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.transactions.getStatsByVehicle();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats/by-country', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.transactions.getStatsByCountry();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats/by-product', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.transactions.getStatsByProduct();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/stats/by-month', requireDkvDatalake, async (req, res) => {
  try {
    const { year } = req.query;
    const stats = await dkvReaders.transactions.getStatsByMonth(null, year ? parseInt(year) : null);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/unbilled', requireDkvDatalake, async (req, res) => {
  try {
    const result = await dkvReaders.transactions.getUnbilled();

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/transactions/:id', requireDkvDatalake, async (req, res) => {
  try {
    const transaction = await dkvReaders.transactions.getById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found',
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Cards Routes
// ============================================================================

router.get('/cards', requireDkvDatalake, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      vehiclePlate,
      sortBy = 'cardNumber',
      sortOrder = 1,
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (vehiclePlate) filters.vehiclePlate = vehiclePlate;

    const result = await dkvReaders.cards.find(filters, {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/active', requireDkvDatalake, async (req, res) => {
  try {
    const result = await dkvReaders.cards.getActiveCards();

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/expiring', requireDkvDatalake, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await dkvReaders.cards.getExpiringCards(parseInt(days));

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/stats', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.cards.getGlobalStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/search', requireDkvDatalake, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query required',
      });
    }

    const results = await dkvReaders.cards.search(q, null, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: results,
      total: results.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/:cardNumber', requireDkvDatalake, async (req, res) => {
  try {
    const card = await dkvReaders.cards.getByNumber(req.params.cardNumber);

    if (!card) {
      return res.status(404).json({
        success: false,
        error: 'Card not found',
      });
    }

    res.json({
      success: true,
      data: card,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/cards/:cardNumber/transactions', requireDkvDatalake, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await dkvReaders.transactions.getByCard(req.params.cardNumber, null, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Vehicles Routes
// ============================================================================

router.get('/vehicles', requireDkvDatalake, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      type,
      fuelType,
      sortBy = 'licensePlate',
      sortOrder = 1,
    } = req.query;

    let result;
    if (type) {
      result = await dkvReaders.vehicles.getByType(type, null, {
        page: parseInt(page),
        limit: parseInt(limit),
      });
    } else if (fuelType) {
      result = await dkvReaders.vehicles.getByFuelType(fuelType, null, {
        page: parseInt(page),
        limit: parseInt(limit),
      });
    } else {
      result = await dkvReaders.vehicles.getAll(null, {
        page: parseInt(page),
        limit: parseInt(limit),
        sortBy,
        sortOrder: parseInt(sortOrder),
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/top-consumers', requireDkvDatalake, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const vehicles = await dkvReaders.vehicles.getTopConsumers(parseInt(limit));

    res.json({
      success: true,
      data: vehicles,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/stats', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.vehicles.getGlobalStats();

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/stats/by-type', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.vehicles.getStatsByType();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/stats/by-fuel-type', requireDkvDatalake, async (req, res) => {
  try {
    const stats = await dkvReaders.vehicles.getStatsByFuelType();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/search', requireDkvDatalake, async (req, res) => {
  try {
    const { q, limit = 50 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Search query required',
      });
    }

    const results = await dkvReaders.vehicles.search(q, null, { limit: parseInt(limit) });

    res.json({
      success: true,
      data: results,
      total: results.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/:plate', requireDkvDatalake, async (req, res) => {
  try {
    const vehicle = await dkvReaders.vehicles.getByPlate(req.params.plate);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        error: 'Vehicle not found',
      });
    }

    res.json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/vehicles/:plate/transactions', requireDkvDatalake, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await dkvReaders.transactions.getByVehicle(req.params.plate, null, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Data Freshness
// ============================================================================

router.get('/freshness', requireDkvDatalake, async (req, res) => {
  try {
    const [transactionsFreshness, cardsFreshness] = await Promise.all([
      dkvReaders.transactions.getDataFreshness(),
      dkvReaders.cards.getDataFreshness(),
    ]);

    res.json({
      success: true,
      freshness: {
        transactions: transactionsFreshness,
        cards: cardsFreshness,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Export
// ============================================================================

module.exports = {
  router,
  initializeDkvDatalake,
  getDkvReaders,
  getDkvSyncService,
  isDkvDatalakeEnabled,
};
