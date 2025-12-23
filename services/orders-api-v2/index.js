/**
 * SYMPHONI.A Orders API v2
 * API de gestion des commandes de transport avec import CSV/XML, templates et export
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const io = require('socket.io-client');
const cron = require('node-cron');

// Importer les modèles
const Order = require('./models/Order');
const OrderTemplate = require('./models/OrderTemplate');

// Importer les utilitaires
const { parseCSV, validateOrder: validateCSVOrder, generateCSVTemplate } = require('./utils/csvImporter');
const { parseXML, generateXMLTemplate } = require('./utils/xmlImporter');

// Configuration
const PORT = process.env.PORT || 3011;
const MONGODB_URI = process.env.MONGODB_URI;
const WEBSOCKET_URL = process.env.WEBSOCKET_URL;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
const NOTIFICATIONS_API_URL = process.env.NOTIFICATIONS_API_URL || 'http://rt-notifications-api-prod.eba-mttbqqhw.eu-central-1.elasticbeanstalk.com';
const ECMR_API_URL = process.env.ECMR_API_URL || 'http://rt-ecmr-signature-api-prod.eba-4pgwbyaj.eu-central-1.elasticbeanstalk.com';

// Initialisation Express
const app = express();
app.use(cors());
app.use(express.json());

// Configuration multer pour upload de fichiers
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.xml', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Utilisez CSV, XML ou XLSX.'));
    }
  }
});

// Connexion WebSocket (optionnelle)
let websocket = null;
if (WEBSOCKET_URL && process.env.WEBSOCKET_ENABLED !== 'false') {
  try {
    websocket = io(WEBSOCKET_URL);
    websocket.on('connect', () => {
      console.log('[WEBSOCKET] Connected to WebSocket server');
    });
  } catch (error) {
    console.warn('[WEBSOCKET] Could not connect:', error.message);
  }
}

// Helper pour émettre des événements WebSocket
function emitEvent(eventName, data) {
  if (websocket && websocket.connected) {
    websocket.emit('emit-event', { eventName, data });
  }
}

// Helper pour envoyer des notifications via Notifications API
async function sendNotification(notificationData) {
  try {
    const response = await fetch(`${NOTIFICATIONS_API_URL}/api/v1/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notificationData)
    });
    if (!response.ok) {
      console.warn('[NOTIFICATIONS] Failed to send:', response.status);
      return null;
    }
    const result = await response.json();
    console.log('[NOTIFICATIONS] Sent:', notificationData.type, 'to user:', notificationData.userId);
    return result;
  } catch (error) {
    console.error('[NOTIFICATIONS] Error:', error.message);
    return null;
  }
}

// Notification templates for different order events
const NOTIFICATION_TEMPLATES = {
  order_created: (order) => ({
    type: 'order_created',
    title: 'Nouvelle commande créée',
    message: `Commande ${order.orderNumber} créée - ${order.pickup?.city || 'N/A'} → ${order.delivery?.city || 'N/A'}`,
    priority: 'normal',
    channels: { app: true, email: false, sms: false },
    actionUrl: `/orders/${order._id}`
  }),
  order_updated: (order) => ({
    type: 'order_updated',
    title: 'Commande mise à jour',
    message: `Commande ${order.orderNumber} modifiée - Statut: ${order.status}`,
    priority: 'normal',
    channels: { app: true, email: false, sms: false },
    actionUrl: `/orders/${order._id}`
  }),
  order_cancelled: (order) => ({
    type: 'order_cancelled',
    title: 'Commande annulée',
    message: `Commande ${order.orderNumber} a été annulée`,
    priority: 'high',
    channels: { app: true, email: true, sms: false },
    actionUrl: `/orders/${order._id}`
  }),
  carrier_assigned: (order, carrier) => ({
    type: 'carrier_accepted',
    title: 'Transporteur assigné',
    message: `${carrier?.name || 'Un transporteur'} a été assigné à la commande ${order.orderNumber}`,
    priority: 'normal',
    channels: { app: true, email: true, sms: false },
    actionUrl: `/orders/${order._id}`
  }),
  delivery_completed: (order) => ({
    type: 'tracking_update',
    title: 'Livraison effectuée',
    message: `Commande ${order.orderNumber} livrée avec succès`,
    priority: 'normal',
    channels: { app: true, email: true, sms: false },
    actionUrl: `/orders/${order._id}`
  })
};

// Helper to notify relevant users for an order
async function notifyOrderEvent(order, eventType, extraData = {}) {
  const template = NOTIFICATION_TEMPLATES[eventType];
  if (!template) return;

  const notifData = template(order, extraData);
  const usersToNotify = [];

  // Notify organization users (shipper/industry)
  if (order.organizationId) {
    usersToNotify.push({
      userId: order.organizationId,
      ...notifData,
      data: { orderId: order._id, orderNumber: order.orderNumber }
    });
  }

  // Notify carrier if assigned
  if (order.carrier?.id && eventType !== 'carrier_assigned') {
    usersToNotify.push({
      userId: order.carrier.id,
      ...notifData,
      data: { orderId: order._id, orderNumber: order.orderNumber }
    });
  }

  // Send all notifications in parallel
  await Promise.all(usersToNotify.map(n => sendNotification(n)));
}

// ==================== eCMR INTEGRATION ====================

/**
 * Fetch eCMR data for an order from the eCMR API
 * @param {string} orderId - The order ID
 * @returns {Object|null} eCMR data with links or null if not found
 */
async function getEcmrForOrder(orderId) {
  try {
    const response = await fetch(`${ECMR_API_URL}/api/v1/ecmr?orderId=${orderId}&limit=1`);
    if (!response.ok) return null;

    const result = await response.json();
    if (!result.success || !result.data || result.data.length === 0) return null;

    const ecmr = result.data[0];
    return {
      ecmrId: ecmr.ecmrId,
      status: ecmr.status,
      createdAt: ecmr.createdAt,
      signatures: {
        shipper: !!ecmr.shipper?.signedAt,
        carrier: !!ecmr.carrier?.signedAt,
        consignee: !!ecmr.consignee?.signedAt
      },
      links: {
        view: `${ECMR_API_URL}/api/v1/ecmr/${ecmr.ecmrId}`,
        pdf: `${ECMR_API_URL}/api/v1/ecmr/${ecmr.ecmrId}/pdf`,
        download: `${ECMR_API_URL}/api/v1/ecmr/${ecmr.ecmrId}/download`
      }
    };
  } catch (error) {
    console.warn('[ECMR] Error fetching eCMR for order:', orderId, error.message);
    return null;
  }
}

/**
 * Enrich order object with eCMR links
 * @param {Object} order - The order document
 * @returns {Object} Order with ecmr property added
 */
async function enrichOrderWithEcmr(order) {
  const orderObj = order.toObject ? order.toObject() : order;
  const ecmr = await getEcmrForOrder(orderObj._id.toString());

  return {
    ...orderObj,
    ecmr: ecmr || {
      available: false,
      createUrl: `${ECMR_API_URL}/api/v1/ecmr`,
      message: 'Aucune eCMR associée à cette commande'
    }
  };
}

/**
 * Enrich multiple orders with eCMR links (in parallel)
 * @param {Array} orders - Array of order documents
 * @returns {Array} Orders with ecmr property added
 */
async function enrichOrdersWithEcmr(orders) {
  return Promise.all(orders.map(order => enrichOrderWithEcmr(order)));
}

// Connexion MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('[MONGODB] Connected successfully'))
  .catch(error => console.error('[MONGODB] Connection failed:', error));

// ==================== ROUTES PRINCIPALES ====================

// Middleware pour rediriger les différents formats d'URL vers /api/v1/orders
app.use((req, res, next) => {
  // /orders -> /api/v1/orders
  if (req.path.startsWith('/orders') && !req.path.startsWith('/api/')) {
    req.url = '/api/v1' + req.url;
  }
  // /api/orders -> /api/v1/orders
  else if (req.path.startsWith('/api/orders')) {
    req.url = req.url.replace('/api/orders', '/api/v1/orders');
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'orders-api-v2',
    version: '2.2.0',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocket: websocket?.connected ? 'connected' : 'disconnected'
  });
});

// ==================== CRUD COMMANDES ====================

// Créer une commande
app.post('/api/v1/orders', async (req, res) => {
  try {
    const orderData = req.body;

    // Générer un numéro de commande
    if (!orderData.orderNumber) {
      orderData.orderNumber = await Order.generateOrderNumber();
    }

    // Créer la commande
    const order = new Order(orderData);
    await order.save();

    // Émettre événement WebSocket
    emitEvent('order.created', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      organizationId: order.organizationId,
      status: order.status
    });

    // Envoyer notification
    notifyOrderEvent(order, 'order_created');

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('[ERROR] Create order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Lister les commandes avec filtres
app.get('/api/v1/orders', async (req, res) => {
  try {
    const {
      organizationId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 50,
      sort = '-createdAt'
    } = req.query;

    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (status) filters.status = status;
    if (startDate || endDate) {
      filters.pickupDate = {};
      if (startDate) filters.pickupDate.$gte = new Date(startDate);
      if (endDate) filters.pickupDate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [orders, total] = await Promise.all([
      Order.find(filters)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      Order.countDocuments(filters)
    ]);

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('[ERROR] List orders:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtenir une commande par ID
app.get('/api/v1/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Enrichir avec les liens eCMR
    const enrichedOrder = await enrichOrderWithEcmr(order);

    res.json({
      success: true,
      data: enrichedOrder
    });
  } catch (error) {
    console.error('[ERROR] Get order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mettre à jour une commande
app.put('/api/v1/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Émettre événement WebSocket
    emitEvent('order.updated', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      updates: req.body
    });

    // Envoyer notification si changement de statut important
    if (req.body.status === 'cancelled') {
      notifyOrderEvent(order, 'order_cancelled');
    } else if (req.body.status === 'delivered') {
      notifyOrderEvent(order, 'delivery_completed');
    } else if (req.body.carrier) {
      notifyOrderEvent(order, 'carrier_assigned', req.body.carrier);
    } else {
      notifyOrderEvent(order, 'order_updated');
    }

    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('[ERROR] Update order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Supprimer une commande
app.delete('/api/v1/orders/:id', async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    res.json({
      success: true,
      message: 'Commande supprimée'
    });
  } catch (error) {
    console.error('[ERROR] Delete order:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== eCMR ENDPOINTS ====================

// GET /api/v1/orders/:id/ecmr - Obtenir l'eCMR associée à une commande
app.get('/api/v1/orders/:id/ecmr', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    const ecmr = await getEcmrForOrder(req.params.id);

    if (!ecmr) {
      return res.status(404).json({
        success: false,
        error: 'Aucune eCMR associée à cette commande',
        createUrl: `${ECMR_API_URL}/api/v1/ecmr`,
        orderData: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          shipper: order.pickup,
          consignee: order.delivery,
          carrier: order.assignedCarrier,
          goods: order.cargo
        }
      });
    }

    res.json({
      success: true,
      data: ecmr
    });
  } catch (error) {
    console.error('[ERROR] Get order eCMR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/orders/:id/ecmr - Créer une eCMR pour une commande
app.post('/api/v1/orders/:id/ecmr', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Vérifier si une eCMR existe déjà
    const existingEcmr = await getEcmrForOrder(req.params.id);
    if (existingEcmr) {
      return res.status(409).json({
        success: false,
        error: 'Une eCMR existe déjà pour cette commande',
        data: existingEcmr
      });
    }

    // Préparer les données eCMR depuis la commande
    const ecmrData = {
      orderId: order._id.toString(),
      orderRef: order.orderNumber,
      shipper: {
        name: order.pickup?.name || order.pickup?.company || 'N/A',
        address: order.pickup?.address,
        city: order.pickup?.city,
        postalCode: order.pickup?.postalCode,
        country: order.pickup?.country || 'France',
        contactName: order.pickup?.contactName,
        contactPhone: order.pickup?.phone
      },
      carrier: {
        name: order.assignedCarrier?.carrierName || order.assignedCarrier?.name || 'N/A',
        carrierId: order.assignedCarrier?.carrierId,
        driverName: order.assignedCarrier?.driverName,
        vehiclePlate: order.assignedCarrier?.vehiclePlate || order.assignedCarrier?.tractorPlate
      },
      consignee: {
        name: order.delivery?.name || order.delivery?.company || 'N/A',
        address: order.delivery?.address,
        city: order.delivery?.city,
        postalCode: order.delivery?.postalCode,
        country: order.delivery?.country || 'France',
        contactName: order.delivery?.contactName,
        contactPhone: order.delivery?.phone
      },
      goods: {
        description: order.cargo?.description || order.cargo?.type || 'Marchandises',
        quantity: order.cargo?.quantity,
        weight: order.cargo?.weight?.value,
        volume: order.cargo?.volume?.value,
        packages: order.cargo?.quantity,
        packaging: order.cargo?.packaging,
        dangerousGoods: order.cargo?.hazardous ? {
          isDangerous: true,
          unNumber: order.cargo?.hazardous?.unNumber,
          class: order.cargo?.hazardous?.class
        } : { isDangerous: false }
      },
      pickup: {
        address: order.pickup?.address,
        city: order.pickup?.city,
        postalCode: order.pickup?.postalCode,
        country: order.pickup?.country || 'France',
        scheduledDate: order.pickupDate,
        instructions: order.pickup?.instructions
      },
      delivery: {
        address: order.delivery?.address,
        city: order.delivery?.city,
        postalCode: order.delivery?.postalCode,
        country: order.delivery?.country || 'France',
        scheduledDate: order.deliveryDate,
        instructions: order.delivery?.instructions
      },
      createdBy: req.body.createdBy || 'orders-api'
    };

    // Appeler l'API eCMR pour créer le document
    const response = await fetch(`${ECMR_API_URL}/api/v1/ecmr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ecmrData)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return res.status(response.status).json({
        success: false,
        error: result.error || 'Erreur lors de la création de l\'eCMR'
      });
    }

    // Émettre événement WebSocket
    emitEvent('order.ecmr_created', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      ecmrId: result.data.ecmrId
    });

    res.status(201).json({
      success: true,
      message: 'eCMR créée avec succès',
      data: {
        ecmrId: result.data.ecmrId,
        status: result.data.status,
        links: {
          view: `${ECMR_API_URL}/api/v1/ecmr/${result.data.ecmrId}`,
          pdf: `${ECMR_API_URL}/api/v1/ecmr/${result.data.ecmrId}/pdf`,
          download: `${ECMR_API_URL}/api/v1/ecmr/${result.data.ecmrId}/download`
        }
      }
    });
  } catch (error) {
    console.error('[ERROR] Create order eCMR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/orders/:id/ecmr/pdf - Télécharger directement le PDF de l'eCMR
app.get('/api/v1/orders/:id/ecmr/pdf', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    const ecmr = await getEcmrForOrder(req.params.id);

    if (!ecmr) {
      return res.status(404).json({
        success: false,
        error: 'Aucune eCMR associée à cette commande'
      });
    }

    // Proxy le PDF depuis l'API eCMR (évite les problèmes HTTP/HTTPS mixed content)
    const pdfUrl = `${ECMR_API_URL}/api/v1/ecmr/${ecmr.ecmrId}/pdf`;
    console.log('[ECMR] Fetching PDF from:', pdfUrl);

    const pdfResponse = await fetch(pdfUrl);

    if (!pdfResponse.ok) {
      return res.status(pdfResponse.status).json({
        success: false,
        error: 'Erreur lors de la récupération du PDF'
      });
    }

    // Transférer les headers appropriés
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="eCMR-${ecmr.ecmrId}.pdf"`);

    // Streamer le PDF vers le client
    const arrayBuffer = await pdfResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error('[ERROR] Get order eCMR PDF:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== TRACKING ====================

// GET /api/v1/orders/:id/tracking - Obtenir le suivi d'une commande
app.get('/api/v1/orders/:id/tracking', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Construire les données de tracking depuis la commande
    const trackingData = {
      orderId: order._id,
      reference: order.reference || order.orderNumber,
      status: order.status,
      currentLocation: order.currentLocation || null,
      tracking: order.tracking || { isActive: false, events: [] },
      dates: {
        pickup: {
          scheduled: order.dates?.pickupDate,
          actual: order.dates?.actualPickupDate
        },
        delivery: {
          scheduled: order.dates?.deliveryDate,
          actual: order.dates?.actualDeliveryDate
        }
      },
      carrier: order.assignedCarrier ? {
        name: order.assignedCarrier.carrierName || order.carrierName,
        driverName: order.assignedCarrier.driverName,
        driverPhone: order.assignedCarrier.driverPhone,
        vehiclePlate: order.assignedCarrier.vehiclePlate || order.assignedCarrier.tractorPlate
      } : null,
      events: order.events || [],
      updatedAt: order.updatedAt
    };

    res.json({
      success: true,
      data: trackingData
    });
  } catch (error) {
    console.error('[ERROR] Get order tracking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== EVENTS ====================

// GET /api/v1/orders/:id/events - Obtenir les événements d'une commande
app.get('/api/v1/orders/:id/events', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order._id,
        reference: order.reference || order.orderNumber,
        events: order.events || [],
        tracking: order.tracking?.events || []
      }
    });
  } catch (error) {
    console.error('[ERROR] Get order events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DRIVER INFO (pour borne chauffeur) ====================

// PUT /api/v1/orders/:id/driver-info - Mise à jour des infos chauffeur par le transporteur
app.put('/api/v1/orders/:id/driver-info', async (req, res) => {
  try {
    const {
      driverFirstName,
      driverLastName,
      driverPhone,
      tractorPlate,
      trailerPlate,
      vehicleType,
      updatedBy
    } = req.body;

    // Construire l'objet de mise à jour
    const updateData = {
      'assignedCarrier.driverFirstName': driverFirstName,
      'assignedCarrier.driverLastName': driverLastName,
      'assignedCarrier.driverName': `${driverFirstName || ''} ${driverLastName || ''}`.trim(),
      'assignedCarrier.driverPhone': driverPhone,
      'assignedCarrier.tractorPlate': tractorPlate?.toUpperCase(),
      'assignedCarrier.trailerPlate': trailerPlate?.toUpperCase(),
      'assignedCarrier.vehiclePlate': tractorPlate?.toUpperCase(), // Legacy compatibility
      'assignedCarrier.vehicleType': vehicleType,
      'assignedCarrier.driverInfoUpdatedAt': new Date(),
      'assignedCarrier.driverInfoUpdatedBy': updatedBy
    };

    // Nettoyer les valeurs undefined
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Émettre événement WebSocket
    emitEvent('order.driver_info_updated', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      driverInfo: {
        firstName: driverFirstName,
        lastName: driverLastName,
        tractorPlate,
        trailerPlate
      }
    });

    res.json({
      success: true,
      message: 'Informations chauffeur mises à jour',
      data: order
    });
  } catch (error) {
    console.error('[ERROR] Update driver info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/v1/orders/by-plate/:plate - Rechercher commande par plaque (pour borne)
app.get('/api/v1/orders/by-plate/:plate', async (req, res) => {
  try {
    const plate = req.params.plate.toUpperCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Chercher commandes du jour avec cette plaque
    const orders = await Order.find({
      $or: [
        { 'assignedCarrier.tractorPlate': plate },
        { 'assignedCarrier.trailerPlate': plate },
        { 'assignedCarrier.vehiclePlate': plate }
      ],
      pickupDate: { $gte: today, $lt: tomorrow },
      status: { $in: ['accepted', 'in_transit', 'pickup_completed'] }
    }).sort({ pickupDate: 1 });

    res.json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    console.error('[ERROR] Find by plate:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== IMPORT BATCH ====================

// Import CSV
app.post('/api/v1/orders/import/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier fourni'
      });
    }

    const { organizationId, createdBy } = req.body;

    if (!organizationId || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'organizationId et createdBy sont requis'
      });
    }

    // Parser le CSV
    const { orders: parsedOrders, errors: parseErrors } = await parseCSV(req.file.path);

    // Valider et créer les commandes
    const results = {
      success: [],
      errors: []
    };

    for (let i = 0; i < parsedOrders.length; i++) {
      try {
        const orderData = parsedOrders[i];

        // Validation
        const validation = validateCSVOrder(orderData);
        if (!validation.valid) {
          results.errors.push({
            row: i + 1,
            errors: validation.errors,
            data: orderData
          });
          continue;
        }

        // Ajouter les infos d'organisation
        orderData.organizationId = organizationId;
        orderData.createdBy = createdBy;
        orderData.orderNumber = await Order.generateOrderNumber();

        // Créer la commande
        const order = new Order(orderData);
        await order.save();

        results.success.push({
          row: i + 1,
          orderId: order._id,
          orderNumber: order.orderNumber
        });

        // Émettre événement WebSocket
        emitEvent('order.created', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          organizationId: order.organizationId,
          source: 'csv_import'
        });
      } catch (error) {
        results.errors.push({
          row: i + 1,
          error: error.message,
          data: parsedOrders[i]
        });
      }
    }

    // Nettoyer le fichier uploadé
    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      success: true,
      summary: {
        total: parsedOrders.length,
        imported: results.success.length,
        failed: results.errors.length
      },
      results
    });
  } catch (error) {
    console.error('[ERROR] CSV import:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Import XML
app.post('/api/v1/orders/import/xml', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Aucun fichier fourni'
      });
    }

    const { organizationId, createdBy } = req.body;

    const { orders: parsedOrders, errors: parseErrors } = await parseXML(req.file.path);

    const results = {
      success: [],
      errors: []
    };

    for (let i = 0; i < parsedOrders.length; i++) {
      try {
        const orderData = parsedOrders[i];
        orderData.organizationId = organizationId;
        orderData.createdBy = createdBy;
        orderData.orderNumber = await Order.generateOrderNumber();

        const order = new Order(orderData);
        await order.save();

        results.success.push({
          index: i,
          orderId: order._id,
          orderNumber: order.orderNumber
        });

        emitEvent('order.created', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          organizationId: order.organizationId,
          source: 'xml_import'
        });
      } catch (error) {
        results.errors.push({
          index: i,
          error: error.message
        });
      }
    }

    await fs.unlink(req.file.path).catch(() => {});

    res.json({
      success: true,
      summary: {
        total: parsedOrders.length,
        imported: results.success.length,
        failed: results.errors.length
      },
      results
    });
  } catch (error) {
    console.error('[ERROR] XML import:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Télécharger templates d'import
app.get('/api/v1/orders/import/template/csv', (req, res) => {
  const template = generateCSVTemplate();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=template_import_commandes.csv');
  res.send(template);
});

app.get('/api/v1/orders/import/template/xml', (req, res) => {
  const template = generateXMLTemplate();
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', 'attachment; filename=template_import_commandes.xml');
  res.send(template);
});

// ==================== TEMPLATES & COMMANDES RÉCURRENTES ====================

// Créer un template
app.post('/api/v1/orders/templates', async (req, res) => {
  try {
    const template = new OrderTemplate(req.body);
    await template.save();

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('[ERROR] Create template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Lister les templates
app.get('/api/v1/orders/templates', async (req, res) => {
  try {
    const { organizationId, isActive } = req.query;

    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const templates = await OrderTemplate.find(filters).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('[ERROR] List templates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Créer une commande depuis un template
app.post('/api/v1/orders/templates/:id/create-order', async (req, res) => {
  try {
    const template = await OrderTemplate.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template non trouvé'
      });
    }

    // Créer la commande depuis le template
    const orderData = {
      ...template.templateData,
      organizationId: template.organizationId,
      createdBy: req.body.createdBy || template.createdBy,
      orderNumber: await Order.generateOrderNumber(),
      pickupDate: req.body.pickupDate || new Date(),
      deliveryDate: req.body.deliveryDate || new Date(),
      metadata: {
        createdFromTemplate: template._id,
        templateName: template.name
      }
    };

    const order = new Order(orderData);
    await order.save();

    // Mettre à jour les stats du template
    template.stats.totalCreated += 1;
    template.stats.lastOrderId = order._id;
    template.lastExecutionDate = new Date();
    await template.save();

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('[ERROR] Create order from template:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== EXPORT ====================

// Export CSV
app.get('/api/v1/orders/export/csv', async (req, res) => {
  try {
    const { organizationId, status, startDate, endDate } = req.query;

    const filters = {};
    if (organizationId) filters.organizationId = organizationId;
    if (status) filters.status = status;
    if (startDate || endDate) {
      filters.pickupDate = {};
      if (startDate) filters.pickupDate.$gte = new Date(startDate);
      if (endDate) filters.pickupDate.$lte = new Date(endDate);
    }

    const orders = await Order.find(filters).limit(10000);

    // Convertir en CSV (simplifié)
    const headers = [
      'Numéro commande',
      'Référence externe',
      'Statut',
      'Date enlèvement',
      'Date livraison',
      'Expéditeur',
      'Ville expéditeur',
      'Destinataire',
      'Ville destinataire',
      'Type marchandise',
      'Quantité',
      'Poids',
      'Transporteur'
    ];

    const rows = orders.map(order => [
      order.orderNumber,
      order.externalReference || '',
      order.status,
      order.pickupDate.toISOString().split('T')[0],
      order.deliveryDate.toISOString().split('T')[0],
      order.pickup.name,
      order.pickup.city,
      order.delivery.name,
      order.delivery.city,
      order.cargo.type,
      order.cargo.quantity,
      order.cargo.weight?.value || '',
      order.assignedCarrier?.carrierName || ''
    ]);

    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=commandes_${Date.now()}.csv`);
    res.send('\ufeff' + csv); // BOM UTF-8
  } catch (error) {
    console.error('[ERROR] Export CSV:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== DÉTECTION DOUBLONS ====================

// Vérifier les doublons
app.get('/api/v1/orders/:id/duplicates', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Commande non trouvée'
      });
    }

    // Rechercher des commandes similaires
    const duplicates = await Order.find({
      _id: { $ne: order._id },
      organizationId: order.organizationId,
      'pickup.postalCode': order.pickup.postalCode,
      'delivery.postalCode': order.delivery.postalCode,
      pickupDate: {
        $gte: new Date(order.pickupDate.getTime() - 24 * 60 * 60 * 1000),
        $lte: new Date(order.pickupDate.getTime() + 24 * 60 * 60 * 1000)
      },
      'cargo.type': order.cargo.type
    }).limit(10);

    res.json({
      success: true,
      hasDuplicates: duplicates.length > 0,
      count: duplicates.length,
      duplicates
    });
  } catch (error) {
    console.error('[ERROR] Check duplicates:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CRON JOBS ====================

// Exécuter les templates récurrents chaque jour à minuit
cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Executing recurring templates...');

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const templates = await OrderTemplate.find({
      isActive: true,
      'recurrence.frequency': { $ne: 'manual' },
      nextExecutionDate: { $lte: today }
    });

    for (const template of templates) {
      try {
        // Créer la commande
        const orderData = {
          ...template.templateData,
          organizationId: template.organizationId,
          createdBy: 'system',
          orderNumber: await Order.generateOrderNumber(),
          metadata: {
            createdFromTemplate: template._id,
            templateName: template.name,
            autoCreated: true
          }
        };

        const order = new Order(orderData);
        await order.save();

        // Mettre à jour le template
        template.stats.totalCreated += 1;
        template.stats.lastOrderId = order._id;
        template.lastExecutionDate = new Date();

        // Calculer la prochaine date d'exécution
        if (template.recurrence.frequency === 'daily') {
          template.nextExecutionDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        } else if (template.recurrence.frequency === 'weekly') {
          template.nextExecutionDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        } else if (template.recurrence.frequency === 'monthly') {
          const next = new Date(today);
          next.setMonth(next.getMonth() + 1);
          template.nextExecutionDate = next;
        }

        await template.save();

        console.log(`[CRON] Created order ${order.orderNumber} from template ${template.name}`);
      } catch (error) {
        console.error(`[CRON] Error creating order from template ${template._id}:`, error);
      }
    }
  } catch (error) {
    console.error('[CRON] Error in recurring templates job:', error);
  }
});

// ==================== DÉMARRAGE ====================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         SYMPHONI.A Orders API v2.0                           ║
║                                                               ║
║  Status:     Running                                         ║
║  Port:       ${PORT}                                              ║
║  MongoDB:    ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}                                     ║
║  WebSocket:  ${websocket?.connected ? 'Connected' : 'Disabled'}                                      ║
║                                                               ║
║  Features:   ✓ CRUD Commandes                                ║
║              ✓ Import CSV/XML                                ║
║              ✓ Export CSV                                    ║
║              ✓ Templates récurrents                          ║
║              ✓ Détection doublons                            ║
║              ✓ Intégration eCMR (PDF CMR officiel)           ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
