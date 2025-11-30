/**
 * SYMPHONI.A - Subscriptions & Pricing API
 * Gestion des abonnements, tarification et facturation
 *
 * Basé sur la Grille Tarifaire Officielle SYMPHONI.A
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const Stripe = require('stripe');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { addMonths, addYears, differenceInDays, format } = require('date-fns');

const app = express();
const PORT = process.env.PORT || 3014;

// Stripe initialization
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());

// =============================================================================
// GRILLE TARIFAIRE OFFICIELLE SYMPHONI.A
// =============================================================================

const PRICING_GRID = {
  // Abonnements de base
  subscriptions: {
    INDUSTRIEL: {
      id: 'INDUSTRIEL',
      name: 'Industriel',
      description: 'Pour les donneurs d\'ordre industriels',
      priceMonthly: 799.00,
      priceLaunch: 499.00,  // Prix de lancement
      launchEndDate: '2025-12-31',
      features: [
        'Création et gestion des ordres de transport',
        'Accès au réseau de transporteurs',
        'Tableau de bord analytique',
        'Suivi en temps réel',
        'Support standard',
        'Jusqu\'à 100 transports/mois inclus'
      ],
      includedTransports: 100,
      extraTransportPrice: 3.50
    },
    TRANSPORTEUR_INVITE: {
      id: 'TRANSPORTEUR_INVITE',
      name: 'Transporteur Invité',
      description: 'Accès gratuit pour les transporteurs invités',
      priceMonthly: 0,
      priceLaunch: 0,
      features: [
        'Réception et acceptation des missions',
        'Suivi GPS basique',
        'Communication avec l\'expéditeur',
        'Validation livraison'
      ],
      limitations: [
        'Pas d\'accès Affret.IA',
        'Pas de tableau de bord analytics',
        'Support communautaire uniquement'
      ]
    },
    TRANSPORTEUR_PREMIUM: {
      id: 'TRANSPORTEUR_PREMIUM',
      name: 'Transporteur Premium',
      description: 'Pour les transporteurs professionnels',
      priceMonthly: 299.00,
      priceLaunch: 299.00,
      features: [
        'Toutes les fonctionnalités Invité',
        'Accès Affret.IA (bourse de fret)',
        'Tableau de bord performance',
        'Score transporteur visible',
        'Visibilité prioritaire',
        'Support prioritaire'
      ]
    },
    TRANSPORTEUR_DO: {
      id: 'TRANSPORTEUR_DO',
      name: 'Transporteur Donneur d\'Ordre',
      description: 'Pour les transporteurs qui sous-traitent',
      priceMonthly: 499.00,
      priceLaunch: 499.00,
      features: [
        'Toutes les fonctionnalités Premium',
        'Création d\'ordres de transport',
        'Gestion des sous-traitants',
        'Affrètement de fret propre',
        'Analytics avancés'
      ]
    },
    LOGISTICIEN_PREMIUM: {
      id: 'LOGISTICIEN_PREMIUM',
      name: 'Logisticien Premium',
      description: 'Pour les entrepôts et logisticiens',
      priceMonthly: 499.00,
      priceLaunch: 499.00,
      features: [
        'Gestion des quais',
        'Planification des RDV',
        'Gestion des slots horaires',
        'Tableau de bord entrepôt',
        'Intégration WMS',
        'KPIs logistiques'
      ]
    },
    TRANSITAIRE_PREMIUM: {
      id: 'TRANSITAIRE_PREMIUM',
      name: 'Transitaire Premium',
      description: 'Pour les transitaires et commissionnaires',
      priceMonthly: 299.00,
      priceLaunch: 299.00,
      features: [
        'Gestion multi-modal',
        'Documents douaniers',
        'Coordination internationale',
        'Suivi cross-border',
        'Partenariats transitaires'
      ]
    }
  },

  // Module Tracking IA
  trackingIA: {
    BASIC: {
      id: 'TRACKING_IA_BASIC',
      name: 'Tracking IA Basic',
      description: 'Suivi GPS basique avec IA',
      priceMonthly: 50.00,
      features: [
        'Position GPS temps réel',
        'ETA prédictif simple',
        'Notifications retard',
        'Historique 30 jours'
      ]
    },
    INTERMEDIAIRE: {
      id: 'TRACKING_IA_INTERMEDIAIRE',
      name: 'Tracking IA Intermédiaire',
      description: 'Suivi avancé avec prédictions',
      priceMonthly: 150.00,
      features: [
        'Toutes fonctionnalités Basic',
        'Prédiction retards avancée',
        'Analyse des patterns',
        'Alertes intelligentes',
        'API webhooks',
        'Historique 90 jours'
      ]
    },
    PREMIUM: {
      id: 'TRACKING_IA_PREMIUM',
      name: 'Tracking IA Premium',
      description: 'Tracking intelligent à l\'usage',
      pricePerTransport: 4.00,
      features: [
        'Toutes fonctionnalités Intermédiaire',
        'IA prédictive avancée',
        'Optimisation routes en temps réel',
        'Analyse comportementale',
        'Reporting personnalisé',
        'Historique illimité',
        'Support dédié'
      ]
    }
  },

  // Modules additionnels
  modules: {
    AFFRET_IA: {
      id: 'AFFRET_IA',
      name: 'Affret.IA',
      description: 'Bourse de fret intelligente avec matching IA',
      priceMonthly: 0,  // Gratuit
      commissionRate: 0.04,  // 4% sur transaction réussie
      features: [
        'Publication d\'annonces',
        'Matching IA transporteur-fret',
        'Négociation intégrée',
        'Score de compatibilité',
        'Historique des échanges'
      ]
    },
    PALETTES_EUROPE: {
      id: 'PALETTES_EUROPE',
      name: 'Palettes Europe',
      description: 'Gestion du parc palettes européen',
      priceMonthly: 199.00,
      features: [
        'Suivi des palettes EUR',
        'Compte palette automatique',
        'Bons d\'échange digitaux',
        'Réconciliation automatique',
        'Reporting palettes'
      ]
    },
    SIGNATURE_ELECTRONIQUE: {
      id: 'SIGNATURE_ELECTRONIQUE',
      name: 'Signature Électronique eCMR',
      description: 'CMR électronique avec signature légale',
      priceMonthly: 99.00,
      features: [
        'eCMR conforme',
        'Signature digitale sécurisée',
        'Horodatage certifié',
        'Archivage légal 10 ans',
        'Intégration automatique'
      ]
    },
    PREFACTURATION: {
      id: 'PREFACTURATION',
      name: 'Préfacturation',
      description: 'Module de préfacturation et contrôle',
      priceMonthly: 199.00,
      features: [
        'Génération automatique préfactures',
        'Rapprochement commande/livraison',
        'Contrôle des écarts',
        'Workflow validation',
        'Export comptable'
      ]
    }
  },

  // Packs tout-en-un
  packs: {
    INDUSTRIEL_PREMIUM: {
      id: 'PACK_INDUSTRIEL_PREMIUM',
      name: 'Pack Industriel Premium',
      description: 'Solution complète pour industriels',
      priceMonthly: 699.00,
      savings: '35%',
      includes: [
        { type: 'subscription', id: 'INDUSTRIEL' },
        { type: 'trackingIA', id: 'INTERMEDIAIRE' },
        { type: 'module', id: 'AFFRET_IA' },
        { type: 'module', id: 'SIGNATURE_ELECTRONIQUE' }
      ],
      bonusFeatures: [
        'Support prioritaire',
        'Account manager dédié',
        'Formation incluse'
      ]
    },
    TRANSPORTEUR_DO: {
      id: 'PACK_TRANSPORTEUR_DO',
      name: 'Pack Transporteur D.O.',
      description: 'Pour les transporteurs donneurs d\'ordre',
      priceMonthly: 599.00,
      savings: '30%',
      includes: [
        { type: 'subscription', id: 'TRANSPORTEUR_DO' },
        { type: 'trackingIA', id: 'INTERMEDIAIRE' },
        { type: 'module', id: 'AFFRET_IA' }
      ],
      bonusFeatures: [
        'Support prioritaire',
        'Visibilité boostée Affret.IA'
      ]
    },
    LOGISTICIEN_PREMIUM: {
      id: 'PACK_LOGISTICIEN_PREMIUM',
      name: 'Pack Logisticien Premium',
      description: 'Solution complète entrepôt',
      priceMonthly: 599.00,
      savings: '30%',
      includes: [
        { type: 'subscription', id: 'LOGISTICIEN_PREMIUM' },
        { type: 'trackingIA', id: 'BASIC' },
        { type: 'module', id: 'PALETTES_EUROPE' }
      ],
      bonusFeatures: [
        'Intégration WMS prioritaire',
        'Support dédié entrepôt'
      ]
    },
    ULTIMATE: {
      id: 'PACK_ULTIMATE',
      name: 'Pack Ultimate',
      description: 'L\'offre la plus complète SYMPHONI.A',
      priceMonthly: 999.00,
      savings: '50%',
      includes: [
        { type: 'subscription', id: 'INDUSTRIEL' },
        { type: 'trackingIA', id: 'PREMIUM' },
        { type: 'module', id: 'AFFRET_IA' },
        { type: 'module', id: 'PALETTES_EUROPE' },
        { type: 'module', id: 'SIGNATURE_ELECTRONIQUE' },
        { type: 'module', id: 'PREFACTURATION' }
      ],
      bonusFeatures: [
        'Account manager VIP',
        'Support 24/7',
        'Formation sur site',
        'Personnalisation interface',
        'API prioritaire',
        'SLA 99.9%'
      ]
    }
  },

  // Remises engagement long terme
  discounts: {
    ENGAGEMENT_3_ANS: {
      id: 'ENGAGEMENT_3_ANS',
      name: 'Engagement 3 ans',
      discountPercent: 3,
      durationYears: 3
    },
    ENGAGEMENT_4_ANS: {
      id: 'ENGAGEMENT_4_ANS',
      name: 'Engagement 4 ans',
      discountPercent: 5,
      durationYears: 4
    },
    ENGAGEMENT_5_ANS: {
      id: 'ENGAGEMENT_5_ANS',
      name: 'Engagement 5 ans',
      discountPercent: 7,
      durationYears: 5
    }
  }
};

// =============================================================================
// MONGOOSE SCHEMAS
// =============================================================================

const subscriptionSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  companyId: { type: String, required: true, index: true },
  companyName: String,
  companyType: { type: String, enum: ['industry', 'transporter', 'logistician', 'forwarder'] },

  // Abonnement principal
  subscriptionType: { type: String, required: true },
  subscriptionName: String,

  // Modules actifs
  activeModules: [{
    moduleId: String,
    moduleName: String,
    activatedAt: Date,
    priceMonthly: Number
  }],

  // Tracking IA
  trackingIALevel: { type: String, enum: ['NONE', 'BASIC', 'INTERMEDIAIRE', 'PREMIUM'], default: 'NONE' },

  // Pack (si applicable)
  packId: String,
  packName: String,

  // Tarification
  pricing: {
    basePrice: Number,
    modulesPrice: Number,
    trackingPrice: Number,
    packPrice: Number,
    subtotal: Number,
    discountPercent: Number,
    discountAmount: Number,
    totalMonthly: Number,
    totalAnnual: Number
  },

  // Engagement
  engagement: {
    type: { type: String, enum: ['monthly', '1_year', '3_years', '4_years', '5_years'], default: 'monthly' },
    startDate: Date,
    endDate: Date,
    discountPercent: { type: Number, default: 0 }
  },

  // Stripe
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripePaymentMethodId: String,

  // Statut
  status: {
    type: String,
    enum: ['active', 'trial', 'past_due', 'canceled', 'suspended'],
    default: 'trial'
  },
  trialEndsAt: Date,

  // Facturation
  billingCycle: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
  nextBillingDate: Date,
  lastBillingDate: Date,

  // Usage tracking
  usage: {
    transportsThisMonth: { type: Number, default: 0 },
    affretIATransactions: { type: Number, default: 0 },
    trackingPremiumUsage: { type: Number, default: 0 }
  },

  // Métadonnées
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: String
});

const invoiceSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  subscriptionId: { type: String, required: true, index: true },
  companyId: { type: String, required: true, index: true },

  invoiceNumber: { type: String, unique: true },

  // Période
  periodStart: Date,
  periodEnd: Date,

  // Lignes de facture
  lineItems: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    amount: Number,
    type: { type: String, enum: ['subscription', 'module', 'usage', 'commission', 'discount'] }
  }],

  // Totaux
  subtotal: Number,
  taxRate: { type: Number, default: 0.20 },  // TVA 20%
  taxAmount: Number,
  total: Number,

  // Paiement
  status: {
    type: String,
    enum: ['draft', 'pending', 'paid', 'failed', 'refunded'],
    default: 'draft'
  },
  paidAt: Date,
  stripeInvoiceId: String,
  stripePaymentIntentId: String,

  // PDF
  pdfUrl: String,

  createdAt: { type: Date, default: Date.now }
});

const usageRecordSchema = new mongoose.Schema({
  id: { type: String, default: () => uuidv4() },
  subscriptionId: { type: String, required: true, index: true },
  companyId: { type: String, required: true, index: true },

  type: {
    type: String,
    enum: ['transport', 'affret_ia_commission', 'tracking_premium'],
    required: true
  },

  // Détails
  referenceId: String,  // orderId, transactionId, etc.
  quantity: { type: Number, default: 1 },
  unitPrice: Number,
  totalAmount: Number,

  // Métadonnées
  metadata: mongoose.Schema.Types.Mixed,

  // Période
  recordedAt: { type: Date, default: Date.now },
  billingPeriod: String  // YYYY-MM
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);
const Invoice = mongoose.model('Invoice', invoiceSchema);
const UsageRecord = mongoose.model('UsageRecord', usageRecordSchema);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Vérifie si on est en période de lancement
 */
function isLaunchPeriod() {
  const launchEndDate = new Date(PRICING_GRID.subscriptions.INDUSTRIEL.launchEndDate);
  return new Date() <= launchEndDate;
}

/**
 * Calcule le prix d'un abonnement avec tous les modules
 */
function calculateSubscriptionPrice(subscriptionType, modules = [], trackingLevel = 'NONE', packId = null, engagementType = 'monthly') {
  const result = {
    basePrice: 0,
    modulesPrice: 0,
    trackingPrice: 0,
    packPrice: 0,
    subtotal: 0,
    discountPercent: 0,
    discountAmount: 0,
    totalMonthly: 0,
    totalAnnual: 0,
    breakdown: []
  };

  // Si pack, utiliser le prix pack
  if (packId && PRICING_GRID.packs[packId]) {
    const pack = PRICING_GRID.packs[packId];
    result.packPrice = pack.priceMonthly;
    result.subtotal = pack.priceMonthly;
    result.breakdown.push({
      type: 'pack',
      name: pack.name,
      price: pack.priceMonthly
    });
  } else {
    // Abonnement de base
    const sub = PRICING_GRID.subscriptions[subscriptionType];
    if (sub) {
      const price = isLaunchPeriod() && sub.priceLaunch ? sub.priceLaunch : sub.priceMonthly;
      result.basePrice = price;
      result.breakdown.push({
        type: 'subscription',
        name: sub.name,
        price: price,
        isLaunchPrice: isLaunchPeriod() && sub.priceLaunch !== sub.priceMonthly
      });
    }

    // Modules additionnels
    modules.forEach(moduleId => {
      const mod = PRICING_GRID.modules[moduleId];
      if (mod && mod.priceMonthly > 0) {
        result.modulesPrice += mod.priceMonthly;
        result.breakdown.push({
          type: 'module',
          name: mod.name,
          price: mod.priceMonthly
        });
      }
    });

    // Tracking IA
    if (trackingLevel !== 'NONE') {
      const tracking = PRICING_GRID.trackingIA[trackingLevel];
      if (tracking && tracking.priceMonthly) {
        result.trackingPrice = tracking.priceMonthly;
        result.breakdown.push({
          type: 'tracking',
          name: tracking.name,
          price: tracking.priceMonthly
        });
      }
    }

    result.subtotal = result.basePrice + result.modulesPrice + result.trackingPrice;
  }

  // Remise engagement long terme
  const discount = getEngagementDiscount(engagementType);
  if (discount > 0) {
    result.discountPercent = discount;
    result.discountAmount = result.subtotal * (discount / 100);
    result.breakdown.push({
      type: 'discount',
      name: `Remise engagement ${engagementType.replace('_', ' ')}`,
      price: -result.discountAmount,
      percent: discount
    });
  }

  result.totalMonthly = result.subtotal - result.discountAmount;
  result.totalAnnual = result.totalMonthly * 12;

  return result;
}

/**
 * Obtient la remise selon l'engagement
 */
function getEngagementDiscount(engagementType) {
  switch (engagementType) {
    case '3_years': return PRICING_GRID.discounts.ENGAGEMENT_3_ANS.discountPercent;
    case '4_years': return PRICING_GRID.discounts.ENGAGEMENT_4_ANS.discountPercent;
    case '5_years': return PRICING_GRID.discounts.ENGAGEMENT_5_ANS.discountPercent;
    default: return 0;
  }
}

/**
 * Génère un numéro de facture
 */
function generateInvoiceNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `SYM-${year}${month}-${random}`;
}

/**
 * Calcule les frais d'usage (commission Affret.IA, tracking premium)
 */
async function calculateUsageFees(subscriptionId, periodStart, periodEnd) {
  const usageRecords = await UsageRecord.find({
    subscriptionId,
    recordedAt: { $gte: periodStart, $lte: periodEnd }
  });

  let totalUsageFees = 0;
  const fees = [];

  // Commission Affret.IA
  const affretIARecords = usageRecords.filter(r => r.type === 'affret_ia_commission');
  if (affretIARecords.length > 0) {
    const totalCommission = affretIARecords.reduce((sum, r) => sum + r.totalAmount, 0);
    fees.push({
      description: `Commission Affret.IA (${affretIARecords.length} transactions)`,
      quantity: affretIARecords.length,
      unitPrice: null,
      amount: totalCommission,
      type: 'commission'
    });
    totalUsageFees += totalCommission;
  }

  // Tracking Premium à l'usage
  const trackingRecords = usageRecords.filter(r => r.type === 'tracking_premium');
  if (trackingRecords.length > 0) {
    const trackingPrice = PRICING_GRID.trackingIA.PREMIUM.pricePerTransport;
    const totalTracking = trackingRecords.length * trackingPrice;
    fees.push({
      description: `Tracking IA Premium (${trackingRecords.length} transports)`,
      quantity: trackingRecords.length,
      unitPrice: trackingPrice,
      amount: totalTracking,
      type: 'usage'
    });
    totalUsageFees += totalTracking;
  }

  // Transports supplémentaires
  const transportRecords = usageRecords.filter(r => r.type === 'transport');
  const subscription = await Subscription.findOne({ id: subscriptionId });
  if (subscription) {
    const sub = PRICING_GRID.subscriptions[subscription.subscriptionType];
    if (sub && sub.includedTransports) {
      const extraTransports = Math.max(0, transportRecords.length - sub.includedTransports);
      if (extraTransports > 0) {
        const extraPrice = extraTransports * sub.extraTransportPrice;
        fees.push({
          description: `Transports supplémentaires (${extraTransports} x ${sub.extraTransportPrice}€)`,
          quantity: extraTransports,
          unitPrice: sub.extraTransportPrice,
          amount: extraPrice,
          type: 'usage'
        });
        totalUsageFees += extraPrice;
      }
    }
  }

  return { totalUsageFees, fees };
}

// =============================================================================
// AUTHENTICATION MIDDLEWARE
// =============================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requis' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'symphonia-secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Accès administrateur requis' });
  }
  next();
};

// =============================================================================
// ROUTES - GRILLE TARIFAIRE
// =============================================================================

/**
 * GET /pricing/grid
 * Retourne la grille tarifaire complète
 */
app.get('/pricing/grid', (req, res) => {
  const grid = {
    ...PRICING_GRID,
    isLaunchPeriod: isLaunchPeriod(),
    launchEndDate: PRICING_GRID.subscriptions.INDUSTRIEL.launchEndDate
  };
  res.json(grid);
});

/**
 * GET /pricing/subscriptions
 * Liste des abonnements disponibles
 */
app.get('/pricing/subscriptions', (req, res) => {
  const { companyType } = req.query;

  let subscriptions = Object.values(PRICING_GRID.subscriptions);

  // Filtrer par type d'entreprise si spécifié
  if (companyType) {
    const typeMapping = {
      'industry': ['INDUSTRIEL'],
      'transporter': ['TRANSPORTEUR_INVITE', 'TRANSPORTEUR_PREMIUM', 'TRANSPORTEUR_DO'],
      'logistician': ['LOGISTICIEN_PREMIUM'],
      'forwarder': ['TRANSITAIRE_PREMIUM']
    };

    const allowedIds = typeMapping[companyType] || [];
    subscriptions = subscriptions.filter(s => allowedIds.includes(s.id));
  }

  // Ajouter les prix actuels (lancement vs normal)
  subscriptions = subscriptions.map(sub => ({
    ...sub,
    currentPrice: isLaunchPeriod() && sub.priceLaunch ? sub.priceLaunch : sub.priceMonthly,
    isLaunchPrice: isLaunchPeriod() && sub.priceLaunch !== sub.priceMonthly
  }));

  res.json(subscriptions);
});

/**
 * GET /pricing/modules
 * Liste des modules additionnels
 */
app.get('/pricing/modules', (req, res) => {
  res.json(Object.values(PRICING_GRID.modules));
});

/**
 * GET /pricing/tracking
 * Options Tracking IA
 */
app.get('/pricing/tracking', (req, res) => {
  res.json(Object.values(PRICING_GRID.trackingIA));
});

/**
 * GET /pricing/packs
 * Packs tout-en-un
 */
app.get('/pricing/packs', (req, res) => {
  const packs = Object.values(PRICING_GRID.packs).map(pack => ({
    ...pack,
    includedDetails: pack.includes.map(item => {
      if (item.type === 'subscription') {
        return PRICING_GRID.subscriptions[item.id];
      } else if (item.type === 'trackingIA') {
        return PRICING_GRID.trackingIA[item.id];
      } else if (item.type === 'module') {
        return PRICING_GRID.modules[item.id];
      }
      return null;
    }).filter(Boolean)
  }));

  res.json(packs);
});

/**
 * GET /pricing/discounts
 * Remises engagement
 */
app.get('/pricing/discounts', (req, res) => {
  res.json(Object.values(PRICING_GRID.discounts));
});

/**
 * POST /pricing/calculate
 * Calcule le prix d'une configuration
 */
app.post('/pricing/calculate', (req, res) => {
  const { subscriptionType, modules, trackingLevel, packId, engagementType } = req.body;

  if (!subscriptionType && !packId) {
    return res.status(400).json({ error: 'subscriptionType ou packId requis' });
  }

  const pricing = calculateSubscriptionPrice(
    subscriptionType,
    modules || [],
    trackingLevel || 'NONE',
    packId,
    engagementType || 'monthly'
  );

  res.json(pricing);
});

// =============================================================================
// ROUTES - GESTION DES ABONNEMENTS
// =============================================================================

/**
 * POST /subscriptions
 * Créer un nouvel abonnement
 */
app.post('/subscriptions', authenticateToken, async (req, res) => {
  try {
    const {
      companyId,
      companyName,
      companyType,
      subscriptionType,
      modules,
      trackingLevel,
      packId,
      engagementType,
      billingCycle
    } = req.body;

    // Calculer le prix
    const pricing = calculateSubscriptionPrice(
      subscriptionType,
      modules || [],
      trackingLevel || 'NONE',
      packId,
      engagementType || 'monthly'
    );

    // Dates d'engagement
    const startDate = new Date();
    let endDate = null;

    if (engagementType && engagementType !== 'monthly') {
      const years = parseInt(engagementType.replace('_years', ''));
      endDate = addYears(startDate, years);
    }

    // Créer l'abonnement
    const subscription = new Subscription({
      companyId,
      companyName,
      companyType,
      subscriptionType,
      subscriptionName: packId
        ? PRICING_GRID.packs[packId]?.name
        : PRICING_GRID.subscriptions[subscriptionType]?.name,
      activeModules: (modules || []).map(moduleId => ({
        moduleId,
        moduleName: PRICING_GRID.modules[moduleId]?.name,
        activatedAt: new Date(),
        priceMonthly: PRICING_GRID.modules[moduleId]?.priceMonthly || 0
      })),
      trackingIALevel: trackingLevel || 'NONE',
      packId,
      packName: packId ? PRICING_GRID.packs[packId]?.name : null,
      pricing: {
        basePrice: pricing.basePrice,
        modulesPrice: pricing.modulesPrice,
        trackingPrice: pricing.trackingPrice,
        packPrice: pricing.packPrice,
        subtotal: pricing.subtotal,
        discountPercent: pricing.discountPercent,
        discountAmount: pricing.discountAmount,
        totalMonthly: pricing.totalMonthly,
        totalAnnual: pricing.totalAnnual
      },
      engagement: {
        type: engagementType || 'monthly',
        startDate,
        endDate,
        discountPercent: getEngagementDiscount(engagementType || 'monthly')
      },
      status: 'trial',
      trialEndsAt: addMonths(startDate, 1),
      billingCycle: billingCycle || 'monthly',
      nextBillingDate: addMonths(startDate, 1),
      createdBy: req.user.id
    });

    await subscription.save();

    res.status(201).json({
      subscription,
      pricing: {
        ...pricing,
        message: isLaunchPeriod()
          ? 'Prix de lancement appliqué !'
          : 'Prix standard appliqué'
      }
    });
  } catch (error) {
    console.error('Erreur création abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'abonnement' });
  }
});

/**
 * GET /subscriptions
 * Liste des abonnements (admin)
 */
app.get('/subscriptions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, companyType, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (companyType) filter.companyType = companyType;

    const subscriptions = await Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Subscription.countDocuments(filter);

    res.json({
      subscriptions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste abonnements:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des abonnements' });
  }
});

/**
 * GET /subscriptions/company/:companyId
 * Abonnement d'une entreprise
 */
app.get('/subscriptions/company/:companyId', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({
      companyId: req.params.companyId,
      status: { $in: ['active', 'trial'] }
    });

    if (!subscription) {
      return res.status(404).json({ error: 'Aucun abonnement actif trouvé' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Erreur récupération abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'abonnement' });
  }
});

/**
 * GET /subscriptions/:id
 * Détail d'un abonnement
 */
app.get('/subscriptions/:id', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ id: req.params.id });

    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Erreur détail abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'abonnement' });
  }
});

/**
 * PUT /subscriptions/:id
 * Modifier un abonnement
 */
app.put('/subscriptions/:id', authenticateToken, async (req, res) => {
  try {
    const { modules, trackingLevel, packId } = req.body;

    const subscription = await Subscription.findOne({ id: req.params.id });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    // Recalculer le prix
    const pricing = calculateSubscriptionPrice(
      subscription.subscriptionType,
      modules || subscription.activeModules.map(m => m.moduleId),
      trackingLevel || subscription.trackingIALevel,
      packId || subscription.packId,
      subscription.engagement.type
    );

    // Mise à jour
    subscription.activeModules = (modules || []).map(moduleId => ({
      moduleId,
      moduleName: PRICING_GRID.modules[moduleId]?.name,
      activatedAt: new Date(),
      priceMonthly: PRICING_GRID.modules[moduleId]?.priceMonthly || 0
    }));
    subscription.trackingIALevel = trackingLevel || subscription.trackingIALevel;
    subscription.pricing = {
      basePrice: pricing.basePrice,
      modulesPrice: pricing.modulesPrice,
      trackingPrice: pricing.trackingPrice,
      packPrice: pricing.packPrice,
      subtotal: pricing.subtotal,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      totalMonthly: pricing.totalMonthly,
      totalAnnual: pricing.totalAnnual
    };
    subscription.updatedAt = new Date();

    await subscription.save();

    res.json({ subscription, pricing });
  } catch (error) {
    console.error('Erreur modification abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de la modification de l\'abonnement' });
  }
});

/**
 * POST /subscriptions/:id/activate
 * Activer un abonnement (fin de période d'essai)
 */
app.post('/subscriptions/:id/activate', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ id: req.params.id });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    subscription.status = 'active';
    subscription.trialEndsAt = null;
    subscription.updatedAt = new Date();

    await subscription.save();

    res.json({ message: 'Abonnement activé', subscription });
  } catch (error) {
    console.error('Erreur activation abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de l\'activation' });
  }
});

/**
 * POST /subscriptions/:id/cancel
 * Annuler un abonnement
 */
app.post('/subscriptions/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const { reason, cancelAtPeriodEnd = true } = req.body;

    const subscription = await Subscription.findOne({ id: req.params.id });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    if (cancelAtPeriodEnd) {
      // Annulation à la fin de la période
      subscription.status = 'active'; // Reste actif jusqu'à la fin
      subscription.cancelAtPeriodEnd = true;
      subscription.cancelReason = reason;
    } else {
      // Annulation immédiate
      subscription.status = 'canceled';
      subscription.canceledAt = new Date();
      subscription.cancelReason = reason;
    }

    subscription.updatedAt = new Date();
    await subscription.save();

    // Si Stripe
    if (subscription.stripeSubscriptionId) {
      await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      });
    }

    res.json({ message: 'Abonnement annulé', subscription });
  } catch (error) {
    console.error('Erreur annulation abonnement:', error);
    res.status(500).json({ error: 'Erreur lors de l\'annulation' });
  }
});

// =============================================================================
// ROUTES - MODULES
// =============================================================================

/**
 * POST /subscriptions/:id/modules
 * Ajouter un module à l'abonnement
 */
app.post('/subscriptions/:id/modules', authenticateToken, async (req, res) => {
  try {
    const { moduleId } = req.body;

    const subscription = await Subscription.findOne({ id: req.params.id });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    const mod = PRICING_GRID.modules[moduleId];
    if (!mod) {
      return res.status(400).json({ error: 'Module non trouvé' });
    }

    // Vérifier si déjà actif
    if (subscription.activeModules.some(m => m.moduleId === moduleId)) {
      return res.status(400).json({ error: 'Module déjà actif' });
    }

    subscription.activeModules.push({
      moduleId,
      moduleName: mod.name,
      activatedAt: new Date(),
      priceMonthly: mod.priceMonthly
    });

    // Recalculer le prix
    const pricing = calculateSubscriptionPrice(
      subscription.subscriptionType,
      subscription.activeModules.map(m => m.moduleId),
      subscription.trackingIALevel,
      subscription.packId,
      subscription.engagement.type
    );

    subscription.pricing = {
      basePrice: pricing.basePrice,
      modulesPrice: pricing.modulesPrice,
      trackingPrice: pricing.trackingPrice,
      packPrice: pricing.packPrice,
      subtotal: pricing.subtotal,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      totalMonthly: pricing.totalMonthly,
      totalAnnual: pricing.totalAnnual
    };
    subscription.updatedAt = new Date();

    await subscription.save();

    res.json({ message: 'Module ajouté', subscription, pricing });
  } catch (error) {
    console.error('Erreur ajout module:', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du module' });
  }
});

/**
 * DELETE /subscriptions/:id/modules/:moduleId
 * Retirer un module
 */
app.delete('/subscriptions/:id/modules/:moduleId', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findOne({ id: req.params.id });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    subscription.activeModules = subscription.activeModules.filter(
      m => m.moduleId !== req.params.moduleId
    );

    // Recalculer le prix
    const pricing = calculateSubscriptionPrice(
      subscription.subscriptionType,
      subscription.activeModules.map(m => m.moduleId),
      subscription.trackingIALevel,
      subscription.packId,
      subscription.engagement.type
    );

    subscription.pricing = {
      basePrice: pricing.basePrice,
      modulesPrice: pricing.modulesPrice,
      trackingPrice: pricing.trackingPrice,
      packPrice: pricing.packPrice,
      subtotal: pricing.subtotal,
      discountPercent: pricing.discountPercent,
      discountAmount: pricing.discountAmount,
      totalMonthly: pricing.totalMonthly,
      totalAnnual: pricing.totalAnnual
    };
    subscription.updatedAt = new Date();

    await subscription.save();

    res.json({ message: 'Module retiré', subscription, pricing });
  } catch (error) {
    console.error('Erreur retrait module:', error);
    res.status(500).json({ error: 'Erreur lors du retrait du module' });
  }
});

// =============================================================================
// ROUTES - USAGE / FACTURATION À L'USAGE
// =============================================================================

/**
 * POST /usage/record
 * Enregistrer une utilisation (transport, commission, tracking)
 */
app.post('/usage/record', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId, companyId, type, referenceId, quantity, unitPrice, metadata } = req.body;

    let totalAmount = 0;
    let calculatedUnitPrice = unitPrice;

    // Calcul automatique pour certains types
    if (type === 'affret_ia_commission' && metadata?.transactionAmount) {
      calculatedUnitPrice = PRICING_GRID.modules.AFFRET_IA.commissionRate;
      totalAmount = metadata.transactionAmount * calculatedUnitPrice;
    } else if (type === 'tracking_premium') {
      calculatedUnitPrice = PRICING_GRID.trackingIA.PREMIUM.pricePerTransport;
      totalAmount = (quantity || 1) * calculatedUnitPrice;
    } else {
      totalAmount = (quantity || 1) * (unitPrice || 0);
    }

    const record = new UsageRecord({
      subscriptionId,
      companyId,
      type,
      referenceId,
      quantity: quantity || 1,
      unitPrice: calculatedUnitPrice,
      totalAmount,
      metadata,
      billingPeriod: format(new Date(), 'yyyy-MM')
    });

    await record.save();

    // Mettre à jour le compteur sur l'abonnement
    const subscription = await Subscription.findOne({ id: subscriptionId });
    if (subscription) {
      if (type === 'transport') {
        subscription.usage.transportsThisMonth += (quantity || 1);
      } else if (type === 'affret_ia_commission') {
        subscription.usage.affretIATransactions += (quantity || 1);
      } else if (type === 'tracking_premium') {
        subscription.usage.trackingPremiumUsage += (quantity || 1);
      }
      await subscription.save();
    }

    res.status(201).json({ record });
  } catch (error) {
    console.error('Erreur enregistrement usage:', error);
    res.status(500).json({ error: 'Erreur lors de l\'enregistrement' });
  }
});

/**
 * GET /usage/:subscriptionId
 * Historique d'usage
 */
app.get('/usage/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const { period } = req.query;

    const filter = { subscriptionId: req.params.subscriptionId };
    if (period) {
      filter.billingPeriod = period;
    }

    const records = await UsageRecord.find(filter)
      .sort({ recordedAt: -1 })
      .limit(100);

    const summary = await UsageRecord.aggregate([
      { $match: filter },
      { $group: {
        _id: '$type',
        count: { $sum: '$quantity' },
        total: { $sum: '$totalAmount' }
      }}
    ]);

    res.json({ records, summary });
  } catch (error) {
    console.error('Erreur récupération usage:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération' });
  }
});

// =============================================================================
// ROUTES - FACTURATION
// =============================================================================

/**
 * POST /invoices/generate
 * Générer une facture pour une période
 */
app.post('/invoices/generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { subscriptionId, periodStart, periodEnd } = req.body;

    const subscription = await Subscription.findOne({ id: subscriptionId });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    const lineItems = [];

    // Abonnement de base
    if (subscription.packId) {
      lineItems.push({
        description: subscription.packName,
        quantity: 1,
        unitPrice: subscription.pricing.packPrice,
        amount: subscription.pricing.packPrice,
        type: 'subscription'
      });
    } else {
      // Abonnement
      lineItems.push({
        description: subscription.subscriptionName,
        quantity: 1,
        unitPrice: subscription.pricing.basePrice,
        amount: subscription.pricing.basePrice,
        type: 'subscription'
      });

      // Modules
      subscription.activeModules.forEach(mod => {
        if (mod.priceMonthly > 0) {
          lineItems.push({
            description: mod.moduleName,
            quantity: 1,
            unitPrice: mod.priceMonthly,
            amount: mod.priceMonthly,
            type: 'module'
          });
        }
      });

      // Tracking
      if (subscription.trackingIALevel !== 'NONE' && subscription.pricing.trackingPrice > 0) {
        const tracking = PRICING_GRID.trackingIA[subscription.trackingIALevel];
        lineItems.push({
          description: tracking?.name || 'Tracking IA',
          quantity: 1,
          unitPrice: subscription.pricing.trackingPrice,
          amount: subscription.pricing.trackingPrice,
          type: 'module'
        });
      }
    }

    // Usage
    const { totalUsageFees, fees } = await calculateUsageFees(
      subscriptionId,
      new Date(periodStart),
      new Date(periodEnd)
    );
    lineItems.push(...fees);

    // Remise engagement
    if (subscription.pricing.discountPercent > 0) {
      const discountBase = lineItems.reduce((sum, item) => sum + item.amount, 0);
      lineItems.push({
        description: `Remise engagement ${subscription.engagement.type} (-${subscription.pricing.discountPercent}%)`,
        quantity: 1,
        unitPrice: 0,
        amount: -(discountBase * subscription.pricing.discountPercent / 100),
        type: 'discount'
      });
    }

    // Calculs
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = 0.20;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    const invoice = new Invoice({
      subscriptionId,
      companyId: subscription.companyId,
      invoiceNumber: generateInvoiceNumber(),
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      lineItems,
      subtotal,
      taxRate,
      taxAmount,
      total,
      status: 'pending'
    });

    await invoice.save();

    res.status(201).json({ invoice });
  } catch (error) {
    console.error('Erreur génération facture:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de la facture' });
  }
});

/**
 * GET /invoices
 * Liste des factures
 */
app.get('/invoices', authenticateToken, async (req, res) => {
  try {
    const { companyId, status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (companyId) filter.companyId = companyId;
    if (status) filter.status = status;

    // Si pas admin, limiter aux factures de l'entreprise
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      filter.companyId = req.user.companyId;
    }

    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Invoice.countDocuments(filter);

    res.json({
      invoices,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erreur liste factures:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des factures' });
  }
});

/**
 * GET /invoices/:id
 * Détail d'une facture
 */
app.get('/invoices/:id', authenticateToken, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ id: req.params.id });

    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    res.json(invoice);
  } catch (error) {
    console.error('Erreur détail facture:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de la facture' });
  }
});

/**
 * POST /invoices/:id/pay
 * Marquer une facture comme payée
 */
app.post('/invoices/:id/pay', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { paymentMethod, stripePaymentIntentId } = req.body;

    const invoice = await Invoice.findOne({ id: req.params.id });
    if (!invoice) {
      return res.status(404).json({ error: 'Facture non trouvée' });
    }

    invoice.status = 'paid';
    invoice.paidAt = new Date();
    if (stripePaymentIntentId) {
      invoice.stripePaymentIntentId = stripePaymentIntentId;
    }

    await invoice.save();

    res.json({ message: 'Facture payée', invoice });
  } catch (error) {
    console.error('Erreur paiement facture:', error);
    res.status(500).json({ error: 'Erreur lors du paiement' });
  }
});

// =============================================================================
// ROUTES - STRIPE INTEGRATION
// =============================================================================

/**
 * POST /stripe/create-customer
 * Créer un client Stripe
 */
app.post('/stripe/create-customer', authenticateToken, async (req, res) => {
  try {
    const { companyId, companyName, email } = req.body;

    const customer = await stripe.customers.create({
      name: companyName,
      email,
      metadata: { companyId }
    });

    res.json({ customerId: customer.id });
  } catch (error) {
    console.error('Erreur création client Stripe:', error);
    res.status(500).json({ error: 'Erreur lors de la création du client Stripe' });
  }
});

/**
 * POST /stripe/create-setup-intent
 * Créer un SetupIntent pour enregistrer un moyen de paiement
 */
app.post('/stripe/create-setup-intent', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.body;

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card', 'sepa_debit']
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('Erreur création SetupIntent:', error);
    res.status(500).json({ error: 'Erreur lors de la création du SetupIntent' });
  }
});

/**
 * POST /stripe/create-subscription
 * Créer un abonnement Stripe
 */
app.post('/stripe/create-subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId, customerId, paymentMethodId } = req.body;

    const subscription = await Subscription.findOne({ id: subscriptionId });
    if (!subscription) {
      return res.status(404).json({ error: 'Abonnement non trouvé' });
    }

    // Attacher le moyen de paiement
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Créer l'abonnement Stripe
    // Note: En production, il faudrait créer des produits/prix Stripe pour chaque offre
    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        { price_data: {
          currency: 'eur',
          unit_amount: Math.round(subscription.pricing.totalMonthly * 100),
          recurring: { interval: subscription.billingCycle === 'annual' ? 'year' : 'month' },
          product_data: { name: subscription.subscriptionName }
        }}
      ],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });

    // Mettre à jour l'abonnement local
    subscription.stripeCustomerId = customerId;
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripePaymentMethodId = paymentMethodId;
    await subscription.save();

    res.json({
      subscriptionId: stripeSubscription.id,
      clientSecret: stripeSubscription.latest_invoice.payment_intent.client_secret
    });
  } catch (error) {
    console.error('Erreur création abonnement Stripe:', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'abonnement Stripe' });
  }
});

/**
 * POST /stripe/webhook
 * Webhook Stripe pour les événements
 */
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Erreur signature webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Traitement des événements
  switch (event.type) {
    case 'invoice.paid':
      const paidInvoice = event.data.object;
      // Mettre à jour le statut de la facture locale
      await Invoice.updateOne(
        { stripeInvoiceId: paidInvoice.id },
        { status: 'paid', paidAt: new Date() }
      );
      break;

    case 'invoice.payment_failed':
      const failedInvoice = event.data.object;
      await Invoice.updateOne(
        { stripeInvoiceId: failedInvoice.id },
        { status: 'failed' }
      );
      // Notifier l'équipe / le client
      break;

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object;
      await Subscription.updateOne(
        { stripeSubscriptionId: deletedSub.id },
        { status: 'canceled', canceledAt: new Date() }
      );
      break;

    default:
      console.log(`Événement non traité: ${event.type}`);
  }

  res.json({ received: true });
});

// =============================================================================
// ROUTES - STATISTIQUES / ADMIN
// =============================================================================

/**
 * GET /stats/revenue
 * Statistiques de revenus (admin)
 */
app.get('/stats/revenue', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = { status: 'paid' };
    if (startDate) matchStage.paidAt = { $gte: new Date(startDate) };
    if (endDate) matchStage.paidAt = { ...matchStage.paidAt, $lte: new Date(endDate) };

    // Revenue par mois
    const monthlyRevenue = await Invoice.aggregate([
      { $match: matchStage },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paidAt' } },
        revenue: { $sum: '$total' },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Revenue par type d'abonnement
    const revenueByType = await Invoice.aggregate([
      { $match: matchStage },
      { $lookup: {
        from: 'subscriptions',
        localField: 'subscriptionId',
        foreignField: 'id',
        as: 'subscription'
      }},
      { $unwind: '$subscription' },
      { $group: {
        _id: '$subscription.subscriptionType',
        revenue: { $sum: '$total' },
        count: { $sum: 1 }
      }}
    ]);

    // MRR (Monthly Recurring Revenue)
    const activeSubscriptions = await Subscription.find({ status: 'active' });
    const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.pricing.totalMonthly, 0);

    // Nombre d'abonnés par type
    const subscribersByType = await Subscription.aggregate([
      { $match: { status: { $in: ['active', 'trial'] } } },
      { $group: {
        _id: '$subscriptionType',
        count: { $sum: 1 }
      }}
    ]);

    res.json({
      mrr,
      arr: mrr * 12,
      monthlyRevenue,
      revenueByType,
      subscribersByType,
      totalActiveSubscriptions: activeSubscriptions.length
    });
  } catch (error) {
    console.error('Erreur stats revenus:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

/**
 * GET /stats/subscriptions
 * Statistiques des abonnements (admin)
 */
app.get('/stats/subscriptions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await Subscription.aggregate([
      { $facet: {
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        byType: [
          { $group: { _id: '$subscriptionType', count: { $sum: 1 } } }
        ],
        byCompanyType: [
          { $group: { _id: '$companyType', count: { $sum: 1 } } }
        ],
        byEngagement: [
          { $group: { _id: '$engagement.type', count: { $sum: 1 } } }
        ],
        moduleUsage: [
          { $unwind: '$activeModules' },
          { $group: { _id: '$activeModules.moduleId', count: { $sum: 1 } } }
        ],
        trackingUsage: [
          { $group: { _id: '$trackingIALevel', count: { $sum: 1 } } }
        ]
      }}
    ]);

    res.json(stats[0]);
  } catch (error) {
    console.error('Erreur stats abonnements:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'subscriptions-pricing-api',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// MONGODB CONNECTION & SERVER START
// =============================================================================

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/symphonia-subscriptions';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Subscriptions & Pricing API running on port ${PORT}`);
      console.log(`Launch period active: ${isLaunchPeriod()}`);
    });
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    // Start without DB for testing
    app.listen(PORT, () => {
      console.log(`SYMPHONI.A Subscriptions & Pricing API running on port ${PORT} (no DB)`);
    });
  });

module.exports = app;
