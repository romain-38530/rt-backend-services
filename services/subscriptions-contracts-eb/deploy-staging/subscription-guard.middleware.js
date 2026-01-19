/**
 * SYMPHONI.A - Subscription Guard Middleware
 * Middleware de verification et blocage des features selon l'abonnement
 * Version 2.0.0
 */

const {
  isFeatureAvailable,
  getUserFeatures,
  checkUsageLimit,
  getBlockedFeatureMessage,
  FEATURE_DESCRIPTIONS
} = require('./subscription-features');

/**
 * Cache en memoire pour les subscriptions (TTL 5 minutes)
 */
const subscriptionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Recupere les informations de subscription d'un utilisateur
 * @param {Object} db - MongoDB database
 * @param {string} userId - ID de l'utilisateur
 * @returns {Object} Subscription info
 */
async function getSubscriptionInfo(db, userId, organizationId) {
  const cacheKey = `${userId || organizationId}`;
  const cached = subscriptionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Chercher d'abord dans users
    let user = null;
    if (userId) {
      const { ObjectId } = require('mongodb');
      user = await db.collection('users').findOne({
        _id: new ObjectId(userId)
      });
    }

    // Chercher dans organizations si pas trouve ou pas de subscription
    let organization = null;
    if (organizationId) {
      const { ObjectId } = require('mongodb');
      organization = await db.collection('organizations').findOne({
        _id: new ObjectId(organizationId)
      });
    }

    // Construire les infos de subscription
    const subscriptionInfo = {
      userId,
      organizationId,
      userType: user?.userType || organization?.type || 'transporteur',
      planLevel: user?.planLevel || organization?.planLevel || 'FREE',
      stripeSubscriptionId: user?.stripeSubscriptionId || organization?.stripeSubscriptionId,
      subscriptionStatus: user?.subscriptionStatus || organization?.subscriptionStatus || 'inactive',
      activeOptions: user?.activeOptions || organization?.activeOptions || [],
      features: {},
      limits: {},
      isActive: false,
      expiresAt: user?.subscriptionExpiresAt || organization?.subscriptionExpiresAt
    };

    // Verifier si l'abonnement est actif
    const validStatuses = ['active', 'trialing', 'past_due'];
    subscriptionInfo.isActive = validStatuses.includes(subscriptionInfo.subscriptionStatus) ||
      subscriptionInfo.planLevel === 'FREE' ||
      subscriptionInfo.planLevel === 'STARTER';

    // Charger les features
    subscriptionInfo.features = getUserFeatures(
      subscriptionInfo.userType,
      subscriptionInfo.planLevel,
      subscriptionInfo.activeOptions
    );

    // Mettre en cache
    subscriptionCache.set(cacheKey, {
      data: subscriptionInfo,
      timestamp: Date.now()
    });

    return subscriptionInfo;
  } catch (error) {
    console.error('[SubscriptionGuard] Error fetching subscription:', error.message);
    // Retourner un plan Free par defaut en cas d'erreur
    return {
      userType: 'transporteur',
      planLevel: 'FREE',
      features: getUserFeatures('transporteur', 'FREE', []),
      isActive: true,
      error: error.message
    };
  }
}

/**
 * Invalide le cache pour un utilisateur
 */
function invalidateCache(userId, organizationId) {
  subscriptionCache.delete(`${userId || organizationId}`);
}

/**
 * Middleware factory: Verifie qu'une feature specifique est disponible
 * @param {string} featureName - Nom de la feature requise
 * @param {Object} options - Options supplementaires
 * @returns {Function} Express middleware
 */
function requireFeature(featureName, options = {}) {
  return async (req, res, next) => {
    try {
      // Recuperer userId depuis le token JWT
      const userId = req.user?.userId || req.user?.id;
      const organizationId = req.user?.organizationId || req.body?.organizationId;

      if (!userId && !organizationId) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'AUTHENTICATION_REQUIRED',
            message: 'Authentication requise pour acceder a cette fonctionnalite'
          }
        });
      }

      // Recuperer la connexion MongoDB
      const db = req.app.locals.db || req.mongoClient?.db();
      if (!db) {
        console.error('[SubscriptionGuard] MongoDB not available');
        return next(); // Laisser passer si pas de DB (mode degraded)
      }

      // Recuperer les infos de subscription
      const subscription = await getSubscriptionInfo(db, userId, organizationId);

      // Attacher les infos de subscription a la requete
      req.subscription = subscription;

      // Verifier si l'abonnement est actif
      if (!subscription.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_INACTIVE',
            message: 'Votre abonnement n\'est pas actif. Veuillez renouveler votre abonnement.',
            subscriptionStatus: subscription.subscriptionStatus
          }
        });
      }

      // Verifier si la feature est disponible
      const hasFeature = isFeatureAvailable(
        subscription.userType,
        subscription.planLevel,
        featureName,
        subscription.activeOptions
      );

      if (!hasFeature) {
        const blockInfo = getBlockedFeatureMessage(
          featureName,
          subscription.userType,
          subscription.planLevel
        );

        return res.status(403).json({
          success: false,
          error: {
            code: 'FEATURE_NOT_AVAILABLE',
            feature: featureName,
            ...blockInfo
          }
        });
      }

      // Feature disponible, continuer
      next();
    } catch (error) {
      console.error('[SubscriptionGuard] Error:', error);
      // En cas d'erreur, on laisse passer (mode degraded) sauf si strict
      if (options.strict) {
        return res.status(500).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_CHECK_ERROR',
            message: 'Erreur lors de la verification de l\'abonnement'
          }
        });
      }
      next();
    }
  };
}

/**
 * Middleware factory: Verifie une limite d'utilisation
 * @param {string} limitType - Type de limite (ordersPerMonth, trackingUpdatesPerDay, etc.)
 * @param {Function} getCurrentValue - Fonction async pour obtenir la valeur actuelle
 * @returns {Function} Express middleware
 */
function checkLimit(limitType, getCurrentValue) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const organizationId = req.user?.organizationId || req.body?.organizationId;

      const db = req.app.locals.db || req.mongoClient?.db();
      if (!db) return next();

      const subscription = await getSubscriptionInfo(db, userId, organizationId);
      req.subscription = subscription;

      // Obtenir la valeur actuelle
      const currentValue = await getCurrentValue(req, db, subscription);

      // Verifier la limite
      const limitCheck = checkUsageLimit(
        subscription.userType,
        subscription.planLevel,
        limitType,
        currentValue
      );

      if (!limitCheck.allowed) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'USAGE_LIMIT_EXCEEDED',
            limitType,
            current: limitCheck.current,
            limit: limitCheck.limit,
            message: `Vous avez atteint votre limite de ${limitCheck.limit} ${limitType}. Passez a un plan superieur pour augmenter cette limite.`
          }
        });
      }

      // Ajouter les infos de limite a la requete
      req.usageLimit = limitCheck;
      next();
    } catch (error) {
      console.error('[SubscriptionGuard] Limit check error:', error);
      next();
    }
  };
}

/**
 * Middleware: Attache les infos de subscription a la requete (sans bloquer)
 */
async function attachSubscription(req, res, next) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId && !organizationId) {
      req.subscription = null;
      return next();
    }

    const db = req.app.locals.db || req.mongoClient?.db();
    if (!db) {
      req.subscription = null;
      return next();
    }

    req.subscription = await getSubscriptionInfo(db, userId, organizationId);
    next();
  } catch (error) {
    console.error('[SubscriptionGuard] attachSubscription error:', error);
    req.subscription = null;
    next();
  }
}

/**
 * Middleware: Verifie plusieurs features a la fois (OR logic - au moins une requise)
 * @param {string[]} featureNames - Liste des features (au moins une requise)
 */
function requireAnyFeature(featureNames) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const organizationId = req.user?.organizationId;

      const db = req.app.locals.db || req.mongoClient?.db();
      if (!db) return next();

      const subscription = await getSubscriptionInfo(db, userId, organizationId);
      req.subscription = subscription;

      if (!subscription.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_INACTIVE',
            message: 'Votre abonnement n\'est pas actif.'
          }
        });
      }

      // Verifier si au moins une feature est disponible
      const availableFeature = featureNames.find(feature =>
        isFeatureAvailable(
          subscription.userType,
          subscription.planLevel,
          feature,
          subscription.activeOptions
        )
      );

      if (!availableFeature) {
        const featureInfo = featureNames.map(f => FEATURE_DESCRIPTIONS[f]?.name || f).join(', ');
        return res.status(403).json({
          success: false,
          error: {
            code: 'FEATURES_NOT_AVAILABLE',
            features: featureNames,
            message: `Au moins une des fonctionnalites suivantes est requise: ${featureInfo}`
          }
        });
      }

      next();
    } catch (error) {
      console.error('[SubscriptionGuard] requireAnyFeature error:', error);
      next();
    }
  };
}

/**
 * Middleware: Verifie toutes les features (AND logic - toutes requises)
 * @param {string[]} featureNames - Liste des features (toutes requises)
 */
function requireAllFeatures(featureNames) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId || req.user?.id;
      const organizationId = req.user?.organizationId;

      const db = req.app.locals.db || req.mongoClient?.db();
      if (!db) return next();

      const subscription = await getSubscriptionInfo(db, userId, organizationId);
      req.subscription = subscription;

      if (!subscription.isActive) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'SUBSCRIPTION_INACTIVE',
            message: 'Votre abonnement n\'est pas actif.'
          }
        });
      }

      // Verifier toutes les features
      const missingFeatures = featureNames.filter(feature =>
        !isFeatureAvailable(
          subscription.userType,
          subscription.planLevel,
          feature,
          subscription.activeOptions
        )
      );

      if (missingFeatures.length > 0) {
        const missingInfo = missingFeatures.map(f => FEATURE_DESCRIPTIONS[f]?.name || f).join(', ');
        return res.status(403).json({
          success: false,
          error: {
            code: 'FEATURES_NOT_AVAILABLE',
            missingFeatures,
            message: `Les fonctionnalites suivantes sont requises mais non disponibles: ${missingInfo}`
          }
        });
      }

      next();
    } catch (error) {
      console.error('[SubscriptionGuard] requireAllFeatures error:', error);
      next();
    }
  };
}

/**
 * Middleware: Bloque l'acces pour les plans gratuits
 */
function requirePaidPlan(req, res, next) {
  const subscription = req.subscription;

  if (!subscription) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Un abonnement payant est requis pour acceder a cette fonctionnalite'
      }
    });
  }

  const freePlans = ['FREE', 'STARTER'];
  if (freePlans.includes(subscription.planLevel)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'PAID_PLAN_REQUIRED',
        message: 'Cette fonctionnalite necessite un abonnement payant. Passez au plan Premium ou Pro pour y acceder.',
        currentPlan: subscription.planLevel
      }
    });
  }

  next();
}

/**
 * Middleware: Verifie que l'utilisateur a un plan business/enterprise
 */
function requireBusinessPlan(req, res, next) {
  const subscription = req.subscription;

  if (!subscription) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Un abonnement Business/Enterprise est requis'
      }
    });
  }

  const businessPlans = ['BUSINESS', 'ENTERPRISE'];
  if (!businessPlans.includes(subscription.planLevel)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'BUSINESS_PLAN_REQUIRED',
        message: 'Cette fonctionnalite est reservee aux abonnements Business et Enterprise.',
        currentPlan: subscription.planLevel
      }
    });
  }

  next();
}

/**
 * Helper: Verifie une feature dans le code (pas middleware)
 * @returns {boolean}
 */
function canUseFeature(subscription, featureName) {
  if (!subscription || !subscription.isActive) return false;

  return isFeatureAvailable(
    subscription.userType,
    subscription.planLevel,
    featureName,
    subscription.activeOptions
  );
}

module.exports = {
  // Middlewares
  requireFeature,
  requireAnyFeature,
  requireAllFeatures,
  requirePaidPlan,
  requireBusinessPlan,
  checkLimit,
  attachSubscription,

  // Helpers
  getSubscriptionInfo,
  invalidateCache,
  canUseFeature
};
