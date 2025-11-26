/**
 * SYMPHONI.A WebSocket API Server
 * Serveur WebSocket temps réel pour la gestion des événements de transport
 *
 * Architecture événementielle pour:
 * - Suivi des commandes en temps réel
 * - Notifications instantanées
 * - Tracking GPS et géofencing
 * - Communication transporteur/donneur d'ordre
 */

require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Importer les modules personnalisés
const { authenticateSocket } = require('./src/auth');
const { setupEventHandlers, EVENTS } = require('./src/events');

// Configuration
const PORT = process.env.PORT || 3010;
const MONGODB_URI = process.env.MONGODB_URI;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];

// Initialisation Express
const app = express();
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json());

// Créer le serveur HTTP
const httpServer = createServer(app);

// Configurer Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: parseInt(process.env.CONNECTION_TIMEOUT) || 60000,
  pingInterval: parseInt(process.env.HEARTBEAT_INTERVAL) || 30000,
  transports: ['websocket', 'polling']
});

// Middleware d'authentification Socket.io
io.use(authenticateSocket);

// Gestion des connexions
io.on('connection', (socket) => {
  const user = socket.user;

  console.log(`[SOCKET] New connection: ${user.email} (Socket ID: ${socket.id})`);

  // Configurer les gestionnaires d'événements pour ce socket
  setupEventHandlers(io, socket);

  // Envoyer un événement de confirmation de connexion
  socket.emit(EVENTS.CONNECTION_STATUS, {
    status: 'connected',
    userId: user.id,
    timestamp: Date.now(),
    message: 'Successfully connected to SYMPHONI.A WebSocket server'
  });
});

// Connexion MongoDB
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('[MONGODB] Connected successfully');
    })
    .catch((error) => {
      console.error('[MONGODB] Connection failed:', error);
    });
} else {
  console.warn('[MONGODB] No MONGODB_URI provided, running without database');
}

// Route de health check
app.get('/health', (req, res) => {
  const connectedSockets = io.sockets.sockets.size;

  res.json({
    status: 'healthy',
    service: 'websocket-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    connections: {
      active: connectedSockets,
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    },
    uptime: process.uptime()
  });
});

// Route pour obtenir les statistiques
app.get('/stats', (req, res) => {
  const connectedSockets = io.sockets.sockets.size;
  const rooms = new Set();

  // Collecter toutes les rooms actives
  io.sockets.adapter.rooms.forEach((_, roomName) => {
    if (!roomName.includes('-')) { // Exclure les rooms internes de Socket.io
      rooms.add(roomName);
    }
  });

  res.json({
    connections: {
      total: connectedSockets,
      activeRooms: rooms.size
    },
    mongodb: {
      status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      host: mongoose.connection.host
    },
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version
    }
  });
});

// API REST pour émettre des événements (utilisé par les autres services)
app.post('/api/v1/emit', express.json(), (req, res) => {
  try {
    const { eventName, data, target } = req.body;

    if (!eventName || !data) {
      return res.status(400).json({
        success: false,
        error: 'eventName and data are required'
      });
    }

    // Émettre l'événement selon la cible
    if (target?.type === 'user' && target.id) {
      io.to(`user:${target.id}`).emit(eventName, {
        ...data,
        timestamp: Date.now()
      });
    } else if (target?.type === 'organization' && target.id) {
      io.to(`org:${target.id}`).emit(eventName, {
        ...data,
        timestamp: Date.now()
      });
    } else if (target?.type === 'order' && target.id) {
      io.to(`order:${target.id}`).emit(eventName, {
        ...data,
        timestamp: Date.now()
      });
    } else if (target?.type === 'room' && target.name) {
      io.to(target.name).emit(eventName, {
        ...data,
        timestamp: Date.now()
      });
    } else {
      // Broadcast global si pas de cible spécifique
      io.emit(eventName, {
        ...data,
        timestamp: Date.now()
      });
    }

    res.json({
      success: true,
      message: `Event ${eventName} emitted successfully`,
      target: target || 'global'
    });
  } catch (error) {
    console.error('[API] Error emitting event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Liste des événements disponibles
app.get('/api/v1/events', (req, res) => {
  res.json({
    success: true,
    events: EVENTS,
    documentation: 'https://docs.symphonia.com/websocket-events'
  });
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
  console.log('[SERVER] SIGTERM received, closing server gracefully...');

  httpServer.close(() => {
    console.log('[SERVER] HTTP server closed');

    mongoose.connection.close(false, () => {
      console.log('[MONGODB] Connection closed');
      process.exit(0);
    });
  });
});

// Démarrage du serveur
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║         SYMPHONI.A WebSocket API Server                      ║
║                                                               ║
║  Status:     Running                                         ║
║  Port:       ${PORT}                                              ║
║  Env:        ${process.env.NODE_ENV || 'development'}                                     ║
║  MongoDB:    ${MONGODB_URI ? 'Connected' : 'Disabled'}                                     ║
║                                                               ║
║  Health:     http://localhost:${PORT}/health                      ║
║  Stats:      http://localhost:${PORT}/stats                       ║
║  Events:     http://localhost:${PORT}/api/v1/events               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

// Exporter pour les tests
module.exports = { app, io, httpServer };
