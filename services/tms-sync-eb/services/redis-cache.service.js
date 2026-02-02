/**
 * Service Cache Redis pour TMS Sync
 *
 * Features:
 * - Client ioredis avec retry strategy
 * - Fallback memory Map si Redis unavailable
 * - Keys pattern: tms:sync:status:{id}, tms:orders:filtered:{hash}, tms:carriers:{id}
 * - TTLs configurables: status 30s, orders 5min, carriers 1h
 *
 * Usage:
 *   const cacheService = require('./services/redis-cache.service');
 *   await cacheService.init();
 *   await cacheService.set('key', value, ttl);
 *   const data = await cacheService.get('key');
 */

const crypto = require('crypto');

class RedisCacheService {
  constructor() {
    this.client = null;
    this.connected = false;
    this.fallbackCache = new Map(); // Fallback en mémoire si Redis unavailable
    this.ttlTimers = new Map(); // Timers pour TTL du fallback

    // TTLs par défaut (en secondes)
    this.DEFAULT_TTL = {
      status: 30,        // Status connexions: 30s
      orders: 300,       // Orders filtrés: 5min
      carriers: 3600,    // Carriers: 1h
      default: 300       // Défaut: 5min
    };
  }

  /**
   * Initialiser connexion Redis
   */
  async init() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      console.warn('⚠️  [CACHE] REDIS_URL not configured, using memory fallback');
      return;
    }

    try {
      // Import dynamique de ioredis
      const Redis = require('ioredis');

      this.client = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ [CACHE] Redis connection failed after 3 retries');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 100, 3000);
          console.log(`🔄 [CACHE] Redis retry ${times}/3 in ${delay}ms...`);
          return delay;
        },
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        lazyConnect: true
      });

      // Event handlers
      this.client.on('connect', () => {
        console.log('✅ [CACHE] Redis connected');
        this.connected = true;
      });

      this.client.on('ready', () => {
        console.log('✅ [CACHE] Redis ready');
        this.connected = true;
      });

      this.client.on('error', (error) => {
        console.error('❌ [CACHE] Redis error:', error.message);
        this.connected = false;
      });

      this.client.on('close', () => {
        console.log('⚠️  [CACHE] Redis connection closed');
        this.connected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 [CACHE] Redis reconnecting...');
      });

      // Connexion initiale
      await this.client.connect();

    } catch (error) {
      console.error('❌ [CACHE] Redis init error:', error.message);
      console.log('⚠️  [CACHE] Falling back to memory cache');
      this.connected = false;
    }
  }

  /**
   * Get cache key value
   *
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null
   */
  async get(key) {
    // Essayer Redis si connecté
    if (this.connected && this.client) {
      try {
        const value = await this.client.get(key);
        if (value) {
          return JSON.parse(value);
        }
        return null;
      } catch (error) {
        console.error(`❌ [CACHE] Redis get error for key ${key}:`, error.message);
        // Continue avec fallback
      }
    }

    // Fallback to memory
    const cached = this.fallbackCache.get(key);
    return cached ? cached.value : null;
  }

  /**
   * Set cache key value with TTL
   *
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - TTL in seconds (default: 300)
   * @returns {Promise<boolean>} Success
   */
  async set(key, value, ttlSeconds = this.DEFAULT_TTL.default) {
    const serialized = JSON.stringify(value);

    // Essayer Redis si connecté
    if (this.connected && this.client) {
      try {
        await this.client.setex(key, ttlSeconds, serialized);
        return true;
      } catch (error) {
        console.error(`❌ [CACHE] Redis set error for key ${key}:`, error.message);
        // Continue avec fallback
      }
    }

    // Fallback to memory with manual TTL
    this.fallbackCache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });

    // Clear any existing timer
    if (this.ttlTimers.has(key)) {
      clearTimeout(this.ttlTimers.get(key));
    }

    // Set TTL timer
    const timer = setTimeout(() => {
      this.fallbackCache.delete(key);
      this.ttlTimers.delete(key);
    }, ttlSeconds * 1000);

    this.ttlTimers.set(key, timer);

    return true;
  }

  /**
   * Delete specific key
   *
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success
   */
  async delete(key) {
    if (this.connected && this.client) {
      try {
        await this.client.del(key);
      } catch (error) {
        console.error(`❌ [CACHE] Redis delete error for key ${key}:`, error.message);
      }
    }

    // Fallback
    if (this.ttlTimers.has(key)) {
      clearTimeout(this.ttlTimers.get(key));
      this.ttlTimers.delete(key);
    }
    this.fallbackCache.delete(key);

    return true;
  }

  /**
   * Invalidate cache key(s) by pattern
   *
   * @param {string} pattern - Pattern with wildcards (e.g. 'tms:orders:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidate(pattern) {
    let deletedCount = 0;

    // Redis
    if (this.connected && this.client) {
      try {
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          deletedCount = await this.client.del(...keys);
          console.log(`🗑️  [CACHE] Invalidated ${deletedCount} Redis keys: ${pattern}`);
        }
      } catch (error) {
        console.error(`❌ [CACHE] Redis invalidate error for pattern ${pattern}:`, error.message);
      }
    }

    // Fallback: clear all matching keys
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    for (const key of this.fallbackCache.keys()) {
      if (regex.test(key)) {
        if (this.ttlTimers.has(key)) {
          clearTimeout(this.ttlTimers.get(key));
          this.ttlTimers.delete(key);
        }
        this.fallbackCache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0 && !this.connected) {
      console.log(`🗑️  [CACHE] Invalidated ${deletedCount} memory keys: ${pattern}`);
    }

    return deletedCount;
  }

  /**
   * Generate hash for complex query objects
   *
   * @param {object} query - Query object to hash
   * @returns {string} MD5 hash
   */
  generateHash(query) {
    const sorted = JSON.stringify(query, Object.keys(query).sort());
    return crypto.createHash('md5').update(sorted).digest('hex');
  }

  /**
   * Get connection status cache
   *
   * @param {string} connectionId - Connection ID
   * @returns {Promise<any|null>} Cached connection status
   */
  async getConnectionStatus(connectionId) {
    return this.get(`tms:sync:status:${connectionId}`);
  }

  /**
   * Set connection status cache
   *
   * @param {string} connectionId - Connection ID
   * @param {object} status - Connection status object
   * @param {number} ttl - TTL in seconds (default: 30)
   * @returns {Promise<boolean>} Success
   */
  async setConnectionStatus(connectionId, status, ttl = this.DEFAULT_TTL.status) {
    return this.set(`tms:sync:status:${connectionId}`, status, ttl);
  }

  /**
   * Get filtered orders cache
   *
   * @param {object} filters - Filter object
   * @returns {Promise<any|null>} Cached orders
   */
  async getFilteredOrders(filters) {
    const hash = this.generateHash(filters);
    return this.get(`tms:orders:filtered:${hash}`);
  }

  /**
   * Set filtered orders cache
   *
   * @param {object} filters - Filter object
   * @param {array} orders - Orders array
   * @param {number} ttl - TTL in seconds (default: 300 = 5min)
   * @returns {Promise<boolean>} Success
   */
  async setFilteredOrders(filters, orders, ttl = this.DEFAULT_TTL.orders) {
    const hash = this.generateHash(filters);
    return this.set(`tms:orders:filtered:${hash}`, orders, ttl);
  }

  /**
   * Get carrier cache
   *
   * @param {string} carrierId - Carrier ID
   * @returns {Promise<any|null>} Cached carrier
   */
  async getCarrier(carrierId) {
    return this.get(`tms:carriers:${carrierId}`);
  }

  /**
   * Set carrier cache
   *
   * @param {string} carrierId - Carrier ID
   * @param {object} carrier - Carrier object
   * @param {number} ttl - TTL in seconds (default: 3600 = 1h)
   * @returns {Promise<boolean>} Success
   */
  async setCarrier(carrierId, carrier, ttl = this.DEFAULT_TTL.carriers) {
    return this.set(`tms:carriers:${carrierId}`, carrier, ttl);
  }

  /**
   * Invalidate all TMS caches
   *
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateAll() {
    return this.invalidate('tms:*');
  }

  /**
   * Get cache stats
   *
   * @returns {Promise<object>} Cache statistics
   */
  async getStats() {
    if (this.connected && this.client) {
      try {
        const info = await this.client.info('stats');
        const keys = await this.client.keys('tms:*');

        // Parse memory usage
        const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
        const memoryUsage = memoryMatch ? memoryMatch[1] : 'unknown';

        // Parse total connections
        const connectionsMatch = info.match(/total_connections_received:([^\r\n]+)/);
        const totalConnections = connectionsMatch ? parseInt(connectionsMatch[1]) : 0;

        return {
          connected: true,
          mode: 'redis',
          totalKeys: keys.length,
          tmsKeys: keys.length,
          memoryUsage,
          totalConnections,
          url: process.env.REDIS_URL ? process.env.REDIS_URL.replace(/:[^:]*@/, ':***@') : 'N/A'
        };
      } catch (error) {
        return {
          connected: false,
          error: error.message,
          mode: 'redis (error)'
        };
      }
    }

    // Fallback stats
    return {
      connected: false,
      mode: 'memory-fallback',
      totalKeys: this.fallbackCache.size,
      tmsKeys: this.fallbackCache.size,
      memoryUsage: 'N/A',
      activeTimers: this.ttlTimers.size
    };
  }

  /**
   * Health check
   *
   * @returns {Promise<boolean>} True if cache is healthy
   */
  async healthCheck() {
    try {
      const testKey = 'tms:health:check';
      const testValue = { test: true, timestamp: Date.now() };

      await this.set(testKey, testValue, 10);
      const retrieved = await this.get(testKey);
      await this.delete(testKey);

      return retrieved !== null && retrieved.test === true;
    } catch (error) {
      console.error('[CACHE] Health check failed:', error.message);
      return false;
    }
  }

  /**
   * Close Redis connection
   *
   * @returns {Promise<void>}
   */
  async close() {
    if (this.client) {
      try {
        await this.client.quit();
        this.connected = false;
        console.log('✅ [CACHE] Redis connection closed gracefully');
      } catch (error) {
        console.error('❌ [CACHE] Error closing Redis connection:', error.message);
      }
    }

    // Clear all fallback timers
    for (const timer of this.ttlTimers.values()) {
      clearTimeout(timer);
    }
    this.ttlTimers.clear();
    this.fallbackCache.clear();
  }
}

// Export singleton instance
module.exports = new RedisCacheService();
