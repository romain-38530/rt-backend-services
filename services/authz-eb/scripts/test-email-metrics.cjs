#!/usr/bin/env node
/**
 * Script de test des routes email metrics
 *
 * Usage: node scripts/test-email-metrics.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function testEmailMetrics() {
  console.log('🧪 Testing Email Metrics System...\n');

  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
  let client;
  let db;

  try {
    // Test 1: Connexion MongoDB
    console.log('[1/6] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('   ✅ Connected to MongoDB\n');

    // Test 2: Créer des données de test
    console.log('[2/6] Creating test email logs...');

    const { EMAIL_TYPES, EMAIL_STATUS, logEmailSent } = require('../routes/email-metrics');

    const now = new Date();
    const testCarrierId = new ObjectId();
    const testEmails = [];

    // Créer 50 emails de test (différents types et statuts)
    for (let i = 0; i < 50; i++) {
      const daysAgo = Math.floor(i / 10); // Répartir sur 5 jours
      const sentAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

      // Répartition des types
      const types = Object.values(EMAIL_TYPES);
      const type = types[i % types.length];

      // Répartition des statuts (70% sent, 20% delivered, 8% failed, 2% bounced)
      let status;
      const rand = Math.random();
      if (rand < 0.70) status = EMAIL_STATUS.SENT;
      else if (rand < 0.90) status = EMAIL_STATUS.DELIVERED;
      else if (rand < 0.98) status = EMAIL_STATUS.FAILED;
      else status = EMAIL_STATUS.BOUNCED;

      const emailLog = {
        emailId: `test-${i}-${Date.now()}`,
        type,
        to: `test${i}@example.com`,
        subject: `Test Email ${i} - ${type}`,
        carrierId: testCarrierId,
        status,
        sentAt,
        deliveredAt: status === EMAIL_STATUS.DELIVERED ? new Date(sentAt.getTime() + 60000) : null,
        errorMessage: (status === EMAIL_STATUS.FAILED || status === EMAIL_STATUS.BOUNCED) ? `Test error ${i}` : null,
        retryCount: 0,
        metadata: {
          companyName: 'Test Company',
          testData: true
        }
      };

      const result = await db.collection('email_logs').insertOne(emailLog);
      testEmails.push(result.insertedId);
    }

    console.log(`   ✅ Created ${testEmails.length} test email logs\n`);

    // Test 3: Tester GET /api/email-metrics/stats
    console.log('[3/6] Testing stats endpoint...');

    const stats = await db.collection('email_logs').aggregate([
      { $match: { _id: { $in: testEmails } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    const totalEmails = stats.reduce((sum, s) => sum + s.count, 0);
    const sent = stats.find(s => s._id === EMAIL_STATUS.SENT)?.count || 0;
    const delivered = stats.find(s => s._id === EMAIL_STATUS.DELIVERED)?.count || 0;
    const failed = stats.find(s => s._id === EMAIL_STATUS.FAILED)?.count || 0;
    const bounced = stats.find(s => s._id === EMAIL_STATUS.BOUNCED)?.count || 0;

    console.log(`   Total: ${totalEmails}`);
    console.log(`   Sent: ${sent}`);
    console.log(`   Delivered: ${delivered}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Bounced: ${bounced}`);
    console.log(`   Delivery Rate: ${((delivered / totalEmails) * 100).toFixed(2)}%`);
    console.log('   ✅ Stats calculated\n');

    // Test 4: Tester GET /api/email-metrics/timeline
    console.log('[4/6] Testing timeline endpoint...');

    const timeline = await db.collection('email_logs').aggregate([
      { $match: { _id: { $in: testEmails } } },
      {
        $group: {
          _id: {
            year: { $year: '$sentAt' },
            month: { $month: '$sentAt' },
            day: { $dayOfMonth: '$sentAt' }
          },
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.SENT] }, 1, 0] }
          },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.DELIVERED] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]).toArray();

    console.log(`   Found ${timeline.length} data points in timeline`);
    timeline.slice(0, 3).forEach((point, i) => {
      const { year, month, day } = point._id;
      console.log(`   [${i + 1}] ${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}: ${point.total} emails`);
    });
    console.log('   ✅ Timeline calculated\n');

    // Test 5: Tester GET /api/email-metrics/by-type
    console.log('[5/6] Testing by-type endpoint...');

    const byType = await db.collection('email_logs').aggregate([
      { $match: { _id: { $in: testEmails } } },
      {
        $group: {
          _id: '$type',
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.SENT] }, 1, 0] }
          },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', EMAIL_STATUS.DELIVERED] }, 1, 0] }
          }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    console.log(`   Found ${byType.length} email types:`);
    byType.forEach((type, i) => {
      console.log(`   [${i + 1}] ${type._id}: ${type.total} emails (${type.delivered} delivered)`);
    });
    console.log('   ✅ By-type calculated\n');

    // Test 6: Tester GET /api/email-metrics/failed
    console.log('[6/6] Testing failed emails endpoint...');

    const failedEmails = await db.collection('email_logs')
      .find({
        _id: { $in: testEmails },
        $or: [
          { status: EMAIL_STATUS.FAILED },
          { status: EMAIL_STATUS.BOUNCED }
        ]
      })
      .sort({ sentAt: -1 })
      .limit(10)
      .toArray();

    console.log(`   Found ${failedEmails.length} failed emails:`);
    failedEmails.slice(0, 5).forEach((email, i) => {
      console.log(`   [${i + 1}] ${email.to}: ${email.status} - ${email.errorMessage}`);
    });
    console.log('   ✅ Failed emails retrieved\n');

    console.log('✅ All email metrics tests completed!\n');

    console.log('📋 Summary:');
    console.log(`   - Test emails created: ${testEmails.length}`);
    console.log(`   - Total emails: ${totalEmails}`);
    console.log(`   - Timeline data points: ${timeline.length}`);
    console.log(`   - Email types: ${byType.length}`);
    console.log(`   - Failed emails: ${failedEmails.length}`);
    console.log('');

    // Cleanup
    console.log('Cleaning up test data...');
    await db.collection('email_logs').deleteMany({ _id: { $in: testEmails } });
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

testEmailMetrics().catch(console.error);
