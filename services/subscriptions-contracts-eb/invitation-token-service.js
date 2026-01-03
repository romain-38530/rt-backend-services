/**
 * Invitation Token Service - JWT Secured
 * SYMPHONI.A - RT Technologie
 *
 * Service de generation et validation de tokens d'invitation securises
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');

// ============================================
// CONFIGURATION
// ============================================

const TOKEN_CONFIG = {
  // Secret pour signer les tokens (a configurer via env)
  secret: process.env.JWT_INVITATION_SECRET || 'symphonia-invitation-secret-change-in-production',
  // Duree de validite par defaut
  expiryDays: 7,
  // Algorithme
  algorithm: 'HS256',
  // Issuer
  issuer: 'symphonia-api'
};

// ============================================
// VALIDATION SECURITE PRODUCTION
// ============================================
if (process.env.NODE_ENV === 'production') {
  const secret = TOKEN_CONFIG.secret;
  if (!secret || secret.length < 32 || secret.includes('symphonia-invitation-secret')) {
    console.error('[SECURITY CRITICAL] JWT_INVITATION_SECRET is not properly configured!');
    console.error('  - Must be at least 32 characters');
    console.error('  - Must not contain default value');
    console.error('  - Set via environment variable JWT_INVITATION_SECRET');
    throw new Error('[SECURITY] JWT_INVITATION_SECRET must be configured in production!');
  }
  console.log('[SECURITY] JWT_INVITATION_SECRET validated successfully');
}

// Types de tokens
const TokenType = {
  LOGISTICIEN_INVITATION: 'logisticien_invitation',
  CARRIER_INVITATION: 'carrier_invitation',
  PASSWORD_RESET: 'password_reset',
  EMAIL_VERIFICATION: 'email_verification'
};

// ============================================
// GENERATION DE TOKEN
// ============================================

/**
 * Generer un token d'invitation securise
 * @param {Object} payload - Donnees du token
 * @param {string} payload.type - Type de token
 * @param {string} payload.recipientId - ID du destinataire
 * @param {string} payload.recipientEmail - Email du destinataire
 * @param {string} payload.inviterId - ID de l'inviteur
 * @param {string} payload.inviterName - Nom de l'inviteur
 * @param {Object} payload.metadata - Metadata additionnelle
 * @param {number} expiryDays - Jours avant expiration (defaut: 7)
 * @returns {Object} Token et metadata
 */
function generateInvitationToken(payload, expiryDays = TOKEN_CONFIG.expiryDays) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (expiryDays * 24 * 60 * 60);

  // Generer un ID unique pour le token (pour revocation)
  const jti = crypto.randomBytes(16).toString('hex');

  const tokenPayload = {
    // Standard JWT claims
    iss: TOKEN_CONFIG.issuer,
    sub: payload.recipientId,
    iat: now,
    exp: expiresAt,
    jti: jti,

    // Custom claims
    type: payload.type,
    email: payload.recipientEmail?.toLowerCase(),
    inviter: {
      id: payload.inviterId,
      name: payload.inviterName
    },
    metadata: payload.metadata || {}
  };

  const token = jwt.sign(tokenPayload, TOKEN_CONFIG.secret, {
    algorithm: TOKEN_CONFIG.algorithm
  });

  return {
    token,
    jti,
    expiresAt: new Date(expiresAt * 1000),
    payload: tokenPayload
  };
}

/**
 * Generer un token d'invitation logisticien
 */
function generateLogisticienInvitationToken(logisticianId, email, industrielId, industrielName, metadata = {}) {
  return generateInvitationToken({
    type: TokenType.LOGISTICIEN_INVITATION,
    recipientId: logisticianId,
    recipientEmail: email,
    inviterId: industrielId,
    inviterName: industrielName,
    metadata: {
      ...metadata,
      delegationType: metadata.delegationType,
      delegatedSites: metadata.delegatedSites
    }
  });
}

/**
 * Generer un token d'invitation transporteur
 */
function generateCarrierInvitationToken(carrierId, email, industrielId, industrielName, metadata = {}) {
  return generateInvitationToken({
    type: TokenType.CARRIER_INVITATION,
    recipientId: carrierId,
    recipientEmail: email,
    inviterId: industrielId,
    inviterName: industrielName,
    metadata: {
      ...metadata,
      level: metadata.level
    }
  });
}

// ============================================
// VALIDATION DE TOKEN
// ============================================

/**
 * Verifier et decoder un token
 * @param {string} token - Token JWT
 * @returns {Object} Resultat de validation
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, TOKEN_CONFIG.secret, {
      algorithms: [TOKEN_CONFIG.algorithm],
      issuer: TOKEN_CONFIG.issuer
    });

    return {
      valid: true,
      payload: decoded,
      jti: decoded.jti,
      type: decoded.type,
      recipientId: decoded.sub,
      email: decoded.email,
      inviter: decoded.inviter,
      metadata: decoded.metadata,
      expiresAt: new Date(decoded.exp * 1000),
      issuedAt: new Date(decoded.iat * 1000)
    };
  } catch (error) {
    let errorCode = 'TOKEN_INVALID';
    let message = 'Token invalide';

    if (error.name === 'TokenExpiredError') {
      errorCode = 'TOKEN_EXPIRED';
      message = 'Le token a expire';
    } else if (error.name === 'JsonWebTokenError') {
      if (error.message.includes('signature')) {
        errorCode = 'TOKEN_SIGNATURE_INVALID';
        message = 'Signature du token invalide';
      } else if (error.message.includes('malformed')) {
        errorCode = 'TOKEN_MALFORMED';
        message = 'Token mal forme';
      }
    }

    return {
      valid: false,
      error: {
        code: errorCode,
        message,
        originalError: error.message
      }
    };
  }
}

/**
 * Decoder un token sans verification (pour debug)
 */
function decodeToken(token) {
  try {
    return jwt.decode(token, { complete: true });
  } catch {
    return null;
  }
}

// ============================================
// SERVICE DE REVOCATION
// ============================================

/**
 * Creer le service de gestion des tokens
 * @param {MongoClient} mongoClient
 * @returns {Object} Service
 */
function createInvitationTokenService(mongoClient) {
  const getDb = () => mongoClient.db();

  /**
   * Revoquer un token
   * @param {string} token - Token ou JTI
   * @param {string} revokedBy - ID de l'utilisateur qui revoque
   * @param {string} reason - Raison de revocation
   * @returns {Promise<Object>}
   */
  async function revokeToken(token, revokedBy, reason = 'manual') {
    const db = getDb();
    const collection = db.collection('revoked_tokens');

    // Decoder le token pour obtenir le JTI
    let jti, expiresAt;
    if (token.includes('.')) {
      // C'est un token JWT complet
      const result = verifyToken(token);
      if (!result.valid) {
        // Token deja invalide, pas besoin de revoquer
        return { success: true, alreadyInvalid: true };
      }
      jti = result.jti;
      expiresAt = result.expiresAt;
    } else {
      // C'est directement un JTI
      jti = token;
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours par defaut
    }

    // Verifier si deja revoque
    const existing = await collection.findOne({ jti });
    if (existing) {
      return { success: true, alreadyRevoked: true };
    }

    // Ajouter a la blacklist
    await collection.insertOne({
      _id: new ObjectId(),
      jti,
      token: token.includes('.') ? token : null,
      revokedAt: new Date(),
      revokedBy,
      reason,
      expiresAt // Pour cleanup automatique
    });

    return { success: true, jti };
  }

  /**
   * Verifier si un token est revoque
   * @param {string} jti - JWT ID
   * @returns {Promise<boolean>}
   */
  async function isTokenRevoked(jti) {
    const db = getDb();
    const collection = db.collection('revoked_tokens');
    const revoked = await collection.findOne({ jti });
    return !!revoked;
  }

  /**
   * Valider un token (verification JWT + revocation)
   * @param {string} token - Token JWT
   * @returns {Promise<Object>}
   */
  async function validateToken(token) {
    // Verification JWT
    const result = verifyToken(token);
    if (!result.valid) {
      return result;
    }

    // Verification revocation
    const isRevoked = await isTokenRevoked(result.jti);
    if (isRevoked) {
      return {
        valid: false,
        error: {
          code: 'TOKEN_REVOKED',
          message: 'Ce token a ete revoque'
        }
      };
    }

    return result;
  }

  /**
   * Nettoyer les tokens revoques expires
   * @returns {Promise<number>}
   */
  async function cleanupRevokedTokens() {
    const db = getDb();
    const collection = db.collection('revoked_tokens');
    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    return result.deletedCount;
  }

  /**
   * Obtenir l'historique des tokens revoques (admin)
   */
  async function getRevokedTokens(filters = {}, limit = 50) {
    const db = getDb();
    const collection = db.collection('revoked_tokens');

    const query = {};
    if (filters.revokedBy) query.revokedBy = filters.revokedBy;
    if (filters.reason) query.reason = filters.reason;

    return collection
      .find(query)
      .sort({ revokedAt: -1 })
      .limit(limit)
      .toArray();
  }

  return {
    // Generation
    generateInvitationToken,
    generateLogisticienInvitationToken,
    generateCarrierInvitationToken,

    // Validation
    verifyToken,
    validateToken,
    decodeToken,

    // Revocation
    revokeToken,
    isTokenRevoked,

    // Maintenance
    cleanupRevokedTokens,
    getRevokedTokens,

    // Types
    TokenType
  };
}

// ============================================
// MIDDLEWARE DE VALIDATION
// ============================================

/**
 * Middleware pour valider un token d'invitation
 * @param {Object} tokenService - Service de tokens
 * @param {string} expectedType - Type de token attendu
 */
function validateInvitationTokenMiddleware(tokenService, expectedType) {
  return async (req, res, next) => {
    const token = req.params.token || req.body.token || req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOKEN_MISSING',
          message: 'Token d\'invitation requis'
        }
      });
    }

    const result = await tokenService.validateToken(token);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: result.error
      });
    }

    // Verifier le type si specifie
    if (expectedType && result.type !== expectedType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOKEN_TYPE_MISMATCH',
          message: 'Type de token invalide pour cette operation'
        }
      });
    }

    // Ajouter les infos du token a la requete
    req.invitationToken = result;
    next();
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Config
  TOKEN_CONFIG,
  TokenType,

  // Generation
  generateInvitationToken,
  generateLogisticienInvitationToken,
  generateCarrierInvitationToken,

  // Validation
  verifyToken,
  decodeToken,

  // Service factory
  createInvitationTokenService,

  // Middleware
  validateInvitationTokenMiddleware
};
