/**
 * WebSocket Authentication Service
 * SYMPHONI.A - RT Technologie
 *
 * Service d'authentification sécurisée pour les connexions WebSocket:
 * - Authentification par token JWT
 * - Gestion des rooms par tenant
 * - Heartbeat et reconnexion
 * - Rate limiting par connexion
 *
 * @version 1.0.0
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');

// ============================================
// CONFIGURATION
// ============================================

const WS_AUTH_CONFIG = {
  // Durée de vie du token WebSocket (minutes)
  tokenExpiry: parseInt(process.env.WS_TOKEN_EXPIRY_MINUTES) || 60,

  // Délai maximum pour l'authentification après connexion (secondes)
  authTimeout: parseInt(process.env.WS_AUTH_TIMEOUT_SECONDS) || 30,

  // Intervalle de heartbeat (secondes)
  heartbeatInterval: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30,

  // Timeout de déconnexion si pas de heartbeat (secondes)
  heartbeatTimeout: parseInt(process.env.WS_HEARTBEAT_TIMEOUT) || 90,

  // Nombre max de connexions par utilisateur
  maxConnectionsPerUser: parseInt(process.env.WS_MAX_CONNECTIONS_PER_USER) || 5,

  // Rate limit messages par seconde
  messageRateLimit: parseInt(process.env.WS_MESSAGE_RATE_LIMIT) || 10,

  // Secret JWT (doit être configuré en production)
  jwtSecret: process.env.JWT_SECRET || 'change-in-production'
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service d'authentification WebSocket
 * @param {MongoClient} mongoClient
 * @param {Object} io - Instance Socket.IO (optionnel)
 * @returns {Object} Service
 */
function createWebSocketAuthService(mongoClient, io = null) {
  const getDb = () => mongoClient.db();

  // Cache des connexions actives
  const activeConnections = new Map(); // userId -> Set<socketId>
  const socketToUser = new Map(); // socketId -> userId
  const connectionMetadata = new Map(); // socketId -> metadata

  // ============================================
  // GÉNÉRATION DE TOKENS WS
  // ============================================

  /**
   * Générer un token d'authentification WebSocket
   * @param {Object} user - Données utilisateur
   * @param {Object} options - Options additionnelles
   * @returns {Object} Token et métadonnées
   */
  async function generateWSToken(user, options = {}) {
    const tokenId = crypto.randomBytes(16).toString('hex');

    const payload = {
      userId: user._id?.toString() || user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId || user.industrielId,
      tokenId,
      type: 'websocket',
      permissions: options.permissions || ['read', 'write'],
      rooms: options.rooms || []
    };

    const token = jwt.sign(payload, WS_AUTH_CONFIG.jwtSecret, {
      expiresIn: `${WS_AUTH_CONFIG.tokenExpiry}m`,
      algorithm: 'HS256'
    });

    // Stocker le token dans la base pour tracking
    const db = getDb();
    await db.collection('ws_tokens').insertOne({
      _id: new ObjectId(),
      tokenId,
      userId: payload.userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + WS_AUTH_CONFIG.tokenExpiry * 60 * 1000),
      isActive: true,
      metadata: {
        ip: options.ip,
        userAgent: options.userAgent
      }
    });

    return {
      token,
      tokenId,
      expiresIn: WS_AUTH_CONFIG.tokenExpiry * 60, // en secondes
      config: {
        heartbeatInterval: WS_AUTH_CONFIG.heartbeatInterval,
        authTimeout: WS_AUTH_CONFIG.authTimeout
      }
    };
  }

  /**
   * Vérifier un token WebSocket
   * @param {string} token - Token JWT
   * @returns {Object} Résultat de vérification
   */
  async function verifyWSToken(token) {
    try {
      const decoded = jwt.verify(token, WS_AUTH_CONFIG.jwtSecret);

      if (decoded.type !== 'websocket') {
        return {
          valid: false,
          error: { code: 'INVALID_TOKEN_TYPE', message: 'Not a WebSocket token' }
        };
      }

      // Vérifier que le token est encore actif dans la base
      const db = getDb();
      const storedToken = await db.collection('ws_tokens').findOne({
        tokenId: decoded.tokenId,
        isActive: true
      });

      if (!storedToken) {
        return {
          valid: false,
          error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' }
        };
      }

      // Vérifier que l'utilisateur est toujours actif
      const user = await db.collection('users').findOne({
        _id: new ObjectId(decoded.userId),
        isActive: true
      });

      if (!user) {
        return {
          valid: false,
          error: { code: 'USER_INVALID', message: 'User not found or disabled' }
        };
      }

      return {
        valid: true,
        payload: decoded,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          companyName: user.companyName
        }
      };

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: { code: 'TOKEN_EXPIRED', message: 'WebSocket token has expired' }
        };
      }
      return {
        valid: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid WebSocket token' }
      };
    }
  }

  // ============================================
  // MIDDLEWARE SOCKET.IO
  // ============================================

  /**
   * Middleware d'authentification pour Socket.IO
   * À utiliser avec io.use()
   */
  function socketAuthMiddleware(socket, next) {
    const token = socket.handshake.auth?.token ||
                  socket.handshake.query?.token ||
                  socket.handshake.headers?.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    verifyWSToken(token).then(result => {
      if (!result.valid) {
        return next(new Error(result.error.message));
      }

      // Vérifier le nombre de connexions pour cet utilisateur
      const userId = result.payload.userId;
      const userConnections = activeConnections.get(userId) || new Set();

      if (userConnections.size >= WS_AUTH_CONFIG.maxConnectionsPerUser) {
        return next(new Error('Maximum connections per user reached'));
      }

      // Attacher les données utilisateur au socket
      socket.user = result.user;
      socket.userId = userId;
      socket.tokenPayload = result.payload;

      // Enregistrer la connexion
      registerConnection(socket);

      next();
    }).catch(error => {
      console.error('[WSAuth] Verification error:', error);
      next(new Error('Authentication failed'));
    });
  }

  /**
   * Gestionnaire d'événements d'authentification
   * Pour authentification post-connexion
   */
  function handleAuthEvents(socket) {
    // Timer d'authentification
    let authTimer = null;

    if (!socket.user) {
      // Démarrer le timer d'authentification
      authTimer = setTimeout(() => {
        if (!socket.user) {
          socket.emit('auth:timeout', { message: 'Authentication timeout' });
          socket.disconnect(true);
        }
      }, WS_AUTH_CONFIG.authTimeout * 1000);
    }

    // Événement d'authentification
    socket.on('auth:authenticate', async (data, callback) => {
      const { token } = data;

      if (!token) {
        return callback?.({ success: false, error: 'Token required' });
      }

      const result = await verifyWSToken(token);

      if (!result.valid) {
        callback?.({ success: false, error: result.error.message });
        socket.disconnect(true);
        return;
      }

      // Annuler le timer d'authentification
      if (authTimer) {
        clearTimeout(authTimer);
        authTimer = null;
      }

      // Vérifier les connexions existantes
      const userId = result.payload.userId;
      const userConnections = activeConnections.get(userId) || new Set();

      if (userConnections.size >= WS_AUTH_CONFIG.maxConnectionsPerUser) {
        callback?.({ success: false, error: 'Maximum connections reached' });
        socket.disconnect(true);
        return;
      }

      // Configurer le socket
      socket.user = result.user;
      socket.userId = userId;
      socket.tokenPayload = result.payload;

      // Enregistrer la connexion
      registerConnection(socket);

      // Joindre les rooms autorisées
      if (result.payload.rooms?.length > 0) {
        result.payload.rooms.forEach(room => {
          socket.join(room);
        });
      }

      // Joindre la room de l'utilisateur
      socket.join(`user:${userId}`);

      // Joindre la room du tenant si applicable
      if (result.payload.companyId) {
        socket.join(`tenant:${result.payload.companyId}`);
      }

      callback?.({
        success: true,
        userId,
        rooms: Array.from(socket.rooms)
      });

      socket.emit('auth:success', {
        userId,
        config: {
          heartbeatInterval: WS_AUTH_CONFIG.heartbeatInterval
        }
      });
    });

    // Déconnexion
    socket.on('disconnect', () => {
      unregisterConnection(socket);
    });
  }

  // ============================================
  // GESTION DES CONNEXIONS
  // ============================================

  /**
   * Enregistrer une nouvelle connexion
   */
  function registerConnection(socket) {
    const userId = socket.userId;
    const socketId = socket.id;

    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, new Set());
    }
    activeConnections.get(userId).add(socketId);
    socketToUser.set(socketId, userId);

    connectionMetadata.set(socketId, {
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      messageCount: 0,
      lastMessageTime: null
    });

    // Logger la connexion
    logConnection(userId, socketId, 'connected');
  }

  /**
   * Désenregistrer une connexion
   */
  function unregisterConnection(socket) {
    const userId = socket.userId;
    const socketId = socket.id;

    if (userId && activeConnections.has(userId)) {
      activeConnections.get(userId).delete(socketId);
      if (activeConnections.get(userId).size === 0) {
        activeConnections.delete(userId);
      }
    }

    socketToUser.delete(socketId);
    connectionMetadata.delete(socketId);

    // Logger la déconnexion
    if (userId) {
      logConnection(userId, socketId, 'disconnected');
    }
  }

  /**
   * Logger une connexion/déconnexion
   */
  async function logConnection(userId, socketId, action) {
    try {
      const db = getDb();
      await db.collection('ws_connection_logs').insertOne({
        _id: new ObjectId(),
        userId,
        socketId,
        action,
        timestamp: new Date(),
        activeConnections: activeConnections.get(userId)?.size || 0
      });
    } catch (error) {
      console.error('[WSAuth] Log connection error:', error);
    }
  }

  // ============================================
  // HEARTBEAT
  // ============================================

  /**
   * Configurer le heartbeat pour un socket
   */
  function setupHeartbeat(socket) {
    let heartbeatTimer = null;
    let missedHeartbeats = 0;

    // Envoyer un ping périodique
    heartbeatTimer = setInterval(() => {
      if (missedHeartbeats >= 3) {
        console.log(`[WSAuth] Too many missed heartbeats for ${socket.id}, disconnecting`);
        clearInterval(heartbeatTimer);
        socket.disconnect(true);
        return;
      }

      socket.emit('ping');
      missedHeartbeats++;
    }, WS_AUTH_CONFIG.heartbeatInterval * 1000);

    // Recevoir les pongs
    socket.on('pong', () => {
      missedHeartbeats = 0;
      const metadata = connectionMetadata.get(socket.id);
      if (metadata) {
        metadata.lastHeartbeat = new Date();
      }
    });

    // Nettoyer à la déconnexion
    socket.on('disconnect', () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    });
  }

  // ============================================
  // RATE LIMITING
  // ============================================

  /**
   * Middleware de rate limiting pour les messages
   */
  function rateLimitMiddleware(socket, next) {
    const metadata = connectionMetadata.get(socket.id);
    if (!metadata) {
      return next();
    }

    const now = Date.now();
    const windowStart = metadata.lastMessageTime || now - 1000;
    const elapsed = now - windowStart;

    if (elapsed < 1000) {
      // Dans la même seconde
      if (metadata.messageCount >= WS_AUTH_CONFIG.messageRateLimit) {
        socket.emit('error', { code: 'RATE_LIMITED', message: 'Too many messages' });
        return; // Ne pas appeler next()
      }
      metadata.messageCount++;
    } else {
      // Nouvelle seconde
      metadata.messageCount = 1;
      metadata.lastMessageTime = now;
    }

    next();
  }

  // ============================================
  // GESTION DES ROOMS
  // ============================================

  /**
   * Joindre une room (avec vérification des permissions)
   */
  async function joinRoom(socket, roomName) {
    // Vérifier les permissions
    const canJoin = await checkRoomPermission(socket.userId, roomName);

    if (!canJoin) {
      socket.emit('room:error', {
        room: roomName,
        error: 'Permission denied'
      });
      return false;
    }

    socket.join(roomName);
    socket.emit('room:joined', { room: roomName });

    return true;
  }

  /**
   * Quitter une room
   */
  function leaveRoom(socket, roomName) {
    socket.leave(roomName);
    socket.emit('room:left', { room: roomName });
  }

  /**
   * Vérifier les permissions d'accès à une room
   */
  async function checkRoomPermission(userId, roomName) {
    // Logique de permission selon le type de room
    if (roomName.startsWith('user:')) {
      // Room personnelle - vérifier que c'est bien l'utilisateur
      return roomName === `user:${userId}`;
    }

    if (roomName.startsWith('tenant:')) {
      // Room de tenant - vérifier l'appartenance
      const tenantId = roomName.split(':')[1];
      const db = getDb();
      const user = await db.collection('users').findOne({
        _id: new ObjectId(userId),
        $or: [
          { companyId: tenantId },
          { industrielId: tenantId },
          { 'linkedAccounts': tenantId }
        ]
      });
      return !!user;
    }

    if (roomName.startsWith('order:')) {
      // Room d'un ordre de transport - vérifier l'accès
      const orderId = roomName.split(':')[1];
      const db = getDb();
      const order = await db.collection('transport_orders').findOne({
        _id: new ObjectId(orderId),
        $or: [
          { createdBy: new ObjectId(userId) },
          { industrielId: new ObjectId(userId) },
          { carrierId: new ObjectId(userId) },
          { 'participants': new ObjectId(userId) }
        ]
      });
      return !!order;
    }

    // Par défaut, refuser
    return false;
  }

  // ============================================
  // BROADCAST
  // ============================================

  /**
   * Envoyer un message à un utilisateur spécifique
   */
  function sendToUser(userId, event, data) {
    if (io) {
      io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Envoyer un message à un tenant
   */
  function sendToTenant(tenantId, event, data) {
    if (io) {
      io.to(`tenant:${tenantId}`).emit(event, data);
    }
  }

  /**
   * Envoyer un message à une room
   */
  function sendToRoom(roomName, event, data) {
    if (io) {
      io.to(roomName).emit(event, data);
    }
  }

  // ============================================
  // RÉVOCATION
  // ============================================

  /**
   * Révoquer un token WebSocket
   */
  async function revokeToken(tokenId) {
    const db = getDb();
    await db.collection('ws_tokens').updateOne(
      { tokenId },
      {
        $set: {
          isActive: false,
          revokedAt: new Date()
        }
      }
    );
  }

  /**
   * Déconnecter toutes les sessions d'un utilisateur
   */
  function disconnectUser(userId, reason = 'session_invalidated') {
    const userConnections = activeConnections.get(userId);
    if (!userConnections || !io) return;

    io.to(`user:${userId}`).emit('auth:revoked', { reason });

    userConnections.forEach(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });
  }

  // ============================================
  // STATISTIQUES
  // ============================================

  /**
   * Obtenir les statistiques de connexion
   */
  function getConnectionStats() {
    let totalConnections = 0;
    const userCount = activeConnections.size;

    activeConnections.forEach(connections => {
      totalConnections += connections.size;
    });

    return {
      totalConnections,
      uniqueUsers: userCount,
      averageConnectionsPerUser: userCount > 0 ? totalConnections / userCount : 0,
      maxConnectionsPerUser: WS_AUTH_CONFIG.maxConnectionsPerUser
    };
  }

  /**
   * Lister les connexions actives d'un utilisateur
   */
  function getUserConnections(userId) {
    const connections = activeConnections.get(userId);
    if (!connections) return [];

    return Array.from(connections).map(socketId => {
      const metadata = connectionMetadata.get(socketId);
      return {
        socketId,
        connectedAt: metadata?.connectedAt,
        lastHeartbeat: metadata?.lastHeartbeat,
        messageCount: metadata?.messageCount || 0
      };
    });
  }

  // ============================================
  // NETTOYAGE
  // ============================================

  /**
   * Nettoyer les tokens expirés
   */
  async function cleanupExpiredTokens() {
    const db = getDb();
    const result = await db.collection('ws_tokens').deleteMany({
      expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
  }

  // ============================================
  // RETURN SERVICE
  // ============================================

  return {
    // Configuration
    WS_AUTH_CONFIG,

    // Tokens
    generateWSToken,
    verifyWSToken,
    revokeToken,

    // Middleware Socket.IO
    socketAuthMiddleware,
    handleAuthEvents,
    setupHeartbeat,
    rateLimitMiddleware,

    // Rooms
    joinRoom,
    leaveRoom,
    checkRoomPermission,

    // Broadcast
    sendToUser,
    sendToTenant,
    sendToRoom,

    // Connexions
    registerConnection,
    unregisterConnection,
    disconnectUser,
    getUserConnections,
    getConnectionStats,

    // Maintenance
    cleanupExpiredTokens
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  WS_AUTH_CONFIG,
  createWebSocketAuthService
};
