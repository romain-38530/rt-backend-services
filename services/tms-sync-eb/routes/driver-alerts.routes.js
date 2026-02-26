/**
 * Routes API Alertes Chauffeurs
 *
 * Gestion des SMS manuels uniquement (pas d'automatisation)
 */

const express = require('express');
const router = express.Router();
const DriverAlertsService = require('../services/driver-alerts.service');

let alertsService = null;

/**
 * POST /api/v1/driver-alerts/evaluate
 * Évaluer un retard et obtenir la recommandation d'action
 *
 * Body:
 * {
 *   "delayMinutes": 45
 * }
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { delayMinutes } = req.body;

    if (delayMinutes === undefined) {
      return res.status(400).json({
        success: false,
        error: 'delayMinutes requis'
      });
    }

    if (!alertsService) {
      return res.status(503).json({
        success: false,
        error: 'Service d\'alertes non disponible'
      });
    }

    const evaluation = alertsService.evaluateDelay(parseInt(delayMinutes));

    return res.json({
      success: true,
      delayMinutes: parseInt(delayMinutes),
      ...evaluation
    });

  } catch (error) {
    console.error('[Driver Alerts] Erreur evaluate:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/driver-alerts/send-sms
 * Envoyer un SMS manuel à un chauffeur
 *
 * IMPORTANT: Nécessite authentification et autorisation
 *
 * Body:
 * {
 *   "transportUid": "abc-123",
 *   "driverPhone": "+33612345678",
 *   "message": "Transport retardé de 2h. Peux-tu confirmer ton ETA ?",
 *   "delayMinutes": 120,
 *   "userId": "user-123",
 *   "userName": "Jean Dupont"
 * }
 */
router.post('/send-sms', async (req, res) => {
  try {
    const {
      transportUid,
      driverPhone,
      message,
      delayMinutes,
      userId,
      userName
    } = req.body;

    // Validation
    if (!transportUid || !driverPhone || !message || !delayMinutes) {
      return res.status(400).json({
        success: false,
        error: 'transportUid, driverPhone, message et delayMinutes requis'
      });
    }

    if (!alertsService) {
      return res.status(503).json({
        success: false,
        error: 'Service d\'alertes non disponible'
      });
    }

    // Envoyer le SMS
    const result = await alertsService.sendManualSMS({
      transportUid,
      driverPhone,
      message,
      delayMinutes: parseInt(delayMinutes),
      userId: userId || 'unknown',
      userName: userName || 'Unknown User'
    });

    if (result.success) {
      return res.json({
        success: true,
        messageId: result.messageId,
        message: result.message
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('[Driver Alerts] Erreur send-sms:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/driver-alerts/can-send/:transportUid
 * Vérifier si un SMS peut être envoyé (cooldown)
 */
router.get('/can-send/:transportUid', async (req, res) => {
  try {
    const { transportUid } = req.params;

    if (!alertsService) {
      return res.status(503).json({
        success: false,
        error: 'Service d\'alertes non disponible'
      });
    }

    const check = alertsService.canSendSMS(transportUid);

    return res.json({
      success: true,
      transportUid,
      canSend: check.allowed,
      reason: check.reason
    });

  } catch (error) {
    console.error('[Driver Alerts] Erreur can-send:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/driver-alerts/history/:transportUid
 * Obtenir l'historique des SMS pour un transport
 */
router.get('/history/:transportUid', async (req, res) => {
  try {
    const { transportUid } = req.params;

    if (!alertsService) {
      return res.status(503).json({
        success: false,
        error: 'Service d\'alertes non disponible'
      });
    }

    const history = await alertsService.getSMSHistory(transportUid);

    return res.json({
      success: true,
      transportUid,
      count: history.length,
      history
    });

  } catch (error) {
    console.error('[Driver Alerts] Erreur history:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/driver-alerts/stats
 * Obtenir les statistiques d'utilisation des SMS
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = '7d' } = req.query;

    if (!alertsService) {
      return res.status(503).json({
        success: false,
        error: 'Service d\'alertes non disponible'
      });
    }

    const stats = await alertsService.getStats(period);

    return res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[Driver Alerts] Erreur stats:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/driver-alerts/thresholds
 * Obtenir les seuils de retard configurés
 */
router.get('/thresholds', (req, res) => {
  const { DELAY_THRESHOLDS } = require('../services/driver-alerts.service');

  return res.json({
    success: true,
    thresholds: DELAY_THRESHOLDS,
    rules: {
      none: `< ${DELAY_THRESHOLDS.MINOR}min: Aucune action`,
      minor: `${DELAY_THRESHOLDS.MINOR}-${DELAY_THRESHOLDS.MEDIUM}min: Alerte UI seulement`,
      medium: `${DELAY_THRESHOLDS.MEDIUM}-${DELAY_THRESHOLDS.HIGH}min: Alerte UI + Option SMS manuel`,
      high: `${DELAY_THRESHOLDS.HIGH}-${DELAY_THRESHOLDS.CRITICAL}min: SMS manuel recommandé`,
      critical: `> ${DELAY_THRESHOLDS.CRITICAL}min: Intervention manuelle requise`
    }
  });
});

/**
 * Configurer le service d'alertes
 */
function setDatabase(db) {
  alertsService = new DriverAlertsService(db);
}

module.exports = router;
module.exports.setDatabase = setDatabase;
