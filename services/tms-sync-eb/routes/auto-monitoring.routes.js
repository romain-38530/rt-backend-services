/**
 * Routes API Monitoring Automatique Chauffeurs
 *
 * Contrôle du système de monitoring automatisé
 */

const express = require('express');
const router = express.Router();

let monitoringService = null;

/**
 * POST /api/v1/auto-monitoring/start
 * Démarrer le monitoring automatique
 */
router.post('/start', async (req, res) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Service de monitoring non disponible'
      });
    }

    monitoringService.start();

    return res.json({
      success: true,
      message: 'Monitoring automatique démarré',
      checkInterval: '5 minutes'
    });

  } catch (error) {
    console.error('[Auto-Monitoring API] Erreur start:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/auto-monitoring/stop
 * Arrêter le monitoring automatique
 */
router.post('/stop', async (req, res) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Service de monitoring non disponible'
      });
    }

    monitoringService.stop();

    return res.json({
      success: true,
      message: 'Monitoring automatique arrêté'
    });

  } catch (error) {
    console.error('[Auto-Monitoring API] Erreur stop:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/auto-monitoring/status
 * Obtenir le statut du monitoring
 */
router.get('/status', async (req, res) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Service de monitoring non disponible'
      });
    }

    return res.json({
      success: true,
      isRunning: monitoringService.isRunning,
      checkInterval: `${monitoringService.checkIntervalMs / 1000 / 60} minutes`
    });

  } catch (error) {
    console.error('[Auto-Monitoring API] Erreur status:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/v1/auto-monitoring/stats
 * Obtenir les statistiques du monitoring
 */
router.get('/stats', async (req, res) => {
  try {
    const { period = '24h' } = req.query;

    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Service de monitoring non disponible'
      });
    }

    const stats = await monitoringService.getStats(period);

    return res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('[Auto-Monitoring API] Erreur stats:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/v1/auto-monitoring/check-now
 * Déclencher une vérification immédiate
 */
router.post('/check-now', async (req, res) => {
  try {
    if (!monitoringService) {
      return res.status(503).json({
        success: false,
        error: 'Service de monitoring non disponible'
      });
    }

    // Lancer vérification en background
    monitoringService.checkAllActiveTransports()
      .catch(error => console.error('[Auto-Monitoring] Erreur check immédiat:', error));

    return res.json({
      success: true,
      message: 'Vérification immédiate lancée en arrière-plan'
    });

  } catch (error) {
    console.error('[Auto-Monitoring API] Erreur check-now:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Configurer le service de monitoring
 */
function setMonitoringService(service) {
  monitoringService = service;
}

module.exports = router;
module.exports.setMonitoringService = setMonitoringService;
