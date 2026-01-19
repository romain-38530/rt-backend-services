/**
 * Redis Cache Service
 * SYMPHONI.A - RT Technologie
 *
 * Service de cache distribué avec Redis:
 * - Cache de session
 * - Cache de données fréquentes
 * - Rate limiting distribué
 * - Pub/Sub pour WebSocket multi-instances
 *
 * @version 1.0.0
 */

// Only load ioredis if REDIS_URL is configured
let Redis = null;
try {
  if (process.env.REDIS_URL) {
    Redis = require('ioredis');
  }
} catch (e) {
  console.log('[Redis] ioredis not available:', e.message);
}

// ============================================
// CONFIGURATION
// ============================================

const REDIS_CONFIG = {
  // URL de connexion Redis (AWS ElastiCache ou local)
  url: process.env.REDIS_URL || 'redis://localhost:6379',

  // Options de connexion
  options: {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 10) {
        console.error('[Redis] Max retries exceeded, giving up');
        return null;
      }
      return Math.min(times * 200, 3000);
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
    enableReadyCheck: true,
    lazyConnect: true
  },

  // TTL par défaut (secondes)
  defaultTTL: 3600, // 1 heure

  // Préfixes de clés
  keyPrefixes: {
    session: 'session:',
    user: 'user:',
    cache: 'cache:',
    rateLimit: 'rl:',
    lock: 'lock:',
    pubsub: 'pubsub:'
  }
};

// ============================================
// SERVICE PRINCIPAL
// ============================================

/**
 * Créer le service de cache Redis
 * @returns {Object} Service Redis
 */
function createRedisCacheService() {
  let client = null;
  let subscriber = null;
  let isConnected = false;

  // ============================================
  // CONNEXION
  // ============================================

  /**
   * Se connecter à Redis
   */
  async function connect() {
    // Skip if Redis is not configured or ioredis not available
    if (!Redis || !process.env.REDIS_URL) {
      console.log('[Redis] Redis not configured, skipping connection');
      return false;
    }

    if (isConnected && client) {
      return true;
    }

    try {
      // Client principal
      client = new Redis(REDIS_CONFIG.url, REDIS_CONFIG.options);

      // Client pour Pub/Sub (connexion dédiée)
      subscriber = new Redis(REDIS_CONFIG.url, REDIS_CONFIG.options);

      // Event handlers pour client principal
      client.on('connect', () => {
        console.log('[Redis] Connected to Redis server');
        isConnected = true;
      });

      client.on('error', (err) => {
        console.error('[Redis] Connection error:', err.message);
        isConnected = false;
      });

      client.on('close', () => {
        console.log('[Redis] Connection closed');
        isConnected = false;
      });

      client.on('reconnecting', () => {
        console.log('[Redis] Reconnecting...');
      });

      // Event handlers pour subscriber (pour eviter unhandled rejections)
      subscriber.on('error', (err) => {
        console.error('[Redis Subscriber] Error:', err.message);
      });

      subscriber.on('close', () => {
        console.log('[Redis Subscriber] Connection closed');
      });

      // Connecter explicitement
      await client.connect();
      await subscriber.connect();

      // Test de connexion
      await client.ping();

      console.log('[Redis] Connection established successfully');
      return true;

    } catch (error) {
      console.error('[Redis] Failed to connect:', error.message);
      isConnected = false;
      // Cleanup on failure
      if (client) {
        client.removeAllListeners();
        client.disconnect();
        client = null;
      }
      if (subscriber) {
        subscriber.removeAllListeners();
        subscriber.disconnect();
        subscriber = null;
      }
      return false;
    }
  }

  /**
   * Déconnexion propre
   */
  async function disconnect() {
    if (client) {
      await client.quit();
    }
    if (subscriber) {
      await subscriber.quit();
    }
    isConnected = false;
    console.log('[Redis] Disconnected');
  }

  /**
   * Vérifier la connexion
   */
  function isReady() {
    return isConnected && client?.status === 'ready';
  }

  // ============================================
  // OPÉRATIONS DE BASE
  // ============================================

  /**
   * Définir une valeur
   * @param {string} key - Clé
   * @param {*} value - Valeur (sera JSON.stringify si objet)
   * @param {number} ttl - Durée de vie en secondes
   */
  async function set(key, value, ttl = REDIS_CONFIG.defaultTTL) {
    if (!isReady()) return false;

    try {
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

      if (ttl > 0) {
        await client.setex(key, ttl, stringValue);
      } else {
        await client.set(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error('[Redis] Set error:', error.message);
      return false;
    }
  }

  /**
   * Obtenir une valeur
   * @param {string} key - Clé
   * @param {boolean} parseJson - Parser le JSON automatiquement
   */
  async function get(key, parseJson = true) {
    if (!isReady()) return null;

    try {
      const value = await client.get(key);

      if (value === null) return null;

      if (parseJson) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    } catch (error) {
      console.error('[Redis] Get error:', error.message);
      return null;
    }
  }

  /**
   * Supprimer une clé
   */
  async function del(key) {
    if (!isReady()) return false;

    try {
      await client.del(key);
      return true;
    } catch (error) {
      console.error('[Redis] Del error:', error.message);
      return false;
    }
  }

  /**
   * Vérifier si une clé existe
   */
  async function exists(key) {
    if (!isReady()) return false;

    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('[Redis] Exists error:', error.message);
      return false;
    }
  }

  /**
   * Définir l'expiration d'une clé
   */
  async function expire(key, ttl) {
    if (!isReady()) return false;

    try {
      await client.expire(key, ttl);
      return true;
    } catch (error) {
      console.error('[Redis] Expire error:', error.message);
      return false;
    }
  }

  /**
   * Obtenir le TTL d'une clé
   */
  async function ttl(key) {
    if (!isReady()) return -1;

    try {
      return await client.ttl(key);
    } catch (error) {
      console.error('[Redis] TTL error:', error.message);
      return -1;
    }
  }

  // ============================================
  // CACHE AVEC PATTERN
  // ============================================

  /**
   * Cache avec fallback sur fonction
   * @param {string} key - Clé de cache
   * @param {Function} fetchFn - Fonction pour récupérer les données si pas en cache
   * @param {number} ttl - Durée de vie
   */
  async function getOrSet(key, fetchFn, ttl = REDIS_CONFIG.defaultTTL) {
    // Essayer de récupérer du cache
    const cached = await get(key);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }

    // Sinon, récupérer les données fraîches
    try {
      const data = await fetchFn();

      // Mettre en cache
      await set(key, data, ttl);

      return { data, fromCache: false };
    } catch (error) {
      console.error('[Redis] getOrSet fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Invalider les clés correspondant à un pattern
   * @param {string} pattern - Pattern de clés (ex: "user:123:*")
   */
  async function invalidatePattern(pattern) {
    if (!isReady()) return 0;

    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('[Redis] InvalidatePattern error:', error.message);
      return 0;
    }
  }

  // ============================================
  // CACHE UTILISATEUR
  // ============================================

  /**
   * Mettre en cache les données utilisateur
   */
  async function cacheUser(userId, userData, ttl = 1800) {
    const key = `${REDIS_CONFIG.keyPrefixes.user}${userId}`;
    return set(key, userData, ttl);
  }

  /**
   * Récupérer les données utilisateur du cache
   */
  async function getCachedUser(userId) {
    const key = `${REDIS_CONFIG.keyPrefixes.user}${userId}`;
    return get(key);
  }

  /**
   * Invalider le cache utilisateur
   */
  async function invalidateUser(userId) {
    const key = `${REDIS_CONFIG.keyPrefixes.user}${userId}`;
    return del(key);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Stocker une session
   */
  async function setSession(sessionId, sessionData, ttl = 3600) {
    const key = `${REDIS_CONFIG.keyPrefixes.session}${sessionId}`;
    return set(key, sessionData, ttl);
  }

  /**
   * Récupérer une session
   */
  async function getSession(sessionId) {
    const key = `${REDIS_CONFIG.keyPrefixes.session}${sessionId}`;
    return get(key);
  }

  /**
   * Supprimer une session
   */
  async function deleteSession(sessionId) {
    const key = `${REDIS_CONFIG.keyPrefixes.session}${sessionId}`;
    return del(key);
  }

  /**
   * Prolonger une session
   */
  async function extendSession(sessionId, ttl = 3600) {
    const key = `${REDIS_CONFIG.keyPrefixes.session}${sessionId}`;
    return expire(key, ttl);
  }

  // ============================================
  // RATE LIMITING DISTRIBUÉ
  // ============================================

  /**
   * Vérifier et incrémenter un compteur de rate limit
   * @param {string} identifier - Identifiant (IP, userId, etc.)
   * @param {string} action - Action limitée
   * @param {number} limit - Limite
   * @param {number} windowSeconds - Fenêtre de temps
   * @returns {Object} { allowed, remaining, resetAt }
   */
  async function checkRateLimit(identifier, action, limit, windowSeconds) {
    if (!isReady()) {
      // Fallback: autoriser si Redis non disponible
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
    }

    const key = `${REDIS_CONFIG.keyPrefixes.rateLimit}${action}:${identifier}`;

    try {
      const multi = client.multi();
      multi.incr(key);
      multi.ttl(key);

      const results = await multi.exec();
      const count = results[0][1];
      const currentTTL = results[1][1];

      // Définir l'expiration si c'est la première requête
      if (currentTTL === -1) {
        await client.expire(key, windowSeconds);
      }

      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = Date.now() + (currentTTL > 0 ? currentTTL : windowSeconds) * 1000;

      return { allowed, remaining, resetAt, count };

    } catch (error) {
      console.error('[Redis] Rate limit check error:', error.message);
      return { allowed: true, remaining: limit, resetAt: Date.now() + windowSeconds * 1000 };
    }
  }

  /**
   * Réinitialiser un compteur de rate limit
   */
  async function resetRateLimit(identifier, action) {
    const key = `${REDIS_CONFIG.keyPrefixes.rateLimit}${action}:${identifier}`;
    return del(key);
  }

  // ============================================
  // DISTRIBUTED LOCKS
  // ============================================

  /**
   * Acquérir un lock distribué
   * @param {string} lockName - Nom du lock
   * @param {number} ttl - Durée du lock en secondes
   * @returns {string|null} Lock token ou null si échec
   */
  async function acquireLock(lockName, ttl = 30) {
    if (!isReady()) return null;

    const key = `${REDIS_CONFIG.keyPrefixes.lock}${lockName}`;
    const token = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const result = await client.set(key, token, 'NX', 'EX', ttl);
      return result === 'OK' ? token : null;
    } catch (error) {
      console.error('[Redis] Acquire lock error:', error.message);
      return null;
    }
  }

  /**
   * Libérer un lock distribué
   * @param {string} lockName - Nom du lock
   * @param {string} token - Token du lock (pour vérification)
   */
  async function releaseLock(lockName, token) {
    if (!isReady()) return false;

    const key = `${REDIS_CONFIG.keyPrefixes.lock}${lockName}`;

    // Script Lua pour libération atomique
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await client.eval(script, 1, key, token);
      return result === 1;
    } catch (error) {
      console.error('[Redis] Release lock error:', error.message);
      return false;
    }
  }

  /**
   * Exécuter une fonction avec un lock
   * @param {string} lockName - Nom du lock
   * @param {Function} fn - Fonction à exécuter
   * @param {number} ttl - Durée du lock
   */
  async function withLock(lockName, fn, ttl = 30) {
    const token = await acquireLock(lockName, ttl);

    if (!token) {
      throw new Error(`Could not acquire lock: ${lockName}`);
    }

    try {
      return await fn();
    } finally {
      await releaseLock(lockName, token);
    }
  }

  // ============================================
  // PUB/SUB POUR WEBSOCKET MULTI-INSTANCES
  // ============================================

  const messageHandlers = new Map();

  /**
   * S'abonner à un canal
   * @param {string} channel - Nom du canal
   * @param {Function} handler - Handler de messages
   */
  async function subscribe(channel, handler) {
    if (!subscriber) return false;

    const fullChannel = `${REDIS_CONFIG.keyPrefixes.pubsub}${channel}`;

    try {
      // Stocker le handler
      if (!messageHandlers.has(fullChannel)) {
        messageHandlers.set(fullChannel, new Set());
      }
      messageHandlers.get(fullChannel).add(handler);

      // S'abonner au canal
      await subscriber.subscribe(fullChannel);

      // Configurer le listener si pas déjà fait
      subscriber.removeAllListeners('message');
      subscriber.on('message', (ch, message) => {
        const handlers = messageHandlers.get(ch);
        if (handlers) {
          try {
            const data = JSON.parse(message);
            handlers.forEach(h => h(data, ch));
          } catch (e) {
            handlers.forEach(h => h(message, ch));
          }
        }
      });

      return true;
    } catch (error) {
      console.error('[Redis] Subscribe error:', error.message);
      return false;
    }
  }

  /**
   * Se désabonner d'un canal
   */
  async function unsubscribe(channel) {
    if (!subscriber) return false;

    const fullChannel = `${REDIS_CONFIG.keyPrefixes.pubsub}${channel}`;

    try {
      await subscriber.unsubscribe(fullChannel);
      messageHandlers.delete(fullChannel);
      return true;
    } catch (error) {
      console.error('[Redis] Unsubscribe error:', error.message);
      return false;
    }
  }

  /**
   * Publier un message
   * @param {string} channel - Nom du canal
   * @param {*} message - Message à publier
   */
  async function publish(channel, message) {
    if (!isReady()) return false;

    const fullChannel = `${REDIS_CONFIG.keyPrefixes.pubsub}${channel}`;
    const stringMessage = typeof message === 'object' ? JSON.stringify(message) : String(message);

    try {
      await client.publish(fullChannel, stringMessage);
      return true;
    } catch (error) {
      console.error('[Redis] Publish error:', error.message);
      return false;
    }
  }

  // ============================================
  // STATISTIQUES
  // ============================================

  /**
   * Obtenir les statistiques Redis
   */
  async function getStats() {
    if (!isReady()) {
      return { connected: false };
    }

    try {
      const info = await client.info();
      const dbSize = await client.dbsize();

      // Parser les infos pertinentes
      const lines = info.split('\r\n');
      const stats = {
        connected: true,
        dbSize,
        memory: {},
        clients: {},
        stats: {}
      };

      lines.forEach(line => {
        if (line.startsWith('used_memory_human:')) {
          stats.memory.used = line.split(':')[1];
        }
        if (line.startsWith('connected_clients:')) {
          stats.clients.connected = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('total_commands_processed:')) {
          stats.stats.totalCommands = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('keyspace_hits:')) {
          stats.stats.hits = parseInt(line.split(':')[1]);
        }
        if (line.startsWith('keyspace_misses:')) {
          stats.stats.misses = parseInt(line.split(':')[1]);
        }
      });

      // Calculer le hit rate
      if (stats.stats.hits !== undefined && stats.stats.misses !== undefined) {
        const total = stats.stats.hits + stats.stats.misses;
        stats.stats.hitRate = total > 0 ? (stats.stats.hits / total * 100).toFixed(2) + '%' : 'N/A';
      }

      return stats;
    } catch (error) {
      console.error('[Redis] Stats error:', error.message);
      return { connected: isConnected, error: error.message };
    }
  }

  // ============================================
  // RETURN SERVICE
  // ============================================

  return {
    // Configuration
    REDIS_CONFIG,

    // Connexion
    connect,
    disconnect,
    isReady,

    // Opérations de base
    set,
    get,
    del,
    exists,
    expire,
    ttl,

    // Cache avancé
    getOrSet,
    invalidatePattern,

    // Cache utilisateur
    cacheUser,
    getCachedUser,
    invalidateUser,

    // Sessions
    setSession,
    getSession,
    deleteSession,
    extendSession,

    // Rate limiting
    checkRateLimit,
    resetRateLimit,

    // Locks distribués
    acquireLock,
    releaseLock,
    withLock,

    // Pub/Sub
    subscribe,
    unsubscribe,
    publish,

    // Statistiques
    getStats,

    // Accès direct au client (pour cas avancés)
    getClient: () => client
  };
}

// ============================================
// SINGLETON
// ============================================

let instance = null;

function getRedisCacheService() {
  if (!instance) {
    instance = createRedisCacheService();
  }
  return instance;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  REDIS_CONFIG,
  createRedisCacheService,
  getRedisCacheService
};
