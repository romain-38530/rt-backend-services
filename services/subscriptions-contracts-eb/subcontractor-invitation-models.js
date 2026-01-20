// Subcontractor Invitation Models - Gestion invitations sous-traitants SYMPHONI.A
// RT Backend Services - Version 1.0.0
// Intégration Dashdoc et Offre Découverte AFFRET.IA

/**
 * Statuts d'invitation
 */
const InvitationStatus = {
  PENDING: 'pending',           // Invitation envoyée, en attente de réponse
  SENT: 'sent',                 // Email envoyé
  OPENED: 'opened',             // Email ouvert (tracking)
  CLICKED: 'clicked',           // Lien cliqué
  REGISTERED: 'registered',     // Compte créé
  ONBOARDING: 'onboarding',     // En cours d'onboarding
  ACTIVATED: 'activated',       // Compte activé, offre en cours
  COMPLETED: 'completed',       // Offre découverte terminée
  EXPIRED: 'expired',           // Invitation expirée
  DECLINED: 'declined',         // Invitation refusée
  BOUNCED: 'bounced'            // Email non délivré
};

/**
 * Sources d'import des transporteurs
 */
const ImportSource = {
  MANUAL: 'manual',             // Ajout manuel
  DASHDOC: 'dashdoc',           // Import depuis Dashdoc TMS
  GEDMOUV: 'gedmouv',           // Import depuis GedMouv
  SHIPPEO: 'shippeo',           // Import depuis Shippeo
  CSV: 'csv',                   // Import CSV
  API: 'api',                   // API externe
  AFFRET_IA: 'affret_ia'        // Depuis bourse AFFRET.IA
};

/**
 * Types d'offres découverte
 */
const OfferType = {
  AFFRET_IA_DECOUVERTE: 'AFFRET_IA_DECOUVERTE',   // 10 transports gratuits AFFRET.IA
  SYMPHONIA_BASIC: 'SYMPHONIA_BASIC',             // Accès portail basique
  SYMPHONIA_PREMIUM: 'SYMPHONIA_PREMIUM',         // Essai Premium 30 jours
  CUSTOM: 'CUSTOM'                                // Offre personnalisée
};

/**
 * Configuration des offres découverte
 */
const offersConfig = {
  AFFRET_IA_DECOUVERTE: {
    name: 'Offre Découverte AFFRET.IA',
    description: 'Découvrez la bourse de fret intelligente AFFRET.IA',
    freeTransports: 10,
    validityDays: 90,
    features: [
      'Accès portail SYMPHONI.A',
      '10 transports AFFRET.IA gratuits',
      'Dépôt documents légaux',
      'Scoring transporteur',
      'Visibilité bourse de fret',
      'Notifications SMS/Email'
    ],
    emailTemplate: 'invitation-affretia-decouverte',
    landingPage: '/invitation/affretia'
  },
  SYMPHONIA_BASIC: {
    name: 'Portail SYMPHONI.A',
    description: 'Accédez au portail transporteur SYMPHONI.A',
    freeTransports: 0,
    validityDays: 365,
    features: [
      'Accès portail SYMPHONI.A',
      'Dépôt documents légaux',
      'Suivi commandes',
      'eCMR signature'
    ],
    emailTemplate: 'invitation-symphonia-basic',
    landingPage: '/invitation/symphonia'
  },
  SYMPHONIA_PREMIUM: {
    name: 'Essai Premium SYMPHONI.A',
    description: 'Essayez toutes les fonctionnalités Premium pendant 30 jours',
    freeTransports: 5,
    validityDays: 30,
    features: [
      'Toutes fonctionnalités Premium',
      'AFFRET.IA illimité pendant 30 jours',
      'Support prioritaire',
      'Analytics avancées'
    ],
    emailTemplate: 'invitation-symphonia-premium',
    landingPage: '/invitation/premium'
  }
};

/**
 * Schéma d'une invitation sous-traitant
 */
const subcontractorInvitationSchema = {
  // Identification
  _id: { type: 'ObjectId', auto: true },
  invitationId: { type: 'string', required: true, unique: true },

  // Transporteur invitant (celui qui a le compte Premium)
  invitingCarrierId: { type: 'string', required: true, index: true },
  invitingCarrierName: { type: 'string' },
  invitingCarrierEmail: { type: 'string' },

  // Transporteur invité (sous-traitant)
  invitedCarrier: {
    email: { type: 'string', required: true, index: true },
    companyName: { type: 'string' },
    siret: { type: 'string', index: true },
    siren: { type: 'string' },
    phone: { type: 'string' },
    address: {
      street: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
      country: { type: 'string', default: 'France' }
    },
    contact: {
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      phone: { type: 'string' }
    }
  },

  // Source d'import (Dashdoc, manuel, etc.)
  importSource: {
    type: 'string',
    enum: Object.values(ImportSource),
    required: true,
    index: true
  },
  externalId: { type: 'string' },  // ID externe (ex: Dashdoc pk)
  externalData: { type: 'object' }, // Données brutes de la source

  // Statistiques depuis la source (ex: Dashdoc)
  sourceStats: {
    totalOrders: { type: 'number', default: 0 },
    lastOrderAt: { type: 'date' },
    averageScore: { type: 'number' },
    firstOrderAt: { type: 'date' }
  },

  // Offre découverte
  offer: {
    type: {
      type: 'string',
      enum: Object.values(OfferType),
      required: true
    },
    name: { type: 'string' },
    freeTransports: { type: 'number', default: 10 },
    freeTransportsUsed: { type: 'number', default: 0 },
    validityDays: { type: 'number', default: 90 },
    features: [{ type: 'string' }],
    expiresAt: { type: 'date' },
    activatedAt: { type: 'date' }
  },

  // Statut invitation
  status: {
    type: 'string',
    enum: Object.values(InvitationStatus),
    required: true,
    default: 'pending',
    index: true
  },

  // Token d'invitation (pour le lien unique)
  invitationToken: { type: 'string', required: true, unique: true },
  invitationUrl: { type: 'string' },

  // Tracking email
  emailTracking: {
    sentAt: { type: 'date' },
    deliveredAt: { type: 'date' },
    openedAt: { type: 'date' },
    clickedAt: { type: 'date' },
    bouncedAt: { type: 'date' },
    bounceReason: { type: 'string' },
    emailProvider: { type: 'string', default: 'aws-ses' },
    messageId: { type: 'string' }
  },

  // Relances
  reminders: [{
    sentAt: { type: 'date' },
    type: { type: 'string' },  // email, sms
    status: { type: 'string' }
  }],
  reminderCount: { type: 'number', default: 0 },
  nextReminderAt: { type: 'date' },

  // Conversion
  conversion: {
    registeredAt: { type: 'date' },
    activatedAt: { type: 'date' },
    firstOrderAt: { type: 'date' },
    createdCarrierId: { type: 'string' },  // ID du compte créé
    conversionDays: { type: 'number' }     // Jours entre invitation et activation
  },

  // Métadonnées
  createdAt: { type: 'date', required: true, default: Date.now },
  updatedAt: { type: 'date', required: true, default: Date.now },
  expiresAt: { type: 'date' },
  declinedAt: { type: 'date' },
  declineReason: { type: 'string' },

  // Notes internes
  notes: { type: 'string' }
};

/**
 * Schéma de suivi des transports gratuits utilisés
 */
const freeTransportUsageSchema = {
  _id: { type: 'ObjectId', auto: true },
  invitationId: { type: 'string', required: true, index: true },
  carrierId: { type: 'string', required: true, index: true },
  orderId: { type: 'string', required: true },
  orderReference: { type: 'string' },
  usedAt: { type: 'date', required: true, default: Date.now },
  transportType: { type: 'string' },  // FTL, LTL, etc.
  route: {
    origin: { type: 'string' },
    destination: { type: 'string' },
    distance: { type: 'number' }
  },
  estimatedValue: { type: 'number' },  // Valeur estimée du transport gratuit
  createdAt: { type: 'date', required: true, default: Date.now }
};

/**
 * Schéma de synchronisation Dashdoc
 */
const dashdocSyncSchema = {
  _id: { type: 'ObjectId', auto: true },
  carrierId: { type: 'string', required: true, index: true },  // ID du transporteur premium
  connectionId: { type: 'string', required: true },            // ID de la connexion TMS

  // Dernière synchronisation
  lastSyncAt: { type: 'date' },
  lastSyncStatus: { type: 'string' },  // success, partial, failed

  // Compteurs
  totalCarriersFound: { type: 'number', default: 0 },
  newCarriersImported: { type: 'number', default: 0 },
  invitationsSent: { type: 'number', default: 0 },
  invitationsAccepted: { type: 'number', default: 0 },

  // Filtres appliqués
  filters: {
    minOrders: { type: 'number', default: 1 },      // Min commandes pour être éligible
    excludeEmails: [{ type: 'string' }],            // Emails à exclure
    excludeSirets: [{ type: 'string' }]             // SIRET à exclure
  },

  // Prochaine synchronisation
  autoSyncEnabled: { type: 'boolean', default: true },
  syncIntervalHours: { type: 'number', default: 24 },
  nextSyncAt: { type: 'date' },

  createdAt: { type: 'date', required: true, default: Date.now },
  updatedAt: { type: 'date', required: true, default: Date.now }
};

/**
 * Générer un token d'invitation unique
 */
function generateInvitationToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculer la date d'expiration de l'offre
 */
function calculateOfferExpiration(validityDays) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);
  return expiresAt;
}

/**
 * Vérifier si l'offre découverte est encore valide
 */
function isOfferValid(invitation) {
  if (!invitation.offer) return false;

  // Vérifier expiration
  if (invitation.offer.expiresAt && new Date() > new Date(invitation.offer.expiresAt)) {
    return false;
  }

  // Vérifier nombre de transports gratuits
  if (invitation.offer.freeTransportsUsed >= invitation.offer.freeTransports) {
    return false;
  }

  return true;
}

/**
 * Obtenir le nombre de transports gratuits restants
 */
function getRemainingFreeTransports(invitation) {
  if (!invitation.offer) return 0;
  return Math.max(0, invitation.offer.freeTransports - (invitation.offer.freeTransportsUsed || 0));
}

/**
 * Créer une nouvelle invitation
 */
function createInvitation(data) {
  const offerConfig = offersConfig[data.offerType] || offersConfig.AFFRET_IA_DECOUVERTE;
  const invitationToken = generateInvitationToken();

  return {
    invitationId: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    invitingCarrierId: data.invitingCarrierId,
    invitingCarrierName: data.invitingCarrierName,
    invitingCarrierEmail: data.invitingCarrierEmail,

    invitedCarrier: {
      email: data.email,
      companyName: data.companyName,
      siret: data.siret,
      phone: data.phone,
      address: data.address || {}
    },

    importSource: data.importSource || ImportSource.MANUAL,
    externalId: data.externalId,
    externalData: data.externalData,

    sourceStats: data.sourceStats || {},

    offer: {
      type: data.offerType || OfferType.AFFRET_IA_DECOUVERTE,
      name: offerConfig.name,
      freeTransports: data.freeTransports || offerConfig.freeTransports,
      freeTransportsUsed: 0,
      validityDays: data.validityDays || offerConfig.validityDays,
      features: offerConfig.features,
      expiresAt: null,  // Sera défini lors de l'activation
      activatedAt: null
    },

    status: InvitationStatus.PENDING,
    invitationToken,
    invitationUrl: `${process.env.PORTAL_URL || 'https://portail.symphonia-controltower.com'}/invitation/${invitationToken}`,

    emailTracking: {},
    reminders: [],
    reminderCount: 0,

    conversion: {},

    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: calculateOfferExpiration(30)  // Invitation expire après 30 jours
  };
}

/**
 * Statistiques agrégées des invitations
 */
function getInvitationStats(invitations) {
  const stats = {
    total: invitations.length,
    byStatus: {},
    bySource: {},
    conversionRate: 0,
    averageConversionDays: 0,
    totalFreeTransportsOffered: 0,
    totalFreeTransportsUsed: 0
  };

  let conversions = 0;
  let totalConversionDays = 0;

  invitations.forEach(inv => {
    // Par statut
    stats.byStatus[inv.status] = (stats.byStatus[inv.status] || 0) + 1;

    // Par source
    stats.bySource[inv.importSource] = (stats.bySource[inv.importSource] || 0) + 1;

    // Transports gratuits
    stats.totalFreeTransportsOffered += inv.offer?.freeTransports || 0;
    stats.totalFreeTransportsUsed += inv.offer?.freeTransportsUsed || 0;

    // Conversions
    if (inv.conversion?.activatedAt) {
      conversions++;
      if (inv.conversion.conversionDays) {
        totalConversionDays += inv.conversion.conversionDays;
      }
    }
  });

  stats.conversionRate = invitations.length > 0 ? (conversions / invitations.length * 100).toFixed(1) : 0;
  stats.averageConversionDays = conversions > 0 ? Math.round(totalConversionDays / conversions) : 0;

  return stats;
}

module.exports = {
  InvitationStatus,
  ImportSource,
  OfferType,
  offersConfig,
  subcontractorInvitationSchema,
  freeTransportUsageSchema,
  dashdocSyncSchema,
  generateInvitationToken,
  calculateOfferExpiration,
  isOfferValid,
  getRemainingFreeTransports,
  createInvitation,
  getInvitationStats
};
