/**
 * Validation Middleware
 * SYMPHONI.A - RT Technologie
 *
 * Middleware Express pour la validation des entrées avec Joi.
 * Inclut également des fonctions de sanitisation pour MongoDB.
 *
 * @version 1.0.0
 * @security HIGH - Protection contre les injections
 */

const Joi = require('joi');

// ============================================================================
// MIDDLEWARE DE VALIDATION JOI
// ============================================================================

/**
 * Options par défaut pour la validation Joi
 */
const DEFAULT_JOI_OPTIONS = {
  abortEarly: false,        // Retourner toutes les erreurs, pas seulement la première
  stripUnknown: true,       // Supprimer les champs non définis dans le schéma
  convert: true,            // Convertir les types (string -> number, etc.)
  presence: 'optional'      // Par défaut les champs sont optionnels
};

/**
 * Crée un middleware de validation Joi
 *
 * @param {Joi.Schema} schema - Schéma Joi à utiliser
 * @param {string} property - Propriété de la requête à valider ('body', 'query', 'params')
 * @param {Object} options - Options Joi supplémentaires
 * @returns {Function} Middleware Express
 *
 * @example
 * router.post('/register',
 *   validate(authSchemas.register),
 *   async (req, res) => { ... }
 * );
 */
function validate(schema, property = 'body', options = {}) {
  const joiOptions = { ...DEFAULT_JOI_OPTIONS, ...options };

  return (req, res, next) => {
    const dataToValidate = req[property];

    const { error, value } = schema.validate(dataToValidate, joiOptions);

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, "'"),
        type: detail.type
      }));

      // Logger pour monitoring (sans données sensibles)
      console.warn('[Validation] Failed:', {
        path: req.path,
        method: req.method,
        property,
        errorCount: errors.length,
        fields: errors.map(e => e.field)
      });

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors
        }
      });
    }

    // Remplacer par les données validées et sanitisées
    req[property] = value;
    next();
  };
}

/**
 * Middleware pour valider les paramètres URL
 */
function validateParams(schema) {
  return validate(schema, 'params');
}

/**
 * Middleware pour valider les query strings
 */
function validateQuery(schema) {
  return validate(schema, 'query');
}

/**
 * Middleware pour valider le body
 */
function validateBody(schema) {
  return validate(schema, 'body');
}

// ============================================================================
// SANITISATION MONGODB
// ============================================================================

/**
 * Caractères spéciaux regex à échapper
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Échappe les caractères spéciaux pour une utilisation sûre dans MongoDB $regex
 *
 * @param {string} str - Chaîne à échapper
 * @returns {string} Chaîne échappée
 *
 * @example
 * const safeQuery = escapeRegex(userInput);
 * db.collection.find({ title: { $regex: safeQuery, $options: 'i' } });
 */
function escapeRegex(str) {
  if (typeof str !== 'string') {
    return '';
  }
  return str.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

/**
 * Opérateurs MongoDB autorisés dans les requêtes
 */
const ALLOWED_MONGO_OPERATORS = new Set([
  '$and', '$or', '$nor', '$not',
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte',
  '$in', '$nin',
  '$exists', '$type',
  '$elemMatch',
  '$size',
  '$all'
]);

/**
 * Opérateurs MongoDB dangereux à bloquer
 */
const DANGEROUS_MONGO_OPERATORS = new Set([
  '$where',      // Exécution JavaScript
  '$function',   // Exécution JavaScript
  '$accumulator', // Exécution JavaScript
  '$expr',       // Peut être utilisé pour bypass
  '$jsonSchema', // Peut causer des DoS
  '$text',       // Utiliser avec précaution (indexé)
  '$regex'       // Utiliser escapeRegex() à la place
]);

/**
 * Sanitise un objet de requête MongoDB pour prévenir les injections NoSQL
 *
 * @param {Object} query - Objet de requête MongoDB
 * @param {Object} options - Options de sanitisation
 * @param {boolean} options.allowRegex - Autoriser $regex (défaut: false)
 * @param {boolean} options.allowText - Autoriser $text (défaut: false)
 * @returns {Object} Requête sanitisée
 *
 * @example
 * const safeQuery = sanitizeMongoQuery(req.body.filter);
 * const results = await collection.find(safeQuery).toArray();
 */
function sanitizeMongoQuery(query, options = {}) {
  const { allowRegex = false, allowText = false } = options;

  if (query === null || query === undefined) {
    return {};
  }

  if (typeof query !== 'object') {
    return query;
  }

  if (Array.isArray(query)) {
    return query.map(item => sanitizeMongoQuery(item, options));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(query)) {
    // Vérifier les opérateurs dangereux
    if (key.startsWith('$')) {
      // Bloquer les opérateurs dangereux
      if (DANGEROUS_MONGO_OPERATORS.has(key)) {
        if (key === '$regex' && allowRegex) {
          // Autoriser $regex si explicitement permis, mais échapper la valeur
          sanitized[key] = typeof value === 'string' ? escapeRegex(value) : value;
          continue;
        }
        if (key === '$text' && allowText) {
          sanitized[key] = value;
          continue;
        }

        console.warn('[Security] Blocked dangerous MongoDB operator:', key);
        continue; // Ignorer l'opérateur dangereux
      }

      // Autoriser les opérateurs sûrs
      if (ALLOWED_MONGO_OPERATORS.has(key)) {
        sanitized[key] = sanitizeMongoQuery(value, options);
        continue;
      }

      // Opérateur inconnu - bloquer par précaution
      console.warn('[Security] Blocked unknown MongoDB operator:', key);
      continue;
    }

    // Clé normale - récursion si c'est un objet
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMongoQuery(value, options);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitise une valeur pour éviter les injections dans les clés MongoDB
 * Bloque les clés commençant par $ ou contenant des points
 *
 * @param {Object} obj - Objet à sanitiser
 * @returns {Object} Objet sanitisé
 */
function sanitizeMongoDocument(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeMongoDocument(item));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    // Bloquer les clés commençant par $
    if (key.startsWith('$')) {
      console.warn('[Security] Blocked key starting with $:', key);
      continue;
    }

    // Bloquer les clés contenant des points (path traversal)
    if (key.includes('.')) {
      console.warn('[Security] Blocked key containing dot:', key);
      continue;
    }

    // Récursion pour les objets imbriqués
    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMongoDocument(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// SANITISATION XSS
// ============================================================================

/**
 * Patterns dangereux à supprimer pour prévenir XSS
 */
const XSS_PATTERNS = [
  /<script[^>]*>[\s\S]*?<\/script>/gi,
  /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
  /<object[^>]*>[\s\S]*?<\/object>/gi,
  /<embed[^>]*>[\s\S]*?<\/embed>/gi,
  /<link[^>]*>/gi,
  /javascript:/gi,
  /vbscript:/gi,
  /data:text\/html/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /on\w+\s*=\s*[^\s>]+/gi
];

/**
 * Sanitise une chaîne pour prévenir les attaques XSS
 *
 * @param {string} str - Chaîne à sanitiser
 * @returns {string} Chaîne sanitisée
 */
function sanitizeXSS(str) {
  if (typeof str !== 'string') {
    return str;
  }

  let result = str;
  for (const pattern of XSS_PATTERNS) {
    result = result.replace(pattern, '');
  }

  return result.trim();
}

/**
 * Sanitise récursivement un objet pour prévenir XSS
 *
 * @param {any} obj - Objet à sanitiser
 * @returns {any} Objet sanitisé
 */
function sanitizeObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeXSS(obj);
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    sanitized[key] = sanitizeObject(value);
  }

  return sanitized;
}

/**
 * Middleware Express pour sanitiser automatiquement body et query
 */
function sanitizeInputMiddleware(req, res, next) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
}

// ============================================================================
// UTILITAIRES
// ============================================================================

/**
 * Crée une erreur de validation formatée
 *
 * @param {string} field - Champ en erreur
 * @param {string} message - Message d'erreur
 * @returns {Object} Objet d'erreur formaté
 */
function createValidationError(field, message) {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [{ field, message, type: 'custom' }]
    }
  };
}

/**
 * Vérifie si une chaîne contient des patterns d'injection potentiels
 *
 * @param {string} str - Chaîne à vérifier
 * @returns {boolean} True si des patterns suspects sont détectés
 */
function containsInjectionPatterns(str) {
  if (typeof str !== 'string') {
    return false;
  }

  const suspiciousPatterns = [
    /\$where/i,
    /\$function/i,
    /\$accumulator/i,
    /<script/i,
    /javascript:/i,
    /\{\s*\$\w+/,  // MongoDB operators in JSON
    /'\s*;\s*--/,  // SQL injection
    /union\s+select/i,
    /exec\s*\(/i
  ];

  return suspiciousPatterns.some(pattern => pattern.test(str));
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Middleware de validation
  validate,
  validateBody,
  validateParams,
  validateQuery,

  // Sanitisation MongoDB
  escapeRegex,
  sanitizeMongoQuery,
  sanitizeMongoDocument,

  // Sanitisation XSS
  sanitizeXSS,
  sanitizeObject,
  sanitizeInputMiddleware,

  // Utilitaires
  createValidationError,
  containsInjectionPatterns,

  // Configuration
  DEFAULT_JOI_OPTIONS,
  ALLOWED_MONGO_OPERATORS,
  DANGEROUS_MONGO_OPERATORS
};
