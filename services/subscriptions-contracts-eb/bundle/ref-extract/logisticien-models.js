// Logisticien Models - Système de délégation logistique SYMPHONI.A
// RT Backend Services - Version 1.0.0

// ============================================
// STATUTS ET ENUMS
// ============================================

// Statuts de logisticien
const LogisticianStatus = {
  INVITED: 'invited',           // Invité, en attente d'onboarding
  ONBOARDING: 'onboarding',     // En cours d'onboarding
  ACTIVE: 'active',             // Actif et opérationnel
  BLOCKED: 'blocked',           // Bloqué (vigilance expirée)
  SUSPENDED: 'suspended',       // Suspendu (sanction)
  INACTIVE: 'inactive'          // Inactif
};

// Statuts de vigilance
const VigilanceStatus = {
  PENDING: 'pending',           // En attente de documents
  COMPLIANT: 'compliant',       // Conforme
  WARNING: 'warning',           // Documents expirent bientôt
  BLOCKED: 'blocked'            // Documents expirés, bloqué
};

// Types de délégation
const DelegationType = {
  FULL: 'FULL',                 // Délégation totale
  PARTIAL: 'PARTIAL'            // Délégation partielle (certains sites seulement)
};

// Statuts ICPE
const ICPEStatus = {
  DECLARATION: 'DECLARATION',             // Déclaration simple (D)
  ENREGISTREMENT: 'ENREGISTREMENT',       // Enregistrement (E)
  AUTORISATION: 'AUTORISATION',           // Autorisation (A)
  SEVESO_SB: 'SEVESO_SB',                 // SEVESO seuil bas
  SEVESO_SH: 'SEVESO_SH'                  // SEVESO seuil haut
};

// Régimes ICPE
const ICPERegime = {
  D: 'D',     // Déclaration
  DC: 'DC',   // Déclaration avec contrôle
  E: 'E',     // Enregistrement
  A: 'A',     // Autorisation
  S: 'S'      // Seveso
};

// ============================================
// DOCUMENTS DE VIGILANCE LOGISTICIEN
// ============================================

const LogisticianDocumentTypes = {
  // Documents entreprise (communs avec Transporteur)
  KBIS: 'kbis',
  URSSAF: 'urssaf',
  INSURANCE_RC: 'insurance_rc',
  INSURANCE_GOODS: 'insurance_goods',
  RIB: 'rib',

  // Documents spécifiques Entrepôt/ICPE
  ICPE_DECLARATION: 'icpe_declaration',
  ICPE_ENREGISTREMENT: 'icpe_enregistrement',
  ICPE_AUTORISATION: 'icpe_autorisation',
  ICPE_SEVESO: 'icpe_seveso',
  RAPPORT_INSPECTION: 'rapport_inspection',
  PERMIS_CONSTRUIRE: 'permis_construire',
  CONFORMITE_INCENDIE: 'conformite_incendie',
  CONFORMITE_ELECTRIQUE: 'conformite_electrique',
  CERTIFICAT_ADR: 'certificat_adr',
  CERTIFICAT_FROID: 'certificat_froid',
  CERTIFICATION_IFS: 'certification_ifs',
  CERTIFICATION_ISO: 'certification_iso',
  CERTIFICATION_OEA: 'certification_oea'
};

// Configuration des documents de vigilance
const vigilanceDocumentsConfig = {
  kbis: {
    name: 'Extrait Kbis',
    required: true,
    hasExpiration: true,
    validityDays: 90,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: false
  },
  urssaf: {
    name: 'Attestation URSSAF',
    required: true,
    hasExpiration: true,
    validityDays: 90,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: false
  },
  insurance_rc: {
    name: 'Assurance Responsabilité Civile',
    required: true,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: false
  },
  insurance_goods: {
    name: 'Assurance Marchandises',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: false
  },
  rib: {
    name: 'RIB',
    required: true,
    hasExpiration: false,
    warehouseSpecific: false
  },
  icpe_declaration: {
    name: 'Déclaration ICPE',
    required: true,
    hasExpiration: false,
    warehouseSpecific: true,
    description: 'Récépissé de déclaration ICPE préfecture'
  },
  icpe_enregistrement: {
    name: 'Enregistrement ICPE',
    required: false,
    hasExpiration: false,
    warehouseSpecific: true,
    description: 'Arrêté préfectoral d\'enregistrement'
  },
  icpe_autorisation: {
    name: 'Autorisation ICPE',
    required: false,
    hasExpiration: false,
    warehouseSpecific: true,
    description: 'Arrêté préfectoral d\'autorisation'
  },
  icpe_seveso: {
    name: 'Classement SEVESO',
    required: false,
    hasExpiration: false,
    warehouseSpecific: true,
    description: 'Document de classement SEVESO'
  },
  rapport_inspection: {
    name: 'Rapport d\'inspection DREAL',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true
  },
  permis_construire: {
    name: 'Permis de construire',
    required: false,
    hasExpiration: false,
    warehouseSpecific: true
  },
  conformite_incendie: {
    name: 'Attestation conformité incendie',
    required: true,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true
  },
  conformite_electrique: {
    name: 'Vérification électrique',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true
  },
  certificat_adr: {
    name: 'Certificat ADR',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true,
    description: 'Requis si stockage matières dangereuses'
  },
  certificat_froid: {
    name: 'Certificat Froid',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true,
    description: 'Requis si entrepôt frigorifique'
  },
  certification_ifs: {
    name: 'Certification IFS Logistics',
    required: false,
    hasExpiration: true,
    validityDays: 365,
    reminderDaysBefore: [30, 15, 7],
    warehouseSpecific: true
  },
  certification_iso: {
    name: 'Certification ISO 9001/14001',
    required: false,
    hasExpiration: true,
    validityDays: 1095, // 3 ans
    reminderDaysBefore: [60, 30, 15],
    warehouseSpecific: false
  },
  certification_oea: {
    name: 'Opérateur Économique Agréé',
    required: false,
    hasExpiration: true,
    validityDays: 1095, // 3 ans
    reminderDaysBefore: [60, 30, 15],
    warehouseSpecific: false
  }
};

// Documents obligatoires pour validation
const REQUIRED_DOCUMENTS = [
  'kbis',
  'urssaf',
  'insurance_rc',
  'rib',
  'icpe_declaration',
  'conformite_incendie'
];

// ============================================
// RUBRIQUES ICPE
// ============================================

const ICPE_RUBRIQUES = {
  '1510': {
    libelle: 'Entrepôt couvert',
    description: 'Stockage de matières, produits ou substances combustibles en quantité supérieure à 500 tonnes',
    unite: 'tonnes',
    seuils: {
      declaration: { min: 500, max: 1000 },
      enregistrement: { min: 1000, max: null }
    }
  },
  '1511': {
    libelle: 'Entrepôt frigorifique',
    description: 'Entrepôts frigorifiques (installations)',
    unite: 'kg',
    seuils: {
      declaration: { min: 300, max: 1500 },
      autorisation: { min: 1500, max: null }
    },
    specifique: 'Quantité d\'ammoniac ou autres fluides'
  },
  '1530': {
    libelle: 'Dépôt de bois, papier, carton',
    description: 'Dépôt de papier, carton ou matériaux analogues',
    unite: 'm3',
    seuils: {
      declaration: { min: 1000, max: 20000 },
      enregistrement: { min: 20000, max: null }
    }
  },
  '1532': {
    libelle: 'Dépôt de bois sec',
    description: 'Stockage de bois ou matériaux combustibles analogues',
    unite: 'm3',
    seuils: {
      declaration: { min: 1000, max: 20000 },
      enregistrement: { min: 20000, max: null }
    }
  },
  '2662': {
    libelle: 'Stockage de polymères',
    description: 'Stockage de polymères (matières plastiques, caoutchoucs, élastomères, résines)',
    unite: 'tonnes',
    seuils: {
      declaration: { min: 100, max: 1000 },
      enregistrement: { min: 1000, max: null }
    }
  },
  '2663': {
    libelle: 'Stockage de pneumatiques',
    description: 'Stockage de pneumatiques et produits composites à base de caoutchouc',
    unite: 'm3',
    seuils: {
      declaration: { min: 1000, max: 10000 },
      enregistrement: { min: 10000, max: null }
    }
  },
  '2910': {
    libelle: 'Combustion',
    description: 'Installations de combustion (chaudières, groupes électrogènes)',
    unite: 'MW',
    seuils: {
      declaration: { min: 0.1, max: 2 },
      enregistrement: { min: 2, max: 20 },
      autorisation: { min: 20, max: null }
    }
  },
  '4331': {
    libelle: 'Liquides inflammables (cat 2)',
    description: 'Liquides inflammables de catégorie 2',
    unite: 'tonnes',
    seuils: {
      declaration: { min: 10, max: 100 },
      autorisation: { min: 100, max: null }
    },
    seveso: true
  },
  '4734': {
    libelle: 'Produits pétroliers',
    description: 'Produits pétroliers spécifiques et carburants de substitution',
    unite: 'm3',
    seuils: {
      declaration: { min: 50, max: 250 },
      enregistrement: { min: 250, max: 500 },
      autorisation: { min: 500, max: null }
    }
  },
  '4718': {
    libelle: 'Gaz inflammables (catégorie 1 et 2)',
    description: 'Stockage de gaz inflammables liquéfiés (GPL, etc.)',
    unite: 'tonnes',
    seuils: {
      declaration: { min: 0.1, max: 6 },
      enregistrement: { min: 6, max: 50 },
      autorisation: { min: 50, max: null }
    },
    seveso: true
  },
  '4510': {
    libelle: 'Dangereux pour l\'environnement aquatique',
    description: 'Substances dangereuses pour l\'environnement aquatique',
    unite: 'tonnes',
    seuils: {
      declaration: { min: 20, max: 100 },
      autorisation: { min: 100, max: null }
    }
  }
};

// ============================================
// SCHEMAS MONGODB
// ============================================

// Schema Logisticien principal
const logisticianSchema = {
  // Identification
  _id: 'ObjectId',
  email: { type: 'string', required: true, unique: true },
  companyName: { type: 'string', required: true },
  siret: { type: 'string', unique: true, sparse: true },
  siren: 'string',
  vatNumber: 'string',
  phone: 'string',
  address: {
    street: 'string',
    city: 'string',
    postalCode: 'string',
    country: { type: 'string', default: 'France' }
  },

  // Statut
  status: { type: 'string', enum: Object.values(LogisticianStatus), default: LogisticianStatus.INVITED },
  vigilanceStatus: { type: 'string', enum: Object.values(VigilanceStatus), default: VigilanceStatus.PENDING },

  // Relation avec Industriels
  industrialClients: [{
    industrialId: { type: 'ObjectId', required: true },
    industrialName: 'string',
    invitedAt: 'Date',
    activatedAt: 'Date',
    status: { type: 'string', enum: ['pending', 'active', 'suspended'], default: 'pending' },
    delegationType: { type: 'string', enum: Object.values(DelegationType), default: DelegationType.FULL },
    delegatedSites: ['string'] // IDs des sites industriels délégués (si PARTIAL)
  }],

  // Entrepôts
  warehouses: [{
    warehouseId: { type: 'string', required: true },
    name: { type: 'string', required: true },
    address: {
      street: 'string',
      city: 'string',
      postalCode: 'string',
      country: { type: 'string', default: 'France' }
    },
    gpsCoordinates: {
      lat: 'number',
      lng: 'number'
    },
    surface: 'number', // m²
    dockCount: { type: 'number', default: 1 },

    // ICPE Gestion Complète
    icpeStatus: { type: 'string', enum: Object.values(ICPEStatus) },
    icpeRubriques: [{
      rubrique: 'string',
      libelle: 'string',
      regime: { type: 'string', enum: Object.values(ICPERegime) },
      seuilMax: 'number',
      unite: 'string',
      dateDeclaration: 'Date'
    }],
    icpeNumero: 'string',
    icpePrefecture: 'string',
    icpeDateDeclaration: 'Date',
    icpeProchainControle: 'Date',

    // Caractéristiques
    certifications: ['string'],
    constraints: ['string'], // ADR, Frigo, etc.
    operatingHours: {
      monday: { open: 'string', close: 'string' },
      tuesday: { open: 'string', close: 'string' },
      wednesday: { open: 'string', close: 'string' },
      thursday: { open: 'string', close: 'string' },
      friday: { open: 'string', close: 'string' },
      saturday: { open: 'string', close: 'string' },
      sunday: { open: 'string', close: 'string' }
    },

    // Planning site ID (lien avec planning-service)
    planningId: 'string',

    isActive: { type: 'boolean', default: true }
  }],

  // Contacts
  contacts: [{
    type: { type: 'string', enum: ['reception', 'logistics', 'quality', 'admin', 'direction', 'other'] },
    firstName: 'string',
    lastName: 'string',
    email: 'string',
    phone: 'string',
    warehouseId: 'string', // Si contact spécifique à un entrepôt
    isMain: { type: 'boolean', default: false }
  }],

  // Authentification
  passwordHash: 'string',
  invitationToken: 'string',
  invitationExpiry: 'Date',
  lastLogin: 'Date',
  loginAttempts: { type: 'number', default: 0 },
  lockedUntil: 'Date',

  // Abonnement
  subscription: {
    type: { type: 'string', enum: ['free', 'starter', 'premium'], default: 'free' },
    startDate: 'Date',
    monthlyPrice: { type: 'number', default: 0 },
    paidOptions: {
      bourseDeStockage: {
        active: { type: 'boolean', default: false },
        activatedAt: 'Date',
        stripeSubscriptionId: 'string'
      },
      borneAccueilChauffeur: {
        active: { type: 'boolean', default: false },
        activatedAt: 'Date',
        stripeSubscriptionId: 'string'
      }
    }
  },

  // Score
  score: { type: 'number', default: 0, min: 0, max: 100 },
  scoreDetails: {
    documentation: { type: 'number', default: 0 },
    compliance: { type: 'number', default: 0 },
    reactivity: { type: 'number', default: 0 },
    quality: { type: 'number', default: 0 }
  },

  // Blocage
  blockedReason: 'string',
  blockedAt: 'Date',
  blockedUntil: 'Date',
  blockingHistory: [{
    reason: 'string',
    description: 'string',
    blockedAt: 'Date',
    blockedUntil: 'Date',
    unblockedAt: 'Date',
    unblockedBy: 'string',
    notes: 'string'
  }],

  // Notifications preferences
  notificationPreferences: {
    email: { type: 'boolean', default: true },
    push: { type: 'boolean', default: true },
    sms: { type: 'boolean', default: false }
  },

  // Métadonnées
  createdAt: { type: 'Date', default: 'Date.now' },
  updatedAt: { type: 'Date', default: 'Date.now' },
  invitedBy: 'string',
  source: { type: 'string', enum: ['invitation', 'manual', 'import'], default: 'invitation' }
};

// Schema Document Vigilance Logisticien
const logisticianDocumentSchema = {
  _id: 'ObjectId',
  logisticianId: { type: 'ObjectId', required: true, index: true },
  warehouseId: 'string', // null si document entreprise
  documentType: { type: 'string', required: true, enum: Object.values(LogisticianDocumentTypes) },
  fileName: { type: 'string', required: true },
  s3Key: { type: 'string', required: true },
  s3Bucket: 'string',
  contentType: 'string',
  fileSize: 'number',
  status: { type: 'string', enum: ['pending', 'verified', 'rejected', 'expired'], default: 'pending' },
  expiresAt: 'Date',
  uploadedAt: { type: 'Date', default: 'Date.now' },
  uploadedBy: 'string',
  verifiedAt: 'Date',
  verifiedBy: 'string',
  rejectionReason: 'string',
  notes: 'string',

  // OCR extraction (pour ICPE)
  ocrExtracted: {
    rubriques: ['string'],
    volumes: 'object',
    dates: 'object',
    rawText: 'string',
    confidence: 'number'
  }
};

// Schema Événements Logisticien
const logisticianEventSchema = {
  _id: 'ObjectId',
  logisticianId: { type: 'ObjectId', required: true, index: true },
  type: { type: 'string', required: true },
  payload: 'object',
  triggeredBy: {
    type: { type: 'string', enum: ['system', 'industrial', 'logistician', 'admin'] },
    id: 'string',
    name: 'string'
  },
  timestamp: { type: 'Date', default: 'Date.now' }
};

// Types d'événements
const LogisticianEventTypes = {
  INVITED: 'logistician.invited',
  REGISTERED: 'logistician.registered',
  ONBOARDING_STARTED: 'logistician.onboarding_started',
  ONBOARDING_COMPLETED: 'logistician.onboarding_completed',
  VALIDATED: 'logistician.validated',
  DOCUMENT_UPLOADED: 'logistician.document_uploaded',
  DOCUMENT_VERIFIED: 'logistician.document_verified',
  DOCUMENT_REJECTED: 'logistician.document_rejected',
  DOCUMENT_EXPIRED: 'logistician.document_expired',
  BLOCKED: 'logistician.blocked',
  UNBLOCKED: 'logistician.unblocked',
  WAREHOUSE_ADDED: 'logistician.warehouse_added',
  WAREHOUSE_UPDATED: 'logistician.warehouse_updated',
  INDUSTRIAL_ADDED: 'logistician.industrial_added',
  INDUSTRIAL_REMOVED: 'logistician.industrial_removed',
  OPTION_ACTIVATED: 'logistician.option_activated',
  OPTION_DEACTIVATED: 'logistician.option_deactivated',
  ICPE_VOLUME_DECLARED: 'logistician.icpe_volume_declared',
  ICPE_ALERT_TRIGGERED: 'logistician.icpe_alert_triggered',
  SCORE_UPDATED: 'logistician.score_updated',
  LOGIN: 'logistician.login',
  PASSWORD_CHANGED: 'logistician.password_changed'
};

// Schema Alertes Vigilance
const logisticianAlertSchema = {
  _id: 'ObjectId',
  logisticianId: { type: 'ObjectId', required: true, index: true },
  industrialId: 'ObjectId', // L'industriel concerné (pour notification)
  warehouseId: 'string',
  alertType: {
    type: 'string',
    enum: [
      'document_expiring_30',
      'document_expiring_15',
      'document_expiring_7',
      'document_expired',
      'icpe_seuil_warning',
      'icpe_seuil_critical',
      'icpe_declaration_missing',
      'inspection_due'
    ],
    required: true
  },
  severity: { type: 'string', enum: ['info', 'warning', 'critical'], default: 'info' },
  title: { type: 'string', required: true },
  message: { type: 'string', required: true },
  documentType: 'string',
  documentId: 'ObjectId',
  rubrique: 'string', // Pour alertes ICPE
  actionRequired: { type: 'boolean', default: true },
  actionLabel: 'string',
  actionUrl: 'string',
  notificationChannels: { type: 'array', default: ['email', 'in_app'] },
  notificationsSent: [{
    channel: 'string',
    sentAt: 'Date',
    success: 'boolean'
  }],
  isResolved: { type: 'boolean', default: false },
  resolvedAt: 'Date',
  resolvedBy: 'string',
  autoBlockAt: 'Date', // Date de blocage automatique si non résolu
  createdAt: { type: 'Date', default: 'Date.now' }
};

// Schema Déclaration Hebdomadaire ICPE
const icpeVolumeDeclarationSchema = {
  _id: 'ObjectId',
  logisticianId: { type: 'ObjectId', required: true, index: true },
  warehouseId: { type: 'string', required: true, index: true },
  weekNumber: { type: 'number', required: true }, // 1-52
  year: { type: 'number', required: true },
  declaredAt: { type: 'Date', default: 'Date.now' },
  declaredBy: 'string',

  // Volumes par rubrique
  volumes: [{
    rubrique: { type: 'string', required: true },
    libelle: 'string',
    volume: { type: 'number', required: true },
    unite: 'string',
    seuilMax: 'number',
    percentageUsed: 'number', // Calculé automatiquement
    alertLevel: { type: 'string', enum: ['ok', 'warning', 'critical'], default: 'ok' }
  }],

  // Validation
  status: { type: 'string', enum: ['draft', 'submitted', 'validated'], default: 'submitted' },
  validatedAt: 'Date',
  validatedBy: 'string',
  notes: 'string',

  // Index composé pour unicité
  // Unique: logisticianId + warehouseId + weekNumber + year
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Vérifier l'état de vigilance d'un logisticien
 */
function checkVigilanceStatus(logistician, documents) {
  const now = new Date();
  const expiringDocuments = [];
  const expiredDocuments = [];
  const missingDocuments = [];

  // Vérifier les documents entreprise (non spécifiques à un entrepôt)
  Object.keys(vigilanceDocumentsConfig).forEach(docType => {
    const config = vigilanceDocumentsConfig[docType];
    if (config.warehouseSpecific) return; // Géré séparément par entrepôt

    const document = documents.find(d => d.documentType === docType && d.status === 'verified');

    // Document manquant
    if (config.required && !document) {
      missingDocuments.push({
        type: docType,
        name: config.name,
        warehouseId: null
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
          documentId: document._id,
          expiredSince: Math.abs(daysUntilExpiration)
        });
      } else if (daysUntilExpiration <= 30) {
        expiringDocuments.push({
          type: docType,
          name: config.name,
          documentId: document._id,
          daysRemaining: daysUntilExpiration
        });
      }
    }
  });

  // Vérifier les documents par entrepôt
  (logistician.warehouses || []).forEach(warehouse => {
    if (!warehouse.isActive) return;

    Object.keys(vigilanceDocumentsConfig).forEach(docType => {
      const config = vigilanceDocumentsConfig[docType];
      if (!config.warehouseSpecific) return;

      const document = documents.find(
        d => d.documentType === docType &&
             d.warehouseId === warehouse.warehouseId &&
             d.status === 'verified'
      );

      // Document manquant
      if (config.required && !document) {
        missingDocuments.push({
          type: docType,
          name: config.name,
          warehouseId: warehouse.warehouseId,
          warehouseName: warehouse.name
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
            documentId: document._id,
            warehouseId: warehouse.warehouseId,
            warehouseName: warehouse.name,
            expiredSince: Math.abs(daysUntilExpiration)
          });
        } else if (daysUntilExpiration <= 30) {
          expiringDocuments.push({
            type: docType,
            name: config.name,
            documentId: document._id,
            warehouseId: warehouse.warehouseId,
            warehouseName: warehouse.name,
            daysRemaining: daysUntilExpiration
          });
        }
      }
    });
  });

  // Déterminer le statut global
  let status = VigilanceStatus.COMPLIANT;
  if (expiredDocuments.length > 0 || missingDocuments.length > 0) {
    status = VigilanceStatus.BLOCKED;
  } else if (expiringDocuments.length > 0) {
    status = VigilanceStatus.WARNING;
  }

  return {
    status,
    isValid: status === VigilanceStatus.COMPLIANT || status === VigilanceStatus.WARNING,
    canOperate: status !== VigilanceStatus.BLOCKED,
    lastCheck: now,
    expiringDocuments,
    expiredDocuments,
    missingDocuments
  };
}

/**
 * Vérifier les seuils ICPE d'un entrepôt
 */
function checkICPEThresholds(warehouse, lastDeclaration) {
  const alerts = [];

  if (!lastDeclaration || !lastDeclaration.volumes) {
    return alerts;
  }

  for (const volume of lastDeclaration.volumes) {
    if (!volume.seuilMax || volume.seuilMax === 0) continue;

    const ratio = volume.volume / volume.seuilMax;
    const percentage = Math.round(ratio * 100);

    if (ratio >= 0.90) {
      alerts.push({
        type: 'icpe_seuil_critical',
        severity: 'critical',
        rubrique: volume.rubrique,
        libelle: volume.libelle,
        volume: volume.volume,
        seuilMax: volume.seuilMax,
        unite: volume.unite,
        percentage,
        weekNumber: lastDeclaration.weekNumber,
        year: lastDeclaration.year,
        message: `Seuil ICPE rubrique ${volume.rubrique} atteint à ${percentage}%`,
        recommendation: 'Mise à jour de la déclaration ICPE requise ou changement de régime'
      });
    } else if (ratio >= 0.80) {
      alerts.push({
        type: 'icpe_seuil_warning',
        severity: 'warning',
        rubrique: volume.rubrique,
        libelle: volume.libelle,
        volume: volume.volume,
        seuilMax: volume.seuilMax,
        unite: volume.unite,
        percentage,
        weekNumber: lastDeclaration.weekNumber,
        year: lastDeclaration.year,
        message: `Seuil ICPE rubrique ${volume.rubrique} à ${percentage}%`
      });
    }
  }

  return alerts;
}

/**
 * Calculer le score d'un logisticien
 */
function calculateLogisticianScore(logistician, documents, declarations) {
  let score = 0;
  const details = {
    documentation: 0,
    compliance: 0,
    reactivity: 0,
    quality: 0
  };

  // Score documentation (40%)
  const verifiedDocs = documents.filter(d => d.status === 'verified').length;
  const totalRequiredDocs = REQUIRED_DOCUMENTS.length +
    (logistician.warehouses?.length || 0) * 2; // icpe_declaration + conformite_incendie par entrepôt
  details.documentation = Math.min(100, Math.round((verifiedDocs / totalRequiredDocs) * 100));

  // Score compliance ICPE (30%)
  const warehouseCount = logistician.warehouses?.filter(w => w.isActive).length || 0;
  const warehousesWithICPE = logistician.warehouses?.filter(
    w => w.isActive && w.icpeStatus && w.icpeRubriques?.length > 0
  ).length || 0;
  details.compliance = warehouseCount > 0
    ? Math.round((warehousesWithICPE / warehouseCount) * 100)
    : 50;

  // Score réactivité déclarations ICPE (20%)
  const now = new Date();
  const currentWeek = getISOWeek(now);
  const currentYear = now.getFullYear();
  const recentDeclarations = declarations.filter(d => {
    if (d.year < currentYear) return false;
    if (d.year === currentYear && d.weekNumber < currentWeek - 4) return false;
    return true;
  });
  details.reactivity = Math.min(100, recentDeclarations.length * 25);

  // Score qualité (10%) - basé sur les alertes non résolues
  details.quality = 100; // Par défaut, réduit si alertes

  // Calcul final
  score = Math.round(
    details.documentation * 0.40 +
    details.compliance * 0.30 +
    details.reactivity * 0.20 +
    details.quality * 0.10
  );

  return { score, details };
}

/**
 * Obtenir le numéro de semaine ISO
 */
function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/**
 * Déterminer le régime ICPE basé sur le volume
 */
function determineICPERegime(rubrique, volume) {
  const config = ICPE_RUBRIQUES[rubrique];
  if (!config) return null;

  const { seuils } = config;

  if (seuils.autorisation && volume >= seuils.autorisation.min) {
    return ICPERegime.A;
  }
  if (seuils.enregistrement && volume >= seuils.enregistrement.min) {
    return ICPERegime.E;
  }
  if (seuils.declaration && volume >= seuils.declaration.min) {
    return ICPERegime.D;
  }

  return null; // En dessous des seuils
}

/**
 * Vérifier si un logisticien peut recevoir des commandes
 */
function canReceiveOrders(logistician, documents) {
  const errors = [];

  // Vérifier le statut
  if (logistician.status === LogisticianStatus.BLOCKED) {
    errors.push('Logistician is blocked');
  }
  if (logistician.status === LogisticianStatus.SUSPENDED) {
    errors.push('Logistician is suspended');
  }
  if (logistician.status === LogisticianStatus.INACTIVE) {
    errors.push('Logistician is inactive');
  }
  if (logistician.status === LogisticianStatus.INVITED || logistician.status === LogisticianStatus.ONBOARDING) {
    errors.push('Logistician onboarding not completed');
  }

  // Vérifier la vigilance
  const vigilanceCheck = checkVigilanceStatus(logistician, documents);
  if (!vigilanceCheck.canOperate) {
    if (vigilanceCheck.expiredDocuments.length > 0) {
      errors.push(`Expired documents: ${vigilanceCheck.expiredDocuments.map(d => d.name).join(', ')}`);
    }
    if (vigilanceCheck.missingDocuments.length > 0) {
      errors.push(`Missing documents: ${vigilanceCheck.missingDocuments.map(d => d.name).join(', ')}`);
    }
  }

  // Vérifier qu'au moins un entrepôt est actif
  const activeWarehouses = logistician.warehouses?.filter(w => w.isActive) || [];
  if (activeWarehouses.length === 0) {
    errors.push('No active warehouse configured');
  }

  return {
    canReceive: errors.length === 0,
    errors
  };
}

/**
 * Générer un ID d'entrepôt unique
 */
function generateWarehouseId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `WH-${timestamp}-${random}`.toUpperCase();
}

/**
 * Générer un token d'invitation
 */
function generateInvitationToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Enums
  LogisticianStatus,
  VigilanceStatus,
  DelegationType,
  ICPEStatus,
  ICPERegime,
  LogisticianDocumentTypes,
  LogisticianEventTypes,

  // Configurations
  vigilanceDocumentsConfig,
  REQUIRED_DOCUMENTS,
  ICPE_RUBRIQUES,

  // Schemas
  logisticianSchema,
  logisticianDocumentSchema,
  logisticianEventSchema,
  logisticianAlertSchema,
  icpeVolumeDeclarationSchema,

  // Fonctions
  checkVigilanceStatus,
  checkICPEThresholds,
  calculateLogisticianScore,
  getISOWeek,
  determineICPERegime,
  canReceiveOrders,
  generateWarehouseId,
  generateInvitationToken
};
