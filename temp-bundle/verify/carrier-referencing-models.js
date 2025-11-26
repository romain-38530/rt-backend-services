// Carrier Referencing Models - Système de référencement transporteurs SYMPHONI.A
// RT Backend Services - Version 1.0.0

// Statuts de transporteur
const CarrierStatus = {
  INVITED: 'INVITED',                 // Invité, en attente d'onboarding
  ONBOARDING: 'ONBOARDING',           // En cours d'onboarding
  ACTIVE: 'ACTIVE',                   // Actif et opérationnel
  BLOCKED: 'BLOCKED',                 // Bloqué (vigilance expirée)
  SUSPENDED: 'SUSPENDED',             // Suspendu (sanction)
  PREMIUM: 'PREMIUM',                 // Premium SYMPHONI.A
  INACTIVE: 'INACTIVE'                // Inactif
};

// Niveaux de référencement
const ReferenceLevel = {
  REFERENCED: 'REFERENCED',           // Transporteur référencé (Niveau 1)
  HIGH_PRIORITY: 'HIGH_PRIORITY',     // Transporteur prioritaire (Niveau 1+)
  GUEST: 'GUEST'                      // Transporteur invité (Niveau 2)
};

// Modes d'ajout
const OnboardingMode = {
  DIRECT_INVITATION: 'DIRECT_INVITATION',           // Invitation industrielle
  AUTO_IMPORT_AFFRETIA: 'AUTO_IMPORT_AFFRETIA',    // Import depuis Affret.IA
  PREMIUM_NETWORK: 'PREMIUM_NETWORK'                // Réseau Premium
};

// Types de transport
const TransportTypes = {
  FTL: 'FTL',                         // Full Truck Load
  LTL: 'LTL',                         // Less Than Truck Load
  ADR: 'ADR',                         // Matières dangereuses
  FRIGO: 'FRIGO',                     // Frigo/Température contrôlée
  HAYON: 'HAYON',                     // Avec hayon
  MESSAGERIE: 'MESSAGERIE',           // Messagerie
  EXPRESS: 'EXPRESS'                  // Express
};

// Documents de vigilance obligatoires
const VigilanceDocuments = {
  KBIS: 'KBIS',
  URSSAF: 'URSSAF',
  INSURANCE: 'INSURANCE',
  ID_CARD: 'ID_CARD',
  TRANSPORT_LICENSE: 'TRANSPORT_LICENSE',
  RIB: 'RIB',
  SUBCONTRACTING_AGREEMENT: 'SUBCONTRACTING_AGREEMENT'
};

// Configuration des documents de vigilance
const vigilanceDocumentsConfig = {
  KBIS: {
    name: 'Extrait Kbis',
    required: true,
    hasExpiration: true,
    maxAgeMonths: 3,
    reminderDaysBefore: [30, 15, 7]
  },
  URSSAF: {
    name: 'Attestation URSSAF',
    required: true,
    hasExpiration: true,
    maxAgeMonths: 3,
    reminderDaysBefore: [30, 15, 7]
  },
  INSURANCE: {
    name: 'Assurance Transport RC',
    required: true,
    hasExpiration: true,
    maxAgeMonths: 12,
    reminderDaysBefore: [30, 15, 7]
  },
  ID_CARD: {
    name: 'Pièce d\'identité dirigeant',
    required: true,
    hasExpiration: true,
    maxAgeMonths: 120,
    reminderDaysBefore: [30]
  },
  TRANSPORT_LICENSE: {
    name: 'Licence de transport',
    required: true,
    hasExpiration: true,
    maxAgeMonths: 120,
    reminderDaysBefore: [30, 15, 7]
  },
  RIB: {
    name: 'RIB',
    required: true,
    hasExpiration: false
  },
  SUBCONTRACTING_AGREEMENT: {
    name: 'Convention de sous-traitance',
    required: false,
    hasExpiration: false
  }
};

// Critères de scoring
const ScoringCriteria = {
  PUNCTUALITY_LOADING: {
    name: 'Ponctualité chargement',
    weight: 0.25,
    maxScore: 100
  },
  PUNCTUALITY_DELIVERY: {
    name: 'Ponctualité livraison',
    weight: 0.25,
    maxScore: 100
  },
  POD_SPEED: {
    name: 'Rapidité envoi POD',
    weight: 0.20,
    maxScore: 100
  },
  TRACKING_REACTIVITY: {
    name: 'Réactivité Tracking IA',
    weight: 0.10,
    maxScore: 100
  },
  DOCUMENT_QUALITY: {
    name: 'Qualité documents',
    weight: 0.10,
    maxScore: 100
  },
  COOPERATION: {
    name: 'Suivi / coopération',
    weight: 0.10,
    maxScore: 100
  }
};

// Schema d'un transporteur
const carrierSchema = {
  // Identification
  carrierId: { type: 'string', required: true },
  companyName: { type: 'string', required: true },
  siret: { type: 'string', required: true },
  siren: { type: 'string', required: true },
  country: { type: 'string', required: true },

  // Contact
  contact: {
    email: { type: 'string', required: true },
    phone: { type: 'string', required: true },
    address: {
      street: 'string',
      postalCode: 'string',
      city: 'string',
      country: 'string'
    }
  },

  // Statut et niveau
  status: { type: 'string', required: true, enum: Object.values(CarrierStatus) },
  referenceLevel: { type: 'string', required: true, enum: Object.values(ReferenceLevel) },
  onboardingMode: { type: 'string', required: true, enum: Object.values(OnboardingMode) },

  // Relation avec industriels
  industrialClients: [{
    industrialId: 'string',
    addedAt: 'date',
    addedBy: 'string',
    referenceLevel: 'string',
    dispatchChainPosition: 'number',
    isPriority: 'boolean',
    guaranteedVolume: 'number'
  }],

  // Types de transport
  transportTypes: { type: 'array', default: [] },
  zones: { type: 'array', default: [] }, // Zones d'activité

  // Documents de vigilance
  vigilanceDocuments: {
    KBIS: {
      url: 'string',
      uploadedAt: 'date',
      expiresAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    URSSAF: {
      url: 'string',
      uploadedAt: 'date',
      expiresAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    INSURANCE: {
      url: 'string',
      uploadedAt: 'date',
      expiresAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    ID_CARD: {
      url: 'string',
      uploadedAt: 'date',
      expiresAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    TRANSPORT_LICENSE: {
      url: 'string',
      uploadedAt: 'date',
      expiresAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    RIB: {
      url: 'string',
      uploadedAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    },
    SUBCONTRACTING_AGREEMENT: {
      url: 'string',
      uploadedAt: 'date',
      verified: 'boolean',
      verifiedAt: 'date',
      verifiedBy: 'string'
    }
  },

  // Vigilance status
  vigilanceStatus: {
    isValid: { type: 'boolean', default: false },
    lastCheck: 'date',
    expiringDocuments: 'array', // Documents qui vont expirer
    expiredDocuments: 'array',  // Documents expirés
    missingDocuments: 'array'   // Documents manquants
  },

  // Grilles tarifaires
  pricingGrids: [{
    type: 'string', // FTL, LTL, etc.
    zone: 'string',
    basePrice: 'number',
    pricePerKm: 'number',
    minPrice: 'number',
    options: {
      adr: 'number',
      hayon: 'number',
      frigo: 'number',
      palletExchange: 'number'
    },
    validFrom: 'date',
    validTo: 'date',
    uploadedAt: 'date'
  }],

  // Scoring
  scoring: {
    overall: { type: 'number', default: 0, min: 0, max: 100 },
    punctualityLoading: { type: 'number', default: 0 },
    punctualityDelivery: { type: 'number', default: 0 },
    podSpeed: { type: 'number', default: 0 },
    trackingReactivity: { type: 'number', default: 0 },
    documentQuality: { type: 'number', default: 0 },
    cooperation: { type: 'number', default: 0 },
    totalMissions: { type: 'number', default: 0 },
    lastUpdated: 'date'
  },

  // Historique
  missionHistory: [{
    missionId: 'string',
    completedAt: 'date',
    rating: 'number',
    scores: 'object'
  }],

  // Statistiques
  statistics: {
    totalMissions: { type: 'number', default: 0 },
    completedMissions: { type: 'number', default: 0 },
    cancelledMissions: { type: 'number', default: 0 },
    averageResponseTime: { type: 'number', default: 0 }, // en minutes
    averageDeliveryTime: { type: 'number', default: 0 }
  },

  // Premium
  isPremium: { type: 'boolean', default: false },
  premiumSince: 'date',
  premiumFeatures: {
    advancedPlanning: 'boolean',
    affretIaAccess: 'boolean',
    autoReferencing: 'boolean',
    verifiedBadge: 'boolean'
  },

  // Métadonnées
  createdAt: { type: 'date', required: true },
  updatedAt: { type: 'date', required: true },
  invitedAt: 'date',
  onboardedAt: 'date',
  lastActivityAt: 'date'
};

/**
 * Calculer le scoring global d'un transporteur
 */
function calculateOverallScore(scores) {
  const {
    punctualityLoading = 0,
    punctualityDelivery = 0,
    podSpeed = 0,
    trackingReactivity = 0,
    documentQuality = 0,
    cooperation = 0
  } = scores;

  const overall =
    punctualityLoading * ScoringCriteria.PUNCTUALITY_LOADING.weight +
    punctualityDelivery * ScoringCriteria.PUNCTUALITY_DELIVERY.weight +
    podSpeed * ScoringCriteria.POD_SPEED.weight +
    trackingReactivity * ScoringCriteria.TRACKING_REACTIVITY.weight +
    documentQuality * ScoringCriteria.DOCUMENT_QUALITY.weight +
    cooperation * ScoringCriteria.COOPERATION.weight;

  return Math.round(overall);
}

/**
 * Vérifier l'état de vigilance d'un transporteur
 */
function checkVigilanceStatus(carrier) {
  const now = new Date();
  const expiringDocuments = [];
  const expiredDocuments = [];
  const missingDocuments = [];

  Object.keys(vigilanceDocumentsConfig).forEach(docType => {
    const config = vigilanceDocumentsConfig[docType];
    const document = carrier.vigilanceDocuments?.[docType];

    // Document manquant
    if (config.required && (!document || !document.url)) {
      missingDocuments.push({
        type: docType,
        name: config.name
      });
      return;
    }

    // Document expiré ou expirant
    if (document && config.hasExpiration && document.expiresAt) {
      const expiresAt = new Date(document.expiresAt);
      const daysUntilExpiration = Math.floor((expiresAt - now) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiration < 0) {
        expiredDocuments.push({
          type: docType,
          name: config.name,
          expiredSince: Math.abs(daysUntilExpiration)
        });
      } else if (daysUntilExpiration <= 30) {
        expiringDocuments.push({
          type: docType,
          name: config.name,
          daysRemaining: daysUntilExpiration
        });
      }
    }
  });

  const isValid = expiredDocuments.length === 0 && missingDocuments.length === 0;

  return {
    isValid,
    lastCheck: now,
    expiringDocuments,
    expiredDocuments,
    missingDocuments
  };
}

/**
 * Déterminer si un transporteur peut recevoir des commandes
 */
function canReceiveOrders(carrier) {
  const errors = [];

  // Vérifier le statut
  if (carrier.status === CarrierStatus.BLOCKED) {
    errors.push('Carrier is blocked');
  }

  if (carrier.status === CarrierStatus.SUSPENDED) {
    errors.push('Carrier is suspended');
  }

  if (carrier.status === CarrierStatus.INACTIVE) {
    errors.push('Carrier is inactive');
  }

  // Vérifier la vigilance
  const vigilanceStatus = checkVigilanceStatus(carrier);
  if (!vigilanceStatus.isValid) {
    if (vigilanceStatus.expiredDocuments.length > 0) {
      errors.push(`Expired documents: ${vigilanceStatus.expiredDocuments.map(d => d.name).join(', ')}`);
    }
    if (vigilanceStatus.missingDocuments.length > 0) {
      errors.push(`Missing documents: ${vigilanceStatus.missingDocuments.map(d => d.name).join(', ')}`);
    }
  }

  // Vérifier le scoring
  if (carrier.scoring.overall < 40) {
    errors.push('Score too low (minimum 40 required)');
  }

  return {
    canReceive: errors.length === 0,
    errors
  };
}

/**
 * Obtenir la priorité d'un transporteur dans la chaîne d'affectation
 */
function getDispatchPriority(carrier, industrialId) {
  const relationship = carrier.industrialClients?.find(
    client => client.industrialId === industrialId
  );

  if (!relationship) {
    return null;
  }

  // Calcul de priorité basé sur plusieurs facteurs
  let priority = relationship.dispatchChainPosition || 999;

  // Bonus pour transporteur prioritaire
  if (relationship.isPriority || carrier.referenceLevel === ReferenceLevel.HIGH_PRIORITY) {
    priority -= 100;
  }

  // Bonus pour scoring élevé
  if (carrier.scoring.overall >= 80) {
    priority -= 10;
  }

  // Bonus Premium
  if (carrier.isPremium) {
    priority -= 5;
  }

  return priority;
}

module.exports = {
  CarrierStatus,
  ReferenceLevel,
  OnboardingMode,
  TransportTypes,
  VigilanceDocuments,
  vigilanceDocumentsConfig,
  ScoringCriteria,
  carrierSchema,
  calculateOverallScore,
  checkVigilanceStatus,
  canReceiveOrders,
  getDispatchPriority
};
