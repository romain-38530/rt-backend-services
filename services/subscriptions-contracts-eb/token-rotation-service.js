/**
 * Token Rotation Service - Rotation Automatique des Refresh Tokens
 * SYMPHONI.A - RT Technologie
 *
 * Implémente la rotation des refresh tokens pour une sécurité renforcée:
 * - Chaque utilisation génère un nouveau refresh token
 * - Détection de réutilisation (token theft)
 * - Historique des tokens pour audit
 * - Révocation de famille de tokens
 *
 * @version 1.0.0
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

// ============================================
// CONFIGURATION
// ============================================

const TOKEN_CONFIG = {
  // Durée de vie du refresh token (jours)
  refreshTokenExpiry: parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7,

  // Durée de vie de l'access token (minutes)
  accessTokenExpiry: parseInt(process.env.ACCESS_TOKEN_EXPIRY_MINUTES) || 15,

  // Nombre max de refresh tokens actifs par utilisateur
  maxActiveTokensPerUser: 5,

  // Activer la rotation automatique
  enableRotation: process.env.ENABLE_TOKEN_ROTATION !== 'false',

  // Fenêtre de grâce pour les requêtes concurrentes (secondes)
  gracePeriodSeconds: 60,

  // Secret pour les tokens (doit être configuré en production)
  jwtSecret: process.env.JWT_SECRET || 'change-in-production',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-change-in-production'
};

// Validation en production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('[SECURITY] JWT_SECRET must be at least 32 characters in production');
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('[SECURITY] JWT_REFRESH_SECRET must be at least 32 characters in production');
  }
}

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service de rotation de tokens
 * @param {MongoClient} mongoClient
 * @returns {Object} Service
 */
function createTokenRotationService(mongoClient) {
  const getDb = () => mongoClient.db();

  // ============================================
  // GÉNÉRATION DE TOKENS
  // ============================================

  /**
   * Générer un access token
   * @param {Object} payload - Données utilisateur
   * @returns {string} Token JWT
   */
  function generateAccessToken(payload) {
    return jwt.sign(payload, TOKEN_CONFIG.jwtSecret, {
      expiresIn: `${TOKEN_CONFIG.accessTokenExpiry}m`,
      algorithm: 'HS256'
    });
  }

  /**
   * Générer un refresh token avec famille
   * @param {string} userId - ID utilisateur
   * @param {string} familyId - ID de famille (optionnel, généré si absent)
   * @returns {Object} Token et métadonnées
   */
  function generateRefreshToken(userId, familyId = null) {
    const tokenId = crypto.randomBytes(32).toString('hex');
    const newFamilyId = familyId || crypto.randomBytes(16).toString('hex');

    const payload = {
      userId,
      tokenId,
      familyId: newFamilyId,
      type: 'refresh'
    };

    const token = jwt.sign(payload, TOKEN_CONFIG.refreshSecret, {
      expiresIn: `${TOKEN_CONFIG.refreshTokenExpiry}d`,
      algorithm: 'HS256'
    });

    return {
      token,
      tokenId,
      familyId: newFamilyId,
      expiresAt: new Date(Date.now() + TOKEN_CONFIG.refreshTokenExpiry * 24 * 60 * 60 * 1000)
    };
  }

  /**
   * Hasher un token pour stockage sécurisé
   * @param {string} token - Token à hasher
   * @returns {string} Hash du token
   */
  function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // ============================================
  // CRÉATION ET STOCKAGE
  // ============================================

  /**
   * Créer et stocker une nouvelle paire de tokens
   * @param {Object} userPayload - Données utilisateur pour l'access token
   * @param {Object} options - Options additionnelles
   * @returns {Promise<Object>} Tokens générés
   */
  async function createTokenPair(userPayload, options = {}) {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');
    const userId = userPayload.userId;

    // Générer l'access token
    const accessToken = generateAccessToken(userPayload);

    // Générer le refresh token avec nouvelle famille
    const refreshData = generateRefreshToken(userId, options.familyId);

    // Hasher le token avant stockage
    const tokenHash = hashToken(refreshData.token);

    // Stocker le refresh token
    await collection.insertOne({
      _id: new ObjectId(),
      userId,
      tokenHash,
      tokenId: refreshData.tokenId,
      familyId: refreshData.familyId,
      isActive: true,
      createdAt: new Date(),
      expiresAt: refreshData.expiresAt,
      usedAt: null,
      replacedBy: null,
      metadata: {
        ip: options.ip,
        userAgent: options.userAgent,
        device: options.device
      }
    });

    // Nettoyer les anciens tokens si limite atteinte
    await enforceTokenLimit(userId);

    return {
      accessToken,
      refreshToken: refreshData.token,
      familyId: refreshData.familyId,
      expiresIn: {
        access: `${TOKEN_CONFIG.accessTokenExpiry}m`,
        refresh: `${TOKEN_CONFIG.refreshTokenExpiry}d`
      }
    };
  }

  /**
   * Limiter le nombre de tokens actifs par utilisateur
   */
  async function enforceTokenLimit(userId) {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    // Compter les tokens actifs
    const activeTokens = await collection.find({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .toArray();

    // Révoquer les plus anciens si limite dépassée
    if (activeTokens.length > TOKEN_CONFIG.maxActiveTokensPerUser) {
      const tokensToRevoke = activeTokens.slice(TOKEN_CONFIG.maxActiveTokensPerUser);

      await collection.updateMany(
        { _id: { $in: tokensToRevoke.map(t => t._id) } },
        {
          $set: {
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'token_limit_exceeded'
          }
        }
      );
    }
  }

  // ============================================
  // ROTATION DE TOKENS
  // ============================================

  /**
   * Rafraîchir un access token avec rotation du refresh token
   * @param {string} refreshToken - Refresh token actuel
   * @param {Object} options - Options (ip, userAgent)
   * @returns {Promise<Object>} Nouveaux tokens ou erreur
   */
  async function rotateToken(refreshToken, options = {}) {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    // Vérifier et décoder le token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, TOKEN_CONFIG.refreshSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return {
          success: false,
          error: {
            code: 'REFRESH_TOKEN_EXPIRED',
            message: 'Refresh token has expired. Please login again.'
          }
        };
      }
      return {
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid refresh token'
        }
      };
    }

    const tokenHash = hashToken(refreshToken);

    // Chercher le token dans la base
    const storedToken = await collection.findOne({
      tokenHash,
      userId: decoded.userId
    });

    if (!storedToken) {
      // Token non trouvé - peut être une tentative de réutilisation
      // Révoquer toute la famille de tokens par précaution
      await revokeTokenFamily(decoded.familyId, 'token_not_found');

      return {
        success: false,
        error: {
          code: 'TOKEN_NOT_FOUND',
          message: 'Refresh token not found. All sessions have been invalidated for security.'
        }
      };
    }

    // Vérifier si le token est encore actif
    if (!storedToken.isActive) {
      // TOKEN REUSE DETECTED - Révoquer toute la famille
      console.warn(`[SECURITY] Token reuse detected for user ${decoded.userId}, family ${storedToken.familyId}`);

      await revokeTokenFamily(storedToken.familyId, 'token_reuse_detected');

      // Logger l'événement de sécurité
      await db.collection('security_events').insertOne({
        _id: new ObjectId(),
        type: 'TOKEN_REUSE_DETECTED',
        severity: 'high',
        userId: decoded.userId,
        familyId: storedToken.familyId,
        originalTokenId: storedToken.tokenId,
        detectedAt: new Date(),
        ip: options.ip,
        userAgent: options.userAgent
      });

      return {
        success: false,
        error: {
          code: 'TOKEN_REUSE_DETECTED',
          message: 'Security alert: Token reuse detected. All sessions have been invalidated. Please login again.'
        }
      };
    }

    // Vérifier l'expiration
    if (storedToken.expiresAt < new Date()) {
      return {
        success: false,
        error: {
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Refresh token has expired. Please login again.'
        }
      };
    }

    // Récupérer les infos utilisateur
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { password: 0, twoFactorSecret: 0 } }
    );

    if (!user || !user.isActive) {
      return {
        success: false,
        error: {
          code: 'USER_INVALID',
          message: 'User not found or account disabled'
        }
      };
    }

    // ROTATION: Marquer l'ancien token comme utilisé
    const newRefreshData = generateRefreshToken(decoded.userId, storedToken.familyId);
    const newTokenHash = hashToken(newRefreshData.token);

    // Marquer l'ancien token comme inactif
    await collection.updateOne(
      { _id: storedToken._id },
      {
        $set: {
          isActive: false,
          usedAt: new Date(),
          replacedBy: newRefreshData.tokenId
        }
      }
    );

    // Créer le nouveau refresh token
    await collection.insertOne({
      _id: new ObjectId(),
      userId: decoded.userId,
      tokenHash: newTokenHash,
      tokenId: newRefreshData.tokenId,
      familyId: storedToken.familyId,
      isActive: true,
      createdAt: new Date(),
      expiresAt: newRefreshData.expiresAt,
      usedAt: null,
      replacedBy: null,
      previousTokenId: storedToken.tokenId,
      metadata: {
        ip: options.ip,
        userAgent: options.userAgent
      }
    });

    // Générer le nouvel access token
    const userPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      companyName: user.companyName
    };
    const newAccessToken = generateAccessToken(userPayload);

    return {
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshData.token,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role
        },
        expiresIn: {
          access: `${TOKEN_CONFIG.accessTokenExpiry}m`,
          refresh: `${TOKEN_CONFIG.refreshTokenExpiry}d`
        }
      }
    };
  }

  // ============================================
  // RÉVOCATION
  // ============================================

  /**
   * Révoquer un refresh token spécifique
   * @param {string} refreshToken - Token à révoquer
   * @param {string} reason - Raison de révocation
   */
  async function revokeToken(refreshToken, reason = 'manual') {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');
    const tokenHash = hashToken(refreshToken);

    await collection.updateOne(
      { tokenHash },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: reason
        }
      }
    );
  }

  /**
   * Révoquer tous les tokens d'une famille
   * @param {string} familyId - ID de la famille
   * @param {string} reason - Raison de révocation
   */
  async function revokeTokenFamily(familyId, reason = 'family_revocation') {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    await collection.updateMany(
      { familyId },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: reason
        }
      }
    );

    console.log(`[TokenRotation] Revoked token family: ${familyId}, reason: ${reason}`);
  }

  /**
   * Révoquer tous les tokens d'un utilisateur
   * @param {string} userId - ID utilisateur
   * @param {string} reason - Raison de révocation
   */
  async function revokeAllUserTokens(userId, reason = 'user_logout_all') {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    const result = await collection.updateMany(
      { userId, isActive: true },
      {
        $set: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: reason
        }
      }
    );

    console.log(`[TokenRotation] Revoked ${result.modifiedCount} tokens for user: ${userId}`);
    return result.modifiedCount;
  }

  /**
   * Déconnexion - révoquer le token et optionnellement tous les tokens
   * @param {string} refreshToken - Token actuel
   * @param {boolean} logoutAll - Déconnecter tous les appareils
   */
  async function logout(refreshToken, logoutAll = false) {
    try {
      const decoded = jwt.verify(refreshToken, TOKEN_CONFIG.refreshSecret);

      if (logoutAll) {
        await revokeAllUserTokens(decoded.userId, 'user_logout_all');
      } else {
        await revokeToken(refreshToken, 'user_logout');
      }

      return { success: true };
    } catch {
      // Token invalide, mais on considère le logout comme réussi
      return { success: true };
    }
  }

  // ============================================
  // GESTION DES SESSIONS
  // ============================================

  /**
   * Lister les sessions actives d'un utilisateur
   * @param {string} userId - ID utilisateur
   */
  async function getActiveSessions(userId) {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    const sessions = await collection.find({
      userId,
      isActive: true,
      expiresAt: { $gt: new Date() }
    })
    .sort({ createdAt: -1 })
    .project({
      tokenHash: 0 // Ne pas exposer le hash
    })
    .toArray();

    return sessions.map(s => ({
      id: s._id.toString(),
      familyId: s.familyId,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      device: s.metadata?.device || 'Unknown',
      ip: s.metadata?.ip ? maskIP(s.metadata.ip) : 'Unknown',
      userAgent: s.metadata?.userAgent?.substring(0, 100)
    }));
  }

  /**
   * Révoquer une session spécifique
   * @param {string} userId - ID utilisateur
   * @param {string} sessionId - ID de session (familyId ou tokenId)
   */
  async function revokeSession(userId, sessionId) {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    // Chercher par familyId ou _id
    const session = await collection.findOne({
      userId,
      $or: [
        { familyId: sessionId },
        { _id: new ObjectId(sessionId) }
      ],
      isActive: true
    });

    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    await revokeTokenFamily(session.familyId, 'user_revoked_session');
    return { success: true };
  }

  /**
   * Masquer partiellement une IP
   */
  function maskIP(ip) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
    return ip.substring(0, ip.length / 2) + '***';
  }

  // ============================================
  // MAINTENANCE
  // ============================================

  /**
   * Nettoyer les tokens expirés
   */
  async function cleanupExpiredTokens() {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');

    const result = await collection.deleteMany({
      expiresAt: { $lt: new Date() }
    });

    console.log(`[TokenRotation] Cleaned up ${result.deletedCount} expired tokens`);
    return result.deletedCount;
  }

  /**
   * Statistiques des tokens
   */
  async function getTokenStats() {
    const db = getDb();
    const collection = db.collection('refresh_tokens_v2');
    const now = new Date();

    const [activeCount, expiredCount, revokedCount] = await Promise.all([
      collection.countDocuments({ isActive: true, expiresAt: { $gt: now } }),
      collection.countDocuments({ expiresAt: { $lt: now } }),
      collection.countDocuments({ isActive: false, revokedAt: { $exists: true } })
    ]);

    return {
      active: activeCount,
      expired: expiredCount,
      revoked: revokedCount,
      total: activeCount + expiredCount + revokedCount
    };
  }

  // ============================================
  // RETURN SERVICE
  // ============================================

  return {
    // Configuration
    TOKEN_CONFIG,

    // Génération
    generateAccessToken,
    generateRefreshToken,
    createTokenPair,

    // Rotation
    rotateToken,

    // Révocation
    revokeToken,
    revokeTokenFamily,
    revokeAllUserTokens,
    logout,

    // Sessions
    getActiveSessions,
    revokeSession,

    // Maintenance
    cleanupExpiredTokens,
    getTokenStats,

    // Utilitaires
    hashToken
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  TOKEN_CONFIG,
  createTokenRotationService
};
