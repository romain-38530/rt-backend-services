// Stripe Payment Routes - Checkout & Subscription Management
// RT Backend Services - Version 1.0.0

const express = require('express');
const { ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_key');
const { authenticateToken } = require('./auth-middleware');

// Configuration Stripe
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_your_webhook_secret';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function createStripeRoutes(mongoClient, mongoConnected) {
  const router = express.Router();

  // Middleware pour vérifier la connexion MongoDB
  const checkMongoDB = (req, res, next) => {
    if (!mongoConnected) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'DB_NOT_CONNECTED',
          message: 'Database not available'
        }
      });
    }
    next();
  };

  // ==================== ENDPOINTS STRIPE ====================

  /**
   * POST /api/stripe/create-checkout-session
   * Créer une session de paiement Stripe
   * Nécessite authentication
   *
   * Body: {
   *   priceId: "price_1234567890",        // Stripe Price ID
   *   successUrl: "/success",              // URL de redirection après succès
   *   cancelUrl: "/cancel",                // URL de redirection après annulation
   *   metadata: { ... }                    // Métadonnées optionnelles
   * }
   */
  router.post('/create-checkout-session', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { priceId, successUrl = '/success', cancelUrl = '/cancel', metadata = {} } = req.body;

      if (!priceId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PRICE_ID',
            message: 'Stripe price ID is required'
          }
        });
      }

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: req.user.userId,
            companyName: user.companyName || '',
            role: user.role
          }
        });
        stripeCustomerId = customer.id;

        // Sauvegarder le Stripe Customer ID
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer la session de checkout
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1
          }
        ],
        mode: 'subscription', // ou 'payment' pour un paiement unique
        success_url: `${FRONTEND_URL}${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}${cancelUrl}`,
        metadata: {
          userId: req.user.userId,
          ...metadata
        }
      });

      // Enregistrer la session dans la DB
      await db.collection('checkout_sessions').insertOne({
        sessionId: session.id,
        userId: req.user.userId,
        priceId,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(session.expires_at * 1000),
        metadata
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url
        }
      });
    } catch (error) {
      console.error('Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/create-payment-intent
   * Créer un Payment Intent pour paiement direct
   * Nécessite authentication
   *
   * Body: {
   *   amount: 5000,                        // Montant en centimes (50.00 EUR)
   *   currency: "eur",
   *   metadata: { ... }
   * }
   */
  router.post('/create-payment-intent', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { amount, currency = 'eur', metadata = {} } = req.body;

      if (!amount || amount < 50) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_AMOUNT',
            message: 'Amount must be at least 0.50 EUR (50 cents)'
          }
        });
      }

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: {
            userId: req.user.userId,
            companyName: user.companyName || '',
            role: user.role
          }
        });
        stripeCustomerId = customer.id;

        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer le Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        customer: stripeCustomerId,
        metadata: {
          userId: req.user.userId,
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true
        }
      });

      // Enregistrer dans la DB
      await db.collection('payment_intents').insertOne({
        paymentIntentId: paymentIntent.id,
        userId: req.user.userId,
        amount,
        currency,
        status: paymentIntent.status,
        createdAt: new Date(),
        metadata
      });

      res.json({
        success: true,
        data: {
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id
        }
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/stripe/subscriptions
   * Récupérer les abonnements de l'utilisateur connecté
   */
  router.get('/subscriptions', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || !user.stripeCustomerId) {
        return res.json({
          success: true,
          data: {
            subscriptions: []
          }
        });
      }

      // Récupérer les abonnements depuis Stripe
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripeCustomerId,
        limit: 100
      });

      res.json({
        success: true,
        data: {
          subscriptions: subscriptions.data
        }
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/cancel-subscription
   * Annuler un abonnement
   *
   * Body: {
   *   subscriptionId: "sub_1234567890"
   * }
   */
  router.post('/cancel-subscription', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const { subscriptionId } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SUBSCRIPTION_ID',
            message: 'Subscription ID is required'
          }
        });
      }

      // Récupérer l'abonnement pour vérifier qu'il appartient à l'utilisateur
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || subscription.customer !== user.stripeCustomerId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You are not authorized to cancel this subscription'
          }
        });
      }

      // Annuler l'abonnement
      const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);

      // Enregistrer l'annulation dans la DB
      await db.collection('subscription_events').insertOne({
        userId: req.user.userId,
        subscriptionId,
        event: 'subscription_canceled',
        timestamp: new Date(),
        data: canceledSubscription
      });

      res.json({
        success: true,
        message: 'Subscription canceled successfully',
        data: canceledSubscription
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/stripe/payment-history
   * Récupérer l'historique des paiements de l'utilisateur
   */
  router.get('/payment-history', authenticateToken, checkMongoDB, async (req, res) => {
    try {
      const db = mongoClient.db();
      const user = await db.collection('users').findOne({ _id: new ObjectId(req.user.userId) });

      if (!user || !user.stripeCustomerId) {
        return res.json({
          success: true,
          data: {
            payments: []
          }
        });
      }

      // Récupérer les paiements depuis Stripe
      const charges = await stripe.charges.list({
        customer: user.stripeCustomerId,
        limit: 100
      });

      res.json({
        success: true,
        data: {
          payments: charges.data
        }
      });
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * POST /api/stripe/webhook
   * Webhook pour recevoir les événements Stripe
   * IMPORTANT: Ce endpoint ne doit PAS avoir d'authentication JWT
   */
  router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      // Vérifier la signature du webhook
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (!mongoConnected) {
      console.error('MongoDB not connected, webhook event not processed');
      return res.status(503).json({ error: 'Database not available' });
    }

    const db = mongoClient.db();

    // Traiter l'événement
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          // Session de paiement complétée
          const session = event.data.object;
          await db.collection('checkout_sessions').updateOne(
            { sessionId: session.id },
            {
              $set: {
                status: 'completed',
                completedAt: new Date(),
                subscriptionId: session.subscription || null
              }
            }
          );

          // Mettre à jour l'utilisateur avec l'abonnement
          if (session.subscription) {
            await db.collection('users').updateOne(
              { _id: new ObjectId(session.metadata.userId) },
              {
                $set: {
                  subscriptionId: session.subscription,
                  subscriptionStatus: 'active',
                  updatedAt: new Date()
                }
              }
            );
          }

          console.log('✅ Checkout session completed:', session.id);
          break;

        case 'customer.subscription.created':
          // Abonnement créé
          const subCreated = event.data.object;
          await db.collection('subscription_events').insertOne({
            subscriptionId: subCreated.id,
            customerId: subCreated.customer,
            event: 'subscription_created',
            status: subCreated.status,
            timestamp: new Date(),
            data: subCreated
          });
          console.log('✅ Subscription created:', subCreated.id);
          break;

        case 'customer.subscription.updated':
          // Abonnement mis à jour
          const subUpdated = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: subUpdated.customer },
            {
              $set: {
                subscriptionStatus: subUpdated.status,
                updatedAt: new Date()
              }
            }
          );

          await db.collection('subscription_events').insertOne({
            subscriptionId: subUpdated.id,
            customerId: subUpdated.customer,
            event: 'subscription_updated',
            status: subUpdated.status,
            timestamp: new Date(),
            data: subUpdated
          });
          console.log('✅ Subscription updated:', subUpdated.id);
          break;

        case 'customer.subscription.deleted':
          // Abonnement supprimé
          const subDeleted = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: subDeleted.customer },
            {
              $set: {
                subscriptionStatus: 'canceled',
                updatedAt: new Date()
              }
            }
          );

          await db.collection('subscription_events').insertOne({
            subscriptionId: subDeleted.id,
            customerId: subDeleted.customer,
            event: 'subscription_deleted',
            status: 'canceled',
            timestamp: new Date(),
            data: subDeleted
          });
          console.log('✅ Subscription deleted:', subDeleted.id);
          break;

        case 'invoice.payment_succeeded':
          // Paiement de facture réussi
          const invoice = event.data.object;
          await db.collection('invoices').insertOne({
            invoiceId: invoice.id,
            customerId: invoice.customer,
            subscriptionId: invoice.subscription,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: 'paid',
            paidAt: new Date(invoice.status_transitions.paid_at * 1000),
            createdAt: new Date()
          });
          console.log('✅ Invoice paid:', invoice.id);
          break;

        case 'invoice.payment_failed':
          // Paiement de facture échoué
          const failedInvoice = event.data.object;
          await db.collection('users').updateOne(
            { stripeCustomerId: failedInvoice.customer },
            {
              $set: {
                subscriptionStatus: 'past_due',
                updatedAt: new Date()
              }
            }
          );
          console.log('❌ Invoice payment failed:', failedInvoice.id);
          break;

        case 'payment_intent.succeeded':
          // Payment Intent réussi
          const paymentIntent = event.data.object;
          await db.collection('payment_intents').updateOne(
            { paymentIntentId: paymentIntent.id },
            {
              $set: {
                status: 'succeeded',
                succeededAt: new Date()
              }
            }
          );
          console.log('✅ Payment succeeded:', paymentIntent.id);
          break;

        case 'payment_intent.payment_failed':
          // Payment Intent échoué
          const failedPayment = event.data.object;
          await db.collection('payment_intents').updateOne(
            { paymentIntentId: failedPayment.id },
            {
              $set: {
                status: 'failed',
                failedAt: new Date(),
                failureReason: failedPayment.last_payment_error?.message || 'Unknown error'
              }
            }
          );
          console.log('❌ Payment failed:', failedPayment.id);
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      // Enregistrer tous les événements
      await db.collection('stripe_webhooks').insertOne({
        eventId: event.id,
        type: event.type,
        createdAt: new Date(),
        data: event.data.object
      });

      res.json({ received: true });
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  /**
   * POST /api/setup/create-session
   * Créer une session Stripe pour enregistrer une carte bancaire (sans paiement)
   * ENDPOINT PUBLIC - Pour l'onboarding
   *
   * Body: {
   *   requestId: "xxx",                      // ID de la demande d'onboarding
   *   email: "client@example.com",
   *   successUrl: "/finalize-payment/success",
   *   cancelUrl: "/finalize-payment"
   * }
   */
  router.post('/create-session', checkMongoDB, async (req, res) => {
    try {
      const { requestId, email, successUrl, cancelUrl } = req.body;

      if (!requestId || !email) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMS',
            message: 'requestId and email are required'
          }
        });
      }

      const db = mongoClient.db();

      // Vérifier que la demande d'onboarding existe
      const onboardingRequest = await db.collection('onboarding_requests').findOne({
        _id: new ObjectId(requestId),
        email: email.toLowerCase()
      });

      if (!onboardingRequest) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'REQUEST_NOT_FOUND',
            message: 'Onboarding request not found'
          }
        });
      }

      // Créer ou récupérer le Stripe Customer
      let stripeCustomerId = onboardingRequest.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: email.toLowerCase(),
          name: onboardingRequest.companyName,
          metadata: {
            requestId,
            companyName: onboardingRequest.companyName || '',
            source: 'onboarding'
          }
        });
        stripeCustomerId = customer.id;

        // Sauvegarder le Stripe Customer ID dans la demande
        await db.collection('onboarding_requests').updateOne(
          { _id: new ObjectId(requestId) },
          { $set: { stripeCustomerId, updatedAt: new Date() } }
        );
      }

      // Créer la session de checkout en mode "setup"
      const session = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        mode: 'setup',
        success_url: successUrl || `${FRONTEND_URL}/finalize-payment/success?requestId=${requestId}`,
        cancel_url: cancelUrl || `${FRONTEND_URL}/finalize-payment?requestId=${requestId}&email=${encodeURIComponent(email)}&cancelled=true`,
        metadata: {
          requestId,
          type: 'card_setup',
          companyName: onboardingRequest.companyName
        }
      });

      // Enregistrer la session dans la DB
      await db.collection('setup_sessions').insertOne({
        sessionId: session.id,
        requestId,
        email: email.toLowerCase(),
        stripeCustomerId,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(session.expires_at * 1000)
      });

      console.log('✅ Setup session created for:', email, 'Session:', session.id);

      res.json({
        success: true,
        url: session.url,
        sessionId: session.id
      });
    } catch (error) {
      console.error('Error creating setup session:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  /**
   * GET /api/stripe/products
   * Liste des produits et prix disponibles (public)
   */
  router.get('/products', async (req, res) => {
    try {
      // Récupérer les produits actifs
      const products = await stripe.products.list({
        active: true,
        limit: 100
      });

      // Récupérer les prix pour chaque produit
      const productsWithPrices = await Promise.all(
        products.data.map(async (product) => {
          const prices = await stripe.prices.list({
            product: product.id,
            active: true
          });

          return {
            ...product,
            prices: prices.data
          };
        })
      );

      res.json({
        success: true,
        data: {
          products: productsWithPrices
        }
      });
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'STRIPE_ERROR',
          message: error.message
        }
      });
    }
  });

  return router;
}

module.exports = createStripeRoutes;
