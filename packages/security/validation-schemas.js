/**
 * Validation Schemas - Joi
 * SYMPHONI.A - RT Technologie
 *
 * Schémas de validation pour tous les endpoints de l'API.
 * Basé sur Joi pour une validation robuste et des messages d'erreur clairs.
 *
 * @version 1.0.0
 * @security HIGH - Protection contre les injections et données malformées
 */

const Joi = require('joi');

// ============================================================================
// SCHÉMAS COMMUNS RÉUTILISABLES
// ============================================================================

const commonSchemas = {
  // Identifiants
  mongoId: Joi.string()
    .pattern(/^[a-f\d]{24}$/i)
    .messages({
      'string.pattern.base': 'Invalid ID format'
    }),

  uuid: Joi.string()
    .guid({ version: 'uuidv4' })
    .messages({
      'string.guid': 'Invalid UUID format'
    }),

  // Contact
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.email': 'Invalid email format',
      'string.max': 'Email must not exceed 255 characters'
    }),

  phone: Joi.string()
    .pattern(/^\+?[1-9]\d{1,14}$/)
    .messages({
      'string.pattern.base': 'Invalid phone number format (use international format: +33612345678)'
    }),

  // Sécurité
  password: Joi.string()
    .min(12)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=])[A-Za-z\d@$!%*?&#^()_\-+=]+$/)
    .messages({
      'string.min': 'Password must be at least 12 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),

  otp: Joi.string()
    .pattern(/^\d{6,8}$/)
    .messages({
      'string.pattern.base': 'OTP must be 6 to 8 digits'
    }),

  // Entreprise
  siret: Joi.string()
    .pattern(/^\d{14}$/)
    .messages({
      'string.pattern.base': 'SIRET must be exactly 14 digits'
    }),

  siren: Joi.string()
    .pattern(/^\d{9}$/)
    .messages({
      'string.pattern.base': 'SIREN must be exactly 9 digits'
    }),

  vatNumber: Joi.string()
    .pattern(/^FR\d{11}$/)
    .messages({
      'string.pattern.base': 'VAT number must be in format FRXXXXXXXXXXX'
    }),

  // Adresse
  postalCode: Joi.string()
    .pattern(/^\d{5}$/)
    .messages({
      'string.pattern.base': 'Postal code must be 5 digits'
    }),

  // Texte
  safeString: Joi.string()
    .max(1000)
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .trim(),

  companyName: Joi.string()
    .min(2)
    .max(200)
    .trim()
    .messages({
      'string.min': 'Company name must be at least 2 characters',
      'string.max': 'Company name must not exceed 200 characters'
    }),

  // Pagination
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20),

  // Dates
  isoDate: Joi.date()
    .iso()
    .messages({
      'date.format': 'Date must be in ISO 8601 format'
    })
};

// ============================================================================
// SCHÉMAS D'AUTHENTIFICATION
// ============================================================================

const authSchemas = {
  /**
   * POST /api/auth/register
   */
  register: Joi.object({
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    companyName: commonSchemas.companyName,
    role: Joi.string()
      .valid('carrier', 'industrial', 'logistician')
      .required()
      .messages({
        'any.only': 'Role must be one of: carrier, industrial, logistician'
      }),
    metadata: Joi.object().default({})
  }),

  /**
   * POST /api/auth/login
   */
  login: Joi.object({
    email: commonSchemas.email.required(),
    password: Joi.string().required().messages({
      'any.required': 'Password is required'
    })
  }),

  /**
   * POST /api/auth/refresh
   */
  refresh: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required'
    })
  }),

  /**
   * POST /api/auth/logout
   */
  logout: Joi.object({
    refreshToken: Joi.string().required()
  }),

  /**
   * PUT /api/auth/change-password
   */
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password.required()
  }).custom((value, helpers) => {
    if (value.currentPassword === value.newPassword) {
      return helpers.error('any.custom', { message: 'New password must be different from current password' });
    }
    return value;
  }),

  /**
   * POST /api/auth/send-otp
   */
  sendOtp: Joi.object({
    email: commonSchemas.email.required(),
    purpose: Joi.string()
      .valid('registration', 'password_reset', 'email_change', 'logisticien_onboarding', 'carrier_onboarding')
      .default('registration')
  }),

  /**
   * POST /api/auth/verify-otp
   */
  verifyOtp: Joi.object({
    email: commonSchemas.email.required(),
    otp: commonSchemas.otp.required(),
    purpose: Joi.string()
      .valid('registration', 'password_reset', 'email_change', 'logisticien_onboarding', 'carrier_onboarding')
      .default('registration')
  }),

  /**
   * POST /api/auth/reset-password
   */
  resetPassword: Joi.object({
    email: commonSchemas.email.required(),
    otp: commonSchemas.otp.required(),
    newPassword: commonSchemas.password.required()
  })
};

// ============================================================================
// SCHÉMAS TRANSPORTEURS (CARRIERS)
// ============================================================================

const carrierSchemas = {
  /**
   * POST /api/carriers/invite
   */
  invite: Joi.object({
    email: commonSchemas.email.required(),
    companyName: commonSchemas.companyName.required(),
    siret: commonSchemas.siret,
    phone: commonSchemas.phone,
    message: Joi.string().max(500).trim()
  }),

  /**
   * POST /api/carriers/:carrierId/onboard
   */
  onboard: Joi.object({
    legalInfo: Joi.object({
      siret: commonSchemas.siret.required(),
      siren: commonSchemas.siren.required(),
      vatNumber: commonSchemas.vatNumber,
      companyName: commonSchemas.companyName.required(),
      legalForm: Joi.string().max(50)
    }).required(),
    address: Joi.object({
      street: Joi.string().max(200).required(),
      city: Joi.string().max(100).required(),
      postalCode: commonSchemas.postalCode.required(),
      country: Joi.string().max(50).default('France')
    }).required(),
    contact: Joi.object({
      firstName: Joi.string().max(100).required(),
      lastName: Joi.string().max(100).required(),
      email: commonSchemas.email.required(),
      phone: commonSchemas.phone.required(),
      position: Joi.string().max(100)
    }).required(),
    fleet: Joi.object({
      vehicleCount: Joi.number().integer().min(1).max(10000),
      vehicleTypes: Joi.array().items(Joi.string().valid('van', 'truck', 'semi', 'container'))
    })
  }),

  /**
   * POST /api/carriers/:carrierId/documents
   */
  uploadDocument: Joi.object({
    type: Joi.string()
      .valid('kbis', 'insurance', 'license', 'urssaf', 'certification')
      .required(),
    expiryDate: commonSchemas.isoDate
  }),

  /**
   * POST /api/carriers/:carrierId/scoring
   */
  scoring: Joi.object({
    orderId: commonSchemas.mongoId.required(),
    scores: Joi.object({
      punctuality: Joi.number().min(1).max(5).required(),
      communication: Joi.number().min(1).max(5).required(),
      cargoCondition: Joi.number().min(1).max(5).required(),
      documentation: Joi.number().min(1).max(5).required()
    }).required(),
    comment: Joi.string().max(1000).trim()
  })
};

// ============================================================================
// SCHÉMAS LOGISTICIENS
// ============================================================================

const logisticianSchemas = {
  /**
   * POST /api/logisticians/invite
   */
  invite: Joi.object({
    email: commonSchemas.email.required(),
    companyName: commonSchemas.companyName.required(),
    siret: commonSchemas.siret,
    phone: commonSchemas.phone,
    warehouseCount: Joi.number().integer().min(1).max(100)
  }),

  /**
   * POST /api/logisticians/:id/onboarding/step1
   */
  onboardingStep1: Joi.object({
    email: commonSchemas.email.required(),
    password: commonSchemas.password.required(),
    acceptTerms: Joi.boolean().valid(true).required().messages({
      'any.only': 'You must accept the terms and conditions'
    })
  }),

  /**
   * POST /api/logisticians/:id/onboarding/step2
   */
  onboardingStep2: Joi.object({
    companyName: commonSchemas.companyName.required(),
    siret: commonSchemas.siret.required(),
    siren: commonSchemas.siren.required(),
    vatNumber: commonSchemas.vatNumber,
    address: Joi.object({
      street: Joi.string().max(200).required(),
      city: Joi.string().max(100).required(),
      postalCode: commonSchemas.postalCode.required(),
      country: Joi.string().default('France')
    }).required()
  }),

  /**
   * POST /api/logisticians/:id/warehouses
   */
  addWarehouse: Joi.object({
    name: Joi.string().max(200).required(),
    address: Joi.object({
      street: Joi.string().max(200).required(),
      city: Joi.string().max(100).required(),
      postalCode: commonSchemas.postalCode.required(),
      country: Joi.string().default('France'),
      coordinates: Joi.object({
        lat: Joi.number().min(-90).max(90),
        lng: Joi.number().min(-180).max(180)
      })
    }).required(),
    capacity: Joi.object({
      surface: Joi.number().min(0),
      volume: Joi.number().min(0),
      palletSpaces: Joi.number().integer().min(0)
    }),
    icpeRubriques: Joi.array().items(Joi.string()),
    certifications: Joi.array().items(Joi.string())
  }),

  /**
   * POST /api/logisticians/:id/icpe/declare-volumes
   */
  declareVolumes: Joi.object({
    warehouseId: commonSchemas.mongoId.required(),
    period: Joi.object({
      start: commonSchemas.isoDate.required(),
      end: commonSchemas.isoDate.required()
    }).required(),
    volumes: Joi.array().items(
      Joi.object({
        rubrique: Joi.string().required(),
        quantity: Joi.number().min(0).required(),
        unit: Joi.string().valid('kg', 'L', 'm3', 'tonnes').required()
      })
    ).min(1).required()
  })
};

// ============================================================================
// SCHÉMAS COMMANDES / TRANSPORT
// ============================================================================

const orderSchemas = {
  /**
   * POST /api/transport-orders/create
   */
  create: Joi.object({
    type: Joi.string()
      .valid('ftl', 'ltl', 'express', 'groupage')
      .required(),
    pickup: Joi.object({
      address: Joi.object({
        street: Joi.string().max(200).required(),
        city: Joi.string().max(100).required(),
        postalCode: commonSchemas.postalCode.required(),
        country: Joi.string().default('France')
      }).required(),
      date: commonSchemas.isoDate.required(),
      timeSlot: Joi.object({
        start: Joi.string().pattern(/^\d{2}:\d{2}$/),
        end: Joi.string().pattern(/^\d{2}:\d{2}$/)
      }),
      contact: Joi.object({
        name: Joi.string().max(200),
        phone: commonSchemas.phone,
        email: commonSchemas.email
      }),
      instructions: Joi.string().max(500)
    }).required(),
    delivery: Joi.object({
      address: Joi.object({
        street: Joi.string().max(200).required(),
        city: Joi.string().max(100).required(),
        postalCode: commonSchemas.postalCode.required(),
        country: Joi.string().default('France')
      }).required(),
      date: commonSchemas.isoDate.required(),
      timeSlot: Joi.object({
        start: Joi.string().pattern(/^\d{2}:\d{2}$/),
        end: Joi.string().pattern(/^\d{2}:\d{2}$/)
      }),
      contact: Joi.object({
        name: Joi.string().max(200),
        phone: commonSchemas.phone,
        email: commonSchemas.email
      }),
      instructions: Joi.string().max(500)
    }).required(),
    cargo: Joi.object({
      description: Joi.string().max(1000).required(),
      weight: Joi.number().min(0).max(100000),
      volume: Joi.number().min(0).max(1000),
      palletCount: Joi.number().integer().min(0).max(100),
      specialRequirements: Joi.array().items(
        Joi.string().valid('temperature_controlled', 'hazmat', 'fragile', 'oversized')
      )
    }).required(),
    reference: Joi.string().max(100)
  }),

  /**
   * GET /api/transport-orders (query params)
   */
  list: Joi.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    status: Joi.string().valid('pending', 'assigned', 'in_transit', 'delivered', 'cancelled'),
    dateFrom: commonSchemas.isoDate,
    dateTo: commonSchemas.isoDate,
    carrierId: commonSchemas.mongoId,
    search: Joi.string().max(100).trim()
  })
};

// ============================================================================
// SCHÉMAS CHATBOT / SUPPORT
// ============================================================================

const chatbotSchemas = {
  /**
   * POST /api/chatbot/conversations
   */
  createConversation: Joi.object({
    subject: Joi.string().max(200).trim(),
    category: Joi.string().valid('technical', 'billing', 'general', 'urgent'),
    initialMessage: Joi.string().max(2000).trim()
  }),

  /**
   * POST /api/chatbot/:conversationId/messages
   */
  sendMessage: Joi.object({
    content: Joi.string().max(2000).trim().required(),
    attachments: Joi.array().items(
      Joi.object({
        filename: Joi.string().max(255),
        url: Joi.string().uri(),
        mimeType: Joi.string().max(100)
      })
    ).max(5)
  }),

  /**
   * GET /api/chatbot/knowledge (query params)
   */
  searchKnowledge: Joi.object({
    q: Joi.string().max(200).trim().required(),
    category: Joi.string().max(50),
    limit: Joi.number().integer().min(1).max(50).default(10)
  })
};

// ============================================================================
// SCHÉMAS STRIPE / PAIEMENTS
// ============================================================================

const stripeSchemas = {
  /**
   * POST /api/stripe/create-checkout
   */
  createCheckout: Joi.object({
    planId: Joi.string().required(),
    billingCycle: Joi.string().valid('monthly', 'annual').default('monthly'),
    successUrl: Joi.string().uri(),
    cancelUrl: Joi.string().uri(),
    metadata: Joi.object()
  }),

  /**
   * POST /api/stripe/create-subscription
   */
  createSubscription: Joi.object({
    priceId: Joi.string().required(),
    paymentMethodId: Joi.string(),
    couponCode: Joi.string().max(50)
  })
};

// ============================================================================
// SCHÉMAS PARAMÈTRES URL
// ============================================================================

const paramSchemas = {
  /**
   * Paramètre :id MongoDB ObjectId
   */
  mongoIdParam: Joi.object({
    id: commonSchemas.mongoId.required()
  }),

  /**
   * Paramètre :carrierId
   */
  carrierIdParam: Joi.object({
    carrierId: commonSchemas.mongoId.required()
  }),

  /**
   * Paramètre :conversationId
   */
  conversationIdParam: Joi.object({
    conversationId: commonSchemas.mongoId.required()
  })
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Schémas communs
  commonSchemas,

  // Schémas par domaine
  authSchemas,
  carrierSchemas,
  logisticianSchemas,
  orderSchemas,
  chatbotSchemas,
  stripeSchemas,
  paramSchemas,

  // Export Joi pour extensions personnalisées
  Joi
};
