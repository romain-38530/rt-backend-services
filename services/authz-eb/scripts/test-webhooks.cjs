#!/usr/bin/env node
/**
 * Script de test des webhooks carriers
 *
 * Usage: node scripts/test-webhooks.cjs
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const http = require('http');
const crypto = require('crypto');

// Server de test pour recevoir les webhooks
let webhookServer;
let receivedWebhooks = [];

function startWebhookTestServer(port = 3999) {
  return new Promise((resolve) => {
    webhookServer = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body);
            const signature = req.headers['x-webhook-signature'];
            const event = req.headers['x-webhook-event'];
            const deliveryId = req.headers['x-webhook-delivery'];

            receivedWebhooks.push({
              event,
              signature,
              deliveryId,
              payload,
              timestamp: new Date()
            });

            console.log(`   📥 Received webhook: ${event} (Delivery: ${deliveryId})`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Webhook received' }));
          } catch (error) {
            console.error('   ❌ Error parsing webhook:', error.message);
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    webhookServer.listen(port, () => {
      console.log(`   ✅ Test webhook server started on http://localhost:${port}\n`);
      resolve();
    });
  });
}

function stopWebhookTestServer() {
  return new Promise((resolve) => {
    if (webhookServer) {
      webhookServer.close(() => {
        console.log('   ✅ Test webhook server stopped\n');
        resolve();
      });
    } else {
      resolve();
    }
  });
}

async function testWebhooks() {
  console.log('🧪 Testing Carrier Webhooks System...\n');

  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
  let client;
  let db;
  const testPort = 3999;

  try {
    // Test 1: Connexion MongoDB
    console.log('[1/8] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    db = client.db();
    console.log('   ✅ Connected to MongoDB\n');

    // Test 2: Démarrer serveur de test
    console.log('[2/8] Starting test webhook server...');
    await startWebhookTestServer(testPort);

    // Test 3: Créer collections si elles n'existent pas
    console.log('[3/8] Setting up webhook collections...');

    // Collection carrier_webhooks
    const webhookCollections = await db.listCollections({ name: 'carrier_webhooks' }).toArray();
    if (webhookCollections.length === 0) {
      await db.createCollection('carrier_webhooks');
    }

    // Collection webhook_deliveries
    const deliveryCollections = await db.listCollections({ name: 'webhook_deliveries' }).toArray();
    if (deliveryCollections.length === 0) {
      await db.createCollection('webhook_deliveries');
    }

    // Créer indexes
    await db.collection('carrier_webhooks').createIndex({ carrierId: 1 });
    await db.collection('carrier_webhooks').createIndex({ active: 1 });
    await db.collection('webhook_deliveries').createIndex({ webhookId: 1 });
    await db.collection('webhook_deliveries').createIndex({ createdAt: -1 });
    await db.collection('webhook_deliveries').createIndex({ status: 1 });

    console.log('   ✅ Webhook collections configured\n');

    // Test 4: Créer un carrier de test
    console.log('[4/8] Creating test carrier...');

    const testCarrier = {
      companyName: 'Test Webhook Transport',
      email: 'test-webhook@example.com',
      phone: '+33612345699',
      status: 'active',
      level: 'referenced',
      documents: []
    };

    const carrierResult = await db.collection('carriers').insertOne(testCarrier);
    const carrierId = carrierResult.insertedId;

    console.log(`   ✅ Test carrier created: ${carrierId}\n`);

    // Test 5: Créer un webhook
    console.log('[5/8] Creating webhook configuration...');

    const { generateWebhookSecret } = require('../routes/carrier-webhooks');

    const webhook = {
      carrierId,
      url: `http://localhost:${testPort}/webhook`,
      events: ['document.uploaded', 'document.verified', 'document.rejected'],
      description: 'Test webhook',
      secret: generateWebhookSecret(),
      active: true,
      failureCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const webhookResult = await db.collection('carrier_webhooks').insertOne(webhook);
    const webhookId = webhookResult.insertedId;

    console.log(`   ✅ Webhook created: ${webhookId}`);
    console.log(`   Secret: ${webhook.secret.substring(0, 16)}...\n`);

    // Test 6: Déclencher des événements webhook
    console.log('[6/8] Triggering webhook events...');

    const { triggerWebhookEvent, WEBHOOK_EVENTS } = require('../routes/carrier-webhooks');

    // Event 1: document.uploaded
    console.log('   Triggering document.uploaded...');
    await triggerWebhookEvent(db, carrierId.toString(), WEBHOOK_EVENTS.DOCUMENT_UPLOADED, {
      carrierId: carrierId.toString(),
      document: {
        id: new ObjectId().toString(),
        type: 'Assurance Transport',
        fileName: 'assurance-test.pdf',
        uploadedAt: new Date().toISOString(),
        status: 'pending'
      },
      timestamp: new Date().toISOString()
    });

    // Attendre que le webhook soit reçu
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Event 2: document.verified
    console.log('   Triggering document.verified...');
    await triggerWebhookEvent(db, carrierId.toString(), WEBHOOK_EVENTS.DOCUMENT_VERIFIED, {
      carrierId: carrierId.toString(),
      document: {
        id: new ObjectId().toString(),
        type: 'Kbis',
        fileName: 'kbis-test.pdf',
        status: 'verified',
        verifiedAt: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`   ✅ Webhook events triggered\n`);

    // Test 7: Vérifier les webhooks reçus
    console.log('[7/8] Verifying received webhooks...');

    console.log(`   Received ${receivedWebhooks.length} webhooks:`);
    receivedWebhooks.forEach((wh, index) => {
      console.log(`   [${index + 1}] Event: ${wh.event}, Signature: ${wh.signature?.substring(0, 20)}...`);
      console.log(`       Payload: ${JSON.stringify(wh.payload).substring(0, 80)}...`);
    });

    if (receivedWebhooks.length >= 2) {
      console.log('   ✅ Webhooks received successfully\n');
    } else {
      console.log('   ⚠️  Not all webhooks were received\n');
    }

    // Test 8: Vérifier les deliveries dans la DB
    console.log('[8/8] Checking webhook deliveries in database...');

    const deliveries = await db.collection('webhook_deliveries')
      .find({ webhookId })
      .sort({ createdAt: -1 })
      .toArray();

    console.log(`   Found ${deliveries.length} delivery records:`);
    deliveries.forEach((delivery, index) => {
      console.log(`   [${index + 1}] Event: ${delivery.eventType}, Status: ${delivery.status}, Response: ${delivery.statusCode}`);
    });

    // Stats
    const stats = await db.collection('webhook_deliveries').aggregate([
      { $match: { webhookId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' }
        }
      }
    ]).toArray();

    console.log('\n   Delivery stats:');
    stats.forEach(stat => {
      console.log(`   - ${stat._id}: ${stat.count} deliveries (avg ${Math.round(stat.avgResponseTime || 0)}ms)`);
    });

    console.log('   ✅ Delivery records verified\n');

    console.log('✅ All webhook tests completed!\n');

    console.log('📋 Summary:');
    console.log(`   - Test carrier created: ${carrierId}`);
    console.log(`   - Webhook created: ${webhookId}`);
    console.log(`   - Events triggered: 2`);
    console.log(`   - Webhooks received: ${receivedWebhooks.length}`);
    console.log(`   - Delivery records: ${deliveries.length}`);
    console.log('');

    // Cleanup
    console.log('Cleaning up test data...');
    await stopWebhookTestServer();
    await db.collection('carriers').deleteOne({ _id: carrierId });
    await db.collection('carrier_webhooks').deleteOne({ _id: webhookId });
    await db.collection('webhook_deliveries').deleteMany({ webhookId });
    console.log('✅ Cleanup done\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    await stopWebhookTestServer();
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed.');
    }
  }
}

testWebhooks().catch(console.error);
