#!/usr/bin/env node
/**
 * Script pour créer les indexes de la collection email_logs
 *
 * Usage: node scripts/setup-email-logs-indexes.cjs
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

async function setupEmailLogsIndexes() {
  console.log('📧 Setting up email_logs indexes...\n');

  const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/rt-authz';
  let client;

  try {
    console.log('[1/3] Connecting to MongoDB...');
    client = new MongoClient(mongoUrl);
    await client.connect();
    const db = client.db();
    console.log('   ✅ Connected to MongoDB\n');

    console.log('[2/3] Creating email_logs collection...');

    // Créer la collection si elle n'existe pas
    const collections = await db.listCollections({ name: 'email_logs' }).toArray();
    if (collections.length === 0) {
      await db.createCollection('email_logs');
      console.log('   ✅ Collection email_logs created');
    } else {
      console.log('   ✅ Collection email_logs already exists');
    }

    console.log('\n[3/3] Creating indexes...');

    // Index pour recherches par date
    await db.collection('email_logs').createIndex({ sentAt: -1 });
    console.log('   ✅ Index created: sentAt (desc)');

    // Index pour recherches par status
    await db.collection('email_logs').createIndex({ status: 1 });
    console.log('   ✅ Index created: status');

    // Index pour recherches par type
    await db.collection('email_logs').createIndex({ type: 1 });
    console.log('   ✅ Index created: type');

    // Index pour recherches par carrier
    await db.collection('email_logs').createIndex({ carrierId: 1 });
    console.log('   ✅ Index created: carrierId');

    // Index pour recherches par destinataire
    await db.collection('email_logs').createIndex({ to: 1 });
    console.log('   ✅ Index created: to');

    // Index composite pour stats
    await db.collection('email_logs').createIndex({ type: 1, status: 1, sentAt: -1 });
    console.log('   ✅ Index created: type + status + sentAt (composite)');

    // Index composite pour failed emails
    await db.collection('email_logs').createIndex({ status: 1, sentAt: -1 });
    console.log('   ✅ Index created: status + sentAt (composite)');

    console.log('\n✅ All indexes created successfully!\n');

    // Afficher les indexes
    console.log('📋 Current indexes:');
    const indexes = await db.collection('email_logs').indexes();
    indexes.forEach((index, i) => {
      console.log(`   [${i + 1}] ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed.');
    }
  }
}

setupEmailLogsIndexes().catch(console.error);
