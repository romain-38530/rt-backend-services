#!/usr/bin/env node
/**
 * Script de test du cache Redis
 *
 * Usage: node scripts/test-redis-cache.cjs
 */

require('dotenv').config();

async function testRedisCache() {
  console.log('🧪 Testing Redis Cache Service...\n');

  // Import du service cache
  const cacheService = require('../services/redis-cache.service');

  try {
    // Test 1: Initialisation
    console.log('[1/7] Initializing Redis...');
    await cacheService.init();
    const stats = await cacheService.getStats();
    console.log(`   Mode: ${stats.mode}`);
    console.log(`   Connected: ${stats.connected}`);
    if (stats.url) console.log(`   URL: ${stats.url}`);
    console.log('   ✅ Initialized\n');

    // Test 2: Health check
    console.log('[2/7] Health check...');
    const healthy = await cacheService.healthCheck();
    if (healthy) {
      console.log('   ✅ Health check passed\n');
    } else {
      console.log('   ⚠️  Health check failed (using fallback)\n');
    }

    // Test 3: SET operation
    console.log('[3/7] Testing SET...');
    const testData = {
      test: 'data',
      timestamp: Date.now(),
      nested: { value: 123 }
    };
    await cacheService.set('test:key:1', testData, 30);
    console.log('   ✅ SET successful\n');

    // Test 4: GET operation
    console.log('[4/7] Testing GET...');
    const retrieved = await cacheService.get('test:key:1');
    if (JSON.stringify(retrieved) === JSON.stringify(testData)) {
      console.log('   ✅ GET successful (data matches)\n');
    } else {
      console.log('   ❌ GET failed (data mismatch)');
      console.log('   Expected:', testData);
      console.log('   Got:', retrieved);
      console.log('');
    }

    // Test 5: Connection status helpers
    console.log('[5/7] Testing connection status helpers...');
    const connectionId = '507f1f77bcf86cd799439011';
    const connectionData = {
      id: connectionId,
      tmsType: 'dashdoc',
      isActive: true,
      lastSync: new Date().toISOString()
    };
    await cacheService.setConnectionStatus(connectionId, connectionData);
    const cachedConnection = await cacheService.getConnectionStatus(connectionId);
    if (cachedConnection && cachedConnection.id === connectionId) {
      console.log('   ✅ Connection status helpers working\n');
    } else {
      console.log('   ❌ Connection status helpers failed\n');
    }

    // Test 6: Filtered orders helpers
    console.log('[6/7] Testing filtered orders helpers...');
    const filters = { city: 'Paris', status: 'PENDING', limit: 10 };
    const ordersData = [
      { id: 1, city: 'Paris', status: 'PENDING' },
      { id: 2, city: 'Paris', status: 'PENDING' }
    ];
    await cacheService.setFilteredOrders(filters, ordersData);
    const cachedOrders = await cacheService.getFilteredOrders(filters);
    if (cachedOrders && Array.isArray(cachedOrders) && cachedOrders.length === 2) {
      console.log('   ✅ Filtered orders helpers working\n');
    } else {
      console.log('   ❌ Filtered orders helpers failed\n');
    }

    // Test 7: Invalidation
    console.log('[7/7] Testing invalidation...');
    await cacheService.set('test:key:2', { data: 'test2' }, 30);
    await cacheService.set('test:key:3', { data: 'test3' }, 30);
    await cacheService.set('other:key:1', { data: 'other' }, 30);

    const deletedCount = await cacheService.invalidate('test:*');
    console.log(`   Deleted ${deletedCount} keys matching 'test:*'`);

    const stillExists = await cacheService.get('test:key:2');
    const otherStillExists = await cacheService.get('other:key:1');

    if (!stillExists && otherStillExists) {
      console.log('   ✅ Invalidation successful\n');
    } else {
      console.log('   ⚠️  Invalidation partial or failed\n');
    }

    // Final stats
    console.log('Final cache stats:');
    const finalStats = await cacheService.getStats();
    console.log(JSON.stringify(finalStats, null, 2));
    console.log('');

    // Cleanup
    console.log('Cleaning up test keys...');
    await cacheService.invalidate('test:*');
    await cacheService.invalidate('other:*');
    await cacheService.delete(`tms:sync:status:${connectionId}`);
    console.log('✅ Cleanup done\n');

    console.log('✅ All tests completed!');

    // Close connection
    await cacheService.close();

  } catch (error) {
    console.error('❌ Test failed:', error);
    await cacheService.close();
    process.exit(1);
  }
}

testRedisCache().catch(console.error);
