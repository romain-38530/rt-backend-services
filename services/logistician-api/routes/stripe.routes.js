/**
 * Stripe Integration Routes
 * Gestion des abonnements et options payantes logisticien
 */

import { Router } from 'express';
import Stripe from 'stripe';
import { ObjectId } from 'mongodb';
import { authenticateLogistician } from '../index.js';

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_xxx');

// Price IDs (à configurer dans Stripe Dashboard)
const STRIPE_PRICES = {
  bourse_stockage: process.env.STRIPE_PRICE_BOURSE_STOCKAGE || 'price_bourse_stockage',
  borne_accueil: process.env.STRIPE_PRICE_BORNE_ACCUEIL || 'price_borne_accueil'
};

// ===========================================
// POST /api/logisticians/:id/subscribe/checkout
// Créer une session Stripe Checkout
// ===========================================
router.post('/:id/subscribe/checkout', authenticateLogistician, async (req, res) => {
  try {
    const { option, successUrl, cancelUrl } = req.body;
    const logisticianId = req.params.id;
    const db = req.db;

    // Valider option
    if (!['bourse_stockage', 'borne_accueil'].includes(option)) {
      return res.status(400).json({ error: 'Option invalide' });
    }

    // Vérifier logisticien existe et actif
    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId),
      status: 'active'
    });

    if (!logistician) {
      return res.status(404).json({ error: 'Logisticien non trouvé ou inactif' });
    }

    // Vérifier si déjà abonné à cette option
    const existingSubscription = await db.collection('logistician_subscriptions').findOne({
      logisticianId: new ObjectId(logisticianId),
      option: option,
      status: { $in: ['active', 'trialing'] }
    });

    if (existingSubscription) {
      return res.status(400).json({ error: 'Déjà abonné à cette option' });
    }

    // Créer ou récupérer client Stripe
    let customerId = logistician.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: logistician.email,
        name: logistician.companyName,
        metadata: {
          logisticianId: logisticianId,
          siret: logistician.siret || ''
        }
      });
      customerId = customer.id;

      // Sauvegarder customer ID
      await db.collection('logisticians').updateOne(
        { _id: new ObjectId(logisticianId) },
        { $set: { stripeCustomerId: customerId, updatedAt: new Date() } }
      );
    }

    // Créer session Checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card', 'sepa_debit'],
      line_items: [{
        price: STRIPE_PRICES[option],
        quantity: 1
      }],
      success_url: successUrl || `${process.env.LOGISTICIAN_PORTAL_URL}/settings/subscriptions?success=true`,
      cancel_url: cancelUrl || `${process.env.LOGISTICIAN_PORTAL_URL}/settings/subscriptions?canceled=true`,
      metadata: {
        logisticianId: logisticianId,
        option: option
      },
      subscription_data: {
        metadata: {
          logisticianId: logisticianId,
          option: option
        }
      },
      locale: 'fr'
    });

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'subscription.checkout_started',
      logisticianId: new ObjectId(logisticianId),
      data: { option, sessionId: session.id },
      createdAt: new Date()
    });

    res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error) {
    console.error('[STRIPE] Checkout error:', error);
    res.status(500).json({ error: 'Erreur création checkout', details: error.message });
  }
});

// ===========================================
// GET /api/logisticians/:id/subscriptions
// Liste des abonnements actifs
// ===========================================
router.get('/:id/subscriptions', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const db = req.db;

    const subscriptions = await db.collection('logistician_subscriptions')
      .find({
        logisticianId: new ObjectId(logisticianId),
        status: { $in: ['active', 'trialing', 'past_due'] }
      })
      .toArray();

    // Calculer total mensuel
    const totalMonthly = subscriptions.reduce((sum, sub) => {
      return sum + (sub.priceAmount || 0);
    }, 0);

    // Récupérer options actives
    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    res.json({
      subscriptions: subscriptions.map(sub => ({
        id: sub._id,
        option: sub.option,
        optionName: sub.option === 'bourse_stockage' ? 'Bourse Stockage' : 'Borne Accueil Chauffeur',
        status: sub.status,
        priceAmount: sub.priceAmount / 100, // Convertir centimes en euros
        currency: sub.currency,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd
      })),
      totalMonthly: totalMonthly / 100,
      options: {
        bourseStockage: logistician?.options?.bourseStockage?.active || false,
        borneAccueil: logistician?.options?.borneAccueil?.active || false
      }
    });

  } catch (error) {
    console.error('[STRIPE] List subscriptions error:', error);
    res.status(500).json({ error: 'Erreur récupération abonnements' });
  }
});

// ===========================================
// DELETE /api/logisticians/:id/subscriptions/:subscriptionId
// Annuler un abonnement (fin de période)
// ===========================================
router.delete('/:id/subscriptions/:subscriptionId', authenticateLogistician, async (req, res) => {
  try {
    const { id: logisticianId, subscriptionId } = req.params;
    const db = req.db;

    // Récupérer abonnement
    const subscription = await db.collection('logistician_subscriptions').findOne({
      _id: new ObjectId(subscriptionId),
      logisticianId: new ObjectId(logisticianId)
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    // Annuler sur Stripe (fin de période)
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    // Mettre à jour en base
    await db.collection('logistician_subscriptions').updateOne(
      { _id: new ObjectId(subscriptionId) },
      {
        $set: {
          cancelAtPeriodEnd: true,
          updatedAt: new Date()
        }
      }
    );

    // Log event
    await db.collection('logistician_events').insertOne({
      type: 'subscription.cancel_requested',
      logisticianId: new ObjectId(logisticianId),
      data: { option: subscription.option, subscriptionId },
      createdAt: new Date()
    });

    res.json({
      message: 'Abonnement sera annulé à la fin de la période',
      cancelAt: subscription.currentPeriodEnd
    });

  } catch (error) {
    console.error('[STRIPE] Cancel subscription error:', error);
    res.status(500).json({ error: 'Erreur annulation abonnement' });
  }
});

// ===========================================
// POST /api/stripe/webhook
// Webhook Stripe pour confirmer paiements
// ===========================================
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const db = req.db;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[STRIPE] Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[STRIPE] Webhook received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { logisticianId, option } = session.metadata;

        if (!logisticianId || !option) break;

        // Récupérer subscription details
        const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);

        // Enregistrer abonnement
        await db.collection('logistician_subscriptions').insertOne({
          logisticianId: new ObjectId(logisticianId),
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          option: option,
          status: 'active',
          currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          cancelAtPeriodEnd: false,
          priceAmount: option === 'bourse_stockage' ? 15000 : 10000, // centimes
          currency: 'eur',
          createdAt: new Date()
        });

        // Activer option sur logisticien
        const updateField = option === 'bourse_stockage'
          ? 'options.bourseStockage'
          : 'options.borneAccueil';

        await db.collection('logisticians').updateOne(
          { _id: new ObjectId(logisticianId) },
          {
            $set: {
              [updateField]: { active: true, activatedAt: new Date() },
              updatedAt: new Date()
            }
          }
        );

        // Log event
        await db.collection('logistician_events').insertOne({
          type: 'subscription.activated',
          logisticianId: new ObjectId(logisticianId),
          data: { option, subscriptionId: session.subscription },
          createdAt: new Date()
        });

        // TODO: Envoyer email confirmation
        console.log(`[STRIPE] Subscription activated: ${option} for ${logisticianId}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const { logisticianId, option } = subscription.metadata;

        if (!logisticianId) break;

        // Mettre à jour période
        await db.collection('logistician_subscriptions').updateOne(
          { stripeSubscriptionId: invoice.subscription },
          {
            $set: {
              status: 'active',
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              updatedAt: new Date()
            }
          }
        );

        // Créer facture interne
        await db.collection('logistician_invoices').insertOne({
          invoiceNumber: `FAC-OPT-${Date.now()}`,
          type: 'option',
          status: 'paid',
          stripeInvoiceId: invoice.id,
          issuerId: null, // SYMPHONI.A
          issuerName: 'SYMPHONI.A - RT Technologie',
          recipientId: new ObjectId(logisticianId),
          recipientType: 'logistician',
          lines: [{
            description: option === 'bourse_stockage' ? 'Bourse Stockage - Abonnement mensuel' : 'Borne Accueil Chauffeur - Abonnement mensuel',
            quantity: 1,
            unitPrice: invoice.amount_paid / 100,
            vatRate: 20,
            amountHT: (invoice.amount_paid / 100) / 1.2,
            amountTTC: invoice.amount_paid / 100
          }],
          totalTTC: invoice.amount_paid / 100,
          currency: 'EUR',
          issueDate: new Date(),
          paidAt: new Date(),
          createdAt: new Date()
        });

        console.log(`[STRIPE] Invoice paid: ${invoice.id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const { logisticianId } = subscription.metadata;

        if (!logisticianId) break;

        // Mettre à jour statut
        await db.collection('logistician_subscriptions').updateOne(
          { stripeSubscriptionId: invoice.subscription },
          {
            $set: {
              status: 'past_due',
              updatedAt: new Date()
            }
          }
        );

        // Log event
        await db.collection('logistician_events').insertOne({
          type: 'subscription.payment_failed',
          logisticianId: new ObjectId(logisticianId),
          data: { invoiceId: invoice.id },
          createdAt: new Date()
        });

        // TODO: Envoyer email alerte
        console.log(`[STRIPE] Payment failed: ${invoice.id}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const { logisticianId, option } = subscription.metadata;

        if (!logisticianId) break;

        // Désactiver abonnement
        await db.collection('logistician_subscriptions').updateOne(
          { stripeSubscriptionId: subscription.id },
          {
            $set: {
              status: 'canceled',
              canceledAt: new Date(),
              updatedAt: new Date()
            }
          }
        );

        // Désactiver option
        const updateField = option === 'bourse_stockage'
          ? 'options.bourseStockage'
          : 'options.borneAccueil';

        await db.collection('logisticians').updateOne(
          { _id: new ObjectId(logisticianId) },
          {
            $set: {
              [updateField]: { active: false, deactivatedAt: new Date() },
              updatedAt: new Date()
            }
          }
        );

        console.log(`[STRIPE] Subscription canceled: ${subscription.id}`);
        break;
      }
    }

    res.json({ received: true });

  } catch (error) {
    console.error('[STRIPE] Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing error' });
  }
});

// ===========================================
// GET /api/logisticians/:id/billing/portal
// Créer lien vers Stripe Customer Portal
// ===========================================
router.get('/:id/billing/portal', authenticateLogistician, async (req, res) => {
  try {
    const logisticianId = req.params.id;
    const db = req.db;

    const logistician = await db.collection('logisticians').findOne({
      _id: new ObjectId(logisticianId)
    });

    if (!logistician?.stripeCustomerId) {
      return res.status(400).json({ error: 'Aucun compte de facturation' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: logistician.stripeCustomerId,
      return_url: `${process.env.LOGISTICIAN_PORTAL_URL}/settings/subscriptions`
    });

    res.json({ portalUrl: session.url });

  } catch (error) {
    console.error('[STRIPE] Portal error:', error);
    res.status(500).json({ error: 'Erreur création portail facturation' });
  }
});

export default router;
