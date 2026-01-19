// JWT Authentication Middleware
// RT Backend Services - Version 2.0.0 - Security Enhanced
// SECURITY: Les secrets ne sont plus exportés

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================================================
// CONFIGURATION SÉCURISÉE
// ============================================================================

// Configuration JWT (les secrets restent privés dans ce module)
const JWT_CONFIG = {
  algorithm: 'HS256',
  issuer: 'symphonia-api',
  audience: 'symphonia-client',
  accessTokenExpiry: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
};

// Secrets (privés - ne jamais exporter)
let _jwtSecret = null;
let _jwtRefreshSecret = null;

/**
 * Initialise et valide les secrets JWT
 * @throws {Error} Si les secrets sont invalides
 */
function initializeSecrets() {
  _jwtSecret = process.env.JWT_SECRET;
  _jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  // Liste des secrets par défaut à bloquer
  const defaultSecrets = [
    'your-secret-key-change-in-production',
    'your-refresh-secret-change-in-production',
    'dev-secret-jwt-key-change-in-production',
    'secret',
    'changeme',
    'password'
  ];

  // Validation en production
  if (process.env.NODE_ENV === 'production') {
    if (!_jwtSecret || _jwtSecret.length < 30) {
      throw new Error('[SECURITY] JWT_SECRET must be at least 30 characters in production');
    }

    if (!_jwtRefreshSecret || _jwtRefreshSecret.length < 30) {
      throw new Error('[SECURITY] JWT_REFRESH_SECRET must be at least 30 characters in production');
    }

    if (defaultSecrets.some(ds => _jwtSecret.toLowerCase().includes(ds.toLowerCase()))) {
      throw new Error('[SECURITY] JWT_SECRET contains a default/weak value');
    }

    if (defaultSecrets.some(ds => _jwtRefreshSecret.toLowerCase().includes(ds.toLowerCase()))) {
      throw new Error('[SECURITY] JWT_REFRESH_SECRET contains a default/weak value');
    }

    console.log('[AUTH] JWT secrets validated successfully');
  } else {
    // En développement, utiliser des valeurs par défaut avec avertissement
    if (!_jwtSecret) {
      _jwtSecret = 'dev-only-secret-key-do-not-use-in-production-' + crypto.randomBytes(16).toString('hex');
      console.warn('[AUTH] WARNING: Using generated JWT_SECRET for development');
    }
    if (!_jwtRefreshSecret) {
      _jwtRefreshSecret = 'dev-only-refresh-key-do-not-use-in-production-' + crypto.randomBytes(16).toString('hex');
      console.warn('[AUTH] WARNING: Using generated JWT_REFRESH_SECRET for development');
    }
  }
}

// Initialiser les secrets au chargement du module
try {
  initializeSecrets();
} catch (error) {
  console.error('[AUTH] FATAL:', error.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1); // Arrêter le serveur si secrets invalides en production
  }
}

// Conserver pour compatibilité (mais ne pas exporter les vraies valeurs)
const JWT_EXPIRES_IN = JWT_CONFIG.accessTokenExpiry;
const JWT_REFRESH_EXPIRES_IN = JWT_CONFIG.refreshTokenExpiry;

/**
 * Génère un token JWT d'accès
 * @param {Object} payload - Données à inclure dans le token
 * @returns {string} Token JWT signé
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, _jwtSecret, {
    expiresIn: JWT_CONFIG.accessTokenExpiry,
    algorithm: JWT_CONFIG.algorithm,
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience
  });
}

/**
 * Génère un token JWT de rafraîchissement
 * @param {Object} payload - Données à inclure dans le token
 * @returns {string} Token JWT signé
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, _jwtRefreshSecret, {
    expiresIn: JWT_CONFIG.refreshTokenExpiry,
    algorithm: JWT_CONFIG.algorithm,
    issuer: JWT_CONFIG.issuer
  });
}

/**
 * Vérifie un token JWT d'accès
 * Supporte les tokens de ce service ET ceux du service authz-eb
 * @param {string} token - Token à vérifier
 * @returns {Object} Payload décodé
 * @throws {Error} Si le token est invalide
 */
function verifyAccessToken(token) {
  // Essayer d'abord avec les paramètres stricts (tokens de ce service)
  try {
    return jwt.verify(token, _jwtSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer,
      audience: JWT_CONFIG.audience
    });
  } catch (strictError) {
    // Si ça échoue, essayer une vérification plus souple (tokens authz-eb)
    // Les tokens authz-eb n'ont pas d'issuer/audience mais utilisent le même secret
    try {
      const decoded = jwt.verify(token, _jwtSecret, {
        algorithms: ['HS256']
      });
      // Normaliser le payload pour la compatibilité
      // authz-eb utilise 'id' au lieu de 'userId'
      if (decoded.id && !decoded.userId) {
        decoded.userId = decoded.id;
      }
      return decoded;
    } catch (looseError) {
      throw new Error('Invalid or expired access token');
    }
  }
}

/**
 * Vérifie un token JWT de rafraîchissement
 * @param {string} token - Token à vérifier
 * @returns {Object} Payload décodé
 * @throws {Error} Si le token est invalide
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, _jwtRefreshSecret, {
      algorithms: [JWT_CONFIG.algorithm],
      issuer: JWT_CONFIG.issuer
    });
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
}

/**
 * Middleware Express pour vérifier l'authentification JWT
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_TOKEN_MISSING',
        message: 'Authentication token is required'
      }
    });
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // Attache les infos utilisateur à la requête
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid or expired authentication token'
      }
    });
  }
}

/**
 * Middleware pour vérifier que l'utilisateur a un rôle spécifique
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authentication required'
        }
      });
    }

    const userRole = req.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          userRole,
          requiredRoles: allowedRoles
        }
      });
    }

    next();
  };
}

/**
 * Middleware pour vérifier que l'utilisateur est admin
 */
function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

/**
 * Middleware optionnel - attache les infos user si token présent, mais ne bloque pas si absent
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // Pas de token, on continue sans user
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
  } catch (error) {
    // Token invalide, on ignore et on continue sans user
  }

  next();
}

// ============================================================================
// EXPORTS SÉCURISÉS
// ============================================================================
// SECURITY: Les secrets JWT ne sont plus exportés pour éviter les fuites.
// Seules les fonctions de génération et vérification sont exposées.

module.exports = {
  // Configuration (sans secrets)
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  JWT_CONFIG: {
    algorithm: JWT_CONFIG.algorithm,
    issuer: JWT_CONFIG.issuer,
    audience: JWT_CONFIG.audience,
    accessTokenExpiry: JWT_CONFIG.accessTokenExpiry,
    refreshTokenExpiry: JWT_CONFIG.refreshTokenExpiry
  },

  // Fonctions de génération de tokens
  generateAccessToken,
  generateRefreshToken,

  // Fonctions de vérification de tokens
  verifyAccessToken,
  verifyRefreshToken,

  // Middlewares d'authentification
  authenticateToken,
  requireRole,
  requireAdmin,
  optionalAuth,

  // Utilitaire pour réinitialiser les secrets (tests uniquement)
  _reinitializeSecrets: process.env.NODE_ENV === 'test' ? initializeSecrets : undefined
};
