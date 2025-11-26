/**
 * Gestionnaire d'événements WebSocket pour SYMPHONI.A
 * Définit tous les événements temps réel du cycle de vie des commandes
 */

const { canJoinRoom } = require('./auth');

/**
 * Événements disponibles dans le système SYMPHONI.A
 */
const EVENTS = {
  // Événements de commande
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_CLOSED: 'order.closed',

  // Événements de détection de ligne
  LANE_DETECTED: 'lane.detected',
  LANE_ANALYSIS_COMPLETE: 'lane.analysis.complete',

  // Événements de dispatch chain
  DISPATCH_CHAIN_GENERATED: 'dispatch.chain.generated',
  DISPATCH_CHAIN_UPDATED: 'dispatch.chain.updated',
  CARRIER_SELECTED: 'carrier.selected',

  // Événements d'envoi aux transporteurs
  ORDER_SENT_TO_CARRIER: 'order.sent.to.carrier',
  CARRIER_ACCEPTED: 'carrier.accepted',
  CARRIER_REFUSED: 'carrier.refused',
  CARRIER_TIMEOUT: 'carrier.timeout',
  CARRIER_NEGOTIATION: 'carrier.negotiation',

  // Événements de tracking
  TRACKING_STARTED: 'tracking.started',
  TRACKING_LOCATION_UPDATE: 'tracking.location.update',
  TRACKING_ETA_UPDATE: 'tracking.eta.update',
  ORDER_ARRIVED_PICKUP: 'order.arrived.pickup',
  ORDER_DEPARTED_PICKUP: 'order.departed.pickup',
  ORDER_ARRIVED_DELIVERY: 'order.arrived.delivery',
  ORDER_LOADED: 'order.loaded',
  ORDER_DELIVERED: 'order.delivered',

  // Événements de géofencing
  GEOFENCE_ENTERED: 'geofence.entered',
  GEOFENCE_EXITED: 'geofence.exited',
  GEOFENCE_ALERT: 'geofence.alert',

  // Événements de rendez-vous
  RDV_REQUESTED: 'rdv.requested',
  RDV_PROPOSED: 'rdv.proposed',
  RDV_CONFIRMED: 'rdv.confirmed',
  RDV_CANCELLED: 'rdv.cancelled',
  RDV_RESCHEDULED: 'rdv.rescheduled',

  // Événements de documents
  DOCUMENTS_UPLOADED: 'documents.uploaded',
  DOCUMENT_OCR_STARTED: 'document.ocr.started',
  DOCUMENT_OCR_COMPLETE: 'document.ocr.complete',
  DOCUMENT_VALIDATED: 'document.validated',
  DOCUMENT_REJECTED: 'document.rejected',

  // Événements de scoring
  CARRIER_SCORED: 'carrier.scored',
  SCORE_UPDATED: 'score.updated',

  // Événements d'incidents
  INCIDENT_REPORTED: 'incident.reported',
  INCIDENT_RESOLVED: 'incident.resolved',
  DELAY_REPORTED: 'delay.reported',

  // Événements de notifications
  NOTIFICATION_CREATED: 'notification.created',
  NOTIFICATION_READ: 'notification.read',

  // Événements système
  HEARTBEAT: 'heartbeat',
  CONNECTION_STATUS: 'connection.status',
  ERROR: 'error'
};

/**
 * Configuration des événements Socket.io
 * @param {Object} io - Instance Socket.io server
 * @param {Object} socket - Instance Socket individuelle
 */
const setupEventHandlers = (io, socket) => {
  const user = socket.user;

  console.log(`[EVENTS] Setting up event handlers for user: ${user.email}`);

  // Rejoindre automatiquement les rooms de l'utilisateur
  socket.join(`user:${user.id}`);
  socket.join(`org:${user.organizationId}`);

  if (user.accountType === 'carrier') {
    socket.join(`carrier:${user.organizationId}`);
  }

  // Événement: Rejoindre une room personnalisée
  socket.on('join-room', (roomName, callback) => {
    try {
      if (canJoinRoom(socket, roomName)) {
        socket.join(roomName);
        console.log(`[EVENTS] User ${user.email} joined room: ${roomName}`);

        if (callback) {
          callback({ success: true, room: roomName });
        }
      } else {
        console.warn(`[EVENTS] User ${user.email} denied access to room: ${roomName}`);
        if (callback) {
          callback({ success: false, error: 'Access denied' });
        }
      }
    } catch (error) {
      console.error('[EVENTS] Error joining room:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Événement: Quitter une room
  socket.on('leave-room', (roomName, callback) => {
    try {
      socket.leave(roomName);
      console.log(`[EVENTS] User ${user.email} left room: ${roomName}`);

      if (callback) {
        callback({ success: true, room: roomName });
      }
    } catch (error) {
      console.error('[EVENTS] Error leaving room:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Événement: Heartbeat (pour maintenir la connexion active)
  socket.on(EVENTS.HEARTBEAT, (data, callback) => {
    if (callback) {
      callback({
        success: true,
        timestamp: Date.now(),
        userId: user.id
      });
    }
  });

  // Événement: S'abonner aux mises à jour d'une commande spécifique
  socket.on('subscribe-order', (orderId, callback) => {
    try {
      const roomName = `order:${orderId}`;

      if (canJoinRoom(socket, roomName)) {
        socket.join(roomName);
        console.log(`[EVENTS] User ${user.email} subscribed to order: ${orderId}`);

        if (callback) {
          callback({ success: true, orderId });
        }
      } else {
        if (callback) {
          callback({ success: false, error: 'Access denied to this order' });
        }
      }
    } catch (error) {
      console.error('[EVENTS] Error subscribing to order:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Événement: Se désabonner des mises à jour d'une commande
  socket.on('unsubscribe-order', (orderId, callback) => {
    try {
      socket.leave(`order:${orderId}`);
      console.log(`[EVENTS] User ${user.email} unsubscribed from order: ${orderId}`);

      if (callback) {
        callback({ success: true, orderId });
      }
    } catch (error) {
      console.error('[EVENTS] Error unsubscribing from order:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Événement: Obtenir les rooms actuelles
  socket.on('get-rooms', (callback) => {
    try {
      const rooms = Array.from(socket.rooms).filter(room => room !== socket.id);

      if (callback) {
        callback({
          success: true,
          rooms,
          userId: user.id
        });
      }
    } catch (error) {
      console.error('[EVENTS] Error getting rooms:', error);
      if (callback) {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Événement de déconnexion
  socket.on('disconnect', (reason) => {
    console.log(`[EVENTS] User ${user.email} disconnected: ${reason}`);
  });
};

/**
 * Émet un événement à une room spécifique
 * @param {Object} io - Instance Socket.io server
 * @param {String} roomName - Nom de la room
 * @param {String} eventName - Nom de l'événement
 * @param {Object} data - Données de l'événement
 */
const emitToRoom = (io, roomName, eventName, data) => {
  try {
    io.to(roomName).emit(eventName, {
      ...data,
      timestamp: Date.now(),
      event: eventName
    });

    console.log(`[EVENTS] Emitted ${eventName} to room ${roomName}`);
  } catch (error) {
    console.error(`[EVENTS] Error emitting to room ${roomName}:`, error);
  }
};

/**
 * Émet un événement à un utilisateur spécifique
 * @param {Object} io - Instance Socket.io server
 * @param {String} userId - ID de l'utilisateur
 * @param {String} eventName - Nom de l'événement
 * @param {Object} data - Données de l'événement
 */
const emitToUser = (io, userId, eventName, data) => {
  emitToRoom(io, `user:${userId}`, eventName, data);
};

/**
 * Émet un événement à une organisation
 * @param {Object} io - Instance Socket.io server
 * @param {String} organizationId - ID de l'organisation
 * @param {String} eventName - Nom de l'événement
 * @param {Object} data - Données de l'événement
 */
const emitToOrganization = (io, organizationId, eventName, data) => {
  emitToRoom(io, `org:${organizationId}`, eventName, data);
};

/**
 * Émet un événement pour une commande spécifique
 * @param {Object} io - Instance Socket.io server
 * @param {String} orderId - ID de la commande
 * @param {String} eventName - Nom de l'événement
 * @param {Object} data - Données de l'événement
 */
const emitOrderEvent = (io, orderId, eventName, data) => {
  emitToRoom(io, `order:${orderId}`, eventName, {
    ...data,
    orderId
  });
};

/**
 * Émet un événement global (broadcast)
 * @param {Object} io - Instance Socket.io server
 * @param {String} eventName - Nom de l'événement
 * @param {Object} data - Données de l'événement
 */
const emitGlobal = (io, eventName, data) => {
  io.emit(eventName, {
    ...data,
    timestamp: Date.now(),
    event: eventName
  });

  console.log(`[EVENTS] Emitted global event: ${eventName}`);
};

module.exports = {
  EVENTS,
  setupEventHandlers,
  emitToRoom,
  emitToUser,
  emitToOrganization,
  emitOrderEvent,
  emitGlobal
};
