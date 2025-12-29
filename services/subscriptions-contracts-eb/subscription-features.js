/**
 * SYMPHONI.A - Subscription Features Configuration
 * Definit les features disponibles par plan d'abonnement
 * Version 2.0.0 - Systeme d'activation et de blocage
 */

// ==================== PLANS TRANSPORTEUR ====================

const TRANSPORTEUR_PLANS = {
  // Plan Gratuit - Acces basique limite
  FREE: {
    id: 'transporteur_free',
    name: 'Transporteur Free',
    price: 0,
    stripePriceId: null,
    maxUsers: 1,
    maxVehicles: 3,
    maxOrders: 20, // par mois
    features: {
      // Core
      dashboard: true,
      orderManagement: true,
      basicTracking: true,

      // Modules bloques
      affretIA: false,
      ecmr: false,
      geofencing: false,
      telematics: false,
      advancedTracking: false,
      boursePrivee: false,
      vigilance: false,
      ocrDocuments: false,
      webhooks: false,
      archivageLegal: false,
      apiAccess: false,
      analytics: false,
      smsNotifications: false,
      signatureQualifiee: false,
      multiSite: false,
      planningRdv: false,
      exportReports: false
    },
    limits: {
      ordersPerMonth: 20,
      trackingUpdatesPerDay: 10,
      documentsStorage: '100MB',
      dataRetention: '30 days'
    }
  },

  // Plan Premium - 99 EUR/mois
  PREMIUM: {
    id: 'transporteur_premium',
    name: 'Transporteur Premium',
    price: 99,
    stripePriceId: 'price_1Sjaq3RvJiyzt2LnlyeWcUMb',
    maxUsers: 5,
    maxVehicles: 20,
    maxOrders: 200, // par mois
    features: {
      // Core
      dashboard: true,
      orderManagement: true,
      basicTracking: true,

      // Modules inclus Premium
      ecmr: true,
      geofencing: true,
      advancedTracking: true,
      vigilance: true,
      analytics: true,
      exportReports: true,
      planningRdv: true,

      // Modules bloques (options payantes)
      affretIA: false, // +200 EUR/mois
      telematics: false, // +19 EUR/camion
      boursePrivee: false, // +149 EUR/mois
      ocrDocuments: false, // +39 EUR/mois
      webhooks: false, // +59 EUR/mois
      archivageLegal: false, // +19 EUR/mois
      apiAccess: false,
      smsNotifications: false, // 0.07 EUR/SMS
      signatureQualifiee: false, // 2 EUR/signature
      multiSite: false
    },
    limits: {
      ordersPerMonth: 200,
      trackingUpdatesPerDay: 100,
      documentsStorage: '5GB',
      dataRetention: '1 year'
    }
  },

  // Plan Business - 299 EUR/mois
  BUSINESS: {
    id: 'transporteur_business',
    name: 'Transporteur Business',
    price: 299,
    stripePriceId: 'price_1Sjaq3RvJiyzt2LnGgCu0QPZ',
    maxUsers: 20,
    maxVehicles: 100,
    maxOrders: -1, // illimite
    features: {
      // TOUT INCLUS
      dashboard: true,
      orderManagement: true,
      basicTracking: true,
      ecmr: true,
      geofencing: true,
      advancedTracking: true,
      vigilance: true,
      analytics: true,
      exportReports: true,
      planningRdv: true,
      affretIA: true,
      telematics: true,
      boursePrivee: true,
      ocrDocuments: true,
      webhooks: true,
      archivageLegal: true,
      apiAccess: true,
      smsNotifications: true,
      signatureQualifiee: true,
      multiSite: true
    },
    limits: {
      ordersPerMonth: -1, // illimite
      trackingUpdatesPerDay: -1,
      documentsStorage: '50GB',
      dataRetention: '10 years'
    }
  }
};

// ==================== PLANS INDUSTRIEL ====================

const INDUSTRIEL_PLANS = {
  // Plan Starter - Gratuit ou essai
  STARTER: {
    id: 'industriel_starter',
    name: 'Industriel Starter',
    price: 0,
    stripePriceId: null,
    maxUsers: 2,
    maxOrders: 30,
    features: {
      // Core
      dashboard: true,
      orderManagement: true,
      basicTracking: true,
      quoteRequests: true,

      // Modules bloques
      affretIA: false,
      ecmr: false,
      geofencing: false,
      advancedTracking: false,
      boursePrivee: false,
      vigilance: false,
      ocrDocuments: false,
      webhooks: false,
      archivageLegal: false,
      apiAccess: false,
      analytics: false,
      tmsIntegration: false,
      erpIntegration: false,
      multiSite: false,
      planningRdv: false,
      exportReports: false,
      dedicatedSupport: false,
      customBranding: false
    },
    limits: {
      ordersPerMonth: 30,
      carriersInPool: 5,
      documentsStorage: '200MB',
      dataRetention: '30 days'
    }
  },

  // Plan Pro - 199 EUR/mois
  PRO: {
    id: 'industriel_pro',
    name: 'Industriel Pro',
    price: 199,
    stripePriceId: 'price_1Sjaq4RvJiyzt2LnUPkeahlA',
    maxUsers: 10,
    maxOrders: 500,
    features: {
      // Core
      dashboard: true,
      orderManagement: true,
      basicTracking: true,
      quoteRequests: true,

      // Modules inclus Pro
      ecmr: true,
      geofencing: true,
      advancedTracking: true,
      vigilance: true,
      analytics: true,
      exportReports: true,
      planningRdv: true,
      multiSite: true,

      // Modules bloques (options payantes)
      affretIA: false, // +200 EUR/mois
      boursePrivee: false, // +149 EUR/mois
      ocrDocuments: false, // +39 EUR/mois
      webhooks: false, // +59 EUR/mois
      archivageLegal: false, // +19 EUR/mois
      apiAccess: false, // +89 EUR/mois
      tmsIntegration: false, // +89 EUR/mois
      erpIntegration: false, // +89 EUR/mois
      dedicatedSupport: false,
      customBranding: false
    },
    limits: {
      ordersPerMonth: 500,
      carriersInPool: 30,
      documentsStorage: '10GB',
      dataRetention: '2 years'
    }
  },

  // Plan Enterprise - 499 EUR/mois
  ENTERPRISE: {
    id: 'industriel_enterprise',
    name: 'Industriel Enterprise',
    price: 499,
    stripePriceId: 'price_1Sjaq4RvJiyzt2LnKNllGUcJ',
    maxUsers: -1, // illimite
    maxOrders: -1,
    features: {
      // TOUT INCLUS
      dashboard: true,
      orderManagement: true,
      basicTracking: true,
      quoteRequests: true,
      ecmr: true,
      geofencing: true,
      advancedTracking: true,
      vigilance: true,
      analytics: true,
      exportReports: true,
      planningRdv: true,
      multiSite: true,
      affretIA: true,
      boursePrivee: true,
      ocrDocuments: true,
      webhooks: true,
      archivageLegal: true,
      apiAccess: true,
      tmsIntegration: true,
      erpIntegration: true,
      dedicatedSupport: true,
      customBranding: true
    },
    limits: {
      ordersPerMonth: -1,
      carriersInPool: -1,
      documentsStorage: '100GB',
      dataRetention: '10 years'
    }
  }
};

// ==================== OPTIONS PAYANTES ====================

const PAID_OPTIONS = {
  affretIA: {
    id: 'affretIA',
    name: 'AFFRET.IA Premium',
    description: 'Matching automatique avec IA pour trouver les meilleurs transporteurs',
    monthlyPrice: 200,
    stripePriceId: 'price_1Sa0Q9RzJcFnHbQGo9MPpKLL',
    type: 'monthly',
    availableFor: ['PREMIUM', 'PRO'] // Plans qui peuvent acheter cette option
  },
  boursePrivee: {
    id: 'boursePrivee',
    name: 'Bourse Privee Transporteurs',
    description: 'Acces a votre reseau prive de transporteurs',
    monthlyPrice: 149,
    stripePriceId: 'price_1Sa0QBRzJcFnHbQGj4oDShX6',
    type: 'monthly',
    availableFor: ['PREMIUM', 'PRO']
  },
  ocrDocuments: {
    id: 'ocrDocuments',
    name: 'OCR Documents',
    description: 'Extraction automatique des donnees des documents',
    monthlyPrice: 39,
    stripePriceId: 'price_1Sa0QBRzJcFnHbQG1wucZp7t',
    type: 'monthly',
    availableFor: ['PREMIUM', 'PRO']
  },
  webhooks: {
    id: 'webhooks',
    name: 'Webhooks Temps Reel',
    description: 'Notifications en temps reel vers vos systemes',
    monthlyPrice: 59,
    stripePriceId: 'price_1Sa0QCRzJcFnHbQGUbeuvkxL',
    type: 'monthly',
    availableFor: ['PREMIUM', 'PRO']
  },
  archivageLegal: {
    id: 'archivageLegal',
    name: 'Archivage Legal 10 ans',
    description: 'Conservation legale des documents pendant 10 ans',
    monthlyPrice: 19,
    stripePriceId: 'price_1Sa0QCRzJcFnHbQGBWVtBqwC',
    type: 'monthly',
    availableFor: ['FREE', 'PREMIUM', 'STARTER', 'PRO']
  },
  apiAccess: {
    id: 'apiAccess',
    name: 'Connexion API / Outil Tiers',
    description: 'Integration avec vos systemes via API REST',
    monthlyPrice: 89,
    stripePriceId: 'price_1Sa0Q9RzJcFnHbQGkRbuRWZw',
    type: 'monthly',
    availableFor: ['PREMIUM', 'PRO']
  },
  telematics: {
    id: 'telematics',
    name: 'Connexion Telematique',
    description: 'Integration avec les boitiers telematiques',
    unitPrice: 19,
    unit: 'camion',
    stripePriceId: 'price_1Sa0QDRzJcFnHbQGoYJAtJHT',
    type: 'per_unit',
    availableFor: ['PREMIUM', 'PRO']
  },
  smsNotifications: {
    id: 'smsNotifications',
    name: 'Notifications SMS',
    description: 'Envoi de SMS aux chauffeurs et clients',
    unitPrice: 0.07,
    unit: 'SMS',
    stripePriceId: 'price_1Sa0QERzJcFnHbQGcqYGnCCf',
    type: 'metered',
    availableFor: ['FREE', 'PREMIUM', 'STARTER', 'PRO']
  },
  signatureQualifiee: {
    id: 'signatureQualifiee',
    name: 'Signature Electronique Qualifiee',
    description: 'Signature electronique valeur legale (eIDAS)',
    unitPrice: 2,
    unit: 'signature',
    stripePriceId: 'price_1Sa0QFRzJcFnHbQGqqLYiMvV',
    type: 'metered',
    availableFor: ['FREE', 'PREMIUM', 'STARTER', 'PRO']
  }
};

// ==================== FEATURE DESCRIPTIONS ====================

const FEATURE_DESCRIPTIONS = {
  dashboard: {
    name: 'Tableau de bord',
    description: 'Vue d\'ensemble de votre activite',
    icon: 'LayoutDashboard'
  },
  orderManagement: {
    name: 'Gestion des commandes',
    description: 'Creation et suivi des commandes de transport',
    icon: 'ClipboardList'
  },
  basicTracking: {
    name: 'Tracking basique',
    description: 'Suivi des livraisons en temps reel',
    icon: 'MapPin'
  },
  advancedTracking: {
    name: 'Tracking Premium GPS',
    description: 'Suivi GPS temps reel avec historique',
    icon: 'Satellite'
  },
  affretIA: {
    name: 'AFFRET.IA',
    description: 'Intelligence artificielle pour le matching transporteurs',
    icon: 'Brain'
  },
  ecmr: {
    name: 'e-CMR',
    description: 'Lettre de voiture electronique legale',
    icon: 'FileText'
  },
  geofencing: {
    name: 'Geofencing',
    description: 'Alertes de zone et detection automatique',
    icon: 'Target'
  },
  telematics: {
    name: 'Telematique',
    description: 'Integration boitiers telematiques vehicules',
    icon: 'Radio'
  },
  boursePrivee: {
    name: 'Bourse Privee',
    description: 'Reseau prive de transporteurs partenaires',
    icon: 'Users'
  },
  vigilance: {
    name: 'Vigilance Conformite',
    description: 'Verification automatique des documents transporteurs',
    icon: 'ShieldCheck'
  },
  ocrDocuments: {
    name: 'OCR Documents',
    description: 'Lecture automatique des documents',
    icon: 'Scan'
  },
  webhooks: {
    name: 'Webhooks',
    description: 'Notifications temps reel vers vos systemes',
    icon: 'Webhook'
  },
  archivageLegal: {
    name: 'Archivage Legal',
    description: 'Conservation documents 10 ans',
    icon: 'Archive'
  },
  apiAccess: {
    name: 'Acces API',
    description: 'Integration via API REST',
    icon: 'Code'
  },
  analytics: {
    name: 'Analytics',
    description: 'Rapports et analyses avancees',
    icon: 'BarChart3'
  },
  planningRdv: {
    name: 'Planning RDV',
    description: 'Gestion des rendez-vous chargement/livraison',
    icon: 'Calendar'
  },
  exportReports: {
    name: 'Export Rapports',
    description: 'Export PDF et Excel des rapports',
    icon: 'Download'
  },
  multiSite: {
    name: 'Multi-Sites',
    description: 'Gestion de plusieurs sites/agences',
    icon: 'Building2'
  },
  tmsIntegration: {
    name: 'Integration TMS',
    description: 'Connexion avec votre TMS existant',
    icon: 'Link'
  },
  erpIntegration: {
    name: 'Integration ERP',
    description: 'Connexion avec votre ERP',
    icon: 'Database'
  },
  dedicatedSupport: {
    name: 'Support Dedie',
    description: 'Account manager dedie',
    icon: 'Headphones'
  },
  customBranding: {
    name: 'Personnalisation',
    description: 'Branding personnalise (logo, couleurs)',
    icon: 'Palette'
  },
  quoteRequests: {
    name: 'Demandes de devis',
    description: 'Envoi de demandes de cotation',
    icon: 'FileQuestion'
  },
  smsNotifications: {
    name: 'SMS',
    description: 'Notifications SMS',
    icon: 'MessageSquare'
  },
  signatureQualifiee: {
    name: 'Signature Qualifiee',
    description: 'Signature electronique eIDAS',
    icon: 'PenTool'
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Obtenir le plan d'un utilisateur par son type
 */
function getPlanConfig(userType, planLevel) {
  if (userType === 'transporteur') {
    return TRANSPORTEUR_PLANS[planLevel] || TRANSPORTEUR_PLANS.FREE;
  } else if (userType === 'industriel') {
    return INDUSTRIEL_PLANS[planLevel] || INDUSTRIEL_PLANS.STARTER;
  }
  return null;
}

/**
 * Verifier si une feature est disponible pour un plan
 */
function isFeatureAvailable(userType, planLevel, featureName, activeOptions = []) {
  const plan = getPlanConfig(userType, planLevel);
  if (!plan) return false;

  // Feature incluse dans le plan
  if (plan.features[featureName] === true) {
    return true;
  }

  // Feature disponible via option payante active
  if (activeOptions.includes(featureName)) {
    return true;
  }

  return false;
}

/**
 * Obtenir toutes les features d'un utilisateur
 */
function getUserFeatures(userType, planLevel, activeOptions = []) {
  const plan = getPlanConfig(userType, planLevel);
  if (!plan) return {};

  const features = { ...plan.features };

  // Ajouter les options actives
  for (const option of activeOptions) {
    if (features.hasOwnProperty(option)) {
      features[option] = true;
    }
  }

  return features;
}

/**
 * Verifier les limites d'utilisation
 */
function checkUsageLimit(userType, planLevel, limitType, currentValue) {
  const plan = getPlanConfig(userType, planLevel);
  if (!plan || !plan.limits) return { allowed: true };

  const limit = plan.limits[limitType];
  if (limit === undefined || limit === -1) {
    return { allowed: true, unlimited: true };
  }

  return {
    allowed: currentValue < limit,
    current: currentValue,
    limit,
    remaining: Math.max(0, limit - currentValue)
  };
}

/**
 * Obtenir les options disponibles pour upgrade
 */
function getAvailableOptions(userType, planLevel) {
  const plan = getPlanConfig(userType, planLevel);
  if (!plan) return [];

  const available = [];

  for (const [optionId, option] of Object.entries(PAID_OPTIONS)) {
    // L'option n'est pas deja incluse dans le plan
    if (plan.features[optionId] !== true) {
      // L'option est disponible pour ce niveau de plan
      if (option.availableFor.includes(planLevel)) {
        available.push({
          ...option,
          description: FEATURE_DESCRIPTIONS[optionId]?.description || option.description
        });
      }
    }
  }

  return available;
}

/**
 * Obtenir le message de blocage pour une feature
 */
function getBlockedFeatureMessage(featureName, userType, planLevel) {
  const featureInfo = FEATURE_DESCRIPTIONS[featureName] || { name: featureName };
  const option = PAID_OPTIONS[featureName];

  let message = `La fonctionnalite "${featureInfo.name}" n'est pas disponible dans votre abonnement actuel.`;

  if (option) {
    if (option.type === 'monthly') {
      message += ` Vous pouvez l'ajouter pour ${option.monthlyPrice} EUR/mois.`;
    } else if (option.type === 'per_unit') {
      message += ` Vous pouvez l'ajouter pour ${option.unitPrice} EUR/${option.unit}.`;
    }
  } else {
    // Feature disponible uniquement dans un plan superieur
    if (userType === 'transporteur') {
      if (planLevel === 'FREE') {
        message += ' Passez au plan Premium ou Business pour y acceder.';
      } else if (planLevel === 'PREMIUM') {
        message += ' Passez au plan Business pour y acceder.';
      }
    } else if (userType === 'industriel') {
      if (planLevel === 'STARTER') {
        message += ' Passez au plan Pro ou Enterprise pour y acceder.';
      } else if (planLevel === 'PRO') {
        message += ' Passez au plan Enterprise pour y acceder.';
      }
    }
  }

  return {
    blocked: true,
    feature: featureName,
    featureInfo,
    message,
    upgradeOption: option || null
  };
}

module.exports = {
  TRANSPORTEUR_PLANS,
  INDUSTRIEL_PLANS,
  PAID_OPTIONS,
  FEATURE_DESCRIPTIONS,
  getPlanConfig,
  isFeatureAvailable,
  getUserFeatures,
  checkUsageLimit,
  getAvailableOptions,
  getBlockedFeatureMessage
};
