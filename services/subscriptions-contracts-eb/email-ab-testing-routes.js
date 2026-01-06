/**
 * Routes A/B Testing Emails - API gestion des tests de prospection
 * v4.2.3 - Test et optimisation des emails de prospection
 */

const express = require('express');
const router = express.Router();

const { emailABTestingService, EMAIL_VARIANTS } = require('./email-ab-testing-service');

// Middleware d'authentification
const requireAuth = (req, res, next) => {
  if (!req.user && !req.organization) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
};

// Middleware admin/commercial
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
// ROUTES A/B TESTING
// ============================================================================

/**
 * GET /api/b2p/ab-testing/variants
 * Obtenir toutes les variantes disponibles
 */
router.get('/variants', requireAuth, (req, res) => {
  try {
    res.json({
      success: true,
      data: EMAIL_VARIANTS
    });
  } catch (error) {
    console.error('[AB TESTING ROUTES] Error getting variants:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/ab-testing/tests
 * Creer un nouveau test A/B
 */
router.post('/tests', requireAuth, requireAdminOrCommercial, (req, res) => {
  try {
    const { name, description, category, variants, trafficSplit, endsAt, minSampleSize } = req.body;

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        error: 'name and category are required'
      });
    }

    if (!EMAIL_VARIANTS[category]) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Valid categories: ${Object.keys(EMAIL_VARIANTS).join(', ')}`
      });
    }

    const test = emailABTestingService.createTest({
      name,
      description,
      category,
      variants,
      trafficSplit,
      endsAt: endsAt ? new Date(endsAt) : undefined,
      minSampleSize,
      createdBy: req.user?._id || req.organization?._id
    });

    res.status(201).json({
      success: true,
      message: 'A/B test created successfully',
      data: test
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error creating test:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/ab-testing/tests
 * Lister tous les tests actifs
 */
router.get('/tests', requireAuth, (req, res) => {
  try {
    const tests = emailABTestingService.getActiveTests();
    res.json({
      success: true,
      data: tests,
      count: tests.length
    });
  } catch (error) {
    console.error('[AB TESTING ROUTES] Error getting tests:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/ab-testing/tests/:testId
 * Obtenir les details et resultats d'un test
 */
router.get('/tests/:testId', requireAuth, (req, res) => {
  try {
    const { testId } = req.params;
    const results = emailABTestingService.calculateTestResults(testId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error getting test results:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/ab-testing/tests/:testId/stop
 * Arreter un test et obtenir les resultats finaux
 */
router.post('/tests/:testId/stop', requireAuth, requireAdminOrCommercial, (req, res) => {
  try {
    const { testId } = req.params;
    const results = emailABTestingService.stopTest(testId);

    if (!results) {
      return res.status(404).json({
        success: false,
        error: 'Test not found'
      });
    }

    res.json({
      success: true,
      message: 'Test stopped successfully',
      data: results
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error stopping test:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/ab-testing/select-variant
 * Selectionner une variante pour un prospect (pour usage par le service de prospection)
 */
router.post('/select-variant', requireAuth, (req, res) => {
  try {
    const { testId, prospectEmail } = req.body;

    if (!testId || !prospectEmail) {
      return res.status(400).json({
        success: false,
        error: 'testId and prospectEmail are required'
      });
    }

    const variant = emailABTestingService.selectVariant(testId, prospectEmail);
    const config = emailABTestingService.getVariantConfig(
      emailABTestingService.activeTests.get(testId)?.category,
      variant
    );

    res.json({
      success: true,
      data: {
        variant,
        config
      }
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error selecting variant:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/ab-testing/track
 * Enregistrer un evenement de tracking (sent, opened, clicked, converted)
 */
router.post('/track', requireAuth, (req, res) => {
  try {
    const { testId, variant, eventType, prospectEmail } = req.body;

    if (!testId || !variant || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'testId, variant, and eventType are required'
      });
    }

    const validEvents = ['sent', 'delivered', 'opened', 'clicked', 'converted'];
    if (!validEvents.includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid eventType. Valid types: ${validEvents.join(', ')}`
      });
    }

    const recorded = emailABTestingService.recordEvent(testId, variant, eventType, prospectEmail);

    res.json({
      success: true,
      recorded
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error tracking event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/b2p/ab-testing/preview
 * Generer un apercu d'email avec des variantes specifiques
 */
router.post('/preview', requireAuth, (req, res) => {
  try {
    const { prospect, transport, variants } = req.body;

    if (!prospect || !prospect.carrierEmail) {
      return res.status(400).json({
        success: false,
        error: 'prospect with carrierEmail is required'
      });
    }

    const testSelections = {
      subject: variants?.subject || 'variant_a',
      cta: variants?.cta || 'variant_a',
      layout: variants?.layout || 'variant_a',
      offer: variants?.offer || 'variant_a'
    };

    const email = emailABTestingService.generateEmailWithVariants(
      prospect,
      transport,
      testSelections
    );

    res.json({
      success: true,
      data: {
        subject: email.subject,
        html: email.html,
        text: email.text,
        variants: email.variants,
        config: email.config
      }
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/b2p/ab-testing/best-performers
 * Obtenir les meilleures variantes basees sur les tests termines
 */
router.get('/best-performers', requireAuth, (req, res) => {
  try {
    const allTests = Array.from(emailABTestingService.activeTests.values());
    const completedTests = allTests.filter(t => t.status === 'completed');

    const bestPerformers = {};

    completedTests.forEach(test => {
      const results = emailABTestingService.calculateTestResults(test.testId);
      if (results && results.winner && results.confidence >= 75) {
        if (!bestPerformers[test.category]) {
          bestPerformers[test.category] = [];
        }
        bestPerformers[test.category].push({
          testId: test.testId,
          testName: test.name,
          winner: results.winner,
          conversionRate: results.winner.conversionRate,
          confidence: results.confidence,
          completedAt: test.completedAt
        });
      }
    });

    // Trier par taux de conversion
    Object.keys(bestPerformers).forEach(category => {
      bestPerformers[category].sort((a, b) => b.conversionRate - a.conversionRate);
    });

    res.json({
      success: true,
      data: bestPerformers
    });

  } catch (error) {
    console.error('[AB TESTING ROUTES] Error getting best performers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
