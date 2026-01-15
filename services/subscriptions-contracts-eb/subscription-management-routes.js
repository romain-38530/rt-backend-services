/**
 * SYMPHONI.A - Subscription Management Routes
 * API pour la gestion des abonnements et activation des modules
 * Version 2.0.0
 */

const express = require('express');
const { ObjectId } = require('mongodb');
// SECURITY: Stripe secret key validation
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (process.env.NODE_ENV === 'production' && !STRIPE_KEY) {
  console.error('[SECURITY] STRIPE_SECRET_KEY is required in production');
}
const stripe = require('stripe')(STRIPE_KEY || 'sk_test_dev_placeholder');

const {
  TRANSPORTEUR_PLANS,
  INDUSTRIEL_PLANS,
  PAID_OPTIONS,
  FEATURE_DESCRIPTIONS,
  getPlanConfig,
  getUserFeatures,
  getAvailableOptions,
  isFeatureAvailable
} = require('./subscription-features');

const {
  getSubscriptionInfo,
  invalidateCache,
  attachSubscription
} = require('./subscription-guard.middleware');

const { authenticateToken } = require('./auth-middleware');

function createSubscriptionManagementRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Middleware MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: { code: 'DB_NOT_CONNECTED', message: 'Database not available' }
      });
    }
    req.app.locals.db = mongoClient.db();
    next();
  };

  // ==================== ENDPOINTS PUBLICS ====================

  /**
   * GET /api/subscriptions/plans
   * Liste tous les plans disponibles
   */
  router.get('/plans', (req, res) => {
    const { userType = 'all' } = req.query;

    const response = {
      success: true,
      data: {}
    };

    if (userType === 'all' || userType === 'transporteur') {
      response.data.transporteur = Object.values(TRANSPORTEUR_PLANS).map(plan => ({
        ...plan,
        featureDescriptions: Object.entries(plan.features)
          .filter(([_, enabled]) => enabled)
          .map(([feature]) => ({
            id: feature,
            ...FEATURE_DESCRIPTIONS[feature]
          }))
      }));
    }

    if (userType === 'all' || userType === 'industriel') {
      response.data.industriel = Object.values(INDUSTRIEL_PLANS).map(plan => ({
        ...plan,
        featureDescriptions: Object.entries(plan.features)
          .filter(([_, enabled]) => enabled)
          .map(([feature]) => ({
            id: feature,
            ...FEATURE_DESCRIPTIONS[feature]
          }))
      }));
    }

    res.json(response);
  });

  /**
   * GET /api/subscriptions/options
   * Liste toutes les options payantes disponibles
   */
  router.get('/options', (req, res) => {
    res.json({
      success: true,
      data: Object.values(PAID_OPTIONS).map(option => ({
        ...option,
        description: FEATURE_DESCRIPTIONS[option.id]?.description || option.description,
        icon: FEATURE_DESCRIPTIONS[option.id]?.icon
      }))
    });
  });

  /**
   * GET /api/subscriptions/features
   * Liste toutes les features avec descriptions (public)
   */
  router.get('/features', (req, res) => {
    // Retourner uniquement la liste des features disponibles (données publiques)
    res.json({
      success: true,
      data: FEATURE_DESCRIPTIONS
    });
  });

  /**
   * GET /api/subscriptions/my-features
   * Retourne les features activées de l'utilisateur connecté
   * SECURITY: Requiert authentification - pas d'accès par email arbitraire
   */
  router.get('/my-features', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId || req.user.id || req.user.sub;
      const userEmail = req.user.email;

      // Chercher par ID ou email de l'utilisateur authentifié
      const user = await db.collection('users').findOne({
        $or: [
          { _id: new ObjectId(userId) },
          { email: userEmail }
        ]
      });

      if (user) {
        return res.json({
          success: true,
          data: {
            email: user.email,
            currentPlan: user.currentPlan,
            planName: user.planName,
            subscriptionStatus: user.subscriptionStatus || 'active',
            activatedFeatures: user.activatedFeatures || [],
            activatedOptions: user.activatedOptions || [],
            planActivatedAt: user.planActivatedAt
          }
        });
      } else {
        // Utilisateur authentifié mais pas en DB - retourner plan gratuit
        return res.json({
          success: true,
          data: {
            email: userEmail,
            currentPlan: 'free',
            planName: 'Gratuit',
            subscriptionStatus: 'active',
            activatedFeatures: ['base_access'],
            activatedOptions: []
          }
        });
      }
    } catch (error) {
      console.error('[Subscriptions] Error fetching user features:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'DB_ERROR', message: error.message }
      });
    }
  });

  // ==================== ENDPOINTS AUTHENTIFIES ====================

  /**
   * GET /api/subscriptions/my-subscription
   * Recupere les details de l'abonnement de l'utilisateur connecte
   */
  router.get('/my-subscription', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;

      const subscription = await getSubscriptionInfo(db, userId, null);

      // Recuperer les infos Stripe si disponibles
      let stripeSubscription = null;
      if (subscription.stripeSubscriptionId) {
        try {
          stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);
        } catch (e) {
          console.warn('[Subscription] Could not fetch Stripe subscription:', e.message);
        }
      }

      // Obtenir les options disponibles pour upgrade
      const availableOptions = getAvailableOptions(
        subscription.userType,
        subscription.planLevel
      );

      // Obtenir le plan suivant pour upgrade
      const planConfig = getPlanConfig(subscription.userType, subscription.planLevel);
      let nextPlan = null;

      if (subscription.userType === 'transporteur') {
        if (subscription.planLevel === 'FREE') nextPlan = TRANSPORTEUR_PLANS.PREMIUM;
        else if (subscription.planLevel === 'PREMIUM') nextPlan = TRANSPORTEUR_PLANS.BUSINESS;
      } else if (subscription.userType === 'industriel') {
        if (subscription.planLevel === 'STARTER') nextPlan = INDUSTRIEL_PLANS.PRO;
        else if (subscription.planLevel === 'PRO') nextPlan = INDUSTRIEL_PLANS.ENTERPRISE;
      }

      res.json({
        success: true,
        data: {
          subscription: {
            ...subscription,
            plan: planConfig,
            stripeStatus: stripeSubscription?.status,
            currentPeriodEnd: stripeSubscription?.current_period_end
              ? new Date(stripeSubscription.current_period_end * 1000)
              : null,
            cancelAt: stripeSubscription?.cancel_at
              ? new Date(stripeSubscription.cancel_at * 1000)
              : null
          },
          features: subscription.features,
          activeOptions: subscription.activeOptions,
          availableOptions,
          nextPlan: nextPlan ? {
            id: nextPlan.id,
            name: nextPlan.name,
            price: nextPlan.price,
            stripePriceId: nextPlan.stripePriceId
          } : null
        }
      });
    } catch (error) {
      console.error('[Subscription] Error fetching subscription:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/subscriptions/check-feature/:feature
   * Verifie si une feature est disponible pour l'utilisateur
   */
  router.get('/check-feature/:feature', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;
      const { feature } = req.params;

      const subscription = await getSubscriptionInfo(db, userId, null);

      const available = isFeatureAvailable(
        subscription.userType,
        subscription.planLevel,
        feature,
        subscription.activeOptions
      );

      res.json({
        success: true,
        data: {
          feature,
          available,
          included: subscription.features[feature] === true,
          asOption: subscription.activeOptions.includes(feature),
          featureInfo: FEATURE_DESCRIPTIONS[feature] || null,
          upgradeOption: !available ? PAID_OPTIONS[feature] || null : null
        }
      });
    } catch (error) {
      console.error('[Subscription] Error checking feature:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/activate-option
   * Active une option payante pour l'utilisateur
   * Cree une session Stripe pour le paiement
   */
  router.post('/activate-option', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;
      const { optionId, quantity = 1 } = req.body;

      if (!optionId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_OPTION_ID', message: 'optionId is required' }
        });
      }

      const option = PAID_OPTIONS[optionId];
      if (!option) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_OPTION', message: 'Option not found' }
        });
      }

      // Verifier que l'utilisateur a un abonnement Stripe actif
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
      }

      if (!user.stripeCustomerId) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_STRIPE_CUSTOMER', message: 'Vous devez d\'abord souscrire a un abonnement' }
        });
      }

      // Verifier que l'option n'est pas deja active
      if (user.activeOptions?.includes(optionId)) {
        return res.status(400).json({
          success: false,
          error: { code: 'OPTION_ALREADY_ACTIVE', message: 'Cette option est deja active' }
        });
      }

      // Si l'utilisateur a deja un abonnement Stripe, ajouter l'option
      if (user.stripeSubscriptionId) {
        try {
          // Recuperer l'abonnement existant
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

          // Ajouter l'item a l'abonnement
          const itemData = { price: option.stripePriceId };
          if (option.type === 'per_unit') {
            itemData.quantity = quantity;
          }

          await stripe.subscriptionItems.create({
            subscription: subscription.id,
            ...itemData
          });

          // Mettre a jour les options actives dans la DB
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $addToSet: { activeOptions: optionId },
              $set: { updatedAt: new Date() }
            }
          );

          // Invalider le cache
          invalidateCache(userId, null);

          return res.json({
            success: true,
            message: `Option ${option.name} activee avec succes`,
            data: { optionId, activated: true }
          });
        } catch (stripeError) {
          console.error('[Subscription] Stripe error adding option:', stripeError);
          return res.status(500).json({
            success: false,
            error: { code: 'STRIPE_ERROR', message: stripeError.message }
          });
        }
      }

      // Sinon, creer une session de paiement pour l'option seule
      const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

      const session = await stripe.checkout.sessions.create({
        customer: user.stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [{
          price: option.stripePriceId,
          quantity: option.type === 'per_unit' ? quantity : 1
        }],
        mode: 'subscription',
        success_url: `${FRONTEND_URL}/settings/subscription?option_activated=${optionId}`,
        cancel_url: `${FRONTEND_URL}/settings/subscription?option_cancelled=${optionId}`,
        metadata: {
          userId,
          optionId,
          type: 'option_activation'
        }
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (error) {
      console.error('[Subscription] Error activating option:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/deactivate-option
   * Desactive une option payante
   */
  router.post('/deactivate-option', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;
      const { optionId } = req.body;

      if (!optionId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_OPTION_ID', message: 'optionId is required' }
        });
      }

      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
      }

      // Verifier que l'option est active
      if (!user.activeOptions?.includes(optionId)) {
        return res.status(400).json({
          success: false,
          error: { code: 'OPTION_NOT_ACTIVE', message: 'Cette option n\'est pas active' }
        });
      }

      // Supprimer l'item de l'abonnement Stripe
      if (user.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
            expand: ['items']
          });

          const option = PAID_OPTIONS[optionId];
          if (option) {
            const itemToDelete = subscription.items.data.find(
              item => item.price.id === option.stripePriceId
            );

            if (itemToDelete) {
              await stripe.subscriptionItems.del(itemToDelete.id);
            }
          }
        } catch (stripeError) {
          console.error('[Subscription] Stripe error removing option:', stripeError);
          // Continue anyway to remove from DB
        }
      }

      // Retirer l'option de la DB
      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        {
          $pull: { activeOptions: optionId },
          $set: { updatedAt: new Date() }
        }
      );

      // Invalider le cache
      invalidateCache(userId, null);

      res.json({
        success: true,
        message: `Option ${optionId} desactivee avec succes`,
        data: { optionId, deactivated: true }
      });
    } catch (error) {
      console.error('[Subscription] Error deactivating option:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/upgrade-plan
   * Cree une session Stripe pour upgrader vers un nouveau plan
   */
  router.post('/upgrade-plan', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;
      const { planId, priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PRICE_ID', message: 'priceId is required' }
        });
      }

      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
      if (!user) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
      }

      // Creer ou recuperer le Stripe Customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId,
            companyName: user.companyName || ''
          }
        });
        stripeCustomerId = customer.id;

        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Si l'utilisateur a deja un abonnement, faire un upgrade
      if (user.stripeSubscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId, {
            expand: ['items']
          });

          // Trouver l'item principal (le plan, pas les options)
          const mainItem = subscription.items.data[0];

          // Mettre a jour l'item avec le nouveau prix
          await stripe.subscriptions.update(subscription.id, {
            items: [{
              id: mainItem.id,
              price: priceId
            }],
            proration_behavior: 'create_prorations'
          });

          // Determiner le nouveau planLevel
          let newPlanLevel = 'FREE';
          const allPlans = { ...TRANSPORTEUR_PLANS, ...INDUSTRIEL_PLANS };
          for (const [level, plan] of Object.entries(allPlans)) {
            if (plan.stripePriceId === priceId) {
              newPlanLevel = level;
              break;
            }
          }

          // Mettre a jour la DB
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            {
              $set: {
                planLevel: newPlanLevel,
                subscriptionStatus: 'active',
                updatedAt: new Date()
              }
            }
          );

          invalidateCache(userId, null);

          return res.json({
            success: true,
            message: 'Votre abonnement a ete mis a niveau avec succes',
            data: { planLevel: newPlanLevel, upgraded: true }
          });
        } catch (stripeError) {
          console.error('[Subscription] Stripe error upgrading:', stripeError);
          return res.status(500).json({
            success: false,
            error: { code: 'STRIPE_ERROR', message: stripeError.message }
          });
        }
      }

      // Sinon, creer une nouvelle session de checkout
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        mode: 'subscription',
        success_url: `${FRONTEND_URL}/settings/subscription?upgraded=true`,
        cancel_url: `${FRONTEND_URL}/settings/subscription?upgrade_cancelled=true`,
        metadata: {
          userId,
          planId,
          type: 'plan_upgrade'
        }
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (error) {
      console.error('[Subscription] Error upgrading plan:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/activate-module/:organizationId
   * Active un module pour une organisation (admin only)
   */
  router.post('/activate-module/:organizationId', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { organizationId } = req.params;
      const { moduleId, activatedBy } = req.body;

      // Verifier que l'utilisateur est admin
      if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Admin access required' }
        });
      }

      if (!moduleId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_MODULE_ID', message: 'moduleId is required' }
        });
      }

      // Mettre a jour l'organisation
      const result = await db.collection('organizations').updateOne(
        { _id: new ObjectId(organizationId) },
        {
          $addToSet: { activeModules: moduleId, activeOptions: moduleId },
          $set: { updatedAt: new Date() },
          $push: {
            moduleActivationHistory: {
              moduleId,
              action: 'activated',
              activatedBy: activatedBy || req.user.userId,
              activatedAt: new Date()
            }
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' }
        });
      }

      invalidateCache(null, organizationId);

      res.json({
        success: true,
        message: `Module ${moduleId} active pour l'organisation`,
        data: { organizationId, moduleId, activated: true }
      });
    } catch (error) {
      console.error('[Subscription] Error activating module:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/deactivate-module/:organizationId
   * Desactive un module pour une organisation (admin only)
   */
  router.post('/deactivate-module/:organizationId', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { organizationId } = req.params;
      const { moduleId, deactivatedBy, reason } = req.body;

      if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Admin access required' }
        });
      }

      if (!moduleId) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_MODULE_ID', message: 'moduleId is required' }
        });
      }

      const result = await db.collection('organizations').updateOne(
        { _id: new ObjectId(organizationId) },
        {
          $pull: { activeModules: moduleId, activeOptions: moduleId },
          $set: { updatedAt: new Date() },
          $push: {
            moduleActivationHistory: {
              moduleId,
              action: 'deactivated',
              deactivatedBy: deactivatedBy || req.user.userId,
              deactivatedAt: new Date(),
              reason: reason || 'Manual deactivation'
            }
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found' }
        });
      }

      invalidateCache(null, organizationId);

      res.json({
        success: true,
        message: `Module ${moduleId} desactive pour l'organisation`,
        data: { organizationId, moduleId, deactivated: true }
      });
    } catch (error) {
      console.error('[Subscription] Error deactivating module:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * POST /api/subscriptions/set-plan/:userId
   * Definit le plan d'un utilisateur (admin only)
   */
  router.post('/set-plan/:userId', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const { userId: targetUserId } = req.params;
      const { planLevel, userType } = req.body;

      if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Admin access required' }
        });
      }

      if (!planLevel) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_PLAN_LEVEL', message: 'planLevel is required' }
        });
      }

      const updateData = {
        planLevel,
        subscriptionStatus: 'active',
        updatedAt: new Date(),
        planSetBy: req.user.userId,
        planSetAt: new Date()
      };

      if (userType) {
        updateData.userType = userType;
      }

      const result = await db.collection('users').updateOne(
        { _id: new ObjectId(targetUserId) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' }
        });
      }

      invalidateCache(targetUserId, null);

      res.json({
        success: true,
        message: `Plan ${planLevel} attribue a l'utilisateur`,
        data: { userId: targetUserId, planLevel }
      });
    } catch (error) {
      console.error('[Subscription] Error setting plan:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  /**
   * GET /api/subscriptions/usage
   * Recupere les statistiques d'utilisation de l'utilisateur
   */
  router.get('/usage', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const userId = req.user.userId;
      const organizationId = req.user.organizationId;

      // Calculer le debut du mois
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Compter les commandes ce mois
      const ordersThisMonth = await db.collection('orders').countDocuments({
        $or: [
          { createdBy: userId },
          { organizationId }
        ],
        createdAt: { $gte: startOfMonth }
      });

      // Compter les documents stockes
      const documentsCount = await db.collection('documents').countDocuments({
        $or: [
          { uploadedBy: userId },
          { organizationId }
        ]
      });

      // Recuperer les infos de subscription pour les limites
      const subscription = await getSubscriptionInfo(db, userId, organizationId);
      const plan = getPlanConfig(subscription.userType, subscription.planLevel);

      res.json({
        success: true,
        data: {
          ordersThisMonth: {
            current: ordersThisMonth,
            limit: plan?.limits?.ordersPerMonth || -1,
            unlimited: plan?.limits?.ordersPerMonth === -1
          },
          documentsStored: {
            current: documentsCount,
            limit: plan?.limits?.documentsStorage || 'N/A'
          },
          plan: {
            level: subscription.planLevel,
            name: plan?.name
          },
          period: {
            start: startOfMonth,
            end: new Date(now.getFullYear(), now.getMonth() + 1, 0)
          }
        }
      });
    } catch (error) {
      console.error('[Subscription] Error fetching usage:', error);
      res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message }
      });
    }
  });

  return router;
}

module.exports = createSubscriptionManagementRoutes;
