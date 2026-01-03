/**
 * Secure Logger - Logging avec Sanitization PII
 * SYMPHONI.A - RT Technologie
 *
 * Masque automatiquement les données personnelles dans les logs
 * Conforme RGPD - Protection des données dans les journaux
 *
 * @version 1.0.0
 */

// ============================================
// PATTERNS PII À MASQUER
// ============================================

const PII_PATTERNS = {
  // Email: masque la partie locale sauf premier et dernier caractère
  email: {
    pattern: /([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    mask: (match, local, domain) => {
      if (local.length <= 2) return `**@${domain.substring(0, 3)}***.***`;
      return `${local[0]}${'*'.repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain.substring(0, 3)}***.***`;
    }
  },

  // Téléphone: garde les 4 derniers chiffres
  phone: {
    pattern: /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}/g,
    mask: (match) => {
      const digits = match.replace(/\D/g, '');
      if (digits.length < 4) return '****';
      return `****${digits.slice(-4)}`;
    }
  },

  // SIRET (14 chiffres): masque les 9 premiers
  siret: {
    pattern: /\b\d{14}\b/g,
    mask: (match) => `*********${match.slice(-5)}`
  },

  // SIREN (9 chiffres): masque les 6 premiers
  siren: {
    pattern: /\b\d{9}\b/g,
    mask: (match) => `******${match.slice(-3)}`
  },

  // IBAN
  iban: {
    pattern: /[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}/gi,
    mask: (match) => `${match.slice(0, 4)}${'*'.repeat(match.length - 8)}${match.slice(-4)}`
  },

  // Numéro de carte bancaire
  creditCard: {
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    mask: (match) => {
      const digits = match.replace(/\D/g, '');
      return `****-****-****-${digits.slice(-4)}`;
    }
  },

  // JWT tokens
  jwt: {
    pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,
    mask: () => '[JWT_TOKEN_REDACTED]'
  },

  // Mots de passe dans JSON
  passwordJson: {
    pattern: /"(password|passwd|pwd|secret|token|apiKey|api_key|apikey|auth|authorization)":\s*"[^"]*"/gi,
    mask: (match) => {
      const key = match.match(/"([^"]+)":/)[1];
      return `"${key}": "[REDACTED]"`;
    }
  },

  // Clés API
  apiKey: {
    pattern: /(sk_|pk_|api_key_|apikey_|secret_)[A-Za-z0-9_-]{20,}/gi,
    mask: (match) => `${match.slice(0, 7)}...[REDACTED]`
  },

  // Bearer tokens
  bearerToken: {
    pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/gi,
    mask: () => 'Bearer [TOKEN_REDACTED]'
  },

  // Adresses IP (masquage partiel)
  ipAddress: {
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    mask: (match) => {
      const parts = match.split('.');
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  },

  // Numéro de sécurité sociale (France)
  ssn: {
    pattern: /\b[12]\d{2}(0[1-9]|1[0-2])\d{2}\d{3}\d{3}\d{2}\b/g,
    mask: () => '[SSN_REDACTED]'
  },

  // Noms (dans des contextes JSON spécifiques)
  nameJson: {
    pattern: /"(firstName|lastName|fullName|name|driverName|contactName)":\s*"[^"]+"/gi,
    mask: (match) => {
      const key = match.match(/"([^"]+)":/)[1];
      return `"${key}": "[NAME_REDACTED]"`;
    }
  },

  // Adresses postales (basique)
  addressJson: {
    pattern: /"(address|street|city|postalCode|zipCode)":\s*"[^"]+"/gi,
    mask: (match) => {
      const key = match.match(/"([^"]+)":/)[1];
      return `"${key}": "[ADDRESS_REDACTED]"`;
    }
  }
};

// ============================================
// FONCTIONS DE SANITIZATION
// ============================================

/**
 * Sanitize une chaîne en masquant les PII
 * @param {string} str - Chaîne à sanitizer
 * @param {Object} options - Options de sanitization
 * @returns {string} Chaîne sanitizée
 */
function sanitizeString(str, options = {}) {
  if (typeof str !== 'string') {
    return str;
  }

  let result = str;

  // Appliquer chaque pattern
  for (const [name, config] of Object.entries(PII_PATTERNS)) {
    // Vérifier si ce pattern est désactivé dans les options
    if (options.exclude && options.exclude.includes(name)) {
      continue;
    }

    result = result.replace(config.pattern, config.mask);
  }

  return result;
}

/**
 * Sanitize un objet récursivement
 * @param {Object} obj - Objet à sanitizer
 * @param {Object} options - Options
 * @returns {Object} Objet sanitizé
 */
function sanitizeObject(obj, options = {}) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj, options);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, options));
  }

  if (typeof obj === 'object') {
    const result = {};

    // Liste des clés sensibles à masquer complètement
    const sensitiveKeys = [
      'password', 'passwordHash', 'secret', 'token', 'apiKey',
      'refreshToken', 'accessToken', 'twoFactorSecret', 'otp',
      'creditCard', 'cvv', 'bankDetails', 'iban', 'bic'
    ];

    for (const [key, value] of Object.entries(obj)) {
      // Masquer complètement les clés sensibles
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeObject(value, options);
      }
    }

    return result;
  }

  return obj;
}

// ============================================
// LOGGER SÉCURISÉ
// ============================================

/**
 * Niveaux de log
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4
};

/**
 * Configuration du logger
 */
const LOGGER_CONFIG = {
  level: process.env.LOG_LEVEL || 'INFO',
  format: process.env.LOG_FORMAT || 'json', // 'json' ou 'text'
  includeTimestamp: true,
  includeRequestId: true,
  sanitizePII: process.env.NODE_ENV === 'production' ? true : (process.env.SANITIZE_LOGS === 'true'),
  maxMessageLength: 10000
};

/**
 * Créer le logger sécurisé
 */
class SecureLogger {
  constructor(options = {}) {
    this.config = { ...LOGGER_CONFIG, ...options };
    this.currentLevel = LogLevel[this.config.level.toUpperCase()] || LogLevel.INFO;
  }

  /**
   * Formater un message de log
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();

    // Sanitizer le message et les métadonnées si activé
    let sanitizedMessage = message;
    let sanitizedMeta = meta;

    if (this.config.sanitizePII) {
      sanitizedMessage = typeof message === 'string'
        ? sanitizeString(message)
        : sanitizeObject(message);
      sanitizedMeta = sanitizeObject(meta);
    }

    // Tronquer si trop long
    if (typeof sanitizedMessage === 'string' && sanitizedMessage.length > this.config.maxMessageLength) {
      sanitizedMessage = sanitizedMessage.substring(0, this.config.maxMessageLength) + '... [TRUNCATED]';
    }

    if (this.config.format === 'json') {
      return JSON.stringify({
        timestamp,
        level,
        message: sanitizedMessage,
        ...sanitizedMeta
      });
    } else {
      // Format texte
      let output = `[${timestamp}] [${level}] ${sanitizedMessage}`;
      if (Object.keys(sanitizedMeta).length > 0) {
        output += ` ${JSON.stringify(sanitizedMeta)}`;
      }
      return output;
    }
  }

  /**
   * Logger un message
   */
  log(level, levelNum, message, meta = {}) {
    if (levelNum < this.currentLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, meta);

    switch (level) {
      case 'ERROR':
      case 'FATAL':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  debug(message, meta = {}) {
    this.log('DEBUG', LogLevel.DEBUG, message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', LogLevel.INFO, message, meta);
  }

  warn(message, meta = {}) {
    this.log('WARN', LogLevel.WARN, message, meta);
  }

  error(message, meta = {}) {
    // Si message est une Error, extraire les infos
    if (message instanceof Error) {
      meta = {
        ...meta,
        errorName: message.name,
        errorMessage: message.message,
        stack: this.config.sanitizePII
          ? sanitizeString(message.stack)
          : message.stack
      };
      message = message.message;
    }
    this.log('ERROR', LogLevel.ERROR, message, meta);
  }

  fatal(message, meta = {}) {
    this.log('FATAL', LogLevel.FATAL, message, meta);
  }

  /**
   * Créer un logger enfant avec contexte
   */
  child(context = {}) {
    const childLogger = new SecureLogger(this.config);
    childLogger.context = context;

    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, levelNum, message, meta = {}) => {
      originalLog(level, levelNum, message, { ...this.context, ...context, ...meta });
    };

    return childLogger;
  }
}

// ============================================
// MIDDLEWARE EXPRESS
// ============================================

/**
 * Middleware de logging des requêtes
 */
function requestLoggerMiddleware(logger) {
  return (req, res, next) => {
    const startTime = Date.now();

    // Générer un ID de requête
    req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Logger la requête entrante
    logger.info('Incoming request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      query: sanitizeObject(req.query),
      ip: req.ip ? sanitizeString(req.ip) : undefined,
      userAgent: req.get('User-Agent')?.substring(0, 100)
    });

    // Intercepter la fin de la réponse
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Date.now() - startTime;

      logger.info('Request completed', {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`
      });

      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Middleware de logging des erreurs
 */
function errorLoggerMiddleware(logger) {
  return (err, req, res, next) => {
    logger.error('Request error', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack,
      statusCode: err.statusCode || 500
    });

    next(err);
  };
}

// ============================================
// INSTANCE GLOBALE
// ============================================

const logger = new SecureLogger();

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Fonctions de sanitization
  sanitizeString,
  sanitizeObject,
  PII_PATTERNS,

  // Logger
  SecureLogger,
  LogLevel,
  LOGGER_CONFIG,
  logger,

  // Middleware
  requestLoggerMiddleware,
  errorLoggerMiddleware
};
