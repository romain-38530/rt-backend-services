// Transport Orders Models - SYMPHONI.A Transport Order Management
// RT Backend Services - Version 1.0.0

// ==================== STATUTS COMMANDE ====================

const OrderStatus = {
  // Phase création
  NEW: 'NEW',
  AWAITING_ASSIGNMENT: 'AWAITING_ASSIGNMENT',

  // Phase affectation
  SENT_TO_CARRIER: 'SENT_TO_CARRIER',
  AWAITING_CARRIER_RESPONSE: 'AWAITING_CARRIER_RESPONSE',

  // Phase acceptation
  ACCEPTED: 'ACCEPTED',
  REFUSED: 'REFUSED',
  TIMEOUT: 'TIMEOUT',

  // Phase Affret.IA
  ESCALATED_TO_AFFRETIA: 'ESCALATED_TO_AFFRETIA',

  // Phase tracking
  TRACKING_STARTED: 'TRACKING_STARTED',
  EN_ROUTE_PICKUP: 'EN_ROUTE_PICKUP',
  ARRIVED_PICKUP: 'ARRIVED_PICKUP',
  LOADING: 'LOADING',
  LOADED: 'LOADED',
  EN_ROUTE_DELIVERY: 'EN_ROUTE_DELIVERY',
  ARRIVED_DELIVERY: 'ARRIVED_DELIVERY',
  UNLOADING: 'UNLOADING',
  DELIVERED: 'DELIVERED',

  // Phase documents
  DOCUMENTS_PENDING: 'DOCUMENTS_PENDING',
  DOCUMENTS_UPLOADED: 'DOCUMENTS_UPLOADED',
  DOCUMENTS_VALIDATED: 'DOCUMENTS_VALIDATED',

  // Phase clôture
  SCORING: 'SCORING',
  CLOSED: 'CLOSED',

  // Statuts exceptionnels
  INCIDENT: 'INCIDENT',
  DELAYED: 'DELAYED',
  CANCELLED: 'CANCELLED'
};

// ==================== TYPES D'ÉVÉNEMENTS ====================

const EventTypes = {
  // Création
  ORDER_CREATED: 'order.created',

  // Lane matching
  LANE_DETECTED: 'order.lane.detected',

  // Dispatch
  DISPATCH_CHAIN_GENERATED: 'dispatch.chain.generated',
  ORDER_SENT_TO_CARRIER: 'order.sent.to.carrier',

  // Réponses transporteur
  CARRIER_ACCEPTED: 'carrier.accepted',
  CARRIER_REFUSED: 'carrier.refused',
  CARRIER_TIMEOUT: 'carrier.timeout',

  // Affret.IA
  ESCALATED_TO_AFFRETIA: 'order.escalated.to.affretia',

  // Tracking
  TRACKING_STARTED: 'tracking.started',
  TRACKING_ETA_UPDATED: 'tracking.eta.updated',
  TRACKING_DELAY_DETECTED: 'tracking.delay.detected',

  // Étapes transport
  ARRIVED_PICKUP: 'order.arrived.pickup',
  LOADING: 'order.loading',
  LOADED: 'order.loaded',
  DEPARTED_PICKUP: 'order.departed.pickup',
  ARRIVED_DELIVERY: 'order.arrived.delivery',
  UNLOADING: 'order.unloading',
  DELIVERED: 'order.delivered',

  // RDV
  RDV_REQUESTED: 'rdv.requested',
  RDV_PROPOSED: 'rdv.proposed',
  RDV_CONFIRMED: 'rdv.confirmed',

  // Documents
  DOCUMENTS_UPLOADED: 'documents.uploaded',
  DOCUMENTS_VALIDATED: 'documents.validated',

  // Scoring
  CARRIER_SCORED: 'carrier.scored',

  // Clôture
  ORDER_CLOSED: 'order.closed',

  // Incidents
  INCIDENT_REPORTED: 'incident.reported',
  DELAY_REPORTED: 'delay.reported'
};

// ==================== TYPES DE TRACKING ====================

const TrackingTypes = {
  BASIC_EMAIL: {
    code: 'BASIC',
    name: 'Version Basic - Email',
    price: 50, // EUR/mois
    features: [
      'Mises à jour par email',
      'Statuts manuels chauffeur',
      'Pas de GPS temps réel',
      'Notification par clic'
    ]
  },
  INTERMEDIATE_GPS: {
    code: 'INTERMEDIATE',
    name: 'Version Intermédiaire - GPS Smartphone',
    price: 150, // EUR/mois
    features: [
      'Tracking GPS 30 sec',
      'Application mobile',
      'Géofencing simple',
      'Carte temps réel',
      'Statuts automatiques'
    ]
  },
  PREMIUM_TOMTOM: {
    code: 'PREMIUM',
    name: 'Version Premium - API TomTom',
    price: 4, // EUR/transport
    features: [
      'GPS télématique 1-5 sec',
      'ETA TomTom en direct',
      'IA prédictive retards',
      'Détection statuts avancée',
      'Replanification auto RDV',
      'Intégration télématique'
    ]
  }
};

// ==================== CANAUX DE CRÉATION ====================

const CreationChannels = {
  ERP_API: 'ERP_API',
  MANUAL_UI: 'MANUAL_UI',
  DUPLICATION: 'DUPLICATION',
  RECURRENCE: 'RECURRENCE'
};

// ==================== CONTRAINTES TRANSPORT ====================

const TransportConstraints = {
  ADR: 'ADR', // Matières dangereuses
  FRIGO: 'FRIGO', // Température contrôlée
  HAYON: 'HAYON', // Hayon élévateur
  RDV: 'RDV', // Rendez-vous obligatoire
  PALETTES_ECHANGE: 'PALETTES_ECHANGE', // Échange de palettes
  BACHE: 'BACHE', // Bâché
  PLATEAU: 'PLATEAU', // Plateau
  VRAC: 'VRAC', // En vrac
  FTL: 'FTL', // Full Truck Load (complet)
  LTL: 'LTL' // Less Than Truckload (groupage)
};

// ==================== TYPES DE DÉLÉGATION LOGISTIQUE ====================
// Détermine qui reçoit les demandes de RDV selon la configuration

const DelegatedLogisticsTypes = {
  NONE: 'NONE',           // Pas de délégation - Industriel gère tout
  '3PL': '3PL',           // Third-party logistics
  '4PL': '4PL'            // Fourth-party logistics (orchestrateur)
};

const ManagedOperations = {
  PICKUP: 'pickup',       // Logisticien gère le chargement
  DELIVERY: 'delivery',   // Logisticien gère la livraison
  BOTH: 'both'            // Logisticien gère les deux
};

// ==================== TYPES D'ORGANISATION ====================

const OrganizationTypes = {
  INDUSTRIAL: 'industrial',     // Donneur d'ordre (Industriel)
  LOGISTICIAN: 'logistician',   // Logisticien (3PL/4PL)
  CARRIER: 'carrier',           // Transporteur
  SUPPLIER: 'supplier',         // Fournisseur
  RECIPIENT: 'recipient'        // Destinataire
};

// ==================== SCHÉMA DÉLÉGATION LOGISTIQUE ====================
/**
 * Structure delegatedLogistics pour une commande:
 * {
 *   partnerId: string,           // ID du logisticien
 *   partnerName: string,         // Nom du logisticien
 *   partnerType: '3PL' | '4PL',  // Type de partenaire
 *   managedOperations: ['pickup' | 'delivery' | 'both'],
 *   partnerSites: string[],      // Sites gérés par le partenaire
 *   contractStartDate: Date,
 *   contractEndDate: Date,
 *   isActive: boolean
 * }
 *
 * Structure supplier pour une commande:
 * {
 *   supplierId: string,
 *   supplierName: string,
 *   siteId: string,
 *   managedByIndustrial: boolean  // Si false, le fournisseur gère ses propres RDV
 * }
 */

// ==================== TYPES D'INCIDENTS ====================

const IncidentTypes = {
  DELAY: 'DELAY', // Retard
  BREAKDOWN: 'BREAKDOWN', // Panne
  ACCIDENT: 'ACCIDENT', // Accident
  ROAD_CLOSURE: 'ROAD_CLOSURE', // Route fermée
  WEATHER: 'WEATHER', // Conditions météo
  LOADING_ISSUE: 'LOADING_ISSUE', // Problème chargement
  DELIVERY_ISSUE: 'DELIVERY_ISSUE', // Problème livraison
  DOCUMENTATION: 'DOCUMENTATION', // Problème documentaire
  REFUSED_DELIVERY: 'REFUSED_DELIVERY', // Livraison refusée
  OTHER: 'OTHER' // Autre
};

// ==================== SCORING CRITÈRES ====================

const ScoringCriteria = {
  PUNCTUALITY_PICKUP: {
    name: 'Ponctualité chargement',
    weight: 20,
    thresholds: {
      onTime: 100, // À l'heure
      delay15: 80, // < 15 min
      delay30: 60, // < 30 min
      delay60: 40, // < 1h
      delayOver: 20 // > 1h
    }
  },
  PUNCTUALITY_DELIVERY: {
    name: 'Ponctualité livraison',
    weight: 25,
    thresholds: {
      onTime: 100,
      delay15: 80,
      delay30: 60,
      delay60: 40,
      delayOver: 20
    }
  },
  RDV_RESPECT: {
    name: 'Respect RDV',
    weight: 15,
    thresholds: {
      confirmed: 100,
      notConfirmed: 50,
      missed: 0
    }
  },
  TRACKING_REACTIVITY: {
    name: 'Réactivité tracking',
    weight: 15,
    thresholds: {
      realTime: 100, // Temps réel
      frequent: 80, // Fréquent
      occasional: 60, // Occasionnel
      rare: 30 // Rare
    }
  },
  POD_DELAY: {
    name: 'Délai dépôt POD',
    weight: 15,
    thresholds: {
      sameDay: 100, // Même jour
      nextDay: 80, // J+1
      twoDays: 60, // J+2
      threeDays: 40, // J+3
      overThree: 20 // > J+3
    }
  },
  INCIDENTS: {
    name: 'Incidents déclarés',
    weight: 10,
    thresholds: {
      none: 100, // Aucun
      justified: 80, // Justifié
      minor: 60, // Mineur
      major: 30, // Majeur
      critical: 0 // Critique
    }
  }
};

// ==================== FONCTIONS UTILITAIRES ====================

/**
 * Calculer le score d'un transporteur
 */
function calculateCarrierScore(metrics) {
  let totalScore = 0;
  let totalWeight = 0;

  Object.keys(ScoringCriteria).forEach(criteriaKey => {
    const criteria = ScoringCriteria[criteriaKey];
    const metric = metrics[criteriaKey];

    if (metric !== undefined) {
      totalScore += metric * criteria.weight;
      totalWeight += criteria.weight;
    }
  });

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}

/**
 * Déterminer le prochain statut
 */
function getNextStatus(currentStatus, action) {
  const statusFlow = {
    [OrderStatus.NEW]: OrderStatus.AWAITING_ASSIGNMENT,
    [OrderStatus.AWAITING_ASSIGNMENT]: OrderStatus.SENT_TO_CARRIER,
    [OrderStatus.SENT_TO_CARRIER]: OrderStatus.AWAITING_CARRIER_RESPONSE,
    [OrderStatus.AWAITING_CARRIER_RESPONSE]: {
      accepted: OrderStatus.ACCEPTED,
      refused: OrderStatus.REFUSED,
      timeout: OrderStatus.TIMEOUT
    },
    [OrderStatus.ACCEPTED]: OrderStatus.TRACKING_STARTED,
    [OrderStatus.TRACKING_STARTED]: OrderStatus.EN_ROUTE_PICKUP,
    [OrderStatus.EN_ROUTE_PICKUP]: OrderStatus.ARRIVED_PICKUP,
    [OrderStatus.ARRIVED_PICKUP]: OrderStatus.LOADING,
    [OrderStatus.LOADING]: OrderStatus.LOADED,
    [OrderStatus.LOADED]: OrderStatus.EN_ROUTE_DELIVERY,
    [OrderStatus.EN_ROUTE_DELIVERY]: OrderStatus.ARRIVED_DELIVERY,
    [OrderStatus.ARRIVED_DELIVERY]: OrderStatus.UNLOADING,
    [OrderStatus.UNLOADING]: OrderStatus.DELIVERED,
    [OrderStatus.DELIVERED]: OrderStatus.DOCUMENTS_PENDING,
    [OrderStatus.DOCUMENTS_PENDING]: OrderStatus.DOCUMENTS_UPLOADED,
    [OrderStatus.DOCUMENTS_UPLOADED]: OrderStatus.DOCUMENTS_VALIDATED,
    [OrderStatus.DOCUMENTS_VALIDATED]: OrderStatus.SCORING,
    [OrderStatus.SCORING]: OrderStatus.CLOSED
  };

  const next = statusFlow[currentStatus];

  if (typeof next === 'object' && action) {
    return next[action] || currentStatus;
  }

  return next || currentStatus;
}

/**
 * Valider une commande
 */
function validateOrder(order) {
  const errors = [];

  // Validations obligatoires
  if (!order.reference) errors.push('Reference is required');
  if (!order.pickupAddress) errors.push('Pickup address is required');
  if (!order.deliveryAddress) errors.push('Delivery address is required');
  if (!order.industrialId) errors.push('Industrial ID is required');

  // Validations fenêtres horaires
  if (order.pickupTimeWindow) {
    if (!order.pickupTimeWindow.start || !order.pickupTimeWindow.end) {
      errors.push('Pickup time window must have start and end');
    }
  }

  if (order.deliveryTimeWindow) {
    if (!order.deliveryTimeWindow.start || !order.deliveryTimeWindow.end) {
      errors.push('Delivery time window must have start and end');
    }
  }

  // Validations poids et palettes
  if (order.weight && order.weight <= 0) {
    errors.push('Weight must be positive');
  }

  if (order.pallets && order.pallets <= 0) {
    errors.push('Pallets must be positive');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Générer un identifiant unique de commande
 */
function generateOrderReference(prefix = 'ORD') {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return `${prefix}-${year}${month}${day}-${random}`;
}

/**
 * Calculer l'ETA
 */
function calculateETA(origin, destination, currentPosition, averageSpeed = 70) {
  // Calcul simplifié - à remplacer par API TomTom en production
  const distance = calculateDistance(currentPosition || origin, destination);
  const hours = distance / averageSpeed;

  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * Calculer la distance (formule de Haversine simplifiée)
 */
function calculateDistance(point1, point2) {
  if (!point1 || !point2 || !point1.lat || !point1.lng || !point2.lat || !point2.lng) {
    return 0;
  }

  const R = 6371; // Rayon de la Terre en km
  const dLat = deg2rad(point2.lat - point1.lat);
  const dLon = deg2rad(point2.lng - point1.lng);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(point1.lat)) * Math.cos(deg2rad(point2.lat)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

// ==================== EXPORTS ====================

module.exports = {
  OrderStatus,
  EventTypes,
  TrackingTypes,
  CreationChannels,
  TransportConstraints,
  DelegatedLogisticsTypes,
  ManagedOperations,
  OrganizationTypes,
  IncidentTypes,
  ScoringCriteria,
  calculateCarrierScore,
  getNextStatus,
  validateOrder,
  generateOrderReference,
  calculateETA,
  calculateDistance
};
