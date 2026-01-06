/**
 * Rate Limiter Middleware
 * SYMPHONI.A - RT Technologie
 *
 * Protection contre les abus sur les endpoints publics
 * SEC-012: Rate limiting avancé avec blocage progressif
 *
 * @version 2.0.0
 */

const { RateLimiterMongo, RateLimiterMemory } = require('rate-limiter-flexible');

// ============================================
// SEC-012: CONFIGURATION BLOCAGE PROGRESSIF
// ============================================

const PROGRESSIVE_BLOCK_CONFIG = {
  // Seuils de blocage progressif par IP
  thresholds: [
    { failures: 5, blockDuration: 300 },     // 5 échecs = 5 min
    { failures: 10, blockDuration: 900 },    // 10 échecs = 15 min
    { failures: 20, blockDuration: 3600 },   // 20 échecs = 1 heure
    { failures: 50, blockDuration: 86400 }   // 50 échecs = 24 heures
  ],
  // Fenêtre de comptage des échecs (24h)
  failureWindowSeconds: 86400,
  // IPs en liste blanche (monitoring, etc.)
  whitelistedIPs: [
    '127.0.0.1',
    '::1'
  ]
};

// ============================================
// CONFIGURATION PAR ENDPOINT
// ============================================

const RATE_LIMIT_CONFIGS = {
  // Auth endpoints
  'auth:register': {
    points: 5,              // 5 requetes
    duration: 600,          // par 10 minutes
    blockDuration: 900,     // blocage 15 min si depasse
    keyGenerator: (req) => req.ip
  },
  'auth:login': {
    points: 10,             // 10 requetes
    duration: 300,          // par 5 minutes
    blockDuration: 600,     // blocage 10 min
    keyGenerator: (req) => `${req.ip}:${req.body?.email || 'unknown'}`
  },
  'auth:send-otp': {
    points: 3,              // 3 requetes
    duration: 300,          // par 5 minutes
    blockDuration: 600,     // blocage 10 min
    keyGenerator: (req) => req.body?.email || req.ip
  },
  'auth:verify-otp': {
    points: 5,              // 5 requetes
    duration: 300,          // par 5 minutes
    blockDuration: 900,     // blocage 15 min
    keyGenerator: (req) => req.body?.email || req.ip
  },

  // Invitation endpoints
  'carriers:invite': {
    points: 10,             // 10 invitations
    duration: 3600,         // par heure
    blockDuration: 1800,    // blocage 30 min
    keyGenerator: (req) => req.body?.industrielId || req.user?.id || req.ip
  },
  'logisticians:invite': {
    points: 10,             // 10 invitations
    duration: 3600,         // par heure
    blockDuration: 1800,    // blocage 30 min
    keyGenerator: (req) => req.body?.industrielId || req.user?.id || req.ip
  },

  // Onboarding endpoints
  'onboarding:submit': {
    points: 3,              // 3 soumissions
    duration: 86400,        // par jour
    blockDuration: 3600,    // blocage 1 heure
    keyGenerator: (req) => req.body?.email || req.ip
  },

  // Document upload
  'documents:upload': {
    points: 20,             // 20 uploads
    duration: 3600,         // par heure
    blockDuration: 1800,    // blocage 30 min
    keyGenerator: (req) => req.params?.id || req.user?.id || req.ip
  },

  // API publique generale
  'api:public': {
    points: 100,            // 100 requetes
    duration: 60,           // par minute
    blockDuration: 120,     // blocage 2 min
    keyGenerator: (req) => req.ip
  },

  // API authentifiee
  'api:authenticated': {
    points: 500,            // 500 requetes
    duration: 60,           // par minute
    blockDuration: 60,      // blocage 1 min
    keyGenerator: (req) => req.user?.id || req.ip
  }
};

// ============================================
// RATE LIMITER FACTORY
// ============================================

/**
 * Creer un rate limiter
 * @param {string} name - Nom du limiter
 * @param {Object} mongoClient - Client MongoDB (optionnel)
 * @returns {Object} Rate limiter instance
 */
function createRateLimiter(name, mongoClient = null) {
  const config = RATE_LIMIT_CONFIGS[name];
  if (!config) {
    throw new Error(`Unknown rate limiter config: ${name}`);
  }

  const options = {
    keyPrefix: `rl:${name}`,
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration
  };

  // Utiliser MongoDB si disponible, sinon memoire
  if (mongoClient) {
    return new RateLimiterMongo({
      ...options,
      storeClient: mongoClient,
      dbName: mongoClient.db().databaseName,
      tableName: 'rate_limits'
    });
  }

  return new RateLimiterMemory(options);
}

// ============================================
// MIDDLEWARE FACTORY
// ============================================

/**
 * Creer un middleware de rate limiting
 * @param {string} name - Nom de la config
 * @param {Object} mongoClient - Client MongoDB
 * @returns {Function} Express middleware
 */
function rateLimitMiddleware(name, mongoClient = null) {
  const config = RATE_LIMIT_CONFIGS[name];
  if (!config) {
    console.warn(`[RateLimiter] Unknown config: ${name}, using default`);
    return (req, res, next) => next();
  }

  // Verifier si rate limiting est desactive
  if (process.env.RATE_LIMIT_ENABLED === 'false') {
    return (req, res, next) => next();
  }

  let limiter;
  try {
    limiter = createRateLimiter(name, mongoClient);
  } catch (err) {
    console.error(`[RateLimiter] Failed to create limiter ${name}:`, err);
    return (req, res, next) => next();
  }

  return async (req, res, next) => {
    try {
      const key = config.keyGenerator(req);

      const rateLimiterRes = await limiter.consume(key);

      // Headers pour informer le client
      res.set({
        'X-RateLimit-Limit': config.points,
        'X-RateLimit-Remaining': rateLimiterRes.remainingPoints,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });

      next();
    } catch (rateLimiterRes) {
      // Rate limit depasse
      const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

      res.set({
        'Retry-After': retryAfter,
        'X-RateLimit-Limit': config.points,
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString()
      });

      // Log pour monitoring
      console.warn(`[RateLimiter] Rate limit exceeded for ${name}:`, {
        ip: req.ip,
        path: req.path,
        retryAfter
      });

      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Trop de requetes. Reessayez dans ${formatDuration(retryAfter)}.`,
          retryAfter
        }
      });
    }
  };
}

/**
 * Middleware rate limiting global (fallback)
 */
function globalRateLimitMiddleware(mongoClient = null) {
  return rateLimitMiddleware('api:public', mongoClient);
}

/**
 * Formater une duree en secondes
 */
function formatDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

// ============================================
// RATE LIMITER MANAGER
// ============================================

/**
 * Manager pour gerer plusieurs rate limiters
 */
class RateLimiterManager {
  constructor(mongoClient = null) {
    this.mongoClient = mongoClient;
    this.limiters = new Map();
  }

  /**
   * Obtenir ou creer un limiter
   */
  getLimiter(name) {
    if (!this.limiters.has(name)) {
      try {
        this.limiters.set(name, createRateLimiter(name, this.mongoClient));
      } catch (err) {
        console.error(`[RateLimiterManager] Failed to create ${name}:`, err);
        return null;
      }
    }
    return this.limiters.get(name);
  }

  /**
   * Middleware pour un endpoint specifique
   */
  middleware(name) {
    return rateLimitMiddleware(name, this.mongoClient);
  }

  /**
   * Consommer manuellement (pour usage programmatique)
   */
  async consume(name, key) {
    const limiter = this.getLimiter(name);
    if (!limiter) return { success: true };

    try {
      const result = await limiter.consume(key);
      return {
        success: true,
        remaining: result.remainingPoints,
        resetAt: new Date(Date.now() + result.msBeforeNext)
      };
    } catch (result) {
      return {
        success: false,
        remaining: 0,
        resetAt: new Date(Date.now() + result.msBeforeNext),
        retryAfter: Math.ceil(result.msBeforeNext / 1000)
      };
    }
  }

  /**
   * Reset un limiter pour une cle (admin)
   */
  async reset(name, key) {
    const limiter = this.getLimiter(name);
    if (!limiter) return false;

    try {
      await limiter.delete(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Obtenir le statut d'une cle
   */
  async getStatus(name, key) {
    const limiter = this.getLimiter(name);
    if (!limiter) return null;

    try {
      const result = await limiter.get(key);
      if (!result) {
        return {
          consumed: 0,
          remaining: RATE_LIMIT_CONFIGS[name].points,
          isBlocked: false
        };
      }
      return {
        consumed: result.consumedPoints,
        remaining: Math.max(0, RATE_LIMIT_CONFIGS[name].points - result.consumedPoints),
        isBlocked: result.consumedPoints >= RATE_LIMIT_CONFIGS[name].points,
        resetAt: new Date(Date.now() + result.msBeforeNext)
      };
    } catch {
      return null;
    }
  }
}

// ============================================
// SEC-012: PROGRESSIVE IP BLOCKER
// ============================================

/**
 * Gestionnaire de blocage progressif par IP
 * Bloque les IPs en fonction du nombre d'échecs cumulés
 */
class ProgressiveIPBlocker {
  constructor(mongoClient = null) {
    this.mongoClient = mongoClient;
    this.memoryStore = new Map(); // Fallback en mémoire
  }

  /**
   * Obtenir la collection MongoDB
   */
  getCollection() {
    if (!this.mongoClient) return null;
    return this.mongoClient.db().collection('ip_failures');
  }

  /**
   * Enregistrer un échec pour une IP
   * @param {string} ip - Adresse IP
   * @param {string} endpoint - Endpoint concerné
   * @returns {Promise<Object>} Statut de blocage
   */
  async recordFailure(ip, endpoint = 'unknown') {
    // Vérifier liste blanche
    if (PROGRESSIVE_BLOCK_CONFIG.whitelistedIPs.includes(ip)) {
      return { blocked: false, failures: 0 };
    }

    const collection = this.getCollection();
    const now = new Date();
    const windowStart = new Date(now.getTime() - PROGRESSIVE_BLOCK_CONFIG.failureWindowSeconds * 1000);

    if (collection) {
      // MongoDB: upsert avec incrémentation atomique
      const result = await collection.findOneAndUpdate(
        { ip },
        {
          $inc: { failureCount: 1 },
          $push: {
            failures: {
              $each: [{ timestamp: now, endpoint }],
              $slice: -100 // Garder les 100 derniers échecs
            }
          },
          $set: { lastFailure: now },
          $setOnInsert: { createdAt: now }
        },
        { upsert: true, returnDocument: 'after' }
      );

      const record = result;
      // Compter échecs dans la fenêtre
      const recentFailures = (record.failures || []).filter(
        f => new Date(f.timestamp) > windowStart
      ).length;

      return this.calculateBlockStatus(ip, recentFailures, collection);
    } else {
      // Fallback mémoire
      const key = `failures:${ip}`;
      const current = this.memoryStore.get(key) || { count: 0, failures: [] };
      current.count++;
      current.failures.push({ timestamp: now, endpoint });
      current.failures = current.failures.filter(f => f.timestamp > windowStart).slice(-100);
      this.memoryStore.set(key, current);

      return this.calculateBlockStatus(ip, current.failures.length, null);
    }
  }

  /**
   * Calculer le statut de blocage basé sur les échecs
   */
  async calculateBlockStatus(ip, failureCount, collection) {
    // Trouver le seuil applicable
    let blockDuration = 0;
    for (const threshold of PROGRESSIVE_BLOCK_CONFIG.thresholds) {
      if (failureCount >= threshold.failures) {
        blockDuration = threshold.blockDuration;
      }
    }

    if (blockDuration > 0) {
      const blockedUntil = new Date(Date.now() + blockDuration * 1000);

      // Enregistrer le blocage
      if (collection) {
        await collection.updateOne(
          { ip },
          { $set: { blockedUntil, blockDuration } }
        );
      } else {
        const key = `block:${ip}`;
        this.memoryStore.set(key, { blockedUntil, blockDuration });
      }

      console.warn(`[ProgressiveIPBlocker] IP ${ip} blocked for ${blockDuration}s (${failureCount} failures)`);

      return {
        blocked: true,
        failures: failureCount,
        blockDuration,
        blockedUntil
      };
    }

    return { blocked: false, failures: failureCount };
  }

  /**
   * Vérifier si une IP est bloquée
   * @param {string} ip - Adresse IP
   * @returns {Promise<Object>} Statut de blocage
   */
  async isBlocked(ip) {
    // Vérifier liste blanche
    if (PROGRESSIVE_BLOCK_CONFIG.whitelistedIPs.includes(ip)) {
      return { blocked: false };
    }

    const collection = this.getCollection();
    const now = new Date();

    if (collection) {
      const record = await collection.findOne({ ip });
      if (record && record.blockedUntil && new Date(record.blockedUntil) > now) {
        const retryAfter = Math.ceil((new Date(record.blockedUntil) - now) / 1000);
        return {
          blocked: true,
          blockedUntil: record.blockedUntil,
          retryAfter,
          failures: record.failureCount
        };
      }
    } else {
      const key = `block:${ip}`;
      const block = this.memoryStore.get(key);
      if (block && block.blockedUntil > now) {
        const retryAfter = Math.ceil((block.blockedUntil - now) / 1000);
        return { blocked: true, blockedUntil: block.blockedUntil, retryAfter };
      }
    }

    return { blocked: false };
  }

  /**
   * Réinitialiser les échecs pour une IP (après login réussi)
   * @param {string} ip - Adresse IP
   */
  async resetFailures(ip) {
    const collection = this.getCollection();

    if (collection) {
      await collection.deleteOne({ ip });
    } else {
      this.memoryStore.delete(`failures:${ip}`);
      this.memoryStore.delete(`block:${ip}`);
    }

    console.log(`[ProgressiveIPBlocker] Failures reset for IP ${ip}`);
  }

  /**
   * Middleware Express pour blocage progressif
   */
  middleware() {
    return async (req, res, next) => {
      const ip = req.ip || req.connection?.remoteAddress || 'unknown';
      const blockStatus = await this.isBlocked(ip);

      if (blockStatus.blocked) {
        res.set('Retry-After', blockStatus.retryAfter);
        return res.status(429).json({
          success: false,
          error: {
            code: 'IP_BLOCKED',
            message: `Votre adresse IP est temporairement bloquée. Réessayez dans ${formatDuration(blockStatus.retryAfter)}.`,
            retryAfter: blockStatus.retryAfter,
            blockedUntil: blockStatus.blockedUntil
          }
        });
      }

      // Ajouter helper pour enregistrer échec
      req.recordAuthFailure = async () => {
        return this.recordFailure(ip, req.path);
      };

      // Ajouter helper pour reset après succès
      req.resetAuthFailures = async () => {
        return this.resetFailures(ip);
      };

      next();
    };
  }

  /**
   * Nettoyer les anciens enregistrements
   */
  async cleanup() {
    const collection = this.getCollection();
    if (!collection) return 0;

    const cutoff = new Date(Date.now() - PROGRESSIVE_BLOCK_CONFIG.failureWindowSeconds * 1000);
    const result = await collection.deleteMany({
      lastFailure: { $lt: cutoff },
      blockedUntil: { $lt: new Date() }
    });

    return result.deletedCount;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  RATE_LIMIT_CONFIGS,
  PROGRESSIVE_BLOCK_CONFIG,
  createRateLimiter,
  rateLimitMiddleware,
  globalRateLimitMiddleware,
  RateLimiterManager,
  ProgressiveIPBlocker
};
