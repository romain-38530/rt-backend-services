/**
 * Routes AFFRET.IA API v2
 * Toutes les routes pour le module d'affretement intelligent
 *
 * Endpoints:
 * - Session Management: /trigger, /session/:id, /sessions
 * - Analyse IA: /analyze
 * - Diffusion: /broadcast, /bourse
 * - Propositions: /response, /proposals
 * - Selection: /select, /ranking
 * - Vigilance: /vigilance
 * - Tracking IA: /tracking (3 niveaux: Basic/Intermediate/Premium)
 * - Blacklist: /blacklist
 * - Stats: /stats
 */

const express = require('express');
const router = express.Router();
const affretiaController = require('../controllers/affretia.controller');

// ==================== SESSION MANAGEMENT ====================

/**
 * POST /api/v1/affretia/trigger
 * Declencher AFFRET.IA pour une commande
 */
router.post('/trigger', affretiaController.triggerAffretIA);

/**
 * GET /api/v1/affretia/session/:id
 * Obtenir les details d'une session
 */
router.get('/session/:id', affretiaController.getSession);

/**
 * GET /api/v1/affretia/sessions
 * Liste des sessions AFFRET.IA
 */
router.get('/sessions', affretiaController.getSessions);

// ==================== ANALYSE IA ====================

/**
 * POST /api/v1/affretia/analyze
 * Lancer l'analyse IA d'une commande
 */
router.post('/analyze', affretiaController.analyzeOrder);

// ==================== DIFFUSION ====================

/**
 * POST /api/v1/affretia/broadcast
 * Lancer la diffusion multi-canal
 */
router.post('/broadcast', affretiaController.broadcastToCarriers);

// ==================== BOURSE PUBLIQUE ====================

/**
 * GET /api/v1/affretia/bourse
 * Consulter les offres disponibles (endpoint public)
 */
router.get('/bourse', affretiaController.getBourseOffers);

/**
 * POST /api/v1/affretia/bourse/submit
 * Soumettre une proposition via la bourse
 */
router.post('/bourse/submit', affretiaController.submitBourseProposal);

// ==================== PROPOSITIONS ====================

/**
 * POST /api/v1/affretia/response
 * Enregistrer une reponse de transporteur
 */
router.post('/response', affretiaController.recordCarrierResponse);

/**
 * GET /api/v1/affretia/proposals/:sessionId
 * Liste des propositions pour une session
 */
router.get('/proposals/:sessionId', affretiaController.getProposals);

/**
 * PUT /api/v1/affretia/proposals/:proposalId/accept
 * Accepter une proposition manuellement
 */
router.put('/proposals/:proposalId/accept', affretiaController.acceptProposal);

/**
 * PUT /api/v1/affretia/proposals/:proposalId/reject
 * Rejeter une proposition manuellement
 */
router.put('/proposals/:proposalId/reject', affretiaController.rejectProposal);

/**
 * POST /api/v1/affretia/proposals/:proposalId/negotiate
 * Lancer une negociation sur une proposition
 */
router.post('/proposals/:proposalId/negotiate', affretiaController.negotiateProposal);

// ==================== SELECTION ====================

/**
 * POST /api/v1/affretia/select
 * Selectionner automatiquement le meilleur transporteur
 */
router.post('/select', affretiaController.selectBestCarrier);

/**
 * GET /api/v1/affretia/ranking/:sessionId
 * Classement des propositions
 */
router.get('/ranking/:sessionId', affretiaController.getRanking);

// ==================== ASSIGNATION ====================

/**
 * POST /api/v1/affretia/assign
 * Assigner la mission au transporteur selectionne
 */
router.post('/assign', affretiaController.assignCarrier);

// ==================== VIGILANCE ====================

/**
 * POST /api/v1/affretia/vigilance/check
 * Verifier la conformite d'un transporteur
 */
router.post('/vigilance/check', affretiaController.checkVigilance);

/**
 * GET /api/v1/affretia/vigilance/:carrierId
 * Obtenir le statut de vigilance d'un transporteur
 */
router.get('/vigilance/:carrierId', affretiaController.getVigilanceStatus);

// ==================== STATS & REPORTING ====================

/**
 * GET /api/v1/affretia/stats
 * Statistiques globales AFFRET.IA
 */
router.get('/stats', affretiaController.getStats);

/**
 * GET /api/v1/affretia/stats/:organizationId
 * Statistiques par organisation
 */
router.get('/stats/:organizationId', affretiaController.getOrganizationStats);

// ==================== TRACKING IA ====================

/**
 * POST /api/v1/affretia/tracking/configure
 * Configurer le tracking pour une commande (Basic/Intermediate/Premium)
 */
router.post('/tracking/configure', affretiaController.configureTracking);

/**
 * GET /api/v1/affretia/tracking/:orderId
 * Obtenir les infos de tracking d'une commande
 */
router.get('/tracking/:orderId', affretiaController.getTracking);

/**
 * POST /api/v1/affretia/tracking/:trackingId/position
 * Mettre a jour la position GPS
 */
router.post('/tracking/:trackingId/position', affretiaController.updateTrackingPosition);

/**
 * PUT /api/v1/affretia/tracking/:trackingId/status
 * Mettre a jour le statut manuellement (niveau Basic)
 */
router.put('/tracking/:trackingId/status', affretiaController.updateTrackingStatus);

/**
 * GET /api/v1/affretia/tracking/eta/:orderId
 * Obtenir l'ETA predictif d'une commande
 */
router.get('/tracking/eta/:orderId', affretiaController.getETA);

/**
 * GET /api/v1/affretia/tracking/:trackingId/alerts
 * Obtenir les alertes actives d'un tracking
 */
router.get('/tracking/:trackingId/alerts', affretiaController.getTrackingAlerts);

/**
 * PUT /api/v1/affretia/tracking/alerts/:alertId/acknowledge
 * Reconnaitre une alerte
 */
router.put('/tracking/alerts/:alertId/acknowledge', affretiaController.acknowledgeAlert);

/**
 * PUT /api/v1/affretia/tracking/alerts/:alertId/resolve
 * Resoudre une alerte
 */
router.put('/tracking/alerts/:alertId/resolve', affretiaController.resolveAlert);

/**
 * GET /api/v1/affretia/tracking/levels
 * Obtenir les niveaux de tracking disponibles
 */
router.get('/tracking/levels', affretiaController.getTrackingLevels);

// ==================== BLACKLIST ====================

/**
 * GET /api/v1/affretia/blacklist
 * Liste des transporteurs blacklistes
 */
router.get('/blacklist', affretiaController.getBlacklist);

/**
 * POST /api/v1/affretia/blacklist
 * Ajouter un transporteur a la blacklist
 */
router.post('/blacklist', affretiaController.addToBlacklist);

/**
 * DELETE /api/v1/affretia/blacklist/:carrierId
 * Retirer un transporteur de la blacklist
 */
router.delete('/blacklist/:carrierId', affretiaController.removeFromBlacklist);

/**
 * GET /api/v1/affretia/blacklist/:carrierId
 * Verifier si un transporteur est blackliste
 */
router.get('/blacklist/:carrierId', affretiaController.checkBlacklist);

module.exports = router;
