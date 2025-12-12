// JWT Authentication Middleware
// RT Backend Services - Version 1.0.0

const jwt = require('jsonwebtoken');

// Configuration - Ces valeurs devraient être dans des variables d'environnement
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Génère un token JWT d'accès
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

/**
 * Génère un token JWT de rafraîchissement
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN
  });
}

/**
 * Vérifie un token JWT d'accès
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired access token');
  }
}

/**
 * Vérifie un token JWT de rafraîchissement
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
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

module.exports = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  requireRole,
  requireAdmin,
  optionalAuth
};
