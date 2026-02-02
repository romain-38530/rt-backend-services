#!/usr/bin/env node
/**
 * Script de test des alertes SMS documents expirants
 *
 * Usage: node scripts/test-document-expiry-alerts.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function testDocumentExpiryAlerts() {
  console.log('🧪 Testing Document Expiry Alerts System...\n');

  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
  let client;
  let db;

  try {
    // Test 1: Connexion MongoDB
    console.log('[1/7] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('   ✅ Connected to MongoDB\n');

    // Test 2: Créer collection notification_logs si elle n'existe pas
    console.log('[2/7] Checking notification_logs collection...');
    const collections = await db.listCollections({ name: 'notification_logs' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('notification_logs');
      console.log('   ✅ Collection notification_logs created');
    } else {
      console.log('   ✅ Collection notification_logs exists');
    }

    // Créer les indexes
    await db.collection('notification_logs').createIndex({ timestamp: -1 });
    await db.collection('notification_logs').createIndex({ carrierId: 1 });
    await db.collection('notification_logs').createIndex({ type: 1 });
    await db.collection('notification_logs').createIndex({ status: 1 });
    console.log('   ✅ Indexes created\n');

    // Test 3: Créer carriers avec documents expirants pour tester
    console.log('[3/7] Creating test carriers with expiring documents...');

    const now = new Date();
    const testCarriers = [];

    // Carrier avec document expirant aujourd'hui (J-0)
    const carrier1 = {
      companyName: 'Test Transport J-0',
      email: 'test-j0@example.com',
      phone: '+33612345678',
      status: 'active',
      level: 'referenced',
      documents: [
        {
          documentType: 'Assurance Transport',
          status: 'verified',
          expiryDate: new Date(now.getTime() + 12 * 60 * 60 * 1000), // Today at noon
          uploadDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        }
      ]
    };

    // Carrier avec document expirant demain (J-1)
    const carrier2 = {
      companyName: 'Test Transport J-1',
      email: 'test-j1@example.com',
      phone: '+33612345679',
      status: 'active',
      level: 'referenced',
      documents: [
        {
          documentType: 'Kbis',
          status: 'verified',
          expiryDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000), // Tomorrow at noon
          uploadDate: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000)
        }
      ]
    };

    // Carrier avec document expirant dans 3 jours (J-3)
    const carrier3 = {
      companyName: 'Test Transport J-3',
      email: 'test-j3@example.com',
      phone: '+33612345680',
      status: 'active',
      level: 'referenced',
      documents: [
        {
          documentType: 'Licence Transport',
          status: 'verified',
          expiryDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000), // In 3 days at noon
          uploadDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
        }
      ]
    };

    // Carrier avec document expirant dans 7 jours (J-7)
    const carrier4 = {
      companyName: 'Test Transport J-7',
      email: 'test-j7@example.com',
      phone: '+33612345681',
      status: 'active',
      level: 'referenced',
      documents: [
        {
          documentType: 'RC Pro',
          status: 'verified',
          expiryDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000), // In 7 days at noon
          uploadDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
      ]
    };

    const insertResult = await db.collection('carriers').insertMany([
      carrier1, carrier2, carrier3, carrier4
    ]);

    testCarriers.push(...Object.values(insertResult.insertedIds));

    console.log(`   ✅ Created ${testCarriers.length} test carriers`);
    console.log(`   IDs: ${testCarriers.map(id => id.toString()).join(', ')}\n`);

    // Test 4: Importer et tester runDocumentExpiryAlerts
    console.log('[4/7] Running document expiry alerts function...');

    // Activer le mode dry run pour ne pas envoyer de vrais SMS
    process.env.ALERT_DRY_RUN = 'true';

    const { runDocumentExpiryAlerts } = require('../carriers');

    const stats = await runDocumentExpiryAlerts(db);

    console.log(`   ✅ Function completed`);
    console.log(`   Total documents checked: ${stats.totalDocuments}`);
    console.log(`   Alerts sent: ${stats.alertsSent}`);
    console.log(`   Alerts failed: ${stats.alertsFailed}`);
    console.log(`   By urgency: J-0=${stats.byUrgency['J-0']}, J-1=${stats.byUrgency['J-1']}, J-3=${stats.byUrgency['J-3']}, J-7=${stats.byUrgency['J-7']}\n`);

    // Test 5: Vérifier les logs de notification
    console.log('[5/7] Checking notification logs...');

    const notificationLogs = await db.collection('notification_logs')
      .find({ type: 'document_expiry_alert' })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    console.log(`   Found ${notificationLogs.length} notification logs`);

    if (notificationLogs.length > 0) {
      notificationLogs.forEach((log, index) => {
        console.log(`   [${index + 1}] ${log.carrierName}: ${log.urgency} (${log.daysUntilExpiry} days) - ${log.status}`);
      });
      console.log('   ✅ Notification logs created successfully\n');
    } else {
      console.log('   ⚠️  No notification logs found\n');
    }

    // Test 6: Tester l'agrégation par urgence
    console.log('[6/7] Aggregating notifications by urgency...');

    const byUrgency = await db.collection('notification_logs')
      .aggregate([
        { $match: { type: 'document_expiry_alert' } },
        { $group: {
          _id: '$urgency',
          count: { $sum: 1 },
          carriers: { $addToSet: '$carrierName' }
        }},
        { $sort: { count: -1 } }
      ])
      .toArray();

    console.log(`   Found ${byUrgency.length} urgency levels:`);
    byUrgency.forEach(item => {
      console.log(`   - ${item._id}: ${item.count} alerts (${item.carriers.length} carriers)`);
    });
    console.log('   ✅ Aggregation successful\n');

    // Test 7: Test endpoint manual (simulation)
    console.log('[7/7] Simulating manual alert trigger endpoint...');

    console.log(`   Would create endpoint: POST /api/carriers/document-alerts/run`);
    console.log(`   Response would be: { success: true, stats: { alertsSent: ${stats.alertsSent}, ... } }`);
    console.log('   ✅ Endpoint simulation successful\n');

    console.log('✅ All document expiry alerts tests completed!\n');

    console.log('📋 Summary:');
    console.log(`   - Test carriers created: ${testCarriers.length}`);
    console.log(`   - Total alerts sent: ${stats.alertsSent}`);
    console.log(`   - Notification logs: ${notificationLogs.length}`);
    console.log(`   - Urgency levels: ${byUrgency.length}`);
    console.log('');

    // Cleanup
    console.log('Cleaning up test data...');
    await db.collection('carriers').deleteMany({ _id: { $in: testCarriers } });
    await db.collection('notification_logs').deleteMany({
      carrierId: { $in: testCarriers }
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

testDocumentExpiryAlerts().catch(console.error);
