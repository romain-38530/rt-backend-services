/**
 * Routes API pour la synchronisation Affret.IA → Dashdoc
 */

const express = require('express');
const router = express.Router();
const affretIADashdocSyncService = require('../services/affretia-dashdoc-sync.service');

/**
 * POST /api/v1/tms/affretia-sync/manual
 *
 * Synchroniser manuellement une commande assignée vers Dashdoc
 *
 * Body:
 * {
 *   "orderId": "64abc...",
 *   "price": 450.00,          // Facultatif (prix d'achat)
 *   "sellingPrice": 600.00,   // Facultatif (prix de vente)
 *   "vehiclePlate": "AB-123-CD",  // Facultatif
 *   "driverEmail": "driver@example.com"  // Facultatif
 * }
 */
router.post('/manual', async (req, res) => {
  try {
    const { orderId, price, sellingPrice, vehiclePlate, driverEmail } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'orderId is required'
      });
    }

    console.log(`[API] Synchronisation manuelle demandée pour order ${orderId}`);

    const result = await affretIADashdocSyncService.manualSync(orderId, {
      price,
      sellingPrice,
      vehiclePlate,
      driverEmail
    });

    if (result.success) {
      return res.json({
        success: true,
        message: 'Synchronisation vers Dashdoc réussie',
        result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: 'Échec de la synchronisation vers Dashdoc',
        result
      });
    }
  } catch (error) {
    console.error('[API] Erreur synchronisation manuelle:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tms/affretia-sync/test
 *
 * Tester la synchronisation avec des données fictives
 *
 * Body:
 * {
 *   "orderId": "64abc...",
 *   "carrierId": "64def...",
 *   "price": 450.00
 * }
 */
router.post('/test', async (req, res) => {
  try {
    const { orderId, carrierId, price } = req.body;

    if (!orderId || !carrierId || !price) {
      return res.status(400).json({
        success: false,
        error: 'orderId, carrierId and price are required'
      });
    }

    console.log(`[API] Test synchronisation: order ${orderId}, carrier ${carrierId}, price ${price}€`);

    const result = await affretIADashdocSyncService.testSync(orderId, carrierId, price);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Test de synchronisation réussi',
        result
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        message: 'Échec du test de synchronisation',
        result
      });
    }
  } catch (error) {
    console.error('[API] Erreur test synchronisation:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/tms/affretia-sync/webhook
 *
 * Webhook pour recevoir les événements d'affectation depuis Affret.IA
 *
 * Body:
 * {
 *   "eventName": "carrier.assigned",
 *   "data": {
 *     "orderId": "64abc...",
 *     "carrierId": "64def...",
 *     "price": 450.00,
 *     "sessionId": "64ghi..."
 *   }
 * }
 */
router.post('/webhook', async (req, res) => {
  try {
    const { eventName, data } = req.body;

    if (!eventName || !data) {
      return res.status(400).json({
        success: false,
        error: 'eventName and data are required'
      });
    }

    console.log(`[API] Webhook reçu: ${eventName}`);

    if (eventName === 'carrier.assigned') {
      const result = await affretIADashdocSyncService.handleCarrierAssigned(data);

      if (result.success) {
        return res.json({
          success: true,
          message: 'Événement traité avec succès',
          result
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error,
          message: 'Échec du traitement de l\'événement',
          result
        });
      }
    } else {
      return res.json({
        success: true,
        message: `Événement ${eventName} reçu (non géré)`
      });
    }
  } catch (error) {
    console.error('[API] Erreur traitement webhook:', error);

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/tms/affretia-sync/status
 *
 * Vérifier le statut du service de synchronisation
 */
router.get('/status', async (req, res) => {
  try {
    const connectorsCount = affretIADashdocSyncService.connectors.size;

    return res.json({
      success: true,
      status: 'running',
      connectorsLoaded: connectorsCount,
      retryConfig: affretIADashdocSyncService.retryConfig
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
