# Redis Cache Service - TMS Sync

## Vue d'ensemble

Service de cache Redis avec fallback automatique en mémoire pour optimiser les performances du TMS Sync API.

## Features

- **Client ioredis** avec retry strategy (3 tentatives)
- **Fallback memory Map** si Redis indisponible
- **TTL automatique** par type de données
- **Pattern de clés** standardisé
- **Health check** intégré
- **Invalidation** par pattern (wildcards)

## Installation

```bash
cd services/tms-sync-eb
npm install
```

## Configuration

### Variables d'environnement

```.env
# Redis URL (optionnel - fallback mémoire si absent)
REDIS_URL=redis://localhost:6379

# Ou pour AWS ElastiCache
REDIS_URL=redis://symphonia-cache.abc123.ng.0001.euw3.cache.amazonaws.com:6379

# Ou avec authentification
REDIS_URL=redis://username:password@hostname:6379
```

Si `REDIS_URL` n'est pas configuré, le service utilise automatiquement un cache en mémoire avec les mêmes fonctionnalités.

## Usage

### Import

```javascript
const cacheService = require('./services/redis-cache.service');

// Initialiser (dans index.js au démarrage)
await cacheService.init();
```

### Opérations de base

```javascript
// SET avec TTL
await cacheService.set('my:key', { data: 'value' }, 300); // 300s = 5min

// GET
const data = await cacheService.get('my:key');

// DELETE
await cacheService.delete('my:key');

// INVALIDATE par pattern
await cacheService.invalidate('tms:orders:*'); // Supprime toutes les clés matchant
```

### Helpers spécialisés

```javascript
// Connection status (TTL: 30s)
await cacheService.setConnectionStatus(connectionId, connectionData);
const connection = await cacheService.getConnectionStatus(connectionId);

// Filtered orders (TTL: 5min)
await cacheService.setFilteredOrders(filters, ordersData);
const orders = await cacheService.getFilteredOrders(filters);

// Carriers (TTL: 1h)
await cacheService.setCarrier(carrierId, carrierData);
const carrier = await cacheService.getCarrier(carrierId);
```

### Invalidation complète

```javascript
// Invalider tout le cache TMS
await cacheService.invalidateAll(); // Équivalent à invalidate('tms:*')
```

## Keys Pattern

Le service utilise des clés structurées:

- `tms:sync:status:{connectionId}` - Status connexions TMS
- `tms:orders:filtered:{hash}` - Orders filtrés (hash MD5 des filtres)
- `tms:carriers:{carrierId}` - Données carriers

Le hash pour filtered orders est généré automatiquement à partir des paramètres de requête.

## TTL par défaut

- **Status** (connexions): 30 secondes
- **Orders** (filtrés): 5 minutes (300s)
- **Carriers**: 1 heure (3600s)
- **Défaut**: 5 minutes

## Endpoints API

### GET /api/v1/cache/stats

Statistiques du cache:

```json
{
  "success": true,
  "health": true,
  "cache": {
    "connected": true,
    "mode": "redis",
    "totalKeys": 42,
    "tmsKeys": 42,
    "memoryUsage": "1.23M",
    "url": "redis://***@hostname:6379"
  }
}
```

### POST /api/v1/cache/invalidate

Invalider le cache manuellement:

```bash
curl -X POST http://localhost:3000/api/v1/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "tms:orders:*"}'
```

Response:

```json
{
  "success": true,
  "message": "Cache invalidated for pattern: tms:orders:*",
  "deletedCount": 15,
  "timestamp": "2026-02-01T12:00:00.000Z"
}
```

## Tests

```bash
# Tester le cache Redis
node scripts/test-redis-cache.cjs
```

Le script teste:
1. Initialisation Redis
2. Health check
3. Opérations SET/GET
4. Helpers spécialisés (connection, orders, carriers)
5. Invalidation par pattern
6. Fallback mémoire

## Performance

### Sans cache

```
GET /api/v1/tms/orders/filtered?city=Paris
→ MongoDB query: ~150ms
```

### Avec cache (hit)

```
GET /api/v1/tms/orders/filtered?city=Paris
→ Redis GET: ~5ms (30x plus rapide)
```

## Fallback mémoire

Si Redis n'est pas disponible:

- ✅ Toutes les fonctionnalités restent disponibles
- ✅ TTL géré via `setTimeout()`
- ✅ API identique (aucun changement de code)
- ⚠️ Cache non partagé entre instances (chaque instance a son propre cache)

## Monitoring

### Health check

```javascript
const healthy = await cacheService.healthCheck();
// Test SET/GET avec clé temporaire
```

### Stats

```javascript
const stats = await cacheService.getStats();
console.log(stats.mode); // 'redis' ou 'memory-fallback'
console.log(stats.totalKeys); // Nombre total de clés
```

## Production

### AWS ElastiCache

1. Créer cluster Redis:

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id symphonia-tms-cache \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1 \
  --engine-version 7.0
```

2. Configuration .env:

```env
REDIS_URL=redis://symphonia-tms-cache.abc123.ng.0001.euw3.cache.amazonaws.com:6379
```

### Local development

```bash
# Docker
docker run -d -p 6379:6379 --name redis redis:7-alpine

# macOS (Homebrew)
brew install redis
brew services start redis

# Linux
sudo apt install redis-server
sudo systemctl start redis
```

## Troubleshooting

### Redis connection refused

```
❌ [CACHE] Redis connection failed after 3 retries
⚠️  [CACHE] Falling back to memory cache
```

→ Service fonctionne en mode fallback mémoire. Pas de panique!

### Cache not working

1. Vérifier health: `GET /api/v1/cache/stats`
2. Vérifier logs: `[CACHE HIT]` ou `[CACHE MISS]`
3. Tester: `node scripts/test-redis-cache.cjs`

### Purger le cache

```bash
# Via API
curl -X POST http://localhost:3000/api/v1/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "tms:*"}'

# Via Redis CLI
redis-cli FLUSHDB
```

## Bonnes pratiques

1. **Invalider après modifications**: Après sync TMS, invalider `tms:orders:*`
2. **TTL adaptés**: Courts (30s) pour données temps réel, longs (1h) pour référentiels
3. **Pas de données sensibles**: Ne jamais cacher credentials ou tokens
4. **Monitoring**: Surveiller hit rate via CloudWatch

## Architecture

```
┌─────────────────┐
│  TMS Sync API   │
│    (Express)    │
└────────┬────────┘
         │
    ┌────▼─────┐
    │  Cache   │ ──┐
    │ Service  │   │
    └────┬─────┘   │
         │         │
    ┌────▼─────┐   │  Fallback
    │  Redis   │   │  ◄────────┐
    │ ioredis  │   │           │
    └──────────┘   │      ┌────▼────┐
                   └──────►  Memory  │
                          │   Map    │
                          └──────────┘
```

## Métriques CloudWatch (TODO Phase 3)

- `Cache/Hits` - Nombre de cache hits
- `Cache/Misses` - Nombre de cache misses
- `Cache/HitRate` - Pourcentage de hits
- `Cache/Size` - Taille du cache en KB

---

**Documentation générée le**: 01/02/2026
**Version**: 1.0.0
**Service**: tms-sync-eb v2.4.2
