/**
 * Error Handler - Gestion Centralisée des Erreurs
 * SYMPHONI.A - RT Technologie
 *
 * Système centralisé de gestion des erreurs:
 * - Classes d'erreurs typées
 * - Middleware Express
 * - Logging structuré
 * - Réponses standardisées
 *
 * @version 1.0.0
 */

const { ObjectId } = require('mongodb');

// ============================================
// CODES D'ERREUR
// ============================================

const ErrorCodes = {
  // Erreurs d'authentification (1xxx)
  AUTH_INVALID_CREDENTIALS: 'AUTH_001',
  AUTH_TOKEN_EXPIRED: 'AUTH_002',
  AUTH_TOKEN_INVALID: 'AUTH_003',
  AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_004',
  AUTH_ACCOUNT_DISABLED: 'AUTH_005',
  AUTH_2FA_REQUIRED: 'AUTH_006',
  AUTH_2FA_INVALID: 'AUTH_007',
  AUTH_SESSION_EXPIRED: 'AUTH_008',

  // Erreurs de validation (2xxx)
  VALIDATION_FAILED: 'VAL_001',
  VALIDATION_MISSING_FIELD: 'VAL_002',
  VALIDATION_INVALID_FORMAT: 'VAL_003',
  VALIDATION_OUT_OF_RANGE: 'VAL_004',
  VALIDATION_DUPLICATE: 'VAL_005',

  // Erreurs de ressource (3xxx)
  RESOURCE_NOT_FOUND: 'RES_001',
  RESOURCE_ALREADY_EXISTS: 'RES_002',
  RESOURCE_DELETED: 'RES_003',
  RESOURCE_LOCKED: 'RES_004',
  RESOURCE_CONFLICT: 'RES_005',

  // Erreurs de rate limiting (4xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_001',
  RATE_LIMIT_IP_BLOCKED: 'RATE_002',
  RATE_LIMIT_USER_BLOCKED: 'RATE_003',

  // Erreurs de service (5xxx)
  SERVICE_UNAVAILABLE: 'SVC_001',
  SERVICE_TIMEOUT: 'SVC_002',
  SERVICE_DEPENDENCY_FAILED: 'SVC_003',
  SERVICE_MAINTENANCE: 'SVC_004',

  // Erreurs de base de données (6xxx)
  DATABASE_CONNECTION_FAILED: 'DB_001',
  DATABASE_QUERY_FAILED: 'DB_002',
  DATABASE_TRANSACTION_FAILED: 'DB_003',
  DATABASE_INTEGRITY_ERROR: 'DB_004',

  // Erreurs de paiement (7xxx)
  PAYMENT_FAILED: 'PAY_001',
  PAYMENT_INSUFFICIENT_FUNDS: 'PAY_002',
  PAYMENT_CARD_DECLINED: 'PAY_003',
  PAYMENT_SUBSCRIPTION_EXPIRED: 'PAY_004',

  // Erreurs métier (8xxx)
  BUSINESS_RULE_VIOLATION: 'BIZ_001',
  BUSINESS_QUOTA_EXCEEDED: 'BIZ_002',
  BUSINESS_FEATURE_DISABLED: 'BIZ_003',
  BUSINESS_SUBSCRIPTION_REQUIRED: 'BIZ_004',

  // Erreurs internes (9xxx)
  INTERNAL_ERROR: 'INT_001',
  INTERNAL_CONFIGURATION_ERROR: 'INT_002',
  INTERNAL_ASSERTION_FAILED: 'INT_003'
};

// Mapping code -> HTTP status
const ErrorStatusMap = {
  // Auth errors -> 401/403
  AUTH_001: 401, AUTH_002: 401, AUTH_003: 401,
  AUTH_004: 403, AUTH_005: 403, AUTH_006: 403,
  AUTH_007: 401, AUTH_008: 401,

  // Validation errors -> 400
  VAL_001: 400, VAL_002: 400, VAL_003: 400,
  VAL_004: 400, VAL_005: 409,

  // Resource errors -> 404/409
  RES_001: 404, RES_002: 409, RES_003: 410,
  RES_004: 423, RES_005: 409,

  // Rate limit -> 429
  RATE_001: 429, RATE_002: 429, RATE_003: 429,

  // Service errors -> 503
  SVC_001: 503, SVC_002: 504, SVC_003: 502, SVC_004: 503,

  // Database errors -> 500
  DB_001: 503, DB_002: 500, DB_003: 500, DB_004: 500,

  // Payment errors -> 402
  PAY_001: 402, PAY_002: 402, PAY_003: 402, PAY_004: 402,

  // Business errors -> 400/403
  BIZ_001: 400, BIZ_002: 403, BIZ_003: 403, BIZ_004: 403,

  // Internal errors -> 500
  INT_001: 500, INT_002: 500, INT_003: 500
};

// ============================================
// CLASSES D'ERREURS
// ============================================

/**
 * Classe de base pour les erreurs applicatives
 */
class AppError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = ErrorStatusMap[code] || 500;
    this.details = details;
    this.timestamp = new Date();
    this.isOperational = true; // Erreur attendue (vs erreur de programmation)

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

/**
 * Erreur d'authentification
 */
class AuthenticationError extends AppError {
  constructor(code = ErrorCodes.AUTH_INVALID_CREDENTIALS, message = 'Authentication failed', details = {}) {
    super(code, message, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Erreur de validation
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', fields = []) {
    super(ErrorCodes.VALIDATION_FAILED, message, { fields });
    this.name = 'ValidationError';
    this.fields = fields;
  }

  static fromJoi(joiError) {
    const fields = joiError.details.map(d => ({
      field: d.path.join('.'),
      message: d.message,
      type: d.type
    }));
    return new ValidationError('Validation failed', fields);
  }
}

/**
 * Erreur de ressource non trouvée
 */
class NotFoundError extends AppError {
  constructor(resourceType, resourceId = null) {
    const message = resourceId
      ? `${resourceType} with id '${resourceId}' not found`
      : `${resourceType} not found`;
    super(ErrorCodes.RESOURCE_NOT_FOUND, message, { resourceType, resourceId });
    this.name = 'NotFoundError';
  }
}

/**
 * Erreur de conflit
 */
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details = {}) {
    super(ErrorCodes.RESOURCE_CONFLICT, message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Erreur de rate limiting
 */
class RateLimitError extends AppError {
  constructor(retryAfter = 60, message = 'Rate limit exceeded') {
    super(ErrorCodes.RATE_LIMIT_EXCEEDED, message, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Erreur de service externe
 */
class ServiceError extends AppError {
  constructor(serviceName, originalError = null) {
    const message = `Service '${serviceName}' is unavailable`;
    super(ErrorCodes.SERVICE_UNAVAILABLE, message, {
      service: serviceName,
      originalError: originalError?.message
    });
    this.name = 'ServiceError';
    this.service = serviceName;
  }
}

/**
 * Erreur métier
 */
class BusinessError extends AppError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'BusinessError';
  }
}

/**
 * Erreur de base de données
 */
class DatabaseError extends AppError {
  constructor(operation, originalError = null) {
    const message = `Database operation '${operation}' failed`;
    super(ErrorCodes.DATABASE_QUERY_FAILED, message, {
      operation,
      originalError: originalError?.message
    });
    this.name = 'DatabaseError';
  }
}

// ============================================
// MIDDLEWARE EXPRESS
// ============================================

/**
 * Créer le middleware de gestion des erreurs
 * @param {Object} options - Options de configuration
 * @returns {Function} Middleware Express
 */
function createErrorHandler(options = {}) {
  const {
    logger = console,
    includeStack = process.env.NODE_ENV !== 'production',
    logErrors = true,
    mongoClient = null
  } = options;

  /**
   * Middleware de gestion des erreurs
   */
  return async function errorHandler(err, req, res, next) {
    // Éviter les doubles réponses
    if (res.headersSent) {
      return next(err);
    }

    // Normaliser l'erreur
    const error = normalizeError(err);

    // Logger l'erreur
    if (logErrors) {
      logError(logger, error, req);
    }

    // Enregistrer en base si MongoDB disponible
    if (mongoClient) {
      await recordError(mongoClient, error, req).catch(e => {
        logger.error('[ErrorHandler] Failed to record error:', e.message);
      });
    }

    // Construire la réponse
    const response = buildErrorResponse(error, includeStack);

    // Headers additionnels
    if (error.retryAfter) {
      res.set('Retry-After', error.retryAfter);
    }

    // Envoyer la réponse
    res.status(error.statusCode).json(response);
  };
}

/**
 * Normaliser une erreur en AppError
 */
function normalizeError(err) {
  // Déjà une AppError
  if (err instanceof AppError) {
    return err;
  }

  // Erreur Mongoose/MongoDB
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      return new ConflictError('Duplicate key error', { keys: err.keyValue });
    }
    return new DatabaseError('query', err);
  }

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
      type: e.kind
    }));
    return new ValidationError('Validation failed', fields);
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return new AuthenticationError(ErrorCodes.AUTH_TOKEN_INVALID, 'Invalid token');
  }
  if (err.name === 'TokenExpiredError') {
    return new AuthenticationError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired');
  }

  // Erreur de syntaxe JSON
  if (err instanceof SyntaxError && err.status === 400) {
    return new ValidationError('Invalid JSON', [{ field: 'body', message: 'Malformed JSON' }]);
  }

  // Erreur inconnue -> erreur interne
  const appError = new AppError(
    ErrorCodes.INTERNAL_ERROR,
    process.env.NODE_ENV === 'production' ? 'An internal error occurred' : err.message
  );
  appError.originalError = err;
  appError.stack = err.stack;
  appError.isOperational = false;

  return appError;
}

/**
 * Logger l'erreur
 */
function logError(logger, error, req) {
  const logData = {
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    path: req?.path,
    method: req?.method,
    ip: req?.ip,
    userId: req?.user?.userId || req?.user?.id,
    requestId: req?.requestId,
    timestamp: new Date().toISOString()
  };

  // Erreurs non opérationnelles (bugs) -> niveau error
  if (!error.isOperational) {
    logger.error('[ERROR] Unexpected error:', {
      ...logData,
      stack: error.stack,
      originalError: error.originalError?.stack
    });
  }
  // Erreurs serveur -> niveau error
  else if (error.statusCode >= 500) {
    logger.error('[ERROR] Server error:', logData);
  }
  // Erreurs client -> niveau warn
  else if (error.statusCode >= 400) {
    logger.warn('[WARN] Client error:', logData);
  }
}

/**
 * Enregistrer l'erreur en base
 */
async function recordError(mongoClient, error, req) {
  const db = mongoClient.db();
  const collection = db.collection('error_logs');

  await collection.insertOne({
    _id: new ObjectId(),
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    details: error.details,
    isOperational: error.isOperational,
    request: {
      method: req?.method,
      path: req?.path,
      query: req?.query,
      ip: req?.ip,
      userAgent: req?.get?.('User-Agent'),
      userId: req?.user?.userId || req?.user?.id
    },
    stack: error.stack,
    timestamp: new Date()
  });
}

/**
 * Construire la réponse d'erreur
 */
function buildErrorResponse(error, includeStack) {
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message
    }
  };

  // Ajouter les détails si présents
  if (error.details && Object.keys(error.details).length > 0) {
    response.error.details = error.details;
  }

  // Ajouter les champs de validation
  if (error.fields) {
    response.error.fields = error.fields;
  }

  // Ajouter le retry-after pour rate limiting
  if (error.retryAfter) {
    response.error.retryAfter = error.retryAfter;
  }

  // Ajouter la stack en dev
  if (includeStack && error.stack) {
    response.error.stack = error.stack.split('\n').slice(0, 5);
  }

  return response;
}

// ============================================
// MIDDLEWARE 404
// ============================================

/**
 * Middleware pour les routes non trouvées
 */
function notFoundHandler(req, res) {
  const error = new NotFoundError('Route', req.path);
  res.status(404).json(error.toJSON());
}

// ============================================
// ASYNC WRAPPER
// ============================================

/**
 * Wrapper pour les handlers async
 * Capture automatiquement les erreurs et les passe au middleware
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wrapper pour les fonctions de service
 */
function wrapService(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, error.message);
    }
  };
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Créer une erreur à partir d'un code
 */
function createError(code, message, details = {}) {
  return new AppError(code, message, details);
}

/**
 * Vérifier si une erreur est opérationnelle
 */
function isOperationalError(error) {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Handler pour les erreurs non capturées (process)
 */
function setupGlobalErrorHandlers(logger = console) {
  process.on('uncaughtException', (error) => {
    logger.error('[FATAL] Uncaught Exception:', error);
    // Laisser le processus se terminer pour forcer un redémarrage
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
    // Lancer une exception pour déclencher uncaughtException
    throw reason;
  });
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Codes
  ErrorCodes,
  ErrorStatusMap,

  // Classes
  AppError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceError,
  BusinessError,
  DatabaseError,

  // Middleware
  createErrorHandler,
  notFoundHandler,

  // Wrappers
  asyncHandler,
  wrapService,

  // Utilitaires
  createError,
  normalizeError,
  isOperationalError,
  setupGlobalErrorHandlers
};
