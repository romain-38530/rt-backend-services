/**
 * MongoDB Setup Script - Symphonia Platform v2.2.0
 *
 * Ce script crée toutes les collections et indexes nécessaires
 * pour les services Symphonia Platform
 *
 * Usage:
 *   mongosh "mongodb://user:pass@host/db?authSource=admin" < setup-mongodb-standalone.js
 *
 * Ou directement dans mongosh:
 *   mongosh> load('setup-mongodb-standalone.js')
 */

print('\n╔══════════════════════════════════════════════════════╗');
print('║  SYMPHONIA PLATFORM - MongoDB Setup v2.2.0          ║');
print('╚══════════════════════════════════════════════════════╝\n');

// ============================================================================
// Database: rt-technologie (TMS Sync)
// ============================================================================

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
print('Database: rt-technologie');
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db = db.getSiblingDB('rt-technologie');

// Collection: monitoring_logs
print('[1/6] Creating collection: monitoring_logs');
if (!db.getCollectionNames().includes('monitoring_logs')) {
    db.createCollection('monitoring_logs');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.monitoring_logs.createIndex({ timestamp: -1 }, { background: true });
db.monitoring_logs.createIndex({ 'anomalies.severity': 1 }, { background: true });
db.monitoring_logs.createIndex({ 'anomalies.type': 1 }, { background: true });
print('  ✓ 3 indexes created\n');

// ============================================================================
// Database: rt-authz (Authorization & Carriers)
// ============================================================================

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
print('Database: rt-authz');
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db = db.getSiblingDB('rt-authz');

// Collection: notification_logs
print('[2/6] Creating collection: notification_logs');
if (!db.getCollectionNames().includes('notification_logs')) {
    db.createCollection('notification_logs');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.notification_logs.createIndex({ carrierId: 1 }, { background: true });
db.notification_logs.createIndex({ sentAt: -1 }, { background: true });
db.notification_logs.createIndex({ type: 1 }, { background: true });
db.notification_logs.createIndex({ status: 1 }, { background: true });
print('  ✓ 4 indexes created\n');

// Collection: carrier_webhooks
print('[3/6] Creating collection: carrier_webhooks');
if (!db.getCollectionNames().includes('carrier_webhooks')) {
    db.createCollection('carrier_webhooks');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.carrier_webhooks.createIndex({ carrierId: 1 }, { background: true });
db.carrier_webhooks.createIndex({ active: 1 }, { background: true });
db.carrier_webhooks.createIndex({ createdAt: -1 }, { background: true });
print('  ✓ 3 indexes created\n');

// Collection: webhook_deliveries
print('[4/6] Creating collection: webhook_deliveries');
if (!db.getCollectionNames().includes('webhook_deliveries')) {
    db.createCollection('webhook_deliveries');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.webhook_deliveries.createIndex({ webhookId: 1 }, { background: true });
db.webhook_deliveries.createIndex({ createdAt: -1 }, { background: true });
db.webhook_deliveries.createIndex({ status: 1 }, { background: true });
db.webhook_deliveries.createIndex({ eventType: 1 }, { background: true });
print('  ✓ 4 indexes created\n');

// Collection: email_logs
print('[5/6] Creating collection: email_logs');
if (!db.getCollectionNames().includes('email_logs')) {
    db.createCollection('email_logs');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.email_logs.createIndex({ sentAt: -1 }, { background: true });
db.email_logs.createIndex({ status: 1 }, { background: true });
db.email_logs.createIndex({ type: 1 }, { background: true });
db.email_logs.createIndex({ to: 1 }, { background: true });
db.email_logs.createIndex({ carrierId: 1 }, { background: true });
db.email_logs.createIndex({ emailId: 1 }, { background: true });
// Composite indexes for common queries
db.email_logs.createIndex({ type: 1, status: 1, sentAt: -1 }, { background: true });
db.email_logs.createIndex({ status: 1, sentAt: -1 }, { background: true });
print('  ✓ 8 indexes created\n');

// ============================================================================
// Database: affretia (Affret.IA Analytics)
// ============================================================================

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
print('Database: affretia');
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

db = db.getSiblingDB('affretia');

// Collection: affretia_trial_tracking
print('[6/6] Creating collection: affretia_trial_tracking');
if (!db.getCollectionNames().includes('affretia_trial_tracking')) {
    db.createCollection('affretia_trial_tracking');
    print('  ✓ Collection created');
} else {
    print('  ✓ Collection already exists');
}

print('  Creating indexes...');
db.affretia_trial_tracking.createIndex({ carrierId: 1 }, { unique: true, background: true });
db.affretia_trial_tracking.createIndex({ status: 1 }, { background: true });
db.affretia_trial_tracking.createIndex({ eligibleAt: -1 }, { background: true });
db.affretia_trial_tracking.createIndex({ trialActivatedAt: -1 }, { background: true });
db.affretia_trial_tracking.createIndex({ upgradedAt: -1 }, { background: true });
db.affretia_trial_tracking.createIndex({ blockerReason: 1 }, { background: true });
print('  ✓ 6 indexes created\n');

// ============================================================================
// Summary
// ============================================================================

print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
print('SUMMARY');
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

print('Collections Created: 6');
print('');
print('  rt-technologie:');
print('    • monitoring_logs (3 indexes)');
print('');
print('  rt-authz:');
print('    • notification_logs (4 indexes)');
print('    • carrier_webhooks (3 indexes)');
print('    • webhook_deliveries (4 indexes)');
print('    • email_logs (8 indexes)');
print('');
print('  affretia:');
print('    • affretia_trial_tracking (6 indexes)');
print('');

// Verify collections
db = db.getSiblingDB('rt-technologie');
const rtTechCollections = db.getCollectionNames();
print('rt-technologie collections: ' + rtTechCollections.length);

db = db.getSiblingDB('rt-authz');
const rtAuthzCollections = db.getCollectionNames();
print('rt-authz collections: ' + rtAuthzCollections.length);

db = db.getSiblingDB('affretia');
const affretiaCollections = db.getCollectionNames();
print('affretia collections: ' + affretiaCollections.length);

print('');
print('╔══════════════════════════════════════════════════════╗');
print('║         MONGODB SETUP COMPLETE ✓                     ║');
print('╚══════════════════════════════════════════════════════╝\n');

print('Next Steps:');
print('  1. Verify collections: db.getCollectionNames()');
print('  2. Check indexes: db.email_logs.getIndexes()');
print('  3. Deploy services to AWS Elastic Beanstalk');
print('');
