#!/usr/bin/env node
/**
 * Script d'initialisation MongoDB pour Symphonia Platform
 *
 * Crée toutes les collections et indexes nécessaires
 *
 * Usage: node scripts/init-mongodb.cjs [MONGODB_URI]
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.argv[2] || process.env.MONGODB_URI || 'mongodb://localhost:27017/?authSource=admin';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m'
};

console.log(`\n${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}║  SYMPHONIA PLATFORM - MongoDB Setup v2.2.0          ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚══════════════════════════════════════════════════════╝${colors.reset}\n`);

async function createCollection(db, name, indexes = []) {
  console.log(`${colors.yellow}[Creating]${colors.reset} Collection: ${name}`);

  const collections = await db.listCollections().toArray();
  const exists = collections.some(c => c.name === name);

  if (!exists) {
    await db.createCollection(name);
    console.log(`  ${colors.green}✓${colors.reset} Collection created`);
  } else {
    console.log(`  ${colors.green}✓${colors.reset} Collection already exists`);
  }

  if (indexes.length > 0) {
    console.log(`  Creating ${indexes.length} indexes...`);
    for (const index of indexes) {
      await db.collection(name).createIndex(index.keys, { ...index.options, background: true });
    }
    console.log(`  ${colors.green}✓${colors.reset} ${indexes.length} indexes created`);
  }

  console.log('');
}

async function setupMongoDB() {
  console.log(`${colors.cyan}Connection URI:${colors.reset} ${MONGODB_URI.replace(/:[^:@]+@/, ':***@')}\n`);

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log(`${colors.green}✓${colors.reset} Connected to MongoDB\n`);

    // ============================================================================
    // Database: rt-technologie (TMS Sync)
    // ============================================================================

    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}Database: rt-technologie${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const dbTechno = client.db('rt-technologie');

    await createCollection(dbTechno, 'monitoring_logs', [
      { keys: { timestamp: -1 }, options: {} },
      { keys: { 'anomalies.severity': 1 }, options: {} },
      { keys: { 'anomalies.type': 1 }, options: {} }
    ]);

    // ============================================================================
    // Database: rt-authz (Authorization & Carriers)
    // ============================================================================

    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}Database: rt-authz${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const dbAuthz = client.db('rt-authz');

    await createCollection(dbAuthz, 'notification_logs', [
      { keys: { timestamp: -1 }, options: {} },
      { keys: { type: 1 }, options: {} },
      { keys: { carrierId: 1, timestamp: -1 }, options: {} },
      { keys: { sentAt: -1 }, options: {} }
    ]);

    await createCollection(dbAuthz, 'carrier_webhooks', [
      { keys: { carrierId: 1 }, options: {} },
      { keys: { active: 1 }, options: {} },
      { keys: { 'events': 1 }, options: {} },
      { keys: { failureCount: 1 }, options: {} }
    ]);

    await createCollection(dbAuthz, 'webhook_deliveries', [
      { keys: { webhookId: 1, timestamp: -1 }, options: {} },
      { keys: { eventType: 1 }, options: {} },
      { keys: { status: 1 }, options: {} },
      { keys: { timestamp: -1 }, options: {} }
    ]);

    await createCollection(dbAuthz, 'email_logs', [
      { keys: { emailId: 1 }, options: { unique: true } },
      { keys: { type: 1 }, options: {} },
      { keys: { carrierId: 1, sentAt: -1 }, options: {} },
      { keys: { status: 1 }, options: {} },
      { keys: { sentAt: -1 }, options: {} }
    ]);

    // ============================================================================
    // Database: affretia (Affret.IA Analytics)
    // ============================================================================

    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}Database: affretia${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    const dbAffretia = client.db('affretia');

    await createCollection(dbAffretia, 'affretia_trial_tracking', [
      { keys: { carrierId: 1 }, options: { unique: true } },
      { keys: { status: 1 }, options: {} },
      { keys: { eligibleAt: -1 }, options: {} },
      { keys: { trialActivatedAt: -1 }, options: {} },
      { keys: { upgradedAt: -1 }, options: {} },
      { keys: { blockerReason: 1 }, options: {} }
    ]);

    // ============================================================================
    // Résumé
    // ============================================================================

    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}Résumé${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

    console.log(`${colors.green}✓${colors.reset} Databases initialisées: 3`);
    console.log(`${colors.green}✓${colors.reset} Collections créées: 6`);
    console.log(`  - rt-technologie: monitoring_logs`);
    console.log(`  - rt-authz: notification_logs, carrier_webhooks, webhook_deliveries, email_logs`);
    console.log(`  - affretia: affretia_trial_tracking`);
    console.log(`${colors.green}✓${colors.reset} Indexes créés: 28`);

    console.log(`\n${colors.green}${colors.bright}✓ MongoDB initialisé avec succès !${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}✗ Erreur:${colors.reset}`, error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

setupMongoDB();
