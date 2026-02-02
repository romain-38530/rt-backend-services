#!/usr/bin/env node
/**
 * Script maître pour exécuter tous les tests du workflow documentaire
 * Exécute séquentiellement:
 * 1. Vérification du système
 * 2. Génération des documents PDF
 * 3. Tests complets du workflow
 * 4. Génération du rapport final
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message, color = 'cyan') {
  const line = '='.repeat(80);
  console.log('');
  log(line, color);
  log(message, 'bright');
  log(line, color);
  console.log('');
}

function runScript(scriptName, description) {
  return new Promise((resolve, reject) => {
    log(`\n→ Running: ${scriptName}`, 'cyan');
    log(`  ${description}`, 'blue');
    console.log('');

    const child = spawn('node', [scriptName], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✓ ${scriptName} completed successfully`, 'green');
        resolve({ success: true, scriptName });
      } else {
        log(`✗ ${scriptName} failed with code ${code}`, 'red');
        resolve({ success: false, scriptName, exitCode: code });
      }
    });

    child.on('error', (error) => {
      log(`✗ Failed to run ${scriptName}: ${error.message}`, 'red');
      resolve({ success: false, scriptName, error: error.message });
    });
  });
}

async function generateFinalReport(results) {
  const reportPath = path.join(__dirname, 'test-documents', 'test-report.json');
  const testDocsPath = path.join(__dirname, 'test-documents');

  const report = {
    executionTime: new Date().toISOString(),
    scriptsExecuted: results.map(r => ({
      script: r.scriptName,
      success: r.success,
      exitCode: r.exitCode,
      error: r.error
    })),
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    testDocuments: {
      path: testDocsPath,
      exists: fs.existsSync(testDocsPath)
    }
  };

  // Charger le rapport de test détaillé si disponible
  if (fs.existsSync(reportPath)) {
    try {
      const detailedReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      report.detailedResults = detailedReport;
    } catch (err) {
      log(`⚠ Could not load detailed report: ${err.message}`, 'yellow');
    }
  }

  // Sauvegarder le rapport final
  const finalReportPath = path.join(__dirname, 'test-documents', 'final-report.json');
  fs.writeFileSync(finalReportPath, JSON.stringify(report, null, 2));

  return { report, path: finalReportPath };
}

async function main() {
  header('EXECUTION COMPLETE DES TESTS DU WORKFLOW DOCUMENTAIRE', 'magenta');

  log('Ce script va exécuter séquentiellement:', 'bright');
  log('  1. Vérification du système d\'alertes', 'cyan');
  log('  2. Génération des documents PDF de test', 'cyan');
  log('  3. Test complet du workflow (upload, OCR, alertes)', 'cyan');
  log('  4. Génération du rapport final', 'cyan');

  const startTime = Date.now();
  const results = [];

  // Étape 1: Vérification du système
  header('ETAPE 1/3: VERIFICATION DU SYSTEME', 'blue');
  const verifyResult = await runScript(
    'verify-alerting-system.cjs',
    'Vérifie que l\'API est accessible et que le système d\'alertes fonctionne'
  );
  results.push(verifyResult);

  if (!verifyResult.success) {
    log('\n⚠ La vérification du système a échoué', 'yellow');
    log('  Voulez-vous continuer quand même? Les tests suivants pourraient échouer.', 'yellow');
    log('  Appuyez sur Ctrl+C pour annuler, ou attendez 5 secondes pour continuer...', 'yellow');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  // Étape 2: Génération des documents
  header('ETAPE 2/3: GENERATION DES DOCUMENTS PDF', 'blue');
  const generateResult = await runScript(
    'generate-test-documents.cjs',
    'Génère 6 documents PDF avec des dates d\'expiration variées'
  );
  results.push(generateResult);

  if (!generateResult.success) {
    log('\n❌ La génération des documents a échoué', 'red');
    log('  Les tests suivants ne peuvent pas continuer sans documents.', 'red');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    header('TESTS INTERROMPUS', 'red');
    log(`Durée: ${duration}s`, 'cyan');
    log(`Étapes complétées: ${results.filter(r => r.success).length}/${results.length}`, 'cyan');

    process.exit(1);
  }

  // Étape 3: Tests du workflow
  header('ETAPE 3/3: TEST DU WORKFLOW COMPLET', 'blue');
  const testResult = await runScript(
    'test-document-workflow.cjs',
    'Upload des documents, analyse OCR, vérification des alertes et du blocage'
  );
  results.push(testResult);

  // Génération du rapport final
  header('GENERATION DU RAPPORT FINAL', 'blue');
  log('→ Compiling final report...', 'cyan');

  const { report, path: reportPath } = await generateFinalReport(results);
  log(`✓ Final report saved to: ${reportPath}`, 'green');

  // Résumé final
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  header('RESUME FINAL', 'magenta');

  log('\n📊 Exécution:', 'bright');
  log(`  Durée totale: ${duration}s`, 'cyan');
  log(`  Scripts exécutés: ${results.length}`, 'cyan');
  log(`  Réussis: ${results.filter(r => r.success).length}`, 'green');
  log(`  Échoués: ${results.filter(r => !r.success).length}`, results.some(r => !r.success) ? 'red' : 'green');

  log('\n📝 Scripts:', 'bright');
  results.forEach((result, i) => {
    const icon = result.success ? '✓' : '✗';
    const color = result.success ? 'green' : 'red';
    log(`  ${i + 1}. ${icon} ${result.scriptName}`, color);
    if (result.error) {
      log(`     Error: ${result.error}`, 'red');
    }
  });

  // Résumé du rapport détaillé si disponible
  if (report.detailedResults) {
    const dr = report.detailedResults;
    log('\n📦 Documents:', 'bright');
    log(`  Uploadés: ${dr.uploads?.length || 0}`, 'cyan');
    log(`  Analyses OCR réussies: ${dr.ocrResults?.filter(r => r.success).length || 0}/${dr.ocrResults?.length || 0}`, 'cyan');
    log(`  Alertes générées: ${dr.alerts?.length || 0}`, dr.alerts?.length > 0 ? 'yellow' : 'cyan');
    log(`  Erreurs: ${dr.errors?.length || 0}`, dr.errors?.length > 0 ? 'red' : 'green');

    if (dr.carrier) {
      log('\n🚛 Statut Transporteur:', 'bright');
      log(`  Société: ${dr.carrier.companyName}`, 'cyan');
      log(`  Status: ${dr.carrier.status}`, dr.carrier.status === 'active' ? 'green' : 'red');
      log(`  Vigilance: ${dr.carrier.vigilance?.status || 'unknown'}`,
        dr.carrier.vigilance?.status === 'compliant' ? 'green' :
        dr.carrier.vigilance?.status === 'warning' ? 'yellow' : 'red');
      log(`  Score: ${dr.carrier.score?.currentScore || 'N/A'}/100`, 'cyan');

      if (dr.carrier.vigilance?.alerts?.length > 0) {
        log(`  Alertes actives: ${dr.carrier.vigilance.alerts.length}`, 'yellow');
      }
    }
  }

  log('\n📁 Fichiers générés:', 'bright');
  log(`  Documents PDF: scripts/test-documents/*.pdf`, 'cyan');
  log(`  Métadonnées: scripts/test-documents/metadata.json`, 'cyan');
  log(`  Rapport détaillé: scripts/test-documents/test-report.json`, 'cyan');
  log(`  Rapport final: ${reportPath}`, 'cyan');

  log('\n📖 Documentation:', 'bright');
  log(`  Guide d'utilisation: scripts/README-TEST-DOCUMENTS.md`, 'cyan');
  log(`  Analyse technique: scripts/ANALYSE-SYSTEME-ALERTES.md`, 'cyan');

  const allPassed = results.every(r => r.success);

  if (allPassed) {
    header('✅ TOUS LES TESTS SONT PASSES AVEC SUCCES', 'green');
    log('Le système de workflow documentaire fonctionne correctement.', 'green');
    log('Vous pouvez consulter les rapports pour plus de détails.', 'cyan');
  } else {
    header('⚠ CERTAINS TESTS ONT ECHOUE', 'yellow');
    log('Veuillez consulter les logs ci-dessus pour plus de détails.', 'yellow');
    log('Les rapports générés contiennent des informations de diagnostic.', 'cyan');
  }

  console.log('');

  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
