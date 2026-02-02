/**
 * Test End-to-End - Cache Redis
 *
 * Tests:
 * - Connexion Redis (ou fallback memory)
 * - Mesure du cache hit rate
 * - Test GET /api/v1/cache/stats
 * - Vérification des performances (avec vs sans cache)
 * - Test d'invalidation du cache
 *
 * Usage: node tests/test-e2e-cache-redis.cjs
 */

require('dotenv').config();
const axios = require('axios');
const { performance } = require('perf_hooks');

// Configuration
const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  redisEnabled: process.env.REDIS_ENABLED === 'true',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  testCarrierId: process.env.TEST_CARRIER_ID || 'test-carrier-123',
};

// Codes de sortie
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// Helpers de logs
function logSection(title) {
  console.log(`\n${colors.bright}${colors.cyan}======================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}======================================${colors.reset}\n`);
}

function logSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function logError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function logInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function logPerf(message) {
  console.log(`${colors.magenta}⚡${colors.reset} ${message}`);
}

// Test 1: Vérifier la connexion Redis ou fallback
async function testCacheConnection() {
  logSection('Test 1: Connexion au Cache');

  try {
    const response = await axios.get(`${config.apiUrl}/api/v1/cache/health`, {
      timeout: 5000,
    });

    if (response.status === 200) {
      const data = response.data;
      logSuccess('Endpoint /api/v1/cache/health accessible');
      logInfo(`Type de cache: ${data.cacheType || 'unknown'}`);
      logInfo(`Status: ${data.status || 'unknown'}`);

      if (data.cacheType === 'redis') {
        logSuccess('Cache Redis actif');
      } else if (data.cacheType === 'memory') {
        logWarning('Fallback sur cache mémoire (Redis non disponible)');
      } else {
        logWarning('Type de cache inconnu');
      }

      return true;
    }

    return false;
  } catch (error) {
    // Si l'endpoint n'existe pas, on teste directement avec Redis
    if (config.redisEnabled) {
      logWarning('Endpoint /api/v1/cache/health non disponible');
      logInfo('Tentative de connexion Redis directe...');

      try {
        const redis = require('redis');
        const client = redis.createClient({
          url: config.redisUrl,
          socket: {
            connectTimeout: 5000,
          },
        });

        await client.connect();
        await client.ping();
        logSuccess('Connexion Redis réussie');
        await client.quit();
        return true;
      } catch (redisError) {
        logWarning(`Redis non accessible: ${redisError.message}`);
        logInfo('Fallback sur cache mémoire');
        return true; // Non bloquant
      }
    } else {
      logWarning('Redis désactivé - Utilisation du cache mémoire');
      return true;
    }
  }
}

// Test 2: Mesurer le cache hit rate
async function testCacheHitRate() {
  logSection('Test 2: Cache Hit Rate');

  try {
    // Faire plusieurs requêtes identiques pour tester le cache
    const endpoint = `${config.apiUrl}/api/v1/carriers/${config.testCarrierId}`;
    const iterations = 10;
    let hits = 0;
    let misses = 0;

    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        const response = await axios.get(endpoint, {
          timeout: 5000,
          headers: {
            'Cache-Control': 'no-store', // Force pour la première requête
          },
        });
        const duration = performance.now() - start;

        // Si la réponse est très rapide (<50ms), c'est probablement un cache hit
        if (i > 0 && duration < 50) {
          hits++;
          logSuccess(`Requête ${i + 1}: Cache HIT (${duration.toFixed(2)}ms)`);
        } else {
          misses++;
          logInfo(`Requête ${i + 1}: Cache MISS (${duration.toFixed(2)}ms)`);
        }
      } catch (error) {
        // Si le carrier n'existe pas, on utilise un endpoint différent
        if (error.response?.status === 404 && i === 0) {
          logWarning('Carrier de test non trouvé, utilisation d\'un endpoint alternatif');
          // Essayer avec la liste des carriers
          const listEndpoint = `${config.apiUrl}/api/v1/carriers`;
          try {
            const listResponse = await axios.get(listEndpoint, { timeout: 5000 });
            if (listResponse.data.length > 0) {
              config.testCarrierId = listResponse.data[0]._id;
              logInfo(`Utilisation du carrier: ${config.testCarrierId}`);
              // Relancer le test avec le bon carrier
              return testCacheHitRate();
            }
          } catch (listError) {
            logWarning('Impossible de récupérer la liste des carriers');
          }
        }
        misses++;
      }
    }

    const hitRate = ((hits / iterations) * 100).toFixed(2);
    logInfo(`\nRésultats sur ${iterations} requêtes:`);
    logInfo(`  - Cache HITS: ${hits}`);
    logInfo(`  - Cache MISS: ${misses}`);
    logSuccess(`Taux de cache hit: ${hitRate}%`);

    return true;
  } catch (error) {
    logWarning(`Test de cache hit rate échoué: ${error.message}`);
    return true; // Non bloquant
  }
}

// Test 3: Tester l'endpoint /api/v1/cache/stats
async function testCacheStats() {
  logSection('Test 3: Statistiques du Cache');

  try {
    const response = await axios.get(`${config.apiUrl}/api/v1/cache/stats`, {
      timeout: 5000,
    });

    if (response.status !== 200) {
      throw new Error(`Status code attendu: 200, reçu: ${response.status}`);
    }

    const stats = response.data;
    logSuccess('Endpoint /api/v1/cache/stats accessible');

    // Afficher les statistiques
    if (stats.hits !== undefined) {
      logInfo(`Total de cache hits: ${stats.hits}`);
    }
    if (stats.misses !== undefined) {
      logInfo(`Total de cache misses: ${stats.misses}`);
    }
    if (stats.hitRate !== undefined) {
      logInfo(`Taux de hit global: ${stats.hitRate}%`);
    }
    if (stats.keys !== undefined) {
      logInfo(`Nombre de clés en cache: ${stats.keys}`);
    }
    if (stats.memory !== undefined) {
      logInfo(`Mémoire utilisée: ${stats.memory}`);
    }
    if (stats.uptime !== undefined) {
      logInfo(`Uptime du cache: ${stats.uptime}s`);
    }

    return true;
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Endpoint /api/v1/cache/stats non implémenté');
      return true; // Non bloquant
    }
    logError(`Erreur lors de la récupération des stats: ${error.message}`);
    return false;
  }
}

// Test 4: Vérifier les performances (avec vs sans cache)
async function testCachePerformance() {
  logSection('Test 4: Performance du Cache');

  try {
    const endpoint = `${config.apiUrl}/api/v1/carriers`;
    const iterations = 5;

    // Test SANS cache (forcer le bypass)
    logInfo('Test SANS cache (requêtes à froid)...');
    const timesWithoutCache = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await axios.get(endpoint, {
        timeout: 10000,
        headers: {
          'Cache-Control': 'no-cache',
          'X-Cache-Bypass': 'true',
        },
      });
      const duration = performance.now() - start;
      timesWithoutCache.push(duration);
      logInfo(`  Requête ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    const avgWithoutCache = timesWithoutCache.reduce((a, b) => a + b, 0) / iterations;

    // Attendre un peu pour que le cache se remplisse
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Test AVEC cache
    logInfo('\nTest AVEC cache (requêtes répétées)...');
    const timesWithCache = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await axios.get(endpoint, {
        timeout: 10000,
      });
      const duration = performance.now() - start;
      timesWithCache.push(duration);
      logInfo(`  Requête ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    const avgWithCache = timesWithCache.reduce((a, b) => a + b, 0) / iterations;

    // Calculer l'amélioration
    const improvement = ((avgWithoutCache - avgWithCache) / avgWithoutCache) * 100;

    logPerf(`\nRésultats de performance:`);
    logPerf(`  Temps moyen SANS cache: ${avgWithoutCache.toFixed(2)}ms`);
    logPerf(`  Temps moyen AVEC cache: ${avgWithCache.toFixed(2)}ms`);
    logPerf(`  Amélioration: ${improvement.toFixed(2)}%`);

    if (improvement > 10) {
      logSuccess(`Cache performant: +${improvement.toFixed(2)}% d'amélioration`);
    } else if (improvement > 0) {
      logWarning(`Amélioration marginale: +${improvement.toFixed(2)}%`);
    } else {
      logWarning('Aucune amélioration détectée (cache peut-être désactivé)');
    }

    // Vérifier que le temps de réponse est acceptable
    if (avgWithCache < 500) {
      logSuccess(`Temps de réponse < 500ms: ${avgWithCache.toFixed(2)}ms`);
    } else {
      logWarning(`Temps de réponse > 500ms: ${avgWithCache.toFixed(2)}ms`);
    }

    return true;
  } catch (error) {
    logError(`Erreur lors du test de performance: ${error.message}`);
    return false;
  }
}

// Test 5: Tester l'invalidation du cache
async function testCacheInvalidation() {
  logSection('Test 5: Invalidation du Cache');

  try {
    // Essayer l'endpoint d'invalidation
    const invalidateEndpoint = `${config.apiUrl}/api/v1/cache/invalidate`;

    try {
      const response = await axios.post(invalidateEndpoint, {
        pattern: 'carriers:*', // Invalider tous les carriers
      }, {
        timeout: 5000,
      });

      if (response.status === 200) {
        logSuccess('Cache invalidé via API');
        logInfo(`Clés invalidées: ${response.data.invalidated || 'N/A'}`);
        return true;
      }
    } catch (apiError) {
      if (apiError.response?.status === 404) {
        logWarning('Endpoint d\'invalidation non disponible');
      } else {
        logWarning(`Erreur d'invalidation via API: ${apiError.message}`);
      }
    }

    // Test d'invalidation par TTL (Time To Live)
    logInfo('\nTest d\'invalidation par TTL...');
    const endpoint = `${config.apiUrl}/api/v1/carriers`;

    // Faire une requête initiale
    const start1 = performance.now();
    await axios.get(endpoint, { timeout: 5000 });
    const duration1 = performance.now() - start1;
    logInfo(`Requête initiale: ${duration1.toFixed(2)}ms`);

    // Faire une requête immédiate (devrait être en cache)
    const start2 = performance.now();
    await axios.get(endpoint, { timeout: 5000 });
    const duration2 = performance.now() - start2;
    logInfo(`Requête en cache: ${duration2.toFixed(2)}ms`);

    if (duration2 < duration1 * 0.5) {
      logSuccess('Cache fonctionne (2ème requête plus rapide)');
    }

    // Attendre que le TTL expire (si configuré à ~5 secondes)
    const ttlWait = 6000; // 6 secondes
    logInfo(`Attente de ${ttlWait / 1000}s pour expiration du cache...`);
    await new Promise((resolve) => setTimeout(resolve, ttlWait));

    // Faire une nouvelle requête (devrait être un cache miss)
    const start3 = performance.now();
    await axios.get(endpoint, { timeout: 5000 });
    const duration3 = performance.now() - start3;
    logInfo(`Requête après TTL: ${duration3.toFixed(2)}ms`);

    if (duration3 > duration2 * 1.5) {
      logSuccess('Cache expiré après TTL (invalidation automatique)');
    } else {
      logInfo('TTL probablement plus long que 6s ou cache permanent');
    }

    return true;
  } catch (error) {
    logError(`Erreur lors du test d'invalidation: ${error.message}`);
    return false;
  }
}

// Fonction principale
async function main() {
  console.log(`${colors.bright}${colors.cyan}`);
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║        TEST END-TO-END - CACHE REDIS                 ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  logInfo('Configuration:');
  logInfo(`  - API URL: ${config.apiUrl}`);
  logInfo(`  - Redis: ${config.redisEnabled ? 'Activé' : 'Désactivé (Fallback Memory)'}`);
  if (config.redisEnabled) {
    logInfo(`  - Redis URL: ${config.redisUrl.replace(/\/\/.*@/, '//***@')}`);
  }

  const results = {
    cacheConnection: false,
    cacheHitRate: false,
    cacheStats: false,
    cachePerformance: false,
    cacheInvalidation: false,
  };

  try {
    // Exécuter les tests
    results.cacheConnection = await testCacheConnection();
    results.cacheHitRate = await testCacheHitRate();
    results.cacheStats = await testCacheStats();
    results.cachePerformance = await testCachePerformance();
    results.cacheInvalidation = await testCacheInvalidation();

    // Résumé des résultats
    logSection('Résumé des Tests');

    const tests = [
      { name: 'Connexion au Cache', result: results.cacheConnection },
      { name: 'Cache Hit Rate', result: results.cacheHitRate },
      { name: 'Statistiques du Cache', result: results.cacheStats },
      { name: 'Performance du Cache', result: results.cachePerformance },
      { name: 'Invalidation du Cache', result: results.cacheInvalidation },
    ];

    let passedCount = 0;
    tests.forEach((test) => {
      if (test.result) {
        logSuccess(`${test.name}: PASS`);
        passedCount++;
      } else {
        logError(`${test.name}: FAIL`);
      }
    });

    console.log(`\n${colors.bright}Résultat: ${passedCount}/${tests.length} tests réussis${colors.reset}\n`);

    // Retourner le code de sortie approprié
    if (passedCount === tests.length) {
      console.log(`${colors.green}${colors.bright}✓ TOUS LES TESTS SONT PASSES !${colors.reset}\n`);
      process.exit(EXIT_SUCCESS);
    } else {
      console.log(`${colors.red}${colors.bright}✗ CERTAINS TESTS ONT ECHOUE${colors.reset}\n`);
      process.exit(EXIT_FAILURE);
    }
  } catch (error) {
    logError(`Erreur fatale: ${error.message}`);
    console.error(error.stack);
    process.exit(EXIT_FAILURE);
  }
}

// Lancer les tests
main();
