/**
 * SYMPHONI.A - Logistician API Complete
 *
 * Modules:
 * 1. Integration Stripe (options payantes)
 * 2. Gestion Sub-Utilisateurs (equipe)
 * 3. Webhooks Bidirectionnels (notifications temps reel)
 * 4. Alertes Capacite Entrepot
 * 5. Tracking Logisticien (chauffeurs en approche)
 * 6. Facturation Complete (prefactures, factures)
 *
 * @version 1.0.0
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer } from 'ws';
import cron from 'node-cron';
import PDFDocument from 'pdfkit';

// Import routes
import stripeRoutes from './routes/stripe.routes.js';
import teamRoutes from './routes/team.routes.js';
import capacityRoutes from './routes/capacity.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import etaRequestRoutes from './routes/eta-request.routes.js';
import billingRoutes from './routes/billing.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import ecmrRoutes from './routes/ecmr.routes.js';

const app = express();
const PORT = process.env.PORT || 3010;

// ===========================================
// CONFIGURATION
// ===========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rt_admin:RtAdmin2024@stagingrt.v2jnoh2.mongodb.net/rt-technologie?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'symphonia-logistician-secret-2025';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// ===========================================
// MIDDLEWARE
// ===========================================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://logistician.symphonia-controltower.com',
    'https://industry.symphonia-controltower.com',
    'https://transporter.symphonia-controltower.com'
  ],
  credentials: true
}));

// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));

// ===========================================
// DATABASE CONNECTION
// ===========================================
let db = null;
let mongoClient = null;

async function connectDB() {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db('rt-technologie');
    console.log('[LOGISTICIAN-API] MongoDB connected');

    // Create indexes
    await createIndexes();

    return db;
  } catch (error) {
    console.error('[LOGISTICIAN-API] MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function createIndexes() {
  try {
    // Team members
    await db.collection('logistician_team_members').createIndex({ logisticianId: 1 });
    await db.collection('logistician_team_members').createIndex({ email: 1 });
    await db.collection('logistician_team_members').createIndex({ invitationToken: 1 });

    // Subscriptions
    await db.collection('logistician_subscriptions').createIndex({ logisticianId: 1 });
    await db.collection('logistician_subscriptions').createIndex({ stripeSubscriptionId: 1 });

    // Capacity
    await db.collection('warehouse_capacity').createIndex({ warehouseId: 1 });
    await db.collection('warehouse_capacity').createIndex({ logisticianId: 1 });
    await db.collection('warehouse_capacity_alerts').createIndex({ warehouseId: 1, resolvedAt: 1 });

    // Billing
    await db.collection('logistician_prefactures').createIndex({ logisticianId: 1 });
    await db.collection('logistician_prefactures').createIndex({ industryId: 1 });
    await db.collection('logistician_invoices').createIndex({ issuerId: 1 });
    await db.collection('logistician_invoices').createIndex({ recipientId: 1 });

    // Events
    await db.collection('webhook_events').createIndex({ createdAt: -1 });
    await db.collection('webhook_events').createIndex({ eventType: 1 });

    console.log('[LOGISTICIAN-API] Indexes created');
  } catch (error) {
    console.error('[LOGISTICIAN-API] Error creating indexes:', error.message);
  }
}

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  req.mongoClient = mongoClient;
  next();
});

// ===========================================
// AUTHENTICATION MIDDLEWARE
// ===========================================
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token invalide' });
  }
}

export function authenticateLogistician(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.portal !== 'logistician') {
      return res.status(403).json({ error: 'Acces logisticien requis' });
    }
    next();
  });
}

// ===========================================
// HEALTH CHECK
// ===========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'logistician-api',
    version: '1.0.0',
    mongodb: db ? 'connected' : 'disconnected',
    stripe: STRIPE_SECRET_KEY ? 'configured' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// ===========================================
// MOUNT ROUTES
// ===========================================
app.use('/api/logisticians', stripeRoutes);
app.use('/api/logisticians', teamRoutes);
app.use('/api/logisticians', capacityRoutes);
app.use('/api/logisticians', trackingRoutes);
app.use('/api/logisticians', etaRequestRoutes);
app.use('/api', etaRequestRoutes);
app.use('/api/logisticians', billingRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api', ecmrRoutes);

// Stripe webhook (special route)
app.use('/api/stripe', stripeRoutes);

// ===========================================
// ERROR HANDLER
// ===========================================
app.use((err, req, res, next) => {
  console.error('[LOGISTICIAN-API] Error:', err);
  res.status(500).json({
    error: 'Erreur serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===========================================
// WEBSOCKET SERVER
// ===========================================
let wss = null;
const wsClients = new Map(); // logisticianId -> Set of WebSocket connections

function setupWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/logistician' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Token requis');
      return;
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const logisticianId = decoded.organizationId;

      // Store connection
      if (!wsClients.has(logisticianId)) {
        wsClients.set(logisticianId, new Set());
      }
      wsClients.get(logisticianId).add(ws);

      console.log(`[WS] Client connected: ${logisticianId}`);

      ws.on('close', () => {
        const clients = wsClients.get(logisticianId);
        if (clients) {
          clients.delete(ws);
          if (clients.size === 0) {
            wsClients.delete(logisticianId);
          }
        }
        console.log(`[WS] Client disconnected: ${logisticianId}`);
      });

      ws.on('message', (data) => {
        // Handle ping/pong
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch (e) {
          // Ignore invalid messages
        }
      });

    } catch (error) {
      ws.close(4003, 'Token invalide');
    }
  });

  console.log('[LOGISTICIAN-API] WebSocket server started');
}

// Export function to send notifications
export function notifyLogistician(logisticianId, event) {
  const clients = wsClients.get(logisticianId.toString());
  if (clients) {
    const message = JSON.stringify(event);
    clients.forEach(ws => {
      if (ws.readyState === 1) { // OPEN
        ws.send(message);
      }
    });
  }
}

// ===========================================
// CRON JOBS
// ===========================================
function setupCronJobs() {
  // Check capacity alerts every hour
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Running capacity check...');
    try {
      const { checkAllWarehouseCapacity } = await import('./services/capacity.service.js');
      await checkAllWarehouseCapacity(db);
    } catch (error) {
      console.error('[CRON] Capacity check error:', error.message);
    }
  });

  // Generate monthly prefactures on 1st of each month
  cron.schedule('0 2 1 * *', async () => {
    console.log('[CRON] Generating monthly prefactures...');
    try {
      const { generateMonthlyPrefactures } = await import('./services/billing.service.js');
      await generateMonthlyPrefactures(db);
    } catch (error) {
      console.error('[CRON] Prefacture generation error:', error.message);
    }
  });

  // Check invoice payment reminders daily at 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Checking invoice reminders...');
    try {
      const { checkInvoiceReminders } = await import('./services/billing.service.js');
      await checkInvoiceReminders(db);
    } catch (error) {
      console.error('[CRON] Invoice reminder error:', error.message);
    }
  });

  console.log('[LOGISTICIAN-API] Cron jobs scheduled');
}

// ===========================================
// START SERVER
// ===========================================
async function startServer() {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[LOGISTICIAN-API] Server running on port ${PORT}`);
  });

  setupWebSocket(server);
  setupCronJobs();
}

startServer();

export { db, mongoClient };
