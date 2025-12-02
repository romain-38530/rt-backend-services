/**
 * AFFRET.IA - Module d'Affrètement Intelligent Automatisé
 * Modèles de données et types d'événements
 * Version: 1.0.0
 */

// ============================================================================
// ÉVÉNEMENTS ET DÉCLENCHEURS
// ============================================================================

const TriggerTypes = {
  // Échec de la chaîne d'affectation normale
  ASSIGNMENT_CHAIN_FAILURE: 'assignment_chain_failure',

  // Incapacité technique déclarée
  TECHNICAL_INCAPACITY: 'technical_incapacity',

  // Activation manuelle par dispatcher
  MANUAL_ACTIVATION: 'manual_activation',

  // Timeout sans réponse des transporteurs internes
  INTERNAL_TIMEOUT: 'internal_timeout',

  // Surcharge de capacité
  CAPACITY_OVERLOAD: 'capacity_overload'
};

const TriggerReasons = {
  NO_AVAILABLE_CARRIER: 'no_available_carrier',
  ALL_CARRIERS_DECLINED: 'all_carriers_declined',
  VEHICLE_BREAKDOWN: 'vehicle_breakdown',
  DRIVER_UNAVAILABLE: 'driver_unavailable',
  EQUIPMENT_MISMATCH: 'equipment_mismatch',
  ZONE_NOT_COVERED: 'zone_not_covered',
  URGENT_REQUEST: 'urgent_request',
  COST_OPTIMIZATION: 'cost_optimization',
  OTHER: 'other'
};

// ============================================================================
// STATUTS AFFRET.IA
// ============================================================================

const AffretiaStatus = {
  // Phase initiale
  TRIGGERED: 'triggered',
  ANALYZING: 'analyzing',

  // Phase diffusion
  SHORTLIST_READY: 'shortlist_ready',
  BROADCASTING: 'broadcasting',
  AWAITING_RESPONSES: 'awaiting_responses',

  // Phase sélection
  RESPONSES_COLLECTED: 'responses_collected',
  SELECTING: 'selecting',
  CARRIER_SELECTED: 'carrier_selected',

  // Phase attribution
  ASSIGNING: 'assigning',
  ASSIGNED: 'assigned',

  // Phase exécution
  IN_PROGRESS: 'in_progress',
  TRACKING_ACTIVE: 'tracking_active',

  // Phase documents
  DOCUMENTS_PENDING: 'documents_pending',
  DOCUMENTS_PROCESSING: 'documents_processing',

  // Phase clôture
  VIGILANCE_CHECK: 'vigilance_check',
  SCORING: 'scoring',
  COMPLETED: 'completed',

  // Échecs
  NO_RESPONSES: 'no_responses',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// ============================================================================
// TYPES DE RÉPONSES TRANSPORTEUR
// ============================================================================

const ResponseTypes = {
  ACCEPT: 'accept',           // Accepte au prix proposé
  COUNTER_OFFER: 'counter_offer', // Contre-proposition
  REJECT: 'reject',           // Refuse
  TIMEOUT: 'timeout'          // Pas de réponse dans le délai
};

const RejectionReasons = {
  PRICE_TOO_LOW: 'price_too_low',
  NO_AVAILABILITY: 'no_availability',
  ZONE_NOT_COVERED: 'zone_not_covered',
  EQUIPMENT_NOT_AVAILABLE: 'equipment_not_available',
  SCHEDULE_CONFLICT: 'schedule_conflict',
  OTHER: 'other'
};

// ============================================================================
// CANAUX DE DIFFUSION
// ============================================================================

const BroadcastChannels = {
  EMAIL: 'email',
  MARKETPLACE: 'marketplace',
  PUSH_NOTIFICATION: 'push',
  SMS: 'sms',
  WEBHOOK: 'webhook'
};

// ============================================================================
// CRITÈRES DE SCORING
// ============================================================================

const ScoringCriteria = {
  PRICE: {
    key: 'price',
    weight: 30,
    description: 'Prix proposé vs budget initial'
  },
  AVAILABILITY: {
    key: 'availability',
    weight: 25,
    description: 'Disponibilité immédiate et confirmation rapide'
  },
  HISTORICAL_SCORE: {
    key: 'historical_score',
    weight: 20,
    description: 'Score historique basé sur missions passées'
  },
  RESPONSE_TIME: {
    key: 'response_time',
    weight: 10,
    description: 'Rapidité de réponse à la sollicitation'
  },
  EQUIPMENT_MATCH: {
    key: 'equipment_match',
    weight: 10,
    description: 'Adéquation du matériel aux besoins'
  },
  COMPLIANCE: {
    key: 'compliance',
    weight: 5,
    description: 'Conformité documentaire et vigilance'
  }
};

// ============================================================================
// NIVEAUX DE TRACKING
// ============================================================================

const TrackingLevels = {
  BASIC: {
    key: 'basic',
    price: 0,
    features: ['manual_status_updates', 'email_notifications']
  },
  INTERMEDIATE: {
    key: 'intermediate',
    price: 50,
    features: ['gps_tracking', 'eta_updates', 'geofencing', 'sms_notifications']
  },
  PREMIUM: {
    key: 'premium',
    price: 150,
    features: ['realtime_tracking', 'temperature_monitoring', 'route_optimization', 'predictive_eta', 'full_integration']
  }
};

// ============================================================================
// TYPES DE DOCUMENTS
// ============================================================================

const DocumentTypes = {
  CMR: 'cmr',
  BOL: 'bol',                    // Bill of Lading
  DELIVERY_NOTE: 'delivery_note',
  POD: 'pod',                    // Proof of Delivery
  INVOICE: 'invoice',
  WEIGHT_TICKET: 'weight_ticket',
  CUSTOMS: 'customs',
  INSURANCE: 'insurance',
  PHOTO: 'photo',
  SIGNATURE: 'signature',
  OTHER: 'other'
};

const DocumentStatus = {
  PENDING: 'pending',
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',      // OCR en cours
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

// ============================================================================
// SCHÉMAS DE DONNÉES
// ============================================================================

/**
 * Schéma d'une session AFFRET.IA
 */
const AffretiaSessionSchema = {
  _id: 'ObjectId',
  sessionId: 'String (UUID)',
  transportOrderId: 'ObjectId',
  organizationId: 'ObjectId',

  // Déclenchement
  trigger: {
    type: 'TriggerTypes',
    reason: 'TriggerReasons',
    triggeredBy: 'ObjectId (userId)',
    triggeredAt: 'Date',
    context: 'Object'
  },

  // Paramètres de la mission
  mission: {
    reference: 'String',
    origin: {
      address: 'String',
      city: 'String',
      postalCode: 'String',
      country: 'String',
      coordinates: { lat: 'Number', lng: 'Number' }
    },
    destination: {
      address: 'String',
      city: 'String',
      postalCode: 'String',
      country: 'String',
      coordinates: { lat: 'Number', lng: 'Number' }
    },
    pickupDate: 'Date',
    deliveryDate: 'Date',
    goods: {
      description: 'String',
      weight: 'Number',
      volume: 'Number',
      quantity: 'Number',
      packaging: 'String',
      hazardous: 'Boolean',
      temperature: { min: 'Number', max: 'Number' }
    },
    requirements: {
      vehicleType: 'String',
      equipment: ['String'],
      certifications: ['String']
    },
    budget: {
      initial: 'Number',
      maxNegotiation: 'Number (pourcentage)',
      currency: 'String'
    }
  },

  // Analyse IA
  analysis: {
    startedAt: 'Date',
    completedAt: 'Date',
    shortlistCount: 'Number',
    criteria: 'Object',
    recommendations: ['String']
  },

  // Shortlist des transporteurs
  shortlist: [{
    carrierId: 'ObjectId',
    carrierName: 'String',
    score: 'Number',
    ranking: 'Number',
    reasons: ['String'],
    contacted: 'Boolean',
    contactedAt: 'Date',
    channels: ['BroadcastChannels']
  }],

  // Diffusion
  broadcast: {
    startedAt: 'Date',
    channels: ['BroadcastChannels'],
    messageTemplate: 'String',
    expiresAt: 'Date',
    reminderSent: 'Boolean',
    reminderAt: 'Date'
  },

  // Réponses reçues
  responses: [{
    carrierId: 'ObjectId',
    carrierName: 'String',
    responseType: 'ResponseTypes',
    receivedAt: 'Date',
    price: 'Number',
    originalPrice: 'Number',
    counterOfferPrice: 'Number',
    availability: {
      confirmed: 'Boolean',
      pickupTime: 'Date',
      deliveryTime: 'Date'
    },
    vehicleInfo: {
      type: 'String',
      plateNumber: 'String',
      driverName: 'String',
      driverPhone: 'String'
    },
    rejectionReason: 'RejectionReasons',
    comments: 'String',
    score: 'Number',
    scoreBreakdown: 'Object'
  }],

  // Sélection et attribution
  selection: {
    selectedCarrierId: 'ObjectId',
    selectedAt: 'Date',
    selectionCriteria: 'Object',
    finalPrice: 'Number',
    negotiationHistory: [{
      round: 'Number',
      proposedPrice: 'Number',
      counterPrice: 'Number',
      timestamp: 'Date'
    }]
  },

  // Tracking
  tracking: {
    level: 'TrackingLevels',
    token: 'String',
    activatedAt: 'Date',
    lastUpdate: 'Date',
    positions: [{
      lat: 'Number',
      lng: 'Number',
      timestamp: 'Date',
      speed: 'Number',
      heading: 'Number'
    }],
    eta: {
      estimated: 'Date',
      confidence: 'Number'
    },
    geofenceEvents: [{
      type: 'String',
      location: 'String',
      timestamp: 'Date'
    }]
  },

  // Documents
  documents: [{
    documentId: 'ObjectId',
    type: 'DocumentTypes',
    status: 'DocumentStatus',
    uploadedAt: 'Date',
    uploadedBy: 'ObjectId',
    fileUrl: 'String',
    ocrData: 'Object',
    verified: 'Boolean',
    verifiedAt: 'Date',
    verifiedBy: 'ObjectId'
  }],

  // Vérification vigilance
  vigilance: {
    checkedAt: 'Date',
    status: 'String',
    checks: [{
      type: 'String',
      passed: 'Boolean',
      details: 'String'
    }],
    alerts: ['String']
  },

  // Scoring final
  finalScoring: {
    calculatedAt: 'Date',
    overallScore: 'Number',
    breakdown: {
      onTimeDelivery: 'Number',
      documentCompliance: 'Number',
      communication: 'Number',
      priceRespect: 'Number',
      incidentFree: 'Number'
    },
    feedback: 'String',
    recommendation: 'String'
  },

  // Statut global
  status: 'AffretiaStatus',
  statusHistory: [{
    status: 'AffretiaStatus',
    changedAt: 'Date',
    changedBy: 'ObjectId',
    reason: 'String'
  }],

  // Métadonnées
  createdAt: 'Date',
  updatedAt: 'Date',
  completedAt: 'Date',
  metadata: {
    version: 'String',
    source: 'String',
    tags: ['String']
  }
};

/**
 * Configuration par défaut AFFRET.IA
 */
const DefaultConfig = {
  // Timeouts (en minutes)
  timeouts: {
    analysisTimeout: 5,
    broadcastDuration: 120,    // 2 heures
    responseTimeout: 60,       // 1 heure
    reminderBefore: 30,        // Rappel 30 min avant expiration
    selectionTimeout: 15,
    assignmentTimeout: 10
  },

  // Limites
  limits: {
    minShortlist: 20,
    maxShortlist: 200,
    maxNegotiationRounds: 3,
    maxPriceIncrease: 15,      // +15% max
    minResponsesToSelect: 1
  },

  // Scoring
  scoring: {
    weights: ScoringCriteria,
    minimumScore: 60,
    preferredScore: 80
  },

  // Notifications
  notifications: {
    channels: ['email', 'push'],
    templates: {
      broadcastRequest: 'affretia_broadcast',
      reminder: 'affretia_reminder',
      selectionConfirm: 'affretia_selection',
      assignmentConfirm: 'affretia_assignment'
    }
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TriggerTypes,
  TriggerReasons,
  AffretiaStatus,
  ResponseTypes,
  RejectionReasons,
  BroadcastChannels,
  ScoringCriteria,
  TrackingLevels,
  DocumentTypes,
  DocumentStatus,
  AffretiaSessionSchema,
  DefaultConfig
};
