// ============================================================================
// RT SYMPHONI.A - Example d'intégration du monitoring dans index.js
// ============================================================================
// Ce fichier montre comment intégrer le monitoring dans l'application existante
// NE PAS EXÉCUTER CE FICHIER - C'est uniquement un exemple de référence
// ============================================================================

/*
INSTRUCTIONS:

1. Copiez les sections marquées [NOUVEAU] dans votre index.js existant
2. Conservez tout le code existant
3. Ajoutez simplement les nouveaux imports et middleware aux bons endroits
*/

// ============================================================================
// [NOUVEAU] IMPORTS MONITORING
// ============================================================================
const monitoring = require('./middleware/monitoring-middleware');
const healthRoutes = require('./routes/health-routes');
const cloudwatchMetrics = require('./utils/cloudwatch-metrics');

// ============================================================================
// IMPORTS EXISTANTS (ne pas modifier)
// ============================================================================
const express = require('express');
const { MongoClient } = require('mongodb');
const security = require('./security-middleware');
// ... autres imports existants ...

const app = express();
const PORT = process.env.PORT || 8080;

// ============================================================================
// SECURITY MIDDLEWARE (existant - ne pas modifier)
// ============================================================================
app.use(security.helmet);
app.use(security.cors);
app.use(security.requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(security.sanitizeInput);
app.use('/api/', security.generalLimiter);

// ============================================================================
// [NOUVEAU] MONITORING MIDDLEWARE
// Ajouter APRÈS les security middleware
// ============================================================================
app.use(monitoring.requestMonitoring);

// ============================================================================
// [MODIFICATION] HEALTH CHECK
// Remplacer le health check existant par celui-ci
// ============================================================================

// ANCIEN CODE (à commenter ou supprimer):
/*
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'RT SYMPHONI.A - Subscriptions & Contracts API',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    version: 'v1.6.2-security',
    // ... reste du code ...
  };
  res.status(statusCode).json(health);
});
*/

// NOUVEAU CODE (utilise les routes améliorées):
// (Sera monté dans startServer() après connexion MongoDB)

// ============================================================================
// ROUTES EXISTANTES (ne pas modifier)
// ============================================================================
app.get('/', (req, res) => {
  // ... code existant ...
});

// ============================================================================
// [NOUVEAU] EXEMPLE: Tracking métrique business dans une route existante
// ============================================================================

// AVANT (route existante):
/*
app.post('/api/subscriptions', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' }
      });
    }

    const { userId, planId, billingInterval, startTrial } = req.body;
    // ... validation ...

    const subscription = {
      userId, planId, status: startTrial ? 'TRIAL' : 'ACTIVE',
      // ... reste ...
    };

    const result = await db.collection('subscriptions').insertOne(subscription);

    res.status(201).json({
      success: true,
      data: { ...subscription, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});
*/

// APRÈS (avec monitoring ajouté):
app.post('/api/subscriptions', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' }
      });
    }

    const { userId, planId, billingInterval, startTrial } = req.body;
    // ... validation ...

    const db = mongoClient.db();
    const plan = await db.collection('subscription_plans').findOne({ _id: planId });

    const subscription = {
      userId, planId, status: startTrial ? 'TRIAL' : 'ACTIVE',
      // ... reste ...
    };

    const result = await db.collection('subscriptions').insertOne(subscription);

    // ========================================================================
    // [NOUVEAU] Log business metric
    // ========================================================================
    monitoring.logSubscriptionEvent('created', {
      planType: plan.type,
      userId: userId,
      amount: plan.price
    });
    // ========================================================================

    res.status(201).json({
      success: true,
      data: { ...subscription, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message }
    });
  }
});

// ============================================================================
// [NOUVEAU] EXEMPLE: Tracking métrique dans transport orders
// ============================================================================

// Ajouter dans la route POST /api/transport-orders:
/*
const order = await createTransportOrder(req.body);

// [NOUVEAU] Log business metric
monitoring.logTransportOrderCreated(order._id, {
  status: order.status,
  totalAmount: order.totalAmount,
  carrierId: order.carrierId,
  origin: order.origin,
  destination: order.destination
});

res.json({ success: true, data: order });
*/

// ============================================================================
// [NOUVEAU] EXEMPLE: Tracking métrique dans e-CMR signatures
// ============================================================================

// Ajouter dans la route POST /api/ecmr/:id/sign/:party:
/*
const startTime = Date.now();

const ecmr = await signECMR(req.params.id, req.params.party, req.body);

// [NOUVEAU] Log business metric
const signatureTime = Date.now() - startTime;
monitoring.logECMRSignature(ecmr._id, req.params.party, signatureTime);

res.json({ success: true, data: ecmr });
*/

// ============================================================================
// [NOUVEAU] EXEMPLE: Tracking métrique dans livraisons
// ============================================================================

// Ajouter dans la route de complétion de livraison:
/*
const order = await completeDelivery(req.params.id);

// Calculer si livraison en retard
const onTime = order.actualDeliveryTime <= order.expectedDeliveryTime;
const delayMinutes = onTime ? 0 : Math.floor(
  (new Date(order.actualDeliveryTime) - new Date(order.expectedDeliveryTime)) / 60000
);

// [NOUVEAU] Log business metric
monitoring.logDeliveryCompleted(order._id, {
  onTime,
  delayed: !onTime,
  delayMinutes,
  actualDeliveryTime: order.actualDeliveryTime,
  expectedDeliveryTime: order.expectedDeliveryTime
});

res.json({ success: true, data: order });
*/

// ============================================================================
// [MODIFICATION] START SERVER
// Ajouter le montage des routes de health check améliorées
// ============================================================================

async function startServer() {
  await connectMongoDB();

  // ========================================================================
  // [NOUVEAU] Monter les routes de health check améliorées
  // À ajouter après la connexion MongoDB
  // ========================================================================
  const healthRouter = healthRoutes(mongoClient, mongoConnected);
  app.use('/health', healthRouter);
  console.log('✅ Enhanced health check routes mounted');
  // ========================================================================

  // Routes e-CMR (existantes)
  if (mongoConnected) {
    const ecmrRouter = createECMRRoutes(mongoClient, mongoConnected);
    app.use('/api/ecmr', ecmrRouter);
    console.log('✅ e-CMR routes mounted successfully');
  }

  // ... Autres routes existantes ...

  // 404 handler (existant)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `Endpoint not found: ${req.method} ${req.path}` }
    });
  });

  // Error handler (existant)
  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' }
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================================================');
    console.log('🚀 RT SYMPHONI.A - Subscriptions & Contracts API');
    console.log('============================================================================');
    console.log('Version: v1.6.2-security-monitoring'); // [NOUVEAU] Version mise à jour
    console.log('Port: ' + PORT);
    console.log('Environment: ' + (process.env.NODE_ENV || 'development'));
    console.log('MongoDB: ' + (mongoConnected ? '✅ Connected' : '❌ Not connected'));
    console.log('Security: ✅ Rate Limiting, CORS, Helmet, Input Sanitization');
    console.log('Monitoring: ✅ CloudWatch Metrics, Logs, Alarms'); // [NOUVEAU]
    console.log('Features: 14/14 Modules Operational');
    console.log('============================================================================');
  });
}

startServer();

module.exports = app;

// ============================================================================
// [NOUVEAU] GRACEFUL SHUTDOWN
// Gérer la fermeture propre des log streams
// ============================================================================
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing monitoring streams...');
  monitoring.closeLogStreams();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing monitoring streams...');
  monitoring.closeLogStreams();
  process.exit(0);
});

// ============================================================================
// RÉSUMÉ DES MODIFICATIONS
// ============================================================================
/*

CHECKLIST D'INTÉGRATION:

✅ 1. Ajouter les imports:
   - monitoring middleware
   - health routes
   - cloudwatch metrics

✅ 2. Ajouter le middleware de monitoring:
   - app.use(monitoring.requestMonitoring)

✅ 3. Remplacer /health par les routes améliorées:
   - app.use('/health', healthRoutes(...))

✅ 4. Ajouter le tracking dans les routes métier:
   - logTransportOrderCreated()
   - logDeliveryCompleted()
   - logCarrierScoreUpdate()
   - logECMRSignature()
   - logSubscriptionEvent()

✅ 5. Ajouter le graceful shutdown:
   - SIGTERM et SIGINT handlers

✅ 6. Mettre à jour le message de démarrage:
   - Ajouter 'Monitoring: ✅ CloudWatch...'

ROUTES AMÉLIORÉES DISPONIBLES:

- GET /health - Basic health check
- GET /health/detailed - Detailed health (MongoDB, Memory, CPU, Disk)
- GET /health/ready - Readiness check (load balancers)
- GET /health/live - Liveness check (containers)
- GET /health/metrics - System metrics

MÉTRIQUES BUSINESS TRACKÉES:

- Transport Orders (création, revenus)
- Deliveries (complétion, retards)
- Carrier Scores (mises à jour, moyennes)
- e-CMR Signatures (par partie, temps)
- Subscriptions (création, renouvellement, revenus)

LOGS CRÉÉS:

- /var/app/current/logs/application.log - Logs applicatifs
- /var/app/current/logs/error.log - Erreurs
- /var/app/current/logs/access.log - Accès HTTP
- /var/app/current/logs/security.log - Événements sécurité
- /var/app/current/logs/business-metrics.log - Métriques métier

*/
