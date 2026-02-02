#!/usr/bin/env node
/**
 * Script de vérification du système d'alertes
 * Vérifie que tous les composants fonctionnent correctement
 */

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const CARRIER_ID = '697f5a2b1980ef959ce78b67';

// Colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  const line = '='.repeat(80);
  log('\n' + line, 'cyan');
  log(message, 'bright');
  log(line, 'cyan');
  console.log('');
}

async function checkAPIHealth() {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkCarrierExists(carrierId) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/carriers/${carrierId}`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function checkVigilanceEndpoint() {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/vigilance/run-check`);
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  header('VERIFICATION DU SYSTEME D\'ALERTES');

  const checks = {
    api: { name: 'API Health', status: 'pending' },
    carrier: { name: 'Carrier Exists', status: 'pending' },
    vigilance: { name: 'Vigilance Endpoint', status: 'pending' }
  };

  // Check 1: API Health
  log('→ Checking API health...', 'cyan');
  const healthCheck = await checkAPIHealth();

  if (healthCheck.success) {
    checks.api.status = 'success';
    log(`  ✓ API is healthy`, 'green');
    log(`    Service: ${healthCheck.data.service}`, 'cyan');
    log(`    Version: ${healthCheck.data.version}`, 'cyan');
    log(`    MongoDB: ${healthCheck.data.mongodb?.status || 'unknown'}`, 'cyan');
  } else {
    checks.api.status = 'failed';
    log(`  ✗ API health check failed: ${healthCheck.error}`, 'red');
  }

  // Check 2: Carrier exists
  log('\n→ Checking if test carrier exists...', 'cyan');
  const carrierCheck = await checkCarrierExists(CARRIER_ID);

  if (carrierCheck.success) {
    checks.carrier.status = 'success';
    log(`  ✓ Carrier found`, 'green');
    log(`    Company: ${carrierCheck.data.companyName}`, 'cyan');
    log(`    Status: ${carrierCheck.data.status}`, 'cyan');
    log(`    Vigilance: ${carrierCheck.data.vigilance?.status || 'unknown'}`, 'cyan');
    log(`    Documents: ${carrierCheck.data.documents?.length || 0}`, 'cyan');

    if (carrierCheck.data.vigilance?.alerts?.length > 0) {
      log(`    Active Alerts: ${carrierCheck.data.vigilance.alerts.length}`, 'yellow');
    }
  } else {
    checks.carrier.status = 'warning';
    log(`  ⚠ Carrier not found (will be created during tests)`, 'yellow');
  }

  // Check 3: Vigilance endpoint
  log('\n→ Checking vigilance endpoint...', 'cyan');
  const vigilanceCheck = await checkVigilanceEndpoint();

  if (vigilanceCheck.success) {
    checks.vigilance.status = 'success';
    log(`  ✓ Vigilance check executed`, 'green');
    log(`    Alerts generated: ${vigilanceCheck.data.alertsCount || 0}`, 'cyan');

    if (vigilanceCheck.data.alerts?.length > 0) {
      log(`\n  Alert Details:`, 'yellow');
      vigilanceCheck.data.alerts.forEach((alert, i) => {
        log(`    ${i + 1}. ${alert.documentType} - ${alert.daysUntilExpiry} days`, 'yellow');
      });
    }
  } else {
    checks.vigilance.status = 'failed';
    log(`  ✗ Vigilance check failed: ${vigilanceCheck.error}`, 'red');
  }

  // Summary
  header('RESUME DES VERIFICATIONS');

  const successCount = Object.values(checks).filter(c => c.status === 'success').length;
  const warningCount = Object.values(checks).filter(c => c.status === 'warning').length;
  const failedCount = Object.values(checks).filter(c => c.status === 'failed').length;

  Object.entries(checks).forEach(([key, check]) => {
    const icon = check.status === 'success' ? '✓' :
                 check.status === 'warning' ? '⚠' : '✗';
    const color = check.status === 'success' ? 'green' :
                  check.status === 'warning' ? 'yellow' : 'red';
    log(`  ${icon} ${check.name}`, color);
  });

  log(`\n📊 Summary:`, 'bright');
  log(`  Success: ${successCount}`, 'green');
  if (warningCount > 0) log(`  Warnings: ${warningCount}`, 'yellow');
  if (failedCount > 0) log(`  Failed: ${failedCount}`, 'red');

  if (failedCount === 0) {
    log(`\n✅ System is ready for testing!`, 'green');
    log(`\nNext steps:`, 'bright');
    log(`  1. Run: node generate-test-documents.cjs`, 'cyan');
    log(`  2. Run: node test-document-workflow.cjs`, 'cyan');
  } else {
    log(`\n❌ System has issues that need to be resolved`, 'red');
    log(`\nTroubleshooting:`, 'bright');
    log(`  - Make sure the API is running: cd services/authz-eb && npm start`, 'cyan');
    log(`  - Check MongoDB connection in .env`, 'cyan');
    log(`  - Verify API_URL environment variable`, 'cyan');
  }

  console.log('');
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
