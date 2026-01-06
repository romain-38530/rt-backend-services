/**
 * Planning WebSocket Service
 * Service de mise a jour temps reel pour le module Planning
 * Version: 1.0.0
 */

const { PlanningEvents } = require('./planning-models');

// ============================================================================
// TYPES D'EVENEMENTS WEBSOCKET
// ============================================================================

const WebSocketEventTypes = {
  // Connexion
  CONNECTION_ESTABLISHED: 'connection.established',
  CONNECTION_ERROR: 'connection.error',
  PING: 'ping',
  PONG: 'pong',

  // Planning updates
  PLANNING_UPDATED: 'planning.updated',
  SLOT_UPDATED: 'slot.updated',
  SLOT_RESERVED: 'slot.reserved',
  SLOT_RELEASED: 'slot.released',

  // RDV updates
  RDV_CREATED: 'rdv.created',
  RDV_UPDATED: 'rdv.updated',
  RDV_STATUS_CHANGED: 'rdv.status_changed',

  // Queue updates
  QUEUE_UPDATED: 'queue.updated',
  DRIVER_POSITION_CHANGED: 'driver.position_changed',
  DRIVER_CALLED: 'driver.called',
  DRIVER_AT_DOCK: 'driver.at_dock',

  // Operations
  OPERATION_STARTED: 'operation.started',
  OPERATION_COMPLETED: 'operation.completed',

  // Stats
  STATS_UPDATED: 'stats.updated'
};

// ============================================================================
// CLASSE PRINCIPALE: PlanningWebSocketService
// ============================================================================

class PlanningWebSocketService {
  constructor(server, eventEmitter) {
    this.clients = new Map(); // Map<clientId, { ws, subscriptions, userId, organizationId }>
    this.rooms = new Map(); // Map<roomId, Set<clientId>>
    this.eventEmitter = eventEmitter;
    this.pingInterval = null;
    this.wss = null;

    if (server) {
      this._initializeWebSocket(server);
    }
  }

  /**
   * Initialiser le serveur WebSocket
   */
  _initializeWebSocket(server) {
    try {
      const WebSocket = require('ws');
      this.wss = new WebSocket.Server({ server, path: '/ws/planning' });

      this.wss.on('connection', (ws, req) => {
        this._handleConnection(ws, req);
      });

      // Ping interval pour garder les connexions actives
      this.pingInterval = setInterval(() => {
        this._pingAllClients();
      }, 30000);

      // Ecouter les evenements du Planning
      this._subscribeToEvents();

      console.log('[PlanningWebSocket] Service WebSocket initialise sur /ws/planning');
    } catch (error) {
      console.log('[PlanningWebSocket] WebSocket non disponible, mode polling actif');
    }
  }

  /**
   * Gerer une nouvelle connexion
   */
  _handleConnection(ws, req) {
    const clientId = this._generateClientId();
    const urlParams = new URLSearchParams(req.url.split('?')[1] || '');

    const client = {
      ws,
      clientId,
      userId: urlParams.get('userId'),
      organizationId: urlParams.get('organizationId'),
      sitePlanningId: urlParams.get('sitePlanningId'),
      role: urlParams.get('role') || 'viewer', // viewer, site_manager, carrier, driver
      subscriptions: new Set(),
      connectedAt: new Date()
    };

    this.clients.set(clientId, client);

    // Auto-subscribe based on role
    if (client.sitePlanningId) {
      this._subscribeToRoom(clientId, `site:${client.sitePlanningId}`);
    }
    if (client.organizationId) {
      this._subscribeToRoom(clientId, `org:${client.organizationId}`);
    }

    // Envoyer confirmation de connexion
    this._sendToClient(clientId, {
      type: WebSocketEventTypes.CONNECTION_ESTABLISHED,
      data: {
        clientId,
        connectedAt: client.connectedAt,
        subscriptions: Array.from(client.subscriptions)
      }
    });

    // Gerer les messages entrants
    ws.on('message', (message) => {
      this._handleMessage(clientId, message);
    });

    // Gerer la deconnexion
    ws.on('close', () => {
      this._handleDisconnection(clientId);
    });

    ws.on('error', (error) => {
      console.error(`[PlanningWebSocket] Erreur client ${clientId}:`, error.message);
    });

    console.log(`[PlanningWebSocket] Client ${clientId} connecte (role: ${client.role})`);
  }

  /**
   * Gerer un message entrant
   */
  _handleMessage(clientId, rawMessage) {
    try {
      const message = JSON.parse(rawMessage.toString());
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          if (message.room) {
            this._subscribeToRoom(clientId, message.room);
          }
          break;

        case 'unsubscribe':
          if (message.room) {
            this._unsubscribeFromRoom(clientId, message.room);
          }
          break;

        case WebSocketEventTypes.PING:
          this._sendToClient(clientId, { type: WebSocketEventTypes.PONG, timestamp: Date.now() });
          break;

        case 'get_queue':
          if (message.sitePlanningId) {
            this._broadcastQueueUpdate(message.sitePlanningId);
          }
          break;

        default:
          console.log(`[PlanningWebSocket] Message inconnu de ${clientId}:`, message.type);
      }
    } catch (error) {
      console.error(`[PlanningWebSocket] Erreur parsing message:`, error.message);
    }
  }

  /**
   * Gerer la deconnexion
   */
  _handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Retirer des rooms
    for (const room of client.subscriptions) {
      this._unsubscribeFromRoom(clientId, room);
    }

    this.clients.delete(clientId);
    console.log(`[PlanningWebSocket] Client ${clientId} deconnecte`);
  }

  /**
   * S'abonner a une room
   */
  _subscribeToRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }

    this.rooms.get(roomId).add(clientId);
    client.subscriptions.add(roomId);

    console.log(`[PlanningWebSocket] Client ${clientId} abonne a ${roomId}`);
  }

  /**
   * Se desabonner d'une room
   */
  _unsubscribeFromRoom(clientId, roomId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    client.subscriptions.delete(roomId);
  }

  /**
   * Envoyer un message a un client
   */
  _sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== 1) return false;

    try {
      client.ws.send(JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      }));
      return true;
    } catch (error) {
      console.error(`[PlanningWebSocket] Erreur envoi a ${clientId}:`, error.message);
      return false;
    }
  }

  /**
   * Broadcaster a une room
   */
  _broadcastToRoom(roomId, message, excludeClientId = null) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;

    let sent = 0;
    for (const clientId of room) {
      if (clientId !== excludeClientId) {
        if (this._sendToClient(clientId, message)) {
          sent++;
        }
      }
    }

    return sent;
  }

  /**
   * Broadcaster a tous les clients d'une organisation
   */
  broadcastToOrganization(organizationId, message) {
    return this._broadcastToRoom(`org:${organizationId}`, message);
  }

  /**
   * Broadcaster a tous les clients d'un site
   */
  broadcastToSite(sitePlanningId, message) {
    return this._broadcastToRoom(`site:${sitePlanningId}`, message);
  }

  /**
   * Ping tous les clients
   */
  _pingAllClients() {
    for (const [clientId, client] of this.clients) {
      if (client.ws.readyState === 1) {
        this._sendToClient(clientId, { type: WebSocketEventTypes.PING });
      } else {
        this._handleDisconnection(clientId);
      }
    }
  }

  /**
   * S'abonner aux evenements du Planning
   */
  _subscribeToEvents() {
    if (!this.eventEmitter) return;

    // RDV Events
    this.eventEmitter.on(PlanningEvents.RDV_REQUESTED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_CREATED, data);
    });

    this.eventEmitter.on(PlanningEvents.RDV_CONFIRMED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_STATUS_CHANGED, data);
    });

    this.eventEmitter.on(PlanningEvents.RDV_PROPOSED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_STATUS_CHANGED, data);
    });

    this.eventEmitter.on(PlanningEvents.RDV_REFUSED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_STATUS_CHANGED, data);
    });

    this.eventEmitter.on(PlanningEvents.RDV_RESCHEDULED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_STATUS_CHANGED, data);
    });

    this.eventEmitter.on(PlanningEvents.RDV_CANCELLED, (data) => {
      this._handleRdvEvent(WebSocketEventTypes.RDV_STATUS_CHANGED, data);
    });

    // Slot Events
    this.eventEmitter.on(PlanningEvents.SLOT_RESERVED, (data) => {
      this._handleSlotEvent(WebSocketEventTypes.SLOT_RESERVED, data);
    });

    this.eventEmitter.on(PlanningEvents.SLOT_RELEASED, (data) => {
      this._handleSlotEvent(WebSocketEventTypes.SLOT_RELEASED, data);
    });

    // Driver Events
    this.eventEmitter.on(PlanningEvents.DRIVER_CHECKED_IN, (data) => {
      this._handleDriverEvent(WebSocketEventTypes.QUEUE_UPDATED, data);
    });

    this.eventEmitter.on(PlanningEvents.DRIVER_AT_DOCK, (data) => {
      this._handleDriverEvent(WebSocketEventTypes.DRIVER_AT_DOCK, data);
    });

    this.eventEmitter.on(PlanningEvents.DRIVER_CHECKED_OUT, (data) => {
      this._handleDriverEvent(WebSocketEventTypes.QUEUE_UPDATED, data);
    });

    this.eventEmitter.on(PlanningEvents.DRIVER_NO_SHOW, (data) => {
      this._handleDriverEvent(WebSocketEventTypes.QUEUE_UPDATED, data);
    });

    this.eventEmitter.on('driver.called', (data) => {
      this._handleDriverCalledEvent(data);
    });

    // Operation Events
    this.eventEmitter.on(PlanningEvents.LOADING_STARTED, (data) => {
      this._handleOperationEvent(WebSocketEventTypes.OPERATION_STARTED, data);
    });

    this.eventEmitter.on(PlanningEvents.LOADING_COMPLETED, (data) => {
      this._handleOperationEvent(WebSocketEventTypes.OPERATION_COMPLETED, data);
    });

    this.eventEmitter.on(PlanningEvents.DELIVERY_STARTED, (data) => {
      this._handleOperationEvent(WebSocketEventTypes.OPERATION_STARTED, data);
    });

    this.eventEmitter.on(PlanningEvents.DELIVERY_COMPLETED, (data) => {
      this._handleOperationEvent(WebSocketEventTypes.OPERATION_COMPLETED, data);
    });

    console.log('[PlanningWebSocket] Abonne aux evenements Planning');
  }

  /**
   * Gerer un evenement RDV
   */
  _handleRdvEvent(type, eventData) {
    const { data } = eventData;
    if (!data || !data.sitePlanningId) return;

    const message = {
      type,
      data: {
        rdvId: data.rdvId,
        rdvNumber: data.rdvNumber,
        event: eventData.event,
        timestamp: eventData.timestamp
      }
    };

    this.broadcastToSite(data.sitePlanningId, message);
  }

  /**
   * Gerer un evenement Slot
   */
  _handleSlotEvent(type, eventData) {
    const { data } = eventData;
    if (!data) return;

    const message = {
      type,
      data: {
        slotId: data.slotId,
        rdvId: data.rdvId,
        event: eventData.event,
        timestamp: eventData.timestamp
      }
    };

    // Broadcast to all connected site managers
    for (const [clientId, client] of this.clients) {
      if (client.role === 'site_manager' || client.role === 'admin') {
        this._sendToClient(clientId, message);
      }
    }
  }

  /**
   * Gerer un evenement Driver
   */
  _handleDriverEvent(type, eventData) {
    const { data } = eventData;
    if (!data) return;

    const message = {
      type,
      data: {
        rdvId: data.rdvId,
        rdvNumber: data.rdvNumber,
        event: eventData.event,
        timestamp: eventData.timestamp,
        ...data
      }
    };

    // Broadcast to site
    if (data.sitePlanningId) {
      this.broadcastToSite(data.sitePlanningId, message);
    }
  }

  /**
   * Gerer l'evenement driver.called specifique
   */
  _handleDriverCalledEvent(eventData) {
    const { data } = eventData;
    if (!data) return;

    const message = {
      type: WebSocketEventTypes.DRIVER_CALLED,
      data: {
        rdvId: data.rdvId,
        dockId: data.dockId,
        dockName: data.dockName,
        driverName: data.driverName,
        carrierName: data.carrierName,
        timestamp: eventData.timestamp
      }
    };

    // Envoyer au chauffeur specifique si connecte
    for (const [clientId, client] of this.clients) {
      if (client.role === 'driver' && client.rdvId === data.rdvId?.toString()) {
        this._sendToClient(clientId, {
          type: 'DRIVER_YOUR_TURN',
          data: {
            dockId: data.dockId,
            dockName: data.dockName,
            message: `Rendez-vous au ${data.dockName} maintenant!`
          }
        });
      }
    }

    // Broadcast aux gestionnaires de site
    if (data.sitePlanningId) {
      this.broadcastToSite(data.sitePlanningId, message);
    }
  }

  /**
   * Gerer un evenement Operation
   */
  _handleOperationEvent(type, eventData) {
    const { data } = eventData;
    if (!data) return;

    const message = {
      type,
      data: {
        rdvId: data.rdvId,
        rdvNumber: data.rdvNumber,
        event: eventData.event,
        timestamp: eventData.timestamp,
        ...data
      }
    };

    // Broadcast to site
    if (data.sitePlanningId) {
      this.broadcastToSite(data.sitePlanningId, message);
    }
  }

  /**
   * Broadcaster une mise a jour de la file d'attente
   */
  async _broadcastQueueUpdate(sitePlanningId) {
    const message = {
      type: WebSocketEventTypes.QUEUE_UPDATED,
      data: {
        sitePlanningId,
        refreshRequired: true,
        timestamp: new Date().toISOString()
      }
    };

    this.broadcastToSite(sitePlanningId, message);
  }

  /**
   * Generer un ID client unique
   */
  _generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Obtenir les statistiques des connexions
   */
  getStats() {
    const stats = {
      totalClients: this.clients.size,
      totalRooms: this.rooms.size,
      clientsByRole: {},
      rooms: []
    };

    for (const [, client] of this.clients) {
      const role = client.role || 'unknown';
      stats.clientsByRole[role] = (stats.clientsByRole[role] || 0) + 1;
    }

    for (const [roomId, clients] of this.rooms) {
      stats.rooms.push({
        roomId,
        clientCount: clients.size
      });
    }

    return stats;
  }

  /**
   * Fermer le service WebSocket
   */
  close() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    for (const [clientId, client] of this.clients) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (e) {
        // Ignore
      }
    }

    this.clients.clear();
    this.rooms.clear();

    if (this.wss) {
      this.wss.close();
    }

    console.log('[PlanningWebSocket] Service ferme');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PlanningWebSocketService,
  WebSocketEventTypes
};
