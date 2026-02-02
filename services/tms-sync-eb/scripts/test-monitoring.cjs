#!/usr/bin/env node
/**
 * Script de test du système de monitoring
 *
 * Usage: node scripts/test-monitoring.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function testMonitoring() {
  console.log('🧪 Testing Monitoring System...\n');

  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-tms-sync';
  let client;
  let db;

  try {
    // Test 1: Connexion MongoDB
    console.log('[1/6] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('   ✅ Connected to MongoDB\n');

    // Test 2: Créer collection monitoring_logs si elle n'existe pas
    console.log('[2/6] Checking monitoring_logs collection...');
    const collections = await db.listCollections({ name: 'monitoring_logs' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('monitoring_logs');
      console.log('   ✅ Collection monitoring_logs created');
    } else {
      console.log('   ✅ Collection monitoring_logs exists');
    }

    // Créer les indexes
    await db.collection('monitoring_logs').createIndex({ timestamp: -1 });
    await db.collection('monitoring_logs').createIndex({ 'anomalies.type': 1 });
    await db.collection('monitoring_logs').createIndex({ 'anomalies.severity': 1 });
    console.log('   ✅ Indexes created\n');

    // Test 3: Insérer un log de monitoring simulé
    console.log('[3/6] Inserting test monitoring log...');
    const testLog = {
      timestamp: new Date(),
      jobs: {
        autoSync: { success: true, duration: 1500, transportsCount: 150 },
        updateStatuses: { success: true, duration: 800, transportsCount: 75 },
        syncCarriers: { success: false, duration: 5000, error: 'Connection timeout' }
      },
      anomalies: [
        {
          type: 'SYNC_ERROR',
          job: 'syncCarriers',
          severity: 'error',
          message: 'Failed to sync carriers',
          timestamp: new Date(),
          details: { error: 'Connection timeout', duration: 5000 }
        }
      ],
      alerts: []
    };

    const insertResult = await db.collection('monitoring_logs').insertOne(testLog);
    console.log(`   ✅ Test log inserted with ID: ${insertResult.insertedId}\n`);

    // Test 4: Insérer un log avec anomalie critique
    console.log('[4/6] Inserting critical anomaly log...');
    const criticalLog = {
      timestamp: new Date(),
      jobs: {
        autoSync: { success: true, duration: 1200, transportsCount: 100 }
      },
      anomalies: [
        {
          type: 'NO_SYNC',
          job: 'autoSync',
          severity: 'critical',
          message: 'No sync in the last 10 minutes',
          timestamp: new Date(),
          details: { timeSinceLastSync: 15 * 60 * 1000 }
        }
      ],
      alerts: [
        {
          type: 'sms',
          destination: '+33612345678',
          status: 'sent',
          timestamp: new Date()
        }
      ]
    };

    const criticalResult = await db.collection('monitoring_logs').insertOne(criticalLog);
    console.log(`   ✅ Critical log inserted with ID: ${criticalResult.insertedId}\n`);

    // Test 5: Récupérer les logs récents
    console.log('[5/6] Fetching recent logs...');
    const recentLogs = await db.collection('monitoring_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();

    console.log(`   Found ${recentLogs.length} recent logs`);
    recentLogs.forEach((log, index) => {
      const anomaliesCount = log.anomalies?.length || 0;
      const alertsCount = log.alerts?.length || 0;
      console.log(`   [${index + 1}] ${log.timestamp.toISOString()}: ${anomaliesCount} anomalies, ${alertsCount} alerts`);
    });
    console.log('   ✅ Logs fetched successfully\n');

    // Test 6: Agréger les anomalies actives
    console.log('[6/6] Aggregating active anomalies...');
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const activeAnomalies = await db.collection('monitoring_logs')
      .aggregate([
        { $match: { timestamp: { $gte: thirtyMinutesAgo } } },
        { $unwind: '$anomalies' },
        { $group: {
          _id: '$anomalies.type',
          count: { $sum: 1 },
          lastOccurrence: { $max: '$timestamp' },
          severity: { $first: '$anomalies.severity' }
        }},
        { $sort: { lastOccurrence: -1 } }
      ])
      .toArray();

    console.log(`   Found ${activeAnomalies.length} active anomaly types:`);
    activeAnomalies.forEach(anomaly => {
      console.log(`   - ${anomaly._id}: ${anomaly.count} occurrences (${anomaly.severity})`);
    });
    console.log('   ✅ Aggregation successful\n');

    // Test 7: Simulation de l'endpoint /api/v1/monitoring/status
    console.log('[Bonus] Simulating monitoring status endpoint...');
    const totalAnomalies = recentLogs.reduce((sum, log) => sum + (log.anomalies?.length || 0), 0);
    const criticalAnomalies = recentLogs.reduce((sum, log) =>
      sum + (log.anomalies?.filter(a => a.severity === 'critical').length || 0), 0);

    const statusResponse = {
      success: true,
      timestamp: new Date().toISOString(),
      recentLogs,
      activeAnomalies,
      metrics: {
        totalAnomalies,
        criticalAnomalies,
        logsCount: recentLogs.length
      }
    };

    console.log('   Status Response:');
    console.log(`   - Total anomalies: ${statusResponse.metrics.totalAnomalies}`);
    console.log(`   - Critical anomalies: ${statusResponse.metrics.criticalAnomalies}`);
    console.log(`   - Logs count: ${statusResponse.metrics.logsCount}`);
    console.log('   ✅ Endpoint simulation successful\n');

    console.log('✅ All monitoring tests completed!\n');

    // Cleanup
    console.log('Cleaning up test logs...');
    await db.collection('monitoring_logs').deleteMany({
      _id: { $in: [insertResult.insertedId, criticalResult.insertedId] }
    });
    console.log('✅ Cleanup done\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed.');
    }
  }
}

testMonitoring().catch(console.error);
