/**
 * SYMPHONI.A - Subscription Features Configuration
 * Definit les features disponibles par plan d'abonnement
 * Version 3.0.0 - Nouvelle politique tarifaire Dec 2025
 */

// ==================== PLANS TRANSPORTEUR ====================

const TRANSPORTEUR_PLANS = {
  // Plan Gratuit - 0 EUR/mois
  GRATUIT: {
    id: 'transporteur_gratuit',
    name: 'Transporteur Gratuit',
    price: 0,
    stripePriceId: null,
    maxUsers: 1,
    maxVehicles: 0,
    features: {
      // Core - Inclus
      dashboard: true,
      profilEntreprise: true,
      consultationMarketplace: true,
      reponseAppelsOffres: 10, // 10 gratuites

      // Modules bloques
      gpsTracking: false,
      ecmr: false,
      gestionFlotte: false,
      facturationAuto: false,
      palettesEurope: false,
      statistiquesAvancees: false,
      supportPrioritaire: false,
      apiAccess: false,
      marqueBlanche: false,

      // Acces aux fonctions industrielles
      accessIndustriel: true
    },
    limits: {
      reponseAppelsOffres: 10,
      multiUtilisateurs: 1,
      vehiculesTracking: 0
    }
  },

  // Plan Starter - 200 EUR/mois
  STARTER: {
    id: 'transporteur_starter',
    name: 'Transporteur Starter',
    price: 200,
    stripePriceId: 'price_1SjkAORvJiyzt2LnU3jD82sS',
    maxUsers: 1,
    maxVehicles: 0,
    features: {
      // Core - Inclus
      dashboard: true,
      profilEntreprise: true,
      consultationMarketplace: true,
      reponseAppelsOffres: true, // Illimite

      // Modules bloques
      gpsTracking: false,
      ecmr: false,
      gestionFlotte: false,
      facturationAuto: false,
      palettesEurope: false,
      statistiquesAvancees: false,
      supportPrioritaire: false,
      apiAccess: false,
      marqueBlanche: false,

      // Acces aux fonctions industrielles
      accessIndustriel: true
    },
    limits: {
      reponseAppelsOffres: -1, // Illimite
      multiUtilisateurs: 1,
      vehiculesTracking: 0
    }
  },

  // Plan Premium - 399 EUR/mois
  PREMIUM: {
    id: 'transporteur_premium',
    name: 'Transporteur Premium',
    price: 399,
    stripePriceId: 'price_1SjkAPRvJiyzt2LnBu3UG295',
    maxUsers: 3,
    maxVehicles: 10,
    features: {
      // Core - Inclus
      dashboard: true,
      profilEntreprise: true,
      consultationMarketplace: true,
      reponseAppelsOffres: true, // Illimite

      // Modules inclus Premium
      gpsTracking: true, // 10 vehicules
      ecmr: true,
      gestionFlotte: true,
      facturationAuto: true,
      palettesEurope: true,
      statistiquesAvancees: true,
      supportPrioritaire: true,

      // Modules bloques
      apiAccess: false,
      marqueBlanche: false,

      // Acces aux fonctions industrielles
      accessIndustriel: true
    },
    limits: {
      reponseAppelsOffres: -1, // Illimite
      multiUtilisateurs: 3,
      vehiculesTracking: 10
    }
  },

  // Plan Business - 499 EUR/mois
  BUSINESS: {
    id: 'transporteur_business',
    name: 'Transporteur Business',
    price: 499,
    stripePriceId: 'price_1SjkAPRvJiyzt2LnaE1kBYEO',
    maxUsers: -1, // Illimite
    maxVehicles: -1, // Illimite
    features: {
      // Core - Inclus
      dashboard: true,
      profilEntreprise: true,
      consultationMarketplace: true,
      reponseAppelsOffres: true, // Illimite

      // Modules inclus Business
      gpsTracking: true, // Illimite
      ecmr: true,
      gestionFlotte: true,
      facturationAuto: true,
      palettesEurope: true,
      statistiquesAvancees: true,
      supportPrioritaire: true,
      apiAccess: true,

      // Modules bloques
      marqueBlanche: false,

      // Acces aux fonctions industrielles
      accessIndustriel: true
    },
    limits: {
      reponseAppelsOffres: -1, // Illimite
      multiUtilisateurs: -1, // Illimite
      vehiculesTracking: -1 // Illimite
    }
  },

  // Plan Elite - 699 EUR/mois
  ELITE: {
    id: 'transporteur_elite',
    name: 'Transporteur Elite',
    price: 699,
    stripePriceId: 'price_1SjkAQRvJiyzt2LnqWQVuJEW',
    maxUsers: -1, // Illimite
    maxVehicles: -1, // Illimite
    features: {
      // TOUT INCLUS
      dashboard: true,
      profilEntreprise: true,
      consultationMarketplace: true,
      reponseAppelsOffres: true, // Illimite
      gpsTracking: true, // Illimite
      ecmr: true,
      gestionFlotte: true,
      facturationAuto: true,
      palettesEurope: true,
      statistiquesAvancees: true,
      supportPrioritaire: true,
      apiAccess: true,
      marqueBlanche: false, // Non disponible meme en Elite

      // Acces aux fonctions industrielles
      accessIndustriel: true
    },
    limits: {
      reponseAppelsOffres: -1, // Illimite
      multiUtilisateurs: -1, // Illimite
      vehiculesTracking: -1 // Illimite
    }
  }
};

// ==================== PLANS INDUSTRIEL ====================

const INDUSTRIEL_PLANS = {
  // Plan Starter - 0 EUR/mois (essai/demo)
  STARTER: {
    id: 'industriel_starter',
    name: 'Industriel Starter',
    price: 0,
    stripePriceId: null,
    maxUsers: 2,
    maxSites: 1,
    features: {
      // Tout bloque en Starter
      dashboard: false,
      commandesIndustrielles: false,
      indicateursKpi: false,
      alertesCritiques: false,
      demandesTransport: false,
      facturation: false,
      palettesEurope: false,
      bourseStockage: false,
      formationTraining: false,
      affretIA: false,
      referencementTransporteurs: false,
      grillesTarifaires: false,
      ecmr: false,
      trackingTempsReel: false,
      chatbotIA: false,
      planningChargement: false,
      vigilanceDocuments: false,
      apiAccess: false,
      gpsTrackingTomtom: false,
      emailTrackingMailgun: false,
      ocrDocuments: false,
      smsNotifications: false,
      stockageDocuments: false
    },
    limits: {
      multiSites: 1,
      multiUtilisateurs: 2,
      transporteursReferences: 0
    }
  },

  // Plan Pro - 499 EUR/mois
  PRO: {
    id: 'industriel_pro',
    name: 'Industriel Pro',
    price: 499,
    stripePriceId: 'price_1SjkAQRvJiyzt2LnIK2ZNO6l',
    maxUsers: 10,
    maxSites: 5,
    features: {
      // Modules inclus Pro
      dashboard: true,
      commandesIndustrielles: true, // Illimite
      indicateursKpi: true, // Complet
      alertesCritiques: true,
      demandesTransport: true, // Illimite
      facturation: true,
      palettesEurope: true,
      bourseStockage: true,
      formationTraining: true,
      referencementTransporteurs: true, // 50 transporteurs
      grillesTarifaires: true,
      ecmr: true,
      trackingTempsReel: 'email', // Par Mail
      planningChargement: true,
      vigilanceDocuments: true,

      // Modules bloques ou en option
      affretIA: false,
      chatbotIA: false,
      apiAccess: false,
      gpsTrackingTomtom: false, // Option payante

      // Options payantes disponibles
      emailTrackingMailgun: 'option',
      ocrDocuments: 'option',
      smsNotifications: 'option',
      stockageDocuments: 'option'
    },
    limits: {
      multiSites: 5,
      multiUtilisateurs: 10,
      transporteursReferences: 50
    }
  },

  // Plan Enterprise - 699 EUR/mois
  ENTERPRISE: {
    id: 'industriel_enterprise',
    name: 'Industriel Enterprise',
    price: 699,
    stripePriceId: 'price_1SjkARRvJiyzt2LnTxSBc8WR',
    maxUsers: -1, // Illimite
    maxSites: -1, // Illimite
    features: {
      // Modules inclus Enterprise
      dashboard: true,
      commandesIndustrielles: true, // Illimite
      indicateursKpi: true, // Complet
      alertesCritiques: true,
      demandesTransport: true, // Illimite
      facturation: true,
      palettesEurope: true,
      bourseStockage: true,
      formationTraining: true,
      affretIA: true, // Inclus
      referencementTransporteurs: true, // Illimite
      grillesTarifaires: true,
      ecmr: true,
      trackingTempsReel: 'email', // Par Mail
      chatbotIA: true, // Avance
      planningChargement: true,
      vigilanceDocuments: true,
      apiAccess: true, // Inclus

      // Options payantes disponibles
      gpsTrackingTomtom: 'option', // Si option souscrite
      emailTrackingMailgun: 'option',
      ocrDocuments: 'option',
      smsNotifications: 'option',
      stockageDocuments: 'option'
    },
    limits: {
      multiSites: -1, // Illimite
      multiUtilisateurs: -1, // Illimite
      transporteursReferences: -1 // Illimite
    }
  }
};

// ==================== PLANS LOGISTICIEN ====================

const LOGISTICIEN_PLANS = {
  // Plan Gratuit - 0 EUR/mois (couvert par abonnement industriel)
  FREE: {
    id: 'logisticien_free',
    name: 'Logisticien Gratuit',
    price: 0,
    stripePriceId: null,
    billingNote: 'Couvert par abonnement Industriel',
    maxWarehouses: 3,
    maxIndustrialClients: 5,
    features: {
      // Fonctionnalites gratuites incluses
      dashboard: true,
      ordersVisibility: true,        // Voir commandes industriels lies
      planningQuais: true,           // Gestion planning quais
      rdvManagement: true,           // Gerer RDV
      ecmrAccess: true,              // Acces e-CMR
      documentUpload: true,          // Upload documents
      notifications: true,           // Alertes email/push
      icpeDeclarations: true,        // Declaration ICPE hebdomadaire
      vigilanceDocuments: true,      // Gestion documents vigilance
      driverCheckin: true,           // Check-in chauffeurs basique

      // Fonctionnalites NON incluses
      bourseDeStockage: false,       // Option payante 150 EUR/mois
      borneAccueilChauffeur: false,  // Option payante 100 EUR/mois
      apiAccess: false,
      advancedAnalytics: false,
      smsNotifications: false
    },
    limits: {
      maxWarehouses: 3,
      maxIndustrialClients: 5
    }
  }
};

// Options payantes Logisticien - Tarifs OFFICIELS Janvier 2026
const LOGISTICIEN_PAID_OPTIONS = {
  bourseDeStockage: {
    id: 'bourseDeStockage',
    name: 'Bourse de Stockage',
    description: 'Acces a la marketplace de stockage pour proposer vos capacites',
    monthlyPrice: 200, // PRIX OFFICIEL: 200 EUR/mois
    pricingType: 'fixed_monthly',
    stripePriceId: process.env.STRIPE_PRICE_LOGISTICIEN_BOURSE || null,
    stripeProductId: process.env.STRIPE_PRODUCT_LOGISTICIEN_BOURSE || null,
    features: {
      publishCapacity: true,          // Publier capacites
      respondToNeeds: true,           // Repondre aux besoins
      aiRecommendations: true,        // Recommandations IA
      marketplaceVisibility: true     // Visibilite marketplace
    }
  },
  borneAccueilChauffeur: {
    id: 'borneAccueilChauffeur',
    name: 'Tablette Accueil Chauffeur',
    description: 'Automatisation de l\'accueil chauffeur avec tablette/kiosque',
    monthlyPrice: 150, // PRIX OFFICIEL: 150 EUR/mois
    pricingType: 'fixed_monthly',
    stripePriceId: process.env.STRIPE_PRICE_LOGISTICIEN_BORNE || null,
    stripeProductId: process.env.STRIPE_PRODUCT_LOGISTICIEN_BORNE || null,
    features: {
      kioskMode: true,                // Mode kiosque
      qrCodeCheckin: true,            // Check-in QR code
      automaticDockAssignment: true,  // Attribution automatique quai
      driverQueue: true,              // File d'attente chauffeurs
      smsNotifications: true,         // SMS au chauffeur
      waitTimeDisplay: true           // Affichage temps attente
    }
  }
};

// ==================== ADD-ONS / OPTIONS PAYANTES ====================

const PAID_OPTIONS = {
  gpsTrackingTomtom: {
    id: 'gpsTrackingTomtom',
    name: 'GPS Tracking TomTom',
    description: 'Suivi temps reel des vehicules',
    unitPrice: 4,
    unit: 'vehicule',
    pricingType: 'per_unit_monthly',
    stripePriceId: 'price_1SjkOqRvJiyzt2LnNJCPX9sJ',
    stripeProductId: 'prod_Th8gCeQBesjrEC',
    availableFor: ['industriel_pro', 'industriel_enterprise']
  },
  emailTrackingMailgun: {
    id: 'emailTrackingMailgun',
    name: 'Email Tracking Mailgun',
    description: 'Notifications email illimitees',
    monthlyPrice: 50,
    pricingType: 'fixed_monthly',
    stripePriceId: 'price_1SjkOrRvJiyzt2LnUju7kM5C',
    stripeProductId: 'prod_Th8gYk745eacwU',
    availableFor: ['industriel_pro', 'industriel_enterprise']
  },
  ocrDocuments: {
    id: 'ocrDocuments',
    name: 'OCR Documents',
    description: 'AWS Textract + Google Vision',
    unitPrice: 0.10,
    unit: 'page',
    pricingType: 'per_usage',
    stripePriceId: 'price_1Sjl36RvJiyzt2LnL15H3uxL',
    stripeProductId: 'prod_Th8gQeBvXhy4fm',
    // IMPORTANT: Configurer le meter ID de production via variable d'environnement
    stripeMeterId: process.env.STRIPE_METER_OCR || null,
    availableFor: ['industriel_pro', 'industriel_enterprise']
  },
  smsNotifications: {
    id: 'smsNotifications',
    name: 'SMS Notifications',
    description: 'Alertes SMS clients/chauffeurs',
    unitPrice: 0.05,
    unit: 'SMS',
    pricingType: 'per_usage',
    stripePriceId: 'price_1Sjl37RvJiyzt2LnDjbRXHfg',
    stripeProductId: 'prod_Th8gT88qQ0B7og',
    // IMPORTANT: Configurer le meter ID de production via variable d'environnement
    stripeMeterId: process.env.STRIPE_METER_SMS || null,
    availableFor: ['industriel_pro', 'industriel_enterprise']
  },
  stockageDocuments: {
    id: 'stockageDocuments',
    name: 'Stockage Documents',
    description: 'Au-dela du quota inclus',
    unitPrice: 5,
    unit: '10GB',
    pricingType: 'per_unit_monthly',
    stripePriceId: 'price_1SjkOsRvJiyzt2LnKE9KQFYt',
    stripeProductId: 'prod_Th8gfyDXN2SRGZ',
    availableFor: ['industriel_pro', 'industriel_enterprise']
  }
};

// ==================== FEATURE DESCRIPTIONS ====================

const FEATURE_DESCRIPTIONS = {
  // Transporteur
  dashboard: {
    name: 'Dashboard de base',
    description: 'Tableau de bord avec vue d\'ensemble',
    icon: 'LayoutDashboard'
  },
  profilEntreprise: {
    name: 'Profil entreprise',
    description: 'Gestion du profil et informations entreprise',
    icon: 'Building2'
  },
  consultationMarketplace: {
    name: 'Consultation Marketplace AFFRET.IA',
    description: 'Consultation des offres sur la marketplace',
    icon: 'Search'
  },
  reponseAppelsOffres: {
    name: 'Reponse aux appels d\'offres',
    description: 'Repondre aux appels d\'offres AFFRET.IA',
    icon: 'Send'
  },
  gpsTracking: {
    name: 'GPS Tracking TomTom',
    description: 'Suivi temps reel des vehicules',
    icon: 'MapPin'
  },
  ecmr: {
    name: 'eCMR Electronique',
    description: 'Lettre de voiture electronique legale',
    icon: 'FileText'
  },
  gestionFlotte: {
    name: 'Gestion Flotte',
    description: 'Gestion complete de la flotte de vehicules',
    icon: 'Truck'
  },
  facturationAuto: {
    name: 'Facturation Automatique',
    description: 'Generation automatique des factures',
    icon: 'Receipt'
  },
  palettesEurope: {
    name: 'Palettes Europe',
    description: 'Gestion du pool de palettes Europe',
    icon: 'Package'
  },
  statistiquesAvancees: {
    name: 'Statistiques Avancees',
    description: 'Rapports et analyses detaillees',
    icon: 'BarChart3'
  },
  supportPrioritaire: {
    name: 'Support Prioritaire',
    description: 'Support client prioritaire',
    icon: 'HeadphonesIcon'
  },
  apiAccess: {
    name: 'Acces API',
    description: 'Integration via API REST',
    icon: 'Code'
  },
  marqueBlanche: {
    name: 'Marque Blanche',
    description: 'Personnalisation complete de la plateforme',
    icon: 'Palette'
  },
  accessIndustriel: {
    name: 'Acces Fonctions Industrielles',
    description: 'Acces aux memes fonctions que les industriels',
    icon: 'Factory'
  },

  // Industriel
  commandesIndustrielles: {
    name: 'Commandes Industrielles',
    description: 'Gestion des commandes de transport',
    icon: 'ClipboardList'
  },
  indicateursKpi: {
    name: 'Indicateurs KPI',
    description: 'Tableau de bord avec KPIs complets',
    icon: 'Activity'
  },
  alertesCritiques: {
    name: 'Alertes Critiques',
    description: 'Notifications temps reel des incidents',
    icon: 'AlertTriangle'
  },
  demandesTransport: {
    name: 'Demandes Transport',
    description: 'Creation de demandes de transport',
    icon: 'FileQuestion'
  },
  facturation: {
    name: 'Facturation',
    description: 'Module de facturation et prefacturation',
    icon: 'Euro'
  },
  bourseStockage: {
    name: 'Bourse de Stockage',
    description: 'Acces a la bourse de stockage',
    icon: 'Warehouse'
  },
  formationTraining: {
    name: 'Formation & Training',
    description: 'Modules de formation en ligne',
    icon: 'GraduationCap'
  },
  affretIA: {
    name: 'AFFRET.IA',
    description: 'Module d\'affretement intelligent automatise',
    icon: 'Brain'
  },
  referencementTransporteurs: {
    name: 'Referencement Transporteurs',
    description: 'Pool de transporteurs references',
    icon: 'Users'
  },
  grillesTarifaires: {
    name: 'Grilles Tarifaires',
    description: 'Gestion des grilles de prix',
    icon: 'Table'
  },
  trackingTempsReel: {
    name: 'Tracking Temps Reel',
    description: 'Suivi en temps reel des livraisons',
    icon: 'Radio'
  },
  chatbotIA: {
    name: 'Chatbot IA',
    description: 'Assistant intelligent avance',
    icon: 'Bot'
  },
  planningChargement: {
    name: 'Planning Chargement/Livraison',
    description: 'Gestion des RDV chargement et livraison',
    icon: 'Calendar'
  },
  vigilanceDocuments: {
    name: 'Vigilance Documents',
    description: 'Verification automatique des documents',
    icon: 'ShieldCheck'
  },

  // Add-Ons
  gpsTrackingTomtom: {
    name: 'GPS Tracking TomTom',
    description: 'Suivi GPS temps reel (4EUR/vehicule)',
    icon: 'Navigation'
  },
  emailTrackingMailgun: {
    name: 'Email Tracking Mailgun',
    description: 'Notifications email illimitees (50EUR/mois)',
    icon: 'Mail'
  },
  ocrDocuments: {
    name: 'OCR Documents',
    description: 'Extraction automatique (0.10EUR/page)',
    icon: 'Scan'
  },
  smsNotifications: {
    name: 'SMS Notifications',
    description: 'Alertes SMS (0.05EUR/SMS)',
    icon: 'MessageSquare'
  },
  stockageDocuments: {
    name: 'Stockage Documents',
    description: 'Stockage supplementaire (5EUR/10GB)',
    icon: 'HardDrive'
  },

  // Logisticien Features
  ordersVisibility: {
    name: 'Visibilite Commandes',
    description: 'Voir les commandes des industriels partenaires',
    icon: 'Eye'
  },
  planningQuais: {
    name: 'Planning Quais',
    description: 'Gestion des creneaux de chargement/dechargement',
    icon: 'Calendar'
  },
  rdvManagement: {
    name: 'Gestion RDV',
    description: 'Planification des rendez-vous chauffeurs',
    icon: 'Clock'
  },
  ecmrAccess: {
    name: 'Acces e-CMR',
    description: 'Reception et signature des e-CMR',
    icon: 'FileSignature'
  },
  icpeDeclarations: {
    name: 'Declarations ICPE',
    description: 'Declaration hebdomadaire des volumes ICPE',
    icon: 'FileCheck'
  },
  driverCheckin: {
    name: 'Accueil Chauffeurs',
    description: 'Enregistrement des chauffeurs a l\'arrivee',
    icon: 'UserCheck'
  },
  bourseDeStockage: {
    name: 'Bourse de Stockage',
    description: 'Acces au marketplace de stockage (200EUR/mois)',
    icon: 'Store'
  },
  borneAccueilChauffeur: {
    name: 'Tablette Accueil Chauffeur',
    description: 'Automatisation accueil avec tablette/kiosque (150EUR/mois)',
    icon: 'Monitor'
  },
  advancedAnalytics: {
    name: 'Statistiques Avancees',
    description: 'Rapports et analyses detailles',
    icon: 'PieChart'
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Obtenir le plan d'un utilisateur par son type
 */
function getPlanConfig(userType, planLevel) {
  if (userType === 'transporteur') {
    return TRANSPORTEUR_PLANS[planLevel] || TRANSPORTEUR_PLANS.GRATUIT;
  } else if (userType === 'industriel') {
    return INDUSTRIEL_PLANS[planLevel] || INDUSTRIEL_PLANS.STARTER;
  } else if (userType === 'logisticien') {
    return LOGISTICIEN_PLANS[planLevel] || LOGISTICIEN_PLANS.FREE;
  }
  return null;
}

/**
 * Obtenir les options payantes logisticien
 */
function getLogisticienPaidOptions() {
  return LOGISTICIEN_PAID_OPTIONS;
}

/**
 * Verifier si une feature est disponible pour un plan
 */
function isFeatureAvailable(userType, planLevel, featureName, activeOptions = []) {
  const plan = getPlanConfig(userType, planLevel);
  if (!plan) return false;

  const featureValue = plan.features[featureName];

  // Feature incluse dans le plan (true ou valeur numerique > 0)
  if (featureValue === true || (typeof featureValue === 'number' && featureValue > 0)) {
    return true;
  }

  // Feature est une option ('option') et est active
  if (featureValue === 'option' && activeOptions.includes(featureName)) {
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

  const features = {};

  for (const [key, value] of Object.entries(plan.features)) {
    if (value === true || (typeof value === 'number' && value > 0)) {
      features[key] = true;
    } else if (value === 'option' && activeOptions.includes(key)) {
      features[key] = true;
    } else if (activeOptions.includes(key)) {
      features[key] = true;
    } else {
      features[key] = false;
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
  const planId = plan.id;

  for (const [optionId, option] of Object.entries(PAID_OPTIONS)) {
    // L'option est disponible pour ce plan
    if (option.availableFor.includes(planId)) {
      // Et la feature est en mode 'option' dans le plan
      if (plan.features[optionId] === 'option' || plan.features[optionId] === false) {
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
  const plan = getPlanConfig(userType, planLevel);

  let message = `La fonctionnalite "${featureInfo.name}" n'est pas disponible dans votre abonnement actuel.`;

  // Verifier si c'est une option disponible
  if (option && plan?.features[featureName] === 'option') {
    if (option.pricingType === 'fixed_monthly') {
      message += ` Vous pouvez l'ajouter pour ${option.monthlyPrice} EUR/mois.`;
    } else if (option.pricingType === 'per_unit_monthly') {
      message += ` Vous pouvez l'ajouter pour ${option.unitPrice} EUR/${option.unit}/mois.`;
    } else if (option.pricingType === 'per_usage') {
      message += ` Vous pouvez l'ajouter pour ${option.unitPrice} EUR/${option.unit}.`;
    }
  } else {
    // Feature disponible uniquement dans un plan superieur
    if (userType === 'transporteur') {
      if (planLevel === 'GRATUIT') {
        message += ' Passez au plan Starter, Premium, Business ou Elite pour y acceder.';
      } else if (planLevel === 'STARTER') {
        message += ' Passez au plan Premium, Business ou Elite pour y acceder.';
      } else if (planLevel === 'PREMIUM') {
        message += ' Passez au plan Business ou Elite pour y acceder.';
      } else if (planLevel === 'BUSINESS') {
        message += ' Passez au plan Elite pour y acceder.';
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

/**
 * Obtenir le resume des plans pour affichage
 */
function getPlansOverview() {
  return {
    transporteur: {
      GRATUIT: { price: 0, name: 'Gratuit', users: 1, highlight: '10 reponses gratuites' },
      STARTER: { price: 200, name: 'Starter', users: 1, highlight: 'Reponses illimitees' },
      PREMIUM: { price: 399, name: 'Premium', users: 3, highlight: 'GPS + eCMR + Flotte' },
      BUSINESS: { price: 499, name: 'Business', users: -1, highlight: 'API + Utilisateurs illimites' },
      ELITE: { price: 699, name: 'Elite', users: -1, highlight: 'Tout inclus' }
    },
    industriel: {
      STARTER: { price: 0, name: 'Starter', users: 2, sites: 1, highlight: 'Demo/Essai' },
      PRO: { price: 499, name: 'Pro', users: 10, sites: 5, highlight: 'KPI + Planning + 50 transporteurs' },
      ENTERPRISE: { price: 699, name: 'Enterprise', users: -1, sites: -1, highlight: 'AFFRET.IA + API + Illimite' }
    },
    logisticien: {
      FREE: { price: 0, name: 'Gratuit', warehouses: 3, highlight: 'Couvert par abonnement industriel' }
    },
    logisticienOptions: [
      { id: 'bourseDeStockage', name: 'Bourse de Stockage', price: '200 EUR/mois', highlight: 'Marketplace stockage' },
      { id: 'borneAccueilChauffeur', name: 'Tablette Accueil Chauffeur', price: '150 EUR/mois', highlight: 'Automatisation accueil' }
    ],
    addOns: [
      { id: 'gpsTrackingTomtom', name: 'GPS TomTom', price: '4 EUR/vehicule' },
      { id: 'emailTrackingMailgun', name: 'Email Mailgun', price: '50 EUR/mois' },
      { id: 'ocrDocuments', name: 'OCR Documents', price: '0.10 EUR/page' },
      { id: 'smsNotifications', name: 'SMS', price: '0.05 EUR/SMS' },
      { id: 'stockageDocuments', name: 'Stockage', price: '5 EUR/10GB' }
    ]
  };
}

module.exports = {
  // Plans
  TRANSPORTEUR_PLANS,
  INDUSTRIEL_PLANS,
  LOGISTICIEN_PLANS,

  // Options payantes
  PAID_OPTIONS,
  LOGISTICIEN_PAID_OPTIONS,

  // Descriptions
  FEATURE_DESCRIPTIONS,

  // Fonctions
  getPlanConfig,
  isFeatureAvailable,
  getUserFeatures,
  checkUsageLimit,
  getAvailableOptions,
  getBlockedFeatureMessage,
  getPlansOverview,
  getLogisticienPaidOptions
};
