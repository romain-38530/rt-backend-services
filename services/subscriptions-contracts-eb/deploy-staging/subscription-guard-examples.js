/**
 * SYMPHONI.A - Exemples d'utilisation du Subscription Guard
 * Ce fichier montre comment integrer le blocage par abonnement dans vos routes
 * Version 2.0.0
 */

// ============================================================================
// IMPORT DU MIDDLEWARE
// ============================================================================

const {
  requireFeature,
  requireAnyFeature,
  requireAllFeatures,
  requirePaidPlan,
  requireBusinessPlan,
  checkLimit,
  attachSubscription,
  canUseFeature
} = require('./subscription-guard.middleware');

// ============================================================================
// EXEMPLES D'UTILISATION
// ============================================================================

/**
 * EXEMPLE 1: Bloquer une route qui necessite AFFRET.IA
 *
 * Utilisation dans affretia-routes.js:
 */
function exampleAffretiaRoute(app, db, authenticateToken) {
  // Route AFFRET.IA - necessite la feature 'affretIA'
  app.post('/api/affretia/trigger',
    authenticateToken,
    requireFeature('affretIA'),  // <-- Bloque si pas d'abonnement avec AFFRET.IA
    async (req, res) => {
      // req.subscription contient les infos d'abonnement
      console.log('User plan:', req.subscription.planLevel);
      console.log('User features:', req.subscription.features);

      // ... logique AFFRET.IA
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 2: Bloquer e-CMR
 */
function exampleEcmrRoute(app, db, authenticateToken) {
  // Creer un e-CMR - necessite la feature 'ecmr'
  app.post('/api/ecmr',
    authenticateToken,
    requireFeature('ecmr'),  // <-- Bloque si plan Free/Starter
    async (req, res) => {
      // ... logique e-CMR
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 3: Route avec plusieurs features (au moins une requise)
 */
function exampleMultiFeatureRoute(app, db, authenticateToken) {
  // Obtenir tracking - soit basique soit premium
  app.get('/api/tracking/:orderId',
    authenticateToken,
    requireAnyFeature(['basicTracking', 'advancedTracking']),
    async (req, res) => {
      // Verifier quelle feature est disponible pour adapter la reponse
      if (canUseFeature(req.subscription, 'advancedTracking')) {
        // Retourner tracking GPS complet
        res.json({ type: 'premium', gpsData: { /* ... */ } });
      } else {
        // Retourner tracking basique
        res.json({ type: 'basic', status: 'en_route' });
      }
    }
  );
}

/**
 * EXEMPLE 4: Route avec toutes les features requises
 */
function exampleAllFeaturesRoute(app, db, authenticateToken) {
  // Export complet - necessite analytics ET export
  app.get('/api/reports/full-export',
    authenticateToken,
    requireAllFeatures(['analytics', 'exportReports']),
    async (req, res) => {
      // ... generation du rapport complet
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 5: Route reservee aux plans payants
 */
function examplePaidOnlyRoute(app, db, authenticateToken) {
  app.get('/api/dashboard/analytics',
    authenticateToken,
    attachSubscription,  // Attache les infos sans bloquer
    requirePaidPlan,     // Bloque si plan FREE ou STARTER
    async (req, res) => {
      res.json({ success: true, data: { /* ... */ } });
    }
  );
}

/**
 * EXEMPLE 6: Route reservee aux plans Business/Enterprise
 */
function exampleBusinessOnlyRoute(app, db, authenticateToken) {
  app.get('/api/admin/multi-organization',
    authenticateToken,
    attachSubscription,
    requireBusinessPlan,  // Bloque si pas Business ou Enterprise
    async (req, res) => {
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 7: Verification de limite d'utilisation
 */
function exampleLimitCheckRoute(app, db, authenticateToken) {
  // Verifier la limite de commandes par mois avant creation
  app.post('/api/orders',
    authenticateToken,
    checkLimit('ordersPerMonth', async (req, db, subscription) => {
      // Calculer le nombre de commandes ce mois
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const count = await db.collection('orders').countDocuments({
        organizationId: subscription.organizationId,
        createdAt: { $gte: startOfMonth }
      });

      return count;
    }),
    async (req, res) => {
      // req.usageLimit contient les infos de limite
      console.log('Orders this month:', req.usageLimit.current);
      console.log('Remaining:', req.usageLimit.remaining);

      // ... creer la commande
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 8: Verification conditionnelle dans le code (pas middleware)
 */
function exampleConditionalCheck(req, res) {
  // Verifier dans le code si une feature est disponible
  if (canUseFeature(req.subscription, 'smsNotifications')) {
    // Envoyer SMS
    sendSMS(req.body.phone, req.body.message);
  } else {
    // Fallback: envoyer email
    sendEmail(req.body.email, req.body.message);
  }
}

/**
 * EXEMPLE 9: Geofencing avec feature check
 */
function exampleGeofencingRoute(app, db, authenticateToken) {
  app.post('/api/geofencing/create-zone',
    authenticateToken,
    requireFeature('geofencing'),
    async (req, res) => {
      // L'utilisateur a acces au geofencing
      // ... creer la zone
      res.json({ success: true });
    }
  );
}

/**
 * EXEMPLE 10: Integration API externe avec feature check
 */
function exampleApiAccessRoute(app, db, authenticateToken) {
  // Endpoint API externe - necessite apiAccess
  app.all('/api/external/*',
    authenticateToken,
    requireFeature('apiAccess'),
    async (req, res) => {
      // Autoriser l'acces API
      res.json({ success: true });
    }
  );
}

// ============================================================================
// MESSAGES D'ERREUR RETOURNES
// ============================================================================

/**
 * Quand une feature n'est pas disponible, le middleware retourne:
 *
 * Status: 403 Forbidden
 * {
 *   "success": false,
 *   "error": {
 *     "code": "FEATURE_NOT_AVAILABLE",
 *     "feature": "affretIA",
 *     "blocked": true,
 *     "featureInfo": {
 *       "name": "AFFRET.IA",
 *       "description": "Intelligence artificielle pour le matching transporteurs",
 *       "icon": "Brain"
 *     },
 *     "message": "La fonctionnalite \"AFFRET.IA\" n'est pas disponible dans votre abonnement actuel. Vous pouvez l'ajouter pour 200 EUR/mois.",
 *     "upgradeOption": {
 *       "id": "affretIA",
 *       "name": "AFFRET.IA Premium",
 *       "monthlyPrice": 200,
 *       "stripePriceId": "price_xxx"
 *     }
 *   }
 * }
 *
 * Quand la limite est depassee:
 *
 * Status: 429 Too Many Requests
 * {
 *   "success": false,
 *   "error": {
 *     "code": "USAGE_LIMIT_EXCEEDED",
 *     "limitType": "ordersPerMonth",
 *     "current": 200,
 *     "limit": 200,
 *     "message": "Vous avez atteint votre limite de 200 ordersPerMonth. Passez a un plan superieur pour augmenter cette limite."
 *   }
 * }
 */

// ============================================================================
// INTEGRATION DANS VOS ROUTES EXISTANTES
// ============================================================================

/**
 * Pour integrer dans vos routes existantes:
 *
 * 1. Importer le middleware en haut du fichier:
 *    const { requireFeature, canUseFeature } = require('./subscription-guard.middleware');
 *
 * 2. Ajouter le middleware apres authenticateToken:
 *    app.post('/api/ma-route', authenticateToken, requireFeature('maFeature'), handler);
 *
 * 3. Utiliser canUseFeature() pour des checks conditionnels dans le code:
 *    if (canUseFeature(req.subscription, 'feature')) { ... }
 */

module.exports = {
  // Ces exemples sont pour documentation uniquement
  // Ne pas importer ce fichier dans l'application
};
