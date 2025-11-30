/**
 * ============================================================================
 * Storage Market - Modèles de Données (VERSION SIMPLIFIÉE)
 * ============================================================================
 * TEST: Seulement les constantes, sans les gros Schema objects
 * ============================================================================
 */

// Types de stockage
const StorageTypes = {
  TEMPORARY: 'TEMPORARY',
  LONG_TERM: 'LONG_TERM',
  PICKING: 'PICKING',
  CROSS_DOCK: 'CROSS_DOCK',
  CUSTOMS: 'CUSTOMS'
};

// Unités de mesure pour les volumes
const VolumeUnits = {
  M2: 'M2',
  PALLETS: 'PALLETS',
  LINEAR_METERS: 'LINEAR_METERS',
  M3: 'M3'
};

// Statuts de publication
const PublicationStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  AWAITING_RESPONSES: 'AWAITING_RESPONSES',
  RESPONSES_RECEIVED: 'RESPONSES_RECEIVED',
  UNDER_EVALUATION: 'UNDER_EVALUATION',
  NEGOTIATION: 'NEGOTIATION',
  AWARDED: 'AWARDED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

// Types de publication
const PublicationTypes = {
  GLOBAL_MARKET: 'GLOBAL_MARKET',
  REFERENCED_ONLY: 'REFERENCED_ONLY',
  MIXED: 'MIXED'
};

// Contraintes de température
const TemperatureConstraints = {
  AMBIENT: 'AMBIENT',
  CONTROLLED: 'CONTROLLED',
  REFRIGERATED: 'REFRIGERATED',
  FROZEN: 'FROZEN'
};

// Certifications et autorisations
const Certifications = {
  ADR: 'ADR',
  IFS_LOGISTICS: 'IFS_LOGISTICS',
  ISO_9001: 'ISO_9001',
  ISO_14001: 'ISO_14001',
  OEA: 'OEA',
  CUSTOMS_BONDED: 'CUSTOMS_BONDED',
  ORGANIC: 'ORGANIC',
  HACCP: 'HACCP'
};

// Services proposés
const Services = {
  INVENTORY_MANAGEMENT: 'INVENTORY_MANAGEMENT',
  ORDER_PICKING: 'ORDER_PICKING',
  LABELING: 'LABELING',
  PACKAGING: 'PACKAGING',
  QUALITY_CONTROL: 'QUALITY_CONTROL',
  TRANSPORT_COORDINATION: 'TRANSPORT_COORDINATION',
  WMS_INTEGRATION: 'WMS_INTEGRATION',
  REAL_TIME_TRACKING: 'REAL_TIME_TRACKING',
  CROSS_DOCKING: 'CROSS_DOCKING',
  VALUE_ADDED_SERVICES: 'VALUE_ADDED_SERVICES'
};

// Statuts des réponses logisticiens
const ResponseStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  SHORTLISTED: 'SHORTLISTED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN'
};

// Recommandations IA
const AIRecommendation = {
  HIGHLY_RECOMMENDED: 'HIGHLY_RECOMMENDED',
  RECOMMENDED: 'RECOMMENDED',
  ACCEPTABLE: 'ACCEPTABLE',
  NOT_RECOMMENDED: 'NOT_RECOMMENDED'
};

// Niveaux d'importance pour les questions
const ImportanceLevel = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

// Configuration par défaut
const DefaultConfig = {
  responseDuration: 7,
  maxResponses: 50,
  autoRankingEnabled: true,
  criteriaWeights: {
    price: 40,
    proximity: 25,
    quality: 20,
    services: 15
  }
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
  DefaultConfig
};
