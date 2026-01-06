/**
 * Security Utilities
 * SYMPHONI.A - RT Technologie
 *
 * Utilitaires de sécurité pour la protection contre les injections et attaques.
 *
 * @version 1.0.0
 */

// ============================================================================
// PROTECTION REGEX (Anti-ReDoS)
// ============================================================================

/**
 * Caractères spéciaux regex à échapper
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Échappe les caractères spéciaux pour une utilisation sûre dans MongoDB $regex
 * Prévient les attaques ReDoS (Regular Expression Denial of Service)
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

// ============================================================================
// PROTECTION XSS
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

// ============================================================================
// PROTECTION MONGODB
// ============================================================================

/**
 * Opérateurs MongoDB dangereux à bloquer
 */
const DANGEROUS_MONGO_OPERATORS = new Set([
  '$where',
  '$function',
  '$accumulator',
  '$expr'
]);

/**
 * Sanitise un objet de requête MongoDB pour prévenir les injections NoSQL
 *
 * @param {Object} query - Objet de requête MongoDB
 * @returns {Object} Requête sanitisée
 */
function sanitizeMongoQuery(query) {
  if (query === null || query === undefined) {
    return {};
  }

  if (typeof query !== 'object') {
    return query;
  }

  if (Array.isArray(query)) {
    return query.map(item => sanitizeMongoQuery(item));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(query)) {
    // Bloquer les opérateurs dangereux
    if (key.startsWith('$') && DANGEROUS_MONGO_OPERATORS.has(key)) {
      console.warn('[Security] Blocked dangerous MongoDB operator:', key);
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMongoQuery(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitise les clés d'un document MongoDB (prévient l'injection via les clés)
 *
 * @param {Object} doc - Document à sanitiser
 * @returns {Object} Document sanitisé
 */
function sanitizeMongoDocument(doc) {
  if (doc === null || doc === undefined) {
    return doc;
  }

  if (typeof doc !== 'object') {
    return doc;
  }

  if (Array.isArray(doc)) {
    return doc.map(item => sanitizeMongoDocument(item));
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(doc)) {
    // Bloquer les clés commençant par $ ou contenant des points
    if (key.startsWith('$') || key.includes('.')) {
      console.warn('[Security] Blocked invalid document key:', key);
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMongoDocument(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ============================================================================
// VALIDATION
// ============================================================================

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
    /<script/i,
    /javascript:/i,
    /\{\s*\$\w+/
  ];

  return suspiciousPatterns.some(pattern => pattern.test(str));
}

/**
 * Valide un email
 *
 * @param {string} email - Email à valider
 * @returns {boolean} True si l'email est valide
 */
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valide un ObjectId MongoDB
 *
 * @param {string} id - ID à valider
 * @returns {boolean} True si l'ID est valide
 */
function isValidMongoId(id) {
  if (typeof id !== 'string') return false;
  return /^[a-f\d]{24}$/i.test(id);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Protection Regex
  escapeRegex,

  // Protection XSS
  sanitizeXSS,
  sanitizeObject,

  // Protection MongoDB
  sanitizeMongoQuery,
  sanitizeMongoDocument,

  // Validation
  containsInjectionPatterns,
  isValidEmail,
  isValidMongoId
};
