/**
 * Module Planning Chargement & Livraison
 * Modèles de données et types
 * Version: 1.0.0
 */

// ============================================================================
// TYPES DE SITES
// ============================================================================

const SiteTypes = {
  WAREHOUSE: 'warehouse',       // Entrepôt
  FACTORY: 'factory',           // Usine
  SUPPLIER: 'supplier',         // Fournisseur
  RECIPIENT: 'recipient',       // Destinataire
  CROSS_DOCK: 'cross_dock',     // Plateforme cross-dock
  DISTRIBUTION: 'distribution'  // Centre de distribution
};

// ============================================================================
// TYPES DE FLUX
// ============================================================================

const FlowTypes = {
  LOADING: 'loading',           // Chargement (sortant)
  DELIVERY: 'delivery',         // Livraison (entrant)
  CROSS_DOCK: 'cross_dock'      // Transit
};

// ============================================================================
// TYPES DE TRANSPORT
// ============================================================================

const TransportTypes = {
  FTL: 'ftl',                   // Full Truck Load
  LTL: 'ltl',                   // Less Than Truck Load
  PARCEL: 'parcel',             // Messagerie/Colis
  EXPRESS: 'express',           // Express 24h
  ADR: 'adr',                   // Marchandises dangereuses
  FRIGO: 'frigo'                // Température contrôlée
};

// ============================================================================
// STATUTS DE CRÉNEAU
// ============================================================================

const SlotStatus = {
  AVAILABLE: 'available',       // Disponible
  RESERVED: 'reserved',         // Réservé (en attente confirmation)
  CONFIRMED: 'confirmed',       // Confirmé
  BLOCKED: 'blocked',           // Bloqué (maintenance, etc.)
  COMPLETED: 'completed',       // Terminé
  CANCELLED: 'cancelled',       // Annulé
  NO_SHOW: 'no_show'            // Absence
};

// ============================================================================
// STATUTS DE RDV
// ============================================================================

const RdvStatus = {
  REQUESTED: 'requested',       // Demande initiale
  PROPOSED: 'proposed',         // Proposition alternative
  CONFIRMED: 'confirmed',       // Confirmé
  REFUSED: 'refused',           // Refusé
  RESCHEDULED: 'rescheduled',   // Replanifié
  CHECKED_IN: 'checked_in',     // Chauffeur arrivé
  IN_PROGRESS: 'in_progress',   // En cours (chargement/déchargement)
  COMPLETED: 'completed',       // Terminé
  CANCELLED: 'cancelled',       // Annulé
  NO_SHOW: 'no_show'            // Absence
};

// ============================================================================
// MODES DE CHECK-IN
// ============================================================================

const CheckInModes = {
  APP_GEOFENCE: 'app_geofence',     // Application mobile + géofence
  QR_CODE: 'qr_code',               // Scan QR code
  KIOSK: 'kiosk',                   // Borne physique
  MANUAL: 'manual'                  // Saisie manuelle
};

// ============================================================================
// ÉVÉNEMENTS SYSTÈME
// ============================================================================

const PlanningEvents = {
  // Planning
  PLANNING_CREATED: 'planning.created',
  PLANNING_UPDATED: 'planning.updated',
  PLANNING_DELETED: 'planning.deleted',

  // Créneaux
  SLOT_CREATED: 'slot.created',
  SLOT_RESERVED: 'slot.reserved',
  SLOT_RELEASED: 'slot.released',
  SLOT_BLOCKED: 'slot.blocked',

  // RDV
  RDV_REQUESTED: 'rdv.requested',
  RDV_PROPOSED: 'rdv.proposed',
  RDV_CONFIRMED: 'rdv.confirmed',
  RDV_REFUSED: 'rdv.refused',
  RDV_RESCHEDULED: 'rdv.rescheduled',
  RDV_CANCELLED: 'rdv.cancelled',

  // Check-in chauffeur
  DRIVER_APPROACHING: 'driver.approaching',
  DRIVER_CHECKED_IN: 'driver.checked_in',
  DRIVER_AT_DOCK: 'driver.at_dock',
  DRIVER_CHECKED_OUT: 'driver.checked_out',
  DRIVER_NO_SHOW: 'driver.no_show',

  // Opérations
  LOADING_STARTED: 'loading.started',
  LOADING_COMPLETED: 'loading.completed',
  DELIVERY_STARTED: 'delivery.started',
  DELIVERY_COMPLETED: 'delivery.completed',

  // Signature
  SIGNATURE_REQUESTED: 'signature.requested',
  SIGNATURE_COMPLETED: 'signature.completed'
};

// ============================================================================
// PRIORITÉS
// ============================================================================

const PriorityLevels = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  URGENT: 4,
  CRITICAL: 5
};

// ============================================================================
// SCHÉMA: SITE PLANNING
// ============================================================================

const SitePlanningSchema = {
  _id: 'ObjectId',
  siteId: 'String (UUID)',
  organizationId: 'ObjectId',

  // Informations site
  site: {
    name: 'String',
    type: 'SiteTypes',
    address: {
      street: 'String',
      city: 'String',
      postalCode: 'String',
      country: 'String',
      coordinates: { lat: 'Number', lng: 'Number' }
    },
    geofence: {
      radius: 'Number (mètres)',
      coordinates: { lat: 'Number', lng: 'Number' }
    },
    timezone: 'String'
  },

  // Configuration des quais
  docks: [{
    dockId: 'String',
    name: 'String',
    type: 'String',           // loading, delivery, mixed
    capacity: 'Number',       // Camions simultanés
    equipment: ['String'],    // HAYON, TRANSPALETTE, etc.
    constraints: {
      allowedTransportTypes: ['TransportTypes'],
      maxWeight: 'Number',
      maxHeight: 'Number',
      adrCompatible: 'Boolean',
      frigoCompatible: 'Boolean'
    },
    status: 'String'          // active, maintenance, closed
  }],

  // Horaires d'ouverture
  openingHours: {
    monday: { open: 'String', close: 'String', closed: 'Boolean' },
    tuesday: { open: 'String', close: 'String', closed: 'Boolean' },
    wednesday: { open: 'String', close: 'String', closed: 'Boolean' },
    thursday: { open: 'String', close: 'String', closed: 'Boolean' },
    friday: { open: 'String', close: 'String', closed: 'Boolean' },
    saturday: { open: 'String', close: 'String', closed: 'Boolean' },
    sunday: { open: 'String', close: 'String', closed: 'Boolean' }
  },

  // Jours fériés et fermetures exceptionnelles
  closures: [{
    date: 'Date',
    reason: 'String',
    fullDay: 'Boolean',
    startTime: 'String',
    endTime: 'String'
  }],

  // Configuration des créneaux
  slotConfig: {
    defaultDuration: 'Number (minutes)',    // 30, 60, etc.
    minBookingNotice: 'Number (heures)',    // Délai minimum avant RDV
    maxAdvanceBooking: 'Number (jours)',    // Réservation max à l'avance
    toleranceWindow: 'Number (minutes)',    // Tolérance retard
    noShowThreshold: 'Number (minutes)'     // Délai avant no-show
  },

  // Règles métier
  rules: {
    // Créneaux prioritaires
    prioritySlots: [{
      startTime: 'String',
      endTime: 'String',
      conditions: {
        transporterType: 'String',    // premium, contract
        transportType: 'String',
        minScore: 'Number'
      }
    }],

    // Créneaux express
    expressSlots: [{
      startTime: 'String',
      endTime: 'String',
      maxBookingTime: 'Number (heures)'
    }],

    // Créneaux ADR
    adrSlots: [{
      startTime: 'String',
      endTime: 'String',
      docks: ['String']
    }],

    // Capacités par créneau selon flux
    capacityByFlow: {
      ftl: 'Number',
      ltl: 'Number',
      parcel: 'Number',
      express: 'Number'
    }
  },

  // Auto-RDV activé
  autoRdvEnabled: 'Boolean',
  autoRdvMinScore: 'Number',

  // Contacts
  contacts: [{
    name: 'String',
    role: 'String',
    email: 'String',
    phone: 'String'
  }],

  // Instructions
  instructions: {
    arrival: 'String',
    safety: 'String',
    parking: 'String',
    documents: ['String']
  },

  // Métadonnées
  status: 'String',
  createdAt: 'Date',
  updatedAt: 'Date',
  createdBy: 'ObjectId'
};

// ============================================================================
// SCHÉMA: CRÉNEAU (SLOT)
// ============================================================================

const SlotSchema = {
  _id: 'ObjectId',
  slotId: 'String (UUID)',
  sitePlanningId: 'ObjectId',
  siteId: 'String',

  // Informations temporelles
  date: 'Date',
  startTime: 'String (HH:mm)',
  endTime: 'String (HH:mm)',
  duration: 'Number (minutes)',

  // Quai assigné
  dockId: 'String',
  dockName: 'String',

  // Type de flux
  flowType: 'FlowTypes',
  transportType: 'TransportTypes',

  // Capacité
  capacity: 'Number',
  reserved: 'Number',
  available: 'Number',

  // Statut
  status: 'SlotStatus',

  // Réservations
  reservations: [{
    rdvId: 'ObjectId',
    transportOrderId: 'ObjectId',
    carrierId: 'ObjectId',
    carrierName: 'String',
    reservedAt: 'Date',
    status: 'String'
  }],

  // Contraintes
  constraints: {
    priority: 'Boolean',
    express: 'Boolean',
    adr: 'Boolean',
    frigo: 'Boolean',
    minScore: 'Number'
  },

  // Métadonnées
  createdAt: 'Date',
  updatedAt: 'Date'
};

// ============================================================================
// SCHÉMA: RENDEZ-VOUS (RDV)
// ============================================================================

const RdvSchema = {
  _id: 'ObjectId',
  rdvId: 'String (UUID)',
  rdvNumber: 'String',

  // Références
  transportOrderId: 'ObjectId',
  orderReference: 'String',
  sitePlanningId: 'ObjectId',
  slotId: 'ObjectId',
  organizationId: 'ObjectId',

  // Transporteur
  carrier: {
    carrierId: 'ObjectId',
    carrierName: 'String',
    carrierScore: 'Number',
    isPremium: 'Boolean'
  },

  // Chauffeur
  driver: {
    driverId: 'ObjectId',
    name: 'String',
    phone: 'String',
    vehiclePlate: 'String',
    vehicleType: 'String'
  },

  // Site
  site: {
    siteId: 'String',
    siteName: 'String',
    address: 'Object'
  },

  // Créneau
  slot: {
    date: 'Date',
    startTime: 'String',
    endTime: 'String',
    dockId: 'String',
    dockName: 'String'
  },

  // Type d'opération
  flowType: 'FlowTypes',
  transportType: 'TransportTypes',

  // Marchandise
  cargo: {
    description: 'String',
    weight: 'Number',
    volume: 'Number',
    pallets: 'Number',
    packages: 'Number',
    hazardous: 'Boolean',
    temperature: { min: 'Number', max: 'Number' }
  },

  // Statut
  status: 'RdvStatus',
  statusHistory: [{
    status: 'RdvStatus',
    changedAt: 'Date',
    changedBy: 'ObjectId',
    reason: 'String'
  }],

  // Workflow RDV
  workflow: {
    requestedAt: 'Date',
    requestedBy: 'ObjectId',
    proposedSlot: {
      date: 'Date',
      startTime: 'String',
      endTime: 'String'
    },
    confirmedAt: 'Date',
    confirmedBy: 'ObjectId'
  },

  // Check-in chauffeur
  checkIn: {
    mode: 'CheckInModes',
    arrivedAt: 'Date',
    checkedInAt: 'Date',
    atDockAt: 'Date',
    checkedOutAt: 'Date',
    waitTime: 'Number (minutes)',
    operationTime: 'Number (minutes)'
  },

  // Opération
  operation: {
    startedAt: 'Date',
    completedAt: 'Date',
    actualWeight: 'Number',
    actualPallets: 'Number',
    remarks: 'String',
    photos: ['String'],
    issues: [{
      type: 'String',
      description: 'String',
      severity: 'String'
    }]
  },

  // Signature électronique
  signature: {
    required: 'Boolean',
    signedAt: 'Date',
    signedBy: {
      name: 'String',
      role: 'String'
    },
    signatureUrl: 'String',
    documentUrl: 'String'
  },

  // Notifications
  notifications: [{
    type: 'String',
    channel: 'String',
    sentAt: 'Date',
    recipient: 'String'
  }],

  // Priorité
  priority: 'PriorityLevels',

  // Métadonnées
  createdAt: 'Date',
  updatedAt: 'Date',
  completedAt: 'Date'
};

// ============================================================================
// SCHÉMA: FILE D'ATTENTE CHAUFFEUR
// ============================================================================

const DriverQueueSchema = {
  _id: 'ObjectId',
  queueId: 'String (UUID)',
  sitePlanningId: 'ObjectId',
  siteId: 'String',
  date: 'Date',

  // Chauffeurs en attente
  drivers: [{
    rdvId: 'ObjectId',
    driverId: 'ObjectId',
    driverName: 'String',
    carrierName: 'String',
    vehiclePlate: 'String',
    rdvTime: 'String',
    arrivedAt: 'Date',
    checkedInAt: 'Date',
    priority: 'Number',
    status: 'String',         // waiting, called, at_dock
    assignedDock: 'String',
    estimatedWaitTime: 'Number',
    position: 'Number'
  }],

  // Statistiques temps réel
  stats: {
    totalWaiting: 'Number',
    averageWaitTime: 'Number',
    longestWaitTime: 'Number',
    processedToday: 'Number'
  },

  // Métadonnées
  createdAt: 'Date',
  updatedAt: 'Date'
};

// ============================================================================
// CONFIGURATION PAR DÉFAUT
// ============================================================================

const DefaultConfig = {
  // Créneaux
  slots: {
    defaultDuration: 60,          // 1 heure
    minBookingNotice: 4,          // 4 heures minimum
    maxAdvanceBooking: 14,        // 14 jours max
    toleranceWindow: 15,          // 15 min tolérance
    noShowThreshold: 30           // 30 min avant no-show
  },

  // Géofence
  geofence: {
    approachRadius: 2000,         // 2 km
    arrivalRadius: 500,           // 500 m
    dockRadius: 50                // 50 m
  },

  // Auto-RDV
  autoRdv: {
    enabled: false,
    minScore: 85
  },

  // Notifications
  notifications: {
    reminderBefore: 120,          // 2h avant
    approachingAlert: true,
    delayThreshold: 15            // Alerte si +15 min retard
  },

  // Scoring no-show
  scoring: {
    noShowPenalty: -15,
    latePenalty: -5,
    onTimBonus: +2
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  SiteTypes,
  FlowTypes,
  TransportTypes,
  SlotStatus,
  RdvStatus,
  CheckInModes,
  PlanningEvents,
  PriorityLevels,
  SitePlanningSchema,
  SlotSchema,
  RdvSchema,
  DriverQueueSchema,
  DefaultConfig
};
