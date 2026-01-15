/**
 * SYMPHONI.A - Logisticien Portal Routes
 * API pour le portail logisticien (gratuit, couvert par abonnement industriel)
 *
 * Fonctionnalites:
 * - Authentification logisticien
 * - Acces aux commandes (filtrees par entrepot)
 * - Planning des quais
 * - Gestion des RDV
 * - Acces e-CMR (signature expediteur/destinataire)
 * - Check-in chauffeurs
 * - Profil et documents
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const crypto = require('crypto');

// Configuration sécurisée JWT
// SECURITY: Ne jamais utiliser de fallback hardcodé en production
const getSecureJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      console.error('[SECURITY] FATAL: JWT_SECRET not set or too short in production');
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    const weakSecrets = ['secret', 'password', 'changeme', 'symphonia-logisticien-portal-secret-2024'];
    if (weakSecrets.some(ws => secret.toLowerCase().includes(ws.toLowerCase()))) {
      console.error('[SECURITY] FATAL: JWT_SECRET contains weak/default value');
      throw new Error('JWT_SECRET contains a weak/default value');
    }
  }
  // En développement, générer un secret temporaire avec avertissement
  if (!secret) {
    console.warn('[SECURITY] WARNING: JWT_SECRET not set - using temporary secret (DEV ONLY)');
    return 'dev-temp-' + crypto.randomBytes(32).toString('hex');
  }
  return secret;
};

const JWT_SECRET = getSecureJwtSecret();
const JWT_EXPIRY = '8h';

/**
 * Create Logisticien Portal Routes
 */
function createLogisticienPortalRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Helper: Get database
  const getDb = () => mongoClient.db();

  // ==================== MIDDLEWARE ====================

  /**
   * Middleware: Authenticate Logisticien Token
   */
  const authenticateLogisticien = async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Token requis' }
        });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.type !== 'logisticien') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Acces reserve aux logisticiens' }
        });
      }

      // Get logisticien from DB
      const db = getDb();
      const logisticien = await db.collection('logisticians').findOne({
        _id: new ObjectId(decoded.logisticianId)
      });

      if (!logisticien) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Logisticien non trouve' }
        });
      }

      if (logisticien.status === 'blocked' || logisticien.status === 'suspended') {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCOUNT_BLOCKED', message: 'Compte bloque ou suspendu' }
        });
      }

      req.logisticien = logisticien;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Token invalide ou expire' }
        });
      }
      console.error('Auth middleware error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  };

  // ==================== AUTHENTICATION ====================

  /**
   * POST /auth/login
   * Login logisticien
   */
  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Email et mot de passe requis' }
        });
      }

      const db = getDb();
      const logisticien = await db.collection('logisticians').findOne({
        email: email.toLowerCase()
      });

      if (!logisticien) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }
        });
      }

      if (logisticien.status === 'invited' || logisticien.status === 'onboarding') {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCOUNT_NOT_ACTIVE', message: 'Compte non active. Completez l\'onboarding.' }
        });
      }

      if (logisticien.status === 'blocked' || logisticien.status === 'suspended') {
        return res.status(403).json({
          success: false,
          error: { code: 'ACCOUNT_BLOCKED', message: 'Compte bloque ou suspendu' }
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, logisticien.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Email ou mot de passe incorrect' }
        });
      }

      // Generate token
      const token = jwt.sign({
        logisticianId: logisticien._id.toString(),
        email: logisticien.email,
        companyName: logisticien.companyName,
        type: 'logisticien'
      }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

      // Update last login
      await db.collection('logisticians').updateOne(
        { _id: logisticien._id },
        { $set: { lastLogin: new Date() } }
      );

      res.json({
        success: true,
        data: {
          token,
          expiresIn: JWT_EXPIRY,
          logisticien: {
            id: logisticien._id,
            email: logisticien.email,
            companyName: logisticien.companyName,
            siret: logisticien.siret,
            status: logisticien.status,
            vigilanceStatus: logisticien.vigilanceStatus,
            warehouses: logisticien.warehouses || [],
            industrialClients: (logisticien.industrialClients || []).filter(c => c.status === 'active'),
            subscription: logisticien.subscription
          }
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /auth/refresh
   * Refresh token
   */
  router.post('/auth/refresh', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;

      const token = jwt.sign({
        logisticianId: logisticien._id.toString(),
        email: logisticien.email,
        companyName: logisticien.companyName,
        type: 'logisticien'
      }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

      res.json({
        success: true,
        data: { token, expiresIn: JWT_EXPIRY }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== ORDERS (Filtered by Warehouse) ====================

  /**
   * GET /orders
   * List orders where pickup OR delivery is at logisticien's warehouse
   */
  router.get('/orders', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { status, industrialId, dateFrom, dateTo, warehouseId, limit = 50, skip = 0 } = req.query;

      // Get warehouse IDs for this logisticien
      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      if (warehouseIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          message: 'Aucun entrepot configure'
        });
      }

      // Get active industrial client IDs
      const activeIndustrialIds = (logisticien.industrialClients || [])
        .filter(c => c.status === 'active')
        .map(c => c.industrialId);

      if (activeIndustrialIds.length === 0) {
        return res.json({
          success: true,
          data: [],
          total: 0,
          message: 'Aucun client industriel actif'
        });
      }

      const db = getDb();

      // Build query
      const query = {
        // Order from linked industrial
        industrialId: { $in: activeIndustrialIds.map(id => new ObjectId(id)) },
        // Pickup OR Delivery at logisticien's warehouse
        $or: [
          { 'pickup.warehouseId': { $in: warehouseIds } },
          { 'delivery.warehouseId': { $in: warehouseIds } }
        ]
      };

      // Optional filters
      if (status) {
        query.status = status;
      }
      if (industrialId && activeIndustrialIds.includes(industrialId)) {
        query.industrialId = new ObjectId(industrialId);
      }
      if (warehouseId && warehouseIds.includes(warehouseId)) {
        query.$or = [
          { 'pickup.warehouseId': warehouseId },
          { 'delivery.warehouseId': warehouseId }
        ];
      }
      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const [orders, total] = await Promise.all([
        db.collection('transport_orders')
          .find(query)
          .sort({ createdAt: -1 })
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray(),
        db.collection('transport_orders').countDocuments(query)
      ]);

      // Add role info (is logisticien sender or receiver?)
      const enrichedOrders = orders.map(order => ({
        ...order,
        logisticienRole: {
          isSender: warehouseIds.includes(order.pickup?.warehouseId),
          isReceiver: warehouseIds.includes(order.delivery?.warehouseId),
          warehouseId: warehouseIds.includes(order.pickup?.warehouseId)
            ? order.pickup?.warehouseId
            : order.delivery?.warehouseId
        }
      }));

      res.json({
        success: true,
        data: enrichedOrders,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      });
    } catch (error) {
      console.error('List orders error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /orders/:orderId
   * Get order details (only if visible to logisticien)
   */
  router.get('/orders/:orderId', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { orderId } = req.params;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);
      const activeIndustrialIds = (logisticien.industrialClients || [])
        .filter(c => c.status === 'active')
        .map(c => c.industrialId.toString());

      const db = getDb();
      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId)
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Commande non trouvee' }
        });
      }

      // Check access
      const isFromLinkedIndustrial = activeIndustrialIds.includes(order.industrialId?.toString());
      const isAtWarehouse = warehouseIds.includes(order.pickup?.warehouseId) ||
                           warehouseIds.includes(order.delivery?.warehouseId);

      if (!isFromLinkedIndustrial || !isAtWarehouse) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Acces non autorise a cette commande' }
        });
      }

      // Add role info
      order.logisticienRole = {
        isSender: warehouseIds.includes(order.pickup?.warehouseId),
        isReceiver: warehouseIds.includes(order.delivery?.warehouseId),
        warehouseId: warehouseIds.includes(order.pickup?.warehouseId)
          ? order.pickup?.warehouseId
          : order.delivery?.warehouseId
      };

      res.json({
        success: true,
        data: order
      });
    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== PLANNING & RDV ====================

  /**
   * GET /planning/:warehouseId
   * Get dock planning for a warehouse
   */
  router.get('/planning/:warehouseId', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { warehouseId } = req.params;
      const { date, weekStart } = req.query;

      // Check warehouse belongs to logisticien
      const warehouse = (logisticien.warehouses || []).find(w => w.warehouseId === warehouseId);
      if (!warehouse) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Entrepot non autorise' }
        });
      }

      const db = getDb();

      // Get site planning
      const sitePlanning = await db.collection('site_plannings').findOne({
        warehouseId: warehouseId
      });

      if (!sitePlanning) {
        return res.json({
          success: true,
          data: {
            warehouse,
            planning: null,
            message: 'Aucun planning configure pour cet entrepot'
          }
        });
      }

      // Build date range
      let startDate, endDate;
      if (weekStart) {
        startDate = new Date(weekStart);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 7);
      } else if (date) {
        startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setDate(endDate.getDate() + 7);
      }

      // Get slots and RDVs
      const [slots, rdvs] = await Promise.all([
        db.collection('planning_slots').find({
          sitePlanningId: sitePlanning._id,
          startTime: { $gte: startDate, $lt: endDate }
        }).sort({ startTime: 1 }).toArray(),

        db.collection('rdv').find({
          sitePlanningId: sitePlanning._id,
          scheduledTime: { $gte: startDate, $lt: endDate },
          status: { $nin: ['cancelled', 'refused'] }
        }).sort({ scheduledTime: 1 }).toArray()
      ]);

      res.json({
        success: true,
        data: {
          warehouse,
          planning: sitePlanning,
          dateRange: { start: startDate, end: endDate },
          slots,
          rdvs,
          summary: {
            totalSlots: slots.length,
            availableSlots: slots.filter(s => s.status === 'available').length,
            bookedSlots: slots.filter(s => s.status === 'booked').length,
            totalRdvs: rdvs.length,
            confirmedRdvs: rdvs.filter(r => r.status === 'confirmed').length,
            pendingRdvs: rdvs.filter(r => r.status === 'requested' || r.status === 'proposed').length
          }
        }
      });
    } catch (error) {
      console.error('Get planning error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /slots/:warehouseId
   * Get available slots
   */
  router.get('/slots/:warehouseId', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { warehouseId } = req.params;
      const { date, dockId, status = 'available' } = req.query;

      const warehouse = (logisticien.warehouses || []).find(w => w.warehouseId === warehouseId);
      if (!warehouse) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Entrepot non autorise' }
        });
      }

      const db = getDb();

      const sitePlanning = await db.collection('site_plannings').findOne({ warehouseId });
      if (!sitePlanning) {
        return res.json({ success: true, data: [] });
      }

      const query = { sitePlanningId: sitePlanning._id };

      if (status) query.status = status;
      if (dockId) query.dockId = dockId;
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query.startTime = { $gte: startOfDay, $lte: endOfDay };
      }

      const slots = await db.collection('planning_slots')
        .find(query)
        .sort({ startTime: 1 })
        .toArray();

      res.json({
        success: true,
        data: slots
      });
    } catch (error) {
      console.error('Get slots error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /rdv/:rdvId/confirm
   * Confirm RDV (logisticien accepts proposed time)
   */
  router.post('/rdv/:rdvId/confirm', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { rdvId } = req.params;
      const { notes } = req.body;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const rdv = await db.collection('rdv').findOne({ _id: new ObjectId(rdvId) });

      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'RDV non trouve' }
        });
      }

      // Check warehouse
      if (!warehouseIds.includes(rdv.warehouseId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'RDV non autorise' }
        });
      }

      // Update RDV
      await db.collection('rdv').updateOne(
        { _id: rdv._id },
        {
          $set: {
            status: 'confirmed',
            confirmedAt: new Date(),
            confirmedBy: {
              type: 'logisticien',
              id: logisticien._id,
              name: logisticien.companyName
            },
            notes: notes || rdv.notes,
            updatedAt: new Date()
          }
        }
      );

      // Log event
      await db.collection('logistician_events').insertOne({
        logisticianId: logisticien._id,
        type: 'rdv_confirmed',
        payload: { rdvId: rdv._id, transportOrderId: rdv.transportOrderId },
        triggeredBy: { type: 'logisticien', id: logisticien._id, name: logisticien.companyName },
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'RDV confirme'
      });
    } catch (error) {
      console.error('Confirm RDV error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /rdv/:rdvId/propose-alternative
   * Propose alternative slot
   */
  router.post('/rdv/:rdvId/propose-alternative', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { rdvId } = req.params;
      const { alternativeSlotId, alternativeTime, reason } = req.body;

      if (!alternativeSlotId && !alternativeTime) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'alternativeSlotId ou alternativeTime requis' }
        });
      }

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const rdv = await db.collection('rdv').findOne({ _id: new ObjectId(rdvId) });

      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'RDV non trouve' }
        });
      }

      if (!warehouseIds.includes(rdv.warehouseId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'RDV non autorise' }
        });
      }

      // Update RDV with alternative
      await db.collection('rdv').updateOne(
        { _id: rdv._id },
        {
          $set: {
            status: 'proposed',
            proposedAlternative: {
              slotId: alternativeSlotId ? new ObjectId(alternativeSlotId) : null,
              time: alternativeTime ? new Date(alternativeTime) : null,
              reason: reason || null,
              proposedAt: new Date(),
              proposedBy: {
                type: 'logisticien',
                id: logisticien._id,
                name: logisticien.companyName
              }
            },
            updatedAt: new Date()
          }
        }
      );

      res.json({
        success: true,
        message: 'Alternative proposee'
      });
    } catch (error) {
      console.error('Propose alternative error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== E-CMR ====================

  /**
   * GET /ecmr
   * List e-CMR where logisticien is sender or consignee
   */
  router.get('/ecmr', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { status, role, limit = 50, skip = 0 } = req.query;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);
      const activeIndustrialIds = (logisticien.industrialClients || [])
        .filter(c => c.status === 'active')
        .map(c => c.industrialId.toString());

      const db = getDb();

      // Build query: e-CMR where sender OR consignee is at logisticien's warehouse
      const query = {
        $or: [
          { 'sender.warehouseId': { $in: warehouseIds } },
          { 'consignee.warehouseId': { $in: warehouseIds } }
        ]
      };

      if (status) query.status = status;
      if (role === 'sender') {
        query.$or = [{ 'sender.warehouseId': { $in: warehouseIds } }];
      } else if (role === 'consignee') {
        query.$or = [{ 'consignee.warehouseId': { $in: warehouseIds } }];
      }

      const [ecmrs, total] = await Promise.all([
        db.collection('ecmr')
          .find(query)
          .sort({ createdAt: -1 })
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray(),
        db.collection('ecmr').countDocuments(query)
      ]);

      // Add role info
      const enrichedEcmrs = ecmrs.map(ecmr => ({
        ...ecmr,
        logisticienRole: {
          isSender: warehouseIds.includes(ecmr.sender?.warehouseId),
          isConsignee: warehouseIds.includes(ecmr.consignee?.warehouseId)
        }
      }));

      res.json({
        success: true,
        data: enrichedEcmrs,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      });
    } catch (error) {
      console.error('List e-CMR error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /ecmr/:ecmrId
   * Get e-CMR details
   */
  router.get('/ecmr/:ecmrId', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { ecmrId } = req.params;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const ecmr = await db.collection('ecmr').findOne({ _id: new ObjectId(ecmrId) });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'e-CMR non trouvee' }
        });
      }

      // Check access
      const isSender = warehouseIds.includes(ecmr.sender?.warehouseId);
      const isConsignee = warehouseIds.includes(ecmr.consignee?.warehouseId);

      if (!isSender && !isConsignee) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Acces non autorise a cette e-CMR' }
        });
      }

      ecmr.logisticienRole = { isSender, isConsignee };

      res.json({
        success: true,
        data: ecmr
      });
    } catch (error) {
      console.error('Get e-CMR error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /ecmr/:ecmrId/sign
   * Sign e-CMR as sender or consignee
   */
  router.post('/ecmr/:ecmrId/sign', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { ecmrId } = req.params;
      const { signatureData, role, remarks, geolocation } = req.body;

      if (!signatureData) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'signatureData requis' }
        });
      }

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const ecmr = await db.collection('ecmr').findOne({ _id: new ObjectId(ecmrId) });

      if (!ecmr) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'e-CMR non trouvee' }
        });
      }

      // Determine role
      const isSender = warehouseIds.includes(ecmr.sender?.warehouseId);
      const isConsignee = warehouseIds.includes(ecmr.consignee?.warehouseId);

      let signatureRole = role;
      if (!signatureRole) {
        if (isSender && !isConsignee) signatureRole = 'sender';
        else if (isConsignee && !isSender) signatureRole = 'consignee';
        else {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_INPUT', message: 'role requis (sender ou consignee)' }
          });
        }
      }

      // Validate role
      if (signatureRole === 'sender' && !isSender) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Non autorise a signer en tant qu\'expediteur' }
        });
      }
      if (signatureRole === 'consignee' && !isConsignee) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Non autorise a signer en tant que destinataire' }
        });
      }

      // Build signature update
      const signatureField = signatureRole === 'sender' ? 'senderSignature' : 'consigneeSignature';
      const now = new Date();

      const update = {
        $set: {
          [signatureField]: {
            data: signatureData,
            signedAt: now,
            signedBy: {
              type: 'logisticien',
              id: logisticien._id,
              name: logisticien.companyName,
              email: logisticien.email
            },
            geolocation: geolocation || null,
            ipAddress: req.ip
          },
          updatedAt: now
        }
      };

      if (remarks) {
        const remarksField = signatureRole === 'sender' ? 'loadingRemarks' : 'deliveryRemarks';
        update.$push = { [remarksField]: { text: remarks, addedAt: now, addedBy: logisticien.companyName } };
      }

      // Update status if both signatures complete
      if (signatureRole === 'consignee') {
        update.$set.status = 'DELIVERED';
        update.$set.deliveredAt = now;
      } else if (signatureRole === 'sender' && !ecmr.senderSignature) {
        update.$set.status = 'IN_TRANSIT';
      }

      await db.collection('ecmr').updateOne({ _id: ecmr._id }, update);

      // Log event
      await db.collection('logistician_events').insertOne({
        logisticianId: logisticien._id,
        type: 'ecmr_signed',
        payload: { ecmrId: ecmr._id, role: signatureRole },
        triggeredBy: { type: 'logisticien', id: logisticien._id, name: logisticien.companyName },
        timestamp: now
      });

      res.json({
        success: true,
        message: `e-CMR signee en tant que ${signatureRole === 'sender' ? 'expediteur' : 'destinataire'}`
      });
    } catch (error) {
      console.error('Sign e-CMR error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== DRIVER CHECK-IN ====================

  /**
   * GET /checkins/:warehouseId
   * List drivers waiting/arrived at warehouse
   */
  router.get('/checkins/:warehouseId', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { warehouseId } = req.params;
      const { status } = req.query;

      const warehouse = (logisticien.warehouses || []).find(w => w.warehouseId === warehouseId);
      if (!warehouse) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Entrepot non autorise' }
        });
      }

      const db = getDb();

      const query = {
        warehouseId,
        'driverCheckin.status': { $in: ['approaching', 'arrived', 'at_dock'] }
      };

      if (status) {
        query['driverCheckin.status'] = status;
      }

      const checkins = await db.collection('rdv')
        .find(query)
        .sort({ 'driverCheckin.arrivedAt': 1 })
        .toArray();

      res.json({
        success: true,
        data: checkins.map(rdv => ({
          rdvId: rdv._id,
          transportOrderId: rdv.transportOrderId,
          scheduledTime: rdv.scheduledTime,
          driverCheckin: rdv.driverCheckin,
          carrier: rdv.carrier,
          dockId: rdv.dockId
        }))
      });
    } catch (error) {
      console.error('List checkins error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /checkin/:rdvId/validate
   * Validate driver arrival
   */
  router.post('/checkin/:rdvId/validate', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { rdvId } = req.params;
      const { notes } = req.body;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const rdv = await db.collection('rdv').findOne({ _id: new ObjectId(rdvId) });

      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'RDV non trouve' }
        });
      }

      if (!warehouseIds.includes(rdv.warehouseId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'RDV non autorise' }
        });
      }

      await db.collection('rdv').updateOne(
        { _id: rdv._id },
        {
          $set: {
            'driverCheckin.status': 'validated',
            'driverCheckin.validatedAt': new Date(),
            'driverCheckin.validatedBy': {
              type: 'logisticien',
              id: logisticien._id,
              name: logisticien.companyName
            },
            'driverCheckin.notes': notes || null,
            updatedAt: new Date()
          }
        }
      );

      res.json({
        success: true,
        message: 'Arrivee chauffeur validee'
      });
    } catch (error) {
      console.error('Validate checkin error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /checkin/:rdvId/assign-dock
   * Assign dock to driver
   */
  router.post('/checkin/:rdvId/assign-dock', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { rdvId } = req.params;
      const { dockId } = req.body;

      if (!dockId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'dockId requis' }
        });
      }

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);

      const db = getDb();
      const rdv = await db.collection('rdv').findOne({ _id: new ObjectId(rdvId) });

      if (!rdv) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'RDV non trouve' }
        });
      }

      if (!warehouseIds.includes(rdv.warehouseId)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'RDV non autorise' }
        });
      }

      await db.collection('rdv').updateOne(
        { _id: rdv._id },
        {
          $set: {
            dockId: dockId,
            'driverCheckin.status': 'at_dock',
            'driverCheckin.dockAssignedAt': new Date(),
            'driverCheckin.dockAssignedBy': {
              type: 'logisticien',
              id: logisticien._id,
              name: logisticien.companyName
            },
            updatedAt: new Date()
          }
        }
      );

      res.json({
        success: true,
        message: `Quai ${dockId} assigne`
      });
    } catch (error) {
      console.error('Assign dock error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  // ==================== PROFILE ====================

  /**
   * GET /profile
   * Get logisticien profile
   */
  router.get('/profile', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;

      // Remove sensitive data
      const profile = {
        id: logisticien._id,
        email: logisticien.email,
        companyName: logisticien.companyName,
        siret: logisticien.siret,
        vatNumber: logisticien.vatNumber,
        phone: logisticien.phone,
        address: logisticien.address,
        status: logisticien.status,
        vigilanceStatus: logisticien.vigilanceStatus,
        warehouses: logisticien.warehouses || [],
        industrialClients: (logisticien.industrialClients || []).map(c => ({
          industrialId: c.industrialId,
          industrialName: c.industrialName,
          status: c.status,
          activatedAt: c.activatedAt
        })),
        subscription: logisticien.subscription,
        score: logisticien.score,
        createdAt: logisticien.createdAt,
        lastLogin: logisticien.lastLogin
      };

      res.json({
        success: true,
        data: profile
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * PUT /profile
   * Update profile
   */
  router.put('/profile', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { phone, address, contacts } = req.body;

      const db = getDb();
      const updateFields = { updatedAt: new Date() };

      if (phone) updateFields.phone = phone;
      if (address) updateFields.address = address;
      if (contacts) updateFields.contacts = contacts;

      await db.collection('logisticians').updateOne(
        { _id: logisticien._id },
        { $set: updateFields }
      );

      res.json({
        success: true,
        message: 'Profil mis a jour'
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /documents
   * List logisticien documents
   */
  router.get('/documents', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { warehouseId, status } = req.query;

      const db = getDb();

      const query = { logisticianId: logisticien._id };
      if (warehouseId) query.warehouseId = warehouseId;
      if (status) query.status = status;

      const documents = await db.collection('logistician_documents')
        .find(query)
        .sort({ uploadedAt: -1 })
        .toArray();

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      console.error('List documents error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /stats
   * Get logisticien statistics
   */
  router.get('/stats', authenticateLogisticien, async (req, res) => {
    try {
      const logisticien = req.logisticien;
      const { period = '30d' } = req.query;

      const warehouseIds = (logisticien.warehouses || []).map(w => w.warehouseId);
      const activeIndustrialIds = (logisticien.industrialClients || [])
        .filter(c => c.status === 'active')
        .map(c => c.industrialId);

      // Calculate date range
      let startDate = new Date();
      if (period === '7d') startDate.setDate(startDate.getDate() - 7);
      else if (period === '30d') startDate.setDate(startDate.getDate() - 30);
      else if (period === '90d') startDate.setDate(startDate.getDate() - 90);

      const db = getDb();

      // Get orders stats
      const ordersQuery = {
        industrialId: { $in: activeIndustrialIds.map(id => new ObjectId(id)) },
        $or: [
          { 'pickup.warehouseId': { $in: warehouseIds } },
          { 'delivery.warehouseId': { $in: warehouseIds } }
        ],
        createdAt: { $gte: startDate }
      };

      const [
        totalOrders,
        completedOrders,
        pendingOrders,
        totalEcmrs,
        signedEcmrs
      ] = await Promise.all([
        db.collection('transport_orders').countDocuments(ordersQuery),
        db.collection('transport_orders').countDocuments({ ...ordersQuery, status: 'DELIVERED' }),
        db.collection('transport_orders').countDocuments({ ...ordersQuery, status: { $in: ['CREATED', 'ASSIGNED', 'IN_TRANSIT'] } }),
        db.collection('ecmr').countDocuments({
          $or: [
            { 'sender.warehouseId': { $in: warehouseIds } },
            { 'consignee.warehouseId': { $in: warehouseIds } }
          ],
          createdAt: { $gte: startDate }
        }),
        db.collection('ecmr').countDocuments({
          $or: [
            { 'sender.warehouseId': { $in: warehouseIds } },
            { 'consignee.warehouseId': { $in: warehouseIds } }
          ],
          status: 'DELIVERED',
          createdAt: { $gte: startDate }
        })
      ]);

      res.json({
        success: true,
        data: {
          period,
          orders: {
            total: totalOrders,
            completed: completedOrders,
            pending: pendingOrders,
            completionRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0
          },
          ecmr: {
            total: totalEcmrs,
            signed: signedEcmrs,
            signatureRate: totalEcmrs > 0 ? Math.round((signedEcmrs / totalEcmrs) * 100) : 0
          },
          warehouses: logisticien.warehouses?.length || 0,
          industrialClients: activeIndustrialIds.length,
          vigilanceStatus: logisticien.vigilanceStatus,
          subscription: logisticien.subscription
        }
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error.message }
      });
    }
  });

  return router;
}

module.exports = createLogisticienPortalRoutes;
