/**
 * ============================================================================
 * Storage Market - Modèles de Données
 * ============================================================================
 * Définit les types, enumerations et structures pour la Bourse de Stockage
 * ============================================================================
 */

// Types de stockage
const StorageTypes = {
  TEMPORARY: 'TEMPORARY',           // Stockage temporaire
  LONG_TERM: 'LONG_TERM',          // Stockage long terme
  PICKING: 'PICKING',               // Préparation de commandes
  CROSS_DOCK: 'CROSS_DOCK',        // Cross-docking
  CUSTOMS: 'CUSTOMS'                // Stockage sous douane
};

// Unités de mesure pour les volumes
const VolumeUnits = {
  M2: 'M2',                         // Mètres carrés
  PALLETS: 'PALLETS',              // Palettes
  LINEAR_METERS: 'LINEAR_METERS',   // Mètres linéaires
  M3: 'M3'                          // Mètres cubes
};

// Statuts de publication
const PublicationStatus = {
  DRAFT: 'DRAFT',                   // Brouillon
  PUBLISHED: 'PUBLISHED',           // Publié sur la bourse
  AWAITING_RESPONSES: 'AWAITING_RESPONSES',  // En attente de réponses
  RESPONSES_RECEIVED: 'RESPONSES_RECEIVED',   // Réponses reçues
  UNDER_EVALUATION: 'UNDER_EVALUATION',       // En cours d'évaluation
  NEGOTIATION: 'NEGOTIATION',                 // En négociation
  AWARDED: 'AWARDED',               // Attribué à un logisticien
  CANCELLED: 'CANCELLED',           // Annulé
  EXPIRED: 'EXPIRED'                // Expiré sans réponse
};

// Types de publication
const PublicationTypes = {
  GLOBAL_MARKET: 'GLOBAL_MARKET',   // Bourse globale (tous logisticiens abonnés)
  REFERENCED_ONLY: 'REFERENCED_ONLY', // Uniquement logisticiens référencés
  MIXED: 'MIXED'                     // Les deux
};

// Contraintes de température
const TemperatureConstraints = {
  AMBIENT: 'AMBIENT',               // Ambiant
  CONTROLLED: 'CONTROLLED',         // Température contrôlée
  REFRIGERATED: 'REFRIGERATED',     // Réfrigéré (0-4°C)
  FROZEN: 'FROZEN'                  // Congelé (-18°C ou moins)
};

// Certifications et autorisations
const Certifications = {
  ADR: 'ADR',                       // Transport matières dangereuses
  IFS_LOGISTICS: 'IFS_LOGISTICS',   // IFS Logistics
  ISO_9001: 'ISO_9001',             // ISO 9001
  ISO_14001: 'ISO_14001',           // ISO 14001
  OEA: 'OEA',                       // Opérateur Économique Agréé
  CUSTOMS_BONDED: 'CUSTOMS_BONDED', // Sous douane
  ORGANIC: 'ORGANIC',               // Bio certifié
  HACCP: 'HACCP'                    // HACCP
};

// Services proposés
const Services = {
  INVENTORY_MANAGEMENT: 'INVENTORY_MANAGEMENT',   // Gestion d'inventaire
  ORDER_PICKING: 'ORDER_PICKING',                 // Préparation de commandes
  LABELING: 'LABELING',                           // Étiquetage
  PACKAGING: 'PACKAGING',                         // Conditionnement
  QUALITY_CONTROL: 'QUALITY_CONTROL',             // Contrôle qualité
  TRANSPORT_COORDINATION: 'TRANSPORT_COORDINATION', // Coordination transport
  WMS_INTEGRATION: 'WMS_INTEGRATION',             // Intégration WMS
  REAL_TIME_TRACKING: 'REAL_TIME_TRACKING',       // Suivi temps réel
  CROSS_DOCKING: 'CROSS_DOCKING',                 // Cross-docking
  VALUE_ADDED_SERVICES: 'VALUE_ADDED_SERVICES'    // Services à valeur ajoutée
};

// Statuts des réponses logisticiens
const ResponseStatus = {
  PENDING: 'PENDING',               // En attente de réponse
  SUBMITTED: 'SUBMITTED',           // Réponse soumise
  UNDER_REVIEW: 'UNDER_REVIEW',     // En cours d'examen
  SHORTLISTED: 'SHORTLISTED',       // Présélectionné
  ACCEPTED: 'ACCEPTED',             // Accepté
  REJECTED: 'REJECTED',             // Rejeté
  WITHDRAWN: 'WITHDRAWN'            // Retiré par le logisticien
};

// Recommandations IA
const AIRecommendation = {
  HIGHLY_RECOMMENDED: 'HIGHLY_RECOMMENDED',  // Fortement recommandé
  RECOMMENDED: 'RECOMMENDED',                 // Recommandé
  ACCEPTABLE: 'ACCEPTABLE',                   // Acceptable
  NOT_RECOMMENDED: 'NOT_RECOMMENDED'          // Non recommandé
};

// Niveaux d'importance pour les questions
const ImportanceLevel = {
  CRITICAL: 'CRITICAL',             // Critique
  HIGH: 'HIGH',                     // Élevé
  MEDIUM: 'MEDIUM',                 // Moyen
  LOW: 'LOW'                        // Faible
};

// Configuration par défaut
const DefaultConfig = {
  responseDuration: 7,               // Durée en jours pour répondre
  maxResponses: 50,                  // Nombre max de réponses
  autoRankingEnabled: true,          // Classement IA automatique
  criteriaWeights: {
    price: 40,                       // Poids du prix (%)
    proximity: 25,                   // Poids de la proximité (%)
    quality: 20,                     // Poids qualité/certifications (%)
    services: 15                     // Poids services/intégration (%)
  }
};

/**
 * Structure d'un besoin de stockage
 */
const StorageNeedSchema = {
  needId: String,                    // ID unique du besoin
  organizationId: String,            // ID de l'organisation industrielle
  createdBy: String,                 // ID utilisateur créateur
  status: String,                    // PublicationStatus
  publicationType: String,           // PublicationTypes

  // Caractéristiques du besoin
  storageType: String,               // StorageTypes
  volume: {
    value: Number,
    unit: String                     // VolumeUnits
  },
  duration: {
    startDate: Date,
    endDate: Date,
    flexible: Boolean,
    renewalPossible: Boolean
  },
  location: {
    country: String,
    region: String,
    department: String,
    maxDistanceKm: Number            // Rayon acceptable
  },

  // Contraintes opérationnelles
  constraints: {
    temperature: String,             // TemperatureConstraints
    adrAuthorized: Boolean,
    securityLevel: String,           // basic, standard, high
    certifications: [String]         // Certifications requises
  },
  infrastructure: {
    docksRequired: Number,
    ceilingHeightMin: Number,        // Mètres
    handlingEquipment: [String],     // Équipements requis
    wmsIntegrationRequired: Boolean
  },
  activity: {
    operatingHours: String,          // ex: "24/7", "8h-18h"
    dailyMovements: Number,          // Fréquence mouvements quotidiens
    peakSeasons: [String]            // Périodes de pic
  },

  // Budget et critères
  budget: {
    indicative: Number,
    currency: String,
    flexible: Boolean
  },
  selectionCriteria: {
    priceWeight: Number,             // % importance prix
    proximityWeight: Number,         // % importance proximité
    qualityWeight: Number,           // % importance qualité
    servicesWeight: Number           // % importance services
  },

  // Cahier des charges
  rfp: {
    original: String,                // Texte original fourni
    aiGenerated: String,             // Version générée par IA
    standardized: String,            // Version standardisée par IA
    finalVersion: String,            // Version finale utilisée
    generatedAt: Date,
    standardizedAt: Date
  },

  // Documents
  documents: [{
    documentId: String,
    name: String,
    type: String,                    // technical_spec, photos, logistics_plan
    url: String,
    uploadedAt: Date
  }],

  // Références logisticiens
  referencedLogisticians: [String], // IDs des logisticiens invités

  // Timestamps
  publishedAt: Date,
  deadline: Date,                    // Date limite réponses
  createdAt: Date,
  updatedAt: Date
};

/**
 * Structure d'une capacité logistique (site logisticien)
 */
const LogisticianCapacitySchema = {
  capacityId: String,                // ID unique capacité
  logisticianId: String,             // ID du logisticien
  organizationId: String,            // ID organisation logisticien

  // Informations du site
  site: {
    name: String,
    address: {
      street: String,
      city: String,
      postalCode: String,
      country: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  },

  // Capacités
  capacity: {
    totalM2: Number,
    availableM2: Number,
    totalPallets: Number,
    availablePallets: Number,
    storageTypes: [String]           // StorageTypes supportés
  },

  // Infrastructure technique
  infrastructure: {
    ceilingHeight: Number,           // Mètres
    docks: Number,
    handlingEquipment: [String],
    wmsSystem: String,
    apiAvailable: Boolean
  },

  // Conditions et certifications
  conditions: {
    temperatureControl: Boolean,
    temperatureRange: {
      min: Number,
      max: Number
    },
    adrCertified: Boolean,
    customsBonded: Boolean,
    certifications: [String]         // Certifications
  },

  // Services
  services: [String],                // Services proposés

  // Disponibilité
  availability: {
    operatingHours: String,
    available24_7: Boolean,
    nextAvailableDate: Date
  },

  // Tarification
  pricing: {
    pricePerM2: Number,
    pricePerPallet: Number,
    setupFees: Number,
    movementFees: Number,
    currency: String,
    priceValidUntil: Date
  },

  // Statistiques
  stats: {
    occupancyRate: Number,           // %
    averageStorageDuration: Number,  // Jours
    clientCount: Number
  },

  // Timestamps
  lastUpdated: Date,
  createdAt: Date
};

/**
 * Structure d'une réponse logisticien
 */
const LogisticianResponseSchema = {
  responseId: String,                // ID unique réponse
  needId: String,                    // ID du besoin
  logisticianId: String,             // ID logisticien
  capacityId: String,                // ID capacité proposée
  status: String,                    // ResponseStatus

  // Proposition commerciale
  proposal: {
    pricePerM2: Number,
    pricePerPallet: Number,
    setupFees: Number,
    movementFees: Number,
    monthlyTotal: Number,
    totalEstimated: Number,
    currency: String,
    validityDate: Date
  },

  // Détails opérationnels
  operational: {
    availabilityDate: Date,
    minimumDuration: Number,         // Mois
    noticePeriod: Number,            // Jours de préavis
    servicesIncluded: [String],
    additionalServices: [{
      service: String,
      price: Number
    }]
  },

  // Conformité
  compliance: {
    meetsAllRequirements: Boolean,
    partialCompliance: [String],     // Exigences non remplies
    alternatives: String             // Propositions alternatives
  },

  // Documents joints
  documents: [{
    documentId: String,
    name: String,
    type: String,                    // quotation, certifications, site_photos
    url: String
  }],

  // Commentaires
  comments: String,                  // Commentaires du logisticien

  // Extraction IA
  aiExtraction: {
    extracted: Boolean,
    extractedData: Object,           // Données structurées extraites par IA
    extractedAt: Date,
    tokensUsed: Object
  },

  // Analyse IA
  aiAnalysis: {
    overallScore: Number,
    priceScore: Number,
    proximityScore: Number,
    qualityScore: Number,
    servicesScore: Number,
    recommendation: String,          // AIRecommendation
    strengths: [String],
    weaknesses: [String],
    analyzedAt: Date
  },

  // Questions de clarification
  clarificationQuestions: [{
    question: String,
    category: String,
    importance: String,              // ImportanceLevel
    answer: String,
    answeredAt: Date
  }],

  // Timestamps
  submittedAt: Date,
  responseTimeHours: Number,
  lastModifiedAt: Date
};

module.exports = {
  StorageTypes,
  VolumeUnits,
  PublicationStatus,
  PublicationTypes,
  TemperatureConstraints,
  Certifications,
  Services,
  ResponseStatus,
  AIRecommendation,
  ImportanceLevel,
  DefaultConfig,
  StorageNeedSchema,
  LogisticianCapacitySchema,
  LogisticianResponseSchema
};
