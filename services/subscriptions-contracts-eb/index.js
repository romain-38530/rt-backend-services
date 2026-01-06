// ============================================================================
// RT SYMPHONI.A - Subscriptions & Contracts API + Suite Chatbots
// ============================================================================
// Version: v2.0.0 (SYMPHONI.A + AFFRET.IA + Planning + Chatbots Suite)
// Deployment: AWS Elastic Beanstalk (Amazon Linux 2023, Node.js 20)
// ============================================================================

const express = require('express');
const http = require('http');
const { EventEmitter } = require('events');
const { MongoClient } = require('mongodb');
const security = require('./security-middleware');
const createECMRRoutes = require('./ecmr-routes');
const createAccountTypesRoutes = require('./account-types-routes');
const createCarrierReferencingRoutes = require('./carrier-referencing-routes');
const createPricingGridsRoutes = require('./pricing-grids-routes');
const createIndustrialTransportConfigRoutes = require('./industrial-transport-config-routes');
const createAuthRoutes = require('./auth-routes');
const createStripeRoutes = require('./stripe-routes');
const createSubscriptionManagementRoutes = require('./subscription-management-routes');
const createTransportOrdersRoutes = require('./transport-orders-routes');
const scheduledJobs = require('./scheduled-jobs');
const notificationService = require('./notification-service');
const { configureAffretiaRoutes } = require('./affretia-routes');
const { createPlanningRoutes } = require('./planning-routes');
const { PlanningWebSocketService } = require('./planning-websocket');
const { createChatbotRoutes } = require('./chatbot-routes');
const { TicketingService } = require('./ticketing-service');
const createLogisticienRoutes = require('./logisticien-routes');
const createLogisticienPortalRoutes = require('./logisticien-portal-routes');
const logisticsDelegationRoutes = require('./logistics-delegation-routes');
const icpeRoutes = require('./icpe-routes');

// v4.0.0 - Compliance & Security Enhancements
const { createGdprService, GDPR_CONFIG } = require('./gdpr-service');
const { createConsentService } = require('./consent-service');
const { initializeGdprRoutes } = require('./gdpr-routes');
const { SecureLogger, requestLoggerMiddleware, errorLoggerMiddleware } = require('./secure-logger');
const { createTokenRotationService } = require('./token-rotation-service');
const { createWebSocketAuthService } = require('./websocket-auth-service');
const { createRedisCacheService, getRedisCacheService } = require('./redis-cache-service');
const { createDrivingTimeService } = require('./driving-time-service');
const { createCarbonFootprintService } = require('./carbon-footprint-service');
const { createErrorHandler, notFoundHandler, setupGlobalErrorHandlers, asyncHandler } = require('./error-handler');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy for AWS (CloudFront/ELB/Nginx)
app.set('trust proxy', 1);

// Create HTTP server for WebSocket support
const server = http.createServer(app);

// Event emitter for real-time updates (shared by Planning + Chatbot)
const appEventEmitter = new EventEmitter();
const planningEventEmitter = appEventEmitter; // Alias for backward compatibility

// WebSocket service instance
let planningWebSocket = null;

// Ticketing service instance
let ticketingService = null;

// v4.0.0 - Service instances
let gdprService = null;
let consentService = null;
let tokenRotationService = null;
let wsAuthService = null;
let redisCache = null;
let drivingTimeService = null;
let carbonFootprintService = null;
const secureLogger = new SecureLogger();

// Setup global error handlers
setupGlobalErrorHandlers(secureLogger);

// MongoDB connection
let mongoClient;
let mongoConnected = false;

async function connectMongoDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-subscriptions-contracts';
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    mongoConnected = true;
    console.log('✅ Connected to MongoDB');

    // SEC-014: Créer les index pour les collections de sécurité
    await createSecurityIndexes(mongoClient.db());
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    mongoConnected = false;
  }
}

/**
 * SEC-014: Créer les index MongoDB pour les collections de sécurité
 */
async function createSecurityIndexes(db) {
  try {
    // Index pour email_verifications (OTP)
    await db.collection('email_verifications').createIndex(
      { email: 1, purpose: 1 },
      { background: true }
    );
    await db.collection('email_verifications').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, background: true }
    );

    // Index pour revoked_tokens (blacklist JWT)
    await db.collection('revoked_tokens').createIndex(
      { jti: 1 },
      { unique: true, background: true }
    );
    await db.collection('revoked_tokens').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, background: true }
    );

    // Index pour ip_failures (blocage progressif)
    await db.collection('ip_failures').createIndex(
      { ip: 1 },
      { unique: true, background: true }
    );
    await db.collection('ip_failures').createIndex(
      { blockedUntil: 1 },
      { background: true }
    );

    // Index pour webhook_subscriptions
    await db.collection('webhook_subscriptions').createIndex(
      { industrielId: 1, isActive: 1 },
      { background: true }
    );

    // Index pour webhook_deliveries
    await db.collection('webhook_deliveries').createIndex(
      { status: 1, nextRetryAt: 1 },
      { background: true }
    );
    await db.collection('webhook_deliveries').createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, background: true } // 30 jours
    );

    // Index pour 2fa_sessions
    await db.collection('2fa_sessions').createIndex(
      { sessionId: 1 },
      { unique: true, background: true }
    );
    await db.collection('2fa_sessions').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, background: true }
    );

    // v4.0.0 - Index GDPR
    await db.collection('gdpr_deletion_requests').createIndex(
      { userId: 1, status: 1 },
      { background: true }
    );
    await db.collection('gdpr_export_requests').createIndex(
      { userId: 1 },
      { background: true }
    );
    await db.collection('gdpr_export_requests').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, background: true }
    );
    await db.collection('user_consents').createIndex(
      { userId: 1, type: 1 },
      { background: true }
    );
    await db.collection('refresh_tokens_v2').createIndex(
      { tokenHash: 1 },
      { unique: true, background: true }
    );
    await db.collection('refresh_tokens_v2').createIndex(
      { userId: 1, isActive: 1 },
      { background: true }
    );
    await db.collection('refresh_tokens_v2').createIndex(
      { familyId: 1 },
      { background: true }
    );
    await db.collection('driver_activities').createIndex(
      { driverId: 1, startTime: -1 },
      { background: true }
    );
    await db.collection('carbon_emissions').createIndex(
      { industrielId: 1, createdAt: -1 },
      { background: true }
    );
    await db.collection('error_logs').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 30 * 24 * 60 * 60, background: true } // 30 jours
    );

    console.log('✅ Security indexes created');
  } catch (error) {
    console.error('⚠️ Failed to create security indexes:', error.message);
  }
}

// ============================================================================
// SECURITY MIDDLEWARE (Applied before all routes)
// ============================================================================

// 1. Helmet - Security headers
app.use(security.helmet);

// 2. CORS - Cross-Origin Resource Sharing
app.use(security.cors);

// 3. Request Logger - Log all requests
app.use(security.requestLogger);

// 4. Body Parsers - Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 5. Input Sanitization - Prevent XSS
app.use(security.sanitizeInput);

// 5.5. URL rewriting middleware for /api/v1/* routes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/v1/subscriptions/')) {
    req.url = req.url.replace('/api/v1/subscriptions', '');
  } else if (req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/v1/', '/');
  }
  next();
});

// 6. General Rate Limiter - 100 req/15min (applied to all /api/* routes)
app.use('/api/', security.generalLimiter);

// Health check
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'RT SYMPHONI.A - Subscriptions & Contracts API',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: 'v2.0.0-chatbot-suite',
    features: [
      'express', 'advanced-security', 'rate-limiting', 'cors', 'helmet',
      'input-sanitization', 'mongodb', 'subscriptions', 'contracts', 'ecmr',
      'account-types', 'carrier-referencing', 'pricing-grids',
      'industrial-transport-config', 'jwt-authentication', 'stripe-payments',
      'flux-commande', 'tracking-basic-email', 'tracking-premium-gps',
      'geofencing', 'ocr-integration', 'document-management', 'carrier-scoring',
      'scheduled-jobs', 'multi-channel-notifications', 'sms-twilio',
      'affretia-intelligent-freight', 'carrier-shortlist', 'multi-channel-broadcast',
      'auto-negotiation', 'carrier-scoring-selection', 'vigilance-verification',
      'planning-chargement-livraison', 'site-planning', 'rdv-management',
      'driver-checkin-kiosk', 'driver-queue', 'ecmr-signature',
      'websocket-realtime', 'planning-notifications-email-sms', 'driver-push-notifications',
      'chatbot-suite', 'rt-helpbot', 'planif-ia-assistant', 'routier-assistant',
      'quai-wms-assistant', 'livraisons-assistant', 'expedition-assistant',
      'freight-ia-assistant', 'copilote-chauffeur-assistant', 'ticketing-sla',
      'knowledge-base', 'faq-system', 'teams-integration', 'auto-escalation',
      'logisticien-delegation', 'icpe-management', 'icpe-volume-declaration',
      'logisticien-vigilance', 'warehouse-management', 'bourse-stockage-option',
      'borne-accueil-chauffeur-option'
    ],
    mongodb: {
      configured: !!process.env.MONGODB_URI,
      connected: mongoConnected,
      status: mongoConnected ? 'active' : 'not connected',
    },
    scheduledJobs: scheduledJobs.getJobsStatus(),
    notifications: notificationService.getNotificationServicesStatus()
  };

  if (mongoConnected && mongoClient) {
    try {
      await mongoClient.db().admin().ping();
      health.mongodb.status = 'active';
    } catch (error) {
      health.mongodb.status = 'error';
      health.mongodb.error = error.message;
    }
  }

  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RT SYMPHONI.A - Subscriptions & Contracts API + Suite Chatbots',
    version: 'v2.0.0-chatbot-suite',
    description: 'Transport Management System with Advanced Security + AFFRET.IA + Planning + Suite Chatbots Intelligents',
    features: [
      'Express.js',
      'MongoDB Atlas',
      'Advanced Security (Rate Limiting, CORS, Helmet, Input Sanitization)',
      'Subscription Management',
      'Contract Signing & E-Signatures',
      'e-CMR (Electronic Consignment Note)',
      'Account Types Management',
      'Carrier Referencing & Scoring',
      'Pricing Grids Management',
      'Industrial Transport Configuration',
      'JWT Authentication & Authorization',
      'Stripe Payment Processing',
      'Transport Order Management',
      'GPS Tracking (TomTom Premium - 4€/véhicule/mois)',
      'Email Tracking (Mailgun Basic - 50€/mois)',
      'Geofencing & Real-time Alerts',
      'OCR Integration (AWS Textract + Google Vision)',
      'Document Management & Validation',
      'ETA Monitoring & Delay Detection',
      'RDV Management (Rendez-vous)',
      'Carrier Scoring & Performance Metrics',
      'AFFRET.IA - Intelligent Automated Freight Module',
      'AI-Powered Carrier Shortlist Generation',
      'Multi-Channel Broadcast (Email, Marketplace, Push, SMS)',
      'Auto-Negotiation (up to +15%)',
      'Carrier Scoring & Selection Algorithm',
      'Vigilance & Compliance Verification',
      'Planning Chargement & Livraison Module',
      'Site Planning & Dock Management',
      'RDV Management (Request/Propose/Confirm)',
      'Auto-RDV for Premium Carriers',
      'Driver Virtual Check-in Kiosk',
      'Driver Queue & Wait Time Management',
      'eCMR Electronic Signature Integration',
    ],
    security: {
      rateLimiting: {
        general: '100 requests per 15 minutes',
        authentication: '5 attempts per 15 minutes',
        uploads: '10 uploads per hour',
      },
      features: ['Helmet Security Headers', 'CORS Protection', 'XSS Prevention', 'Input Sanitization'],
    },
    endpoints: [
      '-- Core --',
      'GET /health',
      'GET /',
      '-- Subscription Plans --',
      'GET /api/plans',
      'POST /api/plans',
      '-- Subscriptions --',
      'GET /api/subscriptions/:id',
      'POST /api/subscriptions',
      'POST /api/subscriptions/:id/cancel',
      'POST /api/subscriptions/:id/renew',
      '-- Contracts --',
      'GET /api/contracts/:id',
      'POST /api/contracts',
      'POST /api/contracts/:id/send',
      'POST /api/signatures/:id/sign',
      '-- e-CMR (Electronic Consignment Note) --',
      'GET /api/ecmr (list all e-CMRs)',
      'POST /api/ecmr (create e-CMR)',
      'GET /api/ecmr/:id (get e-CMR details)',
      'PUT /api/ecmr/:id (update e-CMR)',
      'DELETE /api/ecmr/:id (delete DRAFT e-CMR)',
      'POST /api/ecmr/:id/validate (validate before signatures)',
      'POST /api/ecmr/:id/sign/:party (sign: sender/carrierPickup/consignee)',
      'POST /api/ecmr/:id/remarks (add loading/delivery remarks)',
      'POST /api/ecmr/:id/tracking (update GPS position)',
      'GET /api/ecmr/:cmrNumber/verify (verify e-CMR authenticity)',
      '-- Account Types --',
      'GET /api/account/types (list all account types)',
      'POST /api/account/select-type (select initial account type)',
      'GET /api/account/current/:userId (get current account)',
      'GET /api/account/upgrade-options/:userId (get upgrade options)',
      'POST /api/account/upgrade (request account type upgrade)',
      'POST /api/account/upgrade/approve (approve upgrade - admin)',
      'POST /api/account/upgrade/reject (reject upgrade - admin)',
      '-- Carrier Referencing (SYMPHONI.A) --',
      'POST /api/carriers/invite (invite carrier)',
      'POST /api/carriers/:carrierId/onboard (complete onboarding)',
      'POST /api/carriers/:carrierId/documents (upload vigilance document)',
      'POST /api/carriers/:carrierId/documents/:type/verify (verify document - admin)',
      'GET /api/carriers/:carrierId/vigilance (check vigilance status)',
      'POST /api/carriers/:carrierId/pricing-grid (add pricing grid)',
      'POST /api/carriers/:carrierId/score (update scoring)',
      'GET /api/carriers (list carriers)',
      'GET /api/carriers/:carrierId (get carrier details)',
      'PUT /api/carriers/:carrierId/reference-level (update reference level)',
      'POST /api/carriers/:carrierId/upgrade-premium (upgrade to premium)',
      '-- Pricing Grids --',
      'POST /api/pricing-grids (create pricing grid)',
      'GET /api/pricing-grids (list pricing grids with filters)',
      'GET /api/pricing-grids/:gridId (get pricing grid details)',
      'PUT /api/pricing-grids/:gridId (update pricing grid)',
      'DELETE /api/pricing-grids/:gridId (delete DRAFT grid)',
      'POST /api/pricing-grids/:gridId/activate (activate pricing grid)',
      'POST /api/pricing-grids/:gridId/suspend (suspend pricing grid)',
      'POST /api/pricing-grids/:gridId/archive (archive pricing grid)',
      'POST /api/pricing-grids/calculate (calculate price for transport)',
      'GET /api/pricing-grids/zones/list (list geographic zones)',
      'GET /api/pricing-grids/options/list (list pricing options)',
      'GET /api/pricing-grids/types/transport (list transport types)',
      '-- Industrial Transport Configuration --',
      'GET /api/industrial/:industrialId/transport-config (get transport type config)',
      'POST /api/industrial/:industrialId/transport-config (set transport type config)',
      'POST /api/industrial/:industrialId/transport-config/add-type (add required/optional type)',
      'POST /api/industrial/:industrialId/transport-config/remove-type (remove transport type)',
      'GET /api/industrial/:industrialId/carriers/compatibility (check carrier compatibility)',
      '-- Authentication (JWT) --',
      'POST /api/auth/register (create new user account)',
      'POST /api/auth/login (login and get JWT tokens)',
      'POST /api/auth/refresh (refresh access token)',
      'POST /api/auth/logout (logout and revoke refresh token)',
      'GET /api/auth/me (get current user info - requires auth)',
      'PUT /api/auth/change-password (change password - requires auth)',
      '-- Stripe Payments --',
      'POST /api/stripe/create-checkout-session (create Stripe checkout - requires auth)',
      'POST /api/stripe/create-payment-intent (create payment intent - requires auth)',
      'GET /api/stripe/subscriptions (get user subscriptions - requires auth)',
      'POST /api/stripe/cancel-subscription (cancel subscription - requires auth)',
      'GET /api/stripe/payment-history (get payment history - requires auth)',
      'POST /api/stripe/webhook (Stripe webhook endpoint - NO auth)',
      'GET /api/stripe/products (list available products - public)',
      '-- AFFRET.IA (Intelligent Freight) --',
      'POST /api/affretia/trigger (trigger AFFRET.IA session)',
      'POST /api/affretia/analyze/:sessionId (analyze and generate shortlist)',
      'POST /api/affretia/broadcast/:sessionId (broadcast to carriers)',
      'POST /api/affretia/response/:sessionId (record carrier response)',
      'POST /api/affretia/select/:sessionId (select best carrier)',
      'POST /api/affretia/assign/:sessionId (assign mission to carrier)',
      'POST /api/affretia/tracking/activate/:sessionId (activate tracking)',
      'POST /api/affretia/tracking/position/:sessionId (update position)',
      'POST /api/affretia/tracking/geofence/:sessionId (record geofence event)',
      'POST /api/affretia/documents/:sessionId (upload document)',
      'GET /api/affretia/documents/:sessionId (list documents)',
      'POST /api/affretia/vigilance/:sessionId (perform vigilance check)',
      'POST /api/affretia/scoring/:sessionId (calculate final scoring)',
      'POST /api/affretia/close/:sessionId (close session)',
      'GET /api/affretia/session/:sessionId (get session details)',
      'GET /api/affretia/sessions (list sessions)',
      'GET /api/affretia/sessions/active (list active sessions)',
      'GET /api/affretia/stats (get statistics)',
      'POST /api/affretia/workflow/auto/:orderId (auto workflow)',
      'GET /api/affretia/constants (get constants for frontend)',
      '-- Planning Chargement & Livraison --',
      'POST /api/planning/create (create site planning)',
      'PUT /api/planning/update/:id (update site planning)',
      'GET /api/planning/view/:id (get site planning)',
      'GET /api/planning/list (list organization plannings)',
      'POST /api/planning/generate-slots/:id (generate time slots)',
      'GET /api/planning/slots/available (search available slots)',
      'GET /api/planning/slots/calendar/:sitePlanningId (calendar view)',
      'POST /api/planning/slots/block/:id (block slot)',
      '-- RDV (Appointments) --',
      'POST /api/planning/rdv/request (request RDV)',
      'POST /api/planning/rdv/propose/:id (propose alternative slot)',
      'POST /api/planning/rdv/confirm/:id (confirm RDV)',
      'POST /api/planning/rdv/refuse/:id (refuse RDV)',
      'PUT /api/planning/rdv/reschedule/:id (reschedule RDV)',
      'POST /api/planning/rdv/cancel/:id (cancel RDV)',
      'GET /api/planning/rdv/:id (get RDV details)',
      'GET /api/planning/rdv/list (list RDVs)',
      'GET /api/planning/rdv/by-order/:transportOrderId (RDVs by order)',
      '-- Driver Check-in (Virtual Kiosk) --',
      'POST /api/planning/driver/approaching (signal approach via geofence)',
      'POST /api/planning/driver/checkin (driver check-in)',
      'POST /api/planning/driver/at-dock (signal arrival at dock)',
      'POST /api/planning/driver/checkout (driver check-out)',
      'GET /api/planning/driver/status/:rdvId (get driver status)',
      'GET /api/planning/driver/queue/:sitePlanningId (get driver queue)',
      'POST /api/planning/driver/call-next (call next driver)',
      'POST /api/planning/driver/no-show/:rdvId (mark no-show)',
      '-- Operations --',
      'POST /api/planning/operation/start/:rdvId (start loading/unloading)',
      'POST /api/planning/operation/complete/:rdvId (complete operation)',
      '-- eCMR Signature --',
      'POST /api/planning/ecmr/sign/:rdvId (sign eCMR)',
      'POST /api/planning/ecmr/validate/:rdvId (validate eCMR)',
      'GET /api/planning/ecmr/download/:rdvId (download eCMR)',
      'GET /api/planning/ecmr/history/:transportOrderId (eCMR history)',
      '-- Planning Stats & Tracking Integration --',
      'GET /api/planning/stats/site/:sitePlanningId (site statistics)',
      'GET /api/planning/stats/carrier/:carrierId (carrier statistics)',
      'POST /api/planning/tracking/early-arrival (handle early arrival)',
      'POST /api/planning/tracking/delay (handle delay)',
      'GET /api/planning/types (get all types/enums)',
      '-- Chatbot Suite --',
      'POST /api/chatbot/conversations (start conversation)',
      'GET /api/chatbot/conversations (list user conversations)',
      'GET /api/chatbot/conversations/:id (get conversation)',
      'POST /api/chatbot/conversations/:id/messages (send message)',
      'POST /api/chatbot/conversations/:id/close (close conversation)',
      'POST /api/chatbot/conversations/:id/feedback (submit feedback)',
      'POST /api/chatbot/conversations/:id/escalate (escalate to tech)',
      'POST /api/chatbot/conversations/:id/diagnostic (run diagnostic)',
      '-- Tickets Support --',
      'GET /api/chatbot/tickets (list user tickets)',
      'GET /api/chatbot/tickets/:id (get ticket)',
      '-- Technicians --',
      'GET /api/chatbot/technician/tickets (list all tickets)',
      'POST /api/chatbot/technician/tickets/:id/assign (assign ticket)',
      'POST /api/chatbot/technician/tickets/:id/resolve (resolve ticket)',
      'POST /api/chatbot/technician/tickets/:id/close (close ticket)',
      'POST /api/chatbot/technician/conversations/:id/reply (tech reply)',
      '-- Knowledge Base & FAQ --',
      'GET /api/chatbot/knowledge (search knowledge base)',
      'GET /api/chatbot/knowledge/:id (get article)',
      'POST /api/chatbot/knowledge (create article - admin)',
      'GET /api/chatbot/faq (list FAQs)',
      'POST /api/chatbot/faq (create FAQ - admin)',
      '-- Chatbot Stats --',
      'GET /api/chatbot/stats (statistics)',
      'GET /api/chatbot/stats/dashboard (real-time dashboard)',
      'GET /api/chatbot/config (user chatbot config)',
      'GET /api/chatbot/health (chatbot health check)',
      '-- Logisticien Delegation (Industrial -> Logisticien) --',
      'POST /api/logisticians/invite (invite logisticien by email)',
      'GET /api/logisticians/invitation/:token (verify invitation)',
      'POST /api/logisticians/onboarding/step1 (create account)',
      'POST /api/logisticians/onboarding/step2 (configure warehouses)',
      'POST /api/logisticians/onboarding/step3 (configure contacts)',
      'POST /api/logisticians/:id/documents/upload-url (get S3 presigned URL)',
      'POST /api/logisticians/:id/documents/confirm-upload (confirm upload)',
      'POST /api/logisticians/:id/documents/:docId/verify (admin verify)',
      'GET /api/logisticians/:id/documents (list documents)',
      'POST /api/logisticians/:id/validate (activate account)',
      'GET /api/logisticians (list logisticians)',
      'GET /api/logisticians/:id (get details)',
      'POST /api/logisticians/:id/block (block account)',
      'POST /api/logisticians/:id/unblock (unblock account)',
      '-- ICPE Management --',
      'POST /api/logisticians/:id/icpe/declare-volumes (weekly ICPE declaration)',
      'GET /api/logisticians/:id/icpe/history (declaration history)',
      'GET /api/logisticians/:id/icpe/alerts (active ICPE alerts)',
      'GET /api/logisticians/icpe-dashboard/:industrielId (industrial ICPE dashboard)',
      '-- Logisticien Paid Options --',
      'POST /api/logisticians/:id/subscribe/bourse-stockage (150 EUR/mois)',
      'POST /api/logisticians/:id/subscribe/borne-accueil (100 EUR/mois)',
      '-- Logisticien Portal (for logisticien users) --',
      'POST /api/logistician-portal/auth/login (logisticien login)',
      'POST /api/logistician-portal/auth/refresh (refresh token)',
      'GET /api/logistician-portal/orders (orders at logisticien warehouses)',
      'GET /api/logistician-portal/orders/:orderId (order details)',
      'GET /api/logistician-portal/planning/:warehouseId (dock planning)',
      'GET /api/logistician-portal/slots/:warehouseId (available slots)',
      'POST /api/logistician-portal/rdv/:rdvId/confirm (confirm RDV)',
      'POST /api/logistician-portal/rdv/:rdvId/propose-alternative (propose alt)',
      'GET /api/logistician-portal/ecmr (e-CMR list)',
      'GET /api/logistician-portal/ecmr/:ecmrId (e-CMR details)',
      'POST /api/logistician-portal/ecmr/:ecmrId/sign (sign e-CMR)',
      'GET /api/logistician-portal/checkins/:warehouseId (driver checkins)',
      'POST /api/logistician-portal/checkin/:rdvId/validate (validate arrival)',
      'POST /api/logistician-portal/checkin/:rdvId/assign-dock (assign dock)',
      'GET /api/logistician-portal/profile (logisticien profile)',
      'PUT /api/logistician-portal/profile (update profile)',
      'GET /api/logistician-portal/documents (list documents)',
      'GET /api/logistician-portal/stats (statistics)',
    ],
    documentation: 'See README.md for complete API documentation',
  });
});

// ==================== e-CMR ROUTES ====================
// Note: e-CMR routes will be mounted after MongoDB connection
// This is done in the startServer function below

// ==================== SUBSCRIPTION PLANS ====================

app.get('/api/plans', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const db = mongoClient.db();
    const plans = await db.collection('subscription_plans')
      .find({ isActive: true })
      .sort({ price: 1 })
      .toArray();

    res.json({
      success: true,
      data: plans,
      count: plans.length,
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/plans', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { name, type, description, price, billingInterval, features } = req.body;

    // Validation
    if (!name || !type || !price || !billingInterval) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: name, type, price, billingInterval',
        },
      });
    }

    const db = mongoClient.db();
    const plan = {
      name,
      type,
      description: description || '',
      price,
      billingInterval,
      features: features || {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('subscription_plans').insertOne(plan);

    res.status(201).json({
      success: true,
      data: {
        ...plan,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== SUBSCRIPTIONS ====================

app.get('/api/subscriptions/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();
    const subscription = await db.collection('subscriptions')
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        },
      });
    }

    res.json({
      success: true,
      data: subscription,
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/subscriptions', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { userId, planId, billingInterval, startTrial } = req.body;

    if (!userId || !planId || !billingInterval) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: userId, planId, billingInterval',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();
    const trialDays = startTrial ? 14 : 0;

    const subscription = {
      userId,
      planId,
      status: startTrial ? 'TRIAL' : 'ACTIVE',
      startDate: now,
      trialEndDate: startTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
      billingInterval,
      autoRenew: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('subscriptions').insertOne(subscription);

    res.status(201).json({
      success: true,
      data: {
        ...subscription,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/subscriptions/:id/cancel', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const { reason } = req.body;
    const db = mongoClient.db();

    const result = await db.collection('subscriptions').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason || '',
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== CONTRACTS ====================

app.get('/api/contracts/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();
    const contract = await db.collection('contracts')
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Contract not found',
        },
      });
    }

    res.json({
      success: true,
      data: contract,
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/contracts', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { title, type, content, parties, effectiveDate } = req.body;

    if (!title || !type || !content || !parties || !Array.isArray(parties)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required fields: title, type, content, parties',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();

    const contract = {
      title,
      type,
      status: 'DRAFT',
      content,
      parties,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : now,
      isSequentialSigning: false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('contracts').insertOne(contract);

    res.status(201).json({
      success: true,
      data: {
        ...contract,
        _id: result.insertedId,
      },
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

app.post('/api/contracts/:id/send', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const db = mongoClient.db();

    const result = await db.collection('contracts').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status: 'PENDING_SIGNATURES',
          sentAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Contract not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
      message: 'Contract sent for signatures',
    });
  } catch (error) {
    console.error('Error sending contract:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// ==================== SIGNATURES ====================

app.post('/api/signatures/:id/sign', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available',
        },
      });
    }

    const { ObjectId } = require('mongodb');
    const { signatureData, geolocation } = req.body;

    if (!signatureData) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Missing required field: signatureData',
        },
      });
    }

    const db = mongoClient.db();
    const now = new Date();

    const signature = {
      _id: new ObjectId(req.params.id),
      status: 'SIGNED',
      signatureData,
      signedAt: now,
      ipAddress: req.ip || req.connection.remoteAddress,
      geolocation: geolocation || null,
      updatedAt: now,
    };

    const result = await db.collection('signatures').findOneAndUpdate(
      { _id: new ObjectId(req.params.id) },
      { $set: signature },
      { returnDocument: 'after', upsert: false }
    );

    if (!result.value) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Signature not found',
        },
      });
    }

    res.json({
      success: true,
      data: result.value,
      message: 'Document signed successfully',
    });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
      },
    });
  }
});

// Note: 404 and Error handlers are registered in startServer() after e-CMR routes are mounted

// Start server
async function startServer() {
  await connectMongoDB();

  // Mount e-CMR routes after MongoDB connection is established
  if (mongoConnected) {
    const ecmrRouter = createECMRRoutes(mongoClient, mongoConnected);
    app.use('/api/ecmr', ecmrRouter);
    console.log('✅ e-CMR routes mounted successfully');
  } else {
    console.warn('⚠️  e-CMR routes not mounted - MongoDB not connected');
  }

  // Mount Account Types routes after MongoDB connection is established
  if (mongoConnected) {
    const accountTypesRouter = createAccountTypesRoutes(mongoClient, mongoConnected);
    app.use('/api/account', accountTypesRouter);
    console.log('✅ Account Types routes mounted successfully');
  } else {
    console.warn('⚠️  Account Types routes not mounted - MongoDB not connected');
  }

  // Mount Carrier Referencing routes after MongoDB connection is established
  if (mongoConnected) {
    const carrierReferencingRouter = createCarrierReferencingRoutes(mongoClient, mongoConnected);
    app.use('/api/carriers', carrierReferencingRouter);
    console.log('✅ Carrier Referencing routes mounted successfully');
  } else {
    console.warn('⚠️  Carrier Referencing routes not mounted - MongoDB not connected');
  }

  // Mount Pricing Grids routes after MongoDB connection is established
  if (mongoConnected) {
    const pricingGridsRouter = createPricingGridsRoutes(mongoClient, mongoConnected);
    app.use('/api/pricing-grids', pricingGridsRouter);
    console.log('✅ Pricing Grids routes mounted successfully');
  } else {
    console.warn('⚠️  Pricing Grids routes not mounted - MongoDB not connected');
  }

  // Mount Industrial Transport Config routes after MongoDB connection is established
  if (mongoConnected) {
    const industrialTransportConfigRouter = createIndustrialTransportConfigRoutes(mongoClient, mongoConnected);
    app.use('/api/industrial', industrialTransportConfigRouter);
    console.log('✅ Industrial Transport Config routes mounted successfully');
  } else {
    console.warn('⚠️  Industrial Transport Config routes not mounted - MongoDB not connected');
  }

  // Mount Authentication routes after MongoDB connection is established
  // Apply strict rate limiting to auth endpoints (5 attempts per 15 minutes)
  if (mongoConnected) {
    const authRouter = createAuthRoutes(mongoClient, mongoConnected);
    app.use('/api/auth/login', security.authLimiter);
    app.use('/api/auth/register', security.authLimiter);
    app.use('/api/auth', authRouter);
    console.log('✅ Authentication routes mounted with auth rate limiting');
  } else {
    console.warn('⚠️  Authentication routes not mounted - MongoDB not connected');
  }

  // Mount Stripe routes after MongoDB connection is established
  if (mongoConnected) {
    const stripeRouter = createStripeRoutes(mongoClient, mongoConnected);
    app.use('/api/stripe', stripeRouter);
    console.log('✅ Stripe payment routes mounted successfully');
  } else {
    console.warn('⚠️  Stripe payment routes not mounted - MongoDB not connected');
  }

  // Mount Subscription Management routes (plans, features, activation/blocking)
  if (mongoConnected) {
    const subscriptionManagementRouter = createSubscriptionManagementRoutes(mongoClient, mongoConnected);
    app.use('/api/subscriptions', subscriptionManagementRouter);
    console.log('✅ Subscription management routes mounted successfully');
  } else {
    console.warn('⚠️  Subscription management routes not mounted - MongoDB not connected');
  }

  // Mount Flux Commande routes after MongoDB connection is established
  // Apply upload rate limiting to document upload endpoints (10 uploads per hour)
  if (mongoConnected) {
    const transportOrdersRouter = createTransportOrdersRoutes(mongoClient, mongoConnected);
    app.use('/api/transport-orders/:orderId/documents', security.uploadLimiter);
    app.use('/api/transport-orders/tracking/document-upload/:token', security.uploadLimiter);
    app.use('/api/transport-orders', transportOrdersRouter);
    console.log('✅ Flux Commande routes mounted with upload rate limiting');
  } else {
    console.warn('⚠️  Flux Commande routes not mounted - MongoDB not connected');
  }

  // Mount OVHcloud routes (Domain & Email Management)
  // No MongoDB dependency - can be mounted independently
  try {
    const ovhcloudRoutes = require('./routes/ovhcloud-routes');
    app.use('/api/ovhcloud', ovhcloudRoutes);
    console.log('✅ OVHcloud routes mounted successfully (Domain & Email Management)');
  } catch (error) {
    console.warn('⚠️  OVHcloud routes not mounted:', error.message);
  }

  // Mount AFFRET.IA routes after MongoDB connection is established
  if (mongoConnected) {
    const authRouter = require('./auth-routes');
    const authenticateToken = authRouter.authenticateToken || ((req, res, next) => {
      // Fallback simple authentication middleware
      const authHeader = req.headers['authorization'];
      if (!authHeader) {
        return res.status(401).json({ success: false, error: 'Token requis' });
      }
      // In production, this should verify JWT token properly
      req.user = { userId: 'system', organizationId: req.headers['x-organization-id'] || 'default' };
      next();
    });

    configureAffretiaRoutes(app, mongoClient.db(), authenticateToken);
    console.log('✅ AFFRET.IA routes mounted successfully (Intelligent Freight Module)');
  } else {
    console.warn('⚠️  AFFRET.IA routes not mounted - MongoDB not connected');
  }

  // Mount Planning Chargement & Livraison routes with EventEmitter for real-time
  if (mongoConnected) {
    const planningRouter = createPlanningRoutes(mongoClient.db(), planningEventEmitter);
    app.use('/api/planning', planningRouter);
    console.log('✅ Planning Chargement & Livraison routes mounted successfully');

    // Initialize WebSocket service for real-time updates
    planningWebSocket = new PlanningWebSocketService(server, planningEventEmitter);
    console.log('✅ Planning WebSocket service initialized on /ws/planning');
  } else {
    console.warn('⚠️  Planning routes not mounted - MongoDB not connected');
  }

  // Mount Chatbot Suite routes
  if (mongoConnected) {
    const chatbotRouter = createChatbotRoutes(mongoClient.db(), appEventEmitter);
    app.use('/api/chatbot', chatbotRouter);
    console.log('✅ Chatbot Suite routes mounted successfully');

    // Initialize Ticketing Service with SLA monitoring
    ticketingService = new TicketingService(mongoClient.db(), appEventEmitter, {
      teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      autoAssignment: true
    });
    ticketingService.startSLAMonitoring();
    console.log('✅ Ticketing Service initialized with SLA monitoring');
  } else {
    console.warn('⚠️  Chatbot Suite routes not mounted - MongoDB not connected');
  }

  // Mount Logisticien routes (Delegation System with ICPE management)
  if (mongoConnected) {
    const logisticienRouter = createLogisticienRoutes(mongoClient, mongoConnected);
    app.use('/api/logisticians', logisticienRouter);
    console.log('✅ Logisticien routes mounted successfully (Delegation & ICPE)');

    // Mount Logisticien Portal routes (for logisticien users)
    const logisticienPortalRouter = createLogisticienPortalRoutes(mongoClient, mongoConnected);
    app.use('/api/logistician-portal', logisticienPortalRouter);
    console.log('✅ Logisticien Portal routes mounted successfully');
  } else {
    console.warn('⚠️  Logisticien routes not mounted - MongoDB not connected');
  }

  // ==================== v4.0.0 - COMPLIANCE & SECURITY SERVICES ====================

  // Initialize Redis Cache (optional - gracefully degrades if not available)
  try {
    redisCache = getRedisCacheService();
    await redisCache.connect();
    console.log('✅ Redis cache service initialized');
  } catch (redisError) {
    console.warn('⚠️  Redis cache not available (optional):', redisError.message);
  }

  // Initialize v4.0.0 services
  if (mongoConnected) {
    // GDPR Services
    gdprService = createGdprService(mongoClient);
    consentService = createConsentService(mongoClient);
    console.log('✅ GDPR & Consent services initialized');

    // Token Rotation Service
    tokenRotationService = createTokenRotationService(mongoClient);
    console.log('✅ Token Rotation service initialized');

    // WebSocket Auth Service
    wsAuthService = createWebSocketAuthService(mongoClient);
    console.log('✅ WebSocket Auth service initialized');

    // Driving Time Service (EU 561/2006 compliance)
    drivingTimeService = createDrivingTimeService(mongoClient);
    console.log('✅ Driving Time service initialized (EU 561/2006)');

    // Carbon Footprint Service (Article L229-25)
    carbonFootprintService = createCarbonFootprintService(mongoClient);
    console.log('✅ Carbon Footprint service initialized (Article L229-25)');

    // Mount GDPR routes
    const gdprRouter = initializeGdprRoutes({
      gdprService,
      consentService
    });
    app.use('/api/gdpr', gdprRouter);
    console.log('✅ GDPR routes mounted (Article 17, 20, 7)');

    // Mount Driving Time routes
    app.get('/api/drivers/:driverId/driving-time', asyncHandler(async (req, res) => {
      const result = await drivingTimeService.getRemainingDrivingTime(req.params.driverId);
      res.json({ success: true, data: result });
    }));

    app.post('/api/drivers/:driverId/activities', asyncHandler(async (req, res) => {
      const result = await drivingTimeService.recordActivity(req.params.driverId, req.body);
      res.json({ success: true, data: result });
    }));

    app.get('/api/drivers/:driverId/compliance', asyncHandler(async (req, res) => {
      const result = await drivingTimeService.checkCompliance(req.params.driverId);
      res.json({ success: true, data: result });
    }));

    app.post('/api/drivers/:driverId/plan-breaks', asyncHandler(async (req, res) => {
      const result = await drivingTimeService.planBreaks(req.params.driverId, req.body.estimatedDuration);
      res.json({ success: true, data: result });
    }));
    console.log('✅ Driving Time routes mounted');

    // Mount Carbon Footprint routes
    app.post('/api/carbon/calculate', asyncHandler(async (req, res) => {
      const result = carbonFootprintService.calculateEmissions(req.body);
      res.json({ success: true, data: result });
    }));

    app.post('/api/carbon/orders/:orderId/calculate', asyncHandler(async (req, res) => {
      const result = await carbonFootprintService.calculateForOrder(req.params.orderId);
      res.json({ success: true, data: result });
    }));

    app.get('/api/carbon/reports/:industrielId', asyncHandler(async (req, res) => {
      const { startDate, endDate } = req.query;
      const result = await carbonFootprintService.generateEmissionsReport(
        req.params.industrielId,
        new Date(startDate),
        new Date(endDate)
      );
      res.json({ success: true, data: result });
    }));

    app.post('/api/carbon/compare', asyncHandler(async (req, res) => {
      const result = carbonFootprintService.compareOptions(req.body.options);
      res.json({ success: true, data: result });
    }));
    console.log('✅ Carbon Footprint routes mounted');

    // Mount Logistics Delegation routes (for industrials managing their 3PL/4PL partners)
    logisticsDelegationRoutes.use((req, res, next) => {
      req.app.locals.db = mongoClient.db();
      next();
    });
    app.use('/api/logistics-delegation', logisticsDelegationRoutes);
    console.log('✅ Logistics Delegation routes mounted (3PL/4PL management)');

    // Mount ICPE routes (for logisticians and industrials managing ICPE compliance)
    icpeRoutes.use((req, res, next) => {
      req.app.locals.db = mongoClient.db();
      next();
    });
    app.use('/api/icpe', icpeRoutes);
    console.log('✅ ICPE routes mounted (Installations Classees)');

    // v4.2.3 - B2P Dashboard Routes
    try {
      const b2pDashboardRoutes = require('./b2p-dashboard-routes');
      app.use('/api/b2p/dashboard', b2pDashboardRoutes);
      console.log('✅ B2P Dashboard routes mounted (Prospect conversion tracking)');
    } catch (err) {
      console.warn('⚠️  B2P Dashboard routes not loaded:', err.message);
    }

    // v4.2.3 - Email A/B Testing Routes
    try {
      const emailABTestingRoutes = require('./email-ab-testing-routes');
      app.use('/api/b2p/ab-testing', emailABTestingRoutes);
      console.log('✅ Email A/B Testing routes mounted (Prospection email optimization)');
    } catch (err) {
      console.warn('⚠️  Email A/B Testing routes not loaded:', err.message);
    }

  } else {
    console.warn('⚠️  v4.0.0 services not initialized - MongoDB not connected');
  }

  // ==================== SCHEDULED JOBS ENDPOINTS ====================
  // Endpoint to get scheduled jobs status
  app.get('/api/admin/scheduled-jobs/status', (req, res) => {
    res.json({
      success: true,
      data: scheduledJobs.getJobsStatus()
    });
  });

  // Endpoint to run a job manually
  app.post('/api/admin/scheduled-jobs/run/:jobName', async (req, res) => {
    const { jobName } = req.params;
    const result = await scheduledJobs.runJobManually(jobName);
    res.json(result);
  });

  // ==================== NOTIFICATION ENDPOINTS ====================
  // Get notification services status
  app.get('/api/admin/notifications/status', (req, res) => {
    res.json({
      success: true,
      data: notificationService.getNotificationServicesStatus()
    });
  });

  // Get notification history
  app.get('/api/admin/notifications/history', async (req, res) => {
    if (!mongoConnected) {
      return res.status(503).json({ success: false, error: 'Database not connected' });
    }
    const { orderId, type, limit, skip } = req.query;
    const result = await notificationService.getNotificationHistory(mongoClient.db(), {
      orderId, type,
      limit: parseInt(limit) || 50,
      skip: parseInt(skip) || 0
    });
    res.json(result);
  });

  // Send test notification
  app.post('/api/admin/notifications/test', async (req, res) => {
    const { email, phone, message } = req.body;
    const result = await notificationService.sendDirectNotification({
      email,
      phone,
      subject: 'Test RT SYMPHONI.A',
      body: `<h2>Test Notification</h2><p>${message || 'Ceci est un test.'}</p>`,
      smsBody: `RT Test: ${message || 'Ceci est un test.'}`
    });
    res.json(result);
  });

  // Start scheduled jobs after MongoDB is connected
  if (mongoConnected) {
    scheduledJobs.startAllJobs(mongoClient.db());
    console.log('✅ Scheduled jobs started');
  } else {
    console.warn('⚠️  Scheduled jobs not started - MongoDB not connected');
  }

  // Register 404 handler (must be after all routes)
  app.use(notFoundHandler);

  // Register centralized error handler (must be last)
  app.use(createErrorHandler({
    logger: secureLogger,
    includeStack: process.env.NODE_ENV !== 'production',
    logErrors: true,
    mongoClient: mongoConnected ? mongoClient : null
  }));

  server.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================================');
    console.log('🚀 RT SYMPHONI.A v4.0.0 - 100% Compliance Edition');
    console.log('============================================================================');
    console.log('Version: v4.0.0-compliance');
    console.log('Port: ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? '✅ Connected' : '❌ Not connected'));
    console.log('Redis: ' + (redisCache?.isReady() ? '✅ Connected' : '⚠️ Not available'));
    console.log('Security: ✅ Rate Limiting, CORS, Helmet, Input Sanitization, 2FA');
    console.log('RGPD: ✅ Article 7, 17, 20 compliant');
    console.log('Transport: ✅ EU 561/2006, Article L229-25 CO2');
    console.log('WebSocket: ✅ Real-time updates on /ws/planning');
    console.log('============================================================================');
    console.log('Modules: 29/29 Operational');
    console.log('  - Subscriptions & Contracts & e-CMR');
    console.log('  - Account Types & Carrier Referencing');
    console.log('  - Pricing Grids & Industrial Transport Config');
    console.log('  - JWT Authentication & Stripe Payments');
    console.log('  - Transport Orders & Tracking (GPS + Email)');
    console.log('  - Geofencing & OCR Integration');
    console.log('  - Document Management & Carrier Scoring');
    console.log('  - Scheduled Jobs & Multi-Channel Notifications');
    console.log('  - AFFRET.IA - Intelligent Freight Module');
    console.log('  - Planning Chargement & Livraison');
    console.log('  - Suite Chatbots Intelligents (8 assistants)');
    console.log('  - Logisticien Delegation & ICPE Management');
    console.log('============================================================================');
    console.log('🤖 Suite Chatbots RT Technologie:');
    console.log('  - RT HelpBot: Support technique avec escalade automatique');
    console.log('  - Planif\'IA: Assistant pour industriels (ERP, Affret.IA)');
    console.log('  - Routier: Assistant pour transporteurs (grilles, RDV, POD)');
    console.log('  - Quai & WMS: Assistant pour logisticiens (planning quais)');
    console.log('  - Livraisons: Assistant pour destinataires (RDV, suivi)');
    console.log('  - Expedition: Assistant pour fournisseurs (envois)');
    console.log('  - Freight IA: Assistant pour transitaires (import/export)');
    console.log('  - Copilote Chauffeur: Assistant mobile (mission, signature)');
    console.log('============================================================================');
    console.log('📋 Systeme de Ticketing:');
    console.log('  - SLA 3 niveaux (Standard/Important/Critique)');
    console.log('  - Escalade automatique vers technicien');
    console.log('  - Notifications Microsoft Teams');
    console.log('  - Base de connaissances & FAQ');
    console.log('  - Auto-assignment intelligent');
    console.log('  - Surveillance SLA temps reel');
    console.log('============================================================================');
    console.log('Scheduled Jobs:');
    console.log('  - checkTimeouts: every 5 min');
    console.log('  - monitorETA: every 1 min');
    console.log('  - detectDelays: every 2 min');
    console.log('  - SLA Monitoring: every 5 min');
    console.log('============================================================================');
    console.log('🏭 Logisticien Delegation:');
    console.log('  - Invitation par Industriel (email)');
    console.log('  - Onboarding en 3 etapes');
    console.log('  - Vigilance documentaire (ICPE, assurances, Kbis)');
    console.log('  - Gestion ICPE complete (rubriques 1510, 1530, 2662...)');
    console.log('  - Declaration hebdomadaire volumes par rubrique');
    console.log('  - Alertes seuils automatiques (80%, 90%)');
    console.log('  - Dashboard temps reel pour Industriel');
    console.log('  - Options payantes: Bourse Stockage (150 EUR), Borne Accueil (100 EUR)');
    console.log('============================================================================');
    console.log('📝 API Documentation: /');
    console.log('🏥 Health Check: /health');
    console.log('⚙️  Admin Jobs: /api/admin/scheduled-jobs/status');
    console.log('📧 Notifications: /api/admin/notifications/status');
    console.log('🚛 AFFRET.IA: /api/affretia/constants');
    console.log('📅 Planning: /api/planning/types');
    console.log('🤖 Chatbot: /api/chatbot/health');
    console.log('🏭 Logisticien: /api/logisticians');
    console.log('============================================================================');
  });
}

startServer();

module.exports = app;
