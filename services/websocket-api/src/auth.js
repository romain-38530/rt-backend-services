/**
 * Middleware d'authentification JWT pour Socket.io
 * Vérifie et décode les tokens JWT pour authentifier les connexions WebSocket
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification Socket.io
 * @param {Object} socket - Instance socket.io
 * @param {Function} next - Fonction de continuation
 */
const authenticateSocket = (socket, next) => {
  try {
    // Récupérer le token depuis les paramètres de connexion
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token missing'));
    }

    // Vérifier et décoder le token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attacher les informations utilisateur au socket
    socket.user = {
      id: decoded.userId || decoded.sub,
      email: decoded.email,
      organizationId: decoded.organizationId,
      role: decoded.role,
      accountType: decoded.accountType
    };

    // Logger la connexion
    console.log(`[AUTH] User connected: ${socket.user.email} (${socket.user.id})`);

    next();
  } catch (error) {
    console.error('[AUTH] Authentication failed:', error.message);

    if (error.name === 'TokenExpiredError') {
      return next(new Error('Token expired'));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new Error('Invalid token'));
    }

    return next(new Error('Authentication failed'));
  }
};

/**
 * Vérifie si l'utilisateur a accès à une ressource spécifique
 * @param {Object} user - Informations utilisateur
 * @param {String} resourceType - Type de ressource (order, carrier, etc.)
 * @param {String} resourceId - ID de la ressource
 * @returns {Boolean}
 */
const checkResourceAccess = (user, resourceType, resourceId) => {
  // Les admins ont accès à tout
  if (user.role === 'admin' || user.role === 'superadmin') {
    return true;
  }

  // Logique d'accès basée sur l'organisation
  // À adapter selon vos besoins spécifiques
  return true;
};

/**
 * Vérifie les permissions pour rejoindre une room
 * @param {Object} socket - Instance socket.io
 * @param {String} roomName - Nom de la room
 * @returns {Boolean}
 */
const canJoinRoom = (socket, roomName) => {
  const user = socket.user;

  // Format de room attendu: type:id (ex: "order:123", "org:456")
  const [roomType, roomId] = roomName.split(':');

  switch (roomType) {
    case 'user':
      // Seul l'utilisateur peut rejoindre sa propre room
      return roomId === user.id;

    case 'org':
    case 'organization':
      // L'utilisateur doit appartenir à l'organisation
      return roomId === user.organizationId;

    case 'order':
      // Vérifier l'accès à la commande (simplifié ici)
      return checkResourceAccess(user, 'order', roomId);

    case 'carrier':
      // Les transporteurs peuvent rejoindre leur propre room
      return user.accountType === 'carrier' && roomId === user.organizationId;

    case 'global':
      // Room globale pour les admins
      return user.role === 'admin' || user.role === 'superadmin';

    default:
      return false;
  }
};

module.exports = {
  authenticateSocket,
  checkResourceAccess,
  canJoinRoom
};
