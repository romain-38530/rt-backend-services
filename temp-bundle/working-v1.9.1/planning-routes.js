/**
 * Module Planning Chargement & Livraison
 * Routes API
 * Version: 1.0.0
 */

const express = require('express');
const { ObjectId } = require('mongodb');
const { PlanningService } = require('./planning-service');
const { DriverCheckinService } = require('./driver-checkin-service');
const {
  SiteTypes,
  FlowTypes,
  TransportTypes,
  SlotStatus,
  RdvStatus
} = require('./planning-models');

// ============================================================================
// MIDDLEWARE D'AUTHENTIFICATION
// ============================================================================

const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }
  next();
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }
    next();
  };
};

// ============================================================================
// CREATION DU ROUTER
// ============================================================================

function createPlanningRoutes(db, eventEmitter = null) {
  const router = express.Router();
  const planningService = new PlanningService(db, eventEmitter);
  const checkinService = new DriverCheckinService(db, eventEmitter);

  // ========================================================================
  // ROUTES GESTION DES PLANNINGS DE SITE
  // ========================================================================

  /**
   * POST /planning/create
   * Creer un nouveau planning de site
   */
  router.post('/planning/create', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const sitePlanning = await planningService.createSitePlanning(req.body, req.user._id);

      res.status(201).json({
        success: true,
        message: 'Planning de site cree avec succes',
        data: {
          sitePlanningId: sitePlanning._id,
          siteId: sitePlanning.siteId,
          siteName: sitePlanning.site.name,
          docksCount: sitePlanning.docks.length
        }
      });
    } catch (error) {
      console.error('[Planning] Create error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /planning/update/:id
   * Mettre a jour un planning de site
   */
  router.put('/planning/update/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const sitePlanning = await planningService.updateSitePlanning(
        req.params.id,
        req.body,
        req.user._id
      );

      res.json({
        success: true,
        message: 'Planning mis a jour',
        data: sitePlanning
      });
    } catch (error) {
      console.error('[Planning] Update error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /planning/view/:id
   * Obtenir un planning de site
   */
  router.get('/planning/view/:id', requireAuth, async (req, res) => {
    try {
      const sitePlanning = await planningService.getSitePlanning(req.params.id);

      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Planning non trouve'
        });
      }

      res.json({
        success: true,
        data: sitePlanning
      });
    } catch (error) {
      console.error('[Planning] View error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /planning/list
   * Lister les plannings d'une organisation
   */
  router.get('/planning/list', requireAuth, async (req, res) => {
    try {
      const filters = {
        status: req.query.status,
        siteType: req.query.siteType
      };

      const plannings = await planningService.listSitePlannings(
        req.user.organizationId,
        filters
      );

      res.json({
        success: true,
        data: plannings,
        count: plannings.length
      });
    } catch (error) {
      console.error('[Planning] List error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /planning/generate-slots/:id
   * Generer les creneaux pour une periode
   */
  router.post('/planning/generate-slots/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { startDate, days } = req.body;
      const count = await planningService.generateSlotsForPeriod(
        req.params.id,
        startDate ? new Date(startDate) : new Date(),
        days || 14
      );

      res.json({
        success: true,
        message: `${count} creneaux generes`,
        data: { slotsGenerated: count }
      });
    } catch (error) {
      console.error('[Planning] Generate slots error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES GESTION DES CRENEAUX
  // ========================================================================

  /**
   * GET /slots/available
   * Rechercher les creneaux disponibles
   */
  router.get('/slots/available', requireAuth, async (req, res) => {
    try {
      const criteria = {
        sitePlanningId: req.query.sitePlanningId,
        siteId: req.query.siteId,
        date: req.query.date,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        flowType: req.query.flowType,
        transportType: req.query.transportType,
        dockId: req.query.dockId
      };

      const slots = await planningService.findAvailableSlots(criteria);

      res.json({
        success: true,
        data: slots,
        count: slots.length
      });
    } catch (error) {
      console.error('[Slots] Available error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /slots/block/:id
   * Bloquer un creneau
   */
  router.post('/slots/block/:id', requireAuth, requireRole('admin', 'manager'), async (req, res) => {
    try {
      await planningService.blockSlot(req.params.id, req.body.reason, req.user._id);

      res.json({
        success: true,
        message: 'Creneau bloque'
      });
    } catch (error) {
      console.error('[Slots] Block error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /slots/calendar/:sitePlanningId
   * Vue calendrier des creneaux
   */
  router.get('/slots/calendar/:sitePlanningId', requireAuth, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const slots = await planningService.findAvailableSlots({
        sitePlanningId: req.params.sitePlanningId,
        dateFrom: startDate || new Date(),
        dateTo: endDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      });

      // Grouper par date
      const calendar = {};
      slots.forEach(slot => {
        const dateKey = slot.date.toISOString().split('T')[0];
        if (!calendar[dateKey]) {
          calendar[dateKey] = [];
        }
        calendar[dateKey].push({
          slotId: slot._id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          dockId: slot.dockId,
          dockName: slot.dockName,
          available: slot.available,
          status: slot.status,
          constraints: slot.constraints
        });
      });

      res.json({
        success: true,
        data: calendar
      });
    } catch (error) {
      console.error('[Slots] Calendar error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES GESTION DES RDV
  // ========================================================================

  /**
   * POST /rdv/request
   * Demander un RDV (transporteur)
   */
  router.post('/rdv/request', requireAuth, async (req, res) => {
    try {
      const carrierId = req.body.carrierId || req.user.carrierId || req.user._id;
      const rdv = await planningService.requestRdv(req.body, carrierId);

      res.status(201).json({
        success: true,
        message: rdv.status === RdvStatus.CONFIRMED
          ? 'RDV confirme automatiquement (Auto-RDV)'
          : 'Demande de RDV enregistree',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status,
          slot: rdv.slot,
          autoRdv: rdv.status === RdvStatus.CONFIRMED
        }
      });
    } catch (error) {
      console.error('[RDV] Request error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /rdv/propose/:id
   * Proposer un creneau alternatif (site)
   */
  router.post('/rdv/propose/:id', requireAuth, requireRole('admin', 'manager', 'dispatcher'), async (req, res) => {
    try {
      const { newSlotId, reason } = req.body;
      const rdv = await planningService.proposeAlternativeSlot(
        req.params.id,
        newSlotId,
        reason,
        req.user._id
      );

      res.json({
        success: true,
        message: 'Proposition de creneau alternatif envoyee',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status,
          proposedSlot: rdv.slot
        }
      });
    } catch (error) {
      console.error('[RDV] Propose error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /rdv/confirm/:id
   * Confirmer un RDV
   */
  router.post('/rdv/confirm/:id', requireAuth, async (req, res) => {
    try {
      const isCarrier = req.user.role === 'carrier' || req.user.role === 'driver';
      const rdv = await planningService.confirmRdv(req.params.id, req.user._id, isCarrier);

      res.json({
        success: true,
        message: 'RDV confirme',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status,
          confirmedAt: rdv.workflow.confirmedAt
        }
      });
    } catch (error) {
      console.error('[RDV] Confirm error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /rdv/refuse/:id
   * Refuser un RDV
   */
  router.post('/rdv/refuse/:id', requireAuth, async (req, res) => {
    try {
      const { reason } = req.body;
      const rdv = await planningService.refuseRdv(req.params.id, reason, req.user._id);

      res.json({
        success: true,
        message: 'RDV refuse',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status
        }
      });
    } catch (error) {
      console.error('[RDV] Refuse error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * PUT /rdv/reschedule/:id
   * Replanifier un RDV
   */
  router.put('/rdv/reschedule/:id', requireAuth, async (req, res) => {
    try {
      const { newSlotId, reason } = req.body;
      const rdv = await planningService.rescheduleRdv(
        req.params.id,
        newSlotId,
        reason,
        req.user._id
      );

      res.json({
        success: true,
        message: 'RDV replanifie',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status,
          newSlot: rdv.slot
        }
      });
    } catch (error) {
      console.error('[RDV] Reschedule error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /rdv/cancel/:id
   * Annuler un RDV
   */
  router.post('/rdv/cancel/:id', requireAuth, async (req, res) => {
    try {
      const { reason } = req.body;
      const rdv = await planningService.cancelRdv(req.params.id, reason, req.user._id);

      res.json({
        success: true,
        message: 'RDV annule',
        data: {
          rdvId: rdv._id,
          rdvNumber: rdv.rdvNumber,
          status: rdv.status
        }
      });
    } catch (error) {
      console.error('[RDV] Cancel error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /rdv/:id
   * Obtenir les details d'un RDV
   */
  router.get('/rdv/:id', requireAuth, async (req, res) => {
    try {
      const rdv = await planningService.getRdv(req.params.id);

      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: 'RDV non trouve'
        });
      }

      res.json({
        success: true,
        data: rdv
      });
    } catch (error) {
      console.error('[RDV] Get error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /rdv/list
   * Lister les RDV
   */
  router.get('/rdv/list', requireAuth, async (req, res) => {
    try {
      const filters = {
        organizationId: req.query.organizationId || req.user.organizationId,
        sitePlanningId: req.query.sitePlanningId,
        carrierId: req.query.carrierId,
        transportOrderId: req.query.transportOrderId,
        status: req.query.status,
        date: req.query.date,
        dateFrom: req.query.dateFrom,
        dateTo: req.query.dateTo,
        limit: parseInt(req.query.limit) || 100,
        skip: parseInt(req.query.skip) || 0
      };

      // Si transporteur, filtrer sur son ID
      if (req.user.role === 'carrier') {
        filters.carrierId = req.user.carrierId || req.user._id;
      }

      const rdvs = await planningService.listRdvs(filters);

      res.json({
        success: true,
        data: rdvs,
        count: rdvs.length,
        filters
      });
    } catch (error) {
      console.error('[RDV] List error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /rdv/by-order/:transportOrderId
   * Obtenir les RDV d'une commande de transport
   */
  router.get('/rdv/by-order/:transportOrderId', requireAuth, async (req, res) => {
    try {
      const rdvs = await planningService.listRdvs({
        transportOrderId: req.params.transportOrderId
      });

      res.json({
        success: true,
        data: rdvs,
        count: rdvs.length
      });
    } catch (error) {
      console.error('[RDV] By order error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES CHECK-IN CHAUFFEUR (BORNE VIRTUELLE)
  // ========================================================================

  /**
   * POST /driver/approaching
   * Signaler l'approche du chauffeur (via geofence)
   */
  router.post('/driver/approaching', requireAuth, async (req, res) => {
    try {
      const { rdvId, coordinates } = req.body;
      const result = await checkinService.driverApproaching(rdvId, coordinates);

      res.json({
        success: true,
        message: 'Approche signalee',
        data: result
      });
    } catch (error) {
      console.error('[Driver] Approaching error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /driver/checkin
   * Check-in du chauffeur
   */
  router.post('/driver/checkin', requireAuth, async (req, res) => {
    try {
      const { rdvId, mode, coordinates, qrCode } = req.body;
      const result = await checkinService.driverCheckIn(rdvId, {
        mode,
        coordinates,
        qrCode,
        driverId: req.user._id
      });

      res.json({
        success: true,
        message: 'Check-in effectue',
        data: result
      });
    } catch (error) {
      console.error('[Driver] Check-in error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /driver/at-dock
   * Signaler l'arrivee au quai
   */
  router.post('/driver/at-dock', requireAuth, async (req, res) => {
    try {
      const { rdvId, dockId } = req.body;
      const result = await checkinService.driverAtDock(rdvId, dockId);

      res.json({
        success: true,
        message: 'Arrivee au quai enregistree',
        data: result
      });
    } catch (error) {
      console.error('[Driver] At dock error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /driver/checkout
   * Check-out du chauffeur
   */
  router.post('/driver/checkout', requireAuth, async (req, res) => {
    try {
      const { rdvId, remarks, issues } = req.body;
      const result = await checkinService.driverCheckOut(rdvId, { remarks, issues });

      res.json({
        success: true,
        message: 'Check-out effectue',
        data: result
      });
    } catch (error) {
      console.error('[Driver] Check-out error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /driver/status/:rdvId
   * Obtenir le statut du chauffeur
   */
  router.get('/driver/status/:rdvId', requireAuth, async (req, res) => {
    try {
      const status = await checkinService.getDriverStatus(req.params.rdvId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('[Driver] Status error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /driver/queue/:sitePlanningId
   * Obtenir la file d'attente des chauffeurs
   */
  router.get('/driver/queue/:sitePlanningId', requireAuth, async (req, res) => {
    try {
      const queue = await checkinService.getDriverQueue(req.params.sitePlanningId);

      res.json({
        success: true,
        data: queue
      });
    } catch (error) {
      console.error('[Driver] Queue error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /driver/call-next
   * Appeler le prochain chauffeur
   */
  router.post('/driver/call-next', requireAuth, requireRole('admin', 'manager', 'operator'), async (req, res) => {
    try {
      const { sitePlanningId, dockId } = req.body;
      const result = await checkinService.callNextDriver(sitePlanningId, dockId);

      res.json({
        success: true,
        message: result ? 'Chauffeur appele' : 'Pas de chauffeur en attente',
        data: result
      });
    } catch (error) {
      console.error('[Driver] Call next error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /driver/no-show/:rdvId
   * Marquer un chauffeur comme absent
   */
  router.post('/driver/no-show/:rdvId', requireAuth, requireRole('admin', 'manager', 'operator'), async (req, res) => {
    try {
      const result = await checkinService.markNoShow(req.params.rdvId, req.user._id);

      res.json({
        success: true,
        message: 'Chauffeur marque comme absent',
        data: result
      });
    } catch (error) {
      console.error('[Driver] No-show error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES OPERATION (CHARGEMENT/DECHARGEMENT)
  // ========================================================================

  /**
   * POST /operation/start/:rdvId
   * Demarrer l'operation de chargement/dechargement
   */
  router.post('/operation/start/:rdvId', requireAuth, async (req, res) => {
    try {
      const result = await checkinService.startOperation(req.params.rdvId);

      res.json({
        success: true,
        message: 'Operation demarree',
        data: result
      });
    } catch (error) {
      console.error('[Operation] Start error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /operation/complete/:rdvId
   * Terminer l'operation de chargement/dechargement
   */
  router.post('/operation/complete/:rdvId', requireAuth, async (req, res) => {
    try {
      const { actualWeight, actualPallets, remarks, photos, issues } = req.body;
      const result = await checkinService.completeOperation(req.params.rdvId, {
        actualWeight,
        actualPallets,
        remarks,
        photos,
        issues
      });

      res.json({
        success: true,
        message: 'Operation terminee',
        data: result
      });
    } catch (error) {
      console.error('[Operation] Complete error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES SIGNATURE ELECTRONIQUE (eCMR)
  // ========================================================================

  /**
   * POST /ecmr/sign/:rdvId
   * Signer le document eCMR
   */
  router.post('/ecmr/sign/:rdvId', requireAuth, async (req, res) => {
    try {
      const { signatureData, signerName, signerRole } = req.body;
      const result = await checkinService.signEcmr(req.params.rdvId, {
        signatureData,
        signerName,
        signerRole,
        signerId: req.user._id
      });

      res.json({
        success: true,
        message: 'Document signe',
        data: result
      });
    } catch (error) {
      console.error('[eCMR] Sign error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /ecmr/validate/:rdvId
   * Valider le document eCMR
   */
  router.post('/ecmr/validate/:rdvId', requireAuth, requireRole('admin', 'manager', 'operator'), async (req, res) => {
    try {
      const result = await checkinService.validateEcmr(req.params.rdvId, req.user._id);

      res.json({
        success: true,
        message: 'Document valide',
        data: result
      });
    } catch (error) {
      console.error('[eCMR] Validate error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /ecmr/download/:rdvId
   * Telecharger le document eCMR
   */
  router.get('/ecmr/download/:rdvId', requireAuth, async (req, res) => {
    try {
      const document = await checkinService.getEcmrDocument(req.params.rdvId);

      if (!document) {
        return res.status(404).json({
          success: false,
          error: 'Document non trouve'
        });
      }

      res.json({
        success: true,
        data: document
      });
    } catch (error) {
      console.error('[eCMR] Download error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /ecmr/history/:transportOrderId
   * Historique des documents eCMR d'une commande
   */
  router.get('/ecmr/history/:transportOrderId', requireAuth, async (req, res) => {
    try {
      const history = await checkinService.getEcmrHistory(req.params.transportOrderId);

      res.json({
        success: true,
        data: history,
        count: history.length
      });
    } catch (error) {
      console.error('[eCMR] History error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES STATISTIQUES
  // ========================================================================

  /**
   * GET /stats/site/:sitePlanningId
   * Statistiques d'un site
   */
  router.get('/stats/site/:sitePlanningId', requireAuth, async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const stats = await planningService.getSiteStats(
        req.params.sitePlanningId,
        dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dateTo || new Date()
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[Stats] Site error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /stats/carrier/:carrierId
   * Statistiques d'un transporteur
   */
  router.get('/stats/carrier/:carrierId', requireAuth, async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      const rdvs = await planningService.listRdvs({
        carrierId: req.params.carrierId,
        dateFrom: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dateTo: dateTo || new Date()
      });

      const stats = {
        total: rdvs.length,
        completed: rdvs.filter(r => r.status === RdvStatus.COMPLETED).length,
        noShows: rdvs.filter(r => r.status === RdvStatus.NO_SHOW).length,
        cancelled: rdvs.filter(r => r.status === RdvStatus.CANCELLED).length,
        avgWaitTime: rdvs
          .filter(r => r.checkIn?.waitTime)
          .reduce((sum, r) => sum + r.checkIn.waitTime, 0) / (rdvs.filter(r => r.checkIn?.waitTime).length || 1)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('[Stats] Carrier error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // ROUTES INTEGRATION TRACKING IA
  // ========================================================================

  /**
   * POST /tracking/early-arrival
   * Gerer une arrivee anticipee detectee par le tracking
   */
  router.post('/tracking/early-arrival', requireAuth, async (req, res) => {
    try {
      const { rdvId, etaMinutes } = req.body;
      const result = await planningService.handleEarlyArrival(rdvId, etaMinutes);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Tracking] Early arrival error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /tracking/delay
   * Gerer un retard detecte par le tracking
   */
  router.post('/tracking/delay', requireAuth, async (req, res) => {
    try {
      const { rdvId, delayMinutes } = req.body;
      const result = await planningService.handleDelay(rdvId, delayMinutes);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('[Tracking] Delay error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // ========================================================================
  // AI OPTIMIZATION ENDPOINTS
  // ========================================================================

  /**
   * POST /ai/optimize-slots
   * Optimisation IA de l'allocation des créneaux RDV
   */
  router.post('/ai/optimize-slots', async (req, res) => {
    try {
      const { sitePlanningId, rdvRequests, availableSlots, constraints } = req.body;

      if (!sitePlanningId || !rdvRequests || !availableSlots) {
        return res.status(400).json({
          success: false,
          error: 'sitePlanningId, rdvRequests et availableSlots requis'
        });
      }

      // Récupérer le site planning
      const sitePlanning = await planningService.getSitePlanning(sitePlanningId);
      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Site planning non trouvé'
        });
      }

      const result = await planningService.aiOptimizer.optimizeSlotAllocation(
        sitePlanning,
        rdvRequests,
        availableSlots,
        constraints || {}
      );

      if (!result.optimized) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          allocation: result.allocation,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Planning AI] Erreur optimize-slots:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /ai/resolve-conflicts
   * Résolution IA automatique des conflits de planning
   */
  router.post('/ai/resolve-conflicts', async (req, res) => {
    try {
      const { sitePlanningId, conflicts, allRdvs } = req.body;

      if (!sitePlanningId || !conflicts || !Array.isArray(conflicts)) {
        return res.status(400).json({
          success: false,
          error: 'sitePlanningId et conflicts (array) requis'
        });
      }

      const sitePlanning = await planningService.getSitePlanning(sitePlanningId);
      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Site planning non trouvé'
        });
      }

      const result = await planningService.aiOptimizer.resolveSchedulingConflicts(
        conflicts,
        sitePlanning,
        allRdvs || []
      );

      if (!result.resolved) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          solutions: result.solutions,
          priority: result.priority,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Planning AI] Erreur resolve-conflicts:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /ai/predict-bottlenecks
   * Prédiction IA des goulots d'étranglement futurs
   */
  router.post('/ai/predict-bottlenecks', async (req, res) => {
    try {
      const { sitePlanningId, historicalData, upcomingRdvs } = req.body;

      if (!sitePlanningId) {
        return res.status(400).json({
          success: false,
          error: 'sitePlanningId requis'
        });
      }

      const sitePlanning = await planningService.getSitePlanning(sitePlanningId);
      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Site planning non trouvé'
        });
      }

      const result = await planningService.aiOptimizer.predictBottlenecks(
        sitePlanning,
        historicalData || [],
        upcomingRdvs || []
      );

      if (!result.predicted) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          bottlenecks: result.bottlenecks,
          trends: result.trends,
          recommendations: result.recommendations,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Planning AI] Erreur predict-bottlenecks:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /ai/suggest-reorganization
   * Suggestion IA de réorganisation en cas de crise
   */
  router.post('/ai/suggest-reorganization', async (req, res) => {
    try {
      const { sitePlanningId, currentRdvs, issue } = req.body;

      if (!sitePlanningId || !issue) {
        return res.status(400).json({
          success: false,
          error: 'sitePlanningId et issue requis'
        });
      }

      const sitePlanning = await planningService.getSitePlanning(sitePlanningId);
      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Site planning non trouvé'
        });
      }

      const result = await planningService.aiOptimizer.suggestReorganization(
        sitePlanning,
        currentRdvs || [],
        issue
      );

      if (!result.suggested) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          reorganization: result.reorganization,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Planning AI] Erreur suggest-reorganization:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /ai/analyze-efficiency
   * Analyse IA de l'efficacité du planning
   */
  router.post('/ai/analyze-efficiency', async (req, res) => {
    try {
      const { sitePlanningId, rdvs, metrics } = req.body;

      if (!sitePlanningId || !metrics) {
        return res.status(400).json({
          success: false,
          error: 'sitePlanningId et metrics requis'
        });
      }

      const sitePlanning = await planningService.getSitePlanning(sitePlanningId);
      if (!sitePlanning) {
        return res.status(404).json({
          success: false,
          error: 'Site planning non trouvé'
        });
      }

      const result = await planningService.aiOptimizer.analyzePlanningEfficiency(
        sitePlanning,
        rdvs || [],
        metrics
      );

      if (!result.analyzed) {
        return res.status(503).json({
          success: false,
          error: 'Service IA non disponible',
          fallback: true
        });
      }

      res.json({
        success: true,
        data: {
          insights: result.insights,
          tokensUsed: result.tokensUsed
        }
      });

    } catch (error) {
      console.error('[Planning AI] Erreur analyze-efficiency:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * GET /ai/status
   * Statut du service IA Planning
   */
  router.get('/ai/status', (req, res) => {
    const stats = planningService.aiOptimizer.getStats();
    res.json({
      success: true,
      data: stats
    });
  });

  // ========================================================================
  // ROUTES TYPES ET REFERENCES
  // ========================================================================

  /**
   * GET /types
   * Obtenir tous les types et enumerations disponibles
   */
  router.get('/types', (req, res) => {
    res.json({
      success: true,
      data: {
        siteTypes: SiteTypes,
        flowTypes: FlowTypes,
        transportTypes: TransportTypes,
        slotStatus: SlotStatus,
        rdvStatus: RdvStatus
      }
    });
  });

  return router;
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = { createPlanningRoutes };
