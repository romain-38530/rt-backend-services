// e-CMR Models - Conforme à la Convention CMR (1956) et Protocole e-CMR (2008)
// RT Backend Services - Version 1.0.0

// Types de contrat supportés
const ContractTypes = {
  ECMR: 'ECMR',
  TRANSPORT: 'TRANSPORT',
  SERVICE: 'SERVICE',
  NDA: 'NDA',
  CUSTOM: 'CUSTOM'
};

// Statuts de contrat
const ContractStatus = {
  DRAFT: 'DRAFT',
  PENDING_SIGNATURES: 'PENDING_SIGNATURES',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  SIGNED: 'SIGNED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

// Types de signature
const SignatureType = {
  SIMPLE: 'SIMPLE',
  ADVANCED: 'ADVANCED',
  QUALIFIED: 'QUALIFIED'
};

// Rôles des parties
const PartyRole = {
  SENDER: 'SENDER',
  CARRIER: 'CARRIER',
  CONSIGNEE: 'CONSIGNEE',
  SUBCONTRACTOR: 'SUBCONTRACTOR'
};

// Modèle e-CMR complet selon Convention CMR
const eCMRSchema = {
  // Informations générales
  type: 'ECMR',
  status: 'DRAFT',
  cmrNumber: '', // Numéro unique e-CMR (généré automatiquement)

  // 1. EXPÉDITEUR (Sender) - Article 6.1.a CMR
  sender: {
    type: 'COMPANY', // ou 'INDIVIDUAL'
    name: { required: true, type: 'string' },
    address: {
      street: { required: true, type: 'string' },
      postalCode: { required: true, type: 'string' },
      city: { required: true, type: 'string' },
      country: { required: true, type: 'string' }
    },
    contact: {
      phone: { required: true, type: 'string' },
      email: { required: true, type: 'string' }
    },
    vatNumber: { required: false, type: 'string' },
    siret: { required: false, type: 'string' }
  },

  // 2. DESTINATAIRE (Consignee) - Article 6.1.b CMR
  consignee: {
    type: 'COMPANY',
    name: { required: true, type: 'string' },
    address: {
      street: { required: true, type: 'string' },
      postalCode: { required: true, type: 'string' },
      city: { required: true, type: 'string' },
      country: { required: true, type: 'string' }
    },
    contact: {
      phone: { required: true, type: 'string' },
      email: { required: true, type: 'string' }
    },
    vatNumber: { required: false, type: 'string' }
  },

  // 3. TRANSPORTEUR (Carrier) - Article 6.1.c CMR
  carrier: {
    type: 'COMPANY',
    name: { required: true, type: 'string' },
    address: {
      street: { required: true, type: 'string' },
      postalCode: { required: true, type: 'string' },
      city: { required: true, type: 'string' },
      country: { required: true, type: 'string' }
    },
    contact: {
      phone: { required: true, type: 'string' },
      email: { required: true, type: 'string' }
    },
    licenseNumber: { required: true, type: 'string' }, // Numéro de licence transport
    vatNumber: { required: false, type: 'string' },

    // Informations véhicule
    vehicle: {
      registrationNumber: { required: true, type: 'string' },
      type: { required: false, type: 'string' }, // Ex: "Camion 20T", "Semi-remorque"
      trailerRegistration: { required: false, type: 'string' }
    },

    // Informations conducteur
    driver: {
      name: { required: true, type: 'string' },
      licenseNumber: { required: true, type: 'string' },
      phone: { required: true, type: 'string' }
    }
  },

  // 4. LIEUX DE CHARGEMENT ET LIVRAISON - Article 6.1.d CMR
  places: {
    // Lieu de prise en charge
    loading: {
      address: {
        street: { required: true, type: 'string' },
        postalCode: { required: true, type: 'string' },
        city: { required: true, type: 'string' },
        country: { required: true, type: 'string' }
      },
      coordinates: {
        latitude: { required: false, type: 'number' },
        longitude: { required: false, type: 'number' }
      },
      date: { required: true, type: 'date' },
      contactPerson: { required: false, type: 'string' },
      contactPhone: { required: false, type: 'string' }
    },

    // Lieu de livraison
    delivery: {
      address: {
        street: { required: true, type: 'string' },
        postalCode: { required: true, type: 'string' },
        city: { required: true, type: 'string' },
        country: { required: true, type: 'string' }
      },
      coordinates: {
        latitude: { required: false, type: 'number' },
        longitude: { required: false, type: 'number' }
      },
      date: { required: true, type: 'date' },
      contactPerson: { required: false, type: 'string' },
      contactPhone: { required: false, type: 'string' }
    }
  },

  // 5. MARCHANDISES - Article 6.1.e CMR
  goods: {
    // Description générale
    description: { required: true, type: 'string' },

    // Poids et dimensions
    weight: {
      gross: { required: true, type: 'number', unit: 'kg' }, // Poids brut
      net: { required: false, type: 'number', unit: 'kg' }, // Poids net
      volume: { required: false, type: 'number', unit: 'm3' }
    },

    // Conditionnement
    packages: {
      count: { required: true, type: 'number' }, // Nombre de colis
      type: { required: true, type: 'string' }, // Ex: "Palettes", "Cartons", "Vrac"
      marks: { required: false, type: 'string' }, // Marques et numéros
      packaging: { required: false, type: 'string' } // Type d'emballage
    },

    // Classification
    classification: {
      hsCode: { required: false, type: 'string' }, // Code HS (nomenclature douanière)
      isFragile: { required: false, type: 'boolean' },
      isPerishable: { required: false, type: 'boolean' },
      requiresColdChain: { required: false, type: 'boolean' },
      temperatureRange: { required: false, type: 'string' } // Ex: "2-8°C"
    },

    // Marchandises dangereuses - Article 6.1.f CMR
    dangerousGoods: {
      isDangerous: { required: true, type: 'boolean' },
      unNumber: { required: false, type: 'string' }, // Numéro ONU
      class: { required: false, type: 'string' }, // Classe ADR
      packingGroup: { required: false, type: 'string' }, // Groupe d'emballage
      properShippingName: { required: false, type: 'string' }
    },

    // Valeur (pour assurance)
    value: {
      amount: { required: false, type: 'number' },
      currency: { required: false, type: 'string', default: 'EUR' }
    },

    // Photos de la marchandise
    photos: {
      loading: { required: false, type: 'array' }, // Photos au chargement
      delivery: { required: false, type: 'array' } // Photos à la livraison
    }
  },

  // 6. DOCUMENTS ANNEXÉS - Article 6.1.g CMR
  attachedDocuments: {
    customsDocuments: { required: false, type: 'array' },
    deliveryNotes: { required: false, type: 'array' },
    invoices: { required: false, type: 'array' },
    certificates: { required: false, type: 'array' },
    other: { required: false, type: 'array' }
  },

  // 7. INSTRUCTIONS SPÉCIALES - Article 6.1.h CMR
  instructions: {
    // Instructions de transport
    specialInstructions: { required: false, type: 'string' },
    deliveryInstructions: { required: false, type: 'string' },

    // Conditions de paiement
    paymentTerms: {
      method: { required: true, type: 'string' }, // Ex: "Port payé", "Port dû"
      amount: { required: false, type: 'number' },
      currency: { required: false, type: 'string', default: 'EUR' },
      paymentBy: { required: true, type: 'string' } // 'SENDER' ou 'CONSIGNEE'
    },

    // Formalités douanières
    customs: {
      required: { required: false, type: 'boolean' },
      exportDeclaration: { required: false, type: 'string' },
      importDeclaration: { required: false, type: 'string' }
    }
  },

  // 8. RÉSERVES ET OBSERVATIONS - Article 9 CMR
  remarks: {
    // Réserves à l'enlèvement
    loadingRemarks: {
      hasRemarks: { required: false, type: 'boolean', default: false },
      description: { required: false, type: 'string' },
      photos: { required: false, type: 'array' },
      reportedBy: { required: false, type: 'string' },
      reportedAt: { required: false, type: 'date' }
    },

    // Réserves à la livraison
    deliveryRemarks: {
      hasRemarks: { required: false, type: 'boolean', default: false },
      description: { required: false, type: 'string' },
      photos: { required: false, type: 'array' },
      reportedBy: { required: false, type: 'string' },
      reportedAt: { required: false, type: 'date' }
    }
  },

  // 9. SIGNATURES - Article 4 Protocole e-CMR
  signatures: {
    // Signature expéditeur
    sender: {
      required: true,
      status: 'PENDING',
      signatureId: null,
      signedAt: null,
      signedBy: null,
      ipAddress: null,
      geolocation: null,
      signatureType: 'SIMPLE', // SIMPLE, ADVANCED, QUALIFIED
      certificateId: null // Pour signature qualifiée (Yousign)
    },

    // Signature transporteur (prise en charge)
    carrierPickup: {
      required: true,
      status: 'PENDING',
      signatureId: null,
      signedAt: null,
      signedBy: null,
      ipAddress: null,
      geolocation: null,
      signatureType: 'SIMPLE',
      certificateId: null
    },

    // Signature destinataire (livraison)
    consignee: {
      required: true,
      status: 'PENDING',
      signatureId: null,
      signedAt: null,
      signedBy: null,
      ipAddress: null,
      geolocation: null,
      signatureType: 'SIMPLE',
      certificateId: null
    }
  },

  // 10. SUIVI GPS (optionnel mais recommandé)
  tracking: {
    enabled: { required: false, type: 'boolean', default: false },
    positions: { required: false, type: 'array' }, // Historique des positions GPS
    lastPosition: {
      latitude: { required: false, type: 'number' },
      longitude: { required: false, type: 'number' },
      timestamp: { required: false, type: 'date' }
    }
  },

  // Métadonnées
  metadata: {
    createdAt: { required: true, type: 'date' },
    createdBy: { required: true, type: 'string' },
    updatedAt: { required: true, type: 'date' },
    version: { required: true, type: 'number', default: 1 },

    // Archivage
    archived: { required: false, type: 'boolean', default: false },
    archiveId: { required: false, type: 'string' },
    archivedAt: { required: false, type: 'date' },

    // PDF généré
    pdfGenerated: { required: false, type: 'boolean', default: false },
    pdfUrl: { required: false, type: 'string' },
    pdfHash: { required: false, type: 'string' }, // SHA-256 du PDF

    // QR Code de vérification
    qrCode: { required: false, type: 'string' },
    verificationUrl: { required: false, type: 'string' }
  }
};

// Fonction de validation des champs obligatoires
function validateECMR(ecmrData) {
  const errors = [];

  // Validation expéditeur
  if (!ecmrData.sender?.name) errors.push('sender.name is required');
  if (!ecmrData.sender?.address?.street) errors.push('sender.address.street is required');
  if (!ecmrData.sender?.address?.city) errors.push('sender.address.city is required');
  if (!ecmrData.sender?.address?.country) errors.push('sender.address.country is required');
  if (!ecmrData.sender?.contact?.phone) errors.push('sender.contact.phone is required');
  if (!ecmrData.sender?.contact?.email) errors.push('sender.contact.email is required');

  // Validation destinataire
  if (!ecmrData.consignee?.name) errors.push('consignee.name is required');
  if (!ecmrData.consignee?.address?.street) errors.push('consignee.address.street is required');
  if (!ecmrData.consignee?.address?.city) errors.push('consignee.address.city is required');
  if (!ecmrData.consignee?.address?.country) errors.push('consignee.address.country is required');

  // Validation transporteur
  if (!ecmrData.carrier?.name) errors.push('carrier.name is required');
  if (!ecmrData.carrier?.licenseNumber) errors.push('carrier.licenseNumber is required');
  if (!ecmrData.carrier?.vehicle?.registrationNumber) errors.push('carrier.vehicle.registrationNumber is required');
  if (!ecmrData.carrier?.driver?.name) errors.push('carrier.driver.name is required');
  if (!ecmrData.carrier?.driver?.licenseNumber) errors.push('carrier.driver.licenseNumber is required');

  // Validation lieux
  if (!ecmrData.places?.loading?.date) errors.push('places.loading.date is required');
  if (!ecmrData.places?.delivery?.date) errors.push('places.delivery.date is required');

  // Validation marchandises
  if (!ecmrData.goods?.description) errors.push('goods.description is required');
  if (!ecmrData.goods?.weight?.gross) errors.push('goods.weight.gross is required');
  if (!ecmrData.goods?.packages?.count) errors.push('goods.packages.count is required');
  if (!ecmrData.goods?.packages?.type) errors.push('goods.packages.type is required');

  // Validation paiement
  if (!ecmrData.instructions?.paymentTerms?.method) errors.push('instructions.paymentTerms.method is required');
  if (!ecmrData.instructions?.paymentTerms?.paymentBy) errors.push('instructions.paymentTerms.paymentBy is required');

  return {
    valid: errors.length === 0,
    errors
  };
}

// Fonction pour générer un numéro e-CMR unique
function generateCMRNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `ECMR-${timestamp}-${random}`;
}

// Fonction pour créer un e-CMR vide avec valeurs par défaut
function createEmptyECMR(createdBy) {
  const now = new Date();

  return {
    type: 'ECMR',
    status: 'DRAFT',
    cmrNumber: generateCMRNumber(),

    sender: { address: {}, contact: {} },
    consignee: { address: {}, contact: {} },
    carrier: { address: {}, contact: {}, vehicle: {}, driver: {} },
    places: { loading: { address: {} }, delivery: { address: {} } },
    goods: { weight: {}, packages: {}, classification: {}, dangerousGoods: { isDangerous: false }, value: {} },
    attachedDocuments: {},
    instructions: { paymentTerms: { currency: 'EUR' }, customs: {} },
    remarks: { loadingRemarks: { hasRemarks: false }, deliveryRemarks: { hasRemarks: false } },

    signatures: {
      sender: { required: true, status: 'PENDING', signatureType: 'SIMPLE' },
      carrierPickup: { required: true, status: 'PENDING', signatureType: 'SIMPLE' },
      consignee: { required: true, status: 'PENDING', signatureType: 'SIMPLE' }
    },

    tracking: { enabled: false, positions: [] },

    metadata: {
      createdAt: now,
      createdBy,
      updatedAt: now,
      version: 1,
      archived: false,
      pdfGenerated: false
    }
  };
}

module.exports = {
  ContractTypes,
  ContractStatus,
  SignatureType,
  PartyRole,
  eCMRSchema,
  validateECMR,
  generateCMRNumber,
  createEmptyECMR
};
