/**
 * Routes Dashboard B2P - API Suivi conversions prospects transporteurs
 * v4.2.3 - Dashboard + Alertes temps reel
 */

const express = require('express');
const router = express.Router();

const dashboardService = require('./b2p-dashboard-service');

// Middleware d'authentification (utilise le middleware global)
const requireAuth = (req, res, next) => {
  // Le middleware d'auth global devrait deja avoir valide le token
  if (!req.user && !req.organization) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
};

// Middleware pour verifier les droits admin/commercial
const requireAdminOrCommercial = (req, res, next) => {
  const allowedRoles = ['admin', 'super_admin', 'commercial', 'manager'];
  const userRole = req.user?.role || req.organization?.role;

  if (!userRole || !allowedRoles.includes(userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Access denied - Admin or Commercial role required'
    });
  }
  next();
};

// ============================================================================
// ROUTES DASHBOARD B2P
// ============================================================================

/**
 * GET /api/b2p/dashboard/stats
 * Statistiques globales de prospection B2P
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const stats = await dashboardService.getGlobalStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/funnel
 * Funnel de conversion detaille
 */
router.get('/funnel', requireAuth, async (req, res) => {
  try {
    const funnel = await dashboardService.getConversionFunnel();
    res.json({
      success: true,
      data: funnel
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting funnel:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/high-conversion
 * Prospects a haute probabilite de conversion
 */
router.get('/high-conversion', requireAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const prospects = await dashboardService.getHighConversionProspects(limit);
    res.json({
      success: true,
      data: prospects,
      count: prospects.length
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting high conversion prospects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/alerts
 * Alertes actives pour action commerciale
 */
router.get('/alerts', requireAuth, async (req, res) => {
  try {
    const alerts = await dashboardService.getActiveAlerts();
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/trends
 * Tendances de conversion sur une periode
 */
router.get('/trends', requireAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const trends = await dashboardService.getConversionTrends(days);
    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting trends:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/revenue
 * Statistiques de revenue genere par conversions B2P
 */
router.get('/revenue', requireAuth, async (req, res) => {
  try {
    const revenue = await dashboardService.getRevenueStats();
    res.json({
      success: true,
      data: revenue
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting revenue stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/actions
 * Actions commerciales recommandees
 */
router.get('/actions', requireAuth, async (req, res) => {
  try {
    const actions = await dashboardService.getRecommendedActions();
    res.json({
      success: true,
      data: actions,
      count: actions.length
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting recommended actions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/dashboard/summary
 * Resume complet pour affichage dashboard
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [stats, alerts, highConversion, revenue] = await Promise.all([
      dashboardService.getGlobalStats(),
      dashboardService.getActiveAlerts(),
      dashboardService.getHighConversionProspects(5),
      dashboardService.getRevenueStats()
    ]);

    res.json({
      success: true,
      data: {
        stats: stats.summary,
        funnel: stats.conversionFunnel,
        topZones: stats.topZones,
        alerts: {
          total: alerts.total,
          critical: alerts.byCritical,
          high: alerts.byHigh,
          topAlerts: alerts.alerts.slice(0, 5)
        },
        highConversionProspects: highConversion,
        revenue,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('[B2P ROUTES] Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROUTES WEBHOOK POUR ALERTES TEMPS REEL
// ============================================================================

/**
 * POST /api/b2p/dashboard/webhook/configure
 * Configurer un webhook pour recevoir les alertes en temps reel
 */
router.post('/webhook/configure', requireAuth, requireAdminOrCommercial, async (req, res) => {
  try {
    const { webhookUrl, events, enabled } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'webhookUrl is required'
      });
    }

    // Stocker la configuration (en memoire pour l'instant, a persister en DB)
    const config = {
      organizationId: req.organization?._id || req.user?.organizationId,
      webhookUrl,
      events: events || ['trial_expiring', 'trial_expired', 'high_conversion', 'bounced'],
      enabled: enabled !== false,
      createdAt: new Date(),
      createdBy: req.user?._id
    };

    // TODO: Persister en base de donnees
    console.log('[B2P DASHBOARD] Webhook configured:', config);

    res.json({
      success: true,
      message: 'Webhook configured successfully',
      config: {
        webhookUrl: config.webhookUrl,
        events: config.events,
        enabled: config.enabled
      }
    });

  } catch (error) {
    console.error('[B2P ROUTES] Error configuring webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/dashboard/test-alert
 * Tester l'envoi d'une alerte (dev only)
 */
router.post('/test-alert', requireAuth, requireAdminOrCommercial, async (req, res) => {
  try {
    const { type, message, prospectId } = req.body;

    const testAlert = {
      id: `test_${Date.now()}`,
      type: type || 'info',
      category: 'test',
      priority: 'low',
      title: 'Test Alert',
      message: message || 'This is a test alert',
      prospectId,
      createdAt: new Date()
    };

    // Emettre via WebSocket si disponible
    if (global.emitEvent) {
      global.emitEvent('b2p.alert', testAlert);
    }

    res.json({
      success: true,
      message: 'Test alert sent',
      alert: testAlert
    });

  } catch (error) {
    console.error('[B2P ROUTES] Error sending test alert:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
