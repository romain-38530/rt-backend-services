// Account Types Models - Types de compte avec règles d'évolution
// RT Backend Services - Version 1.0.0

// Types de compte disponibles
const AccountTypes = {
  // Types créables par l'utilisateur
  TRANSPORTEUR: 'TRANSPORTEUR',
  EXPEDITEUR: 'EXPEDITEUR',
  PLATEFORME_LOGISTIQUE: 'PLATEFORME_LOGISTIQUE',
  COMMISSIONNAIRE: 'COMMISSIONNAIRE',

  // Types non-créables directement (évolution uniquement)
  COMMISSIONNAIRE_AGRÉÉ: 'COMMISSIONNAIRE_AGRÉÉ',
  DOUANE: 'DOUANE'
};

// Configuration complète des types de compte
const accountTypesConfig = {
  TRANSPORTEUR: {
    id: 'TRANSPORTEUR',
    name: 'Transporteur',
    icon: 'Truck',
    description: 'Transport routier de marchandises',
    color: 'blue',
    isCreatable: true,
    canUpgradeTo: ['COMMISSIONNAIRE'],
    requiredDocuments: ['licenceTransport', 'assuranceRCPro'],
    features: {
      canCreateTransportOrders: true,
      canManageDrivers: true,
      canManageVehicles: true,
      canAccessGPS: true,
      canSignECMR: true,
      maxDrivers: 10,
      maxVehicles: 20,
      advancedReporting: false
    },
    pricing: {
      monthlyFee: 49,
      perDriverFee: 5,
      perVehicleFee: 3
    }
  },

  EXPEDITEUR: {
    id: 'EXPEDITEUR',
    name: 'Expéditeur',
    icon: 'Package',
    description: 'Entreprise expéditrice de marchandises',
    color: 'green',
    isCreatable: true,
    canUpgradeTo: ['PLATEFORME_LOGISTIQUE'],
    requiredDocuments: ['siret', 'rcs'],
    features: {
      canCreateShipments: true,
      canRequestQuotes: true,
      canTrackShipments: true,
      canManageAddresses: true,
      canSignECMR: true,
      maxShipmentsPerMonth: 100,
      prioritySupport: false,
      advancedReporting: false
    },
    pricing: {
      monthlyFee: 29,
      perShipmentFee: 1.5
    }
  },

  PLATEFORME_LOGISTIQUE: {
    id: 'PLATEFORME_LOGISTIQUE',
    name: 'Plateforme Logistique',
    icon: 'Warehouse',
    description: 'Gestion de plateforme logistique et entrepôt',
    color: 'orange',
    isCreatable: true,
    canUpgradeTo: [],
    requiredDocuments: ['siret', 'licenceEntrepot', 'assuranceStock'],
    features: {
      canManageWarehouse: true,
      canManageInventory: true,
      canManageShipments: true,
      canCoordinateTransport: true,
      canSignECMR: true,
      maxWarehouseLocations: 5,
      maxInventoryItems: 10000,
      prioritySupport: true,
      advancedReporting: true,
      apiAccess: true
    },
    pricing: {
      monthlyFee: 199,
      perWarehouseFee: 50
    }
  },

  COMMISSIONNAIRE: {
    id: 'COMMISSIONNAIRE',
    name: 'Commissionnaire',
    icon: 'Briefcase',
    description: 'Organisation et coordination de transports',
    color: 'purple',
    isCreatable: true,
    canUpgradeTo: ['COMMISSIONNAIRE_AGRÉÉ'],
    requiredDocuments: ['licenceCommissionnaire', 'garantieFinanciere', 'assuranceRCPro'],
    features: {
      canOrganizeTransport: true,
      canManageSubcontractors: true,
      canManageMultipleClients: true,
      canAccessPricing: true,
      canSignECMR: true,
      maxActiveOrders: 500,
      maxSubcontractors: 50,
      prioritySupport: true,
      advancedReporting: true,
      apiAccess: true,
      whiteLabel: false
    },
    pricing: {
      monthlyFee: 299,
      perOrderFee: 2,
      commissionRate: 0.05
    }
  },

  COMMISSIONNAIRE_AGRÉÉ: {
    id: 'COMMISSIONNAIRE_AGRÉÉ',
    name: 'Commissionnaire Agréé en Douane',
    icon: 'ShieldCheck',
    description: 'Commissionnaire avec agrément douane',
    color: 'red',
    isCreatable: false,
    canUpgradeTo: [],
    requiredDocuments: ['agrement_douane', 'garantieFinanciereDouane'],
    features: {
      canOrganizeTransport: true,
      canManageSubcontractors: true,
      canManageMultipleClients: true,
      canAccessPricing: true,
      canSignECMR: true,
      canHandleCustoms: true,
      canFileCustomsDeclarations: true,
      canManageImportExport: true,
      maxActiveOrders: 2000,
      maxSubcontractors: 200,
      prioritySupport: true,
      dedicatedAccountManager: true,
      advancedReporting: true,
      apiAccess: true,
      whiteLabel: true,
      customIntegrations: true
    },
    pricing: {
      monthlyFee: 599,
      perOrderFee: 1.5,
      perCustomsDeclarationFee: 15,
      commissionRate: 0.03
    }
  },

  DOUANE: {
    id: 'DOUANE',
    name: 'Administration Douanière',
    icon: 'Flag',
    description: 'Accès réservé aux autorités douanières',
    color: 'gray',
    isCreatable: false,
    canUpgradeTo: [],
    requiredDocuments: ['autorisationOfficielle'],
    features: {
      canViewAllDeclarations: true,
      canAuditOperations: true,
      canAccessReports: true,
      canManageControls: true,
      canIssueNotifications: true,
      fullSystemAccess: true
    },
    pricing: {
      monthlyFee: 0,
      customPricing: true
    }
  }
};

// Règles d'évolution entre types
const upgradeRules = {
  TRANSPORTEUR: {
    COMMISSIONNAIRE: {
      conditions: [
        'Licence de commissionnaire de transport valide',
        'Garantie financière minimale: 50 000€',
        'Assurance RC Professionnelle spécifique',
        'Minimum 2 ans d\'expérience en tant que Transporteur'
      ],
      requiredDocuments: ['licenceCommissionnaire', 'garantieFinanciere', 'assuranceRCProCommissionnaire'],
      minimumMonthsAsCurrentType: 24,
      approval: {
        required: true,
        estimatedDays: 7
      }
    }
  },

  EXPEDITEUR: {
    PLATEFORME_LOGISTIQUE: {
      conditions: [
        'Licence d\'exploitation d\'entrepôt',
        'Assurance marchandises stockées',
        'Capacité de stockage minimale: 500m²',
        'Minimum 1 an d\'expérience en tant qu\'Expéditeur'
      ],
      requiredDocuments: ['licenceEntrepot', 'assuranceStock', 'planEntrepot'],
      minimumMonthsAsCurrentType: 12,
      approval: {
        required: true,
        estimatedDays: 5
      }
    }
  },

  COMMISSIONNAIRE: {
    COMMISSIONNAIRE_AGRÉÉ: {
      conditions: [
        'Agrément en douane délivré par l\'administration',
        'Garantie financière douane: 150 000€',
        'Formation spécialisée douane complétée',
        'Minimum 3 ans d\'expérience en tant que Commissionnaire',
        'Chiffre d\'affaires minimum: 500 000€/an'
      ],
      requiredDocuments: ['agrement_douane', 'garantieFinanciereDouane', 'certificatFormationDouane', 'bilanFinancier'],
      minimumMonthsAsCurrentType: 36,
      approval: {
        required: true,
        estimatedDays: 14,
        requiresExternalApproval: true,
        approvalAuthority: 'Direction Générale des Douanes'
      }
    }
  }
};

// Statuts de compte
const AccountStatus = {
  PENDING: 'PENDING',           // En attente de validation
  ACTIVE: 'ACTIVE',             // Actif
  SUSPENDED: 'SUSPENDED',       // Suspendu
  UPGRADING: 'UPGRADING',       // En cours d'évolution
  UPGRADE_REJECTED: 'UPGRADE_REJECTED', // Évolution refusée
  CLOSED: 'CLOSED'              // Fermé
};

// Schema d'un compte utilisateur avec type
const userAccountSchema = {
  userId: { type: 'string', required: true },
  email: { type: 'string', required: true },
  companyName: { type: 'string', required: true },

  // Type de compte actuel
  accountType: {
    type: 'string',
    required: true,
    enum: Object.keys(AccountTypes)
  },

  accountStatus: {
    type: 'string',
    required: true,
    default: 'PENDING'
  },

  // Historique des types
  accountHistory: [{
    type: 'string',
    changedAt: 'date',
    changedBy: 'string',
    reason: 'string'
  }],

  // Documents téléchargés
  documents: {
    type: 'object',
    // Structure: { documentType: { url, uploadedAt, verified, verifiedAt, verifiedBy } }
  },

  // Demande d'évolution en cours
  upgradeRequest: {
    requestedType: 'string',
    requestedAt: 'date',
    status: 'string', // PENDING, APPROVED, REJECTED
    documents: 'object',
    rejectionReason: 'string',
    approvedAt: 'date',
    approvedBy: 'string'
  },

  // Métadonnées
  createdAt: { type: 'date', required: true },
  updatedAt: { type: 'date', required: true },
  selectedTypeAt: { type: 'date', required: false },
  activatedAt: { type: 'date', required: false }
};

/**
 * Valider qu'un type de compte peut être sélectionné initialement
 */
function validateInitialTypeSelection(accountType) {
  const errors = [];

  if (!accountType) {
    errors.push('accountType is required');
    return { valid: false, errors };
  }

  if (!AccountTypes[accountType]) {
    errors.push('Invalid account type');
    return { valid: false, errors };
  }

  const config = accountTypesConfig[accountType];
  if (!config.isCreatable) {
    errors.push(`Account type ${accountType} cannot be directly selected. It requires upgrade from another type.`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * Valider qu'une évolution est possible
 */
function validateUpgrade(currentType, requestedType, userAccount) {
  const errors = [];

  if (!currentType || !requestedType) {
    errors.push('Both currentType and requestedType are required');
    return { valid: false, errors };
  }

  if (!AccountTypes[currentType] || !AccountTypes[requestedType]) {
    errors.push('Invalid account type');
    return { valid: false, errors };
  }

  const currentConfig = accountTypesConfig[currentType];
  if (!currentConfig.canUpgradeTo.includes(requestedType)) {
    errors.push(`Cannot upgrade from ${currentType} to ${requestedType}`);
    return { valid: false, errors };
  }

  // Vérifier les règles d'évolution
  const upgradeRule = upgradeRules[currentType]?.[requestedType];
  if (!upgradeRule) {
    errors.push('No upgrade path defined');
    return { valid: false, errors };
  }

  // Vérifier la durée minimale dans le type actuel
  if (userAccount.selectedTypeAt) {
    const monthsInCurrentType = Math.floor(
      (new Date() - new Date(userAccount.selectedTypeAt)) / (1000 * 60 * 60 * 24 * 30)
    );

    if (monthsInCurrentType < upgradeRule.minimumMonthsAsCurrentType) {
      errors.push(
        `Minimum ${upgradeRule.minimumMonthsAsCurrentType} months required in current type. ` +
        `You have ${monthsInCurrentType} months.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    upgradeRule
  };
}

/**
 * Obtenir les options d'évolution disponibles pour un type
 */
function getUpgradeOptions(currentType, userAccount) {
  const config = accountTypesConfig[currentType];
  if (!config) {
    return [];
  }

  return config.canUpgradeTo.map(targetType => {
    const validation = validateUpgrade(currentType, targetType, userAccount);
    const targetConfig = accountTypesConfig[targetType];
    const rule = upgradeRules[currentType]?.[targetType];

    return {
      type: targetType,
      name: targetConfig.name,
      description: targetConfig.description,
      icon: targetConfig.icon,
      color: targetConfig.color,
      isAvailable: validation.valid,
      conditions: rule?.conditions || [],
      requiredDocuments: rule?.requiredDocuments || [],
      estimatedApprovalDays: rule?.approval?.estimatedDays || 0,
      requiresExternalApproval: rule?.approval?.requiresExternalApproval || false,
      approvalAuthority: rule?.approval?.approvalAuthority || null,
      validationErrors: validation.errors,
      pricing: targetConfig.pricing
    };
  });
}

module.exports = {
  AccountTypes,
  AccountStatus,
  accountTypesConfig,
  upgradeRules,
  userAccountSchema,
  validateInitialTypeSelection,
  validateUpgrade,
  getUpgradeOptions
};
